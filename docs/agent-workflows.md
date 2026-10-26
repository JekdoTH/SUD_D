# SUD_D Conditional Agent Workflows

These are subordinate procedures reached from [AGENTS.md](../AGENTS.md), not a second bootstrap. Read only the triggered section. Security, scope, risk tiers and STOP conditions stay authoritative in AGENTS and the active task.

## Continuous Repair Loop

When a required verification gate fails during an authorized task, treat the failure as a repair signal rather than a task stop unless one of the blocker conditions below is met.

First decide whether the failure concerns the changed boundary. For a local owner-test candidate, an unrelated broad-suite timeout or test-harness failure is incomplete evidence, not a new repair task. Record it and let the owner test the verified core flow. Apply the repair loop below to relevant product failures and explicit milestone/release gates.

For each diagnosed root cause:

1. Diagnose to a tight, reproducible cause using the applicable debugging/TDD workflow.
2. Apply the smallest in-scope fix that preserves all security invariants and approved product behavior.
3. Run focused verification that directly proves the diagnosed cause is fixed.
4. Resume only the verification gate(s) invalidated or left inconclusive by that repair; keep earlier fresh evidence whose covered boundary did not change.
5. If the same root cause still fails, repeat the loop for at most **3 repair cycles** for that root cause.

A materially new, independently diagnosed root cause starts a fresh three-cycle budget. A repair cycle is consumed when an in-scope fix has been applied and its focused verification has been attempted. Ordinary verification failures do not end the task by themselves.

Stop the repair loop before the task's normal STOP CONDITION only when: preserving security would require weakening an invariant; the required fix would exceed approved scope; a genuine product decision is unresolved; an environment/credential/runtime dependency prevents the required proof from running safely; or the same root cause is still failing after three repair cycles. Report that blocker with the last focused evidence. The task's existing STOP CONDITION remains authoritative once verification/review reaches its approved boundary.

## Output Delivery

- Short results may be returned directly in chat.
- Keep owner-test candidate updates and results short in chat. Use `.serena/reports/*.md` when evidence or a handoff is too long for a clear chat summary; do not create a report for a routine small fix.
- Long prompts, task specifications, implementation instructions, or agent-to-agent handoff instructions intended to be forwarded to another agent should be delivered as a `.md` file by default; use `.txt` when plain text is more appropriate.
- For every user-mediated Serena/agent/device handoff, make the next action explicit in chat: state exactly **what file or exact short message to send**, and **which target agent/device** receives it (for example `@Serena SUD-D Work`). Never require the user to infer the handoff payload from surrounding discussion.
- Prefer one concise forwardable `.md` instruction/handoff file when the payload has multiple steps, evidence, constraints, or STOP conditions. If a short message is sufficient, label that exact message as the payload to forward.
- primary validation device and secondary validation device are separate local execution environments. On cross-device continuation, name the target device, treat that device's local repository as the technical source of truth after local-state inspection, and carry forward any known unsynced-commit/worktree warnings before sync operations.
- Use `.txt` for long raw logs, command output, or other plain-text evidence that does not benefit from Markdown.
- The chat response for a long report or forwardable task should contain only a concise summary, status, blockers or open decisions, and the local file path.
- During long-running work, chat progress messages should remain brief; keep cumulative details in the report file instead of repeating them in the conversation.
- Keep report and task filenames descriptive and task-specific, for example `.serena/reports/secure-api-key-design.md` or `.serena/reports/secure-api-key-implementation.md`.
- `.serena/` remains local-only. Reports and task files under `.serena/` must never be staged or committed.
- If the active environment cannot create a local `.serena/reports/` file, report that limitation and provide the shortest useful chat summary rather than pretending a file exists.

## Task Template

Use for multi-step assignments when the existing task does not already specify these facts. Routine work needs no extra document or approval ceremony.

```text
Outcome: <observable result and checkpoint: candidate, milestone, or release>
Scope: <authorized surfaces and explicit exclusions>
Context: <only relevant authoritative sections/specs>
Required proof: <risk-tier checks plus task-specific acceptance>
Continue: repair relevant failures within this scope using the repair procedure.
STOP: <completion boundary and real blockers; no next milestone automatically>
Delivery: <result/evidence and exact next actor/action>
```

## Code Review Adaptation

Read this only when AGENTS routes code-review. These are SUD_D-owned adaptations; preserve pinned upstream skills.

1. **Pin the actual subject.** Use the user-specified baseline, otherwise the recorded task-start revision and relevant starting working-copy contents. State the choice without asking for facts already established. A committed branch review may use a merge-base diff; that diff alone excludes uncommitted work.
2. **Include the task delta.** Inspect task-owned staged, unstaged and new files against task-start state. Preserve unrelated inherited changes. Without a starting snapshot, distinguish current-state findings from uncertain attribution; ask only if the review subject cannot be established.
3. **Use the accepted requirement.** Prefer the task/spec or explicit user acceptance criteria. An issue tracker is optional; do not run setup-matt-pocock-skills or create configuration to satisfy an upstream assumption. If no spec exists, report the limitation.
4. **Assess Standards and Spec separately.** Ordinary requested code review may use one permitted reviewer with both axes distinct. Independent review is required only by an explicit user/task/milestone gate: satisfy its independence or report it unavailable. Self-check is not independent review. Two subagents are not a default; cross-agent prohibitions remain binding.
5. **Report actionable findings and limits.** Cite the changed boundary, requirement and evidence. Document assessment uses writing-for-agents, not a manufactured code diff. A candidate gains no review gate solely by reaching verification.

## Evidence and Completion States

Use only labels supported by evidence:

| State | Meaning |
| --- | --- |
| Discussed / proposed | Possible direction; no authorization or implementation implied. |
| Approved / designed | Accepted scope/design; execution authority and delivery evidence are separate. |
| Implemented | Scoped source/document changes exist; list unverified behavior. |
| Compiled | Relevant build completed; no runtime/UI/native readiness implied. |
| Verified | Name actual checks, outcomes, coverage limits and relevant revision/device. Label static/mock evidence. |
| Owner accepted | Owner explicitly confirmed the tested outcome; agent checks do not imply acceptance. |
| Released | Authorized artifact published with required release checks; installation/owner acceptance remain separate. |

Use the task's completion boundary: documentation, owner-test candidate, milestone or release. Required inconclusive checks are blockers; optional unrun checks are limits. Reuse evidence only while its covered boundary/environment remains valid. A narrow check cannot justify a broader PASS claim.

## Routing Consistency Scenarios

Use these when changing governance. They are documentation expectations, not execution authority, automated model evaluations or new product gates. Add skills only when their own triggers apply.

| Example | Skills / context | Proof and STOP |
| --- | --- | --- |
| Assess/edit AGENTS, context or routing | writing-for-agents; AGENTS/HANDOFF and relevant ADVISOR | Inspect task delta/links; edits also require diff check. No product runtime or code-review ceremony. |
| Existing button spacing/copy | impeccable; incumbent surface and narrow playbook, Operate mode | Actual app check; build/typecheck as needed. No redesign, full suite or independent review by default. |
| Clear UI interaction defect | impeccable + diagnosing-bugs; tdd only for valuable seam | Reproduce and recheck original interaction; justify abbreviated diagnosis. No invented test seam. |
| Service behavior at existing valuable public seam | tdd; accepted task and local implementation | State pre-agreed seam; red/green focused proof and necessary contract checks. Ask only for unresolved scope/behavior. |
| Approval/Workspace containment behavior | tdd; diagnosing-bugs for a defect; security contract | Negative boundary tests, direct inspection, diff check, required runtime smoke. Design/domain skills only for changed interface/meaning. Missing required proof or weakening blocks completion. |
| New cross-package interface | codebase-design; CONTEXT/task | Concrete contract/trade-offs; domain-modeling only for changed terminology/state semantics. No implementation authority inferred. |
| Uncommitted candidate review | code-review; start baseline and scoped staged/unstaged/new files | Separate Standards/Spec; preserve inherited work; independence only when required. |
| Native startup blocked by execution gate | diagnosing-bugs; task/STOP rules; research only for missing external facts | Read-only investigation may narrow cause; runtime proof stays blocked. No invented reproduction, launch or relaxed gate. |
| Expected TDD RED | tdd already selected | Smallest implementation and focused rerun; no debugging/bootstrap merely for expected RED. |
| Unresolved product workflow choices | grilling; relevant CONTEXT/ROADMAP/ADVISOR | Resolve genuine missing choices; no automatic prototype/research/Team or scope expansion. |

## Documentation Maintenance Result — 2026-10-27

Owner-approved consolidation preserves security/role boundaries, risk-based verification and bounded repairs. The scenarios above were compared with the revised router: document assessment avoids code-review; established TDD seams avoid redundant confirmation; UI retains impeccable; security/data retains negative proof; blocked native execution stays blocked. This is a documentation consistency inspection, not runtime or model-performance testing. Complete old HANDOFF/ROADMAP text is preserved in root-level dated archives, retaining the relative-link base.

## Maintaining This Guidance

When changing agent instructions, compare representative docs-only, UI, functional, security/data and blocked-native tasks against the router, verification table and STOP rules. Record whether each selects the necessary context/skills and preserves required proof. This is a documentation consistency check, not evidence of model performance or permission to execute a blocked task.

When separately authorized to change skill metadata, use short descriptions with distinct triggers and exclusions. Preserve upstream provenance; use a reviewed update or an explicitly owned adaptation rather than editing pinned vendor snapshots. Repository routing cannot remove globally injected catalog entries; changes to global/plugin configuration require their own supported configuration workflow.
