import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export const SERENA_SPIKE_VERSION = '1.7.0';
export const SERENA_SPIKE_UPSTREAM_COMMIT = '949a27ef1e5fda1a6e7b561e777bcece345c6ffd';

export interface SerenaSpikePaths {
  readonly root: string;
  readonly toolDir: string;
  readonly binDir: string;
  readonly pythonDir: string;
  readonly cacheDir: string;
  readonly projectDir: string;
}

export interface SerenaDiscoveredTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: unknown;
}

export interface SerenaRuntimeSpikeOptions {
  readonly uvExecutable: string;
  readonly paths: SerenaSpikePaths;
  readonly fixtureSource: string;
  readonly platform?: NodeJS.Platform;
}

export interface SerenaRuntimeSpikeReport {
  readonly serenaVersion: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly SerenaDiscoveredTool[];
  readonly overviewText: string;
  readonly rootPid: number;
  readonly observedProcessIds: readonly number[];
  readonly cleanup: 'clean';
}

interface ProcessPair {
  readonly ProcessId: number;
  readonly ParentProcessId: number;
}

export function createSerenaSpikePaths(root: string): SerenaSpikePaths {
  return {
    root,
    toolDir: path.join(root, 'uv-tools'),
    binDir: path.join(root, 'bin'),
    pythonDir: path.join(root, 'python'),
    cacheDir: path.join(root, 'uv-cache'),
    projectDir: path.join(root, 'project'),
  };
}

export function buildUvEnvironment(paths: SerenaSpikePaths): Record<string, string> {
  return {
    UV_TOOL_DIR: paths.toolDir,
    UV_TOOL_BIN_DIR: paths.binDir,
    UV_PYTHON_INSTALL_DIR: paths.pythonDir,
    UV_CACHE_DIR: paths.cacheDir,
    UV_NO_MODIFY_PATH: '1',
  };
}

export function buildSerenaInstallArgs(): readonly string[] {
  return ['tool', 'install', '--python', '3.13', `serena-agent==${SERENA_SPIKE_VERSION}`];
}

export function buildSerenaServerArgs(projectDir: string): readonly string[] {
  return [
    'start-mcp-server',
    '--project', projectDir,
    '--context', 'desktop-app',
    '--mode', 'no-onboarding',
    '--open-web-dashboard', 'false',
  ];
}

function safeInheritedEnvironment(): Record<string, string> {
  const allow = [
    'ALLUSERSPROFILE',
    'APPDATA',
    'ComSpec',
    'LOCALAPPDATA',
    'NUMBER_OF_PROCESSORS',
    'OS',
    'Path',
    'PATH',
    'PATHEXT',
    'PROCESSOR_ARCHITECTURE',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'SystemDrive',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'windir',
  ];
  const next: Record<string, string> = {};
  for (const key of allow) {
    const value = process.env[key];
    if (typeof value === 'string' && value.length > 0) next[key] = value;
  }
  return next;
}

function ensureDirectory(pathToCreate: string): void {
  fs.mkdirSync(pathToCreate, { recursive: true });
}

function installSerena(uvExecutable: string, paths: SerenaSpikePaths): void {
  ensureDirectory(paths.root);
  execFileSync(uvExecutable, [...buildSerenaInstallArgs()], {
    env: { ...safeInheritedEnvironment(), ...buildUvEnvironment(paths) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveInstalledSerenaExecutable(paths: SerenaSpikePaths): string {
  const candidates = ['serena.exe', 'serena.cmd', 'serena'];
  for (const candidate of candidates) {
    const resolved = path.join(paths.binDir, candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  throw new Error('SERENA_SPIKE_EXECUTABLE_NOT_FOUND');
}

function readSerenaVersion(serenaExecutable: string, paths: SerenaSpikePaths): string {
  const stdout = execFileSync(serenaExecutable, ['--version'], {
    cwd: paths.projectDir,
    env: { ...safeInheritedEnvironment(), ...buildUvEnvironment(paths) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (!stdout.includes(SERENA_SPIKE_VERSION)) throw new Error('SERENA_SPIKE_VERSION_MISMATCH');
  return stdout.trim();
}

function powershellExecutable(): string {
  return path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function snapshotProcessTree(rootPid: number): readonly ProcessPair[] {
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
  if (result.status !== 0) return [{ ProcessId: rootPid, ParentProcessId: 0 }];
  const output = result.stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as ProcessPair | ProcessPair[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid: number): void {
  spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function cleanupProcesses(rootPid: number, observedPids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 5000;
  if (isProcessAlive(rootPid)) killProcessTree(rootPid);
  for (const pid of observedPids) {
    if (pid !== rootPid && isProcessAlive(pid)) killProcessTree(pid);
  }
  while (Date.now() < deadline) {
    const remaining = observedPids.filter(isProcessAlive);
    if (remaining.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('SERENA_SPIKE_CLEANUP_FAILED');
}

function extractTextContent(result: unknown): string {
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

function normalizeTools(tools: readonly unknown[]): readonly SerenaDiscoveredTool[] {
  return tools
    .map((tool) => {
      const candidate = tool as { name?: unknown; description?: unknown; inputSchema?: unknown };
      if (typeof candidate.name !== 'string') throw new Error('SERENA_SPIKE_TOOL_SCHEMA_INVALID');
      return {
        name: candidate.name,
        ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
        inputSchema: candidate.inputSchema ?? {},
      } satisfies SerenaDiscoveredTool;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function runSerenaRuntimeSpike(
  options: SerenaRuntimeSpikeOptions,
): Promise<SerenaRuntimeSpikeReport> {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') throw new Error('SERENA_SPIKE_WINDOWS_REQUIRED');
  if (!fs.existsSync(options.uvExecutable)) throw new Error('SERENA_SPIKE_UV_NOT_FOUND');
  if (!fs.existsSync(options.fixtureSource)) throw new Error('SERENA_SPIKE_FIXTURE_NOT_FOUND');
  if (!fs.existsSync(options.paths.projectDir)) throw new Error('SERENA_SPIKE_PROJECT_NOT_FOUND');

  installSerena(options.uvExecutable, options.paths);
  const serenaExecutable = resolveInstalledSerenaExecutable(options.paths);
  const serenaVersion = readSerenaVersion(serenaExecutable, options.paths);

  const env = { ...safeInheritedEnvironment(), ...buildUvEnvironment(options.paths) };
  const transport = new StdioClientTransport({
    command: serenaExecutable,
    args: [...buildSerenaServerArgs(options.paths.projectDir)],
    cwd: options.paths.projectDir,
    env,
    stderr: 'pipe',
    maxBufferSize: 10 * 1024 * 1024,
  });
  const client = new Client({ name: 'sud-d-serena-spike', version: '0.1.0' });
  let rootPid = 0;
  let observedProcessIds: readonly number[] = [];

  try {
    await client.connect(transport);
    rootPid = transport.pid ?? 0;
    if (rootPid === 0) throw new Error('SERENA_SPIKE_PID_UNAVAILABLE');
    const serverVersion = client.getServerVersion();
    if (!serverVersion?.name || !serverVersion.version) {
      throw new Error('SERENA_SPIKE_SERVER_VERSION_MISSING');
    }

    const listed = await client.listTools();
    const tools = normalizeTools(listed.tools);
    if (!tools.some((tool) => tool.name === 'get_symbols_overview')) {
      throw new Error('SERENA_SPIKE_GET_SYMBOLS_OVERVIEW_MISSING');
    }
    const overview = await client.callTool({
      name: 'get_symbols_overview',
      arguments: { relative_path: 'src/calculator.ts', depth: 1 },
    });
    const overviewText = extractTextContent(overview);
    if (!overviewText.includes('add') || !overviewText.includes('Calculator')) {
      throw new Error('SERENA_SPIKE_LSP_OVERVIEW_MISMATCH');
    }

    observedProcessIds = snapshotProcessTree(rootPid).map((entry) => entry.ProcessId);
    await client.close();
    await cleanupProcesses(rootPid, observedProcessIds);

    return {
      serenaVersion,
      serverName: serverVersion.name,
      serverVersion: serverVersion.version,
      tools,
      overviewText,
      rootPid,
      observedProcessIds,
      cleanup: 'clean',
    };
  } finally {
    if (rootPid !== 0) {
      try {
        await client.close();
      } catch {
        // best-effort close; cleanup below is authoritative
      }
      const pids = observedProcessIds.length > 0 ? observedProcessIds : [rootPid];
      await cleanupProcesses(rootPid, pids);
    }
  }
}
