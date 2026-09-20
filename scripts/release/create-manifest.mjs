import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadReleaseNotes } from './render-release-notes.mjs';

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const REVISION = /^[0-9a-fA-F]{40}$/;

async function sha512File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function requireCleanTrackedWorktree(repoRoot) {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  if (dirty) throw new Error('Release manifest requires a clean tracked worktree.');
}

async function resolveCandidate(repoRoot) {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, 'packages/desktop/package.json'), 'utf8'));
  if (typeof pkg.version !== 'string' || !SEMVER.test(pkg.version)) throw new Error('Desktop package version must be strict SemVer.');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  if (!REVISION.test(revision)) throw new Error('Release revision must be a full Git SHA.');
  const distRoot = resolve(repoRoot, 'dist-release');
  const expectedName = `SUD-D-Setup-${pkg.version}.exe`;
  const matches = (await readdir(distRoot)).filter((name) => name === expectedName);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${expectedName} in dist-release/.`);
  return {
    version: pkg.version,
    revision: revision.toLowerCase(),
    artifactFileName: expectedName,
    artifactPath: resolve(distRoot, expectedName),
  };
}

export async function createReleaseManifest({ repoRoot, releaseNotesPath, privateKeyFile, now = new Date() }) {
  requireCleanTrackedWorktree(repoRoot);
  const candidate = await resolveCandidate(repoRoot);
  const releaseNotes = await loadReleaseNotes({ repoRoot, releaseNotesPath });
  const artifactSha512 = await sha512File(candidate.artifactPath);
  const keyPath = privateKeyFile;
  if (typeof keyPath !== 'string' || keyPath.length === 0) throw new Error('Release private key file is required.');
  const privateKey = createPrivateKey(await readFile(keyPath, 'utf8'));

  const payload = {
    schemaVersion: 1,
    version: candidate.version,
    revision: candidate.revision,
    releaseDate: now.toISOString(),
    channel: 'latest',
    artifactFileName: candidate.artifactFileName,
    artifactSha512,
    releaseNotes,
  };
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const envelope = {
    payload: payloadBytes.toString('base64url'),
    signature: sign(null, payloadBytes, privateKey).toString('base64url'),
  };
  const manifestPath = resolve(repoRoot, 'dist-release/sud-d-release.json');
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return { manifestPath, payload };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const privateKeyFile = process.env.SUD_D_RELEASE_PRIVATE_KEY_FILE;
  createReleaseManifest({ repoRoot: process.cwd(), releaseNotesPath: process.argv[2], privateKeyFile })
    .then(({ manifestPath, payload }) => process.stdout.write(`Wrote ${relative(process.cwd(), manifestPath)} for v${payload.version}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Release manifest failed.'}\n`); process.exitCode = 1; });
}
