import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('public repository readiness scaffolding', () => {
  it('ships the public project, license, security, and contribution documents', () => {
    expect(read('README.md')).toContain('# SUD-D');
    expect(read('LICENSE')).toContain('MIT License');
    expect(read('SECURITY.md')).toMatch(/privat(e|ely)/i);
    expect(read('SECURITY.md')).toMatch(/do \*\*not\*\* include credentials/i);
    expect(read('CONTRIBUTING.md')).toMatch(/maintainer-only/i);
  });

  it('ignores local secrets and tooling state but keeps the update public key trackable', () => {
    const ignore = read('.gitignore');
    for (const entry of ['.serena/', '.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx']) {
      expect(ignore).toContain(entry);
    }
    expect(ignore).toContain('!packages/desktop/release/update-public-key.pem');
  });

  it('keeps private signing material out of the tracked update-key file', () => {
    const publicKey = read('packages/desktop/release/update-public-key.pem');
    expect(publicKey).not.toContain('PRIVATE KEY');
  });

  it('uses neutral device terminology in tracked Markdown documentation', () => {
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
    for (const file of files) {
      expect(read(file)).not.toMatch(/Home[- ]PC|Work[- ]PC/);
    }
  });
});
