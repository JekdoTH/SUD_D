import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
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

export const WORKSPACE_FILE_CAPABILITY_NAMES = Object.freeze([
  'workspace.list',
  'workspace.stat',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.create_text_file',
  'workspace.write_text_file',
] as const);

export type WorkspaceFileCapabilityName = (typeof WORKSPACE_FILE_CAPABILITY_NAMES)[number];

export interface WorkspaceFileCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
}

interface PathInput {
  readonly relativePath: string;
}

interface ListInput extends PathInput {
  readonly limit?: number;
}

interface SearchInput extends PathInput {
  readonly query: string;
  readonly limit?: number;
}

interface WriteInput extends PathInput {
  readonly content: string;
}

export function createWorkspaceFileCapabilities(
  dependencies: WorkspaceFileCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  const resolveExisting = (input: PathInput) => resolveSecurity(dependencies, input.relativePath, 'existing');
  const resolveNew = (input: PathInput) => resolveSecurity(dependencies, input.relativePath, 'new');

  return Object.freeze([
    defineToolCapability<ListInput, unknown>({
      name: 'workspace.list',
      effect: 'read',
      validate: validateListInput,
      resolveSecurity: resolveExisting,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.list(pathOptions(dependencies, workspace.value, input.relativePath), input.limit);
      },
    }),
    defineToolCapability<PathInput, unknown>({
      name: 'workspace.stat',
      effect: 'read',
      validate: validatePathInput,
      resolveSecurity: resolveExisting,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.stat(pathOptions(dependencies, workspace.value, input.relativePath));
      },
    }),
    defineToolCapability<PathInput, unknown>({
      name: 'workspace.read_text',
      effect: 'read',
      validate: validatePathInput,
      resolveSecurity: resolveExisting,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.readText(pathOptions(dependencies, workspace.value, input.relativePath));
      },
    }),
    defineToolCapability<SearchInput, unknown>({
      name: 'workspace.search_text',
      effect: 'read',
      validate: validateSearchInput,
      resolveSecurity: resolveExisting,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.searchText(
          pathOptions(dependencies, workspace.value, input.relativePath),
          input.query,
          input.limit,
        );
      },
    }),
    defineToolCapability<WriteInput, unknown>({
      name: 'workspace.create_text_file',
      effect: 'create',
      validate: validateWriteInput,
      resolveSecurity: resolveNew,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.createTextFile(
          pathOptions(dependencies, workspace.value, input.relativePath),
          input.content,
        );
      },
    }),
    defineToolCapability<WriteInput, unknown>({
      name: 'workspace.write_text_file',
      effect: 'modify',
      validate: validateWriteInput,
      resolveSecurity: resolveExisting,
      execute(input, context) {
        const workspace = getExecutionWorkspace(dependencies.workspaceRepo, context);
        if (!workspace.ok) return workspace;
        return dependencies.fileSystem.writeTextFile(
          pathOptions(dependencies, workspace.value, input.relativePath),
          input.content,
        );
      },
    }),
  ]);
}

function resolveSecurity(
  dependencies: WorkspaceFileCapabilityDependencies,
  relativePath: string,
  mode: 'existing' | 'new',
): Result<ResolvedToolSecurityContext, AppError> {
  const workspace = getActiveWorkspace(dependencies.workspaceRepo);
  if (!workspace.ok) return workspace;
  const options = pathOptions(dependencies, workspace.value, relativePath);
  const resolved = mode === 'existing'
    ? dependencies.fileSystem.resolveExisting(options)
    : dependencies.fileSystem.resolveNew(options);
  if (!resolved.ok) return resolved;
  return ok({
    sensitivity: classifySensitivity(resolved.value.relative),
    context: 'workspace',
    workspaceId: workspace.value.id,
  });
}

function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Result<Workspace, AppError> {
  try {
    const active = workspaceRepo.list().find((workspace) => workspace.isActive);
    return active
      ? ok(active)
      : err(appError('WORKSPACE_NOT_FOUND', 'No active Workspace is selected'));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to resolve active Workspace'));
  }
}

function getExecutionWorkspace(
  workspaceRepo: WorkspaceRepository,
  context: ToolExecutionContext,
): Result<Workspace, AppError> {
  const workspaceId = context.security.workspaceId;
  if (!workspaceId) {
    return err(appError('WORKSPACE_NOT_FOUND', 'Authorized Workspace is unavailable'));
  }
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

function pathOptions(
  dependencies: WorkspaceFileCapabilityDependencies,
  workspace: Workspace,
  relativePath: string,
) {
  return {
    workspaceCanonicalRoot: workspace.canonicalRoot,
    relativePath,
    internalRoots: dependencies.internalRoots,
  };
}

function validatePathInput(input: unknown): Result<PathInput, AppError> {
  if (!isStrictObject(input, ['relativePath'])) return invalidInput();
  if (!isRelativePathValue(input.relativePath)) return invalidInput();
  return ok({ relativePath: input.relativePath });
}

function validateListInput(input: unknown): Result<ListInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'limit'])) return invalidInput();
  if (!isRelativePathValue(input.relativePath)) return invalidInput();
  if (!isOptionalLimit(input.limit, WORKSPACE_TEXT_FILE_LIMITS.maxListEntries)) return invalidInput();
  return ok({
    relativePath: input.relativePath,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
}

function validateSearchInput(input: unknown): Result<SearchInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'query', 'limit'])) return invalidInput();
  if (!isRelativePathValue(input.relativePath)) return invalidInput();
  if (
    typeof input.query !== 'string'
    || input.query.length < 1
    || input.query.length > WORKSPACE_TEXT_FILE_LIMITS.maxSearchQueryChars
    || input.query.includes('\0')
  ) {
    return invalidInput();
  }
  if (!isOptionalLimit(input.limit, WORKSPACE_TEXT_FILE_LIMITS.maxSearchMatches)) return invalidInput();
  return ok({
    relativePath: input.relativePath,
    query: input.query,
    ...(input.limit === undefined ? {} : { limit: input.limit }),
  });
}

function validateWriteInput(input: unknown): Result<WriteInput, AppError> {
  if (!isStrictObject(input, ['relativePath', 'content'])) return invalidInput();
  if (!isRelativePathValue(input.relativePath) || typeof input.content !== 'string') return invalidInput();
  if (Buffer.byteLength(input.content, 'utf8') > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) return invalidInput();
  return ok({ relativePath: input.relativePath, content: input.content });
}

function isRelativePathValue(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars;
}

function isOptionalLimit(value: unknown, hardCap: number): value is number | undefined {
  return value === undefined
    || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= hardCap);
}

function isStrictObject(
  value: unknown,
  allowedKeys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.every((key) => allowedKeys.includes(key));
}

function invalidInput(): Result<never, AppError> {
  return err(appError('VALIDATION_FAILED', 'Workspace file tool input is invalid'));
}
