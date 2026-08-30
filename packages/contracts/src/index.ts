import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const WorkspaceIdSchema = z.string().uuid();
export const DisplayNameSchema = z.string().min(1).max(200);

// ---------------------------------------------------------------------------
// IPC channel names (exhaustive list for Phase 1)
// ---------------------------------------------------------------------------

export const IPC_CHANNELS = {
  HEALTH_CHECK: 'health:check',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_ADD: 'workspace:add',
  WORKSPACE_SELECT: 'workspace:select',
  WORKSPACE_REMOVE: 'workspace:remove',
  AUDIT_LIST: 'audit:list',
  DOCTOR_CHECK: 'doctor:check',
  DIALOG_OPEN_DIRECTORY: 'dialog:openDirectory',
  CONNECTION_STATUS: 'connection:status',
  CONNECTION_START: 'connection:start',
  CONNECTION_STOP: 'connection:stop',
  CONNECTION_RESTART: 'connection:restart',
  CONNECTION_TUNNEL_SETUP: 'connection:tunnelSetup',
  CONNECTION_PREFERENCES_UPDATE: 'connection:preferences:update',
} as const;

// ---------------------------------------------------------------------------
// Workspace IPC schemas
// ---------------------------------------------------------------------------

export const WorkspaceAddInputSchema = z.object({
  displayName: DisplayNameSchema,
  rootPath: z.string().min(1).max(32767),
});
export type WorkspaceAddInput = z.infer<typeof WorkspaceAddInputSchema>;

export const WorkspaceSelectInputSchema = z.object({
  workspaceId: WorkspaceIdSchema,
});
export type WorkspaceSelectInput = z.infer<typeof WorkspaceSelectInputSchema>;

export const WorkspaceRemoveInputSchema = z.object({
  workspaceId: WorkspaceIdSchema,
});
export type WorkspaceRemoveInput = z.infer<typeof WorkspaceRemoveInputSchema>;

// ---------------------------------------------------------------------------
// Workspace DTO (serialisable, sent to renderer)
// ---------------------------------------------------------------------------

export const WorkspaceDtoSchema = z.object({
  id: WorkspaceIdSchema,
  displayName: z.string(),
  canonicalRoot: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkspaceDto = z.infer<typeof WorkspaceDtoSchema>;

// ---------------------------------------------------------------------------
// Audit event DTO
// ---------------------------------------------------------------------------

export const AuditEventDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  sessionId: z.string(),
  sessionType: z.string(),
  action: z.string(),
  workspaceId: z.string().optional(),
  resourcePath: z.string().optional(),
  policyDecision: z.string().optional(),
  resultCode: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
});
export type AuditEventDto = z.infer<typeof AuditEventDtoSchema>;

export const AuditListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});
export type AuditListInput = z.infer<typeof AuditListInputSchema>;

// ---------------------------------------------------------------------------
// Doctor DTO
// ---------------------------------------------------------------------------

export const DoctorCheckDtoSchema = z.object({
  dataDirectoryWritable: z.boolean(),
  sqliteHealthy: z.boolean(),
  workspaceChecks: z.array(
    z.object({
      workspaceId: z.string(),
      displayName: z.string(),
      rootExists: z.boolean(),
      rootIsDirectory: z.boolean(),
    }),
  ),
});
export type DoctorCheckDto = z.infer<typeof DoctorCheckDtoSchema>;

// ---------------------------------------------------------------------------
// Generic IPC result wrapper
// ---------------------------------------------------------------------------

export const IpcResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: dataSchema }),
    z.object({
      ok: z.literal(false),
      error: z.object({
        code: z.string(),
        message: z.string(),
        metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      }),
    }),
  ]);

export type IpcOk<T> = { ok: true; value: T };
export type IpcErr = {
  ok: false;
  error: { code: string; message: string; metadata?: Record<string, string | number | boolean> };
};
export type IpcResult<T> = IpcOk<T> | IpcErr;

export const ConnectionProviderSchema = z.enum(['openai_secure_mcp_tunnel']);
export type ConnectionProvider = z.infer<typeof ConnectionProviderSchema>;

export const ConnectionTransportSchema = z.enum(['stdio']);
export type ConnectionTransport = z.infer<typeof ConnectionTransportSchema>;

export const ConnectionProfileIdSchema = z.string().uuid();
export const ConnectionCredentialStatusSchema = z.enum(['configured', 'missing']);
export type ConnectionCredentialStatus = z.infer<typeof ConnectionCredentialStatusSchema>;

const ConnectionDeviceNameSchema = z.string().min(1).max(200);
const TunnelReferenceSchema = z.string().min(1).max(500);

export const ConnectionProfileCreateInputSchema = z.object({
  displayName: DisplayNameSchema,
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  deviceName: ConnectionDeviceNameSchema,
  autoStart: z.boolean(),
  autoRestart: z.boolean(),
  tunnelReference: TunnelReferenceSchema.optional(),
}).strict();
export type ConnectionProfileCreateInput = z.infer<typeof ConnectionProfileCreateInputSchema>;

export const ConnectionProfileUpdateInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  displayName: DisplayNameSchema.optional(),
  deviceName: ConnectionDeviceNameSchema.optional(),
  autoStart: z.boolean().optional(),
  autoRestart: z.boolean().optional(),
  tunnelReference: TunnelReferenceSchema.nullable().optional(),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'profileId'),
  { message: 'At least one connection profile field must be updated' },
);
export type ConnectionProfileUpdateInput = z.infer<typeof ConnectionProfileUpdateInputSchema>;

export const ConnectionProfileDtoSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  displayName: DisplayNameSchema,
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  deviceName: ConnectionDeviceNameSchema,
  autoStart: z.boolean(),
  autoRestart: z.boolean(),
  tunnelReference: TunnelReferenceSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type ConnectionProfileDto = z.infer<typeof ConnectionProfileDtoSchema>;

export const ConnectionCredentialStatusDtoSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  status: ConnectionCredentialStatusSchema,
}).strict();
export type ConnectionCredentialStatusDto = z.infer<typeof ConnectionCredentialStatusDtoSchema>;

export const ConnectionStateSchema = z.enum([
  'stopped',
  'starting',
  'waiting_for_tunnel',
  'waiting_for_client',
  'connected',
  'degraded',
  'stopping',
  'error',
]);
export type ConnectionStateDto = z.infer<typeof ConnectionStateSchema>;

export const ConnectionStartInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
}).strict();
export type ConnectionStartInput = z.infer<typeof ConnectionStartInputSchema>;

export const ConnectionStopInputSchema = z.object({}).strict();
export type ConnectionStopInput = z.infer<typeof ConnectionStopInputSchema>;

export const ConnectionRestartInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
}).strict();
export type ConnectionRestartInput = z.infer<typeof ConnectionRestartInputSchema>;

export const ConnectionSessionContextDtoSchema = z.object({
  connectionSessionId: z.string().uuid(),
  profileId: ConnectionProfileIdSchema,
  workspaceId: WorkspaceIdSchema,
  workspaceCanonicalRoot: z.string().min(1),
  startedAt: z.string().datetime(),
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  deviceName: ConnectionDeviceNameSchema,
  tunnelReference: TunnelReferenceSchema.optional(),
}).strict();
export type ConnectionSessionContextDto = z.infer<typeof ConnectionSessionContextDtoSchema>;

export const ConnectionServiceErrorCodeSchema = z.enum([
  'CONNECTION_PROFILE_NOT_FOUND',
  'CONNECTION_CREDENTIAL_MISSING',
  'CONNECTION_WORKSPACE_NOT_SELECTED',
  'WORKSPACE_INVALID',
  'CONNECTION_RUNTIME_START_FAILED',
  'CONNECTION_RUNTIME_STOP_FAILED',
  'INVALID_CONNECTION_STATE_TRANSITION',
  'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART',
  'CONNECTION_LIFECYCLE_BUSY',
  'TUNNEL_CLIENT_NOT_FOUND',
  'TUNNEL_PROFILE_INVALID',
  'TUNNEL_START_FAILED',
  'TUNNEL_HEALTH_FAILED',
  'TUNNEL_EXITED_UNEXPECTEDLY',
  'TUNNEL_STOP_FAILED',
  'MCP_GATEWAY_ENTRY_NOT_FOUND',
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
]);
export type ConnectionServiceErrorCode = z.infer<typeof ConnectionServiceErrorCodeSchema>;

export const ConnectionServiceStatusDtoSchema = z.object({
  state: ConnectionStateSchema,
  session: ConnectionSessionContextDtoSchema.nullable(),
  error: z.object({
    code: ConnectionServiceErrorCodeSchema,
    message: z.string().min(1),
  }).strict().nullable(),
}).strict();


export const DesktopConnectionProfileDtoSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  displayName: DisplayNameSchema,
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  deviceName: ConnectionDeviceNameSchema,
  autoStart: z.boolean(),
  autoRestart: z.boolean(),
  tunnelConfigured: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type DesktopConnectionProfileDto = z.infer<typeof DesktopConnectionProfileDtoSchema>;

export const DesktopConnectionRuntimeSessionDtoSchema = z.object({
  connectionSessionId: z.string().uuid(),
  profileId: ConnectionProfileIdSchema,
  workspaceId: WorkspaceIdSchema,
  startedAt: z.string().datetime(),
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  deviceName: ConnectionDeviceNameSchema,
}).strict();
export type DesktopConnectionRuntimeSessionDto = z.infer<typeof DesktopConnectionRuntimeSessionDtoSchema>;

export const DesktopConnectionRuntimeStatusDtoSchema = z.object({
  state: ConnectionStateSchema,
  session: DesktopConnectionRuntimeSessionDtoSchema.nullable(),
  error: z.object({
    code: ConnectionServiceErrorCodeSchema,
    message: z.string().min(1),
  }).strict().nullable(),
}).strict();
export type DesktopConnectionRuntimeStatusDto = z.infer<typeof DesktopConnectionRuntimeStatusDtoSchema>;

export const DesktopConnectionSnapshotDtoSchema = z.object({
  profile: DesktopConnectionProfileDtoSchema.nullable(),
  credentialStatus: ConnectionCredentialStatusSchema.nullable(),
  runtime: DesktopConnectionRuntimeStatusDtoSchema,
}).strict();
export type DesktopConnectionSnapshotDto = z.infer<typeof DesktopConnectionSnapshotDtoSchema>;

export const DesktopConnectionTunnelSetupInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  tunnelReference: TunnelReferenceSchema,
}).strict();
export type DesktopConnectionTunnelSetupInput = z.infer<typeof DesktopConnectionTunnelSetupInputSchema>;

export const DesktopConnectionPreferencesUpdateInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
  autoStart: z.boolean(),
  autoRestart: z.boolean(),
}).strict();
export type DesktopConnectionPreferencesUpdateInput = z.infer<typeof DesktopConnectionPreferencesUpdateInputSchema>;
export type ConnectionServiceStatusDto = z.infer<typeof ConnectionServiceStatusDtoSchema>;

export const RuntimeComponentSchema = z.enum(['runtime', 'gateway', 'tunnel', 'client']);
export type RuntimeComponent = z.infer<typeof RuntimeComponentSchema>;

export const RuntimeErrorCodeSchema = z.enum([
  'START_FAILED',
  'STOP_FAILED',
  'GATEWAY_UNAVAILABLE',
  'TUNNEL_UNAVAILABLE',
  'CLIENT_DISCONNECTED',
  'HEALTH_CHECK_FAILED',
  'INTERNAL_ERROR',
]);
export type RuntimeErrorCode = z.infer<typeof RuntimeErrorCodeSchema>;

export const RuntimeErrorDtoSchema = z.object({
  code: RuntimeErrorCodeSchema,
  message: z.string().min(1),
  component: RuntimeComponentSchema,
  recoverable: z.boolean(),
}).strict();
export type RuntimeErrorDto = z.infer<typeof RuntimeErrorDtoSchema>;

const GatewayStoppedStatusDtoSchema = z.object({ state: z.literal('stopped') }).strict();
const GatewayStartingStatusDtoSchema = z.object({ state: z.literal('starting') }).strict();
const GatewayHealthyStatusDtoSchema = z.object({ state: z.literal('healthy') }).strict();
const GatewayErrorStatusDtoSchema = z.object({
  state: z.literal('error'),
  error: RuntimeErrorDtoSchema,
}).strict();

export const GatewayStatusDtoSchema = z.discriminatedUnion('state', [
  GatewayStoppedStatusDtoSchema,
  GatewayStartingStatusDtoSchema,
  GatewayHealthyStatusDtoSchema,
  GatewayErrorStatusDtoSchema,
]);
export type GatewayStatusDto = z.infer<typeof GatewayStatusDtoSchema>;

const TunnelStoppedStatusDtoSchema = z.object({ state: z.literal('stopped') }).strict();
const TunnelStartingStatusDtoSchema = z.object({ state: z.literal('starting') }).strict();
const TunnelHealthyStatusDtoSchema = z.object({ state: z.literal('healthy') }).strict();
const TunnelErrorStatusDtoSchema = z.object({
  state: z.literal('error'),
  error: RuntimeErrorDtoSchema,
}).strict();

export const TunnelStatusDtoSchema = z.discriminatedUnion('state', [
  TunnelStoppedStatusDtoSchema,
  TunnelStartingStatusDtoSchema,
  TunnelHealthyStatusDtoSchema,
  TunnelErrorStatusDtoSchema,
]);
export type TunnelStatusDto = z.infer<typeof TunnelStatusDtoSchema>;

export const ClientConnectionStatusDtoSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('disconnected') }).strict(),
  z.object({ state: z.literal('connected') }).strict(),
]);
export type ClientConnectionStatusDto = z.infer<typeof ClientConnectionStatusDtoSchema>;

export const RuntimeStartInputSchema = z.object({
  workspaceId: WorkspaceIdSchema,
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
}).strict();
export type RuntimeStartInput = z.infer<typeof RuntimeStartInputSchema>;

export const RuntimeStopInputSchema = z.object({}).strict();
export type RuntimeStopInput = z.infer<typeof RuntimeStopInputSchema>;

export const RuntimeRestartInputSchema = z.object({}).strict();
export type RuntimeRestartInput = z.infer<typeof RuntimeRestartInputSchema>;

export const ConnectionStatusDtoSchema = z.object({
  state: ConnectionStateSchema,
  provider: ConnectionProviderSchema,
  transport: ConnectionTransportSchema,
  workspaceId: WorkspaceIdSchema,
  gateway: GatewayStatusDtoSchema,
  tunnel: TunnelStatusDtoSchema,
  client: ClientConnectionStatusDtoSchema,
  error: RuntimeErrorDtoSchema.nullable(),
  updatedAt: z.string().datetime(),
}).strict();
export type ConnectionStatusDto = z.infer<typeof ConnectionStatusDtoSchema>;

export const ConnectionStatusChangedDtoSchema = z.object({
  previousState: ConnectionStateSchema.nullable(),
  current: ConnectionStatusDtoSchema,
}).strict();
export type ConnectionStatusChangedDto = z.infer<typeof ConnectionStatusChangedDtoSchema>;
