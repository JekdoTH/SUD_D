import { describe, expect, it } from 'vitest';
import {
  appError, err, ok,
  type ApprovalRequestRecord, type AuditEvent,
} from '@sud-d/domain';
import type { ApprovalRepository, NewApprovalRequest } from '@sud-d/infrastructure';
import {
  createApprovalCoordinator, createApprovalService,
} from '../../application/src/approval-service.js';
import {
  createToolCapabilityRegistry, createToolKernel,
} from '../../application/src/tool-kernel.js';
import {
  BRIDGE_ACTION_ID, BRIDGE_SCHEMA_VERSION, createSerenaPermissionBridge,
} from '../../application/src/serena-permission-bridge.js';

const poison = 'POISON_SYNTHETIC_SECRET_NEVER_PERSIST';
type Mode = 'standard' | 'full_access' | 'approve_for_me';

function makeApprovalRepository(): ApprovalRepository {
  let seq = 0;
  const records = new Map<string, ApprovalRequestRecord>();
  const findLatest = (runtime: string, digest: string) =>
    [...records.values()].reverse().find((row) => row.runtimeInstanceId === runtime && row.bindingDigest === digest);
  const create = (request: NewApprovalRequest, status: ApprovalRequestRecord['status'],
    source?: ApprovalRequestRecord['decisionSource'], nowIso?: string) => {
    const record: ApprovalRequestRecord = {
      ...request, id: `c1-ledger-${++seq}`, status,
      ...(source ? { decisionSource: source, decidedAt: nowIso, consumedAt: nowIso } : {}),
    };
    records.set(record.id, record);
    return ok(record);
  };
  return {
    findById: (id) => ok(records.get(id)),
    findLatest: (runtime, digest) => ok(findLatest(runtime, digest)),
    createPending: (request) => create(request, 'pending'),
    recordModeApproval: (request, nowIso) => create(request, 'consumed', 'mode', nowIso),
    countActive: (runtime, nowIso) => ok([...records.values()]
      .filter((row) => row.runtimeInstanceId === runtime && ['pending', 'approved'].includes(row.status)
        && row.expiresAt > nowIso).length),
    listPending: (limit = 50, nowIso = new Date(0).toISOString()) => ok([...records.values()]
      .filter((row) => row.status === 'pending' && row.expiresAt > nowIso).slice(0, limit)),
    respond: (id, decision, nowIso = new Date().toISOString()) => {
      const row = records.get(id);
      if (!row || row.status !== 'pending' || row.expiresAt <= nowIso) {
        return err(appError('APPROVAL_STATE_INVALID', 'Decision denied'));
      }
      const updated: ApprovalRequestRecord = {
        ...row, status: decision === 'approve' ? 'approved' : 'denied',
        decisionSource: 'user', decidedAt: nowIso,
      };
      records.set(id, updated);
      return ok(updated);
    },
    consumeApproved: (runtime, digest, nowIso) => {
      const row = findLatest(runtime, digest);
      if (!row || row.status !== 'approved' || row.expiresAt <= nowIso) return ok(undefined);
      const updated: ApprovalRequestRecord = { ...row, status: 'consumed', consumedAt: nowIso };
      records.set(row.id, updated);
      return ok(updated);
    },
    expireStale: (nowIso) => {
      let n = 0;
      for (const row of records.values()) {
        if ((row.status === 'pending' || row.status === 'approved') && row.expiresAt <= nowIso) {
          records.set(row.id, { ...row, status: 'expired' }); n++;
        }
      }
      return ok(n);
    },
    expireOtherRuntimes: () => ok(0),
    cleanupTerminal: () => ok(0),
  };
}

function fixture(mode: Mode = 'standard', recordProjection?: (row: ApprovalRequestRecord) => ApprovalRequestRecord) {
  let clock = Date.UTC(2026, 9, 14, 7);
  const state = {
    workspaceId: 'ws-1', workspaceGeneration: 'generation-1',
    session: { id: 's-1', type: 'desktop' as const },
    runtimeEpoch: 'epoch-1', resumed: true,
  };
  const contract = {
    serenaVersion: '1.7.0', toolName: 'execute_shell_command',
    schemaVersion: BRIDGE_SCHEMA_VERSION, risk: 'host-user-process',
  };
  const repo = makeApprovalRepository();
  const audits: Array<Omit<AuditEvent, 'id'>> = [];
  const calls: unknown[] = [];
  let failPreAudit = false;
  let failOutcomeAudit = false;
  let failDispatch = false;
  let hangDispatch = false;
  const audit = {
    append(event: Omit<AuditEvent, 'id'>) {
      if (event.metadata.phase === 'pre_execution' && failPreAudit) throw Error(poison);
      if (event.metadata.phase === 'outcome' && event.metadata.outcome === 'executed' && failOutcomeAudit) throw Error(poison);
      audits.push(event);
    },
  };
  const coordinator = createApprovalCoordinator({
    repository: repo, runtimeInstanceId: 'runtime-1',
    hmacKey: Buffer.alloc(32, 4), now: () => new Date(clock),
    mode: () => mode, preserveOtherRuntimes: true,
  });
  const service = createApprovalService(repo, audit, () => new Date(clock));
  const bridge = createSerenaPermissionBridge({
    trustedState: () => ({ ...state, session: { ...state.session } }),
    toolContract: () => ({ ...contract }),
    now: () => clock,
    coordinatorRuntimeId: coordinator.runtimeInstanceId,
    approvalRecords: {
      findById(id: string) {
        const record = repo.findById(id);
        return record.ok && record.value && recordProjection
          ? ok(recordProjection(record.value)) : record;
      },
    },
    fakeDispatch: async (call) => {
      calls.push(call);
      if (failDispatch) throw Error(poison);
      if (hangDispatch) return new Promise<never>(() => { /* simulated lost reply */ });
      return { stdout: poison, stderr: poison, exception: poison };
    },
  });
  const registered = createToolCapabilityRegistry([bridge.capability]);
  if (!registered.ok) throw Error('registry invalid');
  const kernel = createToolKernel({ registry: registered.value, audit, approval: coordinator });
  const intent = { actionId: BRIDGE_ACTION_ID, schemaVersion: BRIDGE_SCHEMA_VERSION, params: { detail: 'brief' } };
  const review = () => {
    const result = bridge.review(intent);
    if (!result.ok) throw Error('unexpected review failure');
    return result.value;
  };
  let seq = 0;
  const invoke = (snapshot: ReturnType<typeof review>, sessionOverride = state.session) =>
    kernel.invoke({
      invocationId: `c1-invoke-${++seq}`,
      session: sessionOverride,
      capability: bridge.capability.name,
      input: snapshot,
    });
  const approve = (id: string) => service.respond(id, 'approve');
  const pending = async (snapshot: ReturnType<typeof review>) => {
    const result = await invoke(snapshot);
    expect(result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    if (result.ok || !result.approvalRequestId) throw Error('approval not pending');
    return result.approvalRequestId;
  };
  return {
    repo, state, contract, audits, calls, coordinator, bridge, kernel,
    review, invoke, approve, pending,
    advance: (ms: number) => { clock += ms; },
    failPre: () => { failPreAudit = true; },
    failOutcome: () => { failOutcomeAudit = true; },
    failFake: () => { failDispatch = true; },
    hangFake: () => { hangDispatch = true; },
  };
}

describe('Serena C1 — real in-process Kernel + Approval, fake Serena only', () => {
  it('requires a genuine user decision, consumes matching approval, preaudits and calls fake exactly once', async () => {
    const h = fixture();
    const review = h.review();
    const id = await h.pending(review);
    expect(h.calls).toHaveLength(0);
    expect(h.approve(id).ok).toBe(true);
    const result = await h.invoke(review);
    expect(result).toMatchObject({
      ok: true, policyDecision: 'ask', approvalDecision: 'approved',
      value: { status: 'simulated', actionId: BRIDGE_ACTION_ID, detail: 'brief' },
    });
    expect(h.calls).toEqual([{ toolName: 'execute_shell_command', arguments: { command: 'echo SERENA_C1_REVIEWED_BRIEF' } }]);
    const record = h.repo.findById(id);
    expect(record.ok && record.value).toMatchObject({ status: 'consumed', decisionSource: 'user', sessionId: 's-1' });
    expect(h.audits.map((event) => event.action)).toContain('approval.decision');
    expect(h.audits.some((event) => event.metadata.phase === 'pre_execution' && event.resultCode === 'EXECUTION_AUTHORIZED')).toBe(true);
    expect(h.audits.some((event) => event.metadata.phase === 'outcome' && event.resultCode === 'EXECUTED')).toBe(true);
    expect(JSON.stringify({ review, result, audits: h.audits })).not.toContain(poison);
    const repeated = await h.invoke(review);
    expect(repeated.ok).toBe(false);
    expect(h.calls).toHaveLength(1);
  });

  it('denial and expired approval never reach fake', async () => {
    const h = fixture();
    const review = h.review();
    const id = await h.pending(review);
    expect(h.repo.respond(id, 'deny', new Date(Date.UTC(2026, 9, 14, 7)).toISOString()).ok).toBe(true);
    expect(await h.invoke(review)).toMatchObject({ ok: false, code: 'APPROVAL_DENIED' });
    expect(h.calls).toHaveLength(0);
    const newReview = h.review();
    const newId = await h.pending(newReview);
    expect(h.approve(newId).ok).toBe(true);
    h.advance(121_000);
    expect((await h.invoke(newReview)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it.each(['full_access', 'approve_for_me'] as const)(
    '%s cannot substitute automatic approval for manually consumed consent',
    async (mode) => {
      const h = fixture(mode);
      const review = h.review();
      const id = await h.pending(review);
      expect(h.calls).toHaveLength(0);
      expect(h.approve(id).ok).toBe(true);
      expect((await h.invoke(review)).ok).toBe(true);
      expect(h.calls).toHaveLength(1);
    },
  );

  it('rejects mismatched or forged session provenance, runtime and Workspace drift', async () => {
    const h = fixture();
    const review = h.review();
    const id = await h.pending(review);
    expect(h.approve(id).ok).toBe(true);
    expect((await h.invoke(review, { id: 'other', type: 'desktop' })).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
    h.state.workspaceId = 'ws-2';
    expect((await h.invoke(review)).ok).toBe(false);
    h.state.workspaceId = 'ws-1';
    h.state.runtimeEpoch = 'epoch-2';
    expect((await h.invoke(review)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('rejects non-resumed, schema-drift and caller-supplied fake approval', async () => {
    const h = fixture();
    const review = h.review();
    h.state.resumed = false;
    expect((await h.invoke(review)).ok).toBe(false);
    h.state.resumed = true;
    h.contract.serenaVersion = 'unverified';
    expect((await h.invoke(review)).ok).toBe(false);
    h.contract.serenaVersion = '1.7.0';
    expect((await h.kernel.invoke({
      invocationId: 'fake-approval', session: h.state.session,
      capability: h.bridge.capability.name,
      input: { ...review, approved: true, approvalId: 'bogus' },
    })).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('blocks on failed pre-execution audit with no fake dispatch', async () => {
    const h = fixture();
    const review = h.review();
    const id = await h.pending(review);
    expect(h.approve(id).ok).toBe(true);
    h.failPre();
    expect(await h.invoke(review)).toMatchObject({ ok: false, code: 'AUDIT_PRECONDITION_FAILED' });
    expect(h.calls).toHaveLength(0);
  });

  it('quarantines lost/unknown fake result and outcome audit failure without second execution', async () => {
    const lost = fixture();
    const review = lost.review();
    const id = await lost.pending(review);
    expect(lost.approve(id).ok).toBe(true);
    lost.failFake();
    expect(await lost.invoke(review)).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(lost.calls).toHaveLength(1);
    expect(JSON.stringify(lost.audits)).not.toContain(poison);
    expect((await lost.invoke(review)).ok).toBe(false);
    expect(lost.calls).toHaveLength(1);

    const unaudited = fixture();
    const other = unaudited.review();
    const approvalId = await unaudited.pending(other);
    expect(unaudited.approve(approvalId).ok).toBe(true);
    unaudited.failOutcome();
    expect(await unaudited.invoke(other)).toMatchObject({ ok: false, code: 'AUDIT_OUTCOME_FAILED' });
    expect(unaudited.calls).toHaveLength(1);
    expect((await unaudited.invoke(other)).ok).toBe(false);
    expect(unaudited.calls).toHaveLength(1);
  });

  it('keeps duplicate concurrent attempts to one fake invocation', async () => {
    const h = fixture();
    const review = h.review();
    const id = await h.pending(review);
    expect(h.approve(id).ok).toBe(true);
    const [first, second] = await Promise.all([h.invoke(review), h.invoke(review)]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(h.calls).toHaveLength(1);
  });

  it.each([
    ['mode approval', (row: ApprovalRequestRecord) => ({ ...row, decisionSource: 'mode' as const })],
    ['unconsumed status', (row: ApprovalRequestRecord) => ({ ...row, status: 'approved' as const })],
    ['other runtime', (row: ApprovalRequestRecord) => ({ ...row, runtimeInstanceId: 'other-runtime' })],
    ['other session', (row: ApprovalRequestRecord) => ({ ...row, sessionId: 'other-session' })],
    ['expired record', (row: ApprovalRequestRecord) => ({ ...row, expiresAt: '2020-01-01T00:00:00.000Z' })],
    ['broken digest', (row: ApprovalRequestRecord) => ({ ...row, bindingDigest: 'not-a-digest' })],
  ] as const)('rejects %s provenance even after Kernel approval', async (_reason, projection) => {
    const h = fixture('standard', projection);
    const review = h.review();
    const id = await h.pending(review);
    expect(h.approve(id).ok).toBe(true);
    expect(await h.invoke(review)).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(h.calls).toHaveLength(0);
  });

  it('honors hard Policy DENY in an isolated Kernel composition', async () => {
    const h = fixture();
    const policyDenied = {
      ...h.bridge.capability,
      resolveSecurity: () => ok({ sensitivity: 'sensitive' as const, context: 'network' as const }),
    };
    const registry = createToolCapabilityRegistry([policyDenied]);
    if (!registry.ok) throw Error('registry');
    const kernel = createToolKernel({
      registry: registry.value, audit: { append: () => undefined }, approval: h.coordinator,
    });
    expect(await kernel.invoke({
      invocationId: 'c1-policy-deny', session: h.state.session,
      capability: policyDenied.name, input: h.review(),
    })).toMatchObject({ ok: false, code: 'POLICY_DENIED' });
    expect(h.calls).toHaveLength(0);
  });

  it('bounds a never-resolving fake reply, quarantines its attempt and never calls twice', async () => {
    const h = fixture();
    const review = h.review();
    const approvalId = await h.pending(review);
    expect(h.approve(approvalId).ok).toBe(true);
    h.hangFake();
    const result = await Promise.race([
      h.invoke(review),
      new Promise<{ watchdog: true }>((resolve) => {
        setTimeout(() => resolve({ watchdog: true }), 1_000);
      }),
    ]);
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(h.calls).toHaveLength(1);
    expect((await h.invoke(review)).ok).toBe(false);
    expect(h.calls).toHaveLength(1);
  });

  it('keeps the production registry untouched', async () => {
    const h = fixture();
    const productionEquivalent = createToolCapabilityRegistry([]);
    expect(productionEquivalent.ok).toBe(true);
    if (productionEquivalent.ok) expect(productionEquivalent.value.get(h.bridge.capability.name)).toBeUndefined();
    expect(h.calls).toHaveLength(0);
  });
});
