import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createGitSafetyAdapter, type GitSafetyAdapter } from './git-safety-adapter.js';

interface ChildProcessEventSource {
  once(event: 'error', listener: (error: Error) => void): void;
  once(event: 'close', listener: (code: number | null) => void): void;
}
import {
  RestrictedVerifyFailure,
  type RestrictedVerifyAction,
  type RestrictedVerifyRequest,
  type RestrictedVerifyResult,
  type RestrictedVerifyWorkspaceContext,
} from '@sud-d/domain';

const SAFE_ENVIRONMENT_KEYS = Object.freeze([
  'APPDATA',
  'LOCALAPPDATA',
  'USERPROFILE',
  'HOME',
  'SystemRoot',
  'WINDIR',
  'Path',
  'PATH',
  'PATHEXT',
  'TEMP',
  'TMP',
  'ComSpec',
] as const);

export interface RestrictedVerifyLaunchPlan {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly shell: false;
}

export interface ResolveRestrictedVerifyProfileOptions {
  readonly workspaceRoot: string;
  readonly action: RestrictedVerifyAction;
  readonly nodeExecutable: string;
  readonly hostEnvironment?: NodeJS.ProcessEnv;
}

export function resolveRestrictedVerifyProfile(
  options: ResolveRestrictedVerifyProfileOptions,
): RestrictedVerifyLaunchPlan {
  const environment = options.hostEnvironment ?? process.env;
  const manifestPath = path.join(options.workspaceRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    readonly packageManager?: unknown;
    readonly scripts?: Record<string, unknown>;
  };
  const script = manifest.scripts?.[options.action];
  if (typeof script !== 'string' || script.length === 0) {
    throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
  }
  const packageManager = typeof manifest.packageManager === 'string' ? manifest.packageManager : '';
  let cliPath: string;
  if (packageManager.startsWith('pnpm@')) {
    const appData = environment['APPDATA'];
    if (!appData) throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
    cliPath = path.join(appData, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
  } else if (packageManager.startsWith('npm@')) {
    cliPath = path.join(path.dirname(options.nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  } else {
    throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
  }
  if (!fs.existsSync(options.nodeExecutable) || !fs.existsSync(cliPath)) {
    throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
  }
  const safeEnvironment: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1' };
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    const value = environment[key];
    if (typeof value === 'string') safeEnvironment[key] = value;
  }
  return {
    executablePath: options.nodeExecutable,
    args: [cliPath, 'run', options.action],
    workingDirectory: options.workspaceRoot,
    environment: safeEnvironment,
    shell: false,
  };
}

export const RESTRICTED_VERIFY_LIMITS = Object.freeze({
  maxOutputBytes: 32 * 1024,
  timeoutMs: 300_000,
});

export interface RestrictedVerifyAdapterOptions {
  readonly nodeExecutable?: string;
  readonly hostEnvironment?: NodeJS.ProcessEnv;
  readonly limits?: RestrictedVerifyProcessLimits;
  readonly gitSafety?: GitSafetyAdapter;
}

export interface RestrictedVerifyAdapter {
  run(
    context: RestrictedVerifyWorkspaceContext,
    request: RestrictedVerifyRequest,
  ): Promise<RestrictedVerifyResult>;
}

export function createRestrictedVerifyAdapter(
  options: RestrictedVerifyAdapterOptions = {},
): RestrictedVerifyAdapter {
  const hostEnvironment = options.hostEnvironment ?? process.env;
  const limits = options.limits ?? RESTRICTED_VERIFY_LIMITS;
  const gitSafety = options.gitSafety ?? createGitSafetyAdapter();
  return Object.freeze({
    async run(context: RestrictedVerifyWorkspaceContext, request: RestrictedVerifyRequest): Promise<RestrictedVerifyResult> {
      if (request.action === 'diff_check' || request.action === 'secret_scan') {
        const startedAt = Date.now();
        const checked = request.action === 'diff_check'
          ? gitSafety.diffCheck(context.canonicalRoot)
          : gitSafety.secretScan(context.canonicalRoot);
        if (!checked.ok) throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
        return {
          action: request.action,
          passed: checked.value.passed,
          exitCode: checked.value.passed ? 0 : 1,
          output: checked.value.output,
          truncated: false,
          durationMs: Math.max(0, Date.now() - startedAt),
        };
      }
      const nodeExecutable = options.nodeExecutable ?? resolveRestrictedVerifyNodeExecutable(hostEnvironment);
      const plan = resolveRestrictedVerifyProfile({
        workspaceRoot: context.canonicalRoot,
        action: request.action,
        nodeExecutable,
        hostEnvironment,
      });
      const result = await runRestrictedVerifyProcess(plan, limits);
      return {
        action: request.action,
        passed: result.exitCode === 0,
        exitCode: result.exitCode,
        output: result.output,
        truncated: result.truncated,
        durationMs: result.durationMs,
      };
    },
  });
}

function resolveRestrictedVerifyNodeExecutable(environment: NodeJS.ProcessEnv): string {
  if (path.basename(process.execPath).toLowerCase() === 'node.exe' && fs.existsSync(process.execPath)) {
    return process.execPath;
  }
  const systemRoot = environment['SystemRoot'] ?? environment['WINDIR'] ?? 'C:\\Windows';
  try {
    const output = execFileSync(path.join(systemRoot, 'System32', 'where.exe'), ['node'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: environment,
    });
    const candidate = output.split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => path.basename(value).toLowerCase() === 'node.exe' && fs.existsSync(value));
    if (candidate) return candidate;
  } catch {
    // Fail closed below.
  }
  throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE');
}
export interface RestrictedVerifyProcessLimits {
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
}

const SECRET_OUTPUT_PATTERN = /(?:password|passwd|secret|token|api[_ -]?key|authorization|bearer|credential|private[_ -]?key)\s*[:=]?\s*[^\s]*/i;
const TOKEN_VALUE_PATTERN = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

export async function runRestrictedVerifyProcess(
  plan: RestrictedVerifyLaunchPlan,
  limits: RestrictedVerifyProcessLimits,
): Promise<{ readonly exitCode: number; readonly output: string; readonly truncated: boolean; readonly durationMs: number }> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(plan.executablePath, [...plan.args], {
        cwd: plan.workingDirectory,
        env: plan.environment,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      reject(new RestrictedVerifyFailure('VERIFY_PROCESS_START_FAILED'));
      return;
    }
    const chunks: Buffer[] = [];
    let capturedBytes = 0;
    let truncated = false;
    let sawSecret = false;
    let settled = false;

    const capture = (chunk: Buffer): void => {
      const text = chunk.toString('utf8');
      if (SECRET_OUTPUT_PATTERN.test(text) || TOKEN_VALUE_PATTERN.test(text)) sawSecret = true;
      TOKEN_VALUE_PATTERN.lastIndex = 0;
      const available = Math.max(0, limits.maxOutputBytes - capturedBytes);
      if (available > 0) {
        const bounded = chunk.subarray(0, available);
        chunks.push(bounded);
        capturedBytes += bounded.length;
      }
      if (chunk.length > available) truncated = true;
    };
    const childEvents = child as unknown as ChildProcessEventSource;
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);

    const finish = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const sanitized = sanitizeRestrictedVerifyOutput(Buffer.concat(chunks).toString('utf8'), sawSecret);
      const bounded = boundUtf8(sanitized, limits.maxOutputBytes);
      resolve({
        exitCode,
        output: bounded.text,
        truncated: truncated || bounded.truncated,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    };

    childEvents.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new RestrictedVerifyFailure('VERIFY_PROCESS_START_FAILED'));
    });
    childEvents.once('close', (code) => finish(code ?? 1));
    const timer = setTimeout(() => {
      if (settled) return;
      terminateProcessTree(child.pid);
      settled = true;
      reject(new RestrictedVerifyFailure('VERIFY_TIMEOUT'));
    }, limits.timeoutMs);
  });
}

function sanitizeRestrictedVerifyOutput(raw: string, sawSecret: boolean): string {
  const stripped = raw.replace(ANSI_ESCAPE_PATTERN, '');
  let redacted = false;
  const lines = stripped.split(/\r?\n/).map((line) => {
    if (SECRET_OUTPUT_PATTERN.test(line) || TOKEN_VALUE_PATTERN.test(line)) {
      TOKEN_VALUE_PATTERN.lastIndex = 0;
      redacted = true;
      return '[REDACTED]';
    }
    TOKEN_VALUE_PATTERN.lastIndex = 0;
    return line;
  });
  let safe = lines.join('\n');
  if (sawSecret && !redacted) safe += `${safe.length > 0 ? '\n' : ''}[REDACTED]`;
  return safe;
}

function boundUtf8(value: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return { text: value, truncated: false };
  let text = buffer.subarray(0, maxBytes).toString('utf8');
  while (Buffer.byteLength(text, 'utf8') > maxBytes) text = text.slice(0, -1);
  return { text, truncated: true };
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
    spawnSync(path.join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process already exited.
  }
}