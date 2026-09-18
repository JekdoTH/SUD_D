import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.length !== 2) throw new Error('ensure-app-update-config does not accept arguments.');

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptsRoot, '..');
const packageJson = JSON.parse(await readFile(resolve(desktopRoot, 'package.json'), 'utf8'));
const publish = packageJson.build?.publish;

if (
  !Array.isArray(publish)
  || publish.length !== 1
  || publish[0]?.provider !== 'github'
  || publish[0]?.owner !== 'JekdoTH'
  || publish[0]?.repo !== 'SUD_D-Releases'
  || publish[0]?.releaseType !== 'release'
) {
  throw new Error('Unexpected Windows update publish configuration.');
}

const outputPath = resolve(desktopRoot, '../../dist-release/win-unpacked/resources/app-update.yml');
const content = [
  'owner: JekdoTH',
  'repo: SUD_D-Releases',
  'provider: github',
  'releaseType: release',
  "updaterCacheDirName: '@sud-ddesktop-updater'",
  '',
].join('\n');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, 'utf8');
