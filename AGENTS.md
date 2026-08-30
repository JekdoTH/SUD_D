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

Before planning or changing anything:

1. Run `git status` and preserve all user-owned or unrelated changes.
2. Fetch and sync `origin/master` when it is safe. Inspect divergence first; use a fast-forward-only update, and never discard or overwrite local work to sync.
3. Read this `AGENTS.md`.
4. Read [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md).
5. Read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md).
6. Read [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).
7. Inspect the relevant package boundaries and recent Git history before proposing work.

If the documents disagree, use the roadmap for approved long-term direction, the handoff for current execution state, and the repository implementation for current technical facts. Report material conflicts instead of silently guessing.

## Agent Skills Routing

Use progressive disclosure:

```text
Task
→ match a routing trigger
→ read only the relevant skill and its required references
→ follow that workflow
→ continue to obey SUD_D scope, specification, and security rules
```

The selected skills are external/local runtime resources, not repository-owned files. Resolve them by the exact canonical name through the active agent runtime. The repository intentionally does not vendor content from the inspected `Skill_Matt_pocock.zip` package because that archive provides no license or redistribution terms. If a required skill is unavailable, report that before the related step; do not invent a substitute or reference a nonexistent repository path.

An agent may select a skill automatically when its trigger matches. When package metadata permits model invocation, load it automatically; when a selected skill is user-invoked only, identify it and require explicit invocation or a `REQUIRED SKILL` directive before running it. Do not load every skill for every task; load only what the current branch of work requires. If a milestone prompt declares `REQUIRED SKILL: <skill>`, read and use that exact skill before the related step. Without that declaration, use this router:

| Trigger | Skill | Invocation |
| --- | --- | --- |
| UI/UX uncertainty or a state/logic design question that needs a throwaway artifact | `prototype` | Automatic |
| Completed milestone implementation, architecture-sensitive change, branch, PR, or diff review | `code-review` | Automatic |
| Core domain or security terminology changes, ubiquitous language, or a qualifying architectural decision | `domain-modeling` | Automatic |
| Session, device, or agent handoff | `handoff` | Explicit/user-invoked |
| `AGENTS.md`, agent context, skill, or other agent-facing documentation changes | `writing-for-agents` | Automatic |
| Work too large for one session that needs an issue-backed decision map | `wayfinder` | Explicit/user-invoked |
| Architecture, product, plan, or design decision that needs a relentless stress-test | `grilling` | Automatic |
| An existing discussion must be synthesized into a formal specification | `to-spec` | Explicit/user-invoked |

`grill-me` is a user-invoked alias that delegates to `grilling`, so the automatic router uses `grilling` directly. `setup-matt-pocock-skills` is a separate one-time tracker/domain-doc setup workflow, not an everyday SUD_D task router; run it only under an explicitly approved repository-setup task.

### Milestone Workflow Direction

These workflows constrain future milestone work; they do not authorize starting it:

- **M0.6 UI:** `prototype` → design review → production implementation → verification → `code-review`
- **M1 Tool Execution Kernel:** `domain-modeling` → implementation → `code-review`
- **M3 Approval:** `domain-modeling` → `prototype` for UX uncertainty when needed → implementation → `code-review`
- **M4/M5 Recovery/Delete:** `domain-modeling` → implementation → security-focused `code-review`

## Session Continuity Model

- `AGENTS.md` owns operating rules and skill routing.
- `SUD_D_CONTEXT.md` owns stable project context.
- `SUD_D_ROADMAP.md` owns long-term direction and milestone sequencing.
- `SUD_D_HANDOFF.md` owns current progress and execution state.
- Selected skill files provide reusable workflow instructions outside the repository unless redistribution is explicitly permitted.
- The Git repository is the source of truth.
- `.serena/` is local tooling state, not project memory, and must not be committed.

## Scope and Milestone Control

- Work on one explicitly approved milestone at a time.
- Respect every STOP CONDITION or Stop Gate in the roadmap, handoff, task, and current milestone.
- Do not start the next milestone, expand the current milestone, or implement an approved future idea without an explicit new instruction.
- Do not perform unrelated refactors, dependency churn, package-boundary changes, or opportunistic cleanup.
- Use test-driven development where behavior changes: demonstrate the relevant failure, implement the smallest scoped change, then demonstrate the passing result. Match verification effort to risk and scope.
- Preserve existing user changes. Do not stage, amend, revert, or reformat files outside the approved scope.

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

## Repository Hygiene and Verification

- `.serena/` is local tooling state. It is not project memory or a source of truth and must never be committed.
- Do not edit package versions or the lockfile to solve a machine/environment problem unless the approved task explicitly requires a dependency change.
- Before committing, inspect the complete staged and unstaged diff and confirm every changed path is in scope.
- Before any commit, run the scope-appropriate focused tests, lint, typecheck, full test suite, build or other milestone-specific checks, and `git diff --check`. For documentation-only work, run the documentation and diff checks required by the task and explicitly confirm that no production source changed.
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
