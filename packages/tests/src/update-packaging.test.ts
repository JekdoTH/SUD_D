import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const rootPackage = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as Record<string, any>;
const desktopPackage = JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as Record<string, any>;
const viteSource = readFileSync(new URL('../../desktop/vite.config.ts', import.meta.url), 'utf8');

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

describe('Windows update packaging configuration', () => {
  it('uses a per-user NSIS installer without normal elevation', () => {
    expect(desktopPackage.build.win.target).toContain('nsis');
    expect(desktopPackage.build.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
    });
    expect(desktopPackage.build.artifactName).toBe('SUD-D Setup ${version}.${ext}');
  });

  it('keeps unsigned Personal Alpha packaging independent of winCodeSign resource editing', () => {
    expect(desktopPackage.build.win.signAndEditExecutable).toBe(false);
  });

  it('publishes metadata only to the fixed public release repository', () => {
    expect(desktopPackage.build.publish).toEqual([{
      provider: 'github',
      owner: 'JekdoTH',
      repo: 'SUD_D-Releases',
      releaseType: 'release',
    }]);
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
