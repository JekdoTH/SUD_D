# Team Mode MVP — No-Execute Design

Date: 2026-09-02
Project: SUD-D
Status: DESIGN APPROVED — awaiting written-spec review before implementation planning

## 1. Purpose

Add the first Team Mode subsystem without waiting for Restricted Execute.

The MVP provides a persistent, deterministic orchestration layer for one connected AI session moving through three sequential logical roles:

`Planner → Implementer → Reviewer`

These are logical roles, not independent concurrent model processes.

This milestone does not add a multi-model runtime, parallel agents, shell/process execution, network access, Delete/Recovery, or a new privileged fast path.

## 2. Deferred Restricted Execute note

Restricted Execute remains intentionally deferred:

> Restricted Execute: DEFERRED — Windows sandbox enforcement is not yet proven because BIOS virtualization is disabled on the Home-PC. Revisit after virtualization is enabled and one real Windows sandbox path passes enforcement acceptance. Team Mode MVP must remain No-Execute until then.

Any work requiring test/lint/typecheck/build must block with `EXECUTE_REQUIRED` rather than creating a process/shell workaround.

## 3. Security architecture

Team Mode sits above the existing secure capability boundary:

```text
Connected AI
→ Team Mode orchestration
→ existing MCP capabilities
→ Tool Kernel
→ Policy
→ Basic Approval where applicable
→ Execution
→ Audit
```

Team Mode owns orchestration state only. It gains no direct filesystem, Git, approval, process, credential, or network authority.

All file/Git work continues through the existing Workspace and Git Safety tools. Sensitive Workspace/Git actions continue through Basic Approval.

## 4. Roles

### Planner

- reads current Workspace/Git state through existing tools
- converts the mission goal into a bounded ordered plan
- identifies target areas with workspace-relative references
- identifies known blockers/capability requirements
- submits a structured plan
- does not mutate files

### Implementer

- follows the accepted plan
- edits only through existing Workspace tools
- uses Git Safety tools for status/diff/checkpoint
- follows Basic Approval for protected actions
- submits a structured implementation handoff
- cannot execute test/build/lint/typecheck

### Reviewer

- re-reads relevant Workspace/Git state
- compares implementation against mission/plan
- inspects Git diff/state through existing tools
- returns `complete`, `changes_requested`, or `blocked`
- does not silently bypass Implementer to perform hidden corrective mutation

## 5. Mission state machine

```text
idle
→ planning
→ implementing
→ reviewing
→ completed | blocked
```

Reviewer may return work:

```text
reviewing → implementing → reviewing
```

Maximum review-return rounds: **3**.

After the limit: `blocked: REVIEW_LOOP_LIMIT`.

Terminal states:

- completed
- blocked
- stopped

Terminal missions are never silently reopened.

## 6. Blocking model

Initial typed reasons:

- `EXECUTE_REQUIRED`
- `NETWORK_REQUIRED`
- `DELETE_REQUIRED`
- `SECURITY_POLICY`
- `APPROVAL_DENIED`
- `APPROVAL_EXPIRED`
- `WORKSPACE_STALE`
- `GIT_STATE_STALE`
- `SCOPE_MISMATCH`
- `REVIEW_LOOP_LIMIT`
- `UNSUPPORTED_OPERATION`
- `INTERNAL_FAILURE`

Team Mode must prefer explicit blocking over capability bypass.

## 7. Production MCP surface

Add exactly four orchestration-only tools:

- `team.start`
- `team.status`
- `team.submit`
- `team.stop`

Expected production surface after Team Mode MVP:

- Workspace: 6
- Git Safety: 4
- Team orchestration: 4
- Total: **14 tools**

No Execute tool is added.

### `team.start`

Conceptual input:

```ts
{ goal: string }
```

Starts one mission for the active Workspace. Goal input is bounded/sanitized. MVP permits one active mission per Workspace.

### `team.status`

Returns safe mission state such as mission id, goal summary, state, current role/step, work items, review round, blocked reason, workspace id, safe Git freshness reference, and timestamps.

Never returns raw prompts, reasoning, file contents, diff contents, or credentials.

### `team.submit`

Submits the structured outcome of the current role. Caller may not arbitrarily set the next state; the application service validates the current role/state and performs only an allowed transition.

Conceptual outcomes:

Planner: `plan_ready | blocked`

Implementer: `implementation_ready | blocked`

Reviewer: `complete | changes_requested | blocked`

### `team.stop`

Stops the active mission non-destructively. It does not delete/revert/reset files or Git state and does not revoke unrelated approvals.

## 8. Orchestration-only invariant

Team tools must never directly perform:

- file reads/writes
- Git mutation/checkpoint
- approval decisions
- credential access
- process execution
- network access
- Delete/Recovery

The connected AI separately invokes the existing Workspace/Git tools for actual project work.

## 9. Persistence

Persist safe structured orchestration metadata only.

Suggested entities:

- `team_missions`
- `team_work_items`
- `team_role_handoffs`

Safe persisted data may include:

- ids
- workspace id
- bounded goal summary
- state/current role/current step
- review round
- typed blocked reason and bounded safe summary
- bounded work-item titles
- workspace-relative target path hints
- safe role handoff summaries
- timestamps

Never persist:

- plaintext credentials
- raw prompts
- chain-of-thought/private reasoning
- file contents
- diff contents
- full tool results
- raw stdout/stderr
- arbitrary command strings/argv/env
- HMAC keys or approval binding material

Existing invariant remains authoritative:

> Plaintext credentials must never enter SQLite, renderer-facing or IPC DTOs, audit records, logs, error messages, or other serialized non-secret state.

## 10. Freshness and restart/resume

Team Mode must not assume the project remains unchanged between roles.

Use trusted project freshness data, preferably Workspace identity plus Git Safety `statusId` for supported Git workspaces.

Before transitions that rely on previous project state, recompute freshness. External changes must not silently continue stale work; return a typed stale condition and require re-evaluation.

Active mission state persists across Desktop/Gateway restarts, but restart must not auto-replay privileged actions, fabricate approval, or automatically continue a role. The connected AI calls `team.status` and resumes explicitly.

## 11. Basic Approval interaction

Team Mode owns no approval authority.

If an existing Workspace/Git operation returns `APPROVAL_REQUIRED`, the mission remains in its current role while the existing Activity UI handles Approve/Deny. The AI retries the exact existing tool normally.

If the denied/expired approval prevents progress, the mission may block with `APPROVAL_DENIED` or `APPROVAL_EXPIRED`.

No Team MCP/IPC may approve requests.

## 12. No-Execute / Network constraints

Team Mode production code must not expose shell, arbitrary process, package scripts, test/build/lint/typecheck, PowerShell/cmd, executable/argv/cwd/env controls, or indirect process-launch flags.

When execution is required: `blocked: EXECUTE_REQUIRED`.

Team Mode adds no Network capability and may not fetch URLs, call provider APIs directly, push/fetch Git, access LAN/localhost services, or coordinate remote agents.

The connected ChatGPT session remains external to Team Mode orchestration; SUD-D does not become a model-calling runtime in this MVP.

## 13. Desktop UX

Add a thin Team surface showing:

- active mission goal summary
- mission state
- current role
- current step/work item
- review round
- blocked reason
- safe timeline/handoff summaries
- Stop Team

Do not add a new chat UI, agent avatars/persona editor, workflow builder, scheduler, parallel-agent monitor, terminal, or generic approval controls.

Desktop IPC remains fixed-purpose and renderer-facing DTOs contain safe Team metadata only.

## 14. Audit

Audit safe Team transition metadata only, e.g.:

- mission_started
- role_transitioned
- review_returned
- mission_blocked
- mission_completed
- mission_stopped
- stale_state_detected

Safe fields may include mission/workspace ids, role/state, reason code, review round, timestamps.

Never audit raw prompts, reasoning, file contents, diffs, or tool outputs.

## 15. Concurrency

MVP supports one active Team mission per active Workspace.

No parallel roles, multiple simultaneous agent workers, or background scheduler.

A second mission for the same Workspace fails with a typed busy/conflict result.

## 16. Reviewer findings

`changes_requested` may persist bounded structured findings containing:

- finding id
- severity enum
- short issue summary
- workspace-relative path hint
- expected correction summary

Do not persist code excerpts/diff contents.

Reviewer return increments `reviewRound`. Maximum = 3; another return attempt blocks with `REVIEW_LOOP_LIMIT`.

## 17. Error semantics

Persistence/infrastructure failure must fail closed. Do not transition mission state unless the new state is safely recorded.

Malformed submissions are strict-schema rejected with no state mutation.

Renderer failure grants no privilege; server-side Team state remains source of truth.

Stale state is a typed error/blocked condition, never silent overwrite.

## 18. Out of scope

Do not implement:

- Restricted Execute
- generic shell/process
- test/lint/typecheck/build execution
- provider/model API runtime
- multiple model providers
- parallel/multi-session agents
- autonomous background agents
- scheduler/cron
- vector memory/prompt archive/chain-of-thought storage
- custom roles/workflow graph editor
- permission editor/Always Allow
- Delete/Recovery
- remote Git
- cloud sync
- RBAC/multi-user
- agent marketplace/plugins

## 19. Acceptance criteria

Production must prove:

1. mission start → planning/Planner
2. Planner valid plan → implementing/Implementer
3. Implementer handoff → reviewing/Reviewer
4. Reviewer complete → completed
5. Reviewer changes_requested → implementing and bounded review loop
6. fourth return attempt blocks with `REVIEW_LOOP_LIMIT`
7. Execute-required work blocks with `EXECUTE_REQUIRED`
8. Network-required work blocks with `NETWORK_REQUIRED`
9. Team tools expose no File/Git/Execute/Network privilege
10. existing Workspace/Git tools remain the only project mutation/read paths
11. sensitive File/Git still uses Basic Approval
12. approval denial/expiry does not corrupt Team state
13. external Workspace/Git change is detected as stale
14. restart resumes mission state without replaying actions
15. Stop is non-destructive
16. one active mission per Workspace enforced
17. illegal transitions fail closed
18. SQLite/renderer/audit contain safe metadata only
19. no raw prompt/reasoning/file/diff/secret sentinel persists
20. existing File/Git/Basic Approval regressions remain green
21. production MCP surface exactly 14 tools
22. no shell/process/network/delete/recovery tool exists
23. Team Mode remains sequential logical roles only
24. Restricted Execute remains deferred/unimplemented

## 20. Verification

Treat Team Mode persistence/state authority as Security/Data Critical.

Final fresh gates:

- focused Team Mode tests PASS
- transition matrix PASS
- restart/resume PASS
- stale-state tests PASS
- confidentiality sentinel tests PASS
- relevant Basic Approval/File/Git regressions PASS
- typecheck PASS
- lint PASS
- full suite PASS
- build PASS
- `git diff --check` PASS
- changed-surface secret scan PASS
- SQLite/renderer/audit sentinel scan PASS
- built production MCP acceptance PASS
- built Desktop Team UI smoke PASS
- final Standards review PASS
- final Spec review PASS

## 21. Production acceptance flow

```text
team.start(goal)
→ team.status = planning / Planner
→ Planner reads Workspace/Git
→ team.submit(plan_ready)
→ implementing / Implementer
→ Implementer edits via Workspace tools
→ Git diff via Git Safety
→ team.submit(implementation_ready)
→ reviewing / Reviewer
→ Reviewer reads diff/state
→ team.submit(changes_requested)
→ implementing, reviewRound=1
→ correction
→ reviewing
→ team.submit(complete)
→ completed
```

Separate scenarios must prove restart/resume, stale state, approval deny/expire, review-loop limit, Execute/Network blocking, Stop Team, and no privilege bypass.

## 22. Recommended implementation boundaries

Domain:

- TeamMission
- TeamRole
- TeamState
- TeamOutcome
- TeamBlockedReason
- transition rules

Application:

- TeamService/TeamCoordinator
- freshness validator
- transition orchestration
- safe DTO mapping

Infrastructure:

- SQLite TeamRepository
- migration

MCP Gateway:

- four strict Team schemas/tools
- composition only

Desktop:

- safe Team controller/IPC
- minimal Team view/card
- non-destructive Stop control

Keep Tool Kernel, File, Git, and Approval implementations separate.

## 23. Rationale and future evolution

Chosen approach: **Sequential Logical Team**.

It provides useful Team behavior now, reuses the completed secure capability path, avoids adding model credentials/network runtime, keeps state deterministic, and creates a clean seam for future true multi-agent runtimes.

Deferred alternatives:

- multiple connected AI sessions
- SUD-D directly calling multiple model providers

After Team Mode MVP is stable:

1. enable BIOS virtualization on Home-PC
2. return to Restricted Execute
3. prove a real Windows sandbox path
4. add bounded `dev.verify`
5. allow Team Mode to request that capability through the existing secure path
6. consider true multi-agent/multi-model runtime only as a later separate milestone

## 24. Completion definition

Team Mode MVP — No-Execute is COMPLETE only when:

- Planner → Implementer → Reviewer orchestration works
- mission state persists/resumes safely
- review loop and blocked states are deterministic
- Execute/Network needs block instead of bypassing policy
- actual File/Git privileges remain exclusively in existing secure tools
- Basic Approval remains unchanged
- confidentiality is proven across SQLite/renderer/audit
- production MCP has exactly 14 approved tools
- Desktop Team surface works
- final verification/review/delivery gates pass
- Restricted Execute remains explicitly deferred
- no broader multi-agent runtime starts

STOP after this milestone. Do not automatically start Restricted Execute or a broader Team Mode phase.