import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRunnerApprovedSnapshot } from '@sud-d/infrastructure';
import {
  createApprovalRepository, createPrivateMvpMissionAdmissionRepository,
  createPrivateMvpAppContainerJobRuntime, createProjectRunnerJobRepository,
  openDatabase, PRIVATE_MVP_FIXED_WINDOWS_JOB,
  PRIVATE_MVP_RESOURCE_POLICY, PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  privateMvpMissionBindingDigest, F2H0_FIXED_IDENTITY,
  type PrivateMvpMissionScope, type PrivateMvpNativeInspection,
  type PrivateMvpFixedNativePlan,
  type PrivateMvpReviewedStage,
} from '@sud-d/infrastructure';

const folders: string[] = [];
const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  for (const dir of folders.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const date = new Date('2026-10-08T08:00:00.000Z');
const sha = (c: string) => c.repeat(64);
const pinned = { path: 'C:\\Program Files\\nodejs\\node.exe', sha256: sha('d') };
const scope: PrivateMvpMissionScope = {
  missionId: 'mission-a', revision: 1,
  goalDigest: sha('a'), workspaceId: 'workspace-a', workspaceGeneration: 'gen-a',
  runnerId: 'report', executionFingerprint: sha('b'), inputDigest: sha('c'),
  resourcePolicyIdentity: PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  expiresAt: '2026-10-08T08:25:00.000Z',
};
const reviewed = (): PrivateMvpReviewedStage => ({
  mission: scope, attemptId: 'attempt-1', workspaceId: scope.workspaceId,
  workspaceGeneration: scope.workspaceGeneration, runnerId: scope.runnerId,
  executionFingerprint: scope.executionFingerprint, inputDigest: scope.inputDigest,
  policyIdentity: PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  runtimePath: pinned.path, runtimeSha256: pinned.sha256,
  stageRoot: 'C:\\reviewed-stage', entryPath: 'C:\\reviewed-stage\\report.mjs',
  inputPath: 'C:\\reviewed-stage\\input.json',
  scratchRoot: 'C:\\reviewed-stage\\scratch',
  outputRoot: 'C:\\reviewed-stage\\output',
});
const inspection: PrivateMvpNativeInspection = {
  suspended: true, exactAppContainerSid: true, zeroCapabilities: true,
  jobMember: true, exactJobLimits: true,
  // This deliberately synthetic code-only port does not constitute H1/H2 proof.
  handleIsolation: {
    contract:'reviewed-allowlist-native-negative-tests-v1',
    launcherSha256: sha('e'), runtimeSha256: pinned.sha256,
    recipeFingerprint: F2H0_FIXED_IDENTITY.recipeFingerprint,
    stageFingerprint: scope.executionFingerprint,
    missionId: scope.missionId, missionRevision: scope.revision,
    attemptId: 'attempt-1', ownerEpoch: 'runtime-epoch-a',
    gatewayOwnsTransferredHandles:true, oneShotHostExited:true,
    negativeNativeReceiptsAccepted:true, exhaustiveHandleTableProof:false,
  },
  noBreakaway: true, controllerOwnsNonInheritedJobHandle: true,
};
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-f2b1-'));
  folders.push(dir);
  const db = openDatabase(path.join(dir, 'state.sqlite'));
  databases.push(db);
  const missionAdmission = createPrivateMvpMissionAdmissionRepository(db, { now: () => date });
  const jobs = createProjectRunnerJobRepository(db);
  const approvals = createApprovalRepository(db);
  const approval = approvals.createPending({
    runtimeInstanceId: 'fixed-owner',
    bindingDigest: privateMvpMissionBindingDigest(scope),
    sessionId: 'desktop-owner', sessionType: 'desktop',
    capability: 'runner.mission', effect: 'execute', sensitivity: 'normal',
    policyContext: 'workspace', workspaceId: scope.workspaceId,
    title: 'Review exact offline mission',
    createdAt: date.toISOString(), expiresAt: '2026-10-08T08:01:00.000Z',
  });
  if (!approval.ok) throw new Error('Test approval unavailable');
  expect(approvals.respond(approval.value.id, 'approve', date.toISOString()).ok).toBe(true);
  expect(missionAdmission.enrollApproved(scope, 'fixed-owner').ok).toBe(true);
  expect(missionAdmission.reserveAttempt(scope, 'attempt-1', {
    observedFreeBytes: 3 * 1024 ** 3, observedOwnedBytes: 0,
  }).ok).toBe(true);

  const worker = {
    inspect: vi.fn(async () => inspection),
    resume: vi.fn(async () => true),
    terminateAndConfirm: vi.fn(async () => true),
    closeOwnedHandles: vi.fn(async () => true),
  };
  const native = {
    nativeContract: 'fixed-appcontainer-job-v1' as const,
    verifyPinnedNode: vi.fn(async () => true),
    prepareSuspended: vi.fn(async (_plan: PrivateMvpFixedNativePlan) => worker),
    inspectSuspended: vi.fn(async (_worker: typeof worker, _plan: PrivateMvpFixedNativePlan) => inspection),
  };
  const watchdog = {
    contract: 'owned-gateway-job-watchdog-v1' as const,
    available: vi.fn(() => true),
    armBeforeResume: vi.fn(async () => true),
  };
  const runtime = () => createPrivateMvpAppContainerJobRuntime({
    missionAdmission, jobs, ownerRuntimeEpoch: 'runtime-epoch-a',
    pinnedNode: pinned, native, watchdog,
  });
  return { db, missionAdmission, jobs, native, watchdog, worker, runtime };
}

describe('F2-B1 code-only fixed AppContainer + Job candidate (mock ports, no child launch)', () => {
  it('never promotes a p0c-offline-v1 snapshot via the existing runtime port', async () => {
    const f = setup();
    const runner = f.runtime();
    const outcome = await runner.start({ resourcePolicy: { revision: 'p0c-offline-v1' } } as ProjectRunnerApprovedSnapshot);
    expect(outcome).toMatchObject({ ok: false, error: { code: 'RUNNER_RUNTIME_UNAVAILABLE' } });
    expect(f.native.prepareSuspended).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toMatchObject({ launch_claimed_at: null });
  });

  it('pins native executable and exact zero-network AppContainer/Job config, claims once and records real Job', async () => {
    const f = setup();
    const outcome = await f.runtime().startReviewed(reviewed());
    expect(outcome).toMatchObject({
      ok: true, value: { attemptId: 'attempt-1', state: 'running', runnerId: 'report' },
    });
    expect(f.native.verifyPinnedNode).toHaveBeenCalledWith(pinned);
    expect(f.native.prepareSuspended).toHaveBeenCalledOnce();
    const invocation = f.native.prepareSuspended.mock.calls[0];
    if (!invocation) throw new Error('Mock native plan missing');
    const plan = invocation[0];
    expect(plan).toMatchObject({
      executablePath: pinned.path, executableSha256: sha('d'), profileRevision: 'private-mvp-reviewed-v1',
      limits: {
        appContainer: true, appContainerCapabilities: 0, networkProfile: 'none', secretProfile: 'none',
        suspendedUntilVerified: true, activeProcessLimit: 8,
        jobCommittedMemoryBytes: 512 * 1024 ** 2, jobUserTimeMs: 600000,
        killOnJobClose: true, breakawayAllowed: false,
        inheritedHandles: ['stdin', 'stdout', 'stderr'],
      },
    });
    expect(PRIVATE_MVP_FIXED_WINDOWS_JOB).toMatchObject(plan.limits);
    expect(f.native.inspectSuspended).toHaveBeenCalledOnce();
    expect(f.watchdog.armBeforeResume).toHaveBeenCalledOnce();
    expect(f.worker.resume).toHaveBeenCalledOnce();
    expect(f.db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toMatchObject({ launch_claimed_at: expect.any(String) });
    expect(f.db.prepare('SELECT state FROM runner_jobs').get()).toMatchObject({ state: 'running' });
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(f.native.prepareSuspended).toHaveBeenCalledTimes(1);
  });

  it('rejects untrusted executable, changed digest, stage escape and stale workspace before claiming launch', async () => {
    const f = setup();
    const invalid = [
      { ...reviewed(), runtimePath: 'C:\\Windows\\System32\\cmd.exe' },
      { ...reviewed(), runtimeSha256: sha('e') },
      { ...reviewed(), entryPath: 'C:\\other\\report.mjs' },
      { ...reviewed(), workspaceGeneration: 'other-generation' },
      { ...reviewed(), policyIdentity: sha('f') },
    ];
    for (const stage of invalid) {
      expect(await f.runtime().startReviewed(stage))
        .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    }
    expect(f.native.prepareSuspended).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toMatchObject({ launch_claimed_at: null });
  });

  it('blocks when fixed native identity or independent lifetime watchdog cannot be proved', async () => {
    const f = setup();
    f.native.verifyPinnedNode.mockResolvedValueOnce(false);
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    f.watchdog.available.mockReturnValueOnce(false);
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RUNTIME_UNAVAILABLE' } });
    expect(f.native.prepareSuspended).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toMatchObject({ launch_claimed_at: null });
  });

  it('terminates a suspended worker before any resume on missing token/Job proof and fences replay', async () => {
    const f = setup();
    f.native.inspectSuspended.mockResolvedValueOnce({ ...inspection, exactAppContainerSid: false });
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RUNTIME_UNAVAILABLE' } });
    expect(f.worker.resume).not.toHaveBeenCalled();
    expect(f.worker.terminateAndConfirm).toHaveBeenCalledOnce();
    expect(f.worker.closeOwnedHandles).toHaveBeenCalledOnce();
    expect(f.db.prepare('SELECT state FROM runner_jobs').get()).toMatchObject({ state: 'failed' });
    expect(f.db.prepare('SELECT charged_bytes FROM runner_missions').get())
      .toMatchObject({ charged_bytes: PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes });
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
  });

  it('fails closed with cleanup unconfirmed when termination or handle close cannot be confirmed', async () => {
    const f = setup();
    f.native.inspectSuspended.mockResolvedValueOnce({ ...inspection, jobMember: false });
    f.worker.terminateAndConfirm.mockResolvedValueOnce(false);
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_CLEANUP_UNCONFIRMED' } });
    expect(f.worker.resume).not.toHaveBeenCalled();
    expect(f.db.prepare('SELECT state FROM runner_jobs').get()).toMatchObject({ state: 'starting' });
    expect(f.db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toMatchObject({ launch_claimed_at: expect.any(String) });
  });

  it('never resumes if watchdog arming fails and does not run an unrestricted fallback', async () => {
    const f = setup();
    f.watchdog.armBeforeResume.mockResolvedValueOnce(false);
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RUNTIME_UNAVAILABLE' } });
    expect(f.worker.resume).not.toHaveBeenCalled();
    expect(f.worker.terminateAndConfirm).toHaveBeenCalledOnce();
    expect(f.native.prepareSuspended).toHaveBeenCalledOnce();
  });

  it('rejects claimed OS proof from a worker when independent trusted native inspection fails', async () => {
    const f = setup();
    // A worker can claim anything; only trusted Win32 handle inspection counts.
    f.worker.inspect.mockResolvedValueOnce(inspection);
    f.native.inspectSuspended.mockResolvedValueOnce({ ...inspection, exactJobLimits: false });
    expect(await f.runtime().startReviewed(reviewed()))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RUNTIME_UNAVAILABLE' } });
    expect(f.worker.inspect).not.toHaveBeenCalled();
    expect(f.worker.resume).not.toHaveBeenCalled();
    expect(f.native.inspectSuspended).toHaveBeenCalledOnce();
    expect(f.worker.terminateAndConfirm).toHaveBeenCalledOnce();
  });
});
