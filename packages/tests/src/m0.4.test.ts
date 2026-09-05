import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

const LEGACY_PROTOCOL_VERSION = '2025-06-18';
const PERSONAL_ALPHA_WORKSPACE_TOOLS = [
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
const APPROVED_PRODUCTION_TOOLS = [...PERSONAL_ALPHA_WORKSPACE_TOOLS, ...GIT_SAFETY_TOOLS, ...TEAM_TOOLS, ...CODE_READ_TOOLS, ...CODE_WRITE_TOOLS, ...VERIFY_TOOLS, ...WORK_MEMORY_TOOLS] as const;
const children = new Set<ChildProcessWithoutNullStreams>();

interface TestJsonRpcMessage {
  readonly jsonrpc?: string;
  readonly id?: string | number | null;
  readonly result?: {
    readonly protocolVersion?: string;
    readonly capabilities?: {
      readonly tools?: { readonly listChanged?: boolean };
      readonly resources?: unknown;
      readonly prompts?: unknown;
      readonly logging?: unknown;
    };
    readonly serverInfo?: { readonly name?: string; readonly version?: string };
    readonly tools?: unknown[];
  };
  readonly error?: {
    readonly code?: number;
    readonly message?: string;
    readonly data?: unknown;
  };
}

afterEach(() => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  children.clear();
});

async function loadGateway() {
  return import('@sud-d/mcp-gateway');
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
      const parsed = JSON.parse(line) as TestJsonRpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(parsed);
      else queue.push(parsed);
    }
  });

  return {
    next(timeoutMs = 2000): Promise<TestJsonRpcMessage> {
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

async function createWireHarness() {
  const api = await loadGateway();
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createJsonLineReader(output);
  const gateway = api.createInertMcpGateway();
  const transport = api.createStdioGatewayTransport(input, output);
  await gateway.start(transport);

  const send = (message: unknown) => {
    input.write(`${JSON.stringify(message)}\n`);
  };

  const initialize = async () => {
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'sud-d-m0.4-test', version: '1.0.0' },
      },
    });
    const response = await reader.next();
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    return response;
  };

  return { api, gateway, input, output, reader, send, initialize };
}

function sourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('M0.4 — inert MCP gateway', () => {
  it('completes MCP initialize/handshake with stable SUD-D identity', async () => {
    const { api, gateway, initialize } = await createWireHarness();
    const response = await initialize();

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        serverInfo: api.MCP_GATEWAY_INFO,
      },
    });
    await gateway.stop();
  });

  it('keeps server identity minimal and free of sensitive machine metadata', async () => {
    const { gateway, initialize } = await createWireHarness();
    const response = await initialize();
    const serialized = JSON.stringify(response);

    expect(serialized).toContain('SUD-D');
    expect(serialized).not.toMatch(/[A-Z]:\\/);
    expect(serialized).not.toMatch(/\\Users\\/i);
    expect(serialized).not.toMatch(/api[_-]?key|access[_-]?token|refresh[_-]?token|credential|tunnel[_-]?id|environment/i);
    await gateway.stop();
  });

  it('declares only the minimal tools capability and exposes an empty tools/list', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    const initialized = await initialize();

    expect(initialized.result?.capabilities).toEqual({ tools: { listChanged: false } });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    await expect(reader.next()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: { tools: [] },
    });
    await gateway.stop();
  });

  it('rejects tools/call for an unregistered tool without execution side effects', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    await initialize();

    send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'nonexistent-tool', arguments: {} },
    });
    const response = await reader.next();
    expect(response.id).toBe(3);
    expect(response.error).toBeTruthy();
    expect(JSON.stringify(response)).not.toMatch(/stack|node_modules|child_process|spawn/i);
    await gateway.stop();
  });

  it('fails malformed MCP request params safely and remains healthy', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    await initialize();

    send({ jsonrpc: '2.0', id: 4, method: 'tools/list', params: { cursor: 42 } });
    const malformed = await reader.next();
    expect(malformed.id).toBe(4);
    expect(malformed.error).toBeTruthy();
    expect(JSON.stringify(malformed)).not.toMatch(/stack|node_modules/i);

    send({ jsonrpc: '2.0', id: 5, method: 'ping', params: {} });
    await expect(reader.next()).resolves.toMatchObject({ jsonrpc: '2.0', id: 5, result: {} });
    await gateway.stop();
  });

  it('returns a safe error for an unknown MCP method and does not crash', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    await initialize();

    send({ jsonrpc: '2.0', id: 6, method: 'sud-d/unknown', params: {} });
    const unknown = await reader.next();
    expect(unknown.id).toBe(6);
    expect(unknown.error).toBeTruthy();

    send({ jsonrpc: '2.0', id: 7, method: 'ping', params: {} });
    await expect(reader.next()).resolves.toMatchObject({ jsonrpc: '2.0', id: 7, result: {} });
    await gateway.stop();
  });

  it('starts and stops deterministically while mapping transport client state', async () => {
    const api = await loadGateway();
    const gateway = api.createInertMcpGateway();
    const input = new PassThrough();
    const output = new PassThrough();

    expect(gateway.getStatus()).toEqual({ gateway: 'stopped', client: 'disconnected' });
    await gateway.start(api.createStdioGatewayTransport(input, output));
    expect(gateway.getStatus()).toEqual({ gateway: 'healthy', client: 'connected' });
    await gateway.stop();
    expect(gateway.getStatus()).toEqual({ gateway: 'stopped', client: 'disconnected' });
  });

  it('treats duplicate start and stop as deterministic idempotent lifecycle operations', async () => {
    const api = await loadGateway();
    const gateway = api.createInertMcpGateway();
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = api.createStdioGatewayTransport(input, output);

    await gateway.start(transport);
    await gateway.start(transport);
    expect(gateway.getStatus()).toEqual({ gateway: 'healthy', client: 'connected' });
    await gateway.stop();
    await gateway.stop();
    expect(gateway.getStatus()).toEqual({ gateway: 'stopped', client: 'disconnected' });
  });

  it('maps transport start failures to a typed safe gateway error', async () => {
    const api = await loadGateway();
    const gateway = api.createInertMcpGateway();
    const transport = {
      onclose: undefined,
      onerror: undefined,
      onmessage: undefined,
      async start() {
        throw new Error('sk-secret-raw-start-failure');
      },
      async send() {},
      async close() {},
    } as Parameters<typeof gateway.start>[0];

    await expect(gateway.start(transport)).rejects.toMatchObject({
      code: 'MCP_GATEWAY_START_FAILED',
      message: 'MCP gateway failed to start',
    });
    expect(gateway.getStatus()).toEqual({ gateway: 'error', client: 'disconnected' });
  });

  it('keeps protocol responses free of raw secret/error internals', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    await initialize();

    send({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'missing', arguments: {} } });
    const response = await reader.next();
    const serialized = JSON.stringify(response);
    expect(serialized).not.toMatch(/sk-secret|api[_-]?key|access[_-]?token|refresh[_-]?token|credential value|raw stack|node_modules/i);
    await gateway.stop();
  });

  it('does not expose prompts, resources, logging, or privileged capability declarations', async () => {
    const { gateway, initialize } = await createWireHarness();
    const response = await initialize();
    expect(response.result?.capabilities).toEqual({ tools: { listChanged: false } });
    expect(response.result?.capabilities?.resources).toBeUndefined();
    expect(response.result?.capabilities?.prompts).toBeUndefined();
    expect(response.result?.capabilities?.logging).toBeUndefined();
    await gateway.stop();
  });

  it('keeps the public gateway lifecycle API fixed-purpose without execution controls', async () => {
    const api = await loadGateway();
    const gateway = api.createInertMcpGateway();
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(gateway)).sort();
    expect(methods).toEqual(['constructor', 'getStatus', 'start', 'stop']);
    expect(methods.join(' ')).not.toMatch(/execute|spawn|command|argv|cwd|env|shell|network/i);
  });

  it('keeps production gateway composition limited to approved fixed tools without direct host-control imports', () => {
    const root = path.resolve(process.cwd(), 'packages/mcp-gateway/src');
    const source = sourceFiles(root).map((file) => fs.readFileSync(file, 'utf8')).join('\n');

    expect(source).not.toMatch(/node:(?:fs|child_process|net|http|https)/);
    expect(source).not.toMatch(/@sud-d\/desktop/);
    expect(source).not.toMatch(/registerResource\s*\(|registerPrompt\s*\(/);
    expect(source).not.toMatch(/console\.log\s*\(/);
    for (const toolName of APPROVED_PRODUCTION_TOOLS) {
      expect(source).toContain(`'${toolName}'`);
    }
    expect((source.match(/registerTool\s*\(/g) ?? [])).toHaveLength(APPROVED_PRODUCTION_TOOLS.length);
    expect(source).not.toMatch(/workspace\.(?:delete|rename|move)|git\.(?:push|pull|fetch|clone|run)/i);
    expect(source).not.toMatch(/registerTool\s*\(\s*['"][^'"]*(?:execute|shell|network|delete|recovery)[^'"]*['"]/i);
    expect(source).not.toMatch(/child_process|node:(?:net|http|https)|execFile|spawn\s*\(|process\.env/i);
  });

  it('writes only JSON-RPC messages to the in-memory stdio stdout channel', async () => {
    const { gateway, initialize, send, reader } = await createWireHarness();
    await initialize();
    send({ jsonrpc: '2.0', id: 9, method: 'ping', params: {} });
    const response = await reader.next();
    expect(() => JSON.parse(JSON.stringify(response))).not.toThrow();
    expect(response).toMatchObject({ jsonrpc: '2.0', id: 9 });
    await gateway.stop();
  });

  it('provides a fixed real stdio entrypoint that initializes and lists the approved production tools', async () => {
    const entry = path.resolve(process.cwd(), 'packages/mcp-gateway/dist/stdio-entry.js');
    expect(fs.existsSync(entry)).toBe(true);

    const child = spawn(process.execPath, [entry], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.add(child);
    const reader = createJsonLineReader(child.stdout);

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'sud-d-entry-smoke', version: '1.0.0' },
      },
    })}\n`);
    const initialized = await reader.next(4000);
    expect(initialized).toMatchObject({
      jsonrpc: '2.0',
      id: 10,
      result: { serverInfo: { name: 'SUD-D', version: '0.1.0' } },
    });

    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/list', params: {} })}\n`);
    const listed = await reader.next(4000);
    expect(listed).toMatchObject({ jsonrpc: '2.0', id: 11 });
    const tools = listed.result?.tools as Array<{ name?: string }> | undefined;
    expect(tools?.map((tool) => tool.name).sort()).toEqual(
      [...APPROVED_PRODUCTION_TOOLS].sort(),
    );

    child.stdin.end();
    children.delete(child);
  });

  it('keeps the real stdio entrypoint stdout parseable and diagnostics on stderr', async () => {
    const entry = path.resolve(process.cwd(), 'packages/mcp-gateway/dist/stdio-entry.js');
    expect(fs.existsSync(entry)).toBe(true);

    const child = spawn(process.execPath, [entry], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    children.add(child);
    const reader = createJsonLineReader(child.stdout);
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 12,
      method: 'initialize',
      params: {
        protocolVersion: LEGACY_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'sud-d-entry-stdout-test', version: '1.0.0' },
      },
    })}\n`);
    const response = await reader.next(4000);
    expect(response.id).toBe(12);
    expect(() => JSON.stringify(response)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stderr).toContain('SUD-D MCP Gateway');
    expect(stderr).not.toMatch(/api[_-]?key|credential|token|stack|node_modules/i);

    child.stdin.end();
    children.delete(child);
  });
});
