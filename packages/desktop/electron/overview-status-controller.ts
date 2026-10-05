import type {
  DesktopActivityEventDto,
  DesktopOverviewWorkStatusDto,
  DesktopTeamMissionDto,
} from '@sud-d/contracts';
import {
  appError,
  ok,
  type AppError,
  type Result,
  type WorkResumeContext,
  type Workspace,
} from '@sud-d/domain';

interface OverviewWorkspaceReader {
  list(): readonly Workspace[];
}

interface OverviewGitStatus {
  readonly branch?: string;
  readonly detached: boolean;
  readonly clean: boolean;
  readonly entries: readonly unknown[];
  readonly truncated: boolean;
}

interface OverviewGitReader {
  status(workspaceCanonicalRoot: string, limit?: number): Result<OverviewGitStatus, AppError>;
}

interface OverviewWorkMemoryReader {
  loadCurrent(workspaceId: string): Result<
    Pick<WorkResumeContext, 'workspaceId' | 'goal' | 'task' | 'nextAction' | 'updatedAt'> | undefined,
    AppError
  >;
}

type OverviewTeamMission = Pick<
  DesktopTeamMissionDto,
  'missionId'
  | 'workspaceId'
  | 'goalSummary'
  | 'state'
  | 'currentRole'
  | 'nextAction'
  | 'taskCount'
  | 'currentTaskSequence'
  | 'updatedAt'
>;

interface OverviewTeamReader {
  status(): Result<OverviewTeamMission | null, AppError>;
}

interface OverviewApprovalRecord {
  readonly workspaceId?: string;
  readonly capability: string;
  readonly createdAt: string;
}

interface OverviewApprovalReader {
  list(): Result<readonly OverviewApprovalRecord[], AppError>;
}

interface OverviewActivityReader {
  listForWorkspace(
    workspaceId: string,
    limit: number,
  ): Result<readonly Pick<DesktopActivityEventDto, 'timestamp' | 'title' | 'resultCode'>[], AppError>;
}

export interface DesktopOverviewStatusDependencies {
  readonly workspaceReader: OverviewWorkspaceReader;
  readonly gitReader: OverviewGitReader;
  readonly workMemoryReader: OverviewWorkMemoryReader;
  readonly teamReader: OverviewTeamReader;
  readonly approvalReader: OverviewApprovalReader;
  readonly activityReader: OverviewActivityReader;
}

export interface DesktopOverviewStatusController {
  workStatus(): Result<DesktopOverviewWorkStatusDto, AppError>;
}

const DISPLAY_SUMMARY_MAX_CHARS = 240;

function displaySummary(value: string, maxChars = DISPLAY_SUMMARY_MAX_CHARS): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 1)}…`;
}

export function createDesktopOverviewStatusController(
  dependencies: DesktopOverviewStatusDependencies,
): DesktopOverviewStatusController {
  return Object.freeze({
    workStatus(): Result<DesktopOverviewWorkStatusDto, AppError> {
      try {
        const workspace = dependencies.workspaceReader.list().find((candidate) => candidate.isActive);
        if (!workspace) {
          return ok({
            git: { availability: 'unavailable' },
            checkpoint: { availability: 'none' },
            team: { availability: 'unavailable' },
            approval: { availability: 'unavailable' },
            latestActivity: { availability: 'unavailable' },
          });
        }

        const gitStatus = dependencies.gitReader.status(workspace.canonicalRoot, 500);
        const checkpoint = dependencies.workMemoryReader.loadCurrent(workspace.id);
        const team = dependencies.teamReader.status();
        const approvals = dependencies.approvalReader.list();
        const activity = dependencies.activityReader.listForWorkspace(workspace.id, 50);
        const latestObserved = activity.ok ? activity.value[0] : undefined;

        const matchingApprovals = approvals.ok
          ? approvals.value.filter((request) => request.workspaceId === workspace.id).slice(0, 50)
          : [];
        const latestApproval = matchingApprovals.reduce<OverviewApprovalRecord | undefined>(
          (latest, request) => !latest || request.createdAt > latest.createdAt ? request : latest,
          undefined,
        );

        return ok({
          workspaceId: workspace.id,
          git: gitStatus.ok
            ? {
                availability: 'available',
                ...(gitStatus.value.branch ? { branch: gitStatus.value.branch } : {}),
                detached: gitStatus.value.detached,
                clean: gitStatus.value.clean,
                changedFiles: gitStatus.value.entries.length,
                truncated: gitStatus.value.truncated,
              }
            : { availability: 'unavailable' },
          checkpoint: checkpoint.ok
            ? checkpoint.value
              ? checkpoint.value.workspaceId === workspace.id
                ? {
                    availability: 'available',
                    taskStatus: checkpoint.value.task.status,
                    goalSummary: displaySummary(checkpoint.value.goal),
                    taskSummary: displaySummary(checkpoint.value.task.title),
                    nextActionSummary: displaySummary(checkpoint.value.nextAction),
                    updatedAt: checkpoint.value.updatedAt,
                  }
                : { availability: 'unavailable' }
              : { availability: 'none' }
            : { availability: 'unavailable' },
          team: team.ok
            ? team.value
              ? team.value.workspaceId === workspace.id
                ? {
                    availability: 'available',
                    mission: {
                      missionId: team.value.missionId,
                      workspaceId: team.value.workspaceId,
                      goalSummary: displaySummary(team.value.goalSummary),
                      state: team.value.state,
                      ...(team.value.currentRole ? { currentRole: team.value.currentRole } : {}),
                      nextAction: displaySummary(team.value.nextAction),
                      taskCount: team.value.taskCount,
                      ...(team.value.currentTaskSequence ? { currentTaskSequence: team.value.currentTaskSequence } : {}),
                      updatedAt: team.value.updatedAt,
                    },
                  }
                : { availability: 'unavailable' }
              : { availability: 'available', mission: null }
            : { availability: 'unavailable' },
          approval: approvals.ok
            ? {
                availability: 'available',
                pendingCount: matchingApprovals.length,
                pendingTeamStart: matchingApprovals.some((request) => request.capability === 'team.start'),
                ...(latestApproval ? { latestCreatedAt: latestApproval.createdAt } : {}),
              }
            : { availability: 'unavailable' },
          latestActivity: activity.ok
            ? latestObserved
              ? {
                  availability: 'available',
                  operationSummary: displaySummary(latestObserved.title, 120),
                  resultSummary: displaySummary(latestObserved.resultCode, 96),
                  observedAt: latestObserved.timestamp,
                }
              : { availability: 'none' }
            : { availability: 'unavailable' },
        });
      } catch {
        return {
          ok: false,
          error: appError('INTERNAL_ERROR', 'Overview work status is unavailable'),
        };
      }
    },
  });
}
