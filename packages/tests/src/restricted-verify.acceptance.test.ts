import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApprovalCoordinator, createApprovalService } from '@sud-d/application';
import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createRestrictedVerifyAdapter,
  createTeamRepository,
  createWorkspaceRepository,
  createWorkMemoryRepository,
  createWorkspaceTextFileSystem,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';

const enabled = process.env.SUD_D_RESTRICTED_VERIFY_ACCEPTANCE === '1';
const live = enabled ? it : it.skip;
const PROTOCOL_VERSION = '2025-06-18';
const tempRoots: string[] = [];
const openDbs: Db[] = [];
const APPROVED_TOOLS = [
  'code.diagnostics', 'code.find_references', 'code.find_symbol',
  'code.insert_after', 'code.insert_before', 'code.overview',
  'code.rename', 'code.replace_symbol', 'code.search',
  'git.checkpoint', 'git.detect', 'git.diff', 'git.status',
  'team.start', 'team.status', 'team.stop', 'team.submit',
  'verify.run',
  'work.checkpoint', 'work.resume',
  'workspace.create_text_file', 'workspace.list', 'workspace.read_text',
  'workspace.search_text', 'workspace.stat', 'workspace.write_text_file',
].sort();

interface RpcMessage {
  readonly id?: number | string | null;
  readonly result?: {
    readonly tools?: Array<{ readonly name?: string }>;
    readonly content?: Array<{ readonly type?: string; readonly text?: string }>;
    readonly isError?: boolean;
  };
  readonly error?: unknown;
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error('canonicalize failed');
  return result.value;
}
function createReader(output: PassThrough) {
  let buffer = '';
  const queue: RpcMessage[] = [];
  const waiters: Array<(message: RpcMessage) => void> = [];
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line) as RpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(message); else queue.push(message);
    }
  });
  return {
    next(timeoutMs = 60_000): Promise<RpcMessage> {
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
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function approvalId(payload: Record<string, unknown>): string {
  const value = payload['approvalRequestId'];
  if (typeof value !== 'string') throw new Error('missing approval request id');
  return value;
}

function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!isProcessAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`verification child still alive: ${pid}`);
}

function gitStatus(): string {
  return execFileSync('git', ['status', '--porcelain=v1'], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
  });
}
afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Restricted Verify Home-PC Windows production acceptance', () => {
  live('runs all four fixed actions only after approval through the real production path', async () => {
    const repoStatusBefore = gitStatus();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-restricted-verify-acceptance-'));
    tempRoots.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const inactiveRoot = path.join(root, 'inactive-workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(inactiveRoot, { recursive: true });
    const packageJson = {
      packageManager: 'pnpm@10.34.5',
      scripts: {
        test: 'node verify.cjs test',
        lint: 'node verify.cjs lint',
        typecheck: 'node verify.cjs typecheck',
        build: 'node verify.cjs build',
      },
    };
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(packageJson), 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'verify.cjs'), [
      "const fs = require('node:fs');",
      "const action = process.argv[2];",
      "fs.appendFileSync('acceptance-events.log', `${action}\\n`);",
      "fs.writeFileSync(`pid-${action}.txt`, String(process.pid));",
      "console.log(`verification:${action}:ok`);",
      "console.error(`TOKEN=ACCEPTANCE_SECRET_${action}`);",
      "if (action === 'build') console.log('x'.repeat(40000));",
    ].join('\n'), 'utf8');
    fs.writeFileSync(path.join(inactiveRoot, 'package.json'), JSON.stringify(packageJson), 'utf8');
    fs.writeFileSync(path.join(inactiveRoot, 'verify.cjs'), "throw new Error('inactive workspace must not execute');\n", 'utf8');

    const db = openDatabase(path.join(root, 'state', 'sud-d.db'));
    openDbs.push(db);
    const workspaceRepo = createWorkspaceRepository(db);
    const active = workspaceRepo.save('Restricted Verify Acceptance', canonical(workspaceRoot));
    workspaceRepo.save('Inactive Acceptance Workspace', canonical(inactiveRoot));
    workspaceRepo.setActive(active.id);
    const auditRepo = createAuditRepository(db);
    const approvalRepo = createApprovalRepository(db);
    const approval = createApprovalCoordinator({
      repository: approvalRepo,
      runtimeInstanceId: 'restricted-verify-acceptance',
      hmacKey: Buffer.alloc(32, 47),
    });
    const approvalService = createApprovalService(approvalRepo, auditRepo);
    const server = createProductionMcpServer({
      workspaceRepo,
      auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      gitSafety: createGitSafetyAdapter(),
      teamRepo: createTeamRepository(db),
      semanticRead: { read: async () => ({ content: [] }) },
      semanticWrite: { write: async () => ({ content: [] }) },
      restrictedVerify: createRestrictedVerifyAdapter({
        limits: { maxOutputBytes: 32 * 1024, timeoutMs: 30_000 },
      }),
      workMemoryRepo: createWorkMemoryRepository(db),
      approval,
    });
    const input = new PassThrough();
    const output = new PassThrough();
    const reader = createReader(output);
    await server.connect(createStdioGatewayTransport(input, output));
    const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
    let id = 0;
    const call = async (name: string, args: Record<string, unknown>) => {
      const callId = ++id;
      send({ jsonrpc: '2.0', id: callId, method: 'tools/call', params: { name, arguments: args } });
      return reader.next();
    };
    try {
      send({
        jsonrpc: '2.0', id: ++id, method: 'initialize',
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'restricted-verify-acceptance', version: '1.0.0' },
        },
      });
      await reader.next();
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      send({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} });
      const listed = await reader.next();
      const names = (listed.result?.tools ?? [])
        .map((tool) => tool.name)
        .filter((name): name is string => typeof name === 'string')
        .sort();
      expect(names).toEqual(APPROVED_TOOLS);
      expect(names).toHaveLength(26);
      expect(names).not.toContain('code.run');
      expect(names).not.toContain('dev.verify');
      expect(names).not.toContain('execute_shell_command');
      expect(parsePayload(await call('work.resume', {}))).toMatchObject({ ok: true, code: 'EXECUTED' });

      const injected = await call('verify.run', { action: 'test', executable: 'cmd.exe' });
      expect(injected.result?.isError).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, 'acceptance-events.log'))).toBe(false);
      const unsupported = await call('verify.run', { action: 'other' });
      expect(unsupported.result?.isError).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, 'acceptance-events.log'))).toBe(false);

      for (const action of ['test', 'lint', 'typecheck', 'build'] as const) {
        const before = parsePayload(await call('verify.run', { action }));
        expect(before).toMatchObject({
          ok: false,
          code: 'APPROVAL_REQUIRED',
          policyDecision: 'ask',
        });
        const beforeEvents = fs.existsSync(path.join(workspaceRoot, 'acceptance-events.log'))
          ? fs.readFileSync(path.join(workspaceRoot, 'acceptance-events.log'), 'utf8').trim().split(/\r?\n/).filter(Boolean)
          : [];
        expect(beforeEvents.filter((value) => value === action)).toHaveLength(0);
        const requestId = approvalId(before);
        expect(approvalService.respond(requestId, 'approve')).toMatchObject({
          ok: true,
          value: { status: 'approved' },
        });

        const executed = parsePayload(await call('verify.run', { action }));
        expect(executed).toMatchObject({
          ok: true,
          code: 'EXECUTED',
          policyDecision: 'ask',
          approvalDecision: 'approved',
          approvalRequestId: requestId,
        });
        const value = executed['value'] as Record<string, unknown>;
        expect(value).toMatchObject({ action, passed: true, exitCode: 0 });
        expect(typeof value['output']).toBe('string');
        expect(String(value['output'])).toContain(`verification:${action}:ok`);
        expect(String(value['output'])).toContain('[REDACTED]');
        expect(String(value['output'])).not.toContain(`ACCEPTANCE_SECRET_${action}`);
        expect(Buffer.byteLength(String(value['output']), 'utf8')).toBeLessThanOrEqual(32 * 1024);
        if (action === 'build') expect(value['truncated']).toBe(true);

        const events = fs.readFileSync(path.join(workspaceRoot, 'acceptance-events.log'), 'utf8')
          .trim().split(/\r?\n/).filter(Boolean);
        expect(events.filter((value) => value === action)).toHaveLength(1);
        const pid = Number(fs.readFileSync(path.join(workspaceRoot, `pid-${action}.txt`), 'utf8'));
        expect(Number.isSafeInteger(pid)).toBe(true);
        await waitForProcessExit(pid);
      }

      const summaries = auditRepo.list(200).filter((event) => event.action === 'restricted_verify.run');
      expect(summaries).toHaveLength(4);
      for (const action of ['test', 'lint', 'typecheck', 'build'] as const) {
        expect(summaries).toContainEqual(expect.objectContaining({
          workspaceId: active.id,
          resultCode: 'VERIFY_PASSED',
          metadata: expect.objectContaining({ action, passed: true }),
        }));
      }
      const durable = JSON.stringify(summaries);
      expect(durable).not.toMatch(/stdout|stderr|ACCEPTANCE_SECRET|TOKEN=/i);
      expect(fs.existsSync(path.join(inactiveRoot, 'acceptance-events.log'))).toBe(false);
      expect(gitStatus()).toBe(repoStatusBefore);
    } finally {
      await server.close();
    }
  }, 120_000);
});
