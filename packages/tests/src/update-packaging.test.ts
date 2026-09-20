import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type RootPackageJson = { scripts: Record<string, string> };
type DesktopPackageJson = {
  version: string;
  scripts: Record<string, string>;
  build: {
    win: { target: string[]; signAndEditExecutable: boolean };
    nsis: {
      oneClick: boolean;
      perMachine: boolean;
      allowElevation: boolean;
      allowToChangeInstallationDirectory: boolean;
      installerIcon: string;
      uninstallerIcon: string;
      installerHeaderIcon: string;
    };
    artifactName: string;
    publish: Array<{ provider: string; owner: string; repo: string; releaseType: string }>;
    files?: unknown[];
    extraResources?: Array<{ from: string; to: string; filter?: string[] }>;
  };
};

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as RootPackageJson;
const desktopPackage = JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as DesktopPackageJson;
const viteSource = readFileSync(new URL('../../desktop/vite.config.ts', import.meta.url), 'utf8');
const brandingPrepareSource = readFileSync(new URL('../../desktop/scripts/prepare-windows-branding.mjs', import.meta.url), 'utf8');
const installerCompatSource = readFileSync(new URL('../../desktop/scripts/windows-installer-compat.nsh', import.meta.url), 'utf8');
const updateConfigSource = readFileSync(new URL('../../desktop/scripts/ensure-app-update-config.mjs', import.meta.url), 'utf8');

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

describe('Windows update packaging configuration', () => {
  it('uses a per-user NSIS installer without normal elevation', () => {
    expect(desktopPackage.build.win.target).toContain('nsis');
    expect(desktopPackage.build.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: false,
    });
    expect(desktopPackage.build.artifactName).toBe('SUD-D-Setup-${version}.${ext}');
  });

  it('keeps unsigned Personal Alpha packaging independent of winCodeSign resource editing', () => {
    expect(desktopPackage.build.win.signAndEditExecutable).toBe(false);
  });

  it('brands the unpacked executable before NSIS and reuses the derived icon for installer surfaces', () => {
    const script = desktopPackage.scripts['package:win'];
    const prepare = 'node ./scripts/prepare-windows-branding.mjs';
    const unpack = 'electron-builder --win --dir --publish never';
    const ensureUpdateConfig = 'node ./scripts/ensure-app-update-config.mjs';
    const brand = 'node ./scripts/brand-windows-package.mjs';
    const installer = 'electron-builder --win nsis --prepackaged ../../dist-release/win-unpacked --publish never';

    expect(script).toContain(prepare);
    expect(script).toContain(unpack);
    expect(script).toContain(ensureUpdateConfig);
    expect(script).toContain(brand);
    expect(script).toContain(installer);
    expect(script.indexOf(prepare)).toBeLessThan(script.indexOf(unpack));
    expect(script.indexOf(unpack)).toBeLessThan(script.indexOf(ensureUpdateConfig));
    expect(script.indexOf(ensureUpdateConfig)).toBeLessThan(script.indexOf(brand));
    expect(script.indexOf(brand)).toBeLessThan(script.indexOf(installer));
    expect(desktopPackage.build.nsis).toMatchObject({
      installerIcon: 'build/sud-d-app-icon.ico',
      uninstallerIcon: 'build/sud-d-app-icon.ico',
      installerHeaderIcon: 'build/sud-d-app-icon.ico',
    });
    expect(brandingPrepareSource).toContain("windows-installer-compat.nsh");
    expect(brandingPrepareSource).toContain("installer.nsh");
    expect(installerCompatSource).toContain('!include "getProcessInfo.nsh"');
    expect(installerCompatSource).toContain("Var pid");
    expect(installerCompatSource).toContain("!macro customCheckAppRunning");
    expect(installerCompatSource).toContain("!insertmacro _CHECK_APP_RUNNING");
    expect(installerCompatSource).toContain('\\\\?\\$INSTDIR\\resources\\mcp-gateway');
  });

  it('ships and verifies the MCP Gateway runtime in Windows resources', () => {
    expect(desktopPackage.build.extraResources).toContainEqual({
      from: 'build/mcp-gateway-runtime',
      to: 'mcp-gateway',
      filter: ['dist/**/*', 'node_modules/**/*', 'package.json'],
    });

    const script = desktopPackage.scripts['package:win'];
    const prepareGateway = 'node ./scripts/prepare-mcp-gateway-runtime.mjs';
    const unpack = 'electron-builder --win --dir --publish never';
    const verifyGateway = 'node ./scripts/verify-windows-package.mjs';
    expect(script).toContain(prepareGateway);
    expect(script).toContain(verifyGateway);
    expect(script.indexOf(prepareGateway)).toBeLessThan(script.indexOf(unpack));
    expect(script.indexOf(unpack)).toBeLessThan(script.indexOf(verifyGateway));
  });

  it('fails artifact verification when the packaged MCP Gateway entrypoint is missing', () => {
    const unpackedDir = mkdtempSync(path.join(tmpdir(), 'sud-d-package-verify-'));
    const verifier = fileURLToPath(new URL('../../desktop/scripts/verify-windows-package.mjs', import.meta.url));
    try {
      const missing = spawnSync(process.execPath, [verifier, '--unpacked-dir', unpackedDir], {
        encoding: 'utf8',
      });
      expect(missing.status).toBe(1);
      expect(missing.stderr).toContain('mcp-gateway/dist/stdio-entry.js');

      const entry = path.join(unpackedDir, 'resources', 'mcp-gateway', 'dist', 'stdio-entry.js');
      mkdirSync(path.dirname(entry), { recursive: true });
      writeFileSync(entry, 'console.error("gateway");\n', 'utf8');

      const nativeBinding = path.join(
        unpackedDir,
        'resources',
        'mcp-gateway',
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node',
      );
      mkdirSync(path.dirname(nativeBinding), { recursive: true });
      writeFileSync(nativeBinding, 'native-binding-fixture', 'utf8');

      const present = spawnSync(process.execPath, [verifier, '--unpacked-dir', unpackedDir], {
        encoding: 'utf8',
      });
      expect(present.status).toBe(0);
    } finally {
      rmSync(unpackedDir, { recursive: true, force: true });
    }
  });

  it('publishes metadata only to the fixed public release repository', () => {
    expect(desktopPackage.build.publish).toEqual([{
      provider: 'github',
      owner: 'JekdoTH',
      repo: 'SUD_D',
      releaseType: 'release',
    }]);
    expect(updateConfigSource).toContain("'repo: SUD_D'");
    expect(updateConfigSource).not.toContain('SUD_D-Releases');
  });

  it('keeps package commands non-publishing and revision-gated', () => {
    expect(desktopPackage.scripts['package:win']).toContain('--publish never');
    expect(desktopPackage.scripts['package:win']).toContain('SUD_D_REQUIRE_BUILD_REVISION=1');
    expect(rootPackage.scripts['package:win']).toBe('pnpm --filter @sud-d/desktop package:win');
    expect(desktopPackage.scripts['package:win']).not.toContain('--publish always');
  });

  it('injects a strict full build revision without runtime Git discovery', () => {
    expect(viteSource).toContain("git', ['-C', repoRoot, 'rev-parse', 'HEAD']");
    expect(viteSource).toContain('__SUD_D_BUILD_REVISION__');
    expect(viteSource).toContain('/^[0-9a-fA-F]{40}$/');
    expect(viteSource).toContain('SUD_D_REQUIRE_BUILD_REVISION');
  });

  it('uses strict SemVer and excludes local user data from package inputs', () => {
    expect(desktopPackage.version).toMatch(SEMVER);
    const files = JSON.stringify(desktopPackage.build.files ?? []);
    expect(files).not.toContain('sud-d.db');
    expect(files).not.toContain('update-state.json');
    expect(files).not.toContain('LOCALAPPDATA');
  });
});
