/** B1a source-only cooperative Solo Expert model. No product tool registration. */
import type { ClientSession } from './types.js';
import type { PolicyContext } from './policy.js';

export const SOLO_B1_PROFILE = 'harmless-short-smoke' as const;
export const SOLO_B1_REVISION = 'b1-smoke-v1' as const;
export const SOLO_B1_TOOL = 'execute_shell_command' as const;
export const SOLO_B1_COMMAND = 'echo SUD_D_B1_OK' as const;
export const SOLO_B1_EXPECTED_STDOUT = 'SUD_D_B1_OK\r\n' as const;
export const SOLO_B1_WAIT_MS = 5_000;
export const SOLO_B1_ANSWER_CHARS = 2048;
export const SOLO_B1_TTL_MS = 90_000;
export const SOLO_B1_DISCLOSURE = 'b1-cooperative-host-user-stock-logging-v1';
export const SOLO_B1_RISK = 'Stock Serena may log arguments, results and errors locally. ' +
  'The Windows user retains host filesystem and network access. A waiting timeout does not kill descendants. ' +
  'No secret, provider, script, admin, network-dependent or destructive operation is authorized.';
export type SoloExpertAttemptState = 'prepared' | 'claimed' | 'closed' | 'unknown' | 'revoked';
export type SoloExpertOutcome = 'simulated-success' | 'command-failed' | 'unknown' | 'not-ready';
export type SoloExpertSourceReason =
  'OK' | 'NONZERO_EXIT' | 'NOT_READY' | 'TOOL_ERROR' | 'INVALID_RESPONSE' |
  'CWD_DRIFT' | 'OUTPUT_DRIFT' | 'TIMEOUT' | 'TRANSPORT_UNKNOWN' | 'IDENTITY_DRIFT';

export interface SoloExpertSafeResult {
  readonly executionKind: 'mock';
  readonly status: SoloExpertOutcome;
  readonly reason: SoloExpertSourceReason;
  readonly exitCode?: number;
}
export interface SoloExpertTrustedIdentity {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly workspaceGeneration: string;
  readonly session: Readonly<ClientSession>;
  readonly resumed: boolean;
  readonly revoked: boolean;
  readonly policyContext: PolicyContext;
  readonly gatewayEpoch: string;
  readonly managedEpoch: string;
  readonly deviceLabel: string;
  /** These are observations, NEVER OS attestations. */
  readonly deviceProvenance: 'unverified-observation';
  readonly accountLabel: string;
  readonly accountProvenance: 'unverified-observation';
  readonly manifestDigest: string;
  readonly artifactDigest: string;
  readonly configDigest: string;
  readonly schemaDigest: string;
  /** Source-only fixture; production integrity is NOT proven by this label. */
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
export type SoloExpertReadyReceipt = Readonly<Pick<SoloExpertTrustedIdentity,
  'workspaceId' | 'canonicalRoot' | 'workspaceGeneration' | 'managedEpoch' |
  'manifestDigest' | 'artifactDigest' | 'configDigest' | 'schemaDigest' | 'integrity'>>;
export interface SoloExpertFixedToolPort {
  /** Must not start/connect/provision/repair any runtime. */
  inspect(): SoloExpertReadyReceipt | undefined;
  /** Strictly a fake session in B1a. */
  invoke(review: SoloExpertReview): Promise<SoloExpertSafeResult>;
}
export interface SoloExpertAttemptLedgerPort {
  prepare(review: SoloExpertReview): Promise<boolean>;
  claim(attemptId: string, approvalId: string): Promise<boolean>;
  close(attemptId: string): Promise<boolean>;
  markUnknown(attemptId: string): Promise<void>;
  state(attemptId: string): Promise<SoloExpertAttemptState | undefined>;
}
