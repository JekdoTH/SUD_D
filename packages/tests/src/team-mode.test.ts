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
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  createWorkMemoryRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';
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
const GIT_TOOLS = ['git.detect', 'git.status', 'git.diff', 'git.checkpoint'] as const;
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
  let freshness = options.freshness ?? { kind: 'git_status', value: 'fresh-a' } as TeamFreshnessRef;
  const freshnessPort: TeamFreshnessPort = {
    current(_workspace: Workspace) {
      return { ok: true, value: freshness };
    },
  };
  const service = createTeamService({ teamRepo, workspaceRepo, audit: auditRepo, freshness: freshnessPort });
  const setFreshness = (next: TeamFreshnessRef) => { freshness = next; };
  return { root, workspaceRoot, db, workspaceRepo, workspace, auditRepo, teamRepo, service, setFreshness };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Team Mode - state machine and persistence', () => {
  it('runs the sequential Planner to Implementer to Reviewer mission flow and completes', () => {
    const h = makeHarness();
    const started = requireOk(h.service.start({ goal: 'Implement the small safe change SENTINEL_TEAM_GOAL_SECRET' }));
    expect(started).toMatchObject({ state: 'planning', currentRole: 'planner', reviewRound: 0 });
    expect(started.goalSummary).not.toContain('SENTINEL_TEAM_GOAL_SECRET');

    expect(h.service.start({ goal: 'second mission' })).toMatchObject({ ok: false, error: { code: 'TEAM_MISSION_CONFLICT' } });

    const planned = requireOk(h.service.submit({
      outcome: 'plan_ready',
      summary: 'Plan ready',
      workItems: [{ title: 'Edit docs', targetPathHint: 'docs/plan.md' }],
    }));
    expect(planned).toMatchObject({ state: 'implementing', currentRole: 'implementer', reviewRound: 0 });
    expect(planned.workItems).toHaveLength(1);
    expect(planned.workItems[0]).toMatchObject({ sequence: 1, title: 'Edit docs', targetPathHint: 'docs/plan.md' });
    expect(planned.handoffs.map((handoff) => handoff.outcome)).toEqual(['plan_ready']);

    const implemented = requireOk(h.service.submit({ outcome: 'implementation_ready', summary: 'Implementation ready' }));
    expect(implemented).toMatchObject({ state: 'reviewing', currentRole: 'reviewer', reviewRound: 0 });

    const completed = requireOk(h.service.submit({ outcome: 'complete', summary: 'Looks good' }));
    expect(completed).toMatchObject({ state: 'completed', reviewRound: 0 });
    expect(completed.currentRole).toBeUndefined();
    expect(completed.completedAt).toBeTruthy();
    expect(h.service.submit({ outcome: 'blocked', blockedReason: 'UNSUPPORTED_OPERATION', summary: 'late' })).toMatchObject({ ok: false, error: { code: 'TEAM_MISSION_NOT_FOUND' } });

    const rows = JSON.stringify(h.db.prepare('SELECT * FROM team_missions').all());
    const audit = JSON.stringify(h.auditRepo.list(100));
    expect(rows).not.toContain('SENTINEL_TEAM_GOAL_SECRET');
    expect(audit).not.toContain('SENTINEL_TEAM_GOAL_SECRET');
  });

  it('persists active mission state across service recreation and stops non-destructively', () => {
    const h = makeHarness();
    const started = requireOk(h.service.start({ goal: 'Resume this mission' }));
    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Read file' }] }));

    const resumedService = createTeamService({
      teamRepo: createTeamRepository(h.db),
      workspaceRepo: h.workspaceRepo,
      audit: h.auditRepo,
      freshness: { current: () => ({ ok: true, value: { kind: 'git_status', value: 'fresh-a' } }) },
    });
    expect(requireOk(resumedService.status())).toMatchObject({ missionId: started.missionId, state: 'implementing', currentRole: 'implementer' });
    const stopped = requireOk(resumedService.stop());
    expect(stopped).toMatchObject({ missionId: started.missionId, state: 'stopped' });
    expect(fs.existsSync(path.join(h.workspaceRoot, 'README.md'))).toBe(true);
    expect(requireOk(resumedService.status())).toBeNull();
    expect(requireOk(resumedService.status({ missionId: started.missionId }))).toMatchObject({ state: 'stopped' });
  });

  it('fails illegal transitions closed and caps reviewer return loops at three', () => {
    const h = makeHarness();
    requireOk(h.service.start({ goal: 'Review loop mission' }));
    expect(h.service.submit({ outcome: 'complete', summary: 'too early' })).toMatchObject({ ok: false, error: { code: 'TEAM_TRANSITION_INVALID' } });
    expect(requireOk(h.service.status())).toMatchObject({ state: 'planning', currentRole: 'planner', reviewRound: 0 });

    requireOk(h.service.submit({ outcome: 'plan_ready', summary: 'Plan', workItems: [{ title: 'Task' }] }));
    for (let round = 1; round <= 3; round += 1) {
      requireOk(h.service.submit({ outcome: 'implementation_ready', summary: `Ready ${round}` }));
      const returned = requireOk(h.service.submit({
        outcome: 'changes_requested',
        summary: `Changes ${round}`,
        findings: [{ severity: 'medium', summary: `Fix ${round}`, targetPathHint: 'src/file.ts' }],
      }));
      expect(returned).toMatchObject({ state: 'implementing', currentRole: 'implementer', reviewRound: round });
    }
    requireOk(h.service.submit({ outcome: 'implementation_ready', summary: 'Ready 4' }));
    const limited = requireOk(h.service.submit({
      outcome: 'changes_requested',
      summary: 'One too many',
      findings: [{ severity: 'high', summary: 'Still wrong' }],
    }));
    expect(limited).toMatchObject({ state: 'blocked', blockedReason: 'REVIEW_LOOP_LIMIT', reviewRound: 3 });
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

  it('production MCP exposes exactly 26 tools with only the approved semantic reads and writes', async () => {
    const h = makeHarness();
    const server = createProductionMcpServer({
      workspaceRepo: h.workspaceRepo,
      auditRepo: h.auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      teamRepo: h.teamRepo,
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

    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'team.submit', arguments: { outcome: 'plan_ready', summary: 'Plan ready', workItems: [{ title: 'Use existing workspace tools', targetPathHint: 'README.md' }] } } });
    expect(parsePayload(await reader.next())).toMatchObject({ ok: true, code: 'EXECUTED', value: { state: 'implementing', currentRole: 'implementer' } });

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
