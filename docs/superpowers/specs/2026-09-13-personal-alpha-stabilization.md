# Personal Alpha Stabilization — Approval + Connection UX

Status: APPROVED FOR IMPLEMENTATION — Product Owner approved this combined stabilization scope on 2026-09-13.

This task closes the currently observed Personal Alpha dogfood blockers/friction before the next SUD-D-only Team Mode acceptance. It intentionally combines four related fixes and the approved Overview/Activity UI refinement described below.

This spec supersedes the immediate implementation scope in `docs/superpowers/specs/2026-09-13-approval-flow-and-modes.md`; that file remains useful as DGF-008 evidence/background.

## Product goal

Make the normal single-user SUD-D development loop continuous, quiet, and easy to understand at a glance:

```text
Open SUD-D → Connect → see what SUD-D is doing now → Team Mode works → eligible protected development actions continue according to the user-selected approval mode
```

Normal use must not open developer consoles/terminal windows, must not show stale connection state after proven MCP activity, must not trap the user in repeated approval IDs for the same bound action, and should make the current work/session state visible from Overview without forcing the user into Activity for routine status checks.

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

Conservative mode. Existing ASK/DENY behavior remains unchanged except the retry-loop bug is fixed.

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

Approval Mode is a local-device product setting shared by all approved workspaces for this milestone. The product default is `Approve for me`. Reuse the smallest existing trusted local settings/config seam; do not add cloud/account sync, per-workspace override state, or a parallel settings subsystem in this milestone.

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

## Approved Desktop information architecture refinement

This UI refinement is part of the same stabilization milestone because the Approval Mode UI is already being changed and the Product Owner wants the Overview to be useful for day-to-day operation rather than configuration-heavy.

### Approved workspaces card

Keep Approval Mode configuration on **Overview**, inside the existing **Approved workspaces** card.

- Add a card-level `Default Approval Mode` control in the Approved workspaces card, visually near the workspace access information/list.
- Choices: `Standard`, `Approve for me`, `Full Access`.
- Default selection for a new/local installation: `Approve for me`.
- The setting applies to all approved workspaces in this milestone; do not add per-workspace overrides yet.
- Keep the existing workspace rows focused on workspace identity/path, Access, and Status rather than duplicating the same global setting per row.
- The UI should make it clear that this is the default approval behavior for approved workspaces on this device.

### Activity page

Use **Activity** as the detailed operational timeline/log view.

- Remove Approval Mode configuration from Activity.
- Activity is for viewing work history, tool/runtime activity, approval events, verification events, security-relevant events, and related operational details.
- Activity may expose filtering/drill-down if already supported or low-cost, but it should not become the primary settings surface.
- Do not duplicate long logs on Overview; Overview should summarize and link to Activity for detail.

### Overview — Current activity + Recent activity

Replace the current generic recent-events emphasis with a useful at-a-glance work view.

`Current activity` should show what SUD-D is doing now when trusted runtime evidence exists, for example:

```text
Working — Team Mode
Current task: Personal Alpha stabilization
Current step: Running focused tests
Elapsed: 2m 14s
```

The exact wording can follow available runtime data, but the state must come from trusted runtime/activity/team/tool evidence rather than renderer guessing, optimistic timers, or fabricated state.

`Recent activity` should remain compact and show approximately 3–5 meaningful latest events, for example completed verification, mode change, checkpoint, approval event, or current execution transition. Provide `View all activity` to open Activity for the full timeline.

Do not turn Overview into a long scrolling log.

### Overview — replace Safety status with Current Session / Work Status

The existing `Safety status` card is not useful enough on Overview because it is mostly read-only and not part of the user's normal control loop. Remove it from Overview and replace that space with a **Current Session / Work Status** card.

Show useful current context when available, such as:

- active Workspace;
- current Git branch;
- Team/work state (idle, working, waiting, blocked, completed);
- Git working-tree summary such as number of changed files when safely available;
- last checkpoint time/status.

Use trusted existing state where possible. Missing data should render as unknown/unavailable rather than be inferred.

Move persistent safety/security posture information to the **Security** area, where it belongs with security-related details and controls. This move must not weaken or remove any safety enforcement; it only changes presentation.

### Overview information goal

At a glance, Overview should answer:

1. Is SUD-D connected and healthy enough to work?
2. What is SUD-D doing right now?
3. Which workspace/session is active and what is its current work/Git state?
4. What approval behavior will SUD-D use by default?

Activity answers the separate question: **What happened in detail?**

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
- UI status must reflect trusted runtime/domain state; do not invent privileged or connection state in the renderer.

## Implementation strategy

Treat this as one stabilization milestone but implement in small reviewable slices. Prefer the existing seams over new abstractions.

Suggested order:

1. Diagnose and fix DGF-008 approval consumption/retry behavior with focused RED/GREEN coverage.
2. Add the three Approval Modes through the existing policy/settings seams, default to `Approve for me`, place the control in Overview → Approved workspaces, and prove hard-boundary behavior per mode.
3. Refine Overview/Activity information architecture: Activity becomes log/history only; Overview gains Current activity + compact Recent activity and Current Session / Work Status; move Safety status presentation to Security.
4. Diagnose/fix DGF-001 terminal-window launch behavior.
5. Diagnose/fix DGF-007 automatic DevTools/console opening.
6. Diagnose/fix DGF-002 stale `Waiting for ChatGPT` state using trusted MCP/runtime evidence and reuse that trusted signal model for Overview current activity where practical.
7. Run final risk-tier verification once after source is stable.
8. Run one real SUD-D-only Team Mode acceptance after the updated runtime is restarted/refreshed.

Do not rerun broad gates after every slice. Use focused tests during implementation and final-once verification per `AGENTS.md`.

## Verification requirements

This milestone crosses Policy/Approval/process execution/runtime boundaries and renderer-visible UX. Classify at the highest applicable risk tier and follow `AGENTS.md` exactly.

At minimum, final evidence must include:

- focused RED/GREEN tests for DGF-008 approval reuse/binding and all three modes;
- changed-input/stale/denied approval negative cases;
- hard-boundary cases proving Full Access cannot bypass DENY/containment/secret/process restrictions;
- persistence/default coverage proving `Approve for me` is the local default and the three enum values round-trip safely;
- focused regressions for hidden terminal and DevTools launch behavior;
- focused connection-state regression proving successful trusted MCP activity clears stale waiting presentation;
- relevant UI tests/smoke proving Approval Mode is configured from Overview → Approved workspaces and no longer from Activity;
- UI smoke proving Overview shows Current activity/Recent activity and Current Session / Work Status from trusted available state, while Activity remains the detailed timeline;
- UI smoke proving Safety status is no longer on Overview and security posture remains available in Security;
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
- Overview shows the selected Default Approval Mode in Approved workspaces;
- Activity contains operational history/logs without being the Approval Mode settings surface;
- trusted active-work evidence appears in Overview without fabricated renderer state;
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

Do not start Git network sync, Playwright runtime implementation, cloud work, per-workspace approval overrides, or any other milestone.