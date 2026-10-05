import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluatePolicy, ok, type ApprovalMode } from '@sud-d/domain';
import { createApprovalCoordinator, createTeamCapabilities, createTeamService, createToolCapabilityRegistry, createToolKernel } from '@sud-d/application';
import { canonicalizePath, createApprovalRepository, createAuditRepository, createTeamRepository, createTeamTransitionUnitOfWork, createWorkspaceRepository, openDatabase } from '@sud-d/infrastructure';

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function harness(mode: ApprovalMode = 'standard') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-team-opt-in-'));
  const db = openDatabase(path.join(root, 'state.db'));
  cleanups.push(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const canonical = canonicalizePath(root);
  if (!canonical.ok) throw new Error('root');
  const workspaceRepo = createWorkspaceRepository(db);
  const workspace = workspaceRepo.save('Owner Workspace', canonical.value);
  workspaceRepo.setActive(workspace.id);
  const audit = createAuditRepository(db);
  const service = createTeamService({ workspaceRepo, teamRepo: createTeamRepository(db), audit, transitionUow: createTeamTransitionUnitOfWork(db) });
  const approvals = createApprovalRepository(db);
  const approval = createApprovalCoordinator({ repository: approvals, runtimeInstanceId: 'team-test', hmacKey: Buffer.alloc(32, 12), mode: () => mode });
  let activeWorkspaceId = workspace.id;
  const registry = createToolCapabilityRegistry(createTeamCapabilities({ teamService: service, resolveWorkspaceSecurity: () => ok({ workspaceId: activeWorkspaceId, sensitivity: 'normal', context: 'workspace' }) }));
  if (!registry.ok) throw new Error('registry');
  const kernel = createToolKernel({ registry: registry.value, audit, approval });
  const invoke = (goal = 'Write the requested script') => kernel.invoke({ invocationId: crypto.randomUUID(), session: { id: 'chat', type: 'mcp-stdio' }, capability: 'team.start', input: { goal } });
  return { service, approvals, approval, invoke, workspaceRepo, canonical: canonical.value, kernel, registry: registry.value, audit, setActive: (id: string) => { activeWorkspaceId = id; workspaceRepo.setActive(id); } };
}

describe('Team startup requires a trusted owner choice', () => {
  it('an AI startup request creates no mission until the owner approves', async () => {
    const h = harness();
    expect(await h.invoke()).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('owner approval starts the exact mission once; another mission needs approval', async () => {
    const h = harness();
    const pending = await h.invoke();
    if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    expect(h.approvals.respond(pending.approvalRequestId, 'approve').ok).toBe(true);
    expect(await h.invoke()).toMatchObject({ ok: true, policyDecision: 'ask', approvalDecision: 'approved' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: { goalSummary: 'Write the requested script' } });
    expect(h.service.stop({}).ok).toBe(true);
    expect(await h.invoke()).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('denial leaves Normal Mode without a mission', async () => {
    const h = harness();
    const pending = await h.invoke();
    if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    h.approvals.respond(pending.approvalRequestId, 'deny');
    expect(await h.invoke()).toMatchObject({ ok: false, code: 'APPROVAL_DENIED' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('changed goal or Workspace cannot use a prior approval', async () => {
    const h = harness();
    const pending = await h.invoke();
    if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    h.approvals.respond(pending.approvalRequestId, 'approve');
    expect(await h.invoke('A different task')).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    const other = h.workspaceRepo.save('Other Workspace', h.canonical + '-other');
    h.setActive(other.id);
    expect(await h.invoke()).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('missing Approval coordinator fails closed and status needs no approval', async () => {
    const h = harness();
    const kernel = createToolKernel({ registry: h.registry, audit: h.audit });
    const base = { invocationId: crypto.randomUUID(), session: { id: 'chat', type: 'mcp-stdio' as const } };
    expect(await kernel.invoke({ ...base, capability: 'team.start', input: { goal: 'A task' } })).toMatchObject({ ok: false, code: 'APPROVAL_CONTEXT_FAILED' });
    expect(await kernel.invoke({ ...base, capability: 'team.status', input: {} })).toMatchObject({ ok: true });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('approval previews do not serialize the goal; hard denies still take precedence', async () => {
    const h = harness();
    await h.invoke('SENTINEL_PRIVATE_GOAL');
    expect(JSON.stringify(h.approvals.listPending(50))).not.toContain('SENTINEL_PRIVATE_GOAL');
    for (const context of ['outside_workspace', 'internal_root', 'network'] as const) {
      expect(evaluatePolicy({ capability: 'team.start', context, effect: 'create', sensitivity: 'normal' }).decision).toBe('deny');
    }
    expect(evaluatePolicy({ capability: 'team.status', context: 'workspace', effect: 'read', sensitivity: 'normal' }).decision).toBe('allow');
  });

  it.each(['approve_for_me', 'full_access'] as const)('%s cannot choose Team Mode for the user', async (mode) => {
    const h = harness(mode);
    expect(await h.invoke()).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });

  it('a Workspace switch after authorization cannot create a mission in another Workspace', async () => {
    const h = harness();
    const pending = await h.invoke();
    if (pending.ok || !pending.approvalRequestId) throw new Error('pending');
    h.approvals.respond(pending.approvalRequestId, 'approve');
    const other = h.workspaceRepo.save('Other Workspace', h.canonical + '-other');
    const kernel = createToolKernel({ registry: h.registry, approval: h.approval, audit: { append: (event) => {
      if (event.resultCode === 'EXECUTION_AUTHORIZED') h.setActive(other.id);
      return h.audit.append(event);
    } } });
    const result = await kernel.invoke({ invocationId: crypto.randomUUID(), session: { id: 'chat', type: 'mcp-stdio' }, capability: 'team.start', input: { goal: 'Write the requested script' } });
    expect(result.ok).toBe(false);
    expect(h.service.status({})).toMatchObject({ ok: true, value: null });
  });
});
