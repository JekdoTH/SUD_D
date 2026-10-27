// F2-B2 synthetic owned Job grandchild; must die on Job stop / last handle close.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(path.dirname(stage), 'output');
fs.writeFileSync(path.join(output, 'grandchild-started.txt'), 'grandchild-started\n', { flag: 'wx' });
setInterval(() => undefined, 1000);
