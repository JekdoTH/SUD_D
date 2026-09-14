import {
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
  IPC_CHANNELS,
  type IpcResult,
} from '@sud-d/contracts';
import type { DesktopGitController } from './git-controller.js';

interface IpcInvokeEventLike {
  readonly sender: unknown;
}

export interface GitIpcMain {
  handle(
    channel: string,
    listener: (event: IpcInvokeEventLike, raw?: unknown) => unknown,
  ): void;
}

export type GitIpcSenderValidator = (sender: unknown) => boolean;

function validationError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'VALIDATION_FAILED', message } };
}

export function registerDesktopGitIpcHandlers(
  ipcMain: GitIpcMain,
  controller: DesktopGitController,
  isSenderValid: GitIpcSenderValidator,
): void {
  ipcMain.handle(IPC_CHANNELS.GIT_SNAPSHOT, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    if (raw !== undefined) return validationError('Invalid Git snapshot request');
    return controller.snapshot();
  });

  ipcMain.handle(IPC_CHANNELS.GIT_INIT, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitInitInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git initialize request');
    return controller.initialize(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_REMOTE_CONFIGURE, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitConfigureRemoteInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git remote configuration request');
    return controller.configureRemote(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_REMOTE_SELECT, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitSelectPrimaryRemoteInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git Primary Remote request');
    return controller.selectPrimaryRemote(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_CREATE, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitBranchCreateInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git branch create request');
    return controller.createBranch(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_SWITCH, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitBranchSwitchInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git branch switch request');
    return controller.switchBranch(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_MERGE, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitBranchMergeInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git branch merge request');
    return controller.mergeBranch(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_BRANCH_DELETE, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitBranchDeleteInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git branch delete request');
    return controller.deleteBranch(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_FETCH, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitFetchInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git fetch request');
    return controller.fetch(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_SYNC, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitSyncInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git sync request');
    return controller.sync(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitPushInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git push request');
    return controller.push(parsed.data);
  });

  ipcMain.handle(IPC_CHANNELS.GIT_CLONE, (event, raw) => {
    if (!isSenderValid(event.sender)) return validationError('Invalid sender');
    const parsed = GitCloneInputSchema.safeParse(raw);
    if (!parsed.success) return validationError('Invalid Git clone request');
    return controller.clone(parsed.data);
  });
}
