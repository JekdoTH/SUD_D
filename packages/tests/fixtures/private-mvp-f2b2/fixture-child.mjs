// F2-B2 synthetic owned Job child; only root->child->grandchild.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(path.dirname(stage), 'output');
fs.writeFileSync(path.join(output, 'child-started.txt'), 'child-started\n', { flag: 'wx' });
spawn(process.execPath, [path.join(stage, 'fixture-grandchild.mjs')], {
  cwd: stage, stdio: 'ignore', windowsHide: true, detached: false,
}).unref();
setInterval(() => undefined, 1000);
