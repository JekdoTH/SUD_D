import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SERENA_ENGINE_MANIFEST,
  createManagedSerenaRuntime,
  createSerenaEngineProvisioner,
  createSerenaRuntimePaths,
  prepareManagedSerenaConfig,
  type ManagedSerenaMcpSession,
  type ManagedSerenaProcessSupervisor,
  type ManagedSerenaToolDefinition,
} from '@sud-d/infrastructure';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-serena-foundation-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function makeWorkspace(root = temp()) {
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  return {
    workspaceId: 'workspace-1',
    canonicalRoot: workspaceRoot,
    projectName: 'workspace',
  };
}

function makePaths(root = temp()) {
  return createSerenaRuntimePaths(path.join(root, 'data'), makeWorkspace(root));
}

function fakeRunner(stdout: string) {
  const calls: Array<{ command: string; args: readonly string[] }> = [];
  const runProcess = async (command: string, args: readonly string[]) => {
    calls.push({ command, args: [...args] });
    return { exitCode: 0, stdout, stderrBytes: 0 };
  };
  return { calls, runProcess };
}

function fakeProvisioner() {
  return {
    ensureInstalledCalls: 0,
    repairCalls: 0,
    async ensureInstalled() {
      this.ensureInstalledCalls += 1;
      return { executablePath: 'C:\\managed\\serena.cmd', version: '1.7.0' as const };
    },
    async repairInstalledEngine() {
      this.repairCalls += 1;
      return { executablePath: 'C:\\managed\\serena.cmd', version: '1.7.0' as const };
    },
  };
}

function configText(projectName = 'workspace', backend = 'LSP') {
  return `Serena version: 1.7.0\nActive project: ${projectName}\nLanguage backend: ${backend}\nLanguage server status: ready\n`;
}

const capturedSerenaToolDefinitions = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), 'docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json'),
    'utf8',
  ),
) as ManagedSerenaToolDefinition[];

const capturedToolDefinitionsByName = new Map(
  capturedSerenaToolDefinitions.map((definition) => [definition.name, definition] as const),
);

function compatibleToolDefinitions(): ManagedSerenaToolDefinition[] {
  return SERENA_ENGINE_MANIFEST.expectedToolNames.map((name) => {
    const definition = capturedToolDefinitionsByName.get(name);
    if (!definition) throw new Error(`Captured Serena schema is missing ${name}`);
    return definition;
  });
}

function reverseObjectKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeyOrder);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .reverse()
        .map(([key, nested]) => [key, reverseObjectKeyOrder(nested)]),
    );
  }
  return value;
}

function fakeMcpSession(options: {
  toolDefinitions?: readonly ManagedSerenaToolDefinition[];
  config?: string;
  connectError?: unknown;
  findSymbolError?: unknown;
  callToolErrors?: Readonly<Record<string, unknown>>;
  rootPid?: number;
} = {}) {
  const session: ManagedSerenaMcpSession & {
    closeCalls: number;
    connectedArgs: readonly string[] | null;
    callToolNames: string[];
    callToolRequests: Array<{ readonly name: string; readonly arguments?: Record<string, unknown> }>;
  } = {
    closeCalls: 0,
    connectedArgs: null,
    callToolNames: [],
    callToolRequests: [],
    async connect(plan) {
      if (options.connectError) throw options.connectError;
      this.connectedArgs = plan.args;
      return { rootPid: options.rootPid ?? 101, serverName: 'Serena', serverVersion: '1.28.1' };
    },
    async listTools() {
      return [...(options.toolDefinitions ?? compatibleToolDefinitions())];
    },
    async callTool(request) {
      this.callToolNames.push(request.name);
      this.callToolRequests.push(request);
      const configuredError = options.callToolErrors?.[request.name];
      if (configuredError) throw configuredError;
      if (request.name === 'get_current_config') {
        const projectIndex = this.connectedArgs?.indexOf('--project') ?? -1;
        const projectRoot = projectIndex >= 0 ? this.connectedArgs?.[projectIndex + 1] : undefined;
        return { content: [{ type: 'text', text: options.config ?? configText(projectRoot ? path.basename(projectRoot) : 'workspace') }] };
      }
      if (request.name === 'find_symbol') {
        if (options.findSymbolError) throw options.findSymbolError;
        return { content: [{ type: 'text', text: '[]' }] };
      }
      return { content: [] };
    },
    async close() {
      this.closeCalls += 1;
    },
  };
  return session;
}

function stoppedProcessSupervisor(): ManagedSerenaProcessSupervisor {
  return {
    snapshotProcessTree: (rootPid) => [rootPid],
    isProcessAlive: () => false,
    killProcessTree: () => undefined,
  };
}

describe('Serena managed foundation', () => {
  it('pins the approved Serena Product Mode contract', () => {
    expect(SERENA_ENGINE_MANIFEST.version).toBe('1.7.0');
    expect(SERENA_ENGINE_MANIFEST.upstreamCommit).toBe('949a27ef1e5fda1a6e7b561e777bcece345c6ffd');
    expect(SERENA_ENGINE_MANIFEST.transport).toBe('stdio');
    expect(SERENA_ENGINE_MANIFEST.languageBackend).toBe('LSP');
    expect(SERENA_ENGINE_MANIFEST.modes).toEqual(['no-memories']);
    expect(SERENA_ENGINE_MANIFEST.expectedToolNames).toHaveLength(22);
    expect([...SERENA_ENGINE_MANIFEST.expectedToolNames].sort()).toEqual(SERENA_ENGINE_MANIFEST.expectedToolNames);
  });

  it('keeps Serena home and project metadata outside the source workspace', () => {
    const root = temp();
    const dataRoot = path.join(root, 'data');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspaceRoot, '.serena'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'keep');

    const paths = createSerenaRuntimePaths(dataRoot, {
      workspaceId: 'workspace-1',
      canonicalRoot: workspaceRoot,
      projectName: 'workspace',
    });
    prepareManagedSerenaConfig(paths);

    expect(paths.serenaHome.startsWith(dataRoot)).toBe(true);
    expect(paths.projectSerenaDir.startsWith(dataRoot)).toBe(true);
    expect(paths.projectSerenaDir).not.toContain(path.join(workspaceRoot, '.serena'));
    expect(fs.existsSync(paths.projectSerenaDir)).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'utf8')).toBe('keep');

    const config = fs.readFileSync(paths.serenaConfigPath, 'utf8');
    expect(config).toContain(JSON.stringify(paths.projectSerenaDir));
    expect(config).toContain('"trusted_project_path_patterns": []');
    expect(config).not.toContain(workspaceRoot + path.sep + '.serena');
  });

  it('reports unavailable when uv bootstrap is missing without probing global Serena', async () => {
    const paths = makePaths();
    const fake = fakeRunner('Serena 1.7.0');
    const provisioner = createSerenaEngineProvisioner({
      paths,
      resolveUv: () => undefined,
      runProcess: fake.runProcess,
    });

    await expect(provisioner.ensureInstalled()).rejects.toMatchObject({
      code: 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE',
    });
    expect(fake.calls).toEqual([]);
    expect(fs.existsSync(paths.engineRoot)).toBe(false);
  });

  it('rejects a managed Serena executable with the wrong version', async () => {
    const paths = makePaths();
    fs.mkdirSync(paths.binDir, { recursive: true });
    const executablePath = path.join(paths.binDir, 'serena.cmd');
    fs.writeFileSync(executablePath, '@echo off\n');
    const fake = fakeRunner('Serena 9.9.9');
    const provisioner = createSerenaEngineProvisioner({
      paths,
      resolveUv: () => 'C:\\tools\\uv.exe',
      runProcess: fake.runProcess,
    });

    await expect(provisioner.ensureInstalled()).rejects.toMatchObject({
      code: 'CODING_ENGINE_VERSION_MISMATCH',
    });
    expect(fake.calls).toEqual([{ command: executablePath, args: ['--version'] }]);
  });

  it('accepts exact Product Mode tools and returns bounded health', async () => {
    const root = temp();
    const provisioner = fakeProvisioner();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data'),
      provisioner,
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });

    const health = await runtime.start(makeWorkspace(root));

    expect(health).toEqual({
      engine: 'serena',
      version: '1.7.0',
      serverName: 'Serena',
      serverVersion: '1.28.1',
      toolCount: 22,
      workspaceCanonicalRoot: path.join(root, 'workspace'),
      projectName: 'workspace',
      lspReady: true,
    });
    expect(session.connectedArgs).toEqual([
      'start-mcp-server',
      '--project',
      path.join(root, 'workspace'),
      '--context',
      'desktop-app',
      '--mode',
      'no-memories',
      '--open-web-dashboard',
      'false',
    ]);
  });

  it('maps only the five approved semantic reads to fixed Serena tool names and snake_case arguments', async () => {
    const root = temp();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-semantic'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);
    session.callToolRequests.length = 0;

    await runtime.semanticRead(context, { capability: 'code.overview', input: { relativePath: 'src/index.ts', depth: 1 } });
    await runtime.semanticRead(context, { capability: 'code.find_symbol', input: { namePathPattern: 'value', relativePath: 'src/index.ts', depth: 1, includeBody: true, substringMatching: false, maxMatches: 4 } });
    await runtime.semanticRead(context, { capability: 'code.find_references', input: { namePath: 'value', relativePath: 'src/index.ts' } });
    await runtime.semanticRead(context, { capability: 'code.search', input: { pattern: 'value', relativePath: 'src', codeOnly: true } });
    await runtime.semanticRead(context, { capability: 'code.diagnostics', input: { relativePath: 'src/index.ts', startLine: 0, endLine: 20, minSeverity: 2 } });

    expect(session.callToolRequests).toEqual([
      { name: 'get_symbols_overview', arguments: { relative_path: 'src/index.ts', depth: 1, max_answer_chars: 20_000 } },
      { name: 'find_symbol', arguments: { name_path_pattern: 'value', relative_path: 'src/index.ts', depth: 1, include_body: true, substring_matching: false, max_matches: 4, max_answer_chars: 20_000 } },
      { name: 'find_referencing_symbols', arguments: { name_path: 'value', relative_path: 'src/index.ts', max_answer_chars: 20_000 } },
      { name: 'search_for_pattern', arguments: { substring_pattern: 'value', relative_path: 'src', restrict_search_to_code_files: true, max_answer_chars: 20_000 } },
      { name: 'get_diagnostics_for_file', arguments: { relative_path: 'src/index.ts', start_line: 0, end_line: 20, min_severity: 2, max_answer_chars: 20_000 } },
    ]);
    expect('callTool' in runtime).toBe(false);
  });

  it('maps only the four approved semantic writes to fixed Serena tool names and snake_case arguments', async () => {
    const root = temp();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-semantic-write'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);
    session.callToolRequests.length = 0;

    await runtime.semanticWrite(context, { capability: 'code.replace_symbol', input: { namePath: 'add', relativePath: 'src/index.ts', body: 'export function add() { return 2; }' } });
    await runtime.semanticWrite(context, { capability: 'code.insert_before', input: { namePath: 'Calculator', relativePath: 'src/index.ts', body: 'export const VERSION = 1;' } });
    await runtime.semanticWrite(context, { capability: 'code.insert_after', input: { namePath: 'Calculator', relativePath: 'src/index.ts', body: 'export const createCalculator = () => new Calculator();' } });
    await runtime.semanticWrite(context, { capability: 'code.rename', input: { namePath: 'Calculator', relativePath: 'src/index.ts', newName: 'ArithmeticCalculator' } });

    expect(session.callToolRequests).toEqual([
      { name: 'replace_symbol_body', arguments: { name_path: 'add', relative_path: 'src/index.ts', body: 'export function add() { return 2; }' } },
      { name: 'insert_before_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', body: 'export const VERSION = 1;' } },
      { name: 'insert_after_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', body: 'export const createCalculator = () => new Calculator();' } },
      { name: 'rename_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', new_name: 'ArithmeticCalculator' } },
    ]);
    expect('callTool' in runtime).toBe(false);
  });

  it('maps non-throwing MCP semantic-write errors to stable Coding Engine unavailable', async () => {
    const root = temp();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-semantic-write-is-error'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);
    session.callTool = async () => ({
      isError: true,
      content: [{ type: 'text', text: 'RAW_MCP_WRITE_ERROR_SENTINEL' }],
    });

    const failure = await runtime.semanticWrite(context, {
      capability: 'code.replace_symbol',
      input: { namePath: 'add', relativePath: 'src/index.ts', body: 'export function add() { return 2; }' },
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'CODING_ENGINE_UNAVAILABLE' });
    expect(JSON.stringify(failure)).not.toContain('RAW_MCP_WRITE_ERROR_SENTINEL');
  });

  it('rejects malformed semantic writes instead of selecting memory, shell, delete, or unexpected upstream tools', async () => {
    const root = temp();
    const session = fakeMcpSession({
      toolDefinitions: [
        ...compatibleToolDefinitions(),
        { name: 'write_memory', inputSchema: { type: 'object' } },
      ],
    });
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-malformed-semantic-write'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);
    session.callToolNames.length = 0;

    for (const capability of ['write_memory', 'execute_shell_command', 'safe_delete_symbol']) {
      await expect(runtime.semanticWrite(context, { capability, input: {} } as never)).rejects.toMatchObject({
        code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
      });
    }
    expect(session.callToolNames).toEqual([]);
  });

  it('rejects malformed semantic requests instead of selecting an upstream Serena tool', async () => {
    const root = temp();
    const session = fakeMcpSession({
      toolDefinitions: [
        ...compatibleToolDefinitions(),
        { name: 'write_memory', inputSchema: { type: 'object' } },
      ],
    });
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-malformed-semantic'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);

    await expect(runtime.semanticRead(context, { capability: 'write_memory', input: {} } as never)).rejects.toMatchObject({
      code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
    });
    expect(session.callToolNames).not.toContain('write_memory');
  });

  it('maps raw semantic-call failures to stable Coding Engine unavailable without raw error text', async () => {
    const root = temp();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-semantic-call-failure'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);
    session.callTool = async () => { throw new Error('RAW_SERENA_SECRET_SENTINEL'); };

    const failure = await runtime.semanticRead(context, {
      capability: 'code.overview',
      input: { relativePath: 'src/index.ts' },
    }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'CODING_ENGINE_UNAVAILABLE' });
    expect(JSON.stringify(failure)).not.toContain('RAW_SERENA_SECRET_SENTINEL');
  });

  it('lazily binds semantic reads and rebinds only after stopping the prior Workspace session', async () => {
    const root = temp();
    const first = fakeMcpSession();
    const second = fakeMcpSession({ config: configText('workspace-two') });
    const sessions = [first, second];
    let index = 0;
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-semantic-rebind'),
      provisioner: fakeProvisioner(),
      createSession: () => sessions[index++]!,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const firstContext = makeWorkspace(root);
    const secondRoot = path.join(root, 'workspace-two');
    fs.mkdirSync(secondRoot, { recursive: true });
    const secondContext = {
      workspaceId: 'workspace-2',
      canonicalRoot: secondRoot,
      projectName: 'workspace-two',
    };

    await runtime.semanticRead(firstContext, { capability: 'code.overview', input: { relativePath: '.' } });
    await runtime.semanticRead(secondContext, { capability: 'code.overview', input: { relativePath: '.' } });

    expect(first.closeCalls).toBe(1);
    expect(first.connectedArgs).toContain(firstContext.canonicalRoot);
    expect(second.connectedArgs).toContain(secondContext.canonicalRoot);
  });

  it('maps an unresponsive mapped Serena call to stable CODING_ENGINE_UNAVAILABLE', async () => {
    const root = temp();
    const session = fakeMcpSession({ callToolErrors: { get_symbols_overview: new Error('RAW_UPSTREAM_FAILURE') } });
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-unresponsive-semantic'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });
    const context = makeWorkspace(root);
    await runtime.start(context);

    await expect(runtime.semanticRead(context, { capability: 'code.overview', input: { relativePath: 'src/index.ts' } })).rejects.toMatchObject({
      code: 'CODING_ENGINE_UNAVAILABLE',
    });
  });

  it('fails semantic readiness when a mapped capability is missing or schema-incompatible', async () => {
    const missingRoot = temp();
    const missingRuntime = createManagedSerenaRuntime({
      dataRoot: path.join(missingRoot, 'data-missing-mapped'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({
        toolDefinitions: compatibleToolDefinitions().filter((definition) => definition.name !== 'get_symbols_overview'),
      }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(missingRuntime.start(makeWorkspace(missingRoot))).rejects.toMatchObject({
      code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
    });

    const schemaRoot = temp();
    const definitions = compatibleToolDefinitions().map((definition) => definition.name === 'find_referencing_symbols'
      ? { ...definition, inputSchema: { type: 'object', properties: { name_path: { type: 'number' } }, required: ['name_path'] } }
      : definition);
    const schemaRuntime = createManagedSerenaRuntime({
      dataRoot: path.join(schemaRoot, 'data-schema-mapped'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ toolDefinitions: definitions }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(schemaRuntime.start(makeWorkspace(schemaRoot))).rejects.toMatchObject({
      code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
    });
  });

  it('accepts unexpected upstream drift while keeping the Product Mode surface bounded', async () => {
    const root = temp();
    const session = fakeMcpSession({
      toolDefinitions: [
        ...compatibleToolDefinitions(),
        { name: 'write_memory', inputSchema: { type: 'object' } },
      ],
    });
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-extra'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });

    const context = makeWorkspace(root);
    const health = await runtime.start(context);
    await runtime.semanticRead(context, { capability: 'code.search', input: { pattern: 'value' } });

    expect(health.toolCount).toBe(22);
    expect(session.callToolNames).toEqual(['get_current_config', 'find_symbol', 'search_for_pattern']);
    expect(session.callToolNames).not.toContain('write_memory');
    expect('callTool' in runtime).toBe(false);
  });

  it('fails health when an allowlisted upstream tool is missing', async () => {
    const root = temp();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-missing'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ toolDefinitions: compatibleToolDefinitions().slice(1) }),
      processSupervisor: stoppedProcessSupervisor(),
    });

    await expect(runtime.start(makeWorkspace(root))).rejects.toMatchObject({
      code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
    });
  });

  it('fails health when an allowlisted upstream tool has an incompatible input schema', async () => {
    const root = temp();
    const definitions = compatibleToolDefinitions();
    definitions[0] = {
      ...definitions[0],
      inputSchema: { type: 'object', properties: { project: { type: 'number' } }, required: ['project'] },
    };
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-schema-mismatch'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ toolDefinitions: definitions }),
      processSupervisor: stoppedProcessSupervisor(),
    });

    await expect(runtime.start(makeWorkspace(root))).rejects.toMatchObject({
      code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH',
    });
  });

  it('accepts compatible input schemas regardless of object key order', async () => {
    const root = temp();
    const definitions = compatibleToolDefinitions();
    definitions[0] = {
      ...definitions[0],
      inputSchema: reverseObjectKeyOrder(definitions[0].inputSchema),
    };
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-schema-order'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ toolDefinitions: definitions }),
      processSupervisor: stoppedProcessSupervisor(),
    });

    await expect(runtime.start(makeWorkspace(root))).resolves.toMatchObject({ toolCount: 22, lspReady: true });
  });

  it('fails health when Serena reports the wrong active project or non-LSP backend', async () => {
    const root = temp();
    const wrongProject = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-project'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ config: configText('other-project') }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(wrongProject.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_PROJECT_MISMATCH' });

    const wrongBackend = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-backend'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ config: configText('workspace', 'JETBRAINS') }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(wrongBackend.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_LSP_UNAVAILABLE' });
  });

  it('fails health when the symbolic LSP sentinel cannot execute', async () => {
    const root = temp();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ findSymbolError: new Error('tool failed') }),
      processSupervisor: stoppedProcessSupervisor(),
    });

    await expect(runtime.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_LSP_UNAVAILABLE' });
  });

  it('maps MCP start failure to a safe runtime code', async () => {
    const root = temp();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ connectError: new Error('raw process stderr') }),
      processSupervisor: stoppedProcessSupervisor(),
    });

    await expect(runtime.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_START_FAILED' });
  });

  it('makes repeated stop calls idempotent', async () => {
    const root = temp();
    const session = fakeMcpSession();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data'),
      provisioner: fakeProvisioner(),
      createSession: () => session,
      processSupervisor: stoppedProcessSupervisor(),
    });

    await runtime.start(makeWorkspace(root));
    await runtime.stop();
    await runtime.stop();

    expect(session.closeCalls).toBe(1);
  });

  it('fails stop when the managed root process remains alive', async () => {
    const root = temp();
    const runtime = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ rootPid: 202 }),
      processSupervisor: {
        snapshotProcessTree: () => [202],
        isProcessAlive: () => true,
        killProcessTree: () => undefined,
      },
      cleanupPollIntervalMs: 1,
      cleanupTimeoutMs: 5,
    });

    await runtime.start(makeWorkspace(root));
    await expect(runtime.stop()).rejects.toMatchObject({ code: 'CODING_ENGINE_STOP_FAILED' });
  });
});
