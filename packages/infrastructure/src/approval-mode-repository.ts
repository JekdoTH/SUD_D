import type { ApprovalMode, AuditEvent } from '@sud-d/domain';
import { createAuditEventWriter } from './audit-repository.js';
import type { Db } from './database.js';

export interface ApprovalModeRepository {
  get(): ApprovalMode;
  setAudited(mode: ApprovalMode, event: Omit<AuditEvent, 'id'>): ApprovalMode;
}

export function createApprovalModeRepository(db: Db): ApprovalModeRepository {
  const read = db.prepare('SELECT mode FROM approval_mode_settings WHERE singleton_id = 1');
  const update = db.prepare('UPDATE approval_mode_settings SET mode = ?, updated_at = ? WHERE singleton_id = 1');
  const auditWriter = createAuditEventWriter(db);
  const setAuditedTransaction = db.transaction((mode: ApprovalMode, event: Omit<AuditEvent, 'id'>): ApprovalMode => {
    const changed = update.run(mode, event.timestamp.toISOString());
    if (changed.changes !== 1) throw new Error('Approval Mode setting is unavailable');
    auditWriter.append(event);
    return mode;
  });

  return Object.freeze({
    get(): ApprovalMode {
      const row = read.get() as { mode: ApprovalMode } | undefined;
      if (!row) throw new Error('Approval Mode setting is unavailable');
      return row.mode;
    },

    setAudited(mode: ApprovalMode, event: Omit<AuditEvent, 'id'>): ApprovalMode {
      return setAuditedTransaction(mode, event);
    },
  });
}
