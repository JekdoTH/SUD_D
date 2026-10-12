import {
  appError, err, ok, type AppError, type InternalRoot,
  type ResolvedToolSecurityContext, type Result,
} from '@sud-d/domain';
import { discoverProjectRunners, type WorkspaceRepository } from '@sud-d/infrastructure';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';

export interface ProjectRunnerDiscoveryDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
}

/** Read-only discovery: never imports or executes a Workspace runner. */
export function createProjectRunnerDiscoveryCapabilities(
  dependencies: ProjectRunnerDiscoveryDependencies,
): readonly RegisteredToolCapability[] {
  const activeWorkspace = () => {
    try {
      const active = dependencies.workspaceRepo.list().filter(workspace => workspace.isActive);
      return active.length === 1 ? active[0] : undefined;
    } catch { return undefined; }
  };
  return Object.freeze([
    defineToolCapability<Record<string, never>, unknown>({
      name: 'runner.discover',
      effect: 'read',
      validate(input): Result<Record<string, never>, AppError> {
        if (typeof input !== 'object' || input === null || Array.isArray(input) || Reflect.ownKeys(input).length !== 0) {
          return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
        }
        return ok({});
      },
      resolveSecurity(): Result<ResolvedToolSecurityContext, AppError> {
        const workspace = activeWorkspace();
        return workspace
          ? ok({ sensitivity: 'normal', context: 'workspace', workspaceId: workspace.id })
          : err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
      },
      execute(_input, context) {
        const workspace = activeWorkspace();
        if (!workspace || workspace.id !== context.security.workspaceId) {
          return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is no longer active'));
        }
        const result = discoverProjectRunners({
          workspaceCanonicalRoot: workspace.canonicalRoot,
          internalRoots: [...dependencies.internalRoots],
        });
        if (!result.ok) return result;
        return ok({
          candidates: result.value.map(({ id, runtime, definitionDigest, supported }) => ({ id, runtime, definitionDigest, supported })),
          executionAvailable: false,
          executionBlockedReason: 'Project Runner execution is not available through production MCP',
        });
      },
    }),
  ]);
}
