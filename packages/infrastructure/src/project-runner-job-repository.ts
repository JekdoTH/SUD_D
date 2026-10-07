import { randomUUID } from 'node:crypto';
import {
  appError,
  err,
  ok,
  type AppError,
  type ProjectRunnerArtifactRecord,
  type ProjectRunnerJobRecord,
  type ProjectRunnerJobState,
  type Result,
} from '@sud-d/domain';
import type { Db } from './database.js';

export interface ProjectRunnerAdmissionInput {
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly runnerId: string;
  readonly executionFingerprint: string;
  readonly ownerRuntimeEpoch: string;
  readonly createdAt: string;
}

export interface ProjectRunnerFinishInput {
  readonly state: Extract<ProjectRunnerJobState, 'succeeded' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted'>;
  readonly endedAt: string;
  readonly exitCode?: number;
  readonly terminalCode: string;
  readonly outputBytes?: number;
  readonly droppedLogBytes?: number;
}

export interface ProjectRunnerArtifactInput {
  readonly artifactId: string;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
  readonly createdAt: string;
}

export interface ProjectRunnerJobRepository {
  admit(input: ProjectRunnerAdmissionInput): Result<{ readonly job: ProjectRunnerJobRecord; readonly created: boolean }, AppError>;
  findByJobId(jobId: string): Result<ProjectRunnerJobRecord | undefined, AppError>;
  findByAttemptId(attemptId: string): Result<ProjectRunnerJobRecord | undefined, AppError>;
  listRecent(workspaceId: string, limit?: number): Result<readonly ProjectRunnerJobRecord[], AppError>;
  markRunning(jobId: string, startedAt: string): Result<ProjectRunnerJobRecord, AppError>;
  finish(jobId: string, input: ProjectRunnerFinishInput): Result<ProjectRunnerJobRecord, AppError>;
  interruptOrphaned(currentRuntimeEpoch: string, endedAt: string): Result<number, AppError>;
  publishSucceededArtifacts(jobId: string, artifacts: readonly ProjectRunnerArtifactInput[]): Result<readonly ProjectRunnerArtifactRecord[], AppError>;
  listArtifacts(jobId: string): Result<readonly ProjectRunnerArtifactRecord[], AppError>;
}

interface RunnerJobRow {
  job_id: string;
  attempt_id: string;
  workspace_id: string;
  runner_id: string;
  execution_fingerprint: string;
  owner_runtime_epoch: string;
  state: ProjectRunnerJobState;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  exit_code: number | null;
  terminal_code: string | null;
  output_bytes: number;
  dropped_log_bytes: number;
}

interface RunnerArtifactRow {
  job_id: string;
  artifact_id: string;
  relative_path: string;
  media_type: string;
  size: number;
  sha256: string;
  created_at: string;
}

function rowToJob(row: RunnerJobRow): ProjectRunnerJobRecord {
  return {
    jobId: row.job_id,
    attemptId: row.attempt_id,
    workspaceId: row.workspace_id,
    runnerId: row.runner_id,
    executionFingerprint: row.execution_fingerprint,
    ownerRuntimeEpoch: row.owner_runtime_epoch,
    state: row.state,
    createdAt: row.created_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    ...(row.exit_code !== null ? { exitCode: row.exit_code } : {}),
    ...(row.terminal_code ? { terminalCode: row.terminal_code } : {}),
    outputBytes: Number(row.output_bytes),
    droppedLogBytes: Number(row.dropped_log_bytes),
  };
}

function rowToArtifact(row: RunnerArtifactRow): ProjectRunnerArtifactRecord {
  return {
    jobId: row.job_id,
    artifactId: row.artifact_id,
    relativePath: row.relative_path,
    mediaType: row.media_type,
    size: Number(row.size),
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

export function createProjectRunnerJobRepository(db: Db): ProjectRunnerJobRepository {
  const byJobId = db.prepare('SELECT * FROM runner_jobs WHERE job_id = ?');
  const byAttemptId = db.prepare('SELECT * FROM runner_jobs WHERE attempt_id = ?');
  const activeByWorkspace = db.prepare(`
    SELECT * FROM runner_jobs
    WHERE workspace_id = ? AND state IN ('starting','running')
    ORDER BY created_at ASC LIMIT 1
  `);
  const insertJob = db.prepare(`
    INSERT INTO runner_jobs(
      job_id, attempt_id, workspace_id, runner_id, execution_fingerprint,
      owner_runtime_epoch, state, created_at, output_bytes, dropped_log_bytes
    ) VALUES(?, ?, ?, ?, ?, ?, 'starting', ?, 0, 0)
  `);
  const recent = db.prepare(`
    SELECT * FROM runner_jobs WHERE workspace_id = ?
    ORDER BY created_at DESC LIMIT ?
  `);
  const markRunning = db.prepare(`
    UPDATE runner_jobs SET state='running', started_at=?
    WHERE job_id=? AND state='starting'
  `);
  const finish = db.prepare(`
    UPDATE runner_jobs
    SET state=?, ended_at=?, exit_code=?, terminal_code=?, output_bytes=?, dropped_log_bytes=?
    WHERE job_id=? AND state IN ('starting','running')
  `);
  const interrupt = db.prepare(`
    UPDATE runner_jobs
    SET state='interrupted', ended_at=?, terminal_code='OWNER_RUNTIME_LOST'
    WHERE state IN ('starting','running') AND owner_runtime_epoch <> ?
  `);
  const artifactsByJob = db.prepare(`
    SELECT * FROM runner_artifacts WHERE job_id = ?
    ORDER BY artifact_id ASC
  `);
  const insertArtifact = db.prepare(`
    INSERT INTO runner_artifacts(
      job_id, artifact_id, relative_path, media_type, size, sha256, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?)
  `);

  const readJob = (jobId: string): ProjectRunnerJobRecord | undefined => {
    const row = byJobId.get(jobId) as RunnerJobRow | undefined;
    return row ? rowToJob(row) : undefined;
  };
  const readAttempt = (attemptId: string): ProjectRunnerJobRecord | undefined => {
    const row = byAttemptId.get(attemptId) as RunnerJobRow | undefined;
    return row ? rowToJob(row) : undefined;
  };

  const repository: ProjectRunnerJobRepository = {
    admit(input) {
      try {
        return db.transaction((): Result<{ readonly job: ProjectRunnerJobRecord; readonly created: boolean }, AppError> => {
          const existing = readAttempt(input.attemptId);
          if (existing) {
            if (
              existing.workspaceId !== input.workspaceId
              || existing.runnerId !== input.runnerId
              || existing.executionFingerprint !== input.executionFingerprint
            ) {
              return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
            }
            return ok({ job: existing, created: false });
          }

          const active = activeByWorkspace.get(input.workspaceId) as RunnerJobRow | undefined;
          if (active) {
            return err(appError('RUNNER_BUSY', 'Restricted Project Runner is busy'));
          }

          const jobId = randomUUID();
          insertJob.run(
            jobId,
            input.attemptId,
            input.workspaceId,
            input.runnerId,
            input.executionFingerprint,
            input.ownerRuntimeEpoch,
            input.createdAt,
          );
          const created = readJob(jobId);
          return created
            ? ok({ job: created, created: true })
            : err(appError('INTERNAL_ERROR', 'Restricted Project Runner Job admission failed'));
        })();
      } catch {
        try {
          const existing = readAttempt(input.attemptId);
          if (existing) {
            if (
              existing.workspaceId === input.workspaceId
              && existing.runnerId === input.runnerId
              && existing.executionFingerprint === input.executionFingerprint
            ) return ok({ job: existing, created: false });
            return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
          }
          const active = activeByWorkspace.get(input.workspaceId) as RunnerJobRow | undefined;
          if (active) return err(appError('RUNNER_BUSY', 'Restricted Project Runner is busy'));
        } catch {
          // fall through
        }
        return err(appError('INTERNAL_ERROR', 'Restricted Project Runner Job admission failed'));
      }
    },

    findByJobId(jobId) {
      try { return ok(readJob(jobId)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to read Restricted Project Runner Job')); }
    },

    findByAttemptId(attemptId) {
      try { return ok(readAttempt(attemptId)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to read Restricted Project Runner Job')); }
    },

    listRecent(workspaceId, limit = 20) {
      try {
        const bounded = Math.max(1, Math.min(100, Math.trunc(limit)));
        return ok((recent.all(workspaceId, bounded) as RunnerJobRow[]).map(rowToJob));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to list Restricted Project Runner Jobs'));
      }
    },

    markRunning(jobId, startedAt) {
      try {
        const changed = markRunning.run(startedAt, jobId);
        if (changed.changes !== 1) {
          return err(appError('RUNNER_BUSY', 'Restricted Project Runner Job state changed concurrently'));
        }
        const job = readJob(jobId);
        return job ? ok(job) : err(appError('RUNNER_JOB_NOT_FOUND', 'Restricted Project Runner job is unavailable'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to transition Restricted Project Runner Job'));
      }
    },

    finish(jobId, input) {
      try {
        const outputBytes = Math.max(0, Math.trunc(input.outputBytes ?? 0));
        const droppedLogBytes = Math.max(0, Math.trunc(input.droppedLogBytes ?? 0));
        const changed = finish.run(
          input.state,
          input.endedAt,
          input.exitCode ?? null,
          input.terminalCode,
          outputBytes,
          droppedLogBytes,
          jobId,
        );
        if (changed.changes !== 1) {
          const existing = readJob(jobId);
          if (
            existing
            && existing.state === input.state
            && existing.terminalCode === input.terminalCode
          ) return ok(existing);
          return err(appError('RUNNER_BUSY', 'Restricted Project Runner Job state changed concurrently'));
        }
        const job = readJob(jobId);
        return job ? ok(job) : err(appError('RUNNER_JOB_NOT_FOUND', 'Restricted Project Runner job is unavailable'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to finish Restricted Project Runner Job'));
      }
    },

    interruptOrphaned(currentRuntimeEpoch, endedAt) {
      try {
        return ok(Number(interrupt.run(endedAt, currentRuntimeEpoch).changes));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to reconcile Restricted Project Runner Jobs'));
      }
    },

    publishSucceededArtifacts(jobId, artifacts) {
      try {
        return db.transaction((): Result<readonly ProjectRunnerArtifactRecord[], AppError> => {
          const job = readJob(jobId);
          if (!job) return err(appError('RUNNER_JOB_NOT_FOUND', 'Restricted Project Runner job is unavailable'));
          if (job.state !== 'succeeded') {
            return err(appError('RUNNER_ARTIFACT_INVALID', 'Restricted Project Runner artifact evidence is invalid'));
          }
          const existing = artifactsByJob.all(jobId) as RunnerArtifactRow[];
          if (existing.length > 0) {
            return err(appError('RUNNER_ARTIFACT_INVALID', 'Restricted Project Runner artifact evidence is invalid'));
          }
          for (const artifact of artifacts) {
            insertArtifact.run(
              jobId,
              artifact.artifactId,
              artifact.relativePath,
              artifact.mediaType,
              artifact.size,
              artifact.sha256,
              artifact.createdAt,
            );
          }
          return ok((artifactsByJob.all(jobId) as RunnerArtifactRow[]).map(rowToArtifact));
        })();
      } catch {
        return err(appError('RUNNER_ARTIFACT_INVALID', 'Restricted Project Runner artifact evidence is invalid'));
      }
    },

    listArtifacts(jobId) {
      try {
        return ok((artifactsByJob.all(jobId) as RunnerArtifactRow[]).map(rowToArtifact));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to list Restricted Project Runner artifacts'));
      }
    },
  };

  return Object.freeze(repository);
}
