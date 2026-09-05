import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ActivityListInputSchema,
  DesktopActivityEventDtoSchema,
  DoctorCheckDtoSchema,
  IPC_CHANNELS,
} from '@sud-d/contracts';
import {
  createAuditRepository,
  openDatabase,
  type Db,
} from '@sud-d/infrastructure';
import type {
  AuditEvent,
  ConnectionProfile,
  ConnectionServiceStatus,
  Workspace,
} from '@sud-d/domain';
import {
  createDesktopDiagnosticsController,
  type DesktopDiagnosticsDependencies,
} from '../../desktop/electron/diagnostics-controller.js';
import { registerDesktopDiagnosticsIpcHandlers } from '../../desktop/electron/diagnostics-ipc.js';

const openDbs: Db[] = [];
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-m07-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (openDbs.length > 0) openDbs.pop()?.close();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: '00000000-0000-4000-8000-000000000701',
    displayName: 'Workspace',
    canonicalRoot: 'C:\\workspace',
    isActive: true,
    createdAt: new Date('2026-08-30T12:00:00.000Z'),
    updatedAt: new Date('2026-08-30T12:00:00.000Z'),
    ...overrides,
  };
}

function profile(overrides: Partial<ConnectionProfile> = {}): ConnectionProfile {
  return {
    profileId: '00000000-0000-4000-8000-000000000702',
    displayName: 'OpenAI Secure Tunnel',
    provider: 'openai_secure_mcp_tunnel',
    transport: 'stdio',
    deviceName: 'Home-PC',
    autoStart: false,
    autoRestart: false,
    tunnelReference: 'tunnel_home',
    createdAt: new Date('2026-08-30T12:00:00.000Z'),
    updatedAt: new Date('2026-08-30T12:00:00.000Z'),
    ...overrides,
  };
}

function connectedStatus(): ConnectionServiceStatus {
  return {
    state: 'connected',
    session: {
      connectionSessionId: '00000000-0000-4000-8000-000000000703',
      profileId: '00000000-0000-4000-8000-000000000702',
      workspaceId: '00000000-0000-4000-8000-000000000701',
      workspaceCanonicalRoot: 'C:\\workspace',
      startedAt: new Date('2026-08-30T12:00:00.000Z'),
      provider: 'openai_secure_mcp_tunnel',
      transport: 'stdio',
      deviceName: 'Home-PC',
      tunnelReference: 'tunnel_home',
    },
    error: null,
  };
}

function auditEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '00000000-0000-4000-8000-000000000704',
    timestamp: new Date('2026-08-30T12:00:00.000Z'),
    sessionId: 'desktop',
    sessionType: 'desktop',
    action: 'connection.started',
    resultCode: 'OK',
    durationMs: 0,
    metadata: { operation: 'start', state: 'connected' },
    ...overrides,
  };
}

function diagnosticsDependencies(
  overrides: Partial<DesktopDiagnosticsDependencies> = {},
): DesktopDiagnosticsDependencies {
  return {
    dataDirectoryWritable: () => true,
    sqliteHealthy: () => true,
    listWorkspaces: () => [workspace()],
    workspaceRootStatus: () => ({ rootExists: true, rootIsDirectory: true }),
    listProfiles: () => [profile()],
    hasCredential: () => true,
    mcpGatewayAvailable: () => true,
    tunnelClientAvailable: () => true,
    connectionStatus: connectedStatus,
    tunnelRuntimeStatus: () => ({ state: 'healthy' }),
    listAuditEvents: () => [auditEvent()],
    ...overrides,
  };
}

describe('M0.7 — Doctor integration', () => {
  it('maps a healthy connected system into healthy actionable checks', () => {
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies());
    const result = controller.checkDoctor();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DoctorCheckDtoSchema.parse(result.value)).toEqual(result.value);
    expect(result.value.overallStatus).toBe('healthy');
    for (const id of [
      'data_directory',
      'database',
      'active_workspace',
      'connection_profile',
      'credential',
      'tunnel_configuration',
      'mcp_gateway',
      'tunnel_client',
      'connection_runtime',
      'gateway',
      'tunnel',
      'client',
    ]) {
      expect(result.value.checks.find((check) => check.id === id)?.status, id).toBe('healthy');
    }
  });

  it('maps runtime failures to fixed safe messages without forwarding raw error text', () => {
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      connectionStatus: () => ({
        state: 'error',
        session: null,
        error: {
          code: 'TUNNEL_CLIENT_NOT_FOUND',
          message: 'spawn C:\\secret\\path failed sk-never-render stack trace',
        },
      }),
      tunnelRuntimeStatus: () => ({ state: 'error', lastErrorCode: 'TUNNEL_CLIENT_NOT_FOUND' }),
    }));
    const result = controller.checkDoctor();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.checks.find((check) => check.id === 'connection_runtime')).toMatchObject({
      status: 'error',
      message: 'Tunnel client unavailable',
    });
    expect(JSON.stringify(result.value)).not.toMatch(/secret\\path|sk-never-render|stack trace/i);
  });

  it('maps missing workspace/profile/credential/tunnel prerequisites to safe guidance', () => {
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listWorkspaces: () => [],
      listProfiles: () => [],
      hasCredential: () => false,
      tunnelClientAvailable: () => false,
      connectionStatus: () => ({ state: 'stopped', session: null, error: null }),
      tunnelRuntimeStatus: () => ({ state: 'stopped' }),
    }));
    const result = controller.checkDoctor();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.overallStatus).toBe('warning');
    expect(result.value.checks.find((check) => check.id === 'active_workspace')).toMatchObject({
      status: 'warning', guidance: 'Add or select a workspace',
    });
    expect(result.value.checks.find((check) => check.id === 'connection_profile')).toMatchObject({
      status: 'warning', guidance: 'Open Connection to configure this device',
    });
    expect(result.value.checks.find((check) => check.id === 'credential')).toMatchObject({
      status: 'warning', message: 'Credential not configured',
    });
    expect(result.value.checks.find((check) => check.id === 'tunnel_configuration')).toMatchObject({
      status: 'warning', message: 'Secure Tunnel reference not configured',
    });
    expect(JSON.stringify(result.value)).not.toMatch(/sk-|api[_-]?key|CONTROL_PLANE|tunnel_home/i);
  });
});

describe('M0.7 — Activity integration', () => {
  it('maps real lifecycle actions to readable events with allowlisted metadata only', () => {
    const raw = auditEvent({
      action: 'connection.failed',
      resultCode: 'TUNNEL_START_FAILED',
      metadata: {
        operation: 'start',
        state: 'error',
        profileId: 'profile-private-ish',
        rawPayload: '{"token":"secret-value"}',
        credential: 'sk-never-render',
      },
    });
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listAuditEvents: () => [raw],
    }));
    const result = controller.listActivity({ limit: 20 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(DesktopActivityEventDtoSchema.parse(result.value[0])).toEqual(result.value[0]);
    expect(result.value[0]).toMatchObject({
      action: 'connection.failed',
      title: 'Connection failed',
      tone: 'error',
      resultCode: 'TUNNEL_START_FAILED',
      details: [
        { label: 'Operation', value: 'start' },
        { label: 'State', value: 'error' },
      ],
    });
    expect(JSON.stringify(result.value)).not.toMatch(/rawPayload|profile-private-ish|secret-value|sk-never-render|credential/i);
  });

  it('maps the existing connection/tunnel lifecycle events to readable titles', () => {
    const cases = [
      ['connection.start.requested', 'Connection start requested', 'info'],
      ['connection.started', 'Connection started', 'success'],
      ['connection.stop.requested', 'Connection stop requested', 'info'],
      ['connection.stopped', 'Connection stopped', 'success'],
      ['connection.failed', 'Connection failed', 'error'],
      ['tunnel.ready', 'Secure Tunnel ready', 'success'],
      ['tunnel.failed', 'Secure Tunnel failed', 'error'],
    ] as const;
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listAuditEvents: () => cases.map(([action], index) => auditEvent({
        id: `00000000-0000-4000-8000-${String(705 + index).padStart(12, '0')}`,
        action,
        resultCode: action.endsWith('failed') ? 'TUNNEL_START_FAILED' : 'OK',
      })),
    }));
    const result = controller.listActivity({ limit: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map(({ action, title, tone }) => ({ action, title, tone }))).toEqual(
      cases.map(([action, title, tone]) => ({ action, title, tone })),
    );
  });

  it('filters renderer polling/read noise from Activity without deleting audit history', () => {
    const meaningful = auditEvent({ id: '00000000-0000-4000-8000-000000000720', action: 'connection.started' });
    const noise = [
      'workspace:list',
      'connection-profile:list',
      'connection-profile:read',
      'credential:status',
    ].map((action, index) => auditEvent({
      id: `00000000-0000-4000-8000-${String(721 + index).padStart(12, '0')}`,
      action,
    }));
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listAuditEvents: () => [...noise, meaningful],
    }));
    const result = controller.listActivity({ limit: 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((event) => event.action)).toEqual(['connection.started']);
  });

  it('suppresses routine semantic-read Activity while retaining semantic failures and meaningful events', () => {
    const semanticAuthorized = auditEvent({
      id: '00000000-0000-4000-8000-000000000730',
      action: 'tool_kernel.invoke',
      resultCode: 'EXECUTION_AUTHORIZED',
      metadata: { capability: 'code.find_symbol', phase: 'pre_execution', outcome: 'authorized' },
    });
    const semanticExecuted = auditEvent({
      id: '00000000-0000-4000-8000-000000000731',
      action: 'tool_kernel.invoke',
      resultCode: 'EXECUTED',
      metadata: { capability: 'code.find_symbol', phase: 'outcome', outcome: 'executed' },
    });
    const semanticFailure = auditEvent({
      id: '00000000-0000-4000-8000-000000000732',
      action: 'tool_kernel.invoke',
      resultCode: 'EXECUTION_FAILED',
      metadata: { capability: 'code.find_symbol', phase: 'outcome', outcome: 'executed' },
    });
    const meaningful = auditEvent({
      id: '00000000-0000-4000-8000-000000000733',
      action: 'connection.started',
      resultCode: 'OK',
    });
    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listAuditEvents: () => [semanticAuthorized, semanticExecuted, semanticFailure, meaningful],
    }));

    const result = controller.listActivity({ limit: 20 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((event) => [event.action, event.resultCode])).toEqual([
      ['tool_kernel.invoke', 'EXECUTION_FAILED'],
      ['connection.started', 'OK'],
    ]);
  });

  it('applies Activity noise exclusion before the audit LIMIT so real events are not starved', () => {
    const root = makeTempDir();
    const db = openDatabase(path.join(root, 'm07-activity-window.db'));
    openDbs.push(db);
    const auditRepo = createAuditRepository(db);

    auditRepo.append({
      timestamp: new Date('2026-08-30T12:00:00.000Z'),
      sessionId: 'desktop',
      sessionType: 'desktop',
      action: 'connection.started',
      resultCode: 'OK',
      durationMs: 0,
      metadata: { state: 'connected' },
    });
    for (let index = 1; index <= 5; index += 1) {
      auditRepo.append({
        timestamp: new Date(`2026-08-30T12:00:0${index}.000Z`),
        sessionId: 'desktop',
        sessionType: 'desktop',
        action: 'workspace:list',
        resultCode: 'OK',
        durationMs: 0,
        metadata: { count: 1 },
      });
    }

    const visible = auditRepo.list(1, ['workspace:list']);
    expect(visible.map((event) => event.action)).toEqual(['connection.started']);
  });

  it('redacts raw payload/environment/process-shaped audit metadata at persistence boundary', () => {
    const root = makeTempDir();
    const db = openDatabase(path.join(root, 'm07-redaction.db'));
    openDbs.push(db);
    const auditRepo = createAuditRepository(db);
    auditRepo.append({
      timestamp: new Date('2026-08-30T12:00:00.000Z'),
      sessionId: 'desktop',
      sessionType: 'desktop',
      action: 'diagnostic.test',
      resultCode: 'OK',
      durationMs: 0,
      metadata: {
        rawPayload: '{"jsonrpc":"2.0","token":"secret"}',
        environment: 'CONTROL_PLANE_API_KEY=secret',
        argv: '--secret secret',
        cwd: 'C:\\private',
        safeKey: 'safe-value',
      },
    });

    const stored = auditRepo.list(1)[0];
    expect(stored?.metadata).toMatchObject({
      rawPayload: '[REDACTED]',
      environment: '[REDACTED]',
      argv: '[REDACTED]',
      cwd: '[REDACTED]',
      safeKey: 'safe-value',
    });
    expect(JSON.stringify(stored)).not.toContain('CONTROL_PLANE_API_KEY=secret');
  });

  it('does not append audit events when Doctor or Activity are refreshed', () => {
    const root = makeTempDir();
    const db = openDatabase(path.join(root, 'm07.db'));
    openDbs.push(db);
    const auditRepo = createAuditRepository(db);
    auditRepo.append({
      timestamp: new Date('2026-08-30T12:00:00.000Z'),
      sessionId: 'desktop',
      sessionType: 'desktop',
      action: 'connection.started',
      resultCode: 'OK',
      durationMs: 0,
      metadata: { state: 'connected' },
    });

    const controller = createDesktopDiagnosticsController(diagnosticsDependencies({
      listAuditEvents: (limit) => auditRepo.list(limit),
    }));
    const before = auditRepo.list(100).length;
    expect(controller.checkDoctor().ok).toBe(true);
    expect(controller.checkDoctor().ok).toBe(true);
    expect(controller.listActivity({ limit: 100 }).ok).toBe(true);
    expect(controller.listActivity({ limit: 100 }).ok).toBe(true);
    expect(auditRepo.list(100)).toHaveLength(before);
  });
});

describe('M0.7 — renderer polling audit neutrality', () => {
  it('does not route renderer workspace polling through the audited WorkspaceService list use case', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/electron/main.ts'),
      'utf8',
    );
    const handler = source.match(/ipcMain\.handle\(IPC_CHANNELS\.WORKSPACE_LIST[\s\S]*?\n {2}\}\);/u)?.[0] ?? '';
    expect(handler).toContain('workspaceRepo.list()');
    expect(handler).not.toContain('workspaceService.list()');
  });
});

describe('M0.7 — diagnostics IPC', () => {
  it('uses a strict read-only Activity payload and rejects arbitrary process controls', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const checkDoctor = vi.fn(() => ({ ok: true as const, value: {
      dataDirectoryWritable: true,
      sqliteHealthy: true,
      workspaceChecks: [],
      overallStatus: 'healthy' as const,
      summary: 'Ready',
      checks: [],
    } }));
    const listActivity = vi.fn(() => ({ ok: true as const, value: [] }));

    registerDesktopDiagnosticsIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { checkDoctor, listActivity },
      () => true,
    );

    expect(IPC_CHANNELS.ACTIVITY_LIST).toBe('activity:list');
    expect(ActivityListInputSchema.safeParse({ limit: 20, command: 'cmd.exe' }).success).toBe(false);
    const invalid = await handlers.get(IPC_CHANNELS.ACTIVITY_LIST)?.(
      { sender: { id: 1 } },
      { limit: 20, executable: 'powershell.exe', argv: ['x'], cwd: 'C:\\', env: { SECRET: 'x' } },
    );
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(listActivity).not.toHaveBeenCalled();
  });
});

describe('M0.7 — renderer diagnostics safety surface', () => {
  it('does not add arbitrary command/process controls to Environment or Activity', () => {
    const doctor = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/DoctorPage.tsx'), 'utf8');
    const activity = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ActivityPage.tsx'), 'utf8');
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const surface = `${doctor}\n${activity}\n${preload}`;
    expect(surface).not.toMatch(/execute command|raw logs|argv|cwd|environment values|plaintext credential/i);
  });
});
