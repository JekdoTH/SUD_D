import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  PROJECT_RUNNER_MANIFEST_PATH,
  PROJECT_RUNNER_RUNTIME,
  appError,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type ProjectRunnerCandidate,
  type ProjectRunnerDefinition,
  type ProjectRunnerManifest,
  type Result,
  type RunnerArtifactDefinition,
  type RunnerInputSchema,
} from '@sud-d/domain';
import { hasReparsePoint, resolveExistingResource, validateRelativePath } from './path-adapter.js';

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_RUNNERS = 16;
const MAX_SNAPSHOT_PATHS = 32;
const MAX_ARTIFACTS = 50;
const MAX_SCHEMA_DEPTH = 4;
const MAX_SCHEMA_PROPERTIES = 64;
const MAX_ENUM_VALUES = 64;
const MAX_INPUT_STRING = 2 * 1024;
const MAX_INPUT_ARRAY = 100;
const MAX_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const MIME_RE = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

type JsonObject = Record<string, unknown>;

function invalid(): Result<never, AppError> {
  return err(appError('RUNNER_MANIFEST_INVALID', 'Restricted Project Runner manifest is invalid'));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: JsonObject, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const object = value as JsonObject;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stable(object[key])).join(',') + '}';
}

function skipWs(text: string, pos: number): number {
  while (pos < text.length && /\s/.test(text[pos] ?? '')) pos += 1;
  return pos;
}

function scanString(text: string, start: number): { value: string; next: number } {
  if (text[start] !== '"') throw new Error('string');
  let pos = start + 1;
  while (pos < text.length) {
    const ch = text[pos];
    if (ch === '"') {
      const raw = text.slice(start, pos + 1);
      return { value: JSON.parse(raw) as string, next: pos + 1 };
    }
    if (ch === '\\') {
      pos += 2;
      continue;
    }
    pos += 1;
  }
  throw new Error('string');
}

function scanValue(text: string, start: number): number {
  let pos = skipWs(text, start);
  const ch = text[pos];
  if (ch === '"') return scanString(text, pos).next;
  if (ch === '{') return scanObject(text, pos);
  if (ch === '[') {
    pos = skipWs(text, pos + 1);
    if (text[pos] === ']') return pos + 1;
    while (pos < text.length) {
      pos = skipWs(text, scanValue(text, pos));
      if (text[pos] === ']') return pos + 1;
      if (text[pos] !== ',') throw new Error('array');
      pos = skipWs(text, pos + 1);
    }
    throw new Error('array');
  }
  const match = text.slice(pos).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
  if (!match) throw new Error('value');
  return pos + match[0].length;
}

function scanObject(text: string, start: number): number {
  let pos = skipWs(text, start + 1);
  const keys = new Set<string>();
  if (text[pos] === '}') return pos + 1;
  while (pos < text.length) {
    const parsed = scanString(text, pos);
    if (keys.has(parsed.value)) throw new Error('duplicate');
    keys.add(parsed.value);
    pos = skipWs(text, parsed.next);
    if (text[pos] !== ':') throw new Error('object');
    pos = skipWs(text, scanValue(text, pos + 1));
    if (text[pos] === '}') return pos + 1;
    if (text[pos] !== ',') throw new Error('object');
    pos = skipWs(text, pos + 1);
  }
  throw new Error('object');
}

function parseStrictJson(text: string): unknown {
  const start = skipWs(text, 0);
  const end = scanValue(text, start);
  if (skipWs(text, end) !== text.length) throw new Error('trailing');
  return JSON.parse(text) as unknown;
}

function validateSchema(value: unknown, depth = 0): RunnerInputSchema | undefined {
  if (depth > MAX_SCHEMA_DEPTH || !isObject(value) || typeof value.type !== 'string') return undefined;
  if (value.type === 'string') {
    if (!exactKeys(value, ['type', 'enum', 'minLength', 'maxLength'])) return undefined;
    if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length === 0 || value.enum.length > MAX_ENUM_VALUES ||
      value.enum.some((item) => typeof item !== 'string' || item.length > MAX_INPUT_STRING || CONTROL_RE.test(item)))) return undefined;
    if (value.minLength !== undefined && (!Number.isInteger(value.minLength) || (value.minLength as number) < 0 || (value.minLength as number) > MAX_INPUT_STRING)) return undefined;
    if (value.maxLength !== undefined && (!Number.isInteger(value.maxLength) || (value.maxLength as number) < 0 || (value.maxLength as number) > MAX_INPUT_STRING)) return undefined;
    if (typeof value.minLength === 'number' && typeof value.maxLength === 'number' && value.minLength > value.maxLength) return undefined;
    return value as unknown as RunnerInputSchema;
  }
  if (value.type === 'number' || value.type === 'integer') {
    if (!exactKeys(value, ['type', 'minimum', 'maximum'])) return undefined;
    if (value.minimum !== undefined && (typeof value.minimum !== 'number' || !Number.isFinite(value.minimum))) return undefined;
    if (value.maximum !== undefined && (typeof value.maximum !== 'number' || !Number.isFinite(value.maximum))) return undefined;
    if (typeof value.minimum === 'number' && typeof value.maximum === 'number' && value.minimum > value.maximum) return undefined;
    return value as unknown as RunnerInputSchema;
  }
  if (value.type === 'boolean') {
    return exactKeys(value, ['type']) ? value as unknown as RunnerInputSchema : undefined;
  }
  if (value.type === 'array') {
    if (!exactKeys(value, ['type', 'items', 'minItems', 'maxItems'])) return undefined;
    const items = validateSchema(value.items, depth + 1);
    if (!items) return undefined;
    const minItems = value.minItems ?? 0;
    const maxItems = value.maxItems ?? MAX_INPUT_ARRAY;
    if (!Number.isInteger(minItems) || !Number.isInteger(maxItems) || (minItems as number) < 0 ||
      (maxItems as number) < 0 || (maxItems as number) > MAX_INPUT_ARRAY || (minItems as number) > (maxItems as number)) return undefined;
    return { type: 'array', items, minItems: minItems as number, maxItems: maxItems as number };
  }
  if (value.type === 'object') {
    if (!exactKeys(value, ['type', 'properties', 'required', 'additionalProperties']) || value.additionalProperties !== false || !isObject(value.properties)) return undefined;
    const entries = Object.entries(value.properties);
    if (entries.length > MAX_SCHEMA_PROPERTIES) return undefined;
    const properties: Record<string, RunnerInputSchema> = {};
    for (const [key, child] of entries) {
      if (!key || key.length > 64 || CONTROL_RE.test(key)) return undefined;
      const schema = validateSchema(child, depth + 1);
      if (!schema) return undefined;
      properties[key] = schema;
    }
    const required = value.required ?? [];
    if (!Array.isArray(required) || required.some((key) => typeof key !== 'string' || !(key in properties)) ||
      new Set(required).size !== required.length) return undefined;
    return { type: 'object', properties, required: required as string[], additionalProperties: false };
  }
  return undefined;
}

function validateArtifact(value: unknown): RunnerArtifactDefinition | undefined {
  if (!isObject(value) || !exactKeys(value, ['id', 'path', 'type', 'required'])) return undefined;
  if (typeof value.id !== 'string' || !ID_RE.test(value.id) || typeof value.path !== 'string' ||
    typeof value.type !== 'string' || !MIME_RE.test(value.type) || typeof value.required !== 'boolean') return undefined;
  const rel = validateRelativePath(value.path);
  if (!rel.ok || rel.value === '.' || rel.value.startsWith('.sud-d/') || rel.value.startsWith('.git/')) return undefined;
  return { id: value.id, path: rel.value, type: value.type, required: value.required };
}

function validateDefinition(value: unknown): ProjectRunnerDefinition | undefined {
  if (!isObject(value) || !exactKeys(value, [
    'id', 'label', 'runtime', 'entry', 'snapshotPaths', 'inputSchema', 'artifacts', 'limits', 'networkProfile', 'secretProfile',
  ])) return undefined;
  if (typeof value.id !== 'string' || !ID_RE.test(value.id) ||
    typeof value.label !== 'string' || value.label.length < 1 || value.label.length > 120 || CONTROL_RE.test(value.label) ||
    value.runtime !== PROJECT_RUNNER_RUNTIME || value.networkProfile !== 'none' || value.secretProfile !== 'none' ||
    typeof value.entry !== 'string') return undefined;

  const entry = validateRelativePath(value.entry);
  if (!entry.ok || entry.value === '.' || entry.value.startsWith('.git/') || entry.value.startsWith('.sud-d/')) return undefined;
  if (!Array.isArray(value.snapshotPaths) || value.snapshotPaths.length < 1 || value.snapshotPaths.length > MAX_SNAPSHOT_PATHS) return undefined;
  const snapshotPaths: string[] = [];
  for (const item of value.snapshotPaths) {
    if (typeof item !== 'string') return undefined;
    const rel = validateRelativePath(item);
    if (!rel.ok || rel.value === '.' || rel.value.startsWith('.git') || rel.value.startsWith('.sud-d')) return undefined;
    snapshotPaths.push(rel.value.replace(/\/$/, ''));
  }
  if (new Set(snapshotPaths).size !== snapshotPaths.length) return undefined;
  const entryIncluded = snapshotPaths.some((root) => entry.value === root || entry.value.startsWith(root + '/'));
  if (!entryIncluded) return undefined;

  const inputSchema = validateSchema(value.inputSchema);
  if (!inputSchema || !Array.isArray(value.artifacts) || value.artifacts.length > MAX_ARTIFACTS) return undefined;
  const artifacts = value.artifacts.map(validateArtifact);
  if (artifacts.some((item) => item === undefined)) return undefined;
  const typedArtifacts = artifacts as RunnerArtifactDefinition[];
  if (new Set(typedArtifacts.map((item) => item.id)).size !== typedArtifacts.length ||
      new Set(typedArtifacts.map((item) => item.path.toLowerCase())).size !== typedArtifacts.length) return undefined;

  if (!isObject(value.limits) || !exactKeys(value.limits, ['timeoutMs', 'maxArtifactBytes']) ||
    !Number.isInteger(value.limits.timeoutMs) || (value.limits.timeoutMs as number) < 1_000 || (value.limits.timeoutMs as number) > MAX_TIMEOUT_MS ||
    !Number.isInteger(value.limits.maxArtifactBytes) || (value.limits.maxArtifactBytes as number) < 1 || (value.limits.maxArtifactBytes as number) > MAX_ARTIFACT_BYTES) return undefined;

  return {
    id: value.id,
    label: value.label,
    runtime: PROJECT_RUNNER_RUNTIME,
    entry: entry.value,
    snapshotPaths,
    inputSchema,
    artifacts: typedArtifacts,
    limits: { timeoutMs: value.limits.timeoutMs as number, maxArtifactBytes: value.limits.maxArtifactBytes as number },
    networkProfile: 'none',
    secretProfile: 'none',
  };
}

function parseManifest(text: string): Result<ProjectRunnerManifest, AppError> {
  let raw: unknown;
  try {
    raw = parseStrictJson(text);
  } catch {
    return invalid();
  }
  if (!isObject(raw) || !exactKeys(raw, ['version', 'runners']) || raw.version !== 1 ||
    !Array.isArray(raw.runners) || raw.runners.length > MAX_RUNNERS) return invalid();
  const runners = raw.runners.map(validateDefinition);
  if (runners.some((runner) => runner === undefined)) return invalid();
  const typed = runners as ProjectRunnerDefinition[];
  if (new Set(typed.map((runner) => runner.id)).size !== typed.length) return invalid();
  return ok({ version: 1, runners: typed });
}

export interface DiscoverProjectRunnersOptions {
  readonly workspaceCanonicalRoot: string;
  readonly internalRoots: InternalRoot[];
}

export function loadProjectRunnerManifest(options: DiscoverProjectRunnersOptions): Result<ProjectRunnerManifest, AppError> {
  const resolved = resolveExistingResource({
    workspaceCanonicalRoot: options.workspaceCanonicalRoot,
    relativePath: PROJECT_RUNNER_MANIFEST_PATH,
    internalRoots: options.internalRoots,
  });
  if (!resolved.ok) return invalid();
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved.value.canonical);
  } catch {
    return invalid();
  }
  if (!stat.isFile() || stat.size > MAX_MANIFEST_BYTES) return invalid();
  const reparse = hasReparsePoint(resolved.value.canonical);
  if (!reparse.ok || reparse.value) return invalid();
  let text: string;
  try {
    text = fs.readFileSync(resolved.value.canonical, 'utf8');
  } catch {
    return invalid();
  }
  return parseManifest(text);
}

export function loadProjectRunnerDefinition(
  options: DiscoverProjectRunnersOptions,
  runnerId: string,
): Result<{ definition: ProjectRunnerDefinition; definitionDigest: string }, AppError> {
  const manifest = loadProjectRunnerManifest(options);
  if (!manifest.ok) return manifest;
  const definition = manifest.value.runners.find((runner) => runner.id === runnerId);
  if (!definition) return err(appError('RUNNER_NOT_FOUND', 'Restricted Project Runner definition was not found'));
  const definitionDigest = createHash('sha256').update(stable(definition), 'utf8').digest('hex');
  return ok({ definition, definitionDigest });
}

export function discoverProjectRunners(options: DiscoverProjectRunnersOptions): Result<readonly ProjectRunnerCandidate[], AppError> {
  const manifest = loadProjectRunnerManifest(options);
  if (!manifest.ok) return manifest;
  const candidates: ProjectRunnerCandidate[] = [];
  for (const definition of manifest.value.runners) {
    const entry = resolveExistingResource({
      workspaceCanonicalRoot: options.workspaceCanonicalRoot,
      relativePath: definition.entry,
      internalRoots: options.internalRoots,
    });
    if (!entry.ok) return invalid();
    try {
      if (!fs.statSync(entry.value.canonical).isFile()) return invalid();
    } catch {
      return invalid();
    }
    const definitionDigest = createHash('sha256').update(stable(definition), 'utf8').digest('hex');
    candidates.push({
      id: definition.id,
      label: definition.label,
      runtime: definition.runtime,
      definitionDigest,
      supported: true,
    });
  }
  return ok(Object.freeze(candidates));
}
