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
  type ApprovalModeSetInput,
  type ApprovalRespondInput,
  type DesktopApprovalModeDto,
  type DesktopApprovalRequestDto,
  type DesktopApprovalResponseDto,
  type DesktopTeamMissionDto,
  type DesktopOverviewWorkStatusDto,
  type DesktopGitSnapshotDto,
  type DesktopGitCloneResultDto,
  type GitInitInput,
  type GitConfigureRemoteInput,
  type GitSelectPrimaryRemoteInput,
  type GitBranchCreateInput,
  type GitBranchSwitchInput,
  type GitBranchMergeInput,
  type GitBranchDeleteInput,
  type GitFetchInput,
  type GitSyncInput,
  type GitPushInput,
  type GitCloneInput,
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
  type DesktopUpdateStatusDto,
} from '@sud-d/contracts';

// ---------------------------------------------------------------------------
// Narrow, typed bridge — no raw ipcRenderer exposed
// ---------------------------------------------------------------------------

const api = {
  app: {
    openChatGPTWeb: (): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_CHATGPT_WEB) as Promise<IpcResult<null>>,
    openOpenAiApiKeysPage: (): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_OPENAI_API_KEYS_PAGE) as Promise<IpcResult<null>>,
    openOpenAiTunnelSettingsPage: (): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_OPENAI_TUNNEL_SETTINGS_PAGE) as Promise<IpcResult<null>>,
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
    getMode: (): Promise<IpcResult<DesktopApprovalModeDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_MODE_GET) as Promise<IpcResult<DesktopApprovalModeDto>>,
    setMode: (input: ApprovalModeSetInput): Promise<IpcResult<DesktopApprovalModeDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APPROVAL_MODE_SET, input) as Promise<IpcResult<DesktopApprovalModeDto>>,
  },
  git: {
    snapshot: (): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SNAPSHOT) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    init: (input: GitInitInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_INIT, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    configure: (input: GitConfigureRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOTE_CONFIGURE, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    select: (input: GitSelectPrimaryRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOTE_SELECT, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    create: (input: GitBranchCreateInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_CREATE, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    switch: (input: GitBranchSwitchInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_SWITCH, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    merge: (input: GitBranchMergeInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_MERGE, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    delete: (input: GitBranchDeleteInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_BRANCH_DELETE, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    fetch: (input: GitFetchInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_FETCH, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    sync: (input: GitSyncInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_SYNC, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    push: (input: GitPushInput): Promise<IpcResult<DesktopGitSnapshotDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_PUSH, input) as Promise<IpcResult<DesktopGitSnapshotDto>>,
    clone: (input: GitCloneInput): Promise<IpcResult<DesktopGitCloneResultDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CLONE, input) as Promise<IpcResult<DesktopGitCloneResultDto>>,
  },
  team: {
    status: (input?: TeamStatusInput): Promise<IpcResult<DesktopTeamMissionDto | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_STATUS, input) as Promise<IpcResult<DesktopTeamMissionDto | null>>,
    stop: (input?: TeamStopInput): Promise<IpcResult<DesktopTeamMissionDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TEAM_STOP, input) as Promise<IpcResult<DesktopTeamMissionDto>>,
  },
  overview: {
    workStatus: (): Promise<IpcResult<DesktopOverviewWorkStatusDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.OVERVIEW_WORK_STATUS) as Promise<IpcResult<DesktopOverviewWorkStatusDto>>,
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
  update: {
    status: (): Promise<IpcResult<DesktopUpdateStatusDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_STATUS) as Promise<IpcResult<DesktopUpdateStatusDto>>,
    check: (): Promise<IpcResult<DesktopUpdateStatusDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK) as Promise<IpcResult<DesktopUpdateStatusDto>>,
    download: (): Promise<IpcResult<DesktopUpdateStatusDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD) as Promise<IpcResult<DesktopUpdateStatusDto>>,
    restartAndInstall: (): Promise<IpcResult<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_RESTART_AND_INSTALL) as Promise<IpcResult<null>>,
  },
  doctor: {
    check: (): Promise<IpcResult<DoctorCheckDto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.DOCTOR_CHECK) as Promise<IpcResult<DoctorCheckDto>>,
  },
};

contextBridge.exposeInMainWorld('sudD', api);
