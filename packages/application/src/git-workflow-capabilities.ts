import {
  appError,
  err,
  ok,
  type AppError,
  type Result,
  type ToolExecutionContext,
  type Workspace,
} from '@sud-d/domain';
import type { GitSafetyAdapter, WorkspaceRepository } from '@sud-d/infrastructure';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';
import type {
  GitBranchCommand,
  GitCloneCommand,
  GitConfigureRemoteCommand,
  GitExpectedSnapshotCommand,
  GitSelectPrimaryRemoteCommand,
  GitWorkspaceService,
} from './git-workspace-service.js';

export const GIT_WORKFLOW_CAPABILITY_NAMES = Object.freeze([
  'git.inspect',
  'git.init',
  'git.remote.configure',
  'git.remote.select',
  'git.branch.create',
  'git.branch.switch',
  'git.branch.merge',
  'git.branch.delete',
  'git.fetch',
  'git.sync',
  'git.push',
  'git.clone',
] as const);
export type GitWorkflowCapabilityName = (typeof GIT_WORKFLOW_CAPABILITY_NAMES)[number];

export interface GitCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly gitSafety: GitSafetyAdapter;
  readonly gitWorkspace: GitWorkspaceService;
}

const SNAPSHOT_RE = /^[0-9a-f]{64}$/;
const SAFE_NAME_RE = /^[A-Za-z0-9._/-]{1,240}$/;
const SAFE_REMOTE_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function createGitWorkflowCapabilities(deps: GitCapabilityDependencies): readonly RegisteredToolCapability[] {
  const localSecurity = () => resolveWorkspaceSecurity(deps.workspaceRepo);
  const networkApproval = (operation: 'fetch'|'sync'|'push'|'clone', title: string) => ({
    describe: (_input: unknown) => ok({ title, resourceLabel: operation === 'clone' ? 'GitHub repository' : 'Primary Remote' }),
    bind: (input: unknown) => deps.gitWorkspace.networkApprovalBinding(operation, input),
  });

  return Object.freeze([
    defineToolCapability<Record<string, never>, unknown>({
      name: 'git.inspect', effect: 'read', validate: validateEmpty,
      resolveSecurity: localSecurity,
      execute: (_input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace.snapshot()),
    }),
    defineToolCapability<GitExpectedSnapshotCommand, unknown>({
      name: 'git.init', effect: 'create', validate: validateExpectedSnapshot,
      resolveSecurity: localSecurity,
      execute: (input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace.initialize(input.expectedSnapshotId)),
    }),
    defineToolCapability<GitConfigureRemoteCommand, unknown>({
      name: 'git.remote.configure', effect: 'modify', validate: validateConfigureRemote,
      resolveSecurity: localSecurity,
      execute: (input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace.configureRemote(input)),
    }),
    defineToolCapability<GitSelectPrimaryRemoteCommand, unknown>({
      name: 'git.remote.select', effect: 'modify', validate: validateSelectRemote,
      resolveSecurity: localSecurity,
      execute: (input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace.selectPrimaryRemote(input)),
    }),
    branchCapability('git.branch.create', 'create', validateBranch, deps.workspaceRepo, localSecurity, (input) => deps.gitWorkspace.createBranch(input)),
    branchCapability('git.branch.switch', 'modify', validateBranch, deps.workspaceRepo, localSecurity, (input) => deps.gitWorkspace.switchBranch(input)),
    branchCapability('git.branch.merge', 'modify', validateBranch, deps.workspaceRepo, localSecurity, (input) => deps.gitWorkspace.mergeBranch(input)),
    defineToolCapability<GitBranchCommand, unknown>({
      name: 'git.branch.delete', effect: 'delete', validate: validateBranch,
      resolveSecurity: localSecurity,
      approval: {
        describe: (input) => ok({ title: 'Delete local Git branch', resourceLabel: input.branchName }),
        bind: (input) => ok({ operation: 'delete', expectedSnapshotId: input.expectedSnapshotId, branchName: input.branchName }),
      },
      execute: (input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace.deleteBranch(input)),
    }),
    networkCapability('git.fetch', 'read', 'fetch', deps, networkApproval('fetch', 'Fetch GitHub remote state')),
    networkCapability('git.sync', 'modify', 'sync', deps, networkApproval('sync', 'Sync from GitHub')),
    networkCapability('git.push', 'modify', 'push', deps, networkApproval('push', 'Push to GitHub')),
    defineToolCapability<GitCloneCommand, unknown>({
      name: 'git.clone', effect: 'create', validate: validateClone,
      resolveSecurity: (input) => deps.gitWorkspace.resolveNetworkSecurity('clone', input),
      approval: networkApproval('clone', 'Clone GitHub repository'),
      execute: (input) => deps.gitWorkspace.clone(input),
    }),
  ]);
}

function branchCapability(
  name: 'git.branch.create'|'git.branch.switch'|'git.branch.merge',
  effect: 'create'|'modify',
  validate: (input: unknown) => Result<GitBranchCommand, AppError>,
  workspaceRepo: WorkspaceRepository,
  resolveSecurity: () => ReturnType<typeof resolveWorkspaceSecurity>,
  execute: (input: GitBranchCommand) => ReturnType<GitWorkspaceService['createBranch']>,
): RegisteredToolCapability {
  return defineToolCapability<GitBranchCommand, unknown>({
    name, effect, validate, resolveSecurity,
    execute: (input, context) => executeForAuthorizedWorkspace(workspaceRepo, context, () => execute(input)),
  });
}

function networkCapability(
  name: 'git.fetch'|'git.sync'|'git.push',
  effect: 'read'|'modify',
  operation: 'fetch'|'sync'|'push',
  deps: GitCapabilityDependencies,
  approval: NonNullable<Parameters<typeof defineToolCapability<GitExpectedSnapshotCommand, unknown>>[0]['approval']>,
): RegisteredToolCapability {
  return defineToolCapability<GitExpectedSnapshotCommand, unknown>({
    name, effect, validate: validateExpectedSnapshot,
    resolveSecurity: (input) => deps.gitWorkspace.resolveNetworkSecurity(operation, input),
    approval,
    execute: (input, context) => executeForAuthorizedWorkspace(deps.workspaceRepo, context, () => deps.gitWorkspace[operation](input)),
  });
}

function executeForAuthorizedWorkspace<T>(
  workspaceRepo: WorkspaceRepository,
  context: ToolExecutionContext,
  execute: () => Result<T, AppError>,
): Result<T, AppError> {
  const workspace = getExecutionWorkspace(workspaceRepo, context);
  if (!workspace.ok) return workspace;
  return execute();
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

function resolveWorkspaceSecurity(workspaceRepo: WorkspaceRepository) {
  try {
    const active = workspaceRepo.list().filter((item) => item.isActive);
    if (active.length !== 1) return err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
    return ok({ sensitivity: 'normal' as const, context: 'workspace' as const, workspaceId: active[0]!.id });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to resolve active Workspace'));
  }
}

function strictObject(input: unknown, keys: readonly string[]): input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const actual = Object.keys(input as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function invalid<T>(message: string): Result<T, AppError> { return err(appError('VALIDATION_FAILED', message)); }
function validSnapshot(value: unknown): value is string { return typeof value === 'string' && SNAPSHOT_RE.test(value); }
function validateEmpty(input: unknown): Result<Record<string, never>, AppError> {
  return strictObject(input, []) ? ok({}) : invalid('Git inspect input is invalid');
}
function validateExpectedSnapshot(input: unknown): Result<GitExpectedSnapshotCommand, AppError> {
  if (!strictObject(input, ['expectedSnapshotId']) || !validSnapshot(input.expectedSnapshotId)) return invalid('Git snapshot input is invalid');
  return ok({ expectedSnapshotId: input.expectedSnapshotId });
}
function validateConfigureRemote(input: unknown): Result<GitConfigureRemoteCommand, AppError> {
  if (!strictObject(input, ['expectedSnapshotId','remoteName','remoteUrl']) || !validSnapshot(input.expectedSnapshotId)
    || typeof input.remoteName !== 'string' || !SAFE_REMOTE_RE.test(input.remoteName)
    || typeof input.remoteUrl !== 'string' || input.remoteUrl.length < 1 || input.remoteUrl.length > 2048 || /[\r\n\0]/.test(input.remoteUrl)) {
    return invalid('Git remote configuration input is invalid');
  }
  return ok({ expectedSnapshotId: input.expectedSnapshotId, remoteName: input.remoteName, remoteUrl: input.remoteUrl });
}
function validateSelectRemote(input: unknown): Result<GitSelectPrimaryRemoteCommand, AppError> {
  if (!strictObject(input, ['expectedSnapshotId','remoteName']) || !validSnapshot(input.expectedSnapshotId)
    || typeof input.remoteName !== 'string' || !SAFE_REMOTE_RE.test(input.remoteName)) return invalid('Git remote selection input is invalid');
  return ok({ expectedSnapshotId: input.expectedSnapshotId, remoteName: input.remoteName });
}
function validateBranch(input: unknown): Result<GitBranchCommand, AppError> {
  if (!strictObject(input, ['expectedSnapshotId','branchName']) || !validSnapshot(input.expectedSnapshotId)
    || typeof input.branchName !== 'string' || !SAFE_NAME_RE.test(input.branchName) || /[\r\n\0]/.test(input.branchName)) return invalid('Git branch input is invalid');
  return ok({ expectedSnapshotId: input.expectedSnapshotId, branchName: input.branchName });
}
function validateClone(input: unknown): Result<GitCloneCommand, AppError> {
  if (!strictObject(input, ['repositoryUrl','destinationPath','displayName'])
    || typeof input.repositoryUrl !== 'string' || input.repositoryUrl.length < 1 || input.repositoryUrl.length > 2048 || /[\r\n\0]/.test(input.repositoryUrl)
    || typeof input.destinationPath !== 'string' || input.destinationPath.length < 1 || input.destinationPath.length > 32767 || /[\r\n\0]/.test(input.destinationPath)
    || typeof input.displayName !== 'string' || !input.displayName.trim() || input.displayName.length > 200 || /[\r\n\0]/.test(input.displayName)) {
    return invalid('Git clone input is invalid');
  }
  return ok({ repositoryUrl: input.repositoryUrl, destinationPath: input.destinationPath, displayName: input.displayName });
}
