import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import { ConnectionRuntimeFailure } from '@sud-d/domain';
import { createApprovalRuntimeEnvironment } from './approval-runtime-identity.js';
import type { SecureTunnelProfilePlan } from './secure-tunnel-profile.js';

export interface TunnelLaunchPlan {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly profilePath: string;
  readonly healthUrlFile: string;
  readonly gatewayRuntimeExecutablePath: string;
  readonly shell: false;
}

export interface TunnelProcessExitDiagnostics {
  readonly exitCode: number | null;
  readonly stderrTail: readonly string[];
}

export interface TunnelProcessHandle {
  readonly pid: number;
  stop(): void;
  onExit(listener: (diagnostics: TunnelProcessExitDiagnostics) => void): () => void;
}

export interface TunnelProcessLauncher {
  start(plan: TunnelLaunchPlan): TunnelProcessHandle;
}


interface ChildProcessEventSource {
  on(event: 'error', listener: () => void): void;
  on(event: 'close', listener: (code: number | null) => void): void;
}

const TUNNEL_STDERR_TAIL_LINES = 80;
const TUNNEL_STDERR_LINE_CHARS = 1000;
const TUNNEL_STDERR_PENDING_CHARS = 4000;

function sensitiveEnvironmentValues(environment: NodeJS.ProcessEnv): readonly string[] {
  return Object.entries(environment)
    .filter(([key, value]) =>
      typeof value === 'string' &&
      value.length >= 4 &&
      /password|passwd|secret|token|api[_-]?key|auth|credential|private[_-]?key|bearer/i.test(key),
    )
    .map(([, value]) => value as string);
}

function redactTunnelDiagnosticLine(line: string, sensitiveValues: readonly string[]): string {
  let redacted = line;
  for (const value of sensitiveValues) {
    redacted = redacted.split(value).join('[REDACTED]');
  }
  redacted = redacted
    .replace(/(bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|credential|authorization)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
  return redacted.slice(-TUNNEL_STDERR_LINE_CHARS);
}

export function createBoundedTunnelStderrCapture(
  environment: NodeJS.ProcessEnv,
): {
  append(chunk: Buffer | string): void;
  snapshot(): readonly string[];
} {
  const sensitiveValues = sensitiveEnvironmentValues(environment);
  const tail: string[] = [];
  let pending = '';

  const pushLine = (line: string): void => {
    tail.push(redactTunnelDiagnosticLine(line, sensitiveValues));
    if (tail.length > TUNNEL_STDERR_TAIL_LINES) {
      tail.splice(0, tail.length - TUNNEL_STDERR_TAIL_LINES);
    }
  };

  return {
    append(chunk: Buffer | string): void {
      pending = `${pending}${typeof chunk === 'string' ? chunk : chunk.toString('utf8')}`;
      if (pending.length > TUNNEL_STDERR_PENDING_CHARS) {
        pending = pending.slice(-TUNNEL_STDERR_PENDING_CHARS);
      }
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) pushLine(line);
    },
    snapshot(): readonly string[] {
      if (pending.length > 0) {
        pushLine(pending);
        pending = '';
      }
      return Object.freeze([...tail]);
    },
  };
}

function systemExecutable(name: string): string {
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
  return path.join(systemRoot, 'System32', name);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withGatewayRuntimeFirstOnPath(
  environment: NodeJS.ProcessEnv,
  gatewayRuntimeExecutablePath: string,
): NodeJS.ProcessEnv {
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'Path';
  const currentPath = environment[pathKey] ?? '';
  const runtimeDirectory = path.dirname(gatewayRuntimeExecutablePath);
  return { ...environment, [pathKey]: `${runtimeDirectory}${path.delimiter}${currentPath}` };
}

export function isTunnelProcessStopFailure(
  taskkillStatus: number | null,
  childExitCode: number | null,
  pid: number,
  processAlive: (pid: number) => boolean = isProcessAlive,
): boolean {
  if (taskkillStatus === 0 || childExitCode !== null) return false;
  return processAlive(pid);
}

function resolveByWhere(command: string, expectedBasename: string): string | undefined {
  try {
    const output = execFileSync(systemExecutable('where.exe'), [command], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const candidates = output
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    return candidates.find((candidate) =>
      path.basename(candidate).toLowerCase() === expectedBasename.toLowerCase() &&
      fs.existsSync(candidate),
    );
  } catch {
    return undefined;
  }
}

export function resolveTunnelClientExecutable(): string | undefined {
  return resolveByWhere('tunnel-client', 'tunnel-client.exe');
}

export function resolveNodeExecutable(): string | undefined {
  if (process.versions.electron && fs.existsSync(process.execPath)) {
    return process.execPath;
  }
  if (
    path.basename(process.execPath).toLowerCase() === 'node.exe' &&
    fs.existsSync(process.execPath)
  ) {
    return process.execPath;
  }
  return resolveByWhere('node', 'node.exe');
}

export function prepareTunnelLaunchPlan(
  tunnelClientExecutable: string,
  profile: SecureTunnelProfilePlan,
): TunnelLaunchPlan {
  if (
    path.basename(tunnelClientExecutable).toLowerCase() !== 'tunnel-client.exe' ||
    !fs.existsSync(tunnelClientExecutable)
  ) {
    throw new ConnectionRuntimeFailure('TUNNEL_CLIENT_NOT_FOUND');
  }

  return {
    executablePath: tunnelClientExecutable,
    args: ['run', '--profile-file', profile.profilePath],
    workingDirectory: profile.runtimeRoot,
    profilePath: profile.profilePath,
    healthUrlFile: profile.healthUrlFile,
    gatewayRuntimeExecutablePath: profile.gatewayRuntimeExecutablePath,
    shell: false,
  };
}

export function createWindowsTunnelProcessLauncher(): TunnelProcessLauncher {
  return {
    start(plan: TunnelLaunchPlan): TunnelProcessHandle {
      let child;
      let childEnvironment: NodeJS.ProcessEnv;
      try {
        const approvalRuntimeEnvironment = createApprovalRuntimeEnvironment();
        childEnvironment = {
          ...withGatewayRuntimeFirstOnPath(process.env, plan.gatewayRuntimeExecutablePath),
          ...approvalRuntimeEnvironment,
          ELECTRON_RUN_AS_NODE: '1',
        };
        child = spawn(plan.executablePath, [...plan.args], {
          cwd: plan.workingDirectory,
          shell: false,
          windowsHide: true,
          env: childEnvironment,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }

      const childEvents = child as unknown as ChildProcessEventSource;
      const stderrCapture = createBoundedTunnelStderrCapture(childEnvironment);
      child.stdout?.resume();
      child.stderr?.on('data', (chunk: Buffer | string) => stderrCapture.append(chunk));
      childEvents.on('error', () => {
        // The runtime maps lifecycle through exit/readiness surfaces; raw process errors are not retained.
      });

      if (child.pid === undefined) {
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }
      const childPid = child.pid;

      const listeners = new Set<(diagnostics: TunnelProcessExitDiagnostics) => void>();
      childEvents.on('close', (exitCode) => {
        const diagnostics: TunnelProcessExitDiagnostics = Object.freeze({
          exitCode,
          stderrTail: stderrCapture.snapshot(),
        });
        for (const listener of [...listeners]) listener(diagnostics);
      });

      return {
        pid: childPid,

        stop(): void {
          if (child.exitCode !== null) return;
          const result = spawnSync(
            systemExecutable('taskkill.exe'),
            ['/PID', String(childPid), '/T', '/F'],
            {
              windowsHide: true,
              stdio: 'ignore',
            },
          );
          if (isTunnelProcessStopFailure(result.status, child.exitCode, childPid)) {
            throw new ConnectionRuntimeFailure('TUNNEL_STOP_FAILED');
          }
        },

        onExit(listener: (diagnostics: TunnelProcessExitDiagnostics) => void): () => void {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
  };
}
