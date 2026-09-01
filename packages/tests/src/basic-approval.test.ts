import { describe, expect, it } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import { ok, type ApprovalDescriptor } from '@sud-d/domain';
import { createApprovalRepository, openDatabase } from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createToolCapabilityRegistry,
  createToolKernel,
  defineToolCapability,
} from '@sud-d/application';

function makeDb() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-approval-test-'));
  const db = openDatabase(path.join(root, 'state.db'));
  return { root, db };
}

function descriptor(resourceLabel = '.env'): ApprovalDescriptor {
  return { title: 'Read sensitive file', resourceLabel };
}

describe('Basic Approval - first ASK and one-time grant', () => {
  it('creates one pending request for ASK and reuses duplicate pending request', async () => {
    const { db } = makeDb();
    const repo = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'runtime-a', hmacKey: Buffer.alloc(32, 7) });
    let executions = 0;
    const capability = defineToolCapability({
      name: 'test.sensitive_read',
      effect: 'read' as const,
      validate: (input: unknown) => ok(input as { path: string }),
      resolveSecurity: () => ok({ sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' }),
      approval: {
        describe: (input: { path: string }) => ok(descriptor(input.path)),
        bind: (input: { path: string }) => ok({ path: input.path }),
      },
      execute: () => { executions += 1; return ok('secret-value'); },
    });
    const registry = createToolCapabilityRegistry([capability]);
    if (!registry.ok) throw new Error('registry');
    const audit = { append: () => undefined };
    const kernel = createToolKernel({ registry: registry.value, audit, approval: coordinator });
    const request = { invocationId: 'i-1', session: { id: 's-1', type: 'mcp-stdio' as const }, capability: 'test.sensitive_read', input: { path: '.env' } };

    const first = await kernel.invoke(request);
    const second = await kernel.invoke({ ...request, invocationId: 'i-2' });
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(second).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', approvalRequestId: first.ok ? undefined : first.approvalRequestId });
    expect(executions).toBe(0);
    const pendingRows = repo.listPending(50);
    expect(pendingRows.ok && pendingRows.value).toHaveLength(1);
  });

  it('approve then exact retry consumes once and preserves policyDecision=ask', async () => {
    const { db } = makeDb();
    const repo = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'runtime-a', hmacKey: Buffer.alloc(32, 8) });
    let executions = 0;
    const capability = defineToolCapability({
      name: 'test.sensitive_read', effect: 'read' as const,
      validate: (input: unknown) => ok(input as { path: string }),
      resolveSecurity: () => ok({ sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' }),
      approval: { describe: (input: { path: string }) => ok(descriptor(input.path)), bind: (input: { path: string }) => ok({ path: input.path }) },
      execute: () => { executions += 1; return ok('approved-secret'); },
    });
    const registry = createToolCapabilityRegistry([capability]);
    if (!registry.ok) throw new Error('registry');
    const kernel = createToolKernel({ registry: registry.value, audit: { append: () => undefined }, approval: coordinator });
    const request = { invocationId: 'i-1', session: { id: 's-1', type: 'mcp-stdio' as const }, capability: 'test.sensitive_read', input: { path: '.env' } };
    const pending = await kernel.invoke(request);
    if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    expect(repo.respond(pending.approvalRequestId, 'approve').ok).toBe(true);
    const approved = await kernel.invoke({ ...request, invocationId: 'i-2' });
    expect(approved).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask', approvalDecision: 'approved', approvalRequestId: pending.approvalRequestId });
    expect(executions).toBe(1);
    const again = await kernel.invoke({ ...request, invocationId: 'i-3' });
    expect(again).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(executions).toBe(1);
  });

  it('denied request cannot execute or reopen', async () => {
    const { db } = makeDb();
    const repo = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'runtime-a', hmacKey: Buffer.alloc(32, 9) });
    let executions = 0;
    const capability = defineToolCapability({
      name: 'test.sensitive_read', effect: 'read' as const,
      validate: (input: unknown) => ok(input as { path: string }),
      resolveSecurity: () => ok({ sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' }),
      approval: { describe: () => ok(descriptor()), bind: (input: { path: string }) => ok({ path: input.path }) },
      execute: () => { executions += 1; return ok('no'); },
    });
    const registry = createToolCapabilityRegistry([capability]); if (!registry.ok) throw new Error('registry');
    const kernel = createToolKernel({ registry: registry.value, audit: { append: () => undefined }, approval: coordinator });
    const request = { invocationId: 'i-1', session: { id: 's-1', type: 'mcp-stdio' as const }, capability: 'test.sensitive_read', input: { path: '.env' } };
    const pending = await kernel.invoke(request); if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    expect(repo.respond(pending.approvalRequestId, 'deny').ok).toBe(true);
    expect(repo.respond(pending.approvalRequestId, 'approve').ok).toBe(false);
    const denied = await kernel.invoke({ ...request, invocationId: 'i-2' });
    expect(denied).toMatchObject({ ok: false, code: 'APPROVAL_DENIED', policyDecision: 'ask', approvalDecision: 'denied' });
    expect(executions).toBe(0);
  });

  it('changed exact input and changed session do not reuse approval', async () => {
    const { db } = makeDb();
    const repo = createApprovalRepository(db);
    const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'runtime-a', hmacKey: Buffer.alloc(32, 10) });
    const capability = defineToolCapability({
      name: 'test.sensitive_write', effect: 'modify' as const,
      validate: (input: unknown) => ok(input as { path: string; content: string }),
      resolveSecurity: () => ok({ sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' }),
      approval: { describe: (input: { path: string; content: string }) => ok({ title: 'Write sensitive file', resourceLabel: input.path }), bind: (input: { path: string; content: string }) => ok(input) },
      execute: () => ok(null),
    });
    const registry = createToolCapabilityRegistry([capability]); if (!registry.ok) throw new Error('registry');
    const kernel = createToolKernel({ registry: registry.value, audit: { append: () => undefined }, approval: coordinator });
    const base = { session: { id: 's-1', type: 'mcp-stdio' as const }, capability: 'test.sensitive_write', input: { path: '.env', content: 'A' } };
    const pending = await kernel.invoke({ ...base, invocationId: 'i-1' }); if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    expect(repo.respond(pending.approvalRequestId, 'approve').ok).toBe(true);
    expect(await kernel.invoke({ ...base, invocationId: 'i-2', input: { path: '.env', content: 'B' } })).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(await kernel.invoke({ ...base, invocationId: 'i-3', session: { id: 's-2', type: 'mcp-stdio' as const } })).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
  });

  it('persists only an opaque digest, never raw binding or HMAC key', async () => {
    const { db } = makeDb();
    const repo = createApprovalRepository(db);
    const key = Buffer.alloc(32, 11);
    const coordinator = createApprovalCoordinator({ repository: repo, runtimeInstanceId: 'runtime-a', hmacKey: key });
    const secret = 'SENTINEL_APPROVAL_SECRET_123';
    const capability = defineToolCapability({
      name: 'test.sensitive_write', effect: 'modify' as const,
      validate: (input: unknown) => ok(input as { path: string; content: string }),
      resolveSecurity: () => ok({ sensitivity: 'credential' as const, context: 'workspace' as const, workspaceId: 'ws-1' }),
      approval: { describe: () => ok(descriptor('.env')), bind: (input: { path: string; content: string }) => ok(input) },
      execute: () => ok(null),
    });
    const registry = createToolCapabilityRegistry([capability]); if (!registry.ok) throw new Error('registry');
    const kernel = createToolKernel({ registry: registry.value, audit: { append: () => undefined }, approval: coordinator });
    await kernel.invoke({ invocationId: 'i-1', session: { id: 's-1', type: 'mcp-stdio' }, capability: 'test.sensitive_write', input: { path: '.env', content: secret } });
    const rows = db.prepare('SELECT * FROM approval_requests').all();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(key.toString('hex'));
    expect(serialized).not.toContain('content');
    expect(serialized).toMatch(/[0-9a-f]{64}/);
  });
});
