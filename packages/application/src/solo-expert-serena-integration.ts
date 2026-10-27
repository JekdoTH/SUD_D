/** B1a isolated source-only Gateway admission seam.
 * Never registers production tools. All authority and transports are injected fakes.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  appError, err, ok,
  type ApprovalRequestRecord, type AppError, type ClientSession, type Result,
  type ToolExecutionContext, type ToolKernelResult, type ApprovalBindingValue,
} from '@sud-d/domain';
// Local structural B1a port mirrors: the domain package resolves to prebuilt declarations
// until an authorized build; the canonical exported source contract is in @sud-d/domain source.
const SOLO_B1_COMMAND = 'echo SUD_D_B1_OK';
const SOLO_B1_PROFILE = 'harmless-short-smoke';
const SOLO_B1_REVISION = 'b1-smoke-v1';
const SOLO_B1_DISCLOSURE = 'b1-cooperative-host-user-stock-logging-v1';
const SOLO_B1_TOOL = 'execute_shell_command';
const SOLO_B1_WAIT_MS = 5000;
const SOLO_B1_ANSWER_CHARS = 2048;
const SOLO_B1_TTL_MS = 90000;
const SOLO_B1_RISK = 'Stock Serena may log arguments, results and errors locally. ' +
  'The Windows user retains host filesystem and network access. A waiting timeout does not kill descendants. ' +
  'No secret, provider, script, admin, network-dependent or destructive operation is authorized.';
export interface SoloExpertTrustedIdentity {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly workspaceGeneration: string;
  readonly session: Readonly<ClientSession>;
  readonly resumed: boolean;
  readonly revoked: boolean;
  readonly policyContext: 'workspace' | 'outside_workspace' | 'internal_root' | 'github_network';
  readonly gatewayEpoch: string;
  readonly managedEpoch: string;
  readonly deviceLabel: string;
  readonly deviceProvenance: 'unverified-observation';
  readonly accountLabel: string;
  readonly accountProvenance: 'unverified-observation';
  readonly manifestDigest: string;
  readonly artifactDigest: string;
  readonly configDigest: string;
  readonly schemaDigest: string;
  readonly integrity: 'synthetic-fixture' | 'unverified';
}
export interface SoloExpertReview {
  readonly attemptId: string;
  readonly profileId: typeof SOLO_B1_PROFILE;
  readonly profileRevision: typeof SOLO_B1_REVISION;
  readonly toolName: typeof SOLO_B1_TOOL;
  readonly commandDigest: string;
  readonly recipeDigest: string;
  readonly disclosureVersion: typeof SOLO_B1_DISCLOSURE;
  readonly riskDisclosure: string;
  readonly privacy: 'stock-local-logging';
  readonly risk: 'sensitive';
  readonly effect: 'execute';
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly rootDigest: string;
  readonly workspaceGeneration: string;
  readonly session: Readonly<ClientSession>;
  readonly gatewayEpoch: string;
  readonly managedEpoch: string;
  readonly deviceLabel: string;
  readonly deviceProvenance: 'unverified-observation';
  readonly accountLabel: string;
  readonly accountProvenance: 'unverified-observation';
  readonly manifestDigest: string;
  readonly artifactDigest: string;
  readonly configDigest: string;
  readonly schemaDigest: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly waitMs: typeof SOLO_B1_WAIT_MS;
  readonly maxAnswerChars: typeof SOLO_B1_ANSWER_CHARS;
  readonly maxCalls: 1;
  readonly maxRetries: 0;
}
export type SoloExpertSafeResult = Readonly<{
  executionKind: 'mock';
  status: 'simulated-success' | 'command-failed' | 'unknown' | 'not-ready';
  reason: 'OK' | 'NONZERO_EXIT' | 'NOT_READY' | 'TOOL_ERROR' | 'INVALID_RESPONSE' |
    'CWD_DRIFT' | 'OUTPUT_DRIFT' | 'TIMEOUT' | 'TRANSPORT_UNKNOWN' | 'IDENTITY_DRIFT';
  exitCode?: number;
}>;
export interface SoloExpertFixedToolPort {
  inspect(): Readonly<Pick<SoloExpertTrustedIdentity,
    'workspaceId' | 'canonicalRoot' | 'workspaceGeneration' | 'managedEpoch' |
    'manifestDigest' | 'artifactDigest' | 'configDigest' | 'schemaDigest' | 'integrity'>> | undefined;
  invoke(review: SoloExpertReview): Promise<SoloExpertSafeResult>;
}
export interface SoloExpertAttemptLedgerPort {
  prepare(review: SoloExpertReview): Promise<boolean>;
  claim(attemptId: string, approvalId: string): Promise<boolean>;
  close(attemptId: string): Promise<boolean>;
  markUnknown(attemptId: string): Promise<void>;
  state(attemptId: string): Promise<'prepared' | 'claimed' | 'closed' | 'unknown' | 'revoked' | undefined>;
}
import {
  defineToolCapability, type RegisteredToolCapability, type ToolKernel,
} from './tool-kernel.js';
import type { ApprovalAuthorizationRequest } from './approval-service.js';

const CAPABILITY = 'solo_expert.smoke';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const rejected = (): Result<never, AppError> => err(appError('VALIDATION_FAILED', 'Solo Expert not ready'));
const blocked = (): Result<never, AppError> => err(appError('APPROVAL_STATE_INVALID', 'Solo Expert authorization unavailable'));
const unknown = (): Result<never, AppError> => err(appError('INTERNAL_ERROR', 'Solo Expert attempt uncertain'));
const safeId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(s);
const digest64 = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
function exactPlain(input: unknown): boolean {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    && Object.getPrototypeOf(input) === Object.prototype && Reflect.ownKeys(input).length === 0;
}
function snapshotIdentity(state: SoloExpertTrustedIdentity): Readonly<SoloExpertTrustedIdentity> | undefined {
  if (!state || state.integrity !== 'synthetic-fixture' || state.policyContext !== 'workspace'
    || !state.resumed || state.revoked || !safeId(state.workspaceId)
    || !safeId(state.workspaceGeneration) || !safeId(state.gatewayEpoch)
    || !safeId(state.managedEpoch) || !safeId(state.session?.id)
    || !['desktop', 'mcp-stdio'].includes(state.session.type)
    || typeof state.canonicalRoot !== 'string' || state.canonicalRoot.length > 240
    || !/^[A-Za-z]:[\\/]/.test(state.canonicalRoot)
    || state.canonicalRoot.includes('..') || !safeId(state.deviceLabel)
    || !safeId(state.accountLabel) || state.deviceProvenance !== 'unverified-observation'
    || state.accountProvenance !== 'unverified-observation'
    || ![state.manifestDigest, state.artifactDigest, state.configDigest, state.schemaDigest]
      .every(digest64)) return undefined;
  return Object.freeze({ ...state, session: Object.freeze({
    id: state.session.id, type: state.session.type,
  }) });
}
function matchesReady(
  state: Readonly<SoloExpertTrustedIdentity>, ready: SoloExpertFixedToolPort,
): boolean {
  try {
    const r = ready.inspect();
    return !!r && r.integrity === 'synthetic-fixture'
      && r.workspaceId === state.workspaceId && r.canonicalRoot === state.canonicalRoot
      && r.workspaceGeneration === state.workspaceGeneration
      && r.managedEpoch === state.managedEpoch
      && r.manifestDigest === state.manifestDigest && r.artifactDigest === state.artifactDigest
      && r.configDigest === state.configDigest && r.schemaDigest === state.schemaDigest;
  } catch { return false; }
}
/** Display SHA-256 of exact nonsecret review; distinct from Gateway Approval HMAC. */
export function soloB1ReviewProjection(r: SoloExpertReview) {
  const base = {
    version: 'b1b-review-v1' as const, attemptId: r.attemptId,
    command: 'echo SUD_D_B1_OK' as const,
    profileId: r.profileId, profileRevision: r.profileRevision,
    workspaceId: r.workspaceId, canonicalRoot: r.canonicalRoot,
    workspaceGeneration: r.workspaceGeneration,
    sessionId: r.session.id, sessionType: r.session.type,
    gatewayEpoch: r.gatewayEpoch, managedEpoch: r.managedEpoch,
    deviceLabel: r.deviceLabel, accountLabel: r.accountLabel,
    provenance: 'unverified-observation' as const, riskDisclosure: r.riskDisclosure,
    privacy: r.privacy, issuedAt: new Date(r.issuedAtMs).toISOString(),
    expiresAt: new Date(r.expiresAtMs).toISOString(),
    maxCalls: 1 as const, maxRetries: 0 as const,
  };
  return Object.freeze({ ...base, reviewDigest: hash(JSON.stringify(base)) });
}

export function soloB1ApprovalBinding(r: SoloExpertReview): ApprovalBindingValue {
  return {
    attemptId: r.attemptId, profileId: r.profileId, revision: r.profileRevision,
    reviewDigest: soloB1ReviewProjection(r).reviewDigest,
    tool: r.toolName, commandDigest: r.commandDigest, recipeDigest: r.recipeDigest,
    disclosureVersion: r.disclosureVersion, disclosureDigest: hash(r.riskDisclosure),
    privacy: r.privacy, risk: r.risk, effect: r.effect,
    workspaceId: r.workspaceId, rootDigest: r.rootDigest, generation: r.workspaceGeneration,
    sessionId: r.session.id, sessionType: r.session.type, gatewayEpoch: r.gatewayEpoch,
    managedEpoch: r.managedEpoch, deviceLabel: r.deviceLabel, deviceProvenance: r.deviceProvenance,
    accountLabel: r.accountLabel, accountProvenance: r.accountProvenance,
    manifestDigest: r.manifestDigest, artifactDigest: r.artifactDigest,
    configDigest: r.configDigest, schemaDigest: r.schemaDigest,
    issuedAtMs: r.issuedAtMs, expiresAtMs: r.expiresAtMs,
    waitMs: r.waitMs, answerChars: r.maxAnswerChars, maxCalls: r.maxCalls, maxRetries: r.maxRetries,
  };
}
function authorizationRequest(r: SoloExpertReview): ApprovalAuthorizationRequest {
  return {
    session: r.session, capability: CAPABILITY, effect: 'execute',
    security: { sensitivity: 'sensitive', context: 'workspace', workspaceId: r.workspaceId },
    descriptor: { title: 'One fixed reviewed Serena smoke', resourceLabel: 'harmless-short-smoke',
      ...{ soloExpertReview: soloB1ReviewProjection(r) } },
    binding: soloB1ApprovalBinding(r),
  };
}

export interface SoloExpertB1aDependencies {
  readonly identity: () => SoloExpertTrustedIdentity;
  readonly ready: SoloExpertFixedToolPort;
  readonly ledger: SoloExpertAttemptLedgerPort;
  readonly approvals: { findById(id: string): Result<ApprovalRequestRecord | undefined, AppError> |
    Promise<Result<ApprovalRequestRecord | undefined, AppError>> };
  /** B1a fake only. Actual coordinator HMAC-equality verifier is B1b. */
  readonly verifyConsumedManual?: (input: Readonly<{
    request: ApprovalAuthorizationRequest;
    approvalRequestId: string;
    record: ApprovalRequestRecord;
  }>) => Promise<boolean>;
  readonly coordinatorRuntimeId: string;
  readonly now: () => number;
}
export function createSoloExpertB1aIntegration(deps: SoloExpertB1aDependencies) {
  const issued = new WeakSet<SoloExpertReview>();
  /** Per-Gateway ephemeral retrieval for exact retry; DB fence survives process loss. */
  const byAttemptId = new Map<string, SoloExpertReview>();
  const inFlight = new Set<string>();
  // Only the Kernel invocation that successfully claimed may reconcile outcome audit.
  const claimOwners = new Map<string, string>();
  const current = (r: SoloExpertReview): boolean => {
    try {
      const state = snapshotIdentity(deps.identity());
      const now = deps.now();
      return !!state && matchesReady(state, deps.ready)
        && Number.isSafeInteger(now) && now >= r.issuedAtMs && now < r.expiresAtMs
        && state.workspaceId === r.workspaceId && state.canonicalRoot === r.canonicalRoot
        && hash(state.canonicalRoot) === r.rootDigest
        && state.workspaceGeneration === r.workspaceGeneration
        && state.session.id === r.session.id && state.session.type === r.session.type
        && state.gatewayEpoch === r.gatewayEpoch && state.managedEpoch === r.managedEpoch
        && state.deviceLabel === r.deviceLabel && state.deviceProvenance === r.deviceProvenance
        && state.accountLabel === r.accountLabel && state.accountProvenance === r.accountProvenance
        && state.manifestDigest === r.manifestDigest && state.artifactDigest === r.artifactDigest
        && state.configDigest === r.configDigest && state.schemaDigest === r.schemaDigest
        && r.profileId === SOLO_B1_PROFILE && r.profileRevision === SOLO_B1_REVISION
        && r.toolName === SOLO_B1_TOOL
        && r.commandDigest === hash(SOLO_B1_COMMAND)
        && r.recipeDigest === hash(JSON.stringify({
          command: SOLO_B1_COMMAND, tool: SOLO_B1_TOOL, revision: SOLO_B1_REVISION,
          stdout: 'SUD_D_B1_OK\r\n', maxAnswerChars: SOLO_B1_ANSWER_CHARS,
          waitMs: SOLO_B1_WAIT_MS,
        }))
        && r.disclosureVersion === SOLO_B1_DISCLOSURE && r.riskDisclosure === SOLO_B1_RISK
        && r.privacy === 'stock-local-logging' && r.risk === 'sensitive'
        && r.effect === 'execute' && r.maxCalls === 1 && r.maxRetries === 0
        && r.waitMs === SOLO_B1_WAIT_MS && r.maxAnswerChars === SOLO_B1_ANSWER_CHARS;
    } catch { return false; }
  };
  const admitted = (input: unknown): input is SoloExpertReview => {
    if (typeof input !== 'object' || input === null) return false;
    return issued.has(input as SoloExpertReview) && Object.isFrozen(input) &&
      Object.isFrozen((input as SoloExpertReview).session) && current(input as SoloExpertReview);
  };
  const prepare = async (input: unknown): Promise<Result<SoloExpertReview, AppError>> => {
    try {
      if (!exactPlain(input) || !deps.verifyConsumedManual) return rejected();
      const state = snapshotIdentity(deps.identity());
      const now = deps.now();
      if (!state || !matchesReady(state, deps.ready)
        || !Number.isSafeInteger(now) || now < 0 || now + SOLO_B1_TTL_MS > Number.MAX_SAFE_INTEGER) return rejected();
      const r: SoloExpertReview = Object.freeze({
        attemptId: randomUUID(), profileId: SOLO_B1_PROFILE, profileRevision: SOLO_B1_REVISION,
        toolName: SOLO_B1_TOOL, commandDigest: hash(SOLO_B1_COMMAND),
        recipeDigest: hash(JSON.stringify({
          command: SOLO_B1_COMMAND, tool: SOLO_B1_TOOL, revision: SOLO_B1_REVISION,
          stdout: 'SUD_D_B1_OK\r\n', maxAnswerChars: SOLO_B1_ANSWER_CHARS,
          waitMs: SOLO_B1_WAIT_MS,
        })),
        disclosureVersion: SOLO_B1_DISCLOSURE, riskDisclosure: SOLO_B1_RISK,
        privacy: 'stock-local-logging', risk: 'sensitive', effect: 'execute',
        workspaceId: state.workspaceId, canonicalRoot: state.canonicalRoot,
        rootDigest: hash(state.canonicalRoot), workspaceGeneration: state.workspaceGeneration,
        session: state.session, gatewayEpoch: state.gatewayEpoch, managedEpoch: state.managedEpoch,
        deviceLabel: state.deviceLabel, deviceProvenance: state.deviceProvenance,
        accountLabel: state.accountLabel, accountProvenance: state.accountProvenance,
        manifestDigest: state.manifestDigest, artifactDigest: state.artifactDigest,
        configDigest: state.configDigest, schemaDigest: state.schemaDigest,
        issuedAtMs: now, expiresAtMs: now + SOLO_B1_TTL_MS,
        waitMs: SOLO_B1_WAIT_MS, maxAnswerChars: SOLO_B1_ANSWER_CHARS,
        maxCalls: 1, maxRetries: 0,
      });
      if (!await deps.ledger.prepare(r)) return rejected();
      issued.add(r);
      if (current(r)) { byAttemptId.set(r.attemptId, r); return ok(r); }
      return rejected();
    } catch { return rejected(); }
  };
  const capability: RegisteredToolCapability = defineToolCapability<SoloExpertReview, SoloExpertSafeResult>({
    name: CAPABILITY, effect: 'execute',
    validate: input => admitted(input) ? ok(input) : rejected(),
    resolveSecurity: input => admitted(input)
      ? ok({ sensitivity: 'sensitive', context: 'workspace', workspaceId: input.workspaceId }) : rejected(),
    approval: {
      describe: input => admitted(input)
        ? ok(authorizationRequest(input).descriptor) : rejected(),
      bind: input => admitted(input) ? ok(soloB1ApprovalBinding(input)) : rejected(),
    },
    async execute(input, context: ToolExecutionContext) {
      if (!admitted(input) || !deps.verifyConsumedManual || inFlight.has(input.attemptId)
        || context.approvalDecision !== 'approved' || !context.approvalRequestId
        || context.session.id !== input.session.id || context.session.type !== input.session.type
        || context.security.workspaceId !== input.workspaceId || context.security.context !== 'workspace'
        || context.security.sensitivity !== 'sensitive') return blocked();
      const approvalId = context.approvalRequestId;
      try {
        const record = await deps.approvals.findById(approvalId);
        if (!record.ok || !record.value || record.value.id !== approvalId
          || record.value.runtimeInstanceId !== deps.coordinatorRuntimeId
          || record.value.capability !== CAPABILITY || record.value.effect !== 'execute'
          || record.value.sensitivity !== 'sensitive' || record.value.policyContext !== 'workspace'
          || record.value.workspaceId !== input.workspaceId
          || record.value.sessionId !== input.session.id || record.value.sessionType !== input.session.type
          || record.value.status !== 'consumed' || record.value.decisionSource !== 'user'
          || !Number.isFinite(Date.parse(record.value.expiresAt))
          || Date.parse(record.value.expiresAt) <= deps.now()
          || !await deps.verifyConsumedManual({
            record: record.value, approvalRequestId: approvalId, request: authorizationRequest(input),
          })) return blocked();
        if (!admitted(input) || inFlight.has(input.attemptId)) return blocked();
        // Conditional claim MUST be durable in B1b. B1a runs injected in-memory fake only.
        inFlight.add(input.attemptId);
        const claimed = await deps.ledger.claim(input.attemptId, approvalId);
        if (!claimed) return blocked();
        claimOwners.set(input.attemptId, context.invocationId);
        const claimedAttemptId = input.attemptId;
        if (!admitted(input)) {
          await deps.ledger.markUnknown(claimedAttemptId);
          return unknown();
        }
        const result = await deps.ready.invoke(input);
        if (!admitted(input) || !result || result.executionKind !== 'mock'
          || result.status === 'unknown' || result.status === 'not-ready'
          || !['simulated-success', 'command-failed'].includes(result.status)
          || (result.status === 'simulated-success'
            && (result.reason !== 'OK' || result.exitCode !== 0))
          || (result.status === 'command-failed'
            && (result.reason !== 'NONZERO_EXIT' || !Number.isInteger(result.exitCode)
              || (result.exitCode ?? 0) < 1 || (result.exitCode ?? 0) > 255))) {
          await deps.ledger.markUnknown(input.attemptId);
          return unknown();
        }
        return ok(Object.freeze({
          executionKind: 'mock' as const, status: result.status,
          reason: result.status === 'simulated-success' ? 'OK' as const : 'NONZERO_EXIT' as const,
          exitCode: result.exitCode,
        }));
      } catch {
        try {
          if (await deps.ledger.state(input.attemptId) === 'claimed') await deps.ledger.markUnknown(input.attemptId);
        } catch { /* fail closed: claimed must remain unresolved */ }
        return unknown();
      }
    },
  });
  const invokeThroughKernel = async (
    kernel: ToolKernel, review: SoloExpertReview, session: ClientSession = review.session,
  ): Promise<ToolKernelResult> => {
    const invocationId = randomUUID();
    const result = await kernel.invoke({
      invocationId, capability: capability.name, input: review, session,
    });
    // Executor MUST NOT close: Kernel OUTCOME audit completes after executor returns.
    let state;
    try { state = await deps.ledger.state(review.attemptId); }
    catch { return { ok: false, outcome: 'executed', code: 'EXECUTION_FAILED' }; }
    if (state === 'claimed') {
      // A concurrently rejected invocation MUST NOT quarantine another call's claim.
      if (claimOwners.get(review.attemptId) !== invocationId) return result;
      if (result.ok && result.code === 'EXECUTED' &&
        (result.value as SoloExpertSafeResult)?.executionKind === 'mock' &&
        ['simulated-success', 'command-failed'].includes((result.value as SoloExpertSafeResult).status)) {
        try {
          if (await deps.ledger.close(review.attemptId)) return result;
        } catch { /* unresolved */ }
      }
      try { await deps.ledger.markUnknown(review.attemptId); } catch { /* retained claimed fence */ }
      return { ok: false, outcome: 'executed', code: 'EXECUTION_FAILED' };
    }
    if (state === 'unknown' && result.ok) return {
      ok: false, outcome: 'executed', code: 'EXECUTION_FAILED',
    };
    return result;
  };
  return Object.freeze({ capability, prepare, invokeThroughKernel,
    getReview(attemptId: string): SoloExpertReview | undefined {
      const r = byAttemptId.get(attemptId);
      return r && current(r) ? r : undefined;
    },
  });
}
