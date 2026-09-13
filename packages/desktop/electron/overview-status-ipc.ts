import { IPC_CHANNELS, type DesktopOverviewWorkStatusDto, type IpcResult } from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopOverviewStatusController } from './overview-status-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface OverviewStatusIpcMain {
  handle(channel: string, listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown): void;
}

export type OverviewStatusIpcSenderValidator = (sender: unknown) => boolean;

function ipcResult<T>(result: Result<T, AppError>): IpcResult<T> {
  return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
}

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

export function registerDesktopOverviewStatusIpcHandlers(
  ipcMain: OverviewStatusIpcMain,
  controller: DesktopOverviewStatusController,
  isSenderValid: OverviewStatusIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.OVERVIEW_WORK_STATUS, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    if (raw !== undefined) return validationError('Invalid Overview status request');
    return ipcResult<DesktopOverviewWorkStatusDto>(controller.workStatus());
  });
}
