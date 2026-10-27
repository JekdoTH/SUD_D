import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createApprovalRepository,
  createPrivateMvpMissionAdmissionRepository,
  openDatabase,
  PRIVATE_MVP_RESOURCE_POLICY,
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  privateMvpMissionBindingDigest,
  type PrivateMvpMissionScope,
} from '@sud-d/infrastructure';

const folders: string[] = [];
const databases: ReturnType<typeof openDatabase>[] = [];
const now = new Date('2026-10-08T08:00:00.000Z');
const later = new Date('2026-10-08T08:02:00.000Z');
const scope: PrivateMvpMissionScope = {
  missionId: 'mission-a',
  revision: 1,
  goalDigest: 'a'.repeat(64),
  workspaceId: 'workspace-a',
  workspaceGeneration: 'generation-a',
  runnerId: 'render',
  executionFingerprint: 'b'.repeat(64),
  inputDigest: 'c'.repeat(64),
  resourcePolicyIdentity: '', // assigned by scoped helper below
  expiresAt: '2026-10-08T08:25:00.000Z',
};
function scoped(overrides: Partial<PrivateMvpMissionScope> = {}): PrivateMvpMissionScope {
  return { ...scope, resourcePolicyIdentity: PRIVATE_MVP_RESOURCE_POLICY_IDENTITY, ...overrides };
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-f2a-'));
  folders.push(root);
  const dbPath = path.join(root, 'state.sqlite');
  const db = openDatabase(dbPath);
  databases.push(db);
  return { db, dbPath };
}
function grant(db: ReturnType<typeof openDatabase>, candidate: PrivateMvpMissionScope, overrides: Record<string, string> = {}) {
  const approvals = createApprovalRepository(db);
  const pending = approvals.createPending({
    runtimeInstanceId: 'trusted-owner-runtime',
    bindingDigest: privateMvpMissionBindingDigest(candidate),
    sessionId: 'owner-session',
    sessionType: 'desktop',
    capability: 'runner.mission',
    effect: 'execute',
    sensitivity: 'normal',
    policyContext: 'workspace',
    workspaceId: candidate.workspaceId,
    title: 'Authorize bounded offline Mission',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    ...overrides,
  });
  expect(pending.ok).toBe(true);
  if (!pending.ok) throw Error('failed to create test approval');
  const approved = approvals.respond(pending.value.id, 'approve', now.toISOString());
  expect(approved.ok).toBe(true);
}
const observed = { observedFreeBytes: 3 * 1024 ** 3, observedOwnedBytes: 0 };
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close();
  for (const root of folders.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('F2-A durable offline Mission admission, without execution', () => {
  it('consumes exact user grant, reserves one device-wide attempt, and survives a database reopen', () => {
    const { db, dbPath } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const first = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(first.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    const a = first.reserveAttempt(candidate, 'attempt-1', observed);
    expect(a).toMatchObject({ ok: true, value: { ordinal: 1, created: true } });
    expect(first.reserveAttempt(candidate, 'attempt-1', observed))
      .toMatchObject({ ok: true, value: { ordinal: 1, created: false } });
    db.close();

    const reopened = openDatabase(dbPath);
    databases.push(reopened);
    const again = createPrivateMvpMissionAdmissionRepository(reopened, { now: () => later });
    expect(again.reserveAttempt(candidate, 'attempt-2', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    expect(again.settleAttempt(candidate, 'attempt-1', true, false).ok).toBe(true);
    expect(again.reserveAttempt(candidate, 'attempt-2', observed))
      .toMatchObject({ ok: true, value: { ordinal: 2, created: true } });
    expect(again.settleAttempt(candidate, 'attempt-2', true, false).ok).toBe(true);
    expect(again.reserveAttempt(candidate, 'attempt-3', observed))
      .toMatchObject({ ok: true, value: { ordinal: 3, created: true } });
    expect(again.settleAttempt(candidate, 'attempt-3', true, false).ok).toBe(true);
    expect(again.reserveAttempt(candidate, 'attempt-4', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RESOURCE_LIMIT' } });
    reopened.close();
  });

  it('rejects settled attempt replay without cleanup before and after reopening SQLite', () => {
    const { db, dbPath } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const first = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(first.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(first.reserveAttempt(candidate, 'attempt-settled', observed))
      .toMatchObject({ ok: true, value: { ordinal: 1, created: true } });
    expect(first.settleAttempt(candidate, 'attempt-settled', true, false).ok).toBe(true);

    const ledgerBefore = db.prepare(
      'SELECT attempt_count, charged_bytes FROM runner_missions WHERE mission_id = ?',
    ).get(candidate.missionId);
    expect(ledgerBefore).toMatchObject({
      attempt_count: 1,
      charged_bytes: PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes,
    });
    expect(first.reserveAttempt(candidate, 'attempt-settled', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(db.prepare(
      'SELECT attempt_count, charged_bytes FROM runner_missions WHERE mission_id = ?',
    ).get(candidate.missionId)).toEqual(ledgerBefore);
    db.close();

    const reopened = openDatabase(dbPath);
    databases.push(reopened);
    const second = createPrivateMvpMissionAdmissionRepository(reopened, { now: () => later });
    expect(second.reserveAttempt(candidate, 'attempt-settled', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(reopened.prepare(
      'SELECT attempt_count, charged_bytes FROM runner_missions WHERE mission_id = ?',
    ).get(candidate.missionId)).toEqual(ledgerBefore);
    expect(second.reserveAttempt(candidate, 'attempt-new', observed))
      .toMatchObject({ ok: true, value: { ordinal: 2, created: true } });
    reopened.close();
  });

  it('rejects settled attempt replay after confirmed cleanup without recharging the device ledger', () => {
    const { db, dbPath } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const first = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(first.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(first.reserveAttempt(candidate, 'attempt-clean', observed))
      .toMatchObject({ ok: true, value: { ordinal: 1, created: true } });
    expect(first.settleAttempt(candidate, 'attempt-clean', true, true).ok).toBe(true);
    const ledgerBefore = db.prepare('SELECT attempt_count, charged_bytes FROM runner_missions').get();
    expect(ledgerBefore).toMatchObject({ attempt_count: 1, charged_bytes: 0 });
    expect(first.reserveAttempt(candidate, 'attempt-clean', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    db.close();

    const reopened = openDatabase(dbPath);
    databases.push(reopened);
    const second = createPrivateMvpMissionAdmissionRepository(reopened, { now: () => later });
    expect(second.reserveAttempt(candidate, 'attempt-clean', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(reopened.prepare('SELECT attempt_count, charged_bytes FROM runner_missions').get())
      .toEqual(ledgerBefore);
    expect(reopened.prepare(
      'SELECT COUNT(*) AS n FROM runner_mission_attempts WHERE attempt_id = ?',
    ).get('attempt-clean')).toMatchObject({ n: 1 });
    reopened.close();
  });

  it('claims one launch atomically, rejects duplicate/lookup after claim and rejects it after SQLite reopen', () => {
    const { db, dbPath } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const first = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(first.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(first.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(first.reserveAttempt(candidate, 'attempt-1', observed)).toMatchObject({ ok: true, value: { created: true } });
    expect(first.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint)).toEqual({ ok: true, value: undefined });
    expect(first.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(first.reserveAttempt(candidate, 'attempt-1', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(db.prepare('SELECT attempt_count, charged_bytes FROM runner_missions').get())
      .toMatchObject({ attempt_count: 1, charged_bytes: PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes });
    db.close();
    const reopened = openDatabase(dbPath);
    databases.push(reopened);
    const next = createPrivateMvpMissionAdmissionRepository(reopened, { now: () => later });
    expect(next.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(next.settleAttempt(candidate, 'attempt-1', true, false).ok).toBe(true);
    expect(next.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(next.reserveAttempt(candidate, 'attempt-2', observed))
      .toMatchObject({ ok: true, value: { ordinal: 2 } });
    reopened.close();
  });

  it('rolls back a claimed launch when the audit write fails, and refuses stale evidence', () => {
    const { db } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(repo.reserveAttempt(candidate, 'attempt-1', observed).ok).toBe(true);
    expect(repo.claimLaunch(candidate, 'attempt-1', 'e'.repeat(64)))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(repo.claimLaunch({ ...candidate, workspaceGeneration: 'generation-other' }, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    db.exec(`CREATE TRIGGER reject_launch_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'runner.mission.launch_claim' BEGIN SELECT RAISE(FAIL, 'blocked'); END;`);
    expect(repo.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts WHERE attempt_id = ?')
      .get('attempt-1')).toMatchObject({ launch_claimed_at: null });
    db.exec('DROP TRIGGER reject_launch_audit');
    expect(repo.claimLaunch(candidate, 'attempt-1', candidate.executionFingerprint)).toEqual({ ok: true, value: undefined });
    db.close();
  });

  it('fences concurrent different-Workspace Missions and legacy active jobs device-wide', () => {
    const { db } = fixture();
    const first = scoped();
    const second = scoped({ missionId: 'mission-b', workspaceId: 'workspace-b', workspaceGeneration: 'generation-b' });
    grant(db, first);
    grant(db, second);
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(repo.enrollApproved(first, 'trusted-owner-runtime').ok).toBe(true);
    expect(repo.enrollApproved(second, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    expect(repo.revoke(first).ok).toBe(true);
    expect(repo.enrollApproved(second, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    expect(repo.closeMission(first).ok).toBe(true);
    // Historical active job facts must also fence new F2-A device-wide admission.
    db.prepare(`INSERT INTO runner_jobs(job_id,attempt_id,workspace_id,runner_id,execution_fingerprint,
      owner_runtime_epoch,state,created_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run('legacy-job', 'legacy-attempt', 'workspace-c', 'old', 'd'.repeat(64), 'epoch', 'running', now.toISOString());
    expect(repo.enrollApproved(second, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    db.close();
  });

  it('rejects stale/revoked/expired scopes, bad profiles, unknown grants and mismatched retry identity', () => {
    const { db } = fixture();
    const candidate = scoped();
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    grant(db, candidate);
    expect(repo.enrollApproved(scoped({ resourcePolicyIdentity: 'd'.repeat(64) }), 'trusted-owner-runtime').ok).toBe(false);
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(repo.reserveAttempt({ ...candidate, executionFingerprint: 'e'.repeat(64) }, 'attempt-a', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(repo.reserveAttempt(candidate, 'attempt-a', { observedFreeBytes: 1, observedOwnedBytes: 0 }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RESOURCE_LIMIT' } });
    expect(repo.reserveAttempt(candidate, 'attempt-a', observed).ok).toBe(true);
    expect(repo.revoke(candidate).ok).toBe(true);
    expect(repo.reserveAttempt(candidate, 'attempt-b', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    const expired = createPrivateMvpMissionAdmissionRepository(db, { now: () => new Date('2026-10-08T09:00:00.000Z') });
    expect(expired.reserveAttempt(candidate, 'attempt-c', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    db.close();
  });

  it('rolls back approval consumption and reservations when audit persistence fails', () => {
    const { db } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    db.exec(`CREATE TRIGGER fail_mission_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'runner.mission.enroll' BEGIN SELECT RAISE(FAIL, 'audit blocked'); END;`);
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(db.prepare('SELECT count(*) AS n FROM runner_missions').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT status FROM approval_requests LIMIT 1').get()).toMatchObject({ status: 'approved' });
    db.exec('DROP TRIGGER fail_mission_audit');
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    db.exec(`CREATE TRIGGER fail_attempt_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'runner.mission.reserve' BEGIN SELECT RAISE(FAIL, 'audit blocked'); END;`);
    expect(repo.reserveAttempt(candidate, 'attempt-1', observed))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    expect(db.prepare('SELECT attempt_count FROM runner_missions').get()).toMatchObject({ attempt_count: 0 });
    db.close();
  });

  it('keeps the device locked until termination is confirmed; an unknown stop cannot release admission', () => {
    const { db } = fixture();
    const candidate = scoped();
    grant(db, candidate);
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime').ok).toBe(true);
    expect(repo.reserveAttempt(candidate, 'attempt-1', observed).ok).toBe(true);
    expect(repo.closeMission(candidate)).toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    expect(repo.settleAttempt(candidate, 'attempt-1', false, true))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(repo.reserveAttempt(candidate, 'attempt-2', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_BUSY' } });
    expect(repo.settleAttempt(candidate, 'attempt-1', true, true).ok).toBe(true);
    expect(db.prepare('SELECT charged_bytes FROM runner_missions').get()).toMatchObject({ charged_bytes: 0 });
    expect(repo.closeMission(candidate).ok).toBe(true);
    db.close();
  });

  it('keeps unconfirmed cleanup charged across closed Missions, and never refills the 4 GiB device ledger', () => {
    const { db } = fixture();
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    for (let missionIndex = 1; missionIndex <= 2; missionIndex++) {
      const mission = scoped({ missionId: 'mission-' + missionIndex });
      grant(db, mission);
      expect(repo.enrollApproved(mission, 'trusted-owner-runtime').ok).toBe(true);
      for (let attemptIndex = 1; attemptIndex <= 3; attemptIndex++) {
        const attemptId = 'attempt-' + missionIndex + '-' + attemptIndex;
        expect(repo.reserveAttempt(mission, attemptId, observed)).toMatchObject({ ok: true });
        expect(repo.settleAttempt(mission, attemptId, true, false).ok).toBe(true);
      }
      expect(repo.closeMission(mission).ok).toBe(true);
    }
    const third = scoped({ missionId: 'mission-3' });
    grant(db, third);
    expect(repo.enrollApproved(third, 'trusted-owner-runtime').ok).toBe(true);
    expect(repo.reserveAttempt(third, 'attempt-3-1', observed))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RESOURCE_LIMIT' } });
    expect(repo.reserveAttempt(third, 'attempt-3-1', { observedFreeBytes: -1, observedOwnedBytes: 0 }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RESOURCE_LIMIT' } });
    expect(repo.reserveAttempt(third, 'attempt-3-1', { observedFreeBytes: 3 * 1024 ** 3, observedOwnedBytes: 4 * 1024 ** 3 }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_RESOURCE_LIMIT' } });
    db.close();
  });

  it('declines mode-derived consent, stale revision and oversized Mission lifetime', () => {
    const { db } = fixture();
    const candidate = scoped();
    const repo = createPrivateMvpMissionAdmissionRepository(db, { now: () => now });
    const approvals = createApprovalRepository(db);
    const request = {
      runtimeInstanceId: 'trusted-owner-runtime', bindingDigest: privateMvpMissionBindingDigest(candidate),
      sessionId: 'owner-session', sessionType: 'desktop', capability: 'runner.mission', effect: 'execute',
      sensitivity: 'normal', policyContext: 'workspace', workspaceId: candidate.workspaceId,
      title: 'Offline Mission', createdAt: now.toISOString(), expiresAt: '2026-10-08T08:01:00.000Z',
    } as const;
    expect(approvals.recordModeApproval(request, now.toISOString()).ok).toBe(true);
    expect(repo.enrollApproved(candidate, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    const revised = scoped({ missionId: 'mission-new', revision: 2, expiresAt: '2026-10-08T08:31:00.000Z' });
    grant(db, revised);
    expect(repo.enrollApproved(revised, 'trusted-owner-runtime'))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    db.close();
  });

  it('pins exact F2-A ceilings independently of unchanged historical snapshot policy', () => {
    expect(PRIVATE_MVP_RESOURCE_POLICY).toMatchObject({
      revision: 'private-mvp-reviewed-v1',
      maxAttempts: 3,
      activeProcessLimit: 8,
      jobUserTimeMs: 600_000,
      jobMemoryBytes: 512 * 1024 ** 2,
      maxMissionMs: 1_800_000,
      networkProfile: 'none',
      secretProfile: 'none',
      maxRetainedFootprintBytes: 4 * 1024 ** 3,
      minFreeSpaceBytes: 2 * 1024 ** 3,
    });
  });
});
