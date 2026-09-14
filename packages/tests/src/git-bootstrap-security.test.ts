import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createAllGitCapabilities,
  createApprovalCoordinator,
  createGitWorkflowCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
  GIT_WORKFLOW_CAPABILITY_NAMES,
  type GitWorkspaceService,
} from '@sud-d/application';
import { ok, type ApprovalMode, type AuditEvent, type Workspace } from '@sud-d/domain';
import {
  createApprovalRepository,
  openDatabase,
  type Db,
  type GitSafetyAdapter,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';

const SNAPSHOT = 'a'.repeat(64);

function workspace(): Workspace {
  return {
    id: 'ws-1', displayName: 'Widgets', canonicalRoot: 'C:\\Work\\Widgets', isActive: true,
    createdAt: new Date('2026-09-14T00:00:00Z'), updatedAt: new Date('2026-09-14T00:00:00Z'),
  };
}

function deps() {
  const ws = workspace();
  const workspaceRepo: WorkspaceRepository = {
    list: () => [ws], findById: (id) => id === ws.id ? ws : undefined,
    findByCanonicalRoot: (root) => root === ws.canonicalRoot ? ws : undefined,
    save: () => ws, setActive: () => undefined, remove: () => undefined,
  };
  const networkCalls: Array<{ operation: string; input: unknown }> = [];
  const gitWorkspace = {
    resolveNetworkSecurity(operation: string, input: unknown) {
      networkCalls.push({ operation, input });
      return ok({ sensitivity: 'normal' as const, context: 'github_network' as const, ...(operation === 'clone' ? {} : { workspaceId: ws.id }) });
    },
    networkApprovalBinding(operation: string, input: unknown) {
      if (operation === 'clone') return ok({ operation: 'clone', safeRepository: 'acme/widgets', transport: 'https', destinationLabel: 'clone-target' });
      return ok({ operation, expectedSnapshotId: SNAPSHOT, remoteName: 'upstream', safeRepository: 'acme/widgets', transport: 'https' });
    },
    snapshot: () => ok({ marker: 'snapshot' }),
    initialize: () => ok({ marker: 'init' }),
    configureRemote: () => ok({ marker: 'remote' }),
    selectPrimaryRemote: () => ok({ marker: 'select' }),
    createBranch: () => ok({ marker: 'create' }),
    switchBranch: () => ok({ marker: 'switch' }),
    mergeBranch: () => ok({ marker: 'merge' }),
    deleteBranch: () => ok({ marker: 'delete' }),
    fetch: () => ok({ marker: 'fetch' }),
    sync: () => ok({ marker: 'sync' }),
    push: () => ok({ marker: 'push' }),
    clone: () => ok({ marker: 'clone' }),
  } as unknown as GitWorkspaceService;
  return { workspaceRepo, gitWorkspace, networkCalls };
}

function byName() {
  const d = deps();
  const capabilities = createGitWorkflowCapabilities({ workspaceRepo: d.workspaceRepo, gitSafety: {} as GitSafetyAdapter, gitWorkspace: d.gitWorkspace });
  return { ...d, capabilities, get: (name: string) => capabilities.find((item) => item.name === name)! };
}

describe('Git Bootstrap - workflow capability security', () => {
  it('registers exactly the approved workflow names/effects and strictly rejects privileged extra fields', () => {
    const h = byName();
    expect(GIT_WORKFLOW_CAPABILITY_NAMES).toEqual([
      'git.inspect', 'git.init', 'git.remote.configure', 'git.remote.select', 'git.branch.create', 'git.branch.switch',
      'git.branch.merge', 'git.branch.delete', 'git.fetch', 'git.sync', 'git.push', 'git.clone',
    ]);
    expect(Object.fromEntries(h.capabilities.map((item) => [item.name, item.effect]))).toEqual({
      'git.inspect': 'read', 'git.init': 'create', 'git.remote.configure': 'modify', 'git.remote.select': 'modify',
      'git.branch.create': 'create', 'git.branch.switch': 'modify', 'git.branch.merge': 'modify', 'git.branch.delete': 'delete',
      'git.fetch': 'read', 'git.sync': 'modify', 'git.push': 'modify', 'git.clone': 'create',
    });
    expect(h.get('git.inspect').validate({})).toMatchObject({ ok: true });
    expect(h.get('git.init').validate({ expectedSnapshotId: SNAPSHOT })).toMatchObject({ ok: true });
    expect(h.get('git.remote.configure').validate({ expectedSnapshotId: SNAPSHOT, remoteName: 'upstream', remoteUrl: 'https://github.com/acme/widgets.git' })).toMatchObject({ ok: true });
    expect(h.get('git.branch.create').validate({ expectedSnapshotId: SNAPSHOT, branchName: 'feature/x' })).toMatchObject({ ok: true });
    expect(h.get('git.clone').validate({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone-target', displayName: 'Clone' })).toMatchObject({ ok: true });
    for (const name of GIT_WORKFLOW_CAPABILITY_NAMES) {
      const valid = name === 'git.inspect' ? {} : name === 'git.clone'
        ? { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone-target', displayName: 'Clone' }
        : name === 'git.remote.configure'
          ? { expectedSnapshotId: SNAPSHOT, remoteName: 'upstream', remoteUrl: 'https://github.com/acme/widgets.git' }
          : name === 'git.remote.select'
            ? { expectedSnapshotId: SNAPSHOT, remoteName: 'upstream' }
            : name.startsWith('git.branch.')
              ? { expectedSnapshotId: SNAPSHOT, branchName: 'feature/x' }
              : { expectedSnapshotId: SNAPSHOT };
      expect(h.get(name).validate({ ...valid, executable: 'git.exe' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    }
  });

  it('keeps local actions in workspace context and resolves GitHub actions only through trusted service validation', () => {
    const h = byName();
    expect(h.get('git.inspect').resolveSecurity({})).toEqual({ ok: true, value: { sensitivity: 'normal', context: 'workspace', workspaceId: 'ws-1' } });
    expect(h.get('git.branch.delete').resolveSecurity({ expectedSnapshotId: SNAPSHOT, branchName: 'old' })).toEqual({ ok: true, value: { sensitivity: 'normal', context: 'workspace', workspaceId: 'ws-1' } });
    expect(h.get('git.sync').resolveSecurity({ expectedSnapshotId: SNAPSHOT })).toMatchObject({ ok: true, value: { context: 'github_network', workspaceId: 'ws-1' } });
    expect(h.get('git.clone').resolveSecurity({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone-target', displayName: 'Clone' })).toMatchObject({ ok: true, value: { context: 'github_network' } });
    expect(h.networkCalls.map((call) => call.operation)).toEqual(['sync', 'clone']);

    const syncSecurity = h.get('git.sync').resolveSecurity({ expectedSnapshotId: SNAPSHOT });
    if (!syncSecurity.ok) throw new Error(syncSecurity.error.code);
    expect(h.get('git.sync').approval?.bind({ expectedSnapshotId: SNAPSHOT }, syncSecurity.value)).toEqual({
      ok: true, value: { operation: 'sync', expectedSnapshotId: SNAPSHOT, remoteName: 'upstream', safeRepository: 'acme/widgets', transport: 'https' },
    });
    const cloneSecurity = h.get('git.clone').resolveSecurity({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone-target', displayName: 'Clone' });
    if (!cloneSecurity.ok) throw new Error(cloneSecurity.error.code);
    expect(h.get('git.clone').approval?.bind({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone-target', displayName: 'Clone' }, cloneSecurity.value)).toEqual({
      ok: true, value: { operation: 'clone', safeRepository: 'acme/widgets', transport: 'https', destinationLabel: 'clone-target' },
    });
    expect(h.get('git.branch.delete').approval).toBeDefined();
  });

  it('revalidates the authorized active Workspace immediately before workflow execution', async () => {
    const first = workspace();
    const second: Workspace = { ...workspace(), id: 'ws-2', displayName: 'Other', canonicalRoot: 'C:\\Work\\Other', isActive: false };
    let workspaces = [first, second];
    const workspaceRepo: WorkspaceRepository = {
      list: () => workspaces,
      findById: (id) => workspaces.find((item) => item.id === id),
      findByCanonicalRoot: (root) => workspaces.find((item) => item.canonicalRoot === root),
      save: () => { throw new Error('unexpected save'); },
      setActive: () => undefined,
      remove: () => undefined,
    };
    let executions = 0;
    const base = deps();
    const gitWorkspace = {
      ...base.gitWorkspace,
      snapshot: () => { executions += 1; return ok({ marker: 'snapshot' }); },
    } as unknown as GitWorkspaceService;
    const inspect = createGitWorkflowCapabilities({ workspaceRepo, gitSafety: {} as GitSafetyAdapter, gitWorkspace })
      .find((item) => item.name === 'git.inspect')!;
    const security = inspect.resolveSecurity({});
    if (!security.ok) throw new Error(security.error.code);

    workspaces = [
      { ...first, isActive: false },
      { ...second, isActive: true },
    ];
    const result = await inspect.execute({}, {
      invocationId: 'workspace-switch',
      session: { id: 's', type: 'mcp-stdio' },
      security: security.value,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'WORKSPACE_NOT_FOUND' } });
    expect(executions).toBe(0);
  });

  it('preserves all five existing Git Safety capabilities when composing the full Git set', () => {
    const h = deps();
    const all = createAllGitCapabilities({ workspaceRepo: h.workspaceRepo, gitSafety: {} as GitSafetyAdapter, gitWorkspace: h.gitWorkspace });
    expect(all.map((item) => item.name)).toEqual(expect.arrayContaining(['git.detect', 'git.status', 'git.diff', 'git.checkpoint', 'git.commit', ...GIT_WORKFLOW_CAPABILITY_NAMES]));
    expect(all).toHaveLength(17);
  });

  it('keeps github_network approval mode semantics bounded and audit-safe', async () => {
    async function invoke(mode: ApprovalMode, capability: 'git.sync'|'git.branch.delete'|'git.clone') {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-cap-approval-'));
      const db: Db = openDatabase(path.join(root, 'state.db'));
      try {
        const base = deps();
        let executions = 0;
        const gitWorkspace = {
          ...base.gitWorkspace,
          sync: () => { executions += 1; return ok({ marker: 'sync' }); },
          deleteBranch: () => { executions += 1; return ok({ marker: 'delete' }); },
          clone: () => { executions += 1; return ok({ marker: 'clone' }); },
        } as unknown as GitWorkspaceService;
        const definitions = createGitWorkflowCapabilities({ workspaceRepo: base.workspaceRepo, gitSafety: {} as GitSafetyAdapter, gitWorkspace });
        const registry = createToolCapabilityRegistry(definitions);
        if (!registry.ok) throw new Error(registry.error.code);
        const audits: Array<Omit<AuditEvent, 'id'>> = [];
        const approval = createApprovalCoordinator({
          repository: createApprovalRepository(db),
          runtimeInstanceId: `git-cap-${mode}-${capability}`,
          hmacKey: Buffer.alloc(32, 41),
          mode: () => mode,
        });
        const kernel = createToolKernel({ registry: registry.value, audit: { append: (event) => { audits.push(event); } }, approval });
        const input = capability === 'git.clone'
          ? { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\SECRET_DESTINATION\\clone-target', displayName: 'Clone' }
          : capability === 'git.branch.delete'
            ? { expectedSnapshotId: SNAPSHOT, branchName: 'old-branch' }
            : { expectedSnapshotId: SNAPSHOT };
        const result = await kernel.invoke({ invocationId: `inv-${mode}-${capability}`, session: { id: 's', type: 'mcp-stdio' }, capability, input });
        return { result, executions, audits };
      } finally {
        db.close();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }

    const standard = await invoke('standard', 'git.sync');
    expect(standard.result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(standard.executions).toBe(0);

    for (const mode of ['approve_for_me', 'full_access'] as const) {
      const automatic = await invoke(mode, 'git.sync');
      expect(automatic.result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask', approvalDecision: 'approved' });
      expect(automatic.executions).toBe(1);
    }

    const deletion = await invoke('full_access', 'git.branch.delete');
    expect(deletion.result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(deletion.executions).toBe(0);

    const clone = await invoke('full_access', 'git.clone');
    expect(clone.result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask', approvalDecision: 'approved' });
    expect(clone.executions).toBe(1);
    const auditText = JSON.stringify(clone.audits);
    expect(auditText).not.toContain('https://github.com/acme/widgets.git');
    expect(auditText).not.toContain('SECRET_DESTINATION');
    expect(auditText).not.toMatch(/executable|argv|processEnv|stderr|stdout/i);
  });
});
