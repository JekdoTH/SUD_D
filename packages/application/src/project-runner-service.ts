import {
  appError,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type ProjectRunnerCandidate,
  type ProjectRunnerStartRequest,
  type ProjectRunnerStartResult,
  type ResolvedToolSecurityContext,
  type Result,
} from '@sud-d/domain';
import {
  discoverProjectRunners,
  isProjectRunnerSnapshotFresh,
  prepareProjectRunnerSnapshot,
  verifyProjectRunnerSnapshot,
} from '@sud-d/infrastructure/gateway-core';
import type {
  ProjectRunnerApprovedSnapshot,
  WorkspaceRepository,
} from '@sud-d/infrastructure';

export interface ProjectRunnerRuntimePort {
  start(snapshot: ProjectRunnerApprovedSnapshot): Promise<Result<ProjectRunnerStartResult, AppError>>;
}

export interface ProjectRunnerServiceDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly stagingRoot: string;
  readonly runtimeExecutable: string;
  readonly runtime: ProjectRunnerRuntimePort;
}

export interface ProjectRunnerDiscoveryPort {
  resolveSecurity(): Result<ResolvedToolSecurityContext, AppError>;
  discover(): Result<readonly ProjectRunnerCandidate[], AppError>;
}

export interface ProjectRunnerDiscoveryDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
}

export interface ProjectRunnerService extends ProjectRunnerDiscoveryPort {
  reviewStart(request: ProjectRunnerStartRequest): Result<ProjectRunnerApprovedSnapshot, AppError>;
  startApproved(request: ProjectRunnerStartRequest): Promise<Result<ProjectRunnerStartResult, AppError>>;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stable(object[key])).join(',') + '}';
}

function sameInput(left: unknown, right: unknown): boolean {
  try {
    return stable(left) === stable(right);
  } catch {
    return false;
  }
}

function findActiveRunnerWorkspace(workspaceRepo: WorkspaceRepository) {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    return active.length === 1 ? active[0] : undefined;
  } catch {
    return undefined;
  }
}

export function createProjectRunnerDiscoveryService(
  dependencies: ProjectRunnerDiscoveryDependencies,
): ProjectRunnerDiscoveryPort {
  const activeWorkspace = () => findActiveRunnerWorkspace(dependencies.workspaceRepo);
  return Object.freeze({
    resolveSecurity(): Result<ResolvedToolSecurityContext, AppError> {
      const workspace = activeWorkspace();
      return workspace
        ? ok({ sensitivity: 'normal', context: 'workspace', workspaceId: workspace.id })
        : err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
    },
    discover(): Result<readonly ProjectRunnerCandidate[], AppError> {
      const workspace = activeWorkspace();
      if (!workspace) {
        return err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
      }
      return discoverProjectRunners({
        workspaceCanonicalRoot: workspace.canonicalRoot,
        internalRoots: [...dependencies.internalRoots],
      });
    },
  });
}

export function createProjectRunnerService(
  dependencies: ProjectRunnerServiceDependencies,
): ProjectRunnerService {
  const discovery = createProjectRunnerDiscoveryService(dependencies);
  const reservations = new Map<string, ProjectRunnerApprovedSnapshot>();
  const started = new Map<string, Promise<Result<ProjectRunnerStartResult, AppError>>>();

  const activeWorkspace = () => findActiveRunnerWorkspace(dependencies.workspaceRepo);

  const service: ProjectRunnerService = {
    resolveSecurity: () => discovery.resolveSecurity(),
    discover: () => discovery.discover(),

    reviewStart(request) {
      const workspace = activeWorkspace();
      if (!workspace) {
        return err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
      }
      const generation = workspace.updatedAt.toISOString();
      const existing = reservations.get(request.attemptId);
      if (existing) {
        if (
          existing.workspaceId !== workspace.id
          || existing.runnerId !== request.runnerId
          || !sameInput(existing.validatedInput, request.input)
        ) {
          return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
        }
        const fresh = isProjectRunnerSnapshotFresh(existing, generation);
        if (!fresh.ok) return fresh;
        const verified = verifyProjectRunnerSnapshot(existing);
        if (!verified.ok) return verified;
        return ok(existing);
      }

      const prepared = prepareProjectRunnerSnapshot({
        workspaceId: workspace.id,
        workspaceGeneration: generation,
        workspaceCanonicalRoot: workspace.canonicalRoot,
        internalRoots: [...dependencies.internalRoots],
        runnerId: request.runnerId,
        input: request.input,
        attemptId: request.attemptId,
        stagingRoot: dependencies.stagingRoot,
        runtimeExecutable: dependencies.runtimeExecutable,
      });
      if (!prepared.ok) return prepared;
      reservations.set(request.attemptId, prepared.value);
      return prepared;
    },

    startApproved(request) {
      const already = started.get(request.attemptId);
      if (already) return already;

      const reviewed = service.reviewStart(request);
      if (!reviewed.ok) return Promise.resolve(reviewed);

      const launch = (async (): Promise<Result<ProjectRunnerStartResult, AppError>> => {
        const stage = verifyProjectRunnerSnapshot(reviewed.value);
        if (!stage.ok) return stage;
        const workspace = activeWorkspace();
        if (!workspace || workspace.id !== reviewed.value.workspaceId) {
          return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
        }
        const fresh = isProjectRunnerSnapshotFresh(reviewed.value, workspace.updatedAt.toISOString());
        if (!fresh.ok) return fresh;
        try {
          return await dependencies.runtime.start(reviewed.value);
        } catch {
          return err(appError('RUNNER_RUNTIME_UNAVAILABLE', 'Restricted Project Runner runtime is unavailable'));
        }
      })();
      started.set(request.attemptId, launch);
      return launch;
    },
  };

  return Object.freeze(service);
}
