# SUD_D Agent Instructions

These rules apply to every coding agent working in this repository. The Git repository is the source of truth. Use [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) for stable project context, [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for approved long-term direction and milestone sequencing, and [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for the current execution state.

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
2. Fetch and sync `origin/master` when it is safe. Inspect divergence first; use a fast-forward-only update, and never discard or overwrite local work to sync.
3. Read this `AGENTS.md`.
4. Read [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md).
5. Read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md).
6. Read [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).
7. Read the active task specification and inspect recent Git history.
8. Complete the **Mandatory Skill Router Gate** below.
9. Only after the gate, inspect the relevant package/code boundaries as deeply as the task requires.

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

Run a fresh Skill Router Gate after the minimum session/task bootstrap and **before** any substantive planning, investigation, debugging, design, implementation/editing, or skill-governed review. The gate also applies to read-only and documentation/governance tasks; the selected set may be small or empty.

1. Evaluate the trigger metadata for all installed skills against the active task.
2. Select **every** skill whose trigger genuinely matches; selection does not authorize work outside the active task or security/STOP boundaries.
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

Run the gate again when any of these changes invalidates the prior selection: a new chat/session, a new task, Home-PC ↔ Work-PC change, Serena ↔ Codex/other runtime change, explicit task handoff, material task/scope change, or a task phase entering a newly triggered workflow (for example investigation/debug → source-changing bug fix). For a new session/device/runtime/handoff, repeat the minimum repository bootstrap/context read before the fresh gate. Prior-session selection is never proof for a new session.

### Skill resolution and progressive disclosure

The router evaluates trigger metadata across the installed skills but loads only the skills selected for the active task. **Run the router every time; load every applicable skill; do not load the whole catalogue by default.**

- If a selected skill references another skill, load the second skill only when the active workflow branch genuinely requires it; never recursively load the catalogue.
- Skill versions are pinned. See the provenance records under `.agents/skills/` (including `MATT-POCOCK-SKILLS.md` and `IMPECCABLE-SKILL.md`). Do not auto-update skills during product milestones; upgrades are separate governance/tooling tasks.

**Skills consume existing repository/task context before asking the user.** If a decision or fact is already established by the active task `.md`, this `AGENTS.md`, `SUD_D_CONTEXT.md`, `SUD_D_ROADMAP.md`, `SUD_D_HANDOFF.md`, current implementation, Git baseline/history, or established conversation context, use that source instead of asking the user to repeat it. Ask only for a genuinely missing decision or fact that cannot be resolved safely from a source of truth.

### Automatic skills

| Skill | Route when | SUD_D adaptation |
| --- | --- | --- |
| `tdd` | Meaningful source behavior changes, bug fixes with a valid test seam, new functional/security capabilities, or integration behavior changes | Work red → green through observable public/trusted seams; avoid implementation-coupled or tautological tests. An acceptance matrix or public seam already defined by the task is pre-agreed; do not ask the user to reconfirm it. |
| `diagnosing-bugs` | Something is broken, failing, flaky, unexpectedly slow, or a verification failure has an unclear root cause | Establish or reuse a tight red-capable feedback loop, reproduce and minimize, form falsifiable hypotheses, instrument selectively, then secure the root cause with a regression test; remove temporary instrumentation afterward. Skip speculation only when the root cause is already conclusive. |
| `codebase-design` | Designing/changing a module interface, seam/port/adapter, cross-package contract, testability boundary, or architectural abstraction | Prefer deep, local interfaces with leverage; avoid shallow pass-through layers and speculative abstractions. Skip ordinary tiny changes with no interface/design question. |
| `domain-modeling` | Core domain/security terminology, state-machine concepts, Policy/Approval/Recovery/Team concepts, or a stable ubiquitous-language decision changes | Align terminology, invariants, scenarios, code, tests, and durable docs. Do not churn `SUD_D_CONTEXT.md` for implementation trivia. |
| `code-review` | Security/Data Critical final gate, explicit task review, architecture/shared-contract/cross-package behavior change, or privileged-boundary change | Review Standards and Spec separately. The current task/milestone `.md` is the primary Spec when available; `AGENTS.md`, repo docs, and security invariants are Standards. Use the captured task-start baseline as fixed point. Do not require `setup-matt-pocock-skills` or an external issue tracker. |
| `prototype` | Material UI/UX uncertainty, throwaway state/logic exploration, or multiple interaction designs need comparison | Skip trivial cosmetic tweaks. Prototype artifacts are disposable unless separately approved. |
| `research` | Implementation depends on current external API/runtime/library/spec facts not established locally, or official technical behavior must be verified | Read SUD_D code/docs first, then use high-trust primary sources. Research may run synchronously when background agents are unavailable. Keep transient notes local unless they become approved durable documentation. |
| `resolving-merge-conflicts` | An actual merge or rebase conflict is already in progress | Resolve by original intent and primary sources. SUD_D safety rules and preservation of user-owned work override any generic instruction that would risk data loss. Do not invoke merely because branches differ. |
| `grilling` | A product/architecture/security/design decision has meaningful unresolved branches or hidden assumptions needing stress-testing | Use repository facts first. Do not interview the user when the task is already narrow, explicit, and fully specified; ask only genuinely unresolved decisions. |
| `writing-for-agents` | `AGENTS.md`, skill routing, agent-facing context/instructions, or process/handoff docs primarily consumed by agents change | Keep instructions concise, use progressive disclosure, strengthen trigger pointers, and remove duplicated/conflicting agent guidance. |
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
- Approved third-party workflow instructions are tracked under `.agents/skills/` with their pinned provenance records in that directory.
- The Git repository is the source of truth.
- `.serena/` is local tooling state, not project memory, and must not be committed.

## Pre-Implementation Compliance Check

Before implementation begins for any milestone or task that changes source code, publish a short check with all four headings below. Source code may be edited only after all four are reported:

1. **Risk Level** — select `Security / Data Critical`, `Normal Functional`, or `Low-Risk UI / Cosmetic` using the Risk-Based Development policy. A mixed change uses its highest applicable tier.
2. **Selected Skill(s)** — reuse the latest still-valid Mandatory Skill Router Gate result; do not perform a second independent selection pass. Write `None required` when that gate selected nothing. If the work is entering a phase that newly triggers a skill, rerun the router first and use the updated result. Every skill named by `REQUIRED SKILL` in the milestone prompt must already be loaded before its related step.
3. **Verification Plan** — list only the checks required by the risk tier and milestone specification, such as focused tests, regression tests, lint, typecheck, full suite, build, smoke/acceptance, and `code-review`. A milestone prompt may add requirements.
4. **STOP CONDITION** — state the boundary that ends or blocks the work, such as stopping after verification plus commit/push, before the next milestone, on a security blocker, or when an environment or credential dependency is missing.

This report is a gate, not a request for extra approval: after all four headings are present and no blocker is identified, implementation may begin. Without it, production source must remain unchanged.

Read-only investigation, documentation-only tasks, and environment setup that does not change source are exempt from this compliance report, **not** from the Mandatory Skill Router Gate. A documentation task that changes agent, process, or security policy may use a lightweight version of this check.

The compliance check remains valid only while its underlying Skill Router Gate remains valid. Any router re-run condition invalidates the prior skill selection for subsequent governed work.

## Scope and Milestone Control

- Work on one explicitly approved milestone at a time.
- Respect every STOP CONDITION or Stop Gate in the roadmap, handoff, task, and current milestone.
- Do not start the next milestone, expand the current milestone, or implement an approved future idea without an explicit new instruction.
- Do not perform unrelated refactors, dependency churn, package-boundary changes, or opportunistic cleanup.
- Use test-driven development where behavior changes: demonstrate the relevant failure, implement the smallest scoped change, then demonstrate the passing result. Match verification effort to risk and scope.
- Preserve existing user changes. Do not stage, amend, revert, or reformat files outside the approved scope.

## Risk-Based Development

SUD_D is a personal-first project for one primary owner and approximately one occasional tester. Before planning verification, classify the change by the highest applicable risk tier; a mixed change inherits its highest-risk part. Keep one milestone checkpoint at a time, but choose its verification plan from the risk tier instead of applying one heavyweight checklist to every change. A milestone prompt may override or add verification, and every `REQUIRED verification` instruction is mandatory; no override or tier may weaken a security invariant.

### Verification Efficiency / Test Economy

Use the smallest fresh verification set that gives trustworthy evidence for the current change. Do not repeatedly run expensive gates when narrower evidence is sufficient.

- During implementation, prefer focused tests for changed behavior. Do not run the full suite after every edit.
- Run only regressions relevant to the affected boundary during iteration. Expand coverage when a failure, shared contract, or cross-package change justifies it.
- For Security / Data Critical work, the full suite and other required final gates remain mandatory, but normally run them once after the implementation is stable. Rerun only a gate whose evidence was invalidated by a later relevant change.
- Treat lint, typecheck, build, smoke, acceptance, secret scans, and reviews the same way: keep fresh final evidence, but avoid repeating already-valid evidence without a reason.
- When a runtime boundary changes, one conclusive real smoke/acceptance run is sufficient unless the related runtime code changes again or the result is inconclusive.
- If a connector, terminal, or test harness fails without evidence of a SUD_D product failure, rerun only the missing or inconclusive gate rather than restarting the entire verification sequence.
- Do not add enterprise-scale, load, multi-user, cross-platform matrix, or speculative compatibility testing unless the approved milestone or explicit user instruction requires it.
- Verification efficiency must never weaken a security invariant, hide a real failure, or skip a mandatory final gate.

### A. Security / Data Critical

Use this tier for workspace boundaries, path containment, credentials or secrets, privileged MCP Gateway exposure, Tool Kernel, Policy, Approval, Delete, Recovery, process execution, network permissions, privileged-action IPC, audit redaction, and anything that could cause data loss, workspace escape, destructive behavior, secret leakage, or privilege escalation.

Required verification:

- TDD with focused tests
- relevant regression tests
- lint
- typecheck
- full test suite
- build when the changed boundary is built or packaged
- `git diff --check`
- `code-review`
- a real smoke or acceptance test when a runtime boundary changes

Resolve known security, secret-leak, data-loss, workspace-escape, destructive-behavior, and privilege-escalation issues before milestone completion; they are blocking and may not be deferred.

### B. Normal Functional

Use this tier for application services, connection-state behavior, Activity, Doctor, non-privileged IPC, and ordinary feature logic.

- During development, run focused tests plus lint and/or typecheck as applicable to the affected area.
- At milestone completion, run relevant regression tests, the full suite, the necessary build, and `git diff --check`.
- Use `code-review` when architecture or a shared contract changes, behavior spans multiple packages, or the milestone prompt requires it.
- A heavyweight acceptance test is optional when no runtime or integration boundary changed.

### C. Low-Risk UI / Cosmetic / Docs

Use this tier for spacing, typography, card layout, wording, non-functional visual polish, and documentation.

- UI changes need a focused test only when logic changes, plus typecheck, build, and an app/UI smoke check. Full regression is not required during each visual iteration.
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
- Long progress updates, intermediate status reports, design reports, reviews, verification reports, architecture reports, or handoffs should be written to `.serena/reports/*.md` by default instead of being pasted in full into chat.
- Long prompts, task specifications, implementation instructions, or agent-to-agent handoff instructions intended to be forwarded to another agent should be delivered as a `.md` file by default; use `.txt` when plain text is more appropriate.
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
- Before any commit, run the checks required by the selected risk tier and milestone prompt, plus `git diff --check`. For documentation-only work, run the documentation and diff checks required by the task and explicitly confirm that no production source changed.
- Do not claim a check passed without fresh command output and a successful exit code. Record verification results in the handoff when the session changes current project state.
- Keep commits narrow, reviewable, and limited to the approved milestone or documentation task.

## End Every Session

Before ending every session:

1. Re-read the active milestone scope and STOP CONDITION.
2. Run and record the required verification.
3. Inspect `git status`, the final diff, and staged paths for unrelated files or secrets.
4. Update [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) with the current state, verification, open issues, latest commit, and immediate next action. Do not turn it into a copy of the roadmap.
5. Commit and push only when the task authorizes it.
6. Stop at the approved boundary. Do not begin the next milestone automatically.
