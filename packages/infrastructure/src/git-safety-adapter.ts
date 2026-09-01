import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type Result,
} from '@sud-d/domain';
import { resolveExistingResource } from './path-adapter.js';

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

export interface GitSafetyAdapter {
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
}

interface GitRuntime {
  readonly root: string;
  readonly hooks: string;
  readonly globalConfig: string;
  readonly systemConfig: string;
  readonly home: string;
}

interface GitCommandResult {
  readonly stdout: Buffer;
  readonly status: number;
  readonly overflowed: boolean;
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

export function createGitSafetyAdapter(): GitSafetyAdapter {
  return Object.freeze({
    detect(workspaceCanonicalRoot: string) {
      return detectRepository(workspaceCanonicalRoot);
    },
    status(workspaceCanonicalRoot: string, limit?: number) {
      return readStatus(workspaceCanonicalRoot, limit);
    },
    diff(workspaceCanonicalRoot: string, options?: { readonly relativePath?: string; readonly maxBytes?: number }) {
      return readDiff(workspaceCanonicalRoot, options, false);
    },
    diffApprovedSensitive(workspaceCanonicalRoot: string, options: { readonly relativePath: string; readonly maxBytes?: number }) {
      return readDiff(workspaceCanonicalRoot, options, true);
    },
    checkpoint(workspaceCanonicalRoot: string, expectedStatusId: string) {
      return createCheckpoint(workspaceCanonicalRoot, expectedStatusId, false);
    },
    checkpointApprovedSensitive(workspaceCanonicalRoot: string, expectedStatusId: string) {
      return createCheckpoint(workspaceCanonicalRoot, expectedStatusId, true);
    },
  });
}

function detectRepository(workspaceCanonicalRoot: string): Result<GitDetectResult, AppError> {
  const gitMarker = path.join(workspaceCanonicalRoot, '.git');
  try {
    if (!fs.existsSync(gitMarker)) {
      if (looksLikeBareRepository(workspaceCanonicalRoot)) {
        return ok({ isRepository: true, isSupported: false, reason: 'BARE_REPOSITORY', state: 'normal' });
      }
      return ok({ isRepository: false, isSupported: false, reason: 'NOT_REPOSITORY', state: 'normal' });
    }
    const markerStat = fs.lstatSync(gitMarker);
    if (markerStat.isSymbolicLink() || !markerStat.isDirectory()) {
      return ok({ isRepository: true, isSupported: false, reason: 'EXTERNAL_GITDIR', state: 'normal' });
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect Git repository metadata'));
  }

  const runtime = makeGitRuntime();
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
      return ok({ isRepository: true, isSupported: false, reason: 'UNBORN_HEAD', state: readRepositoryState(workspaceCanonicalRoot) });
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
      state: readRepositoryState(workspaceCanonicalRoot),
    });
  } finally {
    cleanupGitRuntime(runtime.value);
  }
}

function readStatus(workspaceCanonicalRoot: string, requestedLimit: number = GIT_SAFETY_LIMITS.maxStatusEntries): Result<GitStatusResult, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Active Workspace is not a supported Git repository'));
  }

  const runtime = makeGitRuntime();
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
): Result<GitDiffResult, AppError> {
  const detected = detectRepository(workspaceCanonicalRoot);
  if (!detected.ok) return detected;
  if (!detected.value.isSupported || !detected.value.headSha) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Active Workspace is not a supported Git repository'));
  }

  const requestedPath = options.relativePath;
  if (requestedPath !== undefined) {
    const validated = validateGitCallerPath(requestedPath);
    if (!validated.ok) return validated;
    if (!allowSensitive && classifySensitivity(validated.value) === 'credential') {
      return err(appError('SENSITIVE_RESOURCE', 'Credential-like Git diff requires approval'));
    }
  }

  const status = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
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
  const runtime = makeGitRuntime();
  if (!runtime.ok) return runtime;
  const tempIndex = path.join(runtime.value.root, 'diff.index');
  const tempObjects = path.join(runtime.value.root, 'objects');
  try {
    fs.mkdirSync(tempObjects, { recursive: true });
    const isolatedEnv = {
      GIT_INDEX_FILE: tempIndex,
      GIT_OBJECT_DIRECTORY: tempObjects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(workspaceCanonicalRoot, '.git', 'objects'),
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
): Result<GitCheckpointResult, AppError> {
  const before = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
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
  const runtime = makeGitRuntime();
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

function prepareCheckpointEntries(
  workspaceCanonicalRoot: string,
  runtime: GitRuntime,
  entries: readonly GitStatusEntry[],
  headModes: ReadonlyMap<string, string>,
  extraGitEnv: Readonly<Record<string, string>> = {},
  allowSensitive = false,
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
  allowSensitive = false,
): Result<void, AppError> {
  const current = readStatus(workspaceCanonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
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
  try {
    const indexPath = path.join(workspaceCanonicalRoot, '.git', 'index');
    const bytes = fs.existsSync(indexPath) ? fs.readFileSync(indexPath) : Buffer.alloc(0);
    return ok(createHash('sha256').update(bytes).digest('hex'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect Git index safely'));
  }
}

function hasConcurrentGitLock(workspaceCanonicalRoot: string): boolean {
  const gitDir = path.join(workspaceCanonicalRoot, '.git');
  return ['index.lock', 'HEAD.lock', 'packed-refs.lock'].some((relativePath) =>
    fs.existsSync(path.join(gitDir, relativePath)));
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

function makeGitRuntime(): Result<GitRuntime, AppError> {
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-runtime-'));
    const hooks = path.join(root, 'hooks');
    const home = path.join(root, 'home');
    fs.mkdirSync(hooks, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    const globalConfig = path.join(root, 'global.gitconfig');
    const systemConfig = path.join(root, 'system.gitconfig');
    fs.writeFileSync(globalConfig, '', 'utf8');
    fs.writeFileSync(systemConfig, '', 'utf8');
    return ok({ root, hooks, globalConfig, systemConfig, home });
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
  const executable = resolveTrustedGitExecutable();
  if (!executable.ok) return executable;
  const args = [
    '--no-pager',
    '--literal-pathspecs',
    '-c', `core.hooksPath=${runtime.hooks}`,
    '-c', 'protocol.allow=never',
    '-c', 'core.fsmonitor=false',
    '-c', 'credential.helper=',
    '-c', 'commit.gpgSign=false',
    '-c', 'tag.gpgSign=false',
    ...commandArgs,
  ];
  const env: NodeJS.ProcessEnv = {
    SystemRoot: process.env.SystemRoot ?? 'C:\\Windows',
    WINDIR: process.env.WINDIR ?? process.env.SystemRoot ?? 'C:\\Windows',
    TEMP: runtime.root,
    TMP: runtime.root,
    HOME: runtime.home,
    XDG_CONFIG_HOME: runtime.home,
    PATH: '',
    GIT_CONFIG_GLOBAL: runtime.globalConfig,
    GIT_CONFIG_SYSTEM: runtime.systemConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GCM_INTERACTIVE: 'Never',
    ...options.extraEnv,
  };
  try {
    const result = spawnSync(executable.value, args, {
      cwd: workspaceCanonicalRoot,
      shell: false,
      windowsHide: true,
      input: options.input,
      encoding: null,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: GIT_SAFETY_LIMITS.timeoutMs,
      maxBuffer: options.maxOutputBytes ?? GIT_SAFETY_LIMITS.maxGitOutputBytes,
      env,
    });
    const stdout = result.stdout ?? Buffer.alloc(0);
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code === 'ENOBUFS') return ok({ stdout, status: result.status ?? 1, overflowed: true });
      return err(appError('INTERNAL_ERROR', 'Trusted Git operation failed'));
    }
    return ok({ stdout, status: result.status ?? 1, overflowed: false });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Trusted Git operation failed'));
  }
}

function resolveTrustedGitExecutable(): Result<string, AppError> {
  const candidates = [
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.statSync(candidate);
      if (!stat.isFile()) continue;
      const resolved = fs.realpathSync.native(candidate);
      if (path.basename(resolved).toLowerCase() !== 'git.exe') continue;
      return ok(resolved);
    } catch { /* try next trusted location */ }
  }
  return err(appError('INTERNAL_ERROR', 'Trusted Git executable is unavailable'));
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

function readRepositoryState(workspaceCanonicalRoot: string): GitRepositoryState {
  const gitDir = path.join(workspaceCanonicalRoot, '.git');
  const exists = (relative: string) => fs.existsSync(path.join(gitDir, relative));
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
