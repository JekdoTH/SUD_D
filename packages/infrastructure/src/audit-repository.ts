import type { Db } from './database.js';
import type { AuditEvent, ClientSessionType } from '@sud-d/domain';
import { v4 as uuidv4 } from 'uuid';

interface AuditRow {
  id: string;
  timestamp: string;
  session_id: string;
  session_type: string;
  action: string;
  workspace_id: string | null;
  resource_path: string | null;
  policy_decision: string | null;
  result_code: string;
  duration_ms: number;
  metadata: string;
}

function rowToEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    sessionId: row.session_id,
    sessionType: row.session_type as ClientSessionType,
    action: row.action,
    workspaceId: row.workspace_id ?? undefined,
    resourcePath: row.resource_path ?? undefined,
    policyDecision: row.policy_decision as AuditEvent['policyDecision'],
    resultCode: row.result_code,
    durationMs: row.duration_ms,
    metadata: JSON.parse(row.metadata) as Record<string, string | number | boolean>,
  };
}

// ---------------------------------------------------------------------------
// Sanitizer — must not persist secret-like values raw
// ---------------------------------------------------------------------------

const SECRET_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /bearer/i,
  /access[_-]?key/i,
  /env(?:ironment)?/i,
  /payload/i,
  /raw/i,
  /stdout/i,
  /stderr/i,
  /command/i,
  /argv/i,
  /cwd/i,
];

export function sanitizeMetadata(
  raw: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    const isSecret = SECRET_KEY_PATTERNS.some((p) => p.test(k));
    if (isSecret) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

export interface AuditEventWriter {
  append(event: Omit<AuditEvent, 'id'>): AuditEvent;
}

export interface AuditRepository {
  append(event: Omit<AuditEvent, 'id'>): AuditEvent;
  list(limit?: number, excludeActions?: readonly string[]): AuditEvent[];
  hasSessionActivitySince(sessionType: ClientSessionType, since: Date): boolean;
}

export function createAuditEventWriter(db: Db): AuditEventWriter {
  const insertStatement = db.prepare(
    `INSERT INTO audit_events(id, timestamp, session_id, session_type, action, workspace_id,
      resource_path, policy_decision, result_code, duration_ms, metadata)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  return Object.freeze({
    append(event: Omit<AuditEvent, 'id'>) {
      const id = uuidv4();
      const sanitized = sanitizeMetadata(event.metadata as Record<string, unknown>);
      insertStatement.run(
        id,
        event.timestamp.toISOString(),
        event.sessionId,
        event.sessionType,
        event.action,
        event.workspaceId ?? null,
        event.resourcePath ?? null,
        event.policyDecision ?? null,
        event.resultCode,
        event.durationMs,
        JSON.stringify(sanitized),
      );
      return { ...event, id, metadata: sanitized };
    },
  });
}

export function createAuditRepository(db: Db): AuditRepository {
  const writer = createAuditEventWriter(db);
  const hasSessionActivitySince = db.prepare(
    'SELECT 1 FROM audit_events WHERE session_type = ? AND timestamp > ? LIMIT 1',
  );
  return {
    append(event: Omit<AuditEvent, 'id'>): AuditEvent {
      return writer.append(event);
    },
    list(limit = 50, excludeActions: readonly string[] = []): AuditEvent[] {
      const rows = excludeActions.length === 0
        ? db
            .prepare('SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?')
            .all(limit) as AuditRow[]
        : db
            .prepare(
              `SELECT * FROM audit_events
               WHERE action NOT IN (${excludeActions.map(() => '?').join(', ')})
               ORDER BY timestamp DESC LIMIT ?`,
            )
            .all(...excludeActions, limit) as AuditRow[];
      return rows.map(rowToEvent);
    },
    hasSessionActivitySince(sessionType: ClientSessionType, since: Date): boolean {
      return hasSessionActivitySince.get(sessionType, since.toISOString()) !== undefined;
    },
  };
}
