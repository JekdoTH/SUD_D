import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTeamService, type TeamFreshnessPort } from '@sud-d/application';
import {
  canonicalizePath,
  createAuditRepository,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import type { TeamFreshnessRef, TeamMissionView, Workspace } from '@sud-d/domain';

const tempDirs: string[] = [];
const openDbs: Db[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-team-security-'));
  tempDirs.push(dir);
  return dir;
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error(`canonicalize failed: ${value}`);
  return result.value;
}

function openTrackedDb(filePath: string): Db {
  const db = openDatabase(filePath);
  openDbs.push(db);
  return db;
}

function requireOk<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.value;
}

function makeHarness(options: { freshness?: TeamFreshnessRef } = {}) {
  const root = tempDir();
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'team\n', 'utf8');
  const db = openTrackedDb(path.join(root, 'state', 'sud-d.db'));
  const workspaceRepo = createWorkspaceRepository(db);
  const workspace = workspaceRepo.save('Team Security Workspace', canonical(workspaceRoot));
  workspaceRepo.setActive(workspace.id);
  const auditRepo = createAuditRepository(db);
  const teamRepo = createTeamRepository(db);
  let freshness = options.freshness ?? { kind: 'git_status', value: 'secure-a' } as TeamFreshnessRef;
  const freshnessPort: TeamFreshnessPort = {
    current(_workspace: Workspace) {
      return { ok: true as const, value: freshness };
    },
  };
  const service = createTeamService({ teamRepo, workspaceRepo, audit: auditRepo, transitionUow: createTeamTransitionUnitOfWork(db), freshness: freshnessPort });
  const setFreshness = (next: TeamFreshnessRef) => { freshness = next; };
  return { root, workspaceRoot, db, workspaceRepo, workspace, auditRepo, teamRepo, service, setFreshness };
}

function startAndPlan(h: ReturnType<typeof makeHarness>): TeamMissionView {
  requireOk(h.service.start({ goal: 'Coordinate safely' }));
  return requireOk(h.service.submit({
    outcome: 'plan_ready',
    summary: 'Plan is safe',
    workItems: [{ title: 'Use existing tools only', targetPathHint: 'README.md' }],
  }));
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Team Mode - blocking and confidentiality matrix', () => {
  it('enforces one active mission per Workspace while allowing a new mission after terminal stop', () => {
    const h = makeHarness();
    const first = requireOk(h.service.start({ goal: 'First mission' }));
    expect(h.service.start({ goal: 'Second mission' })).toMatchObject({
      ok: false,
      error: { code: 'TEAM_MISSION_CONFLICT' },
    });
    expect(requireOk(h.service.stop())).toMatchObject({ missionId: first.missionId, state: 'stopped' });
    const second = requireOk(h.service.start({ goal: 'Second mission after stop' }));
    expect(second).toMatchObject({ state: 'planning', currentRole: 'planner' });
    expect(second.missionId).not.toBe(first.missionId);
  });

  it('records Execute-required and Network-required work as deterministic blocked states instead of bypassing policy', () => {
    const executeHarness = makeHarness();
    startAndPlan(executeHarness);
    const executeBlocked = requireOk(executeHarness.service.submit({
      outcome: 'blocked',
      blockedReason: 'EXECUTE_REQUIRED',
      summary: 'Verification needs tests but Restricted Execute is deferred',
    }));
    expect(executeBlocked).toMatchObject({ state: 'blocked', blockedReason: 'EXECUTE_REQUIRED' });
    expect(executeHarness.db.prepare('SELECT task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(executeHarness.workspace.id)).toMatchObject({
      task_status: 'blocked',
      next_action: expect.stringContaining('EXECUTE_REQUIRED'),
    });
    expect(executeHarness.auditRepo.list(100).some((event) => event.action === 'team.mission_blocked')).toBe(true);
    expect(fs.readFileSync(path.join(executeHarness.workspaceRoot, 'README.md'), 'utf8')).toBe('team\n');

    const networkHarness = makeHarness();
    startAndPlan(networkHarness);
    const networkBlocked = requireOk(networkHarness.service.submit({
      outcome: 'blocked',
      blockedReason: 'NETWORK_REQUIRED',
      summary: 'Remote API lookup is needed but Team Mode has no Network capability',
    }));
    expect(networkBlocked).toMatchObject({ state: 'blocked', blockedReason: 'NETWORK_REQUIRED' });
    expect(JSON.stringify(networkHarness.auditRepo.list(20))).toContain('NETWORK_REQUIRED');
  });

  it('models approval denial and expiry as explicit blocked mission states without changing files or approval authority', () => {
    const deniedHarness = makeHarness();
    startAndPlan(deniedHarness);
    const denied = requireOk(deniedHarness.service.submit({
      outcome: 'blocked',
      blockedReason: 'APPROVAL_DENIED',
      summary: 'Human denied the required sensitive Workspace action',
    }));
    expect(denied).toMatchObject({ state: 'blocked', blockedReason: 'APPROVAL_DENIED' });
    expect(fs.readFileSync(path.join(deniedHarness.workspaceRoot, 'README.md'), 'utf8')).toBe('team\n');

    const expiredHarness = makeHarness();
    startAndPlan(expiredHarness);
    const expired = requireOk(expiredHarness.service.submit({
      outcome: 'blocked',
      blockedReason: 'APPROVAL_EXPIRED',
      summary: 'The one-time approval expired before retry',
    }));
    expect(expired).toMatchObject({ state: 'blocked', blockedReason: 'APPROVAL_EXPIRED' });
    expect(JSON.stringify(expired)).not.toMatch(/approvalRequestId|approve|deny|binding|hmac/i);
  });

  it('persists and audits only bounded safe orchestration metadata, never raw prompt/file/diff/secret sentinels', () => {
    const h = makeHarness();
    const secretGoal = 'Plan with SENTINEL_TEAM_SECRET_001 and sk-teamsecret123456789';
    const started = requireOk(h.service.start({ goal: secretGoal }));
    expect(started.goalSummary).not.toMatch(/SENTINEL_TEAM_SECRET_001|sk-teamsecret/i);
    requireOk(h.service.submit({
      outcome: 'plan_ready',
      summary: 'Plan summary sk-teamsummary123456789',
      workItems: [{ title: 'Read safe project metadata only', targetPathHint: 'src/index.ts' }],
    }));
    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Implementation sk-teamimpl123456789' }));
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Validation passed' }));
    requireOk(h.service.submit({
      outcome: 'changes_requested',
      summary: 'Review sk-teamreview123456789',
      findings: [{
        severity: 'high',
        summary: 'Finding sk-teamfinding123456789',
        targetPathHint: 'src/index.ts',
        expectedCorrection: 'Correction sk-teamcorrection123456789',
      }],
    }));

    const serializedDb = JSON.stringify({
      missions: h.db.prepare('SELECT * FROM team_missions').all(),
      workItems: h.db.prepare('SELECT * FROM team_work_items').all(),
      handoffs: h.db.prepare('SELECT * FROM team_role_handoffs').all(),
      findings: h.db.prepare('SELECT * FROM team_reviewer_findings').all(),
    });
    const audit = JSON.stringify(h.auditRepo.list(100));
    for (const serialized of [serializedDb, audit]) {
      expect(serialized).not.toContain('sk-teamsecret123456789');
      expect(serialized).not.toContain('sk-teamsummary123456789');
      expect(serialized).not.toContain('sk-teamimpl123456789');
      expect(serialized).not.toContain('sk-teamreview123456789');
      expect(serialized).not.toContain('sk-teamfinding123456789');
      expect(serialized).not.toContain('sk-teamcorrection123456789');
      expect(serialized).not.toMatch(/rawPrompt|chainOfThought|reasoning|fileContent|diffContent|stdout|stderr|argv|env|hmac|approvalBinding/i);
    }

    const tableInfo = ['team_missions', 'team_work_items', 'team_role_handoffs', 'team_reviewer_findings']
      .flatMap((table) => h.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .map((column) => column.name)
      .join(' ');
    expect(tableInfo).not.toMatch(/raw|prompt|reasoning|content|diff|stdout|stderr|command|argv|env|hmac|binding|credential|secret/i);
  });
  it('rolls back stale blocking when the required Team audit cannot commit', () => {
    const h = makeHarness();
    const planning = requireOk(h.service.start({ goal: 'Stale must be atomic' }));
    const before = h.db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(h.workspace.id);
    h.setFreshness({ kind: 'git_status', value: 'secure-b' });
    h.db.exec(`CREATE TRIGGER fail_stale_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'team.stale_state_detected' BEGIN SELECT RAISE(ABORT, 'forced stale audit failure'); END;`);

    const result = h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] });
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(h.teamRepo.findById(planning.missionId)).toMatchObject({ ok: true, value: { state: 'planning', currentRole: 'planner' } });
    expect(h.db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(h.workspace.id)).toEqual(before);
    expect(h.auditRepo.list(100).some((event) => event.action === 'team.stale_state_detected')).toBe(false);
  });

  it('rolls back an explicit blocked transition when its Work Memory checkpoint cannot commit', () => {
    const h = makeHarness();
    const active = startAndPlan(h);
    const before = h.db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(h.workspace.id);
    h.db.exec(`CREATE TRIGGER fail_blocked_checkpoint BEFORE INSERT ON work_memory_checkpoints WHEN NEW.task_status = 'blocked' BEGIN SELECT RAISE(ABORT, 'forced blocked checkpoint failure'); END;`);

    const result = h.service.submit({ outcome: 'blocked', blockedReason: 'EXECUTE_REQUIRED', summary: 'Blocked atomically' });
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(h.teamRepo.findById(active.missionId)).toMatchObject({ ok: true, value: { state: 'implementing', currentRole: 'implementer' } });
    expect(h.db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(h.workspace.id)).toEqual(before);
    expect(h.auditRepo.list(100).some((event) => event.action === 'team.mission_blocked')).toBe(false);
  });

  it('binds explicit mission ids to the active Workspace before read or stop', () => {
    const h = makeHarness();
    const foreignRoot = path.join(h.root, 'foreign-workspace');
    fs.mkdirSync(foreignRoot, { recursive: true });
    const foreignWorkspace = h.workspaceRepo.save('Foreign Workspace', canonical(foreignRoot));
    const foreignMission = requireOk(h.teamRepo.createMission({
      workspaceId: foreignWorkspace.id,
      goalSummary: 'FOREIGN_GOAL_SENTINEL',
      freshness: { kind: 'git_status', value: 'foreign-freshness' },
      createdAt: '2026-09-05T12:00:00.000Z',
    }));

    const statusResult = h.service.status({ missionId: foreignMission.id });
    const stopResult = h.service.stop({ missionId: foreignMission.id });
    expect(statusResult).toMatchObject({ ok: false, error: { code: 'TEAM_MISSION_NOT_FOUND' } });
    expect(stopResult).toMatchObject({ ok: false, error: { code: 'TEAM_MISSION_NOT_FOUND' } });
    expect(JSON.stringify([statusResult, stopResult])).not.toContain('FOREIGN_GOAL_SENTINEL');
    expect(h.teamRepo.findById(foreignMission.id)).toMatchObject({
      ok: true,
      value: { state: 'planning', workspaceId: foreignWorkspace.id },
    });
  });
});
