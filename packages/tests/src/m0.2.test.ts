import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createAuditRepository,
  createConnectionProfileRepository,
  createInMemoryCredentialStore,
  openDatabase,
} from '@sud-d/infrastructure';
import { createConnectionConfigService } from '@sud-d/application';
import {
  ConnectionCredentialStatusDtoSchema,
  ConnectionProfileCreateInputSchema,
  ConnectionProfileDtoSchema,
  ConnectionProfileUpdateInputSchema,
  RuntimeStartInputSchema,
} from '@sud-d/contracts';
import type { Db } from '@sud-d/infrastructure';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3') as new (filename: string) => Db;

const tempDirs: string[] = [];
const openDbs: Db[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-m02-'));
  tempDirs.push(dir);
  return dir;
}

function openTrackedDatabase(dbPath: string): Db {
  const db = openDatabase(dbPath);
  openDbs.push(db);
  return db;
}

function makeM02Services() {
  const dataDir = makeTempDir();
  const dbPath = path.join(dataDir, 'm02.db');
  const db = openTrackedDatabase(dbPath);
  const profileRepo = createConnectionProfileRepository(db);
  const auditRepo = createAuditRepository(db);
  const credentialStore = createInMemoryCredentialStore();
  const service = createConnectionConfigService(profileRepo, credentialStore, auditRepo);
  return { db, dbPath, profileRepo, auditRepo, credentialStore, service };
}

afterEach(() => {
  while (openDbs.length > 0) {
    openDbs.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('M0.2 — connection profile persistence', () => {
  it('persists, reads, and updates non-secret connection profile configuration', () => {
    const { profileRepo, service } = makeM02Services();

    const created = service.createProfile({
      displayName: 'Work Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: true,
      tunnelReference: 'work-tunnel-profile',
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(profileRepo.findById(created.value.profileId)).toMatchObject({
      profileId: created.value.profileId,
      displayName: 'Work Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: true,
      tunnelReference: 'work-tunnel-profile',
    });

    const read = service.getProfile(created.value.profileId);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.profileId).toBe(created.value.profileId);

    const updated = service.updateProfile(created.value.profileId, {
      displayName: 'Work Tunnel',
      autoStart: true,
      autoRestart: false,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value).toMatchObject({
      profileId: created.value.profileId,
      displayName: 'Work Tunnel',
      autoStart: true,
      autoRestart: false,
    });
    expect(updated.value.updatedAt.getTime()).toBeGreaterThanOrEqual(created.value.updatedAt.getTime());
  });

  it('never persists API keys or credential values into SQLite', () => {
    const { db, service } = makeM02Services();
    const secret = 'sk-m02-super-secret-value';

    const created = service.createProfile({
      displayName: 'Secret Boundary Test',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(service.setCredential(created.value.profileId, secret).ok).toBe(true);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const persisted = tables.map(({ name }) => ({
      name,
      rows: db.prepare(`SELECT * FROM "${name}"`).all(),
    }));

    expect(JSON.stringify(persisted)).not.toContain(secret);
    const profileColumns = db.prepare('PRAGMA table_info(connection_profiles)').all() as { name: string }[];
    expect(profileColumns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(['api_key', 'access_token', 'refresh_token', 'credential', 'secret']),
    );
  });
});

describe('M0.2 — credential boundary', () => {
  it('exposes only configured/missing credential status and never the secret in renderer DTOs', () => {
    const { service } = makeM02Services();
    const secret = 'credential-value-that-must-not-serialize';

    const created = service.createProfile({
      displayName: 'Renderer DTO Test',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const missing = service.getCredentialStatus(created.value.profileId);
    expect(missing).toEqual({ ok: true, value: 'missing' });

    expect(service.setCredential(created.value.profileId, secret).ok).toBe(true);
    const configured = service.getCredentialStatus(created.value.profileId);
    expect(configured).toEqual({ ok: true, value: 'configured' });

    const profileDto = ConnectionProfileDtoSchema.parse({
      ...created.value,
      createdAt: created.value.createdAt.toISOString(),
      updatedAt: created.value.updatedAt.toISOString(),
    });
    const statusDto = ConnectionCredentialStatusDtoSchema.parse({
      profileId: created.value.profileId,
      status: configured.ok ? configured.value : 'missing',
    });

    expect(JSON.stringify({ profileDto, statusDto })).not.toContain(secret);
    expect(statusDto).toEqual({ profileId: created.value.profileId, status: 'configured' });
    expect(() => ConnectionCredentialStatusDtoSchema.parse({
      profileId: created.value.profileId,
      status: 'configured',
      credential: secret,
    })).toThrow();
  });

  it('does not put credential plaintext into audit events', () => {
    const { auditRepo, service } = makeM02Services();
    const secret = 'audit-must-never-see-this-secret';

    const created = service.createProfile({
      displayName: 'Audit Boundary Test',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(service.setCredential(created.value.profileId, secret).ok).toBe(true);
    expect(service.getCredentialStatus(created.value.profileId)).toEqual({ ok: true, value: 'configured' });

    expect(JSON.stringify(auditRepo.list(20))).not.toContain(secret);
  });

  it('deletes credentials through the CredentialStore boundary', () => {
    const { service } = makeM02Services();

    const created = service.createProfile({
      displayName: 'Credential Delete Test',
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Work-PC',
      autoStart: false,
      autoRestart: false,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(service.setCredential(created.value.profileId, 'session-only-secret').ok).toBe(true);
    expect(service.getCredentialStatus(created.value.profileId)).toEqual({
      ok: true,
      value: 'configured',
    });
    expect(service.deleteCredential(created.value.profileId).ok).toBe(true);
    expect(service.getCredentialStatus(created.value.profileId)).toEqual({
      ok: true,
      value: 'missing',
    });
  });
});

describe('M0.2 — strict contracts', () => {
  const validProfileInput = {
    displayName: 'Work Secure Tunnel',
    provider: 'openai_secure_mcp_tunnel',
    transport: 'stdio',
    deviceName: 'Work-PC',
    autoStart: false,
    autoRestart: true,
  } as const;

  it('rejects invalid connection providers', () => {
    expect(() => ConnectionProfileCreateInputSchema.parse({
      ...validProfileInput,
      provider: 'unrestricted_provider',
    })).toThrow();
  });

  it('rejects invalid connection transports', () => {
    expect(() => ConnectionProfileCreateInputSchema.parse({
      ...validProfileInput,
      transport: 'shell',
    })).toThrow();
  });

  it('keeps connection profile create/update schemas strict', () => {
    expect(ConnectionProfileCreateInputSchema.parse(validProfileInput)).toEqual(validProfileInput);
    expect(() => ConnectionProfileCreateInputSchema.parse({
      ...validProfileInput,
      apiKey: 'must-not-be-accepted',
    })).toThrow();

    expect(() => ConnectionProfileUpdateInputSchema.parse({
      profileId: '00000000-0000-4000-8000-000000000000',
      autoStart: true,
      credential: 'must-not-be-accepted',
    })).toThrow();
  });

  it.each(['executable', 'command', 'cwd', 'env', 'environment', 'environmentVariables'])(
    'rejects arbitrary %s injection through lifecycle and profile contracts',
    (field) => {
      expect(() => RuntimeStartInputSchema.parse({
        workspaceId: '00000000-0000-4000-8000-000000000000',
        provider: 'openai_secure_mcp_tunnel',
        transport: 'stdio',
        [field]: field === 'env' ? { PATH: 'C:/evil' } : 'evil-value',
      })).toThrow();

      expect(() => ConnectionProfileCreateInputSchema.parse({
        ...validProfileInput,
        [field]: field === 'env' ? { PATH: 'C:/evil' } : 'evil-value',
      })).toThrow();
    },
  );
});

describe('M0.2 — database migration', () => {
  it('upgrades a v1 database transactionally and remains idempotent on reopen', () => {
    const dataDir = makeTempDir();
    const dbPath = path.join(dataDir, 'upgrade.db');
    const legacy = new Database(dbPath);

    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE workspaces (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        canonical_root TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        session_id TEXT NOT NULL,
        session_type TEXT NOT NULL,
        action TEXT NOT NULL,
        workspace_id TEXT,
        resource_path TEXT,
        policy_decision TEXT,
        result_code TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        metadata TEXT NOT NULL
      );
      CREATE INDEX idx_audit_timestamp ON audit_events(timestamp DESC);
      CREATE INDEX idx_audit_workspace ON audit_events(workspace_id);
      INSERT INTO schema_migrations(version, applied_at) VALUES(1, '2026-08-30T00:00:00.000Z');
    `);
    legacy.close();

    const upgraded = openTrackedDatabase(dbPath);
    expect(
      (upgraded.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[])
        .map((row) => row.version),
    ).toEqual([1, 2]);
    expect(
      upgraded.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'connection_profiles'").get(),
    ).toBeTruthy();
    upgraded.close();
    openDbs.splice(openDbs.indexOf(upgraded), 1);

    const reopened = openTrackedDatabase(dbPath);
    expect(
      (reopened.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: number }[])
        .map((row) => row.version),
    ).toEqual([1, 2]);
    expect(
      reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 2").get(),
    ).toEqual({ count: 1 });
  });
});
