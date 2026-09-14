import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type GitRemoteRelation,
  type GitRemoteTransport,
  type Result,
} from '@sud-d/domain';
import { resolveExistingResource } from './path-adapter.js';
import {
  createGitCommandRunner,
  type GitCommandResult,
  type GitCommandRunner,
} from './git-command-runner.js';
import { parseGitHubRemote } from './git-github-remote.js';

export const GIT_SAFETY_LIMITS = Object.freeze({
  maxStatusEntries: 500,
  maxDiffBytes: 256 * 1024,
  maxCheckpointFileBytes: 8 * 1024 * 1024,
  maxCheckpointAggregateBytes: 32 * 1024 * 1024,
  maxGitOutputBytes: 2 * 1024 * 1024,
  timeoutMs: 10_000,
});

export type GitRepositoryReason =
  | 'NOT_REPOSITORY'
  | 'BARE_REPOSITORY'
  | 'EXTERNAL_GITDIR'
  | 'WORKSPACE_ROOT_MISMATCH'
  | 'UNBORN_HEAD';

export type GitRepositoryState =
  | 'normal'
  | 'merge'
  | 'rebase'
  | 'cherry_pick'
  | 'revert'
  | 'bisect'
  | 'conflict';

export interface GitDetectResult {
  readonly isRepository: boolean;
  readonly isSupported: boolean;
  readonly reason?: GitRepositoryReason;
  readonly branch?: string;
  readonly detached?: boolean;
  readonly headSha?: string;
  readonly state: GitRepositoryState;
}

export interface GitStatusEntry {
  readonly path: string;
  readonly kind: 'modified' | 'added' | 'deleted' | 'type_changed' | 'untracked' | 'conflict' | 'changed';
  readonly staged: boolean;
  readonly unstaged: boolean;
  readonly untracked: boolean;
  readonly sensitive: boolean;
  readonly gitlink: boolean;
}

export interface GitStatusResult {
  readonly headSha: string;
  readonly branch?: string;
  readonly detached: boolean;
  readonly clean: boolean;
  readonly entries: readonly GitStatusEntry[];
  readonly truncated: boolean;
  readonly state: GitRepositoryState;
  readonly statusId: string;
}

export interface GitDiffResult {
  readonly patch: string;
  readonly bytes: number;
  readonly truncated: boolean;
  readonly omittedSensitivePaths: readonly string[];
}

export interface GitCheckpointResult {
  readonly created: boolean;
  readonly reason?: 'NO_CHANGES';
  readonly checkpointRef?: string;
  readonly commitSha?: string;
  readonly parentHead?: string;
  readonly capturedPathCount?: number;
}

export interface GitCommitResult {
  readonly commitSha: string;
  readonly parentHead: string;
  readonly branch: string;
  readonly committedPathCount: number;
}

export interface GitVerificationResult {
  readonly passed: boolean;
  readonly findingCount: number;
  readonly output: string;
}

export interface GitRemoteSummary {
  readonly name: string;
  readonly supported: boolean;
  readonly safeRepository?: string;
  readonly transport?: GitRemoteTransport;
}

export interface GitWorkspaceInspection {
  readonly detect: GitDetectResult;
  readonly status?: GitStatusResult;
  readonly branches: readonly { readonly name: string; readonly current: boolean; readonly checkedOutElsewhere: boolean }[];
  readonly remotes: readonly GitRemoteSummary[];
  readonly trackingRemote?: string;
  readonly upstreamBranch?: string;
}

export interface GitRelationResult {
  readonly kind: GitRemoteRelation;
  readonly ahead?: number;
  readonly behind?: number;
  readonly upstreamBranch?: string;
}

export interface GitBranchMutationResult {
  readonly headSha: string;
  readonly branch: string;
  readonly changed: boolean;
}

export interface GitMergeResult extends GitBranchMutationResult {
  readonly mode: 'already_merged' | 'fast_forward' | 'merge_commit';
}

export interface GitSafetyAdapter {
  inspectWorkspaceGit(workspaceCanonicalRoot: string): Result<GitWorkspaceInspection, AppError>;
  initialize(workspaceCanonicalRoot: string): Result<GitWorkspaceInspection, AppError>;
  configureRemote(
    workspaceCanonicalRoot: string,
    input: { readonly name: string; readonly url: string },
  ): Result<GitRemoteSummary, AppError>;
  resolveDefaultBranch(
    workspaceCanonicalRoot: string,
    remoteName: string,
  ): Result<string | undefined, AppError>;
  relation(
    workspaceCanonicalRoot: string,
    remoteName: string,
    branchName: string,
  ): Result<GitRelationResult, AppError>;
  createBranch(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    branchName: string,
  ): Result<GitBranchMutationResult, AppError>;
  switchBranch(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    branchName: string,
  ): Result<GitBranchMutationResult, AppError>;
  mergeBranch(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    sourceBranch: string,
  ): Result<GitMergeResult, AppError>;
  deleteBranch(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    branchName: string,
    defaultBranch: string,
  ): Result<GitBranchMutationResult, AppError>;
  detect(workspaceCanonicalRoot: string): Result<GitDetectResult, AppError>;
  status(workspaceCanonicalRoot: string, limit?: number): Result<GitStatusResult, AppError>;
  diff(
    workspaceCanonicalRoot: string,
    options?: { readonly relativePath?: string; readonly maxBytes?: number },
  ): Result<GitDiffResult, AppError>;
  diffApprovedSensitive(
    workspaceCanonicalRoot: string,
    options: { readonly relativePath: string; readonly maxBytes?: number },
  ): Result<GitDiffResult, AppError>;
  checkpoint(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
  ): Result<GitCheckpointResult, AppError>;
  checkpointApprovedSensitive(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
  ): Result<GitCheckpointResult, AppError>;
  commit(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    message: string,
  ): Result<GitCommitResult, AppError>;
  commitApprovedSensitive(
    workspaceCanonicalRoot: string,
    expectedStatusId: string,
    message: string,
  ): Result<GitCommitResult, AppError>;
  diffCheck(workspaceCanonicalRoot: string): Result<GitVerificationResult, AppError>;
  secretScan(workspaceCanonicalRoot: string): Result<GitVerificationResult, AppError>;
}

interface GitRuntime {
  readonly root: string;
  readonly commandRunner: GitCommandRunner;
}

interface GitMetadataLayout {
  readonly worktreeGitDir: string;
  readonly commonGitDir: string;
}

interface CheckpointFileSnapshot {
  readonly path: string;
  readonly mode: '100644' | '100755';
  readonly blobOid: string;
  readonly bytes: number;
  readonly digest: string;
}

const CHECKPOINT_MESSAGE = 'SUD-D safety checkpoint';
const CHECKPOINT_AUTHOR_NAME = 'SUD-D Safety Checkpoint';
const CHECKPOINT_AUTHOR_EMAIL = 'checkpoint@sud-d.invalid';
const COMMIT_AUTHOR_NAME = 'SUD-D Workspace Commit';
const COMMIT_AUTHOR_EMAIL = 'commit@sud-d.invalid';

export function createGitSafetyAdapter(
  options: { readonly commandRunner?: GitCommandRunner } = {},
): GitSafetyAdapter {
  const commandRunner = options.commandRunner ?? createGitCommandRunner();
  return Object.freeze({
    inspectWorkspaceGit(workspaceCanonicalRoot: string) {
      return inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);
    },
    initialize(workspaceCanonicalRoot: string) {
      return initializeRepository(workspaceCanonicalRoot, commandRunner);
    },
    configureRemote(workspaceCanonicalRoot: string, input: { readonly name: string; readonly url: string }) {
      return configureRemote(workspaceCanonicalRoot, input, commandRunner);
    },
    resolveDefaultBranch(workspaceCanonicalRoot: string, remoteName: string) {
      return resolveRemoteDefaultBranch(workspaceCanonicalRoot, remoteName, commandRunner);
    },
    relation(workspaceCanonicalRoot: string, remoteName: string, branchName: string) {
      return classifyRemoteRelation(workspaceCanonicalRoot, remoteName, branchName, commandRunner);
    },
    createBranch(workspaceCanonicalRoot: string, expectedStatusId: string, branchName: string) {
      return createLocalBranch(workspaceCanonicalRoot, expectedStatusId, branchName, commandRunner);
    },
    switchBranch(workspaceCanonicalRoot: string, expectedStatusId: string, branchName: string) {
      return switchLocalBranch(workspaceCanonicalRoot, expectedStatusId, branchName, commandRunner);
    },
    mergeBranch(workspaceCanonicalRoot: string, expectedStatusId: string, sourceBranch: string) {
      return mergeLocalBranch(workspaceCanonicalRoot, expectedStatusId, sourceBranch, commandRunner);
    },
    deleteBranch(workspaceCanonicalRoot: string, expectedStatusId: string, branchName: string, defaultBranch: string) {
      return deleteLocalBranch(workspaceCanonicalRoot, expectedStatusId, branchName, defaultBranch, commandRunner);
    },
    detect(workspaceCanonicalRoot: string) {
      return detectRepository(workspaceCanonicalRoot, commandRunner);
    },
    status(workspaceCanonicalRoot: string, limit?: number) {
      return readStatus(workspaceCanonicalRoot, limit, commandRunner);
    },
    diff(workspaceCanonicalRoot: string, options?: { readonly relativePath?: string; readonly maxBytes?: number }) {
      return readDiff(workspaceCanonicalRoot, options, false, commandRunner);
    },
    diffApprovedSensitive(workspaceCanonicalRoot: string, options: { readonly relativePath: string; readonly maxBytes?: number }) {
      return readDiff(workspaceCanonicalRoot, options, true, commandRunner);
    },
    checkpoint(workspaceCanonicalRoot: string, expectedStatusId: string) {
      return createCheckpoint(workspaceCanonicalRoot, expectedStatusId, false, commandRunner);
    },
    checkpointApprovedSensitive(workspaceCanonicalRoot: string, expectedStatusId: string) {
      return createCheckpoint(workspaceCanonicalRoot, expectedStatusId, true, commandRunner);
    },
    commit(workspaceCanonicalRoot: string, expectedStatusId: string, message: string) {
      return createBranchCommit(workspaceCanonicalRoot, expectedStatusId, message, false, commandRunner);
    },
    commitApprovedSensitive(workspaceCanonicalRoot: string, expectedStatusId: string, message: string) {
      return createBranchCommit(workspaceCanonicalRoot, expectedStatusId, message, true, commandRunner);
    },
    diffCheck(workspaceCanonicalRoot: string) {
      return runDiffCheck(workspaceCanonicalRoot, commandRunner);
    },
    secretScan(workspaceCanonicalRoot: string) {
      return runSecretScan(workspaceCanonicalRoot, commandRunner);
    },
  });
}

function inspectWorkspaceGit(
  workspaceCanonicalRoot: string,
  commandRunner: GitCommandRunner,
): Result<GitWorkspaceInspection, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!detected.ok) return detected;
  if (!detected.value.isRepository) {
    return ok({ detect: detected.value, branches: [], remotes: [] });
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const branchResult = runGit(workspaceCanonicalRoot, runtime.value, [
      'for-each-ref',
      '--format=%(refname:short)',
      'refs/heads',
    ]);
    if (!isSuccessfulGitCommand(branchResult)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect local Git branches'));
    }
    const branchNames = decode(branchResult.value.stdout)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (branchNames.length > GIT_SAFETY_LIMITS.maxStatusEntries) {
      return err(appError('RESOURCE_TOO_LARGE', 'Git branch count exceeds the trusted limit'));
    }

    const worktreeResult = runGit(workspaceCanonicalRoot, runtime.value, ['worktree', 'list', '--porcelain', '-z']);
    if (!isSuccessfulGitCommand(worktreeResult)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect Git worktree branch occupancy'));
    }
    const occupied = new Set<string>();
    for (const token of decode(worktreeResult.value.stdout).split('\0')) {
      if (!token.startsWith('branch refs/heads/')) continue;
      const name = token.slice('branch refs/heads/'.length);
      if (name) occupied.add(name);
    }
    const branches = branchNames.map((name) => ({
      name,
      current: detected.value.branch === name,
      checkedOutElsewhere: occupied.has(name) && detected.value.branch !== name,
    }));

    const remoteResult = runGit(workspaceCanonicalRoot, runtime.value, ['remote']);
    if (!isSuccessfulGitCommand(remoteResult)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect Git remotes'));
    }
    const remoteNames = decode(remoteResult.value.stdout)
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (remoteNames.length > 64) {
      return err(appError('RESOURCE_TOO_LARGE', 'Git remote count exceeds the trusted limit'));
    }
    const remotes: GitRemoteSummary[] = [];
    for (const name of remoteNames) {
      if (!isValidRemoteName(name)) {
        return err(appError('GIT_STATE_UNSAFE', 'Git remote name is unsupported'));
      }
      const urlResult = runGit(workspaceCanonicalRoot, runtime.value, ['remote', 'get-url', name]);
      if (!isSuccessfulGitCommand(urlResult)) {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect Git remote'));
      }
      const parsed = parseGitHubRemote(decode(urlResult.value.stdout).trim());
      if (!parsed.ok) {
        remotes.push({ name, supported: false });
      } else {
        remotes.push({
          name,
          supported: true,
          safeRepository: parsed.value.safeRepository,
          transport: parsed.value.transport,
        });
      }
    }

    let status: GitStatusResult | undefined;
    if (detected.value.isSupported && detected.value.headSha) {
      const statusResult = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
      if (!statusResult.ok) return statusResult;
      status = statusResult.value;
    }

    let trackingRemote: string | undefined;
    let upstreamBranch: string | undefined;
    if (detected.value.branch) {
      const upstream = runGit(workspaceCanonicalRoot, runtime.value, [
        'for-each-ref',
        '--format=%(upstream:remotename)%00%(upstream:short)',
        `refs/heads/${detected.value.branch}`,
      ]);
      if (isSuccessfulGitCommand(upstream)) {
        const [remote, branch] = decode(upstream.value.stdout).trim().split('\0');
        if (remote && isValidRemoteName(remote)) trackingRemote = remote;
        if (branch && branch.length <= 512 && !/[\r\n\0]/.test(branch)) upstreamBranch = branch;
      }
    }

    return ok({
      detect: detected.value,
      ...(status ? { status } : {}),
      branches,
      remotes,
      ...(trackingRemote ? { trackingRemote } : {}),
      ...(upstreamBranch ? { upstreamBranch } : {}),
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function initializeRepository(
  workspaceCanonicalRoot: string,
  commandRunner: GitCommandRunner,
): Result<GitWorkspaceInspection, AppError> {
  const before = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!before.ok) return before;
  if (before.value.isRepository) return inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const initialized = runGit(workspaceCanonicalRoot, runtime.value, ['init', '--quiet']);
    if (!isSuccessfulGitCommand(initialized)) {
      return err(appError('INTERNAL_ERROR', 'Failed to initialize Git repository'));
    }
    const top = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--show-toplevel']);
    if (!isSuccessfulGitCommand(top)) {
      return err(appError('GIT_STATE_UNSAFE', 'Initialized Git repository root could not be verified'));
    }
    const resolvedTop = canonicalExisting(decode(top.value.stdout).trim());
    if (!resolvedTop.ok || !samePath(resolvedTop.value, workspaceCanonicalRoot)) {
      return err(appError('GIT_STATE_UNSAFE', 'Initialized Git repository root does not match the Workspace'));
    }
  } finally {
    cleanupGitRuntime(runtime.value);
  }
  return inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);
}

function requireFreshCleanStatus(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  commandRunner: GitCommandRunner,
): Result<GitStatusResult, AppError> {
  const before = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!before.ok) return before;
  if (before.value.statusId !== expectedStatusId) {
    return err(appError('GIT_STATUS_STALE', 'Git status changed'));
  }
  if (!before.value.clean) {
    return err(appError('GIT_WORKTREE_DIRTY', 'Commit or remove local changes before this action'));
  }
  if (before.value.state !== 'normal') {
    return err(appError('GIT_STATE_UNSAFE', 'Git repository state is not safe for this action'));
  }
  return before;
}

function validateBranchName(
  workspaceCanonicalRoot: string,
  branchName: string,
  commandRunner: GitCommandRunner,
): Result<string, AppError> {
  if (
    branchName.length < 1
    || branchName.length > 255
    || branchName.startsWith('-')
    || /[\r\n\0]/.test(branchName)
  ) {
    return err(appError('VALIDATION_FAILED', 'Git branch name is invalid'));
  }
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const checked = runGit(workspaceCanonicalRoot, runtime.value, ['check-ref-format', '--branch', branchName]);
    if (!checked.ok || checked.value.status !== 0 || checked.value.overflowed) {
      return err(appError('VALIDATION_FAILED', 'Git branch name is invalid'));
    }
    return ok(branchName);
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function createLocalBranch(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  branchName: string,
  commandRunner: GitCommandRunner,
): Result<GitBranchMutationResult, AppError> {
  const validated = validateBranchName(workspaceCanonicalRoot, branchName, commandRunner);
  if (!validated.ok) return validated;
  const before = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
  if (!before.ok) return before;

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const exists = runGit(workspaceCanonicalRoot, runtime.value, ['show-ref', '--verify', '--quiet', `refs/heads/${validated.value}`]);
    if (!exists.ok) return exists;
    if (exists.value.status === 0) {
      return err(appError('RESOURCE_ALREADY_EXISTS', 'Local Git branch already exists'));
    }
    const created = runGit(workspaceCanonicalRoot, runtime.value, ['branch', validated.value]);
    if (!isSuccessfulGitCommand(created)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Local Git branch could not be created'));
    }
    const tip = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', `refs/heads/${validated.value}`]);
    if (!isSuccessfulGitCommand(tip)) {
      return err(appError('INTERNAL_ERROR', 'Created Git branch could not be verified'));
    }
    return ok({
      headSha: decode(tip.value.stdout).trim(),
      branch: validated.value,
      changed: true,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function switchLocalBranch(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  branchName: string,
  commandRunner: GitCommandRunner,
): Result<GitBranchMutationResult, AppError> {
  const validated = validateBranchName(workspaceCanonicalRoot, branchName, commandRunner);
  if (!validated.ok) return validated;
  const before = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
  if (!before.ok) return before;
  if (before.value.branch === validated.value) {
    return ok({ headSha: before.value.headSha, branch: validated.value, changed: false });
  }

  const inspected = inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);
  if (!inspected.ok) return inspected;
  const target = inspected.value.branches.find((branch) => branch.name === validated.value);
  if (!target) return err(appError('RESOURCE_NOT_FOUND', 'Local Git branch does not exist'));
  if (target.checkedOutElsewhere) {
    return err(appError('GIT_BRANCH_IN_USE', 'Local Git branch is checked out in another worktree'));
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const switched = runGit(workspaceCanonicalRoot, runtime.value, ['switch', validated.value]);
    if (!isSuccessfulGitCommand(switched)) {
      const refreshed = inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);
      if (refreshed.ok && refreshed.value.branches.some((branch) => branch.name === validated.value && branch.checkedOutElsewhere)) {
        return err(appError('GIT_BRANCH_IN_USE', 'Local Git branch is checked out in another worktree'));
      }
      return err(appError('GIT_OPERATION_CONFLICT', 'Local Git branch could not be switched safely'));
    }
  } finally {
    cleanupGitRuntime(runtime.value);
  }

  const after = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!after.ok) return after;
  if (after.value.branch !== validated.value || after.value.state !== 'normal' || !after.value.clean) {
    return err(appError('GIT_OPERATION_CONFLICT', 'Git branch switch final state could not be verified'));
  }
  return ok({ headSha: after.value.headSha, branch: validated.value, changed: true });
}

function mergeLocalBranch(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  sourceBranch: string,
  commandRunner: GitCommandRunner,
): Result<GitMergeResult, AppError> {
  const validated = validateBranchName(workspaceCanonicalRoot, sourceBranch, commandRunner);
  if (!validated.ok) return validated;
  const before = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
  if (!before.ok) return before;
  if (!before.value.branch || before.value.detached) {
    return err(appError('GIT_STATE_UNSAFE', 'Git merge requires an attached local branch'));
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const source = runGit(workspaceCanonicalRoot, runtime.value, [
      'rev-parse',
      '--verify',
      `refs/heads/${validated.value}`,
    ]);
    if (!isSuccessfulGitCommand(source)) {
      return err(appError('RESOURCE_NOT_FOUND', 'Merge source branch does not exist'));
    }
    const sourceSha = decode(source.value.stdout).trim();

    const alreadyContained = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-base',
      '--is-ancestor',
      sourceSha,
      before.value.headSha,
    ]);
    if (!alreadyContained.ok || alreadyContained.value.overflowed) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge ancestry could not be verified'));
    }
    if (alreadyContained.value.status === 0) {
      return ok({
        headSha: before.value.headSha,
        branch: before.value.branch,
        changed: false,
        mode: 'already_merged',
      });
    }
    if (alreadyContained.value.status !== 1) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge ancestry could not be verified'));
    }

    const fastForward = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-base',
      '--is-ancestor',
      before.value.headSha,
      sourceSha,
    ]);
    if (!fastForward.ok || fastForward.value.overflowed) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge ancestry could not be verified'));
    }

    if (fastForward.value.status === 0) {
      const revalidated = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
      if (!revalidated.ok) return revalidated;
      if (revalidated.value.headSha !== before.value.headSha || revalidated.value.branch !== before.value.branch) {
        return err(appError('GIT_STATUS_STALE', 'Git state changed before merge'));
      }
      const merged = runGit(workspaceCanonicalRoot, runtime.value, ['merge', '--ff-only', sourceSha]);
      if (!isSuccessfulGitCommand(merged)) {
        return err(appError('GIT_OPERATION_CONFLICT', 'Git fast-forward merge could not be completed safely'));
      }
      const after = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
      if (!after.ok) return after;
      if (
        after.value.headSha !== sourceSha
        || after.value.branch !== before.value.branch
        || after.value.state !== 'normal'
        || !after.value.clean
      ) {
        return err(appError('GIT_OPERATION_CONFLICT', 'Git fast-forward merge final state could not be verified'));
      }
      return ok({
        headSha: after.value.headSha,
        branch: before.value.branch,
        changed: true,
        mode: 'fast_forward',
      });
    }
    if (fastForward.value.status !== 1) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge ancestry could not be verified'));
    }

    const preflight = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-tree',
      '--write-tree',
      before.value.headSha,
      sourceSha,
    ]);
    if (!preflight.ok || preflight.value.overflowed || preflight.value.status !== 0) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge conflict preflight did not prove a clean merge'));
    }
    const treeSha = decode(preflight.value.stdout).split(/\r?\n/, 1)[0]?.trim();
    if (!treeSha || !/^[0-9a-f]{40,64}$/i.test(treeSha)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge conflict preflight was inconclusive'));
    }

    const revalidated = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
    if (!revalidated.ok) return revalidated;
    if (revalidated.value.headSha !== before.value.headSha || revalidated.value.branch !== before.value.branch) {
      return err(appError('GIT_STATUS_STALE', 'Git state changed before merge'));
    }

    const merged = runGit(workspaceCanonicalRoot, runtime.value, ['merge', '--no-edit', '--no-ff', sourceSha]);
    if (!isSuccessfulGitCommand(merged)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge could not be completed safely'));
    }
    const after = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
    if (!after.ok) return after;
    if (
      after.value.headSha === before.value.headSha
      || after.value.branch !== before.value.branch
      || after.value.state !== 'normal'
      || !after.value.clean
    ) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git merge final state could not be verified'));
    }
    return ok({
      headSha: after.value.headSha,
      branch: before.value.branch,
      changed: true,
      mode: 'merge_commit',
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function deleteLocalBranch(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  branchName: string,
  defaultBranch: string,
  commandRunner: GitCommandRunner,
): Result<GitBranchMutationResult, AppError> {
  const target = validateBranchName(workspaceCanonicalRoot, branchName, commandRunner);
  if (!target.ok) return target;
  const primary = validateBranchName(workspaceCanonicalRoot, defaultBranch, commandRunner);
  if (!primary.ok) return err(appError('GIT_DEFAULT_BRANCH_UNKNOWN', 'Default Git branch is unavailable'));

  const before = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
  if (!before.ok) return before;
  if (!before.value.branch || before.value.detached) {
    return err(appError('GIT_STATE_UNSAFE', 'Git branch deletion requires an attached local branch'));
  }
  if (target.value === before.value.branch) {
    return err(appError('GIT_BRANCH_IN_USE', 'Current Git branch cannot be deleted'));
  }
  if (target.value === primary.value) {
    return err(appError('GIT_BRANCH_IN_USE', 'Default Git branch cannot be deleted'));
  }

  const inspected = inspectWorkspaceGit(workspaceCanonicalRoot, commandRunner);
  if (!inspected.ok) return inspected;
  const targetSummary = inspected.value.branches.find((branch) => branch.name === target.value);
  if (!targetSummary) return err(appError('RESOURCE_NOT_FOUND', 'Local Git branch does not exist'));
  if (targetSummary.checkedOutElsewhere) {
    return err(appError('GIT_BRANCH_IN_USE', 'Local Git branch is checked out in another worktree'));
  }
  if (!inspected.value.branches.some((branch) => branch.name === primary.value)) {
    return err(appError('GIT_DEFAULT_BRANCH_UNKNOWN', 'Default Git branch is unavailable'));
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const targetTip = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', `refs/heads/${target.value}`]);
    const defaultTip = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', `refs/heads/${primary.value}`]);
    if (!isSuccessfulGitCommand(targetTip) || !isSuccessfulGitCommand(defaultTip)) {
      return err(appError('GIT_DEFAULT_BRANCH_UNKNOWN', 'Default Git branch state could not be verified'));
    }
    const targetSha = decode(targetTip.value.stdout).trim();
    const defaultSha = decode(defaultTip.value.stdout).trim();
    const merged = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-base',
      '--is-ancestor',
      targetSha,
      defaultSha,
    ]);
    if (!merged.ok || merged.value.overflowed || merged.value.status !== 0) {
      return err(appError('GIT_BRANCH_UNMERGED', 'Local Git branch is not fully merged into the default branch'));
    }

    const revalidated = requireFreshCleanStatus(workspaceCanonicalRoot, expectedStatusId, commandRunner);
    if (!revalidated.ok) return revalidated;
    if (revalidated.value.headSha !== before.value.headSha || revalidated.value.branch !== before.value.branch) {
      return err(appError('GIT_STATUS_STALE', 'Git state changed before branch deletion'));
    }

    const deleted = runGit(workspaceCanonicalRoot, runtime.value, ['branch', '-d', target.value]);
    if (!isSuccessfulGitCommand(deleted)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Local Git branch could not be deleted safely'));
    }
    const remains = runGit(workspaceCanonicalRoot, runtime.value, ['show-ref', '--verify', '--quiet', `refs/heads/${target.value}`]);
    if (!remains.ok || remains.value.overflowed || remains.value.status === 0) {
      return err(appError('INTERNAL_ERROR', 'Deleted Git branch final state could not be verified'));
    }
    return ok({
      headSha: before.value.headSha,
      branch: target.value,
      changed: true,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function resolveRemoteDefaultBranch(
  workspaceCanonicalRoot: string,
  remoteName: string,
  commandRunner: GitCommandRunner,
): Result<string | undefined, AppError> {
  if (!isValidRemoteName(remoteName)) {
    return err(appError('VALIDATION_FAILED', 'Git remote name is invalid'));
  }
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const remotes = runGit(workspaceCanonicalRoot, runtime.value, ['remote']);
    if (!isSuccessfulGitCommand(remotes)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect Git remotes'));
    }
    if (!decode(remotes.value.stdout).split(/\r?\n/).map((value) => value.trim()).includes(remoteName)) {
      return err(appError('GIT_REMOTE_MISSING', 'Git remote is missing'));
    }
    const symbolic = runGit(workspaceCanonicalRoot, runtime.value, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remoteName}/HEAD`,
    ]);
    if (!symbolic.ok || symbolic.value.overflowed) {
      return err(appError('GIT_DEFAULT_BRANCH_UNKNOWN', 'Default Git branch could not be resolved'));
    }
    if (symbolic.value.status !== 0) return ok(undefined);
    const short = decode(symbolic.value.stdout).trim();
    const prefix = `${remoteName}/`;
    if (!short.startsWith(prefix) || short.length <= prefix.length) return ok(undefined);
    const branch = short.slice(prefix.length);
    if (
      branch.length > 255
      || branch.startsWith('-')
      || /[\r\n\0]/.test(branch)
    ) {
      return ok(undefined);
    }
    const checked = runGit(workspaceCanonicalRoot, runtime.value, ['check-ref-format', '--branch', branch]);
    if (!isSuccessfulGitCommand(checked)) return ok(undefined);
    return ok(branch);
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function classifyRemoteRelation(
  workspaceCanonicalRoot: string,
  remoteName: string,
  branchName: string,
  commandRunner: GitCommandRunner,
): Result<GitRelationResult, AppError> {
  if (!isValidRemoteName(remoteName)) {
    return err(appError('VALIDATION_FAILED', 'Git remote name is invalid'));
  }
  const validatedBranch = validateBranchName(workspaceCanonicalRoot, branchName, commandRunner);
  if (!validatedBranch.ok) return validatedBranch;

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const local = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', `refs/heads/${validatedBranch.value}`]);
    if (!isSuccessfulGitCommand(local)) {
      return err(appError('RESOURCE_NOT_FOUND', 'Local Git branch does not exist'));
    }
    const upstreamResult = runGit(workspaceCanonicalRoot, runtime.value, [
      'for-each-ref',
      '--format=%(upstream:short)',
      `refs/heads/${validatedBranch.value}`,
    ]);
    if (!isSuccessfulGitCommand(upstreamResult)) {
      return ok({ kind: 'unavailable' });
    }
    const upstreamBranch = decode(upstreamResult.value.stdout).trim();
    if (!upstreamBranch || !upstreamBranch.startsWith(`${remoteName}/`)) {
      return ok({ kind: 'no_upstream' });
    }
    if (upstreamBranch.length > 512 || /[\r\n\0]/.test(upstreamBranch)) {
      return ok({ kind: 'unavailable' });
    }

    const remoteRef = `refs/remotes/${upstreamBranch}`;
    const remote = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', remoteRef]);
    if (!isSuccessfulGitCommand(remote)) {
      return ok({ kind: 'unavailable', upstreamBranch });
    }
    const localSha = decode(local.value.stdout).trim();
    const remoteSha = decode(remote.value.stdout).trim();
    if (localSha === remoteSha) {
      return ok({ kind: 'up_to_date', ahead: 0, behind: 0, upstreamBranch });
    }

    const counts = runGit(workspaceCanonicalRoot, runtime.value, [
      'rev-list',
      '--left-right',
      '--count',
      `${localSha}...${remoteSha}`,
    ]);
    let ahead: number | undefined;
    let behind: number | undefined;
    if (isSuccessfulGitCommand(counts)) {
      const match = /^(\d+)\s+(\d+)$/.exec(decode(counts.value.stdout).trim());
      if (match) {
        const parsedAhead = Number(match[1]);
        const parsedBehind = Number(match[2]);
        if (Number.isSafeInteger(parsedAhead) && Number.isSafeInteger(parsedBehind)) {
          ahead = parsedAhead;
          behind = parsedBehind;
        }
      }
    }

    const remoteAncestor = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-base',
      '--is-ancestor',
      remoteSha,
      localSha,
    ]);
    if (!remoteAncestor.ok || remoteAncestor.value.overflowed) {
      return ok({ kind: 'unavailable', upstreamBranch });
    }
    if (remoteAncestor.value.status === 0) {
      return ok({
        kind: 'local_ahead',
        ...(ahead === undefined ? {} : { ahead }),
        ...(behind === undefined ? {} : { behind }),
        upstreamBranch,
      });
    }
    if (remoteAncestor.value.status !== 1) return ok({ kind: 'unavailable', upstreamBranch });

    const localAncestor = runGit(workspaceCanonicalRoot, runtime.value, [
      'merge-base',
      '--is-ancestor',
      localSha,
      remoteSha,
    ]);
    if (!localAncestor.ok || localAncestor.value.overflowed) {
      return ok({ kind: 'unavailable', upstreamBranch });
    }
    if (localAncestor.value.status === 0) {
      return ok({
        kind: 'remote_ahead',
        ...(ahead === undefined ? {} : { ahead }),
        ...(behind === undefined ? {} : { behind }),
        upstreamBranch,
      });
    }
    if (localAncestor.value.status !== 1) return ok({ kind: 'unavailable', upstreamBranch });

    return ok({
      kind: 'diverged',
      ...(ahead === undefined ? {} : { ahead }),
      ...(behind === undefined ? {} : { behind }),
      upstreamBranch,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function configureRemote(
  workspaceCanonicalRoot: string,
  input: { readonly name: string; readonly url: string },
  commandRunner: GitCommandRunner,
): Result<GitRemoteSummary, AppError> {
  if (!isValidRemoteName(input.name)) {
    return err(appError('VALIDATION_FAILED', 'Git remote name is invalid'));
  }
  const parsed = parseGitHubRemote(input.url);
  if (!parsed.ok) return parsed;

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const top = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--show-toplevel']);
    if (!isSuccessfulGitCommand(top)) {
      return err(appError('GIT_STATE_UNSAFE', 'Git remote configuration requires a repository at the Workspace root'));
    }
    const resolvedTop = canonicalExisting(decode(top.value.stdout).trim());
    if (!resolvedTop.ok || !samePath(resolvedTop.value, workspaceCanonicalRoot)) {
      return err(appError('GIT_STATE_UNSAFE', 'Git repository root does not match the Workspace'));
    }

    const remotes = runGit(workspaceCanonicalRoot, runtime.value, ['remote']);
    if (!isSuccessfulGitCommand(remotes)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect Git remotes'));
    }
    const exists = decode(remotes.value.stdout).split(/\r?\n/).map((value) => value.trim()).includes(input.name);
    const changed = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      exists
        ? ['remote', 'set-url', input.name, parsed.value.canonicalUrl]
        : ['remote', 'add', input.name, parsed.value.canonicalUrl],
    );
    if (!isSuccessfulGitCommand(changed)) {
      return err(appError('INTERNAL_ERROR', 'Failed to configure Git remote'));
    }

    const verified = runGit(workspaceCanonicalRoot, runtime.value, ['remote', 'get-url', input.name]);
    if (!isSuccessfulGitCommand(verified)) {
      return err(appError('INTERNAL_ERROR', 'Failed to verify Git remote configuration'));
    }
    const verifiedIdentity = parseGitHubRemote(decode(verified.value.stdout).trim());
    if (!verifiedIdentity.ok) {
      return err(appError('GIT_REMOTE_UNSUPPORTED', 'Configured Git remote is unsupported'));
    }
    return ok({
      name: input.name,
      supported: true,
      safeRepository: verifiedIdentity.value.safeRepository,
      transport: verifiedIdentity.value.transport,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function isValidRemoteName(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,128}$/.test(value)
    && value !== '.'
    && value !== '..'
    && !value.startsWith('-');
}

function resolveGitMetadataLayout(workspaceCanonicalRoot: string): Result<GitMetadataLayout, AppError> {
  const marker = path.join(workspaceCanonicalRoot, '.git');
  try {
    const markerStat = fs.lstatSync(marker);
    if (markerStat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    if (markerStat.isDirectory()) {
      const gitDir = canonicalExisting(marker);
      if (!gitDir.ok) return gitDir;
      return ok({ worktreeGitDir: gitDir.value, commonGitDir: gitDir.value });
    }
    if (!markerStat.isFile() || markerStat.size <= 0 || markerStat.size > 4096) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }

    const body = fs.readFileSync(marker, 'utf8');
    const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(body);
    const rawGitDir = match?.[1];
    if (!rawGitDir || !path.isAbsolute(rawGitDir)) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }

    const targetStat = fs.lstatSync(rawGitDir);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    const worktreeGitDir = canonicalExisting(rawGitDir);
    if (!worktreeGitDir.ok) return worktreeGitDir;

    const commondirPath = path.join(worktreeGitDir.value, 'commondir');
    const commondirStat = fs.lstatSync(commondirPath);
    if (commondirStat.isSymbolicLink() || !commondirStat.isFile() || commondirStat.size > 64) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    if (!/^\.\.\/\.\.\r?\n?$/.test(fs.readFileSync(commondirPath, 'utf8'))) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    const commonGitDir = canonicalExisting(path.resolve(worktreeGitDir.value, '..', '..'));
    if (!commonGitDir.ok) return commonGitDir;
    const worktreesDir = canonicalExisting(path.join(commonGitDir.value, 'worktrees'));
    if (!worktreesDir.ok || !samePath(path.dirname(worktreeGitDir.value), worktreesDir.value)) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }

    const backlinkPath = path.join(worktreeGitDir.value, 'gitdir');
    const backlinkStat = fs.lstatSync(backlinkPath);
    if (backlinkStat.isSymbolicLink() || !backlinkStat.isFile() || backlinkStat.size <= 0 || backlinkStat.size > 4096) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    const backlinkMatch = /^([^\r\n]+)\r?\n?$/.exec(fs.readFileSync(backlinkPath, 'utf8'));
    const backlinkRaw = backlinkMatch?.[1];
    if (!backlinkRaw || !path.isAbsolute(backlinkRaw)) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }
    const backlink = canonicalExisting(backlinkRaw);
    const markerCanonical = canonicalExisting(marker);
    if (!backlink.ok || !markerCanonical.ok || !samePath(backlink.value, markerCanonical.value)) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
    }

    for (const requiredDir of [path.join(commonGitDir.value, 'objects'), path.join(commonGitDir.value, 'refs')]) {
      const stat = fs.lstatSync(requiredDir);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
      }
    }
    for (const requiredFile of [path.join(worktreeGitDir.value, 'HEAD'), path.join(worktreeGitDir.value, 'index')]) {
      const stat = fs.lstatSync(requiredFile);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
      }
    }
    return ok({ worktreeGitDir: worktreeGitDir.value, commonGitDir: commonGitDir.value });
  } catch {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git metadata layout is unsupported'));
  }
}

function detectRepository(
  workspaceCanonicalRoot: string,
  commandRunner: GitCommandRunner,
): Result<GitDetectResult, AppError> {
  const gitMarker = path.join(workspaceCanonicalRoot, '.git');
  try {
    if (!fs.existsSync(gitMarker)) {
      if (looksLikeBareRepository(workspaceCanonicalRoot)) {
        return ok({ isRepository: true, isSupported: false, reason: 'BARE_REPOSITORY', state: 'normal' });
      }
      return ok({ isRepository: false, isSupported: false, reason: 'NOT_REPOSITORY', state: 'normal' });
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect Git repository metadata'));
  }

  const metadata = resolveGitMetadataLayout(workspaceCanonicalRoot);
  if (!metadata.ok) {
    return ok({ isRepository: true, isSupported: false, reason: 'EXTERNAL_GITDIR', state: 'normal' });
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const top = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--show-toplevel']);
    if (!top.ok || top.value.status !== 0 || top.value.overflowed) return err(appError('INTERNAL_ERROR', 'Failed to inspect Git repository'));
    const bare = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--is-bare-repository']);
    if (!bare.ok || bare.value.status !== 0 || bare.value.overflowed) return err(appError('INTERNAL_ERROR', 'Failed to inspect Git repository'));
    if (decode(top.value.stdout).trim().length === 0 || decode(bare.value.stdout).trim() === 'true') {
      return ok({ isRepository: true, isSupported: false, reason: 'BARE_REPOSITORY', state: 'normal' });
    }

    const root = canonicalExisting(decode(top.value.stdout).trim());
    if (!root.ok) return root;
    if (!samePath(root.value, workspaceCanonicalRoot)) {
      return ok({ isRepository: true, isSupported: false, reason: 'WORKSPACE_ROOT_MISMATCH', state: 'normal' });
    }

    const head = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', 'HEAD']);
    if (!head.ok || head.value.status !== 0 || head.value.overflowed) {
      return ok({ isRepository: true, isSupported: false, reason: 'UNBORN_HEAD', state: readRepositoryState(metadata.value.worktreeGitDir) });
    }
    const headSha = decode(head.value.stdout).trim();
    const branchResult = runGit(workspaceCanonicalRoot, runtime.value, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const branch = branchResult.ok && branchResult.value.status === 0
      ? decode(branchResult.value.stdout).trim() || undefined
      : undefined;
    return ok({
      isRepository: true,
      isSupported: true,
      ...(branch ? { branch } : { detached: true }),
      headSha,
      state: readRepositoryState(metadata.value.worktreeGitDir),
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function readStatus(
  workspaceCanonicalRoot: string,
  requestedLimit: number = GIT_SAFETY_LIMITS.maxStatusEntries,
  commandRunner: GitCommandRunner,
): Result<GitStatusResult, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Active Workspace is not a supported Git repository'));
  }

  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  try {
    const status = runGit(workspaceCanonicalRoot, runtime.value, [
      'status',
      '--porcelain=v2',
      '-z',
      '--branch',
      '--untracked-files=all',
      '--ignore-submodules=dirty',
      '--no-renames',
    ]);
    if (!status.ok || status.value.status !== 0 || status.value.overflowed) return err(appError('INTERNAL_ERROR', 'Failed to inspect Git status'));
    const parsed = parsePorcelainV2(status.value.stdout);
    if (!parsed.ok) return parsed;
    const sorted = parsed.value
      .filter((entry) => !isExcludedWorkspacePath(entry.path))
      .sort((a, b) => a.path.localeCompare(b.path));
    const hardLimit = GIT_SAFETY_LIMITS.maxStatusEntries;
    const boundedForCheckpoint = sorted.slice(0, hardLimit);
    const statusId = buildStatusId(
      workspaceCanonicalRoot,
      detected.value.headSha,
      detected.value.branch,
      detected.value.state,
      boundedForCheckpoint,
      sorted.length,
    );
    if (!statusId.ok) return statusId;
    const callerLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, hardLimit)
      : hardLimit;
    return ok({
      headSha: detected.value.headSha,
      ...(detected.value.branch ? { branch: detected.value.branch } : {}),
      detached: detected.value.detached === true,
      clean: sorted.length === 0,
      entries: boundedForCheckpoint.slice(0, callerLimit),
      truncated: sorted.length > callerLimit,
      state: sorted.some((entry) => entry.kind === 'conflict') ? 'conflict' : detected.value.state,
      statusId: statusId.value,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function readDiff(
  workspaceCanonicalRoot: string,
  options: { readonly relativePath?: string; readonly maxBytes?: number } = {},
  allowSensitive = false,
  commandRunner: GitCommandRunner,
): Result<GitDiffResult, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Active Workspace is not a supported Git repository'));
  }
  const metadata = resolveGitMetadataLayout(workspaceCanonicalRoot);
  if (!metadata.ok) return metadata;

  const requestedPath = options.relativePath;
  if (requestedPath !== undefined) {
    const validated = validateGitCallerPath(requestedPath);
    if (!validated.ok) return validated;
    if (!allowSensitive && classifySensitivity(validated.value) === 'credential') {
      return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git diff requires approval'));
    }
  }

  const status = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!status.ok) return status;
  if (status.value.truncated) {
    return err(appError('RESOURCE_TOO_LARGE', 'Git diff changed-path count exceeds the trusted limit'));
  }

  const omittedSensitivePaths = status.value.entries
    .filter((entry) => entry.sensitive)
    .filter((entry) => !allowSensitive || requestedPath === undefined || !pathWithinFilter(entry.path, requestedPath))
    .map((entry) => entry.path)
    .sort();
  const selectedEntries = status.value.entries
    .filter((entry) => !entry.untracked)
    .filter((entry) => !entry.sensitive || (allowSensitive && requestedPath !== undefined && pathWithinFilter(entry.path, requestedPath)))
    .filter((entry) => requestedPath === undefined || pathWithinFilter(entry.path, requestedPath));
  if (selectedEntries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git diff does not support submodule/gitlink changes'));
  }
  if (selectedEntries.length === 0) {
    return ok({ patch: '', bytes: 0, truncated: false, omittedSensitivePaths });
  }

  const maxBytes = options.maxBytes === undefined
    ? GIT_SAFETY_LIMITS.maxDiffBytes
    : Math.min(Math.max(1, options.maxBytes), GIT_SAFETY_LIMITS.maxDiffBytes);
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  const tempIndex = path.join(runtime.value.root, 'diff.index');
  const tempObjects = path.join(runtime.value.root, 'objects');
  try {
    fs.mkdirSync(tempObjects, { recursive: true });
    const isolatedEnv = {
      GIT_INDEX_FILE: tempIndex,
      GIT_OBJECT_DIRECTORY: tempObjects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(metadata.value.commonGitDir, 'objects'),
    };
    const seeded = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['read-tree', detected.value.headSha],
      { extraEnv: isolatedEnv },
    );
    if (!isSuccessfulGitCommand(seeded)) {
      return err(appError('INTERNAL_ERROR', 'Failed to initialize isolated Git diff index'));
    }

    const headModes = readHeadModes(
      workspaceCanonicalRoot,
      runtime.value,
      detected.value.headSha,
      selectedEntries.map((entry) => entry.path),
    );
    if (!headModes.ok) return headModes;
    const prepared = prepareCheckpointEntries(
      workspaceCanonicalRoot,
      runtime.value,
      selectedEntries,
      headModes.value,
      isolatedEnv,
      allowSensitive,
    );
    if (!prepared.ok) return prepared;

    const zeroOid = '0'.repeat(detected.value.headSha.length);
    const updated = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-index', '-z', '--index-info'],
      { input: buildIndexInfo(prepared.value.files, prepared.value.deletedPaths, zeroOid), extraEnv: isolatedEnv },
    );
    if (!isSuccessfulGitCommand(updated)) {
      return err(appError('INTERNAL_ERROR', 'Failed to prepare isolated Git diff index'));
    }
    const tree = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['write-tree'],
      { extraEnv: isolatedEnv },
    );
    if (!isSuccessfulGitCommand(tree)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create isolated Git diff tree'));
    }
    const treeOid = decode(tree.value.stdout).trim();
    const result = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      [
        'diff-tree',
        '-p',
        '--no-commit-id',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--no-color',
        '--ignore-submodules=all',
        detected.value.headSha,
        treeOid,
        '--',
        ...selectedEntries.map((entry) => entry.path),
      ],
      {
        maxOutputBytes: GIT_SAFETY_LIMITS.maxDiffBytes + 64 * 1024,
        extraEnv: isolatedEnv,
      },
    );
    if (!result.ok) return err(appError('INTERNAL_ERROR', 'Git diff failed safely'));
    if (result.value.status !== 0 && !result.value.overflowed) {
      return err(appError('INTERNAL_ERROR', 'Git diff failed safely'));
    }
    const patchBuffer = result.value.stdout;
    const truncated = result.value.overflowed || patchBuffer.byteLength > maxBytes;
    const bounded = truncated ? patchBuffer.subarray(0, maxBytes) : patchBuffer;
    return ok({
      patch: bounded.toString('utf8'),
      bytes: bounded.byteLength,
      truncated,
      omittedSensitivePaths,
    });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Git diff failed safely'));
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function createCheckpoint(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  allowSensitive = false,
  commandRunner: GitCommandRunner,
): Result<GitCheckpointResult, AppError> {
  const before = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!before.ok) return before;
  if (before.value.statusId !== expectedStatusId) {
    return err(appError('GIT_STATUS_STALE', 'Workspace Git status changed before checkpoint'));
  }
  if (before.value.truncated) {
    return err(appError('RESOURCE_TOO_LARGE', 'Git checkpoint path count exceeds the trusted limit'));
  }
  if (before.value.state !== 'normal') {
    return err(appError('GIT_STATE_UNSAFE', 'Git checkpoint is unavailable during an in-progress repository operation'));
  }
  if (!allowSensitive && before.value.entries.some((entry) => entry.sensitive)) {
    return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git changes require approval'));
  }
  if (before.value.entries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint does not support submodule/gitlink changes'));
  }
  if (before.value.entries.length === 0) {
    return ok({ created: false, reason: 'NO_CHANGES' });
  }
  if (hasConcurrentGitLock(workspaceCanonicalRoot)) {
    return err(appError('GIT_OPERATION_CONFLICT', 'Another Git operation is in progress'));
  }

  const indexBefore = readUserIndexFingerprint(workspaceCanonicalRoot);
  if (!indexBefore.ok) return indexBefore;
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  const tempIndex = path.join(runtime.value.root, 'checkpoint.index');
  const isolatedIndexEnv = { GIT_INDEX_FILE: tempIndex };

  try {
    const seeded = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['read-tree', before.value.headSha],
      { extraEnv: isolatedIndexEnv },
    );
    if (!isSuccessfulGitCommand(seeded)) {
      return err(appError('INTERNAL_ERROR', 'Failed to initialize isolated Git checkpoint index'));
    }

    const headModes = readHeadModes(
      workspaceCanonicalRoot,
      runtime.value,
      before.value.headSha,
      before.value.entries.map((entry) => entry.path),
    );
    if (!headModes.ok) return headModes;

    const prepared = prepareCheckpointEntries(
      workspaceCanonicalRoot,
      runtime.value,
      before.value.entries,
      headModes.value,
      undefined,
      allowSensitive,
    );
    if (!prepared.ok) return prepared;

    const zeroOid = '0'.repeat(before.value.headSha.length);
    const indexInfo = buildIndexInfo(prepared.value.files, prepared.value.deletedPaths, zeroOid);
    const updated = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-index', '-z', '--index-info'],
      { input: indexInfo, extraEnv: isolatedIndexEnv },
    );
    if (!isSuccessfulGitCommand(updated)) {
      return err(appError('INTERNAL_ERROR', 'Failed to prepare isolated Git checkpoint index'));
    }

    const tree = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['write-tree'],
      { extraEnv: isolatedIndexEnv },
    );
    if (!isSuccessfulGitCommand(tree)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create Git checkpoint tree'));
    }
    const treeOid = decode(tree.value.stdout).trim();

    const preCommit = revalidateCheckpointState(
      workspaceCanonicalRoot,
      before.value,
      indexBefore.value,
      prepared.value.files,
      prepared.value.deletedPaths,
      allowSensitive,
      commandRunner,
    );
    if (!preCommit.ok) return preCommit;

    const commit = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['commit-tree', treeOid, '-p', before.value.headSha, '--no-gpg-sign', '-m', CHECKPOINT_MESSAGE],
      {
        extraEnv: {
          ...isolatedIndexEnv,
          GIT_AUTHOR_NAME: CHECKPOINT_AUTHOR_NAME,
          GIT_AUTHOR_EMAIL: CHECKPOINT_AUTHOR_EMAIL,
          GIT_COMMITTER_NAME: CHECKPOINT_AUTHOR_NAME,
          GIT_COMMITTER_EMAIL: CHECKPOINT_AUTHOR_EMAIL,
        },
      },
    );
    if (!isSuccessfulGitCommand(commit)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create Git checkpoint commit'));
    }
    const commitSha = decode(commit.value.stdout).trim();

    const preRef = revalidateCheckpointState(
      workspaceCanonicalRoot,
      before.value,
      indexBefore.value,
      prepared.value.files,
      prepared.value.deletedPaths,
      allowSensitive,
      commandRunner,
    );
    if (!preRef.ok) return preRef;
    if (hasConcurrentGitLock(workspaceCanonicalRoot)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Another Git operation is in progress'));
    }

    const checkpointRef = `refs/sud-d/checkpoints/${randomUUID()}`;
    const created = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-ref', checkpointRef, commitSha, zeroOid],
    );
    if (!isSuccessfulGitCommand(created)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git checkpoint reference could not be created safely'));
    }

    return ok({
      created: true,
      checkpointRef,
      commitSha,
      parentHead: before.value.headSha,
      capturedPathCount: before.value.entries.length,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function runDiffCheck(
  workspaceCanonicalRoot: string,
  commandRunner: GitCommandRunner,
): Result<GitVerificationResult, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Active Workspace is not a supported Git repository'));
  }
  const metadata = resolveGitMetadataLayout(workspaceCanonicalRoot);
  if (!metadata.ok) return metadata;
  const status = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!status.ok) return status;
  if (status.value.truncated) {
    return err(appError('RESOURCE_TOO_LARGE', 'Git diff check path count exceeds the trusted limit'));
  }
  if (status.value.state !== 'normal') {
    return err(appError('GIT_STATE_UNSAFE', 'Git diff check requires a normal repository state'));
  }
  if (status.value.entries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git diff check does not support submodule/gitlink changes'));
  }
  if (status.value.entries.length === 0) {
    return ok({ passed: true, findingCount: 0, output: 'git diff --check passed' });
  }
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  const tempIndex = path.join(runtime.value.root, 'diff-check.index');
  const tempObjects = path.join(runtime.value.root, 'objects');
  try {
    fs.mkdirSync(tempObjects, { recursive: true });
    const isolatedEnv = {
      GIT_INDEX_FILE: tempIndex,
      GIT_OBJECT_DIRECTORY: tempObjects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(metadata.value.commonGitDir, 'objects'),
    };
    const seeded = runGit(workspaceCanonicalRoot, runtime.value, ['read-tree', detected.value.headSha], { extraEnv: isolatedEnv });
    if (!isSuccessfulGitCommand(seeded)) {
      return err(appError('INTERNAL_ERROR', 'Failed to initialize isolated Git diff-check index'));
    }
    const headModes = readHeadModes(workspaceCanonicalRoot, runtime.value, detected.value.headSha, status.value.entries.map((entry) => entry.path));
    if (!headModes.ok) return headModes;
    const prepared = prepareCheckpointEntries(
      workspaceCanonicalRoot,
      runtime.value,
      status.value.entries,
      headModes.value,
      isolatedEnv,
      false,
      true,
    );
    if (!prepared.ok) return prepared;
    const zeroOid = '0'.repeat(detected.value.headSha.length);
    const updated = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-index', '-z', '--index-info'],
      { input: buildIndexInfo(prepared.value.files, prepared.value.deletedPaths, zeroOid), extraEnv: isolatedEnv },
    );
    if (!isSuccessfulGitCommand(updated)) {
      return err(appError('INTERNAL_ERROR', 'Failed to prepare isolated Git diff-check index'));
    }
    const tree = runGit(workspaceCanonicalRoot, runtime.value, ['write-tree'], { extraEnv: isolatedEnv });
    if (!isSuccessfulGitCommand(tree)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create isolated Git diff-check tree'));
    }
    const treeOid = decode(tree.value.stdout).trim();
    const result = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      [
        'diff-tree',
        '--check',
        '--no-commit-id',
        '--no-ext-diff',
        '--no-textconv',
        '--no-renames',
        '--no-color',
        '--ignore-submodules=all',
        detected.value.headSha,
        treeOid,
      ],
      { maxOutputBytes: GIT_SAFETY_LIMITS.maxDiffBytes, extraEnv: isolatedEnv },
    );
    if (!result.ok || result.value.overflowed) {
      return err(appError('RESOURCE_TOO_LARGE', 'Git diff check output exceeded the trusted limit'));
    }
    const passed = result.value.status === 0;
    const findingCount = passed
      ? 0
      : Math.max(1, decode(result.value.stdout).split(/\r?\n/).filter((line) => /:\d+:/.test(line)).length);
    return ok({
      passed,
      findingCount,
      output: passed ? 'git diff --check passed' : 'git diff --check found whitespace errors',
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

const SECRET_SIGNATURE_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
] as const);

function secretBearingLines(text: string): readonly string[] {
  return text.split(/\r?\n/).filter((line) =>
    SECRET_SIGNATURE_PATTERNS.some((pattern) => pattern.test(line)));
}

function introducesSecretSignature(currentText: string, previousText: string): boolean {
  const previousCounts = new Map<string, number>();
  for (const line of secretBearingLines(previousText)) {
    previousCounts.set(line, (previousCounts.get(line) ?? 0) + 1);
  }
  for (const line of secretBearingLines(currentText)) {
    const previousCount = previousCounts.get(line) ?? 0;
    if (previousCount === 0) return true;
    previousCounts.set(line, previousCount - 1);
  }
  return false;
}

function runSecretScan(
  workspaceCanonicalRoot: string,
  commandRunner: GitCommandRunner,
): Result<GitVerificationResult, AppError> {
  const status = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!status.ok) return status;
  if (status.value.truncated) {
    return err(appError('RESOURCE_TOO_LARGE', 'Secret scan changed-path count exceeds the trusted limit'));
  }
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  const suspectPaths = new Set<string>();
  let aggregateBytes = 0;
  try {
    for (const entry of status.value.entries) {
      if (entry.sensitive) {
        suspectPaths.add(entry.path);
        continue;
      }
      if (entry.kind === 'deleted') continue;
      const resolved = resolveExistingResource({
        workspaceCanonicalRoot,
        relativePath: entry.path,
        internalRoots: [],
      });
      if (!resolved.ok) return resolved;
      const stat = fs.lstatSync(resolved.value.canonical);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Secret scan supports regular changed files only'));
      }
      if (stat.size > GIT_SAFETY_LIMITS.maxCheckpointFileBytes) {
        return err(appError('RESOURCE_TOO_LARGE', 'Secret scan file exceeds the trusted size limit'));
      }
      aggregateBytes += stat.size;
      if (aggregateBytes > GIT_SAFETY_LIMITS.maxCheckpointAggregateBytes) {
        return err(appError('RESOURCE_TOO_LARGE', 'Secret scan aggregate size exceeds the trusted limit'));
      }
      const currentText = fs.readFileSync(resolved.value.canonical).toString('utf8');
      let previousText = '';
      if (!entry.untracked && entry.kind !== 'added') {
        const previous = runGit(
          workspaceCanonicalRoot,
          runtime.value,
          ['cat-file', 'blob', `${status.value.headSha}:${entry.path}`],
          { maxOutputBytes: GIT_SAFETY_LIMITS.maxCheckpointFileBytes },
        );
        if (!previous.ok || previous.value.overflowed) {
          return err(appError('RESOURCE_TOO_LARGE', 'Secret scan prior file exceeds the trusted limit'));
        }
        if (previous.value.status !== 0) {
          return err(appError('INTERNAL_ERROR', 'Secret scan could not inspect prior Workspace content'));
        }
        previousText = previous.value.stdout.toString('utf8');
      }
      if (introducesSecretSignature(currentText, previousText)) suspectPaths.add(entry.path);
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Secret scan could not inspect a changed Workspace file'));
  } finally {
    cleanupGitRuntime(runtime.value);
  }
  const findingCount = suspectPaths.size;
  return ok({
    passed: findingCount === 0,
    findingCount,
    output: findingCount === 0
      ? 'secret signature scan passed'
      : `secret signature scan found ${findingCount} suspect file${findingCount === 1 ? '' : 's'}`,
  });
}

function createBranchCommit(
  workspaceCanonicalRoot: string,
  expectedStatusId: string,
  message: string,
  allowSensitive = false,
  commandRunner: GitCommandRunner,
): Result<GitCommitResult, AppError> {
  if (!message || message.length > 160 || /[\r\n\0]/.test(message)) {
    return err(appError('VALIDATION_FAILED', 'Git commit message is invalid'));
  }
  const detected = detectRepository(workspaceCanonicalRoot, commandRunner);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha || !detected.value.branch || detected.value.detached) {
    return err(appError('GIT_STATE_UNSAFE', 'Git commit requires a supported local branch'));
  }
  const before = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!before.ok) return before;
  if (before.value.statusId !== expectedStatusId) {
    return err(appError('GIT_STATUS_STALE', 'Workspace Git status changed before commit'));
  }
  if (before.value.truncated) {
    return err(appError('RESOURCE_TOO_LARGE', 'Git commit path count exceeds the trusted limit'));
  }
  if (before.value.state !== 'normal' || before.value.entries.some((entry) => entry.staged)) {
    return err(appError('GIT_STATE_UNSAFE', 'Git commit requires a normal repository with a clean staging area'));
  }
  if (!allowSensitive && before.value.entries.some((entry) => entry.sensitive)) {
    return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git changes require approval'));
  }
  if (before.value.entries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git commit does not support submodule/gitlink changes'));
  }
  if (before.value.entries.length === 0) {
    return err(appError('GIT_STATE_UNSAFE', 'Git commit requires Workspace changes'));
  }
  if (hasConcurrentGitLock(workspaceCanonicalRoot)) {
    return err(appError('GIT_OPERATION_CONFLICT', 'Another Git operation is in progress'));
  }

  const indexBefore = readUserIndexFingerprint(workspaceCanonicalRoot);
  if (!indexBefore.ok) return indexBefore;
  const runtime = makeGitRuntime(commandRunner);
  if (!runtime.ok) return runtime;
  const tempIndex = path.join(runtime.value.root, 'commit.index');
  const isolatedIndexEnv = { GIT_INDEX_FILE: tempIndex };
  try {
    const branchRef = runGit(workspaceCanonicalRoot, runtime.value, ['symbolic-ref', '--quiet', 'HEAD']);
    if (!isSuccessfulGitCommand(branchRef)) {
      return err(appError('GIT_STATE_UNSAFE', 'Git commit requires a local branch'));
    }
    const trustedBranchRef = decode(branchRef.value.stdout).trim();
    if (!trustedBranchRef.startsWith('refs/heads/') || trustedBranchRef.length <= 'refs/heads/'.length) {
      return err(appError('GIT_STATE_UNSAFE', 'Git branch reference is unsupported'));
    }

    const seeded = runGit(workspaceCanonicalRoot, runtime.value, ['read-tree', before.value.headSha], { extraEnv: isolatedIndexEnv });
    if (!isSuccessfulGitCommand(seeded)) {
      return err(appError('INTERNAL_ERROR', 'Failed to initialize isolated Git commit index'));
    }
    const headModes = readHeadModes(
      workspaceCanonicalRoot,
      runtime.value,
      before.value.headSha,
      before.value.entries.map((entry) => entry.path),
    );
    if (!headModes.ok) return headModes;
    const prepared = prepareCheckpointEntries(
      workspaceCanonicalRoot,
      runtime.value,
      before.value.entries,
      headModes.value,
      undefined,
      allowSensitive,
    );
    if (!prepared.ok) return prepared;
    const zeroOid = '0'.repeat(before.value.headSha.length);
    const updated = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-index', '-z', '--index-info'],
      { input: buildIndexInfo(prepared.value.files, prepared.value.deletedPaths, zeroOid), extraEnv: isolatedIndexEnv },
    );
    if (!isSuccessfulGitCommand(updated)) {
      return err(appError('INTERNAL_ERROR', 'Failed to prepare isolated Git commit index'));
    }
    const tree = runGit(workspaceCanonicalRoot, runtime.value, ['write-tree'], { extraEnv: isolatedIndexEnv });
    if (!isSuccessfulGitCommand(tree)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create Git commit tree'));
    }
    const treeOid = decode(tree.value.stdout).trim();

    const preCommit = revalidateCheckpointState(
      workspaceCanonicalRoot,
      before.value,
      indexBefore.value,
      prepared.value.files,
      prepared.value.deletedPaths,
      allowSensitive,
      commandRunner,
    );
    if (!preCommit.ok) return preCommit;
    if (hasConcurrentGitLock(workspaceCanonicalRoot)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Another Git operation is in progress'));
    }

    const commit = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['commit-tree', treeOid, '-p', before.value.headSha, '--no-gpg-sign', '-m', message],
      {
        extraEnv: {
          ...isolatedIndexEnv,
          GIT_AUTHOR_NAME: COMMIT_AUTHOR_NAME,
          GIT_AUTHOR_EMAIL: COMMIT_AUTHOR_EMAIL,
          GIT_COMMITTER_NAME: COMMIT_AUTHOR_NAME,
          GIT_COMMITTER_EMAIL: COMMIT_AUTHOR_EMAIL,
        },
      },
    );
    if (!isSuccessfulGitCommand(commit)) {
      return err(appError('INTERNAL_ERROR', 'Failed to create Git commit object'));
    }
    const commitSha = decode(commit.value.stdout).trim();

    const preRef = revalidateCheckpointState(
      workspaceCanonicalRoot,
      before.value,
      indexBefore.value,
      prepared.value.files,
      prepared.value.deletedPaths,
      allowSensitive,
      commandRunner,
    );
    if (!preRef.ok) return preRef;
    if (hasConcurrentGitLock(workspaceCanonicalRoot)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Another Git operation is in progress'));
    }
    const moved = runGit(
      workspaceCanonicalRoot,
      runtime.value,
      ['update-ref', trustedBranchRef, commitSha, before.value.headSha],
    );
    if (!isSuccessfulGitCommand(moved)) {
      return err(appError('GIT_OPERATION_CONFLICT', 'Git branch changed before commit could be published'));
    }

    const refreshedIndex = runGit(workspaceCanonicalRoot, runtime.value, ['reset', '--mixed', '--no-refresh', commitSha]);
    if (!isSuccessfulGitCommand(refreshedIndex)) {
      runGit(workspaceCanonicalRoot, runtime.value, ['update-ref', trustedBranchRef, before.value.headSha, commitSha]);
      return err(appError('INTERNAL_ERROR', 'Git commit could not refresh the clean staging area'));
    }
    const publishedHead = runGit(workspaceCanonicalRoot, runtime.value, ['rev-parse', '--verify', 'HEAD']);
    const publishedTree = runGit(workspaceCanonicalRoot, runtime.value, ['write-tree']);
    const filesStableAfter = verifyCheckpointFileSnapshots(
      workspaceCanonicalRoot,
      prepared.value.files,
      prepared.value.deletedPaths,
    );
    if (
      !isSuccessfulGitCommand(publishedHead)
      || decode(publishedHead.value.stdout).trim() !== commitSha
      || !isSuccessfulGitCommand(publishedTree)
      || decode(publishedTree.value.stdout).trim() !== treeOid
      || !filesStableAfter.ok
    ) {
      runGit(workspaceCanonicalRoot, runtime.value, ['update-ref', trustedBranchRef, before.value.headSha, commitSha]);
      runGit(workspaceCanonicalRoot, runtime.value, ['reset', '--mixed', '--no-refresh', before.value.headSha]);
      return err(appError('INTERNAL_ERROR', 'Git commit final state was inconsistent'));
    }
    return ok({
      commitSha,
      parentHead: before.value.headSha,
      branch: detected.value.branch,
      committedPathCount: before.value.entries.length,
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function prepareCheckpointEntries(
  workspaceCanonicalRoot: string,
  runtime: GitRuntime,
  entries: readonly GitStatusEntry[],
  headModes: ReadonlyMap<string, string>,
  extraGitEnv: Readonly<Record<string, string>> = {},
  allowSensitive = false,
  normalizeTextLineEndings = false,
): Result<{ readonly files: readonly CheckpointFileSnapshot[]; readonly deletedPaths: readonly string[] }, AppError> {
  const pending: Array<Omit<CheckpointFileSnapshot, 'blobOid'> & { readonly tempPath: string }> = [];
  const deletedPaths: string[] = [];
  let aggregateBytes = 0;

  for (const entry of entries) {
    if (!allowSensitive && entry.sensitive) {
      return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git changes require approval'));
    }
    if (entry.kind === 'conflict') {
      return err(appError('GIT_STATE_UNSAFE', 'Unresolved Git conflict blocks checkpoint'));
    }
    if (entry.kind === 'type_changed') {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint does not support type-changed resources'));
    }

    const headMode = headModes.get(entry.path);
    if (entry.kind === 'deleted') {
      if (headMode !== undefined && !isRegularGitMode(headMode)) {
        return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint does not support special tracked resources'));
      }
      deletedPaths.push(entry.path);
      continue;
    }
    if (headMode !== undefined && !isRegularGitMode(headMode)) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint does not support symlink or submodule content'));
    }

    const resolved = resolveExistingResource({
      workspaceCanonicalRoot,
      relativePath: entry.path,
      internalRoots: [],
    });
    if (!resolved.ok) return resolved;

    let stat: fs.Stats;
    let buffer: Buffer;
    try {
      stat = fs.lstatSync(resolved.value.canonical);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint supports regular files only'));
      }
      if (stat.size > GIT_SAFETY_LIMITS.maxCheckpointFileBytes) {
        return err(appError('RESOURCE_TOO_LARGE', 'Git checkpoint file exceeds the trusted size limit'));
      }
      aggregateBytes += stat.size;
      if (aggregateBytes > GIT_SAFETY_LIMITS.maxCheckpointAggregateBytes) {
        return err(appError('RESOURCE_TOO_LARGE', 'Git checkpoint aggregate size exceeds the trusted limit'));
      }
      buffer = fs.readFileSync(resolved.value.canonical);
    } catch {
      return err(appError('INTERNAL_ERROR', 'Failed to read Git checkpoint resource'));
    }
    if (buffer.byteLength !== stat.size) {
      return err(appError('GIT_STATUS_STALE', 'Workspace file changed while checkpoint was prepared'));
    }
    if (normalizeTextLineEndings && !buffer.includes(0)) {
      buffer = Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    }

    const tempPath = path.join(runtime.root, `blob-${pending.length}.snapshot`);
    try {
      fs.writeFileSync(tempPath, buffer, { flag: 'wx' });
    } catch {
      return err(appError('INTERNAL_ERROR', 'Failed to stage trusted Git checkpoint content'));
    }
    pending.push({
      path: entry.path,
      mode: headMode === '100755' ? '100755' : '100644',
      bytes: buffer.byteLength,
      digest: createHash('sha256').update(buffer).digest('hex'),
      tempPath,
    });
  }

  if (pending.length === 0) return ok({ files: [], deletedPaths });
  const hashInput = `${pending.map((file) => file.tempPath).join('\n')}\n`;
  const hashed = runGit(
    workspaceCanonicalRoot,
    runtime,
    ['hash-object', '-w', '--stdin-paths', '--no-filters'],
    { input: hashInput, maxOutputBytes: Math.max(64 * 1024, pending.length * 96), extraEnv: extraGitEnv },
  );
  if (!isSuccessfulGitCommand(hashed)) {
    return err(appError('INTERNAL_ERROR', 'Failed to store Git checkpoint objects'));
  }
  const objectIds = decode(hashed.value.stdout).trim().split(/\r?\n/).filter(Boolean);
  if (objectIds.length !== pending.length) {
    return err(appError('INTERNAL_ERROR', 'Git checkpoint object count was inconsistent'));
  }
  const files: CheckpointFileSnapshot[] = pending.map((file, index) => ({
    path: file.path,
    mode: file.mode,
    bytes: file.bytes,
    digest: file.digest,
    blobOid: objectIds[index]!,
  }));
  return ok({ files, deletedPaths });
}

function readHeadModes(
  workspaceCanonicalRoot: string,
  runtime: GitRuntime,
  headSha: string,
  paths: readonly string[],
): Result<Map<string, string>, AppError> {
  const modes = new Map<string, string>();
  for (const batch of batchGitPaths(paths)) {
    const result = runGit(
      workspaceCanonicalRoot,
      runtime,
      ['ls-tree', '-z', headSha, '--', ...batch],
      { maxOutputBytes: 512 * 1024 },
    );
    if (!isSuccessfulGitCommand(result)) {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect Git checkpoint tree modes'));
    }
    for (const record of decode(result.value.stdout).split('\0').filter(Boolean)) {
      const tab = record.indexOf('\t');
      if (tab < 0) return err(appError('INTERNAL_ERROR', 'Git tree output was malformed'));
      const metadata = record.slice(0, tab).split(' ');
      const relativePath = normalizeGitPath(record.slice(tab + 1));
      const mode = metadata[0];
      if (!mode) return err(appError('INTERNAL_ERROR', 'Git tree mode was unavailable'));
      modes.set(relativePath, mode);
    }
  }
  return ok(modes);
}

function batchGitPaths(paths: readonly string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const relativePath of paths) {
    const cost = relativePath.length + 3;
    if (current.length >= 50 || (current.length > 0 && chars + cost > 6000)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(relativePath);
    chars += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function buildIndexInfo(
  files: readonly CheckpointFileSnapshot[],
  deletedPaths: readonly string[],
  zeroOid: string,
): Buffer {
  const chunks: Buffer[] = [];
  for (const relativePath of deletedPaths) {
    chunks.push(Buffer.from(`0 ${zeroOid}\t${relativePath}\0`, 'utf8'));
  }
  for (const file of files) {
    chunks.push(Buffer.from(`${file.mode} ${file.blobOid}\t${file.path}\0`, 'utf8'));
  }
  return Buffer.concat(chunks);
}

function revalidateCheckpointState(
  workspaceCanonicalRoot: string,
  expected: GitStatusResult,
  expectedIndexFingerprint: string,
  files: readonly CheckpointFileSnapshot[],
  deletedPaths: readonly string[],
  allowSensitive: boolean,
  commandRunner: GitCommandRunner,
): Result<void, AppError> {
  const current = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries, commandRunner);
  if (!current.ok) return current;
  if (
    current.value.statusId !== expected.statusId
    || current.value.headSha !== expected.headSha
    || current.value.truncated
  ) {
    return err(appError('GIT_STATUS_STALE', 'Workspace Git status changed during checkpoint'));
  }
  if (current.value.state !== 'normal') {
    return err(appError('GIT_STATE_UNSAFE', 'Git repository state changed during checkpoint'));
  }
  if (!allowSensitive && current.value.entries.some((entry) => entry.sensitive)) {
    return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git changes require approval'));
  }
  if (current.value.entries.some((entry) => entry.gitlink)) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Git checkpoint does not support submodule/gitlink changes'));
  }
  const currentIndex = readUserIndexFingerprint(workspaceCanonicalRoot);
  if (!currentIndex.ok) return currentIndex;
  if (currentIndex.value !== expectedIndexFingerprint) {
    return err(appError('GIT_STATUS_STALE', 'Git index changed during checkpoint'));
  }
  const filesStable = verifyCheckpointFileSnapshots(workspaceCanonicalRoot, files, deletedPaths);
  if (!filesStable.ok) return filesStable;
  return ok(undefined);
}

function verifyCheckpointFileSnapshots(
  workspaceCanonicalRoot: string,
  files: readonly CheckpointFileSnapshot[],
  deletedPaths: readonly string[],
): Result<void, AppError> {
  for (const file of files) {
    const resolved = resolveExistingResource({
      workspaceCanonicalRoot,
      relativePath: file.path,
      internalRoots: [],
    });
    if (!resolved.ok) return err(appError('GIT_STATUS_STALE', 'Workspace resource changed during checkpoint'));
    try {
      const stat = fs.lstatSync(resolved.value.canonical);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size !== file.bytes) {
        return err(appError('GIT_STATUS_STALE', 'Workspace resource changed during checkpoint'));
      }
      const digest = createHash('sha256').update(fs.readFileSync(resolved.value.canonical)).digest('hex');
      if (digest !== file.digest) {
        return err(appError('GIT_STATUS_STALE', 'Workspace resource changed during checkpoint'));
      }
    } catch {
      return err(appError('GIT_STATUS_STALE', 'Workspace resource changed during checkpoint'));
    }
  }
  for (const relativePath of deletedPaths) {
    const absolute = path.join(workspaceCanonicalRoot, ...relativePath.split('/'));
    if (fs.existsSync(absolute)) {
      return err(appError('GIT_STATUS_STALE', 'Deleted Workspace resource changed during checkpoint'));
    }
  }
  return ok(undefined);
}

function readUserIndexFingerprint(workspaceCanonicalRoot: string): Result<string, AppError> {
  const metadata = resolveGitMetadataLayout(workspaceCanonicalRoot);
  if (!metadata.ok) return metadata;
  try {
    const indexPath = path.join(metadata.value.worktreeGitDir, 'index');
    const bytes = fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : Buffer.alloc(0);
    return ok(createHash('sha256').update(bytes).digest('hex'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect Git index safely'));
  }
}

function hasConcurrentGitLock(workspaceCanonicalRoot: string): boolean {
  const metadata = resolveGitMetadataLayout(workspaceCanonicalRoot);
  if (!metadata.ok) return true;
  return [
    path.join(metadata.value.worktreeGitDir, 'index.lock'),
    path.join(metadata.value.worktreeGitDir, 'HEAD.lock'),
    path.join(metadata.value.commonGitDir, 'packed-refs.lock'),
  ].some((candidate) => fs.existsSync(candidate));
}

function isRegularGitMode(mode: string): boolean {
  return mode === '100644' || mode === '100755';
}

function isSuccessfulGitCommand(
  result: Result<GitCommandResult, AppError>,
): result is { readonly ok: true; readonly value: GitCommandResult } {
  return result.ok && result.value.status === 0 && !result.value.overflowed;
}


function validateGitCallerPath(relativePath: string): Result<string, AppError> {
  const raw = relativePath.replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.startsWith('//') || raw.includes('\0') || raw.includes(':')) {
    return err(appError('INVALID_PATH', 'Git path must be Workspace-relative'));
  }
  const parts = raw.split('/');
  if (parts.some((part) => part === '..' || part === '' || part.toLowerCase() === '.git')) {
    return err(appError('INVALID_PATH', 'Git path is outside the approved Workspace path surface'));
  }
  return ok(parts.filter((part) => part !== '.').join('/'));
}

function pathWithinFilter(entryPath: string, requestedPath: string): boolean {
  const normalized = requestedPath.replace(/\\/g, '/').replace(/\/$/, '');
  return entryPath === normalized || entryPath.startsWith(`${normalized}/`);
}

function isExcludedWorkspacePath(relativePath: string): boolean {
  const parts = normalizeGitPath(relativePath).split('/');
  return parts.some((part) => part.toLowerCase() === '.git'
    || part.toLowerCase() === '.serena'
    || part.toLowerCase().startsWith('.sud-d-tmp-'));
}

function parsePorcelainV2(buffer: Buffer): Result<GitStatusEntry[], AppError> {
  const records = decode(buffer).split('\0').filter((record) => record.length > 0);
  const entries: GitStatusEntry[] = [];
  for (const record of records) {
    if (record.startsWith('# ')) continue;
    if (record.startsWith('? ')) {
      const filePath = record.slice(2);
      entries.push({ path: normalizeGitPath(filePath), kind: 'untracked', staged: false, unstaged: false, untracked: true, sensitive: classifySensitivity(filePath) === 'credential', gitlink: false });
      continue;
    }
    if (record.startsWith('1 ')) {
      const fields = record.split(' ');
      if (fields.length < 9) return err(appError('INTERNAL_ERROR', 'Git status output was malformed'));
      const xy = fields[1] ?? '..';
      const gitlink = fields.slice(3, 6).some((mode) => mode === '160000');
      const filePath = fields.slice(8).join(' ');
      entries.push(makeStatusEntry(filePath, xy, gitlink));
      continue;
    }
    if (record.startsWith('u ')) {
      const fields = record.split(' ');
      if (fields.length < 11) return err(appError('INTERNAL_ERROR', 'Git status output was malformed'));
      const filePath = fields.slice(10).join(' ');
      entries.push({ path: normalizeGitPath(filePath), kind: 'conflict', staged: true, unstaged: true, untracked: false, sensitive: classifySensitivity(filePath) === 'credential', gitlink: fields.slice(3, 7).some((mode) => mode === '160000') });
      continue;
    }
    if (record.startsWith('2 ')) {
      return err(appError('INTERNAL_ERROR', 'Unexpected Git rename record'));
    }
    return err(appError('INTERNAL_ERROR', 'Unexpected Git status record'));
  }
  return ok(entries);
}

function makeStatusEntry(filePath: string, xy: string, gitlink: boolean): GitStatusEntry {
  const x = xy[0] ?? '.';
  const y = xy[1] ?? '.';
  let kind: GitStatusEntry['kind'] = 'changed';
  if (x === 'D' || y === 'D') kind = 'deleted';
  else if (x === 'A') kind = 'added';
  else if (x === 'M' || y === 'M') kind = 'modified';
  else if (x === 'T' || y === 'T') kind = 'type_changed';
  const normalized = normalizeGitPath(filePath);
  return {
    path: normalized,
    kind,
    staged: x !== '.',
    unstaged: y !== '.',
    untracked: false,
    sensitive: classifySensitivity(normalized) === 'credential',
    gitlink,
  };
}

function buildStatusId(
  workspaceCanonicalRoot: string,
  headSha: string,
  branch: string | undefined,
  state: GitRepositoryState,
  entries: readonly GitStatusEntry[],
  totalEntries: number,
): Result<string, AppError> {
  const digest = createHash('sha256');
  digest.update(`head:${headSha}\nbranch:${branch ?? '(detached)'}\nstate:${state}\ntotal:${totalEntries}\n`);
  for (const entry of entries) {
    digest.update(`${entry.path}\0${entry.kind}\0${entry.staged ? 1 : 0}${entry.unstaged ? 1 : 0}${entry.untracked ? 1 : 0}${entry.gitlink ? 1 : 0}\0`);
    if (entry.kind === 'deleted') {
      digest.update('deleted\0');
      continue;
    }
    const absolute = path.join(workspaceCanonicalRoot, ...entry.path.split('/'));
    try {
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        digest.update(`type:${stat.mode}\0size:${stat.size}\0mtime:${stat.mtimeMs}\0`);
        continue;
      }
      if (entry.sensitive || stat.size > GIT_SAFETY_LIMITS.maxCheckpointFileBytes) {
        digest.update(`metadata:${stat.size}:${stat.mtimeMs}\0`);
        continue;
      }
      digest.update(fs.readFileSync(absolute));
    } catch {
      digest.update('missing\0');
    }
  }
  return ok(digest.digest('hex'));
}

function makeGitRuntime(commandRunner: GitCommandRunner): Result<GitRuntime, AppError> {
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-runtime-'));
    return ok({ root, commandRunner });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to initialize trusted Git runtime'));
  }
}

function cleanupGitRuntime(runtime: GitRuntime): void {
  try { fs.rmSync(runtime.root, { recursive: true, force: true }); } catch { /* best effort */ }
}

function runGit(
  workspaceCanonicalRoot: string,
  runtime: GitRuntime,
  commandArgs: readonly string[],
  options: { readonly input?: Buffer | string; readonly maxOutputBytes?: number; readonly extraEnv?: Readonly<Record<string, string>> } = {},
): Result<GitCommandResult, AppError> {
  return runtime.commandRunner.runLocal(workspaceCanonicalRoot, commandArgs, {
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.maxOutputBytes === undefined ? {} : { maxOutputBytes: options.maxOutputBytes }),
    ...(options.extraEnv === undefined ? {} : { trustedEnv: options.extraEnv }),
    timeoutMs: GIT_SAFETY_LIMITS.timeoutMs,
  });
}

function canonicalExisting(value: string): Result<string, AppError> {
  try {
    return ok(path.normalize(fs.realpathSync.native(value)));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to canonicalize Git repository path'));
  }
}

function samePath(left: string, right: string): boolean {
  return path.normalize(left).toLowerCase() === path.normalize(right).toLowerCase();
}

function looksLikeBareRepository(root: string): boolean {
  try {
    return fs.statSync(path.join(root, 'HEAD')).isFile()
      && fs.statSync(path.join(root, 'objects')).isDirectory()
      && fs.statSync(path.join(root, 'refs')).isDirectory();
  } catch {
    return false;
  }
}

function readRepositoryState(worktreeGitDir: string): GitRepositoryState {
  const exists = (relative: string) => fs.existsSync(path.join(worktreeGitDir, relative));
  if (exists('MERGE_HEAD')) return 'merge';
  if (exists('rebase-merge') || exists('rebase-apply')) return 'rebase';
  if (exists('CHERRY_PICK_HEAD')) return 'cherry_pick';
  if (exists('REVERT_HEAD')) return 'revert';
  if (exists('BISECT_LOG')) return 'bisect';
  return 'normal';
}

function decode(buffer: Buffer): string {
  return buffer.toString('utf8');
}

function normalizeGitPath(value: string): string {
  return value.replace(/\\/g, '/');
}
