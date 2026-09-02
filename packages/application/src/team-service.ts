import {
  appError,
  err,
  isTeamTerminalState,
  ok,
  TEAM_BLOCKED_REASONS,
  TEAM_FINDING_SEVERITIES,
  TEAM_LIMITS,
  TEAM_WORK_ITEM_STATUSES,
  type AppError,
  type AuditEvent,
  type Result,
  type TeamBlockedReason,
  type TeamFindingSeverity,
  type TeamFreshnessRef,
  type TeamMissionRecord,
  type TeamMissionView,
  type TeamSubmissionOutcome,
  type Workspace,
} from '@sud-d/domain';
import type {
  NewTeamFinding,
  NewTeamWorkItem,
  TeamRepository,
  WorkspaceRepository,
} from '@sud-d/infrastructure';

export interface TeamFreshnessPort {
  current(workspace: Workspace): Result<TeamFreshnessRef, AppError>;
}

export interface TeamAuditPort {
  append(event: Omit<AuditEvent, 'id'>): unknown;
}

export interface TeamServiceDependencies {
  readonly teamRepo: TeamRepository;
  readonly workspaceRepo: WorkspaceRepository;
  readonly audit: TeamAuditPort;
  readonly freshness?: TeamFreshnessPort;
  readonly now?: () => Date;
}

export interface TeamStartInput {
  readonly goal: string;
}

export interface TeamPlanWorkItemInput {
  readonly title: string;
  readonly targetPathHint?: string;
}

export interface TeamReviewerFindingInput {
  readonly severity: TeamFindingSeverity;
  readonly summary: string;
  readonly targetPathHint?: string;
  readonly expectedCorrection?: string;
}

export type TeamSubmitInput =
  | {
      readonly outcome: 'plan_ready';
      readonly summary: string;
      readonly workItems: readonly TeamPlanWorkItemInput[];
    }
  | {
      readonly outcome: 'implementation_ready';
      readonly summary: string;
    }
  | {
      readonly outcome: 'complete';
      readonly summary: string;
    }
  | {
      readonly outcome: 'changes_requested';
      readonly summary: string;
      readonly findings: readonly TeamReviewerFindingInput[];
    }
  | {
      readonly outcome: 'blocked';
      readonly blockedReason: TeamBlockedReason;
      readonly summary: string;
    };

export interface TeamStatusInput {
  readonly missionId?: string;
}

export interface TeamStopInput {
  readonly missionId?: string;
}

export interface TeamService {
  start(input: TeamStartInput): Result<TeamMissionView, AppError>;
  status(input?: TeamStatusInput): Result<TeamMissionView | null, AppError>;
  submit(input: TeamSubmitInput): Result<TeamMissionView, AppError>;
  stop(input?: TeamStopInput): Result<TeamMissionView, AppError>;
}

const DEFAULT_FRESHNESS: TeamFreshnessRef = Object.freeze({ kind: 'none', value: 'none' });

export function createTeamService(dependencies: TeamServiceDependencies): TeamService {
  const now = dependencies.now ?? (() => new Date());

  const service: TeamService = {
    start(input) {
      const workspace = getActiveWorkspace(dependencies.workspaceRepo);
      if (!workspace.ok) return workspace;
      const summary = sanitizeText(input.goal, TEAM_LIMITS.maxGoalSummaryChars);
      if (!summary) return err(appError('VALIDATION_FAILED', 'Team mission goal is required'));
      const active = dependencies.teamRepo.findActiveByWorkspace(workspace.value.id);
      if (!active.ok) return active;
      if (active.value) return err(appError('TEAM_MISSION_CONFLICT', 'An active Team mission already owns this Workspace'));
      const freshness = currentFreshness(dependencies, workspace.value);
      if (!freshness.ok) return freshness;
      const created = dependencies.teamRepo.createMission({
        workspaceId: workspace.value.id,
        goalSummary: summary,
        freshness: freshness.value,
        createdAt: now().toISOString(),
      });
      if (!created.ok) return created;
      const audit = appendTeamAudit(dependencies.audit, created.value, 'team.mission_started', 'TEAM_MISSION_STARTED', {
        missionId: created.value.id,
        workspaceId: created.value.workspaceId,
        state: created.value.state,
        role: created.value.currentRole ?? 'none',
      });
      if (!audit.ok) return audit;
      return view(dependencies.teamRepo, created.value);
    },

    status(input = {}) {
      const mission = input.missionId
        ? dependencies.teamRepo.findById(input.missionId)
        : activeMission(dependencies);
      if (!mission.ok) return mission;
      return mission.value ? view(dependencies.teamRepo, mission.value) : ok(null);
    },

    submit(input) {
      const mission = activeMission(dependencies);
      if (!mission.ok) return mission;
      if (!mission.value) return err(appError('TEAM_MISSION_NOT_FOUND', 'No active Team mission is available'));
      if (isTeamTerminalState(mission.value.state)) return err(appError('TEAM_TRANSITION_INVALID', 'Terminal Team mission cannot transition'));
      const workspace = dependencies.workspaceRepo.findById(mission.value.workspaceId);
      if (!workspace || !workspace.isActive) {
        return blockMission(dependencies, mission.value, 'WORKSPACE_STALE', 'Active Workspace changed or disappeared');
      }
      const fresh = currentFreshness(dependencies, workspace);
      if (!fresh.ok) return fresh;
      if (mission.value.freshnessValue !== fresh.value.value || mission.value.freshnessKind !== fresh.value.kind) {
        return blockMission(dependencies, mission.value, fresh.value.kind === 'git_status' ? 'GIT_STATE_STALE' : 'WORKSPACE_STALE', 'Workspace state changed; reread before continuing');
      }

      switch (input.outcome) {
        case 'plan_ready':
          if (mission.value.state !== 'planning' || mission.value.currentRole !== 'planner') return invalidTransition();
          return plannerReady(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'implementation_ready':
          if (mission.value.state !== 'implementing' || mission.value.currentRole !== 'implementer') return invalidTransition();
          return transitionWithHandoff(dependencies, mission.value, input.outcome, input.summary, {
            state: 'reviewing', currentRole: 'reviewer', reviewRound: mission.value.reviewRound, freshness: fresh.value,
          }, now().toISOString(), 'team.role_transitioned', 'TEAM_ROLE_TRANSITIONED');
        case 'changes_requested':
          if (mission.value.state !== 'reviewing' || mission.value.currentRole !== 'reviewer') return invalidTransition();
          if (mission.value.reviewRound >= TEAM_LIMITS.maxReviewRoundTrips) {
            return blockMission(dependencies, mission.value, 'REVIEW_LOOP_LIMIT', 'Reviewer return loop limit reached');
          }
          return reviewerChangesRequested(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'complete':
          if (mission.value.state !== 'reviewing' || mission.value.currentRole !== 'reviewer') return invalidTransition();
          return transitionWithHandoff(dependencies, mission.value, input.outcome, input.summary, {
            state: 'completed', reviewRound: mission.value.reviewRound, completedAt: now().toISOString(), freshness: fresh.value,
          }, now().toISOString(), 'team.mission_completed', 'TEAM_MISSION_COMPLETED');
        case 'blocked':
          if (!TEAM_BLOCKED_REASONS.includes(input.blockedReason)) return invalidTransition();
          return blockMission(dependencies, mission.value, input.blockedReason, input.summary);
      }
    },

    stop(input = {}) {
      const mission = input.missionId
        ? dependencies.teamRepo.findById(input.missionId)
        : activeMission(dependencies);
      if (!mission.ok) return mission;
      if (!mission.value) return err(appError('TEAM_MISSION_NOT_FOUND', 'No active Team mission is available'));
      if (isTeamTerminalState(mission.value.state)) return err(appError('TEAM_TRANSITION_INVALID', 'Terminal Team mission cannot be stopped again'));
      const stoppedAt = now().toISOString();
      const updated = dependencies.teamRepo.updateMission(mission.value.id, {
        state: 'stopped',
        reviewRound: mission.value.reviewRound,
        stoppedAt,
        updatedAt: stoppedAt,
      });
      if (!updated.ok) return updated;
      const audit = appendTeamAudit(dependencies.audit, updated.value, 'team.mission_stopped', 'TEAM_MISSION_STOPPED', {
        missionId: updated.value.id,
        workspaceId: updated.value.workspaceId,
        state: updated.value.state,
      });
      if (!audit.ok) return audit;
      return view(dependencies.teamRepo, updated.value);
    },
  };
  return Object.freeze(service);
}

function plannerReady(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  input: Extract<TeamSubmitInput, { outcome: 'plan_ready' }>,
  freshness: TeamFreshnessRef,
  nowIso: string,
): Result<TeamMissionView, AppError> {
  const workItems = normalizeWorkItems(input.workItems);
  if (!workItems.ok) return workItems;
  const persistedItems = dependencies.teamRepo.replaceWorkItems(mission.id, workItems.value, nowIso);
  if (!persistedItems.ok) return persistedItems;
  return transitionWithHandoff(dependencies, mission, input.outcome, input.summary, {
    state: 'implementing', currentRole: 'implementer', currentStepId: persistedItems.value[0]?.id, reviewRound: mission.reviewRound, freshness,
  }, nowIso, 'team.role_transitioned', 'TEAM_ROLE_TRANSITIONED');
}

function reviewerChangesRequested(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  input: Extract<TeamSubmitInput, { outcome: 'changes_requested' }>,
  freshness: TeamFreshnessRef,
  nowIso: string,
): Result<TeamMissionView, AppError> {
  const findings = normalizeFindings(input.findings, nowIso);
  if (!findings.ok) return findings;
  const persisted = dependencies.teamRepo.replaceFindings(mission.id, findings.value);
  if (!persisted.ok) return persisted;
  return transitionWithHandoff(dependencies, mission, input.outcome, input.summary, {
    state: 'implementing', currentRole: 'implementer', currentStepId: undefined, reviewRound: mission.reviewRound + 1, freshness,
  }, nowIso, 'team.review_returned', 'TEAM_REVIEW_RETURNED');
}

function transitionWithHandoff(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  outcome: TeamSubmissionOutcome,
  summary: string,
  patch: Omit<Parameters<TeamRepository['updateMission']>[1], 'updatedAt'>,
  nowIso: string,
  action: string,
  resultCode: string,
): Result<TeamMissionView, AppError> {
  const safeSummary = sanitizeText(summary, TEAM_LIMITS.maxSummaryChars);
  if (!safeSummary) return err(appError('VALIDATION_FAILED', 'Team role summary is required'));
  const handoff = dependencies.teamRepo.addHandoff(mission.id, {
    fromRole: mission.currentRole ?? 'planner',
    outcome,
    summary: safeSummary,
    createdAt: nowIso,
  });
  if (!handoff.ok) return handoff;
  const updated = dependencies.teamRepo.updateMission(mission.id, { ...patch, updatedAt: nowIso });
  if (!updated.ok) return updated;
  const audit = appendTeamAudit(dependencies.audit, updated.value, action, resultCode, {
    missionId: updated.value.id,
    workspaceId: updated.value.workspaceId,
    state: updated.value.state,
    role: updated.value.currentRole ?? 'none',
    reviewRound: updated.value.reviewRound,
  });
  if (!audit.ok) return audit;
  return view(dependencies.teamRepo, updated.value);
}

function blockMission(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  reason: TeamBlockedReason,
  summary: string,
): Result<TeamMissionView, AppError> {
  const nowIso = (dependencies.now ?? (() => new Date()))().toISOString();
  const updated = dependencies.teamRepo.updateMission(mission.id, {
    state: 'blocked',
    reviewRound: mission.reviewRound,
    blockedReason: reason,
    blockedReasonSummary: sanitizeText(summary, TEAM_LIMITS.maxSummaryChars) || reason,
    updatedAt: nowIso,
  });
  if (!updated.ok) return updated;
  const audit = appendTeamAudit(dependencies.audit, updated.value, reason === 'GIT_STATE_STALE' || reason === 'WORKSPACE_STALE' ? 'team.stale_state_detected' : 'team.mission_blocked', reason === 'GIT_STATE_STALE' || reason === 'WORKSPACE_STALE' ? 'TEAM_STALE' : 'TEAM_MISSION_BLOCKED', {
    missionId: updated.value.id,
    workspaceId: updated.value.workspaceId,
    state: updated.value.state,
    reason,
    reviewRound: updated.value.reviewRound,
  });
  if (!audit.ok) return audit;
  return view(dependencies.teamRepo, updated.value);
}

function activeMission(dependencies: TeamServiceDependencies): Result<TeamMissionRecord | undefined, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  return dependencies.teamRepo.findActiveByWorkspace(workspace.value.id);
}

function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Result<Workspace, AppError> {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    return active.length === 1
      ? ok(active[0]!)
      : err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to resolve active Workspace'));
  }
}

function currentFreshness(
  dependencies: TeamServiceDependencies,
  workspace: Workspace,
): Result<TeamFreshnessRef, AppError> {
  return dependencies.freshness?.current(workspace) ?? ok(DEFAULT_FRESHNESS);
}

function view(teamRepo: TeamRepository, mission: TeamMissionRecord): Result<TeamMissionView, AppError> {
  const workItems = teamRepo.listWorkItems(mission.id);
  if (!workItems.ok) return workItems;
  const handoffs = teamRepo.listHandoffs(mission.id, TEAM_LIMITS.maxTimelineItems);
  if (!handoffs.ok) return handoffs;
  const findings = teamRepo.listFindings(mission.id);
  if (!findings.ok) return findings;
  return ok({
    missionId: mission.id,
    workspaceId: mission.workspaceId,
    goalSummary: mission.goalSummary,
    state: mission.state,
    ...(mission.currentRole ? { currentRole: mission.currentRole } : {}),
    ...(mission.currentStepId ? { currentStepId: mission.currentStepId } : {}),
    reviewRound: mission.reviewRound,
    ...(mission.blockedReason ? { blockedReason: mission.blockedReason } : {}),
    ...(mission.blockedReasonSummary ? { blockedReasonSummary: mission.blockedReasonSummary } : {}),
    freshness: { kind: mission.freshnessKind, value: mission.freshnessValue },
    workItems: workItems.value,
    handoffs: handoffs.value,
    findings: findings.value,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
    ...(mission.completedAt ? { completedAt: mission.completedAt } : {}),
    ...(mission.stoppedAt ? { stoppedAt: mission.stoppedAt } : {}),
  });
}

function normalizeWorkItems(items: readonly TeamPlanWorkItemInput[]): Result<readonly NewTeamWorkItem[], AppError> {
  if (!Array.isArray(items) || items.length < 1 || items.length > TEAM_LIMITS.maxWorkItems) {
    return err(appError('VALIDATION_FAILED', 'Planner must provide bounded work items'));
  }
  const normalized: NewTeamWorkItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const title = sanitizeText(items[index]!.title, TEAM_LIMITS.maxWorkItemTitleChars);
    if (!title) return err(appError('VALIDATION_FAILED', 'Work item title is required'));
    const targetPathHint = normalizeTargetPath(items[index]!.targetPathHint);
    if (!targetPathHint.ok) return targetPathHint;
    normalized.push({
      sequence: index + 1,
      title,
      status: TEAM_WORK_ITEM_STATUSES[0],
      ...(targetPathHint.value ? { targetPathHint: targetPathHint.value } : {}),
    });
  }
  return ok(normalized);
}

function normalizeFindings(findings: readonly TeamReviewerFindingInput[], nowIso: string): Result<readonly NewTeamFinding[], AppError> {
  if (!Array.isArray(findings) || findings.length < 1 || findings.length > TEAM_LIMITS.maxFindings) {
    return err(appError('VALIDATION_FAILED', 'Reviewer findings must be bounded'));
  }
  const normalized: NewTeamFinding[] = [];
  for (const finding of findings) {
    if (!TEAM_FINDING_SEVERITIES.includes(finding.severity)) return err(appError('VALIDATION_FAILED', 'Reviewer finding severity is invalid'));
    const summary = sanitizeText(finding.summary, TEAM_LIMITS.maxFindingSummaryChars);
    if (!summary) return err(appError('VALIDATION_FAILED', 'Reviewer finding summary is required'));
    const targetPathHint = normalizeTargetPath(finding.targetPathHint);
    if (!targetPathHint.ok) return targetPathHint;
    const expectedCorrection = finding.expectedCorrection
      ? sanitizeText(finding.expectedCorrection, TEAM_LIMITS.maxFindingSummaryChars)
      : undefined;
    normalized.push({
      severity: finding.severity,
      summary,
      ...(targetPathHint.value ? { targetPathHint: targetPathHint.value } : {}),
      ...(expectedCorrection ? { expectedCorrection } : {}),
      createdAt: nowIso,
    });
  }
  return ok(normalized);
}

function normalizeTargetPath(value: string | undefined): Result<string | undefined, AppError> {
  if (value === undefined) return ok(undefined);
  if (typeof value !== 'string' || value.length > TEAM_LIMITS.maxTargetPathChars || value.includes('\0')) {
    return err(appError('VALIDATION_FAILED', 'Target path hint is invalid'));
  }
  const trimmed = value.trim().replaceAll('\\', '/');
  if (!trimmed) return ok(undefined);
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed) || trimmed.split('/').includes('..')) {
    return err(appError('VALIDATION_FAILED', 'Target path hint must be workspace-relative'));
  }
  return ok(trimmed);
}

const CONTROL_CHARACTER_PATTERN = new RegExp(String.raw`[\u0000-\u001f\u007f]+`, 'g');

function sanitizeText(input: string, maxChars: number): string {
  return input
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,}|SENTINEL_[A-Z0-9_]+)\b/g, '[REDACTED]')
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function appendTeamAudit(
  audit: TeamAuditPort,
  mission: TeamMissionRecord,
  action: string,
  resultCode: string,
  metadata: Record<string, string | number | boolean>,
): Result<void, AppError> {
  try {
    audit.append({
      timestamp: new Date(mission.updatedAt),
      sessionId: 'team-mode',
      sessionType: 'mcp-stdio',
      action,
      workspaceId: mission.workspaceId,
      policyDecision: 'allow',
      resultCode,
      durationMs: 0,
      metadata,
    });
    return ok(undefined);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to audit Team transition'));
  }
}

function invalidTransition(): Result<never, AppError> {
  return err(appError('TEAM_TRANSITION_INVALID', 'Team mission transition is invalid'));
}
