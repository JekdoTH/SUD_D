import {
  ApprovalListInputSchema,
  ApprovalRespondInputSchema,
  IPC_CHANNELS,
  type DesktopApprovalRequestDto,
  type DesktopApprovalResponseDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopApprovalController } from './approval-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface ApprovalIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type ApprovalIpcSenderValidator = (sender: unknown) => boolean;

function ipcResult<T>(result: Result<T, AppError>): IpcResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: result.error };
}

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

export function registerDesktopApprovalIpcHandlers(
  ipcMain: ApprovalIpcMain,
  controller: DesktopApprovalController,
  isSenderValid: ApprovalIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.APPROVAL_LIST, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ApprovalListInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid approval list request');
    return ipcResult<DesktopApprovalRequestDto[]>(controller.list(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.APPROVAL_RESPOND, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ApprovalRespondInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid approval decision request');
    return ipcResult<DesktopApprovalResponseDto>(controller.respond(parsed.data));
  });
}
