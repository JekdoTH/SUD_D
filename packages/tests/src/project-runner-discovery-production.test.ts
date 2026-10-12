import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizePath,
  createAuditRepository,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkMemoryRepository,
  createWorkspaceGitSettingsRepository,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';

const dirs: string[] = [];
const dbs: Db[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function canonical(root: string): string {
  const result = canonicalizePath(root);
  if (!result.ok) throw new Error('Fixture path unavailable');
  return result.value;
}

function validManifest(label = 'CREDENTIAL_SENTINEL_NEVER_EXPOSE'): Record<string, unknown> {
  return {
    version: 1,
    runners: [{
      id: 'report',
      label,
      runtime: 'node-offline-v1',
      entry: 'tools/report.mjs',
      snapshotPaths: ['tools'],
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      artifacts: [],
      limits: { timeoutMs: 30_000, maxArtifactBytes: 1024 },
      networkProfile: 'none',
      secretProfile: 'none',
    }],
  };
}

function writeManifest(root: string, value: unknown): void {
  fs.writeFileSync(path.join(root, '.sud-d', 'runners.json'),
    typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
}

interface RpcMessage {
  readonly result?: {
    readonly tools?: Array<{ readonly name: string; readonly inputSchema?: Record<string, unknown> }>;
    readonly content?: Array<{ readonly type: string; readonly text?: string }>;
    readonly isError?: boolean;
  };
  readonly error?: { readonly code?: number; readonly message?: string };
}

async function fixture(denyEntryRoot = false, switchBeforeDiscovery = false) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-discovery-mcp-'));
  dirs.push(base);
  const a = path.join(base, 'a');
  const b = path.join(base, 'b');
  for (const root of [a, b]) {
    fs.mkdirSync(path.join(root, '.sud-d'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tools'));
    fs.writeFileSync(path.join(root, 'tools', 'report.mjs'), '// inert fixture, never executed\n');
  }
  const db = openDatabase(path.join(base, 'state.db'));
  dbs.push(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const wsA = workspaceRepo.save('A', canonical(a));
  const wsB = workspaceRepo.save('B', canonical(b));
  workspaceRepo.setActive(wsA.id);
  const auditRepo = createAuditRepository(db);
  const server = createProductionMcpServer({
    workspaceRepo,
    auditRepo: {
      ...auditRepo,
      append(event) {
        const saved = auditRepo.append(event);
        if (switchBeforeDiscovery && event.metadata?.capability === 'runner.discover' && event.metadata?.phase === 'pre_execution') {
          workspaceRepo.setActive(wsB.id);
        }
        return saved;
      },
    },
    internalRoots: denyEntryRoot ? [{ canonicalPath: canonical(path.join(a, 'tools')), label: 'test internal root' }] : [],
    fileSystem: createWorkspaceTextFileSystem(),
    gitSettingsRepo: createWorkspaceGitSettingsRepository(db),
    teamRepo: createTeamRepository(db),
    teamTransitionUow: createTeamTransitionUnitOfWork(db),
    semanticRead: { read: async () => ({ content: [] }) },
    semanticWrite: { write: async () => ({ content: [] }) },
    restrictedVerify: { run: async (_context, request) => ({
      action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 0,
    }) },
    workMemoryRepo: createWorkMemoryRepository(db),
  });
  const input = new PassThrough();
  const output = new PassThrough();
  let buffer = '';
  const queue: RpcMessage[] = [];
  const waiters: Array<(response: RpcMessage) => void> = [];
  output.setEncoding('utf8');
  output.on('data', (part: string) => {
    buffer += part;
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      const response = JSON.parse(line) as RpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(response);
      else queue.push(response);
    }
  });
  await server.connect(createStdioGatewayTransport(input, output));
  let id = 0;
  const request = async (method: string, params: Record<string, unknown>) => {
    const response = new Promise<RpcMessage>((resolve) => {
      const queued = queue.shift();
      if (queued) resolve(queued);
      else waiters.push(resolve);
    });
    input.write(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) + '\n');
    return response;
  };
  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'home-f1-discovery-smoke', version: '1' },
  });
  input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  const call = (name: string, args: Record<string, unknown>) =>
    request('tools/call', { name, arguments: args });
  const close = async () => { await server.close(); input.destroy(); output.destroy(); };
  return { a, b, wsA, wsB, workspaceRepo, call, close, list: () => request('tools/list', {}) };
}

function payload(response: RpcMessage): Record<string, unknown> {
  const text = response.result?.content?.find((item) => item.type === 'text')?.text;
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

describe('Production Home MCP runner.discover — read-only F1', () => {
  it('lists only discovery, enforces empty args and resume, redacts manifest prose, and rejects start', async () => {
    const h = await fixture();
    try {
      writeManifest(h.a, validManifest());
      const listed = await h.list();
      const names = (listed.result?.tools ?? []).map((tool) => tool.name);
      expect(names).toHaveLength(40);
      expect(names).toContain('runner.discover');
      for (const name of ['runner.start', 'runner.status', 'runner.logs', 'runner.stop', 'shell', 'execute']) {
        expect(names).not.toContain(name);
      }
      const schema = listed.result?.tools?.find((tool) => tool.name === 'runner.discover')?.inputSchema;
      expect(schema).toMatchObject({ type: 'object', additionalProperties: false, properties: {} });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
      expect(payload(await h.call('work.resume', {}))).toMatchObject({ ok: true, value: { workspaceId: h.wsA.id } });
      for (const args of [{ runnerId: 'report' }, { cwd: h.a }, { executable: 'cmd.exe' }, { env: {} }, { profile: 'none' }, { path: '..' }]) {
        const rejected = await h.call('runner.discover', args);
        expect(rejected.result?.isError ?? Boolean(rejected.error)).toBe(true);
      }
      const before = fs.readdirSync(h.a).sort();
      const discovered = payload(await h.call('runner.discover', {}));
      expect(discovered).toMatchObject({
        ok: true,
        code: 'EXECUTED',
        value: {
          executionAvailable: false,
          executionBlockedReason: expect.any(String),
          candidates: [{ id: 'report', runtime: 'node-offline-v1', supported: true, definitionDigest: expect.stringMatching(/^[a-f0-9]{64}$/) }],
        },
      });
      expect(JSON.stringify(discovered)).not.toMatch(/CREDENTIAL_SENTINEL|entry|snapshotPaths|networkProfile|secretProfile|tools\/report|\.mjs|argv|cwd/i);
      expect((await h.call('runner.start', { runnerId: 'report', input: {}, attemptId: '44444444-4444-4444-8444-444444444444' })).error).toBeDefined();
      expect(fs.readdirSync(h.a).sort()).toEqual(before);
    } finally { await h.close(); }
  });

  it('fails closed on manifests, traversal, InternalRoot and Workspace switches', async () => {
    const h = await fixture();
    try {
      writeManifest(h.a, validManifest());
      writeManifest(h.b, { ...validManifest('OTHER_WORKSPACE_SECRET'), runners: [{ ...(validManifest().runners as Record<string, unknown>[])[0], id: 'other' }] });
      expect(payload(await h.call('work.resume', {}))).toMatchObject({ ok: true });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: true, value: { candidates: [{ id: 'report' }] } });
      h.workspaceRepo.setActive(h.wsB.id);
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
      expect(payload(await h.call('work.resume', {}))).toMatchObject({ ok: true, value: { workspaceId: h.wsB.id } });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: true, value: { candidates: [{ id: 'other' }] } });
      writeManifest(h.b, '{"version":1,"version":1,"runners":[]}');
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      writeManifest(h.b, { ...validManifest(), version: 2 });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      writeManifest(h.b, ' '.repeat(65_537));
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      const definition = (validManifest().runners as Record<string, unknown>[])[0]!;
      writeManifest(h.b, { ...validManifest(), runners: [definition, definition] });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      writeManifest(h.b, { ...validManifest(), unknownCommand: 'SENSITIVE_DO_NOT_ECHO' });
      const rejected = payload(await h.call('runner.discover', {}));
      expect(rejected).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      expect(JSON.stringify(rejected)).not.toContain('SENSITIVE_DO_NOT_ECHO');
      writeManifest(h.b, { ...validManifest(), runners: [{ ...definition, entry: '../outside.mjs' }] });
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      fs.rmSync(path.join(h.b, '.sud-d', 'runners.json'));
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      h.workspaceRepo.setActive(h.wsA.id);
      expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
    } finally { await h.close(); }
  });
});

describe('Owner-test discovery containment negatives', () => {
  it('denies entries in an internal root without exposing manifest prose', async () => {
    const h = await fixture(true);
    try {
      writeManifest(h.a, validManifest());
      await h.call('work.resume', {});
      const response = payload(await h.call('runner.discover', {}));
      expect(response).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
      expect(JSON.stringify(response)).not.toContain('CREDENTIAL_SENTINEL_NEVER_EXPOSE');
    } finally { await h.close(); }
  });
  it('denies original manifest and entry junctions even when targets stay inside the Workspace', async () => {
    for (const relative of ['tools', '.sud-d']) {
      const h = await fixture();
      try {
        writeManifest(h.a, validManifest());
        await h.call('work.resume', {});
        const originalPath = path.join(h.a, relative);
        const heldPath = path.join(h.a, relative + '-held');
        fs.renameSync(originalPath, heldPath);
        fs.symlinkSync(heldPath, originalPath, 'junction');
        expect(payload(await h.call('runner.discover', {}))).toMatchObject({ ok: false, causeCode: 'RUNNER_MANIFEST_INVALID' });
        expect(fs.readFileSync(path.join(h.a, 'tools', 'report.mjs'), 'utf8')).toBe('// inert fixture, never executed\n');
      } finally { await h.close(); }
    }
  });
});

describe('Discovery authorization-time Workspace binding', () => {
  it('fails closed if Workspace changes while the pre-execution audit is appended', async () => {
    const h = await fixture(false, true);
    try {
      writeManifest(h.a, validManifest());
      writeManifest(h.b, { ...validManifest(), runners: [{ ...(validManifest().runners as Record<string, unknown>[])[0], id: 'unresumed-other' }] });
      await h.call('work.resume', {});
      const response = payload(await h.call('runner.discover', {}));
      expect(response).toMatchObject({ ok: false, causeCode: 'WORKSPACE_NOT_FOUND' });
      expect(JSON.stringify(response)).not.toContain('unresumed-other');
    } finally { await h.close(); }
  });
});
