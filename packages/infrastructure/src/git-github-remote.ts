import {
  appError,
  err,
  ok,
  type AppError,
  type GitRemoteTransport,
  type Result,
} from '@sud-d/domain';

export interface GitHubRemoteIdentity {
  readonly transport: GitRemoteTransport;
  readonly owner: string;
  readonly repository: string;
  readonly safeRepository: string;
  readonly canonicalUrl: string;
}

const REMOTE_PART = /^[A-Za-z0-9._-]{1,100}$/;

function unsupported(): Result<GitHubRemoteIdentity, AppError> {
  return err(appError('GIT_REMOTE_UNSUPPORTED', 'Git remote is not a supported GitHub HTTPS/SSH repository'));
}

function normalizeParts(ownerRaw: string, repositoryRaw: string, transport: GitRemoteTransport): Result<GitHubRemoteIdentity, AppError> {
  let owner: string;
  let repository: string;
  try {
    owner = decodeURIComponent(ownerRaw);
    repository = decodeURIComponent(repositoryRaw.replace(/\.git$/i, ''));
  } catch {
    return unsupported();
  }
  if (
    !REMOTE_PART.test(owner)
    || !REMOTE_PART.test(repository)
    || owner === '.'
    || owner === '..'
    || repository === '.'
    || repository === '..'
    || /[\\/\r\n\0]/.test(owner)
    || /[\\/\r\n\0]/.test(repository)
  ) {
    return unsupported();
  }
  const safeRepository = `${owner}/${repository}`;
  return ok({
    transport,
    owner,
    repository,
    safeRepository,
    canonicalUrl: transport === 'https'
      ? `https://github.com/${owner}/${repository}.git`
      : `git@github.com:${owner}/${repository}.git`,
  });
}

export function parseGitHubRemote(raw: string): Result<GitHubRemoteIdentity, AppError> {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 2048 || /[\r\n\0]/.test(raw)) {
    return unsupported();
  }

  const scpLike = /^git@github\.com:([^/\\\s]+)\/([^/\\\s]+)$/i.exec(raw);
  if (scpLike) {
    return normalizeParts(scpLike[1] ?? '', scpLike[2] ?? '', 'ssh');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return unsupported();
  }

  if (url.hostname.toLowerCase() !== 'github.com' || url.search || url.hash) return unsupported();
  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length !== 2) return unsupported();

  if (url.protocol === 'https:') {
    if (url.username || url.password || url.port) return unsupported();
    return normalizeParts(pathParts[0] ?? '', pathParts[1] ?? '', 'https');
  }

  if (url.protocol === 'ssh:') {
    if (url.username !== 'git' || url.password || (url.port && url.port !== '22')) return unsupported();
    return normalizeParts(pathParts[0] ?? '', pathParts[1] ?? '', 'ssh');
  }

  return unsupported();
}
