/**
 * SOLO EXPERT B0: PRIVATE, INERT, test-only Kernel capability.
 * No product registry/barrel export. Uses existing Policy -> Approval -> Audit Kernel.
 * This is cooperative host-user risk disclosure, NOT a sandbox or live tool grant.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  appError, err, ok,
  type AppError, type ApprovalRequestRecord, type ClientSession,
  type Result, type ToolExecutionContext,
} from '@sud-d/domain';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';

export const B0_SCHEMA_PIN = 'serena-1.7.0-stock-shell-b0-v1';
const REGISTRY_PIN = 'b0-private-registry-v1';
const CAPABILITY = 'solo-expert.b0.execute';
const TTL_MS = 90_000;
const TIMEOUT_MS = 300;
const RISK_DISCLOSURE_VERSION = 'b0-cooperative-risk-v1';
const RISK_DISCLOSURE =
  'Stock Serena may log tool arguments, output and errors to local file/memory/stderr; ' +
  'the tool has host-user filesystem/network capabilities and descendants may outlive the call. ' +
  'No sandbox, guaranteed child cleanup, provider permission or physical execution is provided.';
type ProfileId = 'harmless-short-smoke' | 'reviewed-development-script';
type MockStatus = 'simulated-success' | 'command-failed' | 'blocked' | 'unknown';

interface MockResult {
  readonly executionKind: 'mock';
  readonly status: MockStatus;
  readonly reason: string;
  readonly exitCode?: number;
}
export interface B0FakeAdapter {
  fingerprint(profileId: ProfileId): string | undefined;
  invoke(profileId: ProfileId, expectedRoot: string, timeoutMs: number): Promise<MockResult>;
}
export interface B0TrustedState {
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly workspaceGeneration: string;
  readonly policyContext: 'workspace' | 'outside_workspace' | 'internal_root' | 'network';
  readonly session: ClientSession;
  readonly runtimeEpoch: string;
  readonly deviceLabel: string;
  readonly deviceProvenance: 'unattested-local-label';
  readonly accountLabel: string;
  readonly accountProvenance: 'unattested-local-label';
  readonly artifactFingerprint: string;
  readonly configFingerprint: string;
  readonly resumed: boolean;
  readonly revoked: boolean;
}
export interface B0ToolContract {
  readonly serenaVersion: string;
  readonly toolName: string;
  readonly schemaPin: string;
  readonly registryVersion: string;
  readonly risk: string;
  readonly effect: string;
  readonly privacy: string;
}
export interface B0ReviewSnapshot {
  readonly attemptId: string;
  readonly profileId: ProfileId;
  readonly profileVersion: string;
  readonly registryVersion: typeof REGISTRY_PIN;
  readonly schemaPin: typeof B0_SCHEMA_PIN;
  readonly commandFingerprint: string;
  readonly risk: 'sensitive';
  readonly effect: 'execute';
  readonly privacy: 'stock-local-logging';
  readonly riskDisclosureVersion: string;
  readonly riskDisclosure: string;
  readonly lifecycle: 'short';
  readonly maxCalls: 1;
  readonly timeoutMs: number;
  readonly maxAnswerChars: 256;
  readonly workspaceId: string;
  readonly workspaceRoot: string;
  readonly workspaceRootDigest: string;
  readonly workspaceGeneration: string;
  readonly session: Readonly<ClientSession>;
  readonly runtimeEpoch: string;
  readonly deviceLabel: string;
  readonly deviceProvenance: 'unattested-local-label';
  readonly accountLabel: string;
  readonly accountProvenance: 'unattested-local-label';
  readonly artifactFingerprint: string;
  readonly configFingerprint: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}
export interface B0BridgeDependencies {
  readonly trustedState: () => B0TrustedState;
  readonly contract: () => B0ToolContract;
  readonly now: () => number;
  readonly coordinatorRuntimeId: string;
  readonly approvalRecords: {
    readonly findById: (id: string) =>
      Result<ApprovalRequestRecord | undefined, AppError> | Promise<Result<ApprovalRequestRecord | undefined, AppError>>;
  };
  /** Inject ONLY an in-memory fake adapter in B0. NEVER a live MCP session. */
  readonly fakeAdapter: B0FakeAdapter;
}
export interface B0Bridge {
  review(input: unknown): Result<B0ReviewSnapshot, AppError>;
  readonly capability: RegisteredToolCapability;
}
const PROFILES = Object.freeze({
  'harmless-short-smoke': Object.freeze({ version: 'b0-smoke-synthetic-v1', command: 'echo SUD_D_B0_OK', output: 'SUD_D_B0_OK\r\n' }),
  'reviewed-development-script': Object.freeze({
    version: 'b0-development-fake-only-v1', command: 'echo SUD_D_B0_DEV_OK', output: 'SUD_D_B0_DEV_OK\r\n',
  }),
});
const invalid = () => err(appError('VALIDATION_FAILED', 'Solo Expert review unavailable'));
const blocked = () => err(appError('APPROVAL_STATE_INVALID', 'Solo Expert mock call unauthorized'));
const uncertain = () => err(appError('INTERNAL_ERROR', 'Solo Expert mock result uncertain'));
const digest = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return false;
  const props = Reflect.ownKeys(value);
  return props.length === keys.length && props.every(prop => {
    if (typeof prop !== 'string' || !keys.includes(prop)) return false;
    const desc = Object.getOwnPropertyDescriptor(value, prop);
    return desc !== undefined && 'value' in desc && desc.enumerable === true;
  });
}
function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}
function safeRoot(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= 240
    && /^[A-Za-z]:[\\/]/.test(value) && !value.includes('..') &&
    !value.includes('"') && ![...value].some(ch => ch.charCodeAt(0) < 32);
}
function captureState(input: B0TrustedState): Readonly<B0TrustedState> | undefined {
  if (!input || !safeId(input.workspaceId) || !safeRoot(input.workspaceRoot)
    || !safeId(input.workspaceGeneration) || !safeId(input.runtimeEpoch)
    || !safeId(input.session?.id) || !['desktop', 'mcp-stdio'].includes(input.session.type)
    || !safeId(input.deviceLabel) || !safeId(input.accountLabel)
    || input.deviceProvenance !== 'unattested-local-label'
    || input.accountProvenance !== 'unattested-local-label'
    || !safeId(input.configFingerprint) || !safeId(input.artifactFingerprint)
    || typeof input.resumed !== 'boolean' || typeof input.revoked !== 'boolean'
    || !['workspace', 'outside_workspace', 'internal_root', 'network'].includes(input.policyContext)) return undefined;
  return Object.freeze({ ...input, session: Object.freeze({ id: input.session.id, type: input.session.type }) });
}
function matchesContract(input: B0ToolContract): boolean {
  return input?.serenaVersion === '1.7.0' && input.toolName === 'execute_shell_command'
    && input.schemaPin === B0_SCHEMA_PIN && input.registryVersion === REGISTRY_PIN
    && input.risk === 'sensitive' && input.effect === 'execute'
    && input.privacy === 'stock-local-logging';
}
function expectedFingerprint(profileId: ProfileId): string {
  const recipe = PROFILES[profileId];
  return digest(JSON.stringify({
    registry: REGISTRY_PIN, profileId, tool: 'execute_shell_command',
    command: recipe.command, expectedStdout: recipe.output,
    captureStderr: true, maxAnswerChars: 256, schema: B0_SCHEMA_PIN,
  }));
}
function validReceipt(
  record: ApprovalRequestRecord | undefined,
  context: ToolExecutionContext,
  reviewed: B0ReviewSnapshot,
  runtimeId: string,
  now: number,
): boolean {
  return !!record && record.id === context.approvalRequestId
    && record.runtimeInstanceId === runtimeId
    && record.capability === CAPABILITY && record.effect === 'execute'
    && record.sensitivity === 'sensitive' && record.policyContext === 'workspace'
    && record.workspaceId === reviewed.workspaceId
    && record.sessionId === reviewed.session.id && record.sessionType === reviewed.session.type
    && record.status === 'consumed' && record.decisionSource === 'user'
    && typeof record.decidedAt === 'string' && typeof record.consumedAt === 'string'
    && Number.isFinite(Date.parse(record.decidedAt)) && Number.isFinite(Date.parse(record.consumedAt))
    && Date.parse(record.consumedAt) >= Date.parse(record.decidedAt)
    && /^[0-9a-f]{64}$/.test(record.bindingDigest)
    && Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > now;
}
function safeOutcome(input: unknown): input is MockResult {
  if (!exactObject(input, ['executionKind', 'status', 'reason']) &&
      !exactObject(input, ['executionKind', 'status', 'reason', 'exitCode'])) return false;
  if (input.executionKind !== 'mock' || !['simulated-success', 'command-failed', 'blocked', 'unknown'].includes(input.status as string)
    || typeof input.reason !== 'string' || ![
      'MOCK_OK', 'COMMAND_EXIT_NONZERO', 'MCP_ERROR', 'MALFORMED_RESPONSE',
      'OUTPUT_UNEXPECTED', 'CWD_MISMATCH', 'TRANSPORT_UNKNOWN', 'MOCK_TIMEOUT',
    ].includes(input.reason)) return false;
  const code = input.exitCode;
  return code === undefined || (typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 255);
}

export function createSoloExpertSerenaBridge(deps: B0BridgeDependencies): B0Bridge {
  const issued = new WeakSet<B0ReviewSnapshot>();
  const reserved = new Set<string>();
  const current = (snapshot: B0ReviewSnapshot): boolean => {
    try {
      const state = captureState(deps.trustedState());
      const now = deps.now();
      return !!state && state.resumed && !state.revoked && state.policyContext === 'workspace'
        && matchesContract(deps.contract())
        && Number.isSafeInteger(now) && now >= snapshot.issuedAtMs && now < snapshot.expiresAtMs
        && state.workspaceId === snapshot.workspaceId && state.workspaceRoot === snapshot.workspaceRoot
        && digest(state.workspaceRoot) === snapshot.workspaceRootDigest
        && state.workspaceGeneration === snapshot.workspaceGeneration
        && state.session.id === snapshot.session.id && state.session.type === snapshot.session.type
        && state.runtimeEpoch === snapshot.runtimeEpoch
        && state.deviceLabel === snapshot.deviceLabel && state.deviceProvenance === snapshot.deviceProvenance
        && state.accountLabel === snapshot.accountLabel && state.accountProvenance === snapshot.accountProvenance
        && state.configFingerprint === snapshot.configFingerprint
        && state.artifactFingerprint === snapshot.artifactFingerprint
        && snapshot.commandFingerprint === expectedFingerprint(snapshot.profileId)
        && deps.fakeAdapter.fingerprint(snapshot.profileId) === snapshot.commandFingerprint;
    } catch { return false; }
  };
  const admitted = (input: unknown): input is B0ReviewSnapshot => {
    if (typeof input !== 'object' || input === null) return false;
    try {
      return issued.has(input as B0ReviewSnapshot) && Object.isFrozen(input)
        && Object.isFrozen((input as B0ReviewSnapshot).session)
        && current(input as B0ReviewSnapshot);
    } catch { return false; }
  };
  const review = (input: unknown): Result<B0ReviewSnapshot, AppError> => {
    try {
      if (!exactObject(input, ['profileId']) || typeof input.profileId !== 'string'
        || !Object.hasOwn(PROFILES, input.profileId)) return invalid();
      const profileId = input.profileId as ProfileId;
      const state = captureState(deps.trustedState());
      const now = deps.now();
      const fingerprint = expectedFingerprint(profileId);
      if (!state || !state.resumed || state.revoked || state.policyContext !== 'workspace'
        || !matchesContract(deps.contract())
        || !Number.isSafeInteger(now) || now < 0 || now + TTL_MS > Number.MAX_SAFE_INTEGER
        || deps.fakeAdapter.fingerprint(profileId) !== fingerprint) return invalid();
      const snapshot: B0ReviewSnapshot = Object.freeze({
        attemptId: randomUUID(), profileId, profileVersion: PROFILES[profileId].version,
        registryVersion: REGISTRY_PIN, schemaPin: B0_SCHEMA_PIN, commandFingerprint: fingerprint,
        risk: 'sensitive', effect: 'execute', privacy: 'stock-local-logging',
        riskDisclosureVersion: RISK_DISCLOSURE_VERSION, riskDisclosure: RISK_DISCLOSURE,
        lifecycle: 'short', maxCalls: 1, timeoutMs: TIMEOUT_MS, maxAnswerChars: 256,
        workspaceId: state.workspaceId, workspaceRoot: state.workspaceRoot,
        workspaceRootDigest: digest(state.workspaceRoot),
        workspaceGeneration: state.workspaceGeneration, session: state.session,
        runtimeEpoch: state.runtimeEpoch, deviceLabel: state.deviceLabel,
        deviceProvenance: state.deviceProvenance, accountLabel: state.accountLabel,
        accountProvenance: state.accountProvenance,
        artifactFingerprint: state.artifactFingerprint, configFingerprint: state.configFingerprint,
        issuedAtMs: now, expiresAtMs: now + TTL_MS,
      });
      issued.add(snapshot);
      return ok(snapshot);
    } catch { return invalid(); }
  };
  const capability = defineToolCapability<B0ReviewSnapshot, MockResult>({
    name: CAPABILITY,
    effect: 'execute',
    validate(input) { return admitted(input) ? ok(input) : invalid(); },
    resolveSecurity(input) {
      return admitted(input)
        ? ok({ sensitivity: 'sensitive', context: 'workspace', workspaceId: input.workspaceId })
        : invalid();
    },
    approval: {
      describe(input) {
        return admitted(input)
          ? ok({ title: 'Review synthetic Solo Expert action', resourceLabel: input.profileId })
          : invalid();
      },
      bind(input) {
        return admitted(input) ? ok({
          attemptId: input.attemptId, profileId: input.profileId,
          profileVersion: input.profileVersion, registryVersion: input.registryVersion,
          schemaPin: input.schemaPin, commandFingerprint: input.commandFingerprint,
          workspaceId: input.workspaceId, rootDigest: input.workspaceRootDigest,
          workspaceGeneration: input.workspaceGeneration,
          sessionId: input.session.id, sessionType: input.session.type,
          runtimeEpoch: input.runtimeEpoch, deviceLabel: input.deviceLabel,
          deviceProvenance: input.deviceProvenance, accountLabel: input.accountLabel,
          accountProvenance: input.accountProvenance,
          configFingerprint: input.configFingerprint, artifactFingerprint: input.artifactFingerprint,
          risk: input.risk, effect: input.effect, privacy: input.privacy,
          riskDisclosureVersion: input.riskDisclosureVersion,
          lifecycle: input.lifecycle, timeoutMs: input.timeoutMs, maxCalls: input.maxCalls,
          maxAnswerChars: input.maxAnswerChars, expiresAtMs: input.expiresAtMs,
        }) : invalid();
      },
    },
    async execute(input, context) {
      if (!admitted(input) || reserved.has(input.attemptId)
        || context.approvalDecision !== 'approved' || !context.approvalRequestId
        || context.session.id !== input.session.id || context.session.type !== input.session.type
        || context.security.context !== 'workspace' || context.security.sensitivity !== 'sensitive'
        || context.security.workspaceId !== input.workspaceId) return blocked();
      try {
        const record = await deps.approvalRecords.findById(context.approvalRequestId);
        if (!record.ok || !validReceipt(record.value, context, input, deps.coordinatorRuntimeId, deps.now())) {
          return blocked();
        }
      } catch { return blocked(); }
      if (!admitted(input) || reserved.has(input.attemptId)) return blocked();
      reserved.add(input.attemptId); // reserve atomically BEFORE fake transport await.
      try {
        const result: unknown = await deps.fakeAdapter.invoke(input.profileId, input.workspaceRoot, input.timeoutMs);
        // A changed Workspace/resume/pin after dispatch cannot be reported as clean success.
        if (!current(input) || !safeOutcome(result) || result.status === 'unknown'
          || result.status === 'blocked') return uncertain();
        return ok(Object.freeze({ ...result }));
      } catch {
        return uncertain();
      }
    },
  });
  return Object.freeze({ review, capability });
}
