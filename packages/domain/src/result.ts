import type { CodingEngineFailureCode } from './coding-engine.js';

// ---------------------------------------------------------------------------
// Result monad
// ---------------------------------------------------------------------------

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type AppErrorCode =
  | 'WORKSPACE_NOT_FOUND'
  | 'WORKSPACE_INVALID'
  | 'CONNECTION_PROFILE_NOT_FOUND'
  | 'CONNECTION_CREDENTIAL_MISSING'
  | 'CONNECTION_WORKSPACE_NOT_SELECTED'
  | 'CONNECTION_RUNTIME_START_FAILED'
  | 'CONNECTION_RUNTIME_STOP_FAILED'
  | 'INVALID_CONNECTION_STATE_TRANSITION'
  | 'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART'
  | 'CONNECTION_LIFECYCLE_BUSY'
  | 'TUNNEL_CLIENT_NOT_FOUND'
  | 'TUNNEL_PROFILE_INVALID'
  | 'TUNNEL_START_FAILED'
  | 'TUNNEL_HEALTH_FAILED'
  | 'TUNNEL_EXITED_UNEXPECTEDLY'
  | 'TUNNEL_STOP_FAILED'
  | 'MCP_GATEWAY_ENTRY_NOT_FOUND'
  | 'INVALID_PATH'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'DEVICE_PATH_DENIED'
  | 'REPARSE_POINT_DENIED'
  | 'INTERNAL_PATH_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'RESOURCE_TYPE_UNSUPPORTED'
  | 'RESOURCE_TOO_LARGE'
  | 'TEXT_CONTENT_INVALID'
  | 'SENSITIVE_RESOURCE'
  | 'GIT_STATE_UNSAFE'
  | 'GIT_STATUS_STALE'
  | 'GIT_OPERATION_CONFLICT'
  | 'APPROVAL_STATE_INVALID'
  | 'APPROVAL_QUEUE_FULL'
  | 'APPROVAL_EXPIRED'
  | 'TEAM_MISSION_CONFLICT'
  | 'TEAM_MISSION_NOT_FOUND'
  | 'TEAM_TRANSITION_INVALID'
  | 'TEAM_REVIEW_LOOP_LIMIT'
  | 'TEAM_STALE'
  | CodingEngineFailureCode
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
  readonly metadata?: Record<string, string | number | boolean>;
}

export function appError(
  code: AppErrorCode,
  message: string,
  metadata?: Record<string, string | number | boolean>,
): AppError {
  return { code, message, ...(metadata ? { metadata } : {}) };
}

export const CODING_ENGINE_FAILURE_MESSAGES: Readonly<Record<CodingEngineFailureCode, string>> = {
  CODING_ENGINE_WORKSPACE_NOT_SELECTED: 'Coding Engine requires an active Workspace',
  CODING_ENGINE_BOOTSTRAP_UNAVAILABLE: 'Coding Engine bootstrap dependency is unavailable',
  CODING_ENGINE_INSTALL_FAILED: 'Coding Engine failed to install the pinned Serena runtime',
  CODING_ENGINE_START_FAILED: 'Coding Engine runtime failed to start',
  CODING_ENGINE_VERSION_MISMATCH: 'Coding Engine runtime version does not match the pinned Serena manifest',
  CODING_ENGINE_TOOL_CONTRACT_MISMATCH: 'Coding Engine tool contract does not match the pinned Serena manifest',
  CODING_ENGINE_PROJECT_MISMATCH: 'Coding Engine runtime is not bound to the active Workspace',
  CODING_ENGINE_LSP_UNAVAILABLE: 'Coding Engine LSP health check failed',
  CODING_ENGINE_STOP_FAILED: 'Coding Engine runtime failed to stop cleanly',
  CODING_ENGINE_REPAIR_FAILED: 'Coding Engine repair failed',
};

export function codingEngineRuntimeFailureAppError(code: CodingEngineFailureCode): AppError {
  return appError(code, CODING_ENGINE_FAILURE_MESSAGES[code]);
}

export type ConnectionRuntimeFailureCode =
  | 'TUNNEL_CLIENT_NOT_FOUND'
  | 'TUNNEL_PROFILE_INVALID'
  | 'TUNNEL_START_FAILED'
  | 'TUNNEL_HEALTH_FAILED'
  | 'TUNNEL_EXITED_UNEXPECTEDLY'
  | 'TUNNEL_STOP_FAILED'
  | 'MCP_GATEWAY_ENTRY_NOT_FOUND';

const CONNECTION_RUNTIME_FAILURE_MESSAGES: Readonly<Record<ConnectionRuntimeFailureCode, string>> = {
  TUNNEL_CLIENT_NOT_FOUND: 'OpenAI Secure Tunnel client is not available',
  TUNNEL_PROFILE_INVALID: 'Secure Tunnel profile configuration is invalid',
  TUNNEL_START_FAILED: 'Secure Tunnel runtime failed to start',
  TUNNEL_HEALTH_FAILED: 'Secure Tunnel runtime failed readiness checks',
  TUNNEL_EXITED_UNEXPECTEDLY: 'Secure Tunnel runtime exited unexpectedly',
  TUNNEL_STOP_FAILED: 'Secure Tunnel runtime failed to stop',
  MCP_GATEWAY_ENTRY_NOT_FOUND: 'SUD-D MCP Gateway entrypoint is unavailable',
};

export class ConnectionRuntimeFailure extends Error {
  readonly code: ConnectionRuntimeFailureCode;

  constructor(code: ConnectionRuntimeFailureCode) {
    super(CONNECTION_RUNTIME_FAILURE_MESSAGES[code]);
    this.name = 'ConnectionRuntimeFailure';
    this.code = code;
  }
}

export function connectionRuntimeFailureAppError(
  code: ConnectionRuntimeFailureCode,
): AppError {
  return appError(code, CONNECTION_RUNTIME_FAILURE_MESSAGES[code]);
}
