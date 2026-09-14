import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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
}

export interface ApprovalCoordinator extends ToolKernelApprovalPort {
  readonly runtimeInstanceId: string;
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
  const startup = options.repository.expireOtherRuntimes(runtimeInstanceId, now().toISOString());
  const startupHealthy = startup.ok;

  const coordinator: ApprovalCoordinator = {
    runtimeInstanceId,
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

      const descriptor = validateDescriptor(request.descriptor);
      if (!descriptor.ok) return { ok: false, error: descriptor.error };
      let canonical: string;
      try {
        canonical = stableStringify({
          runtimeInstanceId,
          capability: request.capability,
          effect: request.effect,
          security: {
            sensitivity: request.security.sensitivity,
            context: request.security.context,
            workspaceId: request.security.workspaceId ?? null,
          },
          binding: request.binding,
        });
      } catch {
        return { ok: false, error: appError('APPROVAL_STATE_INVALID', 'Approval binding is invalid') };
      }
      const digest = createHmac('sha256', hmacKey).update(canonical, 'utf8').digest('hex');
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

      const expiresAt = new Date(clock.getTime() + ttlMs).toISOString();
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
  respond(id: string, decision: ApprovalUserDecision): Result<ApprovalRequestRecord, AppError>;
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
    respond(id, decision) {
      const decidedAt = now();
      const current = repository.findById(id);
      if (!current.ok) return current;
      if (!current.value) return err(appError('APPROVAL_STATE_INVALID', 'Approval request is unavailable'));
      if (current.value.status !== 'pending') return err(appError('APPROVAL_STATE_INVALID', 'Approval request is no longer pending'));
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
      return repository.respond(id, decision, decidedAt.toISOString());
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
