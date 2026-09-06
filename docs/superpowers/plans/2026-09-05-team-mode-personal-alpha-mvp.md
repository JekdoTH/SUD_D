# Team Mode Personal Alpha MVP Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with the repo's current JIT Skill Router and TDD workflow. Follow `focused-first, final-once, rerun-by-invalidation`.

**Goal:** Evolve the existing sequential Team Mode into a ChatGPT-driven Personal Alpha loop that plans multiple Tasks, assigns Worker/Validator/Reviewer roles, performs bounded rework and automatic next-task progression, atomically checkpoints Work Memory, resumes across sessions, and preserves all existing SUD-D authority boundaries.

**Architecture:** Keep the existing four `team.*` tools and evolve the existing Team domain/application/infrastructure/Desktop seams. Every state-changing Team operation commits Team rows, the derived bounded Work Memory checkpoint, and the required Team transition audit in one SQLite unit-of-work; actual File/Git/Serena/Verify actions remain separate existing capabilities behind Tool Kernel/Policy/Approval/Audit.

**Tech Stack:** TypeScript 5.8+, Node >=24, pnpm 10.34.5, Vitest 3, Electron 36, React, Zod, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-09-05-team-mode-personal-alpha-mvp-design.md`

## Global Constraints

- Baseline before implementation: `e4d83c5ff006361df173f3b81b76644412a22e7f`.
- Preserve exactly four Team MCP tools: `team.start`, `team.status`, `team.submit`, `team.stop`.
- Production MCP surface remains exactly **26 unique tools**.
- Public `team.submit` outcomes are exactly `plan_ready | work_ready | validation_passed | validation_failed | task_approved | changes_requested | blocked`.
- Persisted Team roles are exactly `planner | implementer | validator | reviewer`.
- Mission states are `planning | implementing | validating | reviewing | completed | blocked | stopped`.
- Task statuses are `pending | in_progress | validating | reviewing | done | blocked`.
- Maximum return-to-Worker cycles is **3 per Task**.
- `implementer` may be displayed as **Worker**; do not add `lead` as a persisted role.
- Team tools remain orchestration-only. They do not directly read/write project files, mutate Git, invoke Verify, call Serena, approve requests, launch processes, use Network, or Delete/Recover.
- Validator invokes existing `verify.run(test|lint|typecheck|build)` separately through the current Tool Kernel / ASK / exact-one-time Approval path.
- `TeamService` remains transport-neutral and must not receive/create/fake `ClientSession`.
- Every state-changing Team transition atomically commits required Team state + derived Work Memory checkpoint + required Team transition audit or rolls all of it back.
- Explicit `missionId` is never a cross-Workspace capability. `team.status({missionId})` and `team.stop({missionId})` bind the mission to the active Workspace before read/mutation.
- Prefer the same `TEAM_MISSION_NOT_FOUND` result for unknown and cross-Workspace explicit mission IDs to avoid an existence oracle.
- Work Memory public task status remains exactly `pending | in_progress | blocked | completed`.
- Work Memory bounds remain unchanged, including **1,024-character artifact paths** and **64 KiB aggregate checkpoint** size.
- Planning Work Memory mapping is exactly `Plan Team mission / in_progress / Plan the Team mission and submit plan_ready.`
- Active implementing/validating/reviewing states map to Work Memory `in_progress` with the exact deterministic next-action templates from the approved V3 spec.
- Team `completed` maps to Work Memory `completed`; Team `blocked` and `stopped` map to Work Memory `blocked`.
- Legacy active `reviewing/reviewer` migrates fail-closed to `validating/validator` on the deterministic current Task; it may not bypass Validator.
- Add migration 006. Do not edit migrations 004/005 in place.
- Never persist raw ChatGPT prompts/transcripts, chain-of-thought, file contents, diff contents, raw tool/Verify/Serena output, executable/argv/cwd/env/shell values, or credentials/secrets.
- No Codex dependency, direct OpenAI API/model runtime, parallel agents, background scheduler, `code.run`, general shell, Network, Delete/Recovery, Computer Use, cloud sync, or enterprise/RBAC work.
- Preserve the existing unrelated local `SUD_D_HANDOFF.md` Restricted Execute note and `.serena/` local-only state.
- Do not commit/push intermediate slices. Perform one milestone closure commit/push only after final gates.
- If an expected RED is syntax/fixture/harness-only, repair the test and capture a meaningful behavioral RED before production code.
- Security/Data Critical final gates include one fresh full repository suite after source is stable.

---

## Planned File Structure

**Existing source to evolve**

- `packages/domain/src/team.ts` — V3 roles/states/outcomes/task statuses/view types.
- `packages/application/src/team-service.ts` — transport-neutral transition orchestration, Workspace binding, freshness, Task progression.
- `packages/application/src/team-capabilities.ts` — exact public submit union and forbidden-field rejection.
- `packages/infrastructure/src/database.ts` — migration 006.
- `packages/infrastructure/src/team-repository.ts` — Team reads and transaction-safe write primitives.
- `packages/infrastructure/src/work-memory-repository.ts` — shared transaction-scoped bounded checkpoint writer.
- `packages/infrastructure/src/audit-repository.ts` — shared sanitized transaction-scoped audit writer.
- `packages/mcp-gateway/src/workspace-file-server.ts` — V3 Team Zod schemas, UoW composition, continuation instructions.
- `packages/contracts/src/index.ts` — safe V3 renderer DTOs.
- `packages/desktop/electron/team-controller.ts` — safe DTO mapping.
- `packages/desktop/src/pages/TeamPage.tsx` — current Task/progress/Validator/rework/Final Result.
- `packages/desktop/src/index.css` — minimal Team-page delta only if required.

**New focused source**

- `packages/application/src/team-continuation.ts` — deterministic Team → Work Memory mapping; no `ClientSession`.
- `packages/application/src/team-legacy-reconciler.ts` — transport-neutral legacy reconciliation where migration 006 requires startup reconciliation.
- `packages/infrastructure/src/team-transition-unit-of-work.ts` — single better-sqlite3 transaction for Team + Work Memory + Team audit.

**Focused tests**

- Evolve: `team-mode.test.ts`, `team-mode-security.test.ts`, `team-mode-desktop.test.ts`.
- Add: `team-mode-atomicity.test.ts`, `team-mode-migration.test.ts`, `team-mode-personal-alpha.acceptance.test.ts`.

---

## Task 1 — Atomic Team Transition Unit-of-Work

**Files**
- Create: `packages/infrastructure/src/team-transition-unit-of-work.ts`
- Modify: `packages/infrastructure/src/team-repository.ts`
- Modify: `packages/infrastructure/src/work-memory-repository.ts`
- Modify: `packages/infrastructure/src/audit-repository.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Test: `packages/tests/src/team-mode-atomicity.test.ts`

**Interfaces**

Use a purpose-specific infrastructure writer, not a generic DB callback:

```ts
export interface TeamTransitionPrecondition {
  readonly missionId?: string;
  readonly workspaceId: string;
  readonly expectedState?: TeamState;
  readonly expectedRole?: TeamRole;
  readonly expectedCurrentStepId?: string;
  readonly expectedFreshness?: TeamFreshnessRef;
}

export interface TeamTransitionWritePlan {
  readonly precondition: TeamTransitionPrecondition;
  readonly mission: TeamMissionWrite;
  readonly workItems?: TeamWorkItemWriteSet;
  readonly findings?: readonly NewTeamFinding[];
  readonly handoff?: NewTeamHandoff;
  readonly checkpoint: WorkMemoryCheckpointDraft;
  readonly audit: Omit<AuditEvent, 'id'>;
}

export interface TeamTransitionCommitResult {
  readonly mission: TeamMissionRecord;
  readonly checkpoint: WorkResumeContext;
}

export interface TeamTransitionUnitOfWork {
  commit(input: TeamTransitionWritePlan): Result<TeamTransitionCommitResult, AppError>;
}

export function createTeamTransitionUnitOfWork(db: Db): TeamTransitionUnitOfWork;
```

`TeamMissionWrite` and `TeamWorkItemWriteSet` are internal discriminated infrastructure types (`create|update`, `replace|patch`). They must not become public MCP/renderer authority.

- [ ] Write SQLite failure-injection tests. Use triggers that `RAISE(ABORT, ...)` on Work Memory insert and Team-transition audit insert. Assert Team mission/task/handoff/findings/checkpoint/audit remain at the prior committed state after failure.
- [ ] Add a stale persisted-precondition test; changed state/role/currentTask/freshness must commit nothing.
- [ ] Run `pnpm test -- packages/tests/src/team-mode-atomicity.test.ts` and capture meaningful RED.
- [ ] Refactor Team, Work Memory and audit SQL into transaction-scoped internal writer helpers reused by standalone repositories and the Team UoW. Preserve Work Memory history trimming and audit sanitization exactly.
- [ ] Implement one `db.transaction(() => { ... })()` per Team state-changing write. Reassert the Team precondition inside the transaction before applying rows.
- [ ] Run the atomicity test again; require GREEN.

---

## Task 2 — Active-Workspace Binding for Explicit Mission IDs

**Files**
- Modify: `packages/application/src/team-service.ts`
- Test: `packages/tests/src/team-mode-security.test.ts`
- Test: `packages/tests/src/team-mode.test.ts`

**Interface**

```ts
function missionForActiveWorkspace(
  dependencies: TeamServiceDependencies,
  missionId?: string,
): Result<TeamMissionRecord | undefined, AppError>;
```

Behavior: resolve exactly one active Workspace first; explicit unknown or foreign mission IDs return the same not-found-style result; no foreign metadata is returned.

- [ ] RED: active Workspace A + mission B; `status({missionId:B})` and `stop({missionId:B})` both fail with `TEAM_MISSION_NOT_FOUND`, B remains unchanged, and error/audit contains no B Goal/task metadata.
- [ ] Run `pnpm test -- packages/tests/src/team-mode-security.test.ts`.
- [ ] Route `status()` and `stop()` through the shared resolver before return/mutation.
- [ ] Run `pnpm test -- packages/tests/src/team-mode-security.test.ts packages/tests/src/team-mode.test.ts`; require GREEN.

---

## Task 3 — V3 Domain and Exact Public Submit Vocabulary

**Files**
- Modify: `packages/domain/src/team.ts`
- Modify: `packages/domain/src/index.ts` if export changes are needed
- Modify: `packages/application/src/team-capabilities.ts`
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Test: `packages/tests/src/team-mode.test.ts`
- Test: `packages/tests/src/team-mode-security.test.ts`

**Exact constants**

```ts
export const TEAM_ROLES = ['planner', 'implementer', 'validator', 'reviewer'] as const;
export const TEAM_STATES = ['planning', 'implementing', 'validating', 'reviewing', 'completed', 'blocked', 'stopped'] as const;
export const TEAM_SUBMISSION_OUTCOMES = ['plan_ready', 'work_ready', 'validation_passed', 'validation_failed', 'task_approved', 'changes_requested', 'blocked'] as const;
export const TEAM_WORK_ITEM_STATUSES = ['pending', 'in_progress', 'validating', 'reviewing', 'done', 'blocked'] as const;
```

Add `reworkCount` to the authoritative Task record/view; limit remains 3.

- [ ] RED: old `implementation_ready` and `complete` public outcomes reject; wrong-role outcomes reject; extra state/role/task/freshness/raw-tool/command/argv selectors reject with no mutation.
- [ ] Run focused Team tests and capture RED.
- [ ] Update domain, application union, capability validator and MCP Zod discriminated union to the seven approved outcomes only.
- [ ] Run focused Team/security tests; require GREEN.

---

## Task 4 — Multi-Task Worker → Validator → Reviewer Flow

**Files**
- Modify: `packages/application/src/team-service.ts`
- Modify: `packages/infrastructure/src/team-repository.ts`
- Test: `packages/tests/src/team-mode.test.ts`

**Required transition matrix**

```text
planning/planner + plan_ready
  -> first Task in_progress -> implementing/implementer

implementing/implementer + work_ready
  -> current Task validating -> validating/validator

validating/validator + validation_passed
  -> current Task reviewing -> reviewing/reviewer

validating/validator + validation_failed
  -> reworkCount+1 -> same Task in_progress -> implementing/implementer

reviewing/reviewer + changes_requested
  -> reworkCount+1 -> same Task in_progress -> implementing/implementer

reviewing/reviewer + task_approved
  -> current Task done
  -> next pending Task in_progress + implementing/implementer
     OR mission completed if no pending Task
```

- [ ] Replace old one-Task Team flow with a two-Task V3 RED; assert state/role/current Task at every transition and automatic Task 2 assignment.
- [ ] RED: Validator failure and Reviewer changes both return same Task and increment per-Task `reworkCount`; new Task starts at 0; fourth return blocks `REVIEW_LOOP_LIMIT`.
- [ ] Run `pnpm test -- packages/tests/src/team-mode.test.ts`.
- [ ] Build transition plans in application code and commit them through `TeamTransitionUnitOfWork`; do not recreate separate repository write chains.
- [ ] Run Team + atomicity tests; require GREEN.

---

## Task 5 — Role-Specific Freshness

**Files**
- Modify: `packages/application/src/team-service.ts`
- Test: `packages/tests/src/team-mode.test.ts`
- Test: `packages/tests/src/team-mode-security.test.ts`

Use these internal rules:

```ts
type FreshnessRule = 'must_match' | 'adopt_current' | 'workspace_identity_only';
```

Mapping:
- Planner `plan_ready` → `must_match`
- Worker `work_ready` → `adopt_current`
- Validator pass/fail → `must_match`
- Reviewer approve/changes → `must_match`
- `blocked` / `stop` → `workspace_identity_only`

- [ ] RED: Planner visible change stale; Worker visible change valid and adopted; Validator/Reviewer visible change stale and not adopted; Workspace ID/root/InternalRoot failure always closed.
- [ ] Add production-path fixture proving existing Git Safety ignored/excluded verify artifacts do not falsely stale.
- [ ] Implement freshness rule before SQLite commit; UoW still reasserts persisted Team preconditions.
- [ ] Run focused Team/security tests; require GREEN.

---

## Task 6 — Transport-Neutral Team → Work Memory Mapping

**Files**
- Create: `packages/application/src/team-continuation.ts`
- Modify: `packages/application/src/team-service.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/infrastructure/src/team-transition-unit-of-work.ts`
- Modify: `packages/infrastructure/src/work-memory-repository.ts`
- Test: `packages/tests/src/team-mode.test.ts`
- Test: `packages/tests/src/work-memory-repository.test.ts`
- Test: `packages/tests/src/work-memory-service.test.ts`

**Interface**

```ts
export interface TeamContinuationInput {
  readonly mission: TeamMissionRecord;
  readonly workItems: readonly TeamWorkItemRecord[];
  readonly handoffs: readonly TeamRoleHandoffRecord[];
  readonly findings: readonly TeamReviewerFindingRecord[];
  readonly verification: readonly string[];
}

export function deriveTeamWorkMemoryCheckpoint(
  input: TeamContinuationInput,
): Result<WorkMemoryCheckpointDraft, AppError>;
```

No `ClientSession` parameter.

**Exact Work Memory mapping**

```text
planning:
  Plan Team mission / in_progress
  Plan the Team mission and submit plan_ready.

implementing:
  current Task / in_progress
  Work on Task {i}/{n}: {title}; then submit work_ready.

validating:
  current Task / in_progress
  Validate Task {i}/{n}: {title}; then submit validation_passed or validation_failed.

reviewing:
  current Task / in_progress
  Review Task {i}/{n}: {title}; then submit task_approved or changes_requested.

completed:
  final Task or Team mission completed / completed
  Team mission completed; review the Final Result.

blocked:
  current Task or Team mission blocked / blocked
  Resolve the Team blocker {reason}; start a new Team mission if more work is required.

stopped:
  current Task or Team mission stopped / blocked
  Team mission stopped; start a new Team mission to continue this Goal.
```

- [ ] RED: every Team state maps to an existing valid Work Memory status; planning uses the exact synthetic title without creating a fake Team work item.
- [ ] RED: oversized optional derived findings/decisions/artifacts are deterministically omitted while required Goal/task/nextAction remain; final checkpoint stays within existing 64 KiB and per-field/list/path limits.
- [ ] Reuse/share the authoritative Work Memory bounds logic; do not create weaker Team-only validation.
- [ ] Integrate derived checkpoint into `team.start`, every valid `team.submit`, and `team.stop` through the same UoW.
- [ ] Run Team + atomicity + Work Memory focused tests; require GREEN.

---

## Task 7 — Migration 006 and Fail-Closed Legacy Reconciliation

**Files**
- Modify: `packages/infrastructure/src/database.ts`
- Modify: `packages/infrastructure/src/team-repository.ts`
- Create: `packages/application/src/team-legacy-reconciler.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Test: `packages/tests/src/team-mode-migration.test.ts`

**Interface**

```ts
export interface TeamLegacyReconciler {
  reconcile(): Result<void, AppError>;
}

export function createTeamLegacyReconciler(
  dependencies: TeamLegacyReconcilerDependencies,
): TeamLegacyReconciler;
```

No `ClientSession`.

Current Task resolution order is exactly:
1. valid same-mission nonterminal `current_step_id`,
2. lowest-sequence `in_progress`,
3. lowest-sequence `pending`,
4. fail closed.

- [ ] Build migration-005-format DB fixtures for legacy planning, implementing, reviewing/reviewer with `reviewRound`, cross-mission `current_step_id`, and no-resolvable-Task cases.
- [ ] RED: legacy reviewing must not remain Reviewer-ready and Team/Work Memory must not contradict after migration.
- [ ] Add migration 006, rebuilding constrained tables if needed. Support validator/validating/richer Task statuses/per-Task `rework_count`/finding source/final result or internal reconciliation marker. Preserve historical old handoff strings as history only.
- [ ] Reconcile legacy `reviewing/reviewer -> validating/validator`; resolved Task `validating`; `reworkCount = clamp(reviewRound,0,3)`.
- [ ] No safe Task → terminal blocked / `UNSUPPORTED_OPERATION` / exact summary `Legacy Team mission cannot resolve a current Task`.
- [ ] Ensure Work Memory is reconciled before normal Team continuation is exposed; use the approved startup marker route if SQL migration alone cannot safely derive bounded continuation.
- [ ] Run migration + atomicity tests; require GREEN.

---

## Task 8 — Production MCP V3 Wiring, Still Exactly 26 Tools

**Files**
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Modify: `packages/application/src/team-capabilities.ts`
- Test: `packages/tests/src/team-mode.test.ts`
- Test: `packages/tests/src/team-mode-security.test.ts`
- Test: `packages/tests/src/work-memory-production.test.ts`

- [ ] RED: exact seven-outcome submit schema; old outcomes reject; Team tools exactly four; total tools exactly 26; no `team.advance`, `team.validate`, shell/process/network/delete authority.
- [ ] Compose TeamRepository + TeamTransitionUnitOfWork + TeamService + internal continuation/legacy reconciler while keeping public WorkMemoryService session-gated.
- [ ] Update MCP instructions concisely: `work.resume` first; if Team mission exists call `team.status`; continue routine legal Team assignments without user micro-management; stop at real Approval/user decision/blocker/tool/session limits.
- [ ] Do not alter the existing Work Resume guard authority.
- [ ] Run Team/security/Work Memory production tests; require GREEN.

---

## Task 9 — Team Activity/Audit Semantics

**Files**
- Modify: `packages/application/src/team-service.ts` or a focused Team event mapper if the existing Activity architecture calls for one
- Modify: `packages/desktop/src/pages/ActivityPage.tsx` only if renderer mapping is needed
- Test: `packages/tests/src/team-mode.test.ts`
- Test: `packages/tests/src/team-mode-desktop.test.ts`

Meaningful Team events: mission started, plan accepted, Task started, Worker handoff, validation pass/fail, review returned, Task completed, next Task started, blocked, completed, stopped, stale.

- [ ] RED: exactly one meaningful Team transition event per transition; successful `team.status` produces no primary Activity noise; no raw prompt/reasoning/file/diff/Verify/Serena/secret sentinel in audit or renderer DTO.
- [ ] Implement bounded safe Team event mapping. Required Team transition audit remains inside the UoW; underlying capability audit remains separate.
- [ ] Run Team/Desktop focused tests; require GREEN.

---

## Task 10 — Safe Desktop Team Observability

**Files**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/desktop/electron/team-controller.ts`
- Modify: `packages/desktop/src/global.d.ts` if needed
- Modify: `packages/desktop/src/pages/TeamPage.tsx`
- Modify: `packages/desktop/src/index.css` only as required
- Test: `packages/tests/src/team-mode-desktop.test.ts`

Renderer-safe Team view should show current role (including Validator), current Task, progress, current Task rework count, validation/review status, bounded `nextAction`, bounded `finalResultSummary`, findings/handoffs/timestamps.

- [ ] Load current repo Impeccable context for `TeamPage.tsx` before renderer edits.
- [ ] RED: DTO accepts Validator/progress/rework/Final Result and renderer still has no `team.start` or `team.submit` IPC authority.
- [ ] Implement minimal page delta; display `implementer` as `Worker`; keep status + fixed non-destructive Stop only.
- [ ] Run Desktop focused tests.
- [ ] Run final Impeccable detector once after UI is stable; record truthful result. Fix only material in-scope findings and rerun only if that renderer-visible fix invalidates the result.

---

## Task 11 — Complete Security/Data Attack Matrix

**Files**
- Modify: `packages/tests/src/team-mode-security.test.ts`
- Modify: `packages/tests/src/team-mode-atomicity.test.ts`
- Modify: `packages/tests/src/team-mode-migration.test.ts`

Prove at minimum:
- explicit foreign mission cannot be read/stopped,
- Team + Work Memory + Team audit never partially advance,
- TeamService/internal continuation has no `ClientSession`,
- caller cannot choose state/role/current or next Task/freshness,
- wrong-role and old/unknown outcomes reject,
- raw tool/Serena/executable/argv/cwd/env/shell reject,
- raw prompt/transcript/reasoning/file/diff/tool/Verify output reject,
- malformed/oversized work items/findings/verification reject before persistence,
- path hints fail closed on traversal/absolute/InternalRoot boundaries,
- no raw Verify/Serena/tool output in Team SQLite/Work Memory/audit/renderer,
- Workspace switch/rebinding fail closed,
- fresh MCP session still requires `work.resume`,
- Team state does not bypass Policy/Approval,
- Reviewer cannot approve before Validator pass,
- Task skip/reorder impossible,
- per-Task rework limit enforced,
- terminal missions do not reopen,
- one active mission per Workspace,
- every Team state has valid Work Memory mapping,
- legacy Reviewer cannot bypass Validator,
- legacy Task resolution cannot cross missions,
- malformed legacy mission fails closed,
- migrated Team and Work Memory cannot contradict,
- production MCP remains exactly 26.

Run:

```bash
pnpm test -- \
  packages/tests/src/team-mode-security.test.ts \
  packages/tests/src/team-mode-atomicity.test.ts \
  packages/tests/src/team-mode-migration.test.ts
```

Require PASS.

---

## Task 12 — Real Home-PC Personal Alpha Team Acceptance

**Files**
- Create: `packages/tests/src/team-mode-personal-alpha.acceptance.test.ts`

Follow the repo's existing opt-in Home-PC acceptance pattern and use a disposable/test Git Workspace plus the real production MCP path.

Required scenario:
1. Fresh MCP session; Team project call before `work.resume` → resume-required/no inner dispatch.
2. `work.resume`.
3. `team.start(goal)`; Work Memory immediately contains exact planning mapping.
4. Planner submits at least two Tasks.
5. Worker performs a controlled real edit through existing Workspace/semantic tools.
6. `work_ready` adopts trusted changed Git baseline.
7. Validator uses real `verify.run` through current ASK/exact-one-time Approval.
8. Exercise one controlled validation failure → same Task Worker rework + count increment.
9. Worker fixes; `work_ready`; Validator passes.
10. Reviewer approves Task 1 → Task 2 assigned automatically.
11. Finish Task 2 Worker → Validator → Reviewer → completed Final Result.
12. Separate in-progress fresh-session variant: pre-resume blocked, `work.resume`, then `team.status` returns exact role/Task/nextAction; no privileged replay.
13. Cross-Workspace production attack: active A + mission B → status/stop fail closed/no leak.
14. Atomic failure injection: checkpoint or Team audit failure leaves Team + Work Memory at prior commit.
15. Inspect SQLite/audit/renderer for no raw prompt/reasoning/file/diff/Verify/Serena/secret sentinel.
16. `tools/list` = 26, Team tools = 4, `.serena/` still local-only.

Record exact pass/skip counts.

---

## Task 13 — Final Verification, Review, Delivery, STOP

Run once after implementation stabilizes.

- [ ] Focused Team suite:

```bash
pnpm test -- \
  packages/tests/src/team-mode.test.ts \
  packages/tests/src/team-mode-security.test.ts \
  packages/tests/src/team-mode-atomicity.test.ts \
  packages/tests/src/team-mode-migration.test.ts \
  packages/tests/src/team-mode-desktop.test.ts
```

- [ ] Relevant Work Memory, Workspace/Git, Restricted Verify, MCP surface, Tool Kernel, Basic Approval regressions. Record exact counts.
- [ ] Real Home-PC Team acceptance. Record exact counts.
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] Full repo once: `pnpm test`
- [ ] Production build: `pnpm build`
- [ ] `git diff --check`
- [ ] JIT final Security/Data + code-review gate; require `PASS / PASS / PASS`, 0 blockers.
- [ ] Explicitly re-check atomic UoW, Workspace binding, exact seven outcomes, exact 26 tools, Work Memory mapping/bounds, legacy Reviewer migration, and no authority bypass.
- [ ] Reroute JIT to repo `writing-for-agents`; update only Team Mode current-state hunk in tracked `SUD_D_HANDOFF.md`. Preserve the unrelated local Restricted Execute note without staging it.
- [ ] Inspect staged/unstaged scope; `.serena/` remains local-only.
- [ ] `git diff --cached --check`.
- [ ] Run repo staged secret/sensitive-output scan; require PASS.
- [ ] One milestone commit, suggested message: `feat: complete team mode personal alpha mvp`.
- [ ] Push/fetch:

```bash
git push origin master
git fetch origin
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count HEAD...origin/master
```

Require `HEAD == origin/master`, divergence `0 0`.

Final report includes exact Team facade/outcomes, tool counts, atomicity, Workspace binding, Task/rework/Validator flow, Work Memory mapping/resume, legacy migration, Home-PC acceptance, Impeccable result, focused/relevant/full counts, lint/typecheck/build/diff, Security/Data/Standards/Spec, staged scope/secret scan, commit SHA, push, equality/divergence, and preservation of local Restricted Execute note + `.serena/`.

**STOP after Team Mode Personal Alpha MVP closes. Do not start real-world dogfooding or any later milestone until the user explicitly authorizes it.**

---

## Plan Self-Review

- V3 review gaps are explicitly covered: atomic UoW (Task 1), Workspace mission binding (Task 2), pinned vocabulary/state (Task 3), task/rework loop (Task 4), freshness (Task 5), total Work Memory mapping/transport-neutral seam (Task 6), fail-closed legacy migration (Task 7).
- MCP surface stays 26 (Tasks 8/11/12/13).
- Renderer authority remains status/stop only (Task 10).
- Security attack matrix is explicit (Task 11).
- Real ChatGPT-compatible production flow is explicit (Task 12).
- Placeholder scan complete; all implementation requirements are concrete.
- Interfaces introduced by the plan are defined in the task that produces them.
- No task authorizes out-of-scope shell/Network/Delete/Computer Use/parallel-agent/model-runtime work.
