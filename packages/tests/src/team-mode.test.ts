import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import {
  createTeamCapabilities,
  createTeamService,
  createToolCapabilityRegistry,
  createToolKernel,
  type TeamFreshnessPort,
} from '@sud-d/application';
import {
  canonicalizePath,
  createAuditRepository,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  createWorkMemoryRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';
import { TEAM_ROLES, TEAM_STATES, TEAM_SUBMISSION_OUTCOMES, TEAM_WORK_ITEM_STATUSES } from '@sud-d/domain';
import type { TeamFreshnessRef, TeamMissionView, ToolKernelResult, Workspace } from '@sud-d/domain';

const PROTOCOL_VERSION = '2025-06-18';
const WORKSPACE_TOOLS = [
  'workspace.list',
  'workspace.stat',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.create_text_file',
  'workspace.write_text_file',
] as const;
const GIT_TOOLS = ['git.detect', 'git.status', 'git.diff', 'git.checkpoint', 'git.commit'] as const;
const TEAM_TOOLS = ['team.start', 'team.status', 'team.submit', 'team.stop'] as const;
const CODE_READ_TOOLS = ['code.overview', 'code.find_symbol', 'code.find_references', 'code.search', 'code.diagnostics'] as const;
const CODE_WRITE_TOOLS = ['code.replace_symbol', 'code.insert_before', 'code.insert_after', 'code.rename'] as const;
const VERIFY_TOOLS = ['verify.run'] as const;
const WORK_MEMORY_TOOLS = ['work.resume', 'work.checkpoint'] as const;
const APPROVED_PRODUCTION_TOOLS = [...WORKSPACE_TOOLS, ...GIT_TOOLS, ...TEAM_TOOLS, ...CODE_READ_TOOLS, ...CODE_WRITE_TOOLS, ...VERIFY_TOOLS, ...WORK_MEMORY_TOOLS].sort();

const tempDirs: string[] = [];
const openDbs: Db[] = [];
let invocationCounter = 0;

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

function tempDir(prefix = 'sudd-team-mode-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error(`canonicalize failed: ${value}`);
  return result.value;
}

function openTrackedDb(filePath: string): Db {
  const db = openDatabase(filePath);
  openDbs.push(db);
  return db;
}

function requireOk<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T {
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.error)}`);
  return result.value;
}


function requireExecuted<T>(result: ToolKernelResult): T {
  if (!result.ok) throw new Error(`expected executed Tool Kernel result, got ${result.code}/${result.causeCode ?? ''}`);
  return result.value as T;
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
    next(timeoutMs = 4000): Promise<RpcMessage> {
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

function makeHarness(options: { freshness?: TeamFreshnessRef } = {}) {
  const root = tempDir();
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'hello team\n', 'utf8');
  const db = openTrackedDb(path.join(root, 'state', 'sud-d.db'));
  const workspaceRepo = createWorkspaceRepository(db);
  const workspace = workspaceRepo.save('Team Workspace', canonical(workspaceRoot));
  workspaceRepo.setActive(workspace.id);
  const auditRepo = createAuditRepository(db);
  const teamRepo = createTeamRepository(db);
  const workMemoryRepo = createWorkMemoryRepository(db);
  let freshness = options.freshness ?? { kind: 'git_status', value: 'fresh-a' } as TeamFreshnessRef;
  const freshnessPort: TeamFreshnessPort = {
    current(_workspace: Workspace) {
      return { ok: true, value: freshness };
    },
  };
  const service = createTeamService({ teamRepo, workspaceRepo, audit: auditRepo, transitionUow: createTeamTransitionUnitOfWork(db), freshness: freshnessPort });
  const setFreshness = (next: TeamFreshnessRef) => { freshness = next; };
  return { root, workspaceRoot, db, workspaceRepo, workspace, auditRepo, teamRepo, workMemoryRepo, service, setFreshness };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Team Mode - state machine and persistence', () => {
  it('pins the exact V3 Team domain vocabulary', () => {
    expect(TEAM_ROLES).toEqual(['planner', 'implementer', 'validator', 'reviewer']);
    expect(TEAM_STATES).toEqual(['planning', 'implementing', 'validating', 'reviewing', 'completed', 'blocked', 'stopped']);
    expect(TEAM_SUBMISSION_OUTCOMES).toEqual(['plan_ready', 'work_ready', 'validation_passed', 'validation_failed', 'task_approved', 'changes_requested', 'blocked']);
    expect(TEAM_WORK_ITEM_STATUSES).toEqual(['pending', 'in_progress', 'validating', 'reviewing', 'done', 'blocked']);
  });
  it('progresses two Tasks through Worker, Validator, Reviewer, rework, and automatic next assignment', () => {
    const h = makeHarness();
    requireOk(h.service.start({ goal: 'Complete two bounded Tasks' }));
    const planned = requireOk(h.service.submit({
      outcome: 'plan_ready',
      summary: 'Two Task plan',
      workItems: [{ title: 'Task one' }, { title: 'Task two' }],
    }));
    expect(planned).toMatchObject({ state: 'implementing', currentRole: 'implementer' });
    expect(planned.workItems.map((item) => [item.title, item.status, item.reworkCount])).toEqual([
      ['Task one', 'in_progress', 0],
      ['Task two', 'pending', 0],
    ]);

    const workReady = requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Task one ready' }));
    expect(workReady).toMatchObject({ state: 'validating', currentRole: 'validator' });
    expect(workReady.workItems[0]).toMatchObject({ status: 'validating', reworkCount: 0 });
    const failed = requireOk(h.service.submit({
      outcome: 'validation_failed',
      summary: 'Focused test failed',
      verification: ['test failed'],
      findings: [{ severity: 'medium', summary: 'Fix Task one' }],
    }));
    expect(failed).toMatchObject({ state: 'implementing', currentRole: 'implementer' });
    expect(failed.workItems[0]).toMatchObject({ title: 'Task one', status: 'in_progress', reworkCount: 1 });

    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Task one fixed' }));
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Validation passed', verification: ['test passed'] }));
    const reviewing = requireOk(h.service.status());
    expect(reviewing).toMatchObject({ state: 'reviewing', currentRole: 'reviewer' });
    expect(reviewing?.workItems[0]).toMatchObject({ status: 'reviewing', reworkCount: 1 });

    const taskTwo = requireOk(h.service.submit({ outcome: 'task_approved', summary: 'Task one approved' }));
    expect(taskTwo).toMatchObject({ state: 'implementing', currentRole: 'implementer' });
    expect(taskTwo.workItems.map((item) => [item.title, item.status, item.reworkCount])).toEqual([
      ['Task one', 'done', 1],
      ['Task two', 'in_progress', 0],
    ]);

    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Task two ready' }));
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Task two validated' }));
    const completed = requireOk(h.service.submit({ outcome: 'task_approved', summary: 'Task two approved' }));
    expect(completed).toMatchObject({ state: 'completed' });
    expect(completed.workItems.map((item) => item.status)).toEqual(['done', 'done']);
  });
  it('persists active mission state across service recreation and stops non-destructively', () => {
    const h = makeHarness();
    const started = requireOk(h.service.start({ goal: 'Resume this mission' }));
    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Read file' }] }));

    const resumedService = createTeamService({
      teamRepo: createTeamRepository(h.db),
      workspaceRepo: h.workspaceRepo,
      audit: h.auditRepo,
      transitionUow: createTeamTransitionUnitOfWork(h.db),
      freshness: { current: () => ({ ok: true, value: { kind: 'git_status', value: 'fresh-a' } }) },
    });
    expect(requireOk(resumedService.status())).toMatchObject({ missionId: started.missionId, state: 'implementing', currentRole: 'implementer' });
    const stopped = requireOk(resumedService.stop());
    expect(stopped).toMatchObject({ missionId: started.missionId, state: 'stopped' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'README.md'))).toBe(true);
    expect(requireOk(resumedService.status())).toBeNull();
    expect(requireOk(resumedService.status({ missionId: started.missionId }))).toMatchObject({ state: 'stopped' });
  });

  it('fails illegal transitions closed and caps return-to-Worker cycles at three per Task', () => {
    const h = makeHarness();
    requireOk(h.service.start({ goal: 'Review loop mission' }));
    expect(h.service.submit({ outcome: 'task_approved', summary: 'too early' })).toMatchObject({ ok: false, error: { code: 'TEAM_TRANSITION_INVALID' } });
    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] }));

    for (let round = 1; round <= 3; round += 1) {
      requireOk(h.service.submit({ outcome: 'work_ready', summary: `Ready ${round}` }));
      requireOk(h.service.submit({ outcome: 'validation_passed', summary: `Validated ${round}` }));
      const returned = requireOk(h.service.submit({
        outcome: 'changes_requested',
        summary: `Changes ${round}`,
        findings: [{ severity: 'medium', summary: `Fix ${round}`, targetPathHint: 'src/file.ts' }],
      }));
      expect(returned).toMatchObject({ state: 'implementing', currentRole: 'implementer' });
      expect(returned.workItems[0]).toMatchObject({ status: 'in_progress', reworkCount: round });
    }

    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Ready 4' }));
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Validated 4' }));
    const limited = requireOk(h.service.submit({
      outcome: 'changes_requested',
      summary: 'One too many',
      findings: [{ severity: 'high', summary: 'Still wrong' }],
    }));
    expect(limited).toMatchObject({ state: 'blocked', blockedReason: 'REVIEW_LOOP_LIMIT' });
    expect(limited.workItems[0]).toMatchObject({ reworkCount: 3 });
  });
  it('atomically derives exact Work Memory continuation across Team states without a ClientSession', () => {
    const h = makeHarness();
    requireOk(h.service.start({ goal: 'Checkpoint Team continuation' }));
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({
      ok: true,
      value: {
        task: { title: 'Plan Team mission', status: 'in_progress' },
        nextAction: 'Plan the Team mission and submit plan_ready.',
      },
    });

    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task one' }] }));
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({
      ok: true,
      value: { task: { title: 'Task one', status: 'in_progress' }, nextAction: 'Work on Task 1/1: Task one; then submit work_ready.' },
    });
    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Ready' }));
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({
      ok: true,
      value: { nextAction: 'Validate Task 1/1: Task one; then submit validation_passed or validation_failed.' },
    });
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Passed', verification: ['test passed'] }));
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({
      ok: true,
      value: { verification: ['test passed'], nextAction: 'Review Task 1/1: Task one; then submit task_approved or changes_requested.' },
    });
    requireOk(h.service.submit({ outcome: 'task_approved', summary: 'Approved' }));
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({
      ok: true,
      value: { task: { status: 'completed' }, nextAction: 'Team mission completed; review the Final Result.' },
    });

    const stopped = makeHarness();
    requireOk(stopped.service.start({ goal: 'Stop continuation' }));
    requireOk(stopped.service.stop());
    expect(stopped.workMemoryRepo.loadCurrent(stopped.workspace.id)).toMatchObject({
      ok: true,
      value: { task: { status: 'blocked' }, nextAction: 'Team mission stopped; start a new Team mission to continue this Goal.' },
    });
  });
  it('applies role-specific freshness: Worker adopts; Validator and Reviewer must match; blocked ignores Git drift', () => {
    const worker = makeHarness({ freshness: { kind: 'git_status', value: 'worker-a' } });
    requireOk(worker.service.start({ goal: 'Worker adoption' }));
    requireOk(worker.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] }));
    worker.setFreshness({ kind: 'git_status', value: 'worker-b' });
    const adopted = requireOk(worker.service.submit({ outcome: 'work_ready', summary: 'Intentional project edit' }));
    expect(adopted).toMatchObject({ state: 'validating', currentRole: 'validator', freshness: { kind: 'git_status', value: 'worker-b' } });

    worker.setFreshness({ kind: 'git_status', value: 'validator-drift' });
    const validatorStale = requireOk(worker.service.submit({ outcome: 'validation_passed', summary: 'Should re-evaluate' }));
    expect(validatorStale).toMatchObject({ state: 'blocked', blockedReason: 'GIT_STATE_STALE' });

    const reviewer = makeHarness({ freshness: { kind: 'git_status', value: 'review-a' } });
    requireOk(reviewer.service.start({ goal: 'Reviewer match' }));
    requireOk(reviewer.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] }));
    requireOk(reviewer.service.submit({ outcome: 'work_ready', summary: 'Ready' }));
    requireOk(reviewer.service.submit({ outcome: 'validation_passed', summary: 'Passed' }));
    reviewer.setFreshness({ kind: 'git_status', value: 'review-drift' });
    const reviewerStale = requireOk(reviewer.service.submit({ outcome: 'task_approved', summary: 'Should not approve' }));
    expect(reviewerStale).toMatchObject({ state: 'blocked', blockedReason: 'GIT_STATE_STALE' });

    const blocked = makeHarness({ freshness: { kind: 'git_status', value: 'blocked-a' } });
    requireOk(blocked.service.start({ goal: 'Safe blocker' }));
    blocked.setFreshness({ kind: 'git_status', value: 'blocked-b' });
    const terminal = requireOk(blocked.service.submit({ outcome: 'blocked', blockedReason: 'EXECUTE_REQUIRED', summary: 'Need an unavailable action' }));
    expect(terminal).toMatchObject({ state: 'blocked', blockedReason: 'EXECUTE_REQUIRED' });
  });
  it('detects stale workspace freshness before role transition and preserves prior plan state until blocking is recorded', () => {
    const h = makeHarness({ freshness: { kind: 'git_status', value: 'status-a' } });
    requireOk(h.service.start({ goal: 'Needs freshness' }));
    h.setFreshness({ kind: 'git_status', value: 'status-b' });
    const stale = requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] }));
    expect(stale).toMatchObject({ state: 'blocked', blockedReason: 'GIT_STATE_STALE' });
    expect(stale.currentRole).toBeUndefined();
    expect(stale.workItems).toHaveLength(0);
    const audit = h.auditRepo.list(20);
    expect(audit.map((event) => event.action)).toContain('team.stale_state_detected');
  });
  it('emits one safe Team transition audit per state-changing transition and no status audit noise', () => {
    const h = makeHarness();
    requireOk(h.service.start({ goal: 'Audit Team SENTINEL_TEAM_AUDIT_SECRET' }));
    requireOk(h.service.status());
    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task one' }] }));
    requireOk(h.service.status());
    requireOk(h.service.submit({ outcome: 'work_ready', summary: 'Worker ready' }));
    requireOk(h.service.submit({ outcome: 'validation_passed', summary: 'Validation passed', verification: ['test passed'] }));
    requireOk(h.service.submit({ outcome: 'task_approved', summary: 'Approved' }));

    const teamAudit = h.auditRepo.list(100).filter((event) => event.action.startsWith('team.'));
    expect(teamAudit.map((event) => event.action).sort()).toEqual([
      'team.mission_completed',
      'team.mission_started',
      'team.plan_accepted',
      'team.validation_passed',
      'team.worker_handoff',
    ].sort());
    expect(teamAudit).toHaveLength(5);
    expect(JSON.stringify(teamAudit)).not.toMatch(/SENTINEL_TEAM_AUDIT_SECRET|rawPrompt|reasoning|fileContent|diffContent|stdout|stderr|Serena/i);
  });
});

describe('Team Mode - Tool Kernel and production MCP capabilities', () => {
  it('registers four orchestration-only Team capabilities with fixed effects and no approval authority', async () => {
    const h = makeHarness();
    const capabilities = createTeamCapabilities({
      teamService: h.service,
      resolveWorkspaceSecurity: () => ({ ok: true, value: { sensitivity: 'normal', context: 'workspace', workspaceId: h.workspace.id } }),
    });
    expect(capabilities.map((capability) => [capability.name, capability.effect, Boolean(capability.approval)])).toEqual([
      ['team.start', 'create', false],
      ['team.status', 'read', false],
      ['team.submit', 'modify', false],
      ['team.stop', 'modify', false],
    ]);
    expect(capabilities.map((capability) => capability.name).join(' ')).not.toMatch(/execute|shell|network|delete|approval/i);

    const registry = createToolCapabilityRegistry(capabilities);
    expect(registry.ok).toBe(true);
    if (!registry.ok) throw new Error('registry failed');
    const kernel = createToolKernel({ registry: registry.value, audit: h.auditRepo });
    const start = requireExecuted<TeamMissionView>(await kernel.invoke({
      invocationId: `team-${++invocationCounter}`,
      session: { id: 'team-test', type: 'mcp-stdio' },
      capability: 'team.start',
      input: { goal: 'Coordinate a safe mission' },
    }));
    expect(start).toMatchObject({ state: 'planning', currentRole: 'planner' });
    const blocked = requireExecuted<TeamMissionView>(await kernel.invoke({
      invocationId: `team-${++invocationCounter}`,
      session: { id: 'team-test', type: 'mcp-stdio' },
      capability: 'team.submit',
      input: { outcome: 'blocked', blockedReason: 'EXECUTE_REQUIRED', summary: 'Tests require restricted execution' },
    }));
    expect(blocked).toMatchObject({ state: 'blocked', blockedReason: 'EXECUTE_REQUIRED' });
    expect(requireOk(h.service.status({ missionId: start.missionId }))).toMatchObject({ state: 'blocked', blockedReason: 'EXECUTE_REQUIRED' });
  });

  it('production MCP exposes exactly 27 tools with only the approved semantic reads and writes', async () => {
    const h = makeHarness();
    const server = createProductionMcpServer({
      workspaceRepo: h.workspaceRepo,
      auditRepo: h.auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      teamRepo: h.teamRepo,
      teamTransitionUow: createTeamTransitionUnitOfWork(h.db),
      semanticRead: { read: async () => ({ content: [] }) },
      semanticWrite: { write: async () => ({ content: [] }) },
      restrictedVerify: { run: async (_context, request) => ({ action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 1 }) },
      workMemoryRepo: createWorkMemoryRepository(h.db),
    });
    const input = new PassThrough();
    const output = new PassThrough();
    const reader = createReader(output);
    await server.connect(createStdioGatewayTransport(input, output));
    const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'team-mode-test', version: '1.0.0' } } });
    expect((await reader.next()).result?.serverInfo?.name).toBe('SUD-D');
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = ((await reader.next()).result?.tools ?? []).map((tool) => tool.name).filter((name): name is string => typeof name === 'string').sort();
    expect(tools).toEqual(APPROVED_PRODUCTION_TOOLS);
    expect(tools.join(' ')).not.toMatch(/dev\.verify|execute|shell|network|delete|recovery|approval\./i);
    expect(tools.join(' ')).not.toMatch(/code\.run|serena|callTool/i);

    send({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'work.resume', arguments: {} } });
    expect(parsePayload(await reader.next())).toMatchObject({ ok: true, code: 'EXECUTED' });

    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'team.start', arguments: { goal: 'Build a no-execute team plan' } } });
    expect(parsePayload(await reader.next())).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow', value: { state: 'planning', currentRole: 'planner' } });
    expect(h.workMemoryRepo.loadCurrent(h.workspace.id)).toMatchObject({ ok: true, value: { task: { title: 'Plan Team mission', status: 'in_progress' }, nextAction: 'Plan the Team mission and submit plan_ready.' } });

    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'team.submit', arguments: { outcome: 'plan_ready', summary: 'Plan ready', workItems: [{ title: 'Use existing workspace tools', targetPathHint: 'README.md' }] } } });
    expect(parsePayload(await reader.next())).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'implementing', currentRole: 'implementer' } });

    for (const [id, argumentsValue] of [
      [41, { outcome: 'implementation_ready', summary: 'legacy alias' }],
      [42, { outcome: 'complete', summary: 'legacy alias' }],
      [43, { outcome: 'work_ready', summary: 'forbidden selector', state: 'reviewing' }],
    ] as const) {
      send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'team.submit', arguments: argumentsValue } });
      const rejected = await reader.next();
      expect(rejected.error ?? rejected.result?.isError).toBeTruthy();
    }
    expect(requireOk(h.service.status())).toMatchObject({ state: 'implementing', currentRole: 'implementer' });

    send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'team.submit', arguments: { outcome: 'blocked', blockedReason: 'NETWORK_REQUIRED', summary: 'Remote API needed' } } });
    expect(parsePayload(await reader.next())).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'blocked', blockedReason: 'NETWORK_REQUIRED' } });

    send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'team.start', arguments: { goal: 'bad', command: 'pnpm test' } } });
    const invalid = await reader.next();
    expect(invalid.error ?? invalid.result?.isError).toBeTruthy();
    expect(JSON.stringify(invalid)).not.toMatch(/pnpm test|cmd|powershell|process/i);
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'README.md'), 'utf8')).toBe('hello team\n');
    await server.close();
  });
});
