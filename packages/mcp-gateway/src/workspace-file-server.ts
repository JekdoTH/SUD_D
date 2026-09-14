import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import {
  createApprovalCoordinator,
  createCodingSemanticReadCapabilities,
  createCodingSemanticWriteCapabilities,
  createAllGitCapabilities,
  createGitWorkspaceService,
  createWorkspaceService,
  createRestrictedVerifyCapabilities,
  createWorkMemoryCapabilities,
  createWorkMemoryService,
  createWorkResumeGuardedToolKernel,
  createTeamCapabilities,
  createTeamLegacyReconciler,
  createTeamService,
  createToolCapabilityRegistry,
  createToolKernel,
  createWorkspaceFileCapabilities,
  type CodingSemanticReadPort,
  type CodingSemanticWritePort,
  type RestrictedVerifyPort,
  type ToolKernel,
  type ToolKernelApprovalPort,
} from '@sud-d/application';
import {
  RESTRICTED_VERIFY_ACTIONS,
  WORK_MEMORY_LIMITS,
  WORK_TASK_STATUSES,
  type ClientSession,
  type InternalRoot,
} from '@sud-d/domain';
import {
  GIT_SAFETY_LIMITS,
  WORKSPACE_TEXT_FILE_LIMITS,
  canonicalizePath,
  createApprovalModeRepository,
  createApprovalRepository,
  createAuditRepository,
  resolveApprovalRuntimeIdentity,
  createGitSafetyAdapter,
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
  type AuditRepository,
  type GitSafetyAdapter,
  type TeamRepository,
  type TeamTransitionUnitOfWork,
  type WorkspaceRepository,
  type WorkspaceGitSettingsRepository,
  type WorkspaceTextFileSystem,
  type WorkMemoryRepository,
} from '@sud-d/infrastructure';
import { MCP_GATEWAY_INFO } from './metadata.js';

const relativePathSchema = z.string().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars);
const listInputSchema = z.object({
  relativePath: relativePathSchema,
  limit: z.number().int().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxListEntries).optional(),
}).strict();
const pathInputSchema = z.object({ relativePath: relativePathSchema }).strict();
const searchInputSchema = z.object({
  relativePath: relativePathSchema,
  query: z.string().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxSearchQueryChars),
  limit: z.number().int().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxSearchMatches).optional(),
}).strict();
const writeInputSchema = z.object({
  relativePath: relativePathSchema,
  content: z.string(),
}).strict().superRefine((value, context) => {
  if (Buffer.byteLength(value.content, 'utf8') > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'Text content exceeds the trusted size limit',
    });
  }
});
const gitDetectInputSchema = z.object({}).strict();
const gitStatusInputSchema = z.object({
  limit: z.number().int().min(1).max(GIT_SAFETY_LIMITS.maxStatusEntries).optional(),
}).strict();
const gitDiffInputSchema = z.object({
  relativePath: relativePathSchema.optional(),
  maxBytes: z.number().int().min(1).max(GIT_SAFETY_LIMITS.maxDiffBytes).optional(),
}).strict();
const gitCheckpointInputSchema = z.object({
  expectedStatusId: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
const gitCommitInputSchema = z.object({
  expectedStatusId: z.string().regex(/^[0-9a-f]{64}$/),
  message: z.string().min(1).max(160).refine((value) => !/[\r\n\0]/.test(value)),
}).strict();
const gitSnapshotIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
const gitRemoteNameSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
const gitBranchNameSchema = z.string().min(1).max(240).regex(/^[A-Za-z0-9._\/-]+$/).refine((value) => !/[\r\n\0]/.test(value));
const gitRemoteUrlSchema = z.string().min(1).max(2048).refine((value) => !/[\r\n\0]/.test(value));
const gitInspectInputSchema = z.object({}).strict();
const gitExpectedSnapshotInputSchema = z.object({ expectedSnapshotId: gitSnapshotIdSchema }).strict();
const gitRemoteConfigureInputSchema = z.object({ expectedSnapshotId: gitSnapshotIdSchema, remoteName: gitRemoteNameSchema, remoteUrl: gitRemoteUrlSchema }).strict();
const gitRemoteSelectInputSchema = z.object({ expectedSnapshotId: gitSnapshotIdSchema, remoteName: gitRemoteNameSchema }).strict();
const gitBranchInputSchema = z.object({ expectedSnapshotId: gitSnapshotIdSchema, branchName: gitBranchNameSchema }).strict();
const gitCloneInputSchema = z.object({
  repositoryUrl: gitRemoteUrlSchema,
  destinationPath: z.string().min(1).max(32_767).refine((value) => !/[\r\n\0]/.test(value)),
  displayName: z.string().min(1).max(200).refine((value) => value.trim().length > 0 && !/[\r\n\0]/.test(value)),
}).strict();

const teamGoalSchema = z.string().min(1).max(2_000).refine((value) => !value.includes('\0'));
const teamSummarySchema = z.string().min(1).max(1_000).refine((value) => !value.includes('\0'));
const teamRelativeHintSchema = z.string().min(1).max(1_024).refine((value) => !value.includes('\0')).optional();
const teamBlockedReasonSchema = z.enum([
  'EXECUTE_REQUIRED',
  'NETWORK_REQUIRED',
  'DELETE_REQUIRED',
  'SECURITY_POLICY',
  'APPROVAL_DENIED',
  'APPROVAL_EXPIRED',
  'WORKSPACE_STALE',
  'GIT_STATE_STALE',
  'SCOPE_MISMATCH',
  'REVIEW_LOOP_LIMIT',
  'UNSUPPORTED_OPERATION',
  'INTERNAL_FAILURE',
]);
const teamStartInputSchema = z.object({ goal: teamGoalSchema }).strict();
const teamStatusInputSchema = z.object({ missionId: z.string().uuid().optional() }).strict();
const teamStopInputSchema = z.object({ missionId: z.string().uuid().optional() }).strict();
const teamWorkItemSchema = z.object({
  title: z.string().min(1).max(160),
  targetPathHint: teamRelativeHintSchema,
}).strict();
const teamFindingSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1).max(240),
  targetPathHint: teamRelativeHintSchema,
  expectedCorrection: z.string().min(1).max(240).optional(),
}).strict();
const teamVerificationSchema = z.array(
  z.string().min(1).max(WORK_MEMORY_LIMITS.maxItemChars).refine((value) => !value.includes('\0')),
).max(WORK_MEMORY_LIMITS.maxVerificationItems).optional();
const teamSubmitInputSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('plan_ready'), summary: teamSummarySchema, workItems: z.array(teamWorkItemSchema).min(1).max(20) }).strict(),
  z.object({ outcome: z.literal('work_ready'), summary: teamSummarySchema }).strict(),
  z.object({ outcome: z.literal('validation_passed'), summary: teamSummarySchema, verification: teamVerificationSchema }).strict(),
  z.object({ outcome: z.literal('validation_failed'), summary: teamSummarySchema, verification: teamVerificationSchema, findings: z.array(teamFindingSchema).min(1).max(20) }).strict(),
  z.object({ outcome: z.literal('task_approved'), summary: teamSummarySchema }).strict(),
  z.object({ outcome: z.literal('changes_requested'), summary: teamSummarySchema, findings: z.array(teamFindingSchema).min(1).max(20) }).strict(),
  z.object({ outcome: z.literal('blocked'), blockedReason: teamBlockedReasonSchema, summary: teamSummarySchema }).strict(),
]);

const restrictedVerifyInputSchema = z.object({
  action: z.enum(RESTRICTED_VERIFY_ACTIONS),
}).strict();

const workResumeInputSchema = z.object({}).strict();
const workMemoryTextItemSchema = z.string().min(1).max(WORK_MEMORY_LIMITS.maxItemChars).refine((value) => !value.includes('\0'));
const workCheckpointInputSchema = z.object({
  goal: z.string().min(1).max(WORK_MEMORY_LIMITS.maxGoalChars).refine((value) => !value.includes('\0')),
  task: z.object({
    title: z.string().min(1).max(WORK_MEMORY_LIMITS.maxTaskChars).refine((value) => !value.includes('\0')),
    status: z.enum(WORK_TASK_STATUSES),
  }).strict(),
  completed: z.array(workMemoryTextItemSchema).max(WORK_MEMORY_LIMITS.maxCompletedItems),
  decisions: z.array(workMemoryTextItemSchema).max(WORK_MEMORY_LIMITS.maxDecisionItems),
  blockers: z.array(workMemoryTextItemSchema).max(WORK_MEMORY_LIMITS.maxBlockerItems),
  nextAction: z.string().min(1).max(WORK_MEMORY_LIMITS.maxNextActionChars).refine((value) => !value.includes('\0')),
  artifacts: z.array(z.string().min(1).max(WORK_MEMORY_LIMITS.maxArtifactPathChars).refine((value) => !value.includes('\0'))).max(WORK_MEMORY_LIMITS.maxArtifactItems),
  verification: z.array(workMemoryTextItemSchema).max(WORK_MEMORY_LIMITS.maxVerificationItems),
}).strict().superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > WORK_MEMORY_LIMITS.maxSerializedBytes) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Work Memory checkpoint exceeds the trusted size limit' });
  }
});

const codeOverviewInputSchema = z.object({
  relativePath: relativePathSchema,
  depth: z.number().int().min(-1).max(8).optional(),
}).strict();
const codeFindSymbolInputSchema = z.object({
  namePathPattern: z.string().min(1).max(2_048),
  relativePath: relativePathSchema.optional(),
  depth: z.number().int().min(0).max(8).optional(),
  includeBody: z.boolean().optional(),
  substringMatching: z.boolean().optional(),
  maxMatches: z.number().int().min(1).max(100).optional(),
}).strict();
const codeFindReferencesInputSchema = z.object({
  namePath: z.string().min(1).max(2_048),
  relativePath: relativePathSchema,
}).strict();
const codeSearchInputSchema = z.object({
  pattern: z.string().min(1).max(2_048),
  relativePath: relativePathSchema.optional(),
  codeOnly: z.boolean().optional(),
}).strict();
const codeDiagnosticsInputSchema = z.object({
  relativePath: relativePathSchema,
  startLine: z.number().int().min(0).optional(),
  endLine: z.number().int().min(-1).optional(),
  minSeverity: z.number().int().min(1).max(4).optional(),
}).strict();
const codeNamePathSchema = z.string().min(1).max(2_048).refine((value) => !value.includes('\0'));
const codeWriteBodySchema = z.string().min(1).refine((value) => !value.includes('\0')).superRefine((value, context) => {
  if (Buffer.byteLength(value, 'utf8') > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Semantic write body exceeds the trusted size limit',
    });
  }
});
const codeReplaceSymbolInputSchema = z.object({
  namePath: codeNamePathSchema,
  relativePath: relativePathSchema,
  body: codeWriteBodySchema,
}).strict();
const codeInsertBeforeInputSchema = codeReplaceSymbolInputSchema;
const codeInsertAfterInputSchema = codeReplaceSymbolInputSchema;
const codeRenameInputSchema = z.object({
  namePath: codeNamePathSchema,
  relativePath: relativePathSchema,
  newName: z.string().min(1).max(2_048).refine((value) => !value.includes('\0')),
}).strict();

export interface ProductionMcpServerDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly auditRepo: AuditRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
  readonly gitSafety?: GitSafetyAdapter;
  readonly gitSettingsRepo: WorkspaceGitSettingsRepository;
  readonly teamRepo: TeamRepository;
  readonly teamTransitionUow: TeamTransitionUnitOfWork;
  readonly semanticRead: CodingSemanticReadPort;
  readonly semanticWrite: CodingSemanticWritePort;
  readonly restrictedVerify: RestrictedVerifyPort;
  readonly workMemoryRepo: WorkMemoryRepository;
  readonly approval?: ToolKernelApprovalPort;
}

export function createProductionMcpServer(
  dependencies: ProductionMcpServerDependencies,
): McpServer {
  const gitSafety = dependencies.gitSafety ?? createGitSafetyAdapter();
  const legacy = createTeamLegacyReconciler({ teamRepo: dependencies.teamRepo }).reconcile();
  if (!legacy.ok) throw new Error('SUD-D Team legacy reconciliation failed');
  const workMemory = createWorkMemoryService({ repository: dependencies.workMemoryRepo, gitSafety });
  const workspaceService = createWorkspaceService(
    dependencies.workspaceRepo,
    dependencies.auditRepo,
    [...dependencies.internalRoots],
  );
  const gitWorkspace = createGitWorkspaceService({
    workspaceRepo: dependencies.workspaceRepo,
    gitSettings: dependencies.gitSettingsRepo,
    gitSafety,
    workspaceService,
    internalRoots: dependencies.internalRoots,
  });
  const teamService = createTeamService({
    teamRepo: dependencies.teamRepo,
    workspaceRepo: dependencies.workspaceRepo,
    audit: dependencies.auditRepo,
    transitionUow: dependencies.teamTransitionUow,
    freshness: {
      current(workspace) {
        const status = gitSafety.status(workspace.canonicalRoot, GIT_SAFETY_LIMITS.maxStatusEntries);
        return status.ok
          ? { ok: true, value: { kind: 'git_status', value: status.value.statusId } }
          : { ok: true, value: { kind: 'none', value: 'unsupported' } };
      },
    },
  });
  const resolveTeamSecurity = () => {
    try {
      const active = dependencies.workspaceRepo.list().filter((workspace) => workspace.isActive);
      return active.length === 1
        ? { ok: true as const, value: { sensitivity: 'normal' as const, context: 'workspace' as const, workspaceId: active[0]!.id } }
        : { ok: false as const, error: { code: 'WORKSPACE_NOT_FOUND' as const, message: 'Exactly one active Workspace is required' } };
    } catch {
      return { ok: false as const, error: { code: 'INTERNAL_ERROR' as const, message: 'Failed to resolve active Workspace' } };
    }
  };
  const capabilities = [
    ...createWorkspaceFileCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      internalRoots: dependencies.internalRoots,
      fileSystem: dependencies.fileSystem,
    }),
    ...createAllGitCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      gitSafety,
      gitWorkspace,
    }),
    ...createCodingSemanticReadCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      internalRoots: dependencies.internalRoots,
      fileSystem: dependencies.fileSystem,
      semanticRead: dependencies.semanticRead,
    }),
    ...createCodingSemanticWriteCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      internalRoots: dependencies.internalRoots,
      fileSystem: dependencies.fileSystem,
      semanticWrite: dependencies.semanticWrite,
    }),
    ...createRestrictedVerifyCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      internalRoots: dependencies.internalRoots,
      fileSystem: dependencies.fileSystem,
      restrictedVerify: dependencies.restrictedVerify,
      summaryAudit: dependencies.auditRepo,
    }),
    ...createWorkMemoryCapabilities({
      workspaceRepo: dependencies.workspaceRepo,
      internalRoots: dependencies.internalRoots,
      fileSystem: dependencies.fileSystem,
      workMemory,
    }),
    ...createTeamCapabilities({
      teamService,
      resolveWorkspaceSecurity: resolveTeamSecurity,
    }),
  ];
  const registry = createToolCapabilityRegistry(capabilities);
  if (!registry.ok) {
    throw new Error('SUD-D production tool registration failed');
  }
  const baseKernel = createToolKernel({
    registry: registry.value,
    audit: dependencies.auditRepo,
    ...(dependencies.approval ? { approval: dependencies.approval } : {}),
  });
  const guardedKernel = createWorkResumeGuardedToolKernel({
    kernel: baseKernel,
    workspaceRepo: dependencies.workspaceRepo,
    workMemory,
    audit: dependencies.auditRepo,
  });
  const kernel = bindMcpSession(guardedKernel, Object.freeze({
    id: `mcp-stdio-${randomUUID()}`,
    type: 'mcp-stdio' as const,
  }));
  const server = new McpServer(MCP_GATEWAY_INFO, {
    capabilities: { tools: { listChanged: false } },
    instructions: 'Call work.resume before substantive project work. If a Team mission exists, call team.status and continue the current bounded Planner/Worker/Validator/Reviewer assignment. Routine legal Team assignments advance automatically; stop for Approval, a true user decision, a blocker, or tool/session limits. Resume Context is Workspace-scoped and grants no additional authority.',
  });

  registerWorkspaceFileTools(server, kernel);
  registerGitSafetyTools(server, kernel);
  registerTeamTools(server, kernel);
  registerCodingSemanticReadTools(server, kernel);
  registerCodingSemanticWriteTools(server, kernel);
  registerRestrictedVerifyTools(server, kernel);
  registerWorkMemoryTools(server, kernel);
  return server;
}

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

function registerWorkspaceFileTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'workspace.list',
    {
      title: 'List workspace directory',
      description: 'List safe entries in a directory under the active SUD-D Workspace.',
      inputSchema: listInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.list', input),
  );
  server.registerTool(
    'workspace.stat',
    {
      title: 'Stat workspace resource',
      description: 'Return safe metadata for a resource under the active SUD-D Workspace.',
      inputSchema: pathInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.stat', input),
  );
  server.registerTool(
    'workspace.read_text',
    {
      title: 'Read workspace text file',
      description: 'Read a bounded UTF-8 text file under the active SUD-D Workspace.',
      inputSchema: pathInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.read_text', input),
  );
  server.registerTool(
    'workspace.search_text',
    {
      title: 'Search workspace text',
      description: 'Search literal text recursively within a safe active-workspace directory.',
      inputSchema: searchInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.search_text', input),
  );
  server.registerTool(
    'workspace.create_text_file',
    {
      title: 'Create workspace text file',
      description: 'Create a bounded UTF-8 text file under the active SUD-D Workspace; fails if it already exists.',
      inputSchema: writeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.create_text_file', input),
  );
  server.registerTool(
    'workspace.write_text_file',
    {
      title: 'Write workspace text file',
      description: 'Replace the contents of an existing regular UTF-8 project file under the active SUD-D Workspace.',
      inputSchema: writeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.write_text_file', input),
  );
}

function registerGitSafetyTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'git.detect',
    {
      title: 'Detect workspace Git repository',
      description: 'Detect a supported local Git repository exactly at the active SUD-D Workspace root.',
      inputSchema: gitDetectInputSchema,
    },
    async (input) => invokeKernel(kernel, 'git.detect', input),
  );
  server.registerTool(
    'git.status',
    {
      title: 'Inspect workspace Git status',
      description: 'Return a bounded structured local Git status for the active SUD-D Workspace.',
      inputSchema: gitStatusInputSchema,
    },
    async (input) => invokeKernel(kernel, 'git.status', input),
  );
  server.registerTool(
    'git.diff',
    {
      title: 'Inspect workspace Git diff',
      description: 'Return a bounded credential-safe tracked diff relative to HEAD.',
      inputSchema: gitDiffInputSchema,
    },
    async (input) => invokeKernel(kernel, 'git.diff', input),
  );
  server.registerTool(
    'git.checkpoint',
    {
      title: 'Create SUD-D Git checkpoint',
      description: 'Create an append-only local SUD-D checkpoint for an inspected Workspace status.',
      inputSchema: gitCheckpointInputSchema,
    },
    async (input) => invokeKernel(kernel, 'git.checkpoint', input),
  );
  server.registerTool(
    'git.commit',
    {
      title: 'Commit Workspace changes',
      description: 'Create one bounded local branch commit from an inspected active-Workspace status with a clean staging area.',
      inputSchema: gitCommitInputSchema,
    },
    async (input) => invokeKernel(kernel, 'git.commit', input),
  );
  const workflowTools = [
    ['git.inspect', 'Inspect Git workspace', 'Inspect bounded branch, remote, and sync state for the active Workspace.', gitInspectInputSchema],
    ['git.init', 'Initialize Git workspace', 'Initialize Git exactly at the active Workspace root.', gitExpectedSnapshotInputSchema],
    ['git.remote.configure', 'Configure Git remote', 'Configure one validated GitHub remote for the active Workspace.', gitRemoteConfigureInputSchema],
    ['git.remote.select', 'Select Primary Remote', 'Persist one configured remote as the Workspace Primary Remote.', gitRemoteSelectInputSchema],
    ['git.branch.create', 'Create Git branch', 'Create one bounded local branch without switching to it.', gitBranchInputSchema],
    ['git.branch.switch', 'Switch Git branch', 'Switch the clean active Workspace to an existing safe branch.', gitBranchInputSchema],
    ['git.branch.merge', 'Merge Git branch', 'Merge a local branch with bounded conflict preflight and no rebase/reset.', gitBranchInputSchema],
    ['git.branch.delete', 'Delete Git branch', 'Safely delete a merged local branch without force.', gitBranchInputSchema],
    ['git.fetch', 'Fetch GitHub state', 'Fetch and refresh the validated Primary Remote state from GitHub.', gitExpectedSnapshotInputSchema],
    ['git.sync', 'Sync from GitHub', 'Fast-forward the clean current branch only when GitHub is safely ahead.', gitExpectedSnapshotInputSchema],
    ['git.push', 'Push to GitHub', 'Push fast-forward-safe local history and verify the remote SHA.', gitExpectedSnapshotInputSchema],
    ['git.clone', 'Clone GitHub repository', 'Clone a validated GitHub repository into a safe bootstrap destination and register it as a Workspace.', gitCloneInputSchema],
  ] as const;
  for (const [name, title, description, inputSchema] of workflowTools) {
    server.registerTool(
      name,
      { title, description, inputSchema },
      async (input: unknown) => invokeKernel(kernel, name, input),
    );
  }
}

function registerTeamTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'team.start',
    {
      title: 'Start Team mission',
      description: 'Start one sequential Team Mode mission for the active Workspace.',
      inputSchema: teamStartInputSchema,
    },
    async (input) => invokeKernel(kernel, 'team.start', input),
  );
  server.registerTool(
    'team.status',
    {
      title: 'Read Team mission status',
      description: 'Return safe Team Mode mission state without raw prompts, file contents, or diffs.',
      inputSchema: teamStatusInputSchema,
    },
    async (input) => invokeKernel(kernel, 'team.status', input),
  );
  server.registerTool(
    'team.submit',
    {
      title: 'Submit Team role result',
      description: 'Submit the current logical role result and let SUD-D validate the next transition.',
      inputSchema: teamSubmitInputSchema,
    },
    async (input) => invokeKernel(kernel, 'team.submit', input),
  );
  server.registerTool(
    'team.stop',
    {
      title: 'Stop Team mission',
      description: 'Stop the active Team mission without changing files, Git state, approvals, or processes.',
      inputSchema: teamStopInputSchema,
    },
    async (input) => invokeKernel(kernel, 'team.stop', input),
  );
}

function registerCodingSemanticReadTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'code.overview',
    {
      title: 'Overview code symbols',
      description: 'Return a bounded semantic symbol overview for a safe path in the active Workspace.',
      inputSchema: codeOverviewInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.overview', input),
  );
  server.registerTool(
    'code.find_symbol',
    {
      title: 'Find code symbol',
      description: 'Find a symbol through the managed Coding Engine within the active Workspace.',
      inputSchema: codeFindSymbolInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.find_symbol', input),
  );
  server.registerTool(
    'code.find_references',
    {
      title: 'Find code references',
      description: 'Find references to a symbol through the managed Coding Engine within the active Workspace.',
      inputSchema: codeFindReferencesInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.find_references', input),
  );
  server.registerTool(
    'code.search',
    {
      title: 'Search code semantically',
      description: 'Run a bounded semantic search through the managed Coding Engine within the active Workspace.',
      inputSchema: codeSearchInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.search', input),
  );
  server.registerTool(
    'code.diagnostics',
    {
      title: 'Read code diagnostics',
      description: 'Return bounded language diagnostics for a safe file in the active Workspace.',
      inputSchema: codeDiagnosticsInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.diagnostics', input),
  );
}

function registerCodingSemanticWriteTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'code.replace_symbol',
    {
      title: 'Replace code symbol',
      description: 'Replace one existing symbol definition through the managed Coding Engine within the active Workspace.',
      inputSchema: codeReplaceSymbolInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.replace_symbol', input),
  );
  server.registerTool(
    'code.insert_before',
    {
      title: 'Insert code before symbol',
      description: 'Insert bounded code immediately before one existing symbol through the managed Coding Engine.',
      inputSchema: codeInsertBeforeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.insert_before', input),
  );
  server.registerTool(
    'code.insert_after',
    {
      title: 'Insert code after symbol',
      description: 'Insert bounded code immediately after one existing symbol through the managed Coding Engine.',
      inputSchema: codeInsertAfterInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.insert_after', input),
  );
  server.registerTool(
    'code.rename',
    {
      title: 'Rename code symbol',
      description: 'Rename one symbol through the managed Coding Engine within the active Workspace.',
      inputSchema: codeRenameInputSchema,
    },
    async (input) => invokeKernel(kernel, 'code.rename', input),
  );
}

function registerRestrictedVerifyTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'verify.run',
    {
      title: 'Run project verification',
      description: 'Run one fixed project verification action in the active Workspace through Policy and Approval.',
      inputSchema: restrictedVerifyInputSchema,
    },
    async (input) => invokeKernel(kernel, 'verify.run', input),
  );
}

function registerWorkMemoryTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'work.resume',
    {
      title: 'Resume Workspace work',
      description: 'Load and validate the bounded Resume Context for the active Workspace and bootstrap this MCP session.',
      inputSchema: workResumeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'work.resume', input),
  );
  server.registerTool(
    'work.checkpoint',
    {
      title: 'Checkpoint Workspace work',
      description: 'Persist one bounded Work Memory checkpoint for the resumed active Workspace.',
      inputSchema: workCheckpointInputSchema,
    },
    async (input) => invokeKernel(kernel, 'work.checkpoint', input),
  );
}

interface SessionBoundToolKernel extends ToolKernel {
  readonly session: ClientSession;
}

function bindMcpSession(kernel: ToolKernel, session: ClientSession): SessionBoundToolKernel {
  const sessionKernel: SessionBoundToolKernel = {
    session,
    invoke(request) {
      return kernel.invoke({ ...request, session });
    },
  };
  return Object.freeze(sessionKernel);
}
async function invokeKernel(
  kernel: ToolKernel,
  capability: string,
  input: unknown,
) {
  const session = (kernel as Partial<SessionBoundToolKernel>).session;
  if (!session) throw new Error('SUD-D MCP session binding is unavailable');
  const result = await kernel.invoke({
    invocationId: randomUUID(),
    session,
    capability,
    input,
  });
  const payload = result.ok
    ? {
        ok: true,
        code: result.code,
        policyDecision: result.policyDecision,
        ...(result.approvalDecision ? { approvalDecision: result.approvalDecision } : {}),
        ...(result.approvalRequestId ? { approvalRequestId: result.approvalRequestId } : {}),
        value: result.value,
      }
    : {
        ok: false,
        code: result.code,
        outcome: result.outcome,
        ...(result.policyDecision ? { policyDecision: result.policyDecision } : {}),
        ...(result.approvalDecision ? { approvalDecision: result.approvalDecision } : {}),
        ...(result.approvalRequestId ? { approvalRequestId: result.approvalRequestId } : {}),
        ...(result.approvalExpiresAt ? { expiresAt: result.approvalExpiresAt } : {}),
        ...(result.message ? { message: result.message } : {}),
        ...(result.causeCode ? { causeCode: result.causeCode } : {}),
      };
  return {
    ...(result.ok ? {} : { isError: true }),
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}
