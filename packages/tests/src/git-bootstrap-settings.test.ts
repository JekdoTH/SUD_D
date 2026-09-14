import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as infrastructure from '@sud-d/infrastructure';
import { createWorkspaceRepository, openDatabase, type Db } from '@sud-d/infrastructure';

const roots: string[] = [];
const dbs: Db[] = [];

function makeDb(): Db {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-settings-'));
  roots.push(root);
  const db = openDatabase(path.join(root, 'state.db'));
  dbs.push(db);
  return db;
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Git Bootstrap - Primary Remote settings persistence', () => {
  it('migration 008 stores only non-secret Primary Remote selection fields', () => {
    const db = makeDb();
    const columns = db.prepare('PRAGMA table_info(workspace_git_settings)').all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual([
      'workspace_id',
      'primary_remote_name',
      'updated_at',
    ]);
    expect(
      (db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get() as { version: number }).version,
    ).toBe(8);
  });

  it('persists, clears, and cascades only the selected Primary Remote name', () => {
    const db = makeDb();
    const workspaceRepo = createWorkspaceRepository(db);
    const workspace = workspaceRepo.save('Widgets', 'C:\\Work\\Widgets');
    const createSettingsRepo = (infrastructure as Record<string, unknown>)['createWorkspaceGitSettingsRepository'];

    expect(typeof createSettingsRepo).toBe('function');
    if (typeof createSettingsRepo !== 'function') return;

    const repo = createSettingsRepo(db) as {
      get(workspaceId: string): { workspaceId: string; primaryRemoteName?: string; updatedAt: Date } | undefined;
      setPrimaryRemote(workspaceId: string, remoteName: string): { workspaceId: string; primaryRemoteName?: string; updatedAt: Date };
      clearPrimaryRemote(workspaceId: string): void;
    };

    expect(repo.get(workspace.id)).toBeUndefined();
    expect(repo.setPrimaryRemote(workspace.id, 'upstream')).toMatchObject({
      workspaceId: workspace.id,
      primaryRemoteName: 'upstream',
    });
    expect(repo.get(workspace.id)).toMatchObject({ workspaceId: workspace.id, primaryRemoteName: 'upstream' });

    repo.clearPrimaryRemote(workspace.id);
    expect(repo.get(workspace.id)?.workspaceId).toBe(workspace.id);
    expect(repo.get(workspace.id)?.primaryRemoteName).toBeUndefined();

    repo.setPrimaryRemote(workspace.id, 'mirror');
    workspaceRepo.remove(workspace.id);
    expect(repo.get(workspace.id)).toBeUndefined();
  });
});
