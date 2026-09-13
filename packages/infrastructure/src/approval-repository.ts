import { randomUUID } from 'node:crypto';
import {
  appError,
  err,
  ok,
  type AppError,
  type ApprovalRequestRecord,
  type ApprovalUserDecision,
  type Effect,
  type PolicyContext,
  type Result,
  type Sensitivity,
} from '@sud-d/domain';
import type { Db } from './database.js';

export interface NewApprovalRequest {
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
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ApprovalRepository {
  findById(id: string): Result<ApprovalRequestRecord | undefined, AppError>;
  findLatest(runtimeInstanceId: string, bindingDigest: string): Result<ApprovalRequestRecord | undefined, AppError>;
  createPending(request: NewApprovalRequest): Result<ApprovalRequestRecord, AppError>;
  recordModeApproval(request: NewApprovalRequest, nowIso: string): Result<ApprovalRequestRecord, AppError>;
  countActive(runtimeInstanceId: string, nowIso: string): Result<number, AppError>;
  listPending(limit?: number, nowIso?: string): Result<readonly ApprovalRequestRecord[], AppError>;
  respond(id: string, decision: ApprovalUserDecision, nowIso?: string): Result<ApprovalRequestRecord, AppError>;
  consumeApproved(runtimeInstanceId: string, bindingDigest: string, nowIso: string): Result<ApprovalRequestRecord | undefined, AppError>;
  expireStale(nowIso: string): Result<number, AppError>;
  expireOtherRuntimes(runtimeInstanceId: string, nowIso: string): Result<number, AppError>;
  cleanupTerminal(beforeIso: string): Result<number, AppError>;
}

interface ApprovalRow {
  id: string;
  runtime_instance_id: string;
  binding_digest: string;
  session_id: string;
  session_type: string;
  capability: string;
  effect: Effect;
  sensitivity: Sensitivity;
  policy_context: PolicyContext;
  workspace_id: string | null;
  safe_title: string;
  safe_resource_label: string | null;
  status: ApprovalRequestRecord['status'];
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  consumed_at: string | null;
  decision_source: 'user' | 'mode' | null;
}

export function createApprovalRepository(db: Db): ApprovalRepository {
  const readById = db.prepare('SELECT * FROM approval_requests WHERE id = ?');
  const findLatest = db.prepare(`
    SELECT * FROM approval_requests
    WHERE runtime_instance_id = ? AND binding_digest = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO approval_requests(
      id, runtime_instance_id, binding_digest, session_id, session_type,
      capability, effect, sensitivity, policy_context, workspace_id,
      safe_title, safe_resource_label, status, created_at, expires_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `);
  const insertModeApproval = db.prepare(`
    INSERT INTO approval_requests(
      id, runtime_instance_id, binding_digest, session_id, session_type,
      capability, effect, sensitivity, policy_context, workspace_id,
      safe_title, safe_resource_label, status, created_at, expires_at,
      decided_at, consumed_at, decision_source
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'consumed', ?, ?, ?, ?, 'mode')
  `);
  const consumePendingForMode = db.prepare(`
    UPDATE approval_requests
    SET status = 'consumed', decided_at = ?, consumed_at = ?, decision_source = 'mode'
    WHERE id = ? AND status = 'pending' AND expires_at > ?
  `);
  const countActive = db.prepare(`
    SELECT COUNT(*) AS count FROM approval_requests
    WHERE runtime_instance_id = ? AND status IN ('pending','approved') AND expires_at > ?
  `);
  const listPending = db.prepare(`
    SELECT * FROM approval_requests
    WHERE status = 'pending' AND expires_at > ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  const expireById = db.prepare(`
    UPDATE approval_requests SET status = 'expired'
    WHERE id = ? AND status IN ('pending','approved')
  `);
  const respond = db.prepare(`
    UPDATE approval_requests
    SET status = ?, decided_at = ?, decision_source = 'user'
    WHERE id = ? AND status = 'pending' AND expires_at > ?
  `);
  const consume = db.prepare(`
    UPDATE approval_requests
    SET status = 'consumed', consumed_at = ?
    WHERE id = ? AND status = 'approved' AND expires_at > ?
  `);
  const expireStale = db.prepare(`
    UPDATE approval_requests SET status = 'expired'
    WHERE status IN ('pending','approved') AND expires_at <= ?
  `);
  const expireOther = db.prepare(`
    UPDATE approval_requests SET status = 'expired'
    WHERE runtime_instance_id <> ? AND status IN ('pending','approved')
  `);
  const cleanup = db.prepare(`
    DELETE FROM approval_requests
    WHERE status IN ('denied','consumed','expired') AND created_at < ?
  `);

  const byId = (id: string): ApprovalRequestRecord | undefined => {
    const row = readById.get(id) as ApprovalRow | undefined;
    return row ? rowToRecord(row) : undefined;
  };

  const repository: ApprovalRepository = {
    findById(id: string) {
      try {
        return ok(byId(id));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect approval request'));
      }
    },

    findLatest(runtimeInstanceId: string, bindingDigest: string) {
      try {
        const row = findLatest.get(runtimeInstanceId, bindingDigest) as ApprovalRow | undefined;
        return ok(row ? rowToRecord(row) : undefined);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect approval state'));
      }
    },

    createPending(request) {
      try {
        const id = randomUUID();
        const inserted = insert.run(
          id,
          request.runtimeInstanceId,
          request.bindingDigest,
          request.sessionId,
          request.sessionType,
          request.capability,
          request.effect,
          request.sensitivity,
          request.policyContext,
          request.workspaceId ?? null,
          request.title,
          request.resourceLabel ?? null,
          request.createdAt,
          request.expiresAt,
        );
        if (inserted.changes === 1) {
          const record = byId(id);
          return record ? ok(record) : err(appError('INTERNAL_ERROR', 'Failed to create approval request'));
        }
        const concurrent = findLatest.get(request.runtimeInstanceId, request.bindingDigest) as ApprovalRow | undefined;
        if (concurrent && (concurrent.status === 'pending' || concurrent.status === 'approved')) {
          return ok(rowToRecord(concurrent));
        }
        return err(appError('APPROVAL_STATE_INVALID', 'Approval request changed concurrently'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to create approval request'));
      }
    },

    recordModeApproval(request, nowIso) {
      try {
        const latest = findLatest.get(request.runtimeInstanceId, request.bindingDigest) as ApprovalRow | undefined;
        if (latest?.status === 'pending' && latest.expires_at > nowIso) {
          const changed = consumePendingForMode.run(nowIso, nowIso, latest.id, nowIso);
          if (changed.changes !== 1) {
            return err(appError('APPROVAL_STATE_INVALID', 'Approval request changed concurrently'));
          }
          const record = byId(latest.id);
          return record ? ok(record) : err(appError('INTERNAL_ERROR', 'Failed to record Approval Mode decision'));
        }
        const id = randomUUID();
        insertModeApproval.run(
          id,
          request.runtimeInstanceId,
          request.bindingDigest,
          request.sessionId,
          request.sessionType,
          request.capability,
          request.effect,
          request.sensitivity,
          request.policyContext,
          request.workspaceId ?? null,
          request.title,
          request.resourceLabel ?? null,
          request.createdAt,
          request.expiresAt,
          nowIso,
          nowIso,
        );
        const record = byId(id);
        return record ? ok(record) : err(appError('INTERNAL_ERROR', 'Failed to record Approval Mode decision'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to record Approval Mode decision'));
      }
    },

    countActive(runtimeInstanceId, nowIso) {
      try {
        const row = countActive.get(runtimeInstanceId, nowIso) as { count: number };
        return ok(Number(row.count));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect approval queue'));
      }
    },

    listPending(limit = 50, nowIso = new Date().toISOString()) {
      try {
        expireStale.run(nowIso);
        const bounded = Math.max(1, Math.min(50, Math.trunc(limit)));
        return ok((listPending.all(nowIso, bounded) as ApprovalRow[]).map(rowToRecord));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to list approval requests'));
      }
    },

    respond(id, decision, nowIso = new Date().toISOString()) {
      try {
        const existing = byId(id);
        if (!existing) return err(appError('APPROVAL_STATE_INVALID', 'Approval request is unavailable'));
        if (existing.status !== 'pending') return err(appError('APPROVAL_STATE_INVALID', 'Approval request is no longer pending'));
        if (existing.expiresAt <= nowIso) {
          expireById.run(id);
          return err(appError('APPROVAL_EXPIRED', 'Approval request expired'));
        }
        const next = decision === 'approve' ? 'approved' : 'denied';
        const changed = respond.run(next, nowIso, id, nowIso);
        if (changed.changes !== 1) return err(appError('APPROVAL_STATE_INVALID', 'Approval request changed concurrently'));
        const record = byId(id);
        return record ? ok(record) : err(appError('INTERNAL_ERROR', 'Failed to read approval decision'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to update approval request'));
      }
    },

    consumeApproved(runtimeInstanceId, bindingDigest, nowIso) {
      try {
        const row = findLatest.get(runtimeInstanceId, bindingDigest) as ApprovalRow | undefined;
        if (!row) return ok(undefined);
        if (row.expires_at <= nowIso && (row.status === 'pending' || row.status === 'approved')) {
          expireById.run(row.id);
          return ok(undefined);
        }
        if (row.status !== 'approved') return ok(undefined);
        const changed = consume.run(nowIso, row.id, nowIso);
        if (changed.changes !== 1) return ok(undefined);
        const record = byId(row.id);
        return record ? ok(record) : err(appError('INTERNAL_ERROR', 'Failed to consume approval grant'));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to consume approval grant'));
      }
    },

    expireStale(nowIso) {
      try { return ok(Number(expireStale.run(nowIso).changes)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to expire approval requests')); }
    },

    expireOtherRuntimes(runtimeInstanceId, _nowIso) {
      try { return ok(Number(expireOther.run(runtimeInstanceId).changes)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to invalidate old approval runtime state')); }
    },

    cleanupTerminal(beforeIso) {
      try { return ok(Number(cleanup.run(beforeIso).changes)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to clean approval history')); }
    },
  };
  return Object.freeze(repository);
}

function rowToRecord(row: ApprovalRow): ApprovalRequestRecord {
  return {
    id: row.id,
    runtimeInstanceId: row.runtime_instance_id,
    bindingDigest: row.binding_digest,
    sessionId: row.session_id,
    sessionType: row.session_type,
    capability: row.capability,
    effect: row.effect,
    sensitivity: row.sensitivity,
    policyContext: row.policy_context,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    title: row.safe_title,
    ...(row.safe_resource_label ? { resourceLabel: row.safe_resource_label } : {}),
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
    ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
    ...(row.decision_source ? { decisionSource: row.decision_source } : {}),
  };
}
