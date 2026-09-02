import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTeamService, type TeamFreshnessPort } from '@sud-d/application';
import {
  DesktopTeamMissionDtoSchema,
  IPC_CHANNELS,
  TeamStatusInputSchema,
  TeamStopInputSchema,
  type DesktopTeamMissionDto,
} from '@sud-d/contracts';
import {
  canonicalizePath,
  createAuditRepository,
  createTeamRepository,
  createWorkspaceRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import type { AppError, Result, TeamFreshnessRef, Workspace } from '@sud-d/domain';
import { createDesktopTeamController } from '../../desktop/electron/team-controller.js';
import { registerDesktopTeamIpcHandlers } from '../../desktop/electron/team-ipc.js';

const tempDirs: string[] = [];
const openDbs: Db[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-team-desktop-'));
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

function makeHarness(options: { freshness?: TeamFreshnessRef } = {}) {
  const root = tempDir();
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'team desktop\n', 'utf8');
  const db = openTrackedDb(path.join(root, 'state', 'sud-d.db'));
  const workspaceRepo = createWorkspaceRepository(db);
  const workspace = workspaceRepo.save('Team Desktop Workspace', canonical(workspaceRoot));
  workspaceRepo.setActive(workspace.id);
  const auditRepo = createAuditRepository(db);
  const teamRepo = createTeamRepository(db);
  const freshness = options.freshness ?? { kind: 'git_status', value: 'desktop-a' } as TeamFreshnessRef;
  const freshnessPort: TeamFreshnessPort = {
    current(_workspace: Workspace) {
      return { ok: true as const, value: freshness };
    },
  };
  const service = createTeamService({ teamRepo, workspaceRepo, audit: auditRepo, freshness: freshnessPort });
  const controller = createDesktopTeamController(service);
  return { root, workspaceRoot, db, workspaceRepo, workspace, auditRepo, teamRepo, service, controller };
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Team Mode - Desktop contracts, IPC, and UI surface', () => {
  it('uses strict read/stop schemas and no renderer-side transition or privilege inputs', () => {
    expect(IPC_CHANNELS.TEAM_STATUS).toBe('team:status');
    expect(IPC_CHANNELS.TEAM_STOP).toBe('team:stop');
    expect(TeamStatusInputSchema.safeParse({}).success).toBe(true);
    expect(TeamStatusInputSchema.safeParse({ missionId: '00000000-0000-4000-8000-000000000001' }).success).toBe(true);
    expect(TeamStatusInputSchema.safeParse({ missionId: '00000000-0000-4000-8000-000000000001', outcome: 'complete' }).success).toBe(false);
    expect(TeamStopInputSchema.safeParse({}).success).toBe(true);
    expect(TeamStopInputSchema.safeParse({ command: 'pnpm test' }).success).toBe(false);
    expect(TeamStopInputSchema.safeParse({ decision: 'approve' }).success).toBe(false);
  });

  it('controller returns safe Team status DTOs and non-destructive stop results', () => {
    const h = makeHarness();
    const started = requireOk(h.service.start({ goal: 'Desktop Team SENTINEL_DESKTOP_TEAM_SECRET_001' }));
    requireOk(h.service.submit({
      outcome: 'plan_ready',
      summary: 'Plan',
      workItems: [{ title: 'Use existing Workspace tools', targetPathHint: 'README.md' }],
    }));

    const status = h.controller.status({});
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(DesktopTeamMissionDtoSchema.parse(status.value)).toEqual(status.value);
    expect(status.value).toMatchObject({ missionId: started.missionId, state: 'implementing', currentRole: 'implementer' });
    const serializedStatus = JSON.stringify(status.value);
    expect(serializedStatus).not.toContain('SENTINEL_DESKTOP_TEAM_SECRET_001');
    expect(serializedStatus).not.toMatch(/rawPrompt|chainOfThought|reasoning|fileContent|diffContent|stdout|stderr|argv|env|hmac|approvalBinding/i);

    const stopped = h.controller.stop({});
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value).toMatchObject({ missionId: started.missionId, state: 'stopped' });
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'README.md'), 'utf8')).toBe('team desktop\n');
    expect(h.controller.status({})).toMatchObject({ ok: true, value: null });
  });

  it('fixed-purpose IPC validates sender and payload before invoking Team controller', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const status = vi.fn((): Result<DesktopTeamMissionDto | null, AppError> => ({ ok: true, value: null }));
    const safeStopValue: DesktopTeamMissionDto = {
      missionId: '00000000-0000-4000-8000-000000000001',
      workspaceId: '00000000-0000-4000-8000-000000000002',
      goalSummary: 'safe',
      state: 'stopped' as const,
      reviewRound: 0,
      workItems: [],
      handoffs: [],
      findings: [],
      createdAt: '2026-09-02T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      stoppedAt: '2026-09-02T00:00:00.000Z',
    };
    const stop = vi.fn((): Result<DesktopTeamMissionDto, AppError> => ({ ok: true, value: safeStopValue }));
    registerDesktopTeamIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { status, stop },
      () => true,
    );

    expect(await handlers.get(IPC_CHANNELS.TEAM_STATUS)?.({ sender: { id: 1 } }, { outcome: 'complete' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(status).not.toHaveBeenCalled();
    expect(await handlers.get(IPC_CHANNELS.TEAM_STOP)?.({ sender: { id: 1 } }, { missionId: '00000000-0000-4000-8000-000000000001', command: 'cmd.exe' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(stop).not.toHaveBeenCalled();

    expect(await handlers.get(IPC_CHANNELS.TEAM_STATUS)?.({ sender: { id: 1 } }, {})).toMatchObject({ ok: true, value: null });
    expect(status).toHaveBeenCalledOnce();
    expect(await handlers.get(IPC_CHANNELS.TEAM_STOP)?.({ sender: { id: 1 } }, {})).toMatchObject({ ok: true, value: safeStopValue });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('invalid sender cannot read or stop Team missions', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const status = vi.fn((): Result<DesktopTeamMissionDto | null, AppError> => ({ ok: true, value: null }));
    const stop = vi.fn((): Result<DesktopTeamMissionDto, AppError> => ({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'should not call' } }));
    registerDesktopTeamIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { status, stop },
      () => false,
    );
    expect(await handlers.get(IPC_CHANNELS.TEAM_STATUS)?.({ sender: {} }, {})).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handlers.get(IPC_CHANNELS.TEAM_STOP)?.({ sender: {} }, {})).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(status).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('preload and Team page expose only Team status/stop and no Execute/network/file/Git authority', () => {
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const teamStart = preload.indexOf('  team: {');
    const teamEnd = preload.indexOf('  connection: {', teamStart);
    const teamSurface = teamStart >= 0 && teamEnd > teamStart ? preload.slice(teamStart, teamEnd) : '';
    expect(teamSurface).toContain('status:');
    expect(teamSurface).toContain('stop:');
    expect(teamSurface).not.toMatch(/submit|start|transition|file|git|execute|shell|network|approval|ipcRenderer\.send/i);

    const page = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/TeamPage.tsx'), 'utf8');
    expect(page).toContain('Team Mode');
    expect(page).toContain('Stop Team');
    expect(page).toContain('No Execute capability is available');
    expect(page).toContain('window.sudD.team.status');
    expect(page).toContain('window.sudD.team.stop');
    expect(page).not.toMatch(/window\.sudD\.(workspace|approval|connection|audit|activity)|shell|network|terminal|Always Allow|delete|recovery/i);
    expect(page).not.toMatch(/child_process|spawn|execFile|exec\s*\(|process\.env/i);
  });
});
