# SUD_D Agent Instructions

These rules apply to every coding agent working in this repository. The Git repository is the source of truth. Use [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) for stable project context, [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for approved long-term direction and milestone sequencing, and [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for the current execution state. For owner-facing product/architecture advisory work, read [SUD_D_ADVISOR.md](SUD_D_ADVISOR.md) for the Steward/Knowledge Custodian charter, the Codex-vs-Serena responsibility split, mandatory owner-facing next-step reporting, and durable knowledge-capture rules.

## Agent Role Isolation — Owner Decision (2026-10-13)

Every SUD_D dispatch prompt must state the role-specific no-cross-agent rule. **Codex Design/Spec/Plan:** use Codex-native read-only research and planning only; never call Serena through MCP, CLI, a plugin, a subagent or delegation. **Serena Implementation:** use Serena and explicitly approved project tools for code/tests only; never invoke Codex CLI (`codex`, `codex exec`), Codex MCP/agent, or a delegate that invokes Codex. Design gaps go back to the ChatGPT Project Advisor, who dispatches Codex separately; implementation evidence returns through the Owner to the Advisor for Serena-assisted review. Merely having another agent/tool installed is not permission to call it. See [role dispatch policy](SUD_D_ADVISOR.md#cross-agent-invocation-prohibition--owner-decision-2026-10-13).

An explicit Owner request to Codex to edit design/spec/governance documents authorizes those bounded documentation edits and their checks. It does not authorize production code, runtime execution or invoking Serena. This clarification records the Owner's 2026-10-27 documentation assignment; the implementation-role split remains intact.

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

This is the repository's precedence order, subordinate to host/system instructions. Resolve authority by subject: ROADMAP owns approved direction, HANDOFF owns current execution, and source/tests own inspectable technical facts. A task may narrow scope but cannot silently weaken security. Archives preserve evidence, not live assignments or renewed approvals.

## Start Every Session

Before substantive work:

1. Run `git status`; preserve user-owned and unrelated work.
2. Read this file and the current summary in [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for active scope, blockers and STOP conditions. Read the active task specification when one exists.
3. Load context by relevance: [CONTEXT](SUD_D_CONTEXT.md) for product/security/domain facts; [ROADMAP](SUD_D_ROADMAP.md) for milestone scope or sequencing; [ADVISOR](SUD_D_ADVISOR.md) before owner-facing product/architecture advice or durable knowledge updates. Read only the sections needed; historical handoff records are for evidence lookup, not routine bootstrap.
4. Complete the Skill Router Gate below before planning, investigation, design, editing or review. Before the gate, limit work to this safety/context bootstrap and routing metadata.
5. Inspect the relevant implementation and recent history as the task requires.

Fetch `origin/master` when remote state matters or before integration. Inspect divergence first; use fast-forward-only sync without discarding local work. A routine fetch does not block a local edit or owner-test candidate.

### Development workflow and product runtime

For work through SUD-D MCP, call `work.resume` for the active Workspace and use `team.status` when an active mission exists; preserve its guards and assignment boundaries. Native repository work uses the authorized host's tools and the bootstrap above. It does not establish an SUD-D MCP session or satisfy product Approval. An unavailable connector is not permission to bypass a product gate; independent local docs/research work may continue when its own authorization allows it. Host/tool instructions still apply.

Engineering scope approval, native host/tool permission and Desktop human Approval are distinct. A skill, Team role or passed test grants none of them. Continue routine choices and relevant repairs inside the approved scope; ask only for a missing material decision, new authority or a real blocker. [Decision boundaries](SUD_D_ADVISOR.md#when-to-ask-the-owner) define escalation.

## Agent Skills Routing

The user/task chooses scope; this file chooses operating rules; skills guide workflow within security and STOP boundaries. `REQUIRED SKILL: <skill>` forces that skill for the related step.

### Mandatory Skill Router Gate

Run the gate for the current phase, including read-only and documentation tasks:

1. Match genuine triggers in the automatic table below. Select every applicable skill, but do not preload later phases or unrelated skills.
2. Load each selected repo-local skill before its governed work: native invocation of the canonical repo skill, or an actual read of `.agents/skills/<skill>/SKILL.md`. Naming it is insufficient. If it cannot be loaded, stop before that step and report the limitation.
3. Report `Selected Skill(s)` with a short trigger reason and, for non-native runtimes, the exact path read. Report `None required` when none match.

Rerun on a new session, device/runtime change, explicit handoff, or material scope/phase change that introduces a new trigger. The new selection replaces the old one. Routine editing-to-verification does not require another bootstrap or reload; an expected TDD RED does not trigger debugging.

#### Mandatory Impeccable UI Gate

Every renderer-visible SUD_D UI/UX task must load `impeccable` before planning, designing, creating, modifying, fixing, reviewing, auditing or polishing that surface. This includes layout, visual styling, navigation, UI copy and loading/empty/error states, forms/onboarding/settings/Connection UX, accessibility, responsive/window behavior and interactions. Non-native runtimes must read `.agents/skills/impeccable/SKILL.md`. Backend-only work does not trigger it; crossing into UI does. It complements other applicable skills and grants no backend or privileged authority.

### Skill resolution and progressive disclosure

- For workflows listed below, `.agents/skills/<skill>/SKILL.md` is canonical. Do not load a duplicate global/plugin workflow for the same purpose merely because it is available. Explicitly requested skills still apply subject to Instruction Priority.
- Broad plugin language such as “use before every response” or “1% chance” does not expand the repository's automatic triggers. Resolve conflicting skill instructions through Instruction Priority; report material conflicts. This rule does not override host/system requirements.
- Load a referenced skill or supporting document only when the active branch needs it. Use existing task/repo facts before asking the user; ask only for genuinely missing decisions or facts.
- In upstream skills, `CONTEXT.md` means this repository's `SUD_D_CONTEXT.md`; use existing task/spec and decision documents rather than creating duplicate context or a new issue tracker. Detailed [review adaptations](docs/agent-workflows.md#code-review-adaptation) apply only when code review is selected.
- Versions are pinned under `.agents/skills/`, including `MATT-POCOCK-SKILLS.md` and `IMPECCABLE-SKILL.md`. Keep third-party snapshots intact. Plugin/global configuration changes, upgrades and metadata changes are separate authorized tooling work, not automatic milestone work.
- This policy works across models; do not remove required checks or security boundaries based on a model's claimed judgment.

### Automatic skills

| Skill | Route when | SUD_D adaptation |
| --- | --- | --- |
| `tdd` | Current phase changes a security/data boundary or behavior with a clear, valuable regression-test seam | Write the smallest behavior test, red before green. Existing public interfaces testing already-approved behavior, and task-defined acceptance matrices, are pre-agreed seams: state the seam and proceed. Ask only if the choice changes product behavior/scope or leaves a material coverage decision unresolved. UI may use direct app proof when that is the trustworthy seam; never substitute it for security/data tests. |
| `diagnosing-bugs` | The current phase has an unexpected/unclear failure, broken behavior, flake, or unexplained slowdown | Use reproduce → smallest fix → original-symptom verification for a demonstrated simple cause; state why fuller phases are unnecessary. Use the full hypothesis/instrumentation loop for uncertain, recurring, flaky or slow behavior. Preserve regression proof for security/data and valuable seams; expected TDD RED is not debugging. A blocked runtime may be investigated read-only, but static inference is not a reproduced or fixed runtime. |
| `codebase-design` | The current phase is designing or changing a module interface, seam/port/adapter, cross-package contract, testability boundary, or architectural abstraction | Prefer deep, local interfaces with leverage; avoid shallow pass-through layers and speculative abstractions. Implementing an already-approved fixed contract does not trigger this skill unless the interface/seam itself is changing. |
| `domain-modeling` | The current phase changes core domain/security terminology, state-machine concepts, Policy/Approval/Recovery/Team concepts, or another stable ubiquitous-language decision | Align terminology, invariants, scenarios, code, tests, and durable docs. Merely using already-established terms does not trigger this skill; do not churn `SUD_D_CONTEXT.md` for implementation trivia. |
| `code-review` | The user requests code/PR/diff review, or a milestone/release gate explicitly requires independent review of a security, architecture, or shared-contract change | Assess Standards and Spec using the task-start baseline and current task delta, including relevant uncommitted/new files. Follow the linked review adaptation for baseline, tracker and agent choices. General document/advisory assessment does not trigger code-review merely because the user says “review”. |
| `prototype` | Material UI/UX uncertainty, throwaway state/logic exploration, or multiple interaction designs need comparison | Skip trivial cosmetic tweaks. Prototype artifacts are disposable unless separately approved. |
| `research` | Implementation depends on current external API/runtime/library/spec facts not established locally, or official technical behavior must be verified | Read SUD_D code/docs first, then use high-trust primary sources. Research may run synchronously when background agents are unavailable. Keep transient notes local unless they become approved durable documentation. |
| `resolving-merge-conflicts` | An actual merge or rebase conflict is already in progress | Resolve by original intent and primary sources. SUD_D safety rules and preservation of user-owned work override any generic instruction that would risk data loss. Do not invoke merely because branches differ. |
| `grilling` | A product/architecture/security/design decision has meaningful unresolved branches or hidden assumptions needing stress-testing | Use repository facts first. Do not interview the user when the task is already narrow, explicit, and fully specified; ask only genuinely unresolved decisions. |
| `writing-for-agents` | Assessing, designing or editing `AGENTS.md`, skill routing, agent-facing context/instructions, or process/handoff docs primarily consumed by agents | Includes read-only governance assessment. Keep instructions concise, use progressive disclosure, strengthen trigger pointers, and remove duplicated/conflicting agent guidance. |
| `impeccable` | Work on a renderer-visible UI/UX surface as defined by the Mandatory Impeccable UI Gate above; not backend-only or governance-document work | Use **Operate** mode unless the surface warrants another. Load required setup and only the task's playbook; a copy/spacing refinement preserves incumbent design, not a new visual world. Preserve security and product truth. Other skills route independently; broader design documentation, hooks or vendor changes are not implied. |

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
- `SUD_D_HANDOFF.md` owns only the current execution summary. Its linked dated archives preserve historical evidence; old next actions do not authorize current work.
- `SUD_D_ADVISOR.md` owns the owner-facing Product & Architecture Steward / Project Knowledge Custodian charter, automatic knowledge-capture rules, and lightweight decision-rationale discipline.
- Approved third-party workflow instructions are tracked under `.agents/skills/` with their pinned provenance records in that directory.
- The Git repository is the source of truth.
- `.serena/` is local tooling state, not project memory, and must not be committed.

Keep only the active summary in HANDOFF. Put superseded execution details in a dated archive with links preserved; ROADMAP links to HANDOFF instead of copying progress. A historical ACTIVE/NEXT label is never a live grant. [Maintenance scenarios](docs/agent-workflows.md#routing-consistency-scenarios) check that routing and STOP boundaries remain coherent.

## Task Completion Contract

Use the active task's outcome, authorized scope, required proof and STOP condition; infer already-established details from repo/session context instead of asking again. For a multi-step assignment, use [the task template](docs/agent-workflows.md#task-template). Continue approved work through its required proof and relevant repairs. A first implementation alone is not completion; an owner-test candidate is complete only at its stated candidate boundary. This grants no new milestone, native execution, machine change, commit or push authority.

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

Use the highest applicable risk tier. Risk, not user count, determines the boundary. The default local checkpoint is an **owner-test candidate**: the smallest working change, focused proof, and exact owner test steps. It is not milestone/release completion. Explicit milestone verification and STOP conditions remain mandatory.

### Verification by risk and checkpoint

| Tier / trigger | Owner-test candidate | Explicit milestone / release closure |
| --- | --- | --- |
| **Security / Data Critical** — containment, credentials, privileged Gateway/IPC, Kernel/Policy/Approval, Delete/Recovery, process execution, network permissions, audit redaction, or data-loss/escape/privilege risk | Focused trust-boundary tests including relevant negative paths; direct security-code inspection; `git diff --check`; one real smoke check when runtime behavior changes. Affected lint/typecheck/build when needed to run it or cover a changed contract. | Resolve relevant failures. Full suite and independent review when explicitly required or when focused proof cannot cover the security impact. Complete all specified verification/provenance gates before publication. |
| **Normal Functional** — services, connection state, Activity/Doctor, non-privileged IPC, ordinary logic | One focused test or direct app check, plus typecheck/build needed to run it. | Relevant regressions, necessary build and `git diff --check`; full suite/review only when required or broad shared-contract impact makes targeted proof insufficient. |
| **Low-Risk UI / Cosmetic** — spacing, typography, layout, wording, non-functional polish | Check the actual app interaction; typecheck/build when needed. Add tests only for meaningful logic with a stable seam. | Required acceptance/publication checks; no automatic full regression for visual iteration. |
| **Docs only** | Inspect diff and run `git diff --check`; verify affected links/instructions. | Same, unless generated/runtime configuration changes also require product verification. |

Known security issues, secret leaks, data loss, workspace escape, destructive-behavior and privilege-escalation issues block even a candidate and must be resolved before milestone completion. Manual acceptance never replaces security/data proof.

### Verification Efficiency / Test Economy

- Run the smallest trustworthy proof of the affected boundary; avoid tests that merely mirror implementation. Prefer owner acceptance before unrelated broad checks.
- Reuse evidence until a relevant change invalidates it. Rerun only affected or inconclusive checks, including one conclusive runtime smoke/acceptance run when needed. Docs-only updates do not invalidate runtime evidence.
- For fast closure, stop after focused proof and one relevant real app smoke check, with exact owner steps. Do not package, run unrelated suites or start independent review just to hand off a candidate. Record incomplete optional broad checks honestly; unrelated suite timeouts do not create a new repair task.
- Required inconclusive checks must be rerun or reported as blockers. Verification economy never hides a real failure or skips an explicit gate. No speculative load, enterprise, multi-user or cross-platform matrix testing without approved scope.
- Use the lowest-friction path permitted by actual product policy for safe local read/search/development work. Sensitive, destructive, network, privileged, secret-bearing and containment actions keep their Policy/Approval/Audit boundaries; do not add speculative controls.

### Continuous Repair Loop

When relevant verification fails, read [the repair procedure](docs/agent-workflows.md#continuous-repair-loop) and continue authorized in-scope diagnosis/fix/affected verification without asking at each step. Limit each diagnosed root cause to three repair cycles. Stop for security weakening, scope expansion, an unresolved product decision, a missing safe environment/credential/runtime dependency, or that limit. The task's STOP condition remains authoritative.

### Debug Time Budget

A low-risk non-security issue without a cause after approximately 30 minutes may be deferred only if it has no security/data-loss impact, primary acceptance passes and the core flow remains usable. Record reproduction and impact as a Known Issue in HANDOFF. This exception never applies to Security / Data Critical work.

### No Perfectionism

Prefer **simple → secure → working → maintainable**. Avoid speculative scale infrastructure, abstractions and cosmetic refactors outside the approved task. Cosmetic imperfections alone do not block acceptance.

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

Keep ordinary results and progress concise; state status, evidence, blockers and the owner's next action. For long reports or user-mediated agent/device handoffs, read [Output Delivery](docs/agent-workflows.md#output-delivery) before preparing the payload. Name the exact file/message and recipient. `.serena/reports/` is local-only and must not be committed; durable state belongs in the authoritative repo documents.

## Repository Hygiene and Verification

- `.serena/` is local tooling state. It is not project memory or a source of truth and must never be committed.
- Do not edit package versions or the lockfile to solve a machine/environment problem unless the approved task explicitly requires a dependency change.
- Before committing, inspect the complete staged and unstaged diff and confirm every changed path is in scope.
- Before any commit, run the checks required for the requested checkpoint and milestone prompt, plus `git diff --check`. For documentation-only work, run documentation and diff checks and confirm that no production source changed.
- Do not claim a check passed without fresh command output and a successful exit code. Record verification results in the handoff when the session changes current project state.
- Keep commits narrow, reviewable, and limited to the approved milestone or documentation task.

## End Every Session

Before ending, record which checks actually ran, inspect `git status` and the changed paths for unrelated work or secrets, and state the owner's next action. Update [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) only when the project state, blocker, device handoff, or next action materially changed; keep it brief. Commit and push only when authorized. Stop at the approved boundary.
