import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  appError,
  err,
  ok,
  type ApprovalBindingValue,
  type AppError,
  type GitAuthStatus,
  type GitDefaultBranchState,
  type GitPrimaryRemoteState,
  type GitRemoteRelation,
  type GitRemoteTransport,
  type InternalRoot,
  type ResolvedToolSecurityContext,
  type Result,
  type Workspace,
} from '@sud-d/domain';
import {
  canonicalizePath,
  hasReparsePoint,
  isUnderInternalRoot,
  validateGitHubNetworkRemote,
  validateWorkspaceRoot,
  type GitRepositoryState,
  type GitSafetyAdapter,
  type GitStatusResult,
  type GitWorkspaceInspection,
  type WorkspaceGitSettingsRepository,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import type { WorkspaceService } from './workspace-service.js';

export interface GitOperationAvailability { readonly available: boolean; readonly reason?: string }
export interface GitWorkspaceSnapshot {
  readonly workspace: { readonly id: string; readonly displayName: string };
  readonly snapshotId: string;
  readonly repository: 'not_repository' | 'ready' | 'unsupported';
  readonly repositoryState: GitRepositoryState;
  readonly clean: boolean;
  readonly changedFiles: number;
  readonly truncated: boolean;
  readonly headSha?: string;
  readonly currentBranch?: string;
  readonly detached: boolean;
  readonly branches: readonly { readonly name: string; readonly current: boolean; readonly checkedOutElsewhere: boolean }[];
  readonly defaultBranch: { readonly state: GitDefaultBranchState; readonly branch?: string };
  readonly primaryRemote: { readonly state: GitPrimaryRemoteState; readonly name?: string; readonly safeRepository?: string; readonly transport?: GitRemoteTransport };
  readonly upstreamBranch?: string;
  readonly relation: GitRemoteRelation;
  readonly ahead?: number;
  readonly behind?: number;
  readonly authStatus: GitAuthStatus;
  readonly operations: Readonly<Record<'initialize'|'configureRemote'|'createBranch'|'switchBranch'|'mergeBranch'|'deleteBranch'|'fetch'|'sync'|'push', GitOperationAvailability>>;
}
export interface GitExpectedSnapshotCommand { readonly expectedSnapshotId: string }
export interface GitConfigureRemoteCommand extends GitExpectedSnapshotCommand { readonly remoteName: string; readonly remoteUrl: string }
export interface GitSelectPrimaryRemoteCommand extends GitExpectedSnapshotCommand { readonly remoteName: string }
export interface GitBranchCommand extends GitExpectedSnapshotCommand { readonly branchName: string }
export interface GitCloneCommand { readonly repositoryUrl: string; readonly destinationPath: string; readonly displayName: string }
export interface GitWorkspaceService {
  snapshot(): Result<GitWorkspaceSnapshot, AppError>;
  initialize(expectedSnapshotId: string): Result<GitWorkspaceSnapshot, AppError>;
  configureRemote(input: GitConfigureRemoteCommand): Result<GitWorkspaceSnapshot, AppError>;
  selectPrimaryRemote(input: GitSelectPrimaryRemoteCommand): Result<GitWorkspaceSnapshot, AppError>;
  createBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  switchBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  mergeBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  deleteBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  fetch(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  sync(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  push(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  clone(input: GitCloneCommand): Result<{ workspace: Workspace; snapshot: GitWorkspaceSnapshot }, AppError>;
  resolveNetworkSecurity(operation: 'fetch'|'sync'|'push'|'clone', input: unknown): Result<ResolvedToolSecurityContext, AppError>;
  networkApprovalBinding(operation: 'fetch'|'sync'|'push'|'clone', input: unknown): Result<ApprovalBindingValue, AppError>;
}
export interface GitWorkspaceServiceDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly gitSettings: WorkspaceGitSettingsRepository;
  readonly gitSafety: GitSafetyAdapter;
  readonly workspaceService: WorkspaceService;
  readonly internalRoots: readonly InternalRoot[];
}

interface CloneDestination { readonly canonicalDestination: string; readonly destinationLabel: string }
interface GitWorkspaceSnapshotState {
  readonly workspace: Workspace;
  readonly inspection: GitWorkspaceInspection;
  readonly snapshot: GitWorkspaceSnapshot;
}

type GitNetworkMutationOperation = 'sync' | 'push';

const AUTO_COMMIT_MESSAGES: Readonly<Record<GitNetworkMutationOperation, string>> = Object.freeze({
  sync: 'Save local changes before GitHub Sync',
  push: 'Save local changes before GitHub Push',
});

export function createGitWorkspaceService(deps: GitWorkspaceServiceDependencies): GitWorkspaceService {
  const activeWorkspace = (): Result<Workspace, AppError> => {
    const workspace = deps.workspaceRepo.list().find((item) => item.isActive);
    return workspace ? ok(workspace) : err(appError('WORKSPACE_NOT_FOUND', 'No active Workspace is selected'));
  };

  const snapshotState = (): Result<GitWorkspaceSnapshotState, AppError> => {
    const active = activeWorkspace();
    if (!active.ok) return active;
    const inspected = deps.gitSafety.inspectWorkspaceGit(active.value.canonicalRoot);
    if (!inspected.ok) return inspected;
    const built = buildSnapshot(active.value, inspected.value, deps);
    if (!built.ok) return built;
    return ok({ workspace: active.value, inspection: inspected.value, snapshot: built.value });
  };

  const snapshot = (): Result<GitWorkspaceSnapshot, AppError> => {
    const current = snapshotState();
    return current.ok ? ok(current.value.snapshot) : current;
  };

  const requireFreshSnapshot = (expectedSnapshotId: string): Result<GitWorkspaceSnapshotState, AppError> => {
    const current = snapshotState();
    if (!current.ok) return current;
    return current.value.snapshot.snapshotId === expectedSnapshotId
      ? current
      : err(appError('GIT_STATUS_STALE', 'Git state changed; refresh before retrying'));
  };

  const mutateLocal = (
    expectedSnapshotId: string,
    action: (workspace: Workspace, current: GitWorkspaceSnapshot, statusId: string) => Result<unknown, AppError>,
  ): Result<GitWorkspaceSnapshot, AppError> => {
    const current = requireFreshSnapshot(expectedSnapshotId);
    if (!current.ok) return current;
    const statusId = current.value.inspection.status?.statusId;
    if (!statusId) return err(appError('GIT_STATE_UNSAFE', 'Git status is unavailable for this action'));
    const result = action(current.value.workspace, current.value.snapshot, statusId);
    if (!result.ok) return result;
    return snapshot();
  };

  const networkState = (expectedSnapshotId: string): Result<GitWorkspaceSnapshotState, AppError> => requireFreshSnapshot(expectedSnapshotId);

  const autoCommitBeforeNetworkMutation = (
    operation: GitNetworkMutationOperation,
    state: GitWorkspaceSnapshotState,
  ): Result<GitWorkspaceSnapshotState, AppError> => {
    if (state.snapshot.clean) return ok(state);
    const committable = requireAutoCommittableStatus(state.inspection.status);
    if (!committable.ok) return committable;
    const committed = deps.gitSafety.commit(
      state.workspace.canonicalRoot,
      committable.value.statusId,
      AUTO_COMMIT_MESSAGES[operation],
    );
    if (!committed.ok) return committed;
    return snapshotState();
  };

  const service: GitWorkspaceService = {
    snapshot,
    initialize(expectedSnapshotId) {
      const current = requireFreshSnapshot(expectedSnapshotId); if (!current.ok) return current;
      const result = deps.gitSafety.initialize(current.value.workspace.canonicalRoot); if (!result.ok) return result;
      return snapshot();
    },
    configureRemote(input) {
      const current = requireFreshSnapshot(input.expectedSnapshotId); if (!current.ok) return current;
      const result = deps.gitSafety.configureRemote(current.value.workspace.canonicalRoot, { name: input.remoteName, url: input.remoteUrl });
      if (!result.ok) return result;
      return snapshot();
    },
    selectPrimaryRemote(input) {
      const current = requireFreshSnapshot(input.expectedSnapshotId); if (!current.ok) return current;
      const remote = current.value.inspection.remotes.find((item) => item.name === input.remoteName);
      if (!remote) return err(appError('GIT_REMOTE_MISSING', 'Selected Git remote is missing'));
      if (!remote.supported) return err(appError('GIT_REMOTE_UNSUPPORTED', 'Selected Git remote is unsupported'));
      deps.gitSettings.setPrimaryRemote(current.value.workspace.id, input.remoteName);
      return snapshot();
    },
    createBranch(input) { return mutateLocal(input.expectedSnapshotId, (ws, _current, statusId) => deps.gitSafety.createBranch(ws.canonicalRoot, statusId, input.branchName)); },
    switchBranch(input) { return mutateLocal(input.expectedSnapshotId, (ws, _current, statusId) => deps.gitSafety.switchBranch(ws.canonicalRoot, statusId, input.branchName)); },
    mergeBranch(input) { return mutateLocal(input.expectedSnapshotId, (ws, _current, statusId) => deps.gitSafety.mergeBranch(ws.canonicalRoot, statusId, input.branchName)); },
    deleteBranch(input) {
      return mutateLocal(input.expectedSnapshotId, (ws, current, statusId) => {
        if (current.defaultBranch.state !== 'known' || !current.defaultBranch.branch) return err(appError('GIT_DEFAULT_BRANCH_UNKNOWN', 'Default Git branch is unavailable'));
        return deps.gitSafety.deleteBranch(ws.canonicalRoot, statusId, input.branchName, current.defaultBranch.branch);
      });
    },
    fetch(input) {
      const state = networkState(input.expectedSnapshotId); if (!state.ok) return state;
      const remoteName = resolvedRemoteName(state.value.snapshot); if (!remoteName.ok) return remoteName;
      const result = deps.gitSafety.fetchRemote(state.value.workspace.canonicalRoot, remoteName.value); if (!result.ok) return result;
      return snapshot();
    },
    sync(input) {
      const state = networkState(input.expectedSnapshotId); if (!state.ok) return state;
      const ready = autoCommitBeforeNetworkMutation('sync', state.value); if (!ready.ok) return ready;
      const prepared = networkMutationInput(ready.value); if (!prepared.ok) return prepared;
      const result = deps.gitSafety.syncFromGitHub(ready.value.workspace.canonicalRoot, prepared.value); if (!result.ok) return result;
      return snapshot();
    },
    push(input) {
      const state = networkState(input.expectedSnapshotId); if (!state.ok) return state;
      const ready = autoCommitBeforeNetworkMutation('push', state.value); if (!ready.ok) return ready;
      const prepared = networkMutationInput(ready.value); if (!prepared.ok) return prepared;
      const result = deps.gitSafety.pushToGitHub(ready.value.workspace.canonicalRoot, prepared.value); if (!result.ok) return result;
      return snapshot();
    },
    clone(input) {
      const destination = validateCloneDestination(input.destinationPath, deps); if (!destination.ok) return destination;
      const identity = validateGitHubNetworkRemote(input.repositoryUrl); if (!identity.ok) return identity;
      const cloned = deps.gitSafety.cloneFromGitHub({ remoteUrl: input.repositoryUrl, destinationPath: destination.value.canonicalDestination });
      if (!cloned.ok) return cloned;
      const added = deps.workspaceService.add(input.displayName, cloned.value.destinationPath);
      if (!added.ok) return err(appError('WORKSPACE_INVALID', 'Repository cloned but Workspace registration failed', { cloned: true }));
      const selected = deps.workspaceService.select(added.value.id); if (!selected.ok) return selected;
      const refreshed = snapshot(); if (!refreshed.ok) return refreshed;
      return ok({ workspace: added.value, snapshot: refreshed.value });
    },
    resolveNetworkSecurity(operation, input) {
      if (operation === 'clone') {
        const command = asCloneCommand(input); if (!command.ok) return command;
        const destination = validateCloneDestination(command.value.destinationPath, deps); if (!destination.ok) return destination;
        const identity = validateGitHubNetworkRemote(command.value.repositoryUrl); if (!identity.ok) return identity;
        return ok({ sensitivity: 'normal', context: 'github_network' });
      }
      const command = asExpectedSnapshotCommand(input); if (!command.ok) return command;
      const state = networkState(command.value.expectedSnapshotId); if (!state.ok) return state;
      const eligible = requireNetworkApprovalEligibility(operation, state.value); if (!eligible.ok) return eligible;
      return ok({ sensitivity: 'normal', context: 'github_network', workspaceId: state.value.workspace.id });
    },
    networkApprovalBinding(operation, input) {
      if (operation === 'clone') {
        const command = asCloneCommand(input); if (!command.ok) return command;
        const destination = validateCloneDestination(command.value.destinationPath, deps); if (!destination.ok) return destination;
        const identity = validateGitHubNetworkRemote(command.value.repositoryUrl); if (!identity.ok) return identity;
        return ok({ operation, safeRepository: identity.value.safeRepository, transport: identity.value.transport, destinationLabel: destination.value.destinationLabel });
      }
      const command = asExpectedSnapshotCommand(input); if (!command.ok) return command;
      const state = networkState(command.value.expectedSnapshotId); if (!state.ok) return state;
      const eligible = requireNetworkApprovalEligibility(operation, state.value); if (!eligible.ok) return eligible;
      return ok({ operation, expectedSnapshotId: command.value.expectedSnapshotId, remoteName: eligible.value.name, safeRepository: eligible.value.safeRepository, transport: eligible.value.transport });
    },
  };
  return Object.freeze(service);
}

function buildSnapshot(workspace: Workspace, inspection: GitWorkspaceInspection, deps: GitWorkspaceServiceDependencies): Result<GitWorkspaceSnapshot, AppError> {
  const persistedPrimaryRemote = deps.gitSettings.get(workspace.id)?.primaryRemoteName;
  const primary = resolvePrimaryRemote(inspection, persistedPrimaryRemote);
  let defaultBranch: GitWorkspaceSnapshot['defaultBranch'] = { state: 'unknown' };
  if (primary.state === 'resolved' && primary.name) {
    const resolved = deps.gitSafety.resolveDefaultBranch(workspace.canonicalRoot, primary.name);
    if (!resolved.ok) return resolved;
    if (resolved.value) defaultBranch = { state: 'known', branch: resolved.value };
  }
  let relation: GitRemoteRelation = 'unknown'; let ahead: number | undefined; let behind: number | undefined;
  if (inspection.detect.isSupported && inspection.detect.branch && primary.state === 'resolved' && primary.name) {
    const classified = deps.gitSafety.relation(workspace.canonicalRoot, primary.name, inspection.detect.branch);
    if (classified.ok) { relation = classified.value.kind; ahead = classified.value.ahead; behind = classified.value.behind; }
    else relation = 'unavailable';
  }
  const status = inspection.status;
  const headSha = status?.headSha ?? inspection.detect.headSha;
  const repository = !inspection.detect.isRepository ? 'not_repository' : inspection.detect.isSupported ? 'ready' : 'unsupported';
  const clean = status?.clean ?? true;
  const changedFiles = status?.entries.length ?? 0;
  const currentBranch = inspection.detect.branch;
  const snapshotId = createHash('sha256').update(stableJson({
    workspaceId: workspace.id,
    statusId: status?.statusId ?? null,
    currentBranch: currentBranch ?? null,
    defaultBranch: defaultBranch.branch ?? null,
    primaryRemoteName: primary.name ?? null,
    persistedPrimaryRemote: persistedPrimaryRemote ?? null,
    trackingRemote: inspection.trackingRemote ?? null,
    remotes: inspection.remotes,
    branches: inspection.branches,
  })).digest('hex');
  const ready = repository === 'ready'; const resolvedRemote = primary.state === 'resolved'; const attached = !!currentBranch && !inspection.detect.detached;
  const networkMutationReady = ready && attached && resolvedRemote && requireAutoCommittableStatus(status).ok;
  const available = (value: boolean, reason: string): GitOperationAvailability => value ? { available: true } : { available: false, reason };
  return ok({
    workspace: { id: workspace.id, displayName: workspace.displayName }, snapshotId, repository, repositoryState: inspection.detect.state,
    clean, changedFiles, truncated: status?.truncated ?? false, ...(headSha ? { headSha } : {}),
    ...(currentBranch ? { currentBranch } : {}), detached: inspection.detect.detached ?? false,
    branches: inspection.branches, defaultBranch, primaryRemote: primary, ...(inspection.upstreamBranch ? { upstreamBranch: inspection.upstreamBranch } : {}),
    relation, ...(ahead === undefined ? {} : { ahead }), ...(behind === undefined ? {} : { behind }), authStatus: 'unknown',
    operations: {
      initialize: available(repository === 'not_repository', 'Repository already exists'),
      configureRemote: available(inspection.detect.isRepository, 'Initialize Git first'),
      createBranch: available(ready && clean && attached, 'Requires a clean attached repository'),
      switchBranch: available(ready && clean && attached, 'Requires a clean attached repository'),
      mergeBranch: available(ready && clean && attached, 'Requires a clean attached repository'),
      deleteBranch: available(ready && clean && attached && defaultBranch.state === 'known', 'Requires a known default branch and clean repository'),
      fetch: available(ready && resolvedRemote, 'Primary Remote is unavailable'),
      sync: available(networkMutationReady, 'Requires an attached repository, Primary Remote, and auto-saveable local changes'),
      push: available(networkMutationReady, 'Requires an attached repository, Primary Remote, and auto-saveable local changes'),
    },
  });
}

function resolvePrimaryRemote(inspection: GitWorkspaceInspection, persistedPrimaryRemoteName: string | undefined): GitWorkspaceSnapshot['primaryRemote'] {
  const byName = (name: string | undefined) => name ? inspection.remotes.find((remote) => remote.name === name) : undefined;
  const tracked = byName(inspection.trackingRemote);
  const persisted = byName(persistedPrimaryRemoteName);
  const selected = tracked ?? persisted ?? (inspection.remotes.length === 1 ? inspection.remotes[0] : undefined);
  if (!selected) return { state: inspection.remotes.length > 1 ? 'ambiguous' : 'missing' };
  if (!selected.supported) return { state: 'unsupported', name: selected.name };
  return { state: 'resolved', name: selected.name, ...(selected.safeRepository ? { safeRepository: selected.safeRepository } : {}), ...(selected.transport ? { transport: selected.transport } : {}) };
}
function requireAutoCommittableStatus(status: GitStatusResult | undefined): Result<GitStatusResult, AppError> {
  if (!status) return err(appError('GIT_STATE_UNSAFE', 'Git status is unavailable for this action'));
  if (status.clean) return ok(status);
  if (status.truncated) return err(appError('RESOURCE_TOO_LARGE', 'Git path count exceeds the trusted limit'));
  if (status.state !== 'normal') return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires a normal repository state'));
  if (status.entries.length === 0) return err(appError('GIT_STATE_UNSAFE', 'Git status is inconsistent'));
  if (status.entries.some((entry) => entry.sensitive)) {
    return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git changes require approval before GitHub operations'));
  }
  if (status.entries.some((entry) => entry.staged)) {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub operation cannot auto-save staged changes'));
  }
  if (status.entries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'GitHub operation cannot auto-save submodule/gitlink changes'));
  }
  if (status.entries.some((entry) => entry.kind === 'conflict')) {
    return err(appError('GIT_STATE_UNSAFE', 'Unresolved Git conflict blocks GitHub operation'));
  }
  return ok(status);
}

function requireNetworkApprovalEligibility(
  operation: 'fetch' | 'sync' | 'push',
  state: GitWorkspaceSnapshotState,
): Result<{ readonly name: string; readonly safeRepository: string; readonly transport: GitRemoteTransport }, AppError> {
  const { snapshot } = state;
  if (snapshot.repository !== 'ready') {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires a supported normal repository'));
  }
  if (snapshot.repositoryState !== 'normal') {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires a supported normal repository'));
  }
  if (operation !== 'fetch') {
    if (!snapshot.currentBranch) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires an attached local branch'));
    }
    if (snapshot.detached) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires an attached local branch'));
    }
    if (!snapshot.clean) {
      const committable = requireAutoCommittableStatus(state.inspection.status);
      if (!committable.ok) return committable;
    }
  }
  const remote = snapshot.primaryRemote;
  if (remote.state !== 'resolved') {
    const missing = resolvedRemoteName(snapshot);
    return missing.ok
      ? err(appError('GIT_REMOTE_MISSING', 'Primary Git remote is unavailable'))
      : missing;
  }
  if (!remote.name) return err(appError('GIT_REMOTE_MISSING', 'Primary Git remote is unavailable'));
  if (!remote.safeRepository) return err(appError('GIT_REMOTE_MISSING', 'Primary Git remote is unavailable'));
  if (!remote.transport) return err(appError('GIT_REMOTE_MISSING', 'Primary Git remote is unavailable'));
  return ok({ name: remote.name, safeRepository: remote.safeRepository, transport: remote.transport });
}
function resolvedRemoteName(snapshot: GitWorkspaceSnapshot): Result<string, AppError> {
  return snapshot.primaryRemote.state === 'resolved' && snapshot.primaryRemote.name
    ? ok(snapshot.primaryRemote.name)
    : err(appError(snapshot.primaryRemote.state === 'ambiguous' ? 'GIT_REMOTE_AMBIGUOUS' : snapshot.primaryRemote.state === 'unsupported' ? 'GIT_REMOTE_UNSUPPORTED' : 'GIT_REMOTE_MISSING', 'Primary Git remote is unavailable'));
}
function networkMutationInput(state: { snapshot: GitWorkspaceSnapshot; inspection: GitWorkspaceInspection }): Result<{ expectedStatusId: string; remoteName: string; branchName: string; upstreamBranch?: string }, AppError> {
  const remoteName = resolvedRemoteName(state.snapshot); if (!remoteName.ok) return remoteName;
  const statusId = state.inspection.status?.statusId; const branchName = state.snapshot.currentBranch;
  if (!statusId || !branchName || state.snapshot.detached) return err(appError('GIT_STATE_UNSAFE', 'GitHub operation requires an attached repository status'));
  return ok({ expectedStatusId: statusId, remoteName: remoteName.value, branchName, ...(state.snapshot.upstreamBranch ? { upstreamBranch: state.snapshot.upstreamBranch } : {}) });
}
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}
function asExpectedSnapshotCommand(input: unknown): Result<GitExpectedSnapshotCommand, AppError> {
  if (!input || typeof input !== 'object' || typeof (input as { expectedSnapshotId?: unknown }).expectedSnapshotId !== 'string') return err(appError('VALIDATION_FAILED', 'Git expected snapshot input is invalid'));
  return ok({ expectedSnapshotId: (input as { expectedSnapshotId: string }).expectedSnapshotId });
}
function asCloneCommand(input: unknown): Result<GitCloneCommand, AppError> {
  const value = input as Partial<GitCloneCommand> | null;
  if (!value || typeof value.repositoryUrl !== 'string' || typeof value.destinationPath !== 'string' || typeof value.displayName !== 'string' || !value.displayName.trim()) return err(appError('VALIDATION_FAILED', 'Git clone input is invalid'));
  return ok({ repositoryUrl: value.repositoryUrl, destinationPath: value.destinationPath, displayName: value.displayName });
}
function validateCloneDestination(destinationPath: string, deps: GitWorkspaceServiceDependencies): Result<CloneDestination, AppError> {
  const valid = validateWorkspaceRoot(destinationPath); if (!valid.ok) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination must be a safe local drive path'));
  const exists = fs.existsSync(destinationPath);
  let canonicalDestination: string;
  if (exists) {
    const reparse = hasReparsePoint(destinationPath); if (!reparse.ok || reparse.value) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination cannot use symlinks or junctions'));
    let stat: fs.Stats; try { stat = fs.statSync(destinationPath); } catch { return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination is unavailable')); }
    if (!stat.isDirectory() || fs.readdirSync(destinationPath).length > 0) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination must be an empty directory'));
    const canonical = canonicalizePath(destinationPath); if (!canonical.ok) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination could not be canonicalized'));
    canonicalDestination = canonical.value;
  } else {
    const parent = path.dirname(destinationPath);
    const reparse = hasReparsePoint(parent); if (!reparse.ok || reparse.value) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination parent cannot use symlinks or junctions'));
    const canonicalParent = canonicalizePath(parent); if (!canonicalParent.ok) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination requires an existing safe parent'));
    canonicalDestination = path.join(canonicalParent.value, path.basename(destinationPath));
  }
  if (isUnderInternalRoot(canonicalDestination, [...deps.internalRoots])) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination conflicts with an InternalRoot'));
  if (deps.workspaceRepo.findByCanonicalRoot(canonicalDestination)) return err(appError('GIT_CLONE_DESTINATION_UNSAFE', 'Clone destination conflicts with a registered Workspace'));
  return ok({ canonicalDestination, destinationLabel: path.basename(canonicalDestination) });
}
