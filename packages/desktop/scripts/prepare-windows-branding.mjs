import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWindowsIconFile } from './windows-branding.mjs';

if (process.argv.length !== 2) throw new Error('prepare-windows-branding does not accept arguments.');

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptsRoot, '..');
const sourceIconPath = resolve(desktopRoot, 'src/assets/sud-d-app-icon.png');
const buildRoot = resolve(desktopRoot, 'build');
const installerIconPath = resolve(buildRoot, 'sud-d-app-icon.ico');
const installerIncludeSourcePath = resolve(scriptsRoot, 'windows-installer-compat.nsh');
const installerIncludePath = resolve(buildRoot, 'installer.nsh');

const approvedPng = await readFile(sourceIconPath);
const installerInclude = await readFile(installerIncludeSourcePath);
const ico = createWindowsIconFile(approvedPng);
await mkdir(buildRoot, { recursive: true });
await writeFile(installerIconPath, ico);
await writeFile(installerIncludePath, installerInclude);
