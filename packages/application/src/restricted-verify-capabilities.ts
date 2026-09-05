import {
  RESTRICTED_VERIFY_ACTIONS,
  RestrictedVerifyFailure,
  appError,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type ResolvedToolSecurityContext,
  type RestrictedVerifyRequest,
  type RestrictedVerifyResult,
  type RestrictedVerifyWorkspaceContext,
  type Result,
  type ToolExecutionContext,
  type Workspace,
} from '@sud-d/domain';
import {
  type WorkspaceRepository,
  type WorkspaceTextFileSystem,
} from '@sud-d/infrastructure';
import {
  defineToolCapability,
  type RegisteredToolCapability,
  type ToolKernelAuditPort,
} from './tool-kernel.js';

export interface RestrictedVerifyPort {
  run(
    context: RestrictedVerifyWorkspaceContext,
    request: RestrictedVerifyRequest,
  ): Promise<RestrictedVerifyResult>;
}

export interface RestrictedVerifyCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
  readonly restrictedVerify: RestrictedVerifyPort;
  readonly summaryAudit?: ToolKernelAuditPort;
}

export function createRestrictedVerifyCapabilities(
  dependencies: RestrictedVerifyCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<RestrictedVerifyRequest, RestrictedVerifyResult>({
      name: 'verify.run',
      effect: 'execute',
      validate: validateRestrictedVerifyInput,
      resolveSecurity: () => resolveSecurity(dependencies),
      approval: {
        describe: (input) => ok({
          title: `Run project ${input.action}`,
          resourceLabel: 'Active Workspace',
        }),
        bind: (input) => ok({ action: input.action }),
      },
      async execute(input, context) {
        return executeRestrictedVerify(dependencies, context, input);
      },
    }),
  ]);
}

function resolveSecurity(
  dependencies: RestrictedVerifyCapabilityDependencies,
): Result<ResolvedToolSecurityContext, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  const resolved = dependencies.fileSystem.resolveExisting({
    workspaceCanonicalRoot: workspace.value.canonicalRoot,
    relativePath: '.',
    internalRoots: dependencies.internalRoots,
  });
  if (!resolved.ok) return resolved;
  return ok({
    sensitivity: 'normal',
    context: 'workspace',
    workspaceId: workspace.value.id,
  });
}

async function executeRestrictedVerify(
  dependencies: RestrictedVerifyCapabilityDependencies,
  executionContext: ToolExecutionContext,
  request: RestrictedVerifyRequest,
): Promise<Result<RestrictedVerifyResult, AppError>> {
  const workspace = getExecutionWorkspace(dependencies.workspaceRepo, executionContext);
  if (!workspace.ok) return workspace;
  const startedAt = Date.now();
  try {
    const result = await dependencies.restrictedVerify.run({
      workspaceId: workspace.value.id,
      canonicalRoot: workspace.value.canonicalRoot,
    }, request);
    await appendRestrictedVerifySummary(dependencies.summaryAudit, executionContext, workspace.value, result);
    return ok(result);
  } catch (error) {
    const code = error instanceof RestrictedVerifyFailure ? error.code : 'INTERNAL_ERROR';
    await appendRestrictedVerifyFailureSummary(
      dependencies.summaryAudit,
      executionContext,
      workspace.value,
      request.action,
      code,
      Math.max(0, Date.now() - startedAt),
    );
    if (error instanceof RestrictedVerifyFailure) return err(appError(error.code, error.message));
    return err(appError('INTERNAL_ERROR', 'Restricted Verify is unavailable'));
  }
}

async function appendRestrictedVerifyFailureSummary(
  audit: ToolKernelAuditPort | undefined,
  executionContext: ToolExecutionContext,
  workspace: Workspace,
  action: RestrictedVerifyRequest['action'],
  resultCode: AppError['code'],
  durationMs: number,
): Promise<void> {
  if (!audit) return;
  try {
    await audit.append({
      timestamp: new Date(),
      sessionId: executionContext.session.id,
      sessionType: executionContext.session.type,
      action: 'restricted_verify.run',
      workspaceId: workspace.id,
      policyDecision: executionContext.approvalDecision ? 'ask' : 'allow',
      resultCode,
      durationMs,
      metadata: {
        action,
        passed: false,
      },
    });
  } catch {
    // Tool Kernel audit remains authoritative; summary projection is best-effort only.
  }
}

async function appendRestrictedVerifySummary(
  audit: ToolKernelAuditPort | undefined,
  executionContext: ToolExecutionContext,
  workspace: Workspace,
  result: RestrictedVerifyResult,
): Promise<void> {
  if (!audit) return;
  try {
    await audit.append({
      timestamp: new Date(),
      sessionId: executionContext.session.id,
      sessionType: executionContext.session.type,
      action: 'restricted_verify.run',
      workspaceId: workspace.id,
      policyDecision: executionContext.approvalDecision ? 'ask' : 'allow',
      resultCode: result.passed ? 'VERIFY_PASSED' : 'VERIFY_FAILED',
      durationMs: result.durationMs,
      metadata: {
        action: result.action,
        passed: result.passed,
        exitCode: result.exitCode,
        truncated: result.truncated,
      },
    });
  } catch {
    // Tool Kernel audit remains authoritative; summary projection is best-effort only.
  }
}
function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Result<Workspace, AppError> {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    return active.length === 1
      ? ok(active[0]!)
      : err(appError('WORKSPACE_NOT_FOUND', 'Exactly one active Workspace is required'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to resolve active Workspace'));
  }
}

function getExecutionWorkspace(
  workspaceRepo: WorkspaceRepository,
  context: ToolExecutionContext,
): Result<Workspace, AppError> {
  const workspaceId = context.security.workspaceId;
  if (!workspaceId) return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is unavailable'));
  try {
    const workspace = workspaceRepo.findById(workspaceId);
    if (!workspace || !workspace.isActive) {
      return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is no longer active'));
    }
    return ok(workspace);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to revalidate active Workspace'));
  }
}

function validateRestrictedVerifyInput(input: unknown): Result<RestrictedVerifyRequest, AppError> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidInput();
  const keys = Object.keys(input);
  if (keys.length !== 1 || keys[0] !== 'action') return invalidInput();
  const action = (input as { readonly action?: unknown }).action;
  if (typeof action !== 'string' || !RESTRICTED_VERIFY_ACTIONS.includes(action as never)) return invalidInput();
  return ok({ action: action as RestrictedVerifyRequest['action'] });
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Restricted Verify input is invalid'));
}
