import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  SERENA_ENGINE_MANIFEST,
  createManagedSerenaRuntime,
  createSerenaEngineProvisioner,
  createSerenaRuntimePaths,
  resolveUvExecutable,
  type ManagedSerenaConnectResult,
  type ManagedSerenaLaunchPlan,
  type ManagedSerenaMcpSession,
  type ManagedSerenaToolDefinition,
} from '@sud-d/infrastructure';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, '../fixtures/serena-runtime-spike-ts');
const liveEnabled = process.env.SUD_D_SERENA_MANAGED_RUNTIME === '1';
const live = liveEnabled ? it : it.skip;
interface RuntimeObservation {
  rootPid: number | null;
  toolNames: string[];
  callToolNames: string[];
}

function createObservedMcpSession(observation: RuntimeObservation): ManagedSerenaMcpSession {
  let client: Client | null = null;

  return {
    async connect(plan: ManagedSerenaLaunchPlan): Promise<ManagedSerenaConnectResult> {
      const nextClient = new Client({ name: 'sud-d-managed-runtime-acceptance', version: '0.1.0' });
      const nextTransport = new StdioClientTransport({
        command: plan.command,
        args: [...plan.args],
        cwd: plan.cwd,
        env: { ...plan.env },
        stderr: 'pipe',
        maxBufferSize: 10 * 1024 * 1024,
      });
      await nextClient.connect(nextTransport);
      const rootPid = nextTransport.pid;
      const serverVersion = nextClient.getServerVersion();
      if (rootPid === null || !serverVersion?.name || !serverVersion.version) {
        await nextClient.close();
        throw new Error('MANAGED_SERENA_ACCEPTANCE_CONNECT_FAILED');
      }
      client = nextClient;
      observation.rootPid = rootPid;
      return { rootPid, serverName: serverVersion.name, serverVersion: serverVersion.version };
    },

    async listTools(): Promise<readonly ManagedSerenaToolDefinition[]> {
      if (!client) throw new Error('MANAGED_SERENA_ACCEPTANCE_NOT_CONNECTED');
      const result = await client.listTools();
      const definitions = result.tools.map((tool) => ({
        name: tool.name,
        ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema ?? {},
      }));
      observation.toolNames = definitions.map((tool) => tool.name).sort();
      return definitions;
    },

    async callTool(request): Promise<unknown> {
      if (!client) throw new Error('MANAGED_SERENA_ACCEPTANCE_NOT_CONNECTED');
      observation.callToolNames.push(request.name);
      return client.callTool({ name: request.name, arguments: request.arguments ?? {} });
    },

    async close(): Promise<void> {
      if (client) await client.close();
      client = null;
    },
  };
}

function copyFixtureDirectory(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyFixtureDirectory(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
      continue;
    }
    throw new Error('MANAGED_SERENA_ACCEPTANCE_UNSUPPORTED_FIXTURE_ENTRY');
  }
}

function snapshotDirectory(root: string): Array<{ relativePath: string; contentBase64: string }> {
  const files: Array<{ relativePath: string; contentBase64: string }> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push({
          relativePath: path.relative(root, fullPath),
          contentBase64: fs.readFileSync(fullPath).toString('base64'),
        });
      }
    }
  };
  walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('managed Serena runtime production acceptance', () => {
  live('proves the pinned Product Mode runtime, central metadata, blocked drift, LSP, and cleanup', async () => {
    expect(process.platform).toBe('win32');
    const uvExecutable = resolveUvExecutable();
    expect(uvExecutable).toBeTruthy();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-managed-serena-acceptance-'));
    const dataRoot = path.join(root, 'data');
    const workspaceRoot = path.join(root, 'workspace');
    const sourceSerenaDir = path.join(workspaceRoot, '.serena');
    copyFixtureDirectory(fixtureRoot, workspaceRoot);
    fs.mkdirSync(sourceSerenaDir, { recursive: true });
    fs.writeFileSync(path.join(sourceSerenaDir, 'developer-marker.txt'), 'do-not-touch', 'utf8');
    const sourceSerenaBefore = snapshotDirectory(sourceSerenaDir);

    const context = {
      workspaceId: 'managed-serena-acceptance',
      canonicalRoot: workspaceRoot,
      projectName: path.basename(workspaceRoot),
    };
    const paths = createSerenaRuntimePaths(dataRoot, context);
    const provisioner = createSerenaEngineProvisioner({ paths, resolveUv: () => uvExecutable });
    const observation: RuntimeObservation = { rootPid: null, toolNames: [], callToolNames: [] };
    const runtime = createManagedSerenaRuntime({
      dataRoot,
      provisioner,
      createSession: () => createObservedMcpSession(observation),
    });

    try {
      const health = await runtime.start(context);
      const expectedNames = [...SERENA_ENGINE_MANIFEST.expectedToolNames];
      const expectedSet = new Set<string>(expectedNames);
      const missingNames = expectedNames.filter((name) => !observation.toolNames.includes(name));
      const unexpectedNames = observation.toolNames.filter((name) => !expectedSet.has(name));

      expect(health).toMatchObject({
        engine: 'serena',
        version: '1.7.0',
        serverName: 'Serena',
        toolCount: 22,
        projectName: context.projectName,
        lspReady: true,
      });
      expect(missingNames).toEqual([]);
      expect(observation.callToolNames).toEqual(['get_current_config', 'find_symbol']);
      expect(observation.callToolNames.every((name) => expectedSet.has(name))).toBe(true);
      expect(unexpectedNames.every((name) => !observation.callToolNames.includes(name))).toBe(true);
      expect(Object.keys(runtime).sort()).toEqual(['repair', 'start', 'stop']);
      expect(paths.projectSerenaDir.startsWith(dataRoot)).toBe(true);
      expect(paths.projectSerenaDir.startsWith(workspaceRoot)).toBe(false);
      expect(fs.existsSync(path.join(paths.projectSerenaDir, 'project.yml'))).toBe(true);

      await runtime.stop();
      expect(snapshotDirectory(sourceSerenaDir)).toEqual(sourceSerenaBefore);
      expect(fs.readFileSync(path.join(sourceSerenaDir, 'developer-marker.txt'), 'utf8')).toBe('do-not-touch');
      expect(observation.rootPid).not.toBeNull();
      expect(isProcessAlive(observation.rootPid!)).toBe(false);
    } finally {
      try {
        await runtime.stop();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }, 300_000);
});
