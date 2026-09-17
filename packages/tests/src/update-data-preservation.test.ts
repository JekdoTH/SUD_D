import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getDataRoot, openDatabase } from '@sud-d/infrastructure';
import { createDesktopUpdateController } from '../../desktop/electron/update-controller.js';
import type { UpdateProvider } from '../../desktop/electron/update-provider.js';

const REVISION = '1111111111111111111111111111111111111111';
const NO_UPDATE_PROVIDER: UpdateProvider = {
  check: async () => ({ available: false }),
  download: async () => { throw new Error('not used'); },
  restartAndInstall: () => { throw new Error('not used'); },
};

describe('update data-preservation boundary', () => {
  it('keeps the SQLite data root outside application resources', async () => {
    const localAppData = await mkdtemp(join(tmpdir(), 'sud-d-data-root-'));
    const previous = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    try {
      const dataRoot = getDataRoot();
      expect(dataRoot).toBe(join(localAppData, 'SUD-D'));
      expect(path.normalize(dataRoot).toLowerCase()).not.toContain(path.normalize('resources').toLowerCase());
      const dbPath = join(dataRoot, 'sud-d.db');
      const db = openDatabase(dbPath);
      db.exec('CREATE TABLE IF NOT EXISTS preservation_probe (id INTEGER PRIMARY KEY)');
      db.close();
      const moved = join(dataRoot, 'sud-d.moved.db');
      renameSync(dbPath, moved);
      expect(readFileSync(moved).byteLength).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.LOCALAPPDATA;
      else process.env.LOCALAPPDATA = previous;
    }
  });

  it('leaves workspace and audit fixtures unchanged during an update check', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sud-d-update-preserve-'));
    const workspacePath = join(root, 'workspace-fixture.json');
    const auditPath = join(root, 'audit-fixture.json');
    const stateFilePath = join(root, 'update-state.json');
    writeFileSync(workspacePath, '{"workspace":"keep"}');
    writeFileSync(auditPath, '{"audit":"keep"}');

    const controller = createDesktopUpdateController({
      currentVersion: '0.1.0',
      currentRevision: REVISION,
      publicKeyPem: 'unused-for-no-update',
      provider: NO_UPDATE_PROVIDER,
      loadSignedManifest: async () => { throw new Error('not used'); },
      orderlyShutdown: async () => undefined,
      isPackaged: true,
      stateFilePath,
    });

    await controller.check();
    expect(readFileSync(workspacePath, 'utf8')).toBe('{"workspace":"keep"}');
    expect(readFileSync(auditPath, 'utf8')).toBe('{"audit":"keep"}');
  });

  it('keeps shutdown ordered before provider installation and closes the DB', () => {
    const mainSource = readFileSync(new URL('../../desktop/electron/main.ts', import.meta.url), 'utf8');
    const controllerSource = readFileSync(new URL('../../desktop/electron/update-controller.ts', import.meta.url), 'utf8');
    const stopIndex = mainSource.indexOf('connectionService.stop()');
    const gitIndex = mainSource.indexOf('await gitController.dispose()');
    const dbIndex = mainSource.indexOf('db.close()');
    expect(stopIndex).toBeGreaterThan(-1);
    expect(gitIndex).toBeGreaterThan(stopIndex);
    expect(dbIndex).toBeGreaterThan(gitIndex);
    expect(controllerSource.indexOf('await deps.orderlyShutdown()')).toBeLessThan(
      controllerSource.indexOf('deps.provider.restartAndInstall()'),
    );
  });

  it('contains no updater failure path that deletes user data or credentials', () => {
    const sources = [
      '../../desktop/electron/update-controller.ts',
      '../../desktop/electron/update-provider.ts',
      '../../desktop/electron/update-ipc.ts',
    ].map((relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')).join('\n');
    for (const forbidden of ['rmSync(', 'unlinkSync(', 'rmdirSync(', 'DROP TABLE', 'removeCredential(', 'deleteCredential(']) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it('does not package the local SUD-D data root', () => {
    const desktopPackage = JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8'));
    const files = JSON.stringify(desktopPackage.build?.files ?? []);
    expect(files).not.toContain('AppData');
    expect(files).not.toContain('sud-d.db');
    expect(files).not.toContain('update-state.json');
    expect(files).not.toContain('LOCALAPPDATA');
  });
});
