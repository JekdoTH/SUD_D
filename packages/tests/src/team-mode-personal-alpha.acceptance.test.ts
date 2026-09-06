import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createApprovalCoordinator, createApprovalService, createTeamService } from '@sud-d/application';
import { ok, type TeamFreshnessRef } from '@sud-d/domain';
import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createRestrictedVerifyAdapter,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  createWorkMemoryRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';
import { createDesktopTeamController } from '../../desktop/electron/team-controller.js';

const enabled = process.env.SUD_D_TEAM_MODE_ACCEPTANCE === '1';
const live = enabled ? it : it.skip;
const PROTOCOL_VERSION = '2025-06-18';
const roots: string[] = [];
const dbs: Db[] = [];
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
    next(timeoutMs = 120_000): Promise<RpcMessage> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP timeout')), timeoutMs);
        waiters.push((message) => { clearTimeout(timer); resolve(message); });
      });
    },
  };
}
function payload(message: RpcMessage): Record<string, unknown> {
  const text = message.result?.content?.find((item) => item.type === 'text')?.text;
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function approvalId(value: Record<string, unknown>): string {
  const id = value['approvalRequestId'];
  if (typeof id !== 'string') throw new Error('approval request id missing');
  return id;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

function initGitWorkspace(root: string): void {
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    packageManager: 'pnpm@10.34.5',
    scripts: { test: 'node verify.cjs' },
  }), 'utf8');
  fs.writeFileSync(path.join(root, 'verify.cjs'), [
    "const fs = require('node:fs');",
    "const one = fs.readFileSync('task1.txt', 'utf8');",
    "const two = fs.readFileSync('task2.txt', 'utf8');",
    "console.log('RAW_VERIFY_OUTPUT_SENTINEL');",
    "if (one.includes('FAIL') || two.includes('FAIL')) process.exit(1);",
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(root, 'task1.txt'), 'BASE\n', 'utf8');
  fs.writeFileSync(path.join(root, 'task2.txt'), 'BASE\n', 'utf8');
  git(root, 'init');
  git(root, 'config', 'user.email', 'team-acceptance@example.invalid');
  git(root, 'config', 'user.name', 'Team Acceptance');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
}

async function connect(server: ReturnType<typeof createProductionMcpServer>, name: string) {
  const input = new PassThrough();
  const output = new PassThrough();
  const reader = createReader(output);
  await server.connect(createStdioGatewayTransport(input, output));
  let id = 0;
  const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
  send({ jsonrpc: '2.0', id: ++id, method: 'initialize', params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name, version: '1.0.0' },
  } });
  await reader.next();
  send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
  const call = async (tool: string, args: Record<string, unknown>) => {
    send({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name: tool, arguments: args } });
    return reader.next();
  };
  const list = async () => {
    send({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} });
    return reader.next();
  };
  return { call, list };
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

describe('Team Mode Personal Alpha Home-PC production acceptance', () => {
  live('completes the real production Team flow and preserves security boundaries', async () => {
    const repoStatusBefore = git(process.cwd(), 'status', '--porcelain=v1');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-team-acceptance-'));
    roots.push(root);
    const aRoot = path.join(root, 'workspace-a');
    const bRoot = path.join(root, 'workspace-b');
    fs.mkdirSync(aRoot, { recursive: true });
    fs.mkdirSync(bRoot, { recursive: true });
    initGitWorkspace(aRoot);
    initGitWorkspace(bRoot);
    const db = openDatabase(path.join(root, 'state', 'sud-d.db'));
    dbs.push(db);
    const workspaceRepo = createWorkspaceRepository(db);
    const wsA = workspaceRepo.save('Team Acceptance A', canonical(aRoot));
    const wsB = workspaceRepo.save('Team Acceptance B', canonical(bRoot));
    workspaceRepo.setActive(wsA.id);
    const auditRepo = createAuditRepository(db);
    const workMemoryRepo = createWorkMemoryRepository(db);
    const teamRepo = createTeamRepository(db);
    const approvalRepo = createApprovalRepository(db);
    const approval = createApprovalCoordinator({
      repository: approvalRepo,
      runtimeInstanceId: 'team-mode-acceptance',
      hmacKey: Buffer.alloc(32, 73),
    });
    const approvalService = createApprovalService(approvalRepo, auditRepo);
    const gitSafety = createGitSafetyAdapter();
    let semanticReadCalls = 0;
    let semanticWriteCalls = 0;
    const makeServer = () => createProductionMcpServer({
      workspaceRepo,
      auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      gitSafety,
      teamRepo,
      teamTransitionUow: createTeamTransitionUnitOfWork(db),
      semanticRead: { read: async () => { semanticReadCalls += 1; return { content: [{ type: 'text', text: 'RAW_SERENA_OUTPUT_SENTINEL' }] }; } },
      semanticWrite: { write: async () => { semanticWriteCalls += 1; return { content: [] }; } },
      restrictedVerify: createRestrictedVerifyAdapter({ limits: { maxOutputBytes: 32 * 1024, timeoutMs: 30_000 } }),
      workMemoryRepo,
      approval,
    });

    let serverA: ReturnType<typeof makeServer> | undefined = makeServer();
    let serverB: ReturnType<typeof makeServer> | undefined;
    try {
      const a = await connect(serverA, 'team-mode-acceptance-a');
      const listed = await a.list();
      const names = (listed.result?.tools ?? []).map((tool) => tool.name).filter((name): name is string => typeof name === 'string').sort();
      expect(names).toEqual(APPROVED_TOOLS);
      expect(names).toHaveLength(26);
      expect(names.filter((name) => name.startsWith('team.'))).toEqual(['team.start', 'team.status', 'team.stop', 'team.submit']);

      const preResume = payload(await a.call('team.start', { goal: 'must not dispatch' }));
      expect(preResume).toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM team_missions').get()).toMatchObject({ count: 0 });
      expect(semanticReadCalls).toBe(0);
      expect(semanticWriteCalls).toBe(0);

      expect(payload(await a.call('work.resume', {}))).toMatchObject({ ok: true, code: 'EXECUTED', value: { workspaceId: wsA.id } });
      expect(payload(await a.call('git.status', {}))).toMatchObject({ ok: true, code: 'EXECUTED' });
      expect(payload(await a.call('code.overview', { relativePath: 'task1.txt' }))).toMatchObject({ ok: true, code: 'EXECUTED' });
      expect(semanticReadCalls).toBe(1);
      const started = payload(await a.call('team.start', { goal: 'Make a controlled Team change SENTINEL_TEAM_ACCEPTANCE_SECRET' }));
      expect(started).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'planning', currentRole: 'planner' } });
      const missionId = ((started['value'] as Record<string, unknown>)['missionId']) as string;
      expect(workMemoryRepo.loadCurrent(wsA.id)).toMatchObject({
        ok: true,
        value: {
          task: { title: 'Plan Team mission', status: 'in_progress' },
          nextAction: 'Plan the Team mission and submit plan_ready.',
        },
      });

      const rejectedReasoning = await a.call('team.submit', {
        outcome: 'plan_ready',
        summary: 'invalid raw field',
        workItems: [{ title: 'Task one' }],
        reasoning: 'RAW_CHAT_REASONING_SENTINEL',
      });
      expect(rejectedReasoning.error ?? rejectedReasoning.result?.isError).toBeTruthy();
      expect(teamRepo.findById(missionId)).toMatchObject({ ok: true, value: { state: 'planning' } });

      const planned = payload(await a.call('team.submit', {
        outcome: 'plan_ready',
        summary: 'Two bounded Tasks are ready',
        workItems: [
          { title: 'Exercise controlled validation rework', targetPathHint: 'task1.txt' },
          { title: 'Finish the second controlled change', targetPathHint: 'task2.txt' },
        ],
      }));
      expect(planned).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'implementing', currentRole: 'implementer', nextAction: 'Work on Task 1/2: Exercise controlled validation rework; then submit work_ready.', workItems: [{ sequence: 1, status: 'in_progress', reworkCount: 0 }, { sequence: 2, status: 'pending', reworkCount: 0 }] } });
      expect(payload(await a.call('workspace.write_text_file', { relativePath: 'task1.txt', content: 'RAW_FILE_CONTENT_SENTINEL_FAIL\n' }))).toMatchObject({ ok: true, code: 'EXECUTED' });
      const diffAfterWorker = payload(await a.call('git.diff', { relativePath: 'task1.txt' }));
      expect(JSON.stringify(diffAfterWorker)).toContain('RAW_FILE_CONTENT_SENTINEL_FAIL');
      const workerStatus = gitSafety.status(aRoot, 200);
      if (!workerStatus.ok) throw new Error(workerStatus.error.message);
      const workReady = payload(await a.call('team.submit', { outcome: 'work_ready', summary: 'Task 1 implementation is ready' }));
      expect(workReady).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'validating', currentRole: 'validator', nextAction: 'Validate Task 1/2: Exercise controlled validation rework; then submit validation_passed or validation_failed.', workItems: [{ sequence: 1, status: 'validating', reworkCount: 0 }, { sequence: 2, status: 'pending', reworkCount: 0 }] } });
      expect(teamRepo.findById(missionId)).toMatchObject({ ok: true, value: { freshnessValue: workerStatus.value.statusId } });

      const verifyFailAsk = payload(await a.call('verify.run', { action: 'test' }));
      expect(verifyFailAsk).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
      const verifyFailId = approvalId(verifyFailAsk);
      expect(approvalService.respond(verifyFailId, 'approve')).toMatchObject({ ok: true, value: { status: 'approved' } });
      const verifyFail = payload(await a.call('verify.run', { action: 'test' }));
      expect(verifyFail).toMatchObject({ ok: true, code: 'EXECUTED', approvalDecision: 'approved', approvalRequestId: verifyFailId, value: { action: 'test', passed: false } });
      expect(JSON.stringify(verifyFail)).toContain('RAW_VERIFY_OUTPUT_SENTINEL');

      const validationFailed = payload(await a.call('team.submit', {
        outcome: 'validation_failed',
        summary: 'Controlled verification failed',
        verification: ['verify.run(test) reported a controlled failure'],
        findings: [{ severity: 'medium', summary: 'Replace the controlled failing fixture value', targetPathHint: 'task1.txt', expectedCorrection: 'Use the passing fixture value' }],
      }));
      expect(validationFailed).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'implementing', currentRole: 'implementer', nextAction: 'Work on Task 1/2: Exercise controlled validation rework; then submit work_ready.', workItems: [{ sequence: 1, status: 'in_progress', reworkCount: 1 }, { sequence: 2, status: 'pending', reworkCount: 0 }] } });
      expect(payload(await a.call('workspace.write_text_file', { relativePath: 'task1.txt', content: 'CONTROLLED_PASS\n' }))).toMatchObject({ ok: true, code: 'EXECUTED' });
      expect(payload(await a.call('team.submit', { outcome: 'work_ready', summary: 'Task 1 fix is ready' }))).toMatchObject({ ok: true, value: { state: 'validating', currentRole: 'validator', workItems: [{ sequence: 1, status: 'validating', reworkCount: 1 }, { sequence: 2, status: 'pending', reworkCount: 0 }] } });
      const verifyPassAsk = payload(await a.call('verify.run', { action: 'test' }));
      const verifyPassId = approvalId(verifyPassAsk);
      expect(approvalService.respond(verifyPassId, 'approve')).toMatchObject({ ok: true, value: { status: 'approved' } });
      const verifyPass = payload(await a.call('verify.run', { action: 'test' }));
      expect(verifyPass).toMatchObject({ ok: true, code: 'EXECUTED', approvalDecision: 'approved', approvalRequestId: verifyPassId, value: { passed: true, exitCode: 0 } });
      expect(payload(await a.call('team.submit', {
        outcome: 'validation_passed',
        summary: 'Task 1 validation passed',
        verification: ['verify.run(test) passed after the controlled fix'],
      }))).toMatchObject({ ok: true, value: { state: 'reviewing', currentRole: 'reviewer', workItems: [{ sequence: 1, status: 'reviewing', reworkCount: 1 }, { sequence: 2, status: 'pending', reworkCount: 0 }] } });

      const task1Approved = payload(await a.call('team.submit', { outcome: 'task_approved', summary: 'Task 1 approved after validation' }));
      expect(task1Approved).toMatchObject({
        ok: true,
        value: {
          state: 'implementing', currentRole: 'implementer', nextAction: 'Work on Task 2/2: Finish the second controlled change; then submit work_ready.',
          workItems: [{ sequence: 1, status: 'done' }, { sequence: 2, status: 'in_progress', reworkCount: 0 }],
        },
      });

      const verifyAuditBeforeRestart = auditRepo.list(500).filter((event) => event.action === 'restricted_verify.run').length;
      await serverA.close();
      serverA = undefined;
      serverB = makeServer();
      const b = await connect(serverB, 'team-mode-acceptance-b');
      expect(payload(await b.call('team.status', {}))).toMatchObject({ ok: false, code: 'WORK_RESUME_REQUIRED' });
      expect(payload(await b.call('work.resume', {}))).toMatchObject({
        ok: true,
        value: {
          workspaceId: wsA.id,
          context: {
            task: { title: 'Finish the second controlled change', status: 'in_progress' },
            nextAction: 'Work on Task 2/2: Finish the second controlled change; then submit work_ready.',
          },
        },
      });
      const resumedStatus = payload(await b.call('team.status', {}));
      expect(resumedStatus).toMatchObject({
        ok: true,
        value: {
          state: 'implementing', currentRole: 'implementer',
          nextAction: 'Work on Task 2/2: Finish the second controlled change; then submit work_ready.',
        },
      });
      expect(auditRepo.list(500).filter((event) => event.action === 'restricted_verify.run')).toHaveLength(verifyAuditBeforeRestart);

      expect(payload(await b.call('workspace.write_text_file', { relativePath: 'task2.txt', content: 'RAW_TASK2_FILE_SENTINEL_PASS\n' }))).toMatchObject({ ok: true, code: 'EXECUTED' });
      expect(payload(await b.call('team.submit', { outcome: 'work_ready', summary: 'Task 2 implementation is ready' }))).toMatchObject({ ok: true, value: { state: 'validating', currentRole: 'validator', workItems: [{ sequence: 1, status: 'done' }, { sequence: 2, status: 'validating', reworkCount: 0 }] } });
      const verifyTask2Ask = payload(await b.call('verify.run', { action: 'test' }));
      const verifyTask2Id = approvalId(verifyTask2Ask);
      expect(approvalService.respond(verifyTask2Id, 'approve')).toMatchObject({ ok: true, value: { status: 'approved' } });
      expect(payload(await b.call('verify.run', { action: 'test' }))).toMatchObject({ ok: true, value: { passed: true, exitCode: 0 } });
      expect(payload(await b.call('team.submit', {
        outcome: 'validation_passed',
        summary: 'Task 2 validation passed',
        verification: ['verify.run(test) passed for Task 2'],
      }))).toMatchObject({ ok: true, value: { state: 'reviewing', currentRole: 'reviewer', workItems: [{ sequence: 1, status: 'done' }, { sequence: 2, status: 'reviewing', reworkCount: 0 }] } });
      const completed = payload(await b.call('team.submit', { outcome: 'task_approved', summary: 'All controlled Team work is complete' }));
      expect(completed).toMatchObject({ ok: true, value: { state: 'completed', finalResultSummary: 'All controlled Team work is complete' } });
      expect(workMemoryRepo.loadCurrent(wsA.id)).toMatchObject({
        ok: true,
        value: {
          task: { title: 'Finish the second controlled change', status: 'completed' },
          nextAction: 'Team mission completed; review the Final Result.',
        },
      });

      const foreign = teamRepo.createMission({
        workspaceId: wsB.id,
        goalSummary: 'FOREIGN_TEAM_ACCEPTANCE_SENTINEL',
        freshness: { kind: 'git_status', value: 'foreign' },
        createdAt: '2026-09-05T16:00:00.000Z',
      });
      if (!foreign.ok) throw new Error(foreign.error.message);
      const foreignStatus = payload(await b.call('team.status', { missionId: foreign.value.id }));
      const foreignStop = payload(await b.call('team.stop', { missionId: foreign.value.id }));
      expect(foreignStatus).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'TEAM_MISSION_NOT_FOUND' });
      expect(foreignStop).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'TEAM_MISSION_NOT_FOUND' });
      expect(JSON.stringify([foreignStatus, foreignStop])).not.toContain('FOREIGN_TEAM_ACCEPTANCE_SENTINEL');

      const atomicStarted = payload(await b.call('team.start', { goal: 'Atomic blocked acceptance' }));
      const atomicMissionId = ((atomicStarted['value'] as Record<string, unknown>)['missionId']) as string;
      const checkpointBeforeFailure = db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(wsA.id);
      db.exec(`CREATE TRIGGER fail_acceptance_blocked_checkpoint BEFORE INSERT ON work_memory_checkpoints WHEN NEW.task_status = 'blocked' BEGIN SELECT RAISE(ABORT, 'forced acceptance checkpoint failure'); END;`);
      const blockedFailure = payload(await b.call('team.submit', { outcome: 'blocked', blockedReason: 'EXECUTE_REQUIRED', summary: 'Failure injection' }));
      expect(blockedFailure).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'INTERNAL_ERROR' });
      expect(teamRepo.findById(atomicMissionId)).toMatchObject({ ok: true, value: { state: 'planning', currentRole: 'planner' } });
      expect(db.prepare('SELECT checkpoint_id, task_status, next_action FROM work_memory_checkpoints WHERE workspace_id = ? AND is_current = 1').get(wsA.id)).toEqual(checkpointBeforeFailure);
      expect(auditRepo.list(500).filter((event) => event.action === 'team.mission_blocked' && event.metadata.missionId === atomicMissionId)).toHaveLength(0);
      db.exec('DROP TRIGGER fail_acceptance_blocked_checkpoint');
      expect(payload(await b.call('team.stop', {}))).toMatchObject({ ok: true, value: { state: 'stopped' } });

      const desktopService = createTeamService({
        teamRepo,
        workspaceRepo,
        audit: auditRepo,
        transitionUow: createTeamTransitionUnitOfWork(db),
        freshness: {
          current(workspace) {
            const status = gitSafety.status(workspace.canonicalRoot, 200);
            return status.ok
              ? ok({ kind: 'git_status', value: status.value.statusId } as TeamFreshnessRef)
              : ok({ kind: 'none', value: 'unsupported' } as TeamFreshnessRef);
          },
        },
      });
      const rendererStatus = createDesktopTeamController(desktopService).status({ missionId });
      expect(rendererStatus).toMatchObject({ ok: true, value: { state: 'completed', finalResultSummary: 'All controlled Team work is complete' } });

      const durable = JSON.stringify({
        missions: db.prepare('SELECT * FROM team_missions').all(),
        tasks: db.prepare('SELECT * FROM team_work_items').all(),
        handoffs: db.prepare('SELECT * FROM team_role_handoffs').all(),
        findings: db.prepare('SELECT * FROM team_reviewer_findings').all(),
        workMemory: db.prepare('SELECT * FROM work_memory_checkpoints').all(),
        audit: db.prepare('SELECT * FROM audit_events').all(),
        renderer: rendererStatus,
      });
      expect(durable).not.toMatch(/SENTINEL_TEAM_ACCEPTANCE_SECRET|RAW_CHAT_REASONING_SENTINEL|RAW_FILE_CONTENT_SENTINEL_FAIL|RAW_TASK2_FILE_SENTINEL_PASS|RAW_VERIFY_OUTPUT_SENTINEL|RAW_SERENA_OUTPUT_SENTINEL/);
      expect(durable).not.toMatch(/rawPrompt|chainOfThought|reasoning|fileContent|diffContent|stdout|stderr|argv|process\.env|approvalBinding/i);

      const serenaRoot = path.join(process.cwd(), '.serena');
      expect(fs.existsSync(serenaRoot)).toBe(true);
      expect(git(process.cwd(), 'ls-files', '.serena')).toBe('');
      expect(git(process.cwd(), 'status', '--porcelain=v1', '--', '.serena')).toMatch(/^\?\? \.serena\//);
      expect(git(process.cwd(), 'status', '--porcelain=v1')).toBe(repoStatusBefore);
      expect(semanticWriteCalls).toBe(0);
    } finally {
      if (serverA) await serverA.close();
      if (serverB) await serverB.close();
    }
  }, 120_000);
});
