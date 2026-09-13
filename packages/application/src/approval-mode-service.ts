import {
  APPROVAL_MODES,
  appError,
  err,
  ok,
  type AppError,
  type ApprovalMode,
  type Result,
} from '@sud-d/domain';
import type { ApprovalModeRepository } from '@sud-d/infrastructure';

export interface ApprovalModeService {
  get(): Result<ApprovalMode, AppError>;
  set(mode: ApprovalMode): Result<ApprovalMode, AppError>;
}

const APPROVAL_MODE_DESKTOP_SESSION = Object.freeze({ id: 'desktop', type: 'desktop' as const });

export function createApprovalModeService(
  repository: ApprovalModeRepository,
  now: () => Date = () => new Date(),
): ApprovalModeService {
  return Object.freeze({
    get(): Result<ApprovalMode, AppError> {
      try {
        return ok(repository.get());
      } catch {
        return err(appError('INTERNAL_ERROR', 'Approval Mode is unavailable'));
      }
    },

    set(mode: ApprovalMode): Result<ApprovalMode, AppError> {
      if (!APPROVAL_MODES.includes(mode)) {
        return err(appError('VALIDATION_FAILED', 'Approval Mode is invalid'));
      }
      try {
        const changedAt = now();
        const persisted = repository.setAudited(mode, {
          timestamp: changedAt,
          sessionId: APPROVAL_MODE_DESKTOP_SESSION.id,
          sessionType: APPROVAL_MODE_DESKTOP_SESSION.type,
          action: 'approval.mode.changed',
          resultCode: 'OK',
          durationMs: 0,
          metadata: { mode },
        });
        return ok(persisted);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Approval Mode is unavailable'));
      }
    },
  });
}
