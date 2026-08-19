/**
 * SUD-D Phase 1 — Required test matrix (tests 1–24)
 *
 * Tests 1–2, 16: Workspace service integration (real SQLite in temp dir)
 * Tests 3–14:    Windows path-security contract
 * Test 15:       InternalRoot denial
 * Test 17:       Zod IPC validation
 * Tests 18–20:   Sensitivity classifier
 * Tests 21–22:   Baseline policy
 * Test 23:       Audit sanitizer
 * Test 24:       AppError typed errors (not raw exceptions)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { openDatabase } from '@sud-d/infrastructure';
import { createWorkspaceRepository } from '@sud-d/infrastructure';
import { createAuditRepository, sanitizeMetadata } from '@sud-d/infrastructure';
import { validateRelativePath, hasReparsePoint } from '@sud-d/infrastructure';
import { createWorkspaceService } from '@sud-d/application';
import { classifySensitivity, evaluatePolicy } from '@sud-d/domain';
import { WorkspaceAddInputSchema } from '@sud-d/contracts';
import type { InternalRoot } from '@sud-d/domain';
import type { Db } from '@sud-d/infrastructure';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-test-'));
}

function makeTestServices(dataDir: string, internalRoots: InternalRoot[] = []) {
  const dbPath = path.join(dataDir, 'test.db');
  const db = openDatabase(dbPath);
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const workspaceService = createWorkspaceService(workspaceRepo, auditRepo, internalRoots);
  return { db, workspaceRepo, auditRepo, workspaceService };
}

function cleanupTempDir(db: Db | null, tmpDir: string): void {
  try { db?.close(); } catch { /* ignore */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Test 1 & 2: Workspace registration persistence, list/select/remove
// ---------------------------------------------------------------------------

describe('Test 1 — valid Workspace registration persists canonical root', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('saves a workspace and returns canonical root', () => {
    const wsRoot = makeTempDir();
    try {
      const services = makeTestServices(tmpDir);
      db = services.db;
      const result = services.workspaceService.add('My Project', wsRoot);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.canonicalRoot).toBeTruthy();
      expect(result.value.displayName).toBe('My Project');
      expect(result.value.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    } finally {
      fs.rmSync(wsRoot, { recursive: true, force: true });
    }
  });
});

describe('Test 2 — list/select/remove works; removal leaves project files untouched', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('full lifecycle', () => {
    const wsRoot = makeTempDir();
    const sentinelFile = path.join(wsRoot, 'README.md');
    fs.writeFileSync(sentinelFile, 'do not delete');
    try {
      const services = makeTestServices(tmpDir);
      db = services.db;
      const { workspaceService } = services;

      // Add
      const addResult = workspaceService.add('Test WS', wsRoot);
      expect(addResult.ok).toBe(true);
      if (!addResult.ok) return;
      const id = addResult.value.id;

      // List
      const listResult = workspaceService.list();
      expect(listResult.ok).toBe(true);
      if (!listResult.ok) return;
      expect(listResult.value).toHaveLength(1);

      // Select
      const selectResult = workspaceService.select(id);
      expect(selectResult.ok).toBe(true);

      const listAfterSelect = workspaceService.list();
      expect(listAfterSelect.ok).toBe(true);
      if (!listAfterSelect.ok) return;
      expect(listAfterSelect.value[0]?.isActive).toBe(true);

      // Remove (registration only)
      const removeResult = workspaceService.remove(id);
      expect(removeResult.ok).toBe(true);

      // Project file must still exist
      expect(fs.existsSync(sentinelFile)).toBe(true);
      expect(fs.readFileSync(sentinelFile, 'utf8')).toBe('do not delete');

      // List must be empty
      const listAfterRemove = workspaceService.list();
      expect(listAfterRemove.ok).toBe(true);
      if (!listAfterRemove.ok) return;
      expect(listAfterRemove.value).toHaveLength(0);
    } finally {
      fs.rmSync(wsRoot, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Tests 3–14: Windows path-security contract
// ---------------------------------------------------------------------------

describe('Test 3 — normal relative path inside Workspace resolves', () => {
  it('accepts src/index.ts', () => {
    const result = validateRelativePath('src/index.ts');
    expect(result.ok).toBe(true);
  });

  it('accepts nested path', () => {
    const result = validateRelativePath('packages/app/src/main.ts');
    expect(result.ok).toBe(true);
  });
});

describe('Test 4 — .. traversal rejected', () => {
  it('rejects ../etc/passwd', () => {
    const result = validateRelativePath('../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });

  it('rejects deep traversal', () => {
    const result = validateRelativePath('src/../../secret');
    expect(result.ok).toBe(false);
  });

  it('rejects sole ..', () => {
    const result = validateRelativePath('..');
    expect(result.ok).toBe(false);
  });
});

describe('Test 5 — absolute tool path rejected', () => {
  it('rejects C:\\Windows\\System32', () => {
    const result = validateRelativePath('C:\\Windows\\System32');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });

  it('rejects /etc/passwd', () => {
    const result = validateRelativePath('/etc/passwd');
    expect(result.ok).toBe(false);
  });
});

describe('Test 6 — drive-relative path rejected', () => {
  it('rejects C:src (no separator)', () => {
    const result = validateRelativePath('C:src');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });
});

describe('Test 7 — UNC path rejected', () => {
  it('rejects \\\\server\\share', () => {
    const result = validateRelativePath('\\\\server\\share\\file');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });

  it('rejects //server/share', () => {
    const result = validateRelativePath('//server/share/file');
    expect(result.ok).toBe(false);
  });
});

describe('Test 8 — \\\\?\\ and \\\\.\\  device namespace rejected', () => {
  it('rejects \\\\?\\C:\\file', () => {
    const result = validateRelativePath('\\\\?\\C:\\file');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DEVICE_PATH_DENIED');
  });

  it('rejects \\\\.\\pipe\\thing', () => {
    const result = validateRelativePath('\\\\.\\pipe\\thing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DEVICE_PATH_DENIED');
  });
});

describe('Test 9 — NUL rejected', () => {
  it('rejects string containing NUL byte', () => {
    const result = validateRelativePath('file\0name');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });
});

describe('Test 10 — colon / alternate-data-stream form rejected', () => {
  it('rejects file:stream', () => {
    const result = validateRelativePath('file:stream');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });

  it('rejects src/main.ts:ads', () => {
    const result = validateRelativePath('src/main.ts:ads');
    expect(result.ok).toBe(false);
  });
});

describe('Test 11 — Windows reserved device-name component rejected', () => {
  for (const name of ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1', 'com1', 'nul.txt', 'CON.log']) {
    it(`rejects ${name}`, () => {
      const result = validateRelativePath(name);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('DEVICE_PATH_DENIED');
    });
  }
});

describe('Test 12 — trailing dot/space component rejected', () => {
  it('rejects "file."', () => {
    const result = validateRelativePath('file.');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });

  it('rejects "file "', () => {
    const result = validateRelativePath('file ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_PATH');
  });
});

describe('Test 13 — prefix confusion cannot escape (C:\\work\\app vs C:\\work\\app-evil)', () => {
  it('app-evil is not contained in app', () => {
    const parent = 'C:\\work\\app';
    const child  = 'C:\\work\\app-evil\\secret.txt';
    const rel = path.relative(parent, child);
    // rel would be '..\app-evil\secret.txt' — starts with '..'
    expect(rel.startsWith('..')).toBe(true);
  });

  it('validateRelativePath blocks .. needed to escape', () => {
    // An attacker cannot construct '../app-evil/secret.txt' as a tool path
    const result = validateRelativePath('../app-evil/secret.txt');
    expect(result.ok).toBe(false);
  });
});

describe('Test 14 — symlink/junction denied (skip if cannot create)', () => {
  it('skips with reason if symlink creation is unavailable (expected on most CI)', () => {
    const tmpDir = makeTempDir();
    const target  = path.join(tmpDir, 'target');
    const linkPath = path.join(tmpDir, 'link');
    fs.mkdirSync(target);
    let canCreate = false;
    try {
      fs.symlinkSync(target, linkPath, 'junction');
      canCreate = true;
    } catch {
      // No privilege — skip substantive test
    }
    if (!canCreate) {
      // Explicit skip with reason
      console.warn('SKIP test 14: symlink/junction creation requires elevated privilege on this Windows session');
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return;
    }
    // If we could create, verify path-adapter detects it (hasReparsePoint imported at top)
    const result = hasReparsePoint(linkPath);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Test 15 — InternalRoot denied before normal Workspace access
// ---------------------------------------------------------------------------

describe('Test 15 — InternalRoot denied before workspace containment', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('workspace root inside InternalRoot is rejected at add time', () => {
    // Make InternalRoot = tmpDir itself
    const internalRoots: InternalRoot[] = [
      { canonicalPath: fs.realpathSync(tmpDir), label: 'Test Internal Root' },
    ];
    const services = makeTestServices(tmpDir, internalRoots);
    db = services.db;
    // Try to register tmpDir as a workspace — should be denied
    const result = services.workspaceService.add('Evil WS', tmpDir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INTERNAL_PATH_DENIED');
  });
});

// ---------------------------------------------------------------------------
// Test 16 — missing Workspace fails closed
// ---------------------------------------------------------------------------

describe('Test 16 — missing Workspace fails closed', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('select on unknown ID returns WORKSPACE_NOT_FOUND', () => {
    const services = makeTestServices(tmpDir);
    db = services.db;
    const result = services.workspaceService.select('00000000-0000-4000-8000-000000000000');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('remove on unknown ID returns WORKSPACE_NOT_FOUND', () => {
    const services2 = makeTestServices(tmpDir);
    db = services2.db;
    const result = services2.workspaceService.remove('00000000-0000-4000-8000-000000000001');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('WORKSPACE_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Test 17 — malformed privileged IPC input fails Zod validation
// ---------------------------------------------------------------------------

describe('Test 17 — malformed IPC input fails Zod validation', () => {
  it('WorkspaceAddInputSchema rejects missing displayName', () => {
    expect(() =>
      WorkspaceAddInputSchema.parse({ rootPath: 'C:\\something' }),
    ).toThrow();
  });

  it('WorkspaceAddInputSchema rejects empty displayName', () => {
    expect(() =>
      WorkspaceAddInputSchema.parse({ displayName: '', rootPath: 'C:\\something' }),
    ).toThrow();
  });

  it('WorkspaceAddInputSchema rejects non-string', () => {
    expect(() =>
      WorkspaceAddInputSchema.parse({ displayName: 42, rootPath: 99 }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests 18–20: Sensitivity classifier
// ---------------------------------------------------------------------------

describe('Test 18 — .env.local is credential', () => {
  it('classifies .env.local as credential', () => {
    expect(classifySensitivity('.env.local')).toBe('credential');
  });

  it('classifies .env as credential', () => {
    expect(classifySensitivity('.env')).toBe('credential');
  });

  it('classifies .env.production as credential', () => {
    expect(classifySensitivity('.env.production')).toBe('credential');
  });
});

describe('Test 19 — .env.example / .env.sample / .env.template are NOT credential', () => {
  it('.env.example → normal', () => {
    expect(classifySensitivity('.env.example')).toBe('normal');
  });

  it('.env.sample → normal', () => {
    expect(classifySensitivity('.env.sample')).toBe('normal');
  });

  it('.env.template → normal', () => {
    expect(classifySensitivity('.env.template')).toBe('normal');
  });
});

describe('Test 20 — .ssh, .aws, .azure, .kube descendants classify credential', () => {
  for (const dir of ['.ssh', '.aws', '.azure', '.kube']) {
    it(`${dir}/config → credential`, () => {
      expect(classifySensitivity(`${dir}/config`)).toBe('credential');
    });

    it(`${dir}/nested/file.txt → credential`, () => {
      expect(classifySensitivity(`${dir}/nested/file.txt`)).toBe('credential');
    });
  }

  it('id_rsa → credential', () => {
    expect(classifySensitivity('id_rsa')).toBe('credential');
  });

  it('id_ed25519.pub → credential', () => {
    expect(classifySensitivity('id_ed25519.pub')).toBe('credential');
  });

  it('server.key → credential', () => {
    expect(classifySensitivity('server.key')).toBe('credential');
  });

  it('cert.pem → credential', () => {
    expect(classifySensitivity('cert.pem')).toBe('credential');
  });

  it('credentials.json → credential', () => {
    expect(classifySensitivity('credentials.json')).toBe('credential');
  });

  it('.npmrc → credential', () => {
    expect(classifySensitivity('.npmrc')).toBe('credential');
  });

  it('normal file → normal', () => {
    expect(classifySensitivity('src/index.ts')).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// Tests 21–22: Baseline policy
// ---------------------------------------------------------------------------

describe('Test 21 — policy returns deny for outside_workspace / internal_root / network', () => {
  it('outside_workspace → deny', () => {
    const d = evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'outside_workspace' });
    expect(d.decision).toBe('deny');
  });

  it('internal_root → deny', () => {
    const d = evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'internal_root' });
    expect(d.decision).toBe('deny');
  });

  it('network → deny', () => {
    const d = evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'network' });
    expect(d.decision).toBe('deny');
  });
});

describe('Test 22 — policy returns ask for delete / credential access', () => {
  it('delete → ask', () => {
    const d = evaluatePolicy({ effect: 'delete', sensitivity: 'normal', context: 'workspace' });
    expect(d.decision).toBe('ask');
  });

  it('credential read → ask', () => {
    const d = evaluatePolicy({ effect: 'read', sensitivity: 'credential', context: 'workspace' });
    expect(d.decision).toBe('ask');
  });

  it('credential modify → ask', () => {
    const d = evaluatePolicy({ effect: 'modify', sensitivity: 'credential', context: 'workspace' });
    expect(d.decision).toBe('ask');
  });

  it('normal read → allow', () => {
    const d = evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'workspace' });
    expect(d.decision).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// Test 23 — audit sanitizer does not persist secret-like fixture values
// ---------------------------------------------------------------------------

describe('Test 23 — audit sanitizer does not persist secret-like values', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('sanitizeMetadata redacts password, token, secret, api_key', () => {
    const raw = {
      password: 'super-secret-123',
      token: 'ghp_abc123',
      api_key: 'sk-abc',
      apiKey: 'sk-xyz',
      secret: 'my-secret',
      safeField: 'safe-value',
      count: 42,
    };
    const sanitized = sanitizeMetadata(raw);
    expect(sanitized['password']).toBe('[REDACTED]');
    expect(sanitized['token']).toBe('[REDACTED]');
    expect(sanitized['api_key']).toBe('[REDACTED]');
    expect(sanitized['apiKey']).toBe('[REDACTED]');
    expect(sanitized['secret']).toBe('[REDACTED]');
    expect(sanitized['safeField']).toBe('safe-value');
    expect(sanitized['count']).toBe(42);
  });

  it('audit append persists redacted values (not raw secret)', () => {
    const services = makeTestServices(tmpDir);
    db = services.db;
    services.auditRepo.append({
      timestamp: new Date(),
      sessionId: 'desktop',
      sessionType: 'desktop',
      action: 'test:action',
      resultCode: 'OK',
      durationMs: 0,
      metadata: { password: 'my-secret-password', safeKey: 'hello' },
    });
    // Read raw from DB to verify
    const row = db
      .prepare('SELECT metadata FROM audit_events ORDER BY timestamp DESC LIMIT 1')
      .get() as { metadata: string };
    const stored = JSON.parse(row.metadata) as Record<string, unknown>;
    expect(stored['password']).toBe('[REDACTED]');
    expect(stored['safeKey']).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// Test 24 — application services return typed AppError, not raw exceptions
// ---------------------------------------------------------------------------

describe('Test 24 — typed AppError returned (not raw exceptions)', () => {
  let tmpDir: string;
  let db: Db | null = null;

  beforeEach(() => { tmpDir = makeTempDir(); db = null; });
  afterEach(() => { cleanupTempDir(db, tmpDir); });

  it('add with non-existent root returns typed error with code', () => {
    const services = makeTestServices(tmpDir);
    db = services.db;
    const result = services.workspaceService.add('X', 'C:\\this\\path\\does\\not\\exist\\ever');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error.code).toBe('string');
      expect(typeof result.error.message).toBe('string');
      // Must NOT be a raw Error instance
      expect(result.error).not.toBeInstanceOf(Error);
    }
  });

  it('add with UNC root returns typed WORKSPACE_INVALID', () => {
    const services2 = makeTestServices(tmpDir);
    db = services2.db;
    const result = services2.workspaceService.add('Y', '\\\\server\\share');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WORKSPACE_INVALID');
    }
  });
});
