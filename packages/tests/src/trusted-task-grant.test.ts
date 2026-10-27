import { describe, expect, it } from 'vitest';
import {
  closeTrustedTaskGrant,
  createTrustedTaskLedger,
  recordTrustedInvocationOutcome,
  reserveTrustedInvocation,
  reserveTrustedRepair,
  type TrustedTaskGrant,
  type TrustedTaskLedger,
} from '../../domain/src/trusted-task-grant.js';
import {
  TrustedTaskGrantSchema,
  TrustedInvocationIntentSchema,
} from '../../contracts/src/trusted-task-grant.js';

const grant: TrustedTaskGrant = {
  profile: 'trusted-agent-host-v1',
  taskId: 'task-1',
  grantVersion: 1,
  controllerId: 'controller-1',
  sessionId: 'session-1',
  workspaceId: 'workspace-1',
  workspaceGeneration: 'root-revision-1',
  scopeRevision: 'scope-1',
  issuedAtMs: 100,
  expiresAtMs: 1100,
  maxCommandStarts: 2,
  maxRepairs: 1,
};

const context = {
  taskId: 'task-1',
  grantVersion: 1,
  controllerId: 'controller-1',
  sessionId: 'session-1',
  workspaceId: 'workspace-1',
  workspaceGeneration: 'root-revision-1',
  scopeRevision: 'scope-1',
};

function ledger(): TrustedTaskLedger {
  // Deliberately inert: the future application must prove Owner approval and persist the grant.
  return createTrustedTaskLedger(grant);
}

function admit(state: TrustedTaskLedger, key = 'attempt-1', digest = 'digest-1', nowMs = 200) {
  return reserveTrustedInvocation(state, context, {
    invocationKey: key,
    commandDigest: digest,
  }, nowMs);
}

describe('Trusted Local task grant — inert domain contract', () => {
  it('is not a production execution capability and refuses invalid grant shapes', () => {
    expect(TrustedTaskGrantSchema.safeParse(grant).success).toBe(true);
    expect(TrustedTaskGrantSchema.safeParse({ ...grant, profile: 'restricted' }).success).toBe(false);
    expect(TrustedTaskGrantSchema.safeParse({ ...grant, grantVersion: 0 }).success).toBe(false);
    expect(TrustedTaskGrantSchema.safeParse({ ...grant, maxCommandStarts: 0 }).success).toBe(false);
    expect(TrustedTaskGrantSchema.safeParse({ ...grant, expiresAtMs: -1 }).success).toBe(false);
    expect(TrustedTaskGrantSchema.safeParse({ ...grant, executable: 'powershell.exe' }).success).toBe(false);
    expect(TrustedInvocationIntentSchema.safeParse({ invocationKey: 'a', commandDigest: 'b' }).success).toBe(true);
    expect(TrustedInvocationIntentSchema.safeParse({ invocationKey: 'a', commandDigest: 'b', shell: 'whoami' }).success).toBe(false);
  });

  it('rejects malformed runtime grant before activation with fixed safe errors', () => {
    const invalid = [
      { ...grant, profile: 'restricted' },
      { ...grant, grantVersion: Number.NaN },
      { ...grant, grantVersion: 1.5 },
      { ...grant, grantVersion: 1_000_001 },
      { ...grant, issuedAtMs: Number.POSITIVE_INFINITY },
      { ...grant, issuedAtMs: 1.5 },
      { ...grant, expiresAtMs: grant.issuedAtMs },
      { ...grant, expiresAtMs: -1 },
      { ...grant, maxCommandStarts: Number.NaN },
      { ...grant, maxCommandStarts: 0 },
      { ...grant, maxCommandStarts: 101 },
      { ...grant, maxRepairs: -1 },
      { ...grant, maxRepairs: 21 },
      { ...grant, maxRepairs: 0.5 },
      { ...grant, taskId: '' },
      { ...grant, workspaceGeneration: '../escape' },
      { ...grant, secret: 'must-not-appear' },
      (() => { const { sessionId: _removed, ...without } = grant; void _removed; return without; })(),
      null,
    ];
    for (const value of invalid) {
      expect(() => createTrustedTaskLedger(value as TrustedTaskGrant)).toThrow('INVALID_TRUSTED_GRANT');
    }
    const original = { ...grant };
    const result = createTrustedTaskLedger(original);
    original.taskId = 'changed';
    expect(result.grant.taskId).toBe('task-1');
    expect(Object.isFrozen(result.grant)).toBe(true);
    expect(Object.isFrozen(result.invocations)).toBe(true);
    expect(() => closeTrustedTaskGrant(result, 'trusted' as 'completed')).toThrow('INVALID_CLOSE_DECISION');
  });

  it('reserves one attempt, returns same reservation for identical retry, and denies conflicting replay', () => {
    const first = admit(ledger());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed).toBe(false);
    expect(first.state.usedCommandStarts).toBe(1);
    expect(first.state.invocations).toHaveLength(1);
    expect(first.state.invocations[0]?.state).toBe('prepared');

    const replay = admit(first.state);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.state.usedCommandStarts).toBe(1);
    expect(admit(first.state, 'attempt-1', 'different-digest')).toMatchObject({ ok: false, code: 'REPLAY_CONFLICT' });
  });

  it('rejects another session, runtime, workspace generation, task, version and stale scope', () => {
    const changes = [
      { sessionId: 'other' }, { controllerId: 'other' }, { workspaceId: 'other' },
      { workspaceGeneration: 'other' }, { taskId: 'other' },
      { grantVersion: 2 }, { scopeRevision: 'other' },
    ];
    for (const changed of changes) {
      const result = reserveTrustedInvocation(ledger(), { ...context, ...changed }, {
        invocationKey: 'attempt-1', commandDigest: 'digest-1',
      }, 200);
      expect(result).toMatchObject({ ok: false, code: 'SCOPE_MISMATCH' });
    }
    expect(ledger().usedCommandStarts).toBe(0);
  });

  it('expires at the boundary and does not replenish starts on a later call', () => {
    expect(admit(ledger(), 'a', 'd', 1100)).toMatchObject({ ok: false, code: 'EXPIRED' });
    const one = admit(ledger(), 'a', 'd');
    expect(one.ok).toBe(true);
    if (!one.ok) return;
    const firstFinished = recordTrustedInvocationOutcome(one.state, 'a', 'succeeded');
    expect(firstFinished.ok).toBe(true);
    if (!firstFinished.ok) return;
    const two = admit(firstFinished.state, 'b', 'd2');
    expect(two.ok).toBe(true);
    if (!two.ok) return;
    const secondFinished = recordTrustedInvocationOutcome(two.state, 'b', 'succeeded');
    expect(secondFinished.ok).toBe(true);
    if (!secondFinished.ok) return;
    expect(admit(secondFinished.state, 'c', 'd3')).toMatchObject({ ok: false, code: 'BUDGET_EXHAUSTED' });
  });

  it('does not admit while another command is unresolved', () => {
    const first = admit(ledger());
    if (!first.ok) throw new Error('first admission failed');
    expect(admit(first.state, 'b', 'd2')).toMatchObject({ ok: false, code: 'BUSY' });
    const ended = recordTrustedInvocationOutcome(first.state, 'attempt-1', 'failed');
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(admit(ended.state, 'b', 'd2')).toMatchObject({ ok: true });
  });

  it('quarantines unknown completion and cannot re-admit after uncertain start/cleanup', () => {
    const first = admit(ledger());
    if (!first.ok) throw new Error('first admission failed');
    const uncertain = recordTrustedInvocationOutcome(first.state, 'attempt-1', 'unknown');
    expect(uncertain).toMatchObject({ ok: true, state: { status: 'quarantined' } });
    if (!uncertain.ok) return;
    expect(admit(uncertain.state, 'b', 'd2')).toMatchObject({ ok: false, code: 'INACTIVE' });
    expect(uncertain.state.usedCommandStarts).toBe(1);
  });

  it('replay after expiry, cancel or UNKNOWN is reference-only without new start or repair budget', () => {
    const first = admit(ledger());
    if (!first.ok) throw new Error('first admission failed');
    const afterCancel = closeTrustedTaskGrant(first.state, 'canceled');
    const afterUnknown = recordTrustedInvocationOutcome(first.state, 'attempt-1', 'unknown');
    if (!afterUnknown.ok) throw new Error('outcome failed');
    for (const state of [first.state, afterCancel, afterUnknown.state]) {
      const replay = admit(state, 'attempt-1', 'digest-1', 1100);
      expect(replay).toMatchObject({ ok: true, replayed: true });
      if (replay.ok) {
        expect(replay.state).toBe(state);
        expect(replay.state.usedCommandStarts).toBe(1);
        expect(replay.state.usedRepairs).toBe(0);
      }
      expect(admit(state, 'attempt-1', 'changed-digest', 1100)).toMatchObject({ ok: false, code: 'REPLAY_CONFLICT' });
    }
    expect(admit(afterCancel, 'fresh', 'digest-2', 1100)).toMatchObject({ ok: false, code: 'INACTIVE' });
    expect(admit(first.state, 'fresh', 'digest-2', 1100)).toMatchObject({ ok: false, code: 'EXPIRED' });
  });

  it('cancellation and completion close admissions without modifying prior ledger', () => {
    const original = ledger();
    const cancelled = closeTrustedTaskGrant(original, 'canceled');
    const complete = closeTrustedTaskGrant(original, 'completed');
    expect(admit(cancelled)).toMatchObject({ ok: false, code: 'INACTIVE' });
    expect(admit(complete)).toMatchObject({ ok: false, code: 'INACTIVE' });
    expect(original.status).toBe('active');
    const first = admit(original);
    if (!first.ok) throw new Error('first admission failed');
    expect(closeTrustedTaskGrant(first.state, 'completed')).toMatchObject({ status: 'quarantined' });
  });

  it('limits repair attempts independently of command starts', () => {
    const first = reserveTrustedRepair(ledger(), context, 200);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.usedRepairs).toBe(1);
    expect(reserveTrustedRepair(first.state, context, 201)).toMatchObject({ ok: false, code: 'BUDGET_EXHAUSTED' });
    expect(reserveTrustedRepair(first.state, context, 1100)).toMatchObject({ ok: false, code: 'EXPIRED' });
    expect(first.state.usedCommandStarts).toBe(0);
    expect(ledger().usedRepairs).toBe(0);
  });
});
