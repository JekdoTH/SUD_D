import path from 'node:path';
import { parentPort } from 'node:worker_threads';

import {
  canonicalizePath,
  createApprovalModeRepository,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createWorkspaceGitSettingsRepository,
  createWorkspaceRepository,
  getDataRoot,
  openDatabase,
  resolveApprovalRuntimeIdentity,
} from '@sud-d/infrastructure';
import {
  createAllGitCapabilities,
  createApprovalCoordinator,
  createGitWorkspaceService,
  createToolCapabilityRegistry,
  createToolKernel,
  createWorkspaceService,
} from '@sud-d/application';
import type { IpcResult } from '@sud-d/contracts';
import type { InternalRoot } from '@sud-d/domain';

import { createDesktopGitController } from './git-controller.js';
import type {
  DesktopGitWorkerRequest,
  DesktopGitWorkerResponse,
  DesktopGitWorkerResult,
} from './git-worker-protocol.js';

if (!parentPort) throw new Error('Desktop Git worker requires a parent port');

const dataRoot = getDataRoot();
const db = openDatabase(path.join(dataRoot, 'sud-d.db'));
const workspaceRepo = createWorkspaceRepository(db);
const auditRepo = createAuditRepository(db);
const approvalRepo = createApprovalRepository(db);
const approvalModeRepo = createApprovalModeRepository(db);
const gitSettingsRepo = createWorkspaceGitSettingsRepository(db);
const gitSafety = createGitSafetyAdapter();
const dataRootCanonical = canonicalizePath(dataRoot);
const internalRoots: InternalRoot[] = dataRootCanonical.ok
  ? [{ canonicalPath: dataRootCanonical.value, label: 'SUD-D data root' }]
  : [];
const workspaceService = createWorkspaceService(workspaceRepo, auditRepo, internalRoots);
const gitWorkspace = createGitWorkspaceService({
  workspaceRepo,
  gitSettings: gitSettingsRepo,
  gitSafety,
  workspaceService,
  internalRoots,
});
const approval = createApprovalCoordinator({
  repository: approvalRepo,
  ...resolveApprovalRuntimeIdentity(process.env),
  mode: () => approvalModeRepo.get(),
});
const registry = createToolCapabilityRegistry(createAllGitCapabilities({
  workspaceRepo,
  gitSafety,
  gitWorkspace,
}));
if (!registry.ok) throw new Error('SUD-D Desktop Git worker registration failed');
const kernel = createToolKernel({ registry: registry.value, audit: auditRepo, approval });
const controller = createDesktopGitController(kernel);

parentPort.on('message', (request: DesktopGitWorkerRequest) => {
  void handleRequest(request);
});
parentPort.on('close', () => {
  db.close();
});

async function handleRequest(request: DesktopGitWorkerRequest): Promise<void> {
  if (!request || typeof request.id !== 'string' || request.id.length === 0) return;
  let result: DesktopGitWorkerResult;
  try {
    result = await dispatch(request);
  } catch {
    result = internalError();
  }
  const response: DesktopGitWorkerResponse = { id: request.id, result };
  parentPort?.postMessage(response);
}

function dispatch(request: DesktopGitWorkerRequest): Promise<DesktopGitWorkerResult> {
  switch (request.operation) {
    case 'snapshot':
      return controller.snapshot();
    case 'initialize':
      return controller.initialize(request.input);
    case 'configureRemote':
      return controller.configureRemote(request.input);
    case 'selectPrimaryRemote':
      return controller.selectPrimaryRemote(request.input);
    case 'createBranch':
      return controller.createBranch(request.input);
    case 'switchBranch':
      return controller.switchBranch(request.input);
    case 'mergeBranch':
      return controller.mergeBranch(request.input);
    case 'deleteBranch':
      return controller.deleteBranch(request.input);
    case 'fetch':
      return controller.fetch(request.input);
    case 'sync':
      return controller.sync(request.input);
    case 'push':
      return controller.push(request.input);
    case 'clone':
      return controller.clone(request.input);
  }
}

function internalError(): IpcResult<never> {
  return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Git worker operation failed' } };
}
