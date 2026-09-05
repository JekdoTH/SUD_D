import {
  WORK_MEMORY_LIMITS,
  WORK_TASK_STATUSES,
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type ResolvedToolSecurityContext,
  type Result,
  type ToolExecutionContext,
  type WorkCheckpointInput,
  type Workspace,
} from '@sud-d/domain';
import type {
  WorkspaceRepository,
  WorkspaceTextFileSystem,
} from '@sud-d/infrastructure';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';
import type { WorkMemoryService } from './work-memory-service.js';

export const WORK_MEMORY_CAPABILITY_NAMES = Object.freeze([
  'work.resume',
  'work.checkpoint',
] as const);

export interface WorkMemoryCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
  readonly workMemory: WorkMemoryService;
}

export function createWorkMemoryCapabilities(
  dependencies: WorkMemoryCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<Record<string, never>, unknown>({
      name: 'work.resume',
      effect: 'read',
      validate: validateEmptyInput,
      resolveSecurity: () => resolveWorkspaceRootSecurity(dependencies),
      execute(_input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        return workspace.ok
          ? dependencies.workMemory.resume(context.session, workspace.value)
          : workspace;
      },
    }),
    defineToolCapability<WorkCheckpointInput, unknown>({
      name: 'work.checkpoint',
      effect: 'modify',
      validate: validateCheckpointInput,
      resolveSecurity: (input) => resolveCheckpointSecurity(dependencies, input),
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        return workspace.ok
          ? dependencies.workMemory.checkpoint(context.session, workspace.value, input)
          : workspace;
      },
    }),
  ]);
}

function validateEmptyInput(input: unknown): Result<Record<string, never>, AppError> {
  return isStrictObject(input, [])
    ? ok({})
    : invalidInput();
}

function validateCheckpointInput(input: unknown): Result<WorkCheckpointInput, AppError> {
  if (!isStrictObject(input, [
    'goal', 'task', 'completed', 'decisions', 'blockers',
    'nextAction', 'artifacts', 'verification',
  ])) return invalidInput();
  if (!isBoundedText(input.goal, WORK_MEMORY_LIMITS.maxGoalChars)) return invalidInput();
  if (!isStrictObject(input.task, ['title', 'status'])) return invalidInput();
  if (!isBoundedText(input.task.title, WORK_MEMORY_LIMITS.maxTaskChars)) return invalidInput();
  if (typeof input.task.status !== 'string' || !WORK_TASK_STATUSES.includes(input.task.status as never)) return invalidInput();
  if (!isTextArray(input.completed, WORK_MEMORY_LIMITS.maxCompletedItems)) return invalidInput();
  if (!isTextArray(input.decisions, WORK_MEMORY_LIMITS.maxDecisionItems)) return invalidInput();
  if (!isTextArray(input.blockers, WORK_MEMORY_LIMITS.maxBlockerItems)) return invalidInput();
  if (!isBoundedText(input.nextAction, WORK_MEMORY_LIMITS.maxNextActionChars)) return invalidInput();
  if (!isArtifactArray(input.artifacts)) return invalidInput();
  if (!isTextArray(input.verification, WORK_MEMORY_LIMITS.maxVerificationItems)) return invalidInput();
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > WORK_MEMORY_LIMITS.maxSerializedBytes) return invalidInput();
  const checkpoint = input as unknown as WorkCheckpointInput;
  if (containsSecretLikeMaterial(checkpoint)) {
    return err(appError('WORK_MEMORY_SECRET_REJECTED', 'Work Memory checkpoint contains secret-like material'));
  }
  return ok(checkpoint);
}

function isTextArray(value: unknown, maxItems: number): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => isBoundedText(item, WORK_MEMORY_LIMITS.maxItemChars));
}

function isArtifactArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.length <= WORK_MEMORY_LIMITS.maxArtifactItems
    && value.every((item) => isBoundedText(item, WORK_MEMORY_LIMITS.maxArtifactPathChars));
}

function isBoundedText(value: unknown, maxChars: number): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maxChars
    && !value.includes('\0');
}

function containsSecretLikeMaterial(input: WorkCheckpointInput): boolean {
  const values = [
    input.goal,
    input.task.title,
    ...input.completed,
    ...input.decisions,
    ...input.blockers,
    input.nextAction,
    ...input.artifacts,
    ...input.verification,
  ];
  return values.some((value) => isSecretLikeText(value));
}

function isSecretLikeText(value: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value)
    || /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value)
    || /(?:password|passwd|secret|token|api[_ -]?key|authorization|bearer)\s*[:=]\s*\S+/i.test(value);
}

function resolveCheckpointSecurity(
  dependencies: WorkMemoryCapabilityDependencies,
  input: WorkCheckpointInput,
): Result<ResolvedToolSecurityContext, AppError> {
  const root = getActiveWorkspace(dependencies.workspaceRepo);
  if (!root.ok) return root;
  const rootResolved = dependencies.fileSystem.resolveExisting({
    workspaceCanonicalRoot: root.value.canonicalRoot,
    relativePath: '.',
    internalRoots: dependencies.internalRoots,
  });
  if (!rootResolved.ok) return rootResolved;
  for (const artifact of input.artifacts) {
    if (classifySensitivity(artifact) === 'credential') {
      return err(appError('WORK_MEMORY_SECRET_REJECTED', 'Work Memory checkpoint contains secret-like material'));
    }
    const options = {
      workspaceCanonicalRoot: root.value.canonicalRoot,
      relativePath: artifact,
      internalRoots: dependencies.internalRoots,
    };
    const existing = dependencies.fileSystem.resolveExisting(options);
    if (!existing.ok) {
      if (existing.error.code !== 'RESOURCE_NOT_FOUND') return existing;
      const newPath = dependencies.fileSystem.resolveNew(options);
      if (!newPath.ok) return newPath;
    }
  }
  return ok({ sensitivity: 'normal', context: 'workspace', workspaceId: root.value.id });
}

function resolveWorkspaceRootSecurity(
  dependencies: WorkMemoryCapabilityDependencies,
): Result<ResolvedToolSecurityContext, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  const resolved = dependencies.fileSystem.resolveExisting({
    workspaceCanonicalRoot: workspace.value.canonicalRoot,
    relativePath: '.',
    internalRoots: dependencies.internalRoots,
  });
  if (!resolved.ok) return resolved;
  return ok({ sensitivity: 'normal', context: 'workspace', workspaceId: workspace.value.id });
}

function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Result<Workspace, AppError> {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    return active.length === 1
      ? ok(active[0]!)
      : err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
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
    return workspace?.isActive
      ? ok(workspace)
      : err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is no longer active'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to revalidate active Workspace'));
  }
}

function isStrictObject(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Work Memory checkpoint input is invalid'));
}
