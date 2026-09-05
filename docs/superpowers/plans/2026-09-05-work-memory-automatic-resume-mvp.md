# Work Memory / Automatic Resume MVP Implementation Plan

Date: 2026-09-05
Baseline: `1cec2957ea42417f000b9256ab695e0c852285dd`
Authority: `docs/superpowers/specs/2026-09-04-automatic-work-resume-architecture-decision.md`
Risk: Security / Data Critical

## Scope and invariants

Implement only the bounded Work Memory / Automatic Resume prerequisite before Team Mode.
Public MCP facade is exactly `work.resume` and `work.checkpoint`; target production surface is 26 tools.
SUD-D owns Workspace-scoped continuation state. Git remains repository truth. `.serena/` remains local tooling state.
No raw chats, arbitrary key/value memory, generic memory CRUD, Serena-memory passthrough, cloud sync, Team entities, or new process/network/delete authority.
Bootstrap never grants authority; Tool Kernel, Policy, Approval, Audit, Workspace/InternalRoot, and secret rules remain authoritative.

## Domain model

Canonical concepts for this slice:
- Resume Context: the bounded current continuation snapshot for exactly one Workspace.
- Work Checkpoint: one meaningful immutable historical snapshot; the latest checkpoint is the authoritative current Resume Context.
- Session Bootstrap: ephemeral proof that one concrete MCP server session successfully resumed one active Workspace.
- Git Validation: current trusted Git state compared with stored enrichment; drift is truthful metadata, never a mutation.

Task status values: `pending | in_progress | blocked | completed`.
Resume Context fields: Goal; current Task/status; Completed; Decisions; Blockers; Next Action; Artifacts/changed paths; Verification evidence; Git head/status reference when available; updated timestamp.

## Bounds

Use shared exported `WORK_MEMORY_LIMITS` in domain/application/gateway validation:
- goal: 2,000 chars
- task title: 1,000 chars
- next action: 1,000 chars
- completed: 20 items x 500 chars
- decisions: 20 items x 500 chars
- blockers: 10 items x 500 chars
- verification evidence: 20 items x 500 chars
- artifacts/changed paths: 50 paths x existing 1,024-char Workspace path cap
- serialized checkpoint payload: 64 KiB hard cap
- checkpoint history: 20 snapshots per Workspace
All strings reject NUL and known credential-like material. Artifact paths use the existing Workspace resolver and InternalRoot rules.

## Module seams

1. Domain: `work-memory.ts`
   - types, status vocabulary, limits, stable Work Memory failure codes.
2. Infrastructure: `work-memory-repository.ts`
   - one small interface: `loadCurrent(workspaceId)` and `saveCheckpoint(workspaceId, context)`.
   - SQLite migration 005 stores bounded checkpoints with one `is_current=1` row per Workspace and trims history to 20 in one transaction.
   - callers cannot choose table, database, key, or Workspace id.
3. Application: `work-memory-service.ts`
   - deep interface: `resume(session, workspace)`, `checkpoint(session, workspace, input)`, `requireResumed(session, workspaceId)`.
   - session bootstrap state is in-memory only and keyed by real per-server session identity + Workspace.
   - persisted state survives service/server restart; bootstrap state does not.
4. Application capability module: `work-memory-capabilities.ts`
   - `work.resume` = normal Workspace read.
   - `work.checkpoint` = normal Workspace modify.
   - strict validation and Workspace/InternalRoot artifact resolution occur before persistence.
5. Application resume guard decorator
   - wraps the existing Tool Kernel interface without changing base Policy/Approval semantics.
   - project-scoped capabilities are blocked with top-level `WORK_RESUME_REQUIRED` before inner Kernel dispatch.
   - exceptions: `work.resume` only, plus any existing non-project Workspace selection/discovery surface; current MCP has no registry-selection tool.
   - guard covers Workspace file tools, Git, semantic code, Restricted Verify, Team tools, and `work.checkpoint`.
   - resume-required denial appends safe audit metadata only; no tool input.
6. MCP gateway
   - create a unique `ClientSession` per production server instance instead of the global `'mcp-stdio'` id.
   - register exactly `work.resume` and `work.checkpoint` and wire Work Memory repository/service/guard.
   - use concise MCP server instructions when the installed SDK supports initialization instructions: call `work.resume` before substantive project work.

## Persistence model

Migration 005 creates `work_memory_checkpoints` with product-owned UUID, Workspace FK, `is_current`, bounded scalar/JSON fields, trusted Git enrichment, and timestamps.
A partial unique index enforces one current row per Workspace. Saving a checkpoint atomically demotes the prior current row, inserts the new current row, then deletes rows older than the newest 20 for that Workspace.
Repository errors map to stable `WORK_MEMORY_PERSISTENCE_FAILED`; raw SQLite errors never escape.

## Resume and Git validation

`work.resume({})`:
1. resolves exactly one active Workspace and revalidates Workspace/InternalRoot containment;
2. loads the current Resume Context, if any;
3. obtains trusted Git status through existing Git Safety when the Workspace is a supported repository;
4. compares stored `headSha` / `statusId` when available and returns bounded `gitDrift` metadata;
5. does not mutate Git;
6. only after successful load/validation marks this server session bootstrapped for this Workspace;
7. repeated calls for the same session+Workspace are idempotent.

`work.checkpoint(input)`:
1. requires successful bootstrap for the same session+active Workspace;
2. validates strict bounded semantic fields and artifact paths;
3. rejects secret-like material before persistence;
4. enriches with current Git `headSha`, `statusId`, and bounded changed paths when supported;
5. saves one authoritative checkpoint and bounded history;
6. returns the saved Resume Context without raw tool/Serena/verify output.

## TDD tracer bullets

1. Domain contract RED/GREEN: fixed status/bounds/failure vocabulary and strict checkpoint shape.
2. Repository RED/GREEN: migration, one current checkpoint, history trim, restart persistence, stable sanitized repository failure.
3. Service RED/GREEN: first resume/no state, checkpoint, idempotent same-session resume, new-service bootstrap reset, Workspace isolation.
4. Git validation RED/GREEN: automatic head/status enrichment, changed-path bounds, head drift report, no Git mutation.
5. Security RED/GREEN: secret rejection, oversized aggregates, artifact traversal/InternalRoot, no caller Workspace/storage/raw-selector controls.
6. Guard RED/GREEN: pre-resume project tool returns `WORK_RESUME_REQUIRED` and inner Kernel is not invoked; workspace switch invalidates bootstrap.
7. Capability/MCP RED/GREEN: strict `work.*` schemas, server-specific session id, 26 exact tools, concise initialize instructions if supported.
8. Integration regressions: existing Policy/Approval results remain unchanged after resume; team/workspace/git/code/verify consumers are updated only to bootstrap first.
9. Activity/audit regression: routine successful work resume/checkpoint is filtered from main Activity; resume-required/security failures remain auditable with safe metadata only.
10. Real Home-PC acceptance: disposable SQLite + two Workspaces + fresh server A/B proves restart persistence, session reset, Workspace switch isolation, Git drift, no raw secret/output persistence.

## Required attack regressions

Prove strict rejection/no persistence for transcript/messages, arbitrary memory key/value, storage/table/key selectors, Workspace id/root selectors, raw Serena/memory/tool names, malformed/oversized fields, credential-like material, traversal/absolute/InternalRoot artifact paths, and raw stdout/stderr/tool results.
Prove denied pre-resume calls have no side effects; Workspace A state never appears in B; Git drift never changes repository state.

## Final gates

After stable implementation only:
- focused Work Memory/Resume suite
- relevant persistence/Workspace/Git/Tool Kernel/MCP/security regressions
- exact production tools/list = 26
- one real session-restart/Workspace-switch/Git-drift Home-PC acceptance
- lint
- typecheck
- full repository suite once
- production build
- `git diff --check`
- final security/data-boundary review
- JIT `code-review` Standards / Spec review
- JIT `writing-for-agents` handoff update
- staged scope + secret/sensitive-output scans
- commit, push, fetch, prove `HEAD == origin/master` and divergence `0 0`

## STOP

STOP after Work Memory / Automatic Resume MVP is closed and pushed. Do not start Team Mode MVP, `code.run`, general shell, Network tooling, Delete/Full Recovery, Computer Use, cloud/cross-device memory sync, or installer/update hardening.
