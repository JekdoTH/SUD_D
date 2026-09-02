import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ApprovalListInputSchema,
  ApprovalRespondInputSchema,
  DesktopApprovalRequestDtoSchema,
  DesktopApprovalResponseDtoSchema,
  IPC_CHANNELS,
} from '@sud-d/contracts';
import { ok } from '@sud-d/domain';
import { createApprovalRepository, createAuditRepository, openDatabase, type Db } from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createApprovalService,
  createToolCapabilityRegistry,
  createToolKernel,
  defineToolCapability,
} from '@sud-d/application';
import { createDesktopApprovalController } from '../../desktop/electron/approval-controller.js';
import { registerDesktopApprovalIpcHandlers } from '../../desktop/electron/approval-ipc.js';

const dbs: Db[] = [];
const roots: string[] = [];

function makeDb(): Db {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-basic-approval-desktop-'));
  roots.push(root);
  const db = openDatabase(path.join(root, 'state.db'));
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function makeSensitivePending(db: Db, secret = 'SENTINEL_RENDERER_SECRET_789') {
  const repository = createApprovalRepository(db);
  const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'runtime-desktop', hmacKey: Buffer.alloc(32, 21) });
  const capability = defineToolCapability<{ path: string; content: string }, unknown>({
    name: 'test.sensitive_write',
    effect: 'modify',
    validate: (input: unknown) => ok(input as { path: string; content: string }),
    resolveSecurity: () => ok({ sensitivity: 'credential', context: 'workspace', workspaceId: 'ws-safe' }),
    approval: {
      describe: (input) => ok({ title: 'Write sensitive file', resourceLabel: input.path }),
      bind: (input) => ok({ path: input.path, content: input.content }),
    },
    execute: () => ok(null),
  });
  const registry = createToolCapabilityRegistry([capability]);
  if (!registry.ok) throw new Error('registry');
  const kernel = createToolKernel({ registry: registry.value, audit: createAuditRepository(db), approval: coordinator });
  const result = await kernel.invoke({
    invocationId: 'desktop-fixture',
    session: { id: 'mcp-session-safe', type: 'mcp-stdio' },
    capability: 'test.sensitive_write',
    input: { path: '.env', content: secret },
  });
  if (result.ok || !result.approvalRequestId) throw new Error('expected pending approval');
  return { repository, requestId: result.approvalRequestId, secret };
}

describe('Basic Approval - Desktop contracts and controller confidentiality', () => {
  it('uses strict bounded list/respond schemas and rejects privilege-shaped extras', () => {
    expect(IPC_CHANNELS.APPROVAL_LIST).toBe('approval:list');
    expect(IPC_CHANNELS.APPROVAL_RESPOND).toBe('approval:respond');
    expect(ApprovalListInputSchema.safeParse({ limit: 50 }).success).toBe(true);
    expect(ApprovalListInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(ApprovalListInputSchema.safeParse({ limit: 10, capability: 'workspace.read_text' }).success).toBe(false);
    const id = '00000000-0000-4000-8000-000000000001';
    expect(ApprovalRespondInputSchema.safeParse({ approvalRequestId: id, decision: 'approve' }).success).toBe(true);
    expect(ApprovalRespondInputSchema.safeParse({ approvalRequestId: id, decision: 'approve', effect: 'execute' }).success).toBe(false);
    expect(ApprovalRespondInputSchema.safeParse({ approvalRequestId: id, decision: 'allow-always' }).success).toBe(false);
  });

  it('renderer-facing list contains only safe bounded DTO fields and no secret/binding/session/runtime data', async () => {
    const db = makeDb();
    const { repository, secret } = await makeSensitivePending(db);
    const controller = createDesktopApprovalController(createApprovalService(repository, createAuditRepository(db)));
    const result = controller.list({ limit: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(DesktopApprovalRequestDtoSchema.parse(result.value[0])).toEqual(result.value[0]);
    expect(result.value[0]).toMatchObject({
      capability: 'test.sensitive_write',
      effect: 'modify',
      sensitivity: 'credential',
      title: 'Write sensitive file',
      resourceLabel: '.env',
      status: 'pending',
    });
    const serialized = JSON.stringify(result.value);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toMatch(/bindingDigest|runtimeInstance|sessionId|sessionType|workspaceId|hmac|rawInput|content/i);
  });

  it('respond returns safe retry guidance and terminal request disappears from actionable list', async () => {
    const db = makeDb();
    const { repository, requestId } = await makeSensitivePending(db);
    const controller = createDesktopApprovalController(createApprovalService(repository, createAuditRepository(db)));
    const response = controller.respond({ approvalRequestId: requestId, decision: 'approve' });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(DesktopApprovalResponseDtoSchema.parse(response.value)).toEqual(response.value);
    expect(response.value).toEqual({
      id: requestId,
      status: 'approved',
      message: 'Approved. Retry the action from the connected AI.',
    });
    expect(controller.list({ limit: 50 })).toMatchObject({ ok: true, value: [] });
  });

  it('deny returns terminal guidance and cannot later approve', async () => {
    const db = makeDb();
    const { repository, requestId } = await makeSensitivePending(db);
    const controller = createDesktopApprovalController(createApprovalService(repository, createAuditRepository(db)));
    expect(controller.respond({ approvalRequestId: requestId, decision: 'deny' })).toMatchObject({
      ok: true,
      value: { status: 'denied', message: 'Denied. The action will not run.' },
    });
    expect(controller.respond({ approvalRequestId: requestId, decision: 'approve' })).toMatchObject({
      ok: false,
      error: { code: 'APPROVAL_STATE_INVALID' },
    });
  });
});

describe('Basic Approval - fixed-purpose Desktop IPC and UI surface', () => {
  it('IPC rejects renderer attempts to alter approval authority and does not call controller', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const list = vi.fn(() => ({ ok: true as const, value: [] }));
    const respond = vi.fn(() => ({ ok: true as const, value: {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'approved' as const,
      message: 'Approved. Retry the action from the connected AI.',
    } }));
    registerDesktopApprovalIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { list, respond },
      () => true,
    );

    const invalid = await handlers.get(IPC_CHANNELS.APPROVAL_RESPOND)?.(
      { sender: { id: 1 } },
      {
        approvalRequestId: '00000000-0000-4000-8000-000000000001',
        decision: 'approve',
        capability: 'git.checkpoint',
        effect: 'execute',
        sensitivity: 'normal',
        workspaceId: 'attacker',
        status: 'approved',
        expiresAt: '2099-01-01T00:00:00.000Z',
        binding: 'attacker',
      },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(respond).not.toHaveBeenCalled();
  });

  it('invalid sender cannot list or decide approvals', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const list = vi.fn(() => ({ ok: true as const, value: [] }));
    const respond = vi.fn(() => ({ ok: true as const, value: { id: '', status: 'denied' as const, message: '' } }));
    registerDesktopApprovalIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { list, respond },
      () => false,
    );
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_LIST)?.({ sender: {} }, {})).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_RESPOND)?.({ sender: {} }, { approvalRequestId: '00000000-0000-4000-8000-000000000001', decision: 'deny' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(list).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it('preload exposes list/respond only and no approval creation or generic IPC authority', () => {
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const start = preload.indexOf('  approval: {');
    const end = preload.indexOf('  team: {', start);
    const approvalSurface = start >= 0 && end > start ? preload.slice(start, end) : '';
    expect(approvalSurface).toContain('list:');
    expect(approvalSurface).toContain('respond:');
    expect(approvalSurface).not.toMatch(/create|always|bulk|capability|effect|sensitivity|workspace|binding|expiry|expiresAt|status:/i);
    expect(preload).not.toContain('ipcRenderer.send');
  });

  it('Activity page shows Pending approvals with only Approve/Deny and retry guidance', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ActivityPage.tsx'), 'utf8');
    expect(source).toContain('Pending approvals');
    expect(source).toContain('Approve');
    expect(source).toContain('Deny');
    expect(source).toContain('setApprovalMessage(result.value.message)');
    expect(source).toContain('window.sudD.approval.respond');
    expect(source).not.toMatch(/Always Allow|approve all|bulk approval|auto-approval/i);
    expect(source).not.toMatch(/bindingDigest|hmac|raw input|file contents|diff contents|secret value/i);
  });
});
