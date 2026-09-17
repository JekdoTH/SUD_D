import { createHash, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { z } from 'zod';

const Base64UrlSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
const ReleaseNotesSchema = z.object({
  new: z.array(z.string().min(1).max(1000)).max(50),
  improved: z.array(z.string().min(1).max(1000)).max(50),
  fixed: z.array(z.string().min(1).max(1000)).max(50),
}).strict();

const ReleaseManifestPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.string().regex(/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/),
  revision: z.string().regex(/^[0-9a-fA-F]{40}$/),
  releaseDate: z.string().refine(
    (value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && !Number.isNaN(Date.parse(value))
      && new Date(value).toISOString() === value,
  ),
  channel: z.literal('latest'),
  artifactFileName: z.string().min(1).max(255).refine(
    (value) => value !== '.' && value !== '..' && !/[\\/:\0]/.test(value),
  ),
  artifactSha512: z.string().regex(/^[0-9a-f]{128}$/),
  releaseNotes: ReleaseNotesSchema,
}).strict();

const ReleaseEnvelopeSchema = z.object({
  payload: Base64UrlSchema,
  signature: Base64UrlSchema,
}).strict();

export type VerifiedReleaseManifest = z.infer<typeof ReleaseManifestPayloadSchema>;

export type VerifyReleaseEnvelopeResult =
  | { ok: true; value: VerifiedReleaseManifest }
  | { ok: false; code: 'VERIFY_FAILED' };

function decodeBase64Url(value: string): Buffer | undefined {
  if (value.length % 4 === 1) {
    return undefined;
  }

  try {
    return Buffer.from(value, 'base64url');
  } catch {
    return undefined;
  }
}

export function verifyReleaseEnvelope(raw: unknown, publicKeyPem: string): VerifyReleaseEnvelopeResult {
  const envelope = ReleaseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, code: 'VERIFY_FAILED' };
  }

  const payloadBytes = decodeBase64Url(envelope.data.payload);
  const signatureBytes = decodeBase64Url(envelope.data.signature);
  if (!payloadBytes || !signatureBytes || signatureBytes.length !== 64) {
    return { ok: false, code: 'VERIFY_FAILED' };
  }

  try {
    if (!verify(null, payloadBytes, publicKeyPem, signatureBytes)) {
      return { ok: false, code: 'VERIFY_FAILED' };
    }

    const payload = ReleaseManifestPayloadSchema.safeParse(JSON.parse(payloadBytes.toString('utf8')));
    return payload.success
      ? { ok: true, value: payload.data }
      : { ok: false, code: 'VERIFY_FAILED' };
  } catch {
    return { ok: false, code: 'VERIFY_FAILED' };
  }
}

export async function sha512FileHex(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
