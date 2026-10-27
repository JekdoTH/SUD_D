// F2-B2 static reviewed synthetic fixture. NEVER execute without separate Owner authorization.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const stage = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(stage);
const output = path.join(root, 'output');
const input = JSON.parse(fs.readFileSync(path.join(stage, 'input.json'), 'utf8'));
if (input.fixtureRevision !== 'f2b2-static-v1' || input.payload !== 'offline fixture') process.exit(62);

const mode = process.argv[2];
if (mode === 'positive') {
  // Parent prepares this owned directory; no general Workspace writes.
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify({ status: 'ok', revision: input.fixtureRevision, payload: input.payload }) + '\n',
    { flag: 'wx' },
  );
} else if (mode === 'tree') {
  fs.writeFileSync(path.join(output, 'root-started.txt'), 'root-started\n', { flag: 'wx' });
  spawn(process.execPath, [path.join(stage, 'fixture-child.mjs')], {
    cwd: stage, stdio: 'ignore', windowsHide: true, detached: false,
  }).unref();
} else if (mode === 'filesystem-denial') {
  // Only synthetic proof-root targets; never user or actual SUD-D private files.
  const targets = ['sentinel-workspace', 'sentinel-other-workspace', 'sentinel-internal', 'sentinel-outside'];
  const results = [];
  for (const name of targets) {
    const target = path.join(root, name, 'protected.txt');
    let readable = false;
    let writable = false;
    try { fs.readFileSync(target); readable = true; } catch {}
    try { fs.writeFileSync(target, 'forbidden overwrite\n', { flag: 'r+' }); writable = true; } catch {}
    results.push({ name, readable, writable });
  }
  fs.writeFileSync(path.join(output, 'filesystem-results.json'), JSON.stringify(results) + '\n', { flag: 'wx' });
} else if (mode === 'network-denial') {
  // This exact endpoint is proposed, not presently approved to contact.
  const tcpDenied = await new Promise((resolve) => {
    const client = net.connect({ host: '127.0.0.1', port: 49371 });
    client.setTimeout(2500);
    client.on('connect', () => { client.destroy(); resolve(false); });
    client.on('error', () => resolve(true));
    client.on('timeout', () => { client.destroy(); resolve(true); });
  });
  let dnsDenied = false;
  try { await dns.lookup('f2b2.invalid'); } catch { dnsDenied = true; }
  fs.writeFileSync(path.join(output, 'network-results.json'), JSON.stringify({ tcpDenied, dnsDenied }) + '\n', { flag: 'wx' });
} else if (mode === 'cpu') {
  // Finite differential Job user-time test, no uncontrolled loop.
  const stopAt = Date.now() + 15000;
  while (Date.now() < stopAt) Math.sqrt(9);
  fs.writeFileSync(path.join(output, 'cpu-complete.txt'), 'cpu-complete\n', { flag: 'wx' });
} else if (mode === 'memory') {
  // Up to 256 MiB allocated, below the 512 MiB production Job cap.
  const chunks = [];
  for (let i = 0; i < 32; i++) {
    const block = Buffer.alloc(8 * 1024 * 1024, 0x5a);
    chunks.push(block);
  }
  fs.writeFileSync(path.join(output, 'memory-complete.txt'), String(chunks.length) + '\n', { flag: 'wx' });
} else if (mode === 'crash') {
  process.exit(51);
} else {
  process.exit(63);
}
