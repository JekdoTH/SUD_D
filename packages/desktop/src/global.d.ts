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
  ConnectionStartInput,
  ConnectionStopInput,
  ConnectionRestartInput,
  DesktopConnectionPreferencesUpdateInput,
  DesktopConnectionSnapshotDto,
  DesktopConnectionTunnelSetupInput,
} from '@sud-d/contracts';

interface SudDApi {
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
  connection: {
    status(): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    start(input: ConnectionStartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    stop(input: ConnectionStopInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
    restart(input: ConnectionRestartInput): Promise<IpcResult<DesktopConnectionSnapshotDto>>;
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
