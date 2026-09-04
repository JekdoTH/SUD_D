import path from 'node:path';
import {
  CodingEngineRuntimeFailure,
  codingEngineRuntimeFailureAppError,
  ok,
  err,
  type AppError,
  type CodingEngineFailureCode,
  type CodingEngineRuntimeHealth,
  type CodingEngineStatus,
  type CodingEngineWorkspaceContext,
  type Result,
  type Workspace,
} from '@sud-d/domain';
import type { AuditRepository, WorkspaceRepository } from '@sud-d/infrastructure';
import type { CodingEngineRuntimePort } from './coding-engine-runtime-port.js';

const DESKTOP_SESSION = { id: 'desktop', type: 'desktop' as const };

export interface CodingEngineService {
  getStatus(): CodingEngineStatus;
  start(): Promise<Result<CodingEngineStatus, AppError>>;
  stop(): Promise<Result<CodingEngineStatus, AppError>>;
  restart(): Promise<Result<CodingEngineStatus, AppError>>;
  repair(): Promise<Result<CodingEngineStatus, AppError>>;
}

export function createCodingEngineService(
  workspaceRepo: WorkspaceRepository,
  auditRepo: AuditRepository,
  runtime: CodingEngineRuntimePort,
): CodingEngineService {
  let status: CodingEngineStatus = unavailableStatus(null);
  let busy = false;

  const withLifecycle = async (
    operation: 'start' | 'stop' | 'restart' | 'repair',
    action: () => Promise<Result<CodingEngineStatus, AppError>>,
  ): Promise<Result<CodingEngineStatus, AppError>> => {
    if (busy) return err(codingEngineRuntimeFailureAppError('CODING_ENGINE_LIFECYCLE_BUSY'));
    busy = true;
    try {
      return await action();
    } finally {
      busy = false;
    }
  };

  const startForWorkspace = async (workspace: Workspace): Promise<Result<CodingEngineStatus, AppError>> => {
    const context = contextFromWorkspace(workspace);
    if (status.state === 'ready' && status.workspaceId === workspace.id) return ok(status);
    if (status.state === 'ready' && status.workspaceId !== workspace.id) {
      await runtime.stop();
    }

    appendAudit(auditRepo, 'coding_engine.start.requested', workspace.id, 'OK', { operation: 'start' });
    status = { engine: 'serena', state: 'starting', workspaceId: workspace.id, failure: null };
    try {
      const health = await runtime.start(context);
      status = readyStatus(workspace.id, health);
      appendAudit(auditRepo, 'coding_engine.ready', workspace.id, 'OK', { operation: 'start' });
      return ok(status);
    } catch (error) {
      const failure = normalizeRuntimeFailure(error, 'CODING_ENGINE_START_FAILED');
      status = failedStatus(workspace.id, failure);
      appendAudit(auditRepo, 'coding_engine.failed', workspace.id, failure.code, {
        operation: 'start',
        failureCode: failure.code,
      });
      return err(codingEngineRuntimeFailureAppError(failure.code));
    }
  };

  return {
    getStatus(): CodingEngineStatus {
      return status;
    },

    async start(): Promise<Result<CodingEngineStatus, AppError>> {
      return withLifecycle('start', async () => {
        const workspace = activeWorkspace(workspaceRepo);
        if (!workspace) {
          const failure = new CodingEngineRuntimeFailure('CODING_ENGINE_WORKSPACE_NOT_SELECTED');
          status = failedStatus(null, failure);
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
        return startForWorkspace(workspace);
      });
    },

    async stop(): Promise<Result<CodingEngineStatus, AppError>> {
      return withLifecycle('stop', async () => {
        if (status.state === 'unavailable' && status.workspaceId === null) return ok(status);
        const workspaceId = status.workspaceId;
        appendAudit(auditRepo, 'coding_engine.stop.requested', workspaceId, 'OK', { operation: 'stop' });
        try {
          await runtime.stop();
          status = unavailableStatus(null);
          appendAudit(auditRepo, 'coding_engine.stopped', workspaceId, 'OK', { operation: 'stop' });
          return ok(status);
        } catch (error) {
          const failure = normalizeRuntimeFailure(error, 'CODING_ENGINE_STOP_FAILED');
          status = failedStatus(workspaceId, failure);
          appendAudit(auditRepo, 'coding_engine.failed', workspaceId, failure.code, {
            operation: 'stop',
            failureCode: failure.code,
          });
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
      });
    },

    async restart(): Promise<Result<CodingEngineStatus, AppError>> {
      return withLifecycle('restart', async () => {
        const workspace = activeWorkspace(workspaceRepo);
        if (!workspace) {
          const failure = new CodingEngineRuntimeFailure('CODING_ENGINE_WORKSPACE_NOT_SELECTED');
          status = failedStatus(null, failure);
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
        appendAudit(auditRepo, 'coding_engine.restart.requested', workspace.id, 'OK', { operation: 'restart' });
        try {
          await runtime.stop();
          status = unavailableStatus(null);
        } catch (error) {
          const failure = normalizeRuntimeFailure(error, 'CODING_ENGINE_STOP_FAILED');
          status = failedStatus(workspace.id, failure);
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
        return startForWorkspace(workspace);
      });
    },

    async repair(): Promise<Result<CodingEngineStatus, AppError>> {
      return withLifecycle('repair', async () => {
        const workspace = activeWorkspace(workspaceRepo);
        if (!workspace) {
          const failure = new CodingEngineRuntimeFailure('CODING_ENGINE_WORKSPACE_NOT_SELECTED');
          status = failedStatus(null, failure);
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
        appendAudit(auditRepo, 'coding_engine.repair.requested', workspace.id, 'OK', { operation: 'repair' });
        try {
          const health = await runtime.repair(contextFromWorkspace(workspace));
          status = readyStatus(workspace.id, health);
          appendAudit(auditRepo, 'coding_engine.ready', workspace.id, 'OK', { operation: 'repair' });
          return ok(status);
        } catch (error) {
          const failure = normalizeRuntimeFailure(error, 'CODING_ENGINE_REPAIR_FAILED');
          status = failedStatus(workspace.id, failure);
          appendAudit(auditRepo, 'coding_engine.failed', workspace.id, failure.code, {
            operation: 'repair',
            failureCode: failure.code,
          });
          return err(codingEngineRuntimeFailureAppError(failure.code));
        }
      });
    },
  };
}

function unavailableStatus(workspaceId: string | null): CodingEngineStatus {
  return { engine: 'serena', state: 'unavailable', workspaceId, failure: null };
}

function readyStatus(workspaceId: string, _health: CodingEngineRuntimeHealth): CodingEngineStatus {
  return { engine: 'serena', state: 'ready', workspaceId, failure: null };
}

function failedStatus(
  workspaceId: string | null,
  failure: CodingEngineRuntimeFailure,
): CodingEngineStatus {
  const appError = codingEngineRuntimeFailureAppError(failure.code);
  return {
    engine: 'serena',
    state: failure.code === 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE' ? 'unavailable' : 'needs_repair',
    workspaceId,
    failure: appError,
  };
}

function normalizeRuntimeFailure(
  error: unknown,
  fallback: CodingEngineFailureCode,
): CodingEngineRuntimeFailure {
  if (error instanceof CodingEngineRuntimeFailure) return error;
  return new CodingEngineRuntimeFailure(fallback);
}

function activeWorkspace(workspaceRepo: WorkspaceRepository): Workspace | undefined {
  return workspaceRepo.list().find((workspace) => workspace.isActive);
}

function contextFromWorkspace(workspace: Workspace): CodingEngineWorkspaceContext {
  return {
    workspaceId: workspace.id,
    canonicalRoot: workspace.canonicalRoot,
    projectName: path.basename(workspace.canonicalRoot),
  };
}

function appendAudit(
  auditRepo: AuditRepository,
  action: string,
  workspaceId: string | null,
  resultCode: string,
  metadata: Record<string, string>,
): void {
  auditRepo.append({
    timestamp: new Date(),
    sessionId: DESKTOP_SESSION.id,
    sessionType: DESKTOP_SESSION.type,
    action,
    ...(workspaceId ? { workspaceId } : {}),
    resultCode,
    durationMs: 0,
    metadata: { engine: 'serena', ...metadata },
  });
}
