import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function boundedNotesPath(repoRoot, input) {
  if (typeof input !== 'string' || input.length === 0) throw new Error('Release notes path is required.');
  const releaseRoot = resolve(repoRoot, 'docs/release');
  const absolute = resolve(repoRoot, input);
  const rel = relative(releaseRoot, absolute);
  if (rel.startsWith('..') || rel.includes(':') || rel === '') throw new Error('Release notes must be under docs/release/.');
  return absolute;
}

export async function loadReleaseNotes({ repoRoot, releaseNotesPath }) {
  const raw = JSON.parse(await readFile(boundedNotesPath(repoRoot, releaseNotesPath), 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Release notes must be an object.');
  const keys = Object.keys(raw);
  if (keys.length !== 3 || !['new','improved','fixed'].every((key) => keys.includes(key))) throw new Error('Release notes keys are invalid.');
  for (const key of ['new','improved','fixed']) {
    if (!Array.isArray(raw[key]) || raw[key].length > 50 || raw[key].some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 1000)) {
      throw new Error(`Release notes ${key} entries are invalid.`);
    }
  }
  return { new: [...raw.new], improved: [...raw.improved], fixed: [...raw.fixed] };
}

export async function renderReleaseNotes({ repoRoot, releaseNotesPath }) {
  const notes = await loadReleaseNotes({ repoRoot, releaseNotesPath });
  const lines = ['# SUD-D Release Notes', ''];
  for (const [key, heading] of [['new','New'], ['improved','Improved'], ['fixed','Fixed']]) {
    if (notes[key].length === 0) continue;
    lines.push(`## ${heading}`, '');
    for (const item of notes[key]) lines.push(`- ${item}`);
    lines.push('');
  }
  const outputPath = resolve(repoRoot, 'dist-release/RELEASE_NOTES.md');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${lines.join('\n').trimEnd()}\n`, 'utf8');
  return { outputPath, releaseNotes: notes };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  renderReleaseNotes({ repoRoot: process.cwd(), releaseNotesPath: process.argv[2] })
    .then(({ outputPath }) => process.stdout.write(`Wrote ${relative(process.cwd(), outputPath)}\n`))
    .catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : 'Release notes render failed.'}\n`); process.exitCode = 1; });
}
