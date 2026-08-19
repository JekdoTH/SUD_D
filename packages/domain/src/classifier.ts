import type { Sensitivity } from './types.js';

// ---------------------------------------------------------------------------
// Credential path patterns
// ---------------------------------------------------------------------------

// Filenames exempt from credential classification
const ENV_EXEMPTIONS = new Set(['.env.example', '.env.sample', '.env.template']);

// Directory names that make any descendant a credential
const CREDENTIAL_DIRS = new Set(['.ssh', '.aws', '.azure', '.kube']);

// Extension-based credential patterns
const CREDENTIAL_EXTENSIONS = new Set(['.pem', '.key', '.pfx', '.p12']);

// Full filename patterns (case-insensitive basename match)
const CREDENTIAL_FILENAMES = [
  /^\.env$/i,
  /^\.env\..+$/i,        // .env.local, .env.production, etc.
  /^\.npmrc$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^credentials\.json$/i,
  /^secrets\.json$/i,
];

/**
 * Classify a relative resource path by sensitivity.
 * Input must be a forward-slash-normalised relative path (no leading slash).
 */
export function classifySensitivity(relativePath: string): Sensitivity {
  const parts = relativePath.split('/');
  const basename = parts[parts.length - 1] ?? '';
  const ext = extname(basename).toLowerCase();

  // Check if any ancestor component is a credential directory
  for (let i = 0; i < parts.length - 1; i++) {
    if (CREDENTIAL_DIRS.has((parts[i] ?? '').toLowerCase())) {
      return 'credential';
    }
  }

  // Basename is a credential directory itself (e.g. ".ssh" as a resource)
  if (CREDENTIAL_DIRS.has(basename.toLowerCase())) {
    return 'credential';
  }

  // Extension check
  if (CREDENTIAL_EXTENSIONS.has(ext)) {
    return 'credential';
  }

  // Filename exemptions before pattern check
  if (ENV_EXEMPTIONS.has(basename.toLowerCase())) {
    return 'normal';
  }

  // Filename pattern check
  for (const pattern of CREDENTIAL_FILENAMES) {
    if (pattern.test(basename)) {
      return 'credential';
    }
  }

  return 'normal';
}

function extname(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0) return '';
  return filename.slice(idx);
}
