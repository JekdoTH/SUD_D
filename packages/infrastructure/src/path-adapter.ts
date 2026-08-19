import fs from 'node:fs';
import path from 'node:path';
import type { Result, AppError, InternalRoot } from '@sud-d/domain';
import { ok, err, appError } from '@sud-d/domain';

// ---------------------------------------------------------------------------
// Windows reserved device names (RFC-4 / Win32 docs)
// ---------------------------------------------------------------------------
const RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM0', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT0', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

// Absolute drive-letter path: C:\... or C:/...
const ABS_DRIVE_RE = /^[A-Za-z]:[/\\]/;
// Drive-relative: C:something (no separator after colon)
const DRIVE_REL_RE = /^[A-Za-z]:[^/\\]/;
// UNC: \\server or //server
const UNC_RE = /^[/\\]{2}/;
// Device namespace: \\?\ or \\.\
const DEVICE_NS_RE = /^[/\\]{2}[?.]/;
// NT volume GUID: \\?\Volume{...}
const VOLUME_GUID_RE = /Volume\{[0-9a-fA-F-]+\}/;

type PathErr = AppError;

// ---------------------------------------------------------------------------
// Relative path validation
// ---------------------------------------------------------------------------

export function validateRelativePath(raw: string): Result<string, PathErr> {
  if (!raw || raw.trim() === '') {
    return err(appError('INVALID_PATH', 'Path must not be empty'));
  }

  // NUL byte
  if (raw.includes('\0')) {
    return err(appError('INVALID_PATH', 'Path contains NUL byte'));
  }

  // Device/UNC/absolute forms
  if (DEVICE_NS_RE.test(raw)) {
    return err(appError('DEVICE_PATH_DENIED', 'Device namespace paths are not allowed'));
  }
  if (VOLUME_GUID_RE.test(raw)) {
    return err(appError('DEVICE_PATH_DENIED', 'Volume GUID paths are not allowed'));
  }
  if (UNC_RE.test(raw)) {
    return err(appError('INVALID_PATH', 'UNC paths are not allowed'));
  }
  if (ABS_DRIVE_RE.test(raw)) {
    return err(appError('INVALID_PATH', 'Absolute paths are not allowed'));
  }
  if (DRIVE_REL_RE.test(raw)) {
    return err(appError('INVALID_PATH', 'Drive-relative paths are not allowed'));
  }
  if (raw.startsWith('/') || raw.startsWith('\\')) {
    return err(appError('INVALID_PATH', 'Absolute paths are not allowed'));
  }

  // Colon in path (alternate data streams)
  if (raw.includes(':')) {
    return err(appError('INVALID_PATH', 'Colons are not allowed in relative paths'));
  }

  // Normalize separators to forward-slash for component analysis
  const normalized = raw.replace(/\\/g, '/');
  const components = normalized.split('/');

  for (const component of components) {
    if (component === '' && components.length > 1) continue; // skip empty from trailing slash
    if (component === '..') {
      return err(appError('INVALID_PATH', 'Path traversal (..) is not allowed'));
    }
    if (component === '.') continue; // allow single-dot (normalised away)

    // Trailing dot or space
    if (/[. ]$/.test(component)) {
      return err(appError('INVALID_PATH', `Component "${component}" ends with dot or space`));
    }

    // Reserved device names (with or without extension)
    const nameWithoutExt = component.split('.')[0]?.toUpperCase() ?? '';
    if (RESERVED_NAMES.has(nameWithoutExt)) {
      return err(
        appError('DEVICE_PATH_DENIED', `Reserved device name "${component}" is not allowed`),
      );
    }

    // Colon in component (already caught above, belt-and-suspenders)
    if (component.includes(':')) {
      return err(appError('INVALID_PATH', 'Colons are not allowed in path components'));
    }
  }

  return ok(normalized);
}

// ---------------------------------------------------------------------------
// Workspace root validation (trusted — from native dialog)
// ---------------------------------------------------------------------------

export function validateWorkspaceRoot(raw: string): Result<string, PathErr> {
  if (!raw || raw.trim() === '') {
    return err(appError('WORKSPACE_INVALID', 'Workspace root must not be empty'));
  }
  if (UNC_RE.test(raw)) {
    return err(appError('WORKSPACE_INVALID', 'UNC paths are not allowed as Workspace roots'));
  }
  if (DEVICE_NS_RE.test(raw)) {
    return err(appError('WORKSPACE_INVALID', 'Device namespace paths are not allowed'));
  }
  if (!ABS_DRIVE_RE.test(raw)) {
    return err(appError('WORKSPACE_INVALID', 'Workspace root must be an absolute drive-letter path'));
  }
  return ok(raw);
}

// ---------------------------------------------------------------------------
// Canonicalize a path using fs.realpathSync (native Windows behavior)
// ---------------------------------------------------------------------------

export function canonicalizePath(p: string): Result<string, PathErr> {
  try {
    const resolved = fs.realpathSync(p);
    return ok(resolved);
  } catch {
    return err(appError('INVALID_PATH', `Cannot canonicalize path: ${p}`));
  }
}

// ---------------------------------------------------------------------------
// Containment check (no string-prefix — uses path.relative)
// ---------------------------------------------------------------------------

export function isContainedIn(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  // Contained if relative path doesn't start with '..' and is not absolute
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ---------------------------------------------------------------------------
// InternalRoot guard — must be checked BEFORE workspace containment
// ---------------------------------------------------------------------------

export function isUnderInternalRoot(
  canonicalPath: string,
  internalRoots: InternalRoot[],
): InternalRoot | undefined {
  return internalRoots.find((ir) => isContainedIn(canonicalPath, ir.canonicalPath));
}

// ---------------------------------------------------------------------------
// Reparse-point (symlink/junction) detection
// ---------------------------------------------------------------------------

export function hasReparsePoint(targetPath: string): Result<boolean, PathErr> {
  try {
    // Check each component of the path
    const parts = targetPath.replace(/\\/g, '/').split('/');
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      current = i === 0 ? (parts[i] ?? '') : path.join(current, parts[i] ?? '');
      if (!current) continue;
      try {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) return ok(true);
        // Junction detection: on Windows, a directory with REPARSE_POINT attribute
        // lstat reports it as a symlink on Node.js for junctions too
      } catch {
        // Path component doesn't exist yet — stop checking
        break;
      }
    }
    return ok(false);
  } catch {
    return err(appError('INTERNAL_ERROR', 'Failed to check reparse points'));
  }
}

// ---------------------------------------------------------------------------
// Resolve existing resource path within a workspace
// ---------------------------------------------------------------------------

export interface ResolveExistingOptions {
  workspaceCanonicalRoot: string;
  relativePath: string;
  internalRoots: InternalRoot[];
}

export interface ResolvedPath {
  canonical: string;
  relative: string;
}

export function resolveExistingResource(
  opts: ResolveExistingOptions,
): Result<ResolvedPath, PathErr> {
  const { workspaceCanonicalRoot, relativePath, internalRoots } = opts;

  // 1. Validate relative path form
  const validRel = validateRelativePath(relativePath);
  if (!validRel.ok) return validRel;

  // 2. Construct absolute candidate
  const candidate = path.join(workspaceCanonicalRoot, validRel.value);

  // 3. Canonicalize
  const canonical = canonicalizePath(candidate);
  if (!canonical.ok) return err(appError('RESOURCE_NOT_FOUND', 'Resource does not exist'));

  // 4. InternalRoot guard (before workspace check)
  const ir = isUnderInternalRoot(canonical.value, internalRoots);
  if (ir) {
    return err(appError('INTERNAL_PATH_DENIED', `Path is under InternalRoot: ${ir.label}`));
  }

  // 5. Workspace containment
  if (!isContainedIn(canonical.value, workspaceCanonicalRoot)) {
    return err(appError('PATH_OUTSIDE_WORKSPACE', 'Path is outside the Workspace boundary'));
  }

  // 6. Reparse point denial
  const rp = hasReparsePoint(canonical.value);
  if (!rp.ok) return rp;
  if (rp.value) {
    return err(appError('REPARSE_POINT_DENIED', 'Symlinks and junctions are not permitted'));
  }

  const rel = path.relative(workspaceCanonicalRoot, canonical.value).replace(/\\/g, '/');
  return ok({ canonical: canonical.value, relative: rel });
}

// ---------------------------------------------------------------------------
// Resolve new (not-yet-existing) resource path within a workspace
// ---------------------------------------------------------------------------

export function resolveNewResource(
  opts: ResolveExistingOptions,
): Result<ResolvedPath, PathErr> {
  const { workspaceCanonicalRoot, relativePath, internalRoots } = opts;

  const validRel = validateRelativePath(relativePath);
  if (!validRel.ok) return validRel;

  const candidate = path.join(workspaceCanonicalRoot, validRel.value);

  // Find nearest existing ancestor
  let ancestor = candidate;
  while (ancestor !== path.dirname(ancestor)) {
    if (fs.existsSync(ancestor)) break;
    ancestor = path.dirname(ancestor);
  }

  // Canonicalize ancestor
  const canonAncestor = canonicalizePath(ancestor);
  if (!canonAncestor.ok) {
    return err(appError('INVALID_PATH', 'Cannot resolve ancestor path'));
  }

  // InternalRoot guard on ancestor
  const ir = isUnderInternalRoot(canonAncestor.value, internalRoots);
  if (ir) {
    return err(appError('INTERNAL_PATH_DENIED', `Ancestor is under InternalRoot: ${ir.label}`));
  }

  // Workspace containment of ancestor
  if (!isContainedIn(canonAncestor.value, workspaceCanonicalRoot)) {
    return err(appError('PATH_OUTSIDE_WORKSPACE', 'Path is outside the Workspace boundary'));
  }

  // Reparse point check on ancestor
  const rp = hasReparsePoint(canonAncestor.value);
  if (!rp.ok) return rp;
  if (rp.value) {
    return err(appError('REPARSE_POINT_DENIED', 'Symlinks and junctions are not permitted'));
  }

  const rel = path.relative(workspaceCanonicalRoot, candidate).replace(/\\/g, '/');
  return ok({ canonical: candidate, relative: rel });
}
