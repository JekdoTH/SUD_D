import type { Db } from './database.js';
import type { Workspace } from '@sud-d/domain';
import { v4 as uuidv4 } from 'uuid';

interface WorkspaceRow {
  id: string;
  display_name: string;
  canonical_root: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    displayName: row.display_name,
    canonicalRoot: row.canonical_root,
    isActive: row.is_active === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface WorkspaceRepository {
  list(): Workspace[];
  findById(id: string): Workspace | undefined;
  findByCanonicalRoot(root: string): Workspace | undefined;
  save(displayName: string, canonicalRoot: string): Workspace;
  setActive(id: string): void;
  remove(id: string): void;
}

export function createWorkspaceRepository(db: Db): WorkspaceRepository {
  return {
    list(): Workspace[] {
      const rows = db
        .prepare('SELECT * FROM workspaces ORDER BY created_at ASC')
        .all() as WorkspaceRow[];
      return rows.map(rowToWorkspace);
    },

    findById(id: string): Workspace | undefined {
      const row = db
        .prepare('SELECT * FROM workspaces WHERE id = ?')
        .get(id) as WorkspaceRow | undefined;
      return row ? rowToWorkspace(row) : undefined;
    },

    findByCanonicalRoot(root: string): Workspace | undefined {
      const row = db
        .prepare('SELECT * FROM workspaces WHERE canonical_root = ?')
        .get(root) as WorkspaceRow | undefined;
      return row ? rowToWorkspace(row) : undefined;
    },

    save(displayName: string, canonicalRoot: string): Workspace {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO workspaces(id, display_name, canonical_root, is_active, created_at, updated_at)
         VALUES(?, ?, ?, 0, ?, ?)`,
      ).run(id, displayName, canonicalRoot, now, now);
      return this.findById(id) as Workspace;
    },

    setActive(id: string): void {
      const now = new Date().toISOString();
      db.transaction(() => {
        db.prepare('UPDATE workspaces SET is_active = 0, updated_at = ?').run(now);
        db.prepare('UPDATE workspaces SET is_active = 1, updated_at = ? WHERE id = ?').run(
          now,
          id,
        );
      })();
    },

    remove(id: string): void {
      const now = new Date().toISOString();
      db.transaction(() => {
        // If removed workspace was active, deactivate; activate newest remaining
        const ws = db
          .prepare('SELECT * FROM workspaces WHERE id = ?')
          .get(id) as WorkspaceRow | undefined;
        db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
        if (ws && ws.is_active === 1) {
          const next = db
            .prepare('SELECT id FROM workspaces ORDER BY created_at DESC LIMIT 1')
            .get() as { id: string } | undefined;
          if (next) {
            db.prepare('UPDATE workspaces SET is_active = 1, updated_at = ? WHERE id = ?').run(
              now,
              next.id,
            );
          }
        }
      })();
    },
  };
}
