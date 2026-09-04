import type { CodingEngineRuntimeHealth, CodingEngineWorkspaceContext } from '@sud-d/domain';

export interface CodingEngineRuntimePort {
  start(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth>;
  stop(): Promise<void>;
  repair(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth>;
}
