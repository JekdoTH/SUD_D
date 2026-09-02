import type { TeamService } from '@sud-d/application';
import { appError, err, ok, type AppError, type Result, type TeamMissionView } from '@sud-d/domain';
import type { DesktopTeamMissionDto, TeamStatusInput, TeamStopInput } from '@sud-d/contracts';

export interface DesktopTeamController {
  status(input: TeamStatusInput): Result<DesktopTeamMissionDto | null, AppError>;
  stop(input: TeamStopInput): Result<DesktopTeamMissionDto, AppError>;
}

export function createDesktopTeamController(teamService: TeamService): DesktopTeamController {
  return Object.freeze({
    status(input: TeamStatusInput) {
      const result = teamService.status(input);
      if (!result.ok) return result;
      return ok(result.value ? toDesktopTeamMission(result.value) : null);
    },
    stop(input: TeamStopInput) {
      const result = teamService.stop(input);
      if (!result.ok) return result;
      if (!result.value) return err(appError('TEAM_MISSION_NOT_FOUND', 'No active Team mission is available'));
      return ok(toDesktopTeamMission(result.value));
    },
  });
}

function toDesktopTeamMission(view: TeamMissionView): DesktopTeamMissionDto {
  return {
    missionId: view.missionId,
    workspaceId: view.workspaceId,
    goalSummary: view.goalSummary,
    state: view.state,
    ...(view.currentRole ? { currentRole: view.currentRole } : {}),
    ...(view.currentStepId ? { currentStepId: view.currentStepId } : {}),
    reviewRound: view.reviewRound,
    ...(view.blockedReason ? { blockedReason: view.blockedReason } : {}),
    ...(view.blockedReasonSummary ? { blockedReasonSummary: view.blockedReasonSummary } : {}),
    ...(view.freshness ? { freshnessKind: view.freshness.kind, freshnessValue: view.freshness.value } : {}),
    workItems: view.workItems.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      title: item.title,
      status: item.status,
      ...(item.targetPathHint ? { targetPathHint: item.targetPathHint } : {}),
    })),
    handoffs: view.handoffs.map((handoff) => ({
      id: handoff.id,
      fromRole: handoff.fromRole,
      outcome: handoff.outcome,
      summary: handoff.summary,
      createdAt: handoff.createdAt,
    })),
    findings: view.findings.map((finding) => ({
      id: finding.id,
      severity: finding.severity,
      summary: finding.summary,
      ...(finding.targetPathHint ? { targetPathHint: finding.targetPathHint } : {}),
      ...(finding.expectedCorrection ? { expectedCorrection: finding.expectedCorrection } : {}),
      createdAt: finding.createdAt,
    })),
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    ...(view.completedAt ? { completedAt: view.completedAt } : {}),
    ...(view.stoppedAt ? { stoppedAt: view.stoppedAt } : {}),
  };
}
