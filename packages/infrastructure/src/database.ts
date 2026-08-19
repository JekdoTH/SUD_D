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
