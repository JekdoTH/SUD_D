import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import type { GitCheckpointResult, GitStatusResult } from '@sud-d/infrastructure';
import {
  checkpointRefs,
  git,
  gitCode,
  indexBytes,
  kernelValue,
  makeHarness,
  requireCreatedCheckpoint,
  treePaths,
} from './git-safety-test-harness.js';

describe('Git Safety - checkpoint semantics and state preservation', () => {
  it('creates an append-only checkpoint commit while preserving HEAD, branch, index, and worktree', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'checkpoint-working\n', 'utf8');
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const headBefore = git(h.workspaceRoot, ['rev-parse', 'HEAD']);
    const branchBefore = git(h.workspaceRoot, ['symbolic-ref', '--short', 'HEAD']);
    const indexBefore = indexBytes(h.workspaceRoot);
    const worktreeBefore = fs.readFileSync(path.join(h.workspaceRoot, 'tracked.txt'));

    const checkpoint = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId })));
    expect(checkpoint).toMatchObject({ created: true, parentHead: headBefore, capturedPathCount: 1 });
    expect(checkpoint.checkpointRef).toMatch(/^refs\/sud-d\/checkpoints\/[0-9a-f-]+$/);
    expect(git(h.workspaceRoot, ['rev-parse', checkpoint.checkpointRef])).toBe(checkpoint.commitSha);
    expect(git(h.workspaceRoot, ['rev-parse', `${checkpoint.commitSha}^`])).toBe(headBefore);
    expect(git(h.workspaceRoot, ['show', `${checkpoint.commitSha}:tracked.txt`])).toBe('checkpoint-working');
    expect(git(h.workspaceRoot, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(git(h.workspaceRoot, ['symbolic-ref', '--short', 'HEAD'])).toBe(branchBefore);
    expect(indexBytes(h.workspaceRoot)).toEqual(indexBefore);
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'tracked.txt'))).toEqual(worktreeBefore);
  }, 20_000);

  it('uses current working-tree content while preserving mixed staged and unstaged state byte-for-byte', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'delete.txt'), 'delete-me\n');
    git(h.workspaceRoot, ['add', '--', 'delete.txt']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'mixed fixture']);

    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'staged-version\n');
    git(h.workspaceRoot, ['add', '--', 'tracked.txt']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'working-version\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'staged-add.txt'), 'staged-add\n');
    git(h.workspaceRoot, ['add', '--', 'staged-add.txt']);
    git(h.workspaceRoot, ['rm', '-q', '--', 'delete.txt']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'untracked.txt'), 'untracked\n');

    const indexBefore = indexBytes(h.workspaceRoot);
    const porcelainBefore = git(h.workspaceRoot, ['status', '--porcelain=v2']);
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const checkpoint = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId })));

    expect(git(h.workspaceRoot, ['show', `${checkpoint.commitSha}:tracked.txt`])).toBe('working-version');
    expect(git(h.workspaceRoot, ['show', `${checkpoint.commitSha}:staged-add.txt`])).toBe('staged-add');
    expect(git(h.workspaceRoot, ['show', `${checkpoint.commitSha}:untracked.txt`])).toBe('untracked');
    expect(gitCode(h.workspaceRoot, ['cat-file', '-e', `${checkpoint.commitSha}:delete.txt`])).not.toBe(0);
    expect(indexBytes(h.workspaceRoot)).toEqual(indexBefore);
    expect(git(h.workspaceRoot, ['status', '--porcelain=v2'])).toBe(porcelainBefore);
    expect(fs.readFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'utf8')).toBe('working-version\n');
  }, 20_000);

  it('captures additions, deletions, and resulting rename state while excluding ignored and SUD-D-local content', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, '.gitignore'), 'ignored.txt\n.serena/\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'old-name.txt'), 'rename-me\n');
    git(h.workspaceRoot, ['add', '--', '.gitignore', 'old-name.txt']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'snapshot fixture']);

    fs.renameSync(path.join(h.workspaceRoot, 'old-name.txt'), path.join(h.workspaceRoot, 'renamed.txt'));
    fs.writeFileSync(path.join(h.workspaceRoot, 'new.txt'), 'new\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'ignored.txt'), 'ignored\n');
    fs.mkdirSync(path.join(h.workspaceRoot, '.serena'), { recursive: true });
    fs.writeFileSync(path.join(h.workspaceRoot, '.serena', 'local.txt'), 'local-only\n');
    fs.writeFileSync(path.join(h.workspaceRoot, '.sud-d-tmp-test'), 'internal-temp\n');

    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(status.entries.map((entry) => entry.path)).not.toContain('.sud-d-tmp-test');
    const checkpoint = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId })));
    const paths = treePaths(h.workspaceRoot, checkpoint.checkpointRef);
    expect(paths).toContain('renamed.txt');
    expect(paths).toContain('new.txt');
    expect(paths).not.toContain('old-name.txt');
    expect(paths).not.toContain('ignored.txt');
    expect(paths.some((value) => value.startsWith('.serena/'))).toBe(false);
    expect(paths.some((value) => value.startsWith('.sud-d-tmp-'))).toBe(false);
    expect(paths.some((value) => value.startsWith('.git/'))).toBe(false);
  }, 20_000);

  it('returns NO_CHANGES without creating an empty checkpoint', async () => {
    const h = await makeHarness();
    const beforeRefs = checkpointRefs(h.workspaceRoot);
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const result = kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId }));
    expect(result).toEqual({ created: false, reason: 'NO_CHANGES' });
    expect(checkpointRefs(h.workspaceRoot)).toEqual(beforeRefs);
  }, 15_000);

  it('creates unique append-only refs and rejects caller-selected ref metadata', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'one\n');
    const firstStatus = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const first = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: firstStatus.statusId })));
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'two\n');
    const secondStatus = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const second = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: secondStatus.statusId })));
    expect(second.checkpointRef).not.toBe(first.checkpointRef);
    expect(git(h.workspaceRoot, ['rev-parse', first.checkpointRef])).toBe(first.commitSha);
    expect(git(h.workspaceRoot, ['rev-parse', second.checkpointRef])).toBe(second.commitSha);

    const injected = await h.invoke('git.checkpoint', {
      expectedStatusId: secondStatus.statusId,
      ref: 'refs/heads/main',
      message: 'caller text',
    });
    expect(injected).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  }, 25_000);
});
