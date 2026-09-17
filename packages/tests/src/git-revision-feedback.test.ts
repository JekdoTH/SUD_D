import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { presentGitRevisionFeedback } from '../../desktop/src/git-revision-feedback.js';

const BEFORE = '757215b' + 'a'.repeat(33);
const AFTER = 'bb96a39' + 'b'.repeat(33);

describe('Git revision feedback', () => {
  it('shows the trusted short local revision only for the up-to-date relation status', () => {
    expect(presentGitRevisionFeedback({ kind: 'status', relation: 'up_to_date', headSha: AFTER }))
      .toBe('Up to date · bb96a39');
    expect(presentGitRevisionFeedback({ kind: 'status', relation: 'local_ahead', headSha: AFTER }))
      .toBe('Local commits to push');
  });

  it('shows the approved execution source revision without inventing a target revision', () => {
    expect(presentGitRevisionFeedback({ kind: 'updating', headSha: BEFORE }))
      .toBe('Updating from 757215b…');
  });

  it('reports whether a successful Get latest changed the local HEAD', () => {
    expect(presentGitRevisionFeedback({ kind: 'sync_success', beforeHeadSha: BEFORE, afterHeadSha: AFTER }))
      .toBe('Updated 757215b → bb96a39');
    expect(presentGitRevisionFeedback({ kind: 'sync_success', beforeHeadSha: BEFORE, afterHeadSha: BEFORE }))
      .toBe('Already up to date · 757215b');
  });
  it('starts Updating feedback only for the approved exact Get latest resume', () => {
    const gitPage = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/GitPage.tsx'), 'utf8');

    expect(gitPage).toContain('readonly beforeHeadSha?: string;');
    expect(gitPage).toContain('beforeHeadSha: options.beforeHeadSha');
    expect(gitPage).toContain("announceSyncStart: pending.action === 'sync'");
    expect(gitPage).toContain('beforeHeadSha: snapshot.headSha');

    const approvalRequired = gitPage.slice(
      gitPage.indexOf("if (result.error.code === 'APPROVAL_REQUIRED')"),
      gitPage.indexOf('setPendingApproval({', gitPage.indexOf("if (result.error.code === 'APPROVAL_REQUIRED')")),
    );
    expect(approvalRequired).not.toContain('setSyncExecutionFrom');

    const denied = gitPage.slice(
      gitPage.indexOf("if (decision !== 'approve'"),
      gitPage.indexOf('setPendingApproval(null);', gitPage.indexOf("if (decision !== 'approve'")) + 1,
    );
    expect(denied).not.toContain('Updated ');
    expect(denied).not.toContain('Already up to date');

    const mutationStart = gitPage.indexOf('const handleMutationResult = useCallback');
    const successfulResult = gitPage.indexOf('if (result.ok) {', mutationStart);
    const staleResult = gitPage.indexOf("if (result.error.code === 'GIT_STATUS_STALE')", successfulResult);
    expect(gitPage.slice(successfulResult, staleResult)).toContain('gitSuccessMessage(');
    expect(gitPage.slice(staleResult)).not.toContain("text: gitSuccessMessage(action");  });
});
