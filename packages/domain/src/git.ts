export const GIT_REMOTE_TRANSPORTS = ['https', 'ssh'] as const;
export type GitRemoteTransport = (typeof GIT_REMOTE_TRANSPORTS)[number];

export const GIT_REMOTE_RELATIONS = [
  'unknown',
  'up_to_date',
  'local_ahead',
  'remote_ahead',
  'diverged',
  'no_upstream',
  'unavailable',
] as const;
export type GitRemoteRelation = (typeof GIT_REMOTE_RELATIONS)[number];

export type GitPrimaryRemoteState = 'resolved' | 'missing' | 'ambiguous' | 'unsupported';
export type GitDefaultBranchState = 'known' | 'unknown';
export type GitAuthStatus = 'unknown' | 'working' | 'failed';
