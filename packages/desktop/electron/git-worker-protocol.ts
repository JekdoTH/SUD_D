import type {
  DesktopGitCloneResultDto,
  DesktopGitSnapshotDto,
  GitBranchCreateInput,
  GitBranchDeleteInput,
  GitBranchMergeInput,
  GitBranchSwitchInput,
  GitCloneInput,
  GitConfigureRemoteInput,
  GitFetchInput,
  GitInitInput,
  GitPushInput,
  GitSelectPrimaryRemoteInput,
  GitSyncInput,
  IpcResult,
} from '@sud-d/contracts';

export type DesktopGitWorkerRequest =
  | { readonly id: string; readonly operation: 'snapshot' }
  | { readonly id: string; readonly operation: 'initialize'; readonly input: GitInitInput }
  | { readonly id: string; readonly operation: 'configureRemote'; readonly input: GitConfigureRemoteInput }
  | { readonly id: string; readonly operation: 'selectPrimaryRemote'; readonly input: GitSelectPrimaryRemoteInput }
  | { readonly id: string; readonly operation: 'createBranch'; readonly input: GitBranchCreateInput }
  | { readonly id: string; readonly operation: 'switchBranch'; readonly input: GitBranchSwitchInput }
  | { readonly id: string; readonly operation: 'mergeBranch'; readonly input: GitBranchMergeInput }
  | { readonly id: string; readonly operation: 'deleteBranch'; readonly input: GitBranchDeleteInput }
  | { readonly id: string; readonly operation: 'fetch'; readonly input: GitFetchInput }
  | { readonly id: string; readonly operation: 'sync'; readonly input: GitSyncInput }
  | { readonly id: string; readonly operation: 'push'; readonly input: GitPushInput }
  | { readonly id: string; readonly operation: 'clone'; readonly input: GitCloneInput };

export type DesktopGitWorkerResult =
  | IpcResult<DesktopGitSnapshotDto>
  | IpcResult<DesktopGitCloneResultDto>;

export interface DesktopGitWorkerResponse {
  readonly id: string;
  readonly result: DesktopGitWorkerResult;
}
