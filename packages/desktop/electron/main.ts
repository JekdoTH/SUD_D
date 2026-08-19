import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  WebContents,
  session,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '@sud-d/infrastructure';
import { createWorkspaceRepository } from '@sud-d/infrastructure';
import { createAuditRepository } from '@sud-d/infrastructure';
import { getDataRoot, canonicalizePath } from '@sud-d/infrastructure';
import { checkDataDirectory, checkWorkspaceRoot } from '@sud-d/infrastructure';
import { createWorkspaceService } from '@sud-d/application';
import {
  WorkspaceAddInputSchema,
  WorkspaceSelectInputSchema,
  WorkspaceRemoveInputSchema,
  AuditListInputSchema,
  IPC_CHANNELS,
  type WorkspaceDto,
  type AuditEventDto,
  type DoctorCheckDto,
  type IpcResult,
} from '@sud-d/contracts';
import type { AppError, Workspace, AuditEvent } from '@sud-d/domain';
import type { InternalRoot } from '@sud-d/domain';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = getDataRoot();
const dbPath = path.join(dataRoot, 'sud-d.db');

const db = openDatabase(dbPath);
const workspaceRepo = createWorkspaceRepository(db);
const auditRepo = createAuditRepository(db);

// SUD-D data root is an InternalRoot — agents must not access it as a workspace
const dataRootCanonical = canonicalizePath(dataRoot);
const internalRoots: InternalRoot[] = dataRootCanonical.ok
  ? [{ canonicalPath: dataRootCanonical.value, label: 'SUD-D data root' }]
  : [];

const workspaceService = createWorkspaceService(workspaceRepo, auditRepo, internalRoots);

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
    const result = workspaceService.list();
    if (!result.ok) return ipcErr(result.error);
    return ipcOk(result.value.map(toWorkspaceDto));
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

  // Doctor: check
  ipcMain.handle(IPC_CHANNELS.DOCTOR_CHECK, async (event) => {
    if (!isSenderValid(event.sender)) return ipcErr({ code: 'VALIDATION_FAILED', message: 'Invalid sender' });
    const dataWritable = checkDataDirectory(dataRoot);
    let sqliteHealthy = false;
    try {
      db.prepare('SELECT 1').get();
      sqliteHealthy = true;
    } catch {
      sqliteHealthy = false;
    }
    const workspaces = workspaceRepo.list();
    const workspaceChecks = workspaces.map((ws) => {
      const chk = checkWorkspaceRoot(ws.canonicalRoot);
      return {
        workspaceId: ws.id,
        displayName: ws.displayName,
        rootExists: chk.rootExists,
        rootIsDirectory: chk.rootIsDirectory,
      };
    });
    const dto: DoctorCheckDto = {
      dataDirectoryWritable: dataWritable,
      sqliteHealthy,
      workspaceChecks,
    };
    return ipcOk(dto);
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): BrowserWindow {
  const isDev = Boolean(process.env['VITE_DEV_SERVER_URL']);
  const preloadPath = fs.existsSync(path.join(__dirname, 'preload.mjs'))
    ? path.join(__dirname, 'preload.mjs')
    : path.join(__dirname, 'preload.js');

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d12',
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
    win.webContents.openDevTools();
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
