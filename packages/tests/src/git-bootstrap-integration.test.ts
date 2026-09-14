import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

import { ok } from '@sud-d/domain';
import { createGitSafetyAdapter } from '@sud-d/infrastructure';
import type { GitCommandRunner, GitCommandResult } from '../../infrastructure/src/git-command-runner.js';
import { git, tempDir } from './git-safety-test-harness.js';

const GITHUB_URL = 'https://github.com/acme/widgets.git';

interface NetworkCall {
  readonly cwd: string;
  readonly args: readonly string[];
}

function canonical(root: string): string {
  return path.normalize(fs.realpathSync.native(root));
}

function configureIdentity(root: string, label: string): void {
  git(root, ['config', 'user.email', `${label}@example.invalid`]);
  git(root, ['config', 'user.name', label]);
}

function executeGit(cwd: string, args: readonly string[]): ReturnType<typeof ok<GitCommandResult>> {
  const result = spawnSync('git', [...args], {
    cwd,
    shell: false,
    windowsHide: true,
    encoding: null,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 2 * 1024 * 1024,
  });
  return ok({
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
    status: result.status ?? 1,
    overflowed: false,
  });
}

function createMappedGitHubRunner(
  mappings: ReadonlyMap<string, string>,
  calls: NetworkCall[],
  afterNetworkCall?: (call: NetworkCall) => void,
): GitCommandRunner {
  const mappingArgs = [...mappings.entries()].flatMap(([remoteUrl, localBare]) => [
    '-c',
    `url.${pathToFileURL(localBare).href}.insteadOf=${remoteUrl}`,
  ]);
  return {
    runLocal(cwd, args) {
      return executeGit(cwd, args);
    },
    runGitHubNetwork(cwd, args) {
      const call = { cwd, args: [...args] };
      calls.push(call);
      const result = executeGit(cwd, [...mappingArgs, ...args]);
      afterNetworkCall?.(call);
      return result;
    },
  };
}

function createRemoteFixture(afterNetworkCall?: (call: NetworkCall, workspace: string) => void): {
  readonly bare: string;
  readonly publisher: string;
  readonly workspace: string;
  readonly calls: NetworkCall[];
  readonly adapter: ReturnType<typeof createGitSafetyAdapter>;
} {
  const root = tempDir('sudd-git-network-');
  const bare = path.join(root, 'remote.git');
  const publisher = path.join(root, 'publisher');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(publisher, { recursive: true });
  git(root, ['init', '--bare', bare]);
  git(publisher, ['init']);
  configureIdentity(publisher, 'Network Publisher');
  fs.writeFileSync(path.join(publisher, 'tracked.txt'), 'base\n', 'utf8');
  git(publisher, ['add', '--', 'tracked.txt']);
  git(publisher, ['commit', '-m', 'base']);
  git(publisher, ['branch', '-m', 'trunk']);
  git(publisher, ['remote', 'add', 'origin', bare]);
  git(publisher, ['push', '-u', 'origin', 'trunk']);
  git(bare, ['symbolic-ref', 'HEAD', 'refs/heads/trunk']);

  git(root, ['clone', '--branch', 'trunk', bare, workspace]);
  configureIdentity(workspace, 'Network Workspace');
  git(workspace, ['remote', 'rename', 'origin', 'upstream']);
  git(workspace, ['remote', 'set-url', 'upstream', GITHUB_URL]);

  const calls: NetworkCall[] = [];
  const adapter = createGitSafetyAdapter({
    commandRunner: createMappedGitHubRunner(
      new Map([[GITHUB_URL, bare]]),
      calls,
      afterNetworkCall ? (call) => afterNetworkCall(call, workspace) : undefined,
    ),
  });
  return { bare, publisher, workspace, calls, adapter };
}

beforeEach(async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
});

describe('Git Bootstrap - deterministic GitHub network workflow', () => {
  it('fetches the validated GitHub remote and refreshes a non-main default branch', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.publisher, 'remote.txt'), 'remote\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote update']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const remoteHead = git(fixture.publisher, ['rev-parse', 'HEAD']);

    const result = fixture.adapter.fetchRemote(canonical(fixture.workspace), 'upstream');

    expect(result).toEqual({ ok: true, value: { remoteName: 'upstream', defaultBranch: 'trunk' } });
    expect(git(fixture.workspace, ['rev-parse', 'refs/remotes/upstream/trunk'])).toBe(remoteHead);
    expect(git(fixture.workspace, ['symbolic-ref', 'refs/remotes/upstream/HEAD'])).toBe('refs/remotes/upstream/trunk');
    expect(fixture.calls.map((call) => call.args[0])).toEqual(['fetch', 'ls-remote']);
    expect(JSON.stringify(fixture.calls)).not.toContain(fixture.bare);
    expect(fixture.adapter.relation(canonical(fixture.workspace), 'upstream', 'trunk')).toMatchObject({
      ok: true,
      value: { kind: 'remote_ahead', ahead: 0, behind: 1, upstreamBranch: 'upstream/trunk' },
    });
  }, 30_000);

  it('classifies local-ahead history after trusted fetch', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'local.txt'), 'local\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'local.txt']);
    git(fixture.workspace, ['commit', '-m', 'local update']);

    expect(fixture.adapter.fetchRemote(canonical(fixture.workspace), 'upstream')).toMatchObject({ ok: true });
    expect(fixture.adapter.relation(canonical(fixture.workspace), 'upstream', 'trunk')).toMatchObject({
      ok: true,
      value: { kind: 'local_ahead', ahead: 1, behind: 0, upstreamBranch: 'upstream/trunk' },
    });
  }, 30_000);

  it('classifies diverged history after trusted fetch', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'local.txt'), 'local\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'local.txt']);
    git(fixture.workspace, ['commit', '-m', 'local update']);
    fs.writeFileSync(path.join(fixture.publisher, 'remote.txt'), 'remote\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote update']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);

    expect(fixture.adapter.fetchRemote(canonical(fixture.workspace), 'upstream')).toMatchObject({ ok: true });
    expect(fixture.adapter.relation(canonical(fixture.workspace), 'upstream', 'trunk')).toMatchObject({
      ok: true,
      value: { kind: 'diverged', ahead: 1, behind: 1, upstreamBranch: 'upstream/trunk' },
    });
  }, 30_000);

  it('reports no-upstream for a local branch without tracking configuration', () => {
    const fixture = createRemoteFixture();
    git(fixture.workspace, ['switch', '-q', '-c', 'feature/local']);

    expect(fixture.adapter.fetchRemote(canonical(fixture.workspace), 'upstream')).toMatchObject({ ok: true });
    expect(fixture.adapter.relation(canonical(fixture.workspace), 'upstream', 'feature/local')).toEqual({
      ok: true,
      value: { kind: 'no_upstream' },
    });
  }, 30_000);

  it('fast-forwards only when Sync finds remote-ahead history', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.publisher, 'remote-sync.txt'), 'remote sync\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote-sync.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote sync']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const remoteHead = git(fixture.publisher, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toEqual({
      ok: true,
      value: { relation: 'remote_ahead', changed: true, headSha: remoteHead },
    });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(remoteHead);
    expect(git(fixture.workspace, ['status', '--porcelain'])).toBe('');
  }, 30_000);

  it('leaves an up-to-date branch unchanged during Sync', () => {
    const fixture = createRemoteFixture();
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toEqual({
      ok: true,
      value: { relation: 'up_to_date', changed: false, headSha: status.value.headSha },
    });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(status.value.headSha);
  }, 30_000);

  it('leaves local-ahead commits unchanged and directs the workflow toward Push', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'local-sync.txt'), 'local sync\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'local-sync.txt']);
    git(fixture.workspace, ['commit', '-m', 'local sync']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toEqual({
      ok: true,
      value: { relation: 'local_ahead', changed: false, headSha: status.value.headSha },
    });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(status.value.headSha);
  }, 30_000);

  it('stops Sync on diverged history without mutating local HEAD', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'local-diverged.txt'), 'local\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'local-diverged.txt']);
    git(fixture.workspace, ['commit', '-m', 'local diverged']);
    const localHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(fixture.publisher, 'remote-diverged.txt'), 'remote\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote-diverged.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote diverged']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_DIVERGED' } });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(localHead);
  }, 30_000);

  it('stops Sync when the current branch has no upstream', () => {
    const fixture = createRemoteFixture();
    git(fixture.workspace, ['switch', '-q', '-c', 'feature/no-upstream']);
    const localHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'feature/no-upstream',
    })).toMatchObject({ ok: false, error: { code: 'GIT_UPSTREAM_MISSING' } });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(localHead);
  }, 30_000);

  it('validates the selected GitHub remote before Sync network access', () => {
    const fixture = createRemoteFixture();
    git(fixture.workspace, ['remote', 'set-url', 'upstream', 'https://token@github.com/acme/widgets.git']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_REMOTE_UNSUPPORTED' } });
    expect(fixture.calls).toHaveLength(0);
  }, 30_000);

  it('stops Sync if Git state changes after fetch before local mutation', () => {
    let injected = false;
    const fixture = createRemoteFixture((call, workspace) => {
      if (!injected && call.args[0] === 'fetch') {
        injected = true;
        fs.writeFileSync(path.join(workspace, 'race.txt'), 'changed after fetch\n', 'utf8');
      }
    });
    fs.writeFileSync(path.join(fixture.publisher, 'remote-race.txt'), 'remote race\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote-race.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote race']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const beforeHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_STATUS_STALE' } });
    expect(git(fixture.workspace, ['rev-parse', 'HEAD'])).toBe(beforeHead);
  }, 30_000);

  it('pushes existing-upstream local-ahead history and verifies the remote SHA without force', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'push.txt'), 'push\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'push.txt']);
    git(fixture.workspace, ['commit', '-m', 'push local ahead']);
    const localHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toEqual({
      ok: true,
      value: { headSha: localHead, remoteSha: localHead, upstreamSet: false },
    });
    expect(git(fixture.bare, ['rev-parse', 'refs/heads/trunk'])).toBe(localHead);
    expect(git(fixture.workspace, ['rev-parse', 'refs/remotes/upstream/trunk'])).toBe(localHead);
    const pushCall = fixture.calls.find((call) => call.args[0] === 'push');
    expect(pushCall).toBeDefined();
    expect(pushCall?.args.join(' ')).not.toMatch(/(?:^|\s)(?:--force|-f)(?:\s|$)/);
    expect(fixture.calls.filter((call) => call.args[0] === 'ls-remote')).toHaveLength(2);
  }, 30_000);

  it('stops Push when GitHub is ahead without sending a push command', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.publisher, 'remote-ahead.txt'), 'ahead\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote-ahead.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote ahead']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_REMOTE_AHEAD' } });
    expect(fixture.calls.some((call) => call.args[0] === 'push')).toBe(false);
  }, 30_000);

  it('stops Push on diverged history without force or remote mutation', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'local-push-diverged.txt'), 'local\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'local-push-diverged.txt']);
    git(fixture.workspace, ['commit', '-m', 'local push diverged']);
    fs.writeFileSync(path.join(fixture.publisher, 'remote-push-diverged.txt'), 'remote\n', 'utf8');
    git(fixture.publisher, ['add', '--', 'remote-push-diverged.txt']);
    git(fixture.publisher, ['commit', '-m', 'remote push diverged']);
    git(fixture.publisher, ['push', 'origin', 'trunk']);
    const remoteHead = git(fixture.publisher, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_DIVERGED' } });
    expect(fixture.calls.some((call) => call.args[0] === 'push')).toBe(false);
    expect(git(fixture.bare, ['rev-parse', 'refs/heads/trunk'])).toBe(remoteHead);
  }, 30_000);

  it('creates a first remote branch and sets upstream only after verified Push', () => {
    const fixture = createRemoteFixture();
    git(fixture.workspace, ['switch', '-q', '-c', 'feature/first-push']);
    fs.writeFileSync(path.join(fixture.workspace, 'first-push.txt'), 'first\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'first-push.txt']);
    git(fixture.workspace, ['commit', '-m', 'first push']);
    const localHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'feature/first-push',
    })).toEqual({
      ok: true,
      value: { headSha: localHead, remoteSha: localHead, upstreamSet: true },
    });
    expect(git(fixture.bare, ['rev-parse', 'refs/heads/feature/first-push'])).toBe(localHead);
    expect(git(fixture.workspace, ['for-each-ref', '--format=%(upstream:short)', 'refs/heads/feature/first-push']))
      .toBe('upstream/feature/first-push');
    expect(git(fixture.workspace, ['rev-parse', 'refs/remotes/upstream/feature/first-push'])).toBe(localHead);
  }, 30_000);

  it('fails Push when post-push remote SHA verification does not match the intended commit', () => {
    let resetSha = '';
    let barePath = '';
    const fixture = createRemoteFixture((call) => {
      if (call.args[0] === 'push' && barePath && resetSha) {
        git(barePath, ['update-ref', 'refs/heads/trunk', resetSha]);
      }
    });
    barePath = fixture.bare;
    resetSha = git(fixture.workspace, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(fixture.workspace, 'mismatch.txt'), 'mismatch\n', 'utf8');
    git(fixture.workspace, ['add', '--', 'mismatch.txt']);
    git(fixture.workspace, ['commit', '-m', 'mismatch push']);
    const localHead = git(fixture.workspace, ['rev-parse', 'HEAD']);
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_OPERATION_CONFLICT' } });
    expect(localHead).not.toBe(resetSha);
    expect(git(fixture.bare, ['rev-parse', 'refs/heads/trunk'])).toBe(resetSha);
    expect(git(fixture.workspace, ['rev-parse', 'refs/remotes/upstream/trunk'])).toBe(resetSha);
  }, 30_000);

  it('clones only a validated GitHub remote without submodule recursion and verifies the repository', () => {
    const fixture = createRemoteFixture();
    const destination = path.join(path.dirname(fixture.workspace), 'cloned-workspace');

    const result = fixture.adapter.cloneFromGitHub({
      remoteUrl: GITHUB_URL,
      destinationPath: destination,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        destinationPath: canonical(destination),
        headSha: git(fixture.bare, ['rev-parse', 'refs/heads/trunk']),
        branch: 'trunk',
      },
    });
    const cloneCall = fixture.calls.find((call) => call.args[0] === 'clone');
    expect(cloneCall?.args).toContain('--no-recurse-submodules');
    expect(cloneCall?.args).toContain(GITHUB_URL);
    expect(JSON.stringify(fixture.calls)).not.toContain(fixture.bare);
    expect(git(destination, ['rev-parse', '--is-inside-work-tree'])).toBe('true');
  }, 30_000);

  it('rejects credential-bearing clone URLs before any GitHub network call', () => {
    const fixture = createRemoteFixture();
    const destination = path.join(path.dirname(fixture.workspace), 'rejected-clone');

    expect(fixture.adapter.cloneFromGitHub({
      remoteUrl: 'https://token@github.com/acme/widgets.git',
      destinationPath: destination,
    })).toMatchObject({ ok: false, error: { code: 'GIT_REMOTE_UNSUPPORTED' } });
    expect(fixture.calls).toHaveLength(0);
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('stops Push on a dirty tree before any GitHub network call', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'tracked.txt'), 'dirty push\n', 'utf8');
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.pushToGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_WORKTREE_DIRTY' } });
    expect(fixture.calls).toHaveLength(0);
  }, 30_000);

  it('stops Sync on a dirty tree before any GitHub network call', () => {
    const fixture = createRemoteFixture();
    fs.writeFileSync(path.join(fixture.workspace, 'tracked.txt'), 'dirty\n', 'utf8');
    const status = fixture.adapter.status(canonical(fixture.workspace));
    if (!status.ok) throw new Error(status.error.code);

    expect(fixture.adapter.syncFromGitHub(canonical(fixture.workspace), {
      expectedStatusId: status.value.statusId,
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    })).toMatchObject({ ok: false, error: { code: 'GIT_WORKTREE_DIRTY' } });
    expect(fixture.calls).toHaveLength(0);
  }, 30_000);
});
