import type { PolicyContext } from './policy.js';

export const TEAM_ROLES = ['planner', 'implementer', 'validator', 'reviewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const TEAM_STATES = ['planning', 'implementing', 'validating', 'reviewing', 'completed', 'blocked', 'stopped'] as const;
export type TeamState = (typeof TEAM_STATES)[number];

export const TEAM_TERMINAL_STATES: readonly TeamState[] = ['completed', 'blocked', 'stopped'];

export const TEAM_BLOCKED_REASONS = [
  'EXECUTE_REQUIRED',
  'NETWORK_REQUIRED',
  'DELETE_REQUIRED',
  'SECURITY_POLICY',
  'APPROVAL_DENIED',
  'APPROVAL_EXPIRED',
  'WORKSPACE_STALE',
  'GIT_STATE_STALE',
  'SCOPE_MISMATCH',
  'REVIEW_LOOP_LIMIT',
  'UNSUPPORTED_OPERATION',
  'INTERNAL_FAILURE',
] as const;
export type TeamBlockedReason = (typeof TEAM_BLOCKED_REASONS)[number];

export const TEAM_SUBMISSION_OUTCOMES = [
  'plan_ready',
  'work_ready',
  'validation_passed',
  'validation_failed',
  'task_approved',
  'changes_requested',
  'blocked',
] as const;
export type TeamSubmissionOutcome = (typeof TEAM_SUBMISSION_OUTCOMES)[number];

export const TEAM_WORK_ITEM_STATUSES = ['pending', 'in_progress', 'validating', 'reviewing', 'done', 'blocked'] as const;
export type TeamWorkItemStatus = (typeof TEAM_WORK_ITEM_STATUSES)[number];

export const TEAM_FINDING_SEVERITIES = ['low', 'medium', 'high'] as const;
export type TeamFindingSeverity = (typeof TEAM_FINDING_SEVERITIES)[number];

export const TEAM_LIMITS = Object.freeze({
  maxGoalChars: 2_000,
  maxGoalSummaryChars: 240,
  maxWorkItems: 20,
  maxWorkItemTitleChars: 160,
  maxTargetPathChars: 1_024,
  maxSummaryChars: 1_000,
  maxFindings: 20,
  maxFindingSummaryChars: 240,
  maxReviewRoundTrips: 3,
  maxTimelineItems: 50,
});

export interface TeamFreshnessRef {
  readonly kind: 'git_status' | 'workspace_time' | 'none';
  readonly value: string;
}

export interface TeamMissionRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly goalSummary: string;
  readonly state: TeamState;
  readonly currentRole?: TeamRole;
  readonly currentStepId?: string;
  readonly reviewRound: number;
  readonly blockedReason?: TeamBlockedReason;
  readonly blockedReasonSummary?: string;
  readonly freshnessKind: TeamFreshnessRef['kind'];
  readonly freshnessValue: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly stoppedAt?: string;
}

export interface TeamWorkItemRecord {
  readonly id: string;
  readonly missionId: string;
  readonly sequence: number;
  readonly title: string;
  readonly status: TeamWorkItemStatus;
  readonly reworkCount: number;
  readonly targetPathHint?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeamRoleHandoffRecord {
  readonly id: string;
  readonly missionId: string;
  readonly fromRole: TeamRole;
  readonly outcome: TeamSubmissionOutcome;
  readonly summary: string;
  readonly createdAt: string;
}

export interface TeamReviewerFindingRecord {
  readonly id: string;
  readonly missionId: string;
  readonly severity: TeamFindingSeverity;
  readonly summary: string;
  readonly targetPathHint?: string;
  readonly expectedCorrection?: string;
  readonly createdAt: string;
}

export interface TeamMissionView {
  readonly missionId: string;
  readonly workspaceId: string;
  readonly goalSummary: string;
  readonly state: TeamState;
  readonly currentRole?: TeamRole;
  readonly currentStepId?: string;
  readonly reviewRound: number;
  readonly nextAction: string;
  readonly finalResultSummary?: string;
  readonly blockedReason?: TeamBlockedReason;
  readonly blockedReasonSummary?: string;
  readonly freshness?: TeamFreshnessRef;
  readonly workItems: readonly TeamWorkItemRecord[];
  readonly handoffs: readonly TeamRoleHandoffRecord[];
  readonly findings: readonly TeamReviewerFindingRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly stoppedAt?: string;
}

export function isTeamTerminalState(state: TeamState): boolean {
  return TEAM_TERMINAL_STATES.includes(state);
}

export function policyContextForTeam(): PolicyContext {
  return 'workspace';
}
