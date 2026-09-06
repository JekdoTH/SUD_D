import { randomUUID } from 'node:crypto';
import {
  appError,
  err,
  isTeamTerminalState,
  ok,
  TEAM_BLOCKED_REASONS,
  TEAM_FINDING_SEVERITIES,
  TEAM_LIMITS,
  WORK_MEMORY_LIMITS,
  type AppError,
  type AuditEvent,
  type Result,
  type TeamBlockedReason,
  type TeamFindingSeverity,
  type TeamFreshnessRef,
  type TeamMissionRecord,
  type TeamMissionView,
  type TeamRole,
  type TeamState,
  type TeamWorkItemRecord,
  type Workspace,
} from '@sud-d/domain';
import type {
  NewTeamFinding,
  NewTeamWorkItem,
  TeamRepository,
  TeamTransitionUnitOfWork,
  WorkMemoryCheckpointDraft,
  WorkspaceRepository,
} from '@sud-d/infrastructure';

import { deriveTeamWorkMemoryCheckpoint } from './team-continuation.js';

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
  readonly transitionUow: TeamTransitionUnitOfWork;
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
      readonly outcome: 'work_ready';
      readonly summary: string;
    }
  | {
      readonly outcome: 'validation_passed';
      readonly summary: string;
      readonly verification?: readonly string[];
    }
  | {
      readonly outcome: 'validation_failed';
      readonly summary: string;
      readonly verification?: readonly string[];
      readonly findings: readonly TeamReviewerFindingInput[];
    }
  | {
      readonly outcome: 'task_approved';
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
      const nowIso = now().toISOString();
        const pendingMission: TeamMissionRecord = {
          id: 'pending-team-mission',
          workspaceId: workspace.value.id,
          goalSummary: summary,
          state: 'planning',
          currentRole: 'planner',
          reviewRound: 0,
          freshnessKind: freshness.value.kind,
          freshnessValue: freshness.value.value,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        const checkpoint = deriveTeamWorkMemoryCheckpoint({
          mission: pendingMission,
          workItems: [],
          handoffs: [],
          findings: [],
          verification: [],
        });
        if (!checkpoint.ok) return checkpoint;
        const committed = dependencies.transitionUow.commit({
          precondition: { workspaceId: workspace.value.id },
          mission: {
            kind: 'create',
            input: {
              workspaceId: workspace.value.id,
              goalSummary: summary,
              freshness: freshness.value,
              createdAt: nowIso,
            },
          },
          checkpoint: checkpoint.value,
          audit: {
            timestamp: new Date(nowIso),
            sessionId: 'team-mode',
            sessionType: 'mcp-stdio',
            action: 'team.mission_started',
            workspaceId: workspace.value.id,
            policyDecision: 'allow',
            resultCode: 'TEAM_MISSION_STARTED',
            durationMs: 0,
            metadata: { state: 'planning', role: 'planner' },
          },
        });
        if (!committed.ok) return committed;
        return view(dependencies.teamRepo, committed.value.mission);
    },

    status(input = {}) {
      const mission = missionForActiveWorkspace(dependencies, input.missionId);
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
      const freshnessRule = freshnessRuleForOutcome(input.outcome);
      const fresh = freshnessRule === 'workspace_identity_only'
        ? ok<TeamFreshnessRef>({ kind: mission.value.freshnessKind, value: mission.value.freshnessValue })
        : currentFreshness(dependencies, workspace);
      if (!fresh.ok) return fresh;
      if (
        freshnessRule === 'must_match'
        && (mission.value.freshnessValue !== fresh.value.value || mission.value.freshnessKind !== fresh.value.kind)
      ) {
        return blockMission(dependencies, mission.value, fresh.value.kind === 'git_status' ? 'GIT_STATE_STALE' : 'WORKSPACE_STALE', 'Workspace state changed; reread before continuing');
      }

      switch (input.outcome) {
        case 'plan_ready':
          if (mission.value.state !== 'planning' || mission.value.currentRole !== 'planner') return invalidTransition();
          return plannerReady(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'work_ready':
          if (mission.value.state !== 'implementing' || mission.value.currentRole !== 'implementer') return invalidTransition();
          return v3TaskTransition(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'validation_passed':
        case 'validation_failed':
          if (mission.value.state !== 'validating' || mission.value.currentRole !== 'validator') return invalidTransition();
          return v3TaskTransition(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'task_approved':
        case 'changes_requested':
          if (mission.value.state !== 'reviewing' || mission.value.currentRole !== 'reviewer') return invalidTransition();
          return v3TaskTransition(dependencies, mission.value, input, fresh.value, now().toISOString());
        case 'blocked':
          if (!TEAM_BLOCKED_REASONS.includes(input.blockedReason)) return invalidTransition();
          return blockMission(dependencies, mission.value, input.blockedReason, input.summary);
      }    },

    stop(input = {}) {
      const mission = missionForActiveWorkspace(dependencies, input.missionId);
      if (!mission.ok) return mission;
      if (!mission.value) return err(appError('TEAM_MISSION_NOT_FOUND', 'No active Team mission is available'));
      if (isTeamTerminalState(mission.value.state)) return err(appError('TEAM_TRANSITION_INVALID', 'Terminal Team mission cannot be stopped again'));
      const stoppedAt = now().toISOString();
        const workItems = dependencies.teamRepo.listWorkItems(mission.value.id);
        if (!workItems.ok) return workItems;
        const nextMission: TeamMissionRecord = {
          id: mission.value.id,
          workspaceId: mission.value.workspaceId,
          goalSummary: mission.value.goalSummary,
          state: 'stopped',
          ...(mission.value.currentStepId ? { currentStepId: mission.value.currentStepId } : {}),
          reviewRound: mission.value.reviewRound,
          freshnessKind: mission.value.freshnessKind,
          freshnessValue: mission.value.freshnessValue,
          createdAt: mission.value.createdAt,
          updatedAt: stoppedAt,
          stoppedAt,
        };
        const checkpoint = deriveTeamWorkMemoryCheckpoint({ mission: nextMission, workItems: workItems.value, handoffs: [], findings: [], verification: [] });
        if (!checkpoint.ok) return checkpoint;
        const committed = dependencies.transitionUow.commit({
          precondition: {
            missionId: mission.value.id,
            workspaceId: mission.value.workspaceId,
            expectedState: mission.value.state,
            ...(mission.value.currentRole ? { expectedRole: mission.value.currentRole } : {}),
            ...(mission.value.currentStepId ? { expectedCurrentStepId: mission.value.currentStepId } : {}),
          },
          mission: {
            kind: 'update',
            missionId: mission.value.id,
            patch: {
              state: 'stopped',
              ...(mission.value.currentStepId ? { currentStepId: mission.value.currentStepId } : {}),
              reviewRound: mission.value.reviewRound,
              stoppedAt,
              updatedAt: stoppedAt,
            },
          },
          checkpoint: checkpoint.value,
          audit: {
            timestamp: new Date(stoppedAt),
            sessionId: 'team-mode',
            sessionType: 'mcp-stdio',
            action: 'team.mission_stopped',
            workspaceId: mission.value.workspaceId,
            policyDecision: 'allow',
            resultCode: 'TEAM_MISSION_STOPPED',
            durationMs: 0,
            metadata: { state: 'stopped' },
          },
        });
        if (!committed.ok) return committed;
        return view(dependencies.teamRepo, committed.value.mission);
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
    const safeSummary = sanitizeText(input.summary, TEAM_LIMITS.maxSummaryChars);
    if (!safeSummary) return err(appError('VALIDATION_FAILED', 'Team role summary is required'));
    const prepared = workItems.value.map((item) => ({ ...item, id: randomUUID() }));
    const first = prepared[0];
    if (!first) return err(appError('VALIDATION_FAILED', 'Planner must provide bounded work items'));
    const records: TeamWorkItemRecord[] = prepared.map((item) => ({
      id: item.id,
      missionId: mission.id,
      sequence: item.sequence,
      title: item.title,
      status: item.status,
      reworkCount: 0,
      ...(item.targetPathHint ? { targetPathHint: item.targetPathHint } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    }));
    const nextMission: TeamMissionRecord = {
      ...mission,
      state: 'implementing',
      currentRole: 'implementer',
      currentStepId: first.id,
      freshnessKind: freshness.kind,
      freshnessValue: freshness.value,
      updatedAt: nowIso,
    };
    const checkpoint = deriveTeamWorkMemoryCheckpoint({
      mission: nextMission,
      workItems: records,
      handoffs: [],
      findings: [],
      verification: [],
    });
    if (!checkpoint.ok) return checkpoint;
    const committed = dependencies.transitionUow.commit({
      precondition: {
        missionId: mission.id,
        workspaceId: mission.workspaceId,
        expectedState: mission.state,
        expectedRole: 'planner',
        expectedFreshness: { kind: mission.freshnessKind, value: mission.freshnessValue },
      },
      mission: {
        kind: 'update',
        missionId: mission.id,
        patch: {
          state: 'implementing',
          currentRole: 'implementer',
          currentStepId: first.id,
          reviewRound: mission.reviewRound,
          freshness,
          updatedAt: nowIso,
        },
      },
      workItems: { kind: 'replace', missionId: mission.id, items: prepared, nowIso },
      handoff: {
        missionId: mission.id,
        value: { fromRole: 'planner', outcome: 'plan_ready', summary: safeSummary, createdAt: nowIso },
      },
      checkpoint: checkpoint.value,
      audit: {
        timestamp: new Date(nowIso),
        sessionId: 'team-mode',
        sessionType: 'mcp-stdio',
        action: 'team.plan_accepted',
        workspaceId: mission.workspaceId,
        policyDecision: 'allow',
        resultCode: 'TEAM_PLAN_ACCEPTED',
        durationMs: 0,
        metadata: { state: 'implementing', role: 'implementer', taskSequence: 1 },
      },
    });
    if (!committed.ok) return committed;
    return view(dependencies.teamRepo, committed.value.mission);
}
type ActiveTaskSubmitInput = Exclude<TeamSubmitInput, { readonly outcome: 'plan_ready' | 'blocked' }>;

function v3TaskTransition(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  input: ActiveTaskSubmitInput,
  freshness: TeamFreshnessRef,
  nowIso: string,
): Result<TeamMissionView, AppError> {
  const listed = dependencies.teamRepo.listWorkItems(mission.id);
  if (!listed.ok) return listed;
  const workItems = listed.value;
  const current = mission.currentStepId
    ? workItems.find((item) => item.id === mission.currentStepId)
    : undefined;
  if (!current || current.status === 'done' || current.status === 'blocked') return invalidTransition();

  const safeSummary = sanitizeText(input.summary, TEAM_LIMITS.maxSummaryChars);
  if (!safeSummary) return err(appError('VALIDATION_FAILED', 'Team role summary is required'));
  const verification = 'verification' in input
    ? normalizeVerificationEvidence(input.verification)
    : ok<readonly string[]>([]);
  if (!verification.ok) return verification;

  let state: TeamState;
  let role: TeamRole | undefined;
  let currentStepId: string | undefined = current.id;
  let completedAt: string | undefined;
  let workItemPatches: Array<{ id: string; status: TeamWorkItemRecord['status']; reworkCount?: number; updatedAt: string }> = [];
  let findings: readonly NewTeamFinding[] | undefined;
  let checkpointTask = current;
  let action = 'team.role_transitioned';
  let resultCode = 'TEAM_ROLE_TRANSITIONED';

  switch (input.outcome) {
    case 'work_ready':
      state = 'validating';
      role = 'validator';
      workItemPatches = [{ id: current.id, status: 'validating', updatedAt: nowIso }];
      action = 'team.worker_handoff';
      resultCode = 'TEAM_WORK_READY';
      break;
    case 'validation_passed':
      state = 'reviewing';
      role = 'reviewer';
      workItemPatches = [{ id: current.id, status: 'reviewing', updatedAt: nowIso }];
      action = 'team.validation_passed';
      resultCode = 'TEAM_VALIDATION_PASSED';
      break;
    case 'validation_failed': {
      if (current.reworkCount >= TEAM_LIMITS.maxReviewRoundTrips) {
        return blockMission(dependencies, mission, 'REVIEW_LOOP_LIMIT', 'Task return loop limit reached');
      }
      const normalized = normalizeFindings(input.findings, nowIso);
      if (!normalized.ok) return normalized;
      findings = normalized.value;
      state = 'implementing';
      role = 'implementer';
      workItemPatches = [{ id: current.id, status: 'in_progress', reworkCount: current.reworkCount + 1, updatedAt: nowIso }];
      action = 'team.validation_failed';
      resultCode = 'TEAM_VALIDATION_FAILED';
      break;
    }
    case 'changes_requested': {
      if (current.reworkCount >= TEAM_LIMITS.maxReviewRoundTrips) {
        return blockMission(dependencies, mission, 'REVIEW_LOOP_LIMIT', 'Task return loop limit reached');
      }
      const normalized = normalizeFindings(input.findings, nowIso);
      if (!normalized.ok) return normalized;
      findings = normalized.value;
      state = 'implementing';
      role = 'implementer';
      workItemPatches = [{ id: current.id, status: 'in_progress', reworkCount: current.reworkCount + 1, updatedAt: nowIso }];
      action = 'team.review_returned';
      resultCode = 'TEAM_REVIEW_RETURNED';
      break;
    }
    case 'task_approved': {
      const next = workItems.find((item) => item.sequence > current.sequence && item.status === 'pending');
      workItemPatches = [{ id: current.id, status: 'done', updatedAt: nowIso }];
      if (next) {
        workItemPatches.push({ id: next.id, status: 'in_progress', updatedAt: nowIso });
        state = 'implementing';
        role = 'implementer';
        currentStepId = next.id;
        checkpointTask = next;
        action = 'team.task_completed';
        resultCode = 'TEAM_NEXT_TASK_STARTED';
      } else {
        state = 'completed';
        role = undefined;
        currentStepId = undefined;
        completedAt = nowIso;
        action = 'team.mission_completed';
        resultCode = 'TEAM_MISSION_COMPLETED';
      }
      break;
    }
  }

  const checkpoint = taskTransitionCheckpoint({
    mission,
    workItems,
    state,
    task: checkpointTask,
    summary: safeSummary,
    verification: verification.value,
    nowIso,
    currentApproved: input.outcome === 'task_approved' ? current : undefined,
  });
  const committed = dependencies.transitionUow.commit({
    precondition: {
      missionId: mission.id,
      workspaceId: mission.workspaceId,
      expectedState: mission.state,
      ...(mission.currentRole ? { expectedRole: mission.currentRole } : {}),
      ...(mission.currentStepId ? { expectedCurrentStepId: mission.currentStepId } : {}),
      expectedFreshness: { kind: mission.freshnessKind, value: mission.freshnessValue },
    },
    mission: {
      kind: 'update',
      missionId: mission.id,
      patch: {
        state,
        ...(role ? { currentRole: role } : {}),
        ...(currentStepId ? { currentStepId } : {}),
        reviewRound: mission.reviewRound,
        freshness,
        ...(completedAt ? { completedAt } : {}),
        updatedAt: nowIso,
      },
    },
    workItems: { kind: 'patch', missionId: mission.id, items: workItemPatches },
    ...(findings ? { findings } : {}),
    handoff: {
      missionId: mission.id,
      value: {
        fromRole: mission.currentRole ?? 'planner',
        outcome: input.outcome,
        summary: safeSummary,
        createdAt: nowIso,
      },
    },
    checkpoint,
    audit: {
      timestamp: new Date(nowIso),
      sessionId: 'team-mode',
      sessionType: 'mcp-stdio',
      action,
      workspaceId: mission.workspaceId,
      policyDecision: 'allow',
      resultCode,
      durationMs: 0,
      metadata: {
        missionId: mission.id,
        workspaceId: mission.workspaceId,
        state,
        role: role ?? 'none',
        taskSequence: current.sequence,
        reworkCount: input.outcome === 'validation_failed' || input.outcome === 'changes_requested'
          ? current.reworkCount + 1
          : current.reworkCount,
      },
    },
  });
  if (!committed.ok) return committed;
  return view(dependencies.teamRepo, committed.value.mission);
}

function taskTransitionCheckpoint(input: {
  readonly mission: TeamMissionRecord;
  readonly workItems: readonly TeamWorkItemRecord[];
  readonly state: TeamState;
  readonly task: TeamWorkItemRecord;
  readonly summary: string;
  readonly verification: readonly string[];
  readonly nowIso: string;
  readonly currentApproved?: TeamWorkItemRecord;
}): WorkMemoryCheckpointDraft {
  const completed = input.workItems
    .filter((item) => item.status === 'done' || item.id === input.currentApproved?.id)
    .map((item) => item.title);
  const nextAction = input.state === 'implementing'
    ? `Work on Task ${input.task.sequence}/${input.workItems.length}: ${input.task.title}; then submit work_ready.`
    : input.state === 'validating'
      ? `Validate Task ${input.task.sequence}/${input.workItems.length}: ${input.task.title}; then submit validation_passed or validation_failed.`
      : input.state === 'reviewing'
        ? `Review Task ${input.task.sequence}/${input.workItems.length}: ${input.task.title}; then submit task_approved or changes_requested.`
        : 'Team mission completed; review the Final Result.';
  return {
    workspaceId: input.mission.workspaceId,
    goal: input.mission.goalSummary,
    task: { title: input.task.title, status: input.state === 'completed' ? 'completed' : 'in_progress' },
    completed,
    decisions: [input.summary],
    blockers: [],
    nextAction,
    artifacts: input.task.targetPathHint ? [input.task.targetPathHint] : [],
    verification: input.verification,
    updatedAt: input.nowIso,
  };
}

function normalizeVerificationEvidence(value: readonly string[] | undefined): Result<readonly string[], AppError> {
  if (value === undefined) return ok([]);
  if (value.length > WORK_MEMORY_LIMITS.maxVerificationItems) {
    return err(appError('VALIDATION_FAILED', 'Team verification evidence must be bounded'));
  }
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.length < 1 || item.length > WORK_MEMORY_LIMITS.maxItemChars || item.includes('\0')) {
      return err(appError('VALIDATION_FAILED', 'Team verification evidence is invalid'));
    }
    const safe = sanitizeText(item, WORK_MEMORY_LIMITS.maxItemChars);
    if (!safe) return err(appError('VALIDATION_FAILED', 'Team verification evidence is invalid'));
    normalized.push(safe);
  }
  return ok(normalized);
}
function blockMission(
  dependencies: TeamServiceDependencies,
  mission: TeamMissionRecord,
  reason: TeamBlockedReason,
  summary: string,
): Result<TeamMissionView, AppError> {
  const nowIso = (dependencies.now ?? (() => new Date()))().toISOString();
  const safeSummary = sanitizeText(summary, TEAM_LIMITS.maxSummaryChars) || reason;
  const workItems = dependencies.teamRepo.listWorkItems(mission.id);
  if (!workItems.ok) return workItems;
  const handoffs = dependencies.teamRepo.listHandoffs(mission.id, TEAM_LIMITS.maxTimelineItems);
  if (!handoffs.ok) return handoffs;
  const findings = dependencies.teamRepo.listFindings(mission.id);
  if (!findings.ok) return findings;
  const nextMission: TeamMissionRecord = {
    ...mission,
    state: 'blocked',
    currentRole: undefined,
    ...(mission.currentStepId ? { currentStepId: mission.currentStepId } : {}),
    blockedReason: reason,
    blockedReasonSummary: safeSummary,
    updatedAt: nowIso,
  };
  const checkpoint = deriveTeamWorkMemoryCheckpoint({
    mission: nextMission,
    workItems: workItems.value,
    handoffs: handoffs.value,
    findings: findings.value,
    verification: [],
  });
  if (!checkpoint.ok) return checkpoint;
  const stale = reason === 'GIT_STATE_STALE' || reason === 'WORKSPACE_STALE';
  const committed = dependencies.transitionUow.commit({
    precondition: {
      missionId: mission.id,
      workspaceId: mission.workspaceId,
      expectedState: mission.state,
      ...(mission.currentRole ? { expectedRole: mission.currentRole } : {}),
      ...(mission.currentStepId ? { expectedCurrentStepId: mission.currentStepId } : {}),
      expectedFreshness: { kind: mission.freshnessKind, value: mission.freshnessValue },
    },
    mission: {
      kind: 'update',
      missionId: mission.id,
      patch: {
        state: 'blocked',
        ...(mission.currentStepId ? { currentStepId: mission.currentStepId } : {}),
        reviewRound: mission.reviewRound,
        blockedReason: reason,
        blockedReasonSummary: safeSummary,
        updatedAt: nowIso,
      },
    },
    checkpoint: checkpoint.value,
    audit: {
      timestamp: new Date(nowIso),
      sessionId: 'team-mode',
      sessionType: 'mcp-stdio',
      action: stale ? 'team.stale_state_detected' : 'team.mission_blocked',
      workspaceId: mission.workspaceId,
      policyDecision: 'allow',
      resultCode: stale ? 'TEAM_STALE' : 'TEAM_MISSION_BLOCKED',
      durationMs: 0,
      metadata: { state: 'blocked', reason, reviewRound: mission.reviewRound },
    },
  });
  if (!committed.ok) return committed;
  return view(dependencies.teamRepo, committed.value.mission);
}

function missionForActiveWorkspace(
  dependencies: TeamServiceDependencies,
  missionId?: string,
): Result<TeamMissionRecord | undefined, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  if (!missionId) return dependencies.teamRepo.findActiveByWorkspace(workspace.value.id);
  const mission = dependencies.teamRepo.findById(missionId);
  if (!mission.ok) return mission;
  if (!mission.value || mission.value.workspaceId !== workspace.value.id) {
    return err(appError('TEAM_MISSION_NOT_FOUND', 'Team mission is unavailable'));
  }
  return mission;
}

function activeMission(dependencies: TeamServiceDependencies): Result<TeamMissionRecord | undefined, AppError> {
  return missionForActiveWorkspace(dependencies);
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

type FreshnessRule = 'must_match' | 'adopt_current' | 'workspace_identity_only';

function freshnessRuleForOutcome(outcome: TeamSubmitInput['outcome']): FreshnessRule {
  if (outcome === 'work_ready') return 'adopt_current';
  if (outcome === 'blocked') return 'workspace_identity_only';
  return 'must_match';
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
  const continuation = deriveTeamWorkMemoryCheckpoint({
    mission,
    workItems: workItems.value,
    handoffs: handoffs.value,
    findings: findings.value,
    verification: [],
  });
  if (!continuation.ok) return continuation;
  const finalResultSummary = mission.state === 'completed'
    ? [...handoffs.value].reverse().find((handoff) => handoff.outcome === 'task_approved')?.summary
    : undefined;
  return ok({
    missionId: mission.id,
    workspaceId: mission.workspaceId,
    goalSummary: mission.goalSummary,
    state: mission.state,
    ...(mission.currentRole ? { currentRole: mission.currentRole } : {}),
    ...(mission.currentStepId ? { currentStepId: mission.currentStepId } : {}),
    reviewRound: mission.reviewRound,
    nextAction: continuation.value.nextAction,
    ...(finalResultSummary ? { finalResultSummary } : {}),
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
      status: index === 0 ? 'in_progress' : 'pending',
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

function invalidTransition(): Result<never, AppError> {
  return err(appError('TEAM_TRANSITION_INVALID', 'Team mission transition is invalid'));
}
