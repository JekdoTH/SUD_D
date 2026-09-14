import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createGitSafetyAdapter } from '@sud-d/infrastructure';
import { git, gitCode, indexBytes, initRepo, tempDir } from './git-safety-test-harness.js';

function canonical(root: string): string {
  return path.normalize(fs.realpathSync.native(root));
}

beforeEach(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
});

describe('Git Bootstrap - local repository workflow', () => {
  it('initializes only the exact Workspace root without commit, remote, rename, or push', () => {
    const root = tempDir('sudd-git-init-');
    const adapter = createGitSafetyAdapter();

    const initialized = adapter.initialize(canonical(root));

    expect(initialized).toMatchObject({
      ok: true,
      value: {
        detect: { isRepository: true, isSupported: false, reason: 'UNBORN_HEAD', state: 'normal' },
        branches: [],
        remotes: [],
      },
    });
    expect(gitCode(root, ['rev-parse', '--verify', 'HEAD'])).not.toBe(0);
    expect(git(root, ['remote'])).toBe('');
    expect(git(root, ['rev-parse', '--show-toplevel'])).toBe(canonical(root).replace(/\\/g, '/'));
  });

  it('configures only validated GitHub remotes and canonicalizes the stored URL', () => {
    const root = tempDir('sudd-git-remote-');
    initRepo(root);
    const adapter = createGitSafetyAdapter();

    expect(adapter.configureRemote(canonical(root), {
      name: 'upstream',
      url: 'https://github.com/acme/widgets',
    })).toEqual({
      ok: true,
      value: { name: 'upstream', supported: true, safeRepository: 'acme/widgets', transport: 'https' },
    });
    expect(git(root, ['remote', 'get-url', 'upstream'])).toBe('https://github.com/acme/widgets.git');

    expect(adapter.configureRemote(canonical(root), {
      name: 'secret',
      url: 'https://token@github.com/acme/private.git',
    })).toMatchObject({ ok: false, error: { code: 'GIT_REMOTE_UNSUPPORTED' } });
    expect(git(root, ['remote'])).not.toContain('secret');
  });

  it('creates a validated branch without switching the current branch', () => {
    const root = tempDir('sudd-git-branch-create-');
    initRepo(root);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);
    const current = before.value.branch!;

    expect(adapter.createBranch(canonical(root), before.value.statusId, 'feature/safe')).toMatchObject({
      ok: true,
      value: { branch: 'feature/safe', headSha: before.value.headSha, changed: true },
    });
    expect(git(root, ['branch', '--show-current'])).toBe(current);
    expect(git(root, ['rev-parse', '--verify', 'refs/heads/feature/safe'])).toBe(before.value.headSha);

    expect(adapter.createBranch(canonical(root), before.value.statusId, '-unsafe')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('switches only from a fresh clean tree', () => {
    const root = tempDir('sudd-git-switch-clean-');
    initRepo(root);
    git(root, ['branch', 'feature/switch']);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    expect(adapter.switchBranch(canonical(root), before.value.statusId, 'feature/switch')).toMatchObject({
      ok: true,
      value: { branch: 'feature/switch', headSha: before.value.headSha, changed: true },
    });
    expect(git(root, ['branch', '--show-current'])).toBe('feature/switch');
  }, 15_000);

  it.each([
    ['unstaged', (root: string) => fs.writeFileSync(path.join(root, 'tracked.txt'), 'dirty\n', 'utf8')],
    ['staged', (root: string) => { fs.writeFileSync(path.join(root, 'tracked.txt'), 'dirty\n', 'utf8'); git(root, ['add', '--', 'tracked.txt']); }],
    ['untracked', (root: string) => fs.writeFileSync(path.join(root, 'untracked.txt'), 'dirty\n', 'utf8')],
  ] as const)('blocks %s dirt before branch switch mutation', (_kind, makeDirty) => {
    const root = tempDir('sudd-git-switch-dirty-');
    initRepo(root);
    git(root, ['branch', 'feature/switch']);
    const current = git(root, ['branch', '--show-current']);
    makeDirty(root);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    expect(adapter.switchBranch(canonical(root), before.value.statusId, 'feature/switch')).toMatchObject({
      ok: false,
      error: { code: 'GIT_WORKTREE_DIRTY' },
    });
    expect(git(root, ['branch', '--show-current'])).toBe(current);
  });

  it('merges with already-contained no-op and fast-forward only when ancestry proves it', () => {
    const root = tempDir('sudd-git-merge-ff-');
    initRepo(root);
    const baseBranch = git(root, ['branch', '--show-current']);
    git(root, ['switch', '-q', '-c', 'feature/ff']);
    fs.writeFileSync(path.join(root, 'ff.txt'), 'feature\n', 'utf8');
    git(root, ['add', '--', 'ff.txt']);
    git(root, ['commit', '-q', '-m', 'feature ff']);
    const featureSha = git(root, ['rev-parse', 'HEAD']);
    git(root, ['switch', '-q', baseBranch]);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    expect(adapter.mergeBranch(canonical(root), before.value.statusId, 'feature/ff')).toMatchObject({
      ok: true,
      value: { branch: baseBranch, headSha: featureSha, changed: true, mode: 'fast_forward' },
    });

    const after = adapter.status(canonical(root));
    if (!after.ok) throw new Error(after.error.code);
    expect(adapter.mergeBranch(canonical(root), after.value.statusId, 'feature/ff')).toMatchObject({
      ok: true,
      value: { branch: baseBranch, headSha: featureSha, changed: false, mode: 'already_merged' },
    });
  }, 30_000);

  it('creates a clean normal merge commit after successful non-mutating preflight', () => {
    const root = tempDir('sudd-git-merge-clean-');
    initRepo(root);
    const baseBranch = git(root, ['branch', '--show-current']);
    git(root, ['switch', '-q', '-c', 'feature/merge']);
    fs.writeFileSync(path.join(root, 'feature.txt'), 'feature\n', 'utf8');
    git(root, ['add', '--', 'feature.txt']);
    git(root, ['commit', '-q', '-m', 'feature merge']);
    git(root, ['switch', '-q', baseBranch]);
    fs.writeFileSync(path.join(root, 'base.txt'), 'base\n', 'utf8');
    git(root, ['add', '--', 'base.txt']);
    git(root, ['commit', '-q', '-m', 'base merge']);
    const beforeHead = git(root, ['rev-parse', 'HEAD']);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    const merged = adapter.mergeBranch(canonical(root), before.value.statusId, 'feature/merge');
    expect(merged).toMatchObject({ ok: true, value: { branch: baseBranch, changed: true, mode: 'merge_commit' } });
    if (!merged.ok) throw new Error(merged.error.code);
    expect(merged.value.headSha).not.toBe(beforeHead);
    expect(git(root, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')).toHaveLength(3);
    expect(git(root, ['status', '--porcelain'])).toBe('');
  }, 30_000);

  it('stops on merge conflict preflight without mutating HEAD, index, or merge state', () => {
    const root = tempDir('sudd-git-merge-conflict-');
    initRepo(root);
    const baseBranch = git(root, ['branch', '--show-current']);
    git(root, ['switch', '-q', '-c', 'feature/conflict']);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'feature\n', 'utf8');
    git(root, ['add', '--', 'tracked.txt']);
    git(root, ['commit', '-q', '-m', 'feature conflict']);
    git(root, ['switch', '-q', baseBranch]);
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'base-side\n', 'utf8');
    git(root, ['add', '--', 'tracked.txt']);
    git(root, ['commit', '-q', '-m', 'base conflict']);
    const beforeHead = git(root, ['rev-parse', 'HEAD']);
    const beforeIndex = indexBytes(root);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    expect(adapter.mergeBranch(canonical(root), before.value.statusId, 'feature/conflict')).toMatchObject({
      ok: false,
      error: { code: 'GIT_OPERATION_CONFLICT' },
    });
    expect(git(root, ['rev-parse', 'HEAD'])).toBe(beforeHead);
    expect(indexBytes(root).equals(beforeIndex)).toBe(true);
    expect(git(root, ['status', '--porcelain'])).toBe('');
    expect(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD'))).toBe(false);
  }, 30_000);

  it('deletes only a merged local branch against an explicit non-main default branch', () => {
    const root = tempDir('sudd-git-delete-merged-');
    initRepo(root);
    git(root, ['branch', '-m', 'trunk']);
    git(root, ['branch', 'feature/done']);
    const adapter = createGitSafetyAdapter();
    const before = adapter.status(canonical(root));
    if (!before.ok) throw new Error(before.error.code);

    expect(adapter.deleteBranch(canonical(root), before.value.statusId, 'feature/done', 'trunk')).toMatchObject({
      ok: true,
      value: { branch: 'feature/done', headSha: before.value.headSha, changed: true },
    });
    expect(gitCode(root, ['show-ref', '--verify', '--quiet', 'refs/heads/feature/done'])).not.toBe(0);
    expect(git(root, ['branch', '--show-current'])).toBe('trunk');
  }, 15_000);

  it('blocks current, default, and unmerged branch deletion', () => {
    const root = tempDir('sudd-git-delete-guards-');
    initRepo(root);
    git(root, ['branch', '-m', 'trunk']);
    git(root, ['branch', 'feature/working']);
    const adapter = createGitSafetyAdapter();

    let status = adapter.status(canonical(root));
    if (!status.ok) throw new Error(status.error.code);
    expect(adapter.deleteBranch(canonical(root), status.value.statusId, 'trunk', 'trunk')).toMatchObject({
      ok: false,
      error: { code: 'GIT_BRANCH_IN_USE' },
    });

    git(root, ['switch', '-q', 'feature/working']);
    status = adapter.status(canonical(root));
    if (!status.ok) throw new Error(status.error.code);
    expect(adapter.deleteBranch(canonical(root), status.value.statusId, 'trunk', 'trunk')).toMatchObject({
      ok: false,
      error: { code: 'GIT_BRANCH_IN_USE' },
    });

    git(root, ['switch', '-q', 'trunk']);
    git(root, ['switch', '-q', '-c', 'feature/unmerged']);
    fs.writeFileSync(path.join(root, 'unmerged.txt'), 'unmerged\n', 'utf8');
    git(root, ['add', '--', 'unmerged.txt']);
    git(root, ['commit', '-q', '-m', 'unmerged branch']);
    git(root, ['switch', '-q', 'trunk']);
    status = adapter.status(canonical(root));
    if (!status.ok) throw new Error(status.error.code);
    expect(adapter.deleteBranch(canonical(root), status.value.statusId, 'feature/unmerged', 'trunk')).toMatchObject({
      ok: false,
      error: { code: 'GIT_BRANCH_UNMERGED' },
    });
    expect(gitCode(root, ['show-ref', '--verify', '--quiet', 'refs/heads/feature/unmerged'])).toBe(0);
  }, 30_000);

  it('resolves a non-main remote default branch and classifies local relation from tracking refs', () => {
    const root = tempDir('sudd-git-default-relation-');
    initRepo(root);
    git(root, ['branch', '-m', 'trunk']);
    git(root, ['remote', 'add', 'upstream', 'https://github.com/acme/widgets.git']);
    const head = git(root, ['rev-parse', 'HEAD']);
    git(root, ['update-ref', 'refs/remotes/upstream/trunk', head]);
    git(root, ['symbolic-ref', 'refs/remotes/upstream/HEAD', 'refs/remotes/upstream/trunk']);
    git(root, ['branch', '--set-upstream-to=upstream/trunk', 'trunk']);
    const adapter = createGitSafetyAdapter();

    expect(adapter.resolveDefaultBranch(canonical(root), 'upstream')).toEqual({ ok: true, value: 'trunk' });
    expect(adapter.relation(canonical(root), 'upstream', 'trunk')).toMatchObject({
      ok: true,
      value: { kind: 'up_to_date', ahead: 0, behind: 0, upstreamBranch: 'upstream/trunk' },
    });
  }, 20_000);

  it('inspects bounded local branches and remotes without exposing raw remote URLs', () => {
    const root = tempDir('sudd-git-inspect-');
    initRepo(root);
    const currentBranch = git(root, ['branch', '--show-current']);
    git(root, ['branch', 'feature/local']);
    git(root, ['remote', 'add', 'upstream', 'https://github.com/acme/widgets.git']);
    git(root, ['remote', 'add', 'legacy', 'https://token@github.com/acme/private.git']);

    const inspected = createGitSafetyAdapter().inspectWorkspaceGit(canonical(root));

    expect(inspected).toMatchObject({
      ok: true,
      value: {
        detect: { isRepository: true, isSupported: true, branch: currentBranch },
        branches: expect.arrayContaining([
          { name: currentBranch, current: true, checkedOutElsewhere: false },
          { name: 'feature/local', current: false, checkedOutElsewhere: false },
        ]),
        remotes: expect.arrayContaining([
          { name: 'upstream', supported: true, safeRepository: 'acme/widgets', transport: 'https' },
          { name: 'legacy', supported: false },
        ]),
      },
    });
    expect(JSON.stringify(inspected)).not.toContain('token@github.com');
    expect(JSON.stringify(inspected)).not.toContain('https://github.com/acme/widgets.git');
  });
});
