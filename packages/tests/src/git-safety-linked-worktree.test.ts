import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  createGitSafetyAdapter,
  createRestrictedVerifyAdapter,
} from '@sud-d/infrastructure';
import {
  git,
  initRepo,
  tempDir,
} from './git-safety-test-harness.js';

function createLinkedWorktree() {
  const base = tempDir('sudd-linked-worktree-');
  const mainRoot = path.join(base, 'main');
  const linkedRoot = path.join(base, 'linked');
  initRepo(mainRoot);
  git(mainRoot, ['worktree', 'add', '-q', '-b', 'linked-fixture', linkedRoot]);
  return { base, mainRoot, linkedRoot };
}

function canonical(root: string): string {
  return path.normalize(fs.realpathSync.native(root));
}

function linkedGitDir(linkedRoot: string): string {
  const marker = fs.readFileSync(path.join(linkedRoot, '.git'), 'utf8');
  const match = /^gitdir: ([^\r\n]+)\r?\n?$/.exec(marker);
  if (!match?.[1]) throw new Error('expected standard linked-worktree .git file');
  return path.normalize(match[1]);
}

describe('Git Safety - standard linked worktree support', () => {
  it('supports detect, status, and diff without leaking external metadata paths', () => {
    const { linkedRoot } = createLinkedWorktree();
    fs.writeFileSync(path.join(linkedRoot, 'tracked.txt'), 'linked edit\n', 'utf8');
    const gitSafety = createGitSafetyAdapter();

    const detected = gitSafety.detect(canonical(linkedRoot));
    expect(detected).toMatchObject({ ok: true, value: { isRepository: true, isSupported: true, branch: 'linked-fixture', state: 'normal' } });

    const status = gitSafety.status(canonical(linkedRoot));
    expect(status).toMatchObject({
      ok: true,
      value: { entries: [expect.objectContaining({ path: 'tracked.txt', unstaged: true, staged: false, sensitive: false })] },
    });

    const diff = gitSafety.diff(canonical(linkedRoot), { relativePath: 'tracked.txt' });
    expect(diff).toMatchObject({ ok: true, value: { patch: expect.stringContaining('+linked edit') } });
    expect(JSON.stringify({ detected, status, diff })).not.toContain(linkedGitDir(linkedRoot));
  });

  it('creates a bounded commit on the linked-worktree branch while preserving the clean staging-area contract', () => {
    const { linkedRoot } = createLinkedWorktree();
    fs.writeFileSync(path.join(linkedRoot, 'tracked.txt'), 'committed from linked worktree\n', 'utf8');
    const gitSafety = createGitSafetyAdapter();
    const status = gitSafety.status(canonical(linkedRoot));
    if (!status.ok) throw new Error(status.error.code);

    const committed = gitSafety.commit(canonical(linkedRoot), status.value.statusId, 'test: linked worktree commit');

    expect(committed).toMatchObject({
      ok: true,
      value: { branch: 'linked-fixture', parentHead: status.value.headSha, committedPathCount: 1 },
    });
    if (!committed.ok) throw new Error(committed.error.code);
    expect(git(linkedRoot, ['rev-parse', 'HEAD'])).toBe(committed.value.commitSha);
    expect(git(linkedRoot, ['status', '--porcelain'])).toBe('');
  });

  it('runs fixed diff_check and secret_scan against a standard linked worktree', async () => {
    const { linkedRoot } = createLinkedWorktree();
    const adapter = createRestrictedVerifyAdapter();

    fs.writeFileSync(path.join(linkedRoot, 'tracked.txt'), 'trailing whitespace   \n', 'utf8');
    const diffCheck = await adapter.run(
      { workspaceId: 'linked-verify', canonicalRoot: canonical(linkedRoot) },
      { action: 'diff_check' },
    );
    expect(diffCheck).toMatchObject({ action: 'diff_check', passed: false, exitCode: 1, truncated: false });
    expect(diffCheck.output).toBe('git diff --check found whitespace errors');

    fs.writeFileSync(path.join(linkedRoot, 'tracked.txt'), 'safe edit\n', 'utf8');
    const secretSentinel = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    fs.writeFileSync(path.join(linkedRoot, 'notes.txt'), `safe preface\n${secretSentinel}\n`, 'utf8');
    const secretScan = await adapter.run(
      { workspaceId: 'linked-verify', canonicalRoot: canonical(linkedRoot) },
      { action: 'secret_scan' },
    );
    expect(secretScan).toMatchObject({ action: 'secret_scan', passed: false, exitCode: 1, truncated: false });
    expect(secretScan.output).toBe('secret signature scan found 1 suspect file');
    expect(JSON.stringify(secretScan)).not.toContain(secretSentinel);
  });

  it('reads unsafe repository state from the linked worktree administrative directory and blocks commit', () => {
    const { linkedRoot } = createLinkedWorktree();
    fs.writeFileSync(path.join(linkedGitDir(linkedRoot), 'MERGE_HEAD'), `${git(linkedRoot, ['rev-parse', 'HEAD'])}\n`, 'utf8');
    const gitSafety = createGitSafetyAdapter();

    const detected = gitSafety.detect(canonical(linkedRoot));
    expect(detected).toMatchObject({ ok: true, value: { state: 'merge' } });

    fs.writeFileSync(path.join(linkedRoot, 'tracked.txt'), 'unsafe state edit\n', 'utf8');
    const status = gitSafety.status(canonical(linkedRoot));
    if (!status.ok) throw new Error(status.error.code);
    const commit = gitSafety.commit(canonical(linkedRoot), status.value.statusId, 'test: unsafe linked worktree');
    expect(commit).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
  });
});

describe('Git Safety - linked worktree metadata rejection', () => {
  it('rejects malformed .git file content', () => {
    const base = tempDir('sudd-linked-malformed-');
    const workspaceRoot = path.join(base, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.git'), 'gitdir: C:/tmp/elsewhere\nextra\n', 'utf8');

    expect(createGitSafetyAdapter().detect(canonical(workspaceRoot))).toMatchObject({
      ok: true,
      value: { isRepository: true, isSupported: false, reason: 'EXTERNAL_GITDIR' },
    });
  });

  it('rejects relative gitdir path escape even when it targets a real linked-worktree administrative directory', () => {
    const { base, linkedRoot } = createLinkedWorktree();
    const victimRoot = path.join(base, 'victim');
    fs.mkdirSync(victimRoot, { recursive: true });
    const adminDir = linkedGitDir(linkedRoot);
    fs.writeFileSync(path.join(adminDir, 'gitdir'), `${path.join(victimRoot, '.git')}\n`, 'utf8');
    const relativeEscape = path.relative(victimRoot, adminDir).replace(/\\/g, '/');
    fs.writeFileSync(path.join(victimRoot, '.git'), `gitdir: ${relativeEscape}\n`, 'utf8');

    expect(createGitSafetyAdapter().detect(canonical(victimRoot))).toMatchObject({
      ok: true,
      value: { isRepository: true, isSupported: false, reason: 'EXTERNAL_GITDIR' },
    });
  });

  it('rejects an external linked-worktree gitdir whose backlink belongs to another worktree', () => {
    const { base, linkedRoot } = createLinkedWorktree();
    const victimRoot = path.join(base, 'victim');
    fs.mkdirSync(victimRoot, { recursive: true });
    fs.writeFileSync(path.join(victimRoot, '.git'), `gitdir: ${linkedGitDir(linkedRoot).replace(/\\/g, '/')}\n`, 'utf8');

    expect(createGitSafetyAdapter().detect(canonical(victimRoot))).toMatchObject({
      ok: true,
      value: { isRepository: true, isSupported: false, reason: 'EXTERNAL_GITDIR' },
    });
  });
});
