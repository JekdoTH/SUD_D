import { createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PUBLIC_KEY = 'packages/desktop/release/update-public-key.pem';

function publicDer(key) {
  return createPublicKey(key).export({ format: 'der', type: 'spki' });
}

export async function verifySigningKeyPair({
  repoRoot,
  privateKeyFile,
  publicKeyFile = resolve(repoRoot, DEFAULT_PUBLIC_KEY),
}) {
  if (typeof privateKeyFile !== 'string' || privateKeyFile.length === 0) {
    throw new Error('Release private key file is required.');
  }

  try {
    const [privatePem, publicPem] = await Promise.all([
      readFile(privateKeyFile, 'utf8'),
      readFile(publicKeyFile, 'utf8'),
    ]);
    const derived = publicDer(createPrivateKey(privatePem));
    const committed = publicDer(publicPem);
    if (derived.length !== committed.length || !timingSafeEqual(derived, committed)) {
      throw new Error('KEY_MISMATCH');
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'KEY_MISMATCH') {
      throw new Error('Release signing private key does not match the committed public key.');
    }
    throw new Error('Release signing key material is missing or invalid.');
  }

  return { ok: true };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const repoRoot = process.cwd();
  const privateKeyFile = process.env.SUD_D_RELEASE_PRIVATE_KEY_FILE;
  const publicKeyFile = process.env.SUD_D_RELEASE_PUBLIC_KEY_FILE
    ? resolve(process.env.SUD_D_RELEASE_PUBLIC_KEY_FILE)
    : resolve(repoRoot, DEFAULT_PUBLIC_KEY);

  verifySigningKeyPair({ repoRoot, privateKeyFile, publicKeyFile })
    .then(() => process.stdout.write('Release signing key identity verified.\n'))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : 'Release signing key verification failed.'}\n`);
      process.exitCode = 1;
    });
}
