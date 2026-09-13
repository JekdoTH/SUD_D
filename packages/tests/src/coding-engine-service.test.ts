import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppError, AuditEvent, CodingEngineRuntimeHealth, CodingEngineWorkspaceContext, Workspace } from '@sud-d/domain';
import { CodingEngineRuntimeFailure } from '@sud-d/domain';
import { createCodingEngineService, type CodingEngineRuntimePort } from '@sud-d/application';
import type { AuditRepository, WorkspaceRepository } from '@sud-d/infrastructure';

function workspace(id: string, canonicalRoot: string, isActive = true): Workspace {
  return {
    id,
    displayName: id,
    canonicalRoot,
    isActive,
    createdAt: new Date('2026-09-04T00:00:00Z'),
    updatedAt: new Date('2026-09-04T00:00:00Z'),
  };
}

function health(context: CodingEngineWorkspaceContext): CodingEngineRuntimeHealth {
  return {
    engine: 'serena',
    version: '1.7.0',
    serverName: 'Serena',
    serverVersion: '1.28.1',
    toolCount: 22,
    workspaceCanonicalRoot: context.canonicalRoot,
    projectName: context.projectName,
    lspReady: true,
  };
}

function fakeRepos(initial: Workspace[] = []) {
  const workspaces = [...initial];
  const events: Array<Omit<AuditEvent, 'id'>> = [];
  const workspaceRepo: WorkspaceRepository = {
    list: () => [...workspaces],
    findById: (id) => workspaces.find((item) => item.id === id),
    findByCanonicalRoot: (root) => workspaces.find((item) => item.canonicalRoot === root),
    save: () => { throw new Error('not used'); },
    setActive: () => undefined,
    remove: () => undefined,
  };
  const auditRepo: AuditRepository = {
    append: (event) => {
      events.push(event);
      return { ...event, id: String(events.length) };
    },
    list: () => events.map((event, index) => ({ ...event, id: String(index + 1) })).reverse(),
    hasSessionActivitySince: (sessionType, since) => events.some(
      (event) => event.sessionType === sessionType && event.timestamp > since,
    ),
  };
  return { workspaceRepo, auditRepo, events, workspaces };
}

function fakeRuntime(options: {
  startError?: CodingEngineRuntimeFailure;
  repairError?: Error;
  deferStart?: boolean;
} = {}) {
  let releaseStart: (() => void) | null = null;
  const calls: Array<{ operation: string; context?: CodingEngineWorkspaceContext }> = [];
  const runtime: CodingEngineRuntimePort & { calls: typeof calls; releaseStart: () => void } = {
    calls,
    releaseStart: () => releaseStart?.(),
    async start(context) {
      calls.push({ operation: 'start', context });
      if (options.deferStart) await new Promise<void>((resolve) => { releaseStart = resolve; });
      if (options.startError) throw options.startError;
      return health(context);
    },
    async stop() {
      calls.push({ operation: 'stop' });
    },
    async repair(context) {
      calls.push({ operation: 'repair', context });
      if (options.repairError) throw options.repairError;
      return health(context);
    },
  };
  return runtime;
}

function expectError(result: Awaited<ReturnType<ReturnType<typeof createCodingEngineService>['start']>>, code: AppError['code']) {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

describe('Coding Engine lifecycle service', () => {
  it('starts unavailable with no failure', () => {
    const repos = fakeRepos();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, fakeRuntime());
    expect(service.getStatus()).toEqual({ engine: 'serena', state: 'unavailable', workspaceId: null, failure: null });
  });

  it('fails closed when no active Workspace is selected', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo', false)]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    const result = await service.start();

    expectError(result, 'CODING_ENGINE_WORKSPACE_NOT_SELECTED');
    expect(runtime.calls).toEqual([]);
  });

  it('starts the active Workspace and records safe lifecycle audit', async () => {
    const root = path.join('C:\\workspaces', 'alpha');
    const repos = fakeRepos([workspace('ws-1', root)]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    const result = await service.start();

    expect(result).toMatchObject({ ok: true, value: { state: 'ready', workspaceId: 'ws-1', failure: null } });
    expect(runtime.calls[0]).toEqual({
      operation: 'start',
      context: { workspaceId: 'ws-1', canonicalRoot: root, projectName: 'alpha' },
    });
    expect(repos.events.map((event) => event.action)).toEqual(['coding_engine.start.requested', 'coding_engine.ready']);
    expect(JSON.stringify(repos.events)).not.toContain(root);
  });

  it('maps bootstrap unavailable to unavailable and runtime health failures to needs repair', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const unavailable = createCodingEngineService(
      repos.workspaceRepo,
      repos.auditRepo,
      fakeRuntime({ startError: new CodingEngineRuntimeFailure('CODING_ENGINE_BOOTSTRAP_UNAVAILABLE') }),
    );
    expectError(await unavailable.start(), 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE');
    expect(unavailable.getStatus().state).toBe('unavailable');

    const repair = createCodingEngineService(
      repos.workspaceRepo,
      repos.auditRepo,
      fakeRuntime({ startError: new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH') }),
    );
    expectError(await repair.start(), 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    expect(repair.getStatus().state).toBe('needs_repair');
  });

  it('is idempotent while ready for the same Workspace', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    await service.start();
    await service.start();

    expect(runtime.calls.filter((call) => call.operation === 'start')).toHaveLength(1);
  });

  it('stops old runtime before starting after active Workspace changes', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo-one')]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    await service.start();
    repos.workspaces[0] = workspace('ws-2', 'C:\\repo-two');
    await service.start();

    expect(runtime.calls.map((call) => call.operation)).toEqual(['start', 'stop', 'start']);
  });

  it('stops and remains idempotent', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    await service.start();
    const stopped = await service.stop();
    const stoppedAgain = await service.stop();

    expect(stopped).toMatchObject({ ok: true, value: { state: 'unavailable', workspaceId: null, failure: null } });
    expect(stoppedAgain).toMatchObject({ ok: true, value: { state: 'unavailable', workspaceId: null, failure: null } });
    expect(runtime.calls.filter((call) => call.operation === 'stop')).toHaveLength(1);
  });

  it('restarts by stopping then starting the active Workspace', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    await service.start();
    await service.restart();

    expect(runtime.calls.map((call) => call.operation)).toEqual(['start', 'stop', 'start']);
  });

  it('repairs through the runtime seam and reports repair failures safely', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const runtime = fakeRuntime();
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);
    const repaired = await service.repair();
    expect(repaired).toMatchObject({ ok: true, value: { state: 'ready', workspaceId: 'ws-1' } });
    expect(runtime.calls.map((call) => call.operation)).toEqual(['repair']);

    const failing = createCodingEngineService(
      repos.workspaceRepo,
      repos.auditRepo,
      fakeRuntime({ repairError: new Error('raw failure') }),
    );
    expectError(await failing.repair(), 'CODING_ENGINE_REPAIR_FAILED');
    expect(failing.getStatus().state).toBe('needs_repair');
  });

  it('rejects concurrent lifecycle calls with a safe busy code', async () => {
    const repos = fakeRepos([workspace('ws-1', 'C:\\repo')]);
    const runtime = fakeRuntime({ deferStart: true });
    const service = createCodingEngineService(repos.workspaceRepo, repos.auditRepo, runtime);

    const first = service.start();
    const second = await service.stop();
    runtime.releaseStart();
    await first;

    expectError(second, 'CODING_ENGINE_LIFECYCLE_BUSY');
  });
});
