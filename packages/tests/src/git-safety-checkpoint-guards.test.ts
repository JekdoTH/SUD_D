import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import type {
  GitCheckpointResult,
  GitDetectResult,
  GitStatusResult,
} from '@sud-d/infrastructure';
import {
  blobExists,
  checkpointRefs,
  git,
  gitCode,
  indexBytes,
  kernelValue,
  makeHarness,
  requireCreatedCheckpoint,
} from './git-safety-test-harness.js';

describe('Git Safety - sensitive, unsafe, bounded, and stale checkpoint cases', () => {
  it('blocks changed tracked credential content before persisting its new blob', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'BASE=value\n');
    git(h.workspaceRoot, ['add', '--', '.env']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'credential base']);
    const secret = 'TOKEN=credential-value-that-must-not-persist\n';
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), secret);
    const secretOid = git(h.workspaceRoot, ['hash-object', '--stdin'], secret);
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const beforeRefs = checkpointRefs(h.workspaceRoot);
    const result = await h.invoke('git.checkpoint', { expectedStatusId: status.statusId });
    expect(result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(blobExists(h.workspaceRoot, secretOid)).toBe(false);
    expect(checkpointRefs(h.workspaceRoot)).toEqual(beforeRefs);
    expect(JSON.stringify(result)).not.toContain('credential-value-that-must-not-persist');
  }, 15_000);

  it('blocks untracked credential content before object persistence but allows established example exemption', async () => {
    const blocked = await makeHarness();
    const secret = 'API_KEY=untracked-sensitive-value\n';
    fs.writeFileSync(path.join(blocked.workspaceRoot, '.env.local'), secret);
    const secretOid = git(blocked.workspaceRoot, ['hash-object', '--stdin'], secret);
    const blockedStatus = kernelValue<GitStatusResult>(await blocked.invoke('git.status', {}));
    const blockedResult = await blocked.invoke('git.checkpoint', { expectedStatusId: blockedStatus.statusId });
    expect(blockedResult).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(blobExists(blocked.workspaceRoot, secretOid)).toBe(false);

    const allowed = await makeHarness();
    fs.writeFileSync(path.join(allowed.workspaceRoot, '.env.example'), 'API_KEY=example-only\n');
    const allowedStatus = kernelValue<GitStatusResult>(await allowed.invoke('git.status', {}));
    const checkpoint = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await allowed.invoke('git.checkpoint', { expectedStatusId: allowedStatus.statusId })));
    expect(git(allowed.workspaceRoot, ['show', `${checkpoint.commitSha}:.env.example`])).toBe('API_KEY=example-only');
  }, 25_000);

  it('reports special Git states and blocks checkpoint during an actual unresolved merge conflict', async () => {
    const h = await makeHarness();
    const head = git(h.workspaceRoot, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(h.workspaceRoot, '.git', 'CHERRY_PICK_HEAD'), `${head}\n`);
    expect(kernelValue<GitDetectResult>(await h.invoke('git.detect', {})).state).toBe('cherry_pick');
    fs.unlinkSync(path.join(h.workspaceRoot, '.git', 'CHERRY_PICK_HEAD'));
    fs.mkdirSync(path.join(h.workspaceRoot, '.git', 'rebase-apply'));
    expect(kernelValue<GitDetectResult>(await h.invoke('git.detect', {})).state).toBe('rebase');
    fs.rmSync(path.join(h.workspaceRoot, '.git', 'rebase-apply'), { recursive: true, force: true });

    const baseBranch = git(h.workspaceRoot, ['symbolic-ref', '--short', 'HEAD']);
    git(h.workspaceRoot, ['checkout', '-q', '-b', 'other']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'other\n');
    git(h.workspaceRoot, ['add', '--', 'tracked.txt']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'other side']);
    git(h.workspaceRoot, ['checkout', '-q', baseBranch]);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'base-side\n');
    git(h.workspaceRoot, ['add', '--', 'tracked.txt']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'base side']);
    expect(gitCode(h.workspaceRoot, ['merge', 'other'])).not.toBe(0);
    const conflicted = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(conflicted.state).toBe('conflict');
    const result = await h.invoke('git.checkpoint', { expectedStatusId: conflicted.statusId });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'GIT_STATE_UNSAFE' });
  }, 30_000);

  it('fails closed on a staged gitlink/submodule change without altering the user index', async () => {
    const h = await makeHarness();
    const head = git(h.workspaceRoot, ['rev-parse', 'HEAD']);
    git(h.workspaceRoot, ['update-index', '--add', '--cacheinfo', `160000,${head},submodule`]);
    const indexBefore = indexBytes(h.workspaceRoot);
    const beforeRefs = checkpointRefs(h.workspaceRoot);
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(status.entries.some((entry) => entry.path === 'submodule' && entry.gitlink === true)).toBe(true);
    const result = await h.invoke('git.checkpoint', { expectedStatusId: status.statusId });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TYPE_UNSUPPORTED' });
    expect(indexBytes(h.workspaceRoot)).toEqual(indexBefore);
    expect(checkpointRefs(h.workspaceRoot)).toEqual(beforeRefs);
  }, 15_000);

  it('blocks checkpoint when the changed-path hard cap is exceeded without creating a partial ref', async () => {
    const h = await makeHarness();
    for (let index = 0; index < 501; index += 1) {
      fs.writeFileSync(path.join(h.workspaceRoot, `many-${String(index).padStart(3, '0')}.txt`), 'x');
    }
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(status.entries).toHaveLength(500);
    expect(status.truncated).toBe(true);
    const result = await h.invoke('git.checkpoint', { expectedStatusId: status.statusId });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TOO_LARGE' });
    expect(checkpointRefs(h.workspaceRoot)).toEqual([]);
  }, 25_000);

  it('blocks oversized single-file and aggregate checkpoint payloads without a ref', async () => {
    const single = await makeHarness();
    fs.writeFileSync(path.join(single.workspaceRoot, 'large.bin'), Buffer.alloc(8 * 1024 * 1024 + 1, 1));
    const singleStatus = kernelValue<GitStatusResult>(await single.invoke('git.status', {}));
    const singleResult = await single.invoke('git.checkpoint', { expectedStatusId: singleStatus.statusId });
    expect(singleResult).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TOO_LARGE' });
    expect(checkpointRefs(single.workspaceRoot)).toEqual([]);

    const aggregate = await makeHarness();
    for (let index = 0; index < 5; index += 1) {
      fs.writeFileSync(path.join(aggregate.workspaceRoot, `aggregate-${index}.bin`), Buffer.alloc(7 * 1024 * 1024, index + 1));
    }
    const aggregateStatus = kernelValue<GitStatusResult>(await aggregate.invoke('git.status', {}));
    const aggregateResult = await aggregate.invoke('git.checkpoint', { expectedStatusId: aggregateStatus.statusId });
    expect(aggregateResult).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'RESOURCE_TOO_LARGE' });
    expect(checkpointRefs(aggregate.workspaceRoot)).toEqual([]);
  }, 45_000);

  it('rejects a stale status token and a changed HEAD before checkpoint ref creation', async () => {
    const stale = await makeHarness();
    fs.writeFileSync(path.join(stale.workspaceRoot, 'tracked.txt'), 'first-change\n');
    const oldStatus = kernelValue<GitStatusResult>(await stale.invoke('git.status', {}));
    fs.writeFileSync(path.join(stale.workspaceRoot, 'tracked.txt'), 'second-change\n');
    const staleResult = await stale.invoke('git.checkpoint', { expectedStatusId: oldStatus.statusId });
    expect(staleResult).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'GIT_STATUS_STALE' });
    expect(checkpointRefs(stale.workspaceRoot)).toEqual([]);

    const changedHead = await makeHarness();
    fs.writeFileSync(path.join(changedHead.workspaceRoot, 'tracked.txt'), 'pending\n');
    const expected = kernelValue<GitStatusResult>(await changedHead.invoke('git.status', {}));
    fs.writeFileSync(path.join(changedHead.workspaceRoot, 'head-change.txt'), 'head\n');
    git(changedHead.workspaceRoot, ['add', '--', 'head-change.txt']);
    git(changedHead.workspaceRoot, ['commit', '-q', '-m', 'advance head', '--', 'head-change.txt']);
    const changedHeadResult = await changedHead.invoke('git.checkpoint', { expectedStatusId: expected.statusId });
    expect(changedHeadResult).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'GIT_STATUS_STALE' });
    expect(checkpointRefs(changedHead.workspaceRoot)).toEqual([]);
  }, 25_000);

  it('fails safely on a concurrent Git lock and leaves no checkpoint ref', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'locked\n');
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    fs.writeFileSync(path.join(h.workspaceRoot, '.git', 'index.lock'), 'lock');
    const result = await h.invoke('git.checkpoint', { expectedStatusId: status.statusId });
    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'GIT_OPERATION_CONFLICT' });
    expect(checkpointRefs(h.workspaceRoot)).toEqual([]);
  }, 15_000);
});
