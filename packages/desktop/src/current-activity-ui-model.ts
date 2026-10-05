export type CurrentActivityTeamState =
  | 'planning'
  | 'implementing'
  | 'validating'
  | 'reviewing'
  | 'completed'
  | 'blocked'
  | 'stopped';

export type CurrentActivityCheckpointState =
  | 'none'
  | 'unavailable'
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'completed';

export interface CurrentActivityStatusInput {
  readonly hasActiveWorkspace: boolean;
  readonly workStatusAvailable: boolean | null;
  readonly workStatusChecking: boolean;
  readonly teamStatusAvailable: boolean | null;
  readonly teamState: CurrentActivityTeamState | null;
  readonly pendingApprovalCount: number;
  readonly pendingTeamStart: boolean;
  readonly checkpointState: CurrentActivityCheckpointState;
}

export interface CurrentActivityStatusPresentation {
  readonly modeLabel: string;
  readonly stateLabel: string;
  readonly badgeClass: 'badge-gray' | 'badge-green' | 'badge-yellow';
}

export function presentCurrentActivityStatus(
  input: CurrentActivityStatusInput,
): CurrentActivityStatusPresentation {
  const modeLabel = !input.hasActiveWorkspace
    ? 'Choose a Workspace'
    : input.workStatusAvailable === false || input.teamStatusAvailable === false
      ? 'Mode unavailable'
      : input.workStatusChecking
        ? 'Checking mode…'
        : input.teamState
          ? 'Team Mode'
          : 'Normal Mode';

  const stateLabel = !input.hasActiveWorkspace
    ? 'No Workspace'
    : input.workStatusAvailable === false || input.teamStatusAvailable === false
      ? 'Unavailable'
      : input.workStatusChecking
        ? 'Checking'
        : input.teamState
          ? input.teamState === 'blocked'
            ? 'Blocked'
            : input.pendingApprovalCount > 0
              ? 'Awaiting approval'
              : input.teamState === 'completed'
                ? 'Completed'
                : input.teamState === 'stopped'
                  ? 'Stopped'
                  : 'Team active'
          : input.pendingApprovalCount > 0
            ? 'Awaiting approval'
            : input.checkpointState === 'unavailable'
              ? 'Task unavailable'
              : input.checkpointState === 'blocked'
                ? 'Blocked'
                : input.checkpointState === 'completed'
                  ? 'Completed'
                  : input.checkpointState === 'none'
                    ? 'Ready'
                    : 'Recorded work';

  const badgeClass = stateLabel === 'Blocked'
    || stateLabel === 'Unavailable'
    || stateLabel === 'Task unavailable'
    || stateLabel === 'Awaiting approval'
    ? 'badge-yellow'
    : stateLabel === 'Team active' || stateLabel === 'Completed'
      ? 'badge-green'
      : 'badge-gray';

  return { modeLabel, stateLabel, badgeClass };
}
