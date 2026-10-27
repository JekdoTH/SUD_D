import { createHash } from 'node:crypto';
import { F2B2_FIXED_PROOF } from './private-mvp-win32-native-binding.js';

/**
 * F2-H0 non-production Gateway controller contract.
 *
 * This module models ownership/ordering using injected trusted OS ports.
 * Tests use fakes; a forged port never constitutes Win32 attestation. The
 * separate reviewed native one-shot host is NOT registered and H1 remains
 * explicitly unavailable.
 */
export const F2H0_FIXED_IDENTITY = Object.freeze({
  protocol: 'f2-h0-one-shot-v1',
  stageFingerprint: createHash('sha256').update([
    F2B2_FIXED_PROOF.entrySha256, F2B2_FIXED_PROOF.inputSha256,
    F2B2_FIXED_PROOF.root, F2B2_FIXED_PROOF.profile,
  ].join('\n')).digest('hex'),
  recipeFingerprint: createHash('sha256').update([
    'reviewed-nul-stdio-v1', 'stdin:nul-read', 'stdout:nul-write',
    'stderr:stdout-alias', 'no-other-inherited-handles',
    F2B2_FIXED_PROOF.executableSha256,
  ].join('\n')).digest('hex'),
  nativeProofAvailable: false,
  maximumSerialH1H2Creations: 16,
  campaignWallMs: 30 * 60_000,
} as const);

export interface F2H0FixedRequest {
  readonly missionId: string;
  readonly revision: number;
  readonly attemptId: string;
  readonly ownerEpoch: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly stageFingerprint: string;
  readonly recipeFingerprint: string;
}
export interface F2H0HandleReceipt {
  readonly role: 'root-process' | 'root-thread';
  /** Identity obtained by trusted OS handle query; never a PID. */
  readonly objectId: string;
  /** Gateway-process-local handle, NOT a handle supplied by requester. */
  readonly value: bigint;
  readonly access: number;
  readonly inheritable: boolean;
  readonly owner: 'gateway';
}
/** Implementers MUST inspect real current-process handles using Win32,
 * not relay launcher boolean messages or PID lookups. */
export interface F2H0GatewayPort {
  available(): boolean;
  /** Kernel-owned private peer channel + nonce authenticated for this epoch. */
  authenticatedEpoch(epoch: string): boolean;
  stageHeld(): boolean;
  watchdogArmed(): boolean;
  gatewayJobOwned(): boolean;
  launchOnce(request: Readonly<F2H0FixedRequest>): Promise<{readonly hostIdentity:'owned-one-shot-host'}>;
  inspectGatewayTransfers(): Promise<readonly F2H0HandleReceipt[]>;
  /** OS wait on exact owned host PROCESS HANDLE; string ACK is not evidence. */
  waitOwnedHostExit(): Promise<boolean>;
  confirmGatewayJob(): Promise<boolean>;
  /** Kill actual owned Job + exact host; confirm zero descendants. */
  terminateAndConfirm(): Promise<boolean>;
}
export type F2H0Outcome = {
  readonly ok: true;
  /** Never a native permit, even after mocked transfer succeeds. */
  readonly nativeAuthorization: false;
} | {
  readonly ok: false;
  readonly reason:
    | 'stale-or-unknown-request' | 'already-claimed' | 'peer-or-stage-unavailable'
    | 'transfer-unconfirmed' | 'host-exit-unconfirmed' | 'job-unconfirmed'
    | 'cleanup-unconfirmed';
};

const IDS = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const HEX = /^[a-f0-9]{64}$/;
const EXACT_KEYS = [
  'attemptId', 'missionId', 'ownerEpoch', 'recipeFingerprint', 'revision',
  'stageFingerprint', 'workspaceGeneration', 'workspaceId',
] as const;

function validRequest(value: unknown, expected: F2H0FixedRequest): value is F2H0FixedRequest {
  if (!value || typeof value !== 'object' || !expected) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join('|') !== EXACT_KEYS.join('|')) return false;
  return IDS.test(expected.missionId) && IDS.test(expected.attemptId)
    && IDS.test(expected.ownerEpoch) && IDS.test(expected.workspaceId)
    && IDS.test(expected.workspaceGeneration)
    && Number.isSafeInteger(expected.revision) && expected.revision > 0
    && expected.stageFingerprint === F2H0_FIXED_IDENTITY.stageFingerprint
    && expected.recipeFingerprint === F2H0_FIXED_IDENTITY.recipeFingerprint
    && HEX.test(expected.stageFingerprint) && HEX.test(expected.recipeFingerprint)
    && EXACT_KEYS.every(k => record[k] === expected[k]);
}
function exactTransfers(transfers: readonly F2H0HandleReceipt[]): boolean {
  if (!Array.isArray(transfers) || transfers.length !== 2) return false;
  const [proc,thread] = transfers;
  if (!proc || !thread || proc.role !== 'root-process' || thread.role !== 'root-thread') return false;
  if (proc.owner !== 'gateway' || thread.owner !== 'gateway'
      || proc.inheritable !== false || thread.inheritable !== false
      || proc.access !== 0x101001 || thread.access !== 0x100802) return false;
  if (typeof proc.value !== 'bigint' || typeof thread.value !== 'bigint'
      || proc.value <= 0n || thread.value <= 0n
      || proc.value === thread.value || proc.value === -1n || thread.value === -1n) return false;
  return typeof proc.objectId === 'string' && proc.objectId.length > 0
    && typeof thread.objectId === 'string' && thread.objectId.length > 0
    && proc.objectId !== thread.objectId;
}

/**
 * The single-call lease consumes an admitted attempt even on error. A partial
 * transfer is never retried or adopted by PID; cleanup-unknown is quarantined
 * by the caller's durable Mission/Job repository (this is not a DB adapter).
 */
export function createF2H0OneShotGateway(expected: F2H0FixedRequest, port: F2H0GatewayPort) {
  let claimed = false;
  return Object.freeze({
    async prepare(request: unknown): Promise<F2H0Outcome> {
      if (claimed) return {ok:false,reason:'already-claimed'};
      if (!validRequest(request,expected)) return {ok:false,reason:'stale-or-unknown-request'};
      try {
        if (!port.available() || !port.authenticatedEpoch(expected.ownerEpoch)
            || !port.stageHeld() || !port.watchdogArmed() || !port.gatewayJobOwned()) {
          return {ok:false,reason:'peer-or-stage-unavailable'};
        }
      } catch { return {ok:false,reason:'peer-or-stage-unavailable'}; }
      claimed = true; // Fenced before first asynchronous launch call
      let launched = false;
      let failure: Exclude<F2H0Outcome,{ok:true}>['reason'] = 'transfer-unconfirmed';
      try {
        const host = await port.launchOnce(Object.freeze({...expected}));
        // Port MUST derive this from an already owned host PROCESS HANDLE,
        // never from an unauthenticated host-provided string.
        launched = true;
        if (host?.hostIdentity !== 'owned-one-shot-host') return await fail(failure);
        const transfers = await port.inspectGatewayTransfers();
        if (!exactTransfers(transfers)) return await fail('transfer-unconfirmed');
        if (!await port.waitOwnedHostExit()) return await fail('host-exit-unconfirmed');
        if (!await port.confirmGatewayJob()) return await fail('job-unconfirmed');
        if (!port.available() || !port.authenticatedEpoch(expected.ownerEpoch)
            || !port.stageHeld() || !port.watchdogArmed() || !port.gatewayJobOwned()) return await fail('peer-or-stage-unavailable');
        return {ok:true,nativeAuthorization:false};
      } catch {
        return await fail(failure);
      }
      async function fail(reason: Exclude<F2H0Outcome,{ok:true}>['reason']): Promise<F2H0Outcome> {
        if (!launched) {
          // launchOnce may have created a host before rejecting/throwing. The
          // contract requires cleanup even when its callback fails.
          launched = true;
        }
        try {
          if (await port.terminateAndConfirm() === true) return {ok:false,reason};
        } catch { /* quarantine */ }
        return {ok:false,reason:'cleanup-unconfirmed'};
      }
    },
  });
}
