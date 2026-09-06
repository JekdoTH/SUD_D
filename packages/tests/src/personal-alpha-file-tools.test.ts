import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  createWorkMemoryRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createToolCapabilityRegistry,
  createToolKernel,
  createWorkspaceFileCapabilities,
} from '@sud-d/application';
import {
  createProductionMcpServer,
  createStdioGatewayTransport,
} from '@sud-d/mcp-gateway';
import { evaluatePolicy, type InternalRoot, type ToolKernelResult } from '@sud-d/domain';

const APPROVED_TOOLS = [
  'workspace.list',
  'workspace.stat',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.create_text_file',
  'workspace.write_text_file',
] as const;
const GIT_SAFETY_TOOLS = ['git.detect', 'git.status', 'git.diff', 'git.checkpoint'] as const;
const TEAM_TOOLS = ['team.start', 'team.status', 'team.submit', 'team.stop'] as const;
const CODE_READ_TOOLS = ['code.overview', 'code.find_symbol', 'code.find_references', 'code.search', 'code.diagnostics'] as const;
const CODE_WRITE_TOOLS = ['code.replace_symbol', 'code.insert_before', 'code.insert_after', 'code.rename'] as const;
const VERIFY_TOOLS = ['verify.run'] as const;
const WORK_MEMORY_TOOLS = ['work.resume', 'work.checkpoint'] as const;
const APPROVED_PRODUCTION_TOOLS = [...APPROVED_TOOLS, ...GIT_SAFETY_TOOLS, ...TEAM_TOOLS, ...CODE_READ_TOOLS, ...CODE_WRITE_TOOLS, ...VERIFY_TOOLS, ...WORK_MEMORY_TOOLS] as const;

const LEGACY_PROTOCOL_VERSION = '2025-06-18';
const tempDirs: string[] = [];
const openDbs: Db[] = [];
let invocationCounter = 0;

interface TestJsonRpcMessage {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly result?: {
    readonly serverInfo?: { readonly name?: string };
    readonly tools?: Array<{ readonly name?: string }>;
    readonly content?: Array<{ readonly type?: string; readonly text?: string }>;
    readonly isError?: boolean;
  };
  readonly error?: unknown;
}

interface ListValue {
  readonly entries: Array<{ readonly name: string }>;
  readonly truncated: boolean;
}

interface ReadValue {
  readonly bytes: number;
}

interface SearchValue {
  readonly matches: Array<{ readonly relativePath: string }>;
  readonly truncated: boolean;
}

function kernelValue<T>(result: ToolKernelResult): T {
  if (!result.ok) throw new Error(`expected executed kernel result, got ${result.code}`);
  return result.value as T;
}

function kernelCauseCode(result: ToolKernelResult): string | undefined {
  return result.ok ? undefined : result.causeCode;
}

function responseToolNames(response: TestJsonRpcMessage): string[] {
  return (response.result?.tools ?? [])
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === 'string');
}

function tempDir(prefix = 'sudd-personal-alpha-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function openTrackedDb(filePath: string): Db {
  const db = openDatabase(filePath);
  openDbs.push(db);
  return db;
}

function canonical(filePath: string): string {
  const result = canonicalizePath(filePath);
  if (!result.ok) throw new Error(`failed to canonicalize test path: ${filePath}`);
  return result.value;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best-effort test cleanup */ }
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

interface HarnessOptions {
  readonly active?: boolean;
  readonly internalRoots?: readonly InternalRoot[];
}

async function makeHarness(options: HarnessOptions = {}) {
  const base = tempDir();
  const workspaceRoot = path.join(base, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const db = openTrackedDb(path.join(base, 'state', 'sud-d.db'));
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const workspace = workspaceRepo.save('Personal Alpha', canonical(workspaceRoot));
  if (options.active !== false) workspaceRepo.setActive(workspace.id);

  const fileSystem = createWorkspaceTextFileSystem();
  const capabilities = createWorkspaceFileCapabilities({
    workspaceRepo,
    internalRoots: [...(options.internalRoots ?? [])],
    fileSystem,
  });
  const registryResult = createToolCapabilityRegistry(capabilities);
  if (!registryResult.ok) throw new Error(`registry failure: ${registryResult.error.code}`);
  const approval = createApprovalCoordinator({ repository: createApprovalRepository(db) });
  const kernel = createToolKernel({ registry: registryResult.value, audit: auditRepo, approval });

  const invoke = (capability: string, input: unknown) => kernel.invoke({
    invocationId: `personal-alpha-${++invocationCounter}`,
    session: { id: 'personal-alpha-test', type: 'mcp-stdio' },
    capability,
    input,
  });

  return {
    base,
    workspaceRoot,
    db,
    workspaceRepo,
    auditRepo,
    workspace,
    fileSystem,
    capabilities,
    kernel,
    invoke,
  };
}

function createJsonLineReader(stream: NodeJS.ReadableStream) {
  let buffer = '';
  const queue: TestJsonRpcMessage[] = [];
  const waiters: Array<(message: TestJsonRpcMessage) => void> = [];
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line) as TestJsonRpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else queue.push(message);
    }
  });
  return {
    next(timeoutMs = 2500): Promise<TestJsonRpcMessage> {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP response')), timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

async function makeProductionWireHarness() {
  const h = await makeHarness();
  const server = createProductionMcpServer({
    workspaceRepo: h.workspaceRepo,
    auditRepo: h.auditRepo,
    internalRoots: [],
    fileSystem: h.fileSystem,
    teamRepo: createTeamRepository(h.db),
      teamTransitionUow: createTeamTransitionUnitOfWork(h.db),
    semanticRead: { read: async () => ({ content: [] }) },
    semanticWrite: { write: async () => ({ content: [] }) },
      restrictedVerify: { run: async (_context, request) => ({ action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 1 }) },
    workMemoryRepo: createWorkMemoryRepository(h.db),
  });
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createJsonLineReader(output);
  await server.connect(createStdioGatewayTransport(input, output));
  const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
  const initialize = async () => {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'personal-alpha-test', version: '1.0.0' },
      },
    });
    const response = await reader.next();
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 99, method: 'tools/call', params: { name: 'work.resume', arguments: {} } });
    await reader.next();
    return response;
  };
  return { ...h, server, input, output, reader, send, initialize };
}

function parseToolPayload(response: TestJsonRpcMessage): unknown {
  const text = response.result?.content?.find((item) => item.type === 'text')?.text;
  if (typeof text !== 'string') return undefined;
  return JSON.parse(text);
}

describe('Personal Alpha Workspace File Tools — policy and trusted composition', () => {
  it('credential create requires approval in the baseline policy', () => {
    expect(evaluatePolicy({ effect: 'create', sensitivity: 'credential', context: 'workspace' }).decision).toBe('ask');
  });

  it('registers exactly the six approved trusted production capabilities', async () => {
    const h = await makeHarness();
    expect(h.capabilities.map((capability) => capability.name).sort()).toEqual([...APPROVED_TOOLS].sort());
  });

  it('fixes trusted effects for all approved capabilities', async () => {
    const h = await makeHarness();
    expect(Object.fromEntries(h.capabilities.map((capability) => [capability.name, capability.effect]))).toEqual({
      'workspace.list': 'read',
      'workspace.stat': 'read',
      'workspace.read_text': 'read',
      'workspace.search_text': 'read',
      'workspace.create_text_file': 'create',
      'workspace.write_text_file': 'modify',
    });
  });

  it('caller cannot inject effect, sensitivity, context, handler, or workspace root', async () => {
    const h = await makeHarness();
    const outside = path.join(h.base, 'outside');
    fs.mkdirSync(outside);
    const result = await h.invoke('workspace.create_text_file', {
      relativePath: 'safe.txt',
      content: 'safe',
      effect: 'read',
      sensitivity: 'normal',
      context: 'workspace',
      handler: 'attacker',
      workspaceRoot: outside,
    });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'INVALID_INPUT' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'safe.txt'))).toBe(false);
    expect(fs.existsSync(path.join(outside, 'safe.txt'))).toBe(false);
  });
});

describe('Personal Alpha Workspace File Tools — workspace and path security', () => {
  it('normal relative path inside the active workspace resolves and reads', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'notes.txt'), 'hello workspace');
    const result = await h.invoke('workspace.read_text', { relativePath: 'notes.txt' });
    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', value: { content: 'hello workspace' } });
  });

  it('no active workspace blocks before filesystem execution', async () => {
    const h = await makeHarness({ active: false });
    const result = await h.invoke('workspace.create_text_file', { relativePath: 'blocked.txt', content: 'blocked' });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'WORKSPACE_NOT_FOUND' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'blocked.txt'))).toBe(false);
  });

  it('denies dot-dot traversal', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.read_text', { relativePath: '../outside.txt' });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INVALID_PATH' });
  });

  it('denies absolute drive paths', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.read_text', { relativePath: 'C:\\Windows\\win.ini' });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INVALID_PATH' });
  });

  it('denies UNC, device namespace, and ADS-style paths', async () => {
    const h = await makeHarness();
    const inputs = ['\\\\server\\share\\x.txt', '\\\\?\\C:\\x.txt', 'safe.txt:stream'];
    for (const relativePath of inputs) {
      const result = await h.invoke('workspace.read_text', { relativePath });
      expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'SECURITY_RESOLUTION_FAILED' });
    }
  });

  it('denies InternalRoot before ordinary workspace allowance', async () => {
    const h = await makeHarness();
    const internal = path.join(h.workspaceRoot, '.sud-internal');
    fs.mkdirSync(internal, { recursive: true });
    fs.writeFileSync(path.join(internal, 'state.txt'), 'internal');
    const capabilities = createWorkspaceFileCapabilities({
      workspaceRepo: h.workspaceRepo,
      internalRoots: [{ canonicalPath: canonical(internal), label: 'test internal root' }],
      fileSystem: h.fileSystem,
    });
    const registry = createToolCapabilityRegistry(capabilities);
    if (!registry.ok) throw new Error(`registry failure: ${registry.error.code}`);
    const kernel = createToolKernel({ registry: registry.value, audit: h.auditRepo });
    const result = await kernel.invoke({
      invocationId: `personal-alpha-${++invocationCounter}`,
      session: { id: 'personal-alpha-test', type: 'mcp-stdio' },
      capability: 'workspace.read_text',
      input: { relativePath: '.sud-internal/state.txt' },
    });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });
  });

  it('denies direct .git tree access', async () => {
    const h = await makeHarness();
    fs.mkdirSync(path.join(h.workspaceRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(h.workspaceRoot, '.git', 'config'), 'repo-internal');
    const result = await h.invoke('workspace.read_text', { relativePath: '.git/config' });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });
  });

  it('denies a junction alias that canonicalizes into .git for generic file access', async () => {
    const h = await makeHarness();
    const gitDir = path.join(h.workspaceRoot, '.git');
    const alias = path.join(h.workspaceRoot, 'repo-meta-alias');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'config'), 'git_internal_marker');
    try {
      fs.symlinkSync(gitDir, alias, 'junction');
    } catch {
      console.warn('SKIP .git junction-alias regression: junction creation unavailable');
      return;
    }
    const read = await h.invoke('workspace.read_text', { relativePath: 'repo-meta-alias/config' });
    const create = await h.invoke('workspace.create_text_file', { relativePath: 'repo-meta-alias/new.txt', content: 'blocked' });
    expect(read).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });
    expect(create).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });
    expect(fs.existsSync(path.join(gitDir, 'new.txt'))).toBe(false);
    expect(serialize(read)).not.toContain('git_internal_marker');
  });

  it('denies reparse/junction escape when junction creation is available', async () => {
    const h = await makeHarness();
    const outside = path.join(h.base, 'outside');
    const link = path.join(h.workspaceRoot, 'linked');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside-secret');
    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      console.warn('SKIP focused reparse assertion: junction creation unavailable in this Windows session');
      return;
    }
    const result = await h.invoke('workspace.read_text', { relativePath: 'linked/outside.txt' });
    expect(result.ok).toBe(false);
    expect(['PATH_OUTSIDE_WORKSPACE', 'REPARSE_POINT_DENIED']).toContain(kernelCauseCode(result));
    expect(serialize(result)).not.toContain('outside-secret');
  });

  it('path/security resolution failure produces no create side effect', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.create_text_file', { relativePath: '../blocked.txt', content: 'blocked' });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(path.join(h.base, 'blocked.txt'))).toBe(false);
  });
});

describe('Personal Alpha Workspace File Tools — list/stat/read', () => {
  it('list returns bounded deterministic safe entries', async () => {
    const h = await makeHarness();
    for (let i = 0; i < 205; i += 1) {
      fs.writeFileSync(path.join(h.workspaceRoot, `file-${String(i).padStart(3, '0')}.txt`), `value ${i}`);
    }
    fs.mkdirSync(path.join(h.workspaceRoot, '.git'));
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'SECRET_MARKER=hidden');
    const result = await h.invoke('workspace.list', { relativePath: '.', limit: 200 });
    expect(result.ok).toBe(true);
    const value = kernelValue<ListValue>(result);
    expect(value.entries).toHaveLength(200);
    expect(value.truncated).toBe(true);
    expect(value.entries.map((entry) => entry.name)).toEqual([...value.entries.map((entry) => entry.name)].sort());
    expect(value.entries.some((entry) => entry.name === '.git' || entry.name === '.env')).toBe(false);
  });

  it('caller list limit may reduce output but cannot exceed hard cap', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'a.txt'), 'a');
    fs.writeFileSync(path.join(h.workspaceRoot, 'b.txt'), 'b');
    const limited = await h.invoke('workspace.list', { relativePath: '.', limit: 1 });
    expect(kernelValue<ListValue>(limited).entries).toHaveLength(1);
    expect(await h.invoke('workspace.list', { relativePath: '.', limit: 201 })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('stat returns safe metadata without absolute host path leakage', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'meta.txt'), 'metadata');
    const result = await h.invoke('workspace.stat', { relativePath: 'meta.txt' });
    expect(result).toMatchObject({ ok: true, value: { relativePath: 'meta.txt', kind: 'file', size: 8 } });
    expect(serialize(result)).not.toContain(h.workspaceRoot);
  });

  it('read returns normal UTF-8 text with bounded metadata', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'utf8.txt'), 'สวัสดี SUD-D', 'utf8');
    const result = await h.invoke('workspace.read_text', { relativePath: 'utf8.txt' });
    expect(result).toMatchObject({ ok: true, value: { relativePath: 'utf8.txt', content: 'สวัสดี SUD-D' } });
    expect(kernelValue<ReadValue>(result).bytes).toBeGreaterThan(0);
  });

  it('read directory as text fails safely', async () => {
    const h = await makeHarness();
    fs.mkdirSync(path.join(h.workspaceRoot, 'folder'));
    const result = await h.invoke('workspace.read_text', { relativePath: 'folder' });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TYPE_UNSUPPORTED' });
  });

  it('binary/non-text read fails safely', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'binary.bin'), Buffer.from([0, 1, 2, 255, 0, 10]));
    const result = await h.invoke('workspace.read_text', { relativePath: 'binary.bin' });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'TEXT_CONTENT_INVALID' });
  });

  it('oversized read is rejected at the trusted cap', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'large.txt'), 'a'.repeat(262_145), 'utf8');
    const result = await h.invoke('workspace.read_text', { relativePath: 'large.txt' });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TOO_LARGE' });
  });

  it('credential-like read returns approval-required and does not expose content', async () => {
    const h = await makeHarness();
    const marker = 'credential_marker_alpha_read';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env.local'), `TOKEN=${marker}`);
    const result = await h.invoke('workspace.read_text', { relativePath: '.env.local' });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(serialize(result)).not.toContain(marker);
  });
});

describe('Personal Alpha Workspace File Tools — search', () => {
  it('literal search finds expected normal text inside workspace', async () => {
    const h = await makeHarness();
    fs.mkdirSync(path.join(h.workspaceRoot, 'src'));
    fs.writeFileSync(path.join(h.workspaceRoot, 'src', 'a.txt'), 'one\nneedle here\nthree');
    fs.writeFileSync(path.join(h.workspaceRoot, 'src', 'b.txt'), 'no match');
    const result = await h.invoke('workspace.search_text', { relativePath: 'src', query: 'needle' });
    expect(result).toMatchObject({ ok: true, value: { matches: [{ relativePath: 'src/a.txt', line: 2 }] } });
  });

  it('search cannot escape selected workspace/subtree', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.search_text', { relativePath: '../', query: 'needle' });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INVALID_PATH' });
  });

  it('search skips binary files safely', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'binary.bin'), Buffer.from([0, 110, 101, 101, 100, 108, 101, 0]));
    fs.writeFileSync(path.join(h.workspaceRoot, 'text.txt'), 'needle text');
    const result = await h.invoke('workspace.search_text', { relativePath: '.', query: 'needle' });
    expect(result.ok).toBe(true);
    expect(kernelValue<SearchValue>(result).matches.map((m) => m.relativePath)).toEqual(['text.txt']);
  });

  it('search result count/output is bounded and caller cannot raise cap', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'many.txt'), Array.from({ length: 150 }, (_, i) => `needle-${i}`).join('\n'));
    const result = await h.invoke('workspace.search_text', { relativePath: '.', query: 'needle', limit: 100 });
    expect(result.ok).toBe(true);
    expect(kernelValue<SearchValue>(result).matches).toHaveLength(100);
    expect(kernelValue<SearchValue>(result).truncated).toBe(true);
    expect(await h.invoke('workspace.search_text', { relativePath: '.', query: 'needle', limit: 101 })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('search does not silently expose credential-like content', async () => {
    const h = await makeHarness();
    const marker = 'credential_marker_alpha_search';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), `needle=${marker}`);
    fs.writeFileSync(path.join(h.workspaceRoot, '.env.example'), 'needle=example');
    const result = await h.invoke('workspace.search_text', { relativePath: '.', query: 'needle' });
    expect(result.ok).toBe(true);
    expect(serialize(result)).not.toContain(marker);
    expect(kernelValue<SearchValue>(result).matches.map((m) => m.relativePath)).toEqual(['.env.example']);
  });

  it('search never traverses .git content', async () => {
    const h = await makeHarness();
    fs.mkdirSync(path.join(h.workspaceRoot, '.git'));
    fs.writeFileSync(path.join(h.workspaceRoot, '.git', 'config'), 'needle=repo-secret');
    fs.writeFileSync(path.join(h.workspaceRoot, 'visible.txt'), 'needle=visible');
    const result = await h.invoke('workspace.search_text', { relativePath: '.', query: 'needle' });
    expect(result.ok).toBe(true);
    expect(kernelValue<SearchValue>(result).matches.map((m) => m.relativePath)).toEqual(['visible.txt']);
    expect(serialize(result)).not.toContain('repo-secret');
  });

  it('search query length and empty queries are strictly bounded', async () => {
    const h = await makeHarness();
    expect(await h.invoke('workspace.search_text', { relativePath: '.', query: '' })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await h.invoke('workspace.search_text', { relativePath: '.', query: 'x'.repeat(257) })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });
});

describe('Personal Alpha Workspace File Tools — create/write', () => {
  it('create normal new text file succeeds', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.create_text_file', { relativePath: 'created.txt', content: 'created content' });
    expect(result).toMatchObject({ ok: true, value: { relativePath: 'created.txt' } });
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'created.txt'), 'utf8')).toBe('created content');
  });

  it('create fails if target already exists without changing it', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'existing.txt'), 'original');
    const result = await h.invoke('workspace.create_text_file', { relativePath: 'existing.txt', content: 'replacement' });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_ALREADY_EXISTS' });
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'existing.txt'), 'utf8')).toBe('original');
  });

  it('write normal existing text file succeeds', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'write.txt'), 'before');
    const result = await h.invoke('workspace.write_text_file', { relativePath: 'write.txt', content: 'after' });
    expect(result).toMatchObject({ ok: true, value: { relativePath: 'write.txt' } });
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'write.txt'), 'utf8')).toBe('after');
  });

  it('write fails if target does not exist and does not create it', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.write_text_file', { relativePath: 'missing.txt', content: 'no create' });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'RESOURCE_NOT_FOUND' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'missing.txt'))).toBe(false);
  });

  it('create/write refuse directory and non-regular targets', async () => {
    const h = await makeHarness();
    fs.mkdirSync(path.join(h.workspaceRoot, 'folder'));
    const createResult = await h.invoke('workspace.create_text_file', { relativePath: 'folder', content: 'x' });
    const writeResult = await h.invoke('workspace.write_text_file', { relativePath: 'folder', content: 'x' });
    expect(createResult.ok).toBe(false);
    expect(writeResult).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TYPE_UNSUPPORTED' });
  });

  it('write cannot escape workspace via traversal', async () => {
    const h = await makeHarness();
    const outside = path.join(h.base, 'outside.txt');
    fs.writeFileSync(outside, 'outside-original');
    const result = await h.invoke('workspace.write_text_file', { relativePath: '../outside.txt', content: 'attack' });
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(outside, 'utf8')).toBe('outside-original');
  });

  it('credential-like write returns approval-required and does not mutate', async () => {
    const h = await makeHarness();
    const filePath = path.join(h.workspaceRoot, '.npmrc');
    fs.writeFileSync(filePath, 'credential_marker_original');
    const result = await h.invoke('workspace.write_text_file', { relativePath: '.npmrc', content: 'credential_marker_attack' });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'APPROVAL_REQUIRED' });
    expect(fs.readFileSync(filePath, 'utf8')).toBe('credential_marker_original');
  });

  it('credential-like create never silently executes', async () => {
    const h = await makeHarness();
    const result = await h.invoke('workspace.create_text_file', { relativePath: '.env.local', content: 'credential_marker_new' });
    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'APPROVAL_REQUIRED' });
    expect(fs.existsSync(path.join(h.workspaceRoot, '.env.local'))).toBe(false);
  });

  it('failed create leaves the existing target intact and no temporary sibling behind', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'stable.txt'), 'stable-original');
    await h.invoke('workspace.create_text_file', { relativePath: 'stable.txt', content: 'attack' });
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'stable.txt'), 'utf8')).toBe('stable-original');
    expect(fs.readdirSync(h.workspaceRoot).some((name) => name.startsWith('.sud-d-tmp-'))).toBe(false);
  });

  it('write/create UTF-8 payload size hard cap is enforced before mutation', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'stable.txt'), 'stable');
    const huge = 'a'.repeat(262_145);
    expect(await h.invoke('workspace.create_text_file', { relativePath: 'huge.txt', content: huge })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(await h.invoke('workspace.write_text_file', { relativePath: 'stable.txt', content: huge })).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'huge.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'stable.txt'), 'utf8')).toBe('stable');
  });

  it('production capability surface exposes no delete/rename/move side effect', async () => {
    const h = await makeHarness();
    const names = h.capabilities.map((capability) => capability.name).join(' ');
    expect(names).not.toMatch(/delete|rename|move|git|execute|shell|network/i);
  });
});

describe('Personal Alpha Workspace File Tools — audit and leakage', () => {
  it('successful file invocation produces normal Kernel audit evidence', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'audit.txt'), 'audit-safe');
    await h.invoke('workspace.read_text', { relativePath: 'audit.txt' });
    const events = h.auditRepo.list(10);
    expect(events.some((event) => event.action === 'tool_kernel.invoke' && event.resultCode === 'EXECUTION_AUTHORIZED')).toBe(true);
    expect(events.some((event) => event.action === 'tool_kernel.invoke' && event.resultCode === 'EXECUTED')).toBe(true);
  });

  it('blocked invocation is audited through existing Kernel semantics', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'credential_marker_blocked');
    await h.invoke('workspace.read_text', { relativePath: '.env' });
    expect(h.auditRepo.list(10).some((event) => event.resultCode === 'APPROVAL_REQUIRED' && event.policyDecision === 'ask')).toBe(true);
  });

  it('raw read content is never written into audit', async () => {
    const h = await makeHarness();
    const marker = 'raw_read_content_marker_alpha';
    fs.writeFileSync(path.join(h.workspaceRoot, 'audit-read.txt'), marker);
    await h.invoke('workspace.read_text', { relativePath: 'audit-read.txt' });
    expect(serialize(h.auditRepo.list(20))).not.toContain(marker);
  });

  it('write payload is never written into audit', async () => {
    const h = await makeHarness();
    const marker = 'raw_write_payload_marker_alpha';
    fs.writeFileSync(path.join(h.workspaceRoot, 'audit-write.txt'), 'before');
    await h.invoke('workspace.write_text_file', { relativePath: 'audit-write.txt', content: marker });
    expect(serialize(h.auditRepo.list(20))).not.toContain(marker);
  });

  it('credential-like values are absent from audit and safe result output', async () => {
    const h = await makeHarness();
    const marker = 'credential_marker_never_serialize';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env.local'), marker);
    const result = await h.invoke('workspace.read_text', { relativePath: '.env.local' });
    expect(serialize(result)).not.toContain(marker);
    expect(serialize(h.auditRepo.list(20))).not.toContain(marker);
  });
});

describe('Personal Alpha Workspace File Tools — production MCP boundary', () => {
  it('production tools/list contains exactly the approved production tools', async () => {
    const h = await makeProductionWireHarness();
    const initialized = await h.initialize();
    expect(initialized.result?.serverInfo?.name).toBe('SUD-D');
    h.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const response = await h.reader.next();
    expect(responseToolNames(response).sort()).toEqual([...APPROVED_PRODUCTION_TOOLS].sort());
    await h.server.close();
  });

  it('Delete, Execute, Network, and unapproved Git tools remain absent', async () => {
    const h = await makeProductionWireHarness();
    await h.initialize();
    h.send({ jsonrpc: '2.0', id: 3, method: 'tools/list', params: {} });
    const response = await h.reader.next();
    const names = responseToolNames(response).join(' ');
    expect(names).not.toMatch(/workspace\.(?:delete|rename|move)|execute|shell|network|git\.(?:push|pull|fetch|clone|run)|code\.run/i);
    await h.server.close();
  });

  it('malformed MCP input with privileged override fields fails closed', async () => {
    const h = await makeProductionWireHarness();
    await h.initialize();
    h.send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'workspace.read_text',
        arguments: { relativePath: 'anything.txt', workspaceRoot: 'C:\\', effect: 'read' },
      },
    });
    const response = await h.reader.next();
    expect(response.id).toBe(4);
    expect(response.error ?? response.result?.isError).toBeTruthy();
    expect(serialize(response)).not.toMatch(/stack|node_modules|workspaceRoot.*C:\\\\/i);
    await h.server.close();
  });

  it('production MCP read routes through Kernel and returns safe bounded JSON', async () => {
    const h = await makeProductionWireHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'mcp.txt'), 'mcp hello');
    await h.initialize();
    h.send({
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'workspace.read_text', arguments: { relativePath: 'mcp.txt' } },
    });
    const response = await h.reader.next();
    const payload = parseToolPayload(response);
    expect(payload).toMatchObject({ ok: true, code: 'EXECUTED', value: { relativePath: 'mcp.txt', content: 'mcp hello' } });
    expect(h.auditRepo.list(10).some((event) => event.resultCode === 'EXECUTED')).toBe(true);
    await h.server.close();
  });

  it('raw OS exception text/stack is not returned through MCP', async () => {
    const h = await makeProductionWireHarness();
    await h.initialize();
    h.send({
      jsonrpc: '2.0', id: 6, method: 'tools/call',
      params: { name: 'workspace.read_text', arguments: { relativePath: 'missing.txt' } },
    });
    const response = await h.reader.next();
    expect(serialize(response)).not.toMatch(/ENOENT|stack|node_modules|at Object\.|at .*\.ts:/i);
    await h.server.close();
  });
});
