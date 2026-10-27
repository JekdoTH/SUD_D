import type { Effect, Sensitivity } from './types.js';
import type { PolicyContext } from './policy.js';

export const APPROVAL_MODES = ['standard', 'approve_for_me', 'full_access'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed' | 'expired';
export type ApprovalUserDecision = 'approve' | 'deny';
export type ApprovalDecisionKind = 'approved' | 'denied';
export type ApprovalDecisionSource = 'user' | 'mode';

/** Nonsecret, immutable human-readable command and risk projection.
 * SHA-256 reviewDigest is a display integrity binding, NOT an Approval HMAC.
 */
export interface SoloExpertApprovalReview {
  readonly version: 'b1b-review-v1';
  readonly attemptId: string;
  readonly command: 'echo SUD_D_B1_OK';
  readonly profileId: 'harmless-short-smoke';
  readonly profileRevision: 'b1-smoke-v1';
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly workspaceGeneration: string;
  readonly sessionId: string;
  readonly sessionType: string;
  readonly gatewayEpoch: string;
  readonly managedEpoch: string;
  readonly deviceLabel: string;
  readonly accountLabel: string;
  readonly provenance: 'unverified-observation';
  readonly riskDisclosure: string;
  readonly privacy: 'stock-local-logging';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly maxCalls: 1;
  readonly maxRetries: 0;
  /** SHA-256 of ordered JSON.stringify of preceding fields excluding reviewDigest. */
  readonly reviewDigest: string;
}

export interface ApprovalDescriptor {
  readonly title: string;
  readonly soloExpertReview?: SoloExpertApprovalReview;
  readonly resourceLabel?: string;
}

export type ApprovalBindingValue =
  | null
  | boolean
  | number
  | string
  | readonly ApprovalBindingValue[]
  | { readonly [key: string]: ApprovalBindingValue };

export interface ApprovalRequestRecord {
  readonly id: string;
  readonly soloExpertReview?: SoloExpertApprovalReview;
  readonly runtimeInstanceId: string;
  readonly bindingDigest: string;
  readonly sessionId: string;
  readonly sessionType: string;
  readonly capability: string;
  readonly effect: Effect;
  readonly sensitivity: Sensitivity;
  readonly policyContext: PolicyContext;
  readonly workspaceId?: string;
  readonly title: string;
  readonly resourceLabel?: string;
  readonly status: ApprovalStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly decidedAt?: string;
  readonly consumedAt?: string;
  readonly decisionSource?: ApprovalDecisionSource;
}
