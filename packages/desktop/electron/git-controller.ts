import { randomUUID } from 'node:crypto';

import type { GitWorkflowCapabilityName, ToolKernel } from '@sud-d/application';
import {
  DesktopGitCloneResultDtoSchema,
  DesktopGitSnapshotDtoSchema,
  type DesktopGitCloneResultDto,
  type DesktopGitSnapshotDto,
  type GitBranchCreateInput,
  type GitBranchDeleteInput,
  type GitBranchMergeInput,
  type GitBranchSwitchInput,
  type GitCloneInput,
  type GitConfigureRemoteInput,
  type GitFetchInput,
  type GitInitInput,
  type GitPushInput,
  type GitSelectPrimaryRemoteInput,
  type GitSyncInput,
  type IpcResult,
} from '@sud-d/contracts';
import type { ToolKernelFailure } from '@sud-d/domain';

const DESKTOP_GIT_SESSION = Object.freeze({ id: 'desktop-git', type: 'desktop' as const });

export interface DesktopGitController {
  snapshot(): Promise<IpcResult<DesktopGitSnapshotDto>>;
  initialize(input: GitInitInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  configureRemote(input: GitConfigureRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  selectPrimaryRemote(input: GitSelectPrimaryRemoteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  createBranch(input: GitBranchCreateInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  switchBranch(input: GitBranchSwitchInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  mergeBranch(input: GitBranchMergeInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  deleteBranch(input: GitBranchDeleteInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  fetch(input: GitFetchInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  sync(input: GitSyncInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  push(input: GitPushInput): Promise<IpcResult<DesktopGitSnapshotDto>>;
  clone(input: GitCloneInput): Promise<IpcResult<DesktopGitCloneResultDto>>;
}

export function createDesktopGitController(kernel: ToolKernel): DesktopGitController {
  const invoke = async <T>(
    capability: GitWorkflowCapabilityName,
    input: unknown,
    project: (value: unknown) => IpcResult<T>,
  ): Promise<IpcResult<T>> => {
    const result = await kernel.invoke({
      invocationId: `desktop-git-${randomUUID()}`,
      session: DESKTOP_GIT_SESSION,
      capability,
      input,
    });
    return result.ok ? project(result.value) : toDesktopGitIpcFailure(result);
  };

  const snapshotResult = (value: unknown): IpcResult<DesktopGitSnapshotDto> => {
    const parsed = DesktopGitSnapshotDtoSchema.safeParse(value);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : internalResultError('Git state result is unavailable');
  };

  const cloneResult = (value: unknown): IpcResult<DesktopGitCloneResultDto> => {
    const candidate = normalizeCloneValue(value);
    const parsed = DesktopGitCloneResultDtoSchema.safeParse(candidate);
    return parsed.success
      ? { ok: true, value: parsed.data }
      : internalResultError('Git clone result is unavailable');
  };

  const controller: DesktopGitController = {
    snapshot: () => invoke('git.inspect', {}, snapshotResult),
    initialize: (input) => invoke('git.init', input, snapshotResult),
    configureRemote: (input) => invoke('git.remote.configure', input, snapshotResult),
    selectPrimaryRemote: (input) => invoke('git.remote.select', input, snapshotResult),
    createBranch: (input) => invoke('git.branch.create', input, snapshotResult),
    switchBranch: (input) => invoke('git.branch.switch', input, snapshotResult),
    mergeBranch: (input) => invoke('git.branch.merge', input, snapshotResult),
    deleteBranch: (input) => invoke('git.branch.delete', input, snapshotResult),
    fetch: (input) => invoke('git.fetch', input, snapshotResult),
    sync: (input) => invoke('git.sync', input, snapshotResult),
    push: (input) => invoke('git.push', input, snapshotResult),
    clone: (input) => invoke('git.clone', input, cloneResult),
  };
  return Object.freeze(controller);
}

function toDesktopGitIpcFailure(result: ToolKernelFailure): IpcResult<never> {
  const error = {
    code: result.causeCode ?? result.code,
    message: result.message ?? safeFailureMessage(result),
    ...(result.code === 'APPROVAL_REQUIRED' && result.approvalRequestId
      ? {
          metadata: {
            approvalRequestId: result.approvalRequestId,
            ...(result.approvalExpiresAt ? { approvalExpiresAt: result.approvalExpiresAt } : {}),
          },
        }
      : {}),
  };
  return { ok: false, error };
}

function safeFailureMessage(result: ToolKernelFailure): string {
  if (result.code === 'APPROVAL_REQUIRED') return 'Approval required';
  if (result.code === 'APPROVAL_DENIED') return 'Approval denied';
  if (result.code === 'APPROVAL_EXPIRED') return 'Approval expired';
  if (result.causeCode) return 'Git action failed';
  return 'Git action was blocked';
}

function internalResultError(message: string): IpcResult<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message } };
}

function normalizeCloneValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const clone = value as { workspace?: unknown; snapshot?: unknown };
  const workspace = clone.workspace;
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) return value;
  const item = workspace as Record<string, unknown>;
  return {
    workspace: {
      id: item['id'],
      displayName: item['displayName'],
      canonicalRoot: item['canonicalRoot'],
      isActive: item['isActive'],
      createdAt: item['createdAt'] instanceof Date ? item['createdAt'].toISOString() : item['createdAt'],
      updatedAt: item['updatedAt'] instanceof Date ? item['updatedAt'].toISOString() : item['updatedAt'],
    },
    snapshot: clone.snapshot,
  };
}
