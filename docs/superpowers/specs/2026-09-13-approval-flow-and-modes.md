# Approval Flow and User-Selectable Automation Modes

Status: APPROVED PRODUCT DIRECTION — implementation scope below is intentionally bounded.

## Context

Real SUD-D-only Team Mode dogfood on Work PC reached `completed`, but `verify.run: diff_check` entered an approval loop: after the user approved the request, retrying the same bounded action created a new approval request instead of consuming/reusing the approved decision. This blocks the end-to-end flow before `secret_scan`, `git.commit`, and `work.checkpoint`.

Observed approval request IDs during the same acceptance sequence included:

- `829a5a9b-ba42-4ad9-aa96-ac05d596d437`
- `ffade06a-8ad6-43e9-a760-22a5bbf6e98b`
- `9db7646e-7f3e-476c-987f-b24d3ef95771`

No Serena or Remote Commander fallback was used.

## DGF-008 — Approval retry loop

Expected behavior:

- an approved request must be consumed or matched deterministically for the same bound action;
- retrying the same action must not create an endless sequence of fresh approval IDs;
- a new approval may be required only when the approval binding materially changes, the prior decision is expired/denied/consumed by design, or policy explicitly requires a fresh decision;
- approval binding must remain fail-closed and auditable.

This bug is an immediate blocker for Team Mode end-to-end dogfood and should be fixed before continuing acceptance.

## Approved user-selectable modes

The Product Owner approved a simpler personal-first approval experience inspired by agent products that offer automatic approval modes.

### Standard

Current conservative behavior. Protected actions request explicit approval according to Policy.

### Approve for me

Auto-approve only bounded local-development actions that SUD-D Policy already permits inside the Active Workspace. Initial implementation should be deliberately narrow and cover the current development loop first, such as restricted Verify actions and bounded `git.commit`, subject to existing sensitivity checks.

`Approve for me` must not weaken hard security boundaries. Sensitive-path, destructive, secret-bearing, network, outside-workspace, internal-root, or otherwise high-risk cases may still ASK or DENY according to Policy.

### Full Access

Approved product direction, but NOT part of the immediate implementation patch. It means maximum automation within SUD-D's allowed capability model, not bypassing security invariants. Design and implementation require a separate explicit security-scoped task after real dogfood of `Approve for me`.

Even Full Access must never mean arbitrary executable/argv/cwd/env authority, outside-workspace access, plaintext-secret exposure, or bypass of explicit DENY rules.

## Immediate implementation scope

Implement now:

1. Fix DGF-008 approval consumption/retry behavior.
2. Add `Approve for me` as the smallest usable user-selectable mode for the existing bounded development loop.
3. Preserve `Standard` behavior unchanged when selected.
4. Keep mode selection explicit to the user and visible in SUD-D Desktop.
5. Keep Policy/Approval/Audit authoritative below the UI; renderer selection must not become a generic privilege surface.
6. Add focused security/TDD coverage for approval binding, changed-input retry, stale/denied approval, and `Approve for me` hard-boundary cases.
7. Stop before implementing Full Access.

## Acceptance for this task

- Standard mode: approved `diff_check` retry proceeds without generating an endless approval loop.
- Approve for me: the docs-only SUD-D Team Mode flow can proceed through `diff_check → secret_scan → git.commit → work.checkpoint` without manual approval for eligible bounded actions.
- Hard boundaries remain ASK/DENY as specified by Policy.
- No arbitrary shell/process authority is introduced.
- SUD-D-only acceptance must report Serena = NO and Commander = NO.

## Separate open dogfood follow-up

DGF-007 remains open: launching the SUD-D Desktop app on Work PC visibly opens a DevTools/console window every time. Normal product launch should not show that console. Do not mix this UI/runtime-startup fix into the approval-flow patch unless separately authorized.
