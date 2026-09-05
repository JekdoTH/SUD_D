import {
  WORK_MEMORY_LIMITS,
  appError,
  err,
  ok,
  type AppError,
  type ClientSession,
  type Result,
  type WorkCheckpointInput,
  type WorkCheckpointResult,
  type WorkResumeGitValidation,
  type WorkResumeResult,
  type Workspace,
} from '@sud-d/domain';
import type {
  GitSafetyAdapter,
  WorkMemoryRepository,
} from '@sud-d/infrastructure';

export interface WorkMemoryService {
  resume(session: ClientSession, workspace: Workspace): Result<WorkResumeResult, AppError>;
  checkpoint(
    session: ClientSession,
    workspace: Workspace,
    input: WorkCheckpointInput,
  ): Result<WorkCheckpointResult, AppError>;
  requireResumed(session: ClientSession, workspaceId: string): Result<void, AppError>;
}

export interface WorkMemoryServiceDependencies {
  readonly repository: WorkMemoryRepository;
  readonly gitSafety: GitSafetyAdapter;
  readonly clock?: () => Date;
}

interface TrustedGitState {
  readonly supported: boolean;
  readonly headSha?: string;
  readonly statusId?: string;
  readonly changedPaths: readonly string[];
}

export function createWorkMemoryService(
  dependencies: WorkMemoryServiceDependencies,
): WorkMemoryService {
  const bootstrappedWorkspaceBySession = new Map<string, string>();
  const clock = dependencies.clock ?? (() => new Date());

  const service: WorkMemoryService = {
    requireResumed(session, workspaceId) {
      return bootstrappedWorkspaceBySession.get(session.id) === workspaceId
        ? ok(undefined)
        : err(appError('WORK_RESUME_REQUIRED', 'Work resume is required for the active Workspace'));
    },

    resume(session, workspace) {
      const current = dependencies.repository.loadCurrent(workspace.id);
      if (!current.ok) return current;
      if (current.value && current.value.workspaceId !== workspace.id) {
        return err(appError('WORK_MEMORY_WORKSPACE_MISMATCH', 'Work Memory state does not match the active Workspace'));
      }
      const trustedGit = readTrustedGitState(dependencies.gitSafety, workspace.canonicalRoot);
      if (!trustedGit.ok) return trustedGit;
      const git = buildGitValidation(current.value?.git, trustedGit.value);
      bootstrappedWorkspaceBySession.set(session.id, workspace.id);
      return ok({
        workspaceId: workspace.id,
        ...(current.value ? { context: current.value } : {}),
        git,
      });
    },

    checkpoint(session, workspace, input) {
      const resumed = service.requireResumed(session, workspace.id);
      if (!resumed.ok) return resumed;
      const trustedGit = readTrustedGitState(dependencies.gitSafety, workspace.canonicalRoot);
      if (!trustedGit.ok) return trustedGit;
      const artifacts = mergeArtifactsWithinCheckpointBounds(input, trustedGit.value.changedPaths);
      const saved = dependencies.repository.saveCheckpoint({
        workspaceId: workspace.id,
        goal: input.goal,
        task: input.task,
        completed: input.completed,
        decisions: input.decisions,
        blockers: input.blockers,
        nextAction: input.nextAction,
        artifacts,
        verification: input.verification,
        ...(trustedGit.value.supported && trustedGit.value.headSha && trustedGit.value.statusId
          ? { git: { headSha: trustedGit.value.headSha, statusId: trustedGit.value.statusId } }
          : {}),
        updatedAt: clock().toISOString(),
      });
      return saved.ok ? ok({ context: saved.value }) : saved;
    },
  };

  return Object.freeze(service);
}

function readTrustedGitState(
  gitSafety: GitSafetyAdapter,
  workspaceCanonicalRoot: string,
): Result<TrustedGitState, AppError> {
  const detected = gitSafety.detect(workspaceCanonicalRoot);
  if (!detected.ok) return gitValidationError();
  if (!detected.value.isRepository || !detected.value.isSupported || !detected.value.headSha) {
    return ok({ supported: false, changedPaths: [] });
  }
  const status = gitSafety.status(workspaceCanonicalRoot, WORK_MEMORY_LIMITS.maxArtifactItems);
  if (!status.ok) return gitValidationError();
  return ok({
    supported: true,
    headSha: status.value.headSha,
    statusId: status.value.statusId,
    changedPaths: status.value.entries
      .filter((entry) => !entry.sensitive)
      .slice(0, WORK_MEMORY_LIMITS.maxArtifactItems)
      .map((entry) => entry.path),
  });
}

function buildGitValidation(
  stored: { readonly headSha: string; readonly statusId: string } | undefined,
  current: TrustedGitState,
): WorkResumeGitValidation {
  if (!current.supported || !current.headSha || !current.statusId) {
    return {
      supported: false,
      drifted: stored !== undefined,
      headChanged: false,
      statusChanged: false,
      ...(stored ? { storedHeadSha: stored.headSha, storedStatusId: stored.statusId } : {}),
    };
  }
  const headChanged = stored !== undefined && stored.headSha !== current.headSha;
  const statusChanged = stored !== undefined && stored.statusId !== current.statusId;
  return {
    supported: true,
    drifted: headChanged || statusChanged,
    headChanged,
    statusChanged,
    currentHeadSha: current.headSha,
    currentStatusId: current.statusId,
    ...(stored ? { storedHeadSha: stored.headSha, storedStatusId: stored.statusId } : {}),
  };
}

function mergeArtifactsWithinCheckpointBounds(
  input: WorkCheckpointInput,
  changed: readonly string[],
): readonly string[] {
  const merged = [...input.artifacts];
  for (const value of changed) {
    if (merged.length >= WORK_MEMORY_LIMITS.maxArtifactItems) break;
    if (merged.includes(value)) continue;
    if (value.length === 0 || value.length > WORK_MEMORY_LIMITS.maxArtifactPathChars || value.includes('\0')) continue;
    const candidate = [...merged, value];
    if (serializedCheckpointBytes(input, candidate) > WORK_MEMORY_LIMITS.maxSerializedBytes) continue;
    merged.push(value);
  }
  return merged;
}

function serializedCheckpointBytes(input: WorkCheckpointInput, artifacts: readonly string[]): number {
  return Buffer.byteLength(JSON.stringify({ ...input, artifacts }), 'utf8');
}

function gitValidationError(): Result<never, AppError> {
  return err(appError('WORK_MEMORY_GIT_VALIDATION_FAILED', 'Work Memory Git validation is unavailable'));
}
