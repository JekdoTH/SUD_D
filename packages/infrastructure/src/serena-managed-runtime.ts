import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  CodingEngineRuntimeFailure,
  type CodingEngineRuntimeHealth,
  type CodingEngineWorkspaceContext,
  type CodingSemanticReadRequest,
  type CodingSemanticWriteRequest,
} from '@sud-d/domain';
import { createSerenaEngineProvisioner, safeManagedRuntimeEnvironment, buildManagedUvEnvironment, type SerenaEngineProvisioner } from './serena-engine-provisioner.js';
import { SERENA_ENGINE_MANIFEST, type SerenaExpectedToolName } from './serena-engine-manifest.js';
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
  readonly validatedToolNames: ReadonlySet<SerenaExpectedToolName>;
}

const DEFAULT_CLEANUP_TIMEOUT_MS = 5000;
const DEFAULT_CLEANUP_POLL_INTERVAL_MS = 100;
const SEMANTIC_READ_MAX_ANSWER_CHARS = 20_000;

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

    async semanticRead(context: CodingEngineWorkspaceContext, request: CodingSemanticReadRequest): Promise<unknown> {
      if (!active) {
        await startInternal(context, 'start');
      } else if (!workspaceContextMatches(active.context, context)) {
        await runtime.stop();
        await startInternal(context, 'start');
      }
      const current = active;
      if (!current) throw new CodingEngineRuntimeFailure('CODING_ENGINE_UNAVAILABLE');
      const mapped = mapSemanticReadRequest(request);
      if (!SERENA_ENGINE_MANIFEST.expectedToolNames.includes(mapped.name)
        || !current.validatedToolNames.has(mapped.name)) {
        throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
      }
      return callMappedTool(current.session, mapped);
    },

    async semanticWrite(context: CodingEngineWorkspaceContext, request: CodingSemanticWriteRequest): Promise<unknown> {
      if (!active) {
        await startInternal(context, 'start');
      } else if (!workspaceContextMatches(active.context, context)) {
        await runtime.stop();
        await startInternal(context, 'start');
      }
      const current = active;
      if (!current) throw new CodingEngineRuntimeFailure('CODING_ENGINE_UNAVAILABLE');
      const mapped = mapSemanticWriteRequest(request);
      if (!SERENA_ENGINE_MANIFEST.expectedToolNames.includes(mapped.name)
        || !current.validatedToolNames.has(mapped.name)) {
        throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
      }
      return callMappedTool(current.session, mapped);
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
    active = { context, session, rootPid: connected.rootPid, validatedToolNames: new Set<SerenaExpectedToolName>() };

    try {
      const validatedToolNames = await assertToolContract(session);
      active = { context, session, rootPid: connected.rootPid, validatedToolNames };
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

function workspaceContextMatches(left: CodingEngineWorkspaceContext, right: CodingEngineWorkspaceContext): boolean {
  return left.workspaceId === right.workspaceId
    && left.canonicalRoot === right.canonicalRoot
    && left.projectName === right.projectName;
}

async function callMappedTool(
  session: ManagedSerenaMcpSession,
  request: { readonly name: SerenaExpectedToolName; readonly arguments: Record<string, unknown> },
): Promise<unknown> {
  try {
    const result = await session.callTool({ name: request.name, arguments: request.arguments });
    if (isMcpToolErrorResult(result)) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_UNAVAILABLE');
    }
    return result;
  } catch {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_UNAVAILABLE');
  }
}

function isMcpToolErrorResult(value: unknown): boolean {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as { readonly isError?: unknown }).isError === true;
}

function mapSemanticReadRequest(request: CodingSemanticReadRequest): {
  readonly name: SerenaExpectedToolName;
  readonly arguments: Record<string, unknown>;
} {
  switch (request.capability) {
    case 'code.overview':
      return {
        name: 'get_symbols_overview',
        arguments: {
          relative_path: request.input.relativePath,
          ...(request.input.depth !== undefined ? { depth: request.input.depth } : {}),
          max_answer_chars: SEMANTIC_READ_MAX_ANSWER_CHARS,
        },
      };
    case 'code.find_symbol':
      return {
        name: 'find_symbol',
        arguments: {
          name_path_pattern: request.input.namePathPattern,
          relative_path: request.input.relativePath ?? '',
          ...(request.input.depth !== undefined ? { depth: request.input.depth } : {}),
          ...(request.input.includeBody !== undefined ? { include_body: request.input.includeBody } : {}),
          ...(request.input.substringMatching !== undefined ? { substring_matching: request.input.substringMatching } : {}),
          ...(request.input.maxMatches !== undefined ? { max_matches: request.input.maxMatches } : {}),
          max_answer_chars: SEMANTIC_READ_MAX_ANSWER_CHARS,
        },
      };
    case 'code.find_references':
      return {
        name: 'find_referencing_symbols',
        arguments: {
          name_path: request.input.namePath,
          relative_path: request.input.relativePath,
          max_answer_chars: SEMANTIC_READ_MAX_ANSWER_CHARS,
        },
      };
    case 'code.search':
      return {
        name: 'search_for_pattern',
        arguments: {
          substring_pattern: request.input.pattern,
          relative_path: request.input.relativePath ?? '',
          ...(request.input.codeOnly !== undefined ? { restrict_search_to_code_files: request.input.codeOnly } : {}),
          max_answer_chars: SEMANTIC_READ_MAX_ANSWER_CHARS,
        },
      };
    case 'code.diagnostics':
      return {
        name: 'get_diagnostics_for_file',
        arguments: {
          relative_path: request.input.relativePath,
          ...(request.input.startLine !== undefined ? { start_line: request.input.startLine } : {}),
          ...(request.input.endLine !== undefined ? { end_line: request.input.endLine } : {}),
          ...(request.input.minSeverity !== undefined ? { min_severity: request.input.minSeverity } : {}),
          max_answer_chars: SEMANTIC_READ_MAX_ANSWER_CHARS,
        },
      };
    default:
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
  }
}

function mapSemanticWriteRequest(request: CodingSemanticWriteRequest): {
  readonly name: SerenaExpectedToolName;
  readonly arguments: Record<string, unknown>;
} {
  switch (request.capability) {
    case 'code.replace_symbol':
      return {
        name: 'replace_symbol_body',
        arguments: {
          name_path: request.input.namePath,
          relative_path: request.input.relativePath,
          body: request.input.body,
        },
      };
    case 'code.insert_before':
      return {
        name: 'insert_before_symbol',
        arguments: {
          name_path: request.input.namePath,
          relative_path: request.input.relativePath,
          body: request.input.body,
        },
      };
    case 'code.insert_after':
      return {
        name: 'insert_after_symbol',
        arguments: {
          name_path: request.input.namePath,
          relative_path: request.input.relativePath,
          body: request.input.body,
        },
      };
    case 'code.rename':
      return {
        name: 'rename_symbol',
        arguments: {
          name_path: request.input.namePath,
          relative_path: request.input.relativePath,
          new_name: request.input.newName,
        },
      };
    default:
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
  }
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

function canonicalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJsonValue);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    return value;
  }
  if (typeof value !== 'object') {
    throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalizeJsonValue(record[key])]),
  );
}

function toolInputSchemaMatches(actual: unknown, expected: unknown): boolean {
  try {
    return JSON.stringify(canonicalizeJsonValue(actual)) === JSON.stringify(canonicalizeJsonValue(expected));
  } catch {
    return false;
  }
}

async function assertToolContract(session: ManagedSerenaMcpSession): Promise<ReadonlySet<SerenaExpectedToolName>> {
  const discovered = await session.listTools();
  const expectedNames = SERENA_ENGINE_MANIFEST.expectedToolNames;
  const expectedNameSet = new Set<string>(expectedNames);
  const definitionsByName = new Map<string, ManagedSerenaToolDefinition>();

  for (const definition of discovered) {
    if (definitionsByName.has(definition.name) && expectedNameSet.has(definition.name)) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    }
    if (!definitionsByName.has(definition.name)) definitionsByName.set(definition.name, definition);
  }

  const validated = new Set<SerenaExpectedToolName>();
  for (const name of expectedNames) {
    const definition = definitionsByName.get(name);
    const expectedSchema = SERENA_ENGINE_MANIFEST.expectedToolInputSchemas[name];
    if (!definition || !toolInputSchemaMatches(definition.inputSchema, expectedSchema)) {
      throw new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    }
    validated.add(name);
  }
  return validated;
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
