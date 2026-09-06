import { randomUUID } from 'node:crypto';
import {
  appError,
  err,
  ok,
  type AppError,
  type Result,
  type TeamBlockedReason,
  type TeamFindingSeverity,
  type TeamFreshnessRef,
  type TeamMissionRecord,
  type TeamReviewerFindingRecord,
  type TeamRole,
  type TeamRoleHandoffRecord,
  type TeamState,
  type TeamSubmissionOutcome,
  type TeamWorkItemRecord,
  type TeamWorkItemStatus,
} from '@sud-d/domain';
import type { Db } from './database.js';

export interface NewTeamMission {
  readonly workspaceId: string;
  readonly goalSummary: string;
  readonly freshness: TeamFreshnessRef;
  readonly createdAt: string;
}

export interface TeamTransitionPatch {
  readonly state: TeamState;
  readonly currentRole?: TeamRole;
  readonly currentStepId?: string;
  readonly reviewRound?: number;
  readonly blockedReason?: TeamBlockedReason;
  readonly blockedReasonSummary?: string;
  readonly freshness?: TeamFreshnessRef;
  readonly completedAt?: string;
  readonly stoppedAt?: string;
  readonly updatedAt: string;
}

export interface NewTeamWorkItem {
  readonly sequence: number;
  readonly title: string;
  readonly status: TeamWorkItemStatus;
  readonly targetPathHint?: string;
}

export interface NewTeamHandoff {
  readonly fromRole: TeamRole;
  readonly outcome: TeamSubmissionOutcome;
  readonly summary: string;
  readonly createdAt: string;
}

export interface NewTeamFinding {
  readonly severity: TeamFindingSeverity;
  readonly summary: string;
  readonly targetPathHint?: string;
  readonly expectedCorrection?: string;
  readonly createdAt: string;
}

export interface TeamTransactionWorkItemPatch {
  readonly id: string;
  readonly status: TeamWorkItemStatus;
  readonly reworkCount?: number;
  readonly updatedAt: string;
}

export interface TeamTransactionWriter {
  findMission(id: string): TeamMissionRecord | undefined;
  findActiveMission(workspaceId: string): TeamMissionRecord | undefined;
  createMission(input: NewTeamMission, missionId?: string): TeamMissionRecord;
  updateMission(id: string, patch: TeamTransitionPatch): TeamMissionRecord;
  replaceWorkItems(missionId: string, items: readonly (NewTeamWorkItem & { readonly id?: string })[], nowIso: string): readonly TeamWorkItemRecord[];
  patchWorkItems(missionId: string, items: readonly TeamTransactionWorkItemPatch[]): void;
  addHandoff(missionId: string, handoff: NewTeamHandoff): TeamRoleHandoffRecord;
  replaceFindings(missionId: string, findings: readonly NewTeamFinding[]): readonly TeamReviewerFindingRecord[];
  listWorkItems(missionId: string): readonly TeamWorkItemRecord[];
  listHandoffs(missionId: string, limit?: number): readonly TeamRoleHandoffRecord[];
  listFindings(missionId: string): readonly TeamReviewerFindingRecord[];
}

export interface TeamRepository {
  findById(id: string): Result<TeamMissionRecord | undefined, AppError>;
  findActiveByWorkspace(workspaceId: string): Result<TeamMissionRecord | undefined, AppError>;
  createMission(input: NewTeamMission): Result<TeamMissionRecord, AppError>;
  updateMission(id: string, patch: TeamTransitionPatch): Result<TeamMissionRecord, AppError>;
  replaceWorkItems(missionId: string, items: readonly NewTeamWorkItem[], nowIso: string): Result<readonly TeamWorkItemRecord[], AppError>;
  addHandoff(missionId: string, handoff: NewTeamHandoff): Result<TeamRoleHandoffRecord, AppError>;
  replaceFindings(missionId: string, findings: readonly NewTeamFinding[]): Result<readonly TeamReviewerFindingRecord[], AppError>;
  listWorkItems(missionId: string): Result<readonly TeamWorkItemRecord[], AppError>;
  listHandoffs(missionId: string, limit?: number): Result<readonly TeamRoleHandoffRecord[], AppError>;
  listFindings(missionId: string): Result<readonly TeamReviewerFindingRecord[], AppError>;
  hasPendingLegacyReconciliation(): Result<boolean, AppError>;
}

interface MissionRow {
  mission_id: string;
  workspace_id: string;
  goal_summary: string;
  state: TeamState;
  current_role: TeamRole | null;
  current_step_id: string | null;
  review_round: number;
  blocked_reason_code: TeamBlockedReason | null;
  blocked_reason_summary: string | null;
  freshness_kind: TeamFreshnessRef['kind'];
  freshness_value: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  stopped_at: string | null;
}

interface WorkItemRow {
  work_item_id: string;
  mission_id: string;
  sequence: number;
  title: string;
  status: TeamWorkItemStatus;
  rework_count?: number;
  target_path_hint: string | null;
  created_at: string;
  updated_at: string;
}

interface HandoffRow {
  handoff_id: string;
  mission_id: string;
  from_role: TeamRole;
  outcome_code: TeamSubmissionOutcome;
  summary: string;
  created_at: string;
}

interface FindingRow {
  finding_id: string;
  mission_id: string;
  severity: TeamFindingSeverity;
  summary: string;
  target_path_hint: string | null;
  expected_correction: string | null;
  created_at: string;
}

const ACTIVE_STATES = ['planning', 'implementing', 'validating', 'reviewing'] as const;

export function createTeamTransactionWriter(db: Db): TeamTransactionWriter {
  const readMission = db.prepare('SELECT * FROM team_missions WHERE mission_id = ?');
  const readActive = db.prepare(`
    SELECT * FROM team_missions
    WHERE workspace_id = ? AND state IN ('planning','implementing','validating','reviewing')
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const insertMission = db.prepare(`
    INSERT INTO team_missions(
      mission_id, workspace_id, goal_summary, state, current_role,
      review_round, freshness_kind, freshness_value, created_at, updated_at
    ) VALUES(?, ?, ?, 'planning', 'planner', 0, ?, ?, ?, ?)
  `);
  const updateMissionStatement = db.prepare(`
    UPDATE team_missions
    SET state = ?, current_role = ?, current_step_id = ?, review_round = ?,
        blocked_reason_code = ?, blocked_reason_summary = ?, freshness_kind = ?, freshness_value = ?,
        updated_at = ?, completed_at = ?, stopped_at = ?
    WHERE mission_id = ?
  `);
  const deleteItems = db.prepare('DELETE FROM team_work_items WHERE mission_id = ?');
  const insertItem = db.prepare(`
    INSERT INTO team_work_items(work_item_id, mission_id, sequence, title, status, target_path_hint, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const hasReworkCount = (db.prepare('PRAGMA table_info(team_work_items)').all() as Array<{ name: string }>)
    .some((column) => column.name === 'rework_count');
  const patchItem = db.prepare(hasReworkCount
    ? `UPDATE team_work_items SET status = ?, rework_count = COALESCE(?, rework_count), updated_at = ?
       WHERE work_item_id = ? AND mission_id = ?`
    : `UPDATE team_work_items SET status = ?, updated_at = ?
       WHERE work_item_id = ? AND mission_id = ?`);
  const insertHandoff = db.prepare(`
    INSERT INTO team_role_handoffs(handoff_id, mission_id, from_role, outcome_code, summary, created_at)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  const readHandoff = db.prepare('SELECT * FROM team_role_handoffs WHERE handoff_id = ?');
  const deleteFindings = db.prepare('DELETE FROM team_reviewer_findings WHERE mission_id = ?');
  const insertFinding = db.prepare(`
    INSERT INTO team_reviewer_findings(finding_id, mission_id, severity, summary, target_path_hint, expected_correction, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `);
  const listItems = db.prepare('SELECT * FROM team_work_items WHERE mission_id = ? ORDER BY sequence ASC');
  const listHandoffs = db.prepare('SELECT * FROM team_role_handoffs WHERE mission_id = ? ORDER BY created_at ASC LIMIT ?');
  const listFindings = db.prepare('SELECT * FROM team_reviewer_findings WHERE mission_id = ? ORDER BY created_at ASC');

  const findMission = (id: string): TeamMissionRecord | undefined => {
    const row = readMission.get(id) as MissionRow | undefined;
    return row ? rowToMission(row) : undefined;
  };
  const findActiveMission = (workspaceId: string): TeamMissionRecord | undefined => {
    const row = readActive.get(workspaceId) as MissionRow | undefined;
    return row ? rowToMission(row) : undefined;
  };
  const readItems = (missionId: string): readonly TeamWorkItemRecord[] =>
    (listItems.all(missionId) as WorkItemRow[]).map(rowToWorkItem);
  const readHandoffs = (missionId: string, limit = 50): readonly TeamRoleHandoffRecord[] =>
    (listHandoffs.all(missionId, limit) as HandoffRow[]).map(rowToHandoff);
  const readFindings = (missionId: string): readonly TeamReviewerFindingRecord[] =>
    (listFindings.all(missionId) as FindingRow[]).map(rowToFinding);

  return Object.freeze({
    findMission,
    findActiveMission,
    createMission(input: NewTeamMission, missionId = randomUUID()) {
      insertMission.run(missionId, input.workspaceId, input.goalSummary, input.freshness.kind,
        input.freshness.value, input.createdAt, input.createdAt);
      const mission = findMission(missionId);
      if (!mission) throw new Error('created Team mission is unavailable');
      return mission;
    },
    updateMission(id: string, patch: TeamTransitionPatch) {
      const current = findMission(id);
      if (!current) throw appError('TEAM_MISSION_NOT_FOUND', 'Team mission is unavailable');
      const freshness = patch.freshness ?? { kind: current.freshnessKind, value: current.freshnessValue };
      updateMissionStatement.run(
        patch.state,
        patch.currentRole ?? null,
        patch.currentStepId ?? null,
        patch.reviewRound ?? current.reviewRound,
        patch.blockedReason ?? null,
        patch.blockedReasonSummary ?? null,
        freshness.kind,
        freshness.value,
        patch.updatedAt,
        patch.completedAt ?? null,
        patch.stoppedAt ?? null,
        id,
      );
      const next = findMission(id);
      if (!next) throw new Error('updated Team mission is unavailable');
      return next;
    },
    replaceWorkItems(missionId: string, items: readonly (NewTeamWorkItem & { readonly id?: string })[], nowIso: string) {
      deleteItems.run(missionId);
      for (const item of items) {
        insertItem.run(item.id ?? randomUUID(), missionId, item.sequence, item.title, item.status,
          item.targetPathHint ?? null, nowIso, nowIso);
      }
      return readItems(missionId);
    },
    patchWorkItems(missionId: string, items: readonly TeamTransactionWorkItemPatch[]) {
      for (const item of items) {
        if (item.reworkCount !== undefined && !hasReworkCount) {
          throw appError('TEAM_TRANSITION_INVALID', 'Team Task rework persistence is unavailable');
        }
        const result = hasReworkCount
          ? patchItem.run(item.status, item.reworkCount ?? null, item.updatedAt, item.id, missionId)
          : patchItem.run(item.status, item.updatedAt, item.id, missionId);
        if (result.changes !== 1) {
          throw appError('TEAM_TRANSITION_INVALID', 'Team work-item precondition changed');
        }
      }
    },
    addHandoff(missionId: string, handoff: NewTeamHandoff) {
      const id = randomUUID();
      insertHandoff.run(id, missionId, handoff.fromRole, handoff.outcome, handoff.summary, handoff.createdAt);
      const row = readHandoff.get(id) as HandoffRow | undefined;
      if (!row) throw new Error('created Team handoff is unavailable');
      return rowToHandoff(row);
    },
    replaceFindings(missionId: string, findings: readonly NewTeamFinding[]) {
      deleteFindings.run(missionId);
      for (const finding of findings) {
        insertFinding.run(randomUUID(), missionId, finding.severity, finding.summary,
          finding.targetPathHint ?? null, finding.expectedCorrection ?? null, finding.createdAt);
      }
      return readFindings(missionId);
    },
    listWorkItems: readItems,
    listHandoffs: readHandoffs,
    listFindings: readFindings,
  });
}

export function createTeamRepository(db: Db): TeamRepository {
  const writer = createTeamTransactionWriter(db);
  const repository: TeamRepository = {
    findById(id) {
      try { return ok(writer.findMission(id)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to inspect Team mission')); }
    },
    findActiveByWorkspace(workspaceId) {
      try { return ok(writer.findActiveMission(workspaceId)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to inspect active Team mission')); }
    },
    createMission(input) {
      try { return ok(writer.createMission(input)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to create Team mission')); }
    },
    updateMission(id, patch) {
      try {
        if (!writer.findMission(id)) return err(appError('TEAM_MISSION_NOT_FOUND', 'Team mission is unavailable'));
        return ok(writer.updateMission(id, patch));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to update Team mission'));
      }
    },
    replaceWorkItems(missionId, items, nowIso) {
      try { return ok(db.transaction(() => writer.replaceWorkItems(missionId, items, nowIso))()); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to persist Team work items')); }
    },
    addHandoff(missionId, handoff) {
      try { return ok(writer.addHandoff(missionId, handoff)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to persist Team handoff')); }
    },
    replaceFindings(missionId, findings) {
      try { return ok(db.transaction(() => writer.replaceFindings(missionId, findings))()); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to persist Team reviewer findings')); }
    },
    listWorkItems(missionId) {
      try { return ok(writer.listWorkItems(missionId)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to list Team work items')); }
    },
    listHandoffs(missionId, limit = 50) {
      try { return ok(writer.listHandoffs(missionId, limit)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to list Team handoffs')); }
    },
    listFindings(missionId) {
      try { return ok(writer.listFindings(missionId)); }
      catch { return err(appError('INTERNAL_ERROR', 'Failed to list Team findings')); }
    },
    hasPendingLegacyReconciliation() {
      try {
        const row = db.prepare('SELECT 1 AS pending FROM team_missions WHERE reconciliation_required = 1 LIMIT 1').get() as { pending: number } | undefined;
        return ok(Boolean(row));
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect Team legacy reconciliation'));
      }
    },
  };
  return Object.freeze(repository);
}

function rowToMission(row: MissionRow): TeamMissionRecord {
  return {
    id: row.mission_id,
    workspaceId: row.workspace_id,
    goalSummary: row.goal_summary,
    state: row.state,
    ...(row.current_role ? { currentRole: row.current_role } : {}),
    ...(row.current_step_id ? { currentStepId: row.current_step_id } : {}),
    reviewRound: row.review_round,
    ...(row.blocked_reason_code ? { blockedReason: row.blocked_reason_code } : {}),
    ...(row.blocked_reason_summary ? { blockedReasonSummary: row.blocked_reason_summary } : {}),
    freshnessKind: row.freshness_kind,
    freshnessValue: row.freshness_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.stopped_at ? { stoppedAt: row.stopped_at } : {}),
  };
}

function rowToWorkItem(row: WorkItemRow): TeamWorkItemRecord {
  return {
    id: row.work_item_id,
    missionId: row.mission_id,
    sequence: row.sequence,
    title: row.title,
    status: row.status,
    reworkCount: row.rework_count ?? 0,
    ...(row.target_path_hint ? { targetPathHint: row.target_path_hint } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToHandoff(row: HandoffRow): TeamRoleHandoffRecord {
  return {
    id: row.handoff_id,
    missionId: row.mission_id,
    fromRole: row.from_role,
    outcome: row.outcome_code,
    summary: row.summary,
    createdAt: row.created_at,
  };
}

function rowToFinding(row: FindingRow): TeamReviewerFindingRecord {
  return {
    id: row.finding_id,
    missionId: row.mission_id,
    severity: row.severity,
    summary: row.summary,
    ...(row.target_path_hint ? { targetPathHint: row.target_path_hint } : {}),
    ...(row.expected_correction ? { expectedCorrection: row.expected_correction } : {}),
    createdAt: row.created_at,
  };
}

export function isActiveTeamState(state: TeamState): boolean {
  return ACTIVE_STATES.includes(state as (typeof ACTIVE_STATES)[number]);
}
