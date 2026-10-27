import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { createApprovalCoordinator } from '@sud-d/application';
import {
  canonicalizePath,
  createApprovalModeRepository,
  createApprovalRepository,
  createAuditRepository,
  resolveApprovalRuntimeIdentity,
  createManagedSerenaRuntime,
  createRestrictedVerifyAdapter,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceRepository,
  createWorkspaceGitSettingsRepository,
  createWorkMemoryRepository,
  createWorkspaceTextFileSystem,
  getDataRoot,
  openDatabase,
} from '@sud-d/infrastructure';
import { createProductionMcpServer } from './workspace-file-server-core.js';

export { createProductionMcpServer } from './workspace-file-server-core.js';
export type { ProductionMcpServerDependencies } from './workspace-file-server-core.js';

export function createDefaultProductionMcpServer(): McpServer {
  const dataRoot = getDataRoot();
  const db = openDatabase(path.join(dataRoot, 'sud-d.db'));
  const canonicalDataRoot = canonicalizePath(dataRoot);
  if (!canonicalDataRoot.ok) {
    db.close();
    throw new Error('SUD-D workspace security initialization failed');
  }
  const auditRepo = createAuditRepository(db);
  const approvalRepo = createApprovalRepository(db);
  const approvalModeRepo = createApprovalModeRepository(db);
  const teamRepo = createTeamRepository(db);
  const approvalRuntimeIdentity = resolveApprovalRuntimeIdentity(process.env);
  const approval = createApprovalCoordinator({
    repository: approvalRepo,
    ...approvalRuntimeIdentity,
    mode: () => approvalModeRepo.get(),
  });
  const codingRuntime = createManagedSerenaRuntime({ dataRoot });
  const restrictedVerify = createRestrictedVerifyAdapter();
  return createProductionMcpServer({
    workspaceRepo: createWorkspaceRepository(db),
    auditRepo,
    internalRoots: [{ canonicalPath: canonicalDataRoot.value, label: 'SUD-D data root' }],
    fileSystem: createWorkspaceTextFileSystem(),
    gitSettingsRepo: createWorkspaceGitSettingsRepository(db),
    teamRepo,
    teamTransitionUow: createTeamTransitionUnitOfWork(db),
    semanticRead: {
      read: (context, request) => codingRuntime.semanticRead(context, request),
    },
    semanticWrite: {
      write: (context, request) => codingRuntime.semanticWrite(context, request),
    },
    restrictedVerify,
    workMemoryRepo: createWorkMemoryRepository(db),
    approval,
  });
}
