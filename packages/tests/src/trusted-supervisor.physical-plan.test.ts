import { describe, expect, it } from 'vitest';
import {
  PROOF_CASES, PROOF_CREATION_LIMITS, validateProofManifest, createProofPlan,
  reserveProofRoot, applyProofEvidence, type ProofPlan, type ProofEvent, type ProofManifest,
} from './trusted-supervisor.physical.proof.js';

const digest = 'a'.repeat(64);
const fixture: ProofManifest = {
  campaignId: 'campaign-test',
  workspacePath: 'C:\\__FAKE_TEST_ONLY__\\fixture',
  workspaceDigest: 'b'.repeat(64),
  manifestDigest: 'c'.repeat(64),
  supervisorDigest: 'd'.repeat(64),
  proofBinaryDigest: 'e'.repeat(64),
  expiresAtMs: 9000,
  issuedAtMs: 100,
  rootBudget: 13,
  creationRequestBudget: 62,
  caseIds: ['Z1', 'Z2', '01', '02', '03', '04', '05', '06', '07',
    '08', '09', '10', '11', '12', 'Z3', 'Z4', '13'],
};
const admit = (plan: ProofPlan, caseId = '01', key = 'attempt-1', atMs = 200) =>
  reserveProofRoot(plan, { caseId, invocationKey: key, invocationDigest: digest, atMs });
function first(caseId = '01'): ProofPlan {
  const result = admit(createProofPlan(fixture), caseId);
  if (!result.ok) throw Error(result.code);
  return result.plan;
}
function effect(plan: ProofPlan, kind: ProofEvent['kind'], atMs: number, data: Record<string, unknown> = {}): ProofPlan {
  const result = applyProofEvidence(plan, {
    caseId: plan.attempts[0]!.caseId, invocationKey: 'attempt-1', kind, atMs, ...data,
  } as ProofEvent);
  if (!result.ok) throw Error(result.code);
  return result.plan;
}

describe('2B code-only proof plan — pure in-memory, never physical execution', () => {
  it('rejects malformed or ambient-authority manifest and never exposes launcher', () => {
    expect(validateProofManifest(fixture)).toEqual({ ok: true });
    for (const extra of [{ executable: 'cmd.exe' }, { argv: ['whoami'] }, { env: {} },
      { cwd: 'C:\\Temp' }, { approved: true }, { token: 'secret' }, { handles: [123] }]) {
      expect(validateProofManifest({ ...fixture, ...extra })).toMatchObject({ ok: false });
    }
    for (const changed of [
      { manifestDigest: 'not-sha256' }, { workspacePath: '..\\escape' },
      { workspacePath: 'C:\\__FAKE_TEST_ONLY__\\..\\escape' },
      { issuedAtMs: Number.NaN }, { expiresAtMs: Number.POSITIVE_INFINITY },
      { rootBudget: 12 }, { creationRequestBudget: 63 },
      { caseIds: ['01'] }, { caseIds: [...fixture.caseIds, 'inject'] },
      { supervisorDigest: null },
    ]) expect(validateProofManifest({ ...fixture, ...changed })).toMatchObject({ ok: false });
    const { manifestDigest: _digest, ...noDigest } = fixture; void _digest;
    expect(validateProofManifest(noDigest)).toMatchObject({ ok: false });
    expect('startPhysical' in createProofPlan(fixture)).toBe(false);
    expect('executable' in createProofPlan(fixture)).toBe(false);
  });

  it('retains exact 17-case matrix with 13 roots, four zero-root checks, 62 requests accounting', () => {
    expect(PROOF_CASES).toHaveLength(17);
    expect(PROOF_CASES.filter((c) => c.commandRoots === 1)).toHaveLength(13);
    expect(PROOF_CASES.filter((c) => c.commandRoots === 0).map((c) => c.id)).toEqual(['Z1', 'Z2', 'Z3', 'Z4']);
    expect(PROOF_CREATION_LIMITS).toEqual({
      observer: 1, controllers: 13, supervisors: 13, commandRootRequests: 13,
      descendantRequests: 22, totalProofRequests: 62,
    });
    const plan = createProofPlan(fixture);
    expect(plan.remainingRootBudget).toBe(13);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.attempts)).toBe(true);
    expect(reserveProofRoot(plan, { caseId: 'Z1', invocationKey: 'a', invocationDigest: digest, atMs: 200 }))
      .toMatchObject({ ok: false, code: 'ZERO_ROOT_CASE' });
  });

  it('charges invalid create failure and never refunds or relaunches replay', () => {
    const charged = first('03');
    expect(charged.remainingRootBudget).toBe(12);
    const failed = effect(charged, 'creation-failed', 210);
    expect(failed.attempts[0]).toMatchObject({ phase: 'TERMINAL', outcome: 'FAILED' });
    expect(failed.remainingRootBudget).toBe(12);
    const replay = admit(failed, '03');
    expect(replay).toMatchObject({ ok: true, replayed: true });
    if (replay.ok) expect(replay.plan).toBe(failed);
    expect(reserveProofRoot(failed, { caseId: '03', invocationKey: 'attempt-1', invocationDigest: 'f'.repeat(64), atMs: 250 }))
      .toMatchObject({ ok: false, code: 'REPLAY_CONFLICT' });
  });

  it('enforces one active attempt and budget exhaustion, with no automatic retries', () => {
    const pending = first();
    expect(admit(pending, '02', 'another')).toMatchObject({ ok: false, code: 'BUSY' });
    let state = createProofPlan(fixture);
    for (const row of PROOF_CASES.filter((c) => c.commandRoots === 1)) {
      const next = admit(state, row.id, 'unique-' + row.id);
      if (!next.ok) throw Error(next.code);
      state = effectFor(next.plan, 'unknown', row.id, 'unique-' + row.id);
      // UNKNOWN permanently quarantines the entire campaign.
      expect(admit(state, '12', 'more')).toMatchObject({ ok: false, code: 'QUARANTINED' });
      break;
    }
    expect(reserveProofRoot(createProofPlan(fixture), { caseId: 'not-a-case', invocationKey: 'x', invocationDigest: digest, atMs: 200 }))
      .toMatchObject({ ok: false, code: 'UNKNOWN_CASE' });
  });

  it('charges all 13 distinct mock root slots and denies 14th allocation', () => {
    let state = createProofPlan(fixture);
    let counter = 0;
    for (const row of PROOF_CASES.filter((c) => c.commandRoots === 1)) {
      counter += 1;
      const key = 'charged-' + counter;
      const result = admit(state, row.id, key);
      if (!result.ok) throw new Error(result.code);
      state = result.plan;
      if (row.id === '03') {
        state = effectFor(state, 'creation-failed', row.id, key);
      } else {
        for (const [kind, data] of [
          ['held', {}], ['release', {}], ['root-exit', { exitCode: 0 }],
          ['job-zero', {}], ['io-joined', {}], ['handles-closed', {}],
          ['audit-committed', {}], ['finalize', {}],
        ] as const) {
          const next = applyProofEvidence(state, {
            caseId: row.id, invocationKey: key, kind, atMs: 220, ...data,
          } as ProofEvent);
          if (!next.ok) throw Error(next.code);
          state = next.plan;
        }
      }
    }
    expect(counter).toBe(13);
    expect(state.remainingRootBudget).toBe(0);
    expect(admit(state, '01', 'extra-key')).toMatchObject({ ok: false, code: 'BUDGET_EXHAUSTED' });
    expect(admit(state, '01', 'charged-1')).toMatchObject({ ok: true, replayed: true });
  });

  it('replay after cancel, deadline or loss is never fresh authority', () => {
    const held = effect(first(), 'held', 210);
    const stopped = effect(held, 'cancel', 215);
    expect(admit(stopped)).toMatchObject({ ok: true, replayed: true });
    expect(admit(stopped, '02', 'new')).toMatchObject({ ok: false, code: 'BUSY' });
    const late = applyProofEvidence(held, { caseId: '01', invocationKey: 'attempt-1', kind: 'release', atMs: 9000 });
    expect(late).toMatchObject({ ok: false, code: 'RELEASE_FENCED' });
    const auditLost = effect(held, 'audit-failed', 215);
    expect(admit(auditLost)).toMatchObject({ ok: true, replayed: true });
    expect(admit(auditLost, '02', 'new')).toMatchObject({ ok: false, code: 'QUARANTINED' });
  });

  it('held cancellation fences release and running cancellation retains STOP obligation', () => {
    const held = effect(first(), 'held', 210);
    const before = effect(held, 'cancel', 215);
    expect(before.attempts[0]).toMatchObject({ phase: 'STOPPING', admissionsClosed: true });
    expect(before.attempts[0]?.obligations).toContain('STOP_REQUIRED');
    expect(applyProofEvidence(before, { caseId: '01', invocationKey: 'attempt-1', kind: 'release', atMs: 220 }))
      .toMatchObject({ ok: false, code: 'RELEASE_FENCED' });
    const running = effect(held, 'release', 220);
    const after = effect(running, 'cancel', 225);
    expect(after.attempts[0]).toMatchObject({ phase: 'STOPPING', outcome: null });
    expect(after.attempts[0]?.evidence.jobZero).toBe(false);
  });

  it('never classifies success without all distinct simulated receipts', () => {
    const running = effect(effect(first(), 'held', 210), 'release', 220);
    const root = effect(running, 'root-exit', 230, { exitCode: 0 });
    expect(root.attempts[0]?.outcome).toBe(null);
    expect(applyProofEvidence(root, { caseId: '01', invocationKey: 'attempt-1', kind: 'finalize', atMs: 231 }))
      .toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    const zero = effect(root, 'job-zero', 235);
    expect(applyProofEvidence(zero, { caseId: '01', invocationKey: 'attempt-1', kind: 'finalize', atMs: 240 }))
      .toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    const io = effect(zero, 'io-joined', 245);
    const closed = effect(io, 'handles-closed', 250);
    expect(applyProofEvidence(closed, { caseId: '01', invocationKey: 'attempt-1', kind: 'finalize', atMs: 255 }))
      .toMatchObject({ ok: false, code: 'INCOMPLETE_EVIDENCE' });
    const audit = effect(closed, 'audit-committed', 260);
    const finished = effect(audit, 'finalize', 265);
    expect(finished.attempts[0]).toMatchObject({ phase: 'TERMINAL', outcome: 'SUCCEEDED' });
  });

  it('audit loss, output overflow, supervisor death or missing evidence quarantines without forged cleanup', () => {
    for (const kind of ['audit-failed', 'output-overflow', 'supervisor-death', 'unknown'] as const) {
      const running = effect(effect(first(), 'held', 210), 'release', 220);
      const lost = effect(running, kind, 230);
      expect(lost.attempts[0]).toMatchObject({ phase: 'UNKNOWN', outcome: 'UNKNOWN' });
      expect(lost.attempts[0]?.evidence).toMatchObject({ jobZero: false, ioJoined: false, handlesClosed: false });
      expect(admit(lost, '12', 'another')).toMatchObject({ ok: false, code: 'QUARANTINED' });
      const same = admit(lost);
      expect(same).toMatchObject({ ok: true, replayed: true });
    }
  });

  it('rejects stale time, deadline release and mismatched synthetic receipt', () => {
    const held = effect(first(), 'held', 210);
    expect(applyProofEvidence(held, { caseId: '01', invocationKey: 'wrong', kind: 'release', atMs: 220 }))
      .toMatchObject({ ok: false, code: 'UNKNOWN_INVOCATION' });
    expect(applyProofEvidence(held, { caseId: '01', invocationKey: 'attempt-1', kind: 'release', atMs: 205 }))
      .toMatchObject({ ok: false, code: 'STALE_EVENT' });
    expect(applyProofEvidence(held, { caseId: '01', invocationKey: 'attempt-1', kind: 'release', atMs: 9000 }))
      .toMatchObject({ ok: false, code: 'RELEASE_FENCED' });
  });
});
function effectFor(plan: ProofPlan, kind: ProofEvent['kind'], caseId: string, invocationKey: string): ProofPlan {
  const result = applyProofEvidence(plan, { caseId, invocationKey, kind, atMs: 220 } as ProofEvent);
  if (!result.ok) throw Error(result.code);
  return result.plan;
}
