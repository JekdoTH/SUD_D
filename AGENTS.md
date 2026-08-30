# SUD_D Agent Instructions

These rules apply to every coding agent working in this repository. The Git repository is the source of truth. Use [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) for stable project context, [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for approved long-term direction and milestone sequencing, and [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for the current execution state.

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
