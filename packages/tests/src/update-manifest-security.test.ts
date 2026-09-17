import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha512FileHex, verifyReleaseEnvelope } from '../../desktop/electron/update-manifest.js';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();
const REVISION = '0123456789abcdef0123456789abcdef01234567';
const HASH = 'a'.repeat(128);

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    version: '0.2.0',
    revision: REVISION,
    releaseDate: '2026-09-17T12:34:56.000Z',
    channel: 'latest',
    artifactFileName: 'SUD-D Setup 0.2.0.exe',
    artifactSha512: HASH,
    releaseNotes: { new: ['Signed updates'], improved: [], fixed: [] },
    ...overrides,
  };
}

function signedEnvelope(value: Record<string, unknown> = payload()) {
  const bytes = Buffer.from(JSON.stringify(value), 'utf8');
  return {
    payload: bytes.toString('base64url'),
    signature: sign(null, bytes, privateKey).toString('base64url'),
  };
}

describe('signed release manifest verification', () => {
  it('accepts an Ed25519 signature over the exact manifest payload bytes', () => {
    const result = verifyReleaseEnvelope(signedEnvelope(), publicKeyPem);

    expect(result).toEqual({ ok: true, value: payload() });
  });

  it('fails closed for payload or signature mutation', () => {
    const envelope = signedEnvelope();
    const mutatedPayload = Buffer.from(envelope.payload, 'base64url');
    mutatedPayload[0] ^= 1;
    const mutatedSignature = Buffer.from(envelope.signature, 'base64url');
    mutatedSignature[0] ^= 1;

    expect(verifyReleaseEnvelope({ ...envelope, payload: mutatedPayload.toString('base64url') }, publicKeyPem))
      .toEqual({ ok: false, code: 'VERIFY_FAILED' });
    expect(verifyReleaseEnvelope({ ...envelope, signature: mutatedSignature.toString('base64url') }, publicKeyPem))
      .toEqual({ ok: false, code: 'VERIFY_FAILED' });
  });

  it.each([
    ['unsupported schema version', { schemaVersion: 2 }],
    ['non-latest channel', { channel: 'beta' }],
    ['artifact filename with separators', { artifactFileName: 'downloads/setup.exe' }],
    ['malformed SHA-512', { artifactSha512: 'A'.repeat(128) }],
    ['malformed SemVer', { version: 'v0.2.0' }],
    ['malformed Git revision', { revision: 'g'.repeat(40) }],
  ])('fails closed for %s', (_label, invalid) => {
    expect(verifyReleaseEnvelope(signedEnvelope(payload(invalid)), publicKeyPem))
      .toEqual({ ok: false, code: 'VERIFY_FAILED' });
  });

  it('returns only the safe error code without payload, signature, path, or key material', () => {
    const secretPayload = 'C:\\Users\\owner\\release-secret.json';
    const secretSignature = 'signature-should-not-leak';
    const secretKey = 'public-key-should-not-leak';
    const result = verifyReleaseEnvelope({ payload: secretPayload, signature: secretSignature }, secretKey);

    expect(result).toEqual({ ok: false, code: 'VERIFY_FAILED' });
    expect(JSON.stringify(result)).not.toContain(secretPayload);
    expect(JSON.stringify(result)).not.toContain(secretSignature);
    expect(JSON.stringify(result)).not.toContain(secretKey);
  });

  it('hashes installer files with the exposed SHA-512 helper', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sud-d-update-manifest-'));
    const filePath = join(directory, 'SUD-D Setup 0.2.0.exe');
    await writeFile(filePath, 'trusted installer bytes');

    await expect(sha512FileHex(filePath)).resolves.toBe(
      'b3bbc495b1da9f5fae14d10105c09788916dfa11245515386ef7c2d33858acbbb5a358c85716fa5964bda877f2b724bbf4b53c8516e9d8f7f3d9c878ead87ec8',
    );
  });
});
