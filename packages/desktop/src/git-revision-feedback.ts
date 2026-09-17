import type { DesktopGitSnapshotDto } from '@sud-d/contracts';

type GitRevisionFeedback =
  | { readonly kind: 'status'; readonly relation: DesktopGitSnapshotDto['relation']; readonly headSha?: string }
  | { readonly kind: 'updating'; readonly headSha: string }
  | { readonly kind: 'sync_success'; readonly beforeHeadSha: string; readonly afterHeadSha?: string };

const RELATION_COPY: Readonly<Record<DesktopGitSnapshotDto['relation'], string>> = Object.freeze({
  unknown: 'Needs attention',
  up_to_date: 'Up to date',
  local_ahead: 'Local commits to push',
  remote_ahead: 'Changes on GitHub',
  diverged: 'Needs attention',
  no_upstream: 'Ready to publish',
  unavailable: 'Needs attention',
});

export function presentGitRevisionFeedback(input: GitRevisionFeedback): string {
  if (input.kind === 'status') {
    const base = RELATION_COPY[input.relation];
    return input.relation === 'up_to_date' && input.headSha
      ? `${base} · ${shortRevision(input.headSha)}`
      : base;
  }
  if (input.kind === 'updating') {
    return `Updating from ${shortRevision(input.headSha)}…`;
  }
  if (!input.afterHeadSha) return 'Up to date.';
  return input.beforeHeadSha === input.afterHeadSha
    ? `Already up to date · ${shortRevision(input.afterHeadSha)}`
    : `Updated ${shortRevision(input.beforeHeadSha)} → ${shortRevision(input.afterHeadSha)}`;
}

function shortRevision(headSha: string): string {
  return headSha.slice(0, 7);
}