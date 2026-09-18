import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopRoot, '../..');
const runtimeRoot = path.join(desktopRoot, 'build', 'mcp-gateway-runtime');
const entrypoint = path.join(runtimeRoot, 'dist', 'stdio-entry.js');
const electronPackagePath = path.join(desktopRoot, 'node_modules', 'electron', 'package.json');

function runPnpm(args) {
  const pnpmCli = process.env.npm_execpath;
  const command = pnpmCli
    ? process.execPath
    : process.platform === 'win32'
      ? (process.env.ComSpec ?? 'cmd.exe')
      : 'pnpm';
  const commandArgs = pnpmCli
    ? [pnpmCli, '--dir', repoRoot, ...args]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', 'pnpm', '--dir', repoRoot, ...args]
      : ['--dir', repoRoot, ...args];

  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

function assertNoSymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`MCP Gateway runtime contains a non-portable symlink: ${fullPath}`);
    }
    if (stat.isDirectory()) assertNoSymlinks(fullPath);
  }
}

rmSync(runtimeRoot, { recursive: true, force: true });
runPnpm(['--filter', '@sud-d/mcp-gateway...', 'build']);
runPnpm([
  '--ignore-scripts',
  '--config.node-linker=hoisted',
  '--filter',
  '@sud-d/mcp-gateway',
  'deploy',
  '--legacy',
  '--prod',
  runtimeRoot,
]);

const electronVersion = JSON.parse(readFileSync(electronPackagePath, 'utf8')).version;
if (typeof electronVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(electronVersion)) {
  throw new Error('Unable to resolve the installed Electron version for MCP Gateway native rebuild.');
}
runPnpm([
  '--filter',
  '@sud-d/desktop',
  'exec',
  'electron-rebuild',
  '-f',
  '-w',
  'better-sqlite3',
  '-m',
  runtimeRoot,
  '-v',
  electronVersion,
]);

const entryStat = lstatSync(entrypoint);
if (!entryStat.isFile() || entryStat.size === 0) {
  throw new Error('Prepared MCP Gateway runtime is missing dist/stdio-entry.js.');
}
assertNoSymlinks(runtimeRoot);

console.log(`Prepared portable MCP Gateway runtime: ${runtimeRoot}`);
