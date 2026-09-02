import {
  IPC_CHANNELS,
  TeamStatusInputSchema,
  TeamStopInputSchema,
  type DesktopTeamMissionDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopTeamController } from './team-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface TeamIpcMain {
  handle(channel: string, listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown): void;
}

export type TeamIpcSenderValidator = (sender: unknown) => boolean;

function ipcResult<T>(result: Result<T, AppError>): IpcResult<T> {
  return result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error };
}

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

export function registerDesktopTeamIpcHandlers(
  ipcMain: TeamIpcMain,
  controller: DesktopTeamController,
  isSenderValid: TeamIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.TEAM_STATUS, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = TeamStatusInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid Team status request');
    return ipcResult<DesktopTeamMissionDto | null>(controller.status(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.TEAM_STOP, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = TeamStopInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid Team stop request');
    return ipcResult<DesktopTeamMissionDto>(controller.stop(parsed.data));
  });
}
