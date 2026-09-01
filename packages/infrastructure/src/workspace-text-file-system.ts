import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type InternalRoot,
  type Result,
} from '@sud-d/domain';
import {
  resolveExistingResource,
  resolveNewResource,
  validateRelativePath,
  type ResolvedPath,
} from './path-adapter.js';

export const WORKSPACE_TEXT_FILE_LIMITS = Object.freeze({
  maxRelativePathChars: 1024,
  maxTextBytes: 262_144,
  maxListEntries: 200,
  maxSearchQueryChars: 256,
  maxSearchVisitedEntries: 2_000,
  maxSearchScannedBytes: 8 * 1024 * 1024,
  maxSearchMatches: 100,
  maxSearchPreviewChars: 240,
});

const INTERNAL_TEMP_PREFIX = '.sud-d-tmp-';
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export interface WorkspacePathOptions {
  readonly workspaceCanonicalRoot: string;
  readonly relativePath: string;
  readonly internalRoots: readonly InternalRoot[];
}

export interface WorkspaceFileListEntry {
  readonly name: string;
  readonly relativePath: string;
  readonly kind: 'file' | 'directory';
  readonly size?: number;
}

export interface WorkspaceFileListResult {
  readonly relativePath: string;
  readonly entries: readonly WorkspaceFileListEntry[];
  readonly truncated: boolean;
}

export interface WorkspaceFileStatResult {
  readonly relativePath: string;
  readonly kind: 'file' | 'directory';
  readonly size: number;
  readonly modifiedAt: string;
}

export interface WorkspaceTextReadResult {
  readonly relativePath: string;
  readonly content: string;
  readonly bytes: number;
}

export interface WorkspaceTextSearchMatch {
  readonly relativePath: string;
  readonly line: number;
  readonly column: number;
  readonly preview: string;
}

export interface WorkspaceTextSearchResult {
  readonly relativePath: string;
  readonly query: string;
  readonly matches: readonly WorkspaceTextSearchMatch[];
  readonly visitedEntries: number;
  readonly scannedBytes: number;
  readonly truncated: boolean;
}

export interface WorkspaceTextMutationResult {
  readonly relativePath: string;
  readonly bytes: number;
}

export interface WorkspaceTextFileSystem {
  resolveExisting(options: WorkspacePathOptions): Result<ResolvedPath, AppError>;
  resolveNew(options: WorkspacePathOptions): Result<ResolvedPath, AppError>;
  list(options: WorkspacePathOptions, limit?: number): Result<WorkspaceFileListResult, AppError>;
  stat(options: WorkspacePathOptions): Result<WorkspaceFileStatResult, AppError>;
  readText(options: WorkspacePathOptions): Result<WorkspaceTextReadResult, AppError>;
  searchText(
    options: WorkspacePathOptions,
    query: string,
    limit?: number,
  ): Result<WorkspaceTextSearchResult, AppError>;
  createTextFile(options: WorkspacePathOptions, content: string): Result<WorkspaceTextMutationResult, AppError>;
  writeTextFile(options: WorkspacePathOptions, content: string): Result<WorkspaceTextMutationResult, AppError>;
}

export function createWorkspaceTextFileSystem(): WorkspaceTextFileSystem {
  return Object.freeze({
    resolveExisting: resolveExistingWorkspacePath,
    resolveNew: resolveNewWorkspacePath,
    list: listWorkspaceDirectory,
    stat: statWorkspaceResource,
    readText: readWorkspaceText,
    searchText: searchWorkspaceText,
    createTextFile: createWorkspaceTextFile,
    writeTextFile: writeWorkspaceTextFile,
  });
}

export function resolveExistingWorkspacePath(
  options: WorkspacePathOptions,
): Result<ResolvedPath, AppError> {
  const allowed = validateToolRelativePath(options.relativePath);
  if (!allowed.ok) return allowed;
  const resolved = resolveExistingResource({
    workspaceCanonicalRoot: options.workspaceCanonicalRoot,
    relativePath: allowed.value,
    internalRoots: [...options.internalRoots],
  });
  if (!resolved.ok) return resolved;
  const canonicalRelative = validateToolRelativePath(resolved.value.relative || '.');
  if (!canonicalRelative.ok) return canonicalRelative;
  return resolved;
}

export function resolveNewWorkspacePath(
  options: WorkspacePathOptions,
): Result<ResolvedPath, AppError> {
  const allowed = validateToolRelativePath(options.relativePath);
  if (!allowed.ok) return allowed;
  const resolved = resolveNewResource({
    workspaceCanonicalRoot: options.workspaceCanonicalRoot,
    relativePath: allowed.value,
    internalRoots: [...options.internalRoots],
  });
  if (!resolved.ok) return resolved;

  const parentRelative = path.posix.dirname(resolved.value.relative) || '.';
  const parent = resolveExistingWorkspacePath({ ...options, relativePath: parentRelative });
  if (!parent.ok) return parent;
  return resolved;
}

function validateToolRelativePath(relativePath: string): Result<string, AppError> {
  if (relativePath.length > WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars) {
    return err(appError('INVALID_PATH', 'Workspace-relative path is too long'));
  }
  const validated = validateRelativePath(relativePath);
  if (!validated.ok) return validated;
  const parts = validated.value.split('/').filter((part) => part !== '.' && part !== '');
  if (parts.some((part) => part.toLowerCase() === '.git')) {
    return err(appError('INTERNAL_PATH_DENIED', 'Git repository internals are not accessible through workspace file tools'));
  }
  if (parts.some((part) => part.toLowerCase().startsWith(INTERNAL_TEMP_PREFIX))) {
    return err(appError('INTERNAL_PATH_DENIED', 'Internal workspace mutation files are not accessible'));
  }
  return validated;
}

function listWorkspaceDirectory(
  options: WorkspacePathOptions,
  requestedLimit = WORKSPACE_TEXT_FILE_LIMITS.maxListEntries,
): Result<WorkspaceFileListResult, AppError> {
  const resolved = resolveExistingWorkspacePath(options);
  if (!resolved.ok) return resolved;

  let rootStat: fs.Stats;
  let entries: fs.Dirent[];
  try {
    rootStat = fs.lstatSync(resolved.value.canonical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'List target must be a regular directory'));
    }
    entries = fs.readdirSync(resolved.value.canonical, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to list workspace directory'));
  }

  const limit = clampLimit(requestedLimit, WORKSPACE_TEXT_FILE_LIMITS.maxListEntries);
  const safeEntries: WorkspaceFileListEntry[] = [];
  let truncated = false;

  for (const entry of entries) {
    const childRelative = joinRelative(resolved.value.relative, entry.name);
    if (isHiddenToolInternalPath(childRelative)) continue;
    if (classifySensitivity(childRelative) === 'credential') continue;

    const childResolved = resolveExistingWorkspacePath({ ...options, relativePath: childRelative });
    if (!childResolved.ok) {
      if (isSkippableSecurityBoundary(childResolved.error.code)) continue;
      return childResolved;
    }

    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(childResolved.value.canonical);
    } catch {
      return err(appError('INTERNAL_ERROR', 'Failed to inspect workspace directory entry'));
    }
    if (stat.isSymbolicLink()) continue;
    if (!stat.isDirectory() && !stat.isFile()) continue;

    if (safeEntries.length >= limit) {
      truncated = true;
      break;
    }
    safeEntries.push({
      name: entry.name,
      relativePath: childResolved.value.relative,
      kind: stat.isDirectory() ? 'directory' : 'file',
      ...(stat.isFile() ? { size: stat.size } : {}),
    });
  }

  return ok({
    relativePath: resolved.value.relative || '.',
    entries: safeEntries,
    truncated,
  });
}

function statWorkspaceResource(options: WorkspacePathOptions): Result<WorkspaceFileStatResult, AppError> {
  const resolved = resolveExistingWorkspacePath(options);
  if (!resolved.ok) return resolved;
  try {
    const stat = fs.lstatSync(resolved.value.canonical);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Resource type is not supported'));
    }
    return ok({
      relativePath: resolved.value.relative || '.',
      kind: stat.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect workspace resource'));
  }
}

function readWorkspaceText(options: WorkspacePathOptions): Result<WorkspaceTextReadResult, AppError> {
  const resolved = resolveExistingWorkspacePath(options);
  if (!resolved.ok) return resolved;
  const buffer = readBoundedRegularFile(resolved.value.canonical);
  if (!buffer.ok) return buffer;
  const decoded = decodeText(buffer.value);
  if (!decoded.ok) return decoded;
  return ok({
    relativePath: resolved.value.relative,
    content: decoded.value,
    bytes: buffer.value.byteLength,
  });
}

function searchWorkspaceText(
  options: WorkspacePathOptions,
  query: string,
  requestedLimit = WORKSPACE_TEXT_FILE_LIMITS.maxSearchMatches,
): Result<WorkspaceTextSearchResult, AppError> {
  const resolvedRoot = resolveExistingWorkspacePath(options);
  if (!resolvedRoot.ok) return resolvedRoot;

  try {
    const rootStat = fs.lstatSync(resolvedRoot.value.canonical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Search target must be a regular directory'));
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect search root'));
  }

  const limit = clampLimit(requestedLimit, WORKSPACE_TEXT_FILE_LIMITS.maxSearchMatches);
  const matches: WorkspaceTextSearchMatch[] = [];
  let visitedEntries = 0;
  let scannedBytes = 0;
  let truncated = false;
  let stop = false;

  const walk = (directory: ResolvedPath): Result<void, AppError> => {
    if (stop) return ok(undefined);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory.canonical, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return err(appError('INTERNAL_ERROR', 'Failed to enumerate workspace search directory'));
    }

    for (const entry of entries) {
      if (stop) break;
      if (visitedEntries >= WORKSPACE_TEXT_FILE_LIMITS.maxSearchVisitedEntries) {
        truncated = true;
        stop = true;
        break;
      }
      visitedEntries += 1;
      const childRelative = joinRelative(directory.relative, entry.name);
      if (isHiddenToolInternalPath(childRelative)) continue;
      if (classifySensitivity(childRelative) === 'credential') continue;

      const childResolved = resolveExistingWorkspacePath({ ...options, relativePath: childRelative });
      if (!childResolved.ok) {
        if (isSkippableSecurityBoundary(childResolved.error.code)) continue;
        return childResolved;
      }

      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(childResolved.value.canonical);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to inspect workspace search entry'));
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        const nested = walk(childResolved.value);
        if (!nested.ok) return nested;
        continue;
      }
      if (!stat.isFile() || stat.size > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) continue;
      if (scannedBytes + stat.size > WORKSPACE_TEXT_FILE_LIMITS.maxSearchScannedBytes) {
        truncated = true;
        stop = true;
        break;
      }

      let buffer: Buffer;
      try {
        buffer = fs.readFileSync(childResolved.value.canonical);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to read workspace search file'));
      }
      scannedBytes += buffer.byteLength;
      const decoded = decodeText(buffer);
      if (!decoded.ok) continue;

      const lines = decoded.value.split(/\r?\n/);
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex] ?? '';
        const columnIndex = line.indexOf(query);
        if (columnIndex < 0) continue;
        if (matches.length >= limit) {
          truncated = true;
          stop = true;
          break;
        }
        matches.push({
          relativePath: childResolved.value.relative,
          line: lineIndex + 1,
          column: columnIndex + 1,
          preview: makePreview(line, columnIndex),
        });
      }
    }
    return ok(undefined);
  };

  const walked = walk(resolvedRoot.value);
  if (!walked.ok) return walked;
  return ok({
    relativePath: resolvedRoot.value.relative || '.',
    query,
    matches,
    visitedEntries,
    scannedBytes,
    truncated,
  });
}

function createWorkspaceTextFile(
  options: WorkspacePathOptions,
  content: string,
): Result<WorkspaceTextMutationResult, AppError> {
  const resolved = resolveNewWorkspacePath(options);
  if (!resolved.ok) return resolved;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    return err(appError('VALIDATION_FAILED', 'Text content exceeds the trusted size limit'));
  }

  const parentRelative = path.posix.dirname(resolved.value.relative);
  const parent = resolveExistingWorkspacePath({
    ...options,
    relativePath: parentRelative === '' ? '.' : parentRelative,
  });
  if (!parent.ok) return parent;

  try {
    const parentStat = fs.lstatSync(parent.value.canonical);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Create parent must be a regular directory'));
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect create parent'));
  }

  const target = path.join(parent.value.canonical, path.basename(resolved.value.canonical));
  if (fs.existsSync(target)) {
    return err(appError('RESOURCE_ALREADY_EXISTS', 'Create target already exists'));
  }

  const temp = path.join(parent.value.canonical, `${INTERNAL_TEMP_PREFIX}${randomUUID()}`);
  try {
    writeCompleteTempFile(temp, Buffer.from(content, 'utf8'));
    const parentRecheck = resolveExistingWorkspacePath({
      ...options,
      relativePath: parentRelative === '' ? '.' : parentRelative,
    });
    if (!parentRecheck.ok || !sameCanonicalPath(parentRecheck.value.canonical, parent.value.canonical)) {
      return err(appError('INTERNAL_ERROR', 'Create parent changed during authorization'));
    }
    try {
      fs.linkSync(temp, target);
    } catch {
      if (fs.existsSync(target)) {
        return err(appError('RESOURCE_ALREADY_EXISTS', 'Create target already exists'));
      }
      return err(appError('INTERNAL_ERROR', 'Failed to create workspace text file'));
    }
    return ok({ relativePath: resolved.value.relative, bytes });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to prepare workspace text file'));
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* best-effort internal cleanup */ }
  }
}

function writeWorkspaceTextFile(
  options: WorkspacePathOptions,
  content: string,
): Result<WorkspaceTextMutationResult, AppError> {
  const resolved = resolveExistingWorkspacePath(options);
  if (!resolved.ok) return resolved;
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    return err(appError('VALIDATION_FAILED', 'Text content exceeds the trusted size limit'));
  }

  try {
    const stat = fs.lstatSync(resolved.value.canonical);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Write target must be a regular file'));
    }
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to inspect write target'));
  }

  const parent = path.dirname(resolved.value.canonical);
  const temp = path.join(parent, `${INTERNAL_TEMP_PREFIX}${randomUUID()}`);
  try {
    writeCompleteTempFile(temp, Buffer.from(content, 'utf8'));
    const rechecked = resolveExistingWorkspacePath(options);
    if (!rechecked.ok || !sameCanonicalPath(rechecked.value.canonical, resolved.value.canonical)) {
      return err(appError('INTERNAL_ERROR', 'Write target changed during authorization'));
    }
    const recheckedStat = fs.lstatSync(rechecked.value.canonical);
    if (!recheckedStat.isFile() || recheckedStat.isSymbolicLink()) {
      return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Write target must remain a regular file'));
    }
    fs.renameSync(temp, rechecked.value.canonical);
    return ok({ relativePath: resolved.value.relative, bytes });
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to update workspace text file'));
  } finally {
    try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch { /* best-effort internal cleanup */ }
  }
}

function readBoundedRegularFile(filePath: string): Result<Buffer, AppError> {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(filePath);
  } catch {
    return err(appError('RESOURCE_NOT_FOUND', 'Workspace resource does not exist'));
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return err(appError('RESOURCE_TYPE_UNSUPPORTED', 'Text read target must be a regular file'));
  }
  if (stat.size > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    return err(appError('RESOURCE_TOO_LARGE', 'Text resource exceeds the trusted read size limit'));
  }
  try {
    const buffer = fs.readFileSync(filePath);
    if (buffer.byteLength > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
      return err(appError('RESOURCE_TOO_LARGE', 'Text resource exceeds the trusted read size limit'));
    }
    return ok(buffer);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to read workspace text resource'));
  }
}

function decodeText(buffer: Buffer): Result<string, AppError> {
  if (buffer.includes(0)) {
    return err(appError('TEXT_CONTENT_INVALID', 'Resource is not supported UTF-8 text'));
  }
  try {
    return ok(utf8Decoder.decode(buffer));
  } catch {
    return err(appError('TEXT_CONTENT_INVALID', 'Resource is not supported UTF-8 text'));
  }
}

function writeCompleteTempFile(filePath: string, content: Buffer): void {
  const fd = fs.openSync(filePath, 'wx');
  try {
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function joinRelative(parent: string, name: string): string {
  if (!parent || parent === '.') return name;
  return path.posix.join(parent, name);
}

function makePreview(line: string, matchIndex: number): string {
  const max = WORKSPACE_TEXT_FILE_LIMITS.maxSearchPreviewChars;
  if (line.length <= max) return line;
  const half = Math.floor(max / 2);
  const start = Math.max(0, Math.min(matchIndex - half, line.length - max));
  return line.slice(start, start + max);
}

function clampLimit(requested: number, hardCap: number): number {
  if (!Number.isInteger(requested) || requested < 1) return hardCap;
  return Math.min(requested, hardCap);
}

function isHiddenToolInternalPath(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  return parts.some((part) => part.toLowerCase() === '.git' || part.toLowerCase().startsWith(INTERNAL_TEMP_PREFIX));
}

function isSkippableSecurityBoundary(code: AppError['code']): boolean {
  return code === 'INTERNAL_PATH_DENIED'
    || code === 'REPARSE_POINT_DENIED'
    || code === 'PATH_OUTSIDE_WORKSPACE';
}

function sameCanonicalPath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}
