/** Durable one-use Solo Expert attempt ledger. No process execution or upstream MCP call. */
import type { Db } from './database.js';

export type SoloAttemptState = 'prepared' | 'claimed' | 'closed' | 'unknown' | 'revoked';
export interface NewSoloAttempt {
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly reviewDigest: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}
const validDigest = (s: string) => /^[0-9a-f]{64}$/.test(s);
const validId = (s: string) => typeof s === 'string' && s.length > 0 && s.length < 129;
const validTime = (s: string) => typeof s === 'string' && Number.isFinite(Date.parse(s))
  && new Date(s).toISOString() === s;
export function createSoloExpertAttemptRepository(db: Db) {
  const add = db.prepare(
    "INSERT INTO solo_expert_attempts(attempt_id,workspace_id,workspace_generation,review_digest,state,created_at,expires_at) VALUES(?,?,?,?,'prepared',?,?)",
  );
  const claim = db.prepare([
    "UPDATE solo_expert_attempts SET state='claimed',approval_id=?,claimed_at=?",
    "WHERE attempt_id=? AND state='prepared' AND expires_at>?",
    "AND EXISTS (SELECT 1 FROM approval_requests ap",
    "WHERE ap.id=? AND ap.capability='solo_expert.smoke'",
    "AND ap.status='consumed' AND ap.decision_source='user'",
    "AND ap.expires_at>? AND ap.consumed_at IS NOT NULL",
    "AND ap.solo_review_digest=solo_expert_attempts.review_digest",
    "AND ap.workspace_id=solo_expert_attempts.workspace_id)",
  ].join(' '));
  const read = db.prepare('SELECT state FROM solo_expert_attempts WHERE attempt_id=?');
  const close = db.prepare(
    "UPDATE solo_expert_attempts SET state='closed',finished_at=? WHERE attempt_id=? AND state='claimed'",
  );
  const unknown = db.prepare(
    "UPDATE solo_expert_attempts SET state='unknown',finished_at=? WHERE attempt_id=? AND state='claimed'",
  );
  const revoke = db.prepare(
    "UPDATE solo_expert_attempts SET state='revoked',finished_at=? WHERE attempt_id=? AND state='prepared'",
  );
  const hasOpen = db.prepare(
    "SELECT 1 FROM solo_expert_attempts WHERE state IN ('prepared','claimed','unknown') LIMIT 1",
  );
  const repo = {
    async prepare(input: NewSoloAttempt): Promise<boolean> {
      if (!validId(input.attemptId) || !validId(input.workspaceId)
        || !validId(input.workspaceGeneration) || !validDigest(input.reviewDigest)
        || !validTime(input.createdAt) || !validTime(input.expiresAt)
        || input.expiresAt <= input.createdAt) return false;
      try {
        return db.transaction(() => {
          if (hasOpen.get()) return false;
          return add.run(input.attemptId, input.workspaceId, input.workspaceGeneration,
            input.reviewDigest, input.createdAt, input.expiresAt).changes === 1;
        }).immediate();
      } catch { return false; }
    },
    async claim(attemptId: string, approvalId: string, nowIso: string): Promise<boolean> {
      if (!validId(attemptId) || !validId(approvalId) || !validTime(nowIso)) return false;
      try {
        return db.transaction(() => claim.run(
          approvalId, nowIso, attemptId, nowIso, approvalId, nowIso,
        ).changes === 1).immediate();
      } catch { return false; }
    },
    async close(attemptId: string): Promise<boolean> {
      try { return close.run(new Date().toISOString(), attemptId).changes === 1; }
      catch { return false; }
    },
    async markUnknown(attemptId: string): Promise<void> {
      try { unknown.run(new Date().toISOString(), attemptId); } catch { /* keep claimed fence */ }
    },
    async revoke(attemptId: string): Promise<boolean> {
      try { return revoke.run(new Date().toISOString(), attemptId).changes === 1; }
      catch { return false; }
    },
    async state(attemptId: string): Promise<SoloAttemptState | undefined> {
      try {
        return (read.get(attemptId) as {state: SoloAttemptState} | undefined)?.state;
      } catch { return 'unknown'; }
    },
    /** A claimed row from an earlier process is already an unresolved fence. */
    async hasUnresolved(): Promise<boolean> {
      try { return Boolean(hasOpen.get()); } catch { return true; }
    },
  };
  return Object.freeze(repo);
}
