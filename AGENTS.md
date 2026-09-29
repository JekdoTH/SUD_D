# SUD_D Agent Instructions

These rules apply to every coding agent working in this repository. The Git repository is the source of truth. Use [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) for stable project context, [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for approved long-term direction and milestone sequencing, and [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for the current execution state. For owner-facing product/architecture advisory work, read [SUD_D_ADVISOR.md](SUD_D_ADVISOR.md) for the Steward/Knowledge Custodian charter and durable knowledge-capture rules.

## Instruction Priority

When instructions conflict, apply them in this order and report any material conflict instead of silently guessing:

1. Security invariants and explicit user instructions
2. Current milestone specification
3. This `AGENTS.md`
4. [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md)
5. [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md)
6. [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md)
7. The selected skill workflow

A skill is a subordinate workflow aid. It must never override a security boundary, milestone scope, STOP CONDITION, fail-closed behavior, least-privilege rule, credential rule, or privileged-execution architecture.

## Start Every Session

Before substantive task work:

1. Run `git status` and preserve all user-owned or unrelated changes.
2. Read this `AGENTS.md` and the relevant sections of [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) and [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md). Read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) when milestone scope or sequencing matters.
3. Read the active task specification and inspect recent Git history only as needed for the task.
4. Complete the **Mandatory Skill Router Gate** below.
5. Inspect the relevant package/code boundaries as deeply as the task requires.

Fetch `origin/master` when remote state matters to the task or before integration. Inspect divergence first; use fast-forward-only sync and never discard or overwrite local work. Do not block a local edit or owner-test candidate on a routine fetch.

For owner-facing product/architecture advisory work, also read [SUD_D_ADVISOR.md](SUD_D_ADVISOR.md) before material advice or durable knowledge updates.

Before the Skill Router Gate, limit work to the safety/context bootstrap above and reading only enough installed-skill metadata to route. Planning, deep investigation, debugging, architecture/design work, implementation/editing, and substantive skill-governed review begin only after the gate completes.

If the documents disagree, use the roadmap for approved long-term direction, the handoff for current execution state, and the repository implementation for current technical facts. Report material conflicts instead of silently guessing.

## Agent Skills Routing

SUD_D agents choose routine engineering workflows autonomously from the repo-local skills under `.agents/skills/`. Workflow autonomy does not grant product-scope autonomy:

```text
User/task chooses product scope.
AGENTS.md chooses operating rules.
Skill Router chooses workflow.
Skills guide how to work.
Security rules decide what is permitted.
STOP CONDITION ends the task.
```

A skill may never start the next milestone, expand the current task, weaken security, bypass Policy/Approval/Audit/Recovery, change a STOP condition, override an explicit user instruction, or overwrite unrelated user work. A user- or task-specified `REQUIRED SKILL: <skill>` forces that exact skill for the related step; otherwise route every automatic skill whose trigger genuinely matches.

### Mandatory Skill Router Gate

Run a fresh Skill Router Gate after the minimum session/task bootstrap and **before** any substantive planning, investigation, debugging, design, implementation/editing, or skill-governed review. Route against the **current work phase**, not every later phase named in the milestone or plan. The gate also applies to read-only and documentation/governance tasks; the selected set may be small or empty.

1. Use the automatic-skill table below to identify genuine triggers for the current task; do not inspect or load unrelated skill files.
2. Select only the skills whose triggers genuinely match **now**. Do not preload skills merely because a later implementation, debugging, UI, review, research, or handoff phase may need them; selection does not authorize work outside the active task or security/STOP boundaries.
3. Load every selected skill before doing the work it governs:
   - **Native Agent Skills runtime:** invoke the canonical repo skill; native invocation counts as loading it.
   - **Serena / non-native runtime:** actually read `.agents/skills/<skill>/SKILL.md`. Merely naming, considering, or planning to read a skill later does not satisfy the gate.
4. Report a concise `Selected Skill(s)` result with each skill, one-line trigger reason, and—on Serena/non-native runtimes—the exact `SKILL.md` path read. If nothing matches, explicitly report `None required`.
5. If an applicable/required skill cannot be loaded, stop before the governed step and report the limitation.

Default reporting stays short; do not paste long skill contents unless the user explicitly asks. For example:

```text
Skills: diagnosing-bugs — broken behavior — .agents/skills/diagnosing-bugs/SKILL.md
Skills: tdd — source bug fix begins — .agents/skills/tdd/SKILL.md
```

Run the gate again for a new chat/session, device or runtime change, explicit handoff, or material task/scope change that introduces a newly applicable skill. A routine transition from editing to checking the same change does not require repeating the bootstrap or loading skills again. A rerun replaces the selected set rather than accumulating ceremony. An expected TDD RED does not trigger `diagnosing-bugs`.

#### Mandatory Impeccable UI Gate

Any task that plans, designs, creates, modifies, fixes, reviews, audits, or polishes **renderer-visible SUD_D UI/UX** must select and load `impeccable` before that UI-governed work begins. This covers layout/spacing/visual hierarchy/typography/color/icons/navigation/app shell, UI copy and loading/empty/error states, forms/onboarding/settings/Connection UX, accessibility, responsive/window behavior, interactions/micro-interactions, cosmetic-only polish, renderer-visible bug fixes, and post-implementation visual review. On Serena/non-native runtimes, satisfying this gate requires actually reading `.agents/skills/impeccable/SKILL.md` before planning, designing, editing, or reviewing the UI work; naming or considering it is insufficient. If backend-only work later crosses into renderer-visible UI/UX, rerun the Skill Router Gate and load `impeccable` before that UI phase; backend-only work that neither changes nor reviews renderer-visible UI/UX does not trigger it. `impeccable` remains subordinate to security invariants, explicit user/task scope, STOP conditions, and fail-closed behavior, and it complements every other applicable skill rather than replacing them.

### Skill resolution and progressive disclosure

The router evaluates trigger metadata across the installed skills but loads only the skills selected for the current phase. **Run the router at each required gate; load every currently applicable skill; do not load the whole catalogue by default.**

- If a selected skill references another skill, load the second skill only when the active workflow branch genuinely requires it; never recursively load the catalogue.
- Skill versions are pinned. See the provenance records under `.agents/skills/` (including `MATT-POCOCK-SKILLS.md` and `IMPECCABLE-SKILL.md`). Do not auto-update skills during product milestones; upgrades are separate governance/tooling tasks.

**Skills consume existing repository/task context before asking the user.** If a decision or fact is already established by the active task `.md`, this `AGENTS.md`, `SUD_D_CONTEXT.md`, `SUD_D_ROADMAP.md`, `SUD_D_HANDOFF.md`, current implementation, Git baseline/history, or established conversation context, use that source instead of asking the user to repeat it. Ask only for a genuinely missing decision or fact that cannot be resolved safely from a source of truth.

### Automatic skills

| Skill | Route when | SUD_D adaptation |
| --- | --- | --- |
| `tdd` | Current phase changes a security/data boundary or behavior with a clear, valuable regression-test seam | Write the smallest test that proves the changed behavior. For a UI interaction better verified in the running app, use a direct reproduction and smoke check instead of inventing a test seam. An acceptance matrix already defined by the task is pre-agreed. |
| `diagnosing-bugs` | The current phase has an unexpected/unclear failure, broken behavior, flake, or unexplained slowdown | Reproduce the failure, identify the root cause, and verify the fix through the fastest reliable seam. Add a regression test for security/data behavior or a stable high-value test seam; use a real app check for UI behavior. A normal expected TDD RED does not trigger this skill. |
| `codebase-design` | The current phase is designing or changing a module interface, seam/port/adapter, cross-package contract, testability boundary, or architectural abstraction | Prefer deep, local interfaces with leverage; avoid shallow pass-through layers and speculative abstractions. Implementing an already-approved fixed contract does not trigger this skill unless the interface/seam itself is changing. |
| `domain-modeling` | The current phase changes core domain/security terminology, state-machine concepts, Policy/Approval/Recovery/Team concepts, or another stable ubiquitous-language decision | Align terminology, invariants, scenarios, code, tests, and durable docs. Merely using already-established terms does not trigger this skill; do not churn `SUD_D_CONTEXT.md` for implementation trivia. |
| `code-review` | The user requests a review, or a milestone/release gate explicitly requires independent review of a security, architecture, or shared-contract change | Do not start a two-agent review automatically for every local owner-test candidate. Review the touched boundary directly during implementation. For a required final review, compare Standards and Spec against the task-start baseline. |
| `prototype` | Material UI/UX uncertainty, throwaway state/logic exploration, or multiple interaction designs need comparison | Skip trivial cosmetic tweaks. Prototype artifacts are disposable unless separately approved. |
| `research` | Implementation depends on current external API/runtime/library/spec facts not established locally, or official technical behavior must be verified | Read SUD_D code/docs first, then use high-trust primary sources. Research may run synchronously when background agents are unavailable. Keep transient notes local unless they become approved durable documentation. |
| `resolving-merge-conflicts` | An actual merge or rebase conflict is already in progress | Resolve by original intent and primary sources. SUD_D safety rules and preservation of user-owned work override any generic instruction that would risk data loss. Do not invoke merely because branches differ. |
| `grilling` | A product/architecture/security/design decision has meaningful unresolved branches or hidden assumptions needing stress-testing | Use repository facts first. Do not interview the user when the task is already narrow, explicit, and fully specified; ask only genuinely unresolved decisions. |
| `writing-for-agents` | The current phase changes `AGENTS.md`, skill routing, agent-facing context/instructions, or process/handoff docs primarily consumed by agents | Route only for that agent-facing docs phase. Keep instructions concise, use progressive disclosure, strengthen trigger pointers, and remove duplicated/conflicting agent guidance. |
| `impeccable` | Designing, redesigning, shaping, critiquing, auditing, polishing, clarifying, hardening, adapting, laying out, typesetting, onboarding, or otherwise improving SUD_D Desktop frontend/UI/UX; includes interaction clarity, accessibility, responsive/window behavior, UX copy, empty/error states, and design-system work. Do not route for backend-only tasks. | Treat SUD_D Desktop as an **Operate**-mode product UI unless a narrower surface implies otherwise. Preserve product truth and all SUD_D security boundaries; design workflow grants no backend/privileged authority. Impeccable complements rather than replaces other applicable skills: `tdd`, `codebase-design`, and `prototype` still route independently when their triggers match. |

### Explicit / user-invoked skills

These skills remain available but do not start silently as routine automatic workflows:

| Skill | Use when the user explicitly asks for |
| --- | --- |
| `handoff` | Session, device, Serena/Codex/agent handoff, or conversation compaction for continuation |
| `to-spec` | Synthesis of the current discussion into a formal specification; skip when an adequate task `.md` already exists unless another spec is requested |
| `wayfinder` | A large multi-session or decision-map workflow; skip normal milestones that fit one bounded task |

Third-party skill files are copied from pinned official upstream snapshots and must not be silently rewritten for SUD_D. SUD_D-specific adaptations belong here. `deprecated`, `in-progress`, `grill-me`, `setup-matt-pocock-skills`, and unrelated upstream skills are intentionally not installed.

## Session Continuity Model

- `AGENTS.md` owns operating rules and skill routing.
- `SUD_D_CONTEXT.md` owns stable project context.
- `SUD_D_ROADMAP.md` owns long-term direction and milestone sequencing.
- `SUD_D_HANDOFF.md` owns current progress and execution state.
- `SUD_D_ADVISOR.md` owns the owner-facing Product & Architecture Steward / Project Knowledge Custodian charter, automatic knowledge-capture rules, and lightweight decision-rationale discipline.
- Approved third-party workflow instructions are tracked under `.agents/skills/` with their pinned provenance records in that directory.
- The Git repository is the source of truth.
- `.serena/` is local tooling state, not project memory, and must not be committed.

## Pre-Implementation Compliance Check

Before a source change, identify the risk tier, selected skills, smallest useful verification, and STOP CONDITION. For a routine owner-test candidate this may be one concise sentence; a security/data change or explicit milestone gate uses the four headings below. This is a planning check, not an approval request:

1. **Risk Level** — select `Security / Data Critical`, `Normal Functional`, or `Low-Risk UI / Cosmetic` using the Risk-Based Development policy. A mixed change uses its highest applicable tier.
2. **Selected Skill(s)** — reuse the latest still-valid Mandatory Skill Router Gate result; do not perform a second independent selection pass. Write `None required` when that gate selected nothing. If the work is entering a phase that newly triggers a skill, rerun the router first and use the updated result. Every skill named by `REQUIRED SKILL` in the milestone prompt must already be loaded before its related step.
3. **Verification Plan** — list only the checks required by the risk tier and milestone specification, such as focused tests, regression tests, lint, typecheck, full suite, build, smoke/acceptance, and `code-review`. A milestone prompt may add requirements.
4. **STOP CONDITION** — state the boundary that ends or blocks the work, such as stopping after verification plus commit/push, before the next milestone, on a security blocker, or when an environment or credential dependency is missing.

After the check and with no blocker, implementation may begin. Read-only investigation, documentation-only tasks, and environment setup that does not change source need no compliance report; skill routing still applies.

The compliance check remains valid only while its underlying Skill Router Gate remains valid. Any router re-run condition invalidates the prior skill selection for subsequent governed work.

## Scope and Milestone Control

- Work on one explicitly approved milestone at a time.
- Respect every STOP CONDITION or Stop Gate in the roadmap, handoff, task, and current milestone.
- Do not start the next milestone, expand the current milestone, or implement an approved future idea without an explicit new instruction.
- Do not perform unrelated refactors, dependency churn, package-boundary changes, or opportunistic cleanup.
- Prove a behavior change through its fastest trustworthy seam: a focused automated test for security/data logic, or a reproducible app interaction for UI behavior. Do not add tests that only mirror implementation.
- Preserve existing user changes. Do not stage, amend, revert, or reformat files outside the approved scope.

## Risk-Based Development

SUD_D is a personal-first project for one primary owner and approximately one occasional tester. Before planning verification, classify the change by the highest applicable risk tier; a mixed change inherits its highest-risk part. Keep one milestone checkpoint at a time, but choose its verification plan from the risk tier instead of applying one heavyweight checklist to every change. A milestone prompt may override or add verification, and every `REQUIRED verification` instruction is mandatory; no override or tier may weaken a security invariant.

### Fast Closure / Owner-Test Candidate

The default checkpoint for a local change is an **owner-test candidate**. Make the smallest working change, run the focused proof required by its risk tier, and give the owner exact steps to try in the app. Do this before broad verification unless the changed security boundary cannot be assessed safely without it. A candidate is not a claim that a milestone or release is complete.

When the owner asks for fast closure, stop after focused proof and one relevant real app smoke check; let owner acceptance drive the next iteration. Do not run the full suite, package an installer, repeat broad checks, or start independent review just to hand off a candidate. Record incomplete broader gates honestly. A demonstrated secret leak, data loss, workspace escape, destructive action, or privilege escalation is a blocker even for a candidate.

Public release or installer publication is a separate checkpoint: complete its explicit verification and provenance gates, including the full suite when required, before publishing.

Use the lowest-friction path permitted by the actual product policy for routine read/search/status/inspection and safe local development work. Do not add approval, review, logging, confirmation, enterprise/multi-user controls, or speculative security layers merely because they might be useful later. Sensitive, destructive, network, privileged, secret-bearing, or containment-relevant actions keep the appropriate Policy/Approval/Audit boundary. **Risk, not user count, determines the hard boundary.**

### Verification Efficiency / Test Economy

**Default: focused-first, owner-test next, broad gates at explicit closure.** Use the smallest fresh verification set that gives trustworthy evidence for the changed boundary.

- During implementation, run a focused test or direct app reproduction for changed behavior and only regressions relevant to the affected boundary. Do not run the full suite after every edit, task, or subtask.
- Do not repeat lint, typecheck, build, smoke, acceptance, secret scans, or review merely because another phase completed. Existing evidence remains valid until a later relevant change invalidates the boundary it covered.
- Run broader gates only when the milestone specification, release/publication, or the actual changed boundary requires them. A full suite is not the default proof for an isolated credential or UI change; focused trust-boundary tests and one real app check can establish an owner-test candidate.
- Prefer Product Owner manual acceptance of the local flow before spending time on unrelated broad tests. Manual acceptance never replaces focused proof of a changed security/data boundary.
- A later change invalidates only the checks whose covered boundary changed. Rerun only invalidated or inconclusive checks; a handoff/docs-only edit after valid runtime evidence does not invalidate unrelated runtime evidence.
- When a runtime boundary changes, one conclusive real smoke/acceptance run is sufficient unless that runtime boundary changes again or the result is inconclusive.
- If a required check for the current checkpoint is inconclusive because of a connector, environment, terminal, or test-harness failure, rerun only that check. Record optional broad-check failures for later closure.
- For an owner-test candidate, report unrelated broad-suite timeouts as incomplete evidence and hand off the working app flow after focused checks. Do not serially rerun unrelated files unless preparing milestone/release closure or the owner asks.
- Documentation-only changes use diff/governance checks and do not trigger the product suite unless they alter generated or runtime configuration.
- Do not add enterprise-scale, load, multi-user, cross-platform matrix, or speculative compatibility testing unless the approved milestone or explicit user instruction requires it.
- Verification economy never weakens a security invariant, hides a real failure, or skips a mandatory final gate.

### Continuous Repair Loop

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

### A. Security / Data Critical

Use this tier for workspace boundaries, path containment, credentials or secrets, privileged MCP Gateway exposure, Tool Kernel, Policy, Approval, Delete, Recovery, process execution, network permissions, privileged-action IPC, audit redaction, and anything that could cause data loss, workspace escape, destructive behavior, secret leakage, or privilege escalation.

For an owner-test candidate, require focused tests of the changed trust boundary and relevant negative paths, a direct inspection of the changed security code, `git diff --check`, and one real smoke check when runtime behavior changes. Run lint, typecheck, or build for the affected package when needed to make that candidate runnable or when those checks cover a changed contract. Run the full suite and independent `code-review` only when an explicit milestone/release gate requires them or the change is broad enough that focused proof cannot cover its security impact. Do not mark a security/data milestone complete with unresolved relevant failures.

Resolve known security, secret-leak, data-loss, workspace-escape, destructive-behavior, and privilege-escalation issues before milestone completion; they are blocking and may not be deferred.

### B. Normal Functional

Use this tier for application services, connection-state behavior, Activity, Doctor, non-privileged IPC, and ordinary feature logic.

- For an owner-test candidate, use one focused test or direct app check for the changed behavior, plus the typecheck/build needed to run it. Do not add a test when it would only restate the implementation.
- At explicit milestone or release closure, run relevant regression tests, necessary build, and `git diff --check`. Run a full suite or independent review only when the task requires it or a broad shared-contract change makes targeted evidence insufficient.

### C. Low-Risk UI / Cosmetic / Docs

Use this tier for spacing, typography, card layout, wording, non-functional visual polish, and documentation.

- For UI changes, use a quick app check of the actual interaction. Add a focused test only for meaningful logic that has a stable seam; typecheck/build when needed to run the changed UI. No full regression for a visual iteration.
- Documentation-only changes need `git diff` and `git diff --check`. Run the full test suite only when documentation changes generated or runtime configuration.

### Debug Time Budget

For a low-risk, non-security issue without a root cause after approximately 30 minutes, classify it as blocking or non-blocking. It may be recorded as a Known Issue in `SUD_D_HANDOFF.md` and deferred only when it has no security impact, no data-loss risk, the primary acceptance criteria still pass, and the core flow remains usable. Record a short reproduction and impact before continuing the milestone. This budget never applies to Security/Data Critical issues.

### No Perfectionism

Prefer **simple → secure → working → maintainable** before **generic → scalable → enterprise-ready**. SUD_D does not currently target enterprise SaaS scale. Keep solutions proportional to the approved personal-first requirements: avoid speculative abstractions, hypothetical scale infrastructure or cloud work, beauty-only refactors of working code, and milestone blocks caused only by cosmetic imperfections that do not affect acceptance.

## Security Invariants

- Privileged operations must follow this path and may not bypass a gate:

  ```text
  MCP Gateway → Tool Kernel → Policy → Approval → Execution
  ```

- Default to fail closed and least privilege. Never weaken a security requirement, validation boundary, policy rule, approval requirement, recovery guarantee, or audit guarantee merely to make a test pass.
- The renderer must never control an arbitrary executable, argument vector (`argv`), working directory (`cwd`), or environment (`env`). Keep privileged host behavior behind validated, fixed-purpose boundaries.
- Plaintext credentials must never enter SQLite, renderer-facing or IPC DTOs, audit records, logs, error messages, or other serialized non-secret state.
- Keep operations workspace-bound. Outside-workspace and internal-root access remain denied unless a future explicitly approved design introduces a stricter reviewed boundary.
- Destructive actions require the approved policy and approval path and must be recoverable where practical.
- Never commit secrets, API keys, access tokens, credentials, secret-bearing environment files, or secret-derived output.

See [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) and [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for the product security model; do not duplicate or reinterpret it in milestone code.

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

## Repository Hygiene and Verification

- `.serena/` is local tooling state. It is not project memory or a source of truth and must never be committed.
- Do not edit package versions or the lockfile to solve a machine/environment problem unless the approved task explicitly requires a dependency change.
- Before committing, inspect the complete staged and unstaged diff and confirm every changed path is in scope.
- Before any commit, run the checks required for the requested checkpoint and milestone prompt, plus `git diff --check`. For documentation-only work, run documentation and diff checks and confirm that no production source changed.
- Do not claim a check passed without fresh command output and a successful exit code. Record verification results in the handoff when the session changes current project state.
- Keep commits narrow, reviewable, and limited to the approved milestone or documentation task.

## End Every Session

Before ending, record which checks actually ran, inspect `git status` and the changed paths for unrelated work or secrets, and state the owner's next action. Update [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) only when the project state, blocker, device handoff, or next action materially changed; keep it brief. Commit and push only when authorized. Stop at the approved boundary.
