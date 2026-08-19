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
