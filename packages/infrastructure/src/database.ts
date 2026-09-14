import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

export type Db = Database.Database;

const MIGRATIONS: string[] = [
  // Migration 001 — initial schema
  `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version   INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    canonical_root TEXT NOT NULL UNIQUE,
    is_active     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_events (
    id              TEXT PRIMARY KEY,
    timestamp       TEXT NOT NULL,
    session_id      TEXT NOT NULL,
    session_type    TEXT NOT NULL,
    action          TEXT NOT NULL,
    workspace_id    TEXT,
    resource_path   TEXT,
    policy_decision TEXT,
    result_code     TEXT NOT NULL,
    duration_ms     REAL NOT NULL,
    metadata        TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_workspace  ON audit_events(workspace_id);
  `,
  // Migration 002 — non-secret connection profile configuration only
  `
  CREATE TABLE IF NOT EXISTS connection_profiles (
    profile_id       TEXT PRIMARY KEY,
    display_name     TEXT NOT NULL,
    provider         TEXT NOT NULL CHECK(provider = 'openai_secure_mcp_tunnel'),
    transport        TEXT NOT NULL CHECK(transport = 'stdio'),
    device_name      TEXT NOT NULL,
    auto_start       INTEGER NOT NULL DEFAULT 0 CHECK(auto_start IN (0, 1)),
    auto_restart     INTEGER NOT NULL DEFAULT 0 CHECK(auto_restart IN (0, 1)),
    tunnel_reference TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  `,
  // Migration 003 — Basic Approval safe metadata only; never raw tool input/content
  `
  CREATE TABLE IF NOT EXISTS approval_requests (
    id                  TEXT PRIMARY KEY,
    runtime_instance_id TEXT NOT NULL,
    binding_digest      TEXT NOT NULL,
    session_id          TEXT NOT NULL,
    session_type        TEXT NOT NULL,
    capability          TEXT NOT NULL,
    effect              TEXT NOT NULL,
    sensitivity         TEXT NOT NULL,
    policy_context      TEXT NOT NULL,
    workspace_id        TEXT,
    safe_title          TEXT NOT NULL,
    safe_resource_label TEXT,
    status              TEXT NOT NULL CHECK(status IN ('pending','approved','denied','consumed','expired')),
    created_at          TEXT NOT NULL,
    expires_at          TEXT NOT NULL,
    decided_at          TEXT,
    consumed_at         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_approval_runtime_binding ON approval_requests(runtime_instance_id, binding_digest, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_one_active_binding
    ON approval_requests(runtime_instance_id, binding_digest)
    WHERE status IN ('pending','approved');
  CREATE INDEX IF NOT EXISTS idx_approval_pending ON approval_requests(status, expires_at, created_at DESC);
  `,
  // Migration 004 — Team Mode MVP safe orchestration metadata only
  `
  CREATE TABLE IF NOT EXISTS team_missions (
    mission_id             TEXT PRIMARY KEY,
    workspace_id           TEXT NOT NULL,
    goal_summary           TEXT NOT NULL,
    state                  TEXT NOT NULL CHECK(state IN ('planning','implementing','reviewing','completed','blocked','stopped')),
    current_role           TEXT CHECK(current_role IN ('planner','implementer','reviewer')),
    current_step_id        TEXT,
    review_round           INTEGER NOT NULL DEFAULT 0,
    blocked_reason_code    TEXT,
    blocked_reason_summary TEXT,
    freshness_kind         TEXT NOT NULL CHECK(freshness_kind IN ('git_status','workspace_time','none')),
    freshness_value        TEXT NOT NULL,
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    completed_at           TEXT,
    stopped_at             TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_team_one_active_workspace
    ON team_missions(workspace_id)
    WHERE state IN ('planning','implementing','reviewing');
  CREATE INDEX IF NOT EXISTS idx_team_workspace_state ON team_missions(workspace_id, state, updated_at DESC);

  CREATE TABLE IF NOT EXISTS team_work_items (
    work_item_id     TEXT PRIMARY KEY,
    mission_id       TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    sequence         INTEGER NOT NULL,
    title            TEXT NOT NULL,
    status           TEXT NOT NULL CHECK(status IN ('pending','in_progress','done','blocked')),
    target_path_hint TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_team_work_items_mission ON team_work_items(mission_id, sequence);

  CREATE TABLE IF NOT EXISTS team_role_handoffs (
    handoff_id   TEXT PRIMARY KEY,
    mission_id   TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    from_role    TEXT NOT NULL CHECK(from_role IN ('planner','implementer','reviewer')),
    outcome_code TEXT NOT NULL,
    summary      TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_team_handoffs_mission ON team_role_handoffs(mission_id, created_at);

  CREATE TABLE IF NOT EXISTS team_reviewer_findings (
    finding_id          TEXT PRIMARY KEY,
    mission_id          TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    severity            TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
    summary             TEXT NOT NULL,
    target_path_hint    TEXT,
    expected_correction TEXT,
    created_at          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_team_findings_mission ON team_reviewer_findings(mission_id, created_at);
  `,
  // Migration 005 — Work Memory bounded Workspace-scoped checkpoints
  `
  CREATE TABLE IF NOT EXISTS work_memory_checkpoints (
    checkpoint_id     TEXT PRIMARY KEY,
    workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    checkpoint_index  INTEGER NOT NULL,
    is_current        INTEGER NOT NULL CHECK(is_current IN (0, 1)),
    goal              TEXT NOT NULL,
    task_title        TEXT NOT NULL,
    task_status       TEXT NOT NULL CHECK(task_status IN ('pending','in_progress','blocked','completed')),
    completed_json    TEXT NOT NULL,
    decisions_json    TEXT NOT NULL,
    blockers_json     TEXT NOT NULL,
    next_action       TEXT NOT NULL,
    artifacts_json    TEXT NOT NULL,
    verification_json TEXT NOT NULL,
    git_head_sha      TEXT,
    git_status_id     TEXT,
    updated_at        TEXT NOT NULL,
    UNIQUE(workspace_id, checkpoint_index)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_work_memory_one_current
    ON work_memory_checkpoints(workspace_id) WHERE is_current = 1;
  CREATE INDEX IF NOT EXISTS idx_work_memory_workspace_history
    ON work_memory_checkpoints(workspace_id, checkpoint_index DESC);
  `,
  // Migration 006 โ€” Team Mode Personal Alpha V3 schema + fail-closed legacy reconciliation
  `
  ALTER TABLE team_reviewer_findings RENAME TO team_reviewer_findings_legacy;
  ALTER TABLE team_role_handoffs RENAME TO team_role_handoffs_legacy;
  ALTER TABLE team_work_items RENAME TO team_work_items_legacy;
  ALTER TABLE team_missions RENAME TO team_missions_legacy;
  DROP INDEX IF EXISTS idx_team_one_active_workspace;
  DROP INDEX IF EXISTS idx_team_workspace_state;
  DROP INDEX IF EXISTS idx_team_work_items_mission;
  DROP INDEX IF EXISTS idx_team_handoffs_mission;
  DROP INDEX IF EXISTS idx_team_findings_mission;

  CREATE TABLE team_missions (
    mission_id             TEXT PRIMARY KEY,
    workspace_id           TEXT NOT NULL,
    goal_summary           TEXT NOT NULL,
    state                  TEXT NOT NULL CHECK(state IN ('planning','implementing','validating','reviewing','completed','blocked','stopped')),
    current_role           TEXT CHECK(current_role IN ('planner','implementer','validator','reviewer')),
    current_step_id        TEXT,
    review_round           INTEGER NOT NULL DEFAULT 0,
    blocked_reason_code    TEXT,
    blocked_reason_summary TEXT,
    freshness_kind         TEXT NOT NULL CHECK(freshness_kind IN ('git_status','workspace_time','none')),
    freshness_value        TEXT NOT NULL,
    final_result_summary   TEXT,
    reconciliation_required INTEGER NOT NULL DEFAULT 0 CHECK(reconciliation_required IN (0,1)),
    created_at             TEXT NOT NULL,
    updated_at             TEXT NOT NULL,
    completed_at           TEXT,
    stopped_at             TEXT
  );

  CREATE TABLE team_work_items (
    work_item_id     TEXT PRIMARY KEY,
    mission_id       TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    sequence         INTEGER NOT NULL,
    title            TEXT NOT NULL,
    status           TEXT NOT NULL CHECK(status IN ('pending','in_progress','validating','reviewing','done','blocked')),
    rework_count     INTEGER NOT NULL DEFAULT 0 CHECK(rework_count BETWEEN 0 AND 3),
    target_path_hint TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  CREATE TABLE team_role_handoffs (
    handoff_id   TEXT PRIMARY KEY,
    mission_id   TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    from_role    TEXT NOT NULL CHECK(from_role IN ('planner','implementer','validator','reviewer')),
    outcome_code TEXT NOT NULL,
    summary      TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE team_reviewer_findings (
    finding_id          TEXT PRIMARY KEY,
    mission_id          TEXT NOT NULL REFERENCES team_missions(mission_id) ON DELETE CASCADE,
    source_role         TEXT NOT NULL DEFAULT 'reviewer' CHECK(source_role IN ('validator','reviewer')),
    severity            TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
    summary             TEXT NOT NULL,
    target_path_hint    TEXT,
    expected_correction TEXT,
    created_at          TEXT NOT NULL
  );

  INSERT INTO team_missions(
    mission_id, workspace_id, goal_summary, state, current_role, current_step_id,
    review_round, blocked_reason_code, blocked_reason_summary, freshness_kind, freshness_value,
    final_result_summary, reconciliation_required, created_at, updated_at, completed_at, stopped_at
  )
  SELECT
    m.mission_id, m.workspace_id, m.goal_summary,
    CASE
      WHEN m.state = 'reviewing' AND COALESCE(
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
      ) IS NOT NULL THEN 'validating'
      WHEN m.state = 'implementing' AND COALESCE(
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
      ) IS NULL THEN 'blocked'
      WHEN m.state = 'reviewing' THEN 'blocked'
      ELSE m.state
    END,
    CASE
      WHEN m.state='reviewing' AND COALESCE(
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
      ) IS NOT NULL THEN 'validator'
      WHEN m.state='implementing' AND COALESCE(
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
      ) IS NULL THEN NULL
      WHEN m.state='reviewing' THEN NULL
      ELSE m.current_role
    END,
    CASE
      WHEN m.state IN ('implementing','reviewing') THEN COALESCE(
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
        (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
      )
      ELSE m.current_step_id
    END,
    m.review_round,
    CASE WHEN m.state IN ('implementing','reviewing') AND COALESCE(
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
    ) IS NULL THEN 'UNSUPPORTED_OPERATION' ELSE m.blocked_reason_code END,
    CASE WHEN m.state IN ('implementing','reviewing') AND COALESCE(
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id AND w.status IN ('pending','in_progress') LIMIT 1),
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='in_progress' ORDER BY w.sequence ASC LIMIT 1),
      (SELECT w.work_item_id FROM team_work_items_legacy w WHERE w.mission_id=m.mission_id AND w.status='pending' ORDER BY w.sequence ASC LIMIT 1)
    ) IS NULL THEN 'Legacy Team mission cannot resolve a current Task' ELSE m.blocked_reason_summary END,
    m.freshness_kind, m.freshness_value, NULL,
    CASE WHEN m.state IN ('planning','implementing','reviewing') THEN 1 ELSE 0 END,
    m.created_at, m.updated_at, m.completed_at, m.stopped_at
  FROM team_missions_legacy m;

  INSERT INTO team_work_items(work_item_id, mission_id, sequence, title, status, rework_count, target_path_hint, created_at, updated_at)
  SELECT w.work_item_id, w.mission_id, w.sequence, w.title,
    CASE
      WHEN m.reconciliation_required=1 AND w.work_item_id=m.current_step_id AND m.state='implementing' THEN 'in_progress'
      WHEN m.reconciliation_required=1 AND w.work_item_id=m.current_step_id AND m.state='validating' THEN 'validating'
      WHEN w.status IN ('done','blocked') THEN w.status
      ELSE 'pending'
    END,
    CASE WHEN m.reconciliation_required=1 AND w.work_item_id=m.current_step_id
      THEN MIN(3, MAX(0, m.review_round)) ELSE 0 END,
    w.target_path_hint, w.created_at, w.updated_at
  FROM team_work_items_legacy w JOIN team_missions m ON m.mission_id=w.mission_id;

  INSERT INTO team_role_handoffs SELECT * FROM team_role_handoffs_legacy;
  INSERT INTO team_reviewer_findings(finding_id, mission_id, source_role, severity, summary, target_path_hint, expected_correction, created_at)
    SELECT finding_id, mission_id, 'reviewer', severity, summary, target_path_hint, expected_correction, created_at FROM team_reviewer_findings_legacy;

  CREATE UNIQUE INDEX idx_team_one_active_workspace ON team_missions(workspace_id)
    WHERE state IN ('planning','implementing','validating','reviewing');
  CREATE INDEX idx_team_workspace_state ON team_missions(workspace_id, state, updated_at DESC);
  CREATE INDEX idx_team_work_items_mission ON team_work_items(mission_id, sequence);
  CREATE INDEX idx_team_handoffs_mission ON team_role_handoffs(mission_id, created_at);
  CREATE INDEX idx_team_findings_mission ON team_reviewer_findings(mission_id, created_at);

  UPDATE work_memory_checkpoints SET is_current=0
    WHERE workspace_id IN (SELECT workspace_id FROM team_missions WHERE reconciliation_required=1);

  INSERT INTO work_memory_checkpoints(
    checkpoint_id, workspace_id, checkpoint_index, is_current, goal, task_title, task_status,
    completed_json, decisions_json, blockers_json, next_action, artifacts_json, verification_json,
    git_head_sha, git_status_id, updated_at
  )
  SELECT lower(hex(randomblob(16))), m.workspace_id,
    COALESCE((SELECT MAX(c.checkpoint_index) FROM work_memory_checkpoints c WHERE c.workspace_id=m.workspace_id),0)+1,
    1, m.goal_summary,
    CASE
      WHEN m.state='planning' THEN 'Plan Team mission'
      WHEN m.current_step_id IS NOT NULL THEN COALESCE((SELECT w.title FROM team_work_items w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id),'Team mission blocked')
      ELSE 'Team mission blocked'
    END,
    CASE WHEN m.state='blocked' THEN 'blocked' ELSE 'in_progress' END,
    '[]','[]',
    CASE WHEN m.state='blocked' THEN '["Legacy Team mission cannot resolve a current Task"]' ELSE '[]' END,
    CASE
      WHEN m.state='planning' THEN 'Plan the Team mission and submit plan_ready.'
      WHEN m.state='implementing' THEN printf('Work on Task %d/%d: %s; then submit work_ready.',
        (SELECT w.sequence FROM team_work_items w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id),
        (SELECT COUNT(*) FROM team_work_items w WHERE w.mission_id=m.mission_id),
        (SELECT w.title FROM team_work_items w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id))
      WHEN m.state='validating' THEN printf('Validate Task %d/%d: %s; then submit validation_passed or validation_failed.',
        (SELECT w.sequence FROM team_work_items w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id),
        (SELECT COUNT(*) FROM team_work_items w WHERE w.mission_id=m.mission_id),
        (SELECT w.title FROM team_work_items w WHERE w.work_item_id=m.current_step_id AND w.mission_id=m.mission_id))
      ELSE 'Resolve the Team blocker UNSUPPORTED_OPERATION; start a new Team mission if more work is required.'
    END,
    '[]','[]',NULL,NULL,m.updated_at
  FROM team_missions m WHERE m.reconciliation_required=1;

  UPDATE team_missions SET reconciliation_required=0 WHERE reconciliation_required=1;

  DROP TABLE team_reviewer_findings_legacy;
  DROP TABLE team_role_handoffs_legacy;
  DROP TABLE team_work_items_legacy;
  DROP TABLE team_missions_legacy;
  `,
  // Migration 007 — local-device Approval Mode + auditable decision source
  `
  ALTER TABLE approval_requests ADD COLUMN decision_source TEXT CHECK(decision_source IN ('user','mode'));

  CREATE TABLE approval_mode_settings (
    singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
    mode TEXT NOT NULL CHECK(mode IN ('standard','approve_for_me','full_access')),
    updated_at TEXT NOT NULL
  );
  INSERT INTO approval_mode_settings(singleton_id, mode, updated_at)
    VALUES(1, 'approve_for_me', CURRENT_TIMESTAMP);
  `,
  // Migration 008 — non-secret Workspace Primary Remote selection only
  `
  CREATE TABLE workspace_git_settings (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    primary_remote_name TEXT,
    updated_at TEXT NOT NULL
  );
  `
];

export function openDatabase(dbPath: string): Db {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // Enable WAL mode for cross-process readiness
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

function runMigrations(db: Db): void {
  // Ensure migrations table exists (idempotent even for migration 0)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );

  for (let i = 0; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    if (!applied.has(version)) {
      db.transaction(() => {
        db.exec(MIGRATIONS[i] ?? '');
        db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(
          version,
          new Date().toISOString(),
        );
      })();
    }
  }
}
