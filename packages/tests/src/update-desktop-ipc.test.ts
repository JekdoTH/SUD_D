import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { registerDesktopUpdateIpcHandlers } from '../../desktop/electron/update-ipc.js';

import {
  DesktopUpdateStatusDtoSchema,
  IPC_CHANNELS,
  UpdateActionInputSchema,
  UpdateReleaseNotesDtoSchema,
} from '@sud-d/contracts';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function status(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'idle',
    currentVersion: '0.1.0',
    currentRevision: SHA,
    targetVersion: null,
    targetRevision: null,
    progressPercent: null,
    releaseNotes: null,
    errorCode: null,
    ...overrides,
  };
}

describe('Desktop update contracts', () => {
  it('defines only the fixed-purpose update IPC channels', () => {
    expect(IPC_CHANNELS.UPDATE_STATUS).toBe('update:status');
    expect(IPC_CHANNELS.UPDATE_CHECK).toBe('update:check');
    expect(IPC_CHANNELS.UPDATE_DOWNLOAD).toBe('update:download');
    expect(IPC_CHANNELS.UPDATE_RESTART_AND_INSTALL).toBe('update:restart-and-install');
  });
  it('accepts the safe status shape and rejects privilege-shaped extras', () => {
    expect(DesktopUpdateStatusDtoSchema.safeParse(status()).success).toBe(true);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ providerUrl: 'https://example.test' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ filePath: 'C:\\temp\\setup.exe' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ token: 'secret' })).success).toBe(false);
    expect(UpdateActionInputSchema.safeParse({}).success).toBe(true);
    expect(UpdateActionInputSchema.safeParse({ url: 'https://example.test' }).success).toBe(false);
    expect(UpdateActionInputSchema.safeParse({ executable: 'cmd.exe' }).success).toBe(false);
  });

  it('validates phases, strict semver, full revisions, progress, and safe errors', () => {
    for (const phase of ['idle', 'checking', 'up_to_date', 'available', 'downloading', 'verifying', 'ready', 'error', 'unavailable']) {
      expect(DesktopUpdateStatusDtoSchema.safeParse(status({ phase })).success).toBe(true);
    }
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ phase: 'installing' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ currentVersion: 'v0.1.0' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ currentVersion: '0.1' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ currentRevision: 'abcdef0' })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ currentRevision: 'g'.repeat(40) })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ progressPercent: 0 })).success).toBe(true);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ progressPercent: 100 })).success).toBe(true);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ progressPercent: -1 })).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({ progressPercent: 101 })).success).toBe(false);
    for (const errorCode of ['CHECK_FAILED', 'DOWNLOAD_FAILED', 'VERIFY_FAILED', 'INSTALL_FAILED']) {
      expect(DesktopUpdateStatusDtoSchema.safeParse(status({ phase: 'error', errorCode })).success).toBe(true);
    }
  });
  it('bounds release-note arrays and rejects unknown fields', () => {
    expect(UpdateReleaseNotesDtoSchema.safeParse({
      new: ['Windows installer'],
      improved: ['Update diagnostics'],
      fixed: [],
    }).success).toBe(true);
    expect(UpdateReleaseNotesDtoSchema.safeParse({ new: [''], improved: [], fixed: [] }).success).toBe(false);
    expect(UpdateReleaseNotesDtoSchema.safeParse({ new: ['x'.repeat(10000)], improved: [], fixed: [] }).success).toBe(false);
    expect(UpdateReleaseNotesDtoSchema.safeParse({ new: [], improved: [], fixed: [], raw: 'body' }).success).toBe(false);
    expect(DesktopUpdateStatusDtoSchema.safeParse(status({
      phase: 'available',
      targetVersion: '0.2.0',
      targetRevision: SHA.toUpperCase(),
      releaseNotes: { new: ['Installer'], improved: [], fixed: [] },
    })).success).toBe(true);
  });
});


describe('Desktop update provider security', () => {
  it('keeps the real updater fixed-purpose, manual, and token-free', () => {
    const source = readFileSync(new URL('../../desktop/electron/update-provider.ts', import.meta.url), 'utf8');
    expect(source).toContain("autoUpdater.autoDownload = false");
    expect(source).toContain("autoUpdater.autoInstallOnAppQuit = false");
    expect(source).toContain("JekdoTH");
    expect(source).toContain("SUD_D-Releases");
    expect(source).toContain("https://github.com/JekdoTH/SUD_D-Releases/releases/latest/download/sud-d-release.json");
    expect(source).not.toContain('GH_TOKEN');
    expect(source).not.toContain('process.env.GH');
    expect(source).not.toMatch(/providerUrl|rendererUrl|input\.url/);
  });
});

describe('Desktop update IPC boundary', () => {
  function harness(senderValid = true) {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const ipcMain = { handle: (channel: string, listener: (event: { sender: unknown }, raw?: unknown) => unknown) => handlers.set(channel, listener) };
    const controller = {
      getStatus: () => status(),
      check: async () => ({ ok: true as const, value: status({ phase: 'up_to_date' }) }),
      download: async () => ({ ok: true as const, value: status({ phase: 'ready', targetVersion: '0.2.0', targetRevision: SHA }) }),
      restartAndInstall: async () => ({ ok: true as const, value: null }),
      checkOnStartup: () => undefined,
    };
    registerDesktopUpdateIpcHandlers(ipcMain, controller, () => senderValid);
    return handlers;
  }

  it('rejects invalid senders and any update action input', async () => {
    const invalid = harness(false);
    await expect(invalid.get(IPC_CHANNELS.UPDATE_CHECK)?.({ sender: {} })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const valid = harness(true);
    await expect(valid.get(IPC_CHANNELS.UPDATE_DOWNLOAD)?.({ sender: {} }, { url: 'https://example.test' })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('validates controller status before returning it to renderer', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const ipcMain = { handle: (channel: string, listener: (event: { sender: unknown }, raw?: unknown) => unknown) => handlers.set(channel, listener) };
    const controller = {
      getStatus: () => ({ ...status(), filePath: 'C:\\secret\\setup.exe' }),
      check: async () => ({ ok: true as const, value: status() }),
      download: async () => ({ ok: true as const, value: status() }),
      restartAndInstall: async () => ({ ok: true as const, value: null }),
      checkOnStartup: () => undefined,
    };
    registerDesktopUpdateIpcHandlers(ipcMain, controller as never, () => true);
    expect(handlers.get(IPC_CHANNELS.UPDATE_STATUS)?.({ sender: {} })).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('preload exposes exactly four fixed update methods without raw ipcRenderer', () => {
    const source = readFileSync(new URL('../../desktop/electron/preload.ts', import.meta.url), 'utf8');
    expect(source).toContain('update: {');
    for (const name of ['status', 'check', 'download', 'restartAndInstall']) expect(source).toContain(`${name}:`);
    expect(source).not.toContain('update: ipcRenderer');
    expect(source).not.toMatch(/update:\s*\{[^}]*url:/s);
  });
});