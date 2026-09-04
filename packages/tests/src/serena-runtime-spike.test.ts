import fs from 'node:fs';
import os from 'node:os';
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
  runSerenaRuntimeSpike,
} from './serena-runtime-spike-harness.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, '../fixtures/serena-runtime-spike-ts');
const liveSpikeEnabled = process.platform === 'win32' && process.env.SUD_D_SERENA_SPIKE === '1';
const live = liveSpikeEnabled ? it : it.skip;

function resolveUvExecutable(): string {
  const pathEntries = (process.env.Path ?? process.env.PATH ?? '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, process.platform === 'win32' ? 'uv.exe' : 'uv');
    if (fs.existsSync(candidate)) return candidate;
  }
  return 'uv.exe';
}

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

  it('rejects a missing uv executable before creating runtime state', async () => {
    await expect(runSerenaRuntimeSpike({
      uvExecutable: 'C:\\missing\\uv.exe',
      paths: createSerenaSpikePaths('C:\\temp\\spike'),
      fixtureSource: fixtureRoot,
    })).rejects.toThrow('SERENA_SPIKE_UV_NOT_FOUND');
  });

  it('rejects non-Windows real runs without platform fallback', async () => {
    await expect(runSerenaRuntimeSpike({
      uvExecutable: process.execPath,
      paths: createSerenaSpikePaths('/tmp/spike'),
      fixtureSource: fixtureRoot,
      platform: 'linux',
    })).rejects.toThrow('SERENA_SPIKE_WINDOWS_REQUIRED');
  });

  live('installs, starts, discovers, uses LSP, and cleans one pinned Serena runtime', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-serena-spike-'));
    const paths = createSerenaSpikePaths(root);
    fs.cpSync(fixtureRoot, paths.projectDir, { recursive: true });

    try {
      const report = await runSerenaRuntimeSpike({
        uvExecutable: resolveUvExecutable(),
        paths,
        fixtureSource: fixtureRoot,
      });

      expect(report.serenaVersion).toContain('1.7.0');
      expect(report.serverName.toLowerCase()).toContain('serena');
      expect(report.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        'get_symbols_overview',
        'find_symbol',
        'find_referencing_symbols',
        'search_for_pattern',
        'replace_symbol_body',
        'insert_before_symbol',
        'insert_after_symbol',
        'rename_symbol',
        'execute_shell_command',
      ]));
      expect(report.overviewText).toContain('add');
      expect(report.overviewText).toContain('Calculator');
      expect(report.cleanup).toBe('clean');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
