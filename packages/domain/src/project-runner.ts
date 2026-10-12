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

export type ProjectRunnerFailureCode = 'RUNNER_MANIFEST_INVALID' | 'RUNNER_INPUT_INVALID';
