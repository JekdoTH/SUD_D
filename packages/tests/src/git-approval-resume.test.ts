import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createApprovalCoordinator,
  createGitWorkflowCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
  type GitWorkspaceService,
} from '@sud-d/application';
import { ok, type Workspace } from '@sud-d/domain';
import {
  createApprovalRepository,
  openDatabase,
  type GitSafetyAdapter,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';

const SNAPSHOT = 'a'.repeat(64);
const WORKSPACE: Workspace = {
  id: 'ws-1',
  displayName: 'Widgets',
  canonicalRoot: 'C:\\Work\\Widgets',
  isActive: true,
  createdAt: new Date('2026-09-16T00:00:00Z'),
  updatedAt: new Date('2026-09-16T00:00:00Z'),
};

function gitDependencies(executions: string[]) {
  const workspaceRepo: WorkspaceRepository = {
    list: () => [WORKSPACE],
    findById: (id) => id === WORKSPACE.id ? WORKSPACE : undefined,
    findByCanonicalRoot: (root) => root === WORKSPACE.canonicalRoot ? WORKSPACE : undefined,
    save: () => WORKSPACE,
    setActive: () => undefined,
    remove: () => undefined,
  };
  const gitWorkspace = {
    resolveNetworkSecurity: () => ok({ sensitivity: 'normal' as const, context: 'github_network' as const, workspaceId: WORKSPACE.id }),
    networkApprovalBinding: (operation: string) => ok({
      operation,
      expectedSnapshotId: SNAPSHOT,
      remoteName: 'upstream',
      safeRepository: 'acme/widgets',
      transport: 'https',
    }),
    snapshot: () => ok({ marker: 'snapshot' }),
    initialize: () => ok({ marker: 'init' }),
    configureRemote: () => ok({ marker: 'remote' }),
    selectPrimaryRemote: () => ok({ marker: 'select' }),
    createBranch: () => ok({ marker: 'create' }),
    switchBranch: () => ok({ marker: 'switch' }),
    mergeBranch: () => ok({ marker: 'merge' }),
    deleteBranch: () => ok({ marker: 'delete' }),
    fetch: () => ok({ marker: 'fetch' }),
    sync: () => { executions.push('git.sync'); return ok({ marker: 'sync' }); },
    push: () => { executions.push('git.push'); return ok({ marker: 'push' }); },
    clone: () => ok({ marker: 'clone' }),
  } as unknown as GitWorkspaceService;
  return { workspaceRepo, gitWorkspace };
}

describe.each(['git.sync', 'git.push'] as const)('%s approval retry binding', (capability) => {
  it('reuses the pending approval, executes the exact approved retry once, then requires a new approval', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-approval-resume-'));
    const db = openDatabase(path.join(root, 'state.db'));
    try {
      const executions: string[] = [];
      const deps = gitDependencies(executions);
      const registry = createToolCapabilityRegistry(createGitWorkflowCapabilities({
        workspaceRepo: deps.workspaceRepo,
        gitSafety: {} as GitSafetyAdapter,
        gitWorkspace: deps.gitWorkspace,
      }));
      if (!registry.ok) throw new Error(registry.error.code);
      const repository = createApprovalRepository(db);
      const approval = createApprovalCoordinator({
        repository,
        runtimeInstanceId: `git-resume-${capability}`,
        hmacKey: Buffer.alloc(32, 61),
      });
      const kernel = createToolKernel({
        registry: registry.value,
        audit: { append: () => undefined },
        approval,
      });
      const base = {
        session: { id: 'desktop-git', type: 'desktop' as const },
        capability,
        input: { expectedSnapshotId: SNAPSHOT },
      };

      const pending = await kernel.invoke({ ...base, invocationId: `${capability}-pending` });
      expect(pending).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
      if (pending.ok || !pending.approvalRequestId) throw new Error('expected pending approval');

      const duplicate = await kernel.invoke({ ...base, invocationId: `${capability}-duplicate` });
      expect(duplicate).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', approvalRequestId: pending.approvalRequestId });
      expect(executions).toEqual([]);

      expect(repository.respond(pending.approvalRequestId, 'approve')).toMatchObject({ ok: true });
      const resumed = await kernel.invoke({ ...base, invocationId: `${capability}-resumed` });
      expect(resumed).toMatchObject({
        ok: true,
        code: 'EXECUTED',
        policyDecision: 'ask',
        approvalDecision: 'approved',
        approvalRequestId: pending.approvalRequestId,
      });
      expect(executions).toEqual([capability]);

      const consumed = await kernel.invoke({ ...base, invocationId: `${capability}-consumed` });
      expect(consumed).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
      expect(consumed.ok ? undefined : consumed.approvalRequestId).not.toBe(pending.approvalRequestId);
      expect(executions).toEqual([capability]);
    } finally {
      db.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Git page inline approval UX', () => {
  it('keeps approval on Git and resumes the captured pending action after approve', () => {
    const gitPage = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/GitPage.tsx'), 'utf8');

    expect(gitPage).toContain('Approve');
    expect(gitPage).toContain('Deny');
    expect(gitPage).toContain('window.sudD.approval.respond({');
    expect(gitPage).toContain('handleApprovalDecision');
    expect(gitPage).toContain('pendingApproval.request');
    expect(gitPage).not.toContain("onNavigate('activity')");
    expect(gitPage).not.toContain('Review approval');
  });
});
