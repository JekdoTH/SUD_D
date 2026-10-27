import { createHash } from 'node:crypto';
import { appError, err, ok, type AppError, type Result } from '@sud-d/domain';
import type { Db } from './database.js';
import { createApprovalRepository } from './approval-repository.js';
import { createAuditEventWriter } from './audit-repository.js';
import { consumeF2H1VerifiedCleanupEvidence } from './private-mvp-h1-native-cleanup-proof.js';

// F2-A is a durable admission ledger, NOT a runner or an OS resource enforcer.
// H1 exact native cleanup proof is STILL unavailable. No trusted caller can
// release native charges merely by passing Booleans to this repository.
export const F2_H1_NATIVE_CLEANUP_PROOF_AVAILABLE = false as const;
// Historical PROJECT_RUNNER_RESOURCE_POLICY (p0c-offline-v1) is intentionally untouched.
export const PRIVATE_MVP_RESOURCE_POLICY = Object.freeze({
  revision: 'private-mvp-reviewed-v1',
  networkProfile: 'none',
  secretProfile: 'none',
  maxActiveMissions: 1,
  maxActiveJobs: 1,
  maxAttempts: 3,
  maxMissionMs: 30 * 60_000,
  maxAttemptMs: 10 * 60_000,
  jobUserTimeMs: 10 * 60_000,
  activeProcessLimit: 8,
  jobMemoryBytes: 512 * 1024 ** 2,
  heartbeatMs: 2_000,
  leaseMs: 8_000,
  lostOwnerStopMs: 10_000,
  detectedCancelStopMs: 5_000,
  cleanupGraceMs: 30_000,
  maxSnapshotBytes: 256 * 1024 ** 2,
  maxSnapshotFiles: 10_000,
  maxManifestBytes: 64 * 1024,
  maxRunners: 16,
  maxInputBytes: 16 * 1024,
  maxScratchBytes: 256 * 1024 ** 2,
  maxArtifactBytes: 16 * 1024 ** 2,
  maxArtifactAggregateBytes: 64 * 1024 ** 2,
  maxArtifacts: 50,
  maxRetainedFootprintBytes: 4 * 1024 ** 3,
  minFreeSpaceBytes: 2 * 1024 ** 3,
  footprintScanMs: 2_000,
  maxTerminalJobs: 20,
  maxRetentionMs: 7 * 24 * 60 * 60_000,
  maxRawLogBytes: 1024 * 1024,
  maxLogBytes: 32 * 1024,
  maxLogPollBytes: 4 * 1024,
  maxProgressFrames: 1000,
  maxProgressFrameBytes: 4 * 1024,
  maxAuditTransitions: 100,
  maxAuditTransitionBytes: 4 * 1024,
  maxDurableMetadataBytes: 64 * 1024 ** 2,
  maxProviderCalls: 0,
  maxProviderUploadBytes: 0,
  maxSpendMicrousd: 0,
  // Admission reserves worst-case snapshot + scratch + outputs + metadata,
  // retained until an independently verified cleanup is reported by a future trusted controller.
  perAttemptReservationBytes: (256 + 256 + 64 + 64) * 1024 ** 2,
} as const);

export const PRIVATE_MVP_RESOURCE_POLICY_IDENTITY = createHash('sha256')
  .update(JSON.stringify(PRIVATE_MVP_RESOURCE_POLICY)).digest('hex');

export interface PrivateMvpMissionScope {
  readonly missionId: string;
  readonly revision: number;
  readonly goalDigest: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly runnerId: string;
  readonly executionFingerprint: string;
  readonly inputDigest: string;
  readonly resourcePolicyIdentity: string;
  readonly expiresAt: string;
}

export interface PrivateMvpObservedAdmissionBudget {
  /** Trusted-controller observation only; F2-A does not inspect the disk or run code. */
  readonly observedFreeBytes: number;
  readonly observedOwnedBytes: number;
}

/** Issued ONLY by the private Desktop Kernel execution closure after the
 * existing manual Approval was consumed. Kernel HMAC and Mission SHA remain
 * independent cryptographic commitments; neither substitutes for the other. */
export interface PreH1KernelApprovalReceipt {
  readonly requestId:string;
  readonly runtimeInstanceId:string;
  readonly kernelBindingDigest:string;
  readonly missionBindingDigest:string;
  readonly workspaceGeneration:string;
  readonly revision:number;
  readonly policyIdentity:string;
  readonly expiresAt:string;
}

export interface PrivateMvpMissionAdmissionRepository {
  /** Consume one exact USER approval and create one device-wide Mission atomically. */
  enrollApproved(scope: PrivateMvpMissionScope, runtimeInstanceId: string,
    receipt?: PreH1KernelApprovalReceipt): Result<void, AppError>;
  /**
   * Durable offline reservation, idempotent ONLY while this attempt is still reserved.
   * A settled attempt cannot be re-reserved or replayed, including after DB reopen.
   * A successful lookup with created=false is NOT authority to launch/resume a worker.
   * This interface never starts a worker, materializes a stage, or grants execution.
   */
  reserveAttempt(scope: PrivateMvpMissionScope, attemptId: string, budget: PrivateMvpObservedAdmissionBudget):
    Result<{ readonly ordinal: number; readonly created: boolean; readonly reservedBytes: number }, AppError>;
  /**
   * One-time durable launch claim, separate from reserveAttempt.
   * This call is only a ledger gate: caller must independently verify the reviewed
   * profile, pinned native identity, Workspace snapshot, Policy and lifecycle.
   * It creates no process, does not expose a reusable launch ticket and is
   * NEVER idempotent (including after application/database restart).
   */
  claimLaunch(scope: PrivateMvpMissionScope, attemptId: string, executionFingerprint: string):
    Result<void, AppError>;
  /** Atomically consume the EXISTING F2-A one-time launch claim and journal
   * pending OS uncertainty BEFORE a possible native creation. Not H1 authority.
   * No OS handles, PID, MAC, or caller-selected process recipes are persisted. */
  claimNativePreparation(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string, stageSealDigest: string): Result<void, AppError>;
  /** Trusted controller-reported lifecycle (never native proof by itself). */
  markNativeOwned(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string, stageSealDigest: string): Result<void, AppError>;
  markNativeTerminated(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string): Result<void, AppError>;
  markNativeCleanupUnknown(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string): Result<void, AppError>;
  /** Only terminated OS tree + stage/profile cleanup confirmed may clean.
   * Even this DOES NOT authorize worker ResumeThread or H2.
   */
  finishNativeCleanup(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string, terminated: boolean, cleaned: boolean): Result<void, AppError>;
  /** Only a one-use, exact OS-owned cleanup proof issued by the internal
   * Guardian+Runner session can make the pending-native journal CLEANED.
   * No booleans, renderer DTOs, or H0/worker receipt can create this proof. */
  confirmNativeCleanupFromOwnedOs(scope: PrivateMvpMissionScope, attemptId: string,
    ownerEpoch: string, stageSealDigest: string, osEvidence: unknown): Result<void, AppError>;
  /** Desktop startup: mark interrupted pending/owned/terminated attempts UNKNOWN,
   * transactionally audit. UNKNOWN cannot be converted to CLEAN by this code.
   */
  recoverNativeJournalAfterRestart(): Result<number, AppError>;
  /** Future trusted controller must prove termination and cleanup before calling. */
  settleAttempt(scope: PrivateMvpMissionScope, attemptId: string, terminationConfirmed: boolean, cleanupConfirmed: boolean):
    Result<void, AppError>;
  revoke(scope: PrivateMvpMissionScope): Result<void, AppError>;
  /** Refuses to free device-wide admission while an attempt is unconfirmed. */
  closeMission(scope: PrivateMvpMissionScope): Result<void, AppError>;
}

type AdmissionError = 'RUNNER_APPROVAL_STALE' | 'RUNNER_BUSY' | 'RUNNER_RESOURCE_LIMIT' | 'INTERNAL_ERROR';
function failure(code: AdmissionError): Result<never, AppError> {
  const messages = {
    RUNNER_APPROVAL_STALE: 'Private MVP Mission authority is stale or unavailable',
    RUNNER_BUSY: 'Private MVP device admission remains occupied',
    RUNNER_RESOURCE_LIMIT: 'Private MVP offline budget is exhausted or unverified',
    INTERNAL_ERROR: 'Private MVP admission could not be durably audited',
  };
  return err(appError(code, messages[code]));
}
const SHA = /^[0-9a-f]{64}$/;
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
function canonicalIso(value: string): boolean {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
function validScope(scope: PrivateMvpMissionScope): boolean {
  return !!scope && typeof scope === 'object'
    && Object.keys(scope).length === 10
    && [scope.missionId, scope.workspaceId, scope.runnerId]
      .every((value) => typeof value === 'string' && IDENTIFIER.test(value))
    // Project Runner seals Workspace generation as workspace.updatedAt.toISOString().
    // Retain legacy identifier generations for existing F2-A Mission ledgers.
    && typeof scope.workspaceGeneration === 'string'
    && (IDENTIFIER.test(scope.workspaceGeneration) || canonicalIso(scope.workspaceGeneration))
    && Number.isSafeInteger(scope.revision) && scope.revision > 0
    && [scope.goalDigest, scope.executionFingerprint, scope.inputDigest, scope.resourcePolicyIdentity]
      .every((value) => typeof value === 'string' && SHA.test(value))
    && scope.resourcePolicyIdentity === PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    && canonicalIso(scope.expiresAt);
}
function canonicalBinding(scope: PrivateMvpMissionScope): string {
  return JSON.stringify({
    capability: 'runner.mission', missionId: scope.missionId, revision: scope.revision,
    goalDigest: scope.goalDigest, workspaceId: scope.workspaceId,
    workspaceGeneration: scope.workspaceGeneration, runnerId: scope.runnerId,
    executionFingerprint: scope.executionFingerprint, inputDigest: scope.inputDigest,
    resourcePolicyIdentity: scope.resourcePolicyIdentity,
    expiresAt: scope.expiresAt, networkProfile: 'none', secretProfile: 'none',
    providerCalls: 0, providerUploadBytes: 0, spendMicrousd: 0,
  });
}
/** Exact safe binding supplied to the existing Approval Repository / Tool Kernel. */
export function privateMvpMissionBindingDigest(scope: PrivateMvpMissionScope): string {
  return createHash('sha256').update(canonicalBinding(scope)).digest('hex');
}

interface MissionRow {
  mission_id: string;
  revision: number;
  goal_digest: string;
  workspace_id: string;
  workspace_generation: string;
  runner_id: string;
  execution_fingerprint: string;
  input_digest: string;
  resource_policy_identity: string;
  profile_revision: string;
  status: 'active' | 'revoked' | 'closed';
  expires_at: string;
  attempt_count: number;
  charged_bytes: number;
}
interface AttemptRow {
  mission_id: string;
  attempt_id: string;
  ordinal: number;
  state: 'reserved' | 'settled';
  launch_claimed_at: string | null;
  reserved_bytes: number;
}
function matches(row: MissionRow | undefined, scope: PrivateMvpMissionScope): boolean {
  return !!row && row.mission_id === scope.missionId && row.revision === scope.revision
    && row.goal_digest === scope.goalDigest && row.workspace_id === scope.workspaceId
    && row.workspace_generation === scope.workspaceGeneration && row.runner_id === scope.runnerId
    && row.execution_fingerprint === scope.executionFingerprint
    && row.input_digest === scope.inputDigest
    && row.resource_policy_identity === scope.resourcePolicyIdentity
    && row.profile_revision === PRIVATE_MVP_RESOURCE_POLICY.revision
    && row.expires_at === scope.expiresAt;
}
function nonnegativeByteCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createPrivateMvpMissionAdmissionRepository(
  db: Db,
  dependencies: {
    readonly now: () => Date;
    /** Private Desktop-owned, runtime-HMAC verifier. Never exposed via Gateway. */
    readonly verifyPreH1KernelReceipt?: (receipt: PreH1KernelApprovalReceipt, scope: PrivateMvpMissionScope) => boolean;
  } = { now: () => new Date() },
): PrivateMvpMissionAdmissionRepository {
  const approvals = createApprovalRepository(db);
  const audit = createAuditEventWriter(db);
  const readMission = db.prepare('SELECT * FROM runner_missions WHERE mission_id = ?');
  const readActiveWorkspaceGeneration = db.prepare(
    'SELECT updated_at FROM workspaces WHERE id = ? AND is_active = 1',
  );
  const currentPreH1Workspace = (scope: PrivateMvpMissionScope): boolean => {
    const row = readActiveWorkspaceGeneration.get(scope.workspaceId) as {updated_at:string}|undefined;
    return !!row && canonicalIso(row.updated_at) && row.updated_at === scope.workspaceGeneration;
  };
  const anyAdmission = db.prepare("SELECT 1 FROM runner_missions WHERE status IN ('active','revoked') LIMIT 1");
  const legacyJob = db.prepare("SELECT 1 FROM runner_jobs WHERE state IN ('starting','running') LIMIT 1");
  const reservedJob = db.prepare("SELECT 1 FROM runner_mission_attempts WHERE state = 'reserved' LIMIT 1");
  const readAttempt = db.prepare('SELECT * FROM runner_mission_attempts WHERE attempt_id = ?');
  const readNative = db.prepare('SELECT * FROM runner_mission_native_attempts WHERE attempt_id = ?');
  const nativeUnresolved = db.prepare("SELECT 1 FROM runner_mission_native_attempts WHERE state != 'cleaned' LIMIT 1");
  const insertNative = db.prepare(`
    INSERT INTO runner_mission_native_attempts
      (attempt_id, mission_id, state, owner_epoch, stage_seal_digest, prepared_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?, ?)
  `);
  const updateNative = db.prepare(`
    UPDATE runner_mission_native_attempts SET state=?, updated_at=?
    WHERE attempt_id=? AND mission_id=? AND owner_epoch=? AND state=?
  `);
  const updateNativeSealed = db.prepare(`
    UPDATE runner_mission_native_attempts SET state=?, updated_at=?
    WHERE attempt_id=? AND mission_id=? AND owner_epoch=? AND stage_seal_digest=? AND state=?
  `);
  const recoveryRows = db.prepare(`
    SELECT n.attempt_id,n.mission_id,m.workspace_id,m.revision
    FROM runner_mission_native_attempts n JOIN runner_missions m ON m.mission_id=n.mission_id
    WHERE n.state IN ('pending','owned','terminated')
  `);
  const recoverNative = db.prepare(`
    UPDATE runner_mission_native_attempts SET state='cleanup_unknown', updated_at=?
    WHERE attempt_id=? AND state IN ('pending','owned','terminated')
  `);
  const totalCharge = db.prepare('SELECT COALESCE(SUM(charged_bytes),0) AS bytes FROM runner_missions');
  const insertMission = db.prepare(`
    INSERT INTO runner_missions(
      mission_id,revision,goal_digest,workspace_id,workspace_generation,runner_id,
      execution_fingerprint,input_digest,resource_policy_identity,profile_revision,
      approval_id,status,created_at,expires_at
    ) VALUES(?,?,?,?,?,?,?,?,?,? ,?,'active',?,?)
  `);
  const insertAttempt = db.prepare(`
    INSERT INTO runner_mission_attempts(attempt_id,mission_id,ordinal,state,reserved_bytes,created_at)
    VALUES(?,?,?,'reserved',?,?)
  `);
  const updateCounter = db.prepare('UPDATE runner_missions SET attempt_count=attempt_count+1, charged_bytes=charged_bytes+? WHERE mission_id=? AND status=\'active\'');
  const claim = db.prepare(`
    UPDATE runner_mission_attempts SET launch_claimed_at=?
    WHERE attempt_id=? AND mission_id=? AND state='reserved' AND launch_claimed_at IS NULL
  `);
  const settle = db.prepare("UPDATE runner_mission_attempts SET state='settled', settled_at=? WHERE attempt_id=? AND state='reserved'");
  const releaseCharge = db.prepare('UPDATE runner_missions SET charged_bytes=charged_bytes-? WHERE mission_id=? AND charged_bytes>=?');
  const revokeMission = db.prepare("UPDATE runner_missions SET status='revoked' WHERE mission_id=? AND status='active'");
  const close = db.prepare("UPDATE runner_missions SET status='closed' WHERE mission_id=? AND status IN ('active','revoked')");
  const pendingForMission = db.prepare("SELECT 1 FROM runner_mission_attempts WHERE mission_id=? AND state='reserved' LIMIT 1");

  const getMission = (id: string): MissionRow | undefined => readMission.get(id) as MissionRow | undefined;
  type NativeRow = {
    attempt_id: string; mission_id: string; state: 'pending'|'owned'|'terminated'|'cleanup_unknown'|'cleaned';
    owner_epoch: string; stage_seal_digest: string;
  };
  const nativeFor = (id: string): NativeRow | undefined => readNative.get(id) as NativeRow | undefined;
  const nativeAttemptValid = (scope: PrivateMvpMissionScope, id: string, epoch: string): boolean =>
    validScope(scope) && IDENTIFIER.test(id) && typeof epoch === 'string'
    && IDENTIFIER.test(epoch) && matches(getMission(scope.missionId),scope)
    && nativeFor(id)?.mission_id === scope.missionId;
  const auditTransition = (action: string, scope: PrivateMvpMissionScope, date: Date, code: string,
    provenance?: Readonly<Record<string,string|number|boolean>>): void => {
    audit.append({
      timestamp: date, sessionId: 'private-mvp-controller', sessionType: 'desktop',
      action, workspaceId: scope.workspaceId, policyDecision: 'allow',
      resultCode: code, durationMs: 0,
      metadata: { revision: scope.revision, profile: PRIVATE_MVP_RESOURCE_POLICY.revision,
        ...(provenance ?? {}), },
    });
  };
  const trustedNow = (): Date => {
    const date = dependencies.now();
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid trusted clock');
    return date;
  };
  const authorized = (scope: PrivateMvpMissionScope): boolean =>
    validScope(scope) && matches(getMission(scope.missionId), scope);

  return Object.freeze<PrivateMvpMissionAdmissionRepository>({
    enrollApproved(scope, runtimeInstanceId, receipt) {
      try {
        if (!validScope(scope) || typeof runtimeInstanceId !== 'string' || !IDENTIFIER.test(runtimeInstanceId)) {
          return failure('RUNNER_APPROVAL_STALE');
        }
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          const expires = new Date(scope.expiresAt).getTime();
          if (expires <= now.getTime() || expires - now.getTime() > PRIVATE_MVP_RESOURCE_POLICY.maxMissionMs) {
            return failure('RUNNER_APPROVAL_STALE');
          }
          if (getMission(scope.missionId)) return failure('RUNNER_APPROVAL_STALE');
          if (anyAdmission.get() || legacyJob.get() || reservedJob.get() || nativeUnresolved.get()) return failure('RUNNER_BUSY');
          // The fixed PRE-H1 Mission can NEVER take the historical direct
          // runner.mission grant path: only verified Kernel-HMAC receipt.
          if (scope.missionId === 'pre-h1-controller-01' && !receipt)
            return failure('RUNNER_APPROVAL_STALE');
          const digest = privateMvpMissionBindingDigest(scope);
          let approvedId: string;
          if (receipt !== undefined) {
            // Kernel already consumed the HMAC-bound request, with manual user
            // decision. Verify that opaque trusted result and the EXISTING DB
            // row; never make a second Approval, never consume it twice.
            if (scope.missionId !== 'pre-h1-controller-01'
              || !dependencies.verifyPreH1KernelReceipt?.(receipt, scope)
              || receipt.runtimeInstanceId !== runtimeInstanceId
              || receipt.missionBindingDigest !== digest
              || receipt.kernelBindingDigest === digest
              || receipt.workspaceGeneration !== scope.workspaceGeneration
              || receipt.revision !== scope.revision
              || receipt.policyIdentity !== scope.resourcePolicyIdentity
              || receipt.expiresAt !== scope.expiresAt
              || !currentPreH1Workspace(scope)) return failure('RUNNER_APPROVAL_STALE');
            const existing = approvals.findById(receipt.requestId);
            if (!existing.ok) return failure('INTERNAL_ERROR');
            const row = existing.value;
            if (!row || row.id !== receipt.requestId
              || row.runtimeInstanceId !== runtimeInstanceId
              || row.bindingDigest !== receipt.kernelBindingDigest
              || row.capability !== 'pre-h1.prepare' || row.effect !== 'execute'
              || row.sessionId !== 'pre-h1-desktop-owner' || row.sessionType !== 'desktop'
              || row.policyContext !== 'workspace' || row.workspaceId !== scope.workspaceId
              || row.status !== 'consumed' || row.decisionSource !== 'user'
              || row.expiresAt <= now.toISOString()) return failure('RUNNER_APPROVAL_STALE');
            approvedId = row.id;
          } else {
            const pending = approvals.findLatest(runtimeInstanceId, digest);
            if (!pending.ok) return failure('INTERNAL_ERROR');
            const row = pending.value;
            if (!row || row.status !== 'approved' || row.decisionSource !== 'user'
              || row.capability !== 'runner.mission' || row.effect !== 'execute'
              || row.policyContext !== 'workspace' || row.workspaceId !== scope.workspaceId) {
              return failure('RUNNER_APPROVAL_STALE');
            }
            const consumed = approvals.consumeApproved(runtimeInstanceId, digest, now.toISOString());
            if (!consumed.ok) return failure('INTERNAL_ERROR');
            if (!consumed.value || consumed.value.id !== row.id || consumed.value.decisionSource !== 'user') {
              return failure('RUNNER_APPROVAL_STALE');
            }
            approvedId = row.id;
          }
          insertMission.run(
            scope.missionId, scope.revision, scope.goalDigest, scope.workspaceId, scope.workspaceGeneration,
            scope.runnerId, scope.executionFingerprint, scope.inputDigest, scope.resourcePolicyIdentity,
            PRIVATE_MVP_RESOURCE_POLICY.revision, approvedId, now.toISOString(), scope.expiresAt,
          );
          auditTransition('runner.mission.enroll', scope, now, 'ADMITTED',
            receipt ? {
              approvalOrigin:'trusted-pre-h1-kernel-manual-receipt-v1',
              approvalRequestId:approvedId,
              approvalRuntimeId:runtimeInstanceId,
              missionBindingDigest:digest,
              // Persist only a SHA-256 commitment to the runtime-HMAC tag.
              // Neither its key nor its raw HMAC enters audit metadata.
              kernelHmacCommitment:createHash('sha256')
                .update(receipt.kernelBindingDigest).digest('hex'),
              fixedAttemptId:'pre-h1-controller-01-attempt-01',
              manualOwnerVerified:true,
            } : undefined);
          return ok(undefined);
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },

    reserveAttempt(scope, attemptId, budget) {
      try {
        if (!validScope(scope) || typeof attemptId !== 'string' || !IDENTIFIER.test(attemptId)) {
          return failure('RUNNER_APPROVAL_STALE');
        }
        return db.transaction((): Result<{ ordinal: number; created: boolean; reservedBytes: number }, AppError> => {
          const now = trustedNow();
          const row = getMission(scope.missionId);
          if (!matches(row, scope) || row?.status !== 'active' || now.toISOString() >= scope.expiresAt
            || (scope.missionId === 'pre-h1-controller-01' && !currentPreH1Workspace(scope))) {
            return failure('RUNNER_APPROVAL_STALE');
          }
          const existing = readAttempt.get(attemptId) as AttemptRow | undefined;
          if (existing) {
            // The same attemptId is idempotent only while its original reservation is live.
            // Settled/terminal rows are durable history, never launch or reservation authority.
            if (existing.mission_id !== scope.missionId || existing.state !== 'reserved' || existing.launch_claimed_at !== null) {
              return failure('RUNNER_APPROVAL_STALE');
            }
            return ok({ ordinal: existing.ordinal, created: false, reservedBytes: existing.reserved_bytes });
          }
          if (reservedJob.get() || legacyJob.get() || nativeUnresolved.get()) return failure('RUNNER_BUSY');
          if (!budget || !nonnegativeByteCount(budget.observedFreeBytes)
            || !nonnegativeByteCount(budget.observedOwnedBytes)) return failure('RUNNER_RESOURCE_LIMIT');
          const charge = (totalCharge.get() as { bytes: number }).bytes;
          const reservation = PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes;
          if (!Number.isSafeInteger(charge) || charge < 0
            || budget.observedOwnedBytes > charge
            || budget.observedFreeBytes - reservation < PRIVATE_MVP_RESOURCE_POLICY.minFreeSpaceBytes
            || charge + reservation > PRIVATE_MVP_RESOURCE_POLICY.maxRetainedFootprintBytes
            || (row?.attempt_count ?? 3) >= PRIVATE_MVP_RESOURCE_POLICY.maxAttempts) {
            return failure('RUNNER_RESOURCE_LIMIT');
          }
          const ordinal = (row?.attempt_count ?? 0) + 1;
          insertAttempt.run(attemptId, scope.missionId, ordinal, reservation, now.toISOString());
          if (updateCounter.run(reservation, scope.missionId).changes !== 1) throw new Error('Mission changed');
          auditTransition('runner.mission.reserve', scope, now, 'RESERVED');
          return ok({ ordinal, created: true, reservedBytes: reservation });
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },

    claimLaunch(scope, attemptId, executionFingerprint) {
      try {
        if (!validScope(scope) || typeof attemptId !== 'string' || !IDENTIFIER.test(attemptId)
          || executionFingerprint !== scope.executionFingerprint) {
          return failure('RUNNER_APPROVAL_STALE');
        }
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          const mission = getMission(scope.missionId);
          if (!matches(mission, scope) || mission?.status !== 'active'
            || now.toISOString() >= scope.expiresAt || legacyJob.get() || nativeUnresolved.get()) {
            return failure('RUNNER_APPROVAL_STALE');
          }
          const attempt = readAttempt.get(attemptId) as AttemptRow | undefined;
          if (!attempt || attempt.mission_id !== scope.missionId
            || attempt.state !== 'reserved' || attempt.launch_claimed_at !== null) {
            return failure('RUNNER_APPROVAL_STALE');
          }
          if (claim.run(now.toISOString(), attemptId, scope.missionId).changes !== 1) {
            return failure('RUNNER_APPROVAL_STALE');
          }
          // A failed audit must atomically roll back the one-time claim.
          auditTransition('runner.mission.launch_claim', scope, now, 'CLAIMED');
          return ok(undefined);
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },

    claimNativePreparation(scope, attemptId, ownerEpoch, stageSealDigest) {
      try {
        if (!validScope(scope) || typeof attemptId !== 'string' || !IDENTIFIER.test(attemptId)
          || typeof ownerEpoch !== 'string' || !IDENTIFIER.test(ownerEpoch)
          || typeof stageSealDigest !== 'string' || !SHA.test(stageSealDigest)) {
          return failure('RUNNER_APPROVAL_STALE');
        }
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          const mission = getMission(scope.missionId);
          const attempt = readAttempt.get(attemptId) as AttemptRow | undefined;
          if (!matches(mission, scope) || mission?.status !== 'active'
            || now.toISOString() >= scope.expiresAt || legacyJob.get() || nativeUnresolved.get()
            || !attempt || attempt.mission_id !== scope.missionId
            || attempt.state !== 'reserved' || attempt.launch_claimed_at !== null
            || nativeFor(attemptId)) return failure('RUNNER_APPROVAL_STALE');
          // COMMIT journal and consumed one-shot claim together, BEFORE ANY OS
          // mutation. A failed audit rolls BOTH back in the SQLite transaction.
          if (claim.run(now.toISOString(), attemptId, scope.missionId).changes !== 1)
            throw Error('F2_H1_CLAIM_CONFLICT');
          insertNative.run(attemptId, scope.missionId, ownerEpoch, stageSealDigest,
            now.toISOString(), now.toISOString());
          auditTransition('runner.mission.native_pending', scope, now, 'PENDING_OS_UNKNOWN');
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    markNativeOwned(scope, attemptId, ownerEpoch, stageSealDigest) {
      try {
        if (!nativeAttemptValid(scope,attemptId,ownerEpoch)
          || typeof stageSealDigest !== 'string' || !SHA.test(stageSealDigest))
          return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          if (updateNativeSealed.run('owned',now.toISOString(),attemptId,scope.missionId,
            ownerEpoch,stageSealDigest,'pending').changes !== 1)
            return failure('RUNNER_APPROVAL_STALE');
          // OS ownership evidence must be established outside SQLite; this
          // writes a JOURNAL CLAIM only, never nativeAuthorization=true.
          auditTransition('runner.mission.native_owned',scope,now,'OWNED_PENDING_PROOF');
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    markNativeTerminated(scope,attemptId,ownerEpoch) {
      try {
        if (!nativeAttemptValid(scope,attemptId,ownerEpoch)) return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          if (updateNative.run('terminated',now.toISOString(),attemptId,scope.missionId,
            ownerEpoch,'owned').changes !== 1) return failure('RUNNER_APPROVAL_STALE');
          auditTransition('runner.mission.native_terminated',scope,now,'TERMINATION_REPORTED');
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    markNativeCleanupUnknown(scope,attemptId,ownerEpoch) {
      try {
        if (!nativeAttemptValid(scope,attemptId,ownerEpoch)) return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const row=nativeFor(attemptId);
          if (!row || row.owner_epoch !== ownerEpoch || row.state === 'cleaned')
            return failure('RUNNER_APPROVAL_STALE');
          if (row.state === 'cleanup_unknown') return ok(undefined); // no new grant
          const now = trustedNow();
          if (updateNative.run('cleanup_unknown',now.toISOString(),attemptId,
            scope.missionId,ownerEpoch,row.state).changes !== 1)
            throw Error('F2_H1_NATIVE_STATE_CHANGED');
          auditTransition('runner.mission.native_cleanup_unknown',scope,now,'QUARANTINED');
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    finishNativeCleanup(scope,attemptId,ownerEpoch,terminated,cleaned) {
      try {
        if (!F2_H1_NATIVE_CLEANUP_PROOF_AVAILABLE
          || terminated !== true || cleaned !== true
          || !nativeAttemptValid(scope,attemptId,ownerEpoch))
          return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const now = trustedNow();
          // An UNKNOWN cannot become CLEAN because the owner provided two
          // booleans. A separately approved OS reconciliation is mandatory.
          if (updateNative.run('cleaned',now.toISOString(),attemptId,scope.missionId,
            ownerEpoch,'terminated').changes !== 1) return failure('RUNNER_BUSY');
          auditTransition('runner.mission.native_cleaned',scope,now,'CLEANUP_REPORTED');
          // Never release charged bytes here. F2-A settleAttempt remains the
          // ONLY accounting path, after independent cleanup proof.
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    confirmNativeCleanupFromOwnedOs(scope,attemptId,ownerEpoch,stageSealDigest,osEvidence) {
      try {
        if (!nativeAttemptValid(scope,attemptId,ownerEpoch)
          || typeof stageSealDigest !== 'string' || !SHA.test(stageSealDigest)
          || !consumeF2H1VerifiedCleanupEvidence(osEvidence,scope.missionId,
            attemptId,ownerEpoch,stageSealDigest)) return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const row=nativeFor(attemptId);
          if (!row || row.state !== 'terminated'
            || row.stage_seal_digest !== stageSealDigest) return failure('RUNNER_BUSY');
          const now=trustedNow();
          if (updateNativeSealed.run('cleaned',now.toISOString(),attemptId,
            scope.missionId,ownerEpoch,stageSealDigest,'terminated').changes !== 1)
            throw Error('F2_H1_NATIVE_CLEAN_CONFLICT');
          auditTransition('runner.mission.native_cleaned',scope,now,'OS_EXIT_ZERO_MEMBER_CLOSE_PROVEN');
          // Charge is only released by existing settleAttempt after journal CLEANED.
          return ok(undefined);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },
    recoverNativeJournalAfterRestart() {
      try {
        return db.transaction((): Result<number, AppError> => {
          const rows = recoveryRows.all() as Array<{
            attempt_id:string;mission_id:string;workspace_id:string;revision:number;
          }>;
          const now = trustedNow();
          for (const row of rows) {
            if (recoverNative.run(now.toISOString(),row.attempt_id).changes !== 1)
              throw Error('F2_H1_RECOVERY_RACE');
            audit.append({
              timestamp:now,sessionId:'private-mvp-controller',sessionType:'desktop',
              action:'runner.mission.native_recover',workspaceId:row.workspace_id,
              policyDecision:'deny',resultCode:'CLEANUP_UNKNOWN',
              durationMs:0,metadata:{revision:row.revision,
                profile:PRIVATE_MVP_RESOURCE_POLICY.revision},
            });
          }
          // An abrupt host crash, helper exit or missing exact process HANDLE
          // is NEVER treated as proof of an empty native Job tree.
          return ok(rows.length);
        }).immediate();
      } catch { return failure('INTERNAL_ERROR'); }
    },

    settleAttempt(scope, attemptId, terminationConfirmed, cleanupConfirmed) {
      try {
        if (!validScope(scope) || typeof attemptId !== 'string' || !IDENTIFIER.test(attemptId)
          || terminationConfirmed !== true || typeof cleanupConfirmed !== 'boolean') {
          return failure('RUNNER_APPROVAL_STALE');
        }
        return db.transaction((): Result<void, AppError> => {
          if (!authorized(scope)) return failure('RUNNER_APPROVAL_STALE');
          const attempt = readAttempt.get(attemptId) as AttemptRow | undefined;
          if (!attempt || attempt.mission_id !== scope.missionId) return failure('RUNNER_APPROVAL_STALE');
          if (attempt.state === 'settled') return ok(undefined);
          const native = nativeFor(attemptId);
          // F2-A callers cannot bypass an unresolved H1 OS fence by supplying
          // Boolean cleanup assertions. This also blocks settled-without-clean.
          if (native && native.state !== 'cleaned') return failure('RUNNER_BUSY');
          // A claimed launch without confirmed native cleanup is never an
          // unused reservation and must retain its charge. Check WITHIN the
          // existing settle transaction, not only the Desktop preflight.
          if (cleanupConfirmed && attempt.launch_claimed_at !== null && !native)
            return failure('RUNNER_BUSY');
          const now = trustedNow();
          if (settle.run(now.toISOString(), attemptId).changes !== 1) throw new Error('Attempt changed');
          if (cleanupConfirmed && releaseCharge.run(attempt.reserved_bytes, scope.missionId, attempt.reserved_bytes).changes !== 1) {
            throw new Error('Charge missing');
          }
          auditTransition('runner.mission.settle', scope, now, 'SETTLED');
          return ok(undefined);
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },

    revoke(scope) {
      try {
        if (!validScope(scope)) return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const row = getMission(scope.missionId);
          if (!matches(row, scope) || row?.status === 'closed') return failure('RUNNER_APPROVAL_STALE');
          if (row?.status === 'revoked') return ok(undefined);
          if (revokeMission.run(scope.missionId).changes !== 1) throw new Error('Mission changed');
          auditTransition('runner.mission.revoke', scope, trustedNow(), 'REVOKED');
          return ok(undefined);
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },

    closeMission(scope) {
      try {
        if (!validScope(scope)) return failure('RUNNER_APPROVAL_STALE');
        return db.transaction((): Result<void, AppError> => {
          const row = getMission(scope.missionId);
          if (!matches(row, scope)) return failure('RUNNER_APPROVAL_STALE');
          if (row?.status === 'closed') return ok(undefined);
          if (pendingForMission.get(scope.missionId)) return failure('RUNNER_BUSY');
          if (close.run(scope.missionId).changes !== 1) throw new Error('Mission changed');
          auditTransition('runner.mission.close', scope, trustedNow(), 'CLOSED');
          return ok(undefined);
        }).immediate();
      } catch {
        return failure('INTERNAL_ERROR');
      }
    },
  });
}
