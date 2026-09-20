import { spawn, spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const EXPECTED_SERVER_NAME = 'SUD-D';
const EXPECTED_TOOL_SURFACE_VERSION = '2026.9.14';
const EXPECTED_TOOL_COUNT = 39;
const REQUIRED_GIT_TOOLS = [
  'git.inspect',
  'git.init',
  'git.remote.configure',
  'git.remote.select',
  'git.branch.create',
  'git.branch.switch',
  'git.branch.merge',
  'git.branch.delete',
  'git.fetch',
  'git.sync',
  'git.push',
  'git.clone',
];

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--tag', '--revision', '--dist-dir'].includes(key) || typeof value !== 'string') {
      throw new Error('Usage: verify-windows-release.mjs --tag vX.Y.Z --revision <40-char-sha> [--dist-dir <path>]');
    }
    values[key] = value;
  }
  if (!values['--tag'] || !values['--revision']) {
    throw new Error('Release tag and revision are required.');
  }
  return values;
}

function parseLatestYml(raw) {
  const version = raw.match(/^version:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();
  const artifactPath = raw.match(/^path:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1]?.trim();
  return { version, artifactPath };
}

async function requireFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) throw new Error(`Missing release file: ${filePath}`);
}

async function probePackagedApp({ executablePath, resourcesPath, expectedVersion, expectedRevision }) {
  const code = [
    "const fs=require('fs');const path=require('path');",
    "const resources=process.env.SUD_D_PROBE_RESOURCES;",
    "const pkg=JSON.parse(fs.readFileSync(path.join(resources,'app.asar','package.json'),'utf8'));",
    "const main=fs.readFileSync(path.join(resources,'app.asar','dist-electron','main.js'),'utf8');",
    "process.stdout.write(JSON.stringify({version:pkg.version,revisionPresent:main.includes(process.env.SUD_D_PROBE_REVISION)}));",
  ].join('');
  const result = spawnSync(executablePath, ['-e', code], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SUD_D_PROBE_RESOURCES: resourcesPath,
      SUD_D_PROBE_REVISION: expectedRevision,
    },
  });
  if (result.status !== 0) throw new Error('Packaged app metadata probe failed.');
  const metadata = JSON.parse(result.stdout);
  if (metadata.version !== expectedVersion || metadata.revisionPresent !== true) {
    throw new Error('Packaged app Version/Revision does not match the release candidate.');
  }
}

async function probeGateway({ executablePath, entryPath }) {
  const child = spawn(executablePath, [entryPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  const responses = new Map();
  const waiters = new Map();

  lines.on('line', (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message?.id === undefined) return;
    const waiter = waiters.get(message.id);
    if (waiter) {
      waiters.delete(message.id);
      waiter(message);
    } else {
      responses.set(message.id, message);
    }
  });

  const waitFor = (id) => new Promise((resolveMessage, reject) => {
    const ready = responses.get(id);
    if (ready) {
      responses.delete(id);
      resolveMessage(ready);
      return;
    }
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error('Packaged MCP probe timed out.'));
    }, 15_000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolveMessage(message);
    });
  });

  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);

  try {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'sud-d-release-verifier', version: '1' },
      },
    });
    const initialized = await waitFor(1);
    const info = initialized?.result?.serverInfo;
    const listChanged = initialized?.result?.capabilities?.tools?.listChanged;
    if (
      info?.name !== EXPECTED_SERVER_NAME
      || info?.version !== EXPECTED_TOOL_SURFACE_VERSION
      || listChanged !== false
    ) {
      throw new Error('Packaged MCP server identity/capabilities are invalid.');
    }

    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const listed = await waitFor(2);
    const names = listed?.result?.tools?.map((tool) => tool.name);
    if (!Array.isArray(names) || names.length !== EXPECTED_TOOL_COUNT) {
      throw new Error('Packaged MCP tool count is invalid.');
    }
    for (const tool of REQUIRED_GIT_TOOLS) {
      if (!names.includes(tool)) throw new Error(`Packaged MCP tool is missing: ${tool}`);
    }
  } finally {
    lines.close();
    child.kill();
  }
}

export async function verifyWindowsRelease({ repoRoot, tag, revision, distDir }) {
  const versionMatch = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(tag);
  if (!versionMatch) throw new Error('Release tag must be strict vX.Y.Z SemVer.');
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error('Release revision must be a full Git SHA.');
  const version = versionMatch[1];

  const desktopPackage = JSON.parse(await readFile(resolve(repoRoot, 'packages/desktop/package.json'), 'utf8'));
  if (desktopPackage.version !== version) throw new Error('Release tag does not match desktop package version.');

  const root = resolve(repoRoot, distDir ?? 'dist-release');
  const installerName = `SUD-D-Setup-${version}.exe`;
  const installerPath = resolve(root, installerName);
  const blockmapPath = resolve(root, `${installerName}.blockmap`);
  const latestPath = resolve(root, 'latest.yml');
  await Promise.all([requireFile(installerPath), requireFile(blockmapPath), requireFile(latestPath)]);

  const latest = parseLatestYml(await readFile(latestPath, 'utf8'));
  if (latest.version !== version || latest.artifactPath !== installerName) {
    throw new Error('latest.yml Version/artifact path does not match the release candidate.');
  }

  const unpacked = resolve(root, 'win-unpacked');
  const executablePath = resolve(unpacked, 'SUD-D.exe');
  const resourcesPath = resolve(unpacked, 'resources');
  const gatewayEntry = resolve(resourcesPath, 'mcp-gateway/dist/stdio-entry.js');
  await Promise.all([requireFile(executablePath), requireFile(gatewayEntry)]);

  await probePackagedApp({ executablePath, resourcesPath, expectedVersion: version, expectedRevision: revision });
  await probeGateway({ executablePath, entryPath: gatewayEntry });

  return { version, revision, toolCount: EXPECTED_TOOL_COUNT };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await verifyWindowsRelease({
      repoRoot: process.cwd(),
      tag: args['--tag'],
      revision: args['--revision'].toLowerCase(),
      distDir: args['--dist-dir'],
    });
    process.stdout.write(`Verified Windows release v${result.version}: revision + ${result.toolCount}-tool MCP surface.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Windows release verification failed.'}\n`);
    process.exitCode = 1;
  }
}
