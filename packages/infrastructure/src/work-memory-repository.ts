import { randomUUID } from 'node:crypto';
import {
  WORK_MEMORY_LIMITS,
  appError,
  err,
  ok,
  type AppError,
  type Result,
  type WorkResumeContext,
  type WorkTaskStatus,
} from '@sud-d/domain';
import type { Db } from './database.js';

export type WorkMemoryCheckpointDraft = Omit<WorkResumeContext, 'checkpointId'>;

export interface WorkMemoryRepository {
  loadCurrent(workspaceId: string): Result<WorkResumeContext | undefined, AppError>;
  saveCheckpoint(input: WorkMemoryCheckpointDraft): Result<WorkResumeContext, AppError>;
  listRecent(workspaceId: string, limit?: number): Result<readonly WorkResumeContext[], AppError>;
}

interface WorkMemoryRow {
  checkpoint_id: string;
  workspace_id: string;
  checkpoint_index: number;
  is_current: number;
  goal: string;
  task_title: string;
  task_status: WorkTaskStatus;
  completed_json: string;
  decisions_json: string;
  blockers_json: string;
  next_action: string;
  artifacts_json: string;
  verification_json: string;
  git_head_sha: string | null;
  git_status_id: string | null;
  updated_at: string;
}

const persistenceError = () => err(appError(
  'WORK_MEMORY_PERSISTENCE_FAILED',
  'Work Memory persistence is unavailable',
));

function parseStringArray(value: string): readonly string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('invalid stored array');
  }
  return parsed;
}

function rowToContext(row: WorkMemoryRow): WorkResumeContext {
  const git = row.git_head_sha && row.git_status_id
    ? { headSha: row.git_head_sha, statusId: row.git_status_id }
    : undefined;
  return {
    checkpointId: row.checkpoint_id,
    workspaceId: row.workspace_id,
    goal: row.goal,
    task: { title: row.task_title, status: row.task_status },
    completed: parseStringArray(row.completed_json),
    decisions: parseStringArray(row.decisions_json),
    blockers: parseStringArray(row.blockers_json),
    nextAction: row.next_action,
    artifacts: parseStringArray(row.artifacts_json),
    verification: parseStringArray(row.verification_json),
    ...(git ? { git } : {}),
    updatedAt: row.updated_at,
  };
}

export function createWorkMemoryRepository(db: Db): WorkMemoryRepository {
  const loadCurrentStatement = db.prepare(`
    SELECT * FROM work_memory_checkpoints
    WHERE workspace_id = ? AND is_current = 1
    LIMIT 1
  `);
  const listRecentStatement = db.prepare(`
    SELECT * FROM work_memory_checkpoints
    WHERE workspace_id = ?
    ORDER BY checkpoint_index DESC
    LIMIT ?
  `);
  const maxIndexStatement = db.prepare(`
    SELECT COALESCE(MAX(checkpoint_index), 0) AS max_index
    FROM work_memory_checkpoints WHERE workspace_id = ?
  `);
  const demoteCurrentStatement = db.prepare(`
    UPDATE work_memory_checkpoints SET is_current = 0
    WHERE workspace_id = ? AND is_current = 1
  `);
  const insertStatement = db.prepare(`
    INSERT INTO work_memory_checkpoints(
      checkpoint_id, workspace_id, checkpoint_index, is_current,
      goal, task_title, task_status, completed_json, decisions_json,
      blockers_json, next_action, artifacts_json, verification_json,
      git_head_sha, git_status_id, updated_at
    ) VALUES(?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const trimStatement = db.prepare(`
    DELETE FROM work_memory_checkpoints
    WHERE workspace_id = ? AND checkpoint_index NOT IN (
      SELECT checkpoint_index FROM work_memory_checkpoints
      WHERE workspace_id = ?
      ORDER BY checkpoint_index DESC
      LIMIT ?
    )
  `);

  const repository: WorkMemoryRepository = {
    loadCurrent(workspaceId) {
      try {
        const row = loadCurrentStatement.get(workspaceId) as WorkMemoryRow | undefined;
        return ok(row ? rowToContext(row) : undefined);
      } catch {
        return persistenceError();
      }
    },

    saveCheckpoint(input) {
      try {
        const saved = db.transaction(() => {
          const maxRow = maxIndexStatement.get(input.workspaceId) as { max_index: number };
          const checkpointIndex = maxRow.max_index + 1;
          const checkpointId = randomUUID();
          demoteCurrentStatement.run(input.workspaceId);
          insertStatement.run(
            checkpointId,
            input.workspaceId,
            checkpointIndex,
            input.goal,
            input.task.title,
            input.task.status,
            JSON.stringify(input.completed),
            JSON.stringify(input.decisions),
            JSON.stringify(input.blockers),
            input.nextAction,
            JSON.stringify(input.artifacts),
            JSON.stringify(input.verification),
            input.git?.headSha ?? null,
            input.git?.statusId ?? null,
            input.updatedAt,
          );
          trimStatement.run(input.workspaceId, input.workspaceId, WORK_MEMORY_LIMITS.maxHistory);
          const row = loadCurrentStatement.get(input.workspaceId) as WorkMemoryRow | undefined;
          if (!row) throw new Error('current checkpoint missing');
          return rowToContext(row);
        })();
        return ok(saved);
      } catch {
        return persistenceError();
      }
    },

    listRecent(workspaceId, requestedLimit = WORK_MEMORY_LIMITS.maxHistory) {
      try {
        const limit = Math.max(1, Math.min(requestedLimit, WORK_MEMORY_LIMITS.maxHistory));
        const rows = listRecentStatement.all(workspaceId, limit) as WorkMemoryRow[];
        return ok(rows.map(rowToContext));
      } catch {
        return persistenceError();
      }
    },
  };
  return Object.freeze(repository);
}
