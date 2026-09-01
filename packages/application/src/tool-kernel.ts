import {
  err,
  evaluatePolicy,
  ok,
  type AppError,
  type AuditEvent,
  type Effect,
  type PolicyDecision,
  type ResolvedToolSecurityContext,
  type Result,
  type ToolExecutionContext,
  type ToolInvocationRequest,
  type ToolKernelFailure,
  type ToolKernelResult,
  type ToolRegistryError,
} from '@sud-d/domain';

type MaybePromise<T> = T | Promise<T>;

export interface ToolCapabilityDefinition<TInput, TOutput> {
  readonly name: string;
  readonly effect: Effect;
  readonly validate: (input: unknown) => Result<TInput, AppError>;
  readonly resolveSecurity: (
    input: TInput,
  ) => Result<ResolvedToolSecurityContext, AppError>;
  readonly execute: (
    input: TInput,
    context: ToolExecutionContext,
  ) => MaybePromise<Result<TOutput, AppError>>;
}

export interface RegisteredToolCapability {
  readonly name: string;
  readonly effect: Effect;
  readonly validate: (input: unknown) => Result<unknown, AppError>;
  readonly resolveSecurity: (
    input: unknown,
  ) => Result<ResolvedToolSecurityContext, AppError>;
  readonly execute: (
    input: unknown,
    context: ToolExecutionContext,
  ) => MaybePromise<Result<unknown, AppError>>;
}

export interface ToolCapabilityRegistry {
  get(name: string): RegisteredToolCapability | undefined;
}

export interface ToolKernelAuditPort {
  append(event: Omit<AuditEvent, 'id'>): MaybePromise<unknown>;
}

export interface ToolKernel {
  invoke(request: ToolInvocationRequest): Promise<ToolKernelResult>;
}

export interface CreateToolKernelOptions {
  readonly registry: ToolCapabilityRegistry;
  readonly audit: ToolKernelAuditPort;
}

const CAPABILITY_NAME_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const VALID_EFFECTS = new Set<Effect>(['read', 'create', 'modify', 'execute', 'delete']);

export function defineToolCapability<TInput, TOutput>(
  definition: ToolCapabilityDefinition<TInput, TOutput>,
): RegisteredToolCapability {
  return Object.freeze({
    name: definition.name,
    effect: definition.effect,
    validate: (input: unknown) => definition.validate(input),
    resolveSecurity: (input: unknown) => definition.resolveSecurity(input as TInput),
    execute: (input: unknown, context: ToolExecutionContext) =>
      definition.execute(input as TInput, context),
  });
}

export function createToolCapabilityRegistry(
  definitions: readonly RegisteredToolCapability[],
): Result<ToolCapabilityRegistry, ToolRegistryError> {
  const registrations = new Map<string, RegisteredToolCapability>();

  for (const definition of definitions) {
    if (!isValidRegistration(definition)) {
      return err({ code: 'INVALID_CAPABILITY_REGISTRATION' });
    }
    if (registrations.has(definition.name)) {
      return err({ code: 'DUPLICATE_CAPABILITY_REGISTRATION' });
    }
    registrations.set(definition.name, definition);
  }

  return ok(Object.freeze({
    get(name: string): RegisteredToolCapability | undefined {
      return registrations.get(name);
    },
  }));
}

export function createToolKernel(options: CreateToolKernelOptions): ToolKernel {
  return Object.freeze({
    async invoke(request: ToolInvocationRequest): Promise<ToolKernelResult> {
      const startedAt = Date.now();
      const capability = options.registry.get(request.capability);

      if (!capability) {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: 'unknown',
          code: 'UNKNOWN_CAPABILITY',
          startedAt,
        });
      }

      let validated: Result<unknown, AppError>;
      try {
        validated = capability.validate(request.input);
      } catch {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'INVALID_INPUT',
          startedAt,
        });
      }

      if (!validated.ok) {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'INVALID_INPUT',
          causeCode: validated.error.code,
          startedAt,
        });
      }

      let security: Result<ResolvedToolSecurityContext, AppError>;
      try {
        security = capability.resolveSecurity(validated.value);
      } catch {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'SECURITY_RESOLUTION_FAILED',
          startedAt,
        });
      }

      if (!security.ok) {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'SECURITY_RESOLUTION_FAILED',
          causeCode: security.error.code,
          startedAt,
        });
      }

      let policyDecision: PolicyDecision;
      try {
        policyDecision = evaluatePolicy({
          effect: capability.effect,
          sensitivity: security.value.sensitivity,
          context: security.value.context,
        });
      } catch {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'POLICY_EVALUATION_FAILED',
          security: security.value,
          startedAt,
        });
      }

      if (!isPolicyDecision(policyDecision)) {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'POLICY_EVALUATION_FAILED',
          security: security.value,
          startedAt,
        });
      }

      if (policyDecision.decision === 'deny') {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'POLICY_DENIED',
          policyDecision: 'deny',
          security: security.value,
          startedAt,
        });
      }

      if (policyDecision.decision === 'ask') {
        return blockWithAudit({
          audit: options.audit,
          request,
          capabilityName: capability.name,
          code: 'APPROVAL_REQUIRED',
          policyDecision: 'ask',
          security: security.value,
          startedAt,
        });
      }

      const preExecutionAudit = createAuditEvent({
        request,
        capabilityName: capability.name,
        resultCode: 'EXECUTION_AUTHORIZED',
        policyDecision: 'allow',
        security: security.value,
        startedAt,
        phase: 'pre_execution',
        outcome: 'authorized',
      });

      if (!(await appendAudit(options.audit, preExecutionAudit))) {
        return failure('AUDIT_PRECONDITION_FAILED', 'blocked', 'allow');
      }

      const executionContext: ToolExecutionContext = Object.freeze({
        invocationId: request.invocationId,
        session: request.session,
        security: security.value,
      });

      let execution: Result<unknown, AppError>;
      try {
        execution = await capability.execute(validated.value, executionContext);
      } catch {
        const executorFailure = failure('EXECUTION_FAILED', 'executed', 'allow');
        if (!(await appendExecutionOutcomeAudit(
          options.audit,
          request,
          capability.name,
          security.value,
          'EXECUTION_FAILED',
          startedAt,
        ))) {
          return failure('AUDIT_OUTCOME_FAILED', 'executed', 'allow');
        }
        return executorFailure;
      }

      if (!execution.ok) {
        const executorFailure = failure(
          'EXECUTION_FAILED',
          'executed',
          'allow',
          execution.error.code,
        );
        if (!(await appendExecutionOutcomeAudit(
          options.audit,
          request,
          capability.name,
          security.value,
          'EXECUTION_FAILED',
          startedAt,
        ))) {
          return failure('AUDIT_OUTCOME_FAILED', 'executed', 'allow');
        }
        return executorFailure;
      }

      if (!(await appendExecutionOutcomeAudit(
        options.audit,
        request,
        capability.name,
        security.value,
        'EXECUTED',
        startedAt,
      ))) {
        return failure('AUDIT_OUTCOME_FAILED', 'executed', 'allow');
      }

      return {
        ok: true,
        outcome: 'executed',
        code: 'EXECUTED',
        policyDecision: 'allow',
        value: execution.value,
      };
    },
  });
}

interface BlockWithAuditOptions {
  readonly audit: ToolKernelAuditPort;
  readonly request: ToolInvocationRequest;
  readonly capabilityName: string;
  readonly code: Exclude<ToolKernelFailure['code'], 'AUDIT_OUTCOME_FAILED'>;
  readonly causeCode?: AppError['code'];
  readonly policyDecision?: ToolKernelFailure['policyDecision'];
  readonly security?: ResolvedToolSecurityContext;
  readonly startedAt: number;
}

async function blockWithAudit(options: BlockWithAuditOptions): Promise<ToolKernelFailure> {
  const blocked = failure(
    options.code,
    'blocked',
    options.policyDecision,
    options.causeCode,
  );
  const event = createAuditEvent({
    request: options.request,
    capabilityName: options.capabilityName,
    resultCode: options.code,
    policyDecision: options.policyDecision,
    security: options.security,
    startedAt: options.startedAt,
    phase: 'outcome',
    outcome: 'blocked',
  });

  if (!(await appendAudit(options.audit, event))) {
    return failure(
      'AUDIT_PRECONDITION_FAILED',
      'blocked',
      options.policyDecision,
    );
  }
  return blocked;
}

async function appendExecutionOutcomeAudit(
  audit: ToolKernelAuditPort,
  request: ToolInvocationRequest,
  capabilityName: string,
  security: ResolvedToolSecurityContext,
  resultCode: 'EXECUTED' | 'EXECUTION_FAILED',
  startedAt: number,
): Promise<boolean> {
  return appendAudit(audit, createAuditEvent({
    request,
    capabilityName,
    resultCode,
    policyDecision: 'allow',
    security,
    startedAt,
    phase: 'outcome',
    outcome: 'executed',
  }));
}

interface CreateAuditEventOptions {
  readonly request: ToolInvocationRequest;
  readonly capabilityName: string;
  readonly resultCode: string;
  readonly policyDecision?: ToolKernelFailure['policyDecision'];
  readonly security?: ResolvedToolSecurityContext;
  readonly startedAt: number;
  readonly phase: 'pre_execution' | 'outcome';
  readonly outcome: 'authorized' | 'blocked' | 'executed';
}

function createAuditEvent(options: CreateAuditEventOptions): Omit<AuditEvent, 'id'> {
  return {
    timestamp: new Date(),
    sessionId: options.request.session.id,
    sessionType: options.request.session.type,
    action: 'tool_kernel.invoke',
    ...(options.security?.workspaceId ? { workspaceId: options.security.workspaceId } : {}),
    ...(options.policyDecision ? { policyDecision: options.policyDecision } : {}),
    resultCode: options.resultCode,
    durationMs: Math.max(0, Date.now() - options.startedAt),
    metadata: {
      invocationId: options.request.invocationId,
      capability: options.capabilityName,
      phase: options.phase,
      outcome: options.outcome,
    },
  };
}

async function appendAudit(
  audit: ToolKernelAuditPort,
  event: Omit<AuditEvent, 'id'>,
): Promise<boolean> {
  try {
    await audit.append(event);
    return true;
  } catch {
    return false;
  }
}

function failure(
  code: ToolKernelFailure['code'],
  outcome: ToolKernelFailure['outcome'],
  policyDecision?: ToolKernelFailure['policyDecision'],
  causeCode?: AppError['code'],
): ToolKernelFailure {
  return {
    ok: false,
    outcome,
    code,
    ...(policyDecision ? { policyDecision } : {}),
    ...(causeCode ? { causeCode } : {}),
  };
}

function isValidRegistration(definition: RegisteredToolCapability): boolean {
  return definition.name.length <= 96
    && CAPABILITY_NAME_PATTERN.test(definition.name)
    && VALID_EFFECTS.has(definition.effect)
    && typeof definition.validate === 'function'
    && typeof definition.resolveSecurity === 'function'
    && typeof definition.execute === 'function';
}

function isPolicyDecision(value: unknown): value is PolicyDecision {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PolicyDecision>;
  return (candidate.decision === 'allow' || candidate.decision === 'ask' || candidate.decision === 'deny')
    && typeof candidate.reason === 'string';
}
