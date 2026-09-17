import {
  DesktopUpdateStatusDtoSchema,
  IPC_CHANNELS,
  type DesktopUpdateStatusDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { DesktopUpdateController } from './update-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface UpdateIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type UpdateIpcSenderValidator = (sender: unknown) => boolean;

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

function internalError(): IpcResult<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Update status is unavailable.' } };
}

function validatedStatus(result: IpcResult<DesktopUpdateStatusDto>): IpcResult<DesktopUpdateStatusDto> {
  if (!result.ok) return result;
  const parsed = DesktopUpdateStatusDtoSchema.safeParse(result.value);
  return parsed.success ? { ok: true, value: parsed.data } : internalError();
}

function noInput(raw: unknown): IpcResult<null> | undefined {
  return raw === undefined ? undefined : validationError('Invalid update request');
}

export function registerDesktopUpdateIpcHandlers(
  ipcMain: UpdateIpcMain,
  controller: DesktopUpdateController,
  isSenderValid: UpdateIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.UPDATE_STATUS, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const invalid = noInput(raw);
    if (invalid) return invalid;
    try {
      return validatedStatus({ ok: true, value: controller.getStatus() });
    } catch {
      return internalError();
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const invalid = noInput(raw);
    if (invalid) return invalid;
    try {
      return validatedStatus(await controller.check());
    } catch {
      return internalError();
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const invalid = noInput(raw);
    if (invalid) return invalid;
    try {
      return validatedStatus(await controller.download());
    } catch {
      return internalError();
    }
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_RESTART_AND_INSTALL, async (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const invalid = noInput(raw);
    if (invalid) return invalid;
    try {
      const result = await controller.restartAndInstall();
      if (!result.ok) return result;
      return result.value === null ? result : internalError();
    } catch {
      return internalError();
    }
  });
}
