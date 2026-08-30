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
  | 'INVALID_PATH'
  | 'PATH_OUTSIDE_WORKSPACE'
  | 'DEVICE_PATH_DENIED'
  | 'REPARSE_POINT_DENIED'
  | 'INTERNAL_PATH_DENIED'
  | 'RESOURCE_NOT_FOUND'
  | 'SENSITIVE_RESOURCE'
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
