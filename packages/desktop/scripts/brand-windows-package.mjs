import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { brandWindowsExecutable } from './windows-branding.mjs';

if (process.argv.length !== 2) throw new Error('brand-windows-package does not accept arguments.');

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptsRoot, '..');
const sourceIconPath = resolve(desktopRoot, 'src/assets/sud-d-app-icon.png');
const executablePath = resolve(desktopRoot, '../../dist-release/win-unpacked/SUD-D.exe');

await brandWindowsExecutable({ executablePath, iconPngPath: sourceIconPath });
