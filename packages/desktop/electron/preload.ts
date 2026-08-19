import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type WorkspaceAddInput,
  type WorkspaceSelectInput,
  type WorkspaceRemoveInput,
  type WorkspaceDto,
  type AuditEventDto,
  type DoctorCheckDto,
  type IpcResult,
  type AuditListInput,
} from '@sud-d/contracts';

// ---------------------------------------------------------------------------
// Narrow, typed bridge — no raw ipcRenderer exposed
// ---------------------------------------------------------------------------

const api = {
  health: {
    check: (): Promise<IpcResult<{ status: string; version: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.HEALTH_CHECK) as Promise<IpcResult<{ status: string; version: string }>>,
  },
  dialog: {
    openDirectory: (): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DIALOG_OPEN_DIRECTORY) as Promise<IpcResult<string | null>>,
  },
  workspace: {
    list: (): Promise<IpcResult<WorkspaceDto[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST) as Promise<IpcResult<WorkspaceDto[]>>,
    add: (input: WorkspaceAddInput): Promise<IpcResult<WorkspaceDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_ADD, input) as Promise<IpcResult<WorkspaceDto>>,
    select: (input: WorkspaceSelectInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SELECT, input) as Promise<IpcResult<null>>,
    remove: (input: WorkspaceRemoveInput): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, input) as Promise<IpcResult<null>>,
  },
  audit: {
    list: (input?: AuditListInput): Promise<IpcResult<AuditEventDto[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LIST, input) as Promise<IpcResult<AuditEventDto[]>>,
  },
  doctor: {
    check: (): Promise<IpcResult<DoctorCheckDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCTOR_CHECK) as Promise<IpcResult<DoctorCheckDto>>,
  },
};

contextBridge.exposeInMainWorld('sudD', api);
