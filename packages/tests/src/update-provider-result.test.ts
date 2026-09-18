import { describe, expect, it } from 'vitest';

import { normalizeElectronUpdateCheckResult } from '../../desktop/electron/update-provider-result';

describe('normalizeElectronUpdateCheckResult', () => {
  it('reports no update when electron-updater says the latest version is already installed', () => {
    expect(normalizeElectronUpdateCheckResult({
      isUpdateAvailable: false,
      updateInfo: { version: '0.1.0' },
    })).toEqual({ available: false });
  });

  it('reports an available update only when electron-updater marks it available', () => {
    expect(normalizeElectronUpdateCheckResult({
      isUpdateAvailable: true,
      updateInfo: { version: '0.1.1' },
    })).toEqual({
      available: true,
      info: { version: '0.1.1' },
    });
  });

  it('fails closed when an available result has no version', () => {
    expect(normalizeElectronUpdateCheckResult({
      isUpdateAvailable: true,
      updateInfo: {},
    })).toEqual({ available: false });
  });
});
