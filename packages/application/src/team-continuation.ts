import {
  WORK_MEMORY_LIMITS,
  appError,
  err,
  ok,
  type AppError,
  type Result,
  type TeamMissionRecord,
  type TeamReviewerFindingRecord,
  type TeamRoleHandoffRecord,
  type TeamWorkItemRecord,
} from '@sud-d/domain';
import type { WorkMemoryCheckpointDraft } from '@sud-d/infrastructure';

export interface TeamContinuationInput {
  readonly mission: TeamMissionRecord;
  readonly workItems: readonly TeamWorkItemRecord[];
  readonly handoffs: readonly TeamRoleHandoffRecord[];
  readonly findings: readonly TeamReviewerFindingRecord[];
  readonly verification: readonly string[];
}

const CONTROL_CHARACTER_PATTERN = new RegExp(String.raw`[\u0000-\u001f\u007f]+`, 'g');
const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,}|SENTINEL_[A-Z0-9_]+)\b/g;

export function deriveTeamWorkMemoryCheckpoint(
  input: TeamContinuationInput,
): Result<WorkMemoryCheckpointDraft, AppError> {
  const current = resolveCurrentTask(input.mission, input.workItems);
  if (['implementing', 'validating', 'reviewing'].includes(input.mission.state) && !current) {
    return err(appError('TEAM_TRANSITION_INVALID', 'Active Team state requires a current Task'));
  }

  const goal = boundedText(input.mission.goalSummary, WORK_MEMORY_LIMITS.maxGoalChars);
  if (!goal) return err(appError('VALIDATION_FAILED', 'Team Goal cannot map to Work Memory'));

  const taskTitle = current?.title
    ?? (input.mission.state === 'planning'
      ? 'Plan Team mission'
      : input.mission.state === 'completed'
        ? 'Team mission completed'
        : input.mission.state === 'stopped'
          ? 'Team mission stopped'
          : 'Team mission blocked');
  const task = boundedText(taskTitle, WORK_MEMORY_LIMITS.maxTaskChars);
  if (!task) return err(appError('VALIDATION_FAILED', 'Team Task cannot map to Work Memory'));

  const nextAction = nextActionFor(input.mission, current, input.workItems.length);
  if (!nextAction.ok) return nextAction;

  const completed = input.workItems
    .filter((item) => item.status === 'done')
    .map((item) => boundedText(item.title, WORK_MEMORY_LIMITS.maxItemChars))
    .filter((item): item is string => Boolean(item))
    .slice(0, WORK_MEMORY_LIMITS.maxCompletedItems);
  const decisions = input.handoffs
    .map((handoff) => boundedText(handoff.summary, WORK_MEMORY_LIMITS.maxItemChars))
    .filter((item): item is string => Boolean(item))
    .slice(-WORK_MEMORY_LIMITS.maxDecisionItems);
  const blockers = input.mission.blockedReason
    ? [boundedText(input.mission.blockedReasonSummary ?? input.mission.blockedReason, WORK_MEMORY_LIMITS.maxItemChars)].filter((item): item is string => Boolean(item))
    : [];
  const artifacts = input.workItems
    .map((item) => item.targetPathHint)
    .filter((item): item is string => Boolean(item))
    .filter((item) => item.length <= WORK_MEMORY_LIMITS.maxArtifactPathChars && !item.includes('\0'))
    .slice(0, WORK_MEMORY_LIMITS.maxArtifactItems);
  const verification = input.verification
    .map((item) => boundedText(item, WORK_MEMORY_LIMITS.maxItemChars))
    .filter((item): item is string => Boolean(item))
    .slice(0, WORK_MEMORY_LIMITS.maxVerificationItems);

  const draft: WorkMemoryCheckpointDraft = {
    workspaceId: input.mission.workspaceId,
    goal,
    task: {
      title: task,
      status: input.mission.state === 'completed'
        ? 'completed'
        : input.mission.state === 'blocked' || input.mission.state === 'stopped'
          ? 'blocked'
          : 'in_progress',
    },
    completed,
    decisions,
    blockers,
    nextAction: nextAction.value,
    artifacts,
    verification,
    updatedAt: input.mission.updatedAt,
  };
  return fitWithinAggregateBound(draft);
}

function resolveCurrentTask(
  mission: TeamMissionRecord,
  workItems: readonly TeamWorkItemRecord[],
): TeamWorkItemRecord | undefined {
  if (mission.currentStepId) {
    const selected = workItems.find((item) => item.id === mission.currentStepId && item.missionId === mission.id);
    if (selected) return selected;
  }
  if (mission.state === 'completed') return [...workItems].sort((a, b) => b.sequence - a.sequence).find((item) => item.status === 'done');
  return undefined;
}

function nextActionFor(
  mission: TeamMissionRecord,
  current: TeamWorkItemRecord | undefined,
  total: number,
): Result<string, AppError> {
  let value: string;
  switch (mission.state) {
    case 'planning':
      value = 'Plan the Team mission and submit plan_ready.';
      break;
    case 'implementing':
      value = `Work on Task ${current!.sequence}/${total}: ${current!.title}; then submit work_ready.`;
      break;
    case 'validating':
      value = `Validate Task ${current!.sequence}/${total}: ${current!.title}; then submit validation_passed or validation_failed.`;
      break;
    case 'reviewing':
      value = `Review Task ${current!.sequence}/${total}: ${current!.title}; then submit task_approved or changes_requested.`;
      break;
    case 'completed':
      value = 'Team mission completed; review the Final Result.';
      break;
    case 'blocked':
      value = `Resolve the Team blocker ${mission.blockedReason ?? 'UNSUPPORTED_OPERATION'}; start a new Team mission if more work is required.`;
      break;
    case 'stopped':
      value = 'Team mission stopped; start a new Team mission to continue this Goal.';
      break;
  }
  const bounded = boundedText(value, WORK_MEMORY_LIMITS.maxNextActionChars);
  return bounded
    ? ok(bounded)
    : err(appError('VALIDATION_FAILED', 'Team next action cannot map to Work Memory'));
}

function boundedText(value: string, maxChars: number): string {
  return value
    .replace(SECRET_PATTERN, '[REDACTED]')
    .replace(CONTROL_CHARACTER_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function fitWithinAggregateBound(
  input: WorkMemoryCheckpointDraft,
): Result<WorkMemoryCheckpointDraft, AppError> {
  const mutable = {
    completed: [...input.completed],
    decisions: [...input.decisions],
    blockers: [...input.blockers],
    artifacts: [...input.artifacts],
    verification: [...input.verification],
  };
  const build = (): WorkMemoryCheckpointDraft => ({ ...input, ...mutable });
  const bytes = () => Buffer.byteLength(JSON.stringify(build()), 'utf8');
  const trimOrder: Array<keyof typeof mutable> = ['artifacts', 'decisions', 'verification', 'completed', 'blockers'];
  while (bytes() > WORK_MEMORY_LIMITS.maxSerializedBytes) {
    const target = trimOrder.find((key) => mutable[key].length > 0);
    if (!target) return err(appError('VALIDATION_FAILED', 'Team continuation exceeds Work Memory bounds'));
    mutable[target].pop();
  }
  return ok(build());
}