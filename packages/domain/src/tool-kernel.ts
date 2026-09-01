import type { AppErrorCode } from './result.js';
import type { PolicyContext } from './policy.js';
import type {
  ClientSession,
  PolicyDecisionKind,
  Sensitivity,
} from './types.js';

export interface ToolInvocationRequest {
  readonly invocationId: string;
  readonly session: ClientSession;
  readonly capability: string;
  readonly input: unknown;
}

export interface ResolvedToolSecurityContext {
  readonly sensitivity: Sensitivity;
  readonly context: PolicyContext;
  readonly workspaceId?: string;
}

export interface ToolExecutionContext {
  readonly invocationId: string;
  readonly session: ClientSession;
  readonly security: ResolvedToolSecurityContext;
}

export type ToolKernelOutcome = 'blocked' | 'executed';

export type ToolKernelResultCode =
  | 'EXECUTED'
  | 'UNKNOWN_CAPABILITY'
  | 'INVALID_INPUT'
  | 'SECURITY_RESOLUTION_FAILED'
  | 'POLICY_EVALUATION_FAILED'
  | 'POLICY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'AUDIT_PRECONDITION_FAILED'
  | 'EXECUTION_FAILED'
  | 'AUDIT_OUTCOME_FAILED';

export interface ToolKernelSuccess {
  readonly ok: true;
  readonly outcome: 'executed';
  readonly code: 'EXECUTED';
  readonly policyDecision: 'allow';
  readonly value: unknown;
}

export interface ToolKernelFailure {
  readonly ok: false;
  readonly outcome: ToolKernelOutcome;
  readonly code: Exclude<ToolKernelResultCode, 'EXECUTED'>;
  readonly policyDecision?: PolicyDecisionKind;
  readonly causeCode?: AppErrorCode;
}

export type ToolKernelResult = ToolKernelSuccess | ToolKernelFailure;

export type ToolRegistryErrorCode =
  | 'INVALID_CAPABILITY_REGISTRATION'
  | 'DUPLICATE_CAPABILITY_REGISTRATION';

export interface ToolRegistryError {
  readonly code: ToolRegistryErrorCode;
}
