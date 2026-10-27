import { describe, expect, it } from 'vitest';
import { createTrustedTaskLedger, reserveTrustedInvocation, closeTrustedTaskGrant } from '../../domain/src/trusted-task-grant.js';
import {
  createTrustedSupervisorState, reduceTrustedSupervisor,
  type TrustedSupervisorEvent, type TrustedSupervisorState,
} from '../../domain/src/trusted-supervisor.js';
import {
  TrustedSupervisorEventSchema, TrustedSupervisorReceiptSchema,
} from '../../contracts/src/trusted-supervisor.js';

const grant = {
  profile: 'trusted-agent-host-v1' as const, taskId: 'task-1', grantVersion: 1,
  controllerId: 'controller-1', sessionId: 'session-1', workspaceId: 'workspace-1',
  workspaceGeneration: 'gen-1', scopeRevision: 'scope-1',
  issuedAtMs: 100, expiresAtMs: 1100, maxCommandStarts: 2, maxRepairs: 1,
};
const context = {
  taskId: grant.taskId, grantVersion: grant.grantVersion, controllerId: grant.controllerId,
  sessionId: grant.sessionId, workspaceId: grant.workspaceId,
  workspaceGeneration: grant.workspaceGeneration, scopeRevision: grant.scopeRevision,
};
const intent = { invocationKey: 'attempt-1', commandDigest: 'digest-1' };

function prepared(): TrustedSupervisorState {
  const reservation = reserveTrustedInvocation(createTrustedTaskLedger(grant), context, intent, 200);
  if (!reservation.ok) throw new Error('test setup failed');
  return createTrustedSupervisorState(reservation.state, context, intent, 200, 900);
}
type EventKind = TrustedSupervisorEvent['kind'];
function simulated(kind: EventKind, id: string, atMs: number, extra: Record<string, unknown> = {}): TrustedSupervisorEvent {
  return {
    ...context, ...intent, kind, eventId: id, eventDigest: 'hash-' + id,
    evidenceId: 'receipt-' + id, atMs, ...extra,
  } as TrustedSupervisorEvent;
}
function step(state: TrustedSupervisorState, event: TrustedSupervisorEvent): TrustedSupervisorState {
  const result = reduceTrustedSupervisor(state, event);
  if (!result.ok) throw new Error('unexpected rejection: ' + result.code);
  return result.state;
}
function running(): TrustedSupervisorState {
  return step(step(prepared(), simulated('held', 'e1', 210)), simulated('released', 'e2', 220));
}
function receipts(state: TrustedSupervisorState, rootCode = 0): TrustedSupervisorState {
  let next = step(state, simulated('root-exit', 'e3', 230, { exitCode: rootCode }));
  next = step(next, simulated('job-zero', 'e4', 240));
  next = step(next, simulated('io-quiescent', 'e5', 250));
  next = step(next, simulated('handles-closed', 'e6', 260));
  return step(next, simulated('audit-committed', 'e7', 270));
}

describe('Trusted supervisor — simulated pure lifecycle only, NO OS proof', () => {
  it('creates immutable reservation-bound state, not a launcher or auth token', () => {
    const initial = prepared();
    expect(initial.phase).toBe('PREPARED');
    expect(initial.admissionsClosed).toBe(true);
    expect(initial.usedCommandStarts).toBe(1);
    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.events)).toBe(true);
    expect('executable' in initial).toBe(false);
    expect('launchPermission' in initial).toBe(false);
    const inactive = closeTrustedTaskGrant(createTrustedTaskLedger(grant), 'canceled');
    expect(() => createTrustedSupervisorState(inactive, context, intent, 200, 900)).toThrow('INVALID_SUPERVISOR_RESERVATION');
    expect(() => createTrustedSupervisorState(createTrustedTaskLedger(grant), { ...context, sessionId: 'elsewhere' }, intent, 200, 900)).toThrow('INVALID_SUPERVISOR_RESERVATION');
  });

  it('requires held before release and denies cancel-before-release simulated launch', () => {
    const initial = prepared();
    expect(reduceTrustedSupervisor(initial, simulated('released', 'early', 210))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    const held = step(initial, simulated('held', 'e1', 210));
    const canceled = step(held, simulated('stop-requested', 'cancel', 215, { reason: 'cancel' }));
    expect(canceled.phase).toBe('STOPPING');
    expect(canceled.obligations).toContain('STOP_REQUIRED');
    expect(reduceTrustedSupervisor(canceled, simulated('released', 'e2', 220))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    expect(initial.phase).toBe('PREPARED');
  });

  it('simulated root exit cannot finalize before descendants, I/O and handles settle', () => {
    const run = running();
    const exited = step(run, simulated('root-exit', 'e3', 230, { exitCode: 0 }));
    expect(exited.phase).toBe('FINALIZING');
    expect(reduceTrustedSupervisor(exited, simulated('finalize', 'too-early', 235))).toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    const zero = step(exited, simulated('job-zero', 'e4', 240));
    expect(reduceTrustedSupervisor(zero, simulated('finalize', 'still-early', 245))).toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    expect(reduceTrustedSupervisor(zero, simulated('handles-closed', 'out-of-order', 246))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    expect(run.phase).toBe('RUNNING');
  });

  it('only complete simulated receipts permit terminal success', () => {
    const done = step(receipts(running()), simulated('finalize', 'e8', 280));
    expect(done).toMatchObject({
      phase: 'TERMINAL', outcome: 'SUCCEEDED', admissionsClosed: true,
      evidence: { rootExitCode: 0, jobZero: true, ioQuiescent: true, handlesClosed: true, auditCommitted: true },
    });
    expect(Object.isFrozen(done.evidence)).toBe(true);
    expect(reduceTrustedSupervisor(done, simulated('released', 'late', 290))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    const failed = step(receipts(running(), 2), simulated('finalize', 'e8', 280));
    expect(failed).toMatchObject({ phase: 'TERMINAL', outcome: 'FAILED' });
  });

  it('cancel after release retains stop obligation until independent simulated cleanup', () => {
    const canceled = step(running(), simulated('stop-requested', 'cancel', 225, { reason: 'cancel' }));
    expect(canceled.phase).toBe('STOPPING');
    expect(canceled.admissionsClosed).toBe(true);
    expect(canceled.evidence.jobZero).toBe(false);
    expect(reduceTrustedSupervisor(canceled, simulated('finalize', 'early', 226))).toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    const result = step(receipts(canceled), simulated('finalize', 'e8', 280));
    expect(result).toMatchObject({ phase: 'TERMINAL', outcome: 'CANCELED' });
  });

  it('simulated failed cleanup or audit dominates a zero exit code', () => {
    const afterExit = step(running(), simulated('root-exit', 'e3', 230, { exitCode: 0 }));
    const cleanup = step(afterExit, simulated('cleanup-failed', 'failure', 235));
    expect(cleanup).toMatchObject({ phase: 'UNKNOWN', outcome: 'UNKNOWN', admissionsClosed: true });
    expect(cleanup.obligations).toContain('STOP_REQUIRED');
    expect(reduceTrustedSupervisor(cleanup, simulated('finalize', 'e8', 250))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
    const audit = step(receipts(running()), simulated('audit-failed', 'failure', 275));
    expect(audit).toMatchObject({ phase: 'UNKNOWN', outcome: 'UNKNOWN' });
    expect(reduceTrustedSupervisor(audit, simulated('finalize', 'e8', 280))).toMatchObject({ ok: false, code: 'OUT_OF_ORDER' });
  });

  it('controller loss, deadline and heartbeat loss demand stop, never renew deadline', () => {
    for (const reason of ['controller-lost', 'heartbeat-lost'] as const) {
      const stopped = step(running(), simulated('stop-requested', reason, 230, { reason }));
      expect(stopped).toMatchObject({ phase: 'STOPPING', deadlineMs: 900 });
    }
    const heartbeat = step(running(), simulated('heartbeat', 'alive', 890));
    expect(heartbeat.deadlineMs).toBe(900);
    expect(reduceTrustedSupervisor(heartbeat, simulated('released', 'too-late', 900))).toMatchObject({ ok: false });
    const deadline = step(heartbeat, simulated('stop-requested', 'deadline', 900, { reason: 'deadline' }));
    expect(deadline).toMatchObject({ phase: 'STOPPING', admissionsClosed: true, deadlineMs: 900 });
    expect(reduceTrustedSupervisor(prepared(), simulated('held', 'expired', 900))).toMatchObject({ ok: false, code: 'DEADLINE' });
  });

  it('late simulated receipts or finalization after the absolute deadline cannot claim success', () => {
    const lateRoot = step(running(), simulated('root-exit', 'late-root', 950, { exitCode: 0 }));
    expect(lateRoot).toMatchObject({ phase: 'STOPPING', stopReason: 'deadline' });
    const lateFinal = step(receipts(running()), simulated('finalize', 'late-final', 900));
    expect(lateFinal).toMatchObject({ phase: 'TERMINAL', outcome: 'CANCELED' });
  });

  it('is idempotent on identical event, rejects conflict, stale event and identity mismatch', () => {
    const initial = prepared();
    const first = simulated('held', 'e1', 210);
    const held = step(initial, first);
    const duplicate = reduceTrustedSupervisor(held, first);
    expect(duplicate).toMatchObject({ ok: true });
    if (duplicate.ok) expect(duplicate.state).toBe(held);
    expect(reduceTrustedSupervisor(held, { ...first, eventDigest: 'different' })).toMatchObject({ ok: false, code: 'EVENT_CONFLICT' });
    expect(reduceTrustedSupervisor(held, simulated('released', 'stale', 209))).toMatchObject({ ok: false, code: 'STALE_EVENT' });
    for (const mismatch of [
      { taskId: 'other' }, { grantVersion: 2 }, { controllerId: 'other' },
      { sessionId: 'other' }, { workspaceId: 'other' }, { workspaceGeneration: 'other' },
      { scopeRevision: 'other' }, { invocationKey: 'other' }, { commandDigest: 'other' },
    ]) {
      expect(reduceTrustedSupervisor(held, { ...simulated('released', 'e2', 220), ...mismatch })).toMatchObject({ ok: false, code: 'IDENTITY_MISMATCH' });
    }
    expect(held.events).toHaveLength(1);
  });

  it('denies unknown or malformed events instead of silently accepting new fields', () => {
    const state = prepared();
    expect(reduceTrustedSupervisor(state, { ...simulated('held', 'e1', 210), argv: ['unsafe'] } as unknown as TrustedSupervisorEvent))
      .toMatchObject({ ok: false, code: 'INVALID_EVENT' });
    expect(reduceTrustedSupervisor(state, { ...simulated('held', 'e1', 210), atMs: Number.NaN }))
      .toMatchObject({ ok: false, code: 'INVALID_EVENT' });
    expect(reduceTrustedSupervisor(state, { ...simulated('held', 'e1', 210), kind: 'launch' } as unknown as TrustedSupervisorEvent))
      .toMatchObject({ ok: false, code: 'INVALID_EVENT' });
  });

  it('strict DTO schemas exclude command text, output, secrets, handles and approval claims', () => {
    const event = simulated('root-exit', 'e3', 230, { exitCode: 0 });
    expect(TrustedSupervisorEventSchema.safeParse(event).success).toBe(true);
    for (const forbidden of ['stdout', 'stderr', 'command', 'source', 'credentials', 'executable',
      'argv', 'cwd', 'env', 'handle', 'approved', 'pid', 'token']) {
      expect(TrustedSupervisorEventSchema.safeParse({ ...event, [forbidden]: 'secret' }).success).toBe(false);
    }
    expect(TrustedSupervisorEventSchema.safeParse({ ...event, exitCode: Number.NaN }).success).toBe(false);
    expect(TrustedSupervisorReceiptSchema.safeParse({
      ...context, ...intent, phase: 'TERMINAL', outcome: 'SUCCEEDED',
      rootExitCode: 0, jobZero: true, ioQuiescent: true, handlesClosed: true, auditCommitted: true,
      admissionsClosed: true,
    }).success).toBe(true);
    expect(TrustedSupervisorReceiptSchema.safeParse({
      ...context, ...intent, phase: 'TERMINAL', outcome: 'SUCCEEDED',
      rootExitCode: 0, jobZero: true, ioQuiescent: true, handlesClosed: true, auditCommitted: true,
      admissionsClosed: true, secret: 'no',
    }).success).toBe(false);
  });
});
