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
