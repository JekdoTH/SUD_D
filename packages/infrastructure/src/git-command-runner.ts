import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { appError, err, ok, type AppError, type Result } from '@sud-d/domain';

export interface GitRunOptions {
  readonly input?: Buffer | string;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
  /** Infrastructure-owned Git environment only. Never accept renderer/request values here. */
  readonly trustedEnv?: Readonly<Record<string, string>>;
}

export interface GitNetworkExecutionOptions extends GitRunOptions {
  /** Trusted common Git directory for repository-backed GitHub network operations. */
  readonly repositoryCommonDir?: string;
}

export interface GitCommandResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly status: number;
  readonly overflowed: boolean;
}

export interface GitCommandRunner {
  runLocal(cwd: string, args: readonly string[], options?: GitRunOptions): Result<GitCommandResult, AppError>;
  runGitHubNetwork(
    cwd: string,
    args: readonly string[],
    options?: GitNetworkExecutionOptions,
  ): Result<GitCommandResult, AppError>;
}

type Spawn = typeof spawnSync;

export interface GitCommandRunnerOptions {
  readonly spawnSync?: Spawn;
  readonly resolveGitExecutable?: () => Result<string, AppError>;
  readonly hostEnv?: NodeJS.ProcessEnv;
}

interface GitRuntime {
  readonly root: string;
  readonly hooks: string;
  readonly home: string;
  readonly globalConfig: string;
  readonly systemConfig: string;
}

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;
const TRUSTED_LOCAL_ENV_KEYS = new Set([
  'GIT_INDEX_FILE',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
]);
const NETWORK_HOST_ENV_KEYS = [
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMDATA',
  'PATH',
  'SSH_AUTH_SOCK',
] as const;
const NETWORK_TRUSTED_ENV_KEYS = new Set([
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
]);

function createRuntime(): Result<GitRuntime, AppError> {
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-runner-'));
    const hooks = path.join(root, 'hooks');
    const home = path.join(root, 'home');
    fs.mkdirSync(hooks, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    const globalConfig = path.join(root, 'global.gitconfig');
    const systemConfig = path.join(root, 'system.gitconfig');
    fs.writeFileSync(globalConfig, process.platform === 'win32' ? '[core]\n\tautocrlf = true\n' : '', 'utf8');
    fs.writeFileSync(systemConfig, '', 'utf8');
    return ok({ root, hooks, home, globalConfig, systemConfig });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to initialize trusted Git runtime'));
  }
}

function cleanupRuntime(runtime: GitRuntime): void {
  try {
    fs.rmSync(runtime.root, { recursive: true, force: true });
  } catch { /* best effort */ }
}

function boundedTrustedLocalEnv(values: Readonly<Record<string, string>> | undefined): Record<string, string> {
  if (!values) return {};
  const bounded: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (TRUSTED_LOCAL_ENV_KEYS.has(key)) bounded[key] = value;
  }
  return bounded;
}

function boundedTrustedNetworkEnv(values: Readonly<Record<string, string>> | undefined): Record<string, string> {
  if (!values) return {};
  const bounded: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (NETWORK_TRUSTED_ENV_KEYS.has(key)) bounded[key] = value;
  }
  return bounded;
}

function pickNetworkHostEnv(hostEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const picked: NodeJS.ProcessEnv = {};
  for (const key of NETWORK_HOST_ENV_KEYS) {
    const value = hostEnv[key];
    if (typeof value === 'string' && value.length > 0) picked[key] = value;
  }
  picked.SystemRoot ??= 'C:\\Windows';
  picked.WINDIR ??= picked.SystemRoot;
  return picked;
}

function hasRepositoryMarker(start: string): boolean {
  let current = path.resolve(start);
  let parent = path.dirname(current);
  while (parent !== current) {
    if (fs.existsSync(path.join(current, '.git'))) return true;
    current = parent;
    parent = path.dirname(current);
  }
  return fs.existsSync(path.join(current, '.git'));
}

function createTrustedBareRepository(root: string): Result<string, AppError> {
  try {
    const gitDir = path.join(root, 'network.git');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'tags'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    fs.writeFileSync(gitDir + path.sep + 'config', '[core]\n\trepositoryformatversion = 0\n\tbare = true\n', 'utf8');
    return ok(gitDir);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to initialize trusted Git runtime'));
  }
}

function normalizeTrustedPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return path.resolve(value);
}

function trustedObjectDirectory(commonDir: string): string {
  return path.join(commonDir, 'objects');
}

function isValidObjectId(value: string): boolean {
  return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u.test(value);
}

function parseTrustedFetchRemoteName(args: readonly string[]): Result<string | undefined, AppError> {
  if (args[0] !== 'fetch') return ok(undefined);
  if (args.length !== 5 || args[1] !== '--no-tags' || args[2] !== '--prune') {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub network command is outside the trusted repository boundary'));
  }
  const match = /^\+refs\/heads\/\*:refs\/remotes\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/\*$/u.exec(args[4] ?? '');
  if (!match?.[1]) {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub network command is outside the trusted repository boundary'));
  }
  return ok(match[1]);
}

function parseTrustedPushSourceRef(args: readonly string[]): Result<string | undefined, AppError> {
  if (args[0] !== 'push') return ok(undefined);
  if (args.length !== 3) {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub network command is outside the trusted repository boundary'));
  }
  const match = /^(refs\/heads\/[^:]+):refs\/heads\/[^:]+$/u.exec(args[2] ?? '');
  if (!match?.[1] || args[2] !== `${match[1]}:${match[1]}`) {
    return err(appError('GIT_STATE_UNSAFE', 'GitHub network command is outside the trusted repository boundary'));
  }
  return ok(match[1]);
}

function isTrustedRepositoryLsRemote(args: readonly string[]): boolean {
  return args[0] === 'ls-remote';
}

function isUrlRewriteConfigKey(key: string): boolean {
  return key.startsWith('url.')
    && (key.endsWith('.insteadof') || key.endsWith('.pushinsteadof'));
}

function isUnsafeProtectedNetworkConfigKey(rawKey: string): boolean {
  const key = rawKey.trim().toLowerCase();
  if (!key) return false;
  return isUrlRewriteConfigKey(key) || key === 'http.curloptresolve';
}

function isUnsafeRepositoryNetworkConfigKey(rawKey: string): boolean {
  const key = rawKey.trim().toLowerCase();
  if (!key) return false;

  if (isUrlRewriteConfigKey(key)) return true;
  if (key === 'include.path' || key.startsWith('includeif.')) return true;
  if (key === 'core.sshcommand' || key === 'core.askpass' || key === 'core.gitproxy') return true;
  if (key.startsWith('credential.') || key.startsWith('http.') || key.startsWith('ssh.') || key.startsWith('protocol.')) {
    return true;
  }
  if (key.startsWith('remote.') && (key.endsWith('.proxy') || key.endsWith('.proxyauthmethod'))) return true;

  return false;
}

export function resolveTrustedGitExecutable(): Result<string, AppError> {
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

function toCommandResult(result: SpawnSyncReturns<Buffer>): Result<GitCommandResult, AppError> {
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ENOBUFS') {
      return ok({ stdout, stderr, status: result.status ?? 1, overflowed: true });
    }
    return err(appError('INTERNAL_ERROR', 'Trusted Git operation failed'));
  }
  return ok({ stdout, stderr, status: result.status ?? 1, overflowed: false });
}

export function createGitCommandRunner(options: GitCommandRunnerOptions = {}): GitCommandRunner {
  const spawn = options.spawnSync ?? spawnSync;
  const resolveExecutable = options.resolveGitExecutable ?? resolveTrustedGitExecutable;
  const hostEnv = options.hostEnv ?? process.env;

  function execute(
    mode: 'local' | 'github_network',
    cwd: string,
    commandArgs: readonly string[],
    runOptions: GitRunOptions = {},
  ): Result<GitCommandResult, AppError> {
    const executable = resolveExecutable();
    if (!executable.ok) return executable;
    const runtime = createRuntime();
    if (!runtime.ok) return runtime;

    try {
      const args = [
        '--no-pager',
        '--literal-pathspecs',
        '-c', `core.hooksPath=${runtime.value.hooks}`,
        '-c', 'protocol.allow=never',
        ...(mode === 'github_network'
          ? [
              '-c', 'protocol.https.allow=always',
              '-c', 'protocol.ssh.allow=always',
              '-c', 'fetch.recurseSubmodules=false',
              '-c', 'push.recurseSubmodules=no',
              '-c', 'submodule.recurse=false',
            ]
          : ['-c', 'credential.helper=']),
        '-c', 'core.fsmonitor=false',
        '-c', 'gc.auto=0',
        '-c', 'maintenance.auto=false',
        '-c', 'commit.gpgSign=false',
        '-c', 'tag.gpgSign=false',
        ...commandArgs,
      ];

      const env: NodeJS.ProcessEnv = mode === 'local'
        ? {
            SystemRoot: hostEnv.SystemRoot ?? 'C:\\Windows',
            WINDIR: hostEnv.WINDIR ?? hostEnv.SystemRoot ?? 'C:\\Windows',
            TEMP: runtime.value.root,
            TMP: runtime.value.root,
            HOME: runtime.value.home,
            XDG_CONFIG_HOME: runtime.value.home,
            PATH: '',
            GIT_CONFIG_GLOBAL: runtime.value.globalConfig,
            GIT_CONFIG_SYSTEM: runtime.value.systemConfig,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_OPTIONAL_LOCKS: '0',
            GIT_TERMINAL_PROMPT: '0',
            GIT_PAGER: 'cat',
            PAGER: 'cat',
            GIT_ASKPASS: '',
            SSH_ASKPASS: '',
            GCM_INTERACTIVE: 'Never',
            ...boundedTrustedLocalEnv(runOptions.trustedEnv),
          }
        : {
            ...pickNetworkHostEnv(hostEnv),
            GIT_OPTIONAL_LOCKS: '0',
            GIT_TERMINAL_PROMPT: '0',
            GIT_PAGER: 'cat',
            PAGER: 'cat',
            GCM_INTERACTIVE: 'Never',
            ...boundedTrustedNetworkEnv(runOptions.trustedEnv),
          };

      try {
        const result = spawn(executable.value, args, {
          cwd,
          shell: false,
          windowsHide: true,
          input: runOptions.input,
          encoding: null,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: runOptions.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxBuffer: runOptions.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
          env,
        }) as SpawnSyncReturns<Buffer>;
        return toCommandResult(result);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Trusted Git operation failed'));
      }
    } finally {
      cleanupRuntime(runtime.value);
    }
  }

  function validateEffectiveNetworkConfig(
    cwd: string,
    trustedGitDir?: string,
    trustedEnv?: Readonly<Record<string, string>>,
  ): Result<void, AppError> {
    const executable = resolveExecutable();
    if (!executable.ok) return executable;
    const env: NodeJS.ProcessEnv = {
      ...pickNetworkHostEnv(hostEnv),
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      GCM_INTERACTIVE: 'Never',
      ...boundedTrustedNetworkEnv(trustedEnv),
    };

    try {
      const result = spawn(executable.value, [
        ...(trustedGitDir ? ['--git-dir', trustedGitDir] : []),
        'config',
        'list',
        '--includes',
        '--show-scope',
        '--name-only',
      ], {
        cwd,
        shell: false,
        windowsHide: true,
        encoding: null,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3_000,
        maxBuffer: 256 * 1024,
        env,
      }) as SpawnSyncReturns<Buffer>;
      const listed = toCommandResult(result);
      if (!listed.ok || listed.value.overflowed || listed.value.status !== 0) {
        return err(appError('GIT_STATE_UNSAFE', 'Host Git configuration is unsafe for GitHub network access'));
      }
      const entries = listed.value.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean);
      for (const entry of entries) {
        const separator = entry.indexOf('\t');
        if (separator <= 0) {
          return err(appError('GIT_STATE_UNSAFE', 'Host Git configuration is unsafe for GitHub network access'));
        }
        const scope = entry.slice(0, separator).trim().toLowerCase();
        const key = entry.slice(separator + 1);
        if ((scope === 'local' || scope === 'worktree') && isUnsafeRepositoryNetworkConfigKey(key)) {
          return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
        }
        if ((scope === 'system' || scope === 'global' || scope === 'command') && isUnsafeProtectedNetworkConfigKey(key)) {
          return err(appError('GIT_STATE_UNSAFE', 'Host Git configuration is unsafe for GitHub network access'));
        }
        if (!['system', 'global', 'local', 'worktree', 'command'].includes(scope)) {
          return err(appError('GIT_STATE_UNSAFE', 'Host Git configuration is unsafe for GitHub network access'));
        }
      }
    } catch {
      return err(appError('GIT_STATE_UNSAFE', 'Host Git configuration is unsafe for GitHub network access'));
    }

    return ok(undefined);
  }

  function validateRepositoryNetworkConfig(cwd: string): Result<void, AppError> {
    if (!hasRepositoryMarker(cwd)) return ok(undefined);

    const worktreeConfig = execute('local', cwd, [
      'config',
      'get',
      '--local',
      '--no-includes',
      '--bool',
      'extensions.worktreeConfig',
    ], { maxOutputBytes: 256 * 1024, timeoutMs: 3_000 });
    if (!worktreeConfig.ok || worktreeConfig.value.overflowed) {
      return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
    }
    if (worktreeConfig.value.status !== 0 && worktreeConfig.value.status !== 1) {
      return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
    }
    const worktreeConfigValue = worktreeConfig.value.stdout.toString('utf8').trim();
    if (worktreeConfig.value.status === 0 && worktreeConfigValue !== 'true' && worktreeConfigValue !== 'false') {
      return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
    }
    const scopes: Array<'--local' | '--worktree'> = ['--local'];
    if (worktreeConfigValue === 'true') scopes.push('--worktree');

    for (const scope of scopes) {
      const listed = execute('local', cwd, [
        'config',
        'list',
        scope,
        '--no-includes',
        '--name-only',
        '-z',
      ], { maxOutputBytes: 256 * 1024, timeoutMs: 3_000 });
      if (!listed.ok || listed.value.overflowed || listed.value.status !== 0) {
        return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
      }
      const keys = listed.value.stdout.toString('utf8').split('\0').filter(Boolean);
      if (keys.some(isUnsafeRepositoryNetworkConfigKey)) {
        return err(appError('GIT_STATE_UNSAFE', 'Repository Git configuration is unsafe for network access'));
      }
    }

    return ok(undefined);
  }

  function resolveRepositoryCommonDir(cwd: string, requestedCommonDir?: string): Result<string | undefined, AppError> {
    if (requestedCommonDir) return ok(path.resolve(requestedCommonDir));
    if (!hasRepositoryMarker(cwd)) return ok(undefined);
    const commonDir = execute('local', cwd, ['rev-parse', '--git-common-dir'], {
      maxOutputBytes: 256 * 1024,
      timeoutMs: 3_000,
    });
    if (!commonDir.ok || commonDir.value.overflowed || commonDir.value.status !== 0) {
      return err(appError('GIT_STATE_UNSAFE', 'Git repository layout could not be resolved safely'));
    }
    const raw = commonDir.value.stdout.toString('utf8').trim();
    if (!raw || /[\r\n\0]/u.test(raw)) {
      return err(appError('GIT_STATE_UNSAFE', 'Git repository layout could not be resolved safely'));
    }
    const resolved = path.resolve(cwd, raw);
    try {
      const canonical = fs.realpathSync.native(resolved);
      const objectStat = fs.lstatSync(path.join(canonical, 'objects'));
      if (objectStat.isSymbolicLink() || !objectStat.isDirectory()) {
        return err(appError('GIT_STATE_UNSAFE', 'Git repository layout could not be resolved safely'));
      }
      return ok(canonical);
    } catch {
      return err(appError('GIT_STATE_UNSAFE', 'Git repository layout could not be resolved safely'));
    }
  }

  function listRefs(cwd: string, gitDir: string, prefix: string): Result<ReadonlyMap<string, string>, AppError> {
    const listed = execute('local', cwd, [
      '--git-dir',
      gitDir,
      'for-each-ref',
      '--format=%(objectname)%09%(refname)',
      prefix,
    ], { maxOutputBytes: 512 * 1024, timeoutMs: 5_000 });
    if (!listed.ok || listed.value.overflowed || listed.value.status !== 0) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub network refs could not be inspected safely'));
    }
    const refs = new Map<string, string>();
    for (const line of listed.value.stdout.toString('utf8').split(/\r?\n/u).filter(Boolean)) {
      const separator = line.indexOf('\t');
      if (separator <= 0) {
        return err(appError('GIT_STATE_UNSAFE', 'GitHub network refs could not be inspected safely'));
      }
      const objectId = line.slice(0, separator);
      const refName = line.slice(separator + 1);
      if (!isValidObjectId(objectId) || !refName.startsWith(prefix)) {
        return err(appError('GIT_STATE_UNSAFE', 'GitHub network refs could not be inspected safely'));
      }
      refs.set(refName, objectId);
    }
    return ok(refs);
  }

  function importFetchedRefs(
    cwd: string,
    commonDir: string,
    trustedGitDir: string,
    remoteName: string,
  ): Result<void, AppError> {
    const prefix = `refs/remotes/${remoteName}/`;
    const fetched = listRefs(cwd, trustedGitDir, prefix);
    if (!fetched.ok) return fetched;
    const current = listRefs(cwd, commonDir, prefix);
    if (!current.ok) return current;

    for (const [refName, objectId] of fetched.value) {
      if (refName === `${prefix}HEAD`) continue;
      const updated = execute('local', cwd, ['--git-dir', commonDir, 'update-ref', refName, objectId], {
        maxOutputBytes: 256 * 1024,
        timeoutMs: 5_000,
      });
      if (!updated.ok || updated.value.overflowed || updated.value.status !== 0) {
        return err(appError('GIT_STATE_UNSAFE', 'Fetched GitHub refs could not be recorded safely'));
      }
    }

    for (const refName of current.value.keys()) {
      if (refName === `${prefix}HEAD` || fetched.value.has(refName)) continue;
      const deleted = execute('local', cwd, ['--git-dir', commonDir, 'update-ref', '-d', refName], {
        maxOutputBytes: 256 * 1024,
        timeoutMs: 5_000,
      });
      if (!deleted.ok || deleted.value.overflowed || deleted.value.status !== 0) {
        return err(appError('GIT_STATE_UNSAFE', 'Stale GitHub refs could not be pruned safely'));
      }
    }
    return ok(undefined);
  }

  function prepareTrustedPushRef(
    cwd: string,
    commonDir: string,
    trustedGitDir: string,
    sourceRef: string,
  ): Result<void, AppError> {
    const parsed = execute('local', cwd, ['--git-dir', commonDir, 'rev-parse', '--verify', `${sourceRef}^{commit}`], {
      maxOutputBytes: 256 * 1024,
      timeoutMs: 5_000,
    });
    if (!parsed.ok || parsed.value.overflowed || parsed.value.status !== 0) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub Push source could not be verified safely'));
    }
    const objectId = parsed.value.stdout.toString('utf8').trim();
    if (!isValidObjectId(objectId)) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub Push source could not be verified safely'));
    }
    const prepared = execute('local', cwd, ['--git-dir', trustedGitDir, 'update-ref', sourceRef, objectId], {
      maxOutputBytes: 256 * 1024,
      timeoutMs: 5_000,
      trustedEnv: { GIT_ALTERNATE_OBJECT_DIRECTORIES: trustedObjectDirectory(commonDir) },
    });
    if (!prepared.ok || prepared.value.overflowed || prepared.value.status !== 0) {
      return err(appError('GIT_STATE_UNSAFE', 'GitHub Push source could not be staged safely'));
    }
    return ok(undefined);
  }

  return Object.freeze({
    runLocal(cwd: string, args: readonly string[], runOptions?: GitRunOptions) {
      return execute('local', cwd, args, runOptions);
    },
    runGitHubNetwork(cwd: string, args: readonly string[], runOptions?: GitNetworkExecutionOptions) {
      const repositoryConfigCheck = validateRepositoryNetworkConfig(cwd);
      if (!repositoryConfigCheck.ok) return repositoryConfigCheck;

      const commonDirResult = resolveRepositoryCommonDir(cwd, normalizeTrustedPath(runOptions?.repositoryCommonDir));
      if (!commonDirResult.ok) return commonDirResult;
      const commonDir = commonDirResult.value;
      if (!commonDir) {
        const effectiveConfigCheck = validateEffectiveNetworkConfig(cwd);
        if (!effectiveConfigCheck.ok) return effectiveConfigCheck;
        return execute('github_network', cwd, args, runOptions);
      }

      const fetchRemoteName = parseTrustedFetchRemoteName(args);
      if (!fetchRemoteName.ok) return fetchRemoteName;
      const pushSourceRef = parseTrustedPushSourceRef(args);
      if (!pushSourceRef.ok) return pushSourceRef;
      if (!fetchRemoteName.value && !pushSourceRef.value && !isTrustedRepositoryLsRemote(args)) {
        return err(appError('GIT_STATE_UNSAFE', 'GitHub network command is outside the trusted repository boundary'));
      }

      const runtime = createRuntime();
      if (!runtime.ok) return runtime;
      try {
        const trustedGitDir = createTrustedBareRepository(runtime.value.root);
        if (!trustedGitDir.ok) return trustedGitDir;
        if (pushSourceRef.value) {
          const prepared = prepareTrustedPushRef(cwd, commonDir, trustedGitDir.value, pushSourceRef.value);
          if (!prepared.ok) return prepared;
        }

        const trustedEnv: Record<string, string> = {
          ...runOptions?.trustedEnv,
          ...(fetchRemoteName.value ? { GIT_OBJECT_DIRECTORY: trustedObjectDirectory(commonDir) } : {}),
          ...(pushSourceRef.value ? { GIT_ALTERNATE_OBJECT_DIRECTORIES: trustedObjectDirectory(commonDir) } : {}),
        };
        const effectiveConfigCheck = validateEffectiveNetworkConfig(runtime.value.root, trustedGitDir.value, trustedEnv);
        if (!effectiveConfigCheck.ok) return effectiveConfigCheck;
        const networkResult = execute('github_network', runtime.value.root, ['--git-dir', trustedGitDir.value, ...args], {
          ...runOptions,
          trustedEnv,
        });
        if (fetchRemoteName.value && networkResult.ok && !networkResult.value.overflowed && networkResult.value.status === 0) {
          const imported = importFetchedRefs(cwd, commonDir, trustedGitDir.value, fetchRemoteName.value);
          if (!imported.ok) return imported;
        }
        return networkResult;
      } finally {
        cleanupRuntime(runtime.value);
      }
    },
  });
}
