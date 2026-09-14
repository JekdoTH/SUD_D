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

export interface GitCommandResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly status: number;
  readonly overflowed: boolean;
}

export interface GitCommandRunner {
  runLocal(cwd: string, args: readonly string[], options?: GitRunOptions): Result<GitCommandResult, AppError>;
  runGitHubNetwork(cwd: string, args: readonly string[], options?: GitRunOptions): Result<GitCommandResult, AppError>;
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

function createRuntime(): Result<GitRuntime, AppError> {
  try {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-runner-'));
    const hooks = path.join(root, 'hooks');
    const home = path.join(root, 'home');
    fs.mkdirSync(hooks, { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    const globalConfig = path.join(root, 'global.gitconfig');
    const systemConfig = path.join(root, 'system.gitconfig');
    fs.writeFileSync(globalConfig, '', 'utf8');
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
          ? ['-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always']
          : ['-c', 'credential.helper=']),
        '-c', 'core.fsmonitor=false',
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

  return Object.freeze({
    runLocal(cwd: string, args: readonly string[], runOptions?: GitRunOptions) {
      return execute('local', cwd, args, runOptions);
    },
    runGitHubNetwork(cwd: string, args: readonly string[], runOptions?: GitRunOptions) {
      return execute('github_network', cwd, args, runOptions);
    },
  });
}
