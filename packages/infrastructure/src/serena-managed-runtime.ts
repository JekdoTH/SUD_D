import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  CodingEngineRuntimeFailure,
  type CodingEngineRuntimeHealth,
  type CodingEngineWorkspaceContext,
} from '@sud-d/domain';
import { createSerenaEngineProvisioner, safeManagedRuntimeEnvironment, buildManagedUvEnvironment, type SerenaEngineProvisioner } from './serena-engine-provisioner.js';
import { SERENA_ENGINE_MANIFEST } from './serena-engine-manifest.js';
import { prepareManagedSerenaConfig } from './serena-managed-config.js';
import { createSerenaRuntimePaths, type SerenaRuntimePaths } from './serena-runtime-paths.js';

export interface ManagedSerenaLaunchPlan {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

export interface ManagedSerenaToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: unknown;
}

export interface ManagedSerenaConnectResult {
  readonly rootPid: number;
  readonly serverName: string;
  readonly serverVersion: string;
}

export interface ManagedSerenaMcpSession {
  connect(plan: ManagedSerenaLaunchPlan): Promise<ManagedSerenaConnectResult>;
  listTools(): Promise<readonly ManagedSerenaToolDefinition[]>;
  callTool(request: { readonly name: string; readonly arguments?: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface ManagedSerenaProcessSupervisor {
  snapshotProcessTree(rootPid: number): readonly number[];
  isProcessAlive(pid: number): boolean;
  killProcessTree(pid: number): void;
}

export interface ManagedSerenaRuntimeDependencies {
  readonly dataRoot: string;
  readonly provisioner?: SerenaEngineProvisioner;
  readonly createProvisioner?: (paths: SerenaRuntimePaths) => SerenaEngineProvisioner;
  readonly createSession?: () => ManagedSerenaMcpSession;
  readonly processSupervisor?: ManagedSerenaProcessSupervisor;
  readonly cleanupTimeoutMs?: number;
  readonly cleanupPollIntervalMs?: number;
}

interface ActiveSession {
  readonly context: CodingEngineWorkspaceContext;
  readonly session: ManagedSerenaMcpSession;
  readonly rootPid: number;
}

const DEFAULT_CLEANUP_TIMEOUT_MS = 5000;
const DEFAULT_CLEANUP_POLL_INTERVAL_MS = 100;

export function createManagedSerenaRuntime(dependencies: ManagedSerenaRuntimeDependencies) {
  const processSupervisor = dependencies.processSupervisor ?? createWindowsProcessSupervisor();
  const createSession = dependencies.createSession ?? (() => new DefaultManagedSerenaMcpSession());
  const cleanupTimeoutMs = dependencies.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS;
  const cleanupPollIntervalMs = dependencies.cleanupPollIntervalMs ?? DEFAULT_CLEANUP_POLL_INTERVAL_MS;
  let active: ActiveSession | null = null;

  const runtime = {
    async start(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth> {
      if (active) await runtime.stop();
      return startInternal(context, 'start');
    },

    async stop(): Promise<void> {
      if (!active) return;
      const current = active;
      const observed = [...new Set([current.rootPid, ...processSupervisor.snapshotProcessTree(current.rootPid)])];
      try {
        await current.session.close();
      } catch {
        // Best-effort MCP shutdown; Windows process cleanup below is authoritative.
      }
      await cleanupObservedProcesses(observed, processSupervisor, cleanupTimeoutMs, cleanupPollIntervalMs);
      active = null;
    },

    async repair(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth> {
      try {
        await runtime.stop();
        return await startInternal(context, 'repair');
      } catch (error) {
        if (error instanceof CodingEngineRuntimeFailure) throw error;
        throw new CodingEngineRuntimeFailure('CODING_ENGINE_REPAIR_FAILED');
      }
    },
  };

  const startInternal = async (
    context: CodingEngineWorkspaceContext,
    operation: 'start' | 'repair',
  ): Promise<CodingEngineRuntimeHealth> => {
    const paths = createSerenaRuntimePaths(dependencies.dataRoot, context);
    prepareManagedSerenaConfig(paths);
    const provisioner = dependencies.provisioner ?? dependencies.createProvisioner?.(paths) ?? createSerenaEngineProvisioner({ paths });
    const provisioned = operation === 'repair'
      ? await provisioner.repairInstalledEngine()
      : await provisioner.ensureInstalled();
    const session = createSession();
    const plan = buildManagedSerenaLaunchPlan(provisioned.executablePath, context, paths);
    let connected: ManagedSerenaConnectResult;
    try {
      connected = await session.connect(plan);
    } catch {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    }
    if (connected.serverName !== 'Serena' || connected.serverVersion.length === 0) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    }
    active = { context, session, rootPid: connected.rootPid };

    try {
      await assertToolContract(session);
      await assertConfigHealth(session, context);
      await assertLspHealth(session);
      return {
        engine: 'serena',
        version: provisioned.version,
        serverName: connected.serverName,
        serverVersion: connected.serverVersion,
        toolCount: SERENA_ENGINE_MANIFEST.expectedToolNames.length,
        workspaceCanonicalRoot: context.canonicalRoot,
        projectName: context.projectName,
        lspReady: true,
      };
    } catch (error) {
      await runtime.stop();
      throw error;
    }
  };

  return runtime;
}

function buildManagedSerenaLaunchPlan(
  executablePath: string,
  context: CodingEngineWorkspaceContext,
  paths: SerenaRuntimePaths,
): ManagedSerenaLaunchPlan {
  return {
    command: executablePath,
    args: [
      'start-mcp-server',
      '--project',
      context.canonicalRoot,
      '--context',
      SERENA_ENGINE_MANIFEST.context,
      '--mode',
      SERENA_ENGINE_MANIFEST.modes[0],
      '--open-web-dashboard',
      'false',
    ],
    cwd: context.canonicalRoot,
    env: safeManagedRuntimeEnvironment({
      ...buildManagedUvEnvironment(paths),
      SERENA_HOME: paths.serenaHome,
    }),
  };
}

async function assertToolContract(session: ManagedSerenaMcpSession): Promise<void> {
  const names = (await session.listTools()).map((tool) => tool.name).sort();
  const expected = SERENA_ENGINE_MANIFEST.expectedToolNames;
  if (names.length !== expected.length) throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
  for (let index = 0; index < expected.length; index += 1) {
    if (names[index] !== expected[index]) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    }
  }
}

async function assertConfigHealth(
  session: ManagedSerenaMcpSession,
  context: CodingEngineWorkspaceContext,
): Promise<void> {
  const result = await session.callTool({ name: 'get_current_config' });
  const text = extractTextContent(result);
  if (!text.includes(`Serena version: ${SERENA_ENGINE_MANIFEST.version}`)) {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_VERSION_MISMATCH');
  }
  if (!text.includes(`Active project: ${context.projectName}`)) {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_PROJECT_MISMATCH');
  }
  if (!text.includes('Language backend: LSP') || !text.includes('Language server status:')) {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_LSP_UNAVAILABLE');
  }
}

async function assertLspHealth(session: ManagedSerenaMcpSession): Promise<void> {
  try {
    await session.callTool({
      name: 'find_symbol',
      arguments: {
        name_path_pattern: '__SUD_D_HEALTH_PROBE_DO_NOT_MATCH__',
        relative_path: '',
        include_body: false,
        max_matches: 1,
      },
    });
  } catch {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_LSP_UNAVAILABLE');
  }
}

function extractTextContent(result: unknown): string {
  if (typeof result === 'string') return result;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'object' && part !== null && 'text' in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === 'string' ? text : '';
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

async function cleanupObservedProcesses(
  observed: readonly number[],
  processSupervisor: ManagedSerenaProcessSupervisor,
  cleanupTimeoutMs: number,
  cleanupPollIntervalMs: number,
): Promise<void> {
  for (const pid of observed) {
    if (processSupervisor.isProcessAlive(pid)) processSupervisor.killProcessTree(pid);
  }
  const deadline = Date.now() + cleanupTimeoutMs;
  while (Date.now() < deadline) {
    if (observed.every((pid) => !processSupervisor.isProcessAlive(pid))) return;
    await new Promise((resolve) => setTimeout(resolve, cleanupPollIntervalMs));
  }
  throw new CodingEngineRuntimeFailure('CODING_ENGINE_STOP_FAILED');
}

class DefaultManagedSerenaMcpSession implements ManagedSerenaMcpSession {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(plan: ManagedSerenaLaunchPlan): Promise<ManagedSerenaConnectResult> {
    const client = new Client({ name: 'sud-d-coding-engine', version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: plan.command,
      args: [...plan.args],
      cwd: plan.cwd,
      env: { ...plan.env },
      stderr: 'pipe',
      maxBufferSize: 10 * 1024 * 1024,
    });
    await client.connect(transport);
    const rootPid = transport.pid;
    const serverVersion = client.getServerVersion();
    if (rootPid === null) throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    if (!serverVersion?.name || !serverVersion.version) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    }
    this.client = client;
    this.transport = transport;
    return { rootPid, serverName: serverVersion.name, serverVersion: serverVersion.version };
  }

  async listTools(): Promise<readonly ManagedSerenaToolDefinition[]> {
    if (!this.client) throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    const result = await this.client.listTools();
    return result.tools.map((tool) => ({
      name: tool.name,
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      inputSchema: tool.inputSchema ?? {},
    }));
  }

  async callTool(request: { readonly name: string; readonly arguments?: Record<string, unknown> }): Promise<unknown> {
    if (!this.client) throw new CodingEngineRuntimeFailure('CODING_ENGINE_START_FAILED');
    return this.client.callTool({ name: request.name, arguments: request.arguments ?? {} });
  }

  async close(): Promise<void> {
    if (this.client) await this.client.close();
    this.client = null;
    this.transport = null;
  }
}

interface ProcessPair {
  readonly ProcessId: number;
  readonly ParentProcessId: number;
}

function createWindowsProcessSupervisor(): ManagedSerenaProcessSupervisor {
  return {
    snapshotProcessTree(rootPid: number): readonly number[] {
      if (process.platform !== 'win32') return [rootPid];
      const script = `
$root = ${rootPid}
$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
$seen = @{}
$queue = New-Object System.Collections.Generic.Queue[int]
$queue.Enqueue($root)
while ($queue.Count -gt 0) {
  $current = $queue.Dequeue()
  if ($seen.ContainsKey($current)) { continue }
  $seen[$current] = $true
  foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $current }) {
    $queue.Enqueue([int]$child.ProcessId)
  }
}
$all | Where-Object { $seen.ContainsKey([int]$_.ProcessId) } | ConvertTo-Json -Compress
`;
      const result = spawnSync(powershellExecutable(), ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (result.status !== 0) return [rootPid];
      const output = result.stdout.trim();
      if (!output) return [rootPid];
      const parsed = JSON.parse(output) as ProcessPair | ProcessPair[];
      return (Array.isArray(parsed) ? parsed : [parsed]).map((entry) => entry.ProcessId);
    },

    isProcessAlive(pid: number): boolean {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },

    killProcessTree(pid: number): void {
      if (process.platform !== 'win32') return;
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    },
  };
}

function powershellExecutable(): string {
  return `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}
