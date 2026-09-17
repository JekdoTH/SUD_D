import { execFileSync } from 'node:child_process';
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
  createGitSafetyAdapter,
  openDatabase,
  type GitSafetyAdapter,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import { createGitCommandRunner } from '../../infrastructure/src/git-command-runner.js';

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
    expect(gitPage).toContain('const pending = pendingApproval;');
    expect(gitPage).toContain('approvalRequestId: pending.approvalRequestId');
    expect(gitPage).toContain('await handleMutationResult(pending.action, pending.request, {');
    expect(gitPage).not.toContain("onNavigate('activity')");
    expect(gitPage).not.toContain('Review approval');
  });
});

describe('Git trusted runner Windows line endings', () => {
  it.skipIf(process.platform !== 'win32')('does not treat a normal CRLF checkout as a local content change', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-crlf-status-'));
    try {
      const where = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe');
      const gitExecutable = execFileSync(where, ['git'], { encoding: 'utf8' })
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .find(Boolean);
      if (!gitExecutable) throw new Error('git executable not found');

      execFileSync(gitExecutable, ['init', '-q'], { cwd: root });
      execFileSync(gitExecutable, ['config', 'user.name', 'Fixture User'], { cwd: root });
      execFileSync(gitExecutable, ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
      fs.writeFileSync(path.join(root, 'tracked.txt'), 'first\nsecond\n', 'utf8');
      execFileSync(gitExecutable, ['-c', 'core.autocrlf=true', 'add', '--', 'tracked.txt'], { cwd: root });
      execFileSync(gitExecutable, ['commit', '-q', '-m', 'fixture'], { cwd: root });

      fs.rmSync(path.join(root, 'tracked.txt'));
      execFileSync(gitExecutable, ['-c', 'core.autocrlf=true', 'checkout', '--', 'tracked.txt'], { cwd: root });
      expect(fs.readFileSync(path.join(root, 'tracked.txt'), 'utf8')).toBe('first\r\nsecond\r\n');

      const cliStatus = execFileSync(gitExecutable, ['-c', 'core.autocrlf=true', 'status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      });
      expect(cliStatus).toBe('');

      const runner = createGitCommandRunner({ resolveGitExecutable: () => ok(gitExecutable) });
      const status = createGitSafetyAdapter({ commandRunner: runner }).status(fs.realpathSync.native(root));
      expect(status).toMatchObject({ ok: true, value: { clean: true, entries: [] } });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
