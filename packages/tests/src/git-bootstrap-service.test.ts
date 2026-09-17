import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as application from '@sud-d/application';
import { appError, err, ok, type InternalRoot, type Workspace } from '@sud-d/domain';
import type {
  GitSafetyAdapter,
  GitWorkspaceInspection,
  GitNetworkMutationInput,
  WorkspaceGitSettingsRepository,
  WorkspaceRepository,
} from '@sud-d/infrastructure';
import type { GitWorkspaceService, WorkspaceService } from '@sud-d/application';

function workspace(root = 'C:\\Work\\Widgets'): Workspace {
  return {
    id: 'ws-1',
    displayName: 'Widgets',
    canonicalRoot: root,
    isActive: true,
    createdAt: new Date('2026-09-14T00:00:00Z'),
    updatedAt: new Date('2026-09-14T00:00:00Z'),
  };
}

function fixture() {
  const ws = workspace();
  const workspaces: Workspace[] = [ws];
  let persisted: string | undefined = 'mirror';
  let inspection: GitWorkspaceInspection = {
    detect: { isRepository: true, isSupported: true, headSha: 'a'.repeat(40), branch: 'trunk', detached: false, state: 'normal' },
    status: { headSha: 'a'.repeat(40), branch: 'trunk', detached: false, clean: true, entries: [], truncated: false, state: 'normal', statusId: 'b'.repeat(64) },
    branches: [{ name: 'trunk', current: true, checkedOutElsewhere: false }],
    remotes: [
      { name: 'upstream', supported: true, safeRepository: 'acme/widgets', transport: 'https' },
      { name: 'mirror', supported: true, safeRepository: 'acme/widgets-mirror', transport: 'ssh' },
    ],
    trackingRemote: 'upstream',
    upstreamBranch: 'upstream/trunk',
  };
  let createCalls = 0;
  const commitCalls: Array<{ readonly statusId: string; readonly message: string }> = [];
  const pushInputs: GitNetworkMutationInput[] = [];
  const syncInputs: GitNetworkMutationInput[] = [];
  let defaultBranch: string | undefined = 'trunk';
  let inspectReads = 0;
  let afterInspect: ((read: number) => void) | undefined;

  const workspaceRepo: WorkspaceRepository = {
    list: () => workspaces,
    findById: (id) => workspaces.find((item) => item.id === id),
    findByCanonicalRoot: (root) => workspaces.find((item) => item.canonicalRoot === root),
    save: () => { throw new Error('unexpected save'); },
    setActive: () => undefined,
    remove: () => undefined,
  };
  const gitSettings: WorkspaceGitSettingsRepository = {
    get: () => ({ workspaceId: ws.id, ...(persisted ? { primaryRemoteName: persisted } : {}), updatedAt: new Date() }),
    setPrimaryRemote: (_id, remoteName) => ({ workspaceId: ws.id, primaryRemoteName: (persisted = remoteName), updatedAt: new Date() }),
    clearPrimaryRemote: () => { persisted = undefined; },
  };
  const gitSafety = {
    inspectWorkspaceGit: () => {
      inspectReads += 1;
      const captured = inspection;
      afterInspect?.(inspectReads);
      return ok(captured);
    },
    resolveDefaultBranch: () => ok(defaultBranch),
    relation: () => ok({ kind: 'up_to_date' as const, ahead: 0, behind: 0, upstreamBranch: inspection.upstreamBranch }),
    createBranch: (_root: string, statusId: string) => {
      createCalls += 1;
      return statusId === inspection.status?.statusId
        ? ok({ headSha: 'a'.repeat(40), branch: 'feature/x', changed: true })
        : err(appError('GIT_STATUS_STALE', 'Git state changed before branch creation'));
    },
    commit: (_root: string, statusId: string, message: string) => {
      commitCalls.push({ statusId, message });
      if (statusId !== inspection.status?.statusId) {
        return err(appError('GIT_STATUS_STALE', 'Workspace Git status changed before commit'));
      }
      const parentHead = inspection.status?.headSha ?? 'a'.repeat(40);
      const commitSha = 'e'.repeat(40);
      inspection = {
        ...inspection,
        detect: { ...inspection.detect, headSha: commitSha },
        status: {
          ...inspection.status!,
          headSha: commitSha,
          clean: true,
          entries: [],
          truncated: false,
          state: 'normal',
          statusId: 'e'.repeat(64),
        },
      };
      return ok({ commitSha, parentHead, branch: inspection.detect.branch ?? 'trunk', committedPathCount: 1 });
    },
    syncFromGitHub: (_root: string, input: GitNetworkMutationInput) => {
      syncInputs.push(input);
      return ok({ relation: 'up_to_date' as const, changed: false, headSha: inspection.status?.headSha ?? 'e'.repeat(40) });
    },
    pushToGitHub: (_root: string, input: GitNetworkMutationInput) => {
      pushInputs.push(input);
      const headSha = inspection.status?.headSha ?? 'e'.repeat(40);
      return ok({ headSha, remoteSha: headSha, upstreamSet: false });
    },
  } as unknown as GitSafetyAdapter;
  const workspaceService: WorkspaceService = {
    list: () => ok(workspaces),
    add: () => { throw new Error('unexpected add'); },
    select: () => ok(undefined),
    remove: () => ok(undefined),
  };
  const create = (application as Record<string, unknown>)['createGitWorkspaceService'];
  return {
    ws,
    create,
    deps: { workspaceRepo, gitSettings, gitSafety, workspaceService, internalRoots: [] as InternalRoot[] },
    setInspection(next: GitWorkspaceInspection) { inspection = next; },
    getInspection() { return inspection; },
    setPersisted(value: string | undefined) { persisted = value; },
    setDefaultBranch(value: string | undefined) { defaultBranch = value; },
    setAfterInspect(value: ((read: number) => void) | undefined) { afterInspect = value; },
    createCalls: () => createCalls,
    commitCalls: () => commitCalls,
    pushInputs: () => pushInputs,
    syncInputs: () => syncInputs,
  };
}

describe('Git Bootstrap - GitWorkspaceService', () => {
  it('resolves Primary Remote in tracking → persisted → sole order and changes snapshotId with trusted state', () => {
    const f = fixture();
    expect(typeof f.create).toBe('function');
    if (typeof f.create !== 'function') return;
    const service = f.create(f.deps) as GitWorkspaceService;

    const tracking = service.snapshot();
    expect(tracking).toMatchObject({ ok: true, value: { headSha: 'a'.repeat(40), primaryRemote: { state: 'resolved', name: 'upstream' }, defaultBranch: { state: 'known', branch: 'trunk' }, relation: 'up_to_date' } });
    if (!tracking.ok) return;

    f.setInspection({ ...f.getInspection(), trackingRemote: undefined, upstreamBranch: undefined });
    const persisted = service.snapshot();
    expect(persisted).toMatchObject({ ok: true, value: { primaryRemote: { state: 'resolved', name: 'mirror' } } });
    if (!persisted.ok) return;
    expect(persisted.value.snapshotId).not.toBe(tracking.value.snapshotId);

    f.setPersisted('stale');
    f.setInspection({ ...f.getInspection(), remotes: [f.getInspection().remotes[0]!] });
    expect(service.snapshot()).toMatchObject({ ok: true, value: { primaryRemote: { state: 'resolved', name: 'upstream' } } });

    f.setPersisted(undefined);
    f.setInspection({ ...f.getInspection(), remotes: [] });
    expect(service.snapshot()).toMatchObject({ ok: true, value: { primaryRemote: { state: 'missing' } } });
  });

  it('uses the trusted status HEAD as the current revision when detect and status observations differ', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    f.setInspection({
      ...f.getInspection(),
      detect: { ...f.getInspection().detect, headSha: 'a'.repeat(40) },
      status: { ...f.getInspection().status!, headSha: 'c'.repeat(40), statusId: 'c'.repeat(64) },
    });
    const service = f.create(f.deps) as GitWorkspaceService;

    expect(service.snapshot()).toMatchObject({ ok: true, value: { headSha: 'c'.repeat(40) } });
  });
  it('keeps snapshotId sensitive to trusted status, branch, remote, tracking, and persisted Primary Remote state', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    const service = f.create(f.deps) as GitWorkspaceService;
    const ids: string[] = [];
    const capture = () => {
      const result = service.snapshot();
      if (!result.ok) throw new Error(result.error.code);
      ids.push(result.value.snapshotId);
      return result.value;
    };

    capture();
    f.setInspection({
      ...f.getInspection(),
      status: { ...f.getInspection().status!, statusId: '1'.repeat(64) },
    });
    capture();
    f.setInspection({
      ...f.getInspection(),
      detect: { ...f.getInspection().detect, branch: 'feature/token' },
      status: { ...f.getInspection().status!, branch: 'feature/token', statusId: '2'.repeat(64) },
      branches: [
        { name: 'trunk', current: false, checkedOutElsewhere: false },
        { name: 'feature/token', current: true, checkedOutElsewhere: false },
      ],
      upstreamBranch: 'upstream/feature/token',
    });
    capture();
    f.setInspection({
      ...f.getInspection(),
      remotes: [
        ...f.getInspection().remotes,
        { name: 'backup', supported: true, safeRepository: 'acme/widgets-backup', transport: 'https' },
      ],
    });
    capture();
    f.setInspection({ ...f.getInspection(), trackingRemote: 'mirror', upstreamBranch: 'mirror/feature/token' });
    capture();
    f.setPersisted('upstream');
    capture();

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps stale persisted Primary Remote ambiguous and disables delete when the default branch is unknown', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    const service = f.create(f.deps) as GitWorkspaceService;

    f.setPersisted('stale');
    f.setInspection({ ...f.getInspection(), trackingRemote: undefined, upstreamBranch: undefined });
    expect(service.snapshot()).toMatchObject({ ok: true, value: { primaryRemote: { state: 'ambiguous' } } });

    f.setPersisted('upstream');
    f.setDefaultBranch(undefined);
    const unknownDefault = service.snapshot();
    expect(unknownDefault).toMatchObject({
      ok: true,
      value: {
        defaultBranch: { state: 'unknown' },
        operations: { deleteBranch: { available: false } },
      },
    });
  });

  it('resolves safe github_network context and binding from the selected Primary Remote', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);
    const input = { expectedSnapshotId: snap.value.snapshotId };

    expect(service.resolveNetworkSecurity('fetch', input)).toEqual({
      ok: true,
      value: { sensitivity: 'normal', context: 'github_network', workspaceId: f.ws.id },
    });
    expect(service.networkApprovalBinding('push', input)).toEqual({
      ok: true,
      value: {
        operation: 'push',
        expectedSnapshotId: snap.value.snapshotId,
        remoteName: 'upstream',
        safeRepository: 'acme/widgets',
        transport: 'https',
      },
    });
    expect(JSON.stringify(service.networkApprovalBinding('push', input))).not.toContain(f.ws.canonicalRoot);
    expect(JSON.stringify(service.networkApprovalBinding('push', input))).not.toContain('github.com');
  });

  it('rejects stale mutation snapshots before calling the Git adapter', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);
    f.setPersisted('upstream');

    expect(service.createBranch({ expectedSnapshotId: snap.value.snapshotId, branchName: 'feature/x' })).toMatchObject({
      ok: false,
      error: { code: 'GIT_STATUS_STALE' },
    });
    expect(f.createCalls()).toBe(0);
  });

  it('keeps mutation bound to the same inspected state that matched the expected snapshot', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);

    f.setAfterInspect((read) => {
      if (read !== 2) return;
      f.setInspection({
        ...f.getInspection(),
        status: {
          ...f.getInspection().status!,
          statusId: 'd'.repeat(64),
        },
      });
    });

    expect(service.createBranch({ expectedSnapshotId: snap.value.snapshotId, branchName: 'feature/x' })).toMatchObject({
      ok: false,
      error: { code: 'GIT_STATUS_STALE' },
    });
    expect(f.createCalls()).toBe(1);
  });

  it('keeps ordinary dirty Push eligible and auto-commits before the network mutation', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    f.setInspection({
      ...f.getInspection(),
      status: {
        ...f.getInspection().status!,
        clean: false,
        entries: [{ path: 'dirty.txt', kind: 'modified', staged: false, unstaged: true, untracked: false, sensitive: false, gitlink: false }],
        statusId: 'c'.repeat(64),
      },
    });
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);

    expect(snap.value.operations.push).toEqual({ available: true });
    expect(service.resolveNetworkSecurity('push', { expectedSnapshotId: snap.value.snapshotId })).toEqual({
      ok: true,
      value: { sensitivity: 'normal', context: 'github_network', workspaceId: f.ws.id },
    });
    expect(service.networkApprovalBinding('push', { expectedSnapshotId: snap.value.snapshotId })).toMatchObject({
      ok: true,
      value: { operation: 'push', expectedSnapshotId: snap.value.snapshotId, remoteName: 'upstream' },
    });

    const pushed = service.push({ expectedSnapshotId: snap.value.snapshotId });

    expect(pushed).toMatchObject({ ok: true, value: { clean: true, changedFiles: 0 } });
    expect(f.commitCalls()).toEqual([{ statusId: 'c'.repeat(64), message: 'Save local changes before GitHub Push' }]);
    expect(f.pushInputs()).toEqual([{
      expectedStatusId: 'e'.repeat(64),
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    }]);
  });

  it('keeps ordinary dirty Sync eligible and auto-commits before the network mutation', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    f.setInspection({
      ...f.getInspection(),
      status: {
        ...f.getInspection().status!,
        clean: false,
        entries: [{ path: 'dirty.txt', kind: 'modified', staged: false, unstaged: true, untracked: false, sensitive: false, gitlink: false }],
        statusId: 'c'.repeat(64),
      },
    });
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);

    expect(snap.value.operations.sync).toEqual({ available: true });
    expect(service.resolveNetworkSecurity('sync', { expectedSnapshotId: snap.value.snapshotId })).toMatchObject({
      ok: true,
      value: { sensitivity: 'normal', context: 'github_network', workspaceId: f.ws.id },
    });

    const synced = service.sync({ expectedSnapshotId: snap.value.snapshotId });

    expect(synced).toMatchObject({ ok: true, value: { clean: true, changedFiles: 0 } });
    expect(f.commitCalls()).toEqual([{ statusId: 'c'.repeat(64), message: 'Save local changes before GitHub Sync' }]);
    expect(f.syncInputs()).toEqual([{
      expectedStatusId: 'e'.repeat(64),
      remoteName: 'upstream',
      branchName: 'trunk',
      upstreamBranch: 'upstream/trunk',
    }]);
  });

  it('keeps sensitive dirty changes out of eligible github_network auto approval', () => {
    const f = fixture();
    if (typeof f.create !== 'function') throw new Error('missing service');
    f.setInspection({
      ...f.getInspection(),
      status: {
        ...f.getInspection().status!,
        clean: false,
        entries: [{ path: '.env', kind: 'modified', staged: false, unstaged: true, untracked: false, sensitive: true, gitlink: false }],
        statusId: 'c'.repeat(64),
      },
    });
    const service = f.create(f.deps) as GitWorkspaceService;
    const snap = service.snapshot();
    if (!snap.ok) throw new Error(snap.error.code);

    expect(service.resolveNetworkSecurity('push', { expectedSnapshotId: snap.value.snapshotId })).toMatchObject({
      ok: false,
      error: { code: 'SENSITIVE_RESOURCE' },
    });
    expect(service.networkApprovalBinding('push', { expectedSnapshotId: snap.value.snapshotId })).toMatchObject({
      ok: false,
      error: { code: 'SENSITIVE_RESOURCE' },
    });
    expect(f.commitCalls()).toEqual([]);
    expect(f.pushInputs()).toEqual([]);
  });

  it('validates clone destination and safe GitHub binding before network execution', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-service-clone-'));
    const activeRoot = path.join(base, 'active');
    const internalRoot = path.join(base, 'internal');
    fs.mkdirSync(activeRoot);
    fs.mkdirSync(internalRoot);
    let workspaces: Workspace[] = [workspace(activeRoot)];
    let cloneCalls = 0;
    const inspection: GitWorkspaceInspection = {
      detect: { isRepository: true, isSupported: true, headSha: 'c'.repeat(40), branch: 'trunk', detached: false, state: 'normal' },
      status: { headSha: 'c'.repeat(40), branch: 'trunk', detached: false, clean: true, entries: [], truncated: false, state: 'normal', statusId: 'd'.repeat(64) },
      branches: [{ name: 'trunk', current: true, checkedOutElsewhere: false }], remotes: [],
    };
    const workspaceRepo: WorkspaceRepository = {
      list: () => workspaces,
      findById: (id) => workspaces.find((item) => item.id === id),
      findByCanonicalRoot: (root) => workspaces.find((item) => path.normalize(item.canonicalRoot).toLowerCase() === path.normalize(root).toLowerCase()),
      save: () => { throw new Error('unexpected direct save'); }, setActive: () => undefined, remove: () => undefined,
    };
    const gitSettings: WorkspaceGitSettingsRepository = { get: () => undefined, setPrimaryRemote: () => { throw new Error('unexpected settings'); }, clearPrimaryRemote: () => undefined };
    const gitSafety = {
      inspectWorkspaceGit: () => ok(inspection), resolveDefaultBranch: () => ok(undefined), relation: () => ok({ kind: 'no_upstream' as const }),
      cloneFromGitHub: ({ destinationPath }: { destinationPath: string }) => { cloneCalls += 1; fs.mkdirSync(destinationPath, { recursive: true }); return ok({ destinationPath, headSha: 'c'.repeat(40), branch: 'trunk' }); },
    } as unknown as GitSafetyAdapter;
    const workspaceService: WorkspaceService = {
      list: () => ok(workspaces),
      add: (displayName, root) => {
        workspaces = workspaces.map((item) => ({ ...item, isActive: false }));
        const added: Workspace = { ...workspace(root), id: 'ws-cloned', displayName, isActive: false };
        workspaces.push(added); return ok(added);
      },
      select: (id) => { workspaces = workspaces.map((item) => ({ ...item, isActive: item.id === id })); return ok(undefined); },
      remove: () => ok(undefined),
    };
    const create = (application as Record<string, unknown>)['createGitWorkspaceService'];
    if (typeof create !== 'function') throw new Error('missing service');
    const service = create({ workspaceRepo, gitSettings, gitSafety, workspaceService, internalRoots: [{ canonicalPath: fs.realpathSync.native(internalRoot), label: 'Internal' }] }) as GitWorkspaceService;
    const destination = path.join(base, 'clone-ok');

    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://token@github.com/acme/widgets.git', destinationPath: destination, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_REMOTE_UNSUPPORTED' } });
    expect(cloneCalls).toBe(0);
    expect(service.networkApprovalBinding('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: destination, displayName: 'Clone' })).toEqual({
      ok: true, value: { operation: 'clone', safeRepository: 'acme/widgets', transport: 'https', destinationLabel: 'clone-ok' },
    });

    for (const unsafePath of ['\\\\server\\share\\repo', '\\\\?\\C:\\unsafe\\repo']) {
      expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: unsafePath, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });
    }
    expect(cloneCalls).toBe(0);

    const existingFile = path.join(base, 'existing-file'); fs.writeFileSync(existingFile, 'x');
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: existingFile, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });

    const existingEmpty = path.join(base, 'existing-empty'); fs.mkdirSync(existingEmpty);
    expect(service.networkApprovalBinding('clone', { repositoryUrl: 'git@github.com:acme/widgets.git', destinationPath: existingEmpty, displayName: 'Clone' })).toEqual({
      ok: true, value: { operation: 'clone', safeRepository: 'acme/widgets', transport: 'ssh', destinationLabel: 'existing-empty' },
    });

    const nonEmpty = path.join(base, 'non-empty'); fs.mkdirSync(nonEmpty); fs.writeFileSync(path.join(nonEmpty, 'x.txt'), 'x');
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: nonEmpty, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: path.join(internalRoot, 'clone'), displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: activeRoot, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });

    const junctionTarget = path.join(base, 'junction-target'); fs.mkdirSync(junctionTarget);
    const junction = path.join(base, 'junction-parent'); fs.symlinkSync(junctionTarget, junction, 'junction');
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: path.join(junction, 'clone'), displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });
    expect(service.resolveNetworkSecurity('clone', { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: junction, displayName: 'Clone' })).toMatchObject({ ok: false, error: { code: 'GIT_CLONE_DESTINATION_UNSAFE' } });

    const cloned = service.clone({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: destination, displayName: 'Cloned Widgets' });
    expect(cloned).toMatchObject({ ok: true, value: { workspace: { id: 'ws-cloned', displayName: 'Cloned Widgets' }, snapshot: { workspace: { id: 'ws-cloned' } } } });
    expect(workspaces.find((item) => item.id === 'ws-cloned')?.isActive).toBe(true);
    expect(cloneCalls).toBe(1);
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('keeps cloned data when Workspace registration fails', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-service-partial-'));
    const activeRoot = path.join(base, 'active'); fs.mkdirSync(activeRoot);
    const ws = workspace(activeRoot);
    const workspaceRepo = { list: () => [ws], findById: () => ws, findByCanonicalRoot: () => undefined } as unknown as WorkspaceRepository;
    const gitSettings = { get: () => undefined } as unknown as WorkspaceGitSettingsRepository;
    const gitSafety = {
      inspectWorkspaceGit: () => ok({ detect: { isRepository: true, isSupported: true, headSha: 'e'.repeat(40), branch: 'trunk', detached: false, state: 'normal' }, status: { headSha: 'e'.repeat(40), branch: 'trunk', detached: false, clean: true, entries: [], truncated: false, state: 'normal', statusId: 'f'.repeat(64) }, branches: [], remotes: [] }),
      resolveDefaultBranch: () => ok(undefined), relation: () => ok({ kind: 'no_upstream' as const }),
      cloneFromGitHub: ({ destinationPath }: { destinationPath: string }) => { fs.mkdirSync(destinationPath); return ok({ destinationPath, headSha: 'e'.repeat(40), branch: 'trunk' }); },
    } as unknown as GitSafetyAdapter;
    const workspaceService = { list: () => ok([ws]), add: () => ({ ok: false, error: { code: 'WORKSPACE_INVALID', message: 'registration failed' } }), select: () => ok(undefined), remove: () => ok(undefined) } as WorkspaceService;
    const create = (application as Record<string, unknown>)['createGitWorkspaceService']; if (typeof create !== 'function') throw new Error('missing service');
    const service = create({ workspaceRepo, gitSettings, gitSafety, workspaceService, internalRoots: [] }) as GitWorkspaceService;
    const destination = path.join(base, 'clone-partial');
    expect(service.clone({ repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: destination, displayName: 'Partial' })).toMatchObject({ ok: false, error: { code: 'WORKSPACE_INVALID', metadata: { cloned: true } } });
    expect(fs.existsSync(destination)).toBe(true);
    fs.rmSync(base, { recursive: true, force: true });
  });
});
