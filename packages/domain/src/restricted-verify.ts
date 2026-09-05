export const RESTRICTED_VERIFY_ACTIONS = Object.freeze([
  'test',
  'lint',
  'typecheck',
  'build',
] as const);

export type RestrictedVerifyAction = (typeof RESTRICTED_VERIFY_ACTIONS)[number];

export interface RestrictedVerifyRequest {
  readonly action: RestrictedVerifyAction;
}

export interface RestrictedVerifyWorkspaceContext {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
}

export interface RestrictedVerifyResult {
  readonly action: RestrictedVerifyAction;
  readonly passed: boolean;
  readonly exitCode: number;
  readonly output: string;
  readonly truncated: boolean;
  readonly durationMs: number;
}

export type RestrictedVerifyFailureCode =
  | 'VERIFY_PROFILE_UNAVAILABLE'
  | 'VERIFY_PROCESS_START_FAILED'
  | 'VERIFY_TIMEOUT';

const RESTRICTED_VERIFY_FAILURE_MESSAGES: Readonly<Record<RestrictedVerifyFailureCode, string>> = {
  VERIFY_PROFILE_UNAVAILABLE: 'Restricted Verify project profile is unavailable',
  VERIFY_PROCESS_START_FAILED: 'Restricted Verify process failed to start',
  VERIFY_TIMEOUT: 'Restricted Verify process timed out',
};

export class RestrictedVerifyFailure extends Error {
  readonly code: RestrictedVerifyFailureCode;

  constructor(code: RestrictedVerifyFailureCode) {
    super(RESTRICTED_VERIFY_FAILURE_MESSAGES[code]);
    this.name = 'RestrictedVerifyFailure';
    this.code = code;
  }
}