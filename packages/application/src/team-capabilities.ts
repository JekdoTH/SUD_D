import {
  appError,
  err,
  ok,
  TEAM_BLOCKED_REASONS,
  TEAM_FINDING_SEVERITIES,
  TEAM_LIMITS,
  type AppError,
  type TeamBlockedReason,
  type TeamFindingSeverity,
  type ResolvedToolSecurityContext,
  type Result,
} from '@sud-d/domain';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';
import type { TeamPlanWorkItemInput, TeamReviewerFindingInput, TeamService, TeamStartInput, TeamStatusInput, TeamStopInput, TeamSubmitInput } from './team-service.js';

export const TEAM_CAPABILITY_NAMES = Object.freeze([
  'team.start',
  'team.status',
  'team.submit',
  'team.stop',
] as const);

export type TeamCapabilityName = (typeof TEAM_CAPABILITY_NAMES)[number];

export interface TeamCapabilityDependencies {
  readonly teamService: TeamService;
  readonly resolveWorkspaceSecurity: () => Result<ResolvedToolSecurityContext, AppError>;
}

export function createTeamCapabilities(
  dependencies: TeamCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<TeamStartInput, unknown>({
      name: 'team.start',
      effect: 'create',
      validate: validateStartInput,
      resolveSecurity: dependencies.resolveWorkspaceSecurity,
      execute(input) { return dependencies.teamService.start(input); },
    }),
    defineToolCapability<TeamStatusInput, unknown>({
      name: 'team.status',
      effect: 'read',
      validate: validateStatusInput,
      resolveSecurity: dependencies.resolveWorkspaceSecurity,
      execute(input) { return dependencies.teamService.status(input); },
    }),
    defineToolCapability<TeamSubmitInput, unknown>({
      name: 'team.submit',
      effect: 'modify',
      validate: validateSubmitInput,
      resolveSecurity: dependencies.resolveWorkspaceSecurity,
      execute(input) { return dependencies.teamService.submit(input); },
    }),
    defineToolCapability<TeamStopInput, unknown>({
      name: 'team.stop',
      effect: 'modify',
      validate: validateStopInput,
      resolveSecurity: dependencies.resolveWorkspaceSecurity,
      execute(input) { return dependencies.teamService.stop(input); },
    }),
  ]);
}

function validateStartInput(input: unknown): Result<TeamStartInput, AppError> {
  if (!isStrictObject(input, ['goal'])) return invalidInput();
  if (typeof input.goal !== 'string' || input.goal.trim().length < 1 || input.goal.length > TEAM_LIMITS.maxGoalChars || input.goal.includes('\0')) {
    return invalidInput();
  }
  return ok({ goal: input.goal });
}

function validateStatusInput(input: unknown): Result<TeamStatusInput, AppError> {
  if (!isStrictObject(input, ['missionId'])) return invalidInput();
  if (input.missionId !== undefined && !isUuid(input.missionId)) return invalidInput();
  return ok(input.missionId === undefined ? {} : { missionId: input.missionId });
}

function validateStopInput(input: unknown): Result<TeamStopInput, AppError> {
  if (!isStrictObject(input, ['missionId'])) return invalidInput();
  if (input.missionId !== undefined && !isUuid(input.missionId)) return invalidInput();
  return ok(input.missionId === undefined ? {} : { missionId: input.missionId });
}

function validateSubmitInput(input: unknown): Result<TeamSubmitInput, AppError> {
  if (!isStrictObject(input, ['outcome', 'summary', 'workItems', 'findings', 'blockedReason'])) return invalidInput();
  const outcome = input.outcome;
  if (typeof outcome !== 'string') return invalidInput();
  try {
    switch (outcome) {
      case 'plan_ready': {
        if (typeof input.summary !== 'string' || !isBoundedSummary(input.summary)) return invalidInput();
        if (!Array.isArray(input.workItems) || input.workItems.length < 1 || input.workItems.length > TEAM_LIMITS.maxWorkItems) return invalidInput();
        return ok({ outcome, summary: input.summary, workItems: input.workItems.map(parseWorkItem) });
      }
      case 'implementation_ready':
      case 'complete': {
        if (typeof input.summary !== 'string' || !isBoundedSummary(input.summary)) return invalidInput();
        return ok({ outcome, summary: input.summary } as TeamSubmitInput);
      }
      case 'changes_requested': {
        if (typeof input.summary !== 'string' || !isBoundedSummary(input.summary)) return invalidInput();
        if (!Array.isArray(input.findings) || input.findings.length < 1 || input.findings.length > TEAM_LIMITS.maxFindings) return invalidInput();
        return ok({ outcome, summary: input.summary, findings: input.findings.map(parseFinding) });
      }
      case 'blocked': {
        if (typeof input.summary !== 'string' || !isBoundedSummary(input.summary)) return invalidInput();
        if (!isTeamBlockedReason(input.blockedReason)) return invalidInput();
        return ok({ outcome, blockedReason: input.blockedReason, summary: input.summary });
      }
      default:
        return invalidInput();
    }
  } catch {
    return invalidInput();
  }
}

function parseWorkItem(value: unknown): TeamPlanWorkItemInput {
  if (!isStrictObject(value, ['title', 'targetPathHint'])) throw new Error('invalid work item');
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > TEAM_LIMITS.maxWorkItemTitleChars) throw new Error('invalid work item');
  if (value.targetPathHint !== undefined && (typeof value.targetPathHint !== 'string' || value.targetPathHint.length > TEAM_LIMITS.maxTargetPathChars)) throw new Error('invalid work item');
  return { title: value.title, ...(value.targetPathHint === undefined ? {} : { targetPathHint: value.targetPathHint }) };
}

function parseFinding(value: unknown): TeamReviewerFindingInput {
  if (!isStrictObject(value, ['severity', 'summary', 'targetPathHint', 'expectedCorrection'])) throw new Error('invalid finding');
  if (!isTeamFindingSeverity(value.severity)) throw new Error('invalid finding');
  if (typeof value.summary !== 'string' || value.summary.length < 1 || value.summary.length > TEAM_LIMITS.maxFindingSummaryChars) throw new Error('invalid finding');
  if (value.targetPathHint !== undefined && (typeof value.targetPathHint !== 'string' || value.targetPathHint.length > TEAM_LIMITS.maxTargetPathChars)) throw new Error('invalid finding');
  if (value.expectedCorrection !== undefined && (typeof value.expectedCorrection !== 'string' || value.expectedCorrection.length > TEAM_LIMITS.maxFindingSummaryChars)) throw new Error('invalid finding');
  return {
    severity: value.severity,
    summary: value.summary,
    ...(value.targetPathHint === undefined ? {} : { targetPathHint: value.targetPathHint }),
    ...(value.expectedCorrection === undefined ? {} : { expectedCorrection: value.expectedCorrection }),
  };
}

function isTeamBlockedReason(value: unknown): value is TeamBlockedReason {
  return typeof value === 'string' && TEAM_BLOCKED_REASONS.includes(value as TeamBlockedReason);
}

function isTeamFindingSeverity(value: unknown): value is TeamFindingSeverity {
  return typeof value === 'string' && TEAM_FINDING_SEVERITIES.includes(value as TeamFindingSeverity);
}

function isBoundedSummary(value: string): boolean {
  return value.trim().length > 0 && value.length <= TEAM_LIMITS.maxSummaryChars && !value.includes('\0');
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isStrictObject(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Team tool input is invalid'));
}
