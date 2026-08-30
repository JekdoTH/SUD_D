import {
  ActivityListInputSchema,
  IPC_CHANNELS,
  type DesktopActivityEventDto,
  type DoctorCheckDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopDiagnosticsController } from './diagnostics-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface DiagnosticsIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type DiagnosticsIpcSenderValidator = (sender: unknown) => boolean;

function ipcResult<T>(result: Result<T, AppError>): IpcResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: result.error };
}

function validationError(message: string): IpcResult<never> {
  return {
    ok: false,
    error: { code: 'VALIDATION_FAILED', message },
  };
}

export function registerDesktopDiagnosticsIpcHandlers(
  ipcMain: DiagnosticsIpcMain,
  controller: DesktopDiagnosticsController,
  isSenderValid: DiagnosticsIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.DOCTOR_CHECK, (event) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    return ipcResult<DoctorCheckDto>(controller.checkDoctor());
  });

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_LIST, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = ActivityListInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid activity request');
    return ipcResult<DesktopActivityEventDto[]>(controller.listActivity(parsed.data));
  });
}
