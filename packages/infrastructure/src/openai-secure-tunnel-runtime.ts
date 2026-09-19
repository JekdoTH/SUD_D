import fs from 'node:fs';
import path from 'node:path';

import {
  ConnectionRuntimeFailure,
  type ConnectionRuntimeEvent,
  type ConnectionSessionContext,
  type RuntimeReadiness,
} from '@sud-d/domain';
import { getDataRoot } from './data-root.js';
import { credentialEnvVarNameForProfile } from './credential-store.js';
import {
  createLoopbackTunnelHealthProbe,
  type TunnelHealthProbe,
  type TunnelHealthWatch,
} from './secure-tunnel-health.js';
import {
  getDefaultMcpGatewayEntryPath,
  prepareSecureTunnelProfile,
  writeSecureTunnelProfile,
} from './secure-tunnel-profile.js';
import {
  createWindowsTunnelProcessLauncher,
  prepareTunnelLaunchPlan,
  resolveNodeExecutable,
  resolveTunnelClientExecutable,
  type TunnelProcessExitDiagnostics,
  type TunnelProcessHandle,
  type TunnelProcessLauncher,
} from './secure-tunnel-process.js';

export interface GatewayClientSignalPort {
  subscribe(listener: (connected: boolean) => void): () => void;
}

export interface OpenAiSecureTunnelRuntimeStatus {
  readonly state: 'stopped' | 'starting' | 'healthy' | 'error';
  readonly lastErrorCode?: string;
  readonly lastExitDiagnostics?: TunnelProcessExitDiagnostics;
}

export interface OpenAiSecureTunnelRuntime {
  start(context: ConnectionSessionContext): RuntimeReadiness;
  stop(): void;
  subscribe(listener: (event: ConnectionRuntimeEvent) => void): () => void;
  getStatus(): OpenAiSecureTunnelRuntimeStatus;
}

export interface OpenAiSecureTunnelRuntimeDependencies {
  readonly dataRoot: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly resolveTunnelClient: () => string | undefined;
  readonly nodeExecutablePath: string;
  readonly gatewayEntryPath: string;
  readonly processLauncher: TunnelProcessLauncher;
  readonly healthProbe: TunnelHealthProbe;
  readonly clientSignal?: GatewayClientSignalPort;
}

function validateFixedRuntimePath(
  filePath: string,
  expectedBasename: string,
  errorCode: 'TUNNEL_START_FAILED' | 'MCP_GATEWAY_ENTRY_NOT_FOUND',
): void {
  if (
    path.basename(filePath).toLowerCase() !== expectedBasename.toLowerCase() ||
    !fs.existsSync(filePath)
  ) {
    throw new ConnectionRuntimeFailure(errorCode);
  }
}

function validateGatewayRuntimePath(filePath: string): void {
  const isNodeExecutable = path.basename(filePath).toLowerCase() === 'node.exe';
  const isCurrentElectronExecutable =
    Boolean(process.versions.electron) &&
    path.resolve(filePath).toLowerCase() === path.resolve(process.execPath).toLowerCase();
  if ((!isNodeExecutable && !isCurrentElectronExecutable) || !fs.existsSync(filePath)) {
    throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
  }
}

export function createOpenAiSecureTunnelRuntimeWithDependencies(
  dependencies: OpenAiSecureTunnelRuntimeDependencies,
): OpenAiSecureTunnelRuntime {
  const listeners = new Set<(event: ConnectionRuntimeEvent) => void>();
  let processHandle: TunnelProcessHandle | undefined;
  let stopExitListener: (() => void) | undefined;
  let healthWatch: TunnelHealthWatch | undefined;
  let stopping = false;
  let tunnelReady = false;
  let clientConnected = false;
  let status: OpenAiSecureTunnelRuntimeStatus = { state: 'stopped' };

  const emit = (event: ConnectionRuntimeEvent): void => {
    for (const listener of [...listeners]) listener(event);
  };

  const setFailure = (
    code:
      | 'TUNNEL_HEALTH_FAILED'
      | 'TUNNEL_EXITED_UNEXPECTEDLY'
      | 'TUNNEL_STOP_FAILED',
    exitDiagnostics?: TunnelProcessExitDiagnostics,
  ): void => {
    status = exitDiagnostics
      ? { state: 'error', lastErrorCode: code, lastExitDiagnostics: exitDiagnostics }
      : { state: 'error', lastErrorCode: code };
    tunnelReady = false;
    clientConnected = false;
  };

  dependencies.clientSignal?.subscribe((connected) => {
    if (!processHandle) return;
    if (connected === clientConnected) return;
    clientConnected = connected;
    emit({ type: connected ? 'client_connected' : 'client_disconnected' });
  });

  return {
    start(context: ConnectionSessionContext): RuntimeReadiness {
      if (processHandle) {
        return { tunnelReady, clientConnected };
      }

      const credentialName = credentialEnvVarNameForProfile(context.profileId);
      const credential = dependencies.environment[credentialName];
      if (typeof credential !== 'string' || credential.length === 0) {
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }

      validateGatewayRuntimePath(dependencies.nodeExecutablePath);
      validateFixedRuntimePath(
        dependencies.gatewayEntryPath,
        'stdio-entry.js',
        'MCP_GATEWAY_ENTRY_NOT_FOUND',
      );

      const tunnelClient = dependencies.resolveTunnelClient();
      if (!tunnelClient) {
        throw new ConnectionRuntimeFailure('TUNNEL_CLIENT_NOT_FOUND');
      }

      const profile = prepareSecureTunnelProfile(
        context,
        dependencies.dataRoot,
        dependencies.nodeExecutablePath,
        dependencies.gatewayEntryPath,
      );
      writeSecureTunnelProfile(profile);
      const launchPlan = prepareTunnelLaunchPlan(tunnelClient, profile);

      let handle: TunnelProcessHandle;
      try {
        handle = dependencies.processLauncher.start(launchPlan);
      } catch (error) {
        if (error instanceof ConnectionRuntimeFailure) throw error;
        throw new ConnectionRuntimeFailure('TUNNEL_START_FAILED');
      }

      stopping = false;
      tunnelReady = false;
      clientConnected = false;
      processHandle = handle;
      status = { state: 'starting' };

      stopExitListener = handle.onExit((exitDiagnostics) => {
        if (stopping || processHandle !== handle) return;
        healthWatch?.stop();
        healthWatch = undefined;
        processHandle = undefined;
        stopExitListener = undefined;
        setFailure('TUNNEL_EXITED_UNEXPECTEDLY', exitDiagnostics);
        emit({ type: 'runtime_failed', code: 'TUNNEL_EXITED_UNEXPECTEDLY' });
      });

      healthWatch = dependencies.healthProbe.watch({
        healthUrlFile: profile.healthUrlFile,
        pid: handle.pid,
        onReady: () => {
          if (stopping || processHandle !== handle) return;
          tunnelReady = true;
          status = { state: 'healthy' };
          emit({ type: 'tunnel_ready' });
        },
        onFailure: () => {
          if (stopping || processHandle !== handle) return;
          healthWatch?.stop();
          healthWatch = undefined;
          setFailure('TUNNEL_HEALTH_FAILED');
          try {
            stopping = true;
            handle.stop();
            stopExitListener?.();
            stopExitListener = undefined;
            processHandle = undefined;
          } catch {
            // Keep the internal handle for an explicit retrying stop; never expose raw process text.
          } finally {
            stopping = false;
          }
          emit({ type: 'runtime_failed', code: 'TUNNEL_HEALTH_FAILED' });
        },
      });

      return { tunnelReady: false, clientConnected: false };
    },

    stop(): void {
      if (!processHandle) {
        healthWatch?.stop();
        healthWatch = undefined;
        status = { state: 'stopped' };
        tunnelReady = false;
        clientConnected = false;
        return;
      }

      stopping = true;
      healthWatch?.stop();
      healthWatch = undefined;
      const handle = processHandle;
      try {
        handle.stop();
      } catch (error) {
        stopping = false;
        setFailure('TUNNEL_STOP_FAILED');
        if (error instanceof ConnectionRuntimeFailure) throw error;
        throw new ConnectionRuntimeFailure('TUNNEL_STOP_FAILED');
      }

      stopExitListener?.();
      stopExitListener = undefined;
      processHandle = undefined;
      stopping = false;
      tunnelReady = false;
      clientConnected = false;
      status = { state: 'stopped' };
    },

    subscribe(listener: (event: ConnectionRuntimeEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getStatus(): OpenAiSecureTunnelRuntimeStatus {
      return Object.freeze({ ...status });
    },
  };
}

export function isOpenAiSecureTunnelClientAvailable(): boolean {
  return resolveTunnelClientExecutable() !== undefined;
}

export function isMcpGatewayEntryAvailable(): boolean {
  try {
    const entryPath = getDefaultMcpGatewayEntryPath();
    return path.basename(entryPath) === 'stdio-entry.js' && fs.existsSync(entryPath);
  } catch {
    return false;
  }
}

export function createOpenAiSecureTunnelRuntime(): OpenAiSecureTunnelRuntime {
  const nodeExecutablePath = resolveNodeExecutable() ?? '';
  return createOpenAiSecureTunnelRuntimeWithDependencies({
    dataRoot: getDataRoot(),
    environment: process.env,
    resolveTunnelClient: resolveTunnelClientExecutable,
    nodeExecutablePath,
    gatewayEntryPath: getDefaultMcpGatewayEntryPath(),
    processLauncher: createWindowsTunnelProcessLauncher(),
    healthProbe: createLoopbackTunnelHealthProbe(),
  });
}

export {
  getDefaultMcpGatewayEntryPath,
  resolveMcpGatewayEntryPath,
} from './secure-tunnel-profile.js';
