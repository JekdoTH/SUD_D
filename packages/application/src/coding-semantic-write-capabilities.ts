import path from 'node:path';
import {
  CodingEngineRuntimeFailure,
  appError,
  classifySensitivity,
  codingEngineRuntimeFailureAppError,
  err,
  ok,
  type AppError,
  type CodingEngineWorkspaceContext,
  type CodingInsertAfterInput,
  type CodingInsertBeforeInput,
  type CodingRenameInput,
  type CodingReplaceSymbolInput,
  type CodingSemanticWriteRequest,
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

export interface CodingSemanticWritePort {
  write(context: CodingEngineWorkspaceContext, request: CodingSemanticWriteRequest): Promise<unknown>;
}

export interface CodingSemanticWriteCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
  readonly semanticWrite: CodingSemanticWritePort;
}

export function createCodingSemanticWriteCapabilities(
  dependencies: CodingSemanticWriteCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<CodingReplaceSymbolInput, unknown>({
      name: 'code.replace_symbol',
      effect: 'modify',
      validate: validateReplaceSymbolInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      approval: {
        describe: (input) => ok({ title: 'Modify sensitive code', resourceLabel: input.relativePath }),
        bind: (input) => ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body }),
      },
      async execute(input, context) {
        return executeSemanticWrite(dependencies, context, {
          capability: 'code.replace_symbol',
          input,
        });
      },
    }),
    defineToolCapability<CodingInsertBeforeInput, unknown>({
      name: 'code.insert_before',
      effect: 'modify',
      validate: validateInsertBeforeInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      approval: {
        describe: (input) => ok({ title: 'Modify sensitive code', resourceLabel: input.relativePath }),
        bind: (input) => ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body }),
      },
      async execute(input, context) {
        return executeSemanticWrite(dependencies, context, {
          capability: 'code.insert_before',
          input,
        });
      },
    }),
    defineToolCapability<CodingInsertAfterInput, unknown>({
      name: 'code.insert_after',
      effect: 'modify',
      validate: validateInsertAfterInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      approval: {
        describe: (input) => ok({ title: 'Modify sensitive code', resourceLabel: input.relativePath }),
        bind: (input) => ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body }),
      },
      async execute(input, context) {
        return executeSemanticWrite(dependencies, context, {
          capability: 'code.insert_after',
          input,
        });
      },
    }),
    defineToolCapability<CodingRenameInput, unknown>({
      name: 'code.rename',
      effect: 'modify',
      validate: validateRenameInput,
      resolveSecurity: (input) => resolveSecurity(dependencies, input.relativePath),
      approval: {
        describe: (input) => ok({ title: 'Rename sensitive code symbol', resourceLabel: input.relativePath }),
        bind: (input) => ok({ namePath: input.namePath, relativePath: input.relativePath, newName: input.newName }),
      },
      async execute(input, context) {
        return executeSemanticWrite(dependencies, context, {
          capability: 'code.rename',
          input,
        });
      },
    }),
  ]);
}

function resolveSecurity(
  dependencies: CodingSemanticWriteCapabilityDependencies,
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

async function executeSemanticWrite(
  dependencies: CodingSemanticWriteCapabilityDependencies,
  executionContext: ToolExecutionContext,
  request: CodingSemanticWriteRequest,
): Promise<Result<unknown, AppError>> {
  const workspace = getExecutionWorkspace(dependencies.workspaceRepo, executionContext);
  if (!workspace.ok) return workspace;
  const context: CodingEngineWorkspaceContext = {
    workspaceId: workspace.value.id,
    canonicalRoot: workspace.value.canonicalRoot,
    projectName: path.basename(workspace.value.canonicalRoot),
  };
  try {
    return ok(await dependencies.semanticWrite.write(context, request));
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

function validateReplaceSymbolInput(input: unknown): Result<CodingReplaceSymbolInput, AppError> {
  if (!isStrictObject(input, ['namePath', 'relativePath', 'body'])) return invalidInput();
  if (!isBoundedText(input.namePath, 2_048)) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (!isBoundedBody(input.body)) return invalidInput();
  return ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body });
}

function validateInsertBeforeInput(input: unknown): Result<CodingInsertBeforeInput, AppError> {
  if (!isStrictObject(input, ['namePath', 'relativePath', 'body'])) return invalidInput();
  if (!isBoundedText(input.namePath, 2_048)) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (!isBoundedBody(input.body)) return invalidInput();
  return ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body });
}

function validateInsertAfterInput(input: unknown): Result<CodingInsertAfterInput, AppError> {
  if (!isStrictObject(input, ['namePath', 'relativePath', 'body'])) return invalidInput();
  if (!isBoundedText(input.namePath, 2_048)) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (!isBoundedBody(input.body)) return invalidInput();
  return ok({ namePath: input.namePath, relativePath: input.relativePath, body: input.body });
}

function validateRenameInput(input: unknown): Result<CodingRenameInput, AppError> {
  if (!isStrictObject(input, ['namePath', 'relativePath', 'newName'])) return invalidInput();
  if (!isBoundedText(input.namePath, 2_048)) return invalidInput();
  if (!isRelativePath(input.relativePath)) return invalidInput();
  if (!isBoundedText(input.newName, 2_048)) return invalidInput();
  return ok({ namePath: input.namePath, relativePath: input.relativePath, newName: input.newName });
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

function isBoundedBody(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\0')
    && Buffer.byteLength(value, 'utf8') <= WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes;
}

function isStrictObject(value: unknown, allowedKeys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Semantic write input is invalid'));
}
