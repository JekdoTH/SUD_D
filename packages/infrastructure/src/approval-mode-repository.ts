import type { ApprovalMode } from '@sud-d/domain';
import type { Db } from './database.js';

export interface ApprovalModeRepository {
  get(): ApprovalMode;
  set(mode: ApprovalMode): ApprovalMode;
}

export function createApprovalModeRepository(db: Db): ApprovalModeRepository {
  const read = db.prepare('SELECT mode FROM approval_mode_settings WHERE singleton_id = 1');
  const update = db.prepare('UPDATE approval_mode_settings SET mode = ?, updated_at = ? WHERE singleton_id = 1');

  return Object.freeze({
    get(): ApprovalMode {
      const row = read.get() as { mode: ApprovalMode } | undefined;
      if (!row) throw new Error('Approval Mode setting is unavailable');
      return row.mode;
    },

    set(mode: ApprovalMode): ApprovalMode {
      const changed = update.run(mode, new Date().toISOString());
      if (changed.changes !== 1) throw new Error('Approval Mode setting is unavailable');
      return mode;
    },
  });
}
