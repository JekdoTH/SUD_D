import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
  live('proves the pinned Product Mode runtime, semantic reads and writes, Git visibility, central metadata, blocked drift, LSP, and cleanup', async () => {
    expect(process.platform).toBe('win32');
    const uvExecutable = resolveUvExecutable();
    expect(uvExecutable).toBeTruthy();

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-managed-serena-acceptance-'));
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-'));
    const workspaceRoot = path.join(root, 'workspace');
    const sourceSerenaDir = path.join(workspaceRoot, '.serena');
    copyFixtureDirectory(fixtureRoot, workspaceRoot);
    fs.mkdirSync(sourceSerenaDir, { recursive: true });
    fs.writeFileSync(path.join(sourceSerenaDir, 'developer-marker.txt'), 'do-not-touch', 'utf8');
    const sourceSerenaBefore = snapshotDirectory(sourceSerenaDir);
    const outsideSentinelPath = path.join(root, 'outside-sentinel.txt');
    const internalSentinelPath = path.join(dataRoot, 'internal-sentinel.txt');
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(outsideSentinelPath, 'outside-do-not-touch', 'utf8');
    fs.writeFileSync(internalSentinelPath, 'internal-do-not-touch', 'utf8');
    execFileSync('git', ['init'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'SUD-D Acceptance'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'sud-d-acceptance@example.invalid'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'acceptance baseline'], { cwd: workspaceRoot, stdio: 'ignore' });

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
      const semanticResults = [
        await runtime.semanticRead(context, { capability: 'code.overview', input: { relativePath: 'src/calculator.ts', depth: 1 } }),
        await runtime.semanticRead(context, { capability: 'code.find_symbol', input: { namePathPattern: 'add', relativePath: 'src/calculator.ts', includeBody: true } }),
        await runtime.semanticRead(context, { capability: 'code.find_references', input: { namePath: 'add', relativePath: 'src/calculator.ts' } }),
        await runtime.semanticRead(context, { capability: 'code.search', input: { pattern: 'Calculator', relativePath: 'src', codeOnly: true } }),
        await runtime.semanticRead(context, { capability: 'code.diagnostics', input: { relativePath: 'src/calculator.ts', startLine: 0, endLine: 20, minSeverity: 4 } }),
      ];
      const semanticWriteResults = [
        await runtime.semanticWrite(context, {
          capability: 'code.replace_symbol',
          input: {
            namePath: 'add',
            relativePath: 'src/calculator.ts',
            body: 'export function add(left: number, right: number): number {\n  return left + right + 1;\n}',
          },
        }),
        await runtime.semanticWrite(context, {
          capability: 'code.insert_before',
          input: {
            namePath: 'Calculator',
            relativePath: 'src/calculator.ts',
            body: "export const BEFORE_CALCULATOR = 'before';",
          },
        }),
        await runtime.semanticWrite(context, {
          capability: 'code.insert_after',
          input: {
            namePath: 'Calculator',
            relativePath: 'src/calculator.ts',
            body: 'export function createCalculator(): Calculator {\n  return new Calculator();\n}',
          },
        }),
        await runtime.semanticWrite(context, {
          capability: 'code.rename',
          input: {
            namePath: 'Calculator',
            relativePath: 'src/calculator.ts',
            newName: 'ArithmeticCalculator',
          },
        }),
      ];

      expect(health).toMatchObject({
        engine: 'serena',
        version: '1.7.0',
        serverName: 'Serena',
        toolCount: 22,
        projectName: context.projectName,
        lspReady: true,
      });
      expect(missingNames).toEqual([]);
      expect(semanticResults.every((result) => JSON.stringify(result).length <= 30_000)).toBe(true);
      expect(semanticWriteResults.every((result) => JSON.stringify(result).length <= 30_000)).toBe(true);
      expect(observation.callToolNames).toEqual([
        'get_current_config',
        'find_symbol',
        'get_symbols_overview',
        'find_symbol',
        'find_referencing_symbols',
        'search_for_pattern',
        'get_diagnostics_for_file',
        'replace_symbol_body',
        'insert_before_symbol',
        'insert_after_symbol',
        'rename_symbol',
      ]);
      expect(observation.callToolNames.every((name) => expectedSet.has(name))).toBe(true);
      expect(unexpectedNames.every((name) => !observation.callToolNames.includes(name))).toBe(true);
      expect(Object.keys(runtime).sort()).toEqual(['repair', 'semanticRead', 'semanticWrite', 'start', 'stop']);
      expect(paths.projectSerenaDir.startsWith(dataRoot)).toBe(true);
      expect(paths.projectSerenaDir.startsWith(workspaceRoot)).toBe(false);
      expect(fs.existsSync(path.join(paths.projectSerenaDir, 'project.yml'))).toBe(true);

      const calculatorSource = fs.readFileSync(path.join(workspaceRoot, 'src', 'calculator.ts'), 'utf8');
      expect(calculatorSource).toContain('return left + right + 1;');
      expect(calculatorSource).toContain("export const BEFORE_CALCULATOR = 'before';");
      expect(calculatorSource).toContain('export class ArithmeticCalculator');
      expect(calculatorSource).toContain('createCalculator(): ArithmeticCalculator');
      expect(calculatorSource).toContain('new ArithmeticCalculator()');
      expect(calculatorSource).not.toMatch(/export class Calculator\b/);
      expect(calculatorSource).not.toMatch(/new Calculator\(/);
      const gitStatus = execFileSync('git', ['status', '--short', '--untracked-files=no'], { cwd: workspaceRoot, encoding: 'utf8' })
        .split(/\r?\n/u)
        .filter(Boolean);
      expect(gitStatus).toEqual([' M src/calculator.ts']);
      const gitDiff = execFileSync('git', ['diff', '--', 'src/calculator.ts'], { cwd: workspaceRoot, encoding: 'utf8' });
      expect(gitDiff).toContain('return left + right + 1;');
      expect(gitDiff).toContain("BEFORE_CALCULATOR = 'before'");
      expect(gitDiff).toContain('ArithmeticCalculator');
      expect(fs.readFileSync(outsideSentinelPath, 'utf8')).toBe('outside-do-not-touch');
      expect(fs.readFileSync(internalSentinelPath, 'utf8')).toBe('internal-do-not-touch');

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
        fs.rmSync(dataRoot, { recursive: true, force: true });
      }
    }
  }, 300_000);
});


// G2c passive inspection: all apparent sessions below are in-memory mocks only.
// This test deliberately loads Source through an in-memory TypeScript/VM boundary.
// No compiled product, real MCP client, native addon, child process or network.
function createG2cPassiveMock() {
  const calls = { provision: 0, connect: 0, listTools: 0, callTool: 0,
    close: 0, createSession: 0, snapshot: 0, processAlive: 0, kill: 0, config: 0 };
  const expectedNames = ['get_current_config', 'find_symbol'] as const;
  const definitions = expectedNames.map(name => ({ name, inputSchema: { type: 'object' } }));
  const manifest = {
    version: '1.7.0', expectedToolNames: [...expectedNames],
    expectedToolInputSchemas: Object.fromEntries(definitions.map(t => [t.name, t.inputSchema])),
    context: 'coding', modes: ['interactive'],
  };
  let completeClose: (() => void) | null = null;
  let holdClose = false;
  let completeToolList: (() => void) | null = null;
  let holdToolList = false;
  const session: ManagedSerenaMcpSession = {
    async connect() {
      calls.connect++;
      return { rootPid: 4242, serverName: 'Serena', serverVersion: 'fake-injected-only' };
    },
    async listTools() {
      calls.listTools++;
      if (holdToolList) await new Promise<void>(resolve => { completeToolList = resolve; });
      return definitions;
    },
    async callTool(request) {
      calls.callTool++;
      if (request.name === 'get_current_config') {
        return 'Serena version: 1.7.0\nActive project: fake-only\nLanguage backend: LSP\nLanguage server status: synthetic';
      }
      return { content: [] };
    },
    close() {
      calls.close++;
      return holdClose ? new Promise<void>(resolve => { completeClose = resolve; }) : Promise.resolve();
    },
  };
  const sourcePath = path.resolve(testDir, '../../infrastructure/src/serena-managed-runtime.ts');
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(sourceText, {
    fileName: sourcePath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      esModuleInterop: true, isolatedModules: true },
    reportDiagnostics: true,
  });
  assert.equal(compiled.diagnostics?.length, 0);
  const sandboxModule: { exports: Record<string, unknown> } = { exports: {} };
  const failOnActualOperation = () => { throw new Error('G2C_TEST_REAL_IO_OR_PROCESS_FORBIDDEN'); };
  const mocks: Record<string, unknown> = {
    'node:child_process': { spawnSync: failOnActualOperation },
    '@modelcontextprotocol/client': { Client: class { constructor() { failOnActualOperation(); } } },
    '@modelcontextprotocol/client/stdio': {
      StdioClientTransport: class { constructor() { failOnActualOperation(); } },
    },
    '@sud-d/domain': { CodingEngineRuntimeFailure: class extends Error {} },
    './solo-expert-serena-fixed-adapter.js': { createSoloExpertFixedAdapter: failOnActualOperation },
    './serena-engine-provisioner.js': {
      createSerenaEngineProvisioner: failOnActualOperation,
      safeManagedRuntimeEnvironment: () => ({}),
      buildManagedUvEnvironment: () => ({}),
    },
    './serena-engine-manifest.js': { SERENA_ENGINE_MANIFEST: manifest },
    './serena-managed-config.js': { prepareManagedSerenaConfig: () => { calls.config++; } },
    './serena-runtime-paths.js': {
      createSerenaRuntimePaths: () => ({
        dataRoot: 'FAKE_ONLY', serenaHome: 'FAKE_ONLY_HOME',
        projectSerenaDir: 'FAKE_ONLY_PROJECT', cacheDir: 'FAKE_ONLY_CACHE',
      }),
    },
  };
  vm.runInNewContext(compiled.outputText, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    require: (id: string) => {
      if (!(id in mocks)) throw new Error('G2C_UNEXPECTED_IMPORT_' + id);
      return mocks[id];
    },
    setTimeout: failOnActualOperation,
  }, { filename: 'g2c-in-memory-managed-serena-runtime.cjs', timeout: 2500 });
  const create = sandboxModule.exports.createManagedSerenaRuntime as
    typeof createManagedSerenaRuntime;
  assert.equal(typeof create, 'function');
  const context = { workspaceId: 'fake-only', canonicalRoot: 'FAKE_NO_WORKSPACE',
    projectName: 'fake-only' };
  const runtime = create({
    dataRoot: 'FAKE_NO_DATA',
    soloExpertFixture: { receipt: { integrity: 'synthetic-fixture' },
      serverName: 'Serena' } as never,
    provisioner: {
      async ensureInstalled() { calls.provision++; return { executablePath: 'FAKE_NO_EXE', version: '1.7.0' }; },
      async repairInstalledEngine() { calls.provision++; return { executablePath: 'FAKE_NO_EXE', version: '1.7.0' }; },
    } as never,
    createSession: () => { calls.createSession++; return session; },
    processSupervisor: {
      snapshotProcessTree: () => { calls.snapshot++; return []; },
      isProcessAlive: () => { calls.processAlive++; return false; },
      killProcessTree: () => { calls.kill++; throw new Error('G2C_FORBIDDEN_PROCESS_KILL'); },
    },
  });
  return {
    runtime, context, calls,
    holdClose: () => { holdClose = true; },
    releaseClose: () => { if (!completeClose) throw new Error('NO_PENDING_FAKE_CLOSE'); completeClose(); },
    holdToolList: () => { holdToolList = true; },
    releaseToolList: () => { if (!completeToolList) throw new Error('NO_PENDING_FAKE_TOOL_LIST'); completeToolList(); },
  };
}

describe('G2c passive managed Serena session observation (all injected fakes, no live process)', () => {
  it('has a frozen nonsecret NOT_READY receipt with no active session and no I/O', () => {
    const h = createG2cPassiveMock();
    const observed = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(observed.status, 'not-ready');
    assert.equal(observed.reason, 'NO_ACTIVE_SESSION');
    assert.equal(Object.isFrozen(observed), true);
    assert.deepEqual(Object.keys(observed).sort(), ['reason', 'status']);
    assert.deepEqual(h.calls, { provision: 0, connect: 0, listTools: 0, callTool: 0,
      close: 0, createSession: 0, snapshot: 0, processAlive: 0, kill: 0, config: 0 });
  });

  it('refuses synthetic-only fixture and retained mock session even after schemas/health', async () => {
    const h = createG2cPassiveMock();
    const initial = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(initial.status, 'not-ready');
    await h.runtime.start(h.context);
    const prior = { ...h.calls };
    const observed = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(observed.status, 'not-ready');
    assert.equal(observed.reason, 'PROVENANCE_UNVERIFIED');
    assert.equal(Object.isFrozen(observed), true);
    assert.deepEqual(Object.keys(observed).sort(), ['reason', 'status']);
    assert.equal(JSON.stringify(observed).includes('synthetic-fixture'), false);
    assert.deepEqual(h.calls, prior);
    await h.runtime.stop();
  });

  it('keeps incomplete fake tool-schema observation NOT_READY without polling', async () => {
    const h = createG2cPassiveMock();
    h.holdToolList();
    const starting = h.runtime.start(h.context);
    for (let i = 0; i < 20 && h.calls.listTools === 0; i++) await Promise.resolve();
    assert.equal(h.calls.listTools, 1);
    const snapshot = { ...h.calls };
    const observed = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(observed.status, 'not-ready');
    assert.equal(observed.reason, 'PROVENANCE_UNVERIFIED');
    assert.deepEqual(h.calls, snapshot);
    h.releaseToolList();
    await starting;
    assert.equal(h.runtime.inspectLiveSoloReadinessOnly().status, 'not-ready');
    await h.runtime.stop();
  });

  it('invalidates synchronously at start of stop before awaited fake close', async () => {
    const h = createG2cPassiveMock();
    await h.runtime.start(h.context);
    h.holdClose();
    const pendingStop = h.runtime.stop();
    const prior = { ...h.calls };
    const observed = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(observed.status, 'not-ready');
    assert.equal(observed.reason, 'SESSION_INVALIDATED');
    assert.deepEqual(h.calls, prior);
    h.releaseClose();
    await pendingStop;
    assert.equal(h.runtime.inspectLiveSoloReadinessOnly().status, 'not-ready');
  });

  it('never carries observation authority across replacement/reconnection', async () => {
    const h = createG2cPassiveMock();
    await h.runtime.start(h.context);
    const first = h.runtime.inspectLiveSoloReadinessOnly();
    await h.runtime.stop();
    assert.equal(h.runtime.inspectLiveSoloReadinessOnly().status, 'not-ready');
    await h.runtime.start(h.context);
    const second = h.runtime.inspectLiveSoloReadinessOnly();
    assert.equal(second.status, 'not-ready');
    assert.ok(second.reason === 'PROVENANCE_UNVERIFIED' || second.reason === 'SESSION_INVALIDATED');
    assert.notEqual(first, second);
    const before = { ...h.calls };
    h.runtime.inspectLiveSoloReadinessOnly();
    assert.deepEqual(h.calls, before);
    await h.runtime.stop();
  });
});
