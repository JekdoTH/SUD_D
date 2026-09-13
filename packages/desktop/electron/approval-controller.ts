import { appError, err, ok, type AppError, type ApprovalRequestRecord, type Result } from '@sud-d/domain';
import type { ApprovalModeService, ApprovalService } from '@sud-d/application';
import type {
  ApprovalListInput,
  ApprovalModeSetInput,
  ApprovalRespondInput,
  DesktopApprovalModeDto,
  DesktopApprovalRequestDto,
  DesktopApprovalResponseDto,
} from '@sud-d/contracts';

export interface DesktopApprovalController {
  list(input: ApprovalListInput): Result<DesktopApprovalRequestDto[], AppError>;
  respond(input: ApprovalRespondInput): Result<DesktopApprovalResponseDto, AppError>;
  getMode(): Result<DesktopApprovalModeDto, AppError>;
  setMode(input: ApprovalModeSetInput): Result<DesktopApprovalModeDto, AppError>;
}

export function createDesktopApprovalController(
  approvalService: ApprovalService,
  approvalModeService: ApprovalModeService,
): DesktopApprovalController {
  return Object.freeze({
    list(input: ApprovalListInput) {
      const result = approvalService.list(input.limit);
      if (!result.ok) return result;
      return ok(result.value.map(toDesktopApprovalRequest));
    },
    respond(input: ApprovalRespondInput) {
      const result = approvalService.respond(input.approvalRequestId, input.decision);
      if (!result.ok) return result;
      if (result.value.status !== 'approved' && result.value.status !== 'denied') {
        return err(appError('APPROVAL_STATE_INVALID', 'Approval decision is unavailable'));
      }
      return ok({
        id: result.value.id,
        status: result.value.status,
        message: result.value.status === 'approved'
          ? 'Approved. Retry the action from the connected AI.'
          : 'Denied. The action will not run.',
      });
    },
    getMode() {
      const result = approvalModeService.get();
      return result.ok ? ok({ mode: result.value }) : result;
    },
    setMode(input: ApprovalModeSetInput) {
      const result = approvalModeService.set(input.mode);
      return result.ok ? ok({ mode: result.value }) : result;
    },
  });
}

function toDesktopApprovalRequest(record: ApprovalRequestRecord): DesktopApprovalRequestDto {
  return {
    id: record.id,
    capability: record.capability,
    effect: record.effect,
    sensitivity: record.sensitivity,
    title: record.title,
    ...(record.resourceLabel ? { resourceLabel: record.resourceLabel } : {}),
    status: 'pending',
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}
