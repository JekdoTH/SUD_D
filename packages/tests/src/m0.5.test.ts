import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createConnectionService } from '@sud-d/application';
import { ConnectionServiceStatusDtoSchema } from '@sud-d/contracts';
import {
  createAuditRepository,
  createConnectionProfileRepository,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';
import type {
  ConnectionRuntimeEvent,
  ConnectionSessionContext,
} from '@sud-d/domain';
import type { CredentialStore, Db } from '@sud-d/infrastructure';

interface TunnelLaunchPlan {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly profilePath: string;
  readonly healthUrlFile: string;
  readonly shell: false;
}

interface TunnelProcessHandleLike {
  readonly pid: number;
  stop(): void;
  onExit(listener: () => void): () => void;
}

interface TunnelProcessLauncherLike {
  start(plan: TunnelLaunchPlan): TunnelProcessHandleLike;
}

interface TunnelHealthWatchLike {
  stop(): void;
}

interface TunnelHealthProbeLike {
  watch(input: {
    readonly healthUrlFile: string;
    readonly pid: number;
    readonly onReady: () => void;
    readonly onFailure: () => void;
  }): TunnelHealthWatchLike;
}

interface GatewayClientSignalLike {
  subscribe(listener: (connected: boolean) => void): () => void;
}

interface RuntimeDependencies {
  readonly dataRoot: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly resolveTunnelClient: () => string | undefined;
  readonly nodeExecutablePath: string;
  readonly gatewayEntryPath: string;
  readonly processLauncher: TunnelProcessLauncherLike;
  readonly healthProbe: TunnelHealthProbeLike;
  readonly clientSignal?: GatewayClientSignalLike;
}

interface RuntimeLike {
  start(context: ConnectionSessionContext): { tunnelReady: boolean; clientConnected: boolean };
  stop(): void;
  subscribe(listener: (event: ConnectionRuntimeEvent) => void): () => void;
  getStatus(): {
    readonly state: 'stopped' | 'starting' | 'healthy' | 'error';
    readonly lastErrorCode?: string;
  };
}

interface M05Api {
  createTunnelEnvironmentCredentialStore(environment?: NodeJS.ProcessEnv): CredentialStore;
  credentialEnvVarNameForProfile(profileId: string): string;
  createOpenAiSecureTunnelRuntimeWithDependencies(dependencies: RuntimeDependencies): RuntimeLike;
  getDefaultMcpGatewayEntryPath(): string;
}

async function loadM05(): Promise<M05Api> {
  return (await import('@sud-d/infrastructure')) as unknown as M05Api;
}

class FakeTunnelProcessHandle implements TunnelProcessHandleLike {
  readonly pid: number;
  stopCalls = 0;
  stopError: Error | null = null;
  private readonly exitListeners = new Set<() => void>();

  constructor(pid: number) {
    this.pid = pid;
  }

  stop(): void {
    this.stopCalls += 1;
    if (this.stopError) throw this.stopError;
  }

  onExit(listener: () => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  exitUnexpectedly(): void {
    for (const listener of [...this.exitListeners]) listener();
  }
}

class FakeTunnelProcessLauncher implements TunnelProcessLauncherLike {
  readonly plans: TunnelLaunchPlan[] = [];
  readonly handles: FakeTunnelProcessHandle[] = [];
  startError: Error | null = null;

  start(plan: TunnelLaunchPlan): TunnelProcessHandleLike {
    this.plans.push(plan);
    if (this.startError) throw this.startError;
    const handle = new FakeTunnelProcessHandle(41000 + this.handles.length);
    this.handles.push(handle);
    return handle;
  }
}

class FakeTunnelHealthProbe implements TunnelHealthProbeLike {
  watchCalls = 0;
  stopCalls = 0;
  private current:
    | {
        onReady: () => void;
        onFailure: () => void;
      }
    | undefined;

  watch(input: {
    readonly healthUrlFile: string;
    readonly pid: number;
    readonly onReady: () => void;
    readonly onFailure: () => void;
  }): TunnelHealthWatchLike {
    this.watchCalls += 1;
    this.current = { onReady: input.onReady, onFailure: input.onFailure };
    return {
      stop: () => {
        this.stopCalls += 1;
        this.current = undefined;
      },
    };
  }

  ready(): void {
    this.current?.onReady();
  }

  fail(): void {
    this.current?.onFailure();
  }
}

class FakeGatewayClientSignal implements GatewayClientSignalLike {
  private readonly listeners = new Set<(connected: boolean) => void>();

  subscribe(listener: (connected: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setConnected(connected: boolean): void {
    for (const listener of [...this.listeners]) listener(connected);
  }
}

const tempDirs: string[] = [];
const openDbs: Db[] = [];

function tempDir(prefix = 'sudd-m05-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeExecutableFixture(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'fixture');
  return file;
}

function profileCommand(profileText: string): string {
  const line = profileText.split(/\r?\n/).find((entry) => entry.trimStart().startsWith('command:'));
  if (!line) throw new Error('profile command not found');
  const value = line.slice(line.indexOf(':') + 1).trim();
  return JSON.parse(value) as string;
}

async function makeHarness(options: {
  credential?: boolean;
  tunnelReference?: string;
  resolveTunnelClient?: () => string | undefined;
  startError?: Error;
  stopError?: Error;
} = {}) {
  const api = await loadM05();
  const root = tempDir('sudd-m05-root-');
  const workspaceRoot = path.join(root, 'Workspace With Spaces');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const db = openDatabase(path.join(root, 'm05.db'));
  openDbs.push(db);
  const profileRepo = createConnectionProfileRepository(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const environment: NodeJS.ProcessEnv = {};
  const credentialStore = api.createTunnelEnvironmentCredentialStore(environment);

  const profile = profileRepo.save({
    displayName: 'Work Secure Tunnel',
    provider: 'openai_secure_mcp_tunnel',
    transport: 'stdio',
    deviceName: 'Work-PC',
    autoStart: false,
    autoRestart: true,
    ...(options.tunnelReference === undefined
      ? { tunnelReference: 'tunnel_0123456789abcdef0123456789abcdef' }
      : options.tunnelReference
        ? { tunnelReference: options.tunnelReference }
        : {}),
  });

  const workspace = workspaceRepo.save('Workspace', workspaceRoot);
  workspaceRepo.setActive(workspace.id);

  if (options.credential !== false) {
    credentialStore.setCredential(profile.profileId, 'sk-m05-secret-never-serialize');
  }

  const trustedBinDir = path.join(root, 'Trusted Runtime', 'bin');
  const tunnelClientPath = makeExecutableFixture(trustedBinDir, 'tunnel-client.exe');
  const nodeExecutablePath = makeExecutableFixture(
    path.join(root, 'Program Files', 'nodejs'),
    'node.exe',
  );
  const gatewayEntryPath = makeExecutableFixture(
    path.join(root, 'Project Prompt', 'packages', 'mcp-gateway', 'dist'),
    'stdio-entry.js',
  );

  const processLauncher = new FakeTunnelProcessLauncher();
  processLauncher.startError = options.startError ?? null;
  const healthProbe = new FakeTunnelHealthProbe();
  const clientSignal = new FakeGatewayClientSignal();
  const runtime = api.createOpenAiSecureTunnelRuntimeWithDependencies({
    dataRoot: path.join(root, 'SUD-D'),
    environment,
    resolveTunnelClient: options.resolveTunnelClient ?? (() => tunnelClientPath),
    nodeExecutablePath,
    gatewayEntryPath,
    processLauncher,
    healthProbe,
    clientSignal,
  });

  const service = createConnectionService(
    profileRepo,
    workspaceRepo,
    credentialStore,
    auditRepo,
    runtime,
  );

  if (options.stopError) {
    const originalStart = processLauncher.start.bind(processLauncher);
    processLauncher.start = (plan) => {
      const handle = originalStart(plan) as FakeTunnelProcessHandle;
      handle.stopError = options.stopError ?? null;
      return handle;
    };
  }

  return {
    api,
    root,
    environment,
    profile,
    workspace,
    auditRepo,
    credentialStore,
    processLauncher,
    healthProbe,
    clientSignal,
    runtime,
    service,
    nodeExecutablePath,
    gatewayEntryPath,
    tunnelClientPath,
  };
}

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('M0.5 — OpenAI Secure Tunnel adapter', () => {
  it('builds a fixed SUD_D-owned tunnel profile and launch plan from trusted config', async () => {
    const { profile, processLauncher, service } = await makeHarness();

    const started = service.start(profile.profileId);
    expect(started.ok).toBe(true);
    expect(processLauncher.plans).toHaveLength(1);

    const plan = processLauncher.plans[0];
    expect(plan.executablePath.toLowerCase()).toMatch(/tunnel-client\.exe$/);
    expect(plan.args).toEqual(['run', '--profile-file', plan.profilePath]);
    expect(plan.shell).toBe(false);
    expect(plan.profilePath).toContain(path.join('SUD-D', 'runtime', 'secure-tunnel', 'profiles'));
    expect(plan.healthUrlFile).toContain(path.join('SUD-D', 'runtime', 'secure-tunnel', 'health'));

    const text = fs.readFileSync(plan.profilePath, 'utf8');
    expect(text).toContain('channel: main');
    expect(text).toContain(profile.tunnelReference);
    expect(text).toContain('api_key:');
  });

  it('uses stdio gateway command and never generates a localhost HTTP MCP upstream', async () => {
    const { profile, processLauncher, service, gatewayEntryPath } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const text = fs.readFileSync(processLauncher.plans[0].profilePath, 'utf8');
    expect(profileCommand(text)).toContain(gatewayEntryPath.replaceAll('\\', '/'));
    expect(text).not.toMatch(/mcp_server_url|server_url|http:\/\/127\.0\.0\.1|localhost.*\/mcp/i);
  });

  it('keeps the runtime public API fixed-purpose without executable/argv/cwd/env controls', async () => {
    const { runtime } = await makeHarness();
    const methods = Object.keys(runtime).sort();
    expect(methods).toEqual(['getStatus', 'start', 'stop', 'subscribe']);
    expect(methods.join(' ')).not.toMatch(/execute|spawn|argv|command|cwd|env|shell/i);
  });

  it('rejects missing credential before any tunnel process start', async () => {
    const { profile, processLauncher, service } = await makeHarness({ credential: false });
    const result = service.start(profile.profileId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_CREDENTIAL_MISSING' },
    });
    expect(processLauncher.plans).toHaveLength(0);
  });

  it('rejects a missing tunnel reference before process start with a typed safe error', async () => {
    const { profile, processLauncher, service } = await makeHarness({ tunnelReference: '' });
    const result = service.start(profile.profileId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'TUNNEL_PROFILE_INVALID', message: 'Secure Tunnel profile configuration is invalid' },
    });
    expect(processLauncher.plans).toHaveLength(0);
  });

  it('maps a missing tunnel-client executable to a typed safe error', async () => {
    const { profile, processLauncher, service } = await makeHarness({
      resolveTunnelClient: () => undefined,
    });
    const result = service.start(profile.profileId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'TUNNEL_CLIENT_NOT_FOUND', message: 'OpenAI Secure Tunnel client is not available' },
    });
    expect(processLauncher.plans).toHaveLength(0);
  });

  it('starts the fixed tunnel process and leaves ConnectionService waiting_for_tunnel initially', async () => {
    const { profile, processLauncher, runtime, service } = await makeHarness();
    const result = service.start(profile.profileId);
    expect(result).toMatchObject({ ok: true, value: { state: 'waiting_for_tunnel' } });
    expect(processLauncher.plans).toHaveLength(1);
    expect(runtime.getStatus()).toEqual({ state: 'starting' });
  });

  it('advances waiting_for_tunnel to waiting_for_client when tunnel health becomes ready', async () => {
    const { profile, healthProbe, runtime, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    healthProbe.ready();

    expect(service.getStatus().state).toBe('waiting_for_client');
    expect(runtime.getStatus()).toEqual({ state: 'healthy' });
  });

  it('maps tunnel health failure to fail-closed error state', async () => {
    const { profile, healthProbe, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    healthProbe.fail();

    expect(service.getStatus()).toMatchObject({
      state: 'error',
      error: { code: 'TUNNEL_HEALTH_FAILED', message: 'Secure Tunnel runtime failed readiness checks' },
    });
    expect(processLauncher.handles[0].stopCalls).toBe(1);
  });

  it('maps an unexpected tunnel process exit to a safe typed error', async () => {
    const { profile, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    processLauncher.handles[0].exitUnexpectedly();

    expect(service.getStatus()).toMatchObject({
      state: 'error',
      error: { code: 'TUNNEL_EXITED_UNEXPECTEDLY', message: 'Secure Tunnel runtime exited unexpectedly' },
    });
  });

  it('stops the child process, health watcher, and connection deterministically', async () => {
    const { profile, healthProbe, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const stopped = service.stop();

    expect(stopped).toMatchObject({ ok: true, value: { state: 'stopped', session: null } });
    expect(processLauncher.handles[0].stopCalls).toBe(1);
    expect(healthProbe.stopCalls).toBe(1);
  });

  it('does not spawn a duplicate tunnel process on duplicate start', async () => {
    const { profile, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const duplicate = service.start(profile.profileId);

    expect(duplicate).toMatchObject({ ok: false, error: { code: 'INVALID_CONNECTION_STATE_TRANSITION' } });
    expect(processLauncher.plans).toHaveLength(1);
  });

  it('treats duplicate stop deterministically without stopping the process twice', async () => {
    const { profile, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);
    expect(service.stop().ok).toBe(true);
    expect(service.stop().ok).toBe(true);
    expect(processLauncher.handles[0].stopCalls).toBe(1);
  });

  it('restart stops the old tunnel before launching a single fresh process', async () => {
    const { profile, healthProbe, clientSignal, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);
    healthProbe.ready();
    clientSignal.setConnected(true);
    expect(service.getStatus().state).toBe('connected');

    const restarted = service.restart(profile.profileId);

    expect(restarted).toMatchObject({ ok: true, value: { state: 'waiting_for_tunnel' } });
    expect(processLauncher.plans).toHaveLength(2);
    expect(processLauncher.handles[0].stopCalls).toBe(1);
    expect(processLauncher.handles[1].stopCalls).toBe(0);
  });

  it('handles Windows paths with spaces through fixed argv and quoted MCP command construction', async () => {
    const { profile, processLauncher, service, nodeExecutablePath, gatewayEntryPath } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const plan = processLauncher.plans[0];
    expect(plan.args).toEqual(['run', '--profile-file', plan.profilePath]);
    expect(plan.workingDirectory).toContain('SUD-D');
    const command = profileCommand(fs.readFileSync(plan.profilePath, 'utf8'));
    expect(nodeExecutablePath.toLowerCase()).toMatch(/node\.exe$/);
    expect(command).toBe(`node "${gatewayEntryPath.replaceAll('\\', '/')}"`);
  });

  it('uses a deterministic credential environment reference without serializing plaintext into profile or argv', async () => {
    const { api, profile, environment, processLauncher, service } = await makeHarness();
    const secret = environment[api.credentialEnvVarNameForProfile(profile.profileId)];
    expect(secret).toBe('sk-m05-secret-never-serialize');
    expect(service.start(profile.profileId).ok).toBe(true);

    const plan = processLauncher.plans[0];
    const text = fs.readFileSync(plan.profilePath, 'utf8');
    expect(text).toContain(`env:${api.credentialEnvVarNameForProfile(profile.profileId)}`);
    expect(JSON.stringify(plan)).not.toContain(secret);
    expect(text).not.toContain(secret);
  });

  it('does not leak credential plaintext into DTO, audit, launch plan, profile, or safe runtime errors', async () => {
    const secret = 'sk-m05-secret-never-serialize';
    const { profile, auditRepo, processLauncher, service } = await makeHarness({
      startError: new Error(`${secret}: raw spawn failure`),
    });

    const result = service.start(profile.profileId);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'TUNNEL_START_FAILED', message: 'Secure Tunnel runtime failed to start' },
    });

    const serialized = JSON.stringify({
      result,
      status: service.getStatus(),
      audits: auditRepo.list(50),
      plan: processLauncher.plans[0],
      profile: fs.readFileSync(processLauncher.plans[0].profilePath, 'utf8'),
    });
    expect(serialized).not.toContain(secret);
  });

  it('generates only a SUD_D-owned stdio profile and no arbitrary HTTP upstream', async () => {
    const { profile, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);
    const text = fs.readFileSync(processLauncher.plans[0].profilePath, 'utf8');
    expect(text).toContain('mcp:');
    expect(text).toContain('commands:');
    expect(text).toContain('channel: main');
    expect(text).not.toMatch(/https?:\/\/127\.0\.0\.1|https?:\/\/localhost|server_url/i);
  });

  it('resolves the production gateway entrypoint to the fixed M0.4 stdio entry', async () => {
    const api = await loadM05();
    expect(api.getDefaultMcpGatewayEntryPath().replaceAll('\\', '/')).toMatch(
      /packages\/mcp-gateway\/dist\/stdio-entry\.js$/,
    );
  });

  it('maps raw process start failure to a safe typed tunnel error', async () => {
    const { profile, service } = await makeHarness({
      startError: new Error('C:\\secret\\path CONTROL_PLANE_API_KEY=should-never-leak'),
    });
    expect(service.start(profile.profileId)).toMatchObject({
      ok: false,
      error: { code: 'TUNNEL_START_FAILED', message: 'Secure Tunnel runtime failed to start' },
    });
  });

  it('maps raw process stop failure to a safe typed tunnel error', async () => {
    const { profile, service } = await makeHarness({
      stopError: new Error('raw taskkill failure with sensitive path'),
    });
    expect(service.start(profile.profileId).ok).toBe(true);
    expect(service.stop()).toMatchObject({
      ok: false,
      error: { code: 'TUNNEL_STOP_FAILED', message: 'Secure Tunnel runtime failed to stop' },
    });
  });

  it('keeps renderer-facing ConnectionService status strict and secret-free after tunnel failure', async () => {
    const { profile, processLauncher, service } = await makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);
    processLauncher.handles[0].exitUnexpectedly();

    const status = service.getStatus();
    const dto = ConnectionServiceStatusDtoSchema.parse({
      state: status.state,
      session: status.session
        ? {
            ...status.session,
            startedAt: status.session.startedAt.toISOString(),
          }
        : null,
      error: status.error ? { code: status.error.code, message: status.error.message } : null,
    });
    expect(dto.error?.code).toBe('TUNNEL_EXITED_UNEXPECTEDLY');
    expect(JSON.stringify(dto)).not.toMatch(/api[_-]?key|credential|CONTROL_PLANE_API_KEY|sk-m05/i);
  });

  it('preserves M0.4 inert gateway behavior: real stdio tools/list remains empty', async () => {
    const api = await loadM05();
    const entry = api.getDefaultMcpGatewayEntryPath();
    expect(fs.existsSync(entry)).toBe(true);

    const child = spawn(process.execPath, [entry], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout: string[] = [];
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => stdout.push(chunk));
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 501,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'm05-test', version: '0.1.0' },
      },
    })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 502, method: 'tools/list', params: {} })}\n`);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('gateway smoke timeout')), 3000);
      const poll = setInterval(() => {
        const lines = stdout.join('').split(/\r?\n/).filter(Boolean);
        if (lines.some((line) => line.includes('"id":502'))) {
          clearInterval(poll);
          clearTimeout(timeout);
          resolve();
        }
      }, 20);
    });

    child.stdin.end();
    const lines = stdout.join('').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as {
      id?: number;
      result?: { tools?: unknown[] };
    });
    expect(lines.find((line) => line.id === 502)?.result?.tools).toEqual([]);
  });
});
