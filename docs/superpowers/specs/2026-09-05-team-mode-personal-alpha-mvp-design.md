# SUD-D Team Mode Personal Alpha MVP — Design V3

Date: 2026-09-05
Status: **REVIEW CANDIDATE — six architecture amendments incorporated; implementation is not authorized until this exact revision is approved**
Baseline: `e4d83c5ff006361df173f3b81b76644412a22e7f`
Project: SUD-D

## 0. Review amendments incorporated

This revision incorporates the four baseline-review amendments as architecture requirements, not optional hardening:

1. **Atomic Team Transition Unit-of-Work**
   - every Team state-changing transition commits Team mission/task/findings/handoff state, the derived Work Memory checkpoint, and the required Team transition audit as one SQLite unit
   - any failure rolls back the whole transition
   - compensation after a partial commit is not an accepted design

2. **Transport-neutral Team ↔ Work Memory integration**
   - `ClientSession` remains in the public/session-gated Work Memory service
   - `TeamService` does not receive or synthesize an MCP `ClientSession`
   - Team transitions use a trusted internal persistence/continuation seam capable of participating in the same transaction

3. **Mandatory mission-to-active-Workspace binding**
   - `team.status({missionId})`, `team.stop({missionId})`, and all mission-targeted operations must prove `mission.workspaceId === activeWorkspace.id`
   - mismatch fails closed before returning mission metadata or mutating mission state

4. **Pinned public transition vocabulary and freshness semantics**
   - public `team.submit` outcomes are fixed in this design
   - caller never supplies state, role, current Task, arbitrary task selector, or freshness selector
   - persisted roles are fixed
   - only Worker/`implementer` may intentionally adopt changed trusted project freshness
   - Planner, Validator, and Reviewer require trusted project freshness match
   - Git Safety's existing ignored/excluded behavior defines verify-artifact tolerance

5. **Total Team → Work Memory mapping**
   - every Team state has one valid existing Work Memory `task.status`
   - planning uses a fixed synthetic bounded task title because no current Team Task exists yet
   - every Team state has a deterministic bounded `nextAction`
   - this milestone does not expand the Work Memory public status enum

6. **Fail-closed legacy Reviewer migration**
   - an active legacy `reviewing/reviewer` mission cannot remain directly reviewable because it has no Validator-pass fact
   - it migrates to `validating/validator` for a deterministically resolved current Task
   - legacy mission-level `reviewRound` maps to that Task's bounded `reworkCount`
   - if no safe current Task can be resolved, the legacy active mission becomes terminal `blocked` rather than bypassing Validator

These six items are mandatory TDD slices and mandatory final security acceptance.

---

## 1. Purpose

Evolve the existing sequential Team Mode implementation into the first useful Personal Alpha orchestration loop that can take one user Goal and carry project work through planning, task execution, validation, review, bounded rework, automatic next-task progression, Work Memory checkpointing, resume, and final completion.

Target flow:

```text
User Goal
→ SUD-D Lead / Orchestrator
→ Planner creates bounded ordered Tasks
→ Worker / Specialist performs current Task through existing secure tools
→ Validator verifies through existing secure verification/read tools
→ Reviewer accepts or requests changes
→ failed validation/review returns the same Task for bounded rework
→ accepted Task advances automatically to the next Task
→ SUD-D writes bounded Work Memory checkpoints at meaningful transitions
→ a new ChatGPT conversation can work.resume + team.status and continue
→ final accepted Task produces a bounded Final Result
```

This MVP targets **normal ChatGPT + SUD-D MCP**.

It does not require:
- Codex
- SUD-D calling the OpenAI API
- a SUD-D-owned model runtime
- independent concurrent model processes
- background autonomous agents

Planner, Worker, Validator, and Reviewer are sequential logical roles performed by the connected ChatGPT session. SUD-D owns orchestration state, transition authority, persistence, checkpoint derivation, security boundaries, and next-assignment metadata.

---

## 2. Baseline and evolution strategy

This is an **evolution of the existing Team subsystem**, not a rewrite.

At the baseline, SUD-D already contains:
- `team.start`
- `team.status`
- `team.submit`
- `team.stop`
- Team domain/state vocabulary
- `TeamService`
- SQLite Team persistence
- Desktop Team controller / IPC / page
- Team tests/security tests

The same baseline also contains:
- Semantic Read
- Semantic Write
- Restricted Verify
- Work Memory / Automatic Resume

Reuse these seams. Do not create a second Team persistence system or a second memory system.

### Superseded prior Team design

This design supersedes:

`docs/superpowers/specs/2026-09-02-team-mode-mvp-no-execute-design.md`

only where that older document conflicts with capabilities that are now shipped and approved.

Still authoritative:
- sequential logical roles
- one active mission per Workspace
- Team orchestration grants no direct host privilege
- Tool Kernel / Policy / Approval / Audit remain authoritative
- bounded structured persistence
- no raw prompt/reasoning/file/diff/secret persistence
- bounded review/rework
- non-destructive stop
- no direct provider/model API runtime
- no parallel agents
- no generic shell
- no Network/Delete/Recovery bypass

Superseded:
- fixed test/lint/typecheck/build work no longer blocks merely because process execution is needed
- `verify.run(test|lint|typecheck|build)` now exists through the approved Restricted Verify path
- Team continuity must reuse Work Memory / Automatic Resume
- Team must progress individual Tasks, not treat the whole plan as one implementation step

General/arbitrary process execution remains unavailable.

---

## 3. Core architecture

```text
Connected ChatGPT
        ↓
team.* orchestration facade
        ↓
TeamService / Lead transition rules
        ↓
trusted Team Transition Unit-of-Work
        ├─ Team mission/task/findings/handoff writes
        ├─ derived Work Memory checkpoint write
        └─ Team transition audit write
        ↓
SQLite commit or rollback as one unit

Separately, for actual project work:

Connected ChatGPT
→ Workspace / Git / code.* / verify.run / work.resume
→ Tool Kernel
→ Policy
→ Approval where applicable
→ Execution
→ Audit
```

Team Mode owns **coordination**, not privileged execution.

The connected ChatGPT performs the logical role and invokes existing project tools separately.

`team.submit` records a bounded logical-role result and requests one legal state transition. It never carries arbitrary executable details, raw tool selectors, raw file content, raw diff content, or a general command.

---

## 4. Atomic Team Transition Unit-of-Work

### 4.1 Why this is required

A Team transition is semantically one product event.

For example:

```text
Worker work_ready
→ current Task enters validating
→ mission role becomes validator
→ Worker handoff is recorded
→ trusted current freshness becomes the new baseline
→ Work Memory says "Validator: validate Task N"
→ Team transition audit is recorded
```

It is invalid for only some of those facts to commit.

### 4.2 Transaction boundary

Every state-changing Team operation must use one trusted infrastructure transaction boundary:

- `team.start`
- every valid `team.submit`
- `team.stop`

`team.status` remains read-only.

The transaction must include all writes required by that transition:

- Team mission row
- current Task/work-item rows
- plan replacement when Planner completes planning
- Validator/Reviewer finding replacement/addition as applicable
- role handoff/timeline metadata
- derived Work Memory checkpoint
- required Team transition audit record

If any required write fails:
- rollback all writes
- return a stable failure
- do not attempt a compensating "undo" transaction

### 4.3 Repository design rule

Do not compose an atomic Team transition by chaining repository methods that independently open/commit their own transactions.

The implementation must provide a single trusted Team transition writer/UoW or transaction-scoped internal writers that share one `better-sqlite3` transaction.

Public repository APIs may remain for independent reads, but the Team transition path must not depend on nested autonomous persistence boundaries.

### 4.4 Precondition / concurrent transition rule

Inside the transaction, the transition must re-assert that the persisted mission still matches the state that TeamService validated:

- mission id
- active Workspace id
- expected state
- expected current role
- expected current Task
- expected rework count/freshness baseline where relevant

An internal revision/CAS mechanism is acceptable, but no caller-controlled revision/state selector may become public authority.

If the expected persisted state changed:
- fail closed
- commit nothing

### 4.5 External Git freshness vs SQLite atomicity

Trusted Git state is external to SQLite and cannot be made physically atomic with the database transaction.

Personal Alpha contract:
1. resolve active Workspace identity
2. compute trusted Git/Workspace freshness immediately before transition commit
3. apply the role-specific freshness rule
4. enter the SQLite UoW
5. re-assert the persisted Team precondition
6. commit Team + Work Memory + Team audit atomically

Do not build enterprise filesystem event attribution or distributed transactions.

---

## 5. Transport-neutral Work Memory integration

### 5.1 Public Work Memory service remains session-gated

Public MCP semantics remain:

```text
work.resume
work.checkpoint
```

and use the existing per-session resume guard.

No Team change grants a bypass to public Work Memory authority.

### 5.2 TeamService must not depend on MCP `ClientSession`

`TeamService` remains transport-neutral and must not:
- accept an MCP `ClientSession`
- construct a fake session
- synthesize a session id
- invoke public session-gated `WorkMemoryService.checkpoint(...)`

Desktop Team stop/status must work through the same Team domain/application seam without pretending to be an MCP client.

### 5.3 Trusted internal continuation seam

The Team transition path receives a trusted internal continuation/checkpoint writer that:
- accepts a **derived bounded checkpoint draft**, not public arbitrary memory input
- writes only the active Team mission's Workspace checkpoint
- participates in the same SQLite Team transition transaction
- performs the same storage bounds/sanitization invariants required by Work Memory
- does not expose a new MCP/renderer API

The public Work Memory service and Team internal checkpoint writer may share low-level validation/serialization helpers, but their authority boundaries remain distinct.

### 5.4 Source of truth

- detailed mission/task/rework state → Team persistence
- bounded cross-chat continuation view → Work Memory current checkpoint

Work Memory is derived from committed Team state; it must not become a competing orchestration state machine.

---

## 6. Mandatory active-Workspace mission binding

Every Team operation is scoped to the **currently active Workspace**.

For an explicit `missionId`, the service must:

```text
resolve exactly one active Workspace
→ load mission
→ require mission.workspaceId === activeWorkspace.id
→ only then return/mutate mission
```

This requirement applies to at least:
- `team.status({missionId})`
- `team.stop({missionId})`

and to any future internal mission-targeted helper.

Failure semantics:
- unknown mission → normal not-found result
- mission belongs to another Workspace → stable fail-closed Workspace mismatch/not-found-style result
- do not leak the other Workspace's goal, tasks, role, findings, timestamps, or other mission metadata

A Workspace switch invalidates continuation of the former Workspace until that Workspace is active again and its session is properly resumed.

No Team mission id is a cross-Workspace capability token.

---

## 7. Public MCP contract

Preserve exactly four Team tools:

- `team.start`
- `team.status`
- `team.submit`
- `team.stop`

Do not add `team.advance`, `team.validate`, or a second orchestration facade.

Expected production MCP surface remains **exactly 26 tools** unless a separately approved architecture change says otherwise.

### 7.1 `team.start({ goal })`

Requirements:
- active Workspace exists
- current MCP session has satisfied the existing `work.resume` bootstrap guard before project-scoped Team use
- one active Team mission per Workspace
- bounded sanitized Goal
- initial trusted freshness captured
- mission starts in `planning / planner`
- initial Work Memory checkpoint and Team start audit commit atomically with mission creation

### 7.2 `team.status({ missionId? })`

Returns safe orchestration metadata:
- mission id
- Goal summary
- state
- current role
- current Task
- Task progress
- current rework count
- bounded findings/evidence summaries
- blocked reason
- safe freshness kind/reference
- `nextAction` / assignment summary
- bounded Final Result summary when completed
- timestamps

It must never return:
- raw prompts/transcripts
- chain-of-thought/private reasoning
- file contents
- diff contents
- raw tool results
- raw verify output
- raw Serena output
- credentials/secrets

Explicit mission lookup must pass the active-Workspace binding rule first.

### 7.3 `team.stop({ missionId? })`

Stops the active mission non-destructively.

It does not:
- reset/revert files
- reset/revert Git
- delete Work Memory
- revoke unrelated approvals

The stopped Team state + derived stopped Work Memory checkpoint + Team stop audit commit atomically.

Desktop may call the fixed-purpose Team stop application seam without MCP `ClientSession`; the operation still obeys active-Workspace binding.

---

## 8. Pinned public `team.submit` vocabulary

The public outcomes for this MVP are exactly:

```text
plan_ready
work_ready
validation_passed
validation_failed
task_approved
changes_requested
blocked
```

Do not retain old public aliases such as `implementation_ready` or `complete` as silent alternate paths unless a separately reviewed compatibility need is proven.

The strict discriminated-union intent is:

### Planner

```ts
{
  outcome: 'plan_ready',
  summary: string,
  workItems: Array<{
    title: string,
    targetPathHint?: string
  }>
}
```

### Worker / persisted `implementer`

```ts
{
  outcome: 'work_ready',
  summary: string
}
```

### Validator passed

```ts
{
  outcome: 'validation_passed',
  summary: string,
  verification?: string[]
}
```

`verification` is bounded semantic evidence only, such as:
- `test passed`
- `typecheck passed`

Never raw stdout/stderr/tool output.

### Validator failed

```ts
{
  outcome: 'validation_failed',
  summary: string,
  verification?: string[],
  findings: Array<{
    severity: 'low' | 'medium' | 'high',
    summary: string,
    targetPathHint?: string,
    expectedCorrection?: string
  }>
}
```

### Reviewer approved

```ts
{
  outcome: 'task_approved',
  summary: string
}
```

### Reviewer requested changes

```ts
{
  outcome: 'changes_requested',
  summary: string,
  findings: Array<{
    severity: 'low' | 'medium' | 'high',
    summary: string,
    targetPathHint?: string,
    expectedCorrection?: string
  }>
}
```

### Any active role blocked

```ts
{
  outcome: 'blocked',
  blockedReason: TeamBlockedReason,
  summary: string
}
```

### Forbidden public selectors

`team.submit` must reject fields that attempt to select:
- `state`
- `nextState`
- `role`
- `nextRole`
- `taskId`
- `currentTaskId`
- arbitrary work-item id/sequence
- Workspace id/root
- freshness value/status id/head sha
- raw tool name
- Serena tool name
- executable
- argv
- cwd
- env
- shell
- raw prompt/transcript/reasoning
- raw file/diff/tool/verify output

SUD-D derives the current role and current Task from authoritative Team state.

---

## 9. Persisted logical roles

Persisted Team roles are exactly:

```text
planner
implementer
validator
reviewer
```

UI/user-facing copy may display:

```text
implementer → Worker
```

Do not add `lead` as a persisted worker role.

Lead/Orchestrator is the transition behavior of SUD-D itself.

---

## 10. Mission and Task state model

### Mission states

```text
planning
implementing
validating
reviewing
completed
blocked
stopped
```

### Task statuses

```text
pending
in_progress
validating
reviewing
done
blocked
```

### Initial flow

```text
team.start
→ planning / planner
```

Planner:

```text
plan_ready
→ first Task = in_progress
→ implementing / implementer
```

Worker:

```text
work_ready
→ current Task = validating
→ validating / validator
```

Validator:

```text
validation_passed
→ current Task = reviewing
→ reviewing / reviewer
```

Validator failure:

```text
validation_failed
→ reworkCount += 1
→ same Task = in_progress
→ implementing / implementer
```

Reviewer:

```text
changes_requested
→ reworkCount += 1
→ same Task = in_progress
→ implementing / implementer
```

Reviewer approval:

```text
task_approved
→ current Task = done
→ if another pending Task:
     next Task = in_progress
     implementing / implementer
  else:
     mission = completed
```

The user does not have to manually tell the system to advance to the next Task.

---

## 11. Bounded rework

Rework is tracked **per current Task**.

One return-to-Worker cycle is caused by:
- `validation_failed`
- `changes_requested`

Maximum:
- **3 return-to-Worker cycles per Task**

If another return is requested after the limit:
- mission transitions to `blocked`
- blocked reason = `REVIEW_LOOP_LIMIT`
- atomic transition still includes the blocked Work Memory checkpoint and audit

A new Task starts with rework count `0`.

Do not loop indefinitely.

---

## 12. Pinned freshness semantics

Freshness is authoritative trusted project state from existing Workspace/Git Safety behavior.

No caller supplies freshness.

### 12.1 Start

`team.start` captures the initial trusted freshness baseline.

### 12.2 Planner

Planner is read-only with respect to project mutation.

Before `plan_ready`:
- current trusted freshness **must match** mission baseline
- mismatch → stale/re-evaluation path
- no plan transition commits

### 12.3 Worker / `implementer`

Worker is the **only role where project-visible mutation is expected**.

Before entering Worker, Team has an authoritative baseline.

For valid `work_ready`:
- active Workspace identity/root must still be valid
- current trusted Git/Workspace freshness is recomputed
- it is **adopted as the new Team baseline**
- changed Git status/head is not itself stale merely because Worker intentionally worked
- the new baseline commits atomically with Worker handoff + transition + Work Memory + Team audit

Do not attempt to prove which exact process caused each filesystem/Git change.

### 12.4 Validator

Validator begins from the Worker-adopted baseline.

Validator may invoke existing `verify.run(test|lint|typecheck|build)` separately through normal SUD-D security.

For `validation_passed` or `validation_failed`:
- trusted project freshness must still match the Validator-entry baseline
- existing Git Safety ignored/excluded behavior defines acceptable generated verify artifacts
- if verification creates **project-visible trusted Git change**, treat it as stale
- stale Validator result must re-evaluate rather than silently adopt the changed state

Validator never adopts a changed project-visible Git baseline.

### 12.5 Reviewer

Reviewer receives the same trusted baseline that passed Validator.

For `task_approved` or `changes_requested`:
- trusted project freshness must match
- project-visible change after validation → stale/re-evaluation
- Reviewer never adopts changed freshness

### 12.6 Blocked / stop

A non-mutating terminal `blocked` or `stop` transition must still:
- bind the mission to the active Workspace
- fail closed on Workspace identity/rebinding failure

A Git freshness match is not required merely to record a safe blocked/stop terminal state.

### 12.7 Workspace identity always dominates

Regardless of role:
- Workspace id mismatch
- canonical-root rebinding
- InternalRoot violation
- missing active Workspace

fail closed.

---

## 13. Restricted Verify integration

Validator may use the existing approved capability:

```text
verify.run(test)
verify.run(lint)
verify.run(typecheck)
verify.run(build)
```

Rules:
- Team tools do not spawn a process
- connected ChatGPT calls `verify.run` separately
- existing Policy remains authoritative
- current exact Approval binding remains authoritative
- Team role/state grants no approval bypass
- raw verify output is never copied into Team persistence
- only bounded semantic verification summaries may enter `team.submit`

If work requires arbitrary process behavior outside Restricted Verify:
- block `EXECUTE_REQUIRED`

If work requires network:
- block `NETWORK_REQUIRED`

If work requires Delete:
- block `DELETE_REQUIRED`

---

## 14. Work Memory derivation — total mapping

Team Mode must reuse the existing Work Memory schema exactly as shipped.

The existing Work Memory task statuses remain:

```text
pending | in_progress | blocked | completed
```

This Team milestone does **not** add `validating`, `reviewing`, `done`, or `stopped` to the public Work Memory status enum.

Every committed Team state must map to one valid Work Memory checkpoint. There is no partial/undefined mapping.

### 14.1 Canonical mapping table

| Team mission state / role | Team current Task | Work Memory `task.title` | Work Memory `task.status` | Deterministic `nextAction` |
| --- | --- | --- | --- | --- |
| `planning / planner` | none required | `Plan Team mission` | `in_progress` | `Plan the Team mission and submit plan_ready.` |
| `implementing / implementer` | required | current Task title | `in_progress` | `Work on Task {i}/{n}: {title}; then submit work_ready.` |
| `validating / validator` | required | current Task title | `in_progress` | `Validate Task {i}/{n}: {title}; then submit validation_passed or validation_failed.` |
| `reviewing / reviewer` | required | current Task title | `in_progress` | `Review Task {i}/{n}: {title}; then submit task_approved or changes_requested.` |
| `completed` | final Task if available | final Task title, otherwise `Team mission completed` | `completed` | `Team mission completed; review the Final Result.` |
| `blocked` | current Task if available | current Task title, otherwise `Team mission blocked` | `blocked` | `Resolve the Team blocker {reason}; start a new Team mission if more work is required.` |
| `stopped` | current Task if available | current Task title, otherwise `Team mission stopped` | `blocked` | `Team mission stopped; start a new Team mission to continue this Goal.` |

`{i}`, `{n}`, `{title}`, and `{reason}` are derived from authoritative Team state, sanitized, and bounded before persistence.

### 14.2 Planning checkpoint

`team.start` must create a Work Memory checkpoint even though a semantic Team Task does not exist yet.

Use exactly:

```text
task.title  = "Plan Team mission"
task.status = "in_progress"
nextAction  = "Plan the Team mission and submit plan_ready."
```

Do not invent a hidden Team work item solely to satisfy Work Memory.

### 14.3 Active Task mapping

For `implementing`, `validating`, and `reviewing`:
- Team must have one authoritative current Task
- Work Memory uses that Task's bounded title
- Work Memory status remains `in_progress`
- the logical role distinction lives in `nextAction`, Team persistence, and `team.status`

This avoids expanding the Work Memory public schema while keeping resume deterministic.

### 14.4 Task completion

When Reviewer approves a Task and another pending Task exists, the atomic transition:
- marks the old Task `done`
- selects the next Task
- marks the next Task `in_progress`
- writes Work Memory for the **new current Task** with status `in_progress`
- puts the approved Task in bounded `completed`

There is no intermediate committed Work Memory checkpoint whose current Task is the old `done` Task.

When Reviewer approves the final Task:
- mission becomes `completed`
- Work Memory uses the final Task title when available
- Work Memory status = `completed`
- bounded Final Result / completion summary is represented through existing bounded fields
- `nextAction = "Team mission completed; review the Final Result."`

### 14.5 Blocked and stopped mapping

Work Memory has no `stopped` status.

Therefore:
- Team `blocked` → Work Memory `blocked`
- Team `stopped` → Work Memory `blocked`

The distinction remains authoritative in Team mission state and is explicit in `nextAction`.

A blocked/stopped mission is terminal and is never silently reopened.

### 14.6 Other Work Memory fields

At each successful meaningful Team transition, the same SQLite UoW writes one derived bounded Work Memory checkpoint:

- `goal` ← mission Goal summary
- `task` ← mapping above
- `completed` ← bounded titles/summaries of completed Tasks
- `decisions` ← bounded plan/handoff decisions useful for continuation
- `blockers` ← current bounded blocker(s)
- `nextAction` ← exact template above
- `artifacts` ← safe workspace-relative hints plus existing trusted bounded Git enrichment rules
- `verification` ← bounded semantic Validator evidence
- trusted Git ref ← current accepted Team freshness where compatible
- `updatedAt` ← transition time

The final derived checkpoint must pass the existing Work Memory per-field/list/path bounds and **64 KiB aggregate bound** before the UoW may commit.

If deterministic derived optional data would exceed the existing Work Memory bound:
- omit excess optional derived items using the same bounded rules already established for Work Memory
- do not expand public bounds
- do not drop required `goal`, `task`, or `nextAction`

### 14.7 Resume flow

```text
new ChatGPT conversation
→ connect SUD-D
→ work.resume
→ bounded Resume Context indicates Team work is in progress or terminal
→ team.status
→ exact current role/current Task/nextAction
→ continue or report terminal state
```

A fresh session never auto-replays privileged actions.

No ChatGPT conversation id is required.

---

## 15. ChatGPT runtime semantics

This MVP targets one connected ChatGPT session.

SUD-D does not call ChatGPT/OpenAI APIs itself.

Normal active-session loop:

```text
ChatGPT calls team.status
→ SUD-D returns current role + current Task + nextAction
→ ChatGPT performs that role using existing secure MCP tools
→ ChatGPT calls team.submit
→ SUD-D validates freshness/transition
→ one atomic Team transition commits
→ ChatGPT follows next assignment
→ repeat
```

SUD-D cannot force ChatGPT to continue after the model response/session ends.

Therefore:
- no background-daemon AI claim
- no model execution before the user's first prompt
- Work Memory makes interruption resumable
- during an active response/session, the AI should continue routine legal assignments until completion, Approval wait, true user-decision boundary, blocking condition, tool/session limit, or user stop

MCP/server instructions may encourage this behavior but do not replace server-side transition enforcement.

---

## 16. Persistence schema evolution and legacy migration

Use a new migration; do not mutate old migration text in-place.

The migration must support at least:
- `validator` role
- `validating` mission state
- richer Task statuses
- per-Task `reworkCount`
- Validator/Reviewer finding source
- bounded final result summary if stored on mission
- any internal concurrency/precondition field chosen by implementation

### 16.1 New authoritative role/state vocabulary

After migration, active V3 orchestration uses:

```text
roles:
planner | implementer | validator | reviewer

mission states:
planning | implementing | validating | reviewing | completed | blocked | stopped
```

Legacy public outcome strings stored in historical handoff rows remain history only. They do not become accepted aliases for the new public `team.submit` vocabulary.

### 16.2 Deterministic legacy current-Task resolution

For a legacy active mission that needs a current Task, resolve exactly one Task in this order:

1. `current_step_id` if it references a work item belonging to that same mission and the item is not terminal `done`/`blocked`
2. otherwise the lowest-sequence `in_progress` work item belonging to that mission
3. otherwise the lowest-sequence `pending` work item belonging to that mission
4. otherwise **resolution fails closed**

Never select a Task from another mission.

If current-Task resolution fails for a legacy active state that requires a Task:
- migrate the mission to terminal `blocked`
- blocked reason = `UNSUPPORTED_OPERATION`
- bounded safe summary = `Legacy Team mission cannot resolve a current Task`
- do not fabricate a Task
- do not bypass Validator/Reviewer invariants

### 16.3 Legacy active-state mapping

Legacy:

```text
planning / planner
```

maps to:

```text
planning / planner
```

No current Task is required yet.

Legacy:

```text
implementing / implementer
```

maps to:

```text
implementing / implementer
```

with the deterministically resolved current Task set to `in_progress`.

Legacy:

```text
reviewing / reviewer
```

**must not remain Reviewer-ready.**

It maps to:

```text
validating / validator
```

for the deterministically resolved current Task, whose Task status becomes `validating`.

Reason:
- legacy Team state has no trusted `validation_passed` fact
- preserving direct Reviewer state would permit Validator bypass
- rejecting Reviewer approval without migration would strand the mission

The migrated mission must pass Validator before entering the new Reviewer state.

Terminal legacy mission states:

```text
completed | blocked | stopped
```

remain terminal and cannot reopen.

### 16.4 Legacy `reviewRound` → per-Task `reworkCount`

The baseline uses mission-level `reviewRound`; V3 uses per-current-Task rework.

For an active legacy `implementing` or `reviewing` mission with a resolved current Task:

```text
currentTask.reworkCount = clamp(legacyMission.reviewRound, 0, 3)
```

All other migrated work items begin with:

```text
reworkCount = 0
```

The old mission-level `review_round` column may remain for historical/schema compatibility, but it is no longer authoritative for V3 transition decisions.

For terminal legacy rows, historical `review_round` may remain unchanged; it grants no transition authority.

### 16.5 Legacy work-item statuses

For the resolved active Task:
- implementing legacy mission → `in_progress`
- reviewing legacy mission → `validating`

Other non-terminal legacy items remain `pending` unless their stored state already truthfully indicates completed/blocked history.

Do not infer that multiple old Tasks were completed merely because the mission reached legacy Reviewer.

### 16.6 Work Memory consistency during migration

Active legacy-state transformation changes resume semantics, especially:

```text
reviewing/reviewer → validating/validator
```

Therefore a migrated active Team mission must not leave Work Memory claiming a contradictory next role.

The database migration/reconciliation path must ensure that the current Work Memory checkpoint is replaced/advanced to the **V3 total mapping** for the migrated Team state before normal runtime continuation is exposed.

This migration/reconciliation write:
- uses the same existing Work Memory bounds
- does not require or synthesize an MCP `ClientSession`
- does not invent raw Git data
- may omit trusted Git reference if it cannot be safely revalidated during database migration
- must not expose the migrated mission for normal continuation while Team state and Work Memory disagree

A practical implementation may:
- perform Team-row + Work-Memory-row transformation in the same database migration transaction, or
- mark the migrated mission as requiring one internal startup reconciliation before `team.status` can expose it

Either implementation must fail closed and produce the same externally visible V3 state.

### 16.7 Migration tests are mandatory

Prove at minimum:
- legacy planning remains Planner and receives planning Work Memory mapping
- legacy implementing resolves the correct current Task deterministically
- legacy reviewing becomes Validator, not Reviewer
- migrated Reviewer cannot submit `task_approved` before Validator pass
- mission-level `reviewRound` clamps into current Task `reworkCount`
- malformed/cross-mission `current_step_id` cannot select another mission's Task
- no resolvable current Task → terminal `UNSUPPORTED_OPERATION` block
- migrated Team and Work Memory continuation states do not contradict each other

---

## 17. Activity and audit

Activity should show useful Team milestones:
- Team mission started
- plan accepted
- Task started
- Worker handoff
- validation passed
- validation failed
- review returned
- Task completed
- next Task started
- mission blocked
- mission completed
- mission stopped
- stale state detected

Routine successful `team.status` reads should not spam Activity.

The required Team transition audit record is part of the atomic UoW.

Audit contains safe bounded metadata only:
- mission id
- Workspace id
- role/state
- Task sequence/id only if safe internal id is already accepted
- result/reason code
- rework count
- timestamp

Never audit raw prompts, reasoning, file content, diff, verify output, Serena output, executable details, or secrets.

Existing Tool Kernel audit for underlying project capabilities remains separate and authoritative for those capabilities.

---

## 18. Desktop Team UX

Evolve the existing Team page only.

Show:
- Goal summary
- state
- current role (`implementer` displayed as Worker)
- current Task
- Task progress, e.g. `2 / 5`
- rework count
- validation/review status
- blocked reason
- bounded handoff/timeline
- Final Result summary
- non-destructive Stop Team

Keep renderer authority narrow:
- observability
- fixed-purpose non-destructive Stop

Do not add renderer-side start/submit authority unless a separate product requirement is approved.

No:
- chat UI
- agent avatars/persona editor
- workflow graph editor
- scheduler
- parallel-agent monitor
- terminal
- custom team preset builder

Renderer DTOs contain safe metadata only.

---

## 19. Security / authority invariants

No Team role, state, Task, mission id, or Lead status grants new project authority.

Actual project work remains through existing approved capabilities:
- Workspace File
- Git Safety
- Semantic Read
- Semantic Write
- Restricted Verify
- Work Memory public bootstrap/resume

Those keep their existing:
- Workspace/InternalRoot containment
- Tool Kernel
- Policy
- Approval
- audit
- redaction
- fixed contracts

Team remains orchestration-only.

No direct Serena passthrough.
No raw tool selector.
No general shell / `code.run`.
No process-manager API.
No Network.
No Delete/Recovery shortcut.
No caller-supplied executable/argv/cwd/env/shell.

---

## 20. Mandatory TDD order

Implementation must begin with the architecture risks found in baseline review.

### Slice 1 — Atomic transition UoW

RED first:
- fail after Team sub-write but before checkpoint → nothing persists
- fail during checkpoint write → Team/handoff/findings/audit do not persist
- fail during Team transition audit → Team/checkpoint do not persist
- concurrent/stale expected Team state → no partial transition

GREEN:
- one SQLite unit commits all required transition facts

### Slice 2 — missionId active-Workspace binding

RED first:
- active Workspace A + missionId belonging to Workspace B
- `team.status({missionId})` cannot read B metadata
- `team.stop({missionId})` cannot stop B mission

GREEN:
- explicit mission lookup is bound to active Workspace before return/mutation

### Slice 3 — pinned domain/public vocabulary

RED first:
- old/unknown outcomes rejected
- wrong-role outcomes rejected
- state/role/task/freshness selectors rejected

GREEN:
- exact seven outcomes
- roles `planner|implementer|validator|reviewer`
- legal transition matrix

### Slice 4 — Task-aware progression and bounded rework

RED/GREEN:
- plan creates ordered Tasks
- first Task starts
- Worker → Validator
- Validator fail → same Worker Task + rework
- Validator pass → Reviewer
- Reviewer changes → same Worker Task + rework
- Reviewer approve → automatic next Task
- final Task approve → completed
- fourth return attempt → `REVIEW_LOOP_LIMIT`

### Slice 5 — freshness semantics

RED/GREEN:
- Planner changed project → stale
- Worker changed project → valid `work_ready` adopts current trusted baseline
- Validator visible Git change → stale
- ignored/excluded verify artifacts do not falsely stale under existing Git Safety semantics
- Reviewer visible Git change → stale
- Workspace rebinding always denied

### Slice 6 — internal Work Memory bridge + total mapping

RED/GREEN:
- TeamService has no `ClientSession` dependency
- every Team state maps to a valid existing Work Memory task status
- planning writes exactly `Plan Team mission / in_progress`
- implementing/validating/reviewing map to `in_progress` with deterministic role-specific `nextAction`
- completed maps to `completed`
- blocked/stopped map to `blocked` with distinct deterministic `nextAction`
- Team transition derives checkpoint
- final derived checkpoint obeys existing Work Memory bounds including 64 KiB
- checkpoint is part of same UoW
- Desktop stop can checkpoint without fake session
- public `work.resume` guard remains unchanged
- fresh session resume → `team.status` continuation

### Slice 7 — legacy migration safety

RED/GREEN:
- deterministic legacy current-Task resolution
- reviewing/reviewer migrates to validating/validator
- legacy reviewRound maps to bounded current-Task reworkCount
- no resolvable Task fails closed as terminal unsupported legacy mission
- migrated Team + Work Memory state stays consistent

### Slice 8 — MCP schemas/instructions

RED/GREEN:
- Team tools remain exactly 4
- production tools remain exactly 26
- strict seven-outcome submit union
- no forbidden selector/authority fields

### Slice 9 — Activity/audit

RED/GREEN:
- meaningful Team events
- status noise suppressed
- required transition audit atomically coupled
- safe metadata only

### Slice 10 — Desktop delta

RED/GREEN:
- Task progress
- Validator role/status
- rework count
- Final Result
- Stop remains fixed-purpose/non-destructive
- Impeccable used because renderer-visible UI changes

### Slice 11 — Security/data regressions

### Slice 12 — Real primary validation device acceptance

### Slice 13 — Final closure

Follow:
- focused-first
- final-once
- rerun-by-invalidation

---

## 21. Mandatory security/data attack regressions

At minimum prove:

- explicit `missionId` cannot read another active/inactive Workspace's mission metadata
- explicit `missionId` cannot stop another Workspace's mission
- Team + Work Memory + required transition audit cannot partially advance
- public MCP `ClientSession` is not smuggled into TeamService/internal transition persistence
- caller cannot choose next state
- caller cannot choose role
- caller cannot choose current/next Task
- caller cannot provide arbitrary freshness/head/status baseline
- outcome valid for one role is rejected in another
- old/unknown outcome aliases rejected
- raw tool name / Serena selector rejected
- executable / argv / cwd / env / shell fields rejected
- raw prompt/transcript/reasoning fields rejected
- raw file/diff/tool/verify output fields rejected
- malformed/oversized work items/findings/verification fail before persistence
- outside-Workspace/InternalRoot path hints fail closed under existing path rules
- Team persistence never stores raw verify/Serena/tool outputs
- Workspace switch/rebinding fails closed
- fresh MCP session must satisfy existing `work.resume` guard before project-scoped Team use
- mission state never grants Policy/Approval bypass
- Validator failure cannot skip the Worker return rule
- Reviewer cannot approve a Task before Validator pass
- illegal task skip/reorder fails closed
- per-Task rework limit is enforced
- terminal missions cannot reopen
- one active mission per Workspace remains enforced
- every Team mission state derives a valid existing Work Memory `task.status`
- planning checkpoint has the fixed synthetic title and deterministic `nextAction`
- stopped/blocked mappings cannot create an unsupported Work Memory status
- migrated legacy `reviewing/reviewer` cannot bypass Validator
- legacy current-Task resolution cannot cross mission boundaries
- malformed legacy active state with no resolvable current Task fails closed
- migrated Team state and Work Memory continuation cannot contradict each other
- production MCP remains exactly 26 tools

---

## 22. Personal Alpha production acceptance

Use a disposable/test Git Workspace and the real production MCP path.

Prove one end-to-end Goal such as:

```text
Make a small controlled code change in the fixture and verify it.
```

Required flow:

1. Fresh MCP session.
2. Select active disposable/test Workspace.
3. Before `work.resume`, project-scoped Team use fails with the existing resume-required behavior.
4. `work.resume`.
5. `team.start(goal)`.
   - Work Memory immediately contains exactly the planning mapping:
     `Plan Team mission / in_progress`
     with `Plan the Team mission and submit plan_ready.`
6. Planner inspects Workspace/Git and submits at least two bounded Tasks.
7. Team automatically assigns Task 1 to Worker.
8. Worker changes project content through existing Workspace/semantic tools.
9. Worker `work_ready` adopts the new trusted Git baseline.
10. Team assigns Validator.
11. Validator uses real `verify.run` through current Policy/Approval path.
12. Exercise one controlled validation failure:
    - Validator submits `validation_failed`
    - same Task returns to Worker
    - rework count increments
13. Worker corrects it.
14. Worker `work_ready` adopts corrected trusted baseline.
15. Validator passes.
16. Reviewer inspects trusted project/Git state and submits `task_approved`.
17. Team automatically advances Task 2 without user micro-management.
18. Complete Task 2 through Worker → Validator → Reviewer.
19. Final Task approval transitions mission to completed with bounded Final Result.
20. Work Memory contains the final Team checkpoint.
21. Separate in-progress variant:
    - stop/restart or open a fresh MCP session
    - `work.resume` returns bounded continuation context
    - `team.status` returns exact role/Task/nextAction
    - no privileged action is replayed
22. Cross-Workspace attack scenario:
    - active Workspace A
    - explicit mission id from B
    - status/stop both fail closed without B metadata leakage
23. Atomic-failure injection scenario:
    - force checkpoint/audit failure
    - verify Team and Work Memory both remain at the prior committed transition
24. Verify SQLite/audit/renderer contain no raw prompt/reasoning/file/diff/verify/Serena/secret sentinel.
25. Verify production `tools/list` remains exactly 26.
26. Legacy-migration fixture:
    - create a baseline-format active `reviewing/reviewer` mission
    - migrate/open with V3 schema
    - verify it resumes as `validating/validator` on the deterministic current Task
    - verify legacy `reviewRound` became bounded current-Task `reworkCount`
    - verify Work Memory nextAction tells the new session to validate, not review
27. Verify unrelated `.serena/` stays local-only.

This proves the requested ChatGPT-compatible Team flow without Codex or direct model API calls.

---

## 23. Final verification gates

Treat Team orchestration persistence/authority as Security/Data Critical.

After source is stable:

- focused Team Mode suite
- atomic UoW failure-injection tests
- cross-Workspace mission binding tests
- transition matrix / Task progression
- Work Memory total-mapping + resume integration
- legacy Team migration + Team/Work Memory consistency
- Validator / Restricted Verify integration
- role-specific freshness/stale tests
- confidentiality/sentinel tests
- relevant Workspace/Git/code/verify/Approval/Work Memory regressions
- exact Team MCP surface = 4
- exact production MCP surface = 26
- one real primary validation device end-to-end Team acceptance
- Desktop Team smoke
- Impeccable final detector on changed Team UI
- lint
- typecheck
- final full repository suite once
- production build
- `git diff --check`
- staged secret/sensitive-output scans
- final Security/Data review
- final Standards review
- final Spec review

Required final result:
- Security/Data: PASS
- Standards: PASS
- Spec: PASS
- blockers: 0

---

## 24. Definition of MVP success

Team Mode Personal Alpha MVP is successful only when one connected ChatGPT session can, from one user Goal:

- create a bounded plan
- progress multiple Tasks
- perform actual project work through existing SUD-D capabilities
- validate through Restricted Verify
- review results
- automatically return failed work for bounded rework
- automatically advance accepted work to the next Task
- persist Team state safely
- atomically derive Work Memory checkpoints
- resume in a new ChatGPT session/conversation
- finish with a bounded Final Result
- preserve every existing SUD-D security/Approval boundary

The user should not need to manually say:
- "now be Worker"
- "now validate"
- "now review"
- "move to the next Task"

---

## 25. Explicit non-goals

Do not implement in this milestone:

- direct OpenAI API/model calls
- Codex dependency
- multiple concurrent models
- parallel roles/tasks
- background autonomous scheduler
- custom presets
- workflow graph editor
- general shell / `code.run`
- Network tooling
- Delete / Full Recovery
- Computer Use
- cloud/cross-device Work Memory sync
- enterprise/multi-user/RBAC hardening
- filesystem event-attribution system
- distributed transaction system

---

## 26. STOP condition

STOP after Team Mode Personal Alpha MVP is CLOSED, reviewed, committed, pushed, fetched, and verified with:

```text
HEAD == origin/master
divergence 0 0
```

Do not automatically start post-MVP hardening.

Next phase after closure:
- real-world dogfooding
- promote later capabilities only when actual usage proves the need
