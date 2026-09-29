import {
  ConnectionRestartInputSchema,
  ConnectionStartInputSchema,
  ConnectionStopInputSchema,
  DesktopConnectionCredentialRemoveInputSchema,
  DesktopConnectionCredentialSetupInputSchema,
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

export interface CredentialClipboard {
  readText(): string;
  clear(): void;
}

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
  credentialClipboard?: CredentialClipboard,
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

  if (credentialClipboard) {
    ipcMain.handle(IPC_CHANNELS.CONNECTION_CREDENTIAL_CLIPBOARD_IMPORT, (event, raw) => {
      if (!isSenderValid(event.sender)) return invalidSender();
      const parsed = DesktopConnectionCredentialSetupInputSchema.safeParse(raw);
      if (!parsed.success) return validationError('Invalid Runtime API Key import request');
      const snapshot = controller.getSnapshot();
      if (!snapshot.ok) return ipcResult(snapshot);
      if (snapshot.value.profile?.profileId !== parsed.data.profileId) {
        return validationError('Connection profile not found');
      }
      if (snapshot.value.runtime.state !== 'stopped') {
        return validationError('Disconnect ChatGPT before changing the Runtime API Key.');
      }
      let credential: Buffer | null = null;
      try {
        const copied = credentialClipboard.readText().trim();
        if (!copied || copied.length > 1280 || Array.from(copied).some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        })) {
          return validationError('Copy a single API Key before saving.');
        }
        credential = Buffer.from(copied, 'utf16le');
        credentialClipboard.clear();
        const result = controller.setupCredentialBuffer(parsed.data, credential);
        return ipcResult(result);
      } catch {
        return validationError('Runtime API Key could not be saved. Copy the key and try again.');
      } finally {
        credential?.fill(0);
      }
    });
  }

  ipcMain.handle(IPC_CHANNELS.CONNECTION_CREDENTIAL_REMOVE, (event, raw) => {
    if (!isSenderValid(event.sender)) return invalidSender();
    const parsed = DesktopConnectionCredentialRemoveInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Runtime API Key remove request');
    return ipcResult<DesktopConnectionSnapshotDto>(controller.removeCredential(parsed.data));
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
