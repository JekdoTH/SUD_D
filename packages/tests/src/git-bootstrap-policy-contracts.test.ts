import { describe, expect, it } from 'vitest';

import {
  GIT_REMOTE_RELATIONS,
  GIT_REMOTE_TRANSPORTS,
  evaluatePolicy,
} from '@sud-d/domain';
import {
  DesktopGitSnapshotDtoSchema,
  GitBranchCreateInputSchema,
  GitBranchDeleteInputSchema,
  GitBranchMergeInputSchema,
  GitBranchSwitchInputSchema,
  GitCloneInputSchema,
  GitConfigureRemoteInputSchema,
  GitFetchInputSchema,
  GitInitInputSchema,
  GitPushInputSchema,
  GitSelectPrimaryRemoteInputSchema,
  GitSyncInputSchema,
} from '@sud-d/contracts';

describe('Git Bootstrap - reviewed GitHub network Policy', () => {
  it('keeps generic network denied but classifies reviewed github_network as ASK', () => {
    expect(evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'network' }))
      .toMatchObject({ decision: 'deny' });
    expect(evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'github_network' }))
      .toMatchObject({ decision: 'ask' });
  });
});

describe('Git Bootstrap - domain and Desktop contract surface', () => {
  it('exports the exact Git remote transports and relation vocabulary', () => {
    expect(GIT_REMOTE_TRANSPORTS).toEqual(['https', 'ssh']);
    expect(GIT_REMOTE_RELATIONS).toEqual([
      'unknown',
      'up_to_date',
      'local_ahead',
      'remote_ahead',
      'diverged',
      'no_upstream',
      'unavailable',
    ]);
  });

  it('accepts only bounded semantic Git inputs and rejects process-shaped authority', () => {
    const snapshotId = 'a'.repeat(64);
    expect(GitInitInputSchema.parse({ expectedSnapshotId: snapshotId })).toEqual({ expectedSnapshotId: snapshotId });
    expect(GitConfigureRemoteInputSchema.parse({
      expectedSnapshotId: snapshotId,
      remoteName: 'upstream',
      remoteUrl: 'https://github.com/acme/widgets.git',
    })).toMatchObject({ remoteName: 'upstream' });
    expect(GitSelectPrimaryRemoteInputSchema.parse({ expectedSnapshotId: snapshotId, remoteName: 'upstream' }))
      .toEqual({ expectedSnapshotId: snapshotId, remoteName: 'upstream' });
    expect(GitBranchSwitchInputSchema.parse({ expectedSnapshotId: snapshotId, branchName: 'feature/widgets' }))
      .toEqual({ expectedSnapshotId: snapshotId, branchName: 'feature/widgets' });
    expect(GitFetchInputSchema.parse({ expectedSnapshotId: snapshotId })).toEqual({ expectedSnapshotId: snapshotId });
    expect(GitSyncInputSchema.parse({ expectedSnapshotId: snapshotId })).toEqual({ expectedSnapshotId: snapshotId });
    expect(GitPushInputSchema.parse({ expectedSnapshotId: snapshotId })).toEqual({ expectedSnapshotId: snapshotId });
    expect(GitCloneInputSchema.parse({
      repositoryUrl: 'git@github.com:acme/widgets.git',
      destinationPath: 'C:\\Work\\widgets',
      displayName: 'Widgets',
    })).toMatchObject({ displayName: 'Widgets' });

    const authorityShapes = [
      { executable: 'cmd.exe' },
      { argv: ['push', '--force'] },
      { cwd: 'C:\\' },
      { env: { PATH: 'attacker' } },
    ];
    for (const schema of [GitInitInputSchema, GitFetchInputSchema, GitSyncInputSchema, GitPushInputSchema]) {
      for (const authority of authorityShapes) {
        expect(schema.safeParse({ expectedSnapshotId: snapshotId, ...authority }).success).toBe(false);
      }
    }
    for (const schema of [GitBranchCreateInputSchema, GitBranchSwitchInputSchema, GitBranchMergeInputSchema, GitBranchDeleteInputSchema]) {
      for (const authority of authorityShapes) {
        expect(schema.safeParse({ expectedSnapshotId: snapshotId, branchName: 'feature/widgets', ...authority }).success).toBe(false);
      }
    }
    for (const authority of [
      { executable: 'cmd.exe' },
      { argv: ['remote', 'set-url'] },
      { cwd: 'C:\\' },
      { env: { PATH: 'attacker' } },
    ]) {
      expect(GitConfigureRemoteInputSchema.safeParse({
        expectedSnapshotId: snapshotId,
        remoteName: 'upstream',
        remoteUrl: 'https://github.com/acme/widgets.git',
        ...authority,
      }).success).toBe(false);
      expect(GitSelectPrimaryRemoteInputSchema.safeParse({
        expectedSnapshotId: snapshotId,
        remoteName: 'upstream',
        ...authority,
      }).success).toBe(false);
      expect(GitCloneInputSchema.safeParse({
        repositoryUrl: 'git@github.com:acme/widgets.git',
        destinationPath: 'C:\\Work\\widgets',
        displayName: 'Widgets',
        ...authority,
      }).success).toBe(false);
    }
  });

  it('validates a safe aggregated Git snapshot without raw remote/process fields', () => {
    const snapshot = {
      workspace: { id: '11111111-1111-4111-8111-111111111111', displayName: 'Widgets' },
      snapshotId: 'b'.repeat(64),
      repository: 'ready',
      repositoryState: 'normal',
      clean: true,
      changedFiles: 0,
      truncated: false,
      currentBranch: 'trunk',
      detached: false,
      branches: [{ name: 'trunk', current: true, checkedOutElsewhere: false }],
      defaultBranch: { state: 'known', branch: 'trunk' },
      primaryRemote: { state: 'resolved', name: 'upstream', safeRepository: 'acme/widgets', transport: 'https' },
      upstreamBranch: 'upstream/trunk',
      relation: 'up_to_date',
      ahead: 0,
      behind: 0,
      authStatus: 'unknown',
      operations: {
        initialize: { available: false, reason: 'Already a Git repository' },
        configureRemote: { available: true },
        createBranch: { available: true },
        switchBranch: { available: true },
        mergeBranch: { available: true },
        deleteBranch: { available: true },
        fetch: { available: true },
        sync: { available: true },
        push: { available: true },
      },
    };
    expect(DesktopGitSnapshotDtoSchema.parse(snapshot)).toEqual(snapshot);
    expect(DesktopGitSnapshotDtoSchema.safeParse({
      ...snapshot,
      rawRemoteUrl: 'https://token@github.com/acme/widgets.git',
    }).success).toBe(false);
  });
});
