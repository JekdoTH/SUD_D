import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  appError,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type ProjectRunnerDefinition,
  type Result,
  type RunnerInputSchema,
} from '@sud-d/domain';
import { isContainedIn, resolveExistingResource } from './path-adapter.js';
import { loadProjectRunnerDefinition } from './runner-manifest.js';

const MAX_INPUT_BYTES = 16 * 1024;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 10_000;
const MAX_INPUT_DEPTH = 4;
const SECRET_KEY_RE = /(?:password|passwd|secret|token|api[_-]?key|credential|authorization|cookie)/i;
const SECRET_VALUE_RE = /(?:^|\b)(?:sk-[A-Za-z0-9_-]{12,}|(?:password|secret|token|api[_-]?key)\s*[:=])/i;

export const PROJECT_RUNNER_RESOURCE_POLICY = Object.freeze({
  revision: 'p0c-offline-v1',
  sandboxProfile: 'appcontainer-zero-v1',
  outputProfile: 'brokered-output-v1',
  activeProcessLimit: 32,
  jobMemoryBytes: 512 * 1024 * 1024,
  jobUserTimeMs: 30 * 60 * 1000,
  aggregateOutputBytes: 64 * 1024 * 1024,
  maxSnapshotBytes: MAX_SNAPSHOT_BYTES,
  maxSnapshotFiles: MAX_SNAPSHOT_FILES,
  maxLogBytes: 32 * 1024,
  maxLogPollBytes: 4 * 1024,
} as const);

export interface RunnerSnapshotInventoryItem {
  readonly relativePath: string;
  readonly size: number;
  readonly sha256: string;
}

export interface RunnerSealedFile {
  readonly relativePath: string;
  readonly size: number;
  readonly sha256: string;
}

export interface ProjectRunnerApprovedSnapshot {
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly workspaceCanonicalRoot: string;
  readonly runnerId: string;
  readonly attemptId: string;
  readonly definition: ProjectRunnerDefinition;
  readonly definitionDigest: string;
  readonly validatedInput: unknown;
  readonly inputDigest: string;
  readonly executionFingerprint: string;
  readonly stageRoot: string;
  readonly snapshotRoot: string;
  readonly entryPath: string;
  readonly inputPath: string;
  readonly runtimePath: string;
  readonly runtimeSourcePath: string;
  readonly runtimeIdentity: {
    readonly profile: 'node-offline-v1';
    readonly executableDigest: string;
  };
  readonly resourcePolicy: typeof PROJECT_RUNNER_RESOURCE_POLICY;
  readonly resourcePolicyIdentity: string;
  readonly inventory: readonly RunnerSnapshotInventoryItem[];
  readonly sealedFiles: readonly RunnerSealedFile[];
}

export interface PrepareProjectRunnerSnapshotOptions {
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly workspaceCanonicalRoot: string;
  readonly internalRoots: readonly InternalRoot[];
  readonly runnerId: string;
  readonly input: unknown;
  readonly attemptId: string;
  readonly stagingRoot: string;
  readonly runtimeExecutable: string;
}

interface SourceInventoryItem extends RunnerSnapshotInventoryItem {
  readonly sourceCanonicalPath: string;
  readonly bytes: Buffer;
}

function digest(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stable(object[key])).join(',') + '}';
}

function invalidInput(): Result<never, AppError> {
  return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
}

function invalidSnapshot(): Result<never, AppError> {
  return err(appError('RUNNER_SNAPSHOT_INVALID', 'Restricted Project Runner snapshot is invalid'));
}

function stale(): Result<never, AppError> {
  return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
}

function validateInput(schema: RunnerInputSchema, value: unknown, depth = 0, keyName?: string): boolean {
  if (depth > MAX_INPUT_DEPTH) return false;
  if (keyName && SECRET_KEY_RE.test(keyName)) return false;
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string' || value.includes('\0') || value.length > 2 * 1024 || SECRET_VALUE_RE.test(value)) return false;
      if (schema.enum && !schema.enum.includes(value)) return false;
      if (schema.minLength !== undefined && value.length < schema.minLength) return false;
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
      return true;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return false;
      if (schema.minimum !== undefined && value < schema.minimum) return false;
      if (schema.maximum !== undefined && value > schema.maximum) return false;
      return true;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return false;
      if (schema.minimum !== undefined && value < schema.minimum) return false;
      if (schema.maximum !== undefined && value > schema.maximum) return false;
      return true;
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      if (!Array.isArray(value)) return false;
      if (schema.minItems !== undefined && value.length < schema.minItems) return false;
      if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
      return value.every((item) => validateInput(schema.items, item, depth + 1));
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object);
      if (keys.some((key) => !(key in schema.properties) || SECRET_KEY_RE.test(key))) return false;
      for (const required of schema.required ?? []) {
        if (!(required in object)) return false;
      }
      for (const [key, child] of Object.entries(schema.properties)) {
        if (key in object && !validateInput(child, object[key], depth + 1, key)) return false;
      }
      return true;
    }
  }
}

function assertRegularUnlinkedFile(filePath: string): fs.Stats | undefined {
  try {
    const lstat = fs.lstatSync(filePath);
    if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.nlink !== 1) return undefined;
    return lstat;
  } catch {
    return undefined;
  }
}

function isForbiddenSnapshotRelative(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  return parts.some((part) => part === '.git' || part === '.sud-d');
}

function collectSourceInventory(
  workspaceCanonicalRoot: string,
  internalRoots: readonly InternalRoot[],
  definition: ProjectRunnerDefinition,
): Result<readonly SourceInventoryItem[], AppError> {
  const items = new Map<string, SourceInventoryItem>();
  let totalBytes = 0;

  const addFile = (relativePath: string): Result<void, AppError> => {
    const normalized = relativePath.replace(/\\/g, '/');
    if (isForbiddenSnapshotRelative(normalized)) return invalidSnapshot();
    const resolved = resolveExistingResource({
      workspaceCanonicalRoot,
      relativePath: normalized,
      internalRoots: [...internalRoots],
    });
    if (!resolved.ok) return invalidSnapshot();
    const stat = assertRegularUnlinkedFile(resolved.value.canonical);
    if (!stat) return invalidSnapshot();
    let bytes: Buffer;
    try {
      bytes = fs.readFileSync(resolved.value.canonical);
    } catch {
      return invalidSnapshot();
    }
    if (bytes.byteLength !== stat.size) return invalidSnapshot();
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_SNAPSHOT_BYTES || items.size + 1 > MAX_SNAPSHOT_FILES) return invalidSnapshot();
    items.set(normalized, {
      relativePath: normalized,
      size: bytes.byteLength,
      sha256: digest(bytes),
      sourceCanonicalPath: resolved.value.canonical,
      bytes,
    });
    return ok(undefined);
  };

  const walk = (relativePath: string): Result<void, AppError> => {
    const normalized = relativePath.replace(/\\/g, '/').replace(/\/$/, '');
    if (isForbiddenSnapshotRelative(normalized)) return invalidSnapshot();
    const resolved = resolveExistingResource({
      workspaceCanonicalRoot,
      relativePath: normalized,
      internalRoots: [...internalRoots],
    });
    if (!resolved.ok) return invalidSnapshot();
    let lstat: fs.Stats;
    try {
      lstat = fs.lstatSync(resolved.value.canonical);
    } catch {
      return invalidSnapshot();
    }
    if (lstat.isSymbolicLink()) return invalidSnapshot();
    if (lstat.isFile()) return addFile(normalized);
    if (!lstat.isDirectory()) return invalidSnapshot();

    let names: string[];
    try {
      names = fs.readdirSync(resolved.value.canonical).sort((a, b) => a.localeCompare(b, 'en'));
    } catch {
      return invalidSnapshot();
    }
    for (const name of names) {
      const child = normalized ? normalized + '/' + name : name;
      const childResult = walk(child);
      if (!childResult.ok) return childResult;
    }
    return ok(undefined);
  };

  for (const snapshotPath of definition.snapshotPaths) {
    const result = walk(snapshotPath);
    if (!result.ok) return result;
  }

  if (!items.has(definition.entry)) return invalidSnapshot();
  return ok(Object.freeze([...items.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'))));
}

function effectivePolicy(definition: ProjectRunnerDefinition): Record<string, string | number> {
  return {
    revision: PROJECT_RUNNER_RESOURCE_POLICY.revision,
    sandboxProfile: PROJECT_RUNNER_RESOURCE_POLICY.sandboxProfile,
    outputProfile: PROJECT_RUNNER_RESOURCE_POLICY.outputProfile,
    activeProcessLimit: PROJECT_RUNNER_RESOURCE_POLICY.activeProcessLimit,
    jobMemoryBytes: PROJECT_RUNNER_RESOURCE_POLICY.jobMemoryBytes,
    jobUserTimeMs: PROJECT_RUNNER_RESOURCE_POLICY.jobUserTimeMs,
    aggregateOutputBytes: PROJECT_RUNNER_RESOURCE_POLICY.aggregateOutputBytes,
    maxSnapshotBytes: PROJECT_RUNNER_RESOURCE_POLICY.maxSnapshotBytes,
    maxSnapshotFiles: PROJECT_RUNNER_RESOURCE_POLICY.maxSnapshotFiles,
    maxLogBytes: PROJECT_RUNNER_RESOURCE_POLICY.maxLogBytes,
    maxLogPollBytes: PROJECT_RUNNER_RESOURCE_POLICY.maxLogPollBytes,
    timeoutMs: definition.limits.timeoutMs,
    maxArtifactBytes: definition.limits.maxArtifactBytes,
  };
}

function computeFingerprint(input: {
  workspaceId: string;
  workspaceGeneration: string;
  workspaceCanonicalRoot: string;
  runnerId: string;
  definitionDigest: string;
  inventory: readonly RunnerSnapshotInventoryItem[];
  inputDigest: string;
  runtimeDigest: string;
  resourcePolicyIdentity: string;
}): string {
  return digest(stable({
    version: 1,
    workspaceId: input.workspaceId,
    workspaceGeneration: input.workspaceGeneration,
    workspaceCanonicalRoot: input.workspaceCanonicalRoot,
    runnerId: input.runnerId,
    definitionDigest: input.definitionDigest,
    inventory: input.inventory.map((item) => ({
      relativePath: item.relativePath,
      size: item.size,
      sha256: item.sha256,
    })),
    inputDigest: input.inputDigest,
    runtime: {
      profile: 'node-offline-v1',
      executableDigest: input.runtimeDigest,
    },
    sandboxProfile: PROJECT_RUNNER_RESOURCE_POLICY.sandboxProfile,
    outputProfile: PROJECT_RUNNER_RESOURCE_POLICY.outputProfile,
    resourcePolicyIdentity: input.resourcePolicyIdentity,
  }));
}

function sealFile(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o444);
  } catch {
    // Final byte/hash verification is authoritative; chmod is defense in depth on Windows.
  }
}

export function prepareProjectRunnerSnapshot(
  options: PrepareProjectRunnerSnapshotOptions,
): Result<ProjectRunnerApprovedSnapshot, AppError> {
  const loaded = loadProjectRunnerDefinition({
    workspaceCanonicalRoot: options.workspaceCanonicalRoot,
    internalRoots: [...options.internalRoots],
  }, options.runnerId);
  if (!loaded.ok) return loaded;

  if (!validateInput(loaded.value.definition.inputSchema, options.input)) return invalidInput();
  const inputCanonical = stable(options.input);
  if (Buffer.byteLength(inputCanonical, 'utf8') > MAX_INPUT_BYTES) return invalidInput();
  const inputDigest = digest(inputCanonical);

  const inventory = collectSourceInventory(
    options.workspaceCanonicalRoot,
    options.internalRoots,
    loaded.value.definition,
  );
  if (!inventory.ok) return inventory;

  let runtimeSourcePath: string;
  let runtimeBytes: Buffer;
  try {
    runtimeSourcePath = fs.realpathSync(options.runtimeExecutable);
    const runtimeStat = fs.lstatSync(runtimeSourcePath);
    if (!runtimeStat.isFile() || runtimeStat.isSymbolicLink()) return invalidSnapshot();
    runtimeBytes = fs.readFileSync(runtimeSourcePath);
  } catch {
    return invalidSnapshot();
  }
  const runtimeDigest = digest(runtimeBytes);

  let canonicalStagingRoot: string;
  try {
    fs.mkdirSync(options.stagingRoot, { recursive: true });
    canonicalStagingRoot = fs.realpathSync(options.stagingRoot);
  } catch {
    return invalidSnapshot();
  }
  if (isContainedIn(canonicalStagingRoot, options.workspaceCanonicalRoot)) return invalidSnapshot();

  const stageRoot = path.join(canonicalStagingRoot, options.attemptId);
  const snapshotRoot = path.join(stageRoot, 'snapshot');
  const runtimeDir = path.join(stageRoot, 'runtime');
  const runtimePath = path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node');
  const inputPath = path.join(stageRoot, 'input.json');

  try {
    fs.mkdirSync(stageRoot, { recursive: false });
    fs.mkdirSync(snapshotRoot, { recursive: false });
    fs.mkdirSync(runtimeDir, { recursive: false });

    const sealedFiles: RunnerSealedFile[] = [];
    for (const item of inventory.value) {
      const target = path.join(snapshotRoot, ...item.relativePath.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, item.bytes, { flag: 'wx' });
      sealFile(target);
      sealedFiles.push({
        relativePath: path.relative(stageRoot, target).replace(/\\/g, '/'),
        size: item.size,
        sha256: item.sha256,
      });
    }

    fs.writeFileSync(runtimePath, runtimeBytes, { flag: 'wx' });
    sealFile(runtimePath);
    sealedFiles.push({
      relativePath: path.relative(stageRoot, runtimePath).replace(/\\/g, '/'),
      size: runtimeBytes.byteLength,
      sha256: runtimeDigest,
    });

    const inputEnvelope = Buffer.from(stable({ version: 1, input: options.input }) + '\n', 'utf8');
    fs.writeFileSync(inputPath, inputEnvelope, { flag: 'wx' });
    sealFile(inputPath);
    sealedFiles.push({
      relativePath: path.relative(stageRoot, inputPath).replace(/\\/g, '/'),
      size: inputEnvelope.byteLength,
      sha256: digest(inputEnvelope),
    });

    const policyIdentity = digest(stable(effectivePolicy(loaded.value.definition)));
    const publicInventory: RunnerSnapshotInventoryItem[] = inventory.value.map((item) => ({
      relativePath: item.relativePath,
      size: item.size,
      sha256: item.sha256,
    }));
    const executionFingerprint = computeFingerprint({
      workspaceId: options.workspaceId,
      workspaceGeneration: options.workspaceGeneration,
      workspaceCanonicalRoot: options.workspaceCanonicalRoot,
      runnerId: options.runnerId,
      definitionDigest: loaded.value.definitionDigest,
      inventory: publicInventory,
      inputDigest,
      runtimeDigest,
      resourcePolicyIdentity: policyIdentity,
    });

    return ok(Object.freeze({
      workspaceId: options.workspaceId,
      workspaceGeneration: options.workspaceGeneration,
      workspaceCanonicalRoot: options.workspaceCanonicalRoot,
      runnerId: options.runnerId,
      attemptId: options.attemptId,
      definition: loaded.value.definition,
      definitionDigest: loaded.value.definitionDigest,
      validatedInput: options.input,
      inputDigest,
      executionFingerprint,
      stageRoot,
      snapshotRoot,
      entryPath: path.join(snapshotRoot, ...loaded.value.definition.entry.split('/')),
      inputPath,
      runtimePath,
      runtimeSourcePath,
      runtimeIdentity: Object.freeze({
        profile: 'node-offline-v1' as const,
        executableDigest: runtimeDigest,
      }),
      resourcePolicy: PROJECT_RUNNER_RESOURCE_POLICY,
      resourcePolicyIdentity: policyIdentity,
      inventory: Object.freeze(publicInventory),
      sealedFiles: Object.freeze(sealedFiles),
    }));
  } catch {
    try { fs.rmSync(stageRoot, { recursive: true, force: true }); } catch { /* best effort */ }
    return invalidSnapshot();
  }
}

export function verifyProjectRunnerSnapshot(
  snapshot: ProjectRunnerApprovedSnapshot,
): Result<void, AppError> {
  try {
    for (const sealed of snapshot.sealedFiles) {
      const filePath = path.join(snapshot.stageRoot, ...sealed.relativePath.split('/'));
      const stat = assertRegularUnlinkedFile(filePath);
      if (!stat || stat.size !== sealed.size) return invalidSnapshot();
      const bytes = fs.readFileSync(filePath);
      if (bytes.byteLength !== sealed.size || digest(bytes) !== sealed.sha256) return invalidSnapshot();
    }
  } catch {
    return invalidSnapshot();
  }
  return ok(undefined);
}

export function isProjectRunnerSnapshotFresh(
  snapshot: ProjectRunnerApprovedSnapshot,
  currentWorkspaceGeneration = snapshot.workspaceGeneration,
): Result<void, AppError> {
  if (currentWorkspaceGeneration !== snapshot.workspaceGeneration) return stale();
  const loaded = loadProjectRunnerDefinition({
    workspaceCanonicalRoot: snapshot.workspaceCanonicalRoot,
    internalRoots: [],
  }, snapshot.runnerId);
  if (!loaded.ok || loaded.value.definitionDigest !== snapshot.definitionDigest) return stale();

  const inventory = collectSourceInventory(snapshot.workspaceCanonicalRoot, [], loaded.value.definition);
  if (!inventory.ok) return stale();

  let runtimeDigest: string;
  try {
    runtimeDigest = digest(fs.readFileSync(snapshot.runtimeSourcePath));
  } catch {
    return stale();
  }
  const publicInventory = inventory.value.map((item) => ({
    relativePath: item.relativePath,
    size: item.size,
    sha256: item.sha256,
  }));
  const policyIdentity = digest(stable(effectivePolicy(loaded.value.definition)));
  const currentFingerprint = computeFingerprint({
    workspaceId: snapshot.workspaceId,
    workspaceGeneration: currentWorkspaceGeneration,
    workspaceCanonicalRoot: snapshot.workspaceCanonicalRoot,
    runnerId: snapshot.runnerId,
    definitionDigest: loaded.value.definitionDigest,
    inventory: publicInventory,
    inputDigest: snapshot.inputDigest,
    runtimeDigest,
    resourcePolicyIdentity: policyIdentity,
  });
  return currentFingerprint === snapshot.executionFingerprint ? ok(undefined) : stale();
}
