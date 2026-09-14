# Git Bootstrap + Branch + Remote Sync Design

**Date:** 2026-09-14
**Status:** Product Owner approved design; implementation not started
**Scope:** Git bootstrap, local branch workflow, GitHub remote synchronization, and Git page UX for the personal-first Windows product

## 1. Purpose

This design extends SUD_D's existing bounded Git foundation into the primary two-device workflow:

```text
Home PC → work / verify / commit → Push to GitHub
→ GitHub
→ Work PC → Sync from GitHub → work / verify / commit → Push to GitHub
→ GitHub
→ Home PC → Sync from GitHub
```

The design optimizes for one primary user and preserves SUD_D's existing security architecture. It is not a full Git client and does not grant the renderer shell/process authority.

The implementation milestone is Security / Data Critical because it adds network Git and history-changing actions. This document defines the approved architecture and behavior only. A separate reviewed implementation plan is required before source implementation begins.

## 2. Current Foundation

The repository already has a substantial local Git safety foundation that this milestone must reuse:

- `packages/application/src/git-safety-capabilities.ts` registers `git.detect`, `git.status`, `git.diff`, `git.checkpoint`, and `git.commit` through the Tool Kernel.
- `packages/infrastructure/src/git-safety-adapter.ts` is already a deep fixed-purpose Git module. It owns trusted `git.exe` discovery, command construction, bounded output, repository-state interpretation, stale-status protection, sensitive-diff handling, checkpoint/commit behavior, and linked-worktree metadata validation.
- The existing adapter supports normal repositories and the repository layout used by linked worktrees; linked-worktree compatibility must remain intact.
- The existing local Git runner is intentionally hermetic: it uses a trusted executable, `shell: false`, hidden windows, a bounded environment, disabled credential helpers/prompts, and bounded output. That behavior remains appropriate for local Git operations.
- `packages/mcp-gateway/src/workspace-file-server.ts` composes the current Git capabilities into the production Tool Kernel.
- Desktop currently reads bounded Git status for Overview but does not compose Git mutation/network capabilities through a Desktop Tool Kernel path.
- `PolicyContext: 'network'` is currently an unconditional DENY. GitHub network capability therefore requires an explicit, narrower reviewed policy context; generic Network DENY must remain unchanged.
- Workspace registration and InternalRoot validation already exist in `WorkspaceService` and path adapters. Clone bootstrap should reuse those validation rules rather than create a second workspace security model.

The implementation must evolve these seams. It must not layer a separate generic Git command engine beside `GitSafetyAdapter`.

## 3. Approved Scope

### 3.1 Included

- detect whether the active approved Workspace is a Git repository
- initialize Git in an existing approved project folder
- clone an existing GitHub repository into a user-selected safe destination
- inspect remote configuration
- add a remote when none exists
- change a remote URL
- select and persist a Primary Remote per Workspace
- resolve the repository's real Primary / Default Branch without assuming a branch name
- list/create/switch/merge/safely delete local branches
- fetch and inspect remote state
- **Sync from GitHub** as the primary inbound workflow
- **Push to GitHub** as the primary outbound workflow
- set upstream automatically on a safe first push
- GitHub HTTPS using the machine's existing Git/Windows credential flow
- GitHub SSH using the machine's existing Git/SSH configuration and agent flow
- Home-PC ↔ GitHub ↔ Work-PC operation
- compatibility with existing linked worktrees
- a dedicated main-navigation **Git** page

### 3.2 Deferred / excluded

- user-facing worktree create/list/remove lifecycle, UI, or tools
- removal of existing linked-worktree compatibility
- creating a GitHub repository from SUD_D
- GitHub OAuth
- SUD_D-managed GitHub token or private-key storage
- non-GitHub network Git hosts
- advanced multi-remote orchestration or push-to-many
- remote branch deletion
- auto-stash
- auto-rebase
- force-push
- force-delete
- destructive reset
- generic shell
- renderer-controlled executable, `argv`, `cwd`, or `env`

## 4. Canonical Product Terms

### Primary Remote

The one remote SUD_D uses for normal Sync and Push operations for a Workspace. The name is not assumed to be `origin`.

Resolution order:

1. use the current branch's tracking remote when one exists;
2. otherwise, if a persisted Primary Remote selection exists and still names a configured remote, use it;
3. otherwise, if exactly one remote exists, use that remote;
4. otherwise the state is ambiguous and network mutation stops until the user selects a Primary Remote.

A user selection is persisted as non-secret Workspace configuration. If the selected remote later disappears, the selection becomes stale and network actions stop until the state is resolved.

### Primary / Default Branch

The repository's real primary/default branch as resolved from trusted local/remote Git state. SUD_D never assumes `master` or `main`.

If the branch cannot be determined safely, the Git page reports **Unknown** and operations that require knowing the protected/default branch stop rather than guess.

### GitHub Network

A fixed-purpose Policy context for reviewed GitHub Git operations. It is narrower than generic `network` and does not weaken the existing default Network DENY.

### Sync from GitHub

The safe inbound product operation. It is not a raw Pull command and never performs automatic rebase or merge of diverged history.

### Bootstrap Destination

A user-selected destination that has passed SUD_D path/InternalRoot/non-empty validation for clone before it becomes an approved Workspace. This is a fixed-purpose clone precondition, not general outside-workspace filesystem authority.

## 5. Target Architecture

```text
Git Page
  ↓ typed intent only
Desktop preload + sender-validated typed IPC
  ↓
Git application orchestration
  ↓
Shared Git Tool Kernel capabilities
  ↓
Policy
  ↓
Approval when Policy says ASK
  ↓
Existing/evolved GitSafetyAdapter
  ↓
Trusted git.exe
  ├─ local hermetic Git runner
  └─ fixed-purpose GitHub network runner
       ↓
     GitHub HTTPS / SSH using machine-owned auth
```

The renderer never receives or constructs Git commands. It can choose only validated semantic operations and bounded data such as a branch name, remote name, GitHub URL, commit-safe state token, or clone destination.

### 5.1 One Git implementation, two execution modes

`GitSafetyAdapter` remains the implementation foundation. The milestone may rename it once if the implementation plan finds that clearer, but it must be evolved rather than duplicated.

The adapter should hide:

- command and argument construction
- trusted executable selection
- repository/worktree metadata layout
- branch/ref normalization
- Primary Remote and remote-state interpretation inputs
- merge safety checks
- clean-tree checks
- bounded output parsing
- GitHub remote parsing/normalization
- linked-worktree occupancy checks
- expected-state / stale-state checks
- normalized error mapping

The interface exposed to application code remains semantic and fixed-purpose. No caller supplies raw Git arguments or process environment.

Internally, local and GitHub-network execution use different trusted runner modes:

- **Local Git runner:** preserves the current hermetic behavior, including disabled credential helpers/prompts.
- **GitHub network runner:** may use only the host-owned Git/Git Credential Manager/SSH configuration required for GitHub HTTPS or SSH. It still uses the trusted Git executable, `shell: false`, bounded output/timeouts, and a fixed host-owned environment policy. Renderer input can never add executables, helpers, environment entries, config includes, hooks, or arbitrary command options.

Raw helper payloads and raw command output are not surfaced through DTOs, logs, audit, or errors.

## 6. Module and Interface Design

### 6.1 Contracts

`packages/contracts` owns strict renderer-facing schemas for Git page state and every mutation input. DTOs contain normalized Git facts, never host command details.

The page should consume one aggregated bounded snapshot conceptually shaped as:

```text
GitWorkspaceSnapshot
- workspace identity
- repository: not-repo | ready | unsupported
- repository state: normal | merge | rebase | ...
- clean / changed-count / truncated
- current branch / detached
- Primary / Default Branch: known | unknown
- Primary Remote: resolved | ambiguous | missing | unsupported
- safe remote display identity
- transport: https | ssh | unknown
- upstream/tracking branch when present
- remote relation: unknown | up_to_date | local_ahead | remote_ahead | diverged
- bounded ahead/behind counts when available
- auth status only when safely inferable
- operation availability/reason metadata
```

Mutation inputs are strict discriminated schemas. Branch/remote names have bounded lengths and reject control characters. GitHub URLs are parsed and validated; they are never treated as command fragments.

No DTO includes executable paths, `argv`, `cwd`, `env`, credential-helper payloads, private-key paths/content, tokens, or raw stderr/stdout.

### 6.2 Git application orchestration

Add one Git application module that coordinates:

- active Workspace resolution
- non-secret Workspace Git settings
- adapter inspection/mutation
- clone bootstrap destination validation
- post-clone Workspace registration/activation
- stale-state revalidation before mutation
- Tool Kernel invocation from Desktop and MCP-facing composition

The application interface should be deep: callers ask for a snapshot or a semantic action and do not reproduce Git state-machine logic.

The Desktop Git page must not call `GitSafetyAdapter` directly.

### 6.3 Shared Tool Kernel composition

The existing `createGitSafetyCapabilities(...)` pattern remains the authority path. Extend the Git capability set with fixed-purpose capabilities needed by the approved UX rather than adding Desktop-only privileged shortcuts.

The exact tool names are an implementation-plan detail, but the semantic capability set must cover:

- repository/bootstrap inspection
- initialize repository
- remote inspect/configure/select-primary
- branch list/create/switch/merge/safe-delete
- fetch/remote-state inspection
- Sync from GitHub
- Push to GitHub
- clone GitHub repository

Existing `git.detect`, `git.status`, `git.diff`, `git.checkpoint`, and `git.commit` remain compatible.

Desktop needs a shared application composition that invokes the same Git capability definitions through a Tool Kernel with a `desktop` session identity. Do not duplicate Git authorization logic in IPC handlers.

### 6.4 Workspace Git settings persistence

Persist only non-secret user choice needed to remove remote ambiguity. Prefer a dedicated small repository/table, for example:

```text
workspace_git_settings
- workspace_id  PK/FK → workspaces
- primary_remote_name nullable
- updated_at
```

The Git repository remains authoritative for remotes, URLs, branches, upstreams, and refs. SQLite stores only SUD_D's selected Primary Remote name; it does not mirror Git config or store credentials.

Default branch is derived from Git state and is not persisted as guessed product state.

### 6.5 Desktop IPC / preload

Follow the existing sender-validated fixed-purpose IPC pattern:

- parse every request with strict contract schemas;
- reject unknown keys;
- return `IpcResult<T>` with bounded errors;
- expose a narrow `window.sudD.git` preload surface;
- never expose generic process or Git execution methods.

Directory selection for clone reuses the native directory-selection pattern. The selected path is still revalidated in trusted application/infrastructure code; the dialog result is not authority by itself.

## 7. Policy and Approval Model

### 7.1 Local Git

Local Git operations remain Workspace-scoped and use the existing `workspace` context when they act on the active approved Workspace.

Hard path/security rules remain in force before mutation. InternalRoot/outside-workspace denial is never bypassed.

Examples:

- detect/status/branch list: read
- init/branch create: create/modify as appropriate
- switch/merge/remote config: modify
- safe local delete: delete and therefore explicit Approval under the existing baseline policy

### 7.2 GitHub network Git

Generic `PolicyContext: 'network'` remains unconditional DENY.

Add one narrower reviewed context, canonically **`github_network`**, used only after the Git application/adapter has validated that the operation is one of the approved fixed-purpose GitHub operations and the remote is a valid GitHub HTTPS/SSH remote.

Baseline policy for `github_network` is **ASK**. It is never ALLOW by default.

This keeps local Git and network Git distinguishable in Policy, Approval, and Audit. It also preserves current Approval Mode behavior: automatic modes currently auto-approve only eligible normal `workspace` requests, so `github_network` actions remain explicit user decisions unless a future separately approved policy changes that rule.

The allowed GitHub-network operations in this milestone are:

- clone
- fetch / remote-state refresh
- Sync from GitHub
- Push to GitHub
- remote SHA verification that is part of the authorized Push operation

All other generic network access remains denied.

### 7.3 Clone bootstrap destination

Clone is exceptional because the destination is not yet an approved Workspace.

Before the Tool Kernel can resolve the fixed-purpose `github_network` security context, trusted code must validate the Bootstrap Destination:

- absolute local drive path accepted by the Workspace path rules;
- not UNC or device namespace;
- not inside any InternalRoot;
- not a registered conflicting Workspace;
- if it exists, it is a directory and empty;
- if it does not exist, its existing parent is canonicalized and passes the same InternalRoot guard;
- no reparse/symlink escape is accepted during creation/verification.

The Approval binding for clone includes only bounded safe identity: normalized GitHub repository identity, transport, and a safe destination label. It never includes credentials or raw process configuration.

After Git clone succeeds, SUD_D verifies the resulting repository, registers it through the existing Workspace service, and makes it Active. If repository cloning succeeds but Workspace registration fails, SUD_D does not silently delete the cloned data; it reports the partial result and the next safe action.

## 8. GitHub Remote and Authentication Design

### 8.1 Accepted v1 remote forms

Network operations accept GitHub only:

- HTTPS repository URLs with host exactly `github.com` and no embedded credentials/userinfo;
- SSH GitHub repository forms using host exactly `github.com` and the Git SSH user `git`.

Query strings, fragments, embedded tokens/passwords, non-GitHub hosts, unsupported schemes, and renderer-supplied SSH options are rejected.

The adapter normalizes an accepted remote to a safe identity such as owner/repository + transport. UI, audit, and errors use that safe identity rather than blindly echoing the raw configured URL.

An existing unsupported or credential-bearing remote may be reported as **Unsupported** without exposing secret material. Network operations do not execute until the remote is changed to an accepted GitHub form.

### 8.2 Machine-owned authentication

SUD_D does not own GitHub credentials in v1.

- HTTPS uses the machine's existing Git/Windows credential flow, such as Git Credential Manager when already configured.
- SSH uses the machine's existing Git/SSH configuration and agent flow.

The trusted network runner may expose only the host-owned environment/configuration required for those machine flows. No credential/token/private-key value is accepted from renderer input, persisted in ordinary SQLite, copied into DTOs, or written into audit/log/error output.

Authentication failure is normalized to a bounded error with a safe next action. SUD_D does not capture the credential in order to retry.

`authStatus` on the Git page is optional and conservative. It may be `unknown` unless a safe previous operation or trusted machine state supports a non-secret conclusion. SUD_D does not probe or display credentials merely to populate a status badge.

## 9. Repository Bootstrap Flows

### 9.1 Existing supported Git repository

```text
detect
→ inspect clean/state/branch/upstream/remotes
→ resolve Primary Remote when possible
→ resolve Primary / Default Branch when possible
→ ready
```

### 9.2 Existing approved project that is not Git

```text
Initialize Git
→ fixed-purpose git init at active Workspace root
→ verify repository root/state
→ refresh Git snapshot
→ remote may be configured afterward
```

No initial commit, remote, branch rename, or push is silently added.

### 9.3 Existing GitHub repository not yet local

```text
user chooses Clone from GitHub
→ enter/choose accepted GitHub HTTPS/SSH repository
→ select safe Bootstrap Destination
→ validate destination
→ Policy / Approval for github_network clone
→ clone
→ verify repository
→ register as approved Workspace
→ make Active Workspace
→ resolve remote/default state
```

Clone never overwrites a non-empty directory.

## 10. Clean Working Tree Guard

For **switch**, **merge**, **Sync from GitHub**, and **Push to GitHub**:

```text
staged OR unstaged OR untracked changes → STOP before mutation
```

The error states that uncommitted work exists and what action was not run. SUD_D does not auto-stash, discard, reset, auto-commit, or implicitly move changes across branches.

`fetch` may refresh remote refs without touching the working tree, but the primary **Sync** operation checks cleanliness before its fetch+classification sequence so a user cannot mistake Sync for a non-mutating status refresh.

Push also stops on a dirty tree even though Git technically pushes commits only; the UI explicitly explains that uncommitted files are not included and must be committed first.

## 11. Branch Workflow

Primary workflow:

```text
Primary / Default Branch
→ Create Feature Branch
→ Switch
→ Work / Verify / Commit
→ return to Primary / Default Branch
→ Merge Feature Branch
→ optionally Safe Delete Feature Branch
```

### 11.1 List / create

Branch names are validated as data and passed to fixed-purpose adapter methods. Create does not silently switch unless the UI action explicitly requests create-and-switch as one typed semantic operation.

### 11.2 Switch

Requires:

- normal supported repository state;
- clean working tree including untracked files;
- target local branch exists;
- target is not blocked by linked-worktree occupancy.

No stash/reset/checkout-force behavior is permitted.

### 11.3 Merge

Merge acts into the current branch and requires a clean tree and normal repository state.

Behavior:

- if source is already contained: no-op success;
- if fast-forward is possible: fast-forward;
- otherwise perform a clean normal merge commit;
- if conflict is detected or safety cannot be proven: STOP and report without automatically rebasing, resetting, or forcing.

The adapter should perform non-mutating conflict preflight where supported and revalidate HEAD/status immediately before mutation. If safe conflict preflight is unavailable or inconclusive, fail closed before beginning a merge that could strand the user in an unresolved index/worktree state.

### 11.4 Safe local delete

Never delete:

- the current branch;
- the resolved Primary / Default Branch;
- a branch whose safe default branch cannot be determined;
- a branch checked out by another linked worktree;
- a branch not fully merged into the resolved Primary / Default Branch.

Unmerged state stops with a bounded error. There is no force-delete and no remote branch deletion in v1.

## 12. Existing Linked-Worktree Compatibility

The current adapter already validates `.git` indirection, common Git directories, worktree metadata, and index state for linked worktrees. Preserve that foundation.

This milestone does **not** expose worktree lifecycle actions.

Branch operations must remain worktree-aware:

- status/diff/commit continue to work from a supported linked-worktree Workspace;
- switch/delete must detect a branch currently checked out in another worktree and STOP rather than bypass Git safety;
- merge/default/remote state must resolve from the correct common repository while applying working-tree mutation only to the active Workspace;
- no operation deletes or prunes worktrees as a side effect.

## 13. Primary Remote Resolution and Configuration

Remote inspection is local Git configuration inspection and does not itself grant network authority.

Resolution algorithm:

1. inspect current branch tracking configuration;
2. if it names an existing remote, that remote is Primary for the current branch;
3. otherwise use the persisted Workspace Primary Remote if it still exists;
4. otherwise, if exactly one remote exists, use it;
5. otherwise report `ambiguous` or `missing` and disable network actions until the user chooses/configures one.

Supported v1 configuration actions:

- inspect remotes;
- add one accepted GitHub remote when needed;
- change a selected remote to an accepted GitHub URL;
- select Primary Remote.

Selecting Primary Remote stores only the remote name in SUD_D configuration. Remote URLs remain authoritative in Git config.

Changing a remote URL is a local configuration mutation and validates the new GitHub URL before writing it. It does not contact the remote as part of the local config change.

## 14. Primary / Default Branch Resolution

Resolve from trusted repository/remote state, preferring authoritative remote symbolic/default-branch information for the Primary Remote when available.

Never infer from a string literal such as `main` or `master`.

If no authoritative default can be resolved:

- show **Unknown**;
- allow operations that do not require a protected/default branch when otherwise safe;
- block safe-delete or any other operation whose safety depends on knowing the default branch.

A later fetch may make the default branch resolvable; refresh the snapshot afterward.

## 15. Remote Relation Model

After a trusted fetch of the Primary Remote, classify the current branch against its upstream/remote branch:

- **up_to_date** — local and remote tips are equal;
- **local_ahead** — remote tip is an ancestor of local tip;
- **remote_ahead** — local tip is an ancestor of remote tip;
- **diverged** — neither tip is an ancestor of the other;
- **no_upstream** — current branch has no tracking branch;
- **unavailable** — state cannot be determined safely.

The adapter owns the graph checks and returns normalized relation data. The renderer does not calculate Git ancestry.

## 16. Sync from GitHub

Sync is the primary inbound action.

```text
require supported normal repo + attached branch + clean tree
→ resolve Primary Remote
→ validate GitHub remote
→ Policy / Approval for github_network
→ fetch Primary Remote
→ resolve current upstream and relation
```

Then:

- `up_to_date` → no mutation;
- `remote_ahead` with fast-forward ancestry → fast-forward local branch, then verify local tip;
- `local_ahead` → no pull/mutation; report that local commits need Push;
- `diverged` → STOP and report;
- `no_upstream` → STOP and report that tracking is not established; first safe Push can establish it;
- unsupported/conflict/indeterminate state → STOP and report.

Sync never performs an automatic merge commit, rebase, reset, stash, or force operation.

## 17. Push to GitHub

```text
require supported normal repo + attached branch + clean tree
→ resolve Primary Remote
→ validate GitHub remote
→ Policy / Approval for github_network
→ fetch Primary Remote
→ classify current branch against remote state
→ ensure normal push is fast-forward-safe
→ push
→ verify remote branch SHA
```

### 17.1 Existing upstream

- `up_to_date` → no-op success;
- `local_ahead` → normal push;
- `remote_ahead` → STOP; direct user to Sync;
- `diverged` → STOP; report divergence;
- rejected push or state change race → STOP; do not retry with force.

### 17.2 First push / no upstream

After fetch:

- if no same-named remote branch exists, normal push current branch to Primary Remote and set upstream;
- if a same-named remote branch exists, compare ancestry first;
- only a safe local-ahead/equal relation may establish upstream and push;
- remote-ahead/diverged state stops.

After push, verify the remote branch SHA through the same authorized network operation and compare it to the intended local commit. A mismatch is a failed operation even if the initial push command returned success.

Push never auto-commits. A dirty tree stops with explicit guidance that Push sends commits, not uncommitted files.

## 18. Git Page UX

Add **Git** to main navigation adjacent to the Workspace workflow. Keep Overview operational/status-focused and Connection configuration-focused.

The Git page uses the existing SUD_D Operate-mode visual language: quiet white/cool-gray surfaces, restrained SUD_D blue for actions/selection, status text plus color, visible focus, and responsive reflow before clipping.

It is state-first rather than command-first.

### 18.1 Repository

Show:

- repository status;
- clean / uncommitted-work state;
- current branch;
- Primary / Default Branch or Unknown;
- Primary Remote state/name;
- sanitized GitHub repository identity / safe remote display;
- transport (`HTTPS` / `SSH`) when known;
- upstream when known;
- remote relation when known;
- auth status only when safely inferable.

For a non-repository Workspace:

```text
Not a Git repository
[ Initialize Git ]
[ Clone from GitHub ]
```

Clone may create/select a different Workspace and then navigate the page to that active Workspace.

### 18.2 Branches

Provide fixed-purpose actions:

- Create branch
- Switch branch
- Merge branch
- Safe delete local branch

Show disabled/blocked reasons when dirty state, unknown default branch, linked-worktree occupancy, or repository state makes an action unsafe.

### 18.3 Remote Sync

Primary actions:

- **Sync from GitHub**
- **Push to GitHub**

The UI describes state in product language (`Up to date`, `Local commits ready to push`, `Remote commits available`, `Diverged — manual resolution required`) rather than exposing raw Git porcelain.

When Tool Kernel returns Approval Required, reuse the existing Approval system and present a clear route to the existing approval decision surface. Do not create a second approval model in the Git page.

### 18.4 Error copy

Errors answer three questions:

1. What happened?
2. What remained unchanged?
3. What is the next safe action?

Do not show raw stderr or suggest force/rebase/reset as a hidden recovery shortcut.

## 19. Error Model

Use stable bounded domain/application error codes where the UI needs to distinguish recovery. Reuse existing `GIT_STATE_UNSAFE`, `GIT_STATUS_STALE`, and `GIT_OPERATION_CONFLICT` where their meaning is exact; add specific Git errors rather than collapsing user-recoverable states into `INTERNAL_ERROR`.

The implementation must explicitly model at least:

- dirty working tree;
- missing/ambiguous/stale Primary Remote;
- unsupported/non-GitHub or credential-bearing remote;
- detached HEAD or unsupported repository operation state;
- no upstream;
- local ahead;
- remote ahead;
- diverged history;
- merge conflict/preflight conflict;
- authentication failure;
- remote unreachable;
- unsafe/non-empty clone destination;
- unmerged branch deletion;
- current/default branch deletion;
- branch checked out by another worktree;
- stale expected Git state/race;
- unexpected or malformed Git output/state.

Errors contain only bounded metadata required for recovery, such as branch name, remote name, relation, or safe GitHub identity.

## 20. Audit and Secret Handling

Audit only bounded metadata:

- semantic operation;
- Workspace ID when available;
- branch name(s);
- remote name;
- normalized transport / safe GitHub repository identity when useful;
- result code;
- relevant commit SHA(s) or remote SHA verification result.

Do not audit:

- credential-helper payloads;
- tokens/passwords;
- private-key material or private-key file contents;
- raw process environment;
- raw command line;
- raw remote URL when it could contain userinfo/credentials;
- raw stdout/stderr.

Network authentication material remains machine-owned and transient to Git/GCM/SSH.

## 21. Verification Design for the Future Implementation

This milestone is **Security / Data Critical**. Use the owner-approved economy:

```text
focused-first → final-once → rerun-by-invalidation
```

### 21.1 Focused proof seams

The implementation plan must cover focused proof for:

- repository detect/init;
- Bootstrap Destination and InternalRoot/non-empty clone safety;
- Primary Remote resolution including tracking remote, persisted choice, sole remote, ambiguity, and stale choice;
- Primary / Default Branch resolution without hard-coded names;
- strict GitHub HTTPS/SSH remote validation and credential-bearing URL rejection;
- local-vs-`github_network` Policy classification;
- generic Network DENY remaining intact;
- Approval binding/audit for network Git with no Approval Mode auto-approval;
- clean/dirty guards including untracked files;
- branch create/switch;
- linked-worktree branch occupancy protection;
- fast-forward merge;
- normal clean merge commit;
- merge conflict/preflight STOP;
- safe merged-branch local deletion;
- current/default/unmerged/in-use branch deletion STOP;
- up-to-date/local-ahead/remote-ahead/diverged classification;
- Sync fast-forward-only behavior;
- Sync local-ahead/diverged/no-upstream STOP;
- first push with automatic upstream establishment;
- existing-upstream safe push;
- rejected/unsafe push STOP;
- remote SHA verification;
- machine-owned HTTPS and SSH authentication success/failure mapping without credential capture;
- secret-leak regressions across DTOs, audit, logs, errors, and SQLite;
- existing `git.detect/status/diff/checkpoint/commit` behavior;
- existing linked-worktree compatibility.

### 21.2 Final gates

After implementation stabilizes, run the Security / Data Critical gates once:

- focused/relevant regressions already green;
- lint;
- typecheck;
- full suite;
- production build;
- `git diff --check`;
- Standards + Spec review;
- one real production smoke/acceptance covering the changed runtime boundary.

Rerun only evidence invalidated by later relevant changes.

### 21.3 Owner acceptance

After automated evidence is green, finish with one Product Owner manual acceptance of:

- the Git page at practical Windows desktop size;
- Initialize / repository state UX;
- branch workflow;
- real bounded Home-PC → GitHub → Work-PC → GitHub → Home-PC Sync/Push workflow using an approved test repository.

Manual acceptance supplements; it does not replace mandatory Security / Data Critical automated proof.

## 22. Implementation-Plan Boundary

The approved scope fits one implementation plan if it is sliced vertically around the existing deep Git module:

1. domain/contracts + non-secret Workspace Git settings + Policy context;
2. local bootstrap/remote/default/branch operations in the existing adapter;
3. fixed-purpose GitHub network runner + remote parser + auth/error normalization;
4. Tool Kernel capabilities + application orchestration shared by Desktop/MCP composition;
5. typed Desktop IPC/preload + Git page;
6. focused security/integration proof, final-once gates, then Product Owner acceptance.

The implementation plan may refine file-level sequencing after inspecting tests, but it must not expand product scope or introduce a parallel Git engine.

## 23. Invariants / Acceptance Summary

Implementation is conformant only if all are true:

- no generic shell or renderer-controlled executable/argv/cwd/env exists;
- generic Network DENY remains intact;
- only validated GitHub HTTPS/SSH network operations use the reviewed `github_network` path;
- GitHub credentials remain machine-owned and absent from renderer/SQLite/audit/log/error DTOs;
- Primary Remote is not hard-coded to `origin`;
- Primary / Default Branch is not hard-coded to `master` or `main`;
- dirty switch/merge/Sync/Push stops before mutation;
- diverged Sync stops rather than merges/rebases/resets;
- Push never force-pushes or auto-commits;
- safe delete never deletes current/default/unmerged/in-use branches and never force-deletes;
- clone never overwrites a non-empty/unsafe destination;
- linked-worktree compatibility is preserved without adding user-facing worktree lifecycle;
- Create GitHub Repository remains deferred;
- Git page exposes product intents/state rather than raw Git commands;
- detailed behavior remains here, while Roadmap and Handoff contain only concise pointers/state.

## 24. Explicit STOP for This Design Task

This document authorizes no runtime/UI implementation. The next action after this spec branch is pushed is **Product Owner review of this written design**. Implementation waits for that review and a separate implementation plan task.
