export const PROJECT_RUNNER_MANIFEST_PATH = '.sud-d/runners.json';
export const PROJECT_RUNNER_RUNTIME = 'node-offline-v1' as const;

export interface RunnerStringInputSchema {
  readonly type: 'string';
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface RunnerNumberInputSchema {
  readonly type: 'number' | 'integer';
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface RunnerBooleanInputSchema {
  readonly type: 'boolean';
}

export interface RunnerArrayInputSchema {
  readonly type: 'array';
  readonly items: RunnerInputSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface RunnerObjectInputSchema {
  readonly type: 'object';
  readonly properties: Readonly<Record<string, RunnerInputSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties: false;
}

export type RunnerInputSchema =
  | RunnerStringInputSchema
  | RunnerNumberInputSchema
  | RunnerBooleanInputSchema
  | RunnerArrayInputSchema
  | RunnerObjectInputSchema;

export interface RunnerArtifactDefinition {
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly required: boolean;
}

export interface RunnerLimits {
  readonly timeoutMs: number;
  readonly maxArtifactBytes: number;
}

export interface ProjectRunnerDefinition {
  readonly id: string;
  readonly label: string;
  readonly runtime: typeof PROJECT_RUNNER_RUNTIME;
  readonly entry: string;
  readonly snapshotPaths: readonly string[];
  readonly inputSchema: RunnerInputSchema;
  readonly artifacts: readonly RunnerArtifactDefinition[];
  readonly limits: RunnerLimits;
  readonly networkProfile: 'none';
  readonly secretProfile: 'none';
}

export interface ProjectRunnerCandidate {
  readonly id: string;
  readonly label: string;
  readonly runtime: typeof PROJECT_RUNNER_RUNTIME;
  readonly definitionDigest: string;
  readonly supported: boolean;
  readonly blockedReason?: string;
}

export interface ProjectRunnerManifest {
  readonly version: 1;
  readonly runners: readonly ProjectRunnerDefinition[];
}

export interface ProjectRunnerStartRequest {
  readonly runnerId: string;
  readonly input: unknown;
  readonly attemptId: string;
}

export interface ProjectRunnerStartResult {
  readonly jobId: string;
  readonly attemptId: string;
  readonly runnerId: string;
  readonly state: ProjectRunnerJobState;
  readonly executionFingerprint: string;
}

export type ProjectRunnerJobState =
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'interrupted';

export interface ProjectRunnerJobRecord {
  readonly jobId: string;
  readonly attemptId: string;
  readonly workspaceId: string;
  readonly runnerId: string;
  readonly executionFingerprint: string;
  readonly ownerRuntimeEpoch: string;
  readonly state: ProjectRunnerJobState;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly exitCode?: number;
  readonly terminalCode?: string;
  readonly outputBytes: number;
  readonly droppedLogBytes: number;
}

export interface ProjectRunnerArtifactRecord {
  readonly jobId: string;
  readonly artifactId: string;
  readonly relativePath: string;
  readonly mediaType: string;
  readonly size: number;
  readonly sha256: string;
  readonly createdAt: string;
}

export type ProjectRunnerFailureCode =
  | 'RUNNER_MANIFEST_INVALID'
  | 'RUNNER_NOT_FOUND'
  | 'RUNNER_INPUT_INVALID'
  | 'RUNNER_SNAPSHOT_INVALID'
  | 'RUNNER_APPROVAL_STALE'
  | 'RUNNER_BUSY'
  | 'RUNNER_RUNTIME_UNAVAILABLE'
  | 'RUNNER_RESOURCE_LIMIT'
  | 'RUNNER_JOB_NOT_FOUND'
  | 'RUNNER_CLEANUP_UNCONFIRMED'
  | 'RUNNER_ARTIFACT_INVALID';

export const PROJECT_RUNNER_FAILURE_MESSAGES: Readonly<Record<ProjectRunnerFailureCode, string>> = {
  RUNNER_MANIFEST_INVALID: 'Restricted Project Runner manifest is invalid',
  RUNNER_NOT_FOUND: 'Restricted Project Runner definition was not found',
  RUNNER_INPUT_INVALID: 'Restricted Project Runner input is invalid',
  RUNNER_SNAPSHOT_INVALID: 'Restricted Project Runner snapshot is invalid',
  RUNNER_APPROVAL_STALE: 'Restricted Project Runner approval is stale',
  RUNNER_BUSY: 'Restricted Project Runner is busy',
  RUNNER_RUNTIME_UNAVAILABLE: 'Restricted Project Runner runtime is unavailable',
  RUNNER_RESOURCE_LIMIT: 'Restricted Project Runner resource budget was exceeded',
  RUNNER_JOB_NOT_FOUND: 'Restricted Project Runner job is unavailable',
  RUNNER_CLEANUP_UNCONFIRMED: 'Restricted Project Runner cleanup could not be confirmed',
  RUNNER_ARTIFACT_INVALID: 'Restricted Project Runner artifact evidence is invalid',
};
