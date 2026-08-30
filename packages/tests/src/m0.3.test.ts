import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createAuditRepository,
  createConnectionProfileRepository,
  createInMemoryCredentialStore,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';
import { createConnectionService } from '@sud-d/application';
import {
  ConnectionRestartInputSchema,
  ConnectionServiceStatusDtoSchema,
  ConnectionSessionContextDtoSchema,
  ConnectionStartInputSchema,
  ConnectionStopInputSchema,
} from '@sud-d/contracts';
import type {
  ConnectionProfileRepository,
  CredentialStore,
  Db,
  WorkspaceRepository,
} from '@sud-d/infrastructure';
import type { ConnectionProfile, ConnectionServiceStatus } from '@sud-d/domain';
import { FakeConnectionRuntime } from './fakes/fake-connection-runtime.js';

const openDbs: Db[] = [];
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-m03-'));
  tempDirs.push(dir);
  return dir;
}

function openTrackedDatabase(dbPath: string): Db {
  const db = openDatabase(dbPath);
  openDbs.push(db);
  return db;
}

function makeWorkspaceRoot(parent: string, name: string): string {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  return fs.realpathSync.native(root);
}

function statusToDto(status: ConnectionServiceStatus) {
  return {
    state: status.state,
    session: status.session
      ? {
          ...status.session,
          startedAt: status.session.startedAt.toISOString(),
        }
      : null,
    error: status.error
      ? {
          code: status.error.code,
          message: status.error.message,
        }
      : null,
  };
}

interface HarnessOptions {
  withCredential?: boolean;
  withActiveWorkspace?: boolean;
  runtime?: FakeConnectionRuntime;
}

function makeHarness(options: HarnessOptions = {}) {
  const dataDir = makeTempDir();
  const db = openTrackedDatabase(path.join(dataDir, 'm03.db'));
  const profileRepo = createConnectionProfileRepository(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const credentialStore = createInMemoryCredentialStore();
  const runtime = options.runtime ?? new FakeConnectionRuntime();

  const profile = profileRepo.save({
    displayName: 'Work Secure Tunnel',
    provider: 'openai_secure_mcp_tunnel',
    transport: 'stdio',
    deviceName: 'Work-PC',
    autoStart: false,
    autoRestart: false,
    tunnelReference: 'work-tunnel-profile',
  });

  if (options.withCredential !== false) {
    credentialStore.setCredential(profile.profileId, 'session-secret-m03');
  }

  let workspaceId: string | undefined;
  let workspaceRoot: string | undefined;
  if (options.withActiveWorkspace !== false) {
    workspaceRoot = makeWorkspaceRoot(dataDir, 'workspace-a');
    const workspace = workspaceRepo.save('Workspace A', workspaceRoot);
    workspaceRepo.setActive(workspace.id);
    workspaceId = workspace.id;
  }

  const sessionIds = [
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000303',
  ];
  let sessionIndex = 0;
  let clockTick = 0;
  const service = createConnectionService(
    profileRepo,
    workspaceRepo,
    credentialStore,
    auditRepo,
    runtime,
    {
      now: () => new Date(Date.parse('2026-08-30T09:00:00.000Z') + clockTick++),
      createSessionId: () => sessionIds[sessionIndex++] ?? '00000000-0000-4000-8000-000000000399',
    },
  );

  return {
    dataDir,
    db,
    profileRepo,
    workspaceRepo,
    auditRepo,
    credentialStore,
    runtime,
    profile,
    workspaceId,
    workspaceRoot,
    service,
  };
}

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('M0.3 — ConnectionService lifecycle orchestration', () => {
  it('starts from stopped through the approved state machine and can remain waiting for tunnel readiness', () => {
    const runtime = new FakeConnectionRuntime();
    runtime.readiness = { tunnelReady: false, clientConnected: false };
    const { profile, service } = makeHarness({ runtime });

    expect(service.getStatus()).toMatchObject({ state: 'stopped', session: null, error: null });

    const started = service.start(profile.profileId);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.state).toBe('waiting_for_tunnel');
    expect(runtime.startCalls).toBe(1);
  });

  it('moves a successful deterministic fake runtime to connected', () => {
    const { profile, runtime, service } = makeHarness();

    const started = service.start(profile.profileId);

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.state).toBe('connected');
    expect(started.value.error).toBeNull();
    expect(runtime.startCalls).toBe(1);
  });

  it('rejects missing credential before the runtime is started', () => {
    const { profile, runtime, service } = makeHarness({ withCredential: false });

    const result = service.start(profile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_CREDENTIAL_MISSING' },
    });
    expect(runtime.startCalls).toBe(0);
    expect(service.getStatus().state).toBe('stopped');
  });

  it('rejects a missing connection profile before the runtime is started', () => {
    const { runtime, service } = makeHarness();

    const result = service.start('00000000-0000-4000-8000-000000009999');

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_PROFILE_NOT_FOUND' },
    });
    expect(runtime.startCalls).toBe(0);
  });

  it('rejects start when no active workspace is selected', () => {
    const { profile, runtime, service } = makeHarness({ withActiveWorkspace: false });

    const result = service.start(profile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_WORKSPACE_NOT_SELECTED' },
    });
    expect(runtime.startCalls).toBe(0);
  });

  it('rejects an active workspace whose canonical root no longer exists', () => {
    const { profile, workspaceRoot, runtime, service } = makeHarness();
    if (!workspaceRoot) throw new Error('test workspace root missing');
    fs.rmSync(workspaceRoot, { recursive: true, force: true });

    const result = service.start(profile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'WORKSPACE_INVALID' },
    });
    expect(runtime.startCalls).toBe(0);
  });

  it('rejects duplicate start while connected without calling runtime start again', () => {
    const { profile, runtime, service } = makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const duplicate = service.start(profile.profileId);

    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CONNECTION_STATE_TRANSITION' },
    });
    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus().state).toBe('connected');
  });

  it('stops an active connection and ends at stopped', () => {
    const { profile, runtime, service } = makeHarness();
    expect(service.start(profile.profileId).ok).toBe(true);

    const stopped = service.stop();

    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value).toMatchObject({ state: 'stopped', session: null, error: null });
    expect(runtime.stopCalls).toBe(1);
  });

  it('treats stop while stopped as deterministic and idempotent', () => {
    const { runtime, service } = makeHarness();

    const stopped = service.stop();

    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.state).toBe('stopped');
    expect(runtime.stopCalls).toBe(0);
  });

  it('restarts by stopping before starting a fresh immutable session', () => {
    const { profile, runtime, auditRepo, service } = makeHarness();
    const first = service.start(profile.profileId);
    expect(first.ok).toBe(true);
    if (!first.ok || !first.value.session) return;
    const firstSessionId = first.value.session.connectionSessionId;
    const auditCountBeforeRestart = auditRepo.list(100).length;

    const restarted = service.restart(profile.profileId);

    expect(restarted.ok).toBe(true);
    if (!restarted.ok || !restarted.value.session) return;
    expect(restarted.value.state).toBe('connected');
    expect(restarted.value.session.connectionSessionId).not.toBe(firstSessionId);
    expect(runtime.stopCalls).toBe(1);
    expect(runtime.startCalls).toBe(2);

    const restartActions = auditRepo
      .list(100)
      .slice(0, auditRepo.list(100).length - auditCountBeforeRestart)
      .reverse()
      .map((event) => event.action);
    expect(restartActions).toEqual([
      'connection.stop.requested',
      'connection.stopped',
      'connection.start.requested',
      'connection.started',
    ]);
  });

  it('maps runtime start failure to a typed safe error and error state', () => {
    const runtime = new FakeConnectionRuntime();
    runtime.startError = new Error('sk-secret-from-runtime-start');
    const { profile, auditRepo, service } = makeHarness({ runtime });

    const result = service.start(profile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONNECTION_RUNTIME_START_FAILED',
        message: 'Connection runtime failed to start',
      },
    });
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      session: null,
      error: { code: 'CONNECTION_RUNTIME_START_FAILED' },
    });
    expect(JSON.stringify({ result, audit: auditRepo.list(100) })).not.toContain(
      'sk-secret-from-runtime-start',
    );
  });

  it('maps runtime stop failure fail-closed and keeps the bound session context', () => {
    const runtime = new FakeConnectionRuntime();
    const { profile, auditRepo, service } = makeHarness({ runtime });
    const started = service.start(profile.profileId);
    expect(started.ok).toBe(true);
    if (!started.ok || !started.value.session) return;
    const session = started.value.session;
    runtime.stopError = new Error('sk-secret-from-runtime-stop');

    const result = service.stop();

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONNECTION_RUNTIME_STOP_FAILED',
        message: 'Connection runtime failed to stop',
      },
    });
    expect(service.getStatus()).toMatchObject({ state: 'error', session });
    expect(JSON.stringify({ result, audit: auditRepo.list(100) })).not.toContain(
      'sk-secret-from-runtime-stop',
    );
  });

  it('rejects lifecycle operations that would bypass approved transition semantics', () => {
    const runtime = new FakeConnectionRuntime();
    runtime.readiness = { tunnelReady: false, clientConnected: false };
    const { profile, service } = makeHarness({ runtime });
    const started = service.start(profile.profileId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.state).toBe('waiting_for_tunnel');

    const result = service.restart(profile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CONNECTION_STATE_TRANSITION' },
    });
    expect(runtime.startCalls).toBe(1);
    expect(runtime.stopCalls).toBe(0);
  });

  it('binds a frozen session context to profile, workspace, device, provider and transport', () => {
    const { profile, workspaceId, workspaceRoot, runtime, service } = makeHarness();

    const result = service.start(profile.profileId);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.value.session) return;
    const session = result.value.session;
    expect(Object.isFrozen(session)).toBe(true);
    expect(session).toEqual({
      connectionSessionId: '00000000-0000-4000-8000-000000000301',
      profileId: profile.profileId,
      workspaceId,
      workspaceCanonicalRoot: workspaceRoot,
      startedAt: new Date('2026-08-30T09:00:00.001Z'),
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      tunnelReference: 'work-tunnel-profile',
    });
    expect(runtime.startContexts[0]).toBe(session);
  });

  it('does not silently hot-switch workspace and requires restart to rebind', () => {
    const { dataDir, profile, workspaceRepo, runtime, service } = makeHarness();
    const first = service.start(profile.profileId);
    expect(first.ok).toBe(true);
    if (!first.ok || !first.value.session) return;
    const originalSession = first.value.session;

    const secondRoot = makeWorkspaceRoot(dataDir, 'workspace-b');
    const secondWorkspace = workspaceRepo.save('Workspace B', secondRoot);
    workspaceRepo.setActive(secondWorkspace.id);

    const hotSwitch = service.start(profile.profileId);
    expect(hotSwitch).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART' },
    });
    expect(service.getStatus().session).toBe(originalSession);
    expect(runtime.startCalls).toBe(1);

    const restarted = service.restart(profile.profileId);
    expect(restarted.ok).toBe(true);
    if (!restarted.ok || !restarted.value.session) return;
    expect(restarted.value.session.workspaceId).toBe(secondWorkspace.id);
    expect(restarted.value.session.workspaceCanonicalRoot).toBe(secondRoot);
    expect(runtime.stopCalls).toBe(1);
    expect(runtime.startCalls).toBe(2);
  });

  it('keeps renderer-facing lifecycle status and session DTOs secret-free and strict', () => {
    const { profile, credentialStore, service } = makeHarness();
    const secret = 'renderer-must-never-see-m03-secret';
    credentialStore.setCredential(profile.profileId, secret);
    const started = service.start(profile.profileId);
    expect(started.ok).toBe(true);
    if (!started.ok || !started.value.session) return;

    const statusDto = ConnectionServiceStatusDtoSchema.parse(statusToDto(started.value));
    const sessionDto = ConnectionSessionContextDtoSchema.parse(statusToDto(started.value).session);

    expect(JSON.stringify({ statusDto, sessionDto })).not.toContain(secret);
    expect(() => ConnectionServiceStatusDtoSchema.parse({
      ...statusToDto(started.value),
      credential: secret,
    })).toThrow();
    expect(() => ConnectionSessionContextDtoSchema.parse({
      ...statusToDto(started.value).session,
      apiKey: secret,
    })).toThrow();
  });

  it('writes lifecycle audit events with non-secret metadata only', () => {
    const { profile, credentialStore, auditRepo, service } = makeHarness();
    const secret = 'audit-must-never-see-m03-secret';
    credentialStore.setCredential(profile.profileId, secret);

    expect(service.start(profile.profileId).ok).toBe(true);
    expect(service.stop().ok).toBe(true);

    const events = auditRepo.list(100);
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'connection.start.requested',
        'connection.started',
        'connection.stop.requested',
        'connection.stopped',
      ]),
    );
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('keeps lifecycle request contracts and runtime fake free of arbitrary execution controls', () => {
    const profileId = '00000000-0000-4000-8000-000000000001';
    expect(ConnectionStartInputSchema.parse({ profileId })).toEqual({ profileId });
    expect(ConnectionStopInputSchema.parse({})).toEqual({});
    expect(ConnectionRestartInputSchema.parse({ profileId })).toEqual({ profileId });

    for (const field of ['executable', 'argv', 'command', 'cwd', 'env'] as const) {
      expect(() => ConnectionStartInputSchema.parse({
        profileId,
        [field]: field === 'env' ? { PATH: 'C:/evil' } : 'evil',
      })).toThrow();
      expect(() => ConnectionRestartInputSchema.parse({
        profileId,
        [field]: field === 'env' ? { PATH: 'C:/evil' } : 'evil',
      })).toThrow();
    }

    const runtime = new FakeConnectionRuntime();
    for (const field of ['executable', 'argv', 'command', 'cwd', 'env']) {
      expect(field in runtime).toBe(false);
    }
  });

  it('rejects a re-entrant lifecycle request deterministically without corrupting state', () => {
    const runtime = new FakeConnectionRuntime();
    const { profile, service } = makeHarness({ runtime });
    let nestedResult: ReturnType<typeof service.start> | undefined;
    runtime.onStart = () => {
      nestedResult = service.start(profile.profileId);
    };

    const outer = service.start(profile.profileId);

    expect(outer.ok).toBe(true);
    expect(nestedResult).toMatchObject({
      ok: false,
      error: { code: 'CONNECTION_LIFECYCLE_BUSY' },
    });
    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus().state).toBe('connected');
  });

  it('rejects an invalid provider/transport profile before runtime start even if a repository is corrupted', () => {
    const harness = makeHarness();
    const invalidProfile: ConnectionProfile = {
      ...harness.profile,
      provider: 'invalid-provider' as ConnectionProfile['provider'],
      transport: 'invalid-transport' as ConnectionProfile['transport'],
    };
    const corruptedRepo: ConnectionProfileRepository = {
      findById: () => invalidProfile,
      save: harness.profileRepo.save.bind(harness.profileRepo),
      update: harness.profileRepo.update.bind(harness.profileRepo),
    };
    const runtime = new FakeConnectionRuntime();
    const service = createConnectionService(
      corruptedRepo,
      harness.workspaceRepo as WorkspaceRepository,
      harness.credentialStore as CredentialStore,
      harness.auditRepo,
      runtime,
    );

    const result = service.start(invalidProfile.profileId);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(runtime.startCalls).toBe(0);
  });
});
