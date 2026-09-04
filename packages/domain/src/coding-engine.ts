import type { AppError } from './result.js';

export const CODING_ENGINE_STATES = [
  'unavailable',
  'starting',
  'ready',
  'needs_repair',
] as const;

export type CodingEngineState = (typeof CODING_ENGINE_STATES)[number];
export type CodingEngineKind = 'serena';

export type CodingEngineFailureCode =
  | 'CODING_ENGINE_WORKSPACE_NOT_SELECTED'
  | 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE'
  | 'CODING_ENGINE_INSTALL_FAILED'
  | 'CODING_ENGINE_START_FAILED'
  | 'CODING_ENGINE_VERSION_MISMATCH'
  | 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH'
  | 'CODING_ENGINE_PROJECT_MISMATCH'
  | 'CODING_ENGINE_LSP_UNAVAILABLE'
  | 'CODING_ENGINE_STOP_FAILED'
  | 'CODING_ENGINE_REPAIR_FAILED';

export interface CodingEngineWorkspaceContext {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly projectName: string;
}

export interface CodingEngineRuntimeHealth {
  readonly engine: 'serena';
  readonly version: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly toolCount: number;
  readonly workspaceCanonicalRoot: string;
  readonly projectName: string;
  readonly lspReady: true;
}

export interface CodingEngineStatus {
  readonly engine: 'serena';
  readonly state: CodingEngineState;
  readonly workspaceId: string | null;
  readonly failure: AppError | null;
}

export class CodingEngineRuntimeFailure extends Error {
  readonly code: CodingEngineFailureCode;

  constructor(code: CodingEngineFailureCode) {
    super(code);
    this.name = 'CodingEngineRuntimeFailure';
    this.code = code;
  }
}
