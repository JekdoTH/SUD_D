import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizePath,
  createWorkMemoryRepository,
  createWorkspaceRepository,
  openDatabase,
} from '@sud-d/infrastructure';

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error('canonicalize failed');
  return result.value;
}

function checkpoint(workspaceId: string, index: number) {
  return {
    workspaceId,
    goal: 'Ship Work Memory',
    task: { title: `Checkpoint ${index}`, status: 'in_progress' as const },
    completed: [`done ${index}`],
    decisions: ['bounded history'],
    blockers: [],
    nextAction: 'Continue implementation',
    artifacts: ['packages/domain/src/work-memory.ts'],
    verification: ['focused test pass'],
    git: { headSha: 'a'.repeat(40), statusId: 'b'.repeat(64) },
    updatedAt: `2026-09-05T00:00:${String(index).padStart(2, '0')}.000Z`,
  };
}

describe('Work Memory repository', () => {
  it('persists one authoritative current context and bounded history across database reopen', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-work-memory-repo-'));
    tempRoots.push(root);
    const dbPath = path.join(root, 'sud-d.db');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot);
    let db = openDatabase(dbPath);
    const workspace = createWorkspaceRepository(db).save('Work Memory', canonical(workspaceRoot));
    let repo = createWorkMemoryRepository(db);
    expect(repo.loadCurrent(workspace.id)).toEqual({ ok: true, value: undefined });
    for (let index = 1; index <= 22; index += 1) {
      const saved = repo.saveCheckpoint(checkpoint(workspace.id, index));
      expect(saved.ok).toBe(true);
    }
    const recent = repo.listRecent(workspace.id, 50);
    expect(recent.ok).toBe(true);
    if (!recent.ok) return;
    expect(recent.value).toHaveLength(20);
    expect(recent.value[0]?.task.title).toBe('Checkpoint 22');
    expect(recent.value.filter((item) => item.task.title === 'Checkpoint 22')).toHaveLength(1);
    db.close();

    db = openDatabase(dbPath);
    repo = createWorkMemoryRepository(db);
    const current = repo.loadCurrent(workspace.id);
    expect(current.ok).toBe(true);
    if (current.ok) expect(current.value).toMatchObject({ workspaceId: workspace.id, task: { title: 'Checkpoint 22' } });
    db.close();
  });

  it('maps database failure to a stable sanitized Work Memory error', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-work-memory-fail-'));
    tempRoots.push(root);
    const db = openDatabase(path.join(root, 'sud-d.db'));
    const repo = createWorkMemoryRepository(db);
    db.close();
    const result = repo.loadCurrent('RAW_DB_PATH_SECRET_SENTINEL');
    expect(result).toMatchObject({ ok: false, error: { code: 'WORK_MEMORY_PERSISTENCE_FAILED', message: 'Work Memory persistence is unavailable' } });
    expect(JSON.stringify(result)).not.toContain('RAW_DB_PATH_SECRET_SENTINEL');
  });
});
