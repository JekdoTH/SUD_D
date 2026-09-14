import type {
  WorkspaceAddInput,
  WorkspaceSelectInput,
  WorkspaceRemoveInput,
  WorkspaceDto,
  AuditEventDto,
  DoctorCheckDto,
  IpcResult,
  AuditListInput,
  ActivityListInput,
  DesktopActivityEventDto,
  ApprovalListInput,
  ApprovalModeSetInput,
  ApprovalRespondInput,
  DesktopApprovalModeDto,
  DesktopApprovalRequestDto,
  DesktopApprovalResponseDto,
  DesktopTeamMissionDto,
  DesktopOverviewWorkStatusDto,
  DesktopGitSnapshotDto,
  DesktopGitCloneResultDto,
  GitInitInput,
  GitConfigureRemoteInput,
  GitSelectPrimaryRemoteInput,
  GitBranchCreateInput,
  GitBranchSwitchInput,
  GitBranchMergeInput,
  GitBranchDeleteInput,
  GitFetchInput,
  GitSyncInput,
  GitPushInput,
  GitCloneInput,
  TeamStatusInput,
  TeamStopInput,
  ConnectionStartInput,
  ConnectionStopInput,
  ConnectionRestartInput,
  DesktopConnectionCredentialRemoveInput,
  DesktopConnectionCredentialSetupInput,
  DesktopConnectionPreferencesUpdateInput,
  DesktopConnectionSnapshotDto,
  DesktopConnectionTunnelSetupInput,
} from '@sud-d/contracts';

interface SudDApi {
  app: {
    openChatGPTWeb(): Promise<IpcResult<null>>;
    openOpenAiApiKeysPage(): Promise<IpcResult<null>>;
    openOpenAiTunnelSettingsPage(): Promise<IpcResult<null>>;
  };
  health: {
    check(): Promise<IpcResult<{ status: string; version: string }>>;
  };
  dialog: {
    openDirectory(): Promise<IpcResult<string | null>>;
  };
  workspace: {
    list(): Promise<IpcResult<WorkspaceDto[]>>;
    add(input: WorkspaceAddInput): Promise<IpcResult<WorkspaceDto>>;
    select(input: WorkspaceSelectInput): Promise<IpcResult<null>>;
    remove(input: WorkspaceRemoveInput): Promise<IpcResult<null>>;
  };
  audit: {
    list(input?: AuditListInput): Promise<IpcResult<AuditEventDto[]>>;
  };
  activity: {
    list(input?: ActivityListInput): Promise<IpcResult<DesktopActivityEventDto[]>>;
  };
  approval: {
    list(input?: ApprovalListInput): Promise<IpcResult<DesktopApprovalRequestDto[]>>;
    respond(input: ApprovalRespondInput): Promise<IpcResult<DesktopApprovalResponseDto>>;
    getMode(): Promise<IpcResult<DesktopApprovalModeDto>>;
    setMode(input: ApprovalModeSetInput): Promise<IpcResult<DesktopApprovalModeDto>>;
  };
  git: {
    snapshot(): Promise<IpcResult<DesktopGitSnapshotDto>>;
    init(input: GitInitInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    configure(input: GitConfigureRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    select(input: GitSelectPrimaryRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    create(input: GitBranchCreateInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    switch(input: GitBranchSwitchInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    merge(input: GitBranchMergeInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    delete(input: GitBranchDeleteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    fetch(input: GitFetchInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    sync(input: GitSyncInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    push(input: GitPushInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
    clone(input: GitCloneInput): Promise<IpcResult<DesktopGitCloneResultDto>>;
  };
  team: {
    status(input?: TeamStatusInput): Promise<IpcResult<DesktopTeamMissionDto | null>>;
    stop(input?: TeamStopInput): Promise<IpcResult<DesktopTeamMissionDto>>;
  };
  overview: {
    workStatus(): Promise<IpcResult<DesktopOverviewWorkStatusDto>>;
  };
  connection: {
    status(): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    start(input: ConnectionStartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    stop(input: ConnectionStopInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    restart(input: ConnectionRestartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    setupCredential(input: DesktopConnectionCredentialSetupInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    removeCredential(input: DesktopConnectionCredentialRemoveInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    configureTunnel(input: DesktopConnectionTunnelSetupInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    updatePreferences(input: DesktopConnectionPreferencesUpdateInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
  };
  doctor: {
    check(): Promise<IpcResult<DoctorCheckDto>>;
  };
}

declare global {
  interface Window {
    sudD: SudDApi;
  }
}
