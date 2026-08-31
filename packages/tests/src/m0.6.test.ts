import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createAuditRepository,
  createConnectionProfileRepository,
  createInMemoryCredentialStore,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';
import {
  createConnectionConfigService,
  createConnectionService,
} from '@sud-d/application';
import {
  DesktopConnectionPreferencesUpdateInputSchema,
  DesktopConnectionSnapshotDtoSchema,
  DesktopConnectionTunnelSetupInputSchema,
  IPC_CHANNELS,
} from '@sud-d/contracts';
import type { Db } from '@sud-d/infrastructure';
import { FakeConnectionRuntime } from './fakes/fake-connection-runtime.js';
import { createDesktopConnectionController } from '../../desktop/electron/connection-controller.js';
import { registerDesktopConnectionIpcHandlers } from '../../desktop/electron/connection-ipc.js';
import {
  canRestartConnection,
  deriveConnectionComponentStatuses,
  getConnectionPrimaryAction,
  presentConnectionState,
} from '../../desktop/src/connection-ui-model.js';

const openDbs: Db[] = [];
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-m06-'));
  tempDirs.push(dir);
  return dir;
}

function makeHarness(environment: NodeJS.ProcessEnv = {}) {
  const root = makeTempDir();
  const db = openDatabase(path.join(root, 'm06.db'));
  openDbs.push(db);
  const profileRepo = createConnectionProfileRepository(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const credentialStore = createInMemoryCredentialStore();
  const configService = createConnectionConfigService(profileRepo, credentialStore, auditRepo);
  const runtime = new FakeConnectionRuntime();
  const connectionService = createConnectionService(
    profileRepo,
    workspaceRepo,
    credentialStore,
    auditRepo,
    runtime,
    {
      now: () => new Date('2026-08-30T12:00:00.000Z'),
      createSessionId: () => '00000000-0000-4000-8000-000000000601',
    },
  );

  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const workspace = workspaceRepo.save('Workspace', fs.realpathSync.native(workspaceRoot));
  workspaceRepo.setActive(workspace.id);

  const controller = createDesktopConnectionController({
    configService,
    connectionService,
    deviceName: 'Home-PC',
    environment,
  });

  return {
    profileRepo,
    auditRepo,
    credentialStore,
    runtime,
    controller,
  };
}

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('M0.6 — renderer-facing connection contracts', () => {
  it('defines only fixed lifecycle/status IPC channels for Desktop connection control', () => {
    expect(IPC_CHANNELS.CONNECTION_STATUS).toBe('connection:status');
    expect(IPC_CHANNELS.CONNECTION_START).toBe('connection:start');
    expect(IPC_CHANNELS.CONNECTION_STOP).toBe('connection:stop');
    expect(IPC_CHANNELS.CONNECTION_RESTART).toBe('connection:restart');
    expect(IPC_CHANNELS.CONNECTION_TUNNEL_SETUP).toBe('connection:tunnelSetup');
    expect(IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE).toBe('connection:preferences:update');
  });

  it('accepts only profileId plus boolean auto-start preferences', () => {
    const profileId = '00000000-0000-4000-8000-000000000606';
    const valid = {
      profileId,
      autoStart: true,
      autoRestart: false,
    };
    expect(DesktopConnectionPreferencesUpdateInputSchema.parse(valid)).toEqual(valid);

    for (const extra of [
      { command: 'cmd.exe' },
      { executable: 'powershell.exe' },
      { argv: ['--unsafe'] },
      { cwd: 'C:\\' },
      { env: { SECRET: 'value' } },
      { credential: 'plaintext-secret' },
    ]) {
      expect(DesktopConnectionPreferencesUpdateInputSchema.safeParse({
        ...valid,
        ...extra,
      }).success).toBe(false);
    }
  });

  it('accepts only profileId for fixed-purpose Secure Tunnel setup', () => {
    const profileId = '00000000-0000-4000-8000-000000000606';
    expect(DesktopConnectionTunnelSetupInputSchema.parse({ profileId })).toEqual({ profileId });

    for (const extra of [
      { tunnelReference: 'tunnel_home' },
      { command: 'cmd.exe' },
      { executable: 'powershell.exe' },
      { cwd: 'C:\\' },
      { argv: ['--unsafe'] },
      { env: { CONTROL_PLANE_TUNNEL_ID: 'tunnel_home' } },
      { credential: 'plaintext-secret' },
    ]) {
      expect(DesktopConnectionTunnelSetupInputSchema.safeParse({
        profileId,
        ...extra,
      }).success).toBe(false);
    }
  });

  it('keeps the renderer snapshot free of plaintext credential and raw tunnel reference fields', () => {
    const snapshot = {
      profile: {
        profileId: '00000000-0000-4000-8000-000000000606',
        displayName: 'OpenAI Secure Tunnel',
        provider: 'openai_secure_mcp_tunnel',
        transport: 'stdio',
        deviceName: 'Home-PC',
        autoStart: false,
        autoRestart: false,
        tunnelConfigured: true,
        createdAt: '2026-08-30T12:00:00.000Z',
        updatedAt: '2026-08-30T12:00:00.000Z',
      },
      credentialStatus: 'configured',
      runtime: {
        state: 'stopped',
        session: null,
        error: null,
      },
    } as const;

    expect(DesktopConnectionSnapshotDtoSchema.parse(snapshot)).toEqual(snapshot);
    expect(DesktopConnectionSnapshotDtoSchema.safeParse({
      ...snapshot,
      credentialValue: 'sk-secret',
    }).success).toBe(false);
    expect(DesktopConnectionSnapshotDtoSchema.safeParse({
      ...snapshot,
      profile: { ...snapshot.profile, tunnelReference: 'tunnel_home' },
    }).success).toBe(false);
  });
});

describe('M0.6 — Desktop connection controller', () => {
  it('bootstraps one local profile from safe machine metadata and never returns the environment secret', () => {
    const secret = 'sk-m06-never-render';
    const { controller, profileRepo } = makeHarness({
      CONTROL_PLANE_API_KEY: secret,
      CONTROL_PLANE_TUNNEL_ID: 'tunnel_home',
    });

    expect(() => profileRepo.list()).not.toThrow();
    const result = controller.getSnapshot();
    expect(result.ok, result.ok ? undefined : JSON.stringify(result.error)).toBe(true);
    if (!result.ok) return;

    expect(result.value.profile).toMatchObject({
      displayName: 'OpenAI Secure Tunnel',
      deviceName: 'Home-PC',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      tunnelConfigured: true,
    });
    expect(result.value.credentialStatus).toBe('configured');
    expect(profileRepo.list()).toHaveLength(1);
    expect(JSON.stringify(result.value)).not.toContain(secret);
    expect(JSON.stringify(result.value)).not.toContain('tunnel_home');
  });

  it('exposes fixed Desktop lifecycle actions and drives the real ConnectionService boundary', () => {
    const { controller, runtime } = makeHarness({
      CONTROL_PLANE_API_KEY: 'sk-session-only',
      CONTROL_PLANE_TUNNEL_ID: 'tunnel_home',
    });
    const initial = controller.getSnapshot();
    expect(initial.ok).toBe(true);
    if (!initial.ok || !initial.value.profile) return;

    expect(Object.keys(controller).sort()).toEqual([
      'configureTunnel',
      'getSnapshot',
      'removeCredential',
      'restart',
      'setupCredential',
      'start',
      'stop',
      'updatePreferences',
    ]);

    const started = controller.start({ profileId: initial.value.profile.profileId });
    expect(started.ok).toBe(true);
    if (started.ok) expect(started.value.runtime.state).toBe('connected');
    expect(runtime.startCalls).toBe(1);

    const stopped = controller.stop({});
    expect(stopped.ok).toBe(true);
    if (stopped.ok) expect(stopped.value.runtime.state).toBe('stopped');
    expect(runtime.stopCalls).toBe(1);
  });

  it('resolves the configured tunnel reference from the trusted backend environment', () => {
    const environment: NodeJS.ProcessEnv = { CONTROL_PLANE_API_KEY: 'sk-session-only' };
    const { controller } = makeHarness(environment);
    const initial = controller.getSnapshot();
    expect(initial.ok).toBe(true);
    if (!initial.ok || !initial.value.profile) return;
    expect(initial.value.profile.tunnelConfigured).toBe(false);

    environment.CONTROL_PLANE_TUNNEL_ID = 'tunnel_home';
    const updated = controller.configureTunnel({
      profileId: initial.value.profile.profileId,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.profile?.tunnelConfigured).toBe(true);
    expect(getConnectionPrimaryAction(updated.value, true)).toEqual({ action: 'connect', enabled: true });
    expect(JSON.stringify(updated.value)).not.toContain('tunnel_home');
  });

  it('returns safe restart guidance when the backend process cannot see tunnel configuration', () => {
    const { controller } = makeHarness({ CONTROL_PLANE_API_KEY: 'sk-session-only' });
    const initial = controller.getSnapshot();
    expect(initial.ok).toBe(true);
    if (!initial.ok || !initial.value.profile) return;
    expect(initial.value.profile.tunnelConfigured).toBe(false);

    const result = controller.configureTunnel({ profileId: initial.value.profile.profileId });
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Restart SUD-D to load the tunnel configuration.',
      },
    });
  });

  it('does not append audit events when the renderer polls an unchanged snapshot', () => {
    const { controller, auditRepo } = makeHarness({
      CONTROL_PLANE_API_KEY: 'sk-session-only',
      CONTROL_PLANE_TUNNEL_ID: 'tunnel_home',
    });
    const first = controller.getSnapshot();
    expect(first.ok).toBe(true);
    const countAfterBootstrap = auditRepo.list(100).length;

    const second = controller.getSnapshot();
    expect(second.ok).toBe(true);
    expect(auditRepo.list(100)).toHaveLength(countAfterBootstrap);
  });

  it('updates only safe auto-start preferences through the controller', () => {
    const { controller } = makeHarness({
      CONTROL_PLANE_API_KEY: 'sk-session-only',
      CONTROL_PLANE_TUNNEL_ID: 'tunnel_home',
    });
    const initial = controller.getSnapshot();
    expect(initial.ok).toBe(true);
    if (!initial.ok || !initial.value.profile) return;

    const updated = controller.updatePreferences({
      profileId: initial.value.profile.profileId,
      autoStart: true,
      autoRestart: true,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.profile).toMatchObject({ autoStart: true, autoRestart: true });
  });
});

describe('M0.6 — Desktop connection IPC wiring', () => {
  const snapshot = {
    profile: {
      profileId: '00000000-0000-4000-8000-000000000606',
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelConfigured: true,
      createdAt: '2026-08-30T12:00:00.000Z',
      updatedAt: '2026-08-30T12:00:00.000Z',
    },
    credentialStatus: 'configured' as const,
    runtime: { state: 'stopped' as const, session: null, error: null },
  };

  function makeIpcHarness(senderValid = true) {
    const handlers = new Map<
      string,
      (event: { readonly sender: unknown }, raw?: unknown) => unknown
    >();
    const start = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const stop = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const restart = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const setupCredential = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const removeCredential = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const configureTunnel = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const updatePreferences = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const getSnapshot = vi.fn(() => ({ ok: true as const, value: snapshot }));

    registerDesktopConnectionIpcHandlers(
      {
        handle(
          channel: string,
          listener: (event: { readonly sender: unknown }, raw?: unknown) => unknown,
        ): void {
          handlers.set(channel, listener);
        },
      },
      { getSnapshot, start, stop, restart, setupCredential, removeCredential, configureTunnel, updatePreferences },
      () => senderValid,
    );

    return { handlers, start, stop, restart, setupCredential, removeCredential, configureTunnel, updatePreferences, getSnapshot };
  }

  it('registers only the approved fixed connection actions', () => {
    const { handlers } = makeIpcHarness();
    expect([...handlers.keys()].sort()).toEqual([
      IPC_CHANNELS.CONNECTION_RESTART,
      IPC_CHANNELS.CONNECTION_START,
      IPC_CHANNELS.CONNECTION_STATUS,
      IPC_CHANNELS.CONNECTION_STOP,
      IPC_CHANNELS.CONNECTION_CREDENTIAL_SETUP,
      IPC_CHANNELS.CONNECTION_CREDENTIAL_REMOVE,
      IPC_CHANNELS.CONNECTION_TUNNEL_SETUP,
      IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE,
    ].sort());
  });

  it('rejects invalid lifecycle payload before calling the controller', async () => {
    const { handlers, start } = makeIpcHarness();
    const handler = handlers.get(IPC_CHANNELS.CONNECTION_START);
    expect(handler).toBeDefined();
    const result = await handler?.(
      { sender: { id: 1 } },
      {
        profileId: '00000000-0000-4000-8000-000000000606',
        command: 'cmd.exe',
      },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects an invalid sender before lifecycle execution', async () => {
    const { handlers, restart } = makeIpcHarness(false);
    const handler = handlers.get(IPC_CHANNELS.CONNECTION_RESTART);
    const result = await handler?.(
      { sender: { id: 99 } },
      { profileId: '00000000-0000-4000-8000-000000000606' },
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(restart).not.toHaveBeenCalled();
  });

  it('forwards a valid fixed start action to the controller', async () => {
    const { handlers, start } = makeIpcHarness();
    const input = { profileId: '00000000-0000-4000-8000-000000000606' };
    const result = await handlers.get(IPC_CHANNELS.CONNECTION_START)?.(
      { sender: { id: 1 } },
      input,
    );
    expect(start).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, value: snapshot });
  });

  it('accepts fixed-purpose tunnel setup and rejects raw tunnel/process input', async () => {
    const { handlers, configureTunnel } = makeIpcHarness();
    const input = { profileId: '00000000-0000-4000-8000-000000000606' };

    const valid = await handlers.get(IPC_CHANNELS.CONNECTION_TUNNEL_SETUP)?.(
      { sender: { id: 1 } },
      input,
    );
    expect(configureTunnel).toHaveBeenCalledWith(input);
    expect(valid).toEqual({ ok: true, value: snapshot });

    configureTunnel.mockClear();
    const invalid = await handlers.get(IPC_CHANNELS.CONNECTION_TUNNEL_SETUP)?.(
      { sender: { id: 1 } },
      {
        ...input,
        tunnelReference: 'tunnel_home',
        executable: 'powershell.exe',
        argv: ['x'],
        cwd: 'C:\\',
        env: { CONTROL_PLANE_TUNNEL_ID: 'tunnel_home' },
      },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(configureTunnel).not.toHaveBeenCalled();
  });

  it('validates safe preference updates before forwarding to the controller', async () => {
    const { handlers, updatePreferences } = makeIpcHarness();
    const input = {
      profileId: '00000000-0000-4000-8000-000000000606',
      autoStart: true,
      autoRestart: false,
    };

    const valid = await handlers.get(IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE)?.(
      { sender: { id: 1 } },
      input,
    );
    expect(updatePreferences).toHaveBeenCalledWith(input);
    expect(valid).toEqual({ ok: true, value: snapshot });

    updatePreferences.mockClear();
    const invalid = await handlers.get(IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE)?.(
      { sender: { id: 1 } },
      { ...input, executable: 'cmd.exe', env: { SECRET: 'value' } },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});

describe('M0.6 — connection presentation model', () => {
  it('maps lifecycle states to clear non-technical labels', () => {
    expect(presentConnectionState('stopped')).toMatchObject({ label: 'Disconnected', tone: 'neutral' });
    expect(presentConnectionState('waiting_for_tunnel')).toMatchObject({ label: 'Starting tunnel', tone: 'warning' });
    expect(presentConnectionState('waiting_for_client')).toMatchObject({ label: 'Waiting for ChatGPT', tone: 'warning' });
    expect(presentConnectionState('connected')).toMatchObject({ label: 'Connected', tone: 'success' });
    expect(presentConnectionState('degraded')).toMatchObject({ label: 'Needs attention', tone: 'warning' });
    expect(presentConnectionState('error')).toMatchObject({ label: 'Connection error', tone: 'danger' });
  });

  it('derives gateway, tunnel, and client presentation from the approved aggregate state', () => {
    expect(deriveConnectionComponentStatuses('stopped')).toEqual({
      gateway: 'stopped', tunnel: 'stopped', client: 'disconnected',
    });
    expect(deriveConnectionComponentStatuses('waiting_for_tunnel')).toEqual({
      gateway: 'starting', tunnel: 'starting', client: 'disconnected',
    });
    expect(deriveConnectionComponentStatuses('waiting_for_client')).toEqual({
      gateway: 'ready', tunnel: 'ready', client: 'disconnected',
    });
    expect(deriveConnectionComponentStatuses('connected')).toEqual({
      gateway: 'ready', tunnel: 'ready', client: 'connected',
    });
    expect(deriveConnectionComponentStatuses('error')).toEqual({
      gateway: 'error', tunnel: 'error', client: 'disconnected',
    });
  });

  it('shows Restart only in states that ConnectionService.restart accepts', () => {
    expect(canRestartConnection('connected')).toBe(true);
    expect(canRestartConnection('degraded')).toBe(true);
    expect(canRestartConnection('error')).toBe(true);
    expect(canRestartConnection('stopped')).toBe(false);
    expect(canRestartConnection('starting')).toBe(false);
    expect(canRestartConnection('waiting_for_tunnel')).toBe(false);
    expect(canRestartConnection('waiting_for_client')).toBe(false);
    expect(canRestartConnection('stopping')).toBe(false);
  });

  it('enables Connect only when workspace, tunnel, and credential prerequisites are ready', () => {
    const base = {
      profile: {
        profileId: '00000000-0000-4000-8000-000000000606',
        displayName: 'OpenAI Secure Tunnel',
        provider: 'openai_secure_mcp_tunnel' as const,
        transport: 'stdio' as const,
        deviceName: 'Home-PC',
        autoStart: false,
        autoRestart: false,
        tunnelConfigured: true,
        createdAt: '2026-08-30T12:00:00.000Z',
        updatedAt: '2026-08-30T12:00:00.000Z',
      },
      credentialStatus: 'configured' as const,
      runtime: { state: 'stopped' as const, session: null, error: null },
    };

    expect(getConnectionPrimaryAction(base, true)).toEqual({ action: 'connect', enabled: true });
    expect(getConnectionPrimaryAction({ ...base, credentialStatus: 'missing' }, true)).toEqual({
      action: 'connect', enabled: false, reason: 'Credential setup required',
    });
    expect(getConnectionPrimaryAction(base, false)).toEqual({
      action: 'connect', enabled: false, reason: 'Select a workspace first',
    });
    expect(getConnectionPrimaryAction({
      ...base,
      runtime: { state: 'connected' as const, session: null, error: null },
    }, true)).toEqual({ action: 'disconnect', enabled: true });
  });
});

describe('M0.6 — bundled Electron path integration', () => {
  it('resolves the fixed MCP Gateway entry from source and bundled module URLs', async () => {
    const api = await import('@sud-d/infrastructure') as unknown as {
      resolveMcpGatewayEntryPath(moduleUrl: string): string;
    };
    const expected = path.join(process.cwd(), 'packages', 'mcp-gateway', 'dist', 'stdio-entry.js');
    const sourceModuleUrl = pathToFileURL(
      path.join(process.cwd(), 'packages', 'infrastructure', 'src', 'secure-tunnel-profile.ts'),
    ).href;
    const bundledModuleUrl = pathToFileURL(
      path.join(process.cwd(), 'packages', 'desktop', 'dist-electron', 'main.js'),
    ).href;

    expect(api.resolveMcpGatewayEntryPath(sourceModuleUrl)).toBe(expected);
    expect(api.resolveMcpGatewayEntryPath(bundledModuleUrl)).toBe(expected);
  });
});

describe('M0.6 — renderer page safety surfaces', () => {
  it('defines a Connection page without normal-surface CLI/process/credential controls', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/src/pages/ConnectionPage.tsx'),
      'utf8',
    );
    expect(source).toContain('OpenAI Secure MCP Tunnel');
    expect(source).toContain('stdio');
    expect(source).toContain('Advanced details');
    expect(source).not.toMatch(/raw command|executable path|argv|cwd|environment variable values/i);
  });

  it('offers non-technical Secure Tunnel setup without renderer tunnel input', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/src/pages/ConnectionPage.tsx'),
      'utf8',
    );
    expect(source).toContain('Set up Secure Tunnel');
    expect(source).toContain('SUD-D found the tunnel configuration on this device.');
    expect(source).toContain('Secure Tunnel is ready.');
    expect(source).not.toMatch(/tunnelReference|Secure Tunnel reference|Paste the device tunnel reference/i);
  });

  it('routes Overview tunnel setup CTA to the safe Connection flow', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'),
      'utf8',
    );
    expect(source).toContain('Set up Secure Tunnel');
    expect(source).toContain("onNavigate('connection')");
    expect(source).not.toMatch(/tunnelReference|CONTROL_PLANE_TUNNEL_ID/);
  });

  it('defines Recovery as an honest unavailable milestone instead of a fake recovery engine', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/src/pages/RecoveryPage.tsx'),
      'utf8',
    );
    expect(source).toMatch(/not enabled|coming later|future milestone/i);
    expect(source).not.toMatch(/restore now|checkpoint created|recovered successfully/i);
  });
});
