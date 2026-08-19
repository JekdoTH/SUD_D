import type { Result, AppError, Workspace, InternalRoot } from '@sud-d/domain';
import { ok, err, appError } from '@sud-d/domain';
import type { WorkspaceRepository } from '@sud-d/infrastructure';
import type { AuditRepository } from '@sud-d/infrastructure';
import { validateWorkspaceRoot, canonicalizePath } from '@sud-d/infrastructure';
import fs from 'node:fs';

const DESKTOP_SESSION = { id: 'desktop', type: 'desktop' as const };

export interface WorkspaceService {
  list(): Result<Workspace[], AppError>;
  add(displayName: string, rootPath: string): Result<Workspace, AppError>;
  select(workspaceId: string): Result<void, AppError>;
  remove(workspaceId: string): Result<void, AppError>;
}

export function createWorkspaceService(
  workspaceRepo: WorkspaceRepository,
  auditRepo: AuditRepository,
  internalRoots: InternalRoot[],
): WorkspaceService {
  return {
    list(): Result<Workspace[], AppError> {
      try {
        const workspaces = workspaceRepo.list();
        auditRepo.append({
          timestamp: new Date(),
          sessionId: DESKTOP_SESSION.id,
          sessionType: DESKTOP_SESSION.type,
          action: 'workspace:list',
          resultCode: 'OK',
          durationMs: 0,
          metadata: { count: workspaces.length },
        });
        return ok(workspaces);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to list workspaces'));
      }
    },

    add(displayName: string, rootPath: string): Result<Workspace, AppError> {
      const start = Date.now();
      try {
        // Validate root form
        const validRoot = validateWorkspaceRoot(rootPath);
        if (!validRoot.ok) {
          auditRepo.append({
            timestamp: new Date(),
            sessionId: DESKTOP_SESSION.id,
            sessionType: DESKTOP_SESSION.type,
            action: 'workspace:add',
            resultCode: validRoot.error.code,
            durationMs: Date.now() - start,
            metadata: {},
          });
          return validRoot;
        }

        // Existence check
        let stat: fs.Stats;
        try {
          stat = fs.statSync(rootPath);
        } catch {
          return err(appError('WORKSPACE_INVALID', 'Workspace root does not exist'));
        }
        if (!stat.isDirectory()) {
          return err(appError('WORKSPACE_INVALID', 'Workspace root must be a directory'));
        }

        // Canonicalize
        const canonical = canonicalizePath(rootPath);
        if (!canonical.ok) {
          return err(appError('WORKSPACE_INVALID', 'Cannot canonicalize workspace root'));
        }

        // InternalRoot guard
        const ir = internalRoots.find((r) => {
          const rel = canonical.value.toLowerCase();
          const root = r.canonicalPath.toLowerCase();
          return rel === root || rel.startsWith(root + '\\') || rel.startsWith(root + '/');
        });
        if (ir) {
          return err(appError('INTERNAL_PATH_DENIED', `Path conflicts with InternalRoot: ${ir.label}`));
        }

        // Duplicate check
        const existing = workspaceRepo.findByCanonicalRoot(canonical.value);
        if (existing) {
          return err(appError('WORKSPACE_INVALID', 'A workspace with this root is already registered'));
        }

        const ws = workspaceRepo.save(displayName, canonical.value);
        auditRepo.append({
          timestamp: new Date(),
          sessionId: DESKTOP_SESSION.id,
          sessionType: DESKTOP_SESSION.type,
          action: 'workspace:add',
          workspaceId: ws.id,
          resultCode: 'OK',
          durationMs: Date.now() - start,
          metadata: { displayName },
        });
        return ok(ws);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Unexpected error registering workspace'));
      }
    },

    select(workspaceId: string): Result<void, AppError> {
      const start = Date.now();
      try {
        const ws = workspaceRepo.findById(workspaceId);
        if (!ws) {
          return err(appError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`));
        }
        workspaceRepo.setActive(workspaceId);
        auditRepo.append({
          timestamp: new Date(),
          sessionId: DESKTOP_SESSION.id,
          sessionType: DESKTOP_SESSION.type,
          action: 'workspace:select',
          workspaceId,
          resultCode: 'OK',
          durationMs: Date.now() - start,
          metadata: {},
        });
        return ok(undefined);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Unexpected error selecting workspace'));
      }
    },

    remove(workspaceId: string): Result<void, AppError> {
      const start = Date.now();
      try {
        const ws = workspaceRepo.findById(workspaceId);
        if (!ws) {
          return err(appError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} not found`));
        }
        // Remove registration only — never delete project files
        workspaceRepo.remove(workspaceId);
        auditRepo.append({
          timestamp: new Date(),
          sessionId: DESKTOP_SESSION.id,
          sessionType: DESKTOP_SESSION.type,
          action: 'workspace:remove',
          workspaceId,
          resultCode: 'OK',
          durationMs: Date.now() - start,
          metadata: { displayName: ws.displayName },
        });
        return ok(undefined);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Unexpected error removing workspace'));
      }
    },
  };
}
