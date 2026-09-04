import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  buildSerenaInstallArgs,
  buildSerenaServerArgs,
  buildUvEnvironment,
  createSerenaSpikePaths,
} from './serena-runtime-spike-harness.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, '../fixtures/serena-runtime-spike-ts');

describe('managed Serena runtime spike prerequisites', () => {
  it('loads the official MCP v2 client and stdio transport', () => {
    expect(Client).toBeTypeOf('function');
    expect(StdioClientTransport).toBeTypeOf('function');
  });

  it('ships a fixture with stable semantic symbols', () => {
    const source = fs.readFileSync(path.join(fixtureRoot, 'src', 'calculator.ts'), 'utf8');
    expect(source).toContain('export function add');
    expect(source).toContain('export class Calculator');
  });

  it('isolates every uv-managed directory under the spike root', () => {
    const paths = createSerenaSpikePaths('C:\\temp\\sud-d-serena-spike');
    const env = buildUvEnvironment(paths);
    expect(env.UV_TOOL_DIR).toBe(paths.toolDir);
    expect(env.UV_TOOL_BIN_DIR).toBe(paths.binDir);
    expect(env.UV_PYTHON_INSTALL_DIR).toBe(paths.pythonDir);
    expect(env.UV_CACHE_DIR).toBe(paths.cacheDir);
  });

  it('pins Serena and Python instead of installing latest', () => {
    expect(buildSerenaInstallArgs()).toEqual([
      'tool', 'install', '--python', '3.13', 'serena-agent==1.7.0',
    ]);
  });

  it('starts a single project over stdio with no dashboard or onboarding', () => {
    expect(buildSerenaServerArgs('C:\\temp\\fixture')).toEqual([
      'start-mcp-server',
      '--project', 'C:\\temp\\fixture',
      '--context', 'desktop-app',
      '--mode', 'no-onboarding',
      '--open-web-dashboard', 'false',
    ]);
  });
});
