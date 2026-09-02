import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';

import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createTeamRepository,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createApprovalCoordinator, createApprovalService } from '@sud-d/application';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';

const APPROVED_TOOLS = [
  'git.checkpoint',
  'git.detect',
  'git.diff',
  'git.status',
  'team.start',
  'team.status',
  'team.stop',
  'team.submit',
  'workspace.create_text_file',
  'workspace.list',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.stat',
  'workspace.write_text_file',
] as const;
const PROTOCOL_VERSION = '2025-06-18';
const roots: string[] = [];
const dbs: Db[] = [];

interface RpcMessage {
  readonly id?: number | string | null;
  readonly result?: {
    readonly serverInfo?: { readonly name?: string };
    readonly tools?: Array<{ readonly name?: string }>;
    readonly content?: Array<{ readonly type?: string; readonly text?: string }>;
    readonly isError?: boolean;
  };
  readonly error?: unknown;
}

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-basic-approval-prod-'));
  roots.push(root);
  return root;
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error(`canonicalize failed: ${value}`);
  return result.value;
}

function git(cwd: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], {
    cwd,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function gitCode(cwd: string, args: readonly string[]): number {
  return spawnSync('git', [...args], { cwd, windowsHide: true, stdio: 'ignore' }).status ?? 1;
}

function initRepo(root: string): void {
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Approval Fixture']);
  git(root, ['config', 'user.email', 'approval@example.invalid']);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  fs.writeFileSync(path.join(root, '.env'), 'BASE=1\n', 'utf8');
  git(root, ['add', '--', 'tracked.txt', '.env']);
  git(root, ['commit', '-q', '-m', 'fixture']);
}

function createReader(stream: NodeJS.ReadableStream) {
  let buffer = '';
  const queue: RpcMessage[] = [];
  const waiters: Array<(message: RpcMessage) => void> = [];
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line) as RpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else queue.push(message);
    }
  });
  return {
    next(timeoutMs = 5000): Promise<RpcMessage> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP timeout')), timeoutMs);
        waiters.push((message) => { clearTimeout(timer); resolve(message); });
      });
    },
  };
}

function parsePayload(response: RpcMessage): Record<string, unknown> {
  const text = response.result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function approvalId(payload: Record<string, unknown>): string {
  const value = payload['approvalRequestId'];
  if (typeof value !== 'string') throw new Error('missing approval request id');
  return value;
}

async function makeHarness(options: { gitRepo?: boolean } = {}) {
  const base = tempRoot();
  const workspaceRoot = path.join(base, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  if (options.gitRepo) initRepo(workspaceRoot);
  const db = openDatabase(path.join(base, 'state', 'sud-d.db'));
  dbs.push(db);
  const workspaceRepo = createWorkspaceRepository(db);
  const workspace = workspaceRepo.save('Approval Workspace', canonical(workspaceRoot));
  workspaceRepo.setActive(workspace.id);
  const auditRepo = createAuditRepository(db);
  const approvalRepo = createApprovalRepository(db);
  const approvalCoordinator = createApprovalCoordinator({
    repository: approvalRepo,
    runtimeInstanceId: 'runtime-production-test',
    hmacKey: Buffer.alloc(32, 31),
  });
  const approvalService = createApprovalService(approvalRepo, auditRepo);
  const server = createProductionMcpServer({
    workspaceRepo,
    auditRepo,
    internalRoots: [],
    fileSystem: createWorkspaceTextFileSystem(),
    gitSafety: createGitSafetyAdapter(),
    teamRepo: createTeamRepository(db),
    approval: approvalCoordinator,
  });
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createReader(output);
  await server.connect(createStdioGatewayTransport(input, output));
  const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
  send({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'basic-approval-test', version: '1.0.0' } },
  });
  const initialized = await reader.next();
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  let id = 10;
  const call = async (name: string, args: Record<string, unknown>) => {
    const callId = ++id;
    send({ jsonrpc: '2.0', id: callId, method: 'tools/call', params: { name, arguments: args } });
    return reader.next();
  };
  const listTools = async () => {
    const callId = ++id;
    send({ jsonrpc: '2.0', id: callId, method: 'tools/list', params: {} });
    return reader.next();
  };
  return { base, workspaceRoot, db, workspaceRepo, auditRepo, approvalRepo, approvalService, server, initialized, call, listTools };
}

afterEach(async () => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Basic Approval - production MCP workspace flows', () => {
  it('tools/list remains exactly 14, exposes no approval tool, and normal tools remain usable', async () => {
    const h = await makeHarness({ gitRepo: true });
    expect(h.initialized.result?.serverInfo?.name).toBe('SUD-D');
    const listed = await h.listTools();
    const names = (listed.result?.tools ?? []).map((tool) => tool.name).filter((name): name is string => typeof name === 'string').sort();
    expect(names).toEqual([...APPROVED_TOOLS]);
    expect(names.some((name) => name.startsWith('approval.'))).toBe(false);

    fs.writeFileSync(path.join(h.workspaceRoot, 'normal.txt'), 'normal-content', 'utf8');
    expect(parsePayload(await h.call('workspace.read_text', { relativePath: 'normal.txt' }))).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      policyDecision: 'allow',
      value: { relativePath: 'normal.txt', content: 'normal-content' },
    });
    expect(parsePayload(await h.call('git.status', {}))).toMatchObject({ ok: true, code: 'EXECUTED' });
    await h.server.close();
  });

  it('credential read requires approval, exact retry reveals once, later identical action requires fresh approval', async () => {
    const h = await makeHarness();
    const secret = 'SENTINEL_APPROVAL_READ_SECRET_001';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), secret, 'utf8');
    const first = parsePayload(await h.call('workspace.read_text', { relativePath: '.env' }));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(first['message']).toBe('Approval required in SUD-D Activity. Approve or deny, then retry this action.');
    expect(JSON.stringify(first)).not.toContain(secret);
    const id = approvalId(first);
    expect(h.approvalService.respond(id, 'approve')).toMatchObject({ ok: true, value: { status: 'approved' } });

    const approved = parsePayload(await h.call('workspace.read_text', { relativePath: '.env' }));
    expect(approved).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      policyDecision: 'ask',
      approvalDecision: 'approved',
      approvalRequestId: id,
      value: { relativePath: '.env', content: secret },
    });
    const again = parsePayload(await h.call('workspace.read_text', { relativePath: '.env' }));
    expect(again).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(approvalId(again)).not.toBe(id);

    const dbRows = JSON.stringify(h.db.prepare('SELECT * FROM approval_requests').all());
    const audit = JSON.stringify(h.auditRepo.list(100));
    expect(dbRows).not.toContain(secret);
    expect(audit).not.toContain(secret);
    await h.server.close();
  });

  it('credential write cannot mutate before approval and changed payload cannot reuse approval', async () => {
    const h = await makeHarness();
    const target = path.join(h.workspaceRoot, '.npmrc');
    fs.writeFileSync(target, 'before', 'utf8');
    const original = 'SENTINEL_WRITE_APPROVED_002';
    const changed = 'SENTINEL_WRITE_CHANGED_003';
    const first = parsePayload(await h.call('workspace.write_text_file', { relativePath: '.npmrc', content: original }));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(fs.readFileSync(target, 'utf8')).toBe('before');
    const firstId = approvalId(first);
    expect(h.approvalService.respond(firstId, 'approve').ok).toBe(true);

    const changedAttempt = parsePayload(await h.call('workspace.write_text_file', { relativePath: '.npmrc', content: changed }));
    expect(changedAttempt).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(approvalId(changedAttempt)).not.toBe(firstId);
    expect(fs.readFileSync(target, 'utf8')).toBe('before');

    const exact = parsePayload(await h.call('workspace.write_text_file', { relativePath: '.npmrc', content: original }));
    expect(exact).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask', approvalRequestId: firstId });
    expect(fs.readFileSync(target, 'utf8')).toBe(original);
    await h.server.close();
  });

  it('credential create does not create before approval and exact retry creates once', async () => {
    const h = await makeHarness();
    const target = path.join(h.workspaceRoot, '.env.local');
    const secret = 'SENTINEL_CREATE_SECRET_004';
    const first = parsePayload(await h.call('workspace.create_text_file', { relativePath: '.env.local', content: secret }));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(fs.existsSync(target)).toBe(false);
    const id = approvalId(first);
    expect(h.approvalService.respond(id, 'approve').ok).toBe(true);
    expect(parsePayload(await h.call('workspace.create_text_file', { relativePath: '.env.local', content: secret }))).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      policyDecision: 'ask',
      approvalRequestId: id,
    });
    expect(fs.readFileSync(target, 'utf8')).toBe(secret);
    await h.server.close();
  });

  it('deny blocks exact retry and request id supplied by caller grants no authority', async () => {
    const h = await makeHarness();
    const secret = 'SENTINEL_DENY_SECRET_005';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), secret, 'utf8');
    const first = parsePayload(await h.call('workspace.read_text', { relativePath: '.env' }));
    const id = approvalId(first);
    expect(h.approvalService.respond(id, 'deny').ok).toBe(true);
    const denied = parsePayload(await h.call('workspace.read_text', { relativePath: '.env' }));
    expect(denied).toMatchObject({ ok: false, code: 'APPROVAL_DENIED', approvalDecision: 'denied' });
    expect(JSON.stringify(denied)).not.toContain(secret);

    const injected = await h.call('workspace.read_text', { relativePath: '.env', approvalRequestId: id });
    expect(injected.error ?? injected.result?.isError).toBeTruthy();
    expect(JSON.stringify(injected)).not.toContain(secret);
    await h.server.close();
  });
});

describe('Basic Approval - production Git-sensitive flows', () => {
  it('sensitive diff leaks nothing before approval and exact retry returns intended diff', async () => {
    const h = await makeHarness({ gitRepo: true });
    const secret = 'SENTINEL_GIT_DIFF_SECRET_006';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), `${secret}\n`, 'utf8');
    const first = parsePayload(await h.call('git.diff', { relativePath: '.env' }));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(JSON.stringify(first)).not.toContain(secret);
    const id = approvalId(first);
    expect(h.approvalService.respond(id, 'approve').ok).toBe(true);
    const approved = parsePayload(await h.call('git.diff', { relativePath: '.env' }));
    expect(approved).toMatchObject({ ok: true, policyDecision: 'ask', approvalDecision: 'approved', approvalRequestId: id });
    expect(JSON.stringify(approved)).toContain(secret);
    await h.server.close();
  });

  it('changed Git-sensitive state cannot reuse an approved stale diff grant', async () => {
    const h = await makeHarness({ gitRepo: true });
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'FIRST_SECRET_STATE\n', 'utf8');
    const first = parsePayload(await h.call('git.diff', { relativePath: '.env' }));
    const firstId = approvalId(first);
    expect(h.approvalService.respond(firstId, 'approve').ok).toBe(true);
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'SECOND_SECRET_STATE\n', 'utf8');
    const changed = parsePayload(await h.call('git.diff', { relativePath: '.env' }));
    expect(changed).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(approvalId(changed)).not.toBe(firstId);
    expect(JSON.stringify(changed)).not.toContain('SECOND_SECRET_STATE');
    await h.server.close();
  });

  it('sensitive checkpoint persists no secret before approval and preserves HEAD/branch/index/worktree after approved retry', async () => {
    const h = await makeHarness({ gitRepo: true });
    const secret = 'SENTINEL_GIT_CHECKPOINT_SECRET_007';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), `${secret}\n`, 'utf8');
    const status = parsePayload(await h.call('git.status', {}));
    const statusValue = status['value'] as { statusId?: string } | undefined;
    if (!statusValue?.statusId) throw new Error('missing statusId');
    const headBefore = git(h.workspaceRoot, ['rev-parse', 'HEAD']);
    const branchBefore = git(h.workspaceRoot, ['symbolic-ref', '--short', 'HEAD']);
    const indexBefore = fs.readFileSync(path.join(h.workspaceRoot, '.git', 'index'));
    const worktreeBefore = fs.readFileSync(path.join(h.workspaceRoot, '.env'));
    const secretOid = git(h.workspaceRoot, ['hash-object', '--stdin', '--no-filters'], `${secret}\n`);
    expect(gitCode(h.workspaceRoot, ['cat-file', '-e', secretOid])).not.toBe(0);

    const first = parsePayload(await h.call('git.checkpoint', { expectedStatusId: statusValue.statusId }));
    expect(first).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    const id = approvalId(first);
    expect(git(h.workspaceRoot, ['for-each-ref', '--format=%(refname)', 'refs/sud-d/checkpoints'])).toBe('');
    expect(gitCode(h.workspaceRoot, ['cat-file', '-e', secretOid])).not.toBe(0);
    expect(h.approvalService.respond(id, 'approve').ok).toBe(true);

    const approved = parsePayload(await h.call('git.checkpoint', { expectedStatusId: statusValue.statusId }));
    expect(approved).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask', approvalDecision: 'approved', approvalRequestId: id });
    expect(git(h.workspaceRoot, ['for-each-ref', '--format=%(refname)', 'refs/sud-d/checkpoints'])).toMatch(/^refs\/sud-d\/checkpoints\//);
    expect(gitCode(h.workspaceRoot, ['cat-file', '-e', secretOid])).toBe(0);
    expect(git(h.workspaceRoot, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(h.workspaceRoot, ['symbolic-ref', '--short', 'HEAD'])).toBe(branchBefore);
    expect(fs.readFileSync(path.join(h.workspaceRoot, '.git', 'index')).equals(indexBefore)).toBe(true);
    expect(fs.readFileSync(path.join(h.workspaceRoot, '.env')).equals(worktreeBefore)).toBe(true);
    await h.server.close();
  }, 15_000);
});
