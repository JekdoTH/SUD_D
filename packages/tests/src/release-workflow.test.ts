import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/release-windows.yml', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../../../scripts/release/verify-windows-release.mjs', import.meta.url), 'utf8');
const signingVerifier = readFileSync(new URL('../../../scripts/release/verify-signing-key.mjs', import.meta.url), 'utf8');

describe('Windows release workflow', () => {
  it('runs only from version tags and keeps signing authority in the release job', () => {
    expect(workflow).toContain('tags:');
    expect(workflow).toContain("'v*.*.*'");
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).toContain('environment: release');
    expect(workflow).toContain('SUD_D_RELEASE_PRIVATE_KEY_B64');
    expect(workflow).toContain('contents: write');
    const releaseIndex = workflow.indexOf('\n  release:');
    const secretIndex = workflow.indexOf('SUD_D_RELEASE_PRIVATE_KEY_B64');
    expect(releaseIndex).toBeGreaterThan(0);
    expect(secretIndex).toBeGreaterThan(releaseIndex);
  });

  it('pins the critical GitHub Actions used by the release workflow', () => {
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
    expect(workflow).toMatch(/actions\/upload-artifact@[0-9a-f]{40}/);
    expect(workflow).toMatch(/actions\/download-artifact@[0-9a-f]{40}/);
  });

  it('accepts only strict vX.Y.Z release tags', () => {
    const match = workflow.match(/GITHUB_REF_NAME -notmatch '([^']+)'/);
    expect(match?.[1]).toBeDefined();
    const strictTagPattern = new RegExp(match![1]);

    for (const tag of ['v1.0.0', 'v0.1.3']) {
      expect(strictTagPattern.test(tag), tag).toBe(true);
    }
    for (const tag of ['1.0.0', 'v1.0', 'v1.0.0.0', 'v01.0.0', 'v1.00.0', 'v1.0.00', 'v1.0.0-rc.1', 'v1.0.0+build.1']) {
      expect(strictTagPattern.test(tag), tag).toBe(false);
    }
  });

  it('verifies tag/version/master ancestry and the packaged MCP contract before publishing', () => {
    expect(workflow).toContain('git merge-base --is-ancestor $env:GITHUB_SHA origin/master');
    expect(workflow).toContain('verify-windows-release.mjs');
    expect(verifier).toContain("EXPECTED_TOOL_SURFACE_VERSION = '2026.9.14'");
    expect(verifier).toContain('EXPECTED_TOOL_COUNT = 39');
    for (const name of ['git.fetch', 'git.sync', 'git.push', 'git.branch.merge']) {
      expect(verifier).toContain(`'${name}'`);
    }
    expect(verifier).toContain('listChanged !== false');
  });

  it('compares the release private key to the committed public key without logging key material', () => {
    expect(workflow).toContain('verify-signing-key.mjs');
    expect(signingVerifier).toContain('timingSafeEqual');
    expect(signingVerifier).not.toMatch(/console\.log\([^)]*(privatePem|publicPem)/);
  });
});
