import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  WebContents,
  session,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '@sud-d/infrastructure';
import { createWorkspaceRepository } from '@sud-d/infrastructure';
import { createAuditRepository, createApprovalModeRepository, createApprovalRepository, createGitSafetyAdapter, createTeamRepository, createTeamTransitionUnitOfWork, createWorkMemoryRepository } from '@sud-d/infrastructure';
import { getDataRoot, canonicalizePath } from '@sud-d/infrastructure';
import { checkDataDirectory, checkWorkspaceRoot } from '@sud-d/infrastructure';
import {
  createConnectionProfileRepository,
  createOpenAiSecureTunnelRuntime,
  createWindowsCredentialStore,
  isMcpGatewayEntryAvailable,
  isOpenAiSecureTunnelClientAvailable,
} from '@sud-d/infrastructure';
import {
  createApprovalModeService,
  createApprovalService,
  createConnectionConfigService,
  createTeamService,
  createConnectionService,
  createWorkspaceService,
} from '@sud-d/application';
import { createDesktopConnectionController } from './connection-controller.js';
import {
  registerDesktopAppIpcHandlers,
  type AppIpcMain,
} from './app-ipc.js';
import {
  registerDesktopConnectionIpcHandlers,
  type DesktopIpcMain,
} from './connection-ipc.js';
import { createDesktopDiagnosticsController } from './diagnostics-controller.js';
import {
  registerDesktopDiagnosticsIpcHandlers,
  type DiagnosticsIpcMain,
} from './diagnostics-ipc.js';
import { createDesktopApprovalController } from './approval-controller.js';
import {
  registerDesktopApprovalIpcHandlers,
  type ApprovalIpcMain,
} from './approval-ipc.js';
import { createDesktopGitWorkerController } from './git-worker-controller.js';
import {
  registerDesktopGitIpcHandlers,
  type GitIpcMain,
} from './git-ipc.js';
import { createDesktopTeamController } from './team-controller.js';
import {
  registerDesktopTeamIpcHandlers,
  type TeamIpcMain,
} from './team-ipc.js';
import { createDesktopOverviewStatusController } from './overview-status-controller.js';
import {
  registerDesktopOverviewStatusIpcHandlers,
  type OverviewStatusIpcMain,
} from './overview-status-ipc.js';
import { createDesktopUpdateController } from './update-controller.js';
import { createElectronUpdateProvider, loadSignedReleaseManifest } from './update-provider.js';
import { registerDesktopUpdateIpcHandlers, type UpdateIpcMain } from './update-ipc.js';
import {
  WorkspaceAddInputSchema,
  WorkspaceSelectInputSchema,
  WorkspaceRemoveInputSchema,
  AuditListInputSchema,
  IPC_CHANNELS,
  type WorkspaceDto,
  type AuditEventDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Workspace, AuditEvent } from '@sud-d/domain';
import type { InternalRoot } from '@sud-d/domain';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
declare const __SUD_D_BUILD_REVISION__: string;
declare const __SUD_D_UPDATE_PUBLIC_KEY_PEM__: string;

const dataRoot = getDataRoot();
const dbPath = path.join(dataRoot, 'sud-d.db');
const buildRevision = typeof __SUD_D_BUILD_REVISION__ === 'string' && /^[0-9a-fA-F]{40}$/.test(__SUD_D_BUILD_REVISION__)
  ? __SUD_D_BUILD_REVISION__.toLowerCase()
  : '0'.repeat(40);
const updatePublicKeyPem = typeof __SUD_D_UPDATE_PUBLIC_KEY_PEM__ === 'string'
  ? __SUD_D_UPDATE_PUBLIC_KEY_PEM__
  : '';

const db = openDatabase(dbPath);
const workspaceRepo = createWorkspaceRepository(db);
const auditRepo = createAuditRepository(db);
const approvalRepo = createApprovalRepository(db);
const approvalModeRepo = createApprovalModeRepository(db);
const teamRepo = createTeamRepository(db);
const gitSafety = createGitSafetyAdapter();
const workMemoryRepo = createWorkMemoryRepository(db);
const approvalService = createApprovalService(approvalRepo, auditRepo);
const approvalModeService = createApprovalModeService(approvalModeRepo);
const approvalController = createDesktopApprovalController(approvalService, approvalModeService);

// SUD-D data root is an InternalRoot — agents must not access it as a workspace
const dataRootCanonical = canonicalizePath(dataRoot);
const internalRoots: InternalRoot[] = dataRootCanonical.ok
  ? [{ canonicalPath: dataRootCanonical.value, label: 'SUD-D data root' }]
  : [];

const teamService = createTeamService({
  teamRepo,
  workspaceRepo,
  audit: auditRepo,
  transitionUow: createTeamTransitionUnitOfWork(db),
  freshness: {
    current(workspace) {
      const status = gitSafety.status(workspace.canonicalRoot);
      return status.ok
        ? { ok: true, value: { kind: 'git_status' as const, value: status.value.statusId } }
        : { ok: true, value: { kind: 'none' as const, value: 'unsupported' } };
    },
  },
});
const teamController = createDesktopTeamController(teamService);
const overviewStatusController = createDesktopOverviewStatusController({
  workspaceReader: workspaceRepo,
  gitReader: gitSafety,
  workMemoryReader: workMemoryRepo,
});
const workspaceService = createWorkspaceService(workspaceRepo, auditRepo, internalRoots);
const gitController = createDesktopGitWorkerController();
const connectionProfileRepo = createConnectionProfileRepository(db);
const connectionCredentialStore = createWindowsCredentialStore(process.env);
const connectionConfigService = createConnectionConfigService(
  connectionProfileRepo,
  connectionCredentialStore,
  auditRepo,
);
const connectionRuntime = createOpenAiSecureTunnelRuntime();
const connectionService = createConnectionService(
  connectionProfileRepo,
  workspaceRepo,
  connectionCredentialStore,
  auditRepo,
  connectionRuntime,
);
const connectionController = createDesktopConnectionController({
  configService: connectionConfigService,
  connectionService,
  deviceName: os.hostname() || 'This Device',
  environment: process.env,
});
const diagnosticsController = createDesktopDiagnosticsController({
  dataDirectoryWritable: () => checkDataDirectory(dataRoot),
  sqliteHealthy: () => {
    try {
      db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  },
  listWorkspaces: () => workspaceRepo.list(),
  workspaceRootStatus: checkWorkspaceRoot,
  listProfiles: () => connectionProfileRepo.list(),
  hasCredential: (profileId) => connectionCredentialStore.hasCredential(profileId),
  mcpGatewayAvailable: isMcpGatewayEntryAvailable,
  tunnelClientAvailable: isOpenAiSecureTunnelClientAvailable,
  connectionStatus: () => connectionService.getStatus(),
  tunnelRuntimeStatus: () => connectionRuntime.getStatus(),
  listAuditEvents: (limit, excludeActions) => auditRepo.list(limit, excludeActions),
});
const updateController = createDesktopUpdateController({
  currentVersion: app.getVersion(),
  currentRevision: buildRevision,
  publicKeyPem: updatePublicKeyPem,
  provider: createElectronUpdateProvider(),
  loadSignedManifest: loadSignedReleaseManifest,
  isPackaged: app.isPackaged,
  orderlyShutdown: async () => {
    const stopped = connectionService.stop();
    if (!stopped.ok) throw new Error('UPDATE_SHUTDOWN_CONNECTION_FAILED');
    await gitController.dispose();
    db.close();
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toWorkspaceDto(ws: Workspace): WorkspaceDto {
  return {
    id: ws.id,
    displayName: ws.displayName,
    canonicalRoot: ws.canonicalRoot,
    isActive: ws.isActive,
    createdAt: ws.createdAt.toISOString(),
    updatedAt: ws.updatedAt.toISOString(),
  };
}

function toAuditDto(ev: AuditEvent): AuditEventDto {
  return {
    id: ev.id,
    timestamp: ev.timestamp.toISOString(),
    sessionId: ev.sessionId,
    sessionType: ev.sessionType,
    action: ev.action,
    workspaceId: ev.workspaceId,
    resourcePath: ev.resourcePath,
    policyDecision: ev.policyDecision,
    resultCode: ev.resultCode,
    durationMs: ev.durationMs,
    metadata: ev.metadata,
  };
}

function ipcOk<T>(value: T): IpcResult<T> {
  return { ok: true, value };
}

function ipcErr(error: AppError): IpcResult<never> {
  return { ok: false, error };
}

// Validate IPC sender — only allow our own webContents
let mainWindowContents: WebContents | null = null;

function isSenderValid(senderContents: WebContents): boolean {
  return mainWindowContents !== null && senderContents.id === mainWindowContents.id;
}

function workspaceSelectionBlocked(workspaceId: string): AppError | null {
  const status = connectionService.getStatus();
  if (status.state === 'stopped') return null;
  if (status.session?.workspaceId === workspaceId) return null;
  return {
    code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART',
    message: 'Disconnect before changing the active workspace',
  };
}

function workspaceRemovalBlocked(workspaceId: string): AppError | null {
  const status = connectionService.getStatus();
  if (status.state === 'stopped') return null;
  if (status.session?.workspaceId !== workspaceId) return null;
  return {
    code: 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART',
    message: 'Disconnect before removing the connected workspace',
  };
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  // Health check
  ipcMain.handle(IPC_CHANNELS.HEALTH_CHECK, (_event) => {
    return ipcOk({ status: 'ok', version: app.getVersion() });
  });

  // Dialog: open directory
  ipcMain.handle(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY, async (event) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Workspace Root',
    });
    if (result.canceled || !result.filePaths[0]) return ipcOk(null);
    return ipcOk(result.filePaths[0]);
  });

  // Workspace: list
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, (event) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    try {
      return ipcOk(workspaceRepo.list().map(toWorkspaceDto));
    } catch {
      return ipcErr({ code: 'INTERNAL_ERROR', message: 'Failed to list workspaces' });
    }
  });

  // Workspace: add
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_ADD, (event, raw: unknown) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    const parsed = WorkspaceAddInputSchema.safeParse(raw);
    if (!parsed.success) {
      return ipcErr({ code: 'VALIDATION_FAILED', message: parsed.error.errors[0]?.message ?? 'Validation failed' });
    }
    const result = workspaceService.add(parsed.data.displayName, parsed.data.rootPath);
    if (!result.ok) return ipcErr(result.error);
    return ipcOk(toWorkspaceDto(result.value));
  });

  // Workspace: select
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_SELECT, (event, raw: unknown) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    const parsed = WorkspaceSelectInputSchema.safeParse(raw);
    if (!parsed.success) {
      return ipcErr({ code: 'VALIDATION_FAILED', message: parsed.error.errors[0]?.message ?? 'Validation failed' });
    }
    const blocked = workspaceSelectionBlocked(parsed.data.workspaceId);
    if (blocked) return ipcErr(blocked);
    const result = workspaceService.select(parsed.data.workspaceId);
    if (!result.ok) return ipcErr(result.error);
    return ipcOk(null);
  });

  // Workspace: remove
  ipcMain.handle(IPC_CHANNELS.WORKSPACE_REMOVE, (event, raw: unknown) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    const parsed = WorkspaceRemoveInputSchema.safeParse(raw);
    if (!parsed.success) {
      return ipcErr({ code: 'VALIDATION_FAILED', message: parsed.error.errors[0]?.message ?? 'Validation failed' });
    }
    const blocked = workspaceRemovalBlocked(parsed.data.workspaceId);
    if (blocked) return ipcErr(blocked);
    const result = workspaceService.remove(parsed.data.workspaceId);
    if (!result.ok) return ipcErr(result.error);
    return ipcOk(null);
  });

  // Audit: list
  ipcMain.handle(IPC_CHANNELS.AUDIT_LIST, (event, raw: unknown) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    let input;
    try {
      input = AuditListInputSchema.parse(raw ?? {});
    } catch {
      input = { limit: 50 };
    }
    try {
      const events = auditRepo.list(input.limit);
      return ipcOk(events.map(toAuditDto));
    } catch {
      return ipcErr({ code: 'INTERNAL_ERROR', message: 'Failed to retrieve audit events' });
    }
  });

  const validateDesktopSender = (sender: unknown): boolean =>
    typeof sender === 'object' &&
    sender !== null &&
    'id' in sender &&
    isSenderValid(sender as WebContents);

  registerDesktopAppIpcHandlers(
    ipcMain as unknown as AppIpcMain,
    (url) => shell.openExternal(url),
    validateDesktopSender,
  );
  registerDesktopConnectionIpcHandlers(
    ipcMain as unknown as DesktopIpcMain,
    connectionController,
    validateDesktopSender,
  );
  registerDesktopDiagnosticsIpcHandlers(
    ipcMain as unknown as DiagnosticsIpcMain,
    diagnosticsController,
    validateDesktopSender,
  );
  registerDesktopApprovalIpcHandlers(
    ipcMain as unknown as ApprovalIpcMain,
    approvalController,
    validateDesktopSender,
  );
  registerDesktopGitIpcHandlers(
    ipcMain as unknown as GitIpcMain,
    gitController,
    validateDesktopSender,
  );
  registerDesktopTeamIpcHandlers(
    ipcMain as unknown as TeamIpcMain,
    teamController,
    validateDesktopSender,
  );
  registerDesktopOverviewStatusIpcHandlers(
    ipcMain as unknown as OverviewStatusIpcMain,
    overviewStatusController,
    validateDesktopSender,
  );
  registerDesktopUpdateIpcHandlers(
    ipcMain as unknown as UpdateIpcMain,
    updateController,
    validateDesktopSender,
  );
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const isDev = Boolean(process.env['VITE_DEV_SERVER_URL']);
  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.mjs'))
    ? path.join(__dirname, 'preload.mjs')
    : path.join(__dirname, 'preload.js');
  const windowIconPath = path.join(__dirname, '../src/assets/sud-d-app-icon.png');

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f4f6f8',
    icon: windowIconPath,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
  });

  mainWindowContents = win.webContents;

  // Restrictive CSP: locked down in production, dev server compatible in dev
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('devtools://') || details.url.startsWith('chrome-extension://')) {
      callback({});
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: http:; font-src 'self' data:;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; font-src 'self' data:; media-src 'none'; object-src 'none'; frame-src 'none';",
        ],
      },
    });
  });

  // Deny unexpected navigation
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['VITE_DEV_SERVER_URL'];
    const allowed =
      url.startsWith('file://') || (devUrl !== undefined && url.startsWith(devUrl));
    if (!allowed) {
      event.preventDefault();
    }
  });

  // Deny new windows
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.once('ready-to-show', () => win.show());

  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl) {
    void win.loadURL(devUrl);
    if (process.env['SUD_D_OPEN_DEVTOOLS'] === '1') {
      win.webContents.openDevTools();
    }
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  return win;
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  updateController.checkOnStartup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  void gitController.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
