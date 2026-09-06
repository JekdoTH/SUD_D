import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizePath,
  createAuditRepository,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkMemoryRepository,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error('canonicalize failed');
  return result.value;
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-team-uow-'));
  tempRoots.push(root);
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const db = openDatabase(path.join(root, 'sud-d.db'));
  const workspace = createWorkspaceRepository(db).save('Team UoW', canonical(workspaceRoot));
  const team = createTeamRepository(db);
  const workMemory = createWorkMemoryRepository(db);
  const audit = createAuditRepository(db);
  const created = team.createMission({
    workspaceId: workspace.id,
    goalSummary: 'Atomic Team transition',
    freshness: { kind: 'git_status', value: 'baseline' },
    createdAt: '2026-09-05T10:00:00.000Z',
  });
  if (!created.ok) throw new Error(created.error.message);
  const initialCheckpoint = workMemory.saveCheckpoint({
    workspaceId: workspace.id,
    goal: 'Atomic Team transition',
    task: { title: 'Plan Team mission', status: 'in_progress' },
    completed: [],
    decisions: [],
    blockers: [],
    nextAction: 'Plan the Team mission.',
    artifacts: [],
    verification: [],
    git: { headSha: 'a'.repeat(40), statusId: 'b'.repeat(64) },
    updatedAt: '2026-09-05T10:00:00.000Z',
  });
  if (!initialCheckpoint.ok) throw new Error(initialCheckpoint.error.message);
  audit.append({
    timestamp: new Date('2026-09-05T10:00:00.000Z'),
    sessionId: 'team-mode',
    sessionType: 'mcp-stdio',
    action: 'team.mission_started',
    workspaceId: workspace.id,
    policyDecision: 'allow',
    resultCode: 'TEAM_MISSION_STARTED',
    durationMs: 0,
    metadata: { missionId: created.value.id },
  });
  return { db, workspace, team, workMemory, audit, mission: created.value };
}

function transitionPlan(
  workspaceId: string,
  missionId: string,
) {
  return {
    precondition: {
      missionId,
      workspaceId,
      expectedState: 'planning' as const,
      expectedRole: 'planner' as const,
      expectedFreshness: { kind: 'git_status' as const, value: 'baseline' },
    },
    mission: {
      kind: 'update' as const,
      missionId,
      patch: {
        state: 'implementing' as const,
        currentRole: 'implementer' as const,
        reviewRound: 0,
        freshness: { kind: 'git_status' as const, value: 'baseline' },
        updatedAt: '2026-09-05T10:01:00.000Z',
      },
    },
    workItems: {
      kind: 'replace' as const,
      missionId,
      nowIso: '2026-09-05T10:01:00.000Z',
      items: [
        { sequence: 1, title: 'Task one', status: 'in_progress' as const },
      ],
    },
    handoff: {
      missionId,
      value: {
        fromRole: 'planner' as const,
        outcome: 'plan_ready' as const,
        summary: 'Plan accepted',
        createdAt: '2026-09-05T10:01:00.000Z',
      },
    },
    checkpoint: {
      workspaceId,
      goal: 'Atomic Team transition',
      task: { title: 'Task one', status: 'in_progress' as const },
      completed: [],
      decisions: ['Plan accepted'],
      blockers: [],
      nextAction: 'Work on Task 1/1: Task one.',
      artifacts: [],
      verification: [],
      git: { headSha: 'a'.repeat(40), statusId: 'b'.repeat(64) },
      updatedAt: '2026-09-05T10:01:00.000Z',
    },
    audit: {
      timestamp: new Date('2026-09-05T10:01:00.000Z'),
      sessionId: 'team-mode',
      sessionType: 'mcp-stdio' as const,
      action: 'team.role_transitioned',
      workspaceId,
      policyDecision: 'allow' as const,
      resultCode: 'TEAM_ROLE_TRANSITIONED',
      durationMs: 0,
      metadata: { missionId, rawToken: 'SHOULD_NOT_PERSIST_RAW' },
    },
  };
}

function assertPriorState(
  team: ReturnType<typeof createTeamRepository>,
  workMemory: ReturnType<typeof createWorkMemoryRepository>,
  audit: ReturnType<typeof createAuditRepository>,
  workspaceId: string,
  missionId: string,
) {
  const mission = team.findById(missionId);
  expect(mission.ok && mission.value?.state).toBe('planning');
  const items = team.listWorkItems(missionId);
  expect(items.ok && items.value).toEqual([]);
  const handoffs = team.listHandoffs(missionId);
  expect(handoffs.ok && handoffs.value).toEqual([]);
  const checkpoint = workMemory.loadCurrent(workspaceId);
  expect(checkpoint.ok && checkpoint.value?.task.title).toBe('Plan Team mission');
  expect(audit.list(20).filter((event) => event.action === 'team.role_transitioned')).toEqual([]);
}

describe('Team transition unit of work', () => {
  it('rolls back Team rows and audit when Work Memory checkpoint insert fails', () => {
    const fixture = setup();
    fixture.db.exec(`
      CREATE TRIGGER fail_team_checkpoint
      BEFORE INSERT ON work_memory_checkpoints
      BEGIN
        SELECT RAISE(ABORT, 'forced checkpoint failure');
      END;
    `);
    const result = createTeamTransitionUnitOfWork(fixture.db)
      .commit(transitionPlan(fixture.workspace.id, fixture.mission.id));
    expect(result.ok).toBe(false);
    assertPriorState(fixture.team, fixture.workMemory, fixture.audit, fixture.workspace.id, fixture.mission.id);
    fixture.db.close();
  });

  it('rolls back Team rows and Work Memory when Team transition audit insert fails', () => {
    const fixture = setup();
    fixture.db.exec(`
      CREATE TRIGGER fail_team_transition_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.action = 'team.role_transitioned'
      BEGIN
        SELECT RAISE(ABORT, 'forced audit failure');
      END;
    `);
    const result = createTeamTransitionUnitOfWork(fixture.db)
      .commit(transitionPlan(fixture.workspace.id, fixture.mission.id));
    expect(result.ok).toBe(false);
    assertPriorState(fixture.team, fixture.workMemory, fixture.audit, fixture.workspace.id, fixture.mission.id);
    fixture.db.close();
  });

  it('commits nothing when the persisted Team precondition is stale', () => {
    const fixture = setup();
    const plan = transitionPlan(fixture.workspace.id, fixture.mission.id);
    const result = createTeamTransitionUnitOfWork(fixture.db).commit({
      ...plan,
      precondition: { ...plan.precondition, expectedState: 'reviewing' as const },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'TEAM_TRANSITION_INVALID' } });
    assertPriorState(fixture.team, fixture.workMemory, fixture.audit, fixture.workspace.id, fixture.mission.id);
    fixture.db.close();
  });

  it('commits Team, Work Memory, and sanitized transition audit as one unit', () => {
    const fixture = setup();
    const result = createTeamTransitionUnitOfWork(fixture.db)
      .commit(transitionPlan(fixture.workspace.id, fixture.mission.id));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.mission).toMatchObject({
      id: fixture.mission.id,
      workspaceId: fixture.workspace.id,
      state: 'implementing',
      currentRole: 'implementer',
    });
    expect(result.value.checkpoint.task.title).toBe('Task one');
    expect(fixture.team.listWorkItems(fixture.mission.id)).toMatchObject({
      ok: true,
      value: [{ sequence: 1, title: 'Task one', status: 'in_progress' }],
    });
    expect(fixture.team.listHandoffs(fixture.mission.id)).toMatchObject({
      ok: true,
      value: [{ outcome: 'plan_ready', summary: 'Plan accepted' }],
    });
    const event = fixture.audit.list(20).find((item) => item.action === 'team.role_transitioned');
    expect(event?.metadata.rawToken).toBe('[REDACTED]');
    fixture.db.close();
  });
});
