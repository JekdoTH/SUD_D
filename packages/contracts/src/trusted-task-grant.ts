import { z } from 'zod';

/**
 * Inert data-validation schemas only.
 * No IPC/MCP registration, approval issuance, code execution or native launch.
 * The future application must authenticate Owner approval before an active
 * TrustedTaskGrant is ever placed into a task ledger.
 */
const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const TimestampMs = z.number().finite().int().nonnegative();

export const TrustedTaskGrantSchema = z.object({
  profile: z.literal('trusted-agent-host-v1'),
  taskId: Id,
  grantVersion: z.number().int().positive().max(1_000_000),
  controllerId: Id,
  sessionId: Id,
  workspaceId: Id,
  workspaceGeneration: Id,
  scopeRevision: Id,
  issuedAtMs: TimestampMs,
  expiresAtMs: TimestampMs,
  maxCommandStarts: z.number().int().min(1).max(100),
  maxRepairs: z.number().int().min(0).max(20),
}).strict().refine((grant) => grant.expiresAtMs > grant.issuedAtMs, {
  message: 'Grant expiry must follow issue time',
  path: ['expiresAtMs'],
});

export type TrustedTaskGrantData = z.infer<typeof TrustedTaskGrantSchema>;

export const TrustedInvocationIntentSchema = z.object({
  invocationKey: Id,
  commandDigest: Id,
}).strict();

export type TrustedInvocationIntentData = z.infer<typeof TrustedInvocationIntentSchema>;
