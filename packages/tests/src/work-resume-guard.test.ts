import { describe, expect, it } from 'vitest';
import {
  createWorkResumeGuardedToolKernel,
  type ToolKernel,
  type WorkMemoryService,
} from '@sud-d/application';
import { appError, err, ok, type AuditEvent, type Workspace } from '@sud-d/domain';
import type { WorkspaceRepository } from '@sud-d/infrastructure';

function workspace(id: string): Workspace {
  return { id, displayName: id, canonicalRoot: `C:\\workspace\\${id}`, isActive: true, createdAt: new Date(), updatedAt: new Date() };
}
function mutableRepo(initial: Workspace): WorkspaceRepository & { current: Workspace } {
  const repo: WorkspaceRepository & { current: Workspace } = {
    current: initial,
    list: () => [repo.current],
    findById: (id) => id === repo.current.id ? repo.current : undefined,
    findByCanonicalRoot: () => repo.current,
    save: () => repo.current,
    setActive: () => undefined,
    remove: () => undefined,
  };
  return repo;
}

describe('Work Resume central Tool Kernel guard', () => {
  it('blocks project-scoped capabilities before resume with safe audit and no inner dispatch', async () => {
    const repo = mutableRepo(workspace('workspace-a'));
    const resumeState = { workspaceId: undefined as string | undefined };
    const workMemory: WorkMemoryService = {
      resume: () => { throw new Error('not used'); },
      checkpoint: () => { throw new Error('not used'); },
      requireResumed(_session, workspaceId) {
        return resumeState.workspaceId === workspaceId
          ? ok(undefined)
          : err(appError('WORK_RESUME_REQUIRED', 'Work resume is required for the active Workspace'));
      },
    };
    const dispatches: string[] = [];
    const inner: ToolKernel = {
      async invoke(request) {
        dispatches.push(request.capability);
        return { ok: true, outcome: 'executed', code: 'EXECUTED', policyDecision: 'allow', value: request.capability };
      },
    };
    const audits: Array<Omit<AuditEvent, 'id'>> = [];
    const guarded = createWorkResumeGuardedToolKernel({
      kernel: inner,
      workspaceRepo: repo,
      workMemory,
      audit: { append: (event) => { audits.push(event); } },
    });
    const session = { id: 'session-a', type: 'mcp-stdio' as const };
    const invoke = (capability: string) => guarded.invoke({ invocationId: `inv-${capability}`, session, capability, input: {} });

    for (const capability of [
      'workspace.read_text', 'git.status', 'code.overview', 'verify.run', 'team.status', 'work.checkpoint',
      'git.inspect', 'git.init', 'git.remote.configure', 'git.remote.select', 'git.branch.create', 'git.branch.switch',
      'git.branch.merge', 'git.branch.delete', 'git.fetch', 'git.sync', 'git.push',
    ]) {
      await expect(invoke(capability)).resolves.toMatchObject({
        ok: false,
        code: 'WORK_RESUME_REQUIRED',
        outcome: 'blocked',
        causeCode: 'WORK_RESUME_REQUIRED',
      });
    }
    expect(dispatches).toEqual([]);
    expect(audits).toHaveLength(17);
    expect(audits.every((event) => event.resultCode === 'WORK_RESUME_REQUIRED')).toBe(true);
    expect(JSON.stringify(audits)).not.toMatch(/input|payload|content|stdout|stderr|secret/i);

    await expect(invoke('work.resume')).resolves.toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(dispatches).toEqual(['work.resume']);

    resumeState.workspaceId = 'workspace-a';
    await expect(invoke('git.status')).resolves.toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(dispatches).toEqual(['work.resume', 'git.status']);

    repo.current = workspace('workspace-b');
    await expect(invoke('git.status')).resolves.toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
    expect(dispatches).toEqual(['work.resume', 'git.status']);
  });

  it('forwards git.clone without requiring an active Workspace resume', async () => {
    const repo = mutableRepo(workspace('workspace-a'));
    repo.list = () => [];
    const workMemory: WorkMemoryService = {
      resume: () => { throw new Error('not used'); },
      checkpoint: () => { throw new Error('not used'); },
      requireResumed: () => { throw new Error('git.clone must not consult resume state'); },
    };
    const seen: string[] = [];
    const inner: ToolKernel = { async invoke(request) { seen.push(request.capability); return { ok: true, outcome: 'executed', code: 'EXECUTED', policyDecision: 'ask', value: request.capability }; } };
    const guarded = createWorkResumeGuardedToolKernel({ kernel: inner, workspaceRepo: repo, workMemory, audit: { append: () => undefined } });
    await expect(guarded.invoke({ invocationId: 'clone', session: { id: 's', type: 'mcp-stdio' }, capability: 'git.clone', input: {} })).resolves.toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(seen).toEqual(['git.clone']);
  });

  it('delegates non-project or unknown capabilities so the inner Kernel remains authoritative', async () => {
    const repo = mutableRepo(workspace('workspace-a'));
    const workMemory: WorkMemoryService = {
      resume: () => { throw new Error('not used'); },
      checkpoint: () => { throw new Error('not used'); },
      requireResumed: () => err(appError('WORK_RESUME_REQUIRED', 'Work resume is required for the active Workspace')),
    };
    const seen: string[] = [];
    const inner: ToolKernel = { async invoke(request) { seen.push(request.capability); return { ok: false, outcome: 'blocked', code: 'UNKNOWN_CAPABILITY' }; } };
    const guarded = createWorkResumeGuardedToolKernel({ kernel: inner, workspaceRepo: repo, workMemory, audit: { append: () => undefined } });
    const result = await guarded.invoke({ invocationId: 'unknown', session: { id: 's', type: 'mcp-stdio' }, capability: 'future.non_project', input: {} });
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_CAPABILITY' });
    expect(seen).toEqual(['future.non_project']);
  });
});
