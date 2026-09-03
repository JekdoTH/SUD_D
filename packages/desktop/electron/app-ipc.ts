import { IPC_CHANNELS, type IpcResult } from '@sud-d/contracts';

const CHATGPT_WEB_URL = 'https://chatgpt.com/';
const OPENAI_API_KEYS_URL = 'https://platform.openai.com/settings/organization/api-keys';
const OPENAI_TUNNEL_SETTINGS_URL = 'https://platform.openai.com/settings/organization/tunnels';

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

interface FixedExternalAction {
  readonly channel: string;
  readonly url: string;
  readonly failureMessage: string;
}

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
  const fixedExternalActions: FixedExternalAction[] = [
    {
      channel: IPC_CHANNELS.APP_OPEN_CHATGPT_WEB,
      url: CHATGPT_WEB_URL,
      failureMessage: 'Failed to open ChatGPT Web',
    },
    {
      channel: IPC_CHANNELS.APP_OPEN_OPENAI_API_KEYS_PAGE,
      url: OPENAI_API_KEYS_URL,
      failureMessage: 'Failed to open OpenAI API Keys page',
    },
    {
      channel: IPC_CHANNELS.APP_OPEN_OPENAI_TUNNEL_SETTINGS_PAGE,
      url: OPENAI_TUNNEL_SETTINGS_URL,
      failureMessage: 'Failed to open OpenAI Tunnel Settings page',
    },
  ];

  for (const action of fixedExternalActions) {
    ipcMain.handle(action.channel, async (event, raw) => {
      if (!isSenderValid(event.sender)) return validationError('Invalid sender');
      if (raw !== undefined) return validationError('Invalid app action');

      try {
        await openExternal(action.url);
        return { ok: true, value: null } satisfies IpcResult<null>;
      } catch {
        return {
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: action.failureMessage },
        } satisfies IpcResult<never>;
      }
    });
  }
}
