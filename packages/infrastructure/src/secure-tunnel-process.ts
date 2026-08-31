import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import { ConnectionRuntimeFailure } from '@sud-d/domain';
import type { SecureTunnelProfilePlan } from './secure-tunnel-profile.js';

export interface TunnelLaunchPlan {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly profilePath: string;
  readonly healthUrlFile: string;
  readonly shell: false;
}

export interface TunnelProcessHandle {
  readonly pid: number;
  stop(): void;
  onExit(listener: () => void): () => void;
}

export interface TunnelProcessLauncher {
  start(plan: TunnelLaunchPlan): TunnelProcessHandle;
}


interface ChildProcessEventSource {
  on(event: 'error', listener: () => void): void;
  on(event: 'exit', listener: () => void): void;
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
    shell: false,
  };
}

export function createWindowsTunnelProcessLauncher(): TunnelProcessLauncher {
  return {
    start(plan: TunnelLaunchPlan): TunnelProcessHandle {
      let child;
      try {
        child = spawn(plan.executablePath, [...plan.args], {
          cwd: plan.workingDirectory,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }

      const childEvents = child as unknown as ChildProcessEventSource;
      child.stdout?.resume();
      child.stderr?.resume();
      childEvents.on('error', () => {
        // The runtime maps lifecycle through exit/readiness surfaces; raw errors are intentionally dropped.
      });

      if (child.pid === undefined) {
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }
      const childPid = child.pid;

      const listeners = new Set<() => void>();
      childEvents.on('exit', () => {
        for (const listener of [...listeners]) listener();
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

        onExit(listener: () => void): () => void {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
    },
  };
}
