import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export async function bumpVersion({ repoRoot, mode }) {
  if (mode !== 'patch' && mode !== 'minor') {
    throw new Error('Version bump mode must be patch or minor.');
  }
  const packagePath = resolve(repoRoot, 'packages/desktop/package.json');
  const parsed = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof parsed.version !== 'string' || !SEMVER.test(parsed.version)) {
    throw new Error('Desktop package version must be strict SemVer.');
  }
  const [major, minor, patch] = parsed.version.split('.').map(Number);
  const next = mode === 'patch'
    ? `${major}.${minor}.${patch + 1}`
    : `${major}.${minor + 1}.0`;
  parsed.version = next;
  await writeFile(packagePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return next;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  bumpVersion({ repoRoot: process.cwd(), mode: process.argv[2] })
    .then((version) => process.stdout.write(`${version}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Version bump failed.'}\n`); process.exitCode = 1; });
}
