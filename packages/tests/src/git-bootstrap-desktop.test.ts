import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ToolKernel } from '@sud-d/application';
import { IPC_CHANNELS } from '@sud-d/contracts';
import type { ToolInvocationRequest, ToolKernelResult } from '@sud-d/domain';
import { createDesktopGitController, type DesktopGitController } from '../../desktop/electron/git-controller.js';
import { registerDesktopGitIpcHandlers } from '../../desktop/electron/git-ipc.js';

const SNAPSHOT_ID = 'a'.repeat(64);
const SNAPSHOT = {
  workspace: { id: '00000000-0000-4000-8000-000000000001', displayName: 'Widgets' },
  snapshotId: SNAPSHOT_ID,
  repository: 'ready' as const,
  repositoryState: 'normal' as const,
  clean: true,
  changedFiles: 0,
  truncated: false,
  currentBranch: 'main',
  detached: false,
  branches: [{ name: 'main', current: true, checkedOutElsewhere: false }],
  defaultBranch: { state: 'known' as const, branch: 'main' },
  primaryRemote: { state: 'resolved' as const, name: 'upstream', safeRepository: 'acme/widgets', transport: 'https' as const },
  upstreamBranch: 'upstream/main',
  relation: 'up_to_date' as const,
  ahead: 0,
  behind: 0,
  authStatus: 'unknown' as const,
  operations: {
    initialize: { available: false, reason: 'Already initialized' },
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

describe('Git Bootstrap - Desktop Git controller', () => {
  it('dispatches only fixed capabilities with the persistent Desktop session and reduces Approval Required to safe metadata', async () => {
    const calls: ToolInvocationRequest[] = [];
    const invoke = vi.fn(async (request: ToolInvocationRequest): Promise<ToolKernelResult> => {
      calls.push(request);
      if (request.capability === 'git.inspect') {
        return { ok: true, outcome: 'executed', code: 'EXECUTED', policyDecision: 'allow', value: SNAPSHOT };
      }
      return {
        ok: false,
        outcome: 'blocked',
        code: 'APPROVAL_REQUIRED',
        policyDecision: 'ask',
        approvalRequestId: '00000000-0000-4000-8000-000000000007',
        approvalExpiresAt: '2026-09-14T17:00:00.000Z',
        message: 'Approval required',
        stderr: 'RAW_STDERR_SENTINEL',
        stdout: 'RAW_STDOUT_SENTINEL',
        argv: ['--unsafe'],
        cwd: 'C:\\SECRET_PATH',
      } as ToolKernelResult;
    });
    const controller = createDesktopGitController({ invoke } as ToolKernel);

    await expect(controller.snapshot()).resolves.toEqual({ ok: true, value: SNAPSHOT });
    const approval = await controller.sync({ expectedSnapshotId: SNAPSHOT_ID });
    expect(approval).toEqual({
      ok: false,
      error: {
        code: 'APPROVAL_REQUIRED',
        message: 'Approval required',
        metadata: {
          approvalRequestId: '00000000-0000-4000-8000-000000000007',
          approvalExpiresAt: '2026-09-14T17:00:00.000Z',
        },
      },
    });
    expect(JSON.stringify(approval)).not.toMatch(/RAW_STDERR|RAW_STDOUT|--unsafe|SECRET_PATH|argv|cwd|stderr|stdout/i);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      session: { id: 'desktop-git', type: 'desktop' },
      capability: 'git.inspect',
      input: {},
    });
    expect(calls[1]).toMatchObject({
      session: { id: 'desktop-git', type: 'desktop' },
      capability: 'git.sync',
      input: { expectedSnapshotId: SNAPSHOT_ID },
    });
    expect(calls[0]!.invocationId).toMatch(/^desktop-git-/);
    expect(calls[1]!.invocationId).toMatch(/^desktop-git-/);
  });

  it('validates sender and strict semantic IPC input before fixed controller dispatch', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const snapshot = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const initialize = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const configureRemote = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const selectPrimaryRemote = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const createBranch = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const switchBranch = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const mergeBranch = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const deleteBranch = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const fetch = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const sync = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const push = vi.fn(async () => ({ ok: true as const, value: SNAPSHOT }));
    const clone = vi.fn(async () => ({ ok: false as const, error: { code: 'NOT_USED', message: 'not used' } }));
    const controller = {
      snapshot, initialize, configureRemote, selectPrimaryRemote,
      createBranch, switchBranch, mergeBranch, deleteBranch,
      fetch, sync, push, clone,
    } as DesktopGitController;

    registerDesktopGitIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      controller,
      (sender) => sender === 'trusted-sender',
    );

    expect(handlers.size).toBe(12);
    expect(await handlers.get(IPC_CHANNELS.GIT_SNAPSHOT)?.({ sender: 'attacker' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    expect(snapshot).not.toHaveBeenCalled();

    expect(await handlers.get(IPC_CHANNELS.GIT_SYNC)?.(
      { sender: 'trusted-sender' },
      { expectedSnapshotId: SNAPSHOT_ID, argv: ['--force'] },
    )).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(sync).not.toHaveBeenCalled();

    expect(await handlers.get(IPC_CHANNELS.GIT_CLONE)?.(
      { sender: 'trusted-sender' },
      { repositoryUrl: 'https://github.com/acme/widgets.git', destinationPath: 'C:\\Work\\clone', displayName: 'Clone', cwd: 'C:\\' },
    )).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(clone).not.toHaveBeenCalled();

    expect(await handlers.get(IPC_CHANNELS.GIT_SYNC)?.(
      { sender: 'trusted-sender' },
      { expectedSnapshotId: SNAPSHOT_ID },
    )).toEqual({ ok: true, value: SNAPSHOT });
    expect(sync).toHaveBeenCalledWith({ expectedSnapshotId: SNAPSHOT_ID });
  });

  it('preload and global types expose only the fixed semantic Git surface', () => {
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const globalTypes = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/global.d.ts'), 'utf8');
    const preloadStart = preload.indexOf('  git: {');
    const preloadEnd = preload.indexOf('  team: {', preloadStart);
    const preloadGit = preloadStart >= 0 && preloadEnd > preloadStart ? preload.slice(preloadStart, preloadEnd) : '';
    const globalStart = globalTypes.indexOf('  git: {');
    const globalEnd = globalTypes.indexOf('  team: {', globalStart);
    const globalGit = globalStart >= 0 && globalEnd > globalStart ? globalTypes.slice(globalStart, globalEnd) : '';

    for (const method of ['snapshot', 'init', 'configure', 'select', 'create', 'switch', 'merge', 'delete', 'fetch', 'sync', 'push', 'clone']) {
      expect(preloadGit).toContain(`${method}:`);
      expect(globalGit).toContain(`${method}(`);
    }
    expect(preloadGit).not.toMatch(/\b(capability|argv|cwd|processEnv|env)\b|(?:execute|invoke|run)\s*:/i);
    expect(preloadGit).not.toContain('ipcRenderer.send');
    expect(globalGit).not.toMatch(/\b(capability|argv|cwd|processEnv|env)\b|(?:execute|invoke|run)\s*\(/i);
  });

  it('runs Desktop Git behind a fixed worker while preserving Tool Kernel and Git safety composition', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/main.ts'), 'utf8');
    const worker = fs.existsSync(path.join(process.cwd(), 'packages/desktop/electron/git-worker.ts'))
      ? fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/git-worker.ts'), 'utf8')
      : '';
    const workerController = fs.existsSync(path.join(process.cwd(), 'packages/desktop/electron/git-worker-controller.ts'))
      ? fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/git-worker-controller.ts'), 'utf8')
      : '';
    const ipcSource = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/git-ipc.ts'), 'utf8');

    expect(main).toContain('createDesktopGitWorkerController');
    expect(main).toContain('registerDesktopGitIpcHandlers');
    for (const required of [
      'createAllGitCapabilities',
      'createGitWorkspaceService',
      'createToolCapabilityRegistry',
      'createToolKernel',
      'createApprovalCoordinator',
      'createWorkspaceGitSettingsRepository',
      'resolveApprovalRuntimeIdentity(process.env)',
      'createGitSafetyAdapter',
      'createDesktopGitController',
    ]) {
      expect(worker).toContain(required);
    }
    expect(workerController).toContain("path.join(path.dirname(fileURLToPath(moduleUrl)), 'git-worker.js')");
    expect(workerController).toContain('resolveDesktopGitWorkerEntry(import.meta.url)');
    expect(workerController).not.toContain("new URL('./git-worker.js', import.meta.url)");
    expect(workerController).toContain('new Worker(workerEntry)');
    expect(workerController).not.toMatch(/\b(argv|cwd|processEnv|shell|executable)\b/i);
    expect(ipcSource).not.toMatch(/GitSafetyAdapter|createGitSafetyAdapter|runLocal|runGitHubNetwork/i);
  });

  it('defines the Git page as a personal-first routine Git workflow', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/App.tsx'), 'utf8');
    const icons = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/ui-icons.tsx'), 'utf8');
    const gitPage = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/GitPage.tsx'), 'utf8');
    const gitRevisionFeedback = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/git-revision-feedback.ts'), 'utf8');
    const gitUiSource = gitPage + '\n' + gitRevisionFeedback;

    expect(app).toContain("| 'git'");
    expect(app.indexOf("{ id: 'git', icon: 'git', label: 'Git' }")).toBeGreaterThan(app.indexOf("{ id: 'workspaces'"));
    expect(app).toContain('<GitPage onNavigate={setPage} />');
    expect(icons).toContain("| 'git'");
    expect(icons).toContain("case 'git':");

    for (const copy of [
      'Workspace',
      'Branch',
      'GitHub connected',
      'Up to date',
      'Local changes',
      'Changes on GitHub',
      'Needs attention',
      'Get latest',
      'Commit & Push',
      'Need a new branch or Git setup? Ask ChatGPT.',
      'Approval required before this GitHub action can run.',
      'Approve',
      'Deny',
    ]) {
      expect(gitUiSource).toContain(copy);
    }

    for (const advancedCopy of [
      'Create branch',
      'Merge branch',
      'Safe delete local branch',
      'Configure Primary Remote',
      'Select Primary Remote',
      'Remote Sync',
    ]) {
      expect(gitPage).not.toContain(advancedCopy);
    }

    expect(gitPage).not.toContain("onNavigate('activity')");
    expect(gitPage).not.toContain('Review approval');
    expect(gitPage).toContain('window.sudD.approval.respond({');
    expect(gitPage).toContain('const pending = pendingApproval;');
    expect(gitPage).toContain('approvalRequestId: pending.approvalRequestId');
    expect(gitPage).toContain('await handleMutationResult(pending.action, pending.request, {');
    expect(gitPage).toContain('window.sudD.git.snapshot()');
    expect(gitPage).toContain('window.sudD.git.switch(');
    expect(gitPage).toContain('window.sudD.git.sync(');
    expect(gitPage).toContain('window.sudD.git.push(');
    expect(gitPage).not.toContain('setInterval');
    expect(gitPage).not.toContain('5000');
    expect(gitPage).toContain('expectedSnapshotId: snapshot.snapshotId');
    expect(gitPage).not.toMatch(/Primary Remote|upstream branch|fast-forward/i);
    expect(gitPage).not.toMatch(/ipcRenderer|\bargv\b|\bcwd\b|processEnv|\benv\b|child_process/i);
    expect(gitPage).not.toMatch(/password|username|token|private.?key/i);
    expect(gitPage).not.toMatch(/Approve for me|Full Access|approved automatically/i);
  });
});
