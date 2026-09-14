import type { Db } from './database.js';

export interface WorkspaceGitSettings {
  readonly workspaceId: string;
  readonly primaryRemoteName?: string;
  readonly updatedAt: Date;
}

export interface WorkspaceGitSettingsRepository {
  get(workspaceId: string): WorkspaceGitSettings | undefined;
  setPrimaryRemote(workspaceId: string, remoteName: string): WorkspaceGitSettings;
  clearPrimaryRemote(workspaceId: string): void;
}

interface WorkspaceGitSettingsRow {
  workspace_id: string;
  primary_remote_name: string | null;
  updated_at: string;
}

function rowToSettings(row: WorkspaceGitSettingsRow): WorkspaceGitSettings {
  return {
    workspaceId: row.workspace_id,
    ...(row.primary_remote_name === null ? {} : { primaryRemoteName: row.primary_remote_name }),
    updatedAt: new Date(row.updated_at),
  };
}

export function createWorkspaceGitSettingsRepository(db: Db): WorkspaceGitSettingsRepository {
  return {
    get(workspaceId: string): WorkspaceGitSettings | undefined {
      const row = db
        .prepare('SELECT workspace_id, primary_remote_name, updated_at FROM workspace_git_settings WHERE workspace_id = ?')
        .get(workspaceId) as WorkspaceGitSettingsRow | undefined;
      return row ? rowToSettings(row) : undefined;
    },

    setPrimaryRemote(workspaceId: string, remoteName: string): WorkspaceGitSettings {
      const updatedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO workspace_git_settings(workspace_id, primary_remote_name, updated_at)
         VALUES(?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           primary_remote_name = excluded.primary_remote_name,
           updated_at = excluded.updated_at`,
      ).run(workspaceId, remoteName, updatedAt);
      return this.get(workspaceId) as WorkspaceGitSettings;
    },

    clearPrimaryRemote(workspaceId: string): void {
      const updatedAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO workspace_git_settings(workspace_id, primary_remote_name, updated_at)
         VALUES(?, NULL, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET
           primary_remote_name = NULL,
           updated_at = excluded.updated_at`,
      ).run(workspaceId, updatedAt);
    },
  };
}
