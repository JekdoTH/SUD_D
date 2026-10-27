import { createHmac } from 'node:crypto';
import type { SoloExpertApprovalReview } from '../../domain/src/approval.js';
import { describe, expect, it } from 'vitest';
import { appError, err, ok, type ApprovalRequestRecord, type AuditEvent } from '@sud-d/domain';
import type { ApprovalRepository, NewApprovalRequest } from '@sud-d/infrastructure';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import { createToolKernel, createToolCapabilityRegistry } from '../../application/src/tool-kernel.js';
import { createSoloExpertB1aIntegration } from '../../application/src/solo-expert-serena-integration.js';
import { SOLO_B1_COMMAND, type SoloExpertReview, type SoloExpertAttemptState } from '../../domain/src/solo-expert-serena.js';

const POISON = 'SYNTHETIC_POISON_NEVER_LEAK';
let seq = 0;
function repository(): ApprovalRepository {
  const rows = new Map<string, ApprovalRequestRecord>();
  const latest = (rt: string, digest: string) => [...rows.values()].reverse()
    .find(x => x.runtimeInstanceId === rt && x.bindingDigest === digest);
  return {
    findById: id => ok(rows.get(id)),
    findLatest: (rt, dg) => ok(latest(rt, dg)),
    createPending: (input: NewApprovalRequest) => {
      const {soloExpertReview: review, ...base} = input;
      const row: ApprovalRequestRecord = { ...base,
        ...(review ? { soloExpertReview: review as unknown as SoloExpertApprovalReview } : {}),
        id: `b1a-approval-${++seq}`, status: 'pending' };
      rows.set(row.id, row); return ok(row);
    },
    recordModeApproval: (input, now) => {
      const {soloExpertReview: review, ...base} = input;
      const row: ApprovalRequestRecord = { ...base,
        ...(review ? { soloExpertReview: review as unknown as SoloExpertApprovalReview } : {}),
        id: `b1a-mode-${++seq}`, status: 'consumed',
        decisionSource: 'mode', decidedAt: now, consumedAt: now };
      rows.set(row.id, row); return ok(row);
    },
    countActive: (rt, now = '1970-01-01T00:00:00.000Z') => ok([...rows.values()].filter(x => x.runtimeInstanceId === rt &&
      ['pending', 'approved'].includes(x.status) && x.expiresAt > now).length),
    listPending: (n = 50, now = '1970-01-01T00:00:00.000Z') => ok([...rows.values()].filter(x => x.status === 'pending' && x.expiresAt > now).slice(0, n)),
    respond: (id, action, now = new Date(Date.UTC(2026, 9, 14, 9)).toISOString()) => {
      const row = rows.get(id);
      if (!row || row.status !== 'pending' || row.expiresAt <= now) return err(appError('APPROVAL_STATE_INVALID', 'no pending'));
      const upd: ApprovalRequestRecord = { ...row, status: action === 'approve' ? 'approved' : 'denied',
        decisionSource: 'user', decidedAt: now };
      rows.set(id, upd); return ok(upd);
    },
    consumeApproved: (rt, dg, now) => {
      const row = latest(rt, dg);
      if (!row || row.status !== 'approved' || row.expiresAt <= now) return ok(undefined);
      const upd: ApprovalRequestRecord = { ...row, status: 'consumed', consumedAt: now };
      rows.set(row.id, upd); return ok(upd);
    },
    expireStale: () => ok(0), expireOtherRuntimes: () => ok(0), cleanupTerminal: () => ok(0),
  };
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' +
    Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const good = () => ({
  executionKind: 'mock' as const, status: 'simulated-success' as const,
  reason: 'OK' as const, exitCode: 0,
});
function fixture(mode: 'standard' | 'full_access' = 'standard', tamperRecord?: (row: ApprovalRequestRecord) => ApprovalRequestRecord) {
  let now = Date.UTC(2026, 9, 14, 9);
  const state = {
    workspaceId: 'workspace-b1', canonicalRoot: 'C:/b1-workspace', workspaceGeneration: 'gen-1',
    session: { id: 'desktop-1', type: 'desktop' as const },
    resumed: true, revoked: false, policyContext: 'workspace' as 'workspace' | 'outside_workspace' | 'internal_root' | 'github_network',
    gatewayEpoch: 'gateway-1', managedEpoch: 'managed-1',
    deviceLabel: 'device-observed', deviceProvenance: 'unverified-observation' as const,
    accountLabel: 'account-observed', accountProvenance: 'unverified-observation' as const,
    manifestDigest: 'a'.repeat(64), artifactDigest: 'b'.repeat(64),
    configDigest: 'c'.repeat(64), schemaDigest: 'd'.repeat(64),
    integrity: 'synthetic-fixture' as 'synthetic-fixture' | 'unverified',
  };
  const ready = { workspaceId: state.workspaceId, canonicalRoot: state.canonicalRoot,
    workspaceGeneration: state.workspaceGeneration, managedEpoch: state.managedEpoch,
    manifestDigest: state.manifestDigest, artifactDigest: state.artifactDigest,
    configDigest: state.configDigest, schemaDigest: state.schemaDigest, integrity: 'synthetic-fixture' as const };
  const ledgerRecords = new Map<string, SoloExpertAttemptState>();
  let failClaim = false, failPrepare = false, failClose = false;
  const claimed: string[] = [];
  const events: Array<Omit<AuditEvent, 'id'>> = [];
  const calls: SoloExpertReview[] = [];
  let failPre = false, failPost = false, failVerify = false;
  let response: () => Promise<ReturnType<typeof good> | { executionKind: 'mock'; status: 'unknown'; reason: 'TRANSPORT_UNKNOWN' }> =
    async () => good();
  const repo = repository();
  const hmacKey = Buffer.alloc(32, 19);
  const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'b1a-runtime',
    hmacKey, now: () => new Date(now), mode: () => mode, preserveOtherRuntimes: true });
  const audit = { append(e: Omit<AuditEvent, 'id'>) {
    if (e.metadata.phase === 'pre_execution' && failPre) throw Error(POISON);
    if (e.metadata.phase === 'outcome' && failPost) throw Error(POISON);
    events.push(e);
  } };
  const underlyingDecision = createApprovalService(repo, audit, () => new Date(now));
  // B1a test caller models the actual reviewed Desktop projection; never skip digest validation.
  const decision = {
    ...underlyingDecision,
    respond(id: string, action: 'approve' | 'deny', shownDigest?: string) {
      const pending = repo.findById(id);
      const displayed = pending.ok ? (
        pending.value as ApprovalRequestRecord & {soloExpertReview?: {reviewDigest:string}}
      )?.soloExpertReview?.reviewDigest : undefined;
      return underlyingDecision.respond(id, action, shownDigest ?? displayed);
    },
    respondWithoutDigest: (id: string) => underlyingDecision.respond(id, 'approve'),
  };
  const integration = createSoloExpertB1aIntegration({
    identity: () => ({ ...state, session: { ...state.session } }),
    ready: {
      inspect: () => ({ ...ready }),
      invoke: async (r: SoloExpertReview) => { calls.push(r); return response(); },
    },
    ledger: {
      prepare: async (review: SoloExpertReview) => {
        if (failPrepare || [...ledgerRecords.values()].some(x => x === 'claimed' || x === 'unknown')) return false;
        ledgerRecords.set(review.attemptId, 'prepared'); return true;
      },
      claim: async (id: string) => {
        if (failClaim || ledgerRecords.get(id) !== 'prepared') return false;
        ledgerRecords.set(id, 'claimed'); claimed.push(id); return true;
      },
      close: async (id: string) => {
        if (failClose || ledgerRecords.get(id) !== 'claimed') return false;
        ledgerRecords.set(id, 'closed'); return true;
      },
      markUnknown: async (id: string) => { ledgerRecords.set(id, 'unknown'); },
      state: async (id: string) => ledgerRecords.get(id),
    },
    verifyConsumedManual: async ({ record, request, approvalRequestId }) => {
      if (failVerify || !record || record.id !== approvalRequestId) return false;
      const digest = createHmac('sha256', hmacKey).update(stable({
        runtimeInstanceId: 'b1a-runtime', capability: request.capability, effect: request.effect,
        security: { sensitivity: request.security.sensitivity, context: request.security.context,
          workspaceId: request.security.workspaceId ?? null }, binding: request.binding,
      }), 'utf8').digest('hex');
      return record.bindingDigest === digest;
    },
    approvals: { findById: id => {
      const r = repo.findById(id);
      return r.ok && r.value && tamperRecord ? ok(tamperRecord(r.value)) : r;
    } },
    coordinatorRuntimeId: coordinator.runtimeInstanceId,
    now: () => now,
  });
  const registry = createToolCapabilityRegistry([integration.capability]);
  if (!registry.ok) throw Error('registry');
  const kernel = createToolKernel({ registry: registry.value, audit, approval: coordinator });
  const prepare = async () => {
    const v = await integration.prepare({});
    if (!v.ok) throw Error('prepare failed');
    return v.value;
  };
  const invoke = (review: SoloExpertReview) => integration.invokeThroughKernel(kernel, review);
  const pending = async (r: SoloExpertReview) => {
    const v = await invoke(r);
    expect(v).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    if (v.ok || !v.approvalRequestId) throw Error('missing id');
    return v.approvalRequestId;
  };
  return { state, ready, integration, calls, events, claimed, ledgerRecords, repo,
    prepare, invoke, pending, decision, coordinator,
    advance: (delta: number) => { now += delta; },
    failPre: () => { failPre = true; }, failPost: () => { failPost = true; },
    failVerify: () => { failVerify = true; }, failPrepare: () => { failPrepare = true; },
    failClaim: () => { failClaim = true; }, failClose: () => { failClose = true; },
    response: (fn: typeof response) => { response = fn; },
  };
}
describe('B1a private Kernel policy/Approval/ledger admission', () => {
  it('strict empty intent and missing ports fail closed without calls', async () => {
    const h = fixture();
    for (const input of [{ attemptId: 'untrusted' }, { command: 'echo bad' },
      { cwd: 'C:/other' }, { argv: [] }, { env: {} }, { approved: true },
      { tool: 'execute_shell_command' }, Object.create(null),
      Object.defineProperty({}, 'x', { get: () => { throw Error(POISON); } })]) {
      expect((await h.integration.prepare(input)).ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });
  it('must consume exact human Approval through Kernel; closes only after outcome audit', async () => {
    const h = fixture();
    const r = await h.prepare();
    expect(r.profileId).toBe('harmless-short-smoke');
    expect(SOLO_B1_COMMAND).toBe('echo SUD_D_B1_OK');
    expect(r.riskDisclosure).toContain('Stock Serena');
    const id = await h.pending(r);
    expect(h.calls).toHaveLength(0);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    expect(await h.invoke(r)).toMatchObject({ ok: true, code: 'EXECUTED',
      value: { executionKind: 'mock', status: 'simulated-success' } });
    expect(h.calls).toHaveLength(1);
    expect(h.ledgerRecords.get(r.attemptId)).toBe('closed');
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.calls).toHaveLength(1);
    expect(JSON.stringify({ events: h.events, result: r })).not.toContain(POISON);
  });

  it('full_access still requires a human consumed approval', async () => {
    const h = fixture('full_access'); const r = await h.prepare();
    const id = await h.pending(r);
    expect(h.calls).toHaveLength(0);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    expect(await h.invoke(r)).toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(h.repo.findById(id)).toMatchObject({ ok: true, value: { status: 'consumed', decisionSource: 'user' } });
  });
  it.each([
    ['mode', (r: ApprovalRequestRecord) => ({ ...r, decisionSource: 'mode' as const })],
    ['unconsumed', (r: ApprovalRequestRecord) => ({ ...r, status: 'approved' as const })],
    ['digest', (r: ApprovalRequestRecord) => ({ ...r, bindingDigest: 'f'.repeat(64) })],
    ['runtime', (r: ApprovalRequestRecord) => ({ ...r, runtimeInstanceId: 'other' })],
    ['request', (r: ApprovalRequestRecord) => ({ ...r, id: 'other' })],
    ['session', (r: ApprovalRequestRecord) => ({ ...r, sessionId: 'other' })],
    ['workspace', (r: ApprovalRequestRecord) => ({ ...r, workspaceId: 'other' })],
    ['expired', (r: ApprovalRequestRecord) => ({ ...r, expiresAt: '2020-01-01T00:00:00Z' })],
  ] as const)('tampered %s receipt never claims or calls transport', async (_name, tamper) => {
    const h = fixture('standard', tamper);
    const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.claimed).toHaveLength(0); expect(h.calls).toHaveLength(0);
  });
  it('approval digest verifier is required even with consumed record', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.failVerify();
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
  it.each([
    ['root', (h: ReturnType<typeof fixture>) => { h.state.canonicalRoot = 'C:/changed'; }],
    ['generation', (h: ReturnType<typeof fixture>) => { h.state.workspaceGeneration = 'changed'; }],
    ['session', (h: ReturnType<typeof fixture>) => { h.state.session.id = 'changed'; }],
    ['gateway', (h: ReturnType<typeof fixture>) => { h.state.gatewayEpoch = 'changed'; }],
    ['managed', (h: ReturnType<typeof fixture>) => { h.state.managedEpoch = 'changed'; }],
    ['manifest', (h: ReturnType<typeof fixture>) => { h.state.manifestDigest = 'f'.repeat(64); }],
    ['artifact', (h: ReturnType<typeof fixture>) => { h.state.artifactDigest = 'f'.repeat(64); }],
    ['config', (h: ReturnType<typeof fixture>) => { h.state.configDigest = 'f'.repeat(64); }],
    ['schema', (h: ReturnType<typeof fixture>) => { h.state.schemaDigest = 'f'.repeat(64); }],
    ['device', (h: ReturnType<typeof fixture>) => { h.state.deviceLabel = 'changed'; }],
    ['account', (h: ReturnType<typeof fixture>) => { h.state.accountLabel = 'changed'; }],
    ['resume', (h: ReturnType<typeof fixture>) => { h.state.resumed = false; }],
    ['revoked', (h: ReturnType<typeof fixture>) => { h.state.revoked = true; }],
    ['outside', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'outside_workspace'; }],
    ['internal', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'internal_root'; }],
    ['network', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'github_network'; }],
    ['attestation', (h: ReturnType<typeof fixture>) => { h.state.integrity = 'unverified'; }],
    ['ready drift', (h: ReturnType<typeof fixture>) => { h.ready.managedEpoch = 'different'; }],
  ] as const)('stale %s fails closed before fake call', async (_name, drift) => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    drift(h); expect((await h.invoke(r)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
  it('missing resume or verified runtime state fails in preparation', async () => {
    const h = fixture(); h.state.resumed = false;
    expect((await h.integration.prepare({})).ok).toBe(false);
    h.state.resumed = true; h.state.integrity = 'unverified';
    expect((await h.integration.prepare({})).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
  it('injected attempt prepare and claim failures do not dispatch', async () => {
    const h = fixture(); h.failPrepare();
    expect((await h.integration.prepare({})).ok).toBe(false);
    const n = fixture(); const r = await n.prepare(); const id = await n.pending(r);
    expect(n.decision.respond(id, 'approve').ok).toBe(true);
    n.failClaim();
    expect((await n.invoke(r)).ok).toBe(false); expect(n.calls).toHaveLength(0);
  });
  it('pre-audit failure prevents claim; post-audit failure remains UNKNOWN', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.failPre();
    expect(await h.invoke(r)).toMatchObject({ ok: false, code: 'AUDIT_PRECONDITION_FAILED' });
    expect(h.claimed).toHaveLength(0); expect(h.calls).toHaveLength(0);
    const p = fixture(); const v = await p.prepare(); const i = await p.pending(v);
    expect(p.decision.respond(i, 'approve').ok).toBe(true); p.failPost();
    expect((await p.invoke(v)).ok).toBe(false);
    expect(p.ledgerRecords.get(v.attemptId)).toBe('unknown');
    expect(p.calls).toHaveLength(1);
  });
  it('concurrent duplicate and replay make at most one transport call', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    const results = await Promise.all([h.invoke(r), h.invoke(r)]);
    expect(results.some(x => x.ok)).toBe(true); expect(h.calls).toHaveLength(1);
    expect((await h.invoke(r)).ok).toBe(false); expect(h.calls).toHaveLength(1);
  });
  it('transport UNKNOWN blocks restart admission and retries', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.response(async () => ({ executionKind: 'mock', status: 'unknown', reason: 'TRANSPORT_UNKNOWN' }));
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.ledgerRecords.get(r.attemptId)).toBe('unknown');
    expect(h.calls).toHaveLength(1); expect((await h.invoke(r)).ok).toBe(false);
    expect((await h.integration.prepare({})).ok).toBe(false);
    expect(h.calls).toHaveLength(1);
  });
  it('failed outcome close quarantines even after successful Kernel Audit', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true); h.failClose();
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.ledgerRecords.get(r.attemptId)).toBe('unknown'); expect(h.calls).toHaveLength(1);
  });
  it('expired review denies after human decision without any transport', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.advance(91000); expect((await h.invoke(r)).ok).toBe(false); expect(h.calls).toHaveLength(0);
  });

  it('denied manual approval has no transport or claim', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'deny').ok).toBe(true);
    expect(await h.invoke(r)).toMatchObject({ ok: false, code: 'APPROVAL_DENIED' });
    expect(h.calls).toHaveLength(0); expect(h.claimed).toHaveLength(0);
  });
  it('symbol/accessor, nonplain and caller command/root/env injection fail before prepare', async () => {
    const h = fixture();
    const inputs = [
      { [Symbol('approval')]: true }, Object.create({ inherited: true }),
      Object.defineProperty({}, 'secret', { enumerable: true, get: () => { throw Error(POISON); } }),
      { command: 'echo unsafe' }, { cwd: 'C:/other' }, { env: {} },
      { toolName: 'execute_shell_command' }, { argv: [] }, { approved: true },
      { workspaceRoot: 'C:/other' }, { provider: 'fake' }, { risk: 'normal' },
    ];
    for (const input of inputs) expect((await h.integration.prepare(input)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
  it('one Approval cannot authorize another reviewed attempt', async () => {
    const h = fixture(); const first = await h.prepare(); const id = await h.pending(first);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    const next = await h.prepare();
    expect(await h.invoke(next)).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(h.calls).toHaveLength(0);
    expect((await h.invoke(first)).ok).toBe(true);
    expect(h.calls).toHaveLength(1);
  });
  it('rechecks revocation after asynchronous Approval record lookup', async () => {
    const h = fixture('standard', row => { h.state.revoked = true; return row; });
    const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.claimed).toHaveLength(0); expect(h.calls).toHaveLength(0);
  });
  it('post-transport identity drift quarantines the claimed attempt', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.response(async () => { h.state.revoked = true; return good(); });
    expect((await h.invoke(r)).ok).toBe(false);
    expect(h.ledgerRecords.get(r.attemptId)).toBe('unknown');
    expect(h.calls).toHaveLength(1);
  });
  it('rejects a malformed fake success before closing attempt, including poison fields', async () => {
    const h = fixture(); const r = await h.prepare(); const id = await h.pending(r);
    expect(h.decision.respond(id, 'approve').ok).toBe(true);
    h.response(async () => ({
      executionKind: 'mock', status: 'simulated-success', reason: POISON, exitCode: 999,
    } as unknown as ReturnType<typeof good>));
    const result = await h.invoke(r);
    expect(result.ok).toBe(false);
    expect(h.ledgerRecords.get(r.attemptId)).toBe('unknown');
    expect(JSON.stringify({ result, events: h.events })).not.toContain(POISON);
  });

});
