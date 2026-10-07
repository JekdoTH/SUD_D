import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProjectRunnerJobRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';

const roots: string[] = [];
const dbs: Db[] = [];

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
  }
});

function database(): Db {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-jobs-'));
  roots.push(root);
  const db = openDatabase(path.join(root, 'state.db'));
  dbs.push(db);
  return db;
}

describe('Restricted Project Runner durable Job repository', () => {
  it('admits one stable attempt idempotently and blocks a second active job in the Workspace', () => {
    const repo = createProjectRunnerJobRepository(database());
    const first = repo.admit({
      attemptId: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'ws-1',
      runnerId: 'report',
      executionFingerprint: 'a'.repeat(64),
      ownerRuntimeEpoch: 'epoch-1',
      createdAt: '2026-10-07T02:00:00.000Z',
    });
    expect(first).toMatchObject({
      ok: true,
      value: {
        created: true,
        job: {
          attemptId: '11111111-1111-4111-8111-111111111111',
          workspaceId: 'ws-1',
          runnerId: 'report',
          state: 'starting',
          executionFingerprint: 'a'.repeat(64),
        },
      },
    });

    const retry = repo.admit({
      attemptId: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'ws-1',
      runnerId: 'report',
      executionFingerprint: 'a'.repeat(64),
      ownerRuntimeEpoch: 'epoch-1',
      createdAt: '2026-10-07T02:00:01.000Z',
    });
    expect(retry).toMatchObject({
      ok: true,
      value: { created: false, job: { jobId: first.ok ? first.value.job.jobId : '' } },
    });

    expect(repo.admit({
      attemptId: '22222222-2222-4222-8222-222222222222',
      workspaceId: 'ws-1',
      runnerId: 'report',
      executionFingerprint: 'b'.repeat(64),
      ownerRuntimeEpoch: 'epoch-1',
      createdAt: '2026-10-07T02:00:02.000Z',
    })).toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });

    expect(repo.admit({
      attemptId: '11111111-1111-4111-8111-111111111111',
      workspaceId: 'ws-1',
      runnerId: 'report',
      executionFingerprint: 'c'.repeat(64),
      ownerRuntimeEpoch: 'epoch-1',
      createdAt: '2026-10-07T02:00:03.000Z',
    })).toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
  });

  it('uses compare-and-swap state transitions and never replays crash metadata', () => {
    const repo = createProjectRunnerJobRepository(database());
    const admitted = repo.admit({
      attemptId: '33333333-3333-4333-8333-333333333333',
      workspaceId: 'ws-1',
      runnerId: 'report',
      executionFingerprint: 'd'.repeat(64),
      ownerRuntimeEpoch: 'epoch-old',
      createdAt: '2026-10-07T02:10:00.000Z',
    });
    if (!admitted.ok) throw new Error('admission failed');
    const jobId = admitted.value.job.jobId;

    expect(repo.markRunning(jobId, '2026-10-07T02:10:01.000Z'))
      .toMatchObject({ ok: true, value: { state: 'running' } });
    expect(repo.markRunning(jobId, '2026-10-07T02:10:02.000Z'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });

    const interrupted = repo.interruptOrphaned('epoch-new', '2026-10-07T02:10:03.000Z');
    expect(interrupted).toEqual({ ok: true, value: 1 });
    expect(repo.findByJobId(jobId)).toMatchObject({
      ok: true,
      value: { state: 'interrupted', terminalCode: 'OWNER_RUNTIME_LOST' },
    });

    expect(repo.findByAttemptId('33333333-3333-4333-8333-333333333333'))
      .toMatchObject({ ok: true, value: { jobId, state: 'interrupted' } });
  });
});
