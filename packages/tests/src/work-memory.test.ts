import { describe, expect, it } from 'vitest';
import {
  WORK_MEMORY_LIMITS,
  WORK_TASK_STATUSES,
  WorkMemoryFailure,
  type WorkCheckpointInput,
} from '@sud-d/domain';

describe('Work Memory / Automatic Resume domain contract', () => {
  it('defines the bounded checkpoint vocabulary and stable failure codes', () => {
    expect(WORK_TASK_STATUSES).toEqual(['pending', 'in_progress', 'blocked', 'completed']);
    expect(WORK_MEMORY_LIMITS).toMatchObject({
      maxGoalChars: 2_000,
      maxTaskChars: 1_000,
      maxNextActionChars: 1_000,
      maxCompletedItems: 20,
      maxDecisionItems: 20,
      maxBlockerItems: 10,
      maxVerificationItems: 20,
      maxArtifactItems: 50,
      maxHistory: 20,
      maxSerializedBytes: 64 * 1024,
    });
    const checkpoint: WorkCheckpointInput = {
      goal: 'Close the Work Memory milestone',
      task: { title: 'Build Resume Context', status: 'in_progress' },
      completed: [], decisions: [], blockers: [],
      nextAction: 'Persist the first bounded checkpoint',
      artifacts: [], verification: [],
    };
    expect(checkpoint.task.status).toBe('in_progress');
    expect(new WorkMemoryFailure('WORK_RESUME_REQUIRED')).toMatchObject({
      code: 'WORK_RESUME_REQUIRED',
      message: 'Work resume is required for the active Workspace',
    });
  });
});
