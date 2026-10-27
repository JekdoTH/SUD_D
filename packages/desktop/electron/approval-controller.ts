import { createHash } from 'node:crypto';
import { appError, err, ok, type AppError, type ApprovalRequestRecord, type Result } from '@sud-d/domain';
import { SoloExpertReviewDtoSchema, type SoloExpertReviewDto } from '@sud-d/contracts';
import type { ApprovalModeService, ApprovalService } from '@sud-d/application';
import type {
  ApprovalListInput,
  ApprovalModeSetInput,
  ApprovalRespondInput,
  DesktopApprovalModeDto,
  DesktopApprovalRequestDto,
  DesktopApprovalResponseDto,
  PreH1PreparationReviewDto,
  PreH1NativeConsentReviewDto,
} from '@sud-d/contracts';

export interface DesktopApprovalController {
  list(input: ApprovalListInput): Result<DesktopApprovalRequestDto[], AppError>;
  respond(input: ApprovalRespondInput): Result<DesktopApprovalResponseDto, AppError>;
  getMode(): Result<DesktopApprovalModeDto, AppError>;
  setMode(input: ApprovalModeSetInput): Result<DesktopApprovalModeDto, AppError>;
}

export function createDesktopApprovalController(
  approvalService: ApprovalService,
  approvalModeService: ApprovalModeService,
  preH1ReviewForPending?: (id:string)=>PreH1PreparationReviewDto|undefined,
  preH1NativeReviewForPending?: (id:string)=>PreH1NativeConsentReviewDto|undefined,
): DesktopApprovalController {
  return Object.freeze({
    list(input: ApprovalListInput) {
      const result = approvalService.list(input.limit);
      if (!result.ok) return result;
      // NEVER downgrade a missing or corrupt Solo review to a generic approvable card.
      if (result.value.some(record => record.capability === 'solo_expert.smoke' && !verifiedSoloReview(record))) {
        return err(appError('APPROVAL_STATE_INVALID', 'Solo Expert review unavailable or corrupted'));
      }
      return ok(result.value.map(record=>({
        ...toDesktopApprovalRequest(record),
        ...(record.capability==='pre-h1.prepare'&&preH1ReviewForPending?.(record.id)
          ? {preH1Review:preH1ReviewForPending(record.id)} : {}),
        ...(record.capability==='pre-h1.native-consent'&&preH1NativeReviewForPending?.(record.id)
          ? {preH1NativeReview:preH1NativeReviewForPending(record.id)} : {}),
      })));
    },
    respond(input: ApprovalRespondInput) {
      const pending = approvalService.list();
      if (!pending.ok) return pending;
      const matching = pending.value.find(item => item.id === input.approvalRequestId);
      if (matching?.capability === 'solo_expert.smoke') {
        const reviewed = verifiedSoloReview(matching);
        if (!reviewed || input.reviewDigest !== reviewed.reviewDigest) {
          return err(appError('APPROVAL_STATE_INVALID', 'Displayed Solo Expert review is stale or missing'));
        }
      }
      if (input.decision==='approve') {
        const active=approvalService.list();
        if (!active.ok) return active;
        const record=active.value.find(item=>item.id===input.approvalRequestId);
        if ((record?.capability==='pre-h1.prepare' && !preH1ReviewForPending?.(record.id))
          || (record?.capability==='pre-h1.native-consent' && !preH1NativeReviewForPending?.(record.id)))
          return err(appError('RUNNER_APPROVAL_STALE',
            'PRE-H1 Mission snapshot changed; do not approve this request'));
      }
      const typedService = approvalService as ApprovalService & {
        respond(id: string, decision: 'approve' | 'deny', reviewDigest?: string): ReturnType<ApprovalService['respond']>;
      };
      const result = typedService.respond(input.approvalRequestId, input.decision, input.reviewDigest);
      if (!result.ok) return result;
      if (result.value.status !== 'approved' && result.value.status !== 'denied') {
        return err(appError('APPROVAL_STATE_INVALID', 'Approval decision is unavailable'));
      }
      return ok({
        id: result.value.id,
        status: result.value.status,
        message: result.value.status === 'approved'
          ? (result.value.capability==='pre-h1.prepare'
            ? 'Manual preparation approval recorded. Select Complete manual approval in Activity; no Native execution is authorized.'
            : result.value.capability==='pre-h1.native-consent'
              ? 'Native consent manually approved. Select Complete Native consent in Activity to record one-use grant; no execution starts.'
              : 'Approved. Retry the action from the connected AI.')
          : 'Denied. The action will not run.',
      });
    },
    getMode() {
      const result = approvalModeService.get();
      return result.ok ? ok({ mode: result.value }) : result;
    },
    setMode(input: ApprovalModeSetInput) {
      const result = approvalModeService.set(input.mode);
      return result.ok ? ok({ mode: result.value }) : result;
    },
  });
}

/** The stored projection is a public SHA-256 binder, NEVER an HMAC grant. */
function verifiedSoloReview(record: ApprovalRequestRecord): SoloExpertReviewDto | undefined {
  try {
    const parsed = SoloExpertReviewDtoSchema.safeParse((record as ApprovalRequestRecord & {
      soloExpertReview?: unknown
    }).soloExpertReview);
    if (!parsed.success) return undefined;
    const review = parsed.data;
    const { reviewDigest, ...withoutDigest } = review;
    if (record.capability !== 'solo_expert.smoke' || record.workspaceId !== review.workspaceId
      || record.sessionId !== review.sessionId || record.sessionType !== review.sessionType
      || record.expiresAt !== review.expiresAt
      || !Number.isFinite(Date.parse(record.createdAt))
      || Date.parse(review.issuedAt) > Date.parse(record.createdAt)
      || Date.parse(record.createdAt) - Date.parse(review.issuedAt) > 90_000
      || review.riskDisclosure !== SOLO_EXPECTED_RISK
      || Date.parse(review.expiresAt) <= Date.now()
      || createHash('sha256').update(JSON.stringify(withoutDigest)).digest('hex') !== reviewDigest) return undefined;
    return review;
  } catch { return undefined; }
}
const SOLO_EXPECTED_RISK = 'Stock Serena may log arguments, results and errors locally. ' +
  'The Windows user retains host filesystem and network access. A waiting timeout does not kill descendants. ' +
  'No secret, provider, script, admin, network-dependent or destructive operation is authorized.';

function toDesktopApprovalRequest(record: ApprovalRequestRecord): DesktopApprovalRequestDto {
  const reviewed = record.capability === 'solo_expert.smoke' ? verifiedSoloReview(record) : undefined;
  return {
    id: record.id,
    ...(reviewed ? {soloExpertReview: reviewed} : {}),
    capability: record.capability,
    effect: record.effect,
    sensitivity: record.sensitivity,
    title: record.title,
    ...(record.resourceLabel ? { resourceLabel: record.resourceLabel } : {}),
    status: 'pending',
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}
