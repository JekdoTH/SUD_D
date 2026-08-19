import type {
  WorkspaceAddInput,
  WorkspaceSelectInput,
  WorkspaceRemoveInput,
  WorkspaceDto,
  AuditEventDto,
  DoctorCheckDto,
  IpcResult,
  AuditListInput,
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
  doctor: {
    check(): Promise<IpcResult<DoctorCheckDto>>;
  };
}

declare global {
  interface Window {
    sudD: SudDApi;
  }
}
