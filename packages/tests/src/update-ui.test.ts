import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { DesktopUpdateStatusDto } from '@sud-d/contracts';
import { presentUpdateStatus } from '../../desktop/src/pages/UpdatePage.js';

const CURRENT_REVISION = '0123456789abcdef0123456789abcdef01234567';
const TARGET_REVISION = 'fedcba9876543210fedcba9876543210fedcba98';

function status(overrides: Partial<DesktopUpdateStatusDto> = {}): DesktopUpdateStatusDto {
  return {
    phase: 'idle',
    currentVersion: '0.1.0',
    currentRevision: CURRENT_REVISION,
    targetVersion: null,
    targetRevision: null,
    progressPercent: null,
    releaseNotes: null,
    errorCode: null,
    ...overrides,
  };
}

describe('Update page presentation', () => {
  it('shows current Version and the seven-character Revision', () => {
    const view = presentUpdateStatus(status());
    expect(view.productVersion).toBe('SUD-D v0.1.0');
    expect(view.revision).toBe('Revision 0123456');
  });

  it('shows exact up-to-date and available copy', () => {
    expect(presentUpdateStatus(status({ phase: 'up_to_date' })).statusText)
      .toBe("You're up to date · v0.1.0");
    expect(presentUpdateStatus(status({ phase: 'available', targetVersion: '0.2.0', targetRevision: TARGET_REVISION })).statusText)
      .toBe('Update available · v0.2.0');
  });

  it('renders release-note categories only when they contain entries', () => {
    const view = presentUpdateStatus(status({
      phase: 'available',
      targetVersion: '0.2.0',
      targetRevision: TARGET_REVISION,
      releaseNotes: { new: ['Installer'], improved: [], fixed: ['Safe verification'] },
    }));
    expect(view.noteSections).toEqual([
      { heading: 'New', items: ['Installer'] },
      { heading: 'Fixed', items: ['Safe verification'] },
    ]);
  });

  it('exposes Download only for available and Restart & Update only for ready', () => {
    expect(presentUpdateStatus(status({ phase: 'available', targetVersion: '0.2.0', targetRevision: TARGET_REVISION })).primaryAction)
      .toBe('download');
    expect(presentUpdateStatus(status({ phase: 'ready', targetVersion: '0.2.0', targetRevision: TARGET_REVISION })).primaryAction)
      .toBe('restart');
    expect(presentUpdateStatus(status({ phase: 'up_to_date' })).primaryAction).toBeNull();
  });

  it.each(['checking', 'downloading', 'verifying'] as const)(
    'disables Check for Updates while phase is %s',
    (phase) => expect(presentUpdateStatus(status({ phase })).checkDisabled).toBe(true),
  );

  it('shows required progress and ready copy', () => {
    expect(presentUpdateStatus(status({ phase: 'downloading', targetVersion: '0.2.0', progressPercent: 64 })).statusText)
      .toBe('Downloading v0.2.0 · 64%');
    expect(presentUpdateStatus(status({ phase: 'verifying', targetVersion: '0.2.0' })).statusText)
      .toBe('Verifying update…');
    expect(presentUpdateStatus(status({ phase: 'ready', targetVersion: '0.2.0' })).statusText)
      .toBe('v0.2.0 is ready');
  });

  it.each([
    ['CHECK_FAILED', "Couldn't check for updates. Your current version is unchanged."],
    ['DOWNLOAD_FAILED', "Couldn't download the update. Your current version is unchanged."],
    ['VERIFY_FAILED', "Update couldn't be verified. SUD-D was not changed."],
    ['INSTALL_FAILED', "SUD-D couldn't start the update. Your current version is unchanged."],
  ] as const)('uses safe fixed copy for %s', (errorCode, copy) => {
    const view = presentUpdateStatus(status({ phase: 'error', errorCode }));
    expect(view.statusText).toBe(copy);
    expect(JSON.stringify(view)).not.toContain('detail');
    expect(JSON.stringify(view)).not.toContain('C:\\');
    expect(JSON.stringify(view)).not.toContain('https://');
  });

  it('adds Update to the existing App shell route without a second router', () => {
    const appSource = readFileSync(new URL('../../desktop/src/App.tsx', import.meta.url), 'utf8');
    expect(appSource).toContain("| 'update'");
    expect(appSource).toContain("{ id: 'update'");
    expect(appSource).toContain("page === 'update' && <UpdatePage />");
    expect(appSource).not.toContain('react-router');
  });

  it('uses only the fixed update bridge and never renders installer paths or URLs', () => {
    const pageSource = readFileSync(new URL('../../desktop/src/pages/UpdatePage.tsx', import.meta.url), 'utf8');
    expect(pageSource).toContain('window.sudD.update.status()');
    expect(pageSource).toContain('window.sudD.update.check()');
    expect(pageSource).toContain('window.sudD.update.download()');
    expect(pageSource).toContain('window.sudD.update.restartAndInstall()');
    expect(pageSource).not.toMatch(/filePath|installerPath|downloadUrl|manifestUrl|https?:\/\//);
  });
});
