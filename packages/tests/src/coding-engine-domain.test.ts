import { describe, expect, it } from 'vitest';
import {
  CodingEngineRuntimeFailure,
  codingEngineRuntimeFailureAppError,
  type CodingEngineState,
} from '@sud-d/domain';

describe('Coding Engine domain vocabulary', () => {
  it('uses the approved user-facing availability states', () => {
    const states: CodingEngineState[] = ['unavailable', 'starting', 'ready', 'needs_repair'];
    expect(states).toEqual(['unavailable', 'starting', 'ready', 'needs_repair']);
  });

  it('maps runtime failures to safe app errors without raw process text', () => {
    const failure = new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    const error = codingEngineRuntimeFailureAppError(failure.code);
    expect(error.code).toBe('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    expect(error.message).toBe('Coding Engine tool contract does not match the pinned Serena manifest');
    expect(JSON.stringify(error)).not.toContain('stderr');
  });
});
