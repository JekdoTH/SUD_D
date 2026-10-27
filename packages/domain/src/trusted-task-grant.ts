/**
 * Inert Trusted task admission ledger.
 *
 * SECURITY: This is a pure state-transition module, NOT an approval verifier,
 * security token, persisted grant or process launcher. Only a future authorized
 * application service may construct an active ledger after real Owner approval.
 * Host-user commands are NOT confined by any task/workspace labels here.
 * Keep this module unregistered in production until a separately reviewed gate.
 */
export const TRUSTED_TASK_PROFILE = 'trusted-agent-host-v1' as const;

export interface TrustedTaskGrant {
  readonly profile: typeof TRUSTED_TASK_PROFILE;
  readonly taskId: string;
  readonly grantVersion: number;
  readonly controllerId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly scopeRevision: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly maxCommandStarts: number;
  readonly maxRepairs: number;
}

export interface TrustedTaskContext {
  readonly taskId: string;
  readonly grantVersion: number;
  readonly controllerId: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly scopeRevision: string;
}

export interface TrustedInvocationIntent {
  readonly invocationKey: string;
  readonly commandDigest: string;
}

export type TrustedInvocationState = 'prepared' | 'succeeded' | 'failed' | 'unknown';
export type TrustedTaskStatus = 'active' | 'completed' | 'canceled' | 'quarantined';

export interface TrustedInvocationReservation extends TrustedInvocationIntent {
  readonly state: TrustedInvocationState;
}

export interface TrustedTaskLedger {
  readonly grant: TrustedTaskGrant;
  readonly status: TrustedTaskStatus;
  readonly usedCommandStarts: number;
  readonly usedRepairs: number;
  readonly invocations: readonly TrustedInvocationReservation[];
}

export type TrustedGrantDenial =
  | 'SCOPE_MISMATCH'
  | 'EXPIRED'
  | 'INACTIVE'
  | 'BUSY'
  | 'BUDGET_EXHAUSTED'
  | 'REPLAY_CONFLICT'
  | 'UNKNOWN_INVOCATION'
  | 'INVALID_INPUT';

export type TrustedGrantResult = {
  readonly ok: true;
  readonly state: TrustedTaskLedger;
  readonly replayed?: boolean;
} | {
  readonly ok: false;
  readonly code: TrustedGrantDenial;
};

function deny(code: TrustedGrantDenial): TrustedGrantResult {
  return { ok: false, code };
}

function snapshot(
  grant: TrustedTaskGrant,
  status: TrustedTaskStatus,
  usedCommandStarts: number,
  usedRepairs: number,
  invocations: readonly TrustedInvocationReservation[],
): TrustedTaskLedger {
  return Object.freeze({
    grant,
    status,
    usedCommandStarts,
    usedRepairs,
    invocations: Object.freeze(invocations.map((value) => Object.freeze({ ...value }))),
  });
}

const GRANT_FIELDS = [
  'profile', 'taskId', 'grantVersion', 'controllerId', 'sessionId', 'workspaceId',
  'workspaceGeneration', 'scopeRevision', 'issuedAtMs', 'expiresAtMs',
  'maxCommandStarts', 'maxRepairs',
] as const;

/** Syntactic validation only; it never authenticates an Owner grant. */
function validGrant(value: unknown): value is TrustedTaskGrant {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (Reflect.ownKeys(raw).length !== GRANT_FIELDS.length
    || !GRANT_FIELDS.every((key) => Object.hasOwn(raw, key))) return false;
  if (raw.profile !== TRUSTED_TASK_PROFILE) return false;
  if (![raw.taskId, raw.controllerId, raw.sessionId, raw.workspaceId,
    raw.workspaceGeneration, raw.scopeRevision].every((value) => typeof value === 'string' && isSafeIdentifier(value))) return false;
  if (!Number.isSafeInteger(raw.grantVersion) || (raw.grantVersion as number) < 1
    || (raw.grantVersion as number) > 1_000_000) return false;
  if (!Number.isSafeInteger(raw.issuedAtMs) || (raw.issuedAtMs as number) < 0
    || !Number.isSafeInteger(raw.expiresAtMs)
    || (raw.expiresAtMs as number) <= (raw.issuedAtMs as number)) return false;
  if (!Number.isSafeInteger(raw.maxCommandStarts) || (raw.maxCommandStarts as number) < 1
    || (raw.maxCommandStarts as number) > 100) return false;
  if (!Number.isSafeInteger(raw.maxRepairs) || (raw.maxRepairs as number) < 0
    || (raw.maxRepairs as number) > 20) return false;
  return true;
}

/**
 * Builds only an in-memory ledger. Does not validate credentials, Owner consent,
 * or authority to execute. Never accept grant data directly from an MCP caller.
 */
export function createTrustedTaskLedger(grant: TrustedTaskGrant): TrustedTaskLedger {
  if (!validGrant(grant)) throw new Error('INVALID_TRUSTED_GRANT');
  return snapshot(Object.freeze({ ...grant }), 'active', 0, 0, []);
}

function identityMatches(grant: TrustedTaskGrant, context: TrustedTaskContext): boolean {
  return grant.profile === TRUSTED_TASK_PROFILE
    && grant.taskId === context.taskId
    && grant.grantVersion === context.grantVersion
    && grant.controllerId === context.controllerId
    && grant.sessionId === context.sessionId
    && grant.workspaceId === context.workspaceId
    && grant.workspaceGeneration === context.workspaceGeneration
    && grant.scopeRevision === context.scopeRevision;
}

function admissible(state: TrustedTaskLedger, context: TrustedTaskContext, nowMs: number): TrustedGrantDenial | null {
  if (!identityMatches(state.grant, context)) return 'SCOPE_MISMATCH';
  if (!Number.isFinite(nowMs) || nowMs < state.grant.issuedAtMs) return 'INVALID_INPUT';
  if (state.status !== 'active') return 'INACTIVE';
  if (nowMs >= state.grant.expiresAtMs) return 'EXPIRED';
  return null;
}

function isSafeIdentifier(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
    && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Reserve a command attempt before any future host launch. Pure; no process start. */
export function reserveTrustedInvocation(
  state: TrustedTaskLedger,
  context: TrustedTaskContext,
  intent: TrustedInvocationIntent,
  nowMs: number,
): TrustedGrantResult {
  if (!isSafeIdentifier(intent.invocationKey) || !isSafeIdentifier(intent.commandDigest)) return deny('INVALID_INPUT');
  if (!identityMatches(state.grant, context)) return deny('SCOPE_MISMATCH');
  const existing = state.invocations.find((item) => item.invocationKey === intent.invocationKey);
  if (existing) {
    if (existing.commandDigest !== intent.commandDigest) return deny('REPLAY_CONFLICT');
    return { ok: true, state, replayed: true }; // never a second launch
  }
  const reason = admissible(state, context, nowMs);
  if (reason) return deny(reason);
  if (state.invocations.some((item) => item.state === 'prepared')) return deny('BUSY');
  if (state.usedCommandStarts >= state.grant.maxCommandStarts) return deny('BUDGET_EXHAUSTED');
  return {
    ok: true,
    state: snapshot(state.grant, state.status, state.usedCommandStarts + 1, state.usedRepairs, [
      ...state.invocations,
      { invocationKey: intent.invocationKey, commandDigest: intent.commandDigest, state: 'prepared' },
    ]),
    replayed: false,
  };
}

/**
 * A caller must supply outcome derived from real supervisor evidence in later
 * slices. 'unknown' quarantines the entire task; no retry of uncertain work.
 */
export function recordTrustedInvocationOutcome(
  state: TrustedTaskLedger,
  invocationKey: string,
  outcome: Exclude<TrustedInvocationState, 'prepared'>,
): TrustedGrantResult {
  if (!['succeeded', 'failed', 'unknown'].includes(outcome)) return deny('INVALID_INPUT');
  const existing = state.invocations.find((entry) => entry.invocationKey === invocationKey);
  if (!existing) return deny('UNKNOWN_INVOCATION');
  if (existing.state !== 'prepared') return deny('REPLAY_CONFLICT');
  return {
    ok: true,
    state: snapshot(
      state.grant,
      outcome === 'unknown' ? 'quarantined' : state.status,
      state.usedCommandStarts,
      state.usedRepairs,
      state.invocations.map((item) => item.invocationKey === invocationKey ? { ...item, state: outcome } : item),
    ),
  };
}

/** Reserve one bounded repair cycle; this cannot confer new tool authority. */
export function reserveTrustedRepair(
  state: TrustedTaskLedger,
  context: TrustedTaskContext,
  nowMs: number,
): TrustedGrantResult {
  const reason = admissible(state, context, nowMs);
  if (reason) return deny(reason);
  if (state.invocations.some((item) => item.state === 'prepared')) return deny('BUSY');
  if (state.usedRepairs >= state.grant.maxRepairs) return deny('BUDGET_EXHAUSTED');
  return {
    ok: true,
    state: snapshot(state.grant, state.status, state.usedCommandStarts, state.usedRepairs + 1, state.invocations),
  };
}

/** Closing admissions does NOT prove process cleanup or rollback side effects. */
export function closeTrustedTaskGrant(
  state: TrustedTaskLedger,
  decision: 'completed' | 'canceled',
): TrustedTaskLedger {
  if (decision !== 'completed' && decision !== 'canceled') throw new Error('INVALID_CLOSE_DECISION');
  if (state.status !== 'active') return state;
  // No false completed state while a command has unresolved ownership/evidence.
  const unresolved = state.invocations.some((item) => item.state === 'prepared' || item.state === 'unknown');
  return snapshot(
    state.grant,
    decision === 'completed' && unresolved ? 'quarantined' : decision,
    state.usedCommandStarts,
    state.usedRepairs,
    state.invocations,
  );
}
