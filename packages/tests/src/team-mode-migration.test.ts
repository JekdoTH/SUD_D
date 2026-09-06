import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { createTeamRepository, createWorkMemoryRepository, openDatabase, type Db } from '@sud-d/infrastructure';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (filename: string) => Db;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });

function legacyFixture(kind: 'planning' | 'implementing' | 'reviewing' | 'cross-mission' | 'missing-task') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-team-migration-'));
  roots.push(root);
  const dbPath = path.join(root, 'sud-d.db');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations(version, applied_at) VALUES
      (1,'2026-09-05T00:00:00.000Z'),(2,'2026-09-05T00:00:00.000Z'),(3,'2026-09-05T00:00:00.000Z'),(4,'2026-09-05T00:00:00.000Z'),(5,'2026-09-05T00:00:00.000Z');
    CREATE TABLE workspaces(id TEXT PRIMARY KEY, display_name TEXT NOT NULL, canonical_root TEXT NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE team_missions(
      mission_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, goal_summary TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('planning','implementing','reviewing','completed','blocked','stopped')),
      current_role TEXT CHECK(current_role IN ('planner','implementer','reviewer')), current_step_id TEXT,
      review_round INTEGER NOT NULL DEFAULT 0, blocked_reason_code TEXT, blocked_reason_summary TEXT,
      freshness_kind TEXT NOT NULL CHECK(freshness_kind IN ('git_status','workspace_time','none')), freshness_value TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT, stopped_at TEXT);
    CREATE TABLE team_work_items(work_item_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE, sequence INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','in_progress','done','blocked')), target_path_hint TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE team_role_handoffs(handoff_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE, from_role TEXT NOT NULL CHECK(from_role IN ('planner','implementer','reviewer')), outcome_code TEXT NOT NULL, summary TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE team_reviewer_findings(finding_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE, severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')), summary TEXT NOT NULL, target_path_hint TEXT, expected_correction TEXT, created_at TEXT NOT NULL);
    CREATE TABLE work_memory_checkpoints(
      checkpoint_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, checkpoint_index INTEGER NOT NULL, is_current INTEGER NOT NULL CHECK(is_current IN (0,1)),
      goal TEXT NOT NULL, task_title TEXT NOT NULL, task_status TEXT NOT NULL CHECK(task_status IN ('pending','in_progress','blocked','completed')),
      completed_json TEXT NOT NULL, decisions_json TEXT NOT NULL, blockers_json TEXT NOT NULL, next_action TEXT NOT NULL, artifacts_json TEXT NOT NULL, verification_json TEXT NOT NULL,
      git_head_sha TEXT, git_status_id TEXT, updated_at TEXT NOT NULL, UNIQUE(workspace_id, checkpoint_index));
    CREATE UNIQUE INDEX idx_work_memory_one_current ON work_memory_checkpoints(workspace_id) WHERE is_current = 1;
  `);
  const now = '2026-09-05T10:00:00.000Z';
  db.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?,?)').run('ws-a','A',path.join(root,'a'),1,now,now);
  db.prepare('INSERT INTO workspaces VALUES(?,?,?,?,?,?)').run('ws-b','B',path.join(root,'b'),0,now,now);
  const state = kind === 'planning' ? 'planning' : kind === 'reviewing' || kind === 'cross-mission' ? 'reviewing' : 'implementing';
  const role = state === 'planning' ? 'planner' : state === 'reviewing' ? 'reviewer' : 'implementer';
  const step = kind === 'planning' || kind === 'missing-task' ? null : kind === 'cross-mission' ? 'b-task' : 'a-task-2';
  db.prepare('INSERT INTO team_missions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('mission-a','ws-a','Legacy goal',state,role,step,5,null,null,'git_status','legacy-base',now,now,null,null);
  db.prepare('INSERT INTO team_missions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('mission-b','ws-b','Foreign goal','implementing','implementer','b-task',0,null,null,'git_status','foreign-base',now,now,null,null);
  if (kind !== 'planning' && kind !== 'missing-task') {
    db.prepare('INSERT INTO team_work_items VALUES(?,?,?,?,?,?,?,?)').run('a-task-1','mission-a',1,'First legacy task','done',null,now,now);
    db.prepare('INSERT INTO team_work_items VALUES(?,?,?,?,?,?,?,?)').run('a-task-2','mission-a',2,'Current legacy task','in_progress',null,now,now);
  }
  db.prepare('INSERT INTO team_work_items VALUES(?,?,?,?,?,?,?,?)').run('b-task','mission-b',1,'Foreign task','in_progress',null,now,now);
  db.prepare('INSERT INTO work_memory_checkpoints VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('cp-old','ws-a',1,1,'Legacy goal','Old review task','in_progress','[]','[]','[]','Review directly','[]','[]',null,null,now);
  db.close();
  return dbPath;
}

describe('Team Mode migration 006', () => {
  it('migrates legacy reviewing/reviewer to validating/validator and reconciles Work Memory', () => {
    const db = openDatabase(legacyFixture('reviewing'));
    const team = createTeamRepository(db);
    const mission = team.findById('mission-a');
    expect(mission).toMatchObject({ ok: true, value: { state: 'validating', currentRole: 'validator', currentStepId: 'a-task-2' } });
    expect(team.listWorkItems('mission-a')).toMatchObject({ ok: true, value: [{ id: 'a-task-1', status: 'done', reworkCount: 0 }, { id: 'a-task-2', status: 'validating', reworkCount: 3 }] });
    expect(createWorkMemoryRepository(db).loadCurrent('ws-a')).toMatchObject({ ok: true, value: { task: { title: 'Current legacy task', status: 'in_progress' }, nextAction: 'Validate Task 2/2: Current legacy task; then submit validation_passed or validation_failed.' } });
    expect(db.prepare('SELECT version FROM schema_migrations WHERE version=6').get()).toBeTruthy();
    db.close();
  });

  it('keeps legacy planning as Planner with exact planning continuation', () => {
    const db = openDatabase(legacyFixture('planning'));
    expect(createTeamRepository(db).findById('mission-a')).toMatchObject({ ok: true, value: { state: 'planning', currentRole: 'planner' } });
    expect(createWorkMemoryRepository(db).loadCurrent('ws-a')).toMatchObject({ ok: true, value: { task: { title: 'Plan Team mission', status: 'in_progress' }, nextAction: 'Plan the Team mission and submit plan_ready.' } });
    db.close();
  });

  it('never follows a cross-mission current_step_id and resolves the same-mission Task deterministically', () => {
    const db = openDatabase(legacyFixture('cross-mission'));
    expect(createTeamRepository(db).findById('mission-a')).toMatchObject({ ok: true, value: { state: 'validating', currentRole: 'validator', currentStepId: 'a-task-2' } });
    db.close();
  });

  it('fails closed when an active legacy mission cannot resolve a current Task', () => {
    const db = openDatabase(legacyFixture('missing-task'));
    expect(createTeamRepository(db).findById('mission-a')).toMatchObject({ ok: true, value: { state: 'blocked', blockedReason: 'UNSUPPORTED_OPERATION', blockedReasonSummary: 'Legacy Team mission cannot resolve a current Task' } });
    expect(createWorkMemoryRepository(db).loadCurrent('ws-a')).toMatchObject({ ok: true, value: { task: { status: 'blocked' }, nextAction: 'Resolve the Team blocker UNSUPPORTED_OPERATION; start a new Team mission if more work is required.' } });
    db.close();
  });
});
