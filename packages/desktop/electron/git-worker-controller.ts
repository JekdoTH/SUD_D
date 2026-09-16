import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

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

import type { DesktopGitController } from './git-controller.js';
import type {
  DesktopGitWorkerRequest,
  DesktopGitWorkerResponse,
  DesktopGitWorkerResult,
} from './git-worker-protocol.js';

interface DesktopGitWorkerLike {
  postMessage(message: DesktopGitWorkerRequest): void;
  on(event: 'message', listener: (message: DesktopGitWorkerResponse) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'exit', listener: (code: number) => void): this;
  terminate(): Promise<number>;
}

export interface DesktopGitWorkerController extends DesktopGitController {
  dispose(): Promise<number>;
}

type PendingResolver = (result: DesktopGitWorkerResult) => void;
type WorkerRequestWithoutId = DesktopGitWorkerRequest extends infer Request
  ? Request extends { readonly id: string }
    ? Omit<Request, 'id'>
    : never
  : never;

export function resolveDesktopGitWorkerEntry(moduleUrl: string): string {
  return path.join(path.dirname(fileURLToPath(moduleUrl)), 'git-worker.js');
}

export function createDesktopGitWorkerController(
  workerOverride?: DesktopGitWorkerLike,
): DesktopGitWorkerController {
  const workerEntry = resolveDesktopGitWorkerEntry(import.meta.url);
  const worker: DesktopGitWorkerLike = workerOverride
    ?? (new Worker(workerEntry) as unknown as DesktopGitWorkerLike);
  const pending = new Map<string, PendingResolver>();
  let closed = false;

  const workerUnavailable = (): IpcResult<never> => ({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Git worker is unavailable' },
  });

  const failPending = (): void => {
    const failure = workerUnavailable();
    for (const resolve of pending.values()) resolve(failure);
    pending.clear();
  };

  worker.on('message', (message) => {
    if (!message || typeof message.id !== 'string') return;
    const resolve = pending.get(message.id);
    if (!resolve) return;
    pending.delete(message.id);
    resolve(message.result);
  });
  worker.on('error', () => {
    closed = true;
    failPending();
  });
  worker.on('exit', () => {
    closed = true;
    failPending();
  });

  const request = <T>(message: WorkerRequestWithoutId): Promise<IpcResult<T>> => {
    if (closed) return Promise.resolve(workerUnavailable());
    const id = randomUUID();
    return new Promise<IpcResult<T>>((resolve) => {
      pending.set(id, resolve as PendingResolver);
      try {
        worker.postMessage({ ...message, id } as DesktopGitWorkerRequest);
      } catch {
        pending.delete(id);
        resolve(workerUnavailable());
      }
    });
  };

  const controller: DesktopGitWorkerController = {
    snapshot: () => request<DesktopGitSnapshotDto>({ operation: 'snapshot' }),
    initialize: (input: GitInitInput) => request<DesktopGitSnapshotDto>({ operation: 'initialize', input }),
    configureRemote: (input: GitConfigureRemoteInput) => request<DesktopGitSnapshotDto>({ operation: 'configureRemote', input }),
    selectPrimaryRemote: (input: GitSelectPrimaryRemoteInput) => request<DesktopGitSnapshotDto>({ operation: 'selectPrimaryRemote', input }),
    createBranch: (input: GitBranchCreateInput) => request<DesktopGitSnapshotDto>({ operation: 'createBranch', input }),
    switchBranch: (input: GitBranchSwitchInput) => request<DesktopGitSnapshotDto>({ operation: 'switchBranch', input }),
    mergeBranch: (input: GitBranchMergeInput) => request<DesktopGitSnapshotDto>({ operation: 'mergeBranch', input }),
    deleteBranch: (input: GitBranchDeleteInput) => request<DesktopGitSnapshotDto>({ operation: 'deleteBranch', input }),
    fetch: (input: GitFetchInput) => request<DesktopGitSnapshotDto>({ operation: 'fetch', input }),
    sync: (input: GitSyncInput) => request<DesktopGitSnapshotDto>({ operation: 'sync', input }),
    push: (input: GitPushInput) => request<DesktopGitSnapshotDto>({ operation: 'push', input }),
    clone: (input: GitCloneInput) => request<DesktopGitCloneResultDto>({ operation: 'clone', input }),
    async dispose() {
      if (closed) return 0;
      closed = true;
      failPending();
      return worker.terminate();
    },
  };

  return Object.freeze(controller);
}
