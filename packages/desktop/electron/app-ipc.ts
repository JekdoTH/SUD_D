import { IPC_CHANNELS, type IpcResult } from '@sud-d/contracts';

const CHATGPT_WEB_URL = 'https://chatgpt.com/';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface AppIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type AppIpcSenderValidator = (sender: unknown) => boolean;
export type ExternalUrlOpener = (url: string) => Promise<void>;

function validationError(message: string): IpcResult<never> {
  return {
    ok: false,
    error: { code: 'VALIDATION_FAILED', message },
  };
}

export function registerDesktopAppIpcHandlers(
  ipcMain: AppIpcMain,
  openExternal: ExternalUrlOpener,
  isSenderValid: AppIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.APP_OPEN_CHATGPT_WEB, async (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    if (raw !== undefined) return validationError('Invalid app action');

    try {
      await openExternal(CHATGPT_WEB_URL);
      return { ok: true, value: null } satisfies IpcResult<null>;
    } catch {
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to open ChatGPT Web' },
      } satisfies IpcResult<never>;
    }
  });
}
