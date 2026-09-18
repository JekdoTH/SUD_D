import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultUnpackedDir = path.resolve(scriptDir, '../../../dist-release/win-unpacked');
const args = process.argv.slice(2);

let unpackedDir = defaultUnpackedDir;
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== '--unpacked-dir') {
    console.error('Usage: verify-windows-package.mjs [--unpacked-dir <path>]');
    process.exit(2);
  }
  unpackedDir = path.resolve(args[1]);
}

const requiredRuntimeFiles = [
  'mcp-gateway/dist/stdio-entry.js',
  'mcp-gateway/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
];

for (const relativePath of requiredRuntimeFiles) {
  const filePath = path.join(unpackedDir, 'resources', ...relativePath.split('/'));
  try {
    const stat = statSync(filePath);
    if (!stat.isFile() || stat.size === 0) throw new Error('not a non-empty file');
  } catch {
    console.error(`Windows packaged artifact is missing ${relativePath}: ${filePath}`);
    process.exit(1);
  }
}

console.log(`Verified Windows packaged MCP Gateway runtime: ${requiredRuntimeFiles.join(', ')}`);
