# Git Bootstrap + Branch + Remote Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend SUD-D's existing bounded Git foundation into safe repository bootstrap, local branch workflow, GitHub Sync/Push, and a dedicated Git page without adding generic shell/process authority or weakening Policy/Approval/Audit boundaries.

**Architecture:** Keep `GitSafetyAdapter` as the single deep semantic Git module and add internal fixed-purpose helpers for trusted GitHub remote parsing and host-owned network Git execution. Add one application-level `GitWorkspaceService` that resolves active Workspace, Primary Remote, default branch, snapshot freshness, and clone bootstrap; expose those semantics through shared Tool Kernel capabilities used by both MCP and Desktop. Desktop receives only strict DTOs over sender-validated IPC and renders an Operate-mode Git page; the renderer never constructs commands or receives credentials/raw process state.

**Tech Stack:** TypeScript 5.8, Node/Electron 36, React 18, Zod 4, better-sqlite3, Vitest 3, existing SUD-D Tool Kernel/Policy/Approval/Audit modules, trusted Git for Windows executable.

**Spec:** `docs/superpowers/specs/2026-09-14-git-bootstrap-branch-remote-sync-design.md`

## Global Constraints

- Reuse and deepen `packages/infrastructure/src/git-safety-adapter.ts`; do not create a parallel generic Git engine.
- Existing `git.detect`, `git.status`, `git.diff`, `git.checkpoint`, and `git.commit` behavior remains backward-compatible.
- GitHub network scope is GitHub-only HTTPS/SSH. Non-GitHub network Git remains unavailable.
- Generic `PolicyContext: 'network'` remains DENY. Add only the reviewed `github_network` context, classified as ASK after fixed-purpose validation.
- Approval Mode semantics for eligible validated `github_network` ASK requests are exact: **Standard** (`standard`) stays manual; **Approve for me** (`approve_for_me`) and **Full Access** (`full_access`) may auto-approve. Policy DENY and all hard boundaries override every mode.
- Audit remains ON for manual and mode-based approvals and every privileged Git operation.
- Credentials/tokens/private-key contents/helper payloads/raw stderr/raw stdout/raw command lines/raw process env never enter renderer DTOs, ordinary SQLite, audit metadata, logs, or safe errors.
- The renderer never chooses executables, raw argv, cwd, env, credential helpers, Git config includes, hooks, SSH options, or arbitrary capability names.
- Primary Remote is resolved from trusted repository state/user choice and is never hard-coded to `origin`.
- Primary / Default Branch is resolved from trusted Git state and is never hard-coded to `master` or `main`.
- Switch, merge, Sync, and Push require a clean tree including untracked files and stop before mutation on dirty/unsafe/stale state.
- No auto-stash, auto-rebase, destructive reset, force-push, force-delete, remote branch deletion, or hidden recovery shortcut.
- Clone is the only pre-Workspace Git workflow capability; it never overwrites a non-empty/unsafe destination and must pass Bootstrap Destination, Workspace/InternalRoot, and reparse safety checks before `github_network` Policy/Approval/network execution.
- Preserve existing linked-worktree compatibility. User-facing worktree create/list/remove remains out of scope.
- Creating a GitHub repository from SUD-D remains out of scope.
- Use TDD during implementation: focused RED → minimal GREEN per task. Final verification follows `focused-first → final-once → rerun-by-invalidation`.
- This milestone is **Security / Data Critical**. Final gates: focused/relevant regressions, lint, typecheck, full suite once, production build, `git diff --check`, Standards + Spec review, one real production smoke, then Product Owner manual acceptance.
- Execution starts only after the approved spec + this plan are integrated into `master`. At execution time use `superpowers:using-git-worktrees` to create an isolated worktree and branch `feat/git-bootstrap-branch-remote-sync` from that verified `master`; preserve `.serena/` and all user stashes/local changes.

## File Map

### Create

- `packages/domain/src/git.ts` — stable Git workflow enums/types shared above infrastructure.
- `packages/infrastructure/src/workspace-git-settings-repository.ts` — non-secret Primary Remote selection persistence.
- `packages/infrastructure/src/git-github-remote.ts` — strict GitHub HTTPS/SSH parsing + safe identity normalization.
- `packages/infrastructure/src/git-command-runner.ts` — trusted Git executable runner with separate local-hermetic and GitHub-network modes.
- `packages/application/src/git-workspace-service.ts` — active Workspace snapshot, Primary Remote/default branch resolution, snapshot token, clone bootstrap/registration.
- `packages/application/src/git-workflow-capabilities.ts` — fixed-purpose Tool Kernel capabilities for bootstrap/branch/remote/network workflow.
- `packages/desktop/electron/git-controller.ts` — Desktop fixed-method Tool Kernel invoker + bounded error/DTO mapping.
- `packages/desktop/electron/git-ipc.ts` — sender-validated strict Git IPC handlers.
- `packages/desktop/src/pages/GitPage.tsx` — Git Operate-mode page.
- `packages/tests/src/git-bootstrap-policy-contracts.test.ts`
- `packages/tests/src/git-bootstrap-settings.test.ts`
- `packages/tests/src/git-bootstrap-local-workflow.test.ts`
- `packages/tests/src/git-bootstrap-network.test.ts`
- `packages/tests/src/git-bootstrap-service.test.ts`
- `packages/tests/src/git-bootstrap-security.test.ts`
- `packages/tests/src/git-bootstrap-desktop.test.ts`
- `packages/tests/src/git-bootstrap-integration.test.ts`

### Modify

- `packages/domain/src/policy.ts`
- `packages/domain/src/result.ts`
- `packages/domain/src/index.ts`
- `packages/contracts/src/index.ts`
- `packages/infrastructure/src/database.ts`
- `packages/infrastructure/src/git-safety-adapter.ts`
- `packages/infrastructure/src/index.ts`
- `packages/application/src/approval-service.ts`
- `packages/application/src/git-safety-capabilities.ts`
- `packages/application/src/work-resume-guard.ts`
- `packages/application/src/index.ts`
- `packages/mcp-gateway/src/workspace-file-server.ts`
- `packages/desktop/electron/main.ts`
- `packages/desktop/electron/preload.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/App.tsx`
- `packages/desktop/src/ui-icons.tsx`
- `packages/desktop/src/index.css`
- `packages/tests/src/git-safety-test-harness.ts`
- `packages/tests/src/basic-approval-security.test.ts`
- `packages/tests/src/basic-approval-production.test.ts`
- `packages/tests/src/work-resume-guard.test.ts`
- `packages/tests/src/git-safety-linked-worktree.test.ts`
- `SUD_D_HANDOFF.md` only at milestone closure after runtime evidence is final.

---

### Task 1: Lock Git workflow domain, Policy, Approval Mode, and Desktop contracts

**Files:**
- Create: `packages/domain/src/git.ts`
- Modify: `packages/domain/src/policy.ts`
- Modify: `packages/domain/src/result.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/application/src/approval-service.ts`
- Test: `packages/tests/src/git-bootstrap-policy-contracts.test.ts`
- Test: `packages/tests/src/basic-approval-security.test.ts`

**Interfaces:**
- Produces domain terms: `GitRemoteTransport`, `GitRemoteRelation`, `GitPrimaryRemoteState`, `GitDefaultBranchState`, `GitAuthStatus`.
- Produces strict renderer inputs/DTOs: `DesktopGitSnapshotDto`, `GitInitInput`, `GitConfigureRemoteInput`, `GitSelectPrimaryRemoteInput`, branch mutation inputs, `GitFetchInput`, `GitSyncInput`, `GitPushInput`, `GitCloneInput`.
- Adds `PolicyContext = 'workspace' | 'outside_workspace' | 'internal_root' | 'network' | 'github_network'` with ASK semantics for `github_network` while generic `network` remains DENY.
- Expands `isAutoApprovalEligible()` only for the exact network capabilities `git.clone`, `git.fetch`, `git.sync`, `git.push` after their security context is already `github_network`/normal.

- [ ] **Step 1: Write focused RED tests for Policy + Approval Mode matrix**

Add tests that prove the owner-approved semantics before changing implementation:

```ts
it('keeps generic network denied but classifies reviewed github_network as ASK', () => {
  expect(evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'network' }))
    .toMatchObject({ decision: 'deny' });
  expect(evaluatePolicy({ effect: 'read', sensitivity: 'normal', context: 'github_network' }))
    .toMatchObject({ decision: 'ask' });
});

const githubRequest = (capability: string) => ({
  session: { id: 'git-mode-test', type: 'desktop' as const },
  capability,
  effect: 'modify' as const,
  security: { sensitivity: 'normal' as const, context: 'github_network' as const },
  descriptor: { title: 'Sync GitHub repository', resourceLabel: 'acme/widgets' },
  binding: { operation: capability },
});

it.each(['git.clone', 'git.fetch', 'git.sync', 'git.push'] as const)(
  '%s is manual in Standard and mode-approved in the two automatic modes',
  (capability) => {
    const standard = createApprovalCoordinator({ repository, runtimeInstanceId: `std-${capability}`, hmacKey, mode: () => 'standard' });
    const approveForMe = createApprovalCoordinator({ repository, runtimeInstanceId: `afm-${capability}`, hmacKey, mode: () => 'approve_for_me' });
    const fullAccess = createApprovalCoordinator({ repository, runtimeInstanceId: `full-${capability}`, hmacKey, mode: () => 'full_access' });
    expect(standard.authorize(githubRequest(capability))).toMatchObject({ ok: true, state: 'pending' });
    expect(approveForMe.authorize(githubRequest(capability))).toMatchObject({ ok: true, state: 'approved' });
    expect(fullAccess.authorize(githubRequest(capability))).toMatchObject({ ok: true, state: 'approved' });
  },
);

it('never mode-approves generic network, delete, credential, or an unlisted capability', () => {
  const coordinator = createApprovalCoordinator({ repository, runtimeInstanceId: 'hard-boundary', hmacKey, mode: () => 'full_access' });
  expect(coordinator.authorize({ ...githubRequest('git.sync'), security: { sensitivity: 'credential', context: 'github_network' } })).toMatchObject({ ok: true, state: 'pending' });
  expect(coordinator.authorize({ ...githubRequest('git.sync'), effect: 'delete' })).toMatchObject({ ok: true, state: 'pending' });
  expect(coordinator.authorize(githubRequest('git.remote.configure'))).toMatchObject({ ok: true, state: 'pending' });
});
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-policy-contracts.test.ts packages/tests/src/basic-approval-security.test.ts --reporter=verbose
```

Expected: new `github_network` cases fail because `PolicyContext` and Approval auto-eligibility do not yet support them.

- [ ] **Step 3: Add the domain Git vocabulary and reviewed Policy context**

Create `packages/domain/src/git.ts` with exact stable terms:

```ts
export const GIT_REMOTE_TRANSPORTS = ['https', 'ssh'] as const;
export type GitRemoteTransport = (typeof GIT_REMOTE_TRANSPORTS)[number];

export const GIT_REMOTE_RELATIONS = [
  'unknown',
  'up_to_date',
  'local_ahead',
  'remote_ahead',
  'diverged',
  'no_upstream',
  'unavailable',
] as const;
export type GitRemoteRelation = (typeof GIT_REMOTE_RELATIONS)[number];

export type GitPrimaryRemoteState = 'resolved' | 'missing' | 'ambiguous' | 'unsupported';
export type GitDefaultBranchState = 'known' | 'unknown';
export type GitAuthStatus = 'unknown' | 'working' | 'failed';
```

Export it from `packages/domain/src/index.ts`.

In `policy.ts`, add `github_network` and keep ordering fail-closed:

```ts
export type PolicyContext =
  | 'workspace'
  | 'outside_workspace'
  | 'internal_root'
  | 'network'
  | 'github_network';

if (req.context === 'network') {
  return { decision: 'deny', reason: 'Network access is not permitted' };
}
if (req.context === 'github_network') {
  return { decision: 'ask', reason: 'Reviewed GitHub network operation requires Approval' };
}
```

- [ ] **Step 4: Add bounded Git-specific error codes**

Extend `AppErrorCode` with the recoverable states the UI/spec needs:

```ts
| 'GIT_WORKTREE_DIRTY'
| 'GIT_REMOTE_MISSING'
| 'GIT_REMOTE_AMBIGUOUS'
| 'GIT_REMOTE_UNSUPPORTED'
| 'GIT_DEFAULT_BRANCH_UNKNOWN'
| 'GIT_UPSTREAM_MISSING'
| 'GIT_REMOTE_AHEAD'
| 'GIT_DIVERGED'
| 'GIT_AUTH_FAILED'
| 'GIT_REMOTE_UNREACHABLE'
| 'GIT_CLONE_DESTINATION_UNSAFE'
| 'GIT_BRANCH_IN_USE'
| 'GIT_BRANCH_UNMERGED'
```

Keep existing `GIT_STATE_UNSAFE`, `GIT_STATUS_STALE`, and `GIT_OPERATION_CONFLICT` for their existing meanings.

- [ ] **Step 5: Extend Approval Mode eligibility narrowly**

In `approval-service.ts` add the reviewed capability set and branch before the existing Workspace-only rule:

```ts
const GITHUB_NETWORK_AUTO_APPROVAL_CAPABILITIES = new Set([
  'git.clone',
  'git.fetch',
  'git.sync',
  'git.push',
]);

function isAutoApprovalEligible(mode: ApprovalMode, request: ApprovalAuthorizationRequest): boolean {
  if (mode === 'standard') return false;

  if (request.security.context === 'github_network') {
    return request.security.sensitivity === 'normal'
      && request.effect !== 'delete'
      && GITHUB_NETWORK_AUTO_APPROVAL_CAPABILITIES.has(request.capability);
  }

  if (
    request.security.context !== 'workspace'
    || request.security.sensitivity !== 'normal'
    || !request.security.workspaceId
    || request.effect === 'delete'
  ) return false;

  // Preserve the existing Workspace mode rules below unchanged.
  if (mode === 'full_access') return true;
  if (request.capability === 'git.commit') return true;
  if (request.capability !== 'verify.run') return false;
  const binding = request.binding as { readonly [key: string]: ApprovalBindingValue };
  const action = binding['action'];
  return typeof action === 'string' && APPROVE_FOR_ME_VERIFY_ACTIONS.has(action);
}
```

Clone intentionally does not require a Workspace ID because its destination is validated before `github_network` security resolution.

- [ ] **Step 6: Add strict Git Desktop contracts and IPC channel names**

Add fixed channel names:

```ts
GIT_SNAPSHOT: 'git:snapshot',
GIT_INIT: 'git:init',
GIT_REMOTE_CONFIGURE: 'git:remote:configure',
GIT_REMOTE_SELECT: 'git:remote:select',
GIT_BRANCH_CREATE: 'git:branch:create',
GIT_BRANCH_SWITCH: 'git:branch:switch',
GIT_BRANCH_MERGE: 'git:branch:merge',
GIT_BRANCH_DELETE: 'git:branch:delete',
GIT_FETCH: 'git:fetch',
GIT_SYNC: 'git:sync',
GIT_PUSH: 'git:push',
GIT_CLONE: 'git:clone',
```

Use strict bounded primitives:

```ts
export const GitSnapshotIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const GitBranchNameSchema = z.string().min(1).max(255).refine((value) => !/[\r\n\0]/.test(value));
export const GitRemoteNameSchema = z.string().min(1).max(128).refine((value) => !/[\s\r\n\0]/.test(value));
export const GitRemoteUrlSchema = z.string().min(1).max(2048).refine((value) => !/[\r\n\0]/.test(value));
```

Mutation schemas all `.strict()` and accept only semantic data:

```ts
export const GitInitInputSchema = z.object({ expectedSnapshotId: GitSnapshotIdSchema }).strict();
export type GitInitInput = z.infer<typeof GitInitInputSchema>;

export const GitConfigureRemoteInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  remoteName: GitRemoteNameSchema,
  remoteUrl: GitRemoteUrlSchema,
}).strict();
export type GitConfigureRemoteInput = z.infer<typeof GitConfigureRemoteInputSchema>;

export const GitSelectPrimaryRemoteInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  remoteName: GitRemoteNameSchema,
}).strict();
export type GitSelectPrimaryRemoteInput = z.infer<typeof GitSelectPrimaryRemoteInputSchema>;

const GitBranchMutationInputSchema = z.object({
  expectedSnapshotId: GitSnapshotIdSchema,
  branchName: GitBranchNameSchema,
}).strict();
export const GitBranchCreateInputSchema = GitBranchMutationInputSchema;
export const GitBranchSwitchInputSchema = GitBranchMutationInputSchema;
export const GitBranchMergeInputSchema = GitBranchMutationInputSchema;
export const GitBranchDeleteInputSchema = GitBranchMutationInputSchema;
export type GitBranchCreateInput = z.infer<typeof GitBranchCreateInputSchema>;
export type GitBranchSwitchInput = z.infer<typeof GitBranchSwitchInputSchema>;
export type GitBranchMergeInput = z.infer<typeof GitBranchMergeInputSchema>;
export type GitBranchDeleteInput = z.infer<typeof GitBranchDeleteInputSchema>;

const GitNetworkExistingWorkspaceInputSchema = z.object({ expectedSnapshotId: GitSnapshotIdSchema }).strict();
export const GitFetchInputSchema = GitNetworkExistingWorkspaceInputSchema;
export const GitSyncInputSchema = GitNetworkExistingWorkspaceInputSchema;
export const GitPushInputSchema = GitNetworkExistingWorkspaceInputSchema;
export type GitFetchInput = z.infer<typeof GitFetchInputSchema>;
export type GitSyncInput = z.infer<typeof GitSyncInputSchema>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;

export const GitCloneInputSchema = z.object({
  repositoryUrl: GitRemoteUrlSchema,
  destinationPath: z.string().min(1).max(32767),
  displayName: DisplayNameSchema,
}).strict();
export type GitCloneInput = z.infer<typeof GitCloneInputSchema>;
```

Define the safe snapshot and clone-result DTOs explicitly; the application snapshot in Task 6 must map 1:1 to this shape:

```ts
const GitAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().min(1).max(200).optional(),
}).strict();

export const DesktopGitSnapshotDtoSchema = z.object({
  workspace: z.object({ id: WorkspaceIdSchema, displayName: DisplayNameSchema }).strict(),
  snapshotId: GitSnapshotIdSchema,
  repository: z.enum(['not_repository', 'ready', 'unsupported']),
  repositoryState: z.enum(['normal', 'merge', 'rebase', 'cherry_pick', 'revert', 'bisect', 'conflict']),
  clean: z.boolean(),
  changedFiles: z.number().int().min(0).max(500),
  truncated: z.boolean(),
  currentBranch: GitBranchNameSchema.optional(),
  detached: z.boolean(),
  branches: z.array(z.object({
    name: GitBranchNameSchema,
    current: z.boolean(),
    checkedOutElsewhere: z.boolean(),
  }).strict()).max(500),
  defaultBranch: z.object({ state: z.enum(['known', 'unknown']), branch: GitBranchNameSchema.optional() }).strict(),
  primaryRemote: z.object({
    state: z.enum(['resolved', 'missing', 'ambiguous', 'unsupported']),
    name: GitRemoteNameSchema.optional(),
    safeRepository: z.string().min(1).max(512).optional(),
    transport: z.enum(['https', 'ssh']).optional(),
  }).strict(),
  upstreamBranch: GitBranchNameSchema.optional(),
  relation: z.enum(['unknown', 'up_to_date', 'local_ahead', 'remote_ahead', 'diverged', 'no_upstream', 'unavailable']),
  ahead: z.number().int().min(0).max(1_000_000).optional(),
  behind: z.number().int().min(0).max(1_000_000).optional(),
  authStatus: z.enum(['unknown', 'working', 'failed']),
  operations: z.object({
    initialize: GitAvailabilitySchema,
    configureRemote: GitAvailabilitySchema,
    createBranch: GitAvailabilitySchema,
    switchBranch: GitAvailabilitySchema,
    mergeBranch: GitAvailabilitySchema,
    deleteBranch: GitAvailabilitySchema,
    fetch: GitAvailabilitySchema,
    sync: GitAvailabilitySchema,
    push: GitAvailabilitySchema,
  }).strict(),
}).strict();
export type DesktopGitSnapshotDto = z.infer<typeof DesktopGitSnapshotDtoSchema>;

export const DesktopGitCloneResultDtoSchema = z.object({
  workspace: WorkspaceDtoSchema,
  snapshot: DesktopGitSnapshotDtoSchema,
}).strict();
export type DesktopGitCloneResultDto = z.infer<typeof DesktopGitCloneResultDtoSchema>;
```

Do not include raw configured remote URL, external worktree path, process information, or credentials.

- [ ] **Step 7: Add contract rejection tests for process-shaped input and raw secret surfaces**

Prove all Git schemas reject unknown keys such as:

```ts
{ expectedSnapshotId, executable: 'cmd.exe' }
{ expectedSnapshotId, argv: ['push', '--force'] }
{ expectedSnapshotId, cwd: 'C:\\' }
{ expectedSnapshotId, env: { PATH: 'attacker' } }
```

The generic URL schema only bounds string shape; trusted parsing in Task 3 must reject credential-bearing input such as `https://token@github.com/owner/repo.git`. No contract exposes a token/password/private-key field.

- [ ] **Step 8: Run focused tests to GREEN**

Run the same focused command from Step 2. Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add packages/domain/src/git.ts packages/domain/src/policy.ts packages/domain/src/result.ts packages/domain/src/index.ts packages/contracts/src/index.ts packages/application/src/approval-service.ts packages/tests/src/git-bootstrap-policy-contracts.test.ts packages/tests/src/basic-approval-security.test.ts
git commit -m "feat: define git workflow policy and contracts"
```

---

### Task 2: Persist only non-secret Primary Remote selection

**Files:**
- Create: `packages/infrastructure/src/workspace-git-settings-repository.ts`
- Modify: `packages/infrastructure/src/database.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Test: `packages/tests/src/git-bootstrap-settings.test.ts`

**Interfaces:**
- Produces `WorkspaceGitSettingsRepository` with `get(workspaceId)`, `setPrimaryRemote(workspaceId, remoteName)`, and `clearPrimaryRemote(workspaceId)`.
- SQLite stores only `workspace_id`, nullable `primary_remote_name`, and `updated_at`.

- [ ] **Step 1: Write RED migration/repository tests**

```ts
it('persists only the selected Primary Remote name per Workspace', () => {
  const repo = createWorkspaceGitSettingsRepository(db);
  expect(repo.get(workspace.id)).toBeUndefined();
  repo.setPrimaryRemote(workspace.id, 'upstream');
  expect(repo.get(workspace.id)).toMatchObject({ workspaceId: workspace.id, primaryRemoteName: 'upstream' });
});

it('stores no remote URL or credential columns', () => {
  const columns = db.prepare('PRAGMA table_info(workspace_git_settings)').all() as Array<{ name: string }>;
  expect(columns.map((c) => c.name)).toEqual(['workspace_id', 'primary_remote_name', 'updated_at']);
});
```

Also remove the Workspace and assert foreign-key cascade removes its Git settings row.

- [ ] **Step 2: Run focused test and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-settings.test.ts --reporter=verbose
```

- [ ] **Step 3: Add Migration 008**

Append exactly one migration after Approval Mode:

```sql
CREATE TABLE workspace_git_settings (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  primary_remote_name TEXT,
  updated_at TEXT NOT NULL
);
```

Do not add remote URL, token, SSH key path, auth status, branch guess, or Git config cache columns.

- [ ] **Step 4: Implement the small repository**

```ts
export interface WorkspaceGitSettings {
  readonly workspaceId: string;
  readonly primaryRemoteName?: string;
  readonly updatedAt: Date;
}

export interface WorkspaceGitSettingsRepository {
  get(workspaceId: string): WorkspaceGitSettings | undefined;
  setPrimaryRemote(workspaceId: string, remoteName: string): WorkspaceGitSettings;
  clearPrimaryRemote(workspaceId: string): void;
}
```

Use one UPSERT for `setPrimaryRemote`; validate the remote name in application/contracts before persistence, and keep repository SQL free of URLs/credentials.

- [ ] **Step 5: Export and run GREEN**

Export from `packages/infrastructure/src/index.ts`, then rerun the focused test. Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add packages/infrastructure/src/database.ts packages/infrastructure/src/workspace-git-settings-repository.ts packages/infrastructure/src/index.ts packages/tests/src/git-bootstrap-settings.test.ts
git commit -m "feat: persist primary git remote selection"
```

---

### Task 3: Add strict GitHub remote parsing and two trusted Git runner modes

**Files:**
- Create: `packages/infrastructure/src/git-github-remote.ts`
- Create: `packages/infrastructure/src/git-command-runner.ts`
- Modify: `packages/infrastructure/src/git-safety-adapter.ts`
- Test: `packages/tests/src/git-bootstrap-network.test.ts`
- Regression: `packages/tests/src/git-safety-read-integration.test.ts`
- Regression: `packages/tests/src/git-safety-checkpoint-state.test.ts`

**Interfaces:**
- Produces `GitHubRemoteIdentity` containing `transport`, `owner`, `repository`, `safeRepository`, and a canonical command-safe URL.
- Produces `GitCommandRunner` with `runLocal(cwd, args, options)` and `runGitHubNetwork(cwd, args, options)`; only infrastructure passes command args.
- `createGitSafetyAdapter({ commandRunner? })` accepts an internal test seam while defaulting to the trusted production runner.

- [ ] **Step 1: Write RED parser and runner-boundary tests**

Accepted examples:

```text
https://github.com/acme/widgets.git
https://github.com/acme/widgets
git@github.com:acme/widgets.git
ssh://git@github.com/acme/widgets.git
```

Rejected examples:

```text
https://token@github.com/acme/widgets.git
https://github.example/acme/widgets.git
https://github.com/acme/widgets.git?token=x
https://github.com/acme/widgets.git#fragment
ssh://root@github.com/acme/widgets.git
ssh://git@github.com:2222/acme/widgets.git
file:///C:/repo
```

Tests inject a spawn spy into the runner and prove local mode keeps current hermetic credential/config behavior while GitHub mode uses only host-owned allowlisted environment plus fixed noninteractive pager/prompt controls. Renderer/request data must never become env keys or Git config flags.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-network.test.ts packages/tests/src/git-safety-read-integration.test.ts packages/tests/src/git-safety-checkpoint-state.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement `parseGitHubRemote()`**

```ts
export interface GitHubRemoteIdentity {
  readonly transport: GitRemoteTransport;
  readonly owner: string;
  readonly repository: string;
  readonly safeRepository: string;
  readonly canonicalUrl: string;
}

export function parseGitHubRemote(raw: string): Result<GitHubRemoteIdentity, AppError>;
```

Rules: host exactly `github.com`; HTTPS has no username/password/query/fragment; SSH user exactly `git`, port absent or 22; path exactly owner/repository with optional `.git`; owner/repository bounded and reject controls, empty segments, `.`/`..`, slash/backslash injection. Failure returns `GIT_REMOTE_UNSUPPORTED` without echoing raw input.

- [ ] **Step 4: Extract trusted Git execution into `git-command-runner.ts`**

Move the trusted Git executable resolver/process wrapper without changing existing local behavior:

```ts
export interface GitRunOptions {
  readonly input?: Buffer;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
}

export interface GitCommandResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly status: number;
  readonly overflowed: boolean;
}

export interface GitCommandRunner {
  runLocal(cwd: string, args: readonly string[], options?: GitRunOptions): Result<GitCommandResult, AppError>;
  runGitHubNetwork(cwd: string, args: readonly string[], options?: GitRunOptions): Result<GitCommandResult, AppError>;
}
```

Both modes use trusted `git.exe`, `shell:false`, hidden windows, fixed timeout/output bounds, disabled hooks, no pager, and no request-supplied env/config. Local mode disables credentials/global config as today. GitHub mode permits only machine-owned Git/GCM/SSH discovery needed by the approved operation and sets `GIT_TERMINAL_PROMPT=0` so Electron never waits on a terminal prompt.

- [ ] **Step 5: Rewire existing GitSafetyAdapter to `runLocal()` with no behavior change**

```ts
export function createGitSafetyAdapter(
  options: { readonly commandRunner?: GitCommandRunner } = {},
): GitSafetyAdapter {
  const commandRunner = options.commandRunner ?? createGitCommandRunner();
  // Existing semantic methods call commandRunner.runLocal().
}
```

Existing detect/status/diff/checkpoint/commit/diffCheck/secretScan remain local-hermetic.

- [ ] **Step 6: Run focused regressions to GREEN**

Run Step 2 command. Existing Git Safety regressions and new parser/runner tests must PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add packages/infrastructure/src/git-github-remote.ts packages/infrastructure/src/git-command-runner.ts packages/infrastructure/src/git-safety-adapter.ts packages/tests/src/git-bootstrap-network.test.ts
git commit -m "feat: add trusted github git runtime"
```

---

### Task 4: Deepen GitSafetyAdapter with local repository, remote, and branch workflow

**Files:**
- Modify: `packages/infrastructure/src/git-safety-adapter.ts`
- Modify: `packages/infrastructure/src/index.ts` only for semantic result types application needs.
- Test: `packages/tests/src/git-bootstrap-local-workflow.test.ts`
- Regression: `packages/tests/src/git-safety-linked-worktree.test.ts`

**Interfaces:**

```ts
export interface GitRemoteSummary {
  readonly name: string;
  readonly supported: boolean;
  readonly safeRepository?: string;
  readonly transport?: GitRemoteTransport;
}

export interface GitRelationResult {
  readonly kind: GitRemoteRelation;
  readonly ahead?: number;
  readonly behind?: number;
  readonly upstreamBranch?: string;
}

export interface GitBranchMutationResult {
  readonly headSha: string;
  readonly branch: string;
  readonly changed: boolean;
}

export interface GitMergeResult extends GitBranchMutationResult {
  readonly mode: 'already_merged' | 'fast_forward' | 'merge_commit';
}

inspectWorkspaceGit(root: string): Result<GitWorkspaceInspection, AppError>;
initialize(root: string): Result<GitWorkspaceInspection, AppError>;
configureRemote(root: string, input: { name: string; url: string }): Result<GitRemoteSummary, AppError>;
resolveDefaultBranch(root: string, remoteName: string): Result<string | undefined, AppError>;
relation(root: string, remoteName: string, branchName: string): Result<GitRelationResult, AppError>;
createBranch(root: string, expectedStatusId: string, branchName: string): Result<GitBranchMutationResult, AppError>;
switchBranch(root: string, expectedStatusId: string, branchName: string): Result<GitBranchMutationResult, AppError>;
mergeBranch(root: string, expectedStatusId: string, sourceBranch: string): Result<GitMergeResult, AppError>;
deleteBranch(root: string, expectedStatusId: string, branchName: string, defaultBranch: string): Result<GitBranchMutationResult, AppError>;
```

- [ ] **Step 1: Write RED local workflow tests**

Cover non-repo init without implicit commit/remote/rename/push; bounded branch/remote inspection; ref-name validation; create on clean normal repo; switch blocks staged/unstaged/untracked dirt; contained/fast-forward/clean merge-commit behavior; conflict preflight leaves no merge state/index mutation; safe delete blocks current/default/unmerged; non-main/non-master default branch; linked-worktree occupancy returns `GIT_BRANCH_IN_USE` without path leakage.

- [ ] **Step 2: Run focused test and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-local-workflow.test.ts packages/tests/src/git-safety-linked-worktree.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement bounded repository inspection**

```ts
interface GitWorkspaceInspection {
  readonly detect: GitDetectResult;
  readonly status?: GitStatusResult;
  readonly branches: readonly { name: string; current: boolean; checkedOutElsewhere: boolean }[];
  readonly remotes: readonly { name: string; supported: boolean; safeRepository?: string; transport?: GitRemoteTransport }[];
  readonly trackingRemote?: string;
  readonly upstreamBranch?: string;
}
```

Parse `git worktree list --porcelain` internally but return only branch occupancy facts, never paths.

- [ ] **Step 4: Implement fixed-purpose init and remote config**

`initialize()` runs only `git init` at the exact approved Workspace root and verifies repository root equals it. `configureRemote()` parses GitHub URL before `git remote add`/`git remote set-url`.

- [ ] **Step 5: Implement create/switch clean-tree guards**

```ts
const before = readStatus(root, GIT_SAFETY_LIMITS.maxStatusEntries);
if (!before.ok) return before;
if (before.value.statusId !== expectedStatusId) return err(appError('GIT_STATUS_STALE', 'Git status changed'));
if (!before.value.clean) return err(appError('GIT_WORKTREE_DIRTY', 'Commit or remove local changes before this action'));
if (before.value.state !== 'normal') return err(appError('GIT_STATE_UNSAFE', 'Git repository state is not safe for this action'));
```

Create uses `git branch <validated-name>`; switch uses `git switch <validated-name>` and blocks another-worktree occupancy.

- [ ] **Step 6: Implement merge with non-mutating conflict preflight**

Algorithm: require fresh clean normal attached state; source already contained → no-op; current ancestor of source → `merge --ff-only`; otherwise `merge-tree --write-tree HEAD <source>` preflight; conflict/unsupported/inconclusive → `GIT_OPERATION_CONFLICT` without mutation; clean preflight → `merge --no-edit --no-ff <source>`; verify final normal state/HEAD.

- [ ] **Step 7: Implement safe local delete**

Require target not current/default, known default branch, target not occupied elsewhere, target tip ancestor of resolved default; then run only `git branch -d <target>`. Never fall back to `-D` or direct ref deletion.

- [ ] **Step 8: Run focused tests to GREEN**

Run Step 2 command. Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add packages/infrastructure/src/git-safety-adapter.ts packages/infrastructure/src/index.ts packages/tests/src/git-bootstrap-local-workflow.test.ts packages/tests/src/git-safety-linked-worktree.test.ts
git commit -m "feat: add bounded local git workflow"
```

---

### Task 5: Add GitHub fetch, Sync, Push, SHA verification, and clone to the adapter

**Files:**
- Modify: `packages/infrastructure/src/git-safety-adapter.ts`
- Test: `packages/tests/src/git-bootstrap-network.test.ts`
- Test: `packages/tests/src/git-bootstrap-integration.test.ts`

**Interfaces:**

```ts
export interface GitNetworkMutationInput {
  readonly expectedStatusId: string;
  readonly remoteName: string;
  readonly branchName: string;
  readonly upstreamBranch?: string;
}

export interface GitFetchResult {
  readonly remoteName: string;
  readonly defaultBranch?: string;
}

export interface GitSyncResult {
  readonly relation: GitRemoteRelation;
  readonly changed: boolean;
  readonly headSha: string;
}

export interface GitPushResult {
  readonly headSha: string;
  readonly remoteSha: string;
  readonly upstreamSet: boolean;
}

export interface GitCloneResult {
  readonly destinationPath: string;
  readonly headSha: string;
  readonly branch?: string;
}

fetchRemote(root: string, remoteName: string): Result<GitFetchResult, AppError>;
syncFromGitHub(root: string, input: GitNetworkMutationInput): Result<GitSyncResult, AppError>;
pushToGitHub(root: string, input: GitNetworkMutationInput): Result<GitPushResult, AppError>;
cloneFromGitHub(input: { remoteUrl: string; destinationPath: string }): Result<GitCloneResult, AppError>;
```

The application resolves semantic remote/branch values, but the adapter re-reads Git state immediately before mutation.

- [ ] **Step 1: Build deterministic test network port and write RED relation cases**

The test double maps an already-validated canonical GitHub identity to a local bare repository under the temp root; production never performs this mapping. Cover `up_to_date`, `local_ahead`, `remote_ahead`, `diverged`, and `no_upstream`.

- [ ] **Step 2: Add RED Sync safety tests**

Prove dirty tree stops before fetch/mutation; validation precedes network; up-to-date no-op; remote-ahead fast-forward only; local-ahead no mutation/guidance to Push; diverged stop; no-upstream stop; state race after fetch stops safely.

- [ ] **Step 3: Add RED Push safety tests**

Prove dirty tree stop; existing-upstream local-ahead normal push; remote-ahead/diverged stop; first push sets upstream only when safe; no force flags; remote SHA verification; no auto-commit.

- [ ] **Step 4: Add RED clone tests**

Adapter-level clone tests cover GitHub remote validation, `--no-recurse-submodules`, fixed hooks/process controls, and post-clone repository verification. Destination containment/non-empty policy remains application responsibility in Task 6.

- [ ] **Step 5: Run focused tests and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-network.test.ts packages/tests/src/git-bootstrap-integration.test.ts --reporter=verbose
```

- [ ] **Step 6: Implement fetch + default-branch refresh**

Use `runGitHubNetwork()` with fixed args. After successful fetch, resolve remote default branch from trusted remote symref information; when matching fetched ref exists, update only local `refs/remotes/<remote>/HEAD` so later local snapshots can resolve it without guessing.

- [ ] **Step 7: Implement relation classification by ancestry**

```text
local == remote              => up_to_date
remote ancestor of local     => local_ahead
local ancestor of remote     => remote_ahead
neither                       => diverged
missing tracking branch      => no_upstream
parse/state failure           => unavailable/error
```

- [ ] **Step 8: Implement Sync**

```ts
switch (relation.kind) {
  case 'up_to_date':
    return ok({ relation: relation.kind, changed: false, headSha: before.value.headSha });
  case 'remote_ahead':
    return fastForwardFromFetchedUpstream(root, input.upstreamBranch!, before.value.statusId);
  case 'local_ahead':
    return ok({ relation: relation.kind, changed: false, headSha: before.value.headSha });
  case 'diverged':
    return err(appError('GIT_DIVERGED', 'Local and GitHub history diverged'));
  case 'no_upstream':
    return err(appError('GIT_UPSTREAM_MISSING', 'Current branch has no upstream'));
  default:
    return err(appError('GIT_STATE_UNSAFE', 'GitHub relation is unavailable'));
}
```

Define the private helper in the same adapter module:

```ts
function fastForwardFromFetchedUpstream(
  root: string,
  upstreamBranch: string,
  expectedStatusId: string,
): Result<GitSyncResult, AppError>;
```

Its implementation rechecks `expectedStatusId`, runs fixed `git merge --ff-only <upstreamBranch>`, then verifies clean/normal state and returns the new HEAD.

- [ ] **Step 9: Implement Push + remote SHA verification**

For existing upstream, only equal/local-ahead may proceed. For first push, inspect same-named remote branch after fetch; only absent/equal/local-ahead is safe. Normal push only; then `ls-remote --heads <remote> refs/heads/<branch>` through the same authorized network runner and compare SHA to local HEAD.

- [ ] **Step 10: Normalize auth/network failures safely**

Inspect bounded stderr internally only to classify `GIT_AUTH_FAILED` vs `GIT_REMOTE_UNREACHABLE`; returned messages/metadata contain safe remote name/`owner/repo` only, never stderr.

- [ ] **Step 11: Implement clone**

Use only parsed canonical GitHub URL and prevalidated destination:

```text
git clone --no-recurse-submodules <canonical-url> <destination>
```

Run via network mode with hooks disabled; verify supported non-bare repository; do not initialize submodules.

- [ ] **Step 12: Run focused tests to GREEN and commit**

Run Step 5 command, then:

```bash
git add packages/infrastructure/src/git-safety-adapter.ts packages/tests/src/git-bootstrap-network.test.ts packages/tests/src/git-bootstrap-integration.test.ts
git commit -m "feat: add safe github sync and push"
```

---

### Task 6: Add GitWorkspaceService for Primary Remote, default branch, freshness, and clone bootstrap

**Files:**
- Create: `packages/application/src/git-workspace-service.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/tests/src/git-bootstrap-service.test.ts`

**Interfaces:**

The application snapshot uses the same safe vocabulary as the Desktop DTO and never carries raw remote URLs/worktree paths:

```ts
export interface GitOperationAvailability {
  readonly available: boolean;
  readonly reason?: string;
}

export interface GitWorkspaceSnapshot {
  readonly workspace: { readonly id: string; readonly displayName: string };
  readonly snapshotId: string;
  readonly repository: 'not_repository' | 'ready' | 'unsupported';
  readonly repositoryState: GitRepositoryState;
  readonly clean: boolean;
  readonly changedFiles: number;
  readonly truncated: boolean;
  readonly currentBranch?: string;
  readonly detached: boolean;
  readonly branches: readonly { readonly name: string; readonly current: boolean; readonly checkedOutElsewhere: boolean }[];
  readonly defaultBranch: { readonly state: GitDefaultBranchState; readonly branch?: string };
  readonly primaryRemote: {
    readonly state: GitPrimaryRemoteState;
    readonly name?: string;
    readonly safeRepository?: string;
    readonly transport?: GitRemoteTransport;
  };
  readonly upstreamBranch?: string;
  readonly relation: GitRemoteRelation;
  readonly ahead?: number;
  readonly behind?: number;
  readonly authStatus: GitAuthStatus;
  readonly operations: Readonly<Record<'initialize'|'configureRemote'|'createBranch'|'switchBranch'|'mergeBranch'|'deleteBranch'|'fetch'|'sync'|'push', GitOperationAvailability>>;
}

export interface GitExpectedSnapshotCommand {
  readonly expectedSnapshotId: string;
}

export interface GitConfigureRemoteCommand extends GitExpectedSnapshotCommand {
  readonly remoteName: string;
  readonly remoteUrl: string;
}

export interface GitSelectPrimaryRemoteCommand extends GitExpectedSnapshotCommand {
  readonly remoteName: string;
}

export interface GitBranchCommand extends GitExpectedSnapshotCommand {
  readonly branchName: string;
}

export interface GitCloneCommand {
  readonly repositoryUrl: string;
  readonly destinationPath: string;
  readonly displayName: string;
}

export interface GitWorkspaceService {
  snapshot(): Result<GitWorkspaceSnapshot, AppError>;
  initialize(expectedSnapshotId: string): Result<GitWorkspaceSnapshot, AppError>;
  configureRemote(input: GitConfigureRemoteCommand): Result<GitWorkspaceSnapshot, AppError>;
  selectPrimaryRemote(input: GitSelectPrimaryRemoteCommand): Result<GitWorkspaceSnapshot, AppError>;
  createBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  switchBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  mergeBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  deleteBranch(input: GitBranchCommand): Result<GitWorkspaceSnapshot, AppError>;
  fetch(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  sync(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  push(input: GitExpectedSnapshotCommand): Result<GitWorkspaceSnapshot, AppError>;
  clone(input: GitCloneCommand): Result<{ workspace: Workspace; snapshot: GitWorkspaceSnapshot }, AppError>;
  resolveNetworkSecurity(operation: 'fetch'|'sync'|'push'|'clone', input: unknown): Result<ResolvedToolSecurityContext, AppError>;
  networkApprovalBinding(operation: 'fetch'|'sync'|'push'|'clone', input: unknown): Result<ApprovalBindingValue, AppError>;
}
```

- [ ] **Step 1: Write RED Primary Remote resolution tests**

Exact order: current branch tracking remote if it exists; persisted Primary Remote if still configured; sole configured remote; otherwise missing/ambiguous. Persisted stale selection never silently wins.

- [ ] **Step 2: Write RED default branch and snapshot-token tests**

Prove default can be `trunk`/another trusted name; unknown stays unknown; safe delete unavailable if unknown; `snapshotId` changes with HEAD/status/current branch/remotes/tracking/persisted Primary Remote; every mutation rejects stale snapshot.

- [ ] **Step 3: Write RED clone destination tests**

Cover absolute local drive; UNC/device denial; InternalRoot denial; existing non-directory/non-empty denial; existing empty allowed; non-existing destination requires safe canonical existing parent; reparse/symlink escape denial; registered Workspace conflict; clone success registers/selects Workspace; registration failure reports partial result without deleting clone.

- [ ] **Step 4: Run focused service test and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-service.test.ts --reporter=verbose
```

- [ ] **Step 5: Implement snapshot aggregation and Primary Remote resolution**

Return one bounded application `GitWorkspaceSnapshot` matching the safe Desktop facts and fixed operation availability/reasons. Raw URL/worktree paths are dropped before return.

- [ ] **Step 6: Compute deterministic `snapshotId`**

```ts
const snapshotId = createHash('sha256').update(stableJson({
  workspaceId,
  statusId,
  currentBranch,
  defaultBranch,
  primaryRemoteName,
  trackingRemote,
  remotes: remotes.map(({ name, supported, safeRepository, transport }) => ({ name, supported, safeRepository, transport })),
  branches: branches.map(({ name, current, checkedOutElsewhere }) => ({ name, current, checkedOutElsewhere })),
})).digest('hex');
```

Do not include credentials/raw URLs/raw paths.

- [ ] **Step 7: Implement mutation freshness helper**

```ts
function requireFreshSnapshot(expectedSnapshotId: string): Result<GitWorkspaceSnapshot, AppError> {
  const current = snapshot();
  if (!current.ok) return current;
  return current.value.snapshotId === expectedSnapshotId
    ? current
    : err(appError('GIT_STATUS_STALE', 'Git state changed; refresh before retrying'));
}
```

Every local/network action except clone uses this before mutation; adapter retains lower-level revalidation.

- [ ] **Step 8: Implement clone bootstrap validation + registration**

Validate destination before network security resolution. `resolveNetworkSecurity('clone', input)` returns only safe normalized GitHub identity/transport/destination label and `context:'github_network'`.

After adapter clone succeeds:

```ts
const added = workspaceService.add(input.displayName, input.destinationPath);
if (!added.ok) {
  return err(appError('WORKSPACE_INVALID', 'Repository cloned but Workspace registration failed', { cloned: true }));
}
const selected = workspaceService.select(added.value.id);
```

Never delete cloned data on registration failure.

- [ ] **Step 9: Run service tests to GREEN and commit**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-service.test.ts --reporter=verbose
```

```bash
git add packages/application/src/git-workspace-service.ts packages/application/src/index.ts packages/tests/src/git-bootstrap-service.test.ts
git commit -m "feat: orchestrate git workspace state"
```

---

### Task 7: Add shared Tool Kernel Git workflow capabilities and production MCP exposure

**Files:**
- Create: `packages/application/src/git-workflow-capabilities.ts`
- Modify: `packages/application/src/git-safety-capabilities.ts`
- Modify: `packages/application/src/work-resume-guard.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Modify: `packages/tests/src/git-safety-test-harness.ts`
- Modify: `packages/tests/src/basic-approval-production.test.ts`
- Modify: `packages/tests/src/work-resume-guard.test.ts`
- Test: `packages/tests/src/git-bootstrap-security.test.ts`

**Interfaces:**

```ts
export const GIT_WORKFLOW_CAPABILITY_NAMES = Object.freeze([
  'git.inspect',
  'git.init',
  'git.remote.configure',
  'git.remote.select',
  'git.branch.create',
  'git.branch.switch',
  'git.branch.merge',
  'git.branch.delete',
  'git.fetch',
  'git.sync',
  'git.push',
  'git.clone',
] as const);
export type GitWorkflowCapabilityName = (typeof GIT_WORKFLOW_CAPABILITY_NAMES)[number];

export interface GitCapabilityDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly gitSafety: GitSafetyAdapter;
  readonly gitWorkspace: GitWorkspaceService;
}
```

`git.inspect` carries bounded branch/remote inspection so separate shallow list tools are unnecessary.

- [ ] **Step 1: Write RED capability validation/security tests**

Prove strict inputs; local actions resolve `workspace`; GitHub actions resolve `github_network` only after trusted validation; non-GitHub fails before Approval; branch delete uses `effect:'delete'` and remains manual ASK in every mode; existing five Git Safety capabilities remain present.

- [ ] **Step 2: Write RED Approval binding/audit tests**

Bindings are safe only:

```ts
{ operation: 'sync', expectedSnapshotId, remoteName, safeRepository, transport }
{ operation: 'clone', safeRepository, transport, destinationLabel }
```

Prove Standard => Approval Required; automatic modes execute eligible actions; Policy DENY still blocks; pre/outcome audit contains safe metadata only.

Also add Work Resume guard cases in `work-resume-guard.test.ts`: for each of `git.inspect`, `git.init`, `git.remote.configure`, `git.remote.select`, `git.branch.create`, `git.branch.switch`, `git.branch.merge`, `git.branch.delete`, `git.fetch`, `git.sync`, and `git.push`, construct one active Workspace with an unresumed session and assert `WORK_RESUME_REQUIRED` before the inner kernel executes. Add a separate `git.clone` case with no active Workspace and assert the guard forwards to the inner Tool Kernel; clone then remains subject to its own strict validation, `github_network` Policy, Approval, and destination checks.

`git.clone` is the only new Git workflow capability excluded from `RESUME_GUARDED_CAPABILITIES`; all active-Workspace Git workflow capabilities are added to that set.

- [ ] **Step 3: Run focused security tests and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-security.test.ts packages/tests/src/basic-approval-security.test.ts packages/tests/src/basic-approval-production.test.ts packages/tests/src/work-resume-guard.test.ts --reporter=verbose
```

- [ ] **Step 4: Implement `createGitWorkflowCapabilities()`**

Each capability strict-validates semantic input, resolves trusted security, binds safe Approval metadata for ASK, calls `GitWorkspaceService`, and never accepts generic process/capability input.

Effects: inspect=read; init=create; remote configure/select=modify; branch create=create; switch/merge=modify; delete=delete; fetch=read but `github_network`; sync/push=modify but `github_network`; clone=create but `github_network`.

- [ ] **Step 5: Preserve and compose existing Git Safety capabilities**

```ts
export function createAllGitCapabilities(deps: GitCapabilityDependencies): readonly RegisteredToolCapability[] {
  return Object.freeze([
    ...createGitSafetyCapabilities({ workspaceRepo: deps.workspaceRepo, gitSafety: deps.gitSafety }),
    ...createGitWorkflowCapabilities(deps),
  ]);
}
```

No existing capability is renamed or removed.

- [ ] **Step 6: Register new fixed-purpose tools in production MCP**

Extend production composition and Git tool registration with strict Zod schemas matching application validators. Update exact tool-list test constants to the new approved list; no generic shell/network tool.

- [ ] **Step 7: Run security + production tests to GREEN and commit**

Run Step 3 command, then:

```bash
git add packages/application/src/git-workflow-capabilities.ts packages/application/src/git-safety-capabilities.ts packages/application/src/work-resume-guard.ts packages/application/src/index.ts packages/mcp-gateway/src/workspace-file-server.ts packages/tests/src/git-safety-test-harness.ts packages/tests/src/git-bootstrap-security.test.ts packages/tests/src/basic-approval-production.test.ts packages/tests/src/basic-approval-security.test.ts packages/tests/src/work-resume-guard.test.ts
git commit -m "feat: expose bounded git workflow capabilities"
```

---

### Task 8: Add fixed-purpose Desktop Git controller, IPC, and preload surface

**Files:**
- Create: `packages/desktop/electron/git-controller.ts`
- Create: `packages/desktop/electron/git-ipc.ts`
- Modify: `packages/desktop/electron/main.ts`
- Modify: `packages/desktop/electron/preload.ts`
- Modify: `packages/desktop/src/global.d.ts`
- Test: `packages/tests/src/git-bootstrap-desktop.test.ts`

**Interfaces:**
- Desktop creates a dedicated Git Tool Kernel from the same `createAllGitCapabilities()` definitions and a persistent `{ id: 'desktop-git', type: 'desktop' }` session.
- Controller exposes fixed methods only; renderer never supplies a capability name.

```ts
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
```

- [ ] **Step 1: Write RED Desktop IPC tests**

Cover invalid sender; strict unknown/process-shaped rejection; preload fixed methods only; no generic execute/invoke/run/argv/cwd/env/capability method; Approval Required exposes only safe approval id/expiry metadata; controller errors exclude raw stdout/stderr.

- [ ] **Step 2: Run focused Desktop test and confirm RED**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-desktop.test.ts --reporter=verbose
```

- [ ] **Step 3: Create Desktop Git Tool Kernel in `main.ts`**

Reuse `workspaceRepo`, `auditRepo`, `approvalRepo`, `approvalModeRepo`, `workspaceService`, `internalRoots`, `gitSafety`, and Git settings repo. Create a Desktop approval coordinator bound to current Approval Mode, then build registry/kernel from shared Git capabilities. IPC never calls adapter directly.

- [ ] **Step 4: Implement controller fixed-method dispatch**

```ts
const invoke = async <T>(capability: GitWorkflowCapabilityName, input: unknown): Promise<IpcResult<T>> => {
  const result = await kernel.invoke({
    invocationId: `desktop-git-${randomUUID()}`,
    session: DESKTOP_GIT_SESSION,
    capability,
    input,
  });
  return toDesktopGitIpcResult<T>(result);
};
```

Keep this helper private. Map `APPROVAL_REQUIRED` to safe IPC error metadata with approval id/expiry; map execution failures to cause code + safe message only.

- [ ] **Step 5: Implement sender-validated IPC handlers**

Follow existing approval/overview patterns: validate sender, strict schema, corresponding fixed controller method.

- [ ] **Step 6: Add narrow preload/global types**

Expose `window.sudD.git` with only snapshot/init/configure/select/create/switch/merge/delete/fetch/sync/push/clone.

- [ ] **Step 7: Run Desktop tests to GREEN and commit**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-desktop.test.ts --reporter=verbose
```

```bash
git add packages/desktop/electron/git-controller.ts packages/desktop/electron/git-ipc.ts packages/desktop/electron/main.ts packages/desktop/electron/preload.ts packages/desktop/src/global.d.ts packages/tests/src/git-bootstrap-desktop.test.ts
git commit -m "feat: add bounded desktop git bridge"
```

---

### Task 9: Add the Git page and truthful Approval/error UX

**Files:**
- Create: `packages/desktop/src/pages/GitPage.tsx`
- Modify: `packages/desktop/src/App.tsx`
- Modify: `packages/desktop/src/ui-icons.tsx`
- Modify: `packages/desktop/src/index.css`
- Modify/Test: `packages/tests/src/git-bootstrap-desktop.test.ts`

**Interfaces:**
- `GitPage` receives `onNavigate: (page: AppPage) => void` so Standard-mode Approval Required can route to Activity.
- UI calls only `window.sudD.git.*` and `window.sudD.dialog.openDirectory()`.
- Page never polls/fetches GitHub automatically. Local `snapshot()` may refresh at guarded 5-second intervals; network changes require explicit user action.

- [ ] **Step 1: Add RED source/ownership UI tests**

Assert Git nav after Workspaces; Git line icon; fixed bridge only; no raw IPC/process authority; Approval Required route to Activity; automatic-mode success has no invented confirmation; non-repo Initialize + Clone; exact relation copy (`Up to date`, `Local commits ready to push`, `Remote commits available`, `Diverged — manual resolution required`).

- [ ] **Step 2: Run focused Desktop test and confirm RED**

Use Task 8 focused command.

- [ ] **Step 3: Add Git navigation and icon**

```ts
export type AppPage =
  | 'overview'
  | 'workspaces'
  | 'git'
  | 'connection'
  | 'activity'
  | 'team'
  | 'security'
  | 'recovery'
  | 'environment';
```

Place `{ id: 'git', icon: 'git', label: 'Git' }` immediately after Workspaces and render `<GitPage onNavigate={setPage} />`.

- [ ] **Step 4: Implement state-first GitPage**

```text
Git
├─ Repository card: repository/clean/current/default/Primary Remote/safe repo/transport/upstream/relation/local Refresh
├─ Branches card: Create / Switch / Merge / Safe delete
└─ Remote Sync card: Sync from GitHub / Push to GitHub
```

Non-repository state shows Initialize Git + Clone from GitHub. Missing/ambiguous Primary Remote shows configuration/select controls and disables network actions.

- [ ] **Step 5: Add guarded local snapshot refresh**

Use ref-based in-flight guard and 5-second local `snapshot()` polling. Never auto-call fetch/sync/push.

- [ ] **Step 6: Implement fixed mutation + stale behavior**

Every action uses displayed `snapshotId`. On `GIT_STATUS_STALE`, refresh snapshot and show “Git state changed. Review the refreshed state before retrying.” Never auto-retry mutation.

- [ ] **Step 7: Implement Standard vs automatic Approval UX**

```tsx
<div role="alert" className="git-action-message git-action-warning">
  <span>Approval required before this GitHub action can run.</span>
  <button className="btn btn-ghost" onClick={() => onNavigate('activity')}>
    Review approval
  </button>
</div>
```

After user decision, the user manually retries the Git action. Automatic eligible requests return normal result state without a second approval UI. Policy DENY/unsafe/unsupported state stays blocked before either path.

- [ ] **Step 8: Implement clone form without credential fields**

Fields: GitHub repository URL, display name, destination path + Browse. No username/password/token/private-key path. Browse uses native directory dialog and trusted code revalidates.

- [ ] **Step 9: Add Operate-mode responsive CSS**

Reuse current cards/tokens, restrained SUD-D blue, semantic text+color, visible focus, practical targets, and one-column reflow before clipping.

- [ ] **Step 10: Run focused Desktop tests + typecheck/build for UI boundary**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-desktop.test.ts --reporter=verbose
corepack pnpm typecheck
corepack pnpm build
```

Do not run full suite yet.

- [ ] **Step 11: Run Impeccable detector exactly once on stable changed UI**

```powershell
node .agents/skills/impeccable/scripts/detect.mjs --json packages/desktop/src/pages/GitPage.tsx packages/desktop/src/App.tsx packages/desktop/src/ui-icons.tsx packages/desktop/src/index.css
```

Apply only in-scope blocking findings in one batch. If UI source changes, rerun affected focused Desktop/typecheck/build evidence; do not rerun detector unless its output was inconclusive.

- [ ] **Step 12: Commit Task 9**

```bash
git add packages/desktop/src/pages/GitPage.tsx packages/desktop/src/App.tsx packages/desktop/src/ui-icons.tsx packages/desktop/src/index.css packages/tests/src/git-bootstrap-desktop.test.ts
git commit -m "feat: add git workspace page"
```

---

### Task 10: Complete deterministic integration/security regressions before broad gates

**Files:**
- Modify: `packages/tests/src/git-bootstrap-integration.test.ts`
- Modify: `packages/tests/src/git-bootstrap-security.test.ts`
- Modify: `packages/tests/src/git-safety-linked-worktree.test.ts` only for newly affected workflow cases.
- Modify: `packages/tests/src/basic-approval-security.test.ts` only if Task 7 did not already cover every mode/hard-boundary case.

**Interfaces:**
- No new production interface. This task proves the approved workflow through existing public/trusted seams.

- [ ] **Step 1: Add two-device deterministic integration scenario**

Using two Workspace directories and one local bare repository behind the test-only GitHub network port:

```text
Home fixture → create feature branch → commit → Push
Work fixture → Sync → work/commit → Push
Home fixture → Sync
```

Assert final tree/HEAD equality, upstream establishment, clean trees, and absence of force/rebase/reset/stash behavior.

- [ ] **Step 2: Add divergence/conflict STOP scenario**

Create independent Home/Work commits from same base, push one side, then prove the other returns `GIT_DIVERGED` preserving local HEAD/index/worktree.

- [ ] **Step 3: Add linked-worktree workflow regression**

Prove inspect/status/diff/commit continue on supported linked Workspace and switch/delete blocks another worktree's checked-out branch without leaking its path.

- [ ] **Step 4: Add secret/authority regression assertions**

Across DTOs/errors/audit/approval bindings/settings DB assert absence of credential-bearing URL, token/password/private-key sentinel, raw stderr, raw argv/cwd/env, and external linked-worktree path. Also prove renderer Git surface has no executable/argv/cwd/env/capability method.

- [ ] **Step 5: Run the complete focused Git milestone set**

```powershell
corepack pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/git-bootstrap-policy-contracts.test.ts packages/tests/src/git-bootstrap-settings.test.ts packages/tests/src/git-bootstrap-local-workflow.test.ts packages/tests/src/git-bootstrap-network.test.ts packages/tests/src/git-bootstrap-service.test.ts packages/tests/src/git-bootstrap-security.test.ts packages/tests/src/git-bootstrap-desktop.test.ts packages/tests/src/git-bootstrap-integration.test.ts packages/tests/src/git-safety-read-integration.test.ts packages/tests/src/git-safety-checkpoint-guards.test.ts packages/tests/src/git-safety-checkpoint-state.test.ts packages/tests/src/git-safety-hardening-audit.test.ts packages/tests/src/git-safety-linked-worktree.test.ts packages/tests/src/basic-approval-security.test.ts packages/tests/src/basic-approval-production.test.ts --reporter=verbose
```

Expected: 0 failures.

- [ ] **Step 6: Commit Task 10**

```bash
git add packages/tests/src/git-bootstrap-integration.test.ts packages/tests/src/git-bootstrap-security.test.ts packages/tests/src/git-safety-linked-worktree.test.ts packages/tests/src/basic-approval-security.test.ts
git commit -m "test: prove git workflow safety boundaries"
```

---

### Task 11: Final-once Security/Data Critical gates, review, production smoke, and handoff

**Files:**
- Modify: `SUD_D_HANDOFF.md` only after implementation/review/smoke evidence is stable.
- Local-only: `.serena/reports/git-bootstrap-branch-remote-sync-final.md`
- Local-only: `.serena/reports/git-bootstrap-production-smoke.mjs`
- Local-only screenshots under `.serena/reports/`

**Interfaces:**
- No new product interface. This task closes evidence and stops before any next milestone.

- [ ] **Step 1: Run final lint and typecheck once**

```powershell
corepack pnpm lint
corepack pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 2: Run full suite once**

```powershell
corepack pnpm test
```

Expected: 0 failures. Real failures enter the repository Continuous Repair Loop; focused proof first, then resume only invalidated gates.

- [ ] **Step 3: Run production build and whitespace gate once**

```powershell
corepack pnpm build
git diff --check
```

Expected: exit 0.

- [ ] **Step 4: Perform Standards review and Spec review separately**

Load `.agents/skills/code-review/SKILL.md`. Fixed point is implementation-task start commit. Standards: `AGENTS.md` + security invariants. Spec: approved design + this plan.

Blocking review topics: no renderer generic authority; generic Network DENY; exact `github_network` Approval modes; credential secrecy; no hard-coded remote/default branch; dirty/stale/diverged/conflict stops; no force/stash/rebase/reset; clone containment; linked-worktree compatibility; existing Git Safety behavior.

- [ ] **Step 5: Run one isolated production Electron smoke**

Local-only harness launches production build with isolated data root. Verify Git nav/page/no horizontal overflow; truthful active Workspace state; real Initialize through renderer→preload→IPC→Tool Kernel→adapter; branch create/switch/merge/safe-delete; Standard Approval Required route; automatic eligible Approval Mode path; unsupported/Policy-denied remote blocked; no raw credentials/process fields in rendered/safe capture.

If real GitHub credentials are unavailable in automated smoke, keep network smoke deterministic/local and reserve real GitHub proof for Product Owner acceptance.

- [ ] **Step 6: Product Owner real GitHub acceptance**

Present verified build for one bounded real repository:

```text
primary validation device → work/commit → Push to GitHub
secondary validation device → Sync from GitHub → work/commit → Push to GitHub
primary validation device → Sync from GitHub
```

Also confirm one Standard manual Approval path and one eligible automatic Approval Mode path. Manual acceptance supplements mandatory automated proof.

- [ ] **Step 7: Update Handoff with final truthful state**

Record implementation branch/base/commits, focused/final evidence, review verdicts, smoke, owner acceptance, non-blocking issues, `.serena/` local-only, preserved user state, and explicit STOP before next milestone/master integration. Link spec + plan instead of duplicating them.

- [ ] **Step 8: Final scope/secret/staged inspection and feature-branch push**

```powershell
git diff --check
git status --short --branch
git diff --cached --name-only
```

Run changed-surface secret scan, verify `.serena/` is unstaged, commit final Handoff-only change if needed, push only implementation feature branch, and STOP before master integration.

---

## Plan Self-Review Checklist

Before execution, confirm the plan covers:

- repository detect/init/clone;
- Primary Remote resolution + non-secret persistence;
- default branch resolution without name assumptions;
- local branch inspect/create/switch/merge/safe-delete;
- linked-worktree occupancy protection/compatibility;
- strict GitHub HTTPS/SSH validation;
- machine-owned auth + secret redaction;
- generic Network DENY + `github_network` ASK;
- Standard manual vs automatic-mode Approval semantics;
- audit for both approval paths;
- fetch/relation model;
- Sync fast-forward-only behavior;
- Push first-upstream + SHA verification;
- dirty/stale/diverged/conflict STOP behavior;
- clone destination security + Workspace registration;
- shared Tool Kernel definitions for MCP/Desktop;
- narrow sender-validated Desktop IPC/preload;
- Git page status/action/error/approval UX;
- deterministic integration proof + existing Git Safety regressions;
- Security/Data Critical final gates + review + smoke + Product Owner real GitHub acceptance;
- no worktree lifecycle, GitHub repo creation, force/rebase/reset/stash, generic shell, credential persistence, or next-milestone scope.
