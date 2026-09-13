import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appError,
  err,
  ok,
  type AppError,
  type ApprovalDescriptor,
  type AuditEvent,
  type Result,
  type ToolKernelResult,
} from '@sud-d/domain';
import { createApprovalRepository, openDatabase, type Db } from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createApprovalService,
  createToolCapabilityRegistry,
  createToolKernel,
  defineToolCapability,
  type ToolKernelApprovalPort,
} from '@sud-d/application';

const roots: string[] = [];
const dbs: Db[] = [];

function makeDb(): { root: string; db: Db } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-basic-approval-security-'));
  roots.push(root);
  const db = openDatabase(path.join(root, 'state.db'));
  dbs.push(db);
  return { root, db };
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function request(input: unknown = { path: '.env' }, invocationId = 'i-1', sessionId = 's-1') {
  return {
    invocationId,
    session: { id: sessionId, type: 'mcp-stdio' as const },
    capability: 'test.approval',
    input,
  };
}

function descriptor(label = '.env'): ApprovalDescriptor {
  return { title: 'Protected test action', resourceLabel: label };
}

function makeCapability(options: {
  effect?: 'read' | 'create' | 'modify' | 'execute' | 'delete';
  sensitivity?: 'normal' | 'credential';
  context?: 'workspace' | 'internal_root' | 'outside_workspace' | 'network';
  workspaceId?: string;
  approval?: boolean;
  execute?: () => Result<unknown, AppError>;
} = {}) {
  const effect = options.effect ?? 'read';
  return defineToolCapability<{ path: string }, unknown>({
    name: 'test.approval',
    effect,
    validate: (input: unknown) => ok(input as { path: string }),
    resolveSecurity: () => ok({
      sensitivity: options.sensitivity ?? 'credential',
      context: options.context ?? 'workspace',
      ...(options.workspaceId === undefined ? { workspaceId: 'ws-1' } : options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    }),
    ...(options.approval === false ? {} : {
      approval: {
        describe: (input) => ok(descriptor(input.path)),
        bind: (input) => ok({ path: input.path }),
      },
    }),
    execute: options.execute ?? (() => ok('done')),
  });
}

function makeKernel(options: {
  approval?: ToolKernelApprovalPort;
  capability?: ReturnType<typeof makeCapability>;
  auditAppend?: (event: Omit<AuditEvent, 'id'>) => unknown;
}): ReturnType<typeof createToolKernel> {
  const registry = createToolCapabilityRegistry([options.capability ?? makeCapability()]);
  if (!registry.ok) throw new Error('registry');
  return createToolKernel({
    registry: registry.value,
    audit: { append: options.auditAppend ?? (() => undefined) },
    ...(options.approval ? { approval: options.approval } : {}),
  });
}

function pendingId(result: ToolKernelResult): string {
  if (result.ok || !result.approvalRequestId) throw new Error('expected pending approval');
  return result.approvalRequestId;
}

describe('Basic Approval - policy, expiry, queue, and one-time consumption', () => {
  it('normal ALLOW still executes without approval and DENY still cannot be bypassed', async () => {
    let allowExecutions = 0;
    const allow = makeKernel({ capability: makeCapability({ sensitivity: 'normal', approval: false, execute: () => { allowExecutions += 1; return ok('allowed'); } }) });
    expect(await allow.invoke(request())).toMatchObject({ ok: true, policyDecision: 'allow', code: 'EXECUTED' });
    expect(allowExecutions).toBe(1);

    let denyExecutions = 0;
    const deny = makeKernel({ capability: makeCapability({ context: 'internal_root', execute: () => { denyExecutions += 1; return ok('bad'); } }) });
    expect(await deny.invoke(request())).toMatchObject({ ok: false, code: 'POLICY_DENIED', policyDecision: 'deny' });
    expect(denyExecutions).toBe(0);
  });

  it('ASK without a trusted descriptor/binding or approval coordinator fails closed', async () => {
    let executions = 0;
    const noDefinition = makeKernel({ capability: makeCapability({ approval: false, execute: () => { executions += 1; return ok(null); } }) });
    expect(await noDefinition.invoke(request())).toMatchObject({ ok: false, code: 'APPROVAL_CONTEXT_FAILED', policyDecision: 'ask' });

    const withDefinitionNoPort = makeKernel({ capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }) });
    expect(await withDefinitionNoPort.invoke(request())).toMatchObject({ ok: false, code: 'APPROVAL_CONTEXT_FAILED', policyDecision: 'ask' });
    expect(executions).toBe(0);
  });

  it('Standard keeps ASK actions manual while Approve for me auto-approves only bounded normal Workspace verify actions', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const base = {
      session: { id: 's-mode', type: 'mcp-stdio' as const },
      capability: 'verify.run',
      effect: 'execute' as const,
      security: { sensitivity: 'normal' as const, context: 'workspace' as const, workspaceId: 'ws-1' },
      descriptor: { title: 'Run project diff_check', resourceLabel: 'Active Workspace' },
      binding: { action: 'diff_check' },
    };

    const standard = createApprovalCoordinator({
      repository,
      runtimeInstanceId: 'runtime-standard',
      hmacKey: Buffer.alloc(32, 31),
      mode: () => 'standard',
    });
    expect(standard.authorize(base)).toMatchObject({ ok: true, state: 'pending' });

    const automatic = createApprovalCoordinator({
      repository,
      runtimeInstanceId: 'runtime-auto',
      hmacKey: Buffer.alloc(32, 32),
      mode: () => 'approve_for_me',
    });
    expect(automatic.authorize(base)).toMatchObject({ ok: true, state: 'approved' });
    expect(automatic.authorize({ ...base, binding: { action: 'unknown' } })).toMatchObject({ ok: true, state: 'pending' });
    expect(automatic.authorize({ ...base, security: { ...base.security, sensitivity: 'credential' } })).toMatchObject({ ok: true, state: 'pending' });
  });

  it('Full Access auto-approves normal Workspace ASK actions but never broadens credential or destructive requests', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({
      repository,
      runtimeInstanceId: 'runtime-full',
      hmacKey: Buffer.alloc(32, 33),
      mode: () => 'full_access',
    });
    const base = {
      session: { id: 's-full', type: 'mcp-stdio' as const },
      capability: 'verify.run',
      effect: 'execute' as const,
      security: { sensitivity: 'normal' as const, context: 'workspace' as const, workspaceId: 'ws-1' },
      descriptor: { title: 'Run fixed verification', resourceLabel: 'Active Workspace' },
      binding: { action: 'test' },
    };

    expect(coordinator.authorize(base)).toMatchObject({ ok: true, state: 'approved' });
    expect(coordinator.authorize({ ...base, security: { ...base.security, sensitivity: 'credential' } })).toMatchObject({ ok: true, state: 'pending' });
    expect(coordinator.authorize({ ...base, effect: 'delete' })).toMatchObject({ ok: true, state: 'pending' });
  });

  it('approval automation cannot bypass Policy hard DENY contexts', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({
      repository,
      runtimeInstanceId: 'runtime-deny',
      hmacKey: Buffer.alloc(32, 34),
      mode: () => 'full_access',
    });

    for (const context of ['internal_root', 'outside_workspace', 'network'] as const) {
      let executions = 0;
      const denied = makeKernel({
        approval: coordinator,
        capability: makeCapability({
          context,
          sensitivity: 'normal',
          effect: 'execute',
          execute: () => {
            executions += 1;
            return ok(null);
          },
        }),
      });
      expect(await denied.invoke(request())).toMatchObject({
        ok: false,
        code: 'POLICY_DENIED',
        policyDecision: 'deny',
      });
      expect(executions).toBe(0);
    }
  });

  it('queue full fails closed without evicting a valid pending request', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-q', hmacKey: Buffer.alloc(32, 1), maxActive: 1 });
    const kernel = makeKernel({ approval: coordinator });
    const first = await kernel.invoke(request({ path: '.env' }, 'i-1'));
    const second = await kernel.invoke(request({ path: 'other.env' }, 'i-2'));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(second).toMatchObject({ ok: false, code: 'APPROVAL_CONTEXT_FAILED', causeCode: 'APPROVAL_QUEUE_FULL' });
    const listed = repository.listPending(50);
    expect(listed.ok && listed.value).toHaveLength(1);
    expect(listed.ok && listed.value[0]?.id).toBe(pendingId(first));
  });

  it('expired pending cannot approve and retry creates a fresh request', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    let nowMs = Date.parse('2026-09-01T10:00:00.000Z');
    const now = () => new Date(nowMs);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-e', hmacKey: Buffer.alloc(32, 2), now, ttlMs: 1000 });
    const kernel = makeKernel({ approval: coordinator });
    const first = await kernel.invoke(request());
    const firstId = pendingId(first);
    nowMs += 1500;
    const service = createApprovalService(repository, { append: () => undefined }, now);
    expect(service.respond(firstId, 'approve')).toMatchObject({ ok: false, error: { code: 'APPROVAL_EXPIRED' } });
    const retry = await kernel.invoke(request({ path: '.env' }, 'i-2'));
    expect(retry).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(pendingId(retry)).not.toBe(firstId);
  });

  it('approved-but-expired request cannot execute and retry requires fresh approval', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    let nowMs = Date.parse('2026-09-01T10:00:00.000Z');
    const now = () => new Date(nowMs);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-ae', hmacKey: Buffer.alloc(32, 3), now, ttlMs: 1000 });
    let executions = 0;
    const kernel = makeKernel({ approval: coordinator, capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }) });
    const first = await kernel.invoke(request());
    expect(repository.respond(pendingId(first), 'approve', now().toISOString()).ok).toBe(true);
    nowMs += 1500;
    const retry = await kernel.invoke(request({ path: '.env' }, 'i-2'));
    expect(retry).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(executions).toBe(0);
  });

  it('approved identical action survives a Gateway runtime and MCP session reconnect until one-time consumption', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const key = Buffer.alloc(32, 4);
    const oldCoordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'tunnel-runtime-1', hmacKey: key });
    const oldKernel = makeKernel({ approval: oldCoordinator });
    const pending = await oldKernel.invoke(request({ path: '.env' }, 'i-1', 'session-old'));
    const pendingRequestId = pendingId(pending);
    expect(repository.respond(pendingRequestId, 'approve').ok).toBe(true);

    let executions = 0;
    const reconnectedCoordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'tunnel-runtime-1', hmacKey: key });
    const reconnectedKernel = makeKernel({
      approval: reconnectedCoordinator,
      capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }),
    });
    const retry = await reconnectedKernel.invoke(request({ path: '.env' }, 'i-2', 'session-new'));

    expect(retry).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      policyDecision: 'ask',
      approvalDecision: 'approved',
      approvalRequestId: pendingRequestId,
    });
    expect(executions).toBe(1);
  });

  it('canonical binding is deterministic but capability/effect/workspace/context changes do not match', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-bind', hmacKey: Buffer.alloc(32, 6) });
    const base = {
      session: { id: 's-1', type: 'mcp-stdio' as const },
      capability: 'cap.one',
      effect: 'read' as const,
      security: { sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' },
      descriptor: descriptor(),
    };
    const first = await coordinator.authorize({ ...base, binding: { b: 2, a: 1 } });
    const same = await coordinator.authorize({ ...base, binding: { a: 1, b: 2 } });
    expect(first.ok && same.ok && first.requestId).toBe(same.ok ? same.requestId : '');

    const variants = [
      { ...base, capability: 'cap.two', binding: { a: 1, b: 2 } },
      { ...base, effect: 'modify' as const, binding: { a: 1, b: 2 } },
      { ...base, security: { ...base.security, workspaceId: 'ws-2' }, binding: { a: 1, b: 2 } },
      { ...base, security: { ...base.security, context: 'outside_workspace' as const }, binding: { a: 1, b: 2 } },
    ];
    for (const variant of variants) {
      const result = await coordinator.authorize(variant);
      expect(result.ok && result.requestId).not.toBe(first.ok ? first.requestId : '');
    }
  });

  it('two matching retries race but at most one executes', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-race', hmacKey: Buffer.alloc(32, 7) });
    let executions = 0;
    const kernel = makeKernel({ approval: coordinator, capability: makeCapability({ execute: () => { executions += 1; return ok(executions); } }) });
    const first = await kernel.invoke(request());
    expect(repository.respond(pendingId(first), 'approve').ok).toBe(true);
    const [left, right] = await Promise.all([
      kernel.invoke(request({ path: '.env' }, 'i-2')),
      kernel.invoke(request({ path: '.env' }, 'i-3')),
    ]);
    expect([left, right].filter((result) => result.ok)).toHaveLength(1);
    expect(executions).toBe(1);
    expect([left, right].some((result) => !result.ok && result.code === 'APPROVAL_REQUIRED')).toBe(true);
  });
});

describe('Basic Approval - audit and failure ordering', () => {
  it('approval infrastructure exception fails closed', async () => {
    let executions = 0;
    const approval: ToolKernelApprovalPort = { authorize: () => { throw new Error('boom'); } };
    const kernel = makeKernel({ approval, capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }) });
    expect(await kernel.invoke(request())).toMatchObject({ ok: false, code: 'APPROVAL_CONTEXT_FAILED' });
    expect(executions).toBe(0);
  });

  it('decision audit failure leaves request pending and non-executable', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-da', hmacKey: Buffer.alloc(32, 8) });
    let executions = 0;
    const kernel = makeKernel({ approval: coordinator, capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }) });
    const first = await kernel.invoke(request());
    const service = createApprovalService(repository, { append: () => { throw new Error('audit down'); } });
    expect(service.respond(pendingId(first), 'approve')).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(repository.findById(pendingId(first))).toMatchObject({ ok: true, value: { status: 'pending' } });
    expect(await kernel.invoke(request({ path: '.env' }, 'i-2'))).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(executions).toBe(0);
  });

  it('pre-execution audit failure after atomic consume prevents execution and does not refund grant', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-pre', hmacKey: Buffer.alloc(32, 9) });
    let executions = 0;
    let failPreAudit = false;
    const kernel = makeKernel({
      approval: coordinator,
      capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }),
      auditAppend: (event) => {
        if (failPreAudit && event.resultCode === 'EXECUTION_AUTHORIZED') throw new Error('audit down');
      },
    });
    const first = await kernel.invoke(request());
    expect(repository.respond(pendingId(first), 'approve').ok).toBe(true);
    failPreAudit = true;
    expect(await kernel.invoke(request({ path: '.env' }, 'i-2'))).toMatchObject({ ok: false, code: 'AUDIT_PRECONDITION_FAILED', policyDecision: 'ask' });
    expect(executions).toBe(0);
    failPreAudit = false;
    expect(await kernel.invoke(request({ path: '.env' }, 'i-3'))).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
  });

  it('executor failure leaves the one-time grant consumed', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-ex', hmacKey: Buffer.alloc(32, 10) });
    const kernel = makeKernel({ approval: coordinator, capability: makeCapability({ execute: () => err(appError('INTERNAL_ERROR', 'safe failure')) }) });
    const first = await kernel.invoke(request());
    expect(repository.respond(pendingId(first), 'approve').ok).toBe(true);
    expect(await kernel.invoke(request({ path: '.env' }, 'i-2'))).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', policyDecision: 'ask', approvalDecision: 'approved' });
    expect(await kernel.invoke(request({ path: '.env' }, 'i-3'))).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
  });

  it('post-execution audit failure keeps executed/non-retry semantics', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-post', hmacKey: Buffer.alloc(32, 11) });
    let executions = 0;
    const kernel = makeKernel({
      approval: coordinator,
      capability: makeCapability({ execute: () => { executions += 1; return ok(null); } }),
      auditAppend: (event) => {
        if (event.resultCode === 'EXECUTED') throw new Error('audit down');
      },
    });
    const first = await kernel.invoke(request());
    expect(repository.respond(pendingId(first), 'approve').ok).toBe(true);
    expect(await kernel.invoke(request({ path: '.env' }, 'i-2'))).toMatchObject({ ok: false, code: 'AUDIT_OUTCOME_FAILED', outcome: 'executed', policyDecision: 'ask' });
    expect(executions).toBe(1);
    expect(await kernel.invoke(request({ path: '.env' }, 'i-3'))).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
  });

  it('approve/deny decision audit contains only safe metadata', async () => {
    const { db } = makeDb();
    const repository = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-audit', hmacKey: Buffer.alloc(32, 12) });
    const kernel = makeKernel({ approval: coordinator });
    const secret = 'SENTINEL_APPROVAL_AUDIT_SECRET_456';
    const first = await kernel.invoke(request({ path: secret }));
    const events: Array<Omit<AuditEvent, 'id'>> = [];
    const service = createApprovalService(repository, { append: (event) => { events.push(event); } });
    expect(service.respond(pendingId(first), 'deny').ok).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/bindingDigest|hmac|rawInput|content/i);
    expect(events[0]).toMatchObject({ action: 'approval.decision', resultCode: 'APPROVAL_DENIED', policyDecision: 'ask' });
  });
});
