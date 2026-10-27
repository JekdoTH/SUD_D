import { describe, expect, it } from 'vitest';
import { ok, appError, err, type ApprovalRequestRecord, type AuditEvent } from '@sud-d/domain';
import type { ApprovalRepository, NewApprovalRequest } from '@sud-d/infrastructure';
import { createToolKernel, createToolCapabilityRegistry } from '../../application/src/tool-kernel.js';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import {
  createSoloExpertSerenaBridge, B0_SCHEMA_PIN, type B0ReviewSnapshot,
} from '../../application/src/solo-expert-serena-bridge.js';
import { createSoloExpertFakeAdapter } from '../../infrastructure/src/solo-expert-serena-adapter.js';

const marker = 'SYNTHETIC_POISON_REDACTION_ONLY';
type Mode = 'standard' | 'approve_for_me' | 'full_access';
const BASE_TIME = Date.UTC(2026, 9, 14, 8);

function repo(): ApprovalRepository {
  const records = new Map<string, ApprovalRequestRecord>();
  let count = 0;
  const latest = (runtime: string, digest: string) => [...records.values()].reverse()
    .find(row => row.runtimeInstanceId === runtime && row.bindingDigest === digest);
  const create = (request: NewApprovalRequest, source?: 'mode', iso?: string) => {
    const row: ApprovalRequestRecord = {
      ...request, id: `b0-${++count}`, status: source ? 'consumed' : 'pending',
      ...(source ? { decisionSource: source, decidedAt: iso, consumedAt: iso } : {}),
    };
    records.set(row.id, row);
    return ok(row);
  };
  return {
    findById: id => ok(records.get(id)),
    findLatest: (r, digest) => ok(latest(r, digest)),
    createPending: req => create(req),
    recordModeApproval: (req, now) => create(req, 'mode', now),
    countActive: (runtime, now) => ok([...records.values()].filter(row =>
      row.runtimeInstanceId === runtime && row.expiresAt > now && ['pending', 'approved'].includes(row.status)).length),
    listPending: (limit = 50, now = new Date(BASE_TIME).toISOString()) => ok([...records.values()]
      .filter(row => row.status === 'pending' && row.expiresAt > now).slice(0, limit)),
    respond: (id, decision, now = new Date(BASE_TIME).toISOString()) => {
      const row = records.get(id);
      if (!row || row.status !== 'pending' || row.expiresAt <= now) return err(appError('APPROVAL_STATE_INVALID', 'No pending decision'));
      const value: ApprovalRequestRecord = { ...row, status: decision === 'approve' ? 'approved' : 'denied', decisionSource: 'user', decidedAt: now };
      records.set(id, value);
      return ok(value);
    },
    consumeApproved: (runtime, digest, now) => {
      const row = latest(runtime, digest);
      if (!row || row.status !== 'approved' || row.expiresAt <= now) return ok(undefined);
      const value: ApprovalRequestRecord = { ...row, status: 'consumed', consumedAt: now };
      records.set(value.id, value);
      return ok(value);
    },
    expireStale: now => {
      let n = 0;
      for (const row of records.values()) if (['pending', 'approved'].includes(row.status) && row.expiresAt <= now) {
        records.set(row.id, { ...row, status: 'expired' }); n++;
      }
      return ok(n);
    },
    expireOtherRuntimes: () => ok(0),
    cleanupTerminal: () => ok(0),
  };
}

function fixture(mode: Mode = 'standard', changeRecord?: (row: ApprovalRequestRecord) => ApprovalRequestRecord) {
  let time = BASE_TIME;
  let preAuditFails = false;
  let postAuditFails = false;
  const state = {
    workspaceId: 'ws-1', workspaceRoot: 'C:/synthetic-ws', workspaceGeneration: 'gen-1',
    policyContext: 'workspace' as 'workspace' | 'outside_workspace' | 'internal_root' | 'network',
    session: { id: 'desktop-1', type: 'desktop' as const }, runtimeEpoch: 'epoch-1',
    deviceLabel: 'test-device', deviceProvenance: 'unattested-local-label' as const,
    accountLabel: 'test-user', accountProvenance: 'unattested-local-label' as const,
    artifactFingerprint: 'artifact-pin-1', configFingerprint: 'config-pin-1',
    resumed: true, revoked: false,
  };
  const contract = {
    serenaVersion: '1.7.0', toolName: 'execute_shell_command',
    schemaPin: B0_SCHEMA_PIN, risk: 'sensitive',
    effect: 'execute', registryVersion: 'b0-private-registry-v1',
    privacy: 'stock-local-logging',
  };
  const calls: unknown[] = [];
  const events: Array<Omit<AuditEvent, 'id'>> = [];
  const db = repo();
  const now = () => time;
  let transport: (request: unknown) => Promise<unknown> = async () => ({
    isError: false,
    content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B0_OK\r\n', stderr: '', cwd: state.workspaceRoot,
    }) }],
  });
  const adapter = createSoloExpertFakeAdapter(async request => {
    calls.push(request);
    return transport(request);
  });
  const bridge = createSoloExpertSerenaBridge({
    trustedState: () => ({ ...state, session: { ...state.session } }),
    contract: () => ({ ...contract }), now,
    coordinatorRuntimeId: 'runtime-b0',
    approvalRecords: { findById: id => {
      const found = db.findById(id);
      return found.ok && found.value && changeRecord ? ok(changeRecord(found.value)) : found;
    } },
    fakeAdapter: adapter,
  });
  const registry = createToolCapabilityRegistry([bridge.capability]);
  if (!registry.ok) throw Error('Private registry invalid');
  const audit = { append(event: Omit<AuditEvent, 'id'>) {
    if (preAuditFails && event.metadata.phase === 'pre_execution') throw Error(marker);
    if (postAuditFails && event.metadata.phase === 'outcome' && event.metadata.outcome === 'executed') throw Error(marker);
    events.push(event);
  } };
  const approval = createApprovalCoordinator({
    repository: db, runtimeInstanceId: 'runtime-b0', hmacKey: Buffer.alloc(32, 13),
    now: () => new Date(time), mode: () => mode, preserveOtherRuntimes: true,
  });
  const decision = createApprovalService(db, audit, () => new Date(time));
  const kernel = createToolKernel({ registry: registry.value, audit, approval });
  let index = 0;
  const review = (profileId = 'harmless-short-smoke') => bridge.review({ profileId });
  const snapshot = (profileId = 'harmless-short-smoke'): B0ReviewSnapshot => {
    const value = review(profileId);
    if (!value.ok) throw Error('review denied');
    return value.value;
  };
  const invoke = (input: unknown, session = state.session) => kernel.invoke({
    invocationId: `b0-${++index}`, capability: bridge.capability.name, session, input,
  });
  const pending = async (input: B0ReviewSnapshot) => {
    const result = await invoke(input);
    expect(result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    if (result.ok || !result.approvalRequestId) throw Error('Missing pending');
    return result.approvalRequestId;
  };
  const approve = (id: string) => decision.respond(id, 'approve');
  return {
    state, contract, calls, events, db, bridge, kernel, review, reviewRaw: (input: unknown) => bridge.review(input), snapshot, invoke, pending, approve,
    advance: (ms: number) => { time += ms; },
    deny: (id: string) => decision.respond(id, 'deny'),
    failPre: () => { preAuditFails = true; },
    failPost: () => { postAuditFails = true; },
    mock: (fn: (request: unknown) => Promise<unknown>) => { transport = fn; },
  };
}

describe('B0 P0 private controlled registry + existing Kernel/Approval', () => {
  it('reviews both fixed profiles, returns immutable disclosed provenance, and never starts fake transport on review', () => {
    const h = fixture();
    for (const id of ['harmless-short-smoke', 'reviewed-development-script']) {
      const value = h.snapshot(id);
      expect(value).toMatchObject({
        profileId: id, privacy: 'stock-local-logging', risk: 'sensitive', effect: 'execute',
        workspaceId: 'ws-1', workspaceRoot: 'C:/synthetic-ws', workspaceGeneration: 'gen-1',
        deviceProvenance: 'unattested-local-label', accountProvenance: 'unattested-local-label',
      });
      expect(value.riskDisclosure).toContain('local');
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.session)).toBe(true);
      expect(h.bridge.capability.validate(value).ok).toBe(true);
    }
    expect(h.review('arbitrary-shell').ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('requires manual one-use consumed approval and never allows replay', async () => {
    const h = fixture();
    const value = h.snapshot();
    const id = await h.pending(value);
    expect(h.calls).toHaveLength(0);
    expect(h.approve(id).ok).toBe(true);
    const result = await h.invoke(value);
    expect(result).toMatchObject({
      ok: true, policyDecision: 'ask', approvalDecision: 'approved',
      value: { executionKind: 'mock', status: 'simulated-success', exitCode: 0 },
    });
    expect(h.calls).toHaveLength(1);
    expect(h.db.findById(id)).toMatchObject({ ok: true, value: { status: 'consumed', decisionSource: 'user' } });
    expect((await h.invoke(value)).ok).toBe(false);
    expect(h.calls).toHaveLength(1);
    expect(h.events.some(e => e.resultCode === 'EXECUTION_AUTHORIZED')).toBe(true);
    expect(JSON.stringify({ result, events: h.events })).not.toContain(marker);
  });
  it('routes the second fake-only descriptor through the same manual gate without wildcard authority', async () => {
    const h = fixture();
    h.mock(async () => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B0_DEV_OK\r\n', stderr: '', cwd: h.state.workspaceRoot,
    }) }] }));
    const reviewed = h.snapshot('reviewed-development-script');
    const id = await h.pending(reviewed);
    expect(h.approve(id).ok).toBe(true);
    expect(await h.invoke(reviewed)).toMatchObject({ ok: true, value: { status: 'simulated-success', executionKind: 'mock' } });
    expect(h.calls).toHaveLength(1);
    expect(JSON.stringify(h.calls)).toContain('SUD_D_B0_DEV_OK');
  });

  it('rejects unknown profiles and caller authority injections, prototypes, accessors and symbols', () => {
    const h = fixture();
    const valid = { profileId: 'harmless-short-smoke' };
    const bad: unknown[] = [
      null, [], {}, { profileId: 'runner.start' }, { profileId: 'execute_shell_command' },
      { ...valid, command: 'echo disallowed' }, { ...valid, args: [] },
      { ...valid, argv: [] }, { ...valid, cwd: 'C:/outside' },
      { ...valid, env: {} }, { ...valid, executable: 'cmd.exe' },
      { ...valid, workspaceRoot: 'C:/other' }, { ...valid, sessionId: 'other' },
      { ...valid, toolName: 'execute_shell_command' }, { ...valid, approved: true },
      { ...valid, device: 'other' }, { ...valid, account: 'other' },
      { ...valid, runtimeEpoch: 'other' }, { ...valid, risk: 'normal' },
      { ...valid, provider: 'fake' }, { ...valid, script: marker },
      { ...valid, [Symbol('extra')]: true },
      Object.assign(Object.create({ inherited: true }), valid),
      Object.assign(Object.create(null), valid),
      Object.defineProperty({}, 'profileId', { enumerable: true, get: () => { throw Error(marker); } }),
    ];
    for (const item of bad) expect(h.reviewRaw(item).ok).toBe(false);
    const snap = h.snapshot();
    expect(h.bridge.capability.validate({ ...snap }).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('denial and expiration do not dispatch', async () => {
    const denied = fixture();
    const original = denied.snapshot();
    const id = await denied.pending(original);
    expect(denied.deny(id).ok).toBe(true);
    expect(await denied.invoke(original)).toMatchObject({ ok: false, code: 'APPROVAL_DENIED' });
    expect(denied.calls).toHaveLength(0);

    const expired = fixture();
    const value = expired.snapshot();
    const pendingId = await expired.pending(value);
    expect(expired.approve(pendingId).ok).toBe(true);
    expired.advance(91_000);
    expect((await expired.invoke(value)).ok).toBe(false);
    expect(expired.calls).toHaveLength(0);
  });

  it.each(['full_access', 'approve_for_me'] as const)(
    '%s cannot create a mode-sourced grant for sensitive Solo Expert mock execution', async mode => {
      const h = fixture(mode);
      const reviewed = h.snapshot();
      const id = await h.pending(reviewed);
      expect(h.calls).toHaveLength(0);
      expect(h.approve(id).ok).toBe(true);
      expect((await h.invoke(reviewed)).ok).toBe(true);
      expect(h.db.findById(id)).toMatchObject({ ok: true, value: { decisionSource: 'user' } });
    },
  );

  it.each([
    ['mode-sourced', (r: ApprovalRequestRecord) => ({ ...r, decisionSource: 'mode' as const })],
    ['unconsumed', (r: ApprovalRequestRecord) => ({ ...r, status: 'approved' as const })],
    ['other runtime', (r: ApprovalRequestRecord) => ({ ...r, runtimeInstanceId: 'other' })],
    ['other request identity', (r: ApprovalRequestRecord) => ({ ...r, id: 'other' })],
    ['other session', (r: ApprovalRequestRecord) => ({ ...r, sessionId: 'other' })],
    ['other workspace', (r: ApprovalRequestRecord) => ({ ...r, workspaceId: 'other' })],
    ['other capability', (r: ApprovalRequestRecord) => ({ ...r, capability: 'other' })],
    ['wrong binding digest', (r: ApprovalRequestRecord) => ({ ...r, bindingDigest: 'bad' })],
    ['expired record', (r: ApprovalRequestRecord) => ({ ...r, expiresAt: '2020-01-01T00:00:00.000Z' })],
    ['other approval effect', (r: ApprovalRequestRecord) => ({ ...r, effect: 'read' as const })],
  ] as const)('denies ledger %s before fake transport', async (_label, projection) => {
    const h = fixture('standard', projection);
    const reviewed = h.snapshot();
    const id = await h.pending(reviewed);
    expect(h.approve(id).ok).toBe(true);
    expect(await h.invoke(reviewed)).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(h.calls).toHaveLength(0);
  });

  it.each([
    ['root', (h: ReturnType<typeof fixture>) => { h.state.workspaceRoot = 'C:/changed'; }],
    ['generation', (h: ReturnType<typeof fixture>) => { h.state.workspaceGeneration = 'other'; }],
    ['session', (h: ReturnType<typeof fixture>) => { h.state.session.id = 'other'; }],
    ['runtime epoch', (h: ReturnType<typeof fixture>) => { h.state.runtimeEpoch = 'other'; }],
    ['device', (h: ReturnType<typeof fixture>) => { h.state.deviceLabel = 'other'; }],
    ['account', (h: ReturnType<typeof fixture>) => { h.state.accountLabel = 'other'; }],
    ['config', (h: ReturnType<typeof fixture>) => { h.state.configFingerprint = 'other'; }],
    ['artifact', (h: ReturnType<typeof fixture>) => { h.state.artifactFingerprint = 'other'; }],
    ['resume', (h: ReturnType<typeof fixture>) => { h.state.resumed = false; }],
    ['revocation', (h: ReturnType<typeof fixture>) => { h.state.revoked = true; }],
    ['outside Policy', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'outside_workspace'; }],
    ['internal root Policy', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'internal_root'; }],
    ['network Policy', (h: ReturnType<typeof fixture>) => { h.state.policyContext = 'network'; }],
    ['schema', (h: ReturnType<typeof fixture>) => { h.contract.schemaPin = 'drift'; }],
    ['registry', (h: ReturnType<typeof fixture>) => { h.contract.registryVersion = 'drift'; }],
    ['tool', (h: ReturnType<typeof fixture>) => { h.contract.toolName = 'different'; }],
    ['risk', (h: ReturnType<typeof fixture>) => { h.contract.risk = 'normal'; }],
  ] as const)('stale %s fails closed and does not invoke fake', async (_field, change) => {
    const h = fixture();
    const reviewed = h.snapshot();
    const id = await h.pending(reviewed);
    expect(h.approve(id).ok).toBe(true);
    change(h);
    expect((await h.invoke(reviewed)).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('blocks if pre-execution audit cannot append, and quarantines post-audit uncertainty', async () => {
    const pre = fixture();
    const snap = pre.snapshot();
    const id = await pre.pending(snap);
    expect(pre.approve(id).ok).toBe(true);
    pre.failPre();
    expect(await pre.invoke(snap)).toMatchObject({ ok: false, code: 'AUDIT_PRECONDITION_FAILED' });
    expect(pre.calls).toHaveLength(0);

    const post = fixture();
    const attempt = post.snapshot();
    const grant = await post.pending(attempt);
    expect(post.approve(grant).ok).toBe(true);
    post.failPost();
    expect(await post.invoke(attempt)).toMatchObject({ ok: false, code: 'AUDIT_OUTCOME_FAILED' });
    expect(post.calls).toHaveLength(1);
    expect((await post.invoke(attempt)).ok).toBe(false);
    expect(post.calls).toHaveLength(1);
  });

  it('concurrent invocation reserves before fake await: never launches twice', async () => {
    const h = fixture();
    const snap = h.snapshot();
    const id = await h.pending(snap);
    expect(h.approve(id).ok).toBe(true);
    const [first, second] = await Promise.all([h.invoke(snap), h.invoke(snap)]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect(h.calls).toHaveLength(1);
  });

  it('lost reply, thrown error and mock timeout all quarantine the attempt without leaking error text', async () => {
    for (const failure of [
      () => Promise.reject(Error(marker)),
      () => new Promise<never>(() => { /* synthetic lost reply */ }),
    ]) {
      const h = fixture();
      const snap = h.snapshot();
      const grant = await h.pending(snap);
      expect(h.approve(grant).ok).toBe(true);
      h.mock(failure);
      const result = await h.invoke(snap);
      expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
      expect(h.calls).toHaveLength(1);
      expect((await h.invoke(snap)).ok).toBe(false);
      expect(h.calls).toHaveLength(1);
      expect(JSON.stringify({ result, events: h.events })).not.toContain(marker);
    }
  });

  it('rechecks revocation after fake transport finishes, never reporting stale success', async () => {
    const h = fixture();
    const snap = h.snapshot();
    const grant = await h.pending(snap);
    expect(h.approve(grant).ok).toBe(true);
    h.mock(async () => {
      h.state.revoked = true;
      return { isError: false, content: [{ type: 'text', text: JSON.stringify({
        return_code: 0, stdout: 'SUD_D_B0_OK\r\n', stderr: '', cwd: h.state.workspaceRoot,
      }) }] };
    });
    expect(await h.invoke(snap)).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(h.calls).toHaveLength(1);
  });

  it.each([
    ['mcp ToolError', () => ({ isError: true, content: [{ type: 'text', text: marker }] }), 'EXECUTION_FAILED'],
    ['truncated JSON', () => ({ isError: false, content: [{ type: 'text', text: '{"stdout":' }] }), 'EXECUTION_FAILED'],
    ['wrong output', (h: ReturnType<typeof fixture>) => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: marker, stderr: '', cwd: h.state.workspaceRoot,
    }) }] }), 'EXECUTION_FAILED'],
    ['stderr poison', (h: ReturnType<typeof fixture>) => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B0_OK\r\n', stderr: marker, cwd: h.state.workspaceRoot,
    }) }] }), 'EXECUTION_FAILED'],
    ['cwd mismatch', () => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B0_OK\r\n', stderr: '', cwd: 'C:/unreviewed',
    }) }] }), 'EXECUTION_FAILED'],
    ['malformed isError', () => ({ isError: 'false', content: [{ type: 'text', text: marker }] }), 'EXECUTION_FAILED'],
    ['unexpected response key', () => ({ isError: false, content: [], unsafe: marker }), 'EXECUTION_FAILED'],
    ['nonzero return_code', (h: ReturnType<typeof fixture>) => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 7, stdout: marker, stderr: marker, cwd: h.state.workspaceRoot,
    }) }] }), 'EXECUTED'],
  ] as const)('classifies %s with safe metadata and zero poison', async (_label, factory, code) => {
    const h = fixture();
    const snap = h.snapshot();
    const id = await h.pending(snap);
    expect(h.approve(id).ok).toBe(true);
    h.mock(async () => factory(h));
    const result = await h.invoke(snap);
    expect(result.code).toBe(code);
    if (code === 'EXECUTED') {
      expect(result).toMatchObject({ ok: true, value: { executionKind: 'mock', status: 'command-failed', exitCode: 7 } });
    } else expect(result.ok).toBe(false);
    expect(h.calls).toHaveLength(1);
    expect(JSON.stringify({ result, events: h.events, snap })).not.toContain(marker);
  });

  it('private module remains absent from an empty production-equivalent registry', () => {
    const h = fixture();
    const production = createToolCapabilityRegistry([]);
    if (!production.ok) throw Error('registry');
    expect(production.value.get(h.bridge.capability.name)).toBeUndefined();
    expect(h.calls).toHaveLength(0);
  });

  it('an approval for one exact attempt never grants a changed profile or a new attempt', async () => {
    const h = fixture();
    const first = h.snapshot('harmless-short-smoke');
    const firstId = await h.pending(first);
    expect(h.approve(firstId).ok).toBe(true);
    const different = h.snapshot('reviewed-development-script');
    const later = await h.invoke(different);
    expect(later).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    const newAttempt = h.snapshot('harmless-short-smoke');
    expect(await h.invoke(newAttempt)).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(h.calls).toHaveLength(0);
    expect((await h.invoke(first)).ok).toBe(true);
    expect(h.calls).toHaveLength(1);
  });

  it('rechecks a revoked grant after the asynchronous ledger read and before fake dispatch', async () => {
    const h = fixture('standard', row => {
      h.state.revoked = true;
      return row;
    });
    const reviewed = h.snapshot();
    const id = await h.pending(reviewed);
    expect(h.approve(id).ok).toBe(true);
    expect(await h.invoke(reviewed)).toMatchObject({ ok: false, code: 'EXECUTION_FAILED' });
    expect(h.calls).toHaveLength(0);
  });

  it('does not accept a fake adapter whose backend recipe identity has drifted', () => {
    const original = createSoloExpertFakeAdapter(async () => { throw Error(marker); });
    const bridge = createSoloExpertSerenaBridge({
      trustedState: () => ({
        workspaceId: 'ws-1', workspaceRoot: 'C:/synthetic-ws', workspaceGeneration: 'gen-1',
        policyContext: 'workspace', session: { id: 'desktop-1', type: 'desktop' },
        runtimeEpoch: 'epoch-1', deviceLabel: 'test-device', deviceProvenance: 'unattested-local-label',
        accountLabel: 'test-user', accountProvenance: 'unattested-local-label',
        artifactFingerprint: 'artifact-pin-1', configFingerprint: 'config-pin-1',
        resumed: true, revoked: false,
      }),
      contract: () => ({
        serenaVersion: '1.7.0', toolName: 'execute_shell_command', schemaPin: B0_SCHEMA_PIN,
        risk: 'sensitive', effect: 'execute', registryVersion: 'b0-private-registry-v1',
        privacy: 'stock-local-logging',
      }),
      now: () => BASE_TIME,
      coordinatorRuntimeId: 'runtime-b0',
      approvalRecords: { findById: () => ok(undefined) },
      fakeAdapter: { ...original, fingerprint: () => 'unreviewed-fingerprint' },
    });
    expect(bridge.review({ profileId: 'harmless-short-smoke' }).ok).toBe(false);
  });

});