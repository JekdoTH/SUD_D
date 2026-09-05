import path from 'node:path';
import {
  CodingEngineRuntimeFailure,
  appError,
  classifySensitivity,
  codingEngineRuntimeFailureAppError,
  err,
  ok,
  type AppError,
  type CodingDiagnosticsInput,
  type CodingEngineWorkspaceContext,
  type CodingFindReferencesInput,
  type CodingFindSymbolInput,
  type CodingOverviewInput,
  type CodingSearchInput,
  type CodingSemanticReadRequest,
  type InternalRoot,
  type ResolvedToolSecurityContext,
  type Result,
  type ToolExecutionContext,
  type Workspace,
} from '@sud-d/domain';
import {
  WORKSPACE_TEXT_FILE_LIMITS,
  type WorkspaceRepository,
  type WorkspaceTextFileSystem,
} from '@sud-d/infrastructure';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';

export interface CodingSemanticReadPort {
  read(context: CodingEngineWorkspaceContext, request: CodingSemanticReadRequest): Promise<unknown>;
}

export interface CodingSemanticReadCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
  readonly semanticRead: CodingSemanticReadPort;
}

export function createCodingSemanticReadCapabilities(
  dependencies: CodingSemanticReadCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<CodingOverviewInput, unknown>({
      name: 'code.overview',
      effect: 'read',
      validate: validateOverviewInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      async execute(input, context) {
        return executeSemanticRead(dependencies, context, {
          capability: 'code.overview',
          input,
        });
      },
    }),
    defineToolCapability<CodingFindSymbolInput, unknown>({
      name: 'code.find_symbol',
      effect: 'read',
      validate: validateFindSymbolInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath ?? '.'),
      async execute(input, context) {
        return executeSemanticRead(dependencies, context, {
          capability: 'code.find_symbol',
          input,
        });
      },
    }),
    defineToolCapability<CodingFindReferencesInput, unknown>({
      name: 'code.find_references',
      effect: 'read',
      validate: validateFindReferencesInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      async execute(input, context) {
        return executeSemanticRead(dependencies, context, {
          capability: 'code.find_references',
          input,
        });
      },
    }),
    defineToolCapability<CodingSearchInput, unknown>({
      name: 'code.search',
      effect: 'read',
      validate: validateSearchInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath ?? '.'),
      async execute(input, context) {
        return executeSemanticRead(dependencies, context, {
          capability: 'code.search',
          input,
        });
      },
    }),
    defineToolCapability<CodingDiagnosticsInput, unknown>({
      name: 'code.diagnostics',
      effect: 'read',
      validate: validateDiagnosticsInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      async execute(input, context) {
        return executeSemanticRead(dependencies, context, {
          capability: 'code.diagnostics',
          input,
        });
      },
    }),
  ]);
}

function resolveSecurity(
  dependencies: CodingSemanticReadCapabilityDependencies,
  relativePath: string,
): Result<ResolvedToolSecurityContext, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  const resolved = dependencies.fileSystem.resolveExisting({
    workspaceCanonicalRoot: workspace.value.canonicalRoot,
    relativePath,
    internalRoots: dependencies.internalRoots,
  });
  if (!resolved.ok) return resolved;
  return ok({
    sensitivity: classifySensitivity(resolved.value.relative),
    context: 'workspace',
    workspaceId: workspace.value.id,
  });
}

async function executeSemanticRead(
  dependencies: CodingSemanticReadCapabilityDependencies,
  executionContext: ToolExecutionContext,
  request: CodingSemanticReadRequest,
): Promise<Result<unknown, AppError>> {
  const workspace = getExecutionWorkspace(dependencies.workspaceRepo, executionContext);
  if (!workspace.ok) return workspace;
  const context: CodingEngineWorkspaceContext = {
    workspaceId: workspace.value.id,
    canonicalRoot: workspace.value.canonicalRoot,
    projectName: path.basename(workspace.value.canonicalRoot),
  };
  try {
    return ok(await dependencies.semanticRead.read(context, request));
  } catch (error) {
    if (error instanceof CodingEngineRuntimeFailure) {
      return err(codingEngineRuntimeFailureAppError(error.code));
    }
    return err(codingEngineRuntimeFailureAppError('CODING_ENGINE_UNAVAILABLE'));
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

function validateOverviewInput(input: unknown): Result<CodingOverviewInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'depth'])) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (input.depth !== undefined && (!Number.isInteger(input.depth) || (input.depth as number) < -1 || (input.depth as number) > 8)) {
    return invalidInput();
  }
  return ok({
    relativePath: input.relativePath,
    ...(input.depth !== undefined ? { depth: input.depth as number } : {}),
  });
}

function validateFindSymbolInput(input: unknown): Result<CodingFindSymbolInput, AppError> {
  if (!isStrictObject(input, [
    'namePathPattern',
    'relativePath',
    'depth',
    'includeBody',
    'substringMatching',
    'maxMatches',
  ])) return invalidInput();
  if (!isBoundedText(input.namePathPattern, 2_048)) return invalidInput();
  if (input.relativePath !== undefined && !isRelativePath(input.relativePath)) return invalidInput();
  if (input.depth !== undefined && (!Number.isInteger(input.depth) || (input.depth as number) < 0 || (input.depth as number) > 8)) {
    return invalidInput();
  }
  if (input.includeBody !== undefined && typeof input.includeBody !== 'boolean') return invalidInput();
  if (input.substringMatching !== undefined && typeof input.substringMatching !== 'boolean') return invalidInput();
  if (input.maxMatches !== undefined && (!Number.isInteger(input.maxMatches) || (input.maxMatches as number) < 1 || (input.maxMatches as number) > 100)) {
    return invalidInput();
  }
  return ok({
    namePathPattern: input.namePathPattern,
    ...(input.relativePath !== undefined ? { relativePath: input.relativePath } : {}),
    ...(input.depth !== undefined ? { depth: input.depth as number } : {}),
    ...(input.includeBody !== undefined ? { includeBody: input.includeBody } : {}),
    ...(input.substringMatching !== undefined ? { substringMatching: input.substringMatching } : {}),
    ...(input.maxMatches !== undefined ? { maxMatches: input.maxMatches as number } : {}),
  });
}

function validateFindReferencesInput(input: unknown): Result<CodingFindReferencesInput, AppError> {
  if (!isStrictObject(input, ['namePath', 'relativePath'])) return invalidInput();
  if (!isBoundedText(input.namePath, 2_048)) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  return ok({ namePath: input.namePath, relativePath: input.relativePath });
}

function validateSearchInput(input: unknown): Result<CodingSearchInput, AppError> {
  if (!isStrictObject(input, ['pattern', 'relativePath', 'codeOnly'])) return invalidInput();
  if (!isBoundedText(input.pattern, 2_048)) return invalidInput();
  if (input.relativePath !== undefined && !isRelativePath(input.relativePath)) return invalidInput();
  if (input.codeOnly !== undefined && typeof input.codeOnly !== 'boolean') return invalidInput();
  return ok({
    pattern: input.pattern,
    ...(input.relativePath !== undefined ? { relativePath: input.relativePath } : {}),
    ...(input.codeOnly !== undefined ? { codeOnly: input.codeOnly } : {}),
  });
}

function validateDiagnosticsInput(input: unknown): Result<CodingDiagnosticsInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'startLine', 'endLine', 'minSeverity'])) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (input.startLine !== undefined && (!Number.isInteger(input.startLine) || (input.startLine as number) < 0)) return invalidInput();
  if (input.endLine !== undefined && (!Number.isInteger(input.endLine) || (input.endLine as number) < -1)) return invalidInput();
  if (input.minSeverity !== undefined && ![1, 2, 3, 4].includes(input.minSeverity as number)) return invalidInput();
  return ok({
    relativePath: input.relativePath,
    ...(input.startLine !== undefined ? { startLine: input.startLine as number } : {}),
    ...(input.endLine !== undefined ? { endLine: input.endLine as number } : {}),
    ...(input.minSeverity !== undefined ? { minSeverity: input.minSeverity as 1 | 2 | 3 | 4 } : {}),
  });
}

function isBoundedText(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars && !value.includes('\0');
}

function isRelativePath(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars
    && !value.includes('\0');
}

function isStrictObject(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Semantic read input is invalid'));
}
