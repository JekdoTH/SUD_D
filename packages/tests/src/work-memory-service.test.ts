import { describe, expect, it } from 'vitest';
import { createWorkMemoryService } from '@sud-d/application';
import { ok, type ClientSession, type WorkResumeContext, type Workspace } from '@sud-d/domain';
import type { GitSafetyAdapter, WorkMemoryCheckpointDraft, WorkMemoryRepository } from '@sud-d/infrastructure';

function workspace(id: string): Workspace {
  return {
    id,
    displayName: id,
    canonicalRoot: `C:\\workspace\\${id}`,
    isActive: true,
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    updatedAt: new Date('2026-09-05T00:00:00.000Z'),
  };
}

function memoryRepo(): WorkMemoryRepository & { readonly saves: WorkResumeContext[] } {
  const current = new Map<string, WorkResumeContext>();
  const saves: WorkResumeContext[] = [];
  return {
    saves,
    loadCurrent(workspaceId) { return ok(current.get(workspaceId)); },
    saveCheckpoint(input: WorkMemoryCheckpointDraft) {
      const value: WorkResumeContext = { ...input, checkpointId: `cp-${saves.length + 1}` };
      current.set(input.workspaceId, value);
      saves.push(value);
      return ok(value);
    },
    listRecent(workspaceId, limit = 20) {
      return ok(saves.filter((item) => item.workspaceId === workspaceId).slice(-limit).reverse());
    },
  };
}

function gitAdapter(state: { head: string; status: string; detects: number; statuses: number }): GitSafetyAdapter {
  return {
    detect() { state.detects += 1; return ok({ isRepository: true, isSupported: true, headSha: state.head, branch: 'master', detached: false, state: 'normal' }); },
    status() {
      state.statuses += 1;
      return ok({
        headSha: state.head, branch: 'master', detached: false, clean: false, state: 'normal', statusId: state.status,
        truncated: false,
        entries: [
          { path: 'src/a.ts', kind: 'modified', staged: false, unstaged: true, untracked: false, sensitive: false, gitlink: false },
          { path: '.env', kind: 'modified', staged: false, unstaged: true, untracked: false, sensitive: true, gitlink: false },
        ],
      });
    },
    diff: () => { throw new Error('unexpected diff'); },
    diffApprovedSensitive: () => { throw new Error('unexpected diff'); },
    checkpoint: () => { throw new Error('unexpected checkpoint'); },
    checkpointApprovedSensitive: () => { throw new Error('unexpected checkpoint'); },
    commit: () => { throw new Error('unexpected commit'); },
    commitApprovedSensitive: () => { throw new Error('unexpected commit'); },
    diffCheck: () => { throw new Error('unexpected diff check'); },
    secretScan: () => { throw new Error('unexpected secret scan'); },
  };
}

const sessionA: ClientSession = { id: 'session-a', type: 'mcp-stdio' };
const sessionB: ClientSession = { id: 'session-b', type: 'mcp-stdio' };

describe('Work Memory service session semantics', () => {
  it('keeps bootstrap ephemeral while Resume Context persists and Workspace switches invalidate it', () => {
    const repo = memoryRepo();
    const gitState = { head: 'a'.repeat(40), status: '1'.repeat(64), detects: 0, statuses: 0 };
    const service = createWorkMemoryService({ repository: repo, gitSafety: gitAdapter(gitState), clock: () => new Date('2026-09-05T01:00:00.000Z') });
    const a = workspace('workspace-a');
    const b = workspace('workspace-b');
    expect(service.requireResumed(sessionA, a.id)).toMatchObject({ ok: false, error: { code: 'WORK_RESUME_REQUIRED' } });
    const firstResume = service.resume(sessionA, a);
    expect(firstResume).toMatchObject({ ok: true, value: { workspaceId: a.id, git: { supported: true, drifted: false } } });
    if (firstResume.ok) expect(firstResume.value).not.toHaveProperty('context');
    expect(service.resume(sessionA, a)).toMatchObject({ ok: true, value: { workspaceId: a.id } });
    expect(service.requireResumed(sessionA, a.id)).toEqual({ ok: true, value: undefined });

    const saved = service.checkpoint(sessionA, a, {
      goal: 'Ship Work Memory',
      task: { title: 'Persist context', status: 'in_progress' },
      completed: ['domain and repository'], decisions: ['session bootstrap stays ephemeral'], blockers: [],
      nextAction: 'Wire the MCP guard', artifacts: ['docs/plan.md'], verification: ['service focused test'],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.context.artifacts).toEqual(['docs/plan.md', 'src/a.ts']);
    expect(saved.value.context.artifacts).not.toContain('.env');

    const restarted = createWorkMemoryService({ repository: repo, gitSafety: gitAdapter(gitState) });
    expect(restarted.requireResumed(sessionA, a.id)).toMatchObject({ ok: false, error: { code: 'WORK_RESUME_REQUIRED' } });
    expect(restarted.resume(sessionA, a)).toMatchObject({ ok: true, value: { context: { goal: 'Ship Work Memory' } } });
    const resumeB = restarted.resume(sessionA, b);
    expect(resumeB).toMatchObject({ ok: true, value: { workspaceId: b.id } });
    if (resumeB.ok) expect(resumeB.value).not.toHaveProperty('context');
    expect(restarted.requireResumed(sessionA, a.id)).toMatchObject({ ok: false, error: { code: 'WORK_RESUME_REQUIRED' } });
    expect(restarted.requireResumed(sessionA, b.id)).toEqual({ ok: true, value: undefined });
  });

  it('keeps automatic Git artifact enrichment inside Resume Context path and aggregate bounds', () => {
    const repo = memoryRepo();
    const state = { head: 'a'.repeat(40), status: '1'.repeat(64), detects: 0, statuses: 0 };
    const longPath = `${'x'.repeat(1_025)}.ts`;
    const entries = [longPath, ...Array.from({ length: 49 }, (_, index) => `src/${String(index).padStart(2, '0')}-${'p'.repeat(700)}.ts`)]
      .map((path) => ({ path, kind: 'modified' as const, staged: false, unstaged: true, untracked: false, sensitive: false, gitlink: false }));
    const baseGit = gitAdapter(state);
    const git: GitSafetyAdapter = {
      ...baseGit,
      status() {
        state.statuses += 1;
        return ok({ headSha: state.head, branch: 'master', detached: false, clean: false, state: 'normal', statusId: state.status, truncated: false, entries });
      },
    };
    const service = createWorkMemoryService({ repository: repo, gitSafety: git, clock: () => new Date('2026-09-05T01:00:00.000Z') });
    const a = workspace('workspace-a');
    expect(service.resume(sessionA, a).ok).toBe(true);
    const saved = service.checkpoint(sessionA, a, {
      goal: 'g'.repeat(2_000), task: { title: 't'.repeat(1_000), status: 'in_progress' },
      completed: Array(20).fill('c'.repeat(500)), decisions: Array(20).fill('d'.repeat(500)), blockers: Array(10).fill('b'.repeat(500)),
      nextAction: 'n'.repeat(1_000), artifacts: [], verification: Array(20).fill('v'.repeat(500)),
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.value.context.artifacts.length).toBeGreaterThan(0);
    expect(saved.value.context.artifacts.every((value) => value.length <= 1_024)).toBe(true);
    expect(saved.value.context.artifacts).not.toContain(longPath);
    const semantic = {
      goal: saved.value.context.goal, task: saved.value.context.task, completed: saved.value.context.completed,
      decisions: saved.value.context.decisions, blockers: saved.value.context.blockers, nextAction: saved.value.context.nextAction,
      artifacts: saved.value.context.artifacts, verification: saved.value.context.verification,
    };
    expect(Buffer.byteLength(JSON.stringify(semantic), 'utf8')).toBeLessThanOrEqual(64 * 1024);
  });

  it('reports trusted Git drift without mutating or replacing the saved Resume Context', () => {
    const repo = memoryRepo();
    const gitState = { head: 'a'.repeat(40), status: '1'.repeat(64), detects: 0, statuses: 0 };
    const git = gitAdapter(gitState);
    const service = createWorkMemoryService({ repository: repo, gitSafety: git });
    const a = workspace('workspace-a');
    expect(service.resume(sessionA, a).ok).toBe(true);
    expect(service.checkpoint(sessionA, a, {
      goal: 'Goal', task: { title: 'Task', status: 'in_progress' }, completed: [], decisions: [], blockers: [],
      nextAction: 'Next', artifacts: [], verification: [],
    }).ok).toBe(true);
    const stored = repo.saves[0];
    gitState.head = 'b'.repeat(40);
    gitState.status = '2'.repeat(64);
    const resumed = service.resume(sessionB, a);
    expect(resumed).toMatchObject({
      ok: true,
      value: {
        context: stored,
        git: { supported: true, drifted: true, headChanged: true, statusChanged: true, storedHeadSha: 'a'.repeat(40), currentHeadSha: 'b'.repeat(40) },
      },
    });
    expect(repo.saves).toHaveLength(1);
    expect(gitState.detects).toBeGreaterThan(0);
    expect(gitState.statuses).toBeGreaterThan(0);
  });
});
