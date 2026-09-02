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
  type ActivityListInput,
  type DesktopActivityEventDto,
  type ApprovalListInput,
  type ApprovalRespondInput,
  type DesktopApprovalRequestDto,
  type DesktopApprovalResponseDto,
  type DesktopTeamMissionDto,
  type TeamStatusInput,
  type TeamStopInput,
  type ConnectionStartInput,
  type ConnectionStopInput,
  type ConnectionRestartInput,
  type DesktopConnectionCredentialRemoveInput,
  type DesktopConnectionCredentialSetupInput,
  type DesktopConnectionPreferencesUpdateInput,
  type DesktopConnectionSnapshotDto,
  type DesktopConnectionTunnelSetupInput,
} from '@sud-d/contracts';

// ---------------------------------------------------------------------------
// Narrow, typed bridge — no raw ipcRenderer exposed
// ---------------------------------------------------------------------------

const api = {
  app: {
    openChatGPTWeb: (): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_CHATGPT_WEB) as Promise<IpcResult<null>>,
  },
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
  activity: {
    list: (input?: ActivityListInput): Promise<IpcResult<DesktopActivityEventDto[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ACTIVITY_LIST, input) as Promise<IpcResult<DesktopActivityEventDto[]>>,
  },
  approval: {
    list: (input?: ApprovalListInput): Promise<IpcResult<DesktopApprovalRequestDto[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_LIST, input) as Promise<IpcResult<DesktopApprovalRequestDto[]>>,
    respond: (input: ApprovalRespondInput): Promise<IpcResult<DesktopApprovalResponseDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_RESPOND, input) as Promise<IpcResult<DesktopApprovalResponseDto>>,
  },
  team: {
    status: (input?: TeamStatusInput): Promise<IpcResult<DesktopTeamMissionDto | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_STATUS, input) as Promise<IpcResult<DesktopTeamMissionDto | null>>,
    stop: (input?: TeamStopInput): Promise<IpcResult<DesktopTeamMissionDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_STOP, input) as Promise<IpcResult<DesktopTeamMissionDto>>,
  },
  connection: {
    status: (): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_STATUS) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    start: (input: ConnectionStartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_START, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    stop: (input: ConnectionStopInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_STOP, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    restart: (input: ConnectionRestartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_RESTART, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    setupCredential: (input: DesktopConnectionCredentialSetupInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CREDENTIAL_SETUP, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    removeCredential: (input: DesktopConnectionCredentialRemoveInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_CREDENTIAL_REMOVE, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    configureTunnel: (input: DesktopConnectionTunnelSetupInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_TUNNEL_SETUP, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
    updatePreferences: (input: DesktopConnectionPreferencesUpdateInput): Promise<IpcResult<DesktopConnectionSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTION_PREFERENCES_UPDATE, input) as Promise<IpcResult<DesktopConnectionSnapshotDto>>,
  },
  doctor: {
    check: (): Promise<IpcResult<DoctorCheckDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCTOR_CHECK) as Promise<IpcResult<DoctorCheckDto>>,
  },
};

contextBridge.exposeInMainWorld('sudD', api);
