import {
  appError,
  err,
  ok,
  type AppError,
  type AuditEvent,
  type Result,
  type TeamFreshnessRef,
  type TeamMissionRecord,
  type TeamRole,
  type TeamState,
  type TeamWorkItemStatus,
  type WorkResumeContext,
} from '@sud-d/domain';
import type { Db } from './database.js';
import { createAuditEventWriter } from './audit-repository.js';
import { createTeamTransactionWriter } from './team-repository.js';
import type {
  NewTeamFinding,
  NewTeamHandoff,
  NewTeamMission,
  NewTeamWorkItem,
  TeamTransitionPatch,
} from './team-repository.js';
import { createWorkMemoryCheckpointWriter } from './work-memory-repository.js';
import type { WorkMemoryCheckpointDraft } from './work-memory-repository.js';

export interface TeamTransitionPrecondition {
  readonly missionId?: string;
  readonly workspaceId: string;
  readonly expectedState?: TeamState;
  readonly expectedRole?: TeamRole;
  readonly expectedCurrentStepId?: string;
  readonly expectedFreshness?: TeamFreshnessRef;
}

export type TeamMissionWrite =
  | { readonly kind: 'create'; readonly input: NewTeamMission }
  | { readonly kind: 'update'; readonly missionId: string; readonly patch: TeamTransitionPatch };

export interface TeamWorkItemPatch {
  readonly id: string;
  readonly status: TeamWorkItemStatus;
  readonly reworkCount?: number;
  readonly updatedAt: string;
}

export type TeamWorkItemWriteSet =
  | {
      readonly kind: 'replace';
      readonly missionId: string;
      readonly items: readonly (NewTeamWorkItem & { readonly id?: string })[];
      readonly nowIso: string;
    }
  | {
      readonly kind: 'patch';
      readonly missionId: string;
      readonly items: readonly TeamWorkItemPatch[];
    };

export interface TeamHandoffWrite {
  readonly missionId: string;
  readonly value: NewTeamHandoff;
}

export interface TeamTransitionWritePlan {
  readonly precondition: TeamTransitionPrecondition;
  readonly mission: TeamMissionWrite;
  readonly workItems?: TeamWorkItemWriteSet;
  readonly findings?: readonly NewTeamFinding[];
  readonly handoff?: TeamHandoffWrite;
  readonly checkpoint: WorkMemoryCheckpointDraft;
  readonly audit: Omit<AuditEvent, 'id'>;
}

export interface TeamTransitionCommitResult {
  readonly mission: TeamMissionRecord;
  readonly checkpoint: WorkResumeContext;
}

export interface TeamTransitionUnitOfWork {
  commit(input: TeamTransitionWritePlan): Result<TeamTransitionCommitResult, AppError>;
}

interface MissionRow {
  mission_id: string;
  workspace_id: string;
  goal_summary: string;
  state: TeamState;
  current_role: TeamRole | null;
  current_step_id: string | null;
  review_round: number;
  blocked_reason_code: TeamMissionRecord['blockedReason'] | null;
  blocked_reason_summary: string | null;
  freshness_kind: TeamFreshnessRef['kind'];
  freshness_value: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  stopped_at: string | null;
}




function preconditionMatches(row: MissionRow | undefined, input: TeamTransitionPrecondition): boolean {
  if (!row) return input.missionId === undefined;
  if (input.missionId !== undefined && row.mission_id !== input.missionId) return false;
  if (row.workspace_id !== input.workspaceId) return false;
  if (input.expectedState !== undefined && row.state !== input.expectedState) return false;
  if (input.expectedRole !== undefined && row.current_role !== input.expectedRole) return false;
  if (input.expectedCurrentStepId !== undefined && row.current_step_id !== input.expectedCurrentStepId) return false;
  if (input.expectedFreshness !== undefined) {
    if (row.freshness_kind !== input.expectedFreshness.kind) return false;
    if (row.freshness_value !== input.expectedFreshness.value) return false;
  }
  return true;
}

export function createTeamTransitionUnitOfWork(db: Db): TeamTransitionUnitOfWork {
  const readMission = db.prepare('SELECT * FROM team_missions WHERE mission_id = ?');
  const readActiveMission = db.prepare(`
    SELECT * FROM team_missions
    WHERE workspace_id = ? AND state IN ('planning','implementing','validating','reviewing')
    ORDER BY updated_at DESC LIMIT 1
  `);
  const teamWriter = createTeamTransactionWriter(db);
  const workMemoryWriter = createWorkMemoryCheckpointWriter(db);
  const auditWriter = createAuditEventWriter(db);

  return Object.freeze({
    commit(input: TeamTransitionWritePlan) {
      try {
        const committed = db.transaction((): TeamTransitionCommitResult => {
          let current: MissionRow | undefined;
          if (input.precondition.missionId) {
            current = readMission.get(input.precondition.missionId) as MissionRow | undefined;
          } else {
            current = readActiveMission.get(input.precondition.workspaceId) as MissionRow | undefined;
          }
          if (!preconditionMatches(current, input.precondition)) {
            throw appError('TEAM_TRANSITION_INVALID', 'Team transition precondition changed');
          }

          let missionId: string;
          let mission: TeamMissionRecord;
          if (input.mission.kind === 'create') {
            if (current) throw appError('TEAM_MISSION_CONFLICT', 'An active Team mission already owns this Workspace');
            const planned = input.mission.input;
            if (planned.workspaceId !== input.precondition.workspaceId) {
              throw appError('TEAM_TRANSITION_INVALID', 'Team transition Workspace precondition changed');
            }
            mission = teamWriter.createMission(planned);
            missionId = mission.id;
          } else {
            missionId = input.mission.missionId;
            if (!current || current.mission_id !== missionId) {
              throw appError('TEAM_TRANSITION_INVALID', 'Team transition mission precondition changed');
            }
            mission = teamWriter.updateMission(missionId, input.mission.patch);
          }

          if (input.workItems?.kind === 'replace') {
            if (input.workItems.missionId !== missionId) {
              throw appError('TEAM_TRANSITION_INVALID', 'Team work-item mission mismatch');
            }
            teamWriter.replaceWorkItems(missionId, input.workItems.items, input.workItems.nowIso);
          } else if (input.workItems?.kind === 'patch') {
            if (input.workItems.missionId !== missionId) {
              throw appError('TEAM_TRANSITION_INVALID', 'Team work-item mission mismatch');
            }
            teamWriter.patchWorkItems(missionId, input.workItems.items);
          }

          if (input.findings) teamWriter.replaceFindings(missionId, input.findings);

          if (input.handoff) {
            if (input.handoff.missionId !== missionId) {
              throw appError('TEAM_TRANSITION_INVALID', 'Team handoff mission mismatch');
            }
            teamWriter.addHandoff(missionId, input.handoff.value);
          }

          if (input.checkpoint.workspaceId !== input.precondition.workspaceId) {
            throw appError('TEAM_TRANSITION_INVALID', 'Work Memory Workspace mismatch');
          }
          const checkpoint = workMemoryWriter.saveCheckpoint(input.checkpoint);

          auditWriter.append({
            ...input.audit,
            metadata: {
              ...input.audit.metadata,
              missionId,
              workspaceId: input.precondition.workspaceId,
            },
          });
          return { mission, checkpoint };

        })();
        return ok(committed);
      } catch (error) {
        if (isAppError(error)) return err(error);
        return err(appError('INTERNAL_ERROR', 'Failed to commit Team transition'));
      }
    },
  });
}

function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null || !('code' in value) || !('message' in value)) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.message === 'string'
    && (candidate.code === 'TEAM_TRANSITION_INVALID'
      || candidate.code === 'TEAM_MISSION_CONFLICT'
      || candidate.code === 'INTERNAL_ERROR');
}