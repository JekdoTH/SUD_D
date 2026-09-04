import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CodingEngineRuntimeFailure } from '@sud-d/domain';
import { SERENA_ENGINE_MANIFEST } from './serena-engine-manifest.js';
import type { SerenaRuntimePaths } from './serena-runtime-paths.js';

interface ChildProcessEventSource {
  once(event: 'error', listener: (error: Error) => void): void;
  once(event: 'close', listener: (code: number | null) => void): void;
}

export interface SerenaProvisionedEngine {
  readonly executablePath: string;
  readonly version: '1.7.0';
}

export interface SerenaEngineProvisioner {
  ensureInstalled(): Promise<SerenaProvisionedEngine>;
  repairInstalledEngine(): Promise<SerenaProvisionedEngine>;
}

export interface SerenaProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderrBytes: number;
}

export interface SerenaProcessRunOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export type SerenaProcessRunner = (
  command: string,
  args: readonly string[],
  options: SerenaProcessRunOptions,
) => Promise<SerenaProcessResult>;

export interface SerenaEngineProvisionerDependencies {
  readonly paths: SerenaRuntimePaths;
  readonly resolveUv?: () => string | undefined;
  readonly runProcess?: SerenaProcessRunner;
}

const OUTPUT_LIMIT_BYTES = 2 * 1024 * 1024;

export function buildManagedUvEnvironment(paths: SerenaRuntimePaths): Record<string, string> {
  return {
    UV_TOOL_DIR: paths.toolDir,
    UV_TOOL_BIN_DIR: paths.binDir,
    UV_PYTHON_INSTALL_DIR: paths.pythonDir,
    UV_CACHE_DIR: paths.cacheDir,
    UV_NO_MODIFY_PATH: '1',
  };
}

export function safeManagedRuntimeEnvironment(extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  const allow = [
    'ALLUSERSPROFILE',
    'APPDATA',
    'ComSpec',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'Path',
    'PATH',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'windir',
  ];
  const env: Record<string, string> = {};
  for (const key of allow) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  return { ...env, ...extra };
}

export function resolveUvExecutable(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  const result = spawnSync('where.exe', ['uv'], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return undefined;
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && /uv(?:\.exe)?$/i.test(line));
}

export function createSerenaEngineProvisioner(
  dependencies: SerenaEngineProvisionerDependencies,
): SerenaEngineProvisioner {
  const runProcess = dependencies.runProcess ?? runBoundedProcess;
  const resolveUv = dependencies.resolveUv ?? resolveUvExecutable;
  const paths = dependencies.paths;

  const validateManagedExecutable = async (executablePath: string): Promise<SerenaProvisionedEngine> => {
    const result = await runProcess(executablePath, ['--version'], {
      env: safeManagedRuntimeEnvironment(buildManagedUvEnvironment(paths)),
      timeoutMs: 30_000,
    });
    if (result.exitCode !== 0) throw new CodingEngineRuntimeFailure('CODING_ENGINE_VERSION_MISMATCH');
    if (!/^Serena\s+1\.7\.0\b/m.test(result.stdout.trim())) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_VERSION_MISMATCH');
    }
    return { executablePath, version: SERENA_ENGINE_MANIFEST.version };
  };

  const installPinnedEngine = async (): Promise<void> => {
    const uv = resolveUv();
    if (!uv) throw new CodingEngineRuntimeFailure('CODING_ENGINE_BOOTSTRAP_UNAVAILABLE');
    fs.mkdirSync(paths.engineRoot, { recursive: true });
    fs.mkdirSync(paths.toolDir, { recursive: true });
    fs.mkdirSync(paths.binDir, { recursive: true });
    fs.mkdirSync(paths.pythonDir, { recursive: true });
    fs.mkdirSync(paths.cacheDir, { recursive: true });
    const result = await runProcess(
      uv,
      ['tool', 'install', '--python', SERENA_ENGINE_MANIFEST.pythonVersion, `${SERENA_ENGINE_MANIFEST.packageName}==${SERENA_ENGINE_MANIFEST.version}`],
      {
        env: safeManagedRuntimeEnvironment(buildManagedUvEnvironment(paths)),
        timeoutMs: 180_000,
      },
    );
    if (result.exitCode !== 0) throw new CodingEngineRuntimeFailure('CODING_ENGINE_INSTALL_FAILED');
  };

  const ensureInstalled = async (): Promise<SerenaProvisionedEngine> => {
    const existing = resolveManagedSerenaExecutable(paths);
    if (existing) return validateManagedExecutable(existing);
    await installPinnedEngine();
    const installed = resolveManagedSerenaExecutable(paths);
    if (!installed) throw new CodingEngineRuntimeFailure('CODING_ENGINE_INSTALL_FAILED');
    return validateManagedExecutable(installed);
  };

  return {
    ensureInstalled,
    async repairInstalledEngine(): Promise<SerenaProvisionedEngine> {
      fs.rmSync(paths.engineRoot, { recursive: true, force: true });
      await installPinnedEngine();
      const installed = resolveManagedSerenaExecutable(paths);
      if (!installed) throw new CodingEngineRuntimeFailure('CODING_ENGINE_INSTALL_FAILED');
      return validateManagedExecutable(installed);
    },
  };
}

function resolveManagedSerenaExecutable(paths: SerenaRuntimePaths): string | undefined {
  for (const candidate of ['serena.exe', 'serena.cmd']) {
    const executablePath = path.join(paths.binDir, candidate);
    if (fs.existsSync(executablePath)) return executablePath;
  }
  return undefined;
}

async function runBoundedProcess(
  command: string,
  args: readonly string[],
  options: SerenaProcessRunOptions,
): Promise<SerenaProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const childEvents = child as unknown as ChildProcessEventSource;
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ exitCode: 1, stdout: '', stderrBytes: OUTPUT_LIMIT_BYTES });
    }, options.timeoutMs ?? 60_000);
    let stdout = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= OUTPUT_LIMIT_BYTES) stdout += chunk.toString('utf8');
      if (stdoutBytes + stderrBytes > OUTPUT_LIMIT_BYTES) child.kill();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stdoutBytes + stderrBytes > OUTPUT_LIMIT_BYTES) child.kill();
    });
    childEvents.once('error', reject);
    childEvents.once('close', (code) => {
      clearTimeout(timeout);
      resolve({ exitCode: code ?? 1, stdout, stderrBytes });
    });
  });
}
