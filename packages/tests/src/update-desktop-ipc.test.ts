import { describe, expect, it } from 'vitest';

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
