import path from 'node:path';
import {
  appError, err, ok,
  type AppError, type ProjectRunnerStartResult, type Result,
} from '@sud-d/domain';
import type { ProjectRunnerApprovedSnapshot } from './runner-snapshot.js';
import type { ProjectRunnerJobRepository } from './project-runner-job-repository.js';
import { F2H0_FIXED_IDENTITY } from './private-mvp-h0-one-shot-gateway.js';
import {
  PRIVATE_MVP_RESOURCE_POLICY,
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  type PrivateMvpMissionAdmissionRepository,
  type PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';

/**
 * F2-B1 CODE-ONLY contract. No production AppContainer/Job binding or
 * Desktop/Gateway watchdog exists yet. Do NOT register this adapter.
 * A legacy ProjectRunnerApprovedSnapshot is deliberately never promoted.
 */
const SHA = /^[a-f0-9]{64}$/;
export const PRIVATE_MVP_FIXED_WINDOWS_JOB = Object.freeze({
  appContainer: true,
  appContainerCapabilities: 0,
  networkProfile: 'none',
  secretProfile: 'none',
  suspendedUntilVerified: true,
  activeProcessLimit: PRIVATE_MVP_RESOURCE_POLICY.activeProcessLimit,
  jobCommittedMemoryBytes: PRIVATE_MVP_RESOURCE_POLICY.jobMemoryBytes,
  jobUserTimeMs: PRIVATE_MVP_RESOURCE_POLICY.jobUserTimeMs,
  killOnJobClose: true,
  breakawayAllowed: false,
  inheritedHandles: Object.freeze(['stdin', 'stdout', 'stderr'] as const),
});

export interface PrivateMvpPinnedNode {
  readonly path: string;
  readonly sha256: string;
}

/** Trusted F2-B2 staged enrollment output, not caller input or an approval DTO.
 * F2-B1 cannot produce this: profile-specific snapshot sealing is still missing.
 */
export interface PrivateMvpReviewedStage {
  readonly mission: PrivateMvpMissionScope;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly runnerId: string;
  readonly executionFingerprint: string;
  readonly inputDigest: string;
  readonly policyIdentity: string;
  readonly runtimePath: string;
  readonly runtimeSha256: string;
  readonly stageRoot: string;
  readonly entryPath: string;
  readonly inputPath: string;
  readonly scratchRoot: string;
  readonly outputRoot: string;
}

export interface PrivateMvpFixedNativePlan {
  readonly executablePath: string;
  readonly executableSha256: string;
  readonly stageRoot: string;
  readonly entryPath: string;
  readonly inputPath: string;
  readonly scratchRoot: string;
  readonly outputRoot: string;
  readonly profileRevision: 'private-mvp-reviewed-v1';
  readonly limits: typeof PRIVATE_MVP_FIXED_WINDOWS_JOB;
}

/** H0/H1 reviewed typed evidence, NEVER worker/renderer DTO authority.
 * Native receipts must be produced by pinned OS creator + Gateway handle
 * owner and accepted from exact H2 calibration/negative tests. A fake
 * value is valid ONLY inside static/mock tests. */
export interface PrivateMvpReviewedHandleIsolationEvidence {
  readonly contract: 'reviewed-allowlist-native-negative-tests-v1';
  readonly launcherSha256: string;
  readonly runtimeSha256: string;
  readonly recipeFingerprint: string;
  readonly stageFingerprint: string;
  readonly missionId: string;
  readonly missionRevision: number;
  readonly attemptId: string;
  readonly ownerEpoch: string;
  readonly gatewayOwnsTransferredHandles: true;
  readonly oneShotHostExited: true;
  readonly negativeNativeReceiptsAccepted: true;
  readonly exhaustiveHandleTableProof: false;
}

export interface PrivateMvpNativeInspection {
  readonly suspended: boolean;
  readonly exactAppContainerSid: boolean;
  readonly zeroCapabilities: boolean;
  readonly jobMember: boolean;
  readonly exactJobLimits: boolean;
  /** Absent until separately authorized H1/H2 OS/negative proof. */
  readonly handleIsolation: PrivateMvpReviewedHandleIsolationEvidence | null;
  readonly noBreakaway: boolean;
  readonly controllerOwnsNonInheritedJobHandle: boolean;
}

export interface PrivateMvpSuspendedWorker {
  /** Opaque controller-owned handles; no token/Job facts from worker output. */
  /** Native bridge must not resume until the caller has checked all attestations. */
  resume(): Promise<boolean>;
  /** Confirm full process tree termination, not a PID-only signal. */
  terminateAndConfirm(): Promise<boolean>;
  /** Never allow worker to inherit the controlling Job handle. */
  closeOwnedHandles(): Promise<boolean>;
}

/** Fixed Win32 adapter only; no general-purpose command process port. */
export interface PrivateMvpNativeBinding {
  readonly nativeContract: 'fixed-appcontainer-job-v1';
  verifyPinnedNode(node: PrivateMvpPinnedNode): Promise<boolean>;
  prepareSuspended(plan: PrivateMvpFixedNativePlan): Promise<PrivateMvpSuspendedWorker>;
  /** Trusted Win32 handle queries: OpenProcessToken/GetTokenInformation,
   * IsProcessInJob, QueryInformationJobObject and handle policy. NEVER read
   * these facts from child stdout, progress frames or worker IPC. */
  inspectSuspended(worker: PrivateMvpSuspendedWorker, plan: PrivateMvpFixedNativePlan): Promise<PrivateMvpNativeInspection>;
}

/** Actual Desktop/Gateway dual-peer lifetime proof is F2-B2 work. */
export interface PrivateMvpRuntimeWatchdog {
  readonly contract: 'owned-gateway-job-watchdog-v1';
  available(): boolean;
  armBeforeResume(worker: PrivateMvpSuspendedWorker, deadlineIso: string): Promise<boolean>;
}

export interface PrivateMvpAppContainerJobRuntime {
  /** Existing ProjectRunnerRuntimePort: legacy snapshots are NEVER executable by this candidate. */
  start(snapshot: ProjectRunnerApprovedSnapshot): Promise<Result<ProjectRunnerStartResult, AppError>>;
  /**
   * INTERNAL CODE-ONLY seam. Only a future trusted profile-specific
   * reviewer may provide PrivateMvpReviewedStage, after Kernel/Policy/Approval.
   * No production caller or real native implementation is registered.
   */
  startReviewed(stage: PrivateMvpReviewedStage): Promise<Result<ProjectRunnerStartResult, AppError>>;
}

function fail(code: 'RUNNER_APPROVAL_STALE' | 'RUNNER_RUNTIME_UNAVAILABLE' | 'RUNNER_CLEANUP_UNCONFIRMED'): Result<never, AppError> {
  return err(appError(code, {
    RUNNER_APPROVAL_STALE: 'Private MVP reviewed runner identity is stale',
    RUNNER_RUNTIME_UNAVAILABLE: 'Fixed AppContainer/Job runtime is unavailable',
    RUNNER_CLEANUP_UNCONFIRMED: 'Fixed AppContainer/Job cleanup is unconfirmed',
  }[code]));
}

function driveAbsolute(file: unknown): file is string {
  return typeof file === 'string' && /^[A-Za-z]:\\/.test(file)
    && path.win32.normalize(file) === file
    && !file.split('\\').includes('..')
    && !file.includes('\0');
}

function inside(root: string, child: string): boolean {
  if (!driveAbsolute(root) || !driveAbsolute(child)) return false;
  const rel = path.win32.relative(root, child);
  return rel.length > 0 && rel !== '..' && !rel.startsWith('..\\')
    && !path.win32.isAbsolute(rel);
}

function stageMatches(stage: PrivateMvpReviewedStage, pinned: PrivateMvpPinnedNode): boolean {
  const mission = stage?.mission;
  return !!mission
    && typeof stage.attemptId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(stage.attemptId)
    && mission.workspaceId === stage.workspaceId
    && mission.workspaceGeneration === stage.workspaceGeneration
    && mission.runnerId === stage.runnerId
    && mission.executionFingerprint === stage.executionFingerprint
    && mission.inputDigest === stage.inputDigest
    && mission.resourcePolicyIdentity === PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    && stage.policyIdentity === PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    && stage.runtimePath === pinned.path && stage.runtimeSha256 === pinned.sha256
    && SHA.test(stage.runtimeSha256)
    && inside(stage.stageRoot, stage.entryPath)
    && inside(stage.stageRoot, stage.inputPath)
    && inside(stage.stageRoot, stage.scratchRoot)
    && inside(stage.stageRoot, stage.outputRoot)
    && new Set([stage.entryPath.toLowerCase(), stage.inputPath.toLowerCase(), stage.scratchRoot.toLowerCase(), stage.outputRoot.toLowerCase()]).size === 4;
}

function verified(inspect: PrivateMvpNativeInspection, stage: PrivateMvpReviewedStage, epoch: string): boolean {
  return !!inspect && inspect.suspended === true && inspect.exactAppContainerSid === true
    && inspect.zeroCapabilities === true && inspect.jobMember === true
    && inspect.exactJobLimits === true
    && inspect.noBreakaway === true && inspect.controllerOwnsNonInheritedJobHandle === true
    && inspect.handleIsolation?.contract === 'reviewed-allowlist-native-negative-tests-v1'
    && SHA.test(inspect.handleIsolation.launcherSha256)
    && inspect.handleIsolation.runtimeSha256 === stage.runtimeSha256
    && inspect.handleIsolation.recipeFingerprint === F2H0_FIXED_IDENTITY.recipeFingerprint
    && inspect.handleIsolation.stageFingerprint === stage.executionFingerprint
    && inspect.handleIsolation.ownerEpoch === epoch
    && inspect.handleIsolation.missionId === stage.mission.missionId
    && inspect.handleIsolation.missionRevision === stage.mission.revision
    && inspect.handleIsolation.attemptId === stage.attemptId
    && inspect.handleIsolation.gatewayOwnsTransferredHandles === true
    && inspect.handleIsolation.oneShotHostExited === true
    && inspect.handleIsolation.negativeNativeReceiptsAccepted === true
    && inspect.handleIsolation.exhaustiveHandleTableProof === false;
}

/**
 * This adapter can only reach prepare/resume through explicit injected,
 * fixed-purpose native and independent lifecycle ports. Neither has a
 * production implementation in F2-B1. Do not infer native proof from mocks.
 */
export function createPrivateMvpAppContainerJobRuntime(
  deps: {
    readonly missionAdmission: PrivateMvpMissionAdmissionRepository;
    readonly jobs: ProjectRunnerJobRepository;
    readonly ownerRuntimeEpoch: string;
    readonly pinnedNode: PrivateMvpPinnedNode;
    readonly native: PrivateMvpNativeBinding;
    readonly watchdog: PrivateMvpRuntimeWatchdog;
  },
): PrivateMvpAppContainerJobRuntime {
  let occupied = false;
  return Object.freeze({
    async start(_snapshot: ProjectRunnerApprovedSnapshot) {
      // Snapshot is sealed with historical p0c-offline-v1. Never reinterpret it.
      return fail('RUNNER_RUNTIME_UNAVAILABLE');
    },
    async startReviewed(stage: PrivateMvpReviewedStage) {
      if (occupied) return fail('RUNNER_RUNTIME_UNAVAILABLE');
      occupied = true;
      let child: PrivateMvpSuspendedWorker | undefined;
      let jobId: string | undefined;
      try {
        const node = deps.pinnedNode;
        if (!node || !driveAbsolute(node.path)
          || path.win32.basename(node.path).toLowerCase() !== 'node.exe'
          || !SHA.test(node.sha256) || !stageMatches(stage, node)) {
          return fail('RUNNER_APPROVAL_STALE');
        }
        if (deps.native?.nativeContract !== 'fixed-appcontainer-job-v1'
          || deps.watchdog?.contract !== 'owned-gateway-job-watchdog-v1'
          || deps.watchdog.available() !== true) return fail('RUNNER_RUNTIME_UNAVAILABLE');
        // These are trusted F2-B2 seams; no shell/PATH/fallback operation exists.
        if (await deps.native.verifyPinnedNode(node) !== true) return fail('RUNNER_APPROVAL_STALE');
        // A reservation (including created=false) is NOT a launch authorization.
        const claim = deps.missionAdmission.claimLaunch(stage.mission, stage.attemptId, stage.executionFingerprint);
        if (!claim.ok) return claim;
        // Persist a real Job identity before any native worker exists. An
        // idempotent existing job must never re-launch; claimLaunch is one-shot.
        const job = deps.jobs.admit({
          attemptId: stage.attemptId,
          workspaceId: stage.workspaceId,
          runnerId: stage.runnerId,
          executionFingerprint: stage.executionFingerprint,
          ownerRuntimeEpoch: deps.ownerRuntimeEpoch,
          createdAt: new Date().toISOString(),
        });
        if (!job.ok) return job;
        if (!job.value.created) return fail('RUNNER_APPROVAL_STALE');
        jobId = job.value.job.jobId;
        const plan: PrivateMvpFixedNativePlan = Object.freeze({
          executablePath: node.path,
          executableSha256: node.sha256,
          stageRoot: stage.stageRoot,
          entryPath: stage.entryPath,
          inputPath: stage.inputPath,
          scratchRoot: stage.scratchRoot,
          outputRoot: stage.outputRoot,
          profileRevision: 'private-mvp-reviewed-v1',
          limits: PRIVATE_MVP_FIXED_WINDOWS_JOB,
        });
        child = await deps.native.prepareSuspended(plan);
        // Only a trusted native adapter inspecting real OS handles may attest
        // AppContainer SID/token, Job membership/limits and handle provenance.
        // Child-supplied booleans are never inspection evidence.
        if (!verified(await deps.native.inspectSuspended(child, plan), stage, deps.ownerRuntimeEpoch)) {
          throw Error('Required native identity or Job state unknown');
        }
        if (await deps.watchdog.armBeforeResume(child, stage.mission.expiresAt) !== true) {
          throw Error('Independent owned-runtime watchdog not armed');
        }
        if (await child.resume() !== true) throw Error('Native resume failed');
        // A worker can exist while persistence fails; terminate it before
        // reporting failure. No success is inferred from a mock resume.
        const running = deps.jobs.markRunning(jobId, new Date().toISOString());
        if (!running.ok) throw Error('Job running transition failed');
        return ok({
          jobId, attemptId: stage.attemptId, runnerId: stage.runnerId,
          state: running.value.state, executionFingerprint: stage.executionFingerprint,
        });
      } catch (error) {
        // The native bridge may lose proof of a partially created suspended
        // process before it can return a worker handle. Keep the durable
        // claim fenced and surface unconfirmed cleanup rather than a generic
        // unavailable error; never retry without independent reconciliation.
        if (error instanceof Error && error.name === 'F2B2NativeCleanupUnconfirmed') {
          return fail('RUNNER_CLEANUP_UNCONFIRMED');
        }
        if (child) {
          try {
            const stopped = await child.terminateAndConfirm();
            const closed = await child.closeOwnedHandles();
            if (stopped !== true || closed !== true) return fail('RUNNER_CLEANUP_UNCONFIRMED');
            if (jobId) {
              // Native tree is confirmed terminal; keep F2-A storage charge
              // and launch claim until a future trusted owner verifies cleanup.
              const finish = deps.jobs.finish(jobId, {
                state: 'failed', endedAt: new Date().toISOString(),
                terminalCode: 'NATIVE_PREPARE_OR_RESUME_FAILED',
              });
              if (!finish.ok) return fail('RUNNER_CLEANUP_UNCONFIRMED');
            }
          } catch {
            return fail('RUNNER_CLEANUP_UNCONFIRMED');
          }
        }
        // If suspended creation threw after the durable claim, no native-owned
        // child may be assumed absent. Keep the attempt reserved/quarantined.
        return fail('RUNNER_RUNTIME_UNAVAILABLE');
      } finally {
        // An admitted worker must remain fenced by durable reservation/claim,
        // not by this JS in-memory lock. Releasing local reentrancy does NOT
        // free the device-wide attempt or grant another launch.
        occupied = false;

      }
    },
  });
}
