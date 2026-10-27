import { z } from 'zod';

/**
 * Slice 2A inert wire shapes only. Strict syntax is NOT authentication,
 * approval, native evidence, Windows Job ownership or launch authority.
 * This file is deliberately unregistered in production.
 */
const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const SafePositive = z.number().int().positive().refine(Number.isSafeInteger);
const Time = z.number().int().nonnegative().refine(Number.isSafeInteger);
const ExitCode = z.number().int().min(-2147483648).max(2147483647);
const Identity = z.object({
  taskId: Id,
  grantVersion: SafePositive,
  controllerId: Id,
  sessionId: Id,
  workspaceId: Id,
  workspaceGeneration: Id,
  scopeRevision: Id,
  invocationKey: Id,
  commandDigest: Id,
}).strict();

export const TrustedSupervisorIdentitySchema = Identity;
const EventBase = Identity.extend({
  eventId: Id,
  eventDigest: Id,
  evidenceId: Id,
  atMs: Time,
});
const kinds = [
  'held', 'released', 'heartbeat', 'job-zero', 'io-quiescent',
  'handles-closed', 'audit-committed', 'cleanup-failed', 'audit-failed',
  'uncertain', 'finalize',
] as const;
const EventWithoutPayload = EventBase.extend({ kind: z.enum(kinds) }).strict();
const EventWithStop = EventBase.extend({
  kind: z.literal('stop-requested'),
  reason: z.enum(['cancel', 'controller-lost', 'heartbeat-lost', 'deadline']),
}).strict();
const EventWithExit = EventBase.extend({
  kind: z.literal('root-exit'),
  exitCode: ExitCode,
}).strict();
export const TrustedSupervisorEventSchema = z.union([
  EventWithStop, EventWithExit, EventWithoutPayload,
]);
export type TrustedSupervisorEventData = z.infer<typeof TrustedSupervisorEventSchema>;

export const TrustedSupervisorReceiptSchema = Identity.extend({
  phase: z.enum(['PREPARED', 'HELD', 'RUNNING', 'STOPPING', 'FINALIZING', 'TERMINAL', 'UNKNOWN']),
  outcome: z.enum(['SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN']).nullable(),
  rootExitCode: ExitCode.nullable(),
  jobZero: z.boolean(),
  ioQuiescent: z.boolean(),
  handlesClosed: z.boolean(),
  auditCommitted: z.boolean(),
  admissionsClosed: z.literal(true),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.outcome === 'SUCCEEDED' && (
    receipt.phase !== 'TERMINAL' || receipt.rootExitCode !== 0
    || !receipt.jobZero || !receipt.ioQuiescent
    || !receipt.handlesClosed || !receipt.auditCommitted
  )) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'INCOMPLETE_SIMULATED_EVIDENCE' });
  }
});
export type TrustedSupervisorReceiptData = z.infer<typeof TrustedSupervisorReceiptSchema>;
