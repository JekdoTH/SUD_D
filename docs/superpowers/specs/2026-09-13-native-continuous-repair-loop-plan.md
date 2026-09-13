# SUD-D Native Continuous Repair Loop — Future Plan

Status: APPROVED FUTURE PRODUCT/ORCHESTRATION DIRECTION. Not part of the current Personal Alpha Stabilization implementation scope.

## Goal

Make SUD-D able to continue bounded engineering work through ordinary verification failures without returning control to the user after every small regression.

Target loop:

```text
Run gate
→ FAIL
→ classify/fingerprint failure
→ diagnose root cause
→ apply the smallest in-scope repair
→ run focused verification
→ if GREEN, resume only the invalidated gate
→ continue toward the active STOP CONDITION
```

The loop is for bounded repair inside an already approved milestone. It does not grant new product scope or new authority.

## Relationship to AGENTS.md

`AGENTS.md` remains the immediate agent-level operating rule for Serena and other coding agents. It should instruct agents to use a Continuous Repair Loop during implementation/verification instead of stopping on every ordinary regression.

The native SUD-D capability planned here is a stronger second layer: the SUD-D Orchestrator itself owns and persists the repair loop so the behavior is consistent across agents and sessions rather than depending only on agent compliance with repository instructions.

## Proposed orchestration model

Add the smallest durable orchestration concepts needed:

- `RepairPolicy`
  - default `maxRepairCyclesPerRootCause = 3`
  - bounded to the active milestone/task and STOP CONDITION
- `FailureFingerprint`
  - identifies the current failing gate/root cause candidate
  - materially different failures start a new repair budget
- `RepairAttempt`
  - diagnosis summary
  - scoped change/repair action
  - focused verification evidence
  - attempt number
- `RepairState`
  - active gate
  - current fingerprint
  - attempts used
  - last verification result
  - next allowed action
- Work Memory / checkpoint integration
  - persist enough state to resume the same bounded repair loop after reconnect/session/device handoff
- Audit/activity events
  - expose concise trusted events such as `repair.started`, `repair.attempted`, `repair.verified`, `repair.blocked`, `repair.completed`

Do not create a parallel task/memory system; reuse Goal / Task / Checkpoint / Work Memory / Activity concepts already owned by SUD-D.

## Default behavior

For an ordinary in-scope verification failure:

1. Capture/fingerprint the failure.
2. Diagnose the root cause using the tightest available feedback loop.
3. Apply the smallest safe repair inside approved scope.
4. Run focused verification for the changed boundary.
5. If focused verification passes, rerun only the gate invalidated by the repair.
6. Continue automatically toward the existing STOP CONDITION.
7. If a different root cause appears, start a new repair budget for that new fingerprint.

A repair cycle means a real `diagnose → change → focused verify` attempt. Merely rerunning the same failing command does not consume a repair cycle unless the failure is plausibly environmental/flaky and the retry itself is the diagnosis step.

## Stop / escalation conditions

Stop automatic repair and return a concise blocker to the user when any of these occurs:

- the same root cause remains unresolved after 3 repair cycles;
- root cause remains materially unclear after the bounded diagnostic budget;
- repair would expand the approved milestone/task scope;
- repair requires an architecture/product decision not already established by source-of-truth docs;
- repair would weaken or alter a security boundary, Policy/Approval/Audit/Recovery invariant, workspace containment, secret handling, or privileged execution model;
- destructive/data-loss risk, workspace escape, secret exposure, privilege escalation, or policy conflict is detected;
- a required external environment/credential/dependency cannot be satisfied safely;
- the active STOP CONDITION is reached.

Security-critical failures remain fail-closed. Repair automation never converts DENY into ALLOW and never bypasses Approval Mode or user authority.

## Verification economy

Native repair must follow SUD-D's existing focused-first, final-once, rerun-by-invalidation rule:

- focused RED/GREEN while repairing;
- preserve still-valid evidence;
- rerun only invalidated gates after each repair;
- run the milestone's final required gates once the implementation is stable;
- do not restart the entire verification sequence after every small fix.

## UI / Activity direction

The current Overview/Activity design should eventually surface trusted repair progress without turning the UI into a raw debug console.

Examples:

```text
Current activity
Repairing verification failure
Gate: full test suite
Attempt: 2 / 3
Root cause: migration expectation mismatch
Next: focused regression
```

Activity retains the full trusted timeline/history. Overview shows only concise current status and recent meaningful events.

## Security invariants

The native loop sits above the existing privileged path and never bypasses it:

```text
SUD-D Orchestrator / Repair Loop
→ Tool Interface
→ MCP Gateway / Tool Kernel
→ Policy
→ Approval
→ Execution
→ Audit / Recovery
```

It must not introduce:

- arbitrary executable / argv / cwd / env authority;
- outside-workspace or InternalRoot access;
- plaintext-secret serialization;
- generic network authority;
- approval bypass;
- hidden scope expansion.

## Suggested future implementation order

1. Land and dogfood the AGENTS.md-level Continuous Repair Loop first.
2. Observe real failure/retry patterns during Personal Alpha usage.
3. Design `RepairPolicy` + `FailureFingerprint` + `RepairState` against the existing Team/Work Memory model.
4. Add trusted Activity events and resume/checkpoint semantics.
5. Add focused orchestration tests for success, new-root-cause reset, 3-cycle exhaustion, security stop, scope stop, and session resume.
6. Add a small Overview current-activity presentation using trusted state.
7. Dogfood before considering configurable retry budgets or more advanced repair strategies.

## Acceptance direction

A future native implementation is successful when SUD-D can take an already-approved bounded task through ordinary test/regression failures to its STOP CONDITION without user intervention for each small repair, while reliably escalating after 3 failed repair cycles for the same root cause and preserving all existing security boundaries.
