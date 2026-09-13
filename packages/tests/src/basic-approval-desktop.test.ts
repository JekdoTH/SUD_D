import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ApprovalListInputSchema,
  ApprovalModeSetInputSchema,
  ApprovalRespondInputSchema,
  DesktopApprovalModeDtoSchema,
  DesktopApprovalRequestDtoSchema,
  DesktopApprovalResponseDtoSchema,
  IPC_CHANNELS,
} from '@sud-d/contracts';
import { ok } from '@sud-d/domain';
import {
  createApprovalModeRepository,
  createApprovalRepository,
  createAuditRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createApprovalModeService,
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

  it('persists a strict local Approval Mode setting with Approve for me as the default', () => {
    const db = makeDb();
    const repository = createApprovalRepository(db);
    const modeRepository = createApprovalModeRepository(db);
    const auditRepository = createAuditRepository(db);
    const controller = createDesktopApprovalController(
      createApprovalService(repository, auditRepository),
      createApprovalModeService(modeRepository),
    );

    expect(IPC_CHANNELS.APPROVAL_MODE_GET).toBe('approval:mode:get');
    expect(IPC_CHANNELS.APPROVAL_MODE_SET).toBe('approval:mode:set');
    expect(ApprovalModeSetInputSchema.safeParse({ mode: 'standard' }).success).toBe(true);
    expect(ApprovalModeSetInputSchema.safeParse({ mode: 'approve_for_me' }).success).toBe(true);
    expect(ApprovalModeSetInputSchema.safeParse({ mode: 'full_access' }).success).toBe(true);
    expect(ApprovalModeSetInputSchema.safeParse({ mode: 'unrestricted' }).success).toBe(false);
    expect(ApprovalModeSetInputSchema.safeParse({ mode: 'full_access', executable: 'cmd.exe' }).success).toBe(false);

    const initial = controller.getMode();
    expect(initial).toMatchObject({ ok: true, value: { mode: 'approve_for_me' } });
    if (!initial.ok) return;
    expect(DesktopApprovalModeDtoSchema.parse(initial.value)).toEqual(initial.value);

    for (const mode of ['standard', 'full_access', 'approve_for_me'] as const) {
      expect(controller.setMode({ mode })).toMatchObject({
        ok: true,
        value: { mode },
      });
      expect(createApprovalModeRepository(db).get()).toBe(mode);
    }
    expect(auditRepository.list(10)[0]).toMatchObject({
      sessionType: 'desktop',
      action: 'approval.mode.changed',
      resultCode: 'OK',
      metadata: { mode: 'approve_for_me' },
    });
  });

  it('fails closed without changing Approval Mode when its durable audit write fails', () => {
    const db = makeDb();
    const modeRepository = createApprovalModeRepository(db);
    const service = createApprovalModeService(modeRepository);

    db.exec('DROP TABLE audit_events');

    expect(service.set('full_access')).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Approval Mode is unavailable' },
    });
    expect(modeRepository.get()).toBe('approve_for_me');
  });

  it('renderer-facing list contains only safe bounded DTO fields and no secret/binding/session/runtime data', async () => {
    const db = makeDb();
    const { repository, secret } = await makeSensitivePending(db);
    const controller = createDesktopApprovalController(
      createApprovalService(repository, createAuditRepository(db)),
      createApprovalModeService(createApprovalModeRepository(db)),
    );
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
    const controller = createDesktopApprovalController(
      createApprovalService(repository, createAuditRepository(db)),
      createApprovalModeService(createApprovalModeRepository(db)),
    );
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
    const controller = createDesktopApprovalController(
      createApprovalService(repository, createAuditRepository(db)),
      createApprovalModeService(createApprovalModeRepository(db)),
    );
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
      {
        list,
        respond,
        getMode: vi.fn(() => ({ ok: true as const, value: { mode: 'standard' as const } })),
        setMode: vi.fn(() => ({ ok: true as const, value: { mode: 'standard' as const } })),
      },
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

  it('Approval Mode IPC is enum-only and rejects generic privilege/process-shaped input', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const getMode = vi.fn(() => ({ ok: true as const, value: { mode: 'standard' as const } }));
    const setMode = vi.fn((input: { mode: 'standard' | 'approve_for_me' | 'full_access' }) => ({
      ok: true as const,
      value: { mode: input.mode },
    }));
    registerDesktopApprovalIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      {
        list: vi.fn(() => ({ ok: true as const, value: [] })),
        respond: vi.fn(() => ({ ok: false as const, error: { code: 'APPROVAL_STATE_INVALID' as const, message: 'not used' } })),
        getMode,
        setMode,
      },
      () => true,
    );

    expect(await handlers.get(IPC_CHANNELS.APPROVAL_MODE_GET)?.({ sender: { id: 1 } })).toEqual({
      ok: true,
      value: { mode: 'standard' },
    });
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_MODE_SET)?.({ sender: { id: 1 } }, { mode: 'approve_for_me' })).toEqual({
      ok: true,
      value: { mode: 'approve_for_me' },
    });
    expect(setMode).toHaveBeenCalledWith({ mode: 'approve_for_me' });

    for (const invalid of [
      { mode: 'unrestricted' },
      { mode: 'full_access', executable: 'cmd.exe' },
      { mode: 'approve_for_me', argv: ['--unsafe'] },
      { mode: 'standard', cwd: 'C:\\' },
      { mode: 'standard', env: { PATH: 'attacker' } },
      { mode: 'standard', policy: 'allow-all' },
    ]) {
      expect(await handlers.get(IPC_CHANNELS.APPROVAL_MODE_SET)?.({ sender: { id: 1 } }, invalid)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
    }
    expect(setMode).toHaveBeenCalledTimes(1);
  });

  it('invalid sender cannot list, decide approvals, or change Approval Mode', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const list = vi.fn(() => ({ ok: true as const, value: [] }));
    const respond = vi.fn(() => ({ ok: true as const, value: { id: '', status: 'denied' as const, message: '' } }));
    const getMode = vi.fn(() => ({ ok: true as const, value: { mode: 'standard' as const } }));
    const setMode = vi.fn(() => ({ ok: true as const, value: { mode: 'standard' as const } }));
    registerDesktopApprovalIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { list, respond, getMode, setMode },
      () => false,
    );
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_LIST)?.({ sender: {} }, {})).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_RESPOND)?.({ sender: {} }, { approvalRequestId: '00000000-0000-4000-8000-000000000001', decision: 'deny' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_MODE_GET)?.({ sender: {} })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handlers.get(IPC_CHANNELS.APPROVAL_MODE_SET)?.({ sender: {} }, { mode: 'standard' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(list).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
    expect(getMode).not.toHaveBeenCalled();
    expect(setMode).not.toHaveBeenCalled();
  });

  it('preload exposes only fixed approval actions and the enum-only Approval Mode surface', () => {
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const start = preload.indexOf('  approval: {');
    const end = preload.indexOf('  team: {', start);
    const approvalSurface = start >= 0 && end > start ? preload.slice(start, end) : '';
    expect(approvalSurface).toContain('list:');
    expect(approvalSurface).toContain('respond:');
    expect(approvalSurface).toContain('getMode:');
    expect(approvalSurface).toContain('setMode:');
    expect(approvalSurface).not.toMatch(/create|bulk|capability|effect|sensitivity|workspace|binding|expiry|expiresAt|status:|executable|argv|cwd|env|policy/i);
    expect(preload).not.toContain('ipcRenderer.send');
  });

  it('Overview owns exactly the three Default Approval Modes while Activity remains history-only', () => {
    const overview = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'), 'utf8');
    const activity = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ActivityPage.tsx'), 'utf8');

    expect(overview).toContain('Default Approval Mode');
    expect(overview).toContain("label: 'Standard'");
    expect(overview).toContain("label: 'Approve for me'");
    expect(overview).toContain("label: 'Full Access'");
    expect(overview).toContain('role="radiogroup"');
    expect(overview).toContain('aria-checked={approvalMode === option.mode}');
    expect(overview).toContain('window.sudD.approval.setMode({ mode })');
    expect(overview).toContain('shared by all approved workspaces on this device');
    expect(overview).not.toMatch(/executable|argv|cwd|env\s*=|allow-all|policy editor|custom policy|arbitrary/i);

    expect(activity).not.toContain('Default Approval Mode');
    expect(activity).not.toContain('Approval Mode');
    expect(activity).not.toContain('window.sudD.approval.setMode');
  });

  it('Activity page keeps exact pending Approve/Deny decisions and retry guidance', () => {
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
