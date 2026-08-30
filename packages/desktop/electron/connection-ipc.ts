import {
  ConnectionRestartInputSchema,
  ConnectionStartInputSchema,
  ConnectionStopInputSchema,
  DesktopConnectionPreferencesUpdateInputSchema,
  DesktopConnectionTunnelSetupInputSchema,
  IPC_CHANNELS,
  type DesktopConnectionSnapshotDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Result } from '@sud-d/domain';
import type { DesktopConnectionController } from './connection-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface DesktopIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type DesktopIpcSenderValidator = (sender: unknown) => boolean;

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

function invalidSender(): IpcResult<never> {
  return validationError('Invalid sender');
}

export function registerDesktopConnectionIpcHandlers(
  ipcMain: DesktopIpcMain,
  controller: DesktopConnectionController,
  isSenderValid: DesktopIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.CONNECTION_STATUS, (event) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    return ipcResult(controller.getSnapshot());
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_START, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = ConnectionStartInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid connection start request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.start(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_STOP, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = ConnectionStopInputSchema.safeParse(raw ?? {});
    if (!parsed.success) return validationError('Invalid connection stop request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.stop(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_RESTART, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = ConnectionRestartInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid connection restart request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.restart(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_TUNNEL_SETUP, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = DesktopConnectionTunnelSetupInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Secure Tunnel setup request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.configureTunnel(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = DesktopConnectionPreferencesUpdateInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid connection preferences request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.updatePreferences(parsed.data));
  });
}
