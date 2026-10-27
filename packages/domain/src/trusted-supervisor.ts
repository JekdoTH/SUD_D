/**
 * Slice 2A only: deterministic simulation of supervisor evidence/lifecycle.
 * This is NOT an OS Job proof, authentication, launch token, process owner, or
 * permission to start a command. No production registration or native calls.
 */
import {
  TRUSTED_TASK_PROFILE, type TrustedTaskContext, type TrustedTaskLedger,
  type TrustedInvocationIntent,
} from './trusted-task-grant.js';

export type TrustedSupervisorPhase =
  | 'PREPARED' | 'HELD' | 'RUNNING' | 'STOPPING' | 'FINALIZING' | 'TERMINAL' | 'UNKNOWN';
export type TrustedSupervisorOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN' | null;
export type TrustedStopReason = 'cancel' | 'controller-lost' | 'heartbeat-lost' | 'deadline';
export type TrustedSupervisorEventKind =
  | 'held' | 'released' | 'heartbeat' | 'stop-requested' | 'root-exit'
  | 'job-zero' | 'io-quiescent' | 'handles-closed' | 'audit-committed'
  | 'cleanup-failed' | 'audit-failed' | 'uncertain' | 'finalize';

type EvidenceIdentity = TrustedTaskContext & TrustedInvocationIntent;
interface EventBase extends EvidenceIdentity {
  readonly kind: TrustedSupervisorEventKind;
  readonly eventId: string;
  readonly eventDigest: string;
  readonly evidenceId: string;
  readonly atMs: number;
}
export type TrustedSupervisorEvent =
  | (EventBase & { readonly kind: 'stop-requested'; readonly reason: TrustedStopReason })
  | (EventBase & { readonly kind: 'root-exit'; readonly exitCode: number })
  | (EventBase & { readonly kind: Exclude<TrustedSupervisorEventKind, 'stop-requested' | 'root-exit'> });

export interface TrustedSupervisorEvidence {
  readonly rootExitCode: number | null;
  readonly jobZero: boolean;
  readonly ioQuiescent: boolean;
  readonly handlesClosed: boolean;
  readonly auditCommitted: boolean;
}
export interface TrustedSupervisorState extends EvidenceIdentity {
  readonly phase: TrustedSupervisorPhase;
  readonly outcome: TrustedSupervisorOutcome;
  readonly issuedAtMs: number;
  readonly deadlineMs: number;
  readonly lastEventMs: number;
  readonly usedCommandStarts: number;
  readonly usedRepairs: number;
  readonly admissionsClosed: true;
  readonly stopReason: TrustedStopReason | null;
  readonly evidence: TrustedSupervisorEvidence;
  readonly events: readonly TrustedSupervisorEvent[];
  readonly obligations: readonly ('STOP_REQUIRED' | 'CLEANUP_EVIDENCE_REQUIRED')[];
}
export type TrustedSupervisorDenial =
  | 'IDENTITY_MISMATCH' | 'EVENT_CONFLICT' | 'EVIDENCE_CONFLICT'
  | 'STALE_EVENT' | 'DEADLINE' | 'OUT_OF_ORDER'
  | 'INCOMPLETE_EVIDENCE' | 'INVALID_EVENT';
export type TrustedSupervisorResult =
  | { readonly ok: true; readonly state: TrustedSupervisorState }
  | { readonly ok: false; readonly code: TrustedSupervisorDenial };

const IDENTITY_KEYS = [
  'taskId', 'grantVersion', 'controllerId', 'sessionId', 'workspaceId',
  'workspaceGeneration', 'scopeRevision', 'invocationKey', 'commandDigest',
] as const;
const EVENT_BASE_KEYS = [
  ...IDENTITY_KEYS, 'kind', 'eventId', 'eventDigest', 'evidenceId', 'atMs',
] as const;
const EVENT_KINDS: readonly TrustedSupervisorEventKind[] = [
  'held', 'released', 'heartbeat', 'stop-requested', 'root-exit', 'job-zero',
  'io-quiescent', 'handles-closed', 'audit-committed', 'cleanup-failed',
  'audit-failed', 'uncertain', 'finalize',
];
const STOP_REASONS: readonly TrustedStopReason[] = [
  'cancel', 'controller-lost', 'heartbeat-lost', 'deadline',
];
const validId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 128 && /^[A-Za-z0-9_-]+$/.test(v);
const validTime = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function sameIdentity(left: EvidenceIdentity, right: EvidenceIdentity): boolean {
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function validEvent(value: unknown): value is TrustedSupervisorEvent {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (!EVENT_KINDS.includes(data.kind as TrustedSupervisorEventKind)) return false;
  const extra = data.kind === 'stop-requested' ? ['reason'] : data.kind === 'root-exit' ? ['exitCode'] : [];
  const fields = [...EVENT_BASE_KEYS, ...extra];
  if (Reflect.ownKeys(data).length !== fields.length || !fields.every((key) => Object.hasOwn(data, key))) return false;
  if (data.grantVersion === undefined || !Number.isSafeInteger(data.grantVersion) || (data.grantVersion as number) < 1) return false;
  if (!IDENTITY_KEYS.filter((key) => key !== 'grantVersion').every((key) => validId(data[key]))) return false;
  if (!['eventId', 'eventDigest', 'evidenceId'].every((key) => validId(data[key]))) return false;
  if (!validTime(data.atMs)) return false;
  if (data.kind === 'stop-requested' && !STOP_REASONS.includes(data.reason as TrustedStopReason)) return false;
  if (data.kind === 'root-exit' && (!Number.isSafeInteger(data.exitCode) || (data.exitCode as number) < -2147483648 || (data.exitCode as number) > 2147483647)) return false;
  return true;
}

function immutable(state: Omit<TrustedSupervisorState, 'obligations'>): TrustedSupervisorState {
  const obligations: ('STOP_REQUIRED' | 'CLEANUP_EVIDENCE_REQUIRED')[] =
    state.phase === 'STOPPING' || state.phase === 'UNKNOWN'
      ? ['STOP_REQUIRED', 'CLEANUP_EVIDENCE_REQUIRED']
      : state.phase === 'RUNNING' || state.phase === 'FINALIZING'
        ? ['CLEANUP_EVIDENCE_REQUIRED'] : [];
  return Object.freeze({
    ...state,
    evidence: Object.freeze({ ...state.evidence }),
    events: Object.freeze(state.events.map((event) => Object.freeze({ ...event }))),
    obligations: Object.freeze(obligations),
  });
}

/**
 * Accepts only an already-reserved, still-active in-memory invocation for
 * pure modeling. Checking this snapshot NEVER verifies authentic approval.
 * No release permission or executable artifact is returned.
 */
export function createTrustedSupervisorState(
  ledger: TrustedTaskLedger,
  context: TrustedTaskContext,
  intent: TrustedInvocationIntent,
  nowMs: number,
  deadlineMs: number,
): TrustedSupervisorState {
  const g = ledger?.grant;
  const correct = g?.profile === TRUSTED_TASK_PROFILE
    && g.taskId === context?.taskId && g.grantVersion === context?.grantVersion
    && g.controllerId === context?.controllerId && g.sessionId === context?.sessionId
    && g.workspaceId === context?.workspaceId
    && g.workspaceGeneration === context?.workspaceGeneration
    && g.scopeRevision === context?.scopeRevision
    && validId(intent?.invocationKey) && validId(intent?.commandDigest)
    && ledger.status === 'active'
    && ledger.invocations.filter((item) => item.state === 'prepared').length === 1
    && ledger.invocations.some((item) => item.state === 'prepared'
      && item.invocationKey === intent.invocationKey && item.commandDigest === intent.commandDigest)
    && Number.isSafeInteger(ledger.usedCommandStarts)
    && ledger.usedCommandStarts >= 1 && ledger.usedCommandStarts <= g.maxCommandStarts
    && Number.isSafeInteger(ledger.usedRepairs) && ledger.usedRepairs >= 0
    && ledger.usedRepairs <= g.maxRepairs
    && validTime(nowMs) && nowMs >= g.issuedAtMs && nowMs < g.expiresAtMs
    && validTime(deadlineMs) && deadlineMs > nowMs && deadlineMs <= g.expiresAtMs;
  if (!correct) throw new Error('INVALID_SUPERVISOR_RESERVATION');
  return immutable({
    ...context, ...intent,
    phase: 'PREPARED', outcome: null, issuedAtMs: g.issuedAtMs,
    deadlineMs, lastEventMs: nowMs,
    usedCommandStarts: ledger.usedCommandStarts, usedRepairs: ledger.usedRepairs,
    admissionsClosed: true, stopReason: null,
    evidence: { rootExitCode: null, jobZero: false, ioQuiescent: false, handlesClosed: false, auditCommitted: false },
    events: [],
  });
}

function denial(code: TrustedSupervisorDenial): TrustedSupervisorResult {
  return { ok: false, code };
}

/** Pure evidence reducer: supplied events are NOT authenticated native receipts. */
export function reduceTrustedSupervisor(
  state: TrustedSupervisorState,
  event: TrustedSupervisorEvent,
): TrustedSupervisorResult {
  if (!validEvent(event)) return denial('INVALID_EVENT');
  if (!sameIdentity(state, event)) return denial('IDENTITY_MISMATCH');
  const seen = state.events.find((past) => past.eventId === event.eventId);
  if (seen) {
    // Replay is retrieval of an earlier transition, never a new action.
    return seen.eventDigest === event.eventDigest
      ? { ok: true, state }
      : denial('EVENT_CONFLICT');
  }
  if (state.events.some((past) => past.evidenceId === event.evidenceId)) return denial('EVIDENCE_CONFLICT');
  if (event.atMs < state.lastEventMs) return denial('STALE_EVENT');
  if (state.phase === 'TERMINAL' || state.phase === 'UNKNOWN') return denial('OUT_OF_ORDER');

  let phase: TrustedSupervisorPhase = state.phase;
  let outcome: TrustedSupervisorOutcome = state.outcome;
  let stopReason = state.stopReason;
  let evidence: TrustedSupervisorEvidence = state.evidence;
  const beforeDeadline = event.atMs < state.deadlineMs;
  // A late receipt can document cleanup, never retroactively turn a timed-out
  // simulated command into a successful completion or renew its authority.
  if (!beforeDeadline && event.kind !== 'held' && event.kind !== 'released' && event.kind !== 'heartbeat') {
    stopReason ??= 'deadline';
    if (phase === 'RUNNING' || phase === 'FINALIZING') phase = 'STOPPING';
  }

  switch (event.kind) {
    case 'held':
      if (phase !== 'PREPARED') return denial('OUT_OF_ORDER');
      if (!beforeDeadline) return denial('DEADLINE');
      phase = 'HELD';
      break;
    case 'released':
      if (phase !== 'HELD' || stopReason !== null) return denial('OUT_OF_ORDER');
      if (!beforeDeadline) return denial('DEADLINE');
      phase = 'RUNNING';
      break;
    case 'heartbeat':
      if (phase !== 'RUNNING') return denial('OUT_OF_ORDER');
      if (!beforeDeadline) return denial('DEADLINE');
      break; // Observational only: never renew the absolute deadline.
    case 'stop-requested':
      if (event.reason === 'deadline' && event.atMs < state.deadlineMs) return denial('OUT_OF_ORDER');
      phase = 'STOPPING';
      stopReason ??= event.reason;
      break;
    case 'root-exit':
      if (phase !== 'RUNNING' && phase !== 'STOPPING') return denial('OUT_OF_ORDER');
      if (evidence.rootExitCode !== null) return denial('OUT_OF_ORDER');
      evidence = { ...evidence, rootExitCode: event.exitCode };
      if (phase === 'RUNNING') phase = 'FINALIZING';
      break;
    case 'job-zero':
      if (evidence.rootExitCode === null || evidence.jobZero) return denial('OUT_OF_ORDER');
      evidence = { ...evidence, jobZero: true };
      break;
    case 'io-quiescent':
      if (!evidence.jobZero || evidence.ioQuiescent) return denial('OUT_OF_ORDER');
      evidence = { ...evidence, ioQuiescent: true };
      break;
    case 'handles-closed':
      if (!evidence.ioQuiescent || evidence.handlesClosed) return denial('OUT_OF_ORDER');
      evidence = { ...evidence, handlesClosed: true };
      break;
    case 'audit-committed':
      if (!evidence.handlesClosed || evidence.auditCommitted) return denial('OUT_OF_ORDER');
      evidence = { ...evidence, auditCommitted: true };
      break;
    case 'cleanup-failed':
    case 'audit-failed':
    case 'uncertain':
      phase = 'UNKNOWN';
      outcome = 'UNKNOWN';
      break;
    case 'finalize':
      if (phase !== 'FINALIZING' && phase !== 'STOPPING') return denial('OUT_OF_ORDER');
      if (evidence.rootExitCode === null || !evidence.jobZero || !evidence.ioQuiescent
        || !evidence.handlesClosed || !evidence.auditCommitted) return denial('INCOMPLETE_EVIDENCE');
      phase = 'TERMINAL';
      outcome = stopReason !== null ? 'CANCELED' : evidence.rootExitCode === 0 ? 'SUCCEEDED' : 'FAILED';
      break;
    default:
      return denial('INVALID_EVENT');
  }
  return {
    ok: true,
    state: immutable({
      ...state, phase, outcome, stopReason, evidence, lastEventMs: event.atMs,
      events: [...state.events, event],
    }),
  };
}
