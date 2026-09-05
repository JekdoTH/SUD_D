export const WORK_TASK_STATUSES = Object.freeze([
  'pending',
  'in_progress',
  'blocked',
  'completed',
] as const);

export type WorkTaskStatus = (typeof WORK_TASK_STATUSES)[number];

export const WORK_MEMORY_LIMITS = Object.freeze({
  maxGoalChars: 2_000,
  maxTaskChars: 1_000,
  maxNextActionChars: 1_000,
  maxItemChars: 500,
  maxCompletedItems: 20,
  maxDecisionItems: 20,
  maxBlockerItems: 10,
  maxVerificationItems: 20,
  maxArtifactItems: 50,
  maxArtifactPathChars: 1_024,
  maxSerializedBytes: 64 * 1024,
  maxHistory: 20,
} as const);

export interface WorkTask {
  readonly title: string;
  readonly status: WorkTaskStatus;
}

export interface WorkCheckpointInput {
  readonly goal: string;
  readonly task: WorkTask;
  readonly completed: readonly string[];
  readonly decisions: readonly string[];
  readonly blockers: readonly string[];
  readonly nextAction: string;
  readonly artifacts: readonly string[];
  readonly verification: readonly string[];
}

export interface WorkGitReference {
  readonly headSha: string;
  readonly statusId: string;
}

export interface WorkResumeContext extends WorkCheckpointInput {
  readonly checkpointId: string;
  readonly workspaceId: string;
  readonly git?: WorkGitReference;
  readonly updatedAt: string;
}

export interface WorkResumeGitValidation {
  readonly supported: boolean;
  readonly drifted: boolean;
  readonly headChanged: boolean;
  readonly statusChanged: boolean;
  readonly currentHeadSha?: string;
  readonly currentStatusId?: string;
  readonly storedHeadSha?: string;
  readonly storedStatusId?: string;
}

export interface WorkResumeResult {
  readonly workspaceId: string;
  readonly context?: WorkResumeContext;
  readonly git: WorkResumeGitValidation;
}

export interface WorkCheckpointResult {
  readonly context: WorkResumeContext;
}

export type WorkMemoryFailureCode =
  | 'WORK_RESUME_REQUIRED'
  | 'WORK_MEMORY_PERSISTENCE_FAILED'
  | 'WORK_MEMORY_SECRET_REJECTED'
  | 'WORK_MEMORY_WORKSPACE_MISMATCH'
  | 'WORK_MEMORY_GIT_VALIDATION_FAILED';

const WORK_MEMORY_FAILURE_MESSAGES: Readonly<Record<WorkMemoryFailureCode, string>> = {
  WORK_RESUME_REQUIRED: 'Work resume is required for the active Workspace',
  WORK_MEMORY_PERSISTENCE_FAILED: 'Work Memory persistence is unavailable',
  WORK_MEMORY_SECRET_REJECTED: 'Work Memory checkpoint contains secret-like material',
  WORK_MEMORY_WORKSPACE_MISMATCH: 'Work Memory state does not match the active Workspace',
  WORK_MEMORY_GIT_VALIDATION_FAILED: 'Work Memory Git validation is unavailable',
};

export class WorkMemoryFailure extends Error {
  readonly code: WorkMemoryFailureCode;

  constructor(code: WorkMemoryFailureCode) {
    super(WORK_MEMORY_FAILURE_MESSAGES[code]);
    this.name = 'WorkMemoryFailure';
    this.code = code;
  }
}
