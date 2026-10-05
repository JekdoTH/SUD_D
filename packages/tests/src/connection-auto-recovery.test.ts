import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConnectionService } from '@sud-d/application';
import { ConnectionRuntimeFailure } from '@sud-d/domain';
import {
  createAuditRepository,
  createConnectionProfileRepository,
  createInMemoryCredentialStore,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';
import type { Db } from '@sud-d/infrastructure';
import { FakeConnectionRuntime } from './fakes/fake-connection-runtime.js';

const openDbs: Db[] = [];
const tempDirs: string[] = [];

function makeHarness(autoRestart = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-auto-recovery-'));
  tempDirs.push(dir);
  const db = openDatabase(path.join(dir, 'recovery.db'));
  openDbs.push(db);

  const profileRepo = createConnectionProfileRepository(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const credentialStore = createInMemoryCredentialStore();
  const auditRepo = createAuditRepository(db);
  const runtime = new FakeConnectionRuntime();
  runtime.readiness = { tunnelReady: false, clientConnected: false };

  const workspaceRoot = path.join(dir, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const workspace = workspaceRepo.save('Workspace', fs.realpathSync.native(workspaceRoot));
  workspaceRepo.setActive(workspace.id);

  const profile = profileRepo.save({
    displayName: 'OpenAI Secure Tunnel',
    provider: 'openai_secure_mcp_tunnel',
    transport: 'stdio',
    deviceName: 'Test-PC',
    autoStart: true,
    autoRestart,
    tunnelReference: 'tunnel_test',
  });
  credentialStore.setCredential(profile.profileId, 'synthetic-test-secret');

  let nextSession = 1;
  const service = createConnectionService(
    profileRepo,
    workspaceRepo,
    credentialStore,
    auditRepo,
    runtime,
    {
      now: () => new Date(Date.now()),
      createSessionId: () =>
        `00000000-0000-4000-8000-${String(nextSession++).padStart(12, '0')}`,
    },
  );

  return { db, profileRepo, workspaceRepo, credentialStore, auditRepo, runtime, profile, service };
}

function currentSessionId(runtime: FakeConnectionRuntime): string {
  const session = runtime.startContexts.at(-1);
  if (!session) throw new Error('missing runtime start context');
  return session.connectionSessionId;
}

function failCurrent(runtime: FakeConnectionRuntime, code: 'TUNNEL_EXITED_UNEXPECTEDLY' | 'TUNNEL_HEALTH_FAILED' = 'TUNNEL_EXITED_UNEXPECTEDLY'): void {
  runtime.emit({
    type: 'runtime_failed',
    connectionSessionId: currentSessionId(runtime),
    code,
  } as never);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Phase 1 — ConnectionService auto recovery', () => {
  it('starts disconnected with no recovery intent even when legacy autoStart is true', () => {
    const { runtime, service } = makeHarness(true);

    expect(service.getStatus()).toMatchObject({
      state: 'stopped',
      session: null,
      recovery: { phase: 'idle', attempt: 0 },
    });
    expect(runtime.startCalls).toBe(0);
  });

  it('recovers retryable managed-runtime failure with the approved 1s, 3s, 10s bounded schedule', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);

    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'scheduled', attempt: 0 });

    vi.advanceTimersByTime(999);
    expect(runtime.startCalls).toBe(1);
    vi.advanceTimersByTime(1);
    expect(runtime.startCalls).toBe(2);
    expect(service.getStatus().recovery).toEqual({ phase: 'restarting', attempt: 1 });

    failCurrent(runtime);
    vi.advanceTimersByTime(2_999);
    expect(runtime.startCalls).toBe(2);
    vi.advanceTimersByTime(1);
    expect(runtime.startCalls).toBe(3);
    expect(service.getStatus().recovery).toEqual({ phase: 'restarting', attempt: 2 });

    failCurrent(runtime);
    vi.advanceTimersByTime(9_999);
    expect(runtime.startCalls).toBe(3);
    vi.advanceTimersByTime(1);
    expect(runtime.startCalls).toBe(4);
    expect(service.getStatus().recovery).toEqual({ phase: 'restarting', attempt: 3 });

    failCurrent(runtime);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'exhausted', attempt: 3 },
    });

    vi.advanceTimersByTime(60_000);
    expect(runtime.startCalls).toBe(4);
  });

  it('resets the consumed incident budget only after 60 continuous seconds of runtime readiness', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);

    failCurrent(runtime);
    vi.advanceTimersByTime(1_000);
    const recoveredSessionId = currentSessionId(runtime);
    runtime.emit({ type: 'tunnel_ready', connectionSessionId: recoveredSessionId } as never);

    expect(service.getStatus().recovery).toEqual({ phase: 'stabilizing', attempt: 1 });
    vi.advanceTimersByTime(59_000);
    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'scheduled', attempt: 1 });

    vi.advanceTimersByTime(3_000);
    const secondRecoveredSessionId = currentSessionId(runtime);
    runtime.emit({ type: 'tunnel_ready', connectionSessionId: secondRecoveredSessionId } as never);
    vi.advanceTimersByTime(60_000);

    expect(service.getStatus().recovery).toEqual({ phase: 'idle', attempt: 0 });

    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'scheduled', attempt: 0 });
  });

  it('does not refund consumed retry budget when Auto Recovery is toggled OFF then ON before 60-second stability', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);

    failCurrent(runtime);
    vi.advanceTimersByTime(1_000);
    const recoveredSessionId = currentSessionId(runtime);
    runtime.emit({ type: 'tunnel_ready', connectionSessionId: recoveredSessionId } as never);
    expect(service.getStatus().recovery).toEqual({ phase: 'stabilizing', attempt: 1 });

    vi.advanceTimersByTime(10_000);
    service.setAutoRecoveryEnabled(false);
    expect(service.getStatus().recovery).toEqual({ phase: 'idle', attempt: 0 });

    service.setAutoRecoveryEnabled(true);
    expect(service.getStatus().recovery).toEqual({ phase: 'stabilizing', attempt: 1 });

    vi.advanceTimersByTime(59_000);
    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'scheduled', attempt: 1 });

    vi.advanceTimersByTime(2_999);
    expect(runtime.startCalls).toBe(2);
    vi.advanceTimersByTime(1);
    expect(runtime.startCalls).toBe(3);
    expect(service.getStatus().recovery).toEqual({ phase: 'restarting', attempt: 2 });
  });

  it('cancels pending recovery authoritatively on manual Disconnect', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);

    expect(service.stop().ok).toBe(true);
    expect(service.getStatus()).toMatchObject({
      state: 'stopped',
      session: null,
      recovery: { phase: 'idle', attempt: 0 },
    });

    vi.advanceTimersByTime(15_000);
    expect(runtime.startCalls).toBe(1);
  });

  it('never restarts the managed tunnel for client-only disconnect/degraded state', () => {
    const { profile, runtime, service } = makeHarness(true);
    runtime.readiness = { tunnelReady: true, clientConnected: true };
    expect(service.start(profile.profileId).ok).toBe(true);

    const sessionId = currentSessionId(runtime);
    runtime.emit({ type: 'client_disconnected', connectionSessionId: sessionId } as never);
    expect(service.getStatus()).toMatchObject({
      state: 'degraded',
      recovery: { phase: 'idle', attempt: 0 },
    });

    vi.advanceTimersByTime(60_000);
    expect(runtime.startCalls).toBe(1);
  });

  it('ignores stale failure events from a prior runtime launch', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    const firstSessionId = currentSessionId(runtime);

    failCurrent(runtime);
    vi.advanceTimersByTime(1_000);
    const secondSessionId = currentSessionId(runtime);
    expect(secondSessionId).not.toBe(firstSessionId);

    runtime.emit({
      type: 'runtime_failed',
      connectionSessionId: firstSessionId,
      code: 'TUNNEL_EXITED_UNEXPECTEDLY',
    } as never);

    expect(service.getStatus()).toMatchObject({
      state: 'waiting_for_tunnel',
      recovery: { phase: 'restarting', attempt: 1 },
    });
    expect(runtime.startCalls).toBe(2);
  });

  it('revokes recovery intent when Auto Recovery is off and requires explicit manual action', () => {
    const { profile, runtime, service } = makeHarness(false);
    expect(service.start(profile.profileId).ok).toBe(true);

    failCurrent(runtime);

    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 0 },
    });
    vi.advanceTimersByTime(30_000);
    expect(runtime.startCalls).toBe(1);

    const retry = service.restart(profile.profileId);
    expect(retry.ok).toBe(true);
    expect(runtime.startCalls).toBe(2);
  });

  it('queues matching synchronous runtime events until the candidate session is committed', () => {
    const { profile, runtime, service } = makeHarness(true);
    runtime.onStart = () => {
      const context = runtime.startContexts.at(-1);
      if (!context) throw new Error('missing context');
      runtime.emit({ type: 'tunnel_ready', connectionSessionId: context.connectionSessionId } as never);
    };

    const result = service.start(profile.profileId);

    expect(result).toMatchObject({ ok: true, value: { state: 'waiting_for_client' } });
    expect(service.getStatus()).toMatchObject({
      state: 'waiting_for_client',
      recovery: { phase: 'idle', attempt: 0 },
    });
  });

  it('coalesces duplicate runtime failures without creating a second retry timer or concurrent start', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    const sessionId = currentSessionId(runtime);

    runtime.emit({
      type: 'runtime_failed',
      connectionSessionId: sessionId,
      code: 'TUNNEL_EXITED_UNEXPECTEDLY',
    } as never);
    runtime.emit({
      type: 'runtime_failed',
      connectionSessionId: sessionId,
      code: 'TUNNEL_EXITED_UNEXPECTEDLY',
    } as never);

    vi.advanceTimersByTime(1_000);
    expect(runtime.startCalls).toBe(2);
    expect(service.getStatus().recovery).toEqual({ phase: 'restarting', attempt: 1 });
  });

  it('applies Auto Recovery OFF immediately while a retry is pending', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    expect(service.getStatus().recovery.phase).toBe('scheduled');

    service.setAutoRecoveryEnabled(false);

    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 0 },
    });
    vi.advanceTimersByTime(15_000);
    expect(runtime.startCalls).toBe(1);
  });

  it('consumes the automatic attempt before cleanup failure and never starts a replacement process', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    runtime.stopError = new Error('synthetic stop failure');

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(runtime.stopCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_RUNTIME_STOP_FAILED' },
    });
  });

  it('fails closed when a configured credential is replaced after the manual connection bind', () => {
    const { profile, runtime, credentialStore, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);

    credentialStore.setCredential(profile.profileId, 'rotated-synthetic-test-secret');
    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART' },
    });
  });

  it.each([
    'TUNNEL_CLIENT_NOT_FOUND',
    'TUNNEL_PROFILE_INVALID',
    'TUNNEL_START_FAILED',
    'TUNNEL_STOP_FAILED',
    'MCP_GATEWAY_ENTRY_NOT_FOUND',
  ] as const)('never retries non-retryable managed-runtime failure %s', (code) => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);

    runtime.emit({
      type: 'runtime_failed',
      connectionSessionId: currentSessionId(runtime),
      code,
    } as never);

    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 0 },
      error: { code },
    });
    vi.advanceTimersByTime(60_000);
    expect(runtime.startCalls).toBe(1);
  });

  it.each([
    ['typed tunnel start failure', () => new ConnectionRuntimeFailure('TUNNEL_START_FAILED'), 'TUNNEL_START_FAILED'],
    ['unknown runtime start failure', () => new Error('synthetic automatic start failure'), 'CONNECTION_RUNTIME_START_FAILED'],
  ] as const)('does not retry again after %s during an automatic attempt', (_label, makeError, expectedCode) => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    runtime.startError = makeError();

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(2);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: expectedCode },
    });
    vi.advanceTimersByTime(60_000);
    expect(runtime.startCalls).toBe(2);
  });

  it('fails closed when the credential disappears before an automatic retry', () => {
    const { profile, runtime, credentialStore, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    credentialStore.deleteCredential(profile.profileId);

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_CREDENTIAL_MISSING' },
    });
  });

  it('fails closed when the bound profile configuration changes before an automatic retry', () => {
    const { profile, runtime, profileRepo, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    profileRepo.update(profile.profileId, { tunnelReference: 'tunnel_changed' });

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART' },
    });
  });

  it('fails closed when the bound profile disappears before an automatic retry', () => {
    const { db, profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);
    db.prepare('DELETE FROM connection_profiles WHERE profile_id = ?').run(profile.profileId);

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_PROFILE_NOT_FOUND' },
    });
  });

  it('fails closed when the bound Workspace changes before an automatic retry', () => {
    const { profile, runtime, workspaceRepo, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);

    const originalRoot = runtime.startContexts[0]?.workspaceCanonicalRoot;
    if (!originalRoot) throw new Error('missing original workspace');
    const replacementRoot = path.join(path.dirname(originalRoot), 'workspace-replacement');
    fs.mkdirSync(replacementRoot);
    const replacement = workspaceRepo.save('Replacement', fs.realpathSync.native(replacementRoot));
    workspaceRepo.setActive(replacement.id);

    vi.advanceTimersByTime(1_000);

    expect(runtime.startCalls).toBe(1);
    expect(service.getStatus()).toMatchObject({
      state: 'error',
      recovery: { phase: 'blocked', attempt: 1 },
      error: { code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART' },
    });
  });

  it('shutdown revokes intent before cleanup, cancels pending retry, and rejects new starts', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);
    failCurrent(runtime);

    const shutDown = service.shutdown();

    expect(shutDown.ok).toBe(true);
    expect(service.getStatus()).toMatchObject({
      state: 'stopped',
      recovery: { phase: 'idle', attempt: 0 },
    });
    vi.advanceTimersByTime(15_000);
    expect(runtime.startCalls).toBe(1);
    expect(service.start(profile.profileId)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('a fresh explicit manual Retry after exhaustion gets a new bounded recovery budget', () => {
    const { profile, runtime, service } = makeHarness(true);
    expect(service.start(profile.profileId).ok).toBe(true);

    failCurrent(runtime);
    vi.advanceTimersByTime(1_000);
    failCurrent(runtime);
    vi.advanceTimersByTime(3_000);
    failCurrent(runtime);
    vi.advanceTimersByTime(10_000);
    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'exhausted', attempt: 3 });

    const retry = service.restart(profile.profileId);

    expect(retry.ok).toBe(true);
    expect(service.getStatus().recovery).toEqual({ phase: 'idle', attempt: 0 });
    failCurrent(runtime);
    expect(service.getStatus().recovery).toEqual({ phase: 'scheduled', attempt: 0 });
  });
});
