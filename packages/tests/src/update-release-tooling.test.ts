import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// @ts-expect-error -- trusted release tooling is intentionally implemented as ESM JavaScript.
import { bumpVersion } from '../../../scripts/release/bump-version.mjs';
// @ts-expect-error -- trusted release tooling is intentionally implemented as ESM JavaScript.
import { createReleaseManifest } from '../../../scripts/release/create-manifest.mjs';
// @ts-expect-error -- trusted release tooling is intentionally implemented as ESM JavaScript.
import { renderReleaseNotes } from '../../../scripts/release/render-release-notes.mjs';
// @ts-expect-error -- trusted release tooling is intentionally implemented as ESM JavaScript.
import { verifyRelease } from '../../../scripts/release/verify-release.mjs';

const SCRIPT_ROOT = resolve(import.meta.dirname, '../../../scripts/release');
const NOTES = {
  new: ['Windows installer and in-app update controls'],
  improved: ['Version and build revision are visible in the Update screen'],
  fixed: [],
};
async function createFixture(version = '0.1.0') {
  const root = await mkdtemp(join(tmpdir(), 'sud-d-release-tooling-'));
  await mkdir(join(root, 'packages', 'desktop'), { recursive: true });
  await mkdir(join(root, 'docs', 'release'), { recursive: true });
  await mkdir(join(root, 'dist-release'), { recursive: true });
  await writeFile(join(root, 'packages', 'desktop', 'package.json'), JSON.stringify({ version }, null, 2));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture User'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  execFileSync('git', ['add', '--', 'packages/desktop/package.json'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

async function writeKey(root: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateKeyFile = join(root, 'release-private-key.pem');
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  await writeFile(privateKeyFile, privatePem);
  return { privateKeyFile, privatePem, publicKey };
}

async function writeCandidate(root: string, version = '0.1.0') {
  await writeFile(join(root, 'docs', 'release', 'release-notes.json'), JSON.stringify(NOTES));
  const installer = join(root, 'dist-release', `SUD-D Setup ${version}.exe`);
  await writeFile(installer, 'candidate installer bytes');
  return installer;
}

describe('trusted release tooling', () => {
  it('bumps patch then minor from the canonical desktop package version', async () => {
    const root = await createFixture('0.1.0');
    await expect(bumpVersion({ repoRoot: root, mode: 'patch' })).resolves.toBe('0.1.1');
    await expect(bumpVersion({ repoRoot: root, mode: 'minor' })).resolves.toBe('0.2.0');
    const pkg = JSON.parse(await readFile(join(root, 'packages', 'desktop', 'package.json'), 'utf8'));
    expect(pkg.version).toBe('0.2.0');
  });

  it('rejects an invalid bump mode', async () => {
    const root = await createFixture();
    await expect(bumpVersion({ repoRoot: root, mode: 'major' })).rejects.toThrow(/patch|minor/);
  });

  it('rejects release notes with unknown keys or non-string entries', async () => {
    const root = await createFixture();
    const notesPath = join(root, 'docs', 'release', 'release-notes.json');
    await writeFile(notesPath, JSON.stringify({ ...NOTES, raw: 'nope' }));
    await expect(renderReleaseNotes({ repoRoot: root, releaseNotesPath: 'docs/release/release-notes.json' })).rejects.toThrow();
    await writeFile(notesPath, JSON.stringify({ new: [42], improved: [], fixed: [] }));
    await expect(renderReleaseNotes({ repoRoot: root, releaseNotesPath: 'docs/release/release-notes.json' })).rejects.toThrow();
  });

  it('refuses manifest creation from a dirty tracked worktree', async () => {
    const root = await createFixture();
    const { privateKeyFile } = await writeKey(root);
    await writeCandidate(root);
    await writeFile(join(root, 'packages', 'desktop', 'package.json'), JSON.stringify({ version: '0.1.1' }));
    await expect(createReleaseManifest({
      repoRoot: root,
      releaseNotesPath: 'docs/release/release-notes.json',
      privateKeyFile,
      now: new Date('2026-09-17T10:00:00.000Z'),
    })).rejects.toThrow(/clean tracked worktree/i);
  });

  it('builds and signs the exact manifest payload from version, HEAD, installer, and notes', async () => {
    const root = await createFixture('0.2.0');
    const installer = await writeCandidate(root, '0.2.0');
    const { privateKeyFile, publicKey } = await writeKey(root);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

    const result = await createReleaseManifest({
      repoRoot: root,
      releaseNotesPath: 'docs/release/release-notes.json',
      privateKeyFile,
      now: new Date('2026-09-17T10:00:00.000Z'),
    });
    const envelope = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    const payloadBytes = Buffer.from(envelope.payload, 'base64url');
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    const expectedHash = createHash('sha512').update(await readFile(installer)).digest('hex');
    expect(payload).toMatchObject({
      schemaVersion: 1,
      version: '0.2.0',
      revision: head,
      releaseDate: '2026-09-17T10:00:00.000Z',
      channel: 'latest',
      artifactFileName: 'SUD-D Setup 0.2.0.exe',
      artifactSha512: expectedHash,
      releaseNotes: NOTES,
    });
    expect(verify(null, payloadBytes, publicKey, Buffer.from(envelope.signature, 'base64url'))).toBe(true);
  });

  it('keeps private key material out of CLI output and manifest JSON', async () => {
    const root = await createFixture('0.2.0');
    await writeCandidate(root, '0.2.0');
    const { privateKeyFile, privatePem } = await writeKey(root);
    const stdout = execFileSync(process.execPath, [join(SCRIPT_ROOT, 'create-manifest.mjs'), 'docs/release/release-notes.json'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SUD_D_RELEASE_PRIVATE_KEY_FILE: privateKeyFile },
    });
    const manifest = await readFile(join(root, 'dist-release', 'sud-d-release.json'), 'utf8');
    expect(stdout).not.toContain(privatePem.trim());
    expect(manifest).not.toContain(privatePem.trim());
  });

  it('independently verifies signature, artifact hash, version, and revision', async () => {
    const root = await createFixture('0.2.0');
    await writeCandidate(root, '0.2.0');
    const { privateKeyFile, publicKey } = await writeKey(root);
    await createReleaseManifest({
      repoRoot: root,
      releaseNotesPath: 'docs/release/release-notes.json',
      privateKeyFile,
      now: new Date('2026-09-17T10:00:00.000Z'),
    });
    const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
    await expect(verifyRelease({ repoRoot: root, publicKeyPem })).resolves.toMatchObject({
      ok: true,
      version: '0.2.0',
    });

    await writeFile(join(root, 'dist-release', 'SUD-D Setup 0.2.0.exe'), 'tampered');
    await expect(verifyRelease({ repoRoot: root, publicKeyPem })).resolves.toMatchObject({ ok: false });
  });

  it('renders Markdown from the same canonical release-note JSON', async () => {
    const root = await createFixture();
    await writeFile(join(root, 'docs', 'release', 'release-notes.json'), JSON.stringify(NOTES));
    const result = await renderReleaseNotes({ repoRoot: root, releaseNotesPath: 'docs/release/release-notes.json' });
    const markdown = await readFile(result.outputPath, 'utf8');
    expect(markdown).toContain('## New');
    expect(markdown).toContain(NOTES.new[0]);
    expect(markdown).toContain('## Improved');
    expect(markdown).not.toContain('## Fixed');
  });

  it('keeps release script inputs and outputs bounded and omits publish authority', async () => {
    const rootPackage = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../package.json'), 'utf8'));
    expect(rootPackage.scripts).toMatchObject({
      'release:bump:patch': 'node scripts/release/bump-version.mjs patch',
      'release:bump:minor': 'node scripts/release/bump-version.mjs minor',
      'release:manifest': 'node scripts/release/create-manifest.mjs docs/release/release-notes.json',
      'release:verify': 'node scripts/release/verify-release.mjs',
    });
    const createSource = await readFile(join(SCRIPT_ROOT, 'create-manifest.mjs'), 'utf8');
    expect(createSource).toContain('SUD_D_RELEASE_PRIVATE_KEY_FILE');
    expect(createSource).not.toMatch(/publish|gh\s+release|github token|GH_TOKEN/i);
    expect(createSource).not.toContain('process.argv[3]');
  });
});
