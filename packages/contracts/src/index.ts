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
  CONNECTION_CREDENTIAL_SETUP: 'connection:credentialSetup',
  CONNECTION_CREDENTIAL_REMOVE: 'connection:credentialRemove',
  CONNECTION_PREFERENCES_UPDATE: 'connection:preferences:update',
  ACTIVITY_LIST: 'activity:list',
  APPROVAL_LIST: 'approval:list',
  APPROVAL_RESPOND: 'approval:respond',
  APPROVAL_MODE_GET: 'approval:mode:get',
  APPROVAL_MODE_SET: 'approval:mode:set',
  GIT_SNAPSHOT: 'git:snapshot',
  GIT_INIT: 'git:init',
  GIT_REMOTE_CONFIGURE: 'git:remote:configure',
  GIT_REMOTE_SELECT: 'git:remote:select',
  GIT_BRANCH_CREATE: 'git:branch:create',
  GIT_BRANCH_SWITCH: 'git:branch:switch',
  GIT_BRANCH_MERGE: 'git:branch:merge',
  GIT_BRANCH_DELETE: 'git:branch:delete',
  GIT_FETCH: 'git:fetch',
  GIT_SYNC: 'git:sync',
  GIT_PUSH: 'git:push',
  GIT_CLONE: 'git:clone',
  TEAM_STATUS: 'team:status',
  TEAM_STOP: 'team:stop',
  OVERVIEW_WORK_STATUS: 'overview:workStatus',
  APP_OPEN_CHATGPT_WEB: 'app:openChatGPTWeb',
  APP_OPEN_OPENAI_API_KEYS_PAGE: 'app:openOpenAiApiKeysPage',
  APP_OPEN_OPENAI_TUNNEL_SETTINGS_PAGE: 'app:openOpenAiTunnelSettingsPage',
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

export const DoctorCheckStatusSchema = z.enum(['healthy', 'warning', 'error']);
export type DoctorCheckStatus = z.infer<typeof DoctorCheckStatusSchema>;

export const DoctorCheckIdSchema = z.enum([
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
]);
export type DoctorCheckId = z.infer<typeof DoctorCheckIdSchema>;

export const DoctorCheckItemDtoSchema = z.object({
  id: DoctorCheckIdSchema,
  status: DoctorCheckStatusSchema,
  label: z.string().min(1),
  message: z.string().min(1),
  guidance: z.string().min(1).optional(),
}).strict();
export type DoctorCheckItemDto = z.infer<typeof DoctorCheckItemDtoSchema>;

export const DoctorCheckDtoSchema = z.object({
  dataDirectoryWritable: z.boolean(),
  sqliteHealthy: z.boolean(),
  workspaceChecks: z.array(
    z.object({
      workspaceId: z.string(),
      displayName: z.string(),
      rootExists: z.boolean(),
      rootIsDirectory: z.boolean(),
    }).strict(),
  ),
  overallStatus: DoctorCheckStatusSchema,
  summary: z.string().min(1),
  checks: z.array(DoctorCheckItemDtoSchema),
}).strict();
export type DoctorCheckDto = z.infer<typeof DoctorCheckDtoSchema>;

export const ActivityListInputSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
}).strict();
export type ActivityListInput = z.infer<typeof ActivityListInputSchema>;

export const DesktopActivityToneSchema = z.enum(['info', 'success', 'warning', 'error']);
export type DesktopActivityTone = z.infer<typeof DesktopActivityToneSchema>;

export const DesktopActivityDetailDtoSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
}).strict();
export type DesktopActivityDetailDto = z.infer<typeof DesktopActivityDetailDtoSchema>;

export const DesktopActivityEventDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  action: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['connection', 'tunnel', 'workspace', 'configuration', 'system', 'other']),
  tone: DesktopActivityToneSchema,
  resultCode: z.string().min(1),
  details: z.array(DesktopActivityDetailDtoSchema).max(3),
}).strict();
export type DesktopActivityEventDto = z.infer<typeof DesktopActivityEventDtoSchema>;

// ---------------------------------------------------------------------------
// Basic Approval DTOs — safe renderer-facing metadata only
// ---------------------------------------------------------------------------

export const ApprovalListInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(50),
}).strict();
export type ApprovalListInput = z.infer<typeof ApprovalListInputSchema>;

export const ApprovalRespondInputSchema = z.object({
  approvalRequestId: z.string().uuid(),
  decision: z.enum(['approve', 'deny']),
}).strict();
export type ApprovalRespondInput = z.infer<typeof ApprovalRespondInputSchema>;

export const DesktopApprovalRequestDtoSchema = z.object({
  id: z.string().uuid(),
  capability: z.string().min(1).max(96),
  effect: z.enum(['read', 'create', 'modify', 'execute', 'delete']),
  sensitivity: z.enum(['normal', 'sensitive', 'credential']),
  title: z.string().min(1).max(120),
  resourceLabel: z.string().min(1).max(240).optional(),
  status: z.literal('pending'),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();
export type DesktopApprovalRequestDto = z.infer<typeof DesktopApprovalRequestDtoSchema>;

export const DesktopApprovalResponseDtoSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['approved', 'denied']),
  message: z.string().min(1).max(200),
}).strict();
export type DesktopApprovalResponseDto = z.infer<typeof DesktopApprovalResponseDtoSchema>;

export const ApprovalModeSchema = z.enum(['standard', 'approve_for_me', 'full_access']);
export type ApprovalModeDto = z.infer<typeof ApprovalModeSchema>;

export const ApprovalModeSetInputSchema = z.object({
  mode: ApprovalModeSchema,
}).strict();
export type ApprovalModeSetInput = z.infer<typeof ApprovalModeSetInputSchema>;

export const DesktopApprovalModeDtoSchema = z.object({
  mode: ApprovalModeSchema,
}).strict();
export type DesktopApprovalModeDto = z.infer<typeof DesktopApprovalModeDtoSchema>;

// ---------------------------------------------------------------------------
// Git workflow DTOs — semantic intent + bounded renderer-safe state only
// ---------------------------------------------------------------------------

export const GitSnapshotIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const GitBranchNameSchema = z.string().min(1).max(255).refine((value) => !/[\r\n\0]/.test(value));
export const GitRemoteNameSchema = z.string().min(1).max(128).refine((value) => !/[\s\r\n\0]/.test(value));
export const GitRemoteUrlSchema = z.string().min(1).max(2048).refine((value) => !/[\r\n\0]/.test(value));

export const GitInitInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
}).strict();
export type GitInitInput = z.infer<typeof GitInitInputSchema>;

export const GitConfigureRemoteInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  remoteName: GitRemoteNameSchema,
  remoteUrl: GitRemoteUrlSchema,
}).strict();
export type GitConfigureRemoteInput = z.infer<typeof GitConfigureRemoteInputSchema>;

export const GitSelectPrimaryRemoteInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  remoteName: GitRemoteNameSchema,
}).strict();
export type GitSelectPrimaryRemoteInput = z.infer<typeof GitSelectPrimaryRemoteInputSchema>;

const GitBranchMutationInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  branchName: GitBranchNameSchema,
}).strict();
export const GitBranchCreateInputSchema = GitBranchMutationInputSchema;
export const GitBranchSwitchInputSchema = GitBranchMutationInputSchema;
export const GitBranchMergeInputSchema = GitBranchMutationInputSchema;
export const GitBranchDeleteInputSchema = GitBranchMutationInputSchema;
export type GitBranchCreateInput = z.infer<typeof GitBranchCreateInputSchema>;
export type GitBranchSwitchInput = z.infer<typeof GitBranchSwitchInputSchema>;
export type GitBranchMergeInput = z.infer<typeof GitBranchMergeInputSchema>;
export type GitBranchDeleteInput = z.infer<typeof GitBranchDeleteInputSchema>;

const GitNetworkExistingWorkspaceInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
}).strict();
export const GitFetchInputSchema = GitNetworkExistingWorkspaceInputSchema;
export const GitSyncInputSchema = GitNetworkExistingWorkspaceInputSchema;
export const GitPushInputSchema = GitNetworkExistingWorkspaceInputSchema;
export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;
export type GitSyncInput = z.infer<typeof GitSyncInputSchema>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;

export const GitCloneInputSchema = z.object({
  repositoryUrl: GitRemoteUrlSchema,
  destinationPath: z.string().min(1).max(32767),
  displayName: DisplayNameSchema,
}).strict();
export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;

const GitAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().min(1).max(200).optional(),
}).strict();

const DesktopGitBranchDtoSchema = z.object({
  name: GitBranchNameSchema,
  current: z.boolean(),
  checkedOutElsewhere: z.boolean(),
}).strict();

export const DesktopGitSnapshotDtoSchema = z.object({
  workspace: z.object({ id: WorkspaceIdSchema, displayName: DisplayNameSchema }).strict(),
  snapshotId: GitSnapshotIdSchema,
  repository: z.enum(['not_repository', 'ready', 'unsupported']),
  repositoryState: z.enum(['normal', 'merge', 'rebase', 'cherry_pick', 'revert', 'bisect', 'conflict']),
  clean: z.boolean(),
  changedFiles: z.number().int().min(0).max(500),
  truncated: z.boolean(),
  currentBranch: GitBranchNameSchema.optional(),
  detached: z.boolean(),
  branches: z.array(DesktopGitBranchDtoSchema).max(500),
  defaultBranch: z.object({
    state: z.enum(['known', 'unknown']),
    branch: GitBranchNameSchema.optional(),
  }).strict(),
  primaryRemote: z.object({
    state: z.enum(['resolved', 'missing', 'ambiguous', 'unsupported']),
    name: GitRemoteNameSchema.optional(),
    safeRepository: z.string().min(1).max(512).optional(),
    transport: z.enum(['https', 'ssh']).optional(),
  }).strict(),
  upstreamBranch: GitBranchNameSchema.optional(),
  relation: z.enum(['unknown', 'up_to_date', 'local_ahead', 'remote_ahead', 'diverged', 'no_upstream', 'unavailable']),
  ahead: z.number().int().min(0).max(1_000_000).optional(),
  behind: z.number().int().min(0).max(1_000_000).optional(),
  authStatus: z.enum(['unknown', 'working', 'failed']),
  operations: z.object({
    initialize: GitAvailabilitySchema,
    configureRemote: GitAvailabilitySchema,
    createBranch: GitAvailabilitySchema,
    switchBranch: GitAvailabilitySchema,
    mergeBranch: GitAvailabilitySchema,
    deleteBranch: GitAvailabilitySchema,
    fetch: GitAvailabilitySchema,
    sync: GitAvailabilitySchema,
    push: GitAvailabilitySchema,
  }).strict(),
}).strict();
export type DesktopGitSnapshotDto = z.infer<typeof DesktopGitSnapshotDtoSchema>;

export const DesktopGitCloneResultDtoSchema = z.object({
  workspace: WorkspaceDtoSchema,
  snapshot: DesktopGitSnapshotDtoSchema,
}).strict();
export type DesktopGitCloneResultDto = z.infer<typeof DesktopGitCloneResultDtoSchema>;

// ---------------------------------------------------------------------------
// Overview work status DTO — bounded read-only local state only
// ---------------------------------------------------------------------------

export const DesktopOverviewGitStatusDtoSchema = z.discriminatedUnion('availability', [
  z.object({
    availability: z.literal('available'),
    branch: z.string().min(1).max(512).optional(),
    detached: z.boolean(),
    clean: z.boolean(),
    changedFiles: z.number().int().min(0).max(500),
    truncated: z.boolean(),
  }).strict(),
  z.object({ availability: z.literal('unavailable') }).strict(),
]);
export type DesktopOverviewGitStatusDto = z.infer<typeof DesktopOverviewGitStatusDtoSchema>;

export const DesktopOverviewCheckpointDtoSchema = z.discriminatedUnion('availability', [
  z.object({
    availability: z.literal('available'),
    taskStatus: z.enum(['pending', 'in_progress', 'blocked', 'completed']),
    updatedAt: z.string().datetime(),
  }).strict(),
  z.object({ availability: z.literal('none') }).strict(),
  z.object({ availability: z.literal('unavailable') }).strict(),
]);
export type DesktopOverviewCheckpointDto = z.infer<typeof DesktopOverviewCheckpointDtoSchema>;

export const DesktopOverviewWorkStatusDtoSchema = z.object({
  workspaceId: WorkspaceIdSchema.optional(),
  git: DesktopOverviewGitStatusDtoSchema,
  checkpoint: DesktopOverviewCheckpointDtoSchema,
}).strict();
export type DesktopOverviewWorkStatusDto = z.infer<typeof DesktopOverviewWorkStatusDtoSchema>;

// ---------------------------------------------------------------------------
// Team Mode DTOs — safe renderer-facing orchestration metadata only
// ---------------------------------------------------------------------------

export const TeamRoleSchema = z.enum(['planner', 'implementer', 'validator', 'reviewer']);
export type TeamRoleDto = z.infer<typeof TeamRoleSchema>;

export const TeamStateSchema = z.enum(['planning', 'implementing', 'validating', 'reviewing', 'completed', 'blocked', 'stopped']);
export type TeamStateDto = z.infer<typeof TeamStateSchema>;

export const TeamBlockedReasonSchema = z.enum([
  'EXECUTE_REQUIRED',
  'NETWORK_REQUIRED',
  'DELETE_REQUIRED',
  'SECURITY_POLICY',
  'APPROVAL_DENIED',
  'APPROVAL_EXPIRED',
  'WORKSPACE_STALE',
  'GIT_STATE_STALE',
  'SCOPE_MISMATCH',
  'REVIEW_LOOP_LIMIT',
  'UNSUPPORTED_OPERATION',
  'INTERNAL_FAILURE',
]);
export type TeamBlockedReasonDto = z.infer<typeof TeamBlockedReasonSchema>;

export const TeamWorkItemDtoSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().min(1),
  title: z.string().min(1).max(160),
  status: z.enum(['pending', 'in_progress', 'validating', 'reviewing', 'done', 'blocked']),
  reworkCount: z.number().int().min(0).max(3),
  targetPathHint: z.string().min(1).max(1024).optional(),
}).strict();
export type TeamWorkItemDto = z.infer<typeof TeamWorkItemDtoSchema>;

export const TeamHandoffDtoSchema = z.object({
  id: z.string().uuid(),
  fromRole: TeamRoleSchema,
  outcome: z.enum(['plan_ready', 'work_ready', 'validation_passed', 'validation_failed', 'task_approved', 'changes_requested', 'blocked']),
  summary: z.string().min(1).max(1000),
  createdAt: z.string().datetime(),
}).strict();
export type TeamHandoffDto = z.infer<typeof TeamHandoffDtoSchema>;

export const TeamFindingDtoSchema = z.object({
  id: z.string().uuid(),
  severity: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1).max(240),
  targetPathHint: z.string().min(1).max(1024).optional(),
  expectedCorrection: z.string().min(1).max(240).optional(),
  createdAt: z.string().datetime(),
}).strict();
export type TeamFindingDto = z.infer<typeof TeamFindingDtoSchema>;

export const DesktopTeamMissionDtoSchema = z.object({
  missionId: z.string().uuid(),
  workspaceId: WorkspaceIdSchema,
  goalSummary: z.string().min(1).max(240),
  state: TeamStateSchema,
  currentRole: TeamRoleSchema.optional(),
  currentStepId: z.string().uuid().optional(),
  reviewRound: z.number().int().min(0).max(3),
  nextAction: z.string().min(1).max(1000),
  finalResultSummary: z.string().min(1).max(1000).optional(),
  taskCount: z.number().int().min(0).max(20),
  currentTaskSequence: z.number().int().min(1).max(20).optional(),
  blockedReason: TeamBlockedReasonSchema.optional(),
  blockedReasonSummary: z.string().min(1).max(240).optional(),
  freshnessKind: z.enum(['git_status', 'workspace_time', 'none']).optional(),
  freshnessValue: z.string().min(1).max(96).optional(),
  workItems: z.array(TeamWorkItemDtoSchema).max(20),
  handoffs: z.array(TeamHandoffDtoSchema).max(50),
  findings: z.array(TeamFindingDtoSchema).max(20),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  stoppedAt: z.string().datetime().optional(),
}).strict();
export type DesktopTeamMissionDto = z.infer<typeof DesktopTeamMissionDtoSchema>;

export const TeamStatusInputSchema = z.object({
  missionId: z.string().uuid().optional(),
}).strict();
export type TeamStatusInput = z.infer<typeof TeamStatusInputSchema>;

export const TeamStopInputSchema = z.object({
  missionId: z.string().uuid().optional(),
}).strict();
export type TeamStopInput = z.infer<typeof TeamStopInputSchema>;

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
export const OpenAiSecureTunnelReferenceSchema = z.string()
  .min(8)
  .max(500)
  .regex(/^tunnel_[A-Za-z0-9_-]+$/);

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
  tunnelReference: OpenAiSecureTunnelReferenceSchema,
}).strict();
export type DesktopConnectionTunnelSetupInput = z.infer<typeof DesktopConnectionTunnelSetupInputSchema>;

export const DesktopConnectionCredentialSetupInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
}).strict();
export type DesktopConnectionCredentialSetupInput = z.infer<typeof DesktopConnectionCredentialSetupInputSchema>;

export const DesktopConnectionCredentialRemoveInputSchema = z.object({
  profileId: ConnectionProfileIdSchema,
}).strict();
export type DesktopConnectionCredentialRemoveInput = z.infer<typeof DesktopConnectionCredentialRemoveInputSchema>;

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
