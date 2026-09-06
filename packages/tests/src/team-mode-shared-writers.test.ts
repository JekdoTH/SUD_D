import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (name: string) => fs.readFileSync(
  path.join(process.cwd(), 'packages', 'infrastructure', 'src', name),
  'utf8',
);

describe('Team transition shared transaction writers', () => {
  it('reuses repository transaction-scoped writers and keeps mutation SQL out of the UoW', () => {
    const team = source('team-repository.ts');
    const workMemory = source('work-memory-repository.ts');
    const audit = source('audit-repository.ts');
    const uow = source('team-transition-unit-of-work.ts');

    expect(team).toContain('createTeamTransactionWriter');
    expect(workMemory).toContain('createWorkMemoryCheckpointWriter');
    expect(audit).toContain('createAuditEventWriter');
    expect(uow).toContain('createTeamTransactionWriter');
    expect(uow).toContain('createWorkMemoryCheckpointWriter');
    expect(uow).toContain('createAuditEventWriter');

    for (const sql of [
      'INSERT INTO team_missions',
      'UPDATE team_missions',
      'INSERT INTO team_work_items',
      'DELETE FROM team_work_items',
      'INSERT INTO team_reviewer_findings',
      'DELETE FROM team_reviewer_findings',
      'INSERT INTO team_role_handoffs',
      'INSERT INTO work_memory_checkpoints',
      'UPDATE work_memory_checkpoints SET is_current',
      'INSERT INTO audit_events',
    ]) {
      expect(uow).not.toContain(sql);
    }
  });
});
