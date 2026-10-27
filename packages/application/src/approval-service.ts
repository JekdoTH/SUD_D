import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  appError,
  err,
  ok,
  type AppError,
  type ApprovalBindingValue,
  type ApprovalDescriptor,
  type ApprovalMode,
  type ApprovalRequestRecord,
  type ApprovalUserDecision,
  type AuditEvent,
  type Effect,
  type ResolvedToolSecurityContext,
  type Result,
  type ClientSession,
} from '@sud-d/domain';
import type { ApprovalRepository } from '@sud-d/infrastructure';

export const BASIC_APPROVAL_LIMITS = Object.freeze({
  ttlMs: 5 * 60 * 1000,
  maxActivePerRuntime: 50,
  desktopListCap: 50,
  retentionMs: 24 * 60 * 60 * 1000,
  maxTitleChars: 120,
  maxResourceLabelChars: 240,
});

export interface ApprovalAuthorizationRequest {
  readonly session: ClientSession;
  readonly capability: string;
  readonly effect: Effect;
  readonly security: ResolvedToolSecurityContext;
  readonly descriptor: ApprovalDescriptor;
  readonly binding: ApprovalBindingValue;
}

export type ApprovalAuthorizationResult =
  | { readonly ok: true; readonly state: 'pending'; readonly requestId: string; readonly expiresAt: string }
  | { readonly ok: true; readonly state: 'denied'; readonly requestId: string; readonly expiresAt: string }
  | { readonly ok: true; readonly state: 'approved'; readonly requestId: string }
  | { readonly ok: false; readonly error: AppError };

export interface ToolKernelApprovalPort {
  authorize(request: ApprovalAuthorizationRequest): Promise<ApprovalAuthorizationResult> | ApprovalAuthorizationResult;
}

export interface CreateApprovalCoordinatorOptions {
  readonly repository: ApprovalRepository;
  readonly runtimeInstanceId?: string;
  readonly hmacKey?: Buffer;
  readonly now?: () => Date;
  readonly ttlMs?: number;
  readonly maxActive?: number;
  readonly mode?: () => ApprovalMode;
  /** Private Desktop-only coordinator: do not invalidate Gateway approvals. */
  readonly preserveOtherRuntimes?: boolean;
}

export interface ApprovalCoordinator extends ToolKernelApprovalPort {
  readonly runtimeInstanceId: string;
  /** Desktop TCB only: attest a one-use manual, already-consumed Kernel Approval.
   * Returns the runtime-bound HMAC stored in the EXISTING approval ledger;
   * the Mission SHA-256 is a separate value in request.binding. */
  verifyConsumedManualPreH1(request: ApprovalAuthorizationRequest, requestId: string): string | undefined;
  verifyConsumedManualPreH1Native(request: ApprovalAuthorizationRequest, requestId: string): string | undefined;
  /** Gateway-only: consumed exact human HMAC and immutable reviewed projection. */
  verifyConsumedManualSolo(request: ApprovalAuthorizationRequest, requestId: string): string | undefined;
}

type SoloApprovalView = Readonly<Record<string, unknown> & {
  reviewDigest: string; attemptId: string; expiresAt: string;
  workspaceId: string; sessionId: string; sessionType: string;
  canonicalRoot: string; workspaceGeneration: string;
}>;
const SOLO_FIELDS = Object.freeze([
  'version','attemptId','command','profileId','profileRevision','workspaceId',
  'canonicalRoot','workspaceGeneration','sessionId','sessionType','gatewayEpoch',
  'managedEpoch','deviceLabel','accountLabel','provenance','riskDisclosure','privacy',
  'issuedAt','expiresAt','maxCalls','maxRetries','reviewDigest',
]);
const SOLO_RISK = 'Stock Serena may log arguments, results and errors locally. ' +
  'The Windows user retains host filesystem and network access. A waiting timeout does not kill descendants. ' +
  'No secret, provider, script, admin, network-dependent or destructive operation is authorized.';
function soloReview(r: ApprovalAuthorizationRequest): SoloApprovalView | undefined {
  return (r.descriptor as ApprovalDescriptor & {soloExpertReview?: SoloApprovalView}).soloExpertReview;
}
function validSoloReview(r: ApprovalAuthorizationRequest, at: Date): boolean {
  try {
    const review = soloReview(r);
    if (!review || Object.getPrototypeOf(review) !== Object.prototype ||
      Reflect.ownKeys(review).length !== SOLO_FIELDS.length ||
      !SOLO_FIELDS.every(key => {
        const d = Object.getOwnPropertyDescriptor(review,key);
        return d?.enumerable === true && 'value' in d;
      }) || JSON.stringify(review).length > 4096) return false;
    const {reviewDigest, ...rest} = review;
    const binding = r.binding as Record<string, ApprovalBindingValue>;
    return r.capability === 'solo_expert.smoke' && r.effect === 'execute'
      && r.security.sensitivity === 'sensitive' && r.security.context === 'workspace'
      && r.security.workspaceId === review.workspaceId
      && r.session.id === review.sessionId && r.session.type === review.sessionType
      && review.version === 'b1b-review-v1'
      && review.command === 'echo SUD_D_B1_OK'
      && review.profileId === 'harmless-short-smoke' && review.profileRevision === 'b1-smoke-v1'
      && review.privacy === 'stock-local-logging' && review.provenance === 'unverified-observation'
      && review.riskDisclosure === SOLO_RISK
      && review.maxCalls === 1 && review.maxRetries === 0
      && typeof review.workspaceId === 'string' && review.workspaceId.length >= 1
      && typeof review.canonicalRoot === 'string' && /^[A-Za-z]:[\\/]/.test(review.canonicalRoot)
      && review.canonicalRoot.length <= 240 && !review.canonicalRoot.includes('..')
      && typeof review.workspaceGeneration === 'string' && review.workspaceGeneration.length > 0
      && typeof review.attemptId === 'string' && review.attemptId.length > 0
      && typeof review.deviceLabel === 'string' && review.deviceLabel.length > 0
      && typeof review.accountLabel === 'string' && review.accountLabel.length > 0
      && typeof review.gatewayEpoch === 'string' && review.gatewayEpoch.length > 0
      && typeof review.managedEpoch === 'string' && review.managedEpoch.length > 0
      && /^[0-9a-f]{64}$/.test(reviewDigest)
      && createHash('sha256').update(JSON.stringify(rest)).digest('hex') === reviewDigest
      && typeof review.issuedAt === 'string' && Number.isFinite(Date.parse(review.issuedAt))
      && typeof review.expiresAt === 'string' && Number.isFinite(Date.parse(review.expiresAt))
      && Date.parse(review.issuedAt) <= at.getTime()
      && Date.parse(review.expiresAt) > at.getTime()
      && Date.parse(review.expiresAt) <= at.getTime() + 90_000
      && !!binding && typeof binding === 'object' && !Array.isArray(binding)
      && binding['reviewDigest'] === reviewDigest && binding['attemptId'] === review.attemptId
      && binding['workspaceId'] === review.workspaceId && binding['generation'] === review.workspaceGeneration
      && binding['sessionId'] === review.sessionId && binding['sessionType'] === review.sessionType
      && binding['gatewayEpoch'] === review.gatewayEpoch && binding['managedEpoch'] === review.managedEpoch;
  } catch { return false; }
}

const APPROVE_FOR_ME_VERIFY_ACTIONS = new Set([
  'test',
  'lint',
  'typecheck',
  'build',
  'diff_check',
  'secret_scan',
]);

const GITHUB_NETWORK_AUTO_APPROVAL_CAPABILITIES = new Set([
  'git.clone',
  'git.fetch',
  'git.sync',
  'git.push',
]);

function isAutoApprovalEligible(mode: ApprovalMode, request: ApprovalAuthorizationRequest): boolean {
  if (request.capability === 'solo_expert.smoke' || request.capability === 'team.start' || request.capability === 'runner.start'
    || request.capability === 'pre-h1.prepare' || request.capability === 'pre-h1.native-consent') return false;
  if (mode === 'standard') return false;

  if (request.security.context === 'github_network') {
    return request.security.sensitivity === 'normal'
      && request.effect !== 'delete'
      && GITHUB_NETWORK_AUTO_APPROVAL_CAPABILITIES.has(request.capability);
  }

  if (
    request.security.context !== 'workspace'
    || request.security.sensitivity !== 'normal'
    || !request.security.workspaceId
    || request.effect === 'delete'
  ) {
    return false;
  }
  if (mode === 'full_access') return true;
  if (request.capability === 'git.commit') return true;
  if (request.capability !== 'verify.run') return false;
  if (typeof request.binding !== 'object' || request.binding === null || Array.isArray(request.binding)) return false;
  const binding = request.binding as { readonly [key: string]: ApprovalBindingValue };
  const action = binding['action'];
  return typeof action === 'string' && APPROVE_FOR_ME_VERIFY_ACTIONS.has(action);
}

export function createApprovalCoordinator(options: CreateApprovalCoordinatorOptions): ApprovalCoordinator {
  const runtimeInstanceId = options.runtimeInstanceId ?? randomUUID();
  const hmacKey = options.hmacKey ?? randomBytes(32);
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? BASIC_APPROVAL_LIMITS.ttlMs;
  const maxActive = options.maxActive ?? BASIC_APPROVAL_LIMITS.maxActivePerRuntime;
  const mode = options.mode ?? (() => 'standard' as const);
  const startupHealthy = options.preserveOtherRuntimes === true
    ? true : options.repository.expireOtherRuntimes(runtimeInstanceId, now().toISOString()).ok;
  const approvalDigest = (request: ApprovalAuthorizationRequest): string => createHmac('sha256', hmacKey).update(stableStringify({
    runtimeInstanceId,
    capability: request.capability,
    effect: request.effect,
    security: {
      sensitivity: request.security.sensitivity,
      context: request.security.context,
      workspaceId: request.security.workspaceId ?? null,
    },
    binding: request.binding,
  }), 'utf8').digest('hex');

  const verifyManual = (request: ApprovalAuthorizationRequest, requestId: string,
    capability: 'pre-h1.prepare'|'pre-h1.native-consent'): string|undefined => {
    if (!startupHealthy || request.capability !== capability || request.effect !== 'execute'
      || request.security.context !== 'workspace' || request.session.type !== 'desktop'
      || typeof requestId !== 'string') return undefined;
    try {
      const digest = approvalDigest(request);
      const record = options.repository.findById(requestId);
      if (!record.ok || !record.value || record.value.bindingDigest !== digest
        || record.value.runtimeInstanceId !== runtimeInstanceId
        || record.value.capability !== capability || record.value.effect !== 'execute'
        || record.value.policyContext !== 'workspace'
        || record.value.workspaceId !== request.security.workspaceId
        || record.value.sessionId !== request.session.id
        || record.value.sessionType !== request.session.type
        || record.value.decisionSource !== 'user' || record.value.status !== 'consumed'
        || record.value.expiresAt <= now().toISOString()) return undefined;
      return digest;
    } catch { return undefined; }
  };
  const coordinator: ApprovalCoordinator = {
    runtimeInstanceId,
    verifyConsumedManualPreH1(request, requestId) {
      return verifyManual(request,requestId,'pre-h1.prepare');
    },
    verifyConsumedManualPreH1Native(request, requestId) {
      return verifyManual(request,requestId,'pre-h1.native-consent');
    },
    verifyConsumedManualSolo(request, requestId) {
      if (!startupHealthy || request.capability !== 'solo_expert.smoke' || !validSoloReview(request, now())) return undefined;
      try {
        const digest = approvalDigest(request);
        const record = options.repository.findById(requestId);
        const review = soloReview(request);
        const stored = record.ok ? record.value as ApprovalRequestRecord & {soloExpertReview?: SoloApprovalView} : undefined;
        if (!record.ok || !record.value || !review || !stored?.soloExpertReview ||
          record.value.bindingDigest !== digest || record.value.id !== requestId ||
          record.value.runtimeInstanceId !== runtimeInstanceId ||
          record.value.capability !== 'solo_expert.smoke' || record.value.effect !== 'execute' ||
          record.value.sensitivity !== 'sensitive' || record.value.policyContext !== 'workspace' ||
          record.value.workspaceId !== request.security.workspaceId ||
          record.value.sessionId !== request.session.id || record.value.sessionType !== request.session.type ||
          record.value.status !== 'consumed' || record.value.decisionSource !== 'user' ||
          record.value.expiresAt <= now().toISOString() ||
          stored?.soloExpertReview?.reviewDigest !== review.reviewDigest ||
          JSON.stringify(stored?.soloExpertReview) !== JSON.stringify(review)) return undefined;
        return digest;
      } catch { return undefined; }
    },
    authorize(request: ApprovalAuthorizationRequest): ApprovalAuthorizationResult {
      if (!startupHealthy) {
        return { ok: false, error: appError('INTERNAL_ERROR', 'Approval state is unavailable') };
      }
      const clock = now();
      const nowIso = clock.toISOString();
      const expired = options.repository.expireStale(nowIso);
      if (!expired.ok) return { ok: false, error: appError('INTERNAL_ERROR', 'Approval state is unavailable') };
      const cleanupBefore = new Date(clock.getTime() - BASIC_APPROVAL_LIMITS.retentionMs).toISOString();
      options.repository.cleanupTerminal(cleanupBefore);

      if (request.capability === 'solo_expert.smoke' && !validSoloReview(request, clock)) {
        return { ok: false, error: appError('APPROVAL_STATE_INVALID', 'Reviewed Solo Expert permission unavailable') };
      }
      const descriptor = validateDescriptor(request.descriptor);
      if (!descriptor.ok) return { ok: false, error: descriptor.error };
      let digest: string;
      try {
        digest = approvalDigest(request);
      } catch {
        return { ok: false, error: appError('APPROVAL_STATE_INVALID', 'Approval binding is invalid') };
      }
      const latest = options.repository.findLatest(runtimeInstanceId, digest);
      if (!latest.ok) return { ok: false, error: latest.error };
      const existing = latest.value;
      if (existing?.status === 'denied' && existing.expiresAt > nowIso) {
        return { ok: true, state: 'denied', requestId: existing.id, expiresAt: existing.expiresAt };
      }
      if (existing?.status === 'approved' && existing.expiresAt > nowIso) {
        const consumed = options.repository.consumeApproved(runtimeInstanceId, digest, nowIso);
        if (!consumed.ok) return { ok: false, error: consumed.error };
        if (consumed.value) return { ok: true, state: 'approved', requestId: consumed.value.id };
      }

      const solo = request.capability === 'solo_expert.smoke' ? soloReview(request) : undefined;
      const expiresAt = new Date(Math.min(clock.getTime() + (solo ? Math.min(ttlMs, 90_000) : ttlMs),
        solo ? Date.parse(solo.expiresAt) : Number.POSITIVE_INFINITY)).toISOString();
      const recordInput = {
        runtimeInstanceId,
        bindingDigest: digest,
        sessionId: request.session.id,
        sessionType: request.session.type,
        capability: request.capability,
        effect: request.effect,
        sensitivity: request.security.sensitivity,
        policyContext: request.security.context,
        ...(request.security.workspaceId ? { workspaceId: request.security.workspaceId } : {}),
        title: descriptor.value.title,
        ...(solo ? { soloExpertReview: solo } : {}),
        ...(descriptor.value.resourceLabel ? { resourceLabel: descriptor.value.resourceLabel } : {}),
        createdAt: nowIso,
        expiresAt,
      };

      if (isAutoApprovalEligible(mode(), request)) {
        const recorded = options.repository.recordModeApproval(recordInput, nowIso);
        if (!recorded.ok) return { ok: false, error: recorded.error };
        return { ok: true, state: 'approved', requestId: recorded.value.id };
      }

      if (existing?.status === 'pending' && existing.expiresAt > nowIso) {
        return { ok: true, state: 'pending', requestId: existing.id, expiresAt: existing.expiresAt };
      }

      const active = options.repository.countActive(runtimeInstanceId, nowIso);
      if (!active.ok) return { ok: false, error: active.error };
      if (active.value >= maxActive) {
        return { ok: false, error: appError('APPROVAL_QUEUE_FULL', 'Approval queue is full') };
      }
      const created = options.repository.createPending(recordInput);
      if (!created.ok) return { ok: false, error: created.error };
      return { ok: true, state: 'pending', requestId: created.value.id, expiresAt };
    },
  };
  return Object.freeze(coordinator);
}

export interface ApprovalDecisionAuditPort {
  append(event: Omit<AuditEvent, 'id'>): unknown;
}

export interface ApprovalService {
  list(limit?: number): Result<readonly ApprovalRequestRecord[], AppError>;
  respond(id: string, decision: ApprovalUserDecision, reviewDigest?: string): Result<ApprovalRequestRecord, AppError>;
}

export function createApprovalService(
  repository: ApprovalRepository,
  audit: ApprovalDecisionAuditPort,
  now: () => Date = () => new Date(),
): ApprovalService {
  const service: ApprovalService = {
    list(limit = BASIC_APPROVAL_LIMITS.desktopListCap) {
      return repository.listPending(Math.min(limit, BASIC_APPROVAL_LIMITS.desktopListCap), now().toISOString());
    },
    respond(id, decision, reviewDigest) {
      const decidedAt = now();
      const current = repository.findById(id);
      if (!current.ok) return current;
      if (!current.value) return err(appError('APPROVAL_STATE_INVALID', 'Approval request is unavailable'));
      if (current.value.status !== 'pending') return err(appError('APPROVAL_STATE_INVALID', 'Approval request is no longer pending'));
      const stored = current.value as ApprovalRequestRecord & {soloExpertReview?: SoloApprovalView};
      if (current.value.capability === 'solo_expert.smoke' &&
        (!reviewDigest || stored.soloExpertReview?.reviewDigest !== reviewDigest ||
          stored.soloExpertReview?.expiresAt !== current.value.expiresAt)) {
        return err(appError('APPROVAL_STATE_INVALID', 'Exact reviewed scope unavailable'));
      }
      if (current.value.expiresAt <= decidedAt.toISOString()) {
        repository.expireStale(decidedAt.toISOString());
        return err(appError('APPROVAL_EXPIRED', 'Approval request expired'));
      }
      try {
        audit.append({
          timestamp: decidedAt,
          sessionId: 'desktop-user',
          sessionType: 'desktop',
          action: 'approval.decision',
          ...(current.value.workspaceId ? { workspaceId: current.value.workspaceId } : {}),
          policyDecision: 'ask',
          resultCode: decision === 'approve' ? 'APPROVAL_APPROVED' : 'APPROVAL_DENIED',
          durationMs: 0,
          metadata: {
            approvalRequestId: current.value.id,
            capability: current.value.capability,
            decision,
          },
        });
      } catch {
        return err(appError('INTERNAL_ERROR', 'Approval decision audit failed'));
      }
      // Prebuilt infrastructure declarations omit B1b's additive fourth argument.
      // The repository source adapter is checked by the isolated source-only TS program.
      const reviewedRepository = repository as ApprovalRepository & {
        respond(id: string, decision: ApprovalUserDecision, nowIso: string,
          reviewDigest?: string): Result<ApprovalRequestRecord, AppError>;
      };
      return reviewedRepository.respond(id, decision, decidedAt.toISOString(), reviewDigest);
    },
  };
  return Object.freeze(service);
}

function validateDescriptor(descriptor: ApprovalDescriptor): Result<ApprovalDescriptor, AppError> {
  const title = descriptor.title.trim();
  const resourceLabel = descriptor.resourceLabel?.trim();
  if (!title || title.length > BASIC_APPROVAL_LIMITS.maxTitleChars) {
    return err(appError('APPROVAL_STATE_INVALID', 'Approval description is invalid'));
  }
  if (resourceLabel && resourceLabel.length > BASIC_APPROVAL_LIMITS.maxResourceLabelChars) {
    return err(appError('APPROVAL_STATE_INVALID', 'Approval resource label is invalid'));
  }
  return ok({ title, ...(resourceLabel ? { resourceLabel } : {}) });
}

function stableStringify(value: ApprovalBindingValue | Record<string, unknown>): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item as ApprovalBindingValue)}`).join(',')}}`;
  }
  throw new Error('unsupported approval binding value');
}
