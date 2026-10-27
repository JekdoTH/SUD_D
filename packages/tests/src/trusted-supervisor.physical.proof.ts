/**
 * Slice 2B-CODE: OFFLINE/INERT planning only.
 * No child process, Win32, filesystem, environment, network, approval issuance,
 * native launch, or native evidence authentication exists in this module.
 * Paths in tests are strings only. A valid manifest here confers ZERO authority.
 */
export const PROOF_CREATION_LIMITS = Object.freeze({
  observer: 1,
  controllers: 13,
  supervisors: 13,
  commandRootRequests: 13,
  descendantRequests: 22,
  totalProofRequests: 62,
});

export const PROOF_CASES = Object.freeze([
  { id: 'Z1', commandRoots: 0, recipe: 'pre-start-audit-denial', descendants: 0 },
  { id: 'Z2', commandRoots: 0, recipe: 'dirty-baseline-denial', descendants: 0 },
  { id: '01', commandRoots: 1, recipe: 'normal-tree', descendants: 2 },
  { id: '02', commandRoots: 1, recipe: 'root-before-descendants', descendants: 2 },
  { id: '03', commandRoots: 1, recipe: 'intentionally-absent-fixed-executable', descendants: 0 },
  { id: '04', commandRoots: 1, recipe: 'controller-death', descendants: 2 },
  { id: '05', commandRoots: 1, recipe: 'controller-stall', descendants: 2 },
  { id: '06', commandRoots: 1, recipe: 'absolute-deadline', descendants: 2 },
  { id: '07', commandRoots: 1, recipe: 'held-cancel', descendants: 0 },
  { id: '08', commandRoots: 1, recipe: 'running-cancel', descendants: 2 },
  { id: '09', commandRoots: 1, recipe: 'two-stream-output-flood', descendants: 2 },
  { id: '10', commandRoots: 1, recipe: 'running-audit-failure', descendants: 2 },
  { id: '11', commandRoots: 1, recipe: 'direct-breakaway-denial', descendants: 2 },
  { id: '12', commandRoots: 1, recipe: 'targeted-fixture-addition', descendants: 2 },
  { id: 'Z3', commandRoots: 0, recipe: 'same-key-replay', descendants: 0 },
  { id: 'Z4', commandRoots: 0, recipe: 'missing-terminal-recovery-copy', descendants: 0 },
  { id: '13', commandRoots: 1, recipe: 'supervisor-death-LAST', descendants: 2 },
] as const satisfies readonly { id: string; commandRoots: number; recipe: string; descendants: number }[]
).map((entry) => Object.freeze(entry));

export type ProofCaseId = typeof PROOF_CASES[number]['id'];
export interface ProofManifest {
  readonly campaignId: string;
  readonly workspacePath: string;
  readonly workspaceDigest: string;
  readonly manifestDigest: string;
  readonly supervisorDigest: string;
  readonly proofBinaryDigest: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly rootBudget: 13;
  readonly creationRequestBudget: 62;
  readonly caseIds: readonly ProofCaseId[];
}
export type ProofPhase = 'PREPARED' | 'HELD' | 'RUNNING' | 'STOPPING' | 'FINALIZING' | 'TERMINAL' | 'UNKNOWN';
export type ProofOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN' | null;
export interface ProofEvidence {
  readonly rootExitCode: number | null;
  readonly jobZero: boolean;
  readonly ioJoined: boolean;
  readonly handlesClosed: boolean;
  readonly auditCommitted: boolean;
}
export interface ProofAttempt {
  readonly caseId: ProofCaseId;
  readonly invocationKey: string;
  readonly invocationDigest: string;
  readonly reservedAtMs: number;
  readonly lastEventMs: number;
  readonly phase: ProofPhase;
  readonly outcome: ProofOutcome;
  readonly admissionsClosed: true;
  readonly deadlineMs: number;
  readonly evidence: ProofEvidence;
  readonly obligations: readonly ('STOP_REQUIRED' | 'CLEANUP_EVIDENCE_REQUIRED')[];
}
export interface ProofPlan {
  readonly manifest: ProofManifest;
  readonly attempts: readonly ProofAttempt[];
  readonly remainingRootBudget: number;
  readonly quarantined: boolean;
}
export type ProofEvent =
  | { readonly kind: 'root-exit'; readonly caseId: string; readonly invocationKey: string; readonly atMs: number; readonly exitCode: number }
  | { readonly kind: Exclude<ProofEventKind, 'root-exit'>; readonly caseId: string; readonly invocationKey: string; readonly atMs: number };
type ProofEventKind = 'held' | 'release' | 'cancel' | 'creation-failed' | 'root-exit'
  | 'job-zero' | 'io-joined' | 'handles-closed' | 'audit-committed'
  | 'audit-failed' | 'output-overflow' | 'supervisor-death' | 'unknown' | 'finalize';

type Denial = 'INVALID_MANIFEST' | 'UNKNOWN_CASE' | 'ZERO_ROOT_CASE' | 'INVALID_INPUT'
  | 'BUSY' | 'BUDGET_EXHAUSTED' | 'QUARANTINED' | 'EXPIRED'
  | 'REPLAY_CONFLICT' | 'UNKNOWN_INVOCATION' | 'OUT_OF_ORDER' | 'STALE_EVENT'
  | 'RELEASE_FENCED' | 'INCOMPLETE_EVIDENCE';
type Result<T> = { readonly ok: true; readonly plan: T; readonly replayed?: boolean }
  | { readonly ok: false; readonly code: Denial };
const denied = (code: Denial): { readonly ok: false; readonly code: Denial } => ({ ok: false, code });
const id = (v: unknown): v is string => typeof v === 'string'
  && v.length > 0 && v.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const clock = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const hasExactly = (obj: Record<string, unknown>, keys: readonly string[]): boolean =>
  Reflect.ownKeys(obj).length === keys.length && keys.every((key) => Object.hasOwn(obj, key));

/** Pure syntactic shape check; deliberately not a physical sealed-manifest verifier. */
export function validateProofManifest(input: unknown): { readonly ok: boolean; readonly code?: 'INVALID_MANIFEST' } {
  const invalid = { ok: false, code: 'INVALID_MANIFEST' as const };
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid;
  const m = input as Record<string, unknown>;
  const keys = ['campaignId', 'workspacePath', 'workspaceDigest', 'manifestDigest',
    'supervisorDigest', 'proofBinaryDigest', 'issuedAtMs', 'expiresAtMs',
    'rootBudget', 'creationRequestBudget', 'caseIds'];
  if (!hasExactly(m, keys) || !id(m.campaignId)
    || !hash(m.workspaceDigest) || !hash(m.manifestDigest)
    || !hash(m.supervisorDigest) || !hash(m.proofBinaryDigest)
    || !clock(m.issuedAtMs) || !clock(m.expiresAtMs)
    || (m.expiresAtMs as number) <= (m.issuedAtMs as number)
    || m.rootBudget !== 13 || m.creationRequestBudget !== 62) return invalid;

  // Input is just a string: no disk lookup, path canonicalization or verification.
  if (typeof m.workspacePath !== 'string' || m.workspacePath.length > 240
    || !/^[a-zA-Z]:\\[^<>:"|?*]+$/.test(m.workspacePath)
    || [...m.workspacePath].some((ch) => ch.charCodeAt(0) < 32)
    || m.workspacePath.split('\\').some((part) => part === '.' || part === '..' || !part)
    || m.workspacePath.endsWith('\\')) return invalid;
  const cases = m.caseIds;
  if (!Array.isArray(cases) || cases.length !== PROOF_CASES.length
    || !PROOF_CASES.every((row, i) => cases[i] === row.id)) return invalid;
  return { ok: true };
}

function snapshot(manifest: ProofManifest, attempts: readonly ProofAttempt[], remainingRootBudget: number, quarantined: boolean): ProofPlan {
  return Object.freeze({
    manifest: Object.freeze({ ...manifest, caseIds: Object.freeze([...manifest.caseIds]) }),
    attempts: Object.freeze(attempts.map((attempt) => Object.freeze({
      ...attempt,
      evidence: Object.freeze({ ...attempt.evidence }),
      obligations: Object.freeze([...attempt.obligations]),
    }))),
    remainingRootBudget, quarantined,
  });
}
/** No physical run option is returned, even when this throws no error. */
export function createProofPlan(manifest: ProofManifest): ProofPlan {
  if (!validateProofManifest(manifest).ok) throw new Error('INVALID_PROOF_MANIFEST');
  return snapshot(manifest, [], PROOF_CREATION_LIMITS.commandRootRequests, false);
}

export function reserveProofRoot(
  plan: ProofPlan,
  request: { readonly caseId: string; readonly invocationKey: string; readonly invocationDigest: string; readonly atMs: number },
): Result<ProofPlan> {
  if (!request || !id(request.invocationKey) || !hash(request.invocationDigest) || !clock(request.atMs)
    || !id(request.caseId)) return denied('INVALID_INPUT');
  const row = PROOF_CASES.find((c) => c.id === request.caseId);
  if (!row) return denied('UNKNOWN_CASE');
  const old = plan.attempts.find((a) => a.invocationKey === request.invocationKey);
  if (old) return old.caseId === request.caseId && old.invocationDigest === request.invocationDigest
    ? { ok: true, plan, replayed: true } // Lookup only. NO launch permission.
    : denied('REPLAY_CONFLICT');
  if (!row.commandRoots) return denied('ZERO_ROOT_CASE');
  if (plan.quarantined) return denied('QUARANTINED');
  if (request.atMs < plan.manifest.issuedAtMs || request.atMs >= plan.manifest.expiresAtMs) return denied('EXPIRED');
  if (plan.attempts.some((a) => a.phase !== 'TERMINAL')) return denied('BUSY');
  if (plan.remainingRootBudget <= 0) return denied('BUDGET_EXHAUSTED');
  if (plan.attempts.some((a) => a.caseId === row.id)) return denied('REPLAY_CONFLICT');
  const attempt: ProofAttempt = {
    caseId: row.id, invocationKey: request.invocationKey, invocationDigest: request.invocationDigest,
    reservedAtMs: request.atMs, lastEventMs: request.atMs, deadlineMs: plan.manifest.expiresAtMs,
    phase: 'PREPARED', outcome: null, admissionsClosed: true,
    evidence: { rootExitCode: null, jobZero: false, ioJoined: false, handlesClosed: false, auditCommitted: false },
    obligations: [],
  };
  return { ok: true, replayed: false, plan: snapshot(plan.manifest,
    [...plan.attempts, attempt], plan.remainingRootBudget - 1, false) };
}

const kinds: readonly ProofEventKind[] = [
  'held', 'release', 'cancel', 'creation-failed', 'root-exit', 'job-zero', 'io-joined',
  'handles-closed', 'audit-committed', 'audit-failed', 'output-overflow',
  'supervisor-death', 'unknown', 'finalize',
];
function validEvent(event: ProofEvent): boolean {
  if (!event || typeof event !== 'object' || !id(event.caseId)
    || !id(event.invocationKey) || !clock(event.atMs) || !kinds.includes(event.kind)) return false;
  const raw = event as unknown as Record<string, unknown>;
  const keys = event.kind === 'root-exit'
    ? ['kind', 'caseId', 'invocationKey', 'atMs', 'exitCode']
    : ['kind', 'caseId', 'invocationKey', 'atMs'];
  return hasExactly(raw, keys)
    && (event.kind !== 'root-exit' || (Number.isSafeInteger(event.exitCode)
      && event.exitCode >= -2147483648 && event.exitCode <= 2147483647));
}
function obligations(phase: ProofPhase): ProofAttempt['obligations'] {
  return phase === 'UNKNOWN' || phase === 'STOPPING'
    ? ['STOP_REQUIRED', 'CLEANUP_EVIDENCE_REQUIRED']
    : phase === 'RUNNING' || phase === 'FINALIZING'
      ? ['CLEANUP_EVIDENCE_REQUIRED'] : [];
}
/** Pure synthetic evidence; cannot prove Windows cleanup or grant authority. */
export function applyProofEvidence(plan: ProofPlan, event: ProofEvent): Result<ProofPlan> {
  if (!validEvent(event)) return denied('INVALID_INPUT');
  const index = plan.attempts.findIndex((a) => a.caseId === event.caseId && a.invocationKey === event.invocationKey);
  if (index < 0) return denied('UNKNOWN_INVOCATION');
  const old = plan.attempts[index]!;
  if (event.atMs < old.lastEventMs) return denied('STALE_EVENT');
  if (old.phase === 'UNKNOWN' || old.phase === 'TERMINAL') return denied('OUT_OF_ORDER');
  let phase: ProofPhase = old.phase as ProofPhase;
  let outcome = old.outcome;
  let evidence = old.evidence;
  const afterDeadline = event.atMs >= old.deadlineMs;
  if (afterDeadline && (phase === 'RUNNING' || phase === 'FINALIZING')) phase = 'STOPPING';
  if (event.kind === 'held') {
    if (phase !== 'PREPARED' || afterDeadline) return denied('OUT_OF_ORDER');
    phase = 'HELD';
  } else if (event.kind === 'release') {
    if (phase !== 'HELD' || afterDeadline) return denied('RELEASE_FENCED');
    phase = 'RUNNING';
  } else if (event.kind === 'cancel') {
    phase = 'STOPPING';
  } else if (event.kind === 'creation-failed') {
    if (old.caseId !== '03' || phase !== 'PREPARED') return denied('OUT_OF_ORDER');
    phase = 'TERMINAL' as ProofPhase; outcome = 'FAILED';
  } else if (['audit-failed', 'output-overflow', 'supervisor-death', 'unknown'].includes(event.kind)) {
    phase = 'UNKNOWN' as ProofPhase; outcome = 'UNKNOWN';
  } else if (event.kind === 'root-exit') {
    if (phase !== 'RUNNING' && phase !== 'STOPPING') return denied('OUT_OF_ORDER');
    if (evidence.rootExitCode !== null) return denied('OUT_OF_ORDER');
    evidence = { ...evidence, rootExitCode: event.exitCode };
    if (phase === 'RUNNING') phase = 'FINALIZING';
  } else if (event.kind === 'job-zero') {
    if (evidence.rootExitCode === null || evidence.jobZero) return denied('OUT_OF_ORDER');
    evidence = { ...evidence, jobZero: true };
  } else if (event.kind === 'io-joined') {
    if (!evidence.jobZero || evidence.ioJoined) return denied('OUT_OF_ORDER');
    evidence = { ...evidence, ioJoined: true };
  } else if (event.kind === 'handles-closed') {
    if (!evidence.ioJoined || evidence.handlesClosed) return denied('OUT_OF_ORDER');
    evidence = { ...evidence, handlesClosed: true };
  } else if (event.kind === 'audit-committed') {
    if (!evidence.handlesClosed || evidence.auditCommitted) return denied('OUT_OF_ORDER');
    evidence = { ...evidence, auditCommitted: true };
  } else if (event.kind === 'finalize') {
    if (phase !== 'FINALIZING' && phase !== 'STOPPING') return denied('OUT_OF_ORDER');
    if (evidence.rootExitCode === null || !evidence.jobZero || !evidence.ioJoined
      || !evidence.handlesClosed || !evidence.auditCommitted) return denied('INCOMPLETE_EVIDENCE');
    phase = 'TERMINAL' as ProofPhase;
    outcome = phase && (old.phase === 'STOPPING' || afterDeadline) ? 'CANCELED'
      : evidence.rootExitCode === 0 ? 'SUCCEEDED' : 'FAILED';
    // Negative physical scenarios must not be reported as ordinary success.
    if (old.caseId !== '01' && old.caseId !== '12' && outcome === 'SUCCEEDED') outcome = 'FAILED';
  } else return denied('INVALID_INPUT');
  const updated: ProofAttempt = {
    ...old, phase, outcome, lastEventMs: event.atMs, evidence, obligations: obligations(phase),
  };
  return { ok: true, plan: snapshot(plan.manifest, plan.attempts.map((a, i) => i === index ? updated : a),
    plan.remainingRootBudget, plan.quarantined || outcome === 'UNKNOWN') };
}
