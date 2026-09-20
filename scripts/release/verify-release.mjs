import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const REVISION = /^[0-9a-fA-F]{40}$/;
const SHA512 = /^[0-9a-f]{128}$/;

async function sha512File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function validReleaseNotes(value) {
  if (!hasExactKeys(value, ['new', 'improved', 'fixed'])) return false;
  return ['new', 'improved', 'fixed'].every((key) => Array.isArray(value[key]) && value[key].length <= 50 && value[key].every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 1000));
}

function validPayload(payload) {
  if (!hasExactKeys(payload, ['schemaVersion','version','revision','releaseDate','channel','artifactFileName','artifactSha512','releaseNotes'])) return false;
  if (payload.schemaVersion !== 1 || payload.channel !== 'latest') return false;
  if (!SEMVER.test(payload.version) || !REVISION.test(payload.revision) || !SHA512.test(payload.artifactSha512)) return false;
  if (typeof payload.releaseDate !== 'string' || Number.isNaN(Date.parse(payload.releaseDate))) return false;
  if (typeof payload.artifactFileName !== 'string' || payload.artifactFileName !== `SUD-D-Setup-${payload.version}.exe`) return false;
  return validReleaseNotes(payload.releaseNotes);
}

export async function verifyRelease({ repoRoot, publicKeyPem }) {
  try {
    const manifest = JSON.parse(await readFile(resolve(repoRoot, 'dist-release/sud-d-release.json'), 'utf8'));
    if (!hasExactKeys(manifest, ['payload', 'signature']) || typeof manifest.payload !== 'string' || typeof manifest.signature !== 'string') return { ok: false };
    const payloadBytes = Buffer.from(manifest.payload, 'base64url');
    const signature = Buffer.from(manifest.signature, 'base64url');
    if (!verify(null, payloadBytes, publicKeyPem, signature)) return { ok: false };
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    if (!validPayload(payload)) return { ok: false };
    const pkg = JSON.parse(await readFile(resolve(repoRoot, 'packages/desktop/package.json'), 'utf8'));
    if (pkg.version !== payload.version) return { ok: false };
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim().toLowerCase();
    if (head !== payload.revision.toLowerCase()) return { ok: false };
    const artifactPath = resolve(repoRoot, 'dist-release', payload.artifactFileName);
    if (await sha512File(artifactPath) !== payload.artifactSha512) return { ok: false };
    return { ok: true, version: payload.version, revision: payload.revision, artifactSha512: payload.artifactSha512 };
  } catch {
    return { ok: false };
  }
}

async function readCliPublicKey() {
  const publicKeyFile = process.env.SUD_D_RELEASE_PUBLIC_KEY_FILE;
  if (publicKeyFile) return readFile(publicKeyFile, 'utf8');
  const privateKeyFile = process.env.SUD_D_RELEASE_PRIVATE_KEY_FILE;
  if (!privateKeyFile) throw new Error('SUD_D_RELEASE_PUBLIC_KEY_FILE is required for release verification.');
  const privatePem = await readFile(privateKeyFile, 'utf8');
  return createPublicKey(createPrivateKey(privatePem)).export({ format: 'pem', type: 'spki' }).toString();
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  readCliPublicKey()
    .then((publicKeyPem) => verifyRelease({ repoRoot: process.cwd(), publicKeyPem }))
    .then((result) => { if (!result.ok) throw new Error('Release verification failed.'); process.stdout.write(`Verified v${result.version} ${result.revision}\n`); })
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Release verification failed.'}\n`); process.exitCode = 1; });
}
