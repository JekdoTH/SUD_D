/**
 * C1 private, inert review bridge. No production registry, adapter, subprocess or
 * upstream Serena client is created here. A caller must inject a fake recorder.
 * It is NOT a sandbox or an Owner Consent trust anchor.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  appError, err, ok,
  type AppError, type ApprovalRequestRecord, type ClientSession,
  type Result, type ToolExecutionContext,
} from '@sud-d/domain';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';

export const BRIDGE_ACTION_ID = 'serena.c1.reviewed-inspection';
export const BRIDGE_SCHEMA_VERSION = 'c1-serena-1.7.0-execute-shell-command-v1';

const CAPABILITY_NAME = 'serena.c1.reviewed';
const SCRIPT_VERSION = 'c1-harmless-command-v1';
const REGISTRY_VERSION = 'c1-private-registry-v1';
const TTL_MS = 120_000;
const LIMITS = Object.freeze({ maxCalls: 1, timeoutMs: 250, outputChars: 0 });
const COMMANDS = Object.freeze({
  brief: 'echo SERENA_C1_REVIEWED_BRIEF',
  expanded: 'echo SERENA_C1_REVIEWED_EXPANDED',
});
type Detail = keyof typeof COMMANDS;

export interface TrustedBridgeState {
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly session: ClientSession;
  readonly runtimeEpoch: string;
  readonly resumed: boolean;
}

export interface BridgeToolContract {
  readonly serenaVersion: string;
  readonly toolName: string;
  readonly schemaVersion: string;
  readonly risk: string;
}

export interface ReviewSnapshot {
  readonly attemptId: string;
  readonly actionId: typeof BRIDGE_ACTION_ID;
  readonly schemaVersion: typeof BRIDGE_SCHEMA_VERSION;
  readonly scriptVersion: string;
  readonly registryVersion: string;
  readonly params: Readonly<{ detail: Detail }>;
  readonly commandFingerprint: string;
  readonly limits: typeof LIMITS;
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly session: Readonly<ClientSession>;
  readonly runtimeEpoch: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

export interface InertBridgeResult {
  readonly status: 'simulated';
  readonly actionId: typeof BRIDGE_ACTION_ID;
  readonly detail: Detail;
  readonly commandFingerprint: string;
}

export interface SerenaPermissionBridgeDependencies {
  /** Trusted private composition only; never parsed from a tool invocation. */
  readonly trustedState: () => TrustedBridgeState;
  /** Verified pinned version/schema/risk from the private runtime composition. */
  readonly toolContract: () => BridgeToolContract;
  readonly now: () => number;
  readonly coordinatorRuntimeId: string;
  /** Read-only view of the EXISTING Approval coordinator repository. */
  readonly approvalRecords: {
    readonly findById: (id: string) => Result<ApprovalRequestRecord | undefined, AppError>;
  };
  /** MUST be an in-memory test double; never supply a live process adapter in C1. */
  readonly fakeDispatch: (call: Readonly<{
    toolName: 'execute_shell_command';
    arguments: Readonly<{ command: string }>;
  }>) => Promise<unknown>;
}

export interface SerenaPermissionBridge {
  /** Accepts only one fixed action and strictly bounded parameters. */
  readonly review: (input: unknown) => Result<ReviewSnapshot, AppError>;
  /** Register ONLY in an isolated in-process test Kernel registry. */
  readonly capability: RegisteredToolCapability;
}

const invalid = () => err(appError('VALIDATION_FAILED', 'Reviewed action unavailable'));
const blocked = () => err(appError('APPROVAL_STATE_INVALID', 'Reviewed action not authorized'));

function exactPlainObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length) return false;
  return ownKeys.every((key) => {
    if (typeof key !== 'string' || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor
      && descriptor.enumerable === true;
  });
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function captureState(state: TrustedBridgeState): Readonly<TrustedBridgeState> | undefined {
  if (!safeId(state.workspaceId) || !safeId(state.workspaceGeneration)
    || !safeId(state.runtimeEpoch) || !state.session
    || !safeId(state.session.id)
    || (state.session.type !== 'desktop' && state.session.type !== 'mcp-stdio')
    || typeof state.resumed !== 'boolean') return undefined;
  return Object.freeze({
    workspaceId: state.workspaceId,
    workspaceGeneration: state.workspaceGeneration,
    runtimeEpoch: state.runtimeEpoch,
    resumed: state.resumed,
    session: Object.freeze({ id: state.session.id, type: state.session.type }),
  });
}

function contractMatches(contract: BridgeToolContract): boolean {
  return contract.serenaVersion === '1.7.0'
    && contract.toolName === 'execute_shell_command'
    && contract.schemaVersion === BRIDGE_SCHEMA_VERSION
    && contract.risk === 'host-user-process';
}

function digest(detail: Detail): string {
  return createHash('sha256')
    .update(JSON.stringify({
      tool: 'execute_shell_command', command: COMMANDS[detail],
      script: SCRIPT_VERSION, schema: BRIDGE_SCHEMA_VERSION, registry: REGISTRY_VERSION,
      limits: LIMITS,
    }))
    .digest('hex');
}

function provenanceMatches(
  record: ApprovalRequestRecord | undefined,
  context: ToolExecutionContext,
  review: ReviewSnapshot,
  runtimeId: string,
  nowMs: number,
): boolean {
  return !!record && record.id === context.approvalRequestId
    && record.runtimeInstanceId === runtimeId
    && record.capability === CAPABILITY_NAME && record.effect === 'execute'
    && record.sensitivity === 'sensitive' && record.policyContext === 'workspace'
    && record.workspaceId === review.workspaceId
    && record.sessionId === review.session.id && record.sessionType === review.session.type
    && record.status === 'consumed' && record.decisionSource === 'user'
    && typeof record.decidedAt === 'string'
    && typeof record.consumedAt === 'string'
    && typeof record.bindingDigest === 'string' && /^[a-f0-9]{64}$/.test(record.bindingDigest)
    && Number.isFinite(Date.parse(record.expiresAt)) && Date.parse(record.expiresAt) > nowMs;
}

export function createSerenaPermissionBridge(
  dependencies: SerenaPermissionBridgeDependencies,
): SerenaPermissionBridge {
  const issued = new WeakSet<ReviewSnapshot>();
  // Same-process, atomic before the first await. A lost reply is never retried.
  const reserved = new Set<string>();

  const current = (snapshot: ReviewSnapshot): boolean => {
    try {
      const state = captureState(dependencies.trustedState());
      const nowMs = dependencies.now();
      return !!state && state.resumed && contractMatches(dependencies.toolContract())
        && Number.isSafeInteger(nowMs) && nowMs >= snapshot.issuedAtMs
        && nowMs < snapshot.expiresAtMs
        && state.workspaceId === snapshot.workspaceId
        && state.workspaceGeneration === snapshot.workspaceGeneration
        && state.session.id === snapshot.session.id
        && state.session.type === snapshot.session.type
        && state.runtimeEpoch === snapshot.runtimeEpoch;
    } catch {
      return false;
    }
  };

  const review = (input: unknown): Result<ReviewSnapshot, AppError> => {
    try {
      if (!exactPlainObject(input, ['actionId', 'schemaVersion', 'params'])
        || input.actionId !== BRIDGE_ACTION_ID
        || input.schemaVersion !== BRIDGE_SCHEMA_VERSION
        || !exactPlainObject(input.params, ['detail'])
        || (input.params.detail !== 'brief' && input.params.detail !== 'expanded')) return invalid();
      const state = captureState(dependencies.trustedState());
      const nowMs = dependencies.now();
      if (!state || !state.resumed || !contractMatches(dependencies.toolContract())
        || !Number.isSafeInteger(nowMs) || nowMs < 0) return invalid();
      const detail = input.params.detail;
      const snapshot: ReviewSnapshot = Object.freeze({
        attemptId: randomUUID(),
        actionId: BRIDGE_ACTION_ID,
        schemaVersion: BRIDGE_SCHEMA_VERSION,
        registryVersion: REGISTRY_VERSION,
        scriptVersion: SCRIPT_VERSION,
        params: Object.freeze({ detail }),
        commandFingerprint: digest(detail),
        limits: LIMITS,
        workspaceId: state.workspaceId,
        workspaceGeneration: state.workspaceGeneration,
        session: state.session,
        runtimeEpoch: state.runtimeEpoch,
        issuedAtMs: nowMs,
        expiresAtMs: nowMs + TTL_MS,
      });
      issued.add(snapshot);
      return ok(snapshot);
    } catch {
      return invalid();
    }
  };

  const admitted = (input: unknown): input is ReviewSnapshot => {
    if (typeof input !== 'object' || input === null) return false;
    try {
      return issued.has(input as ReviewSnapshot) && Object.isFrozen(input) && current(input as ReviewSnapshot);
    } catch {
      return false;
    }
  };

  const capability = defineToolCapability<ReviewSnapshot, InertBridgeResult>({
    name: CAPABILITY_NAME,
    effect: 'execute',
    validate(input) {
      return admitted(input) ? ok(input) : invalid();
    },
    resolveSecurity(input) {
      return admitted(input)
        ? ok({ sensitivity: 'sensitive', context: 'workspace', workspaceId: input.workspaceId })
        : invalid();
    },
    approval: {
      describe(input) {
        return admitted(input)
          ? ok({ title: 'Review one inert Serena inspection', resourceLabel: input.params.detail })
          : invalid();
      },
      bind(input) {
        return admitted(input) ? ok({
          actionId: input.actionId,
          detail: input.params.detail,
          commandFingerprint: input.commandFingerprint,
          schemaVersion: input.schemaVersion,
          registryVersion: input.registryVersion,
          scriptVersion: input.scriptVersion,
          limits: { ...input.limits },
          workspaceId: input.workspaceId,
          workspaceGeneration: input.workspaceGeneration,
          sessionId: input.session.id,
          sessionType: input.session.type,
          runtimeEpoch: input.runtimeEpoch,
          attemptId: input.attemptId,
          expiresAtMs: input.expiresAtMs,
        }) : invalid();
      },
    },
    async execute(input, context) {
      if (!admitted(input) || context.approvalDecision !== 'approved'
        || typeof context.approvalRequestId !== 'string'
        || context.session.id !== input.session.id || context.session.type !== input.session.type
        || context.security.workspaceId !== input.workspaceId
        || context.security.context !== 'workspace'
        || context.security.sensitivity !== 'sensitive'
        || reserved.has(input.attemptId)) return blocked();
      try {
        const record = dependencies.approvalRecords.findById(context.approvalRequestId);
        if (!record.ok || !provenanceMatches(
          record.value, context, input, dependencies.coordinatorRuntimeId, dependencies.now(),
        )) return blocked();
      } catch {
        return blocked();
      }
      // Reserve synchronously before fake dispatch; no outcome can be replayed.
      if (!admitted(input) || reserved.has(input.attemptId)) return blocked();
      reserved.add(input.attemptId);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          dependencies.fakeDispatch(Object.freeze({
            toolName: 'execute_shell_command',
            arguments: Object.freeze({ command: COMMANDS[input.params.detail] }),
          })),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Synthetic fake timeout')), LIMITS.timeoutMs);
          }),
        ]);
      } catch {
        // Unknown result, lost reply, rejected fake or timer expiry: quarantine permanently.
        return err(appError('INTERNAL_ERROR', 'Simulated dispatch outcome unknown'));
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
      // Deliberately discard stdout, stderr and all upstream response fields.
      return ok(Object.freeze({
        status: 'simulated',
        actionId: BRIDGE_ACTION_ID,
        detail: input.params.detail,
        commandFingerprint: input.commandFingerprint,
      }));
    },
  });
  return Object.freeze({ review, capability });
}
