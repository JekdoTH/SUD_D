# Personal Alpha Stabilization — Approval + Connection UX

Status: APPROVED FOR IMPLEMENTATION — Product Owner approved this combined stabilization scope on 2026-09-13.

This task closes the currently observed Personal Alpha dogfood blockers/friction before the next SUD-D-only Team Mode acceptance. It intentionally combines four related fixes and no others.

This spec supersedes the immediate implementation scope in `docs/superpowers/specs/2026-09-13-approval-flow-and-modes.md`; that file remains useful as DGF-008 evidence/background.

## Product goal

Make the normal single-user SUD-D development loop continuous and quiet:

```text
Open SUD-D → Connect → ChatGPT activity is reflected truthfully → Team Mode works → eligible protected development actions continue according to the user-selected approval mode
```

Normal use must not open developer consoles/terminal windows, must not show stale connection state after proven MCP activity, and must not trap the user in repeated approval IDs for the same bound action.

## Scope — exactly four dogfood findings

### DGF-008 — Approval retry loop + user-selectable Approval Mode

Observed: Team Mode completed successfully, but `verify.run: diff_check` repeatedly returned `APPROVAL_REQUIRED`. After the user approved the request, retrying the same bound action generated a fresh approval request instead of consuming/matching the approved decision. This blocked `secret_scan → git.commit → work.checkpoint`.

Required behavior:

- Approval binding/consumption must be deterministic and auditable.
- Retrying the same materially identical bound action after approval must proceed rather than create an endless new approval chain.
- A fresh approval is valid only when the bound request materially changes, the prior decision is denied/expired/consumed according to an explicit rule, or policy requires a fresh decision.
- Changed input must never inherit approval for a different input.
- Policy/Approval/Audit remain authoritative below the renderer.

Add one explicit user-selectable Approval Mode control with three choices:

#### Standard

Conservative default. Existing ASK/DENY behavior remains unchanged except the retry-loop bug is fixed.

#### Approve for me

Personal-development automation mode. Automatically approves only eligible bounded local-development actions that Policy already allows inside the Active Workspace. At minimum, cover the current Team Mode completion loop: restricted Verify actions (`test`, `lint`, `typecheck`, `build`, `diff_check`, `secret_scan`) and bounded `git.commit`, subject to existing binding/sensitivity rules.

Still ASK or DENY for destructive, secret-sensitive, network, outside-workspace, internal-root, or otherwise higher-risk actions according to Policy.

#### Full Access

Maximum automation within SUD-D's existing capability model. Auto-approve eligible ASK-class actions that are already exposed as fixed-purpose SUD-D capabilities and remain inside the Active Workspace.

Full Access is not a policy bypass. It must still fail closed for immutable hard boundaries, including:

- outside-workspace and InternalRoot access;
- plaintext-secret exposure or unsafe secret-bearing serialization;
- arbitrary executable / argv / cwd / env authority;
- network capabilities that are still denied by current policy;
- unsupported capability classes or invalid/unsafe repository/runtime state.

If a capability cannot be made safe without weakening these boundaries, Full Access must DENY rather than silently broaden authority.

Approval Mode should be a local-device product setting, defaulting to `Standard`. Reuse the smallest existing trusted local settings/config seam; do not add cloud/account sync or a parallel settings subsystem.

The selected mode must be visible and understandable in SUD-D Desktop. Renderer input is only the approved enum value; it must not become a generic policy-editing or privilege surface.

### DGF-001 — Connect launches a visible terminal window

Observed: pressing Connect opens a dev/runtime terminal window that remains visible during normal connection use.

Required behavior:

- Normal user Connect starts required fixed-purpose runtime/tunnel processes without a visible terminal window.
- Lifecycle ownership/cleanup and existing fixed executable/profile authority remain unchanged.
- Do not solve this by adding caller-controlled executable/argv/cwd/env.
- Diagnostic/debug launch may remain available only through an explicit developer/debug path, never as the normal user experience.

### DGF-002 — `Waiting for ChatGPT` remains after proven MCP use

Observed: Desktop can continue showing `Waiting for ChatGPT` after successful MCP calls prove that ChatGPT is actively reaching SUD-D.

Required behavior:

- Connection presentation must transition from waiting/stale state when trusted runtime evidence shows successful client/MCP activity.
- Use an existing trusted runtime/activity signal if available; otherwise add the narrowest safe signal needed across existing boundaries.
- Do not fabricate connection state from renderer timers or optimistic UI state.
- Failure/disconnect must remain truthful and fail safe.

### DGF-007 — Desktop launch opens DevTools/console automatically

Observed on Work PC: launching the SUD-D Desktop app opens a visible DevTools/console surface automatically.

Required behavior:

- Normal production/user launch must not open DevTools or a console automatically.
- Developer diagnostics may be opt-in through an explicit development/debug condition.
- Do not hide real runtime errors by swallowing them; fix launch behavior while preserving safe diagnostics/logging.

## Architecture and security invariants

Preserve all existing SUD-D invariants:

```text
MCP Gateway → Tool Kernel → Policy → Approval → Execution
```

- Fail closed and least privilege.
- Workspace-bound operations.
- No renderer-controlled arbitrary executable, argv, cwd, or env.
- No plaintext credentials/secrets in SQLite, DTOs, audit, logs, safe errors, or other non-secret persistence/serialization.
- No new network permission in this task.
- No Git push/pull/sync capability in this task.
- No cloud/account/device-sync work.
- Preserve Team Mode tool contract and linked-worktree support delivered by DGF-006.
- Preserve unrelated user changes and `.serena/` as local-only.

## Implementation strategy

Treat this as one stabilization milestone but implement in small reviewable slices. Prefer the existing seams over new abstractions.

Suggested order:

1. Diagnose and fix DGF-008 approval consumption/retry behavior with focused RED/GREEN coverage.
2. Add the three Approval Modes through the existing policy/settings/UI seams; prove hard-boundary behavior per mode.
3. Diagnose/fix DGF-001 terminal-window launch behavior.
4. Diagnose/fix DGF-007 automatic DevTools/console opening.
5. Diagnose/fix DGF-002 stale `Waiting for ChatGPT` state using trusted MCP/runtime evidence.
6. Run final risk-tier verification once after source is stable.
7. Run one real SUD-D-only Team Mode acceptance after the updated runtime is restarted/refreshed.

Do not rerun broad gates after every slice. Use focused tests during implementation and final-once verification per `AGENTS.md`.

## Verification requirements

This milestone crosses Policy/Approval/process execution/runtime boundaries and renderer-visible UX. Classify at the highest applicable risk tier and follow `AGENTS.md` exactly.

At minimum, final evidence must include:

- focused RED/GREEN tests for DGF-008 approval reuse/binding and all three modes;
- changed-input/stale/denied approval negative cases;
- hard-boundary cases proving Full Access cannot bypass DENY/containment/secret/process restrictions;
- focused regressions for hidden terminal and DevTools launch behavior;
- focused connection-state regression proving successful trusted MCP activity clears stale waiting presentation;
- relevant UI tests/smoke for the Approval Mode control and connection state;
- lint;
- typecheck;
- build;
- full test suite once on stable source;
- `git diff --check`;
- code review along Standards + Spec axes;
- real runtime smoke/acceptance because runtime/security boundaries change.

Follow the repo Skill Router. Renderer-visible work requires the repo's mandatory Impeccable gate; source behavior/security changes require the applicable TDD/design/debug/review skills selected by `AGENTS.md`.

## Final SUD-D-only acceptance

After implementation is verified and the Work-PC SUD-D runtime/actions are restarted/refreshed, run one fresh acceptance against the linked worktree used for `feature/playwright-automation-platform` (or an equivalent standard linked-worktree fixture if the original target is unavailable).

Required flow:

```text
work.resume → git.status → team.start docs-only mission → Team completed → diff_check → secret_scan → git.commit → work.checkpoint
```

Acceptance requirements:

- linked-worktree Git support is available;
- Planner → Worker/Implementer → Validator → Reviewer → completed;
- under `Approve for me`, eligible `diff_check`, `secret_scan`, and bounded `git.commit` do not require manual repeated approvals;
- under `Standard`, a manually approved identical retry consumes/matches the decision and does not enter a new-ID loop;
- Full Access does not bypass hard-boundary negative tests;
- commit SHA is produced on the feature branch;
- checkpoint succeeds;
- Serena invoked: NO;
- Remote Commander invoked: NO.

The acceptance workload must remain docs-only; do not begin Playwright runtime implementation as part of this stabilization task.

## STOP CONDITION

Stop before commit/push and report:

- changed files by slice;
- selected skills and risk level;
- focused verification results;
- final verification results;
- Standards/Spec review findings;
- real smoke/acceptance status if it can be run safely before commit;
- remaining risks/blockers.

Do not start Git network sync, Playwright runtime implementation, cloud work, or any other milestone.