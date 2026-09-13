import type { Effect, Sensitivity } from './types.js';
import type { PolicyContext } from './policy.js';

export const APPROVAL_MODES = ['standard', 'approve_for_me', 'full_access'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'consumed' | 'expired';
export type ApprovalUserDecision = 'approve' | 'deny';
export type ApprovalDecisionKind = 'approved' | 'denied';
export type ApprovalDecisionSource = 'user' | 'mode';

export interface ApprovalDescriptor {
  readonly title: string;
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
