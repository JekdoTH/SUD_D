import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodingEngineRuntimeFailure } from '@sud-d/domain';
import {
  SERENA_ENGINE_MANIFEST,
  createManagedSerenaRuntime,
  createSerenaEngineProvisioner,
  createSerenaRuntimePaths,
  prepareManagedSerenaConfig,
  type ManagedSerenaMcpSession,
  type ManagedSerenaProcessSupervisor,
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

function fakeMcpSession(options: {
  tools?: readonly string[];
  config?: string;
  connectError?: unknown;
  findSymbolError?: unknown;
  rootPid?: number;
} = {}) {
  const session: ManagedSerenaMcpSession & { closeCalls: number; connectedArgs: readonly string[] | null } = {
    closeCalls: 0,
    connectedArgs: null,
    async connect(plan) {
      if (options.connectError) throw options.connectError;
      this.connectedArgs = plan.args;
      return { rootPid: options.rootPid ?? 101, serverName: 'Serena', serverVersion: '1.28.1' };
    },
    async listTools() {
      return (options.tools ?? SERENA_ENGINE_MANIFEST.expectedToolNames).map((name) => ({
        name,
        inputSchema: {},
      }));
    },
    async callTool(request) {
      if (request.name === 'get_current_config') return { content: [{ type: 'text', text: options.config ?? configText() }] };
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

  it('fails health on added or missing upstream tools', async () => {
    const root = temp();
    const base = [...SERENA_ENGINE_MANIFEST.expectedToolNames];
    const extra = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-extra'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ tools: [...base, 'write_memory'] }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(extra.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH' });

    const missing = createManagedSerenaRuntime({
      dataRoot: path.join(root, 'data-missing'),
      provisioner: fakeProvisioner(),
      createSession: () => fakeMcpSession({ tools: base.slice(1) }),
      processSupervisor: stoppedProcessSupervisor(),
    });
    await expect(missing.start(makeWorkspace(root))).rejects.toMatchObject({ code: 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH' });
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
