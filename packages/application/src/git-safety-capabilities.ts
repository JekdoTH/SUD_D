import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type ResolvedToolSecurityContext,
  type Result,
  type ToolExecutionContext,
  type Workspace,
} from '@sud-d/domain';
import {
  GIT_SAFETY_LIMITS,
  validateRelativePath,
  type GitSafetyAdapter,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';
import { createGitWorkflowCapabilities, type GitCapabilityDependencies } from './git-workflow-capabilities.js';

export const GIT_SAFETY_CAPABILITY_NAMES = Object.freeze([
  'git.detect',
  'git.status',
  'git.diff',
  'git.checkpoint',
  'git.commit',
] as const);

export type GitSafetyCapabilityName = (typeof GIT_SAFETY_CAPABILITY_NAMES)[number];

export interface GitSafetyCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly gitSafety: GitSafetyAdapter;
}

interface StatusInput {
  readonly limit?: number;
}

interface DiffInput {
  readonly relativePath?: string;
  readonly maxBytes?: number;
}

interface CheckpointInput {
  readonly expectedStatusId: string;
}

interface CommitInput {
  readonly expectedStatusId: string;
  readonly message: string;
}

export function createGitSafetyCapabilities(
  dependencies: GitSafetyCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<Record<string, never>, unknown>({
      name: 'git.detect',
      effect: 'read',
      validate: validateEmptyInput,
      resolveSecurity: () => resolveWorkspaceSecurity(dependencies, 'normal'),
      execute(_input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.gitSafety.detect(workspace.value.canonicalRoot);
      },
    }),
    defineToolCapability<StatusInput, unknown>({
      name: 'git.status',
      effect: 'read',
      validate: validateStatusInput,
      resolveSecurity: () => resolveWorkspaceSecurity(dependencies, 'normal'),
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.gitSafety.status(workspace.value.canonicalRoot, input.limit);
      },
    }),
    defineToolCapability<DiffInput, unknown>({
      name: 'git.diff',
      effect: 'read',
      validate: validateDiffInput,
      resolveSecurity(input) {
        const sensitivity = input.relativePath
          ? classifySensitivity(input.relativePath)
          : 'normal';
        return resolveWorkspaceSecurity(dependencies, sensitivity);
      },
      approval: {
        describe: (input) => ok({
          title: 'Reveal sensitive Git diff',
          resourceLabel: input.relativePath ?? 'Active Workspace',
        }),
        bind: (input, security) => bindGitApprovalState(dependencies, security.workspaceId, {
          relativePath: input.relativePath ?? null,
          maxBytes: input.maxBytes ?? null,
        }),
      },
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        if (context.approvalDecision === 'approved' && input.relativePath) {
          return dependencies.gitSafety.diffApprovedSensitive(workspace.value.canonicalRoot, {
            relativePath: input.relativePath,
            ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
          });
        }
        return dependencies.gitSafety.diff(workspace.value.canonicalRoot, input);
      },
    }),
    defineToolCapability<CheckpointInput, unknown>({
      name: 'git.checkpoint',
      effect: 'create',
      validate: validateCheckpointInput,
      resolveSecurity() {
        const workspace = getActiveWorkspace(dependencies.workspaceRepo);
        if (!workspace.ok) return workspace;
        const status = dependencies.gitSafety.status(workspace.value.canonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
        if (!status.ok) return status;
        const sensitivity = status.value.entries.some((entry) => entry.sensitive) ? 'credential' : 'normal';
        return ok({ sensitivity, context: 'workspace', workspaceId: workspace.value.id });
      },
      approval: {
        describe: () => ok({
          title: 'Persist sensitive content in local Git checkpoint',
          resourceLabel: 'Active Workspace',
        }),
        bind: (input, security) => bindGitApprovalState(dependencies, security.workspaceId, {
          expectedStatusId: input.expectedStatusId,
        }),
      },
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return context.approvalDecision === 'approved'
          ? dependencies.gitSafety.checkpointApprovedSensitive(workspace.value.canonicalRoot, input.expectedStatusId)
          : dependencies.gitSafety.checkpoint(workspace.value.canonicalRoot, input.expectedStatusId);
      },
    }),
    defineToolCapability<CommitInput, unknown>({
      name: 'git.commit',
      effect: 'modify',
      validate: validateCommitInput,
      resolveSecurity() {
        const workspace = getActiveWorkspace(dependencies.workspaceRepo);
        if (!workspace.ok) return workspace;
        const status = dependencies.gitSafety.status(workspace.value.canonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
        if (!status.ok) return status;
        const sensitivity = status.value.entries.some((entry) => entry.sensitive) ? 'credential' : 'normal';
        return ok({ sensitivity, context: 'workspace', workspaceId: workspace.value.id });
      },
      approval: {
        describe: () => ok({
          title: 'Commit sensitive Workspace changes',
          resourceLabel: 'Active Workspace',
        }),
        bind: (input, security) => bindGitApprovalState(dependencies, security.workspaceId, {
          expectedStatusId: input.expectedStatusId,
          message: input.message,
        }),
      },
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return context.approvalDecision === 'approved'
          ? dependencies.gitSafety.commitApprovedSensitive(workspace.value.canonicalRoot, input.expectedStatusId, input.message)
          : dependencies.gitSafety.commit(workspace.value.canonicalRoot, input.expectedStatusId, input.message);
      },
    }),
  ]);
}

function bindGitApprovalState(
  dependencies: GitSafetyCapabilityDependencies,
  workspaceId: string | undefined,
  inputBinding: Readonly<Record<string, string | number | null>>,
): Result<Readonly<Record<string, string | number | null>>, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  if (!workspaceId || workspace.value.id !== workspaceId) {
    return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is no longer active'));
  }
  const status = dependencies.gitSafety.status(
    workspace.value.canonicalRoot,
    GIT_SAFETY_LIMITS.maxStatusEntries,
  );
  if (!status.ok) return status;
  return ok({ ...inputBinding, trustedStatusId: status.value.statusId });
}

function validateEmptyInput(input: unknown): Result<Record<string, never>, AppError> {
  if (!isStrictObject(input, [])) return invalidInput('Git detect input must be an empty object');
  return ok({});
}

function validateStatusInput(input: unknown): Result<StatusInput, AppError> {
  if (!isStrictObject(input, ['limit'])) return invalidInput('Git status input is invalid');
  const limit = input.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || typeof limit !== 'number' || limit < 1 || limit > GIT_SAFETY_LIMITS.maxStatusEntries)) {
    return invalidInput('Git status limit is invalid');
  }
  return ok(limit === undefined ? {} : { limit });
}

function validateDiffInput(input: unknown): Result<DiffInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'maxBytes'])) return invalidInput('Git diff input is invalid');
  const relativePath = input.relativePath;
  if (relativePath !== undefined) {
    if (typeof relativePath !== 'string') return invalidInput('Git diff path is invalid');
    const validated = validateGitRelativePath(relativePath);
    if (!validated.ok) return validated;
  }
  const maxBytes = input.maxBytes;
  if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || typeof maxBytes !== 'number' || maxBytes < 1 || maxBytes > GIT_SAFETY_LIMITS.maxDiffBytes)) {
    return invalidInput('Git diff maxBytes is invalid');
  }
  return ok({
    ...(relativePath === undefined ? {} : { relativePath }),
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });
}

function validateCheckpointInput(input: unknown): Result<CheckpointInput, AppError> {
  if (!isStrictObject(input, ['expectedStatusId'])) return invalidInput('Git checkpoint input is invalid');
  if (typeof input.expectedStatusId !== 'string' || !/^[0-9a-f]{64}$/.test(input.expectedStatusId)) {
    return invalidInput('Git checkpoint status token is invalid');
  }
  return ok({ expectedStatusId: input.expectedStatusId });
}

function validateCommitInput(input: unknown): Result<CommitInput, AppError> {
  if (!isStrictObject(input, ['expectedStatusId', 'message'])) return invalidInput('Git commit input is invalid');
  if (typeof input.expectedStatusId !== 'string' || !/^[0-9a-f]{64}$/.test(input.expectedStatusId)) {
    return invalidInput('Git commit status token is invalid');
  }
  if (typeof input.message !== 'string' || input.message.length < 1 || input.message.length > 160 || /[\r\n\0]/.test(input.message)) {
    return invalidInput('Git commit message is invalid');
  }
  return ok({ expectedStatusId: input.expectedStatusId, message: input.message });
}

function validateGitRelativePath(relativePath: string): Result<string, AppError> {
  const validated = validateRelativePath(relativePath);
  if (!validated.ok) return validated;
  const parts = validated.value.split('/').filter(Boolean);
  if (parts.some((part) => part.toLowerCase() === '.git')) {
    return err(appError('INTERNAL_PATH_DENIED', 'Git metadata is not caller-addressable'));
  }
  return validated;
}

function resolveWorkspaceSecurity(
  dependencies: GitSafetyCapabilityDependencies,
  sensitivity: ResolvedToolSecurityContext['sensitivity'],
): Result<ResolvedToolSecurityContext, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  return ok({ sensitivity, context: 'workspace', workspaceId: workspace.value.id });
}

export function createAllGitCapabilities(
  dependencies: GitCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    ...createGitSafetyCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      gitSafety: dependencies.gitSafety,
    }),
    ...createGitWorkflowCapabilities(dependencies),
  ]);
}

function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Result<Workspace, AppError> {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    if (active.length !== 1) {
      return err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
    }
    return ok(active[0]!);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to resolve active Workspace'));
  }
}

function getExecutionWorkspace(
  workspaceRepo: WorkspaceRepository,
  context: ToolExecutionContext,
): Result<Workspace, AppError> {
  const workspaceId = context.security.workspaceId;
  if (!workspaceId) return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is unavailable'));
  try {
    const workspace = workspaceRepo.findById(workspaceId);
    if (!workspace || !workspace.isActive) {
      return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is no longer active'));
    }
    return ok(workspace);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to revalidate active Workspace'));
  }
}

function isStrictObject(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function invalidInput(message: string): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', message));
}
