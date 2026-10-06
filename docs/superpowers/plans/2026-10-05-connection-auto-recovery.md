# Phase 1 — Connection Auto Recovery implementation plan

Date: 2026-10-05. Baseline: `42789cdfa9da6a09932c7146102c1a6a7fce269f`.
Status: **Architecture-approved implementation plan. Phase 1 implementation, owner smoke and final repair/focused re-review are complete. Separate owner-authorized release `v1.0.6` / commit `8a962e3` is published; Windows CI and public asset verification PASS. Installed-app owner acceptance remains pending. The implementation-task STOP CONDITION below is retained as its historical scope.**

Read [the design](../specs/2026-10-05-connection-auto-recovery-design.md) for authoritative lifecycle, retry, compatibility and UI semantics. Architecture Review approved this plan for implementation. Preserve unrelated changes and keep release/integration as a separate owner decision.

## Implementation compliance

- **Risk:** Security / Data Critical because process ownership, shutdown and bound Workspace/credential validation are affected.
- **Skills:** implementation selected and loaded `tdd`, `codebase-design`, `domain-modeling`, `impeccable`, and `writing-for-agents` at their applicable phases. Focused lifecycle/runtime/Desktop verification was performed; no full repository suite or release verification was requested.
- **Verification:** focused negative/race tests, existing affected lifecycle/security/updater regressions, affected builds/typechecks, direct security inspection, diff check and one final real runtime/UI smoke. No full suite or release/installer gate is implied.
- **Stop:** deliver the working owner-test candidate after required focused proof; do not start Phase 2, publish, change dependencies, commit/push or broaden authority without explicit instruction. Stop on scope/security/environment blockers under AGENTS.md.

## Expected production changes

| Exact path | Expected work |
| --- | --- |
| `packages/application/src/connection-service.ts` | Session intent, bound-context checks, finite retries/stability clock, single timer ownership, cancellation epoch, queued synchronous events, safe recovery status, shutdown/disposal and narrow saved-preference notification. Separate manual lifecycle actions from internal automatic restart; preserve fail-closed start/stop validation. |
| `packages/domain/src/connection.ts` | Read-only recovery status type; associate runtime events with connectionSessionId. No persisted intent. |
| `packages/application/src/connection-runtime-port.ts` | Keep fixed-purpose start/stop/subscribe; re-export updated typed events/status as needed. No host-control fields. |
| `packages/contracts/src/index.ts` | Strict bounded recovery projection on Desktop runtime status; preserve existing state enum/error vocabulary and inert legacy fields. Confirm whether shared ConnectionServiceStatus DTO also needs the projection; do not force unrelated consumers to gain privileged data. |
| `packages/infrastructure/src/secure-tunnel-health.ts` | Distinguish timeout from invalid health URL in failure callback while retaining current loopback validator, request timeout and readiness-only scope. |
| `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` | Emit scoped events, map invalid health URL to TUNNEL_PROFILE_INVALID, make each launch terminal after failure/stop, ignore stale callbacks and preserve stop failure/handle ownership. |
| `packages/infrastructure/src/credential-store.ts` | Repair follow-up: expose a process-local monotonic credential revision that increments only on trusted credential mutations. Bind/compare revision without hashing, serializing or auditing credential values. No renderer API or persisted revision. |
| `packages/desktop/electron/connection-controller.ts` | Map safe recovery projection, apply saved OFF immediately, reject duplicate recovery start/restart, enforce no initial stopped-session restart, retain stopped-only setup guards, default Auto Recovery ON only for newly created profiles, preserve existing profile values, and send inert legacy preference false. |
| `packages/desktop/electron/connection-shutdown.ts` (new) | Small fixed-purpose shared cleanup function for main/update: latch service shutdown before await, stop before Git/DB disposal, share duplicate requests, allow cleanup retry on failure, close DB once. Accept only trusted service/cleanup dependencies, no renderer input. This function consolidates two real callers and provides their ordering test seam. |
| `packages/desktop/electron/main.ts` | Compose shared shutdown with current service/Git/DB; prevent normal quit until complete and guard reentry; use it in updater callback; terminate the already-shut-down app if provider installation throws after DB closure; extend Workspace guards to recovery intent if a stopped interval is observable. No startup start call. |
| `packages/desktop/electron/update-controller.ts` | Repair follow-up: distinguish shutdown failure from post-shutdown provider install failure. Never call provider install when shutdown fails; after successful shutdown, invoke only a trusted main-process termination callback if provider install throws so the app cannot continue against a closed DB. |
| `packages/desktop/src/connection-ui-model.ts` | Recovery-aware shared presentation/action helper, truthful component status, authoritative Disconnect, terminal Retry connection. Keep existing state-only helper callable for unaffected consumers if useful. |
| `packages/desktop/src/pages/ConnectionPage.tsx` | Remove Auto Start row, reword Auto Recovery row/helper, send autoStart:false for compatibility, render recovery and terminal actions. |
| `packages/desktop/src/pages/HomePage.tsx` | Consume shared recovery presentation and primary action; avoid setup copy hiding a relevant blocked/exhausted state. |
| `packages/desktop/src/App.tsx` | Shell uses same recovery presentation from existing safe status reader. |

Review-only/no planned mutation: `packages/domain/src/types.ts` (existing transitions suffice), `packages/domain/src/result.ts` (existing safe errors suffice), `packages/infrastructure/src/database.ts`, `packages/infrastructure/src/connection-profile-repository.ts`, `packages/application/src/connection-config-service.ts` (retain legacy storage), `packages/infrastructure/src/secure-tunnel-process.ts` (preserve fixed launcher/env isolation), `packages/infrastructure/src/secure-tunnel-profile.ts` (preserve fixed generated profile), `packages/desktop/electron/connection-ipc.ts`, `packages/desktop/electron/preload.ts` (same validated channels and typed methods). The final repair review justified the narrow `credential-store.ts` revision seam and `update-controller.ts` post-shutdown failure callback above; neither adds generic IPC, process controls, credential getters or secret-derived state.

## Sequence and completion criteria

1. **Compatibility and startup proof.** Add tests loading real legacy SQLite auto_start=true, manual-only initial start and no launch from snapshot/preferences/renderer reload. Preserve old field storage; remove UI row later. Done when tests protect startup even with configured Workspace/credentials and both legacy toggles true.
2. **Typed runtime events and failure causes.** Add timeout/invalid-URL and stale-launch regressions before edits. Update event producers/fakes together. Done when invalid URL cannot schedule recovery, readiness timeout can, and old ready/exit/client callbacks cannot affect a new session or stopped/terminal state.
3. **Service recovery.** Implement policy behind existing service using fake clock. Done when three delayed attempts, stability reset, same bound-context validation, no duplicate starts, manual-versus-automatic accounting and synchronous-event ordering pass through the public service interface. Successful launch alone does not reset budget.
4. **Cancellation and cleanup.** Implement saved-OFF notification/controller mapping, service shutdown, shared normal-quit/update cleanup and recovery-aware Workspace guards. Done when cancellation precedes cleanup, timer/event races do not restart, failed stop never spawns another process, duplicate shutdown does not close DB twice and install waits for cleanup. No automatic reactivation after failed install.
5. **Minimal renderer changes.** Load Impeccable against actual ConnectionPage target; reuse current Desktop visual system. Implement design copy/presentation across Connection/Overview/shell without a new page. Done when Disconnect stays reachable throughout recovery and terminal/manual states are understandable at normal/narrow desktop width. Preserve existing channel validation.
6. **Focused closure.** Run only affected proof below, inspect touched security code/diff and perform one final real app smoke with synthetic test data. Record actual evidence and owner next action in handoff. Done at owner-test candidate, with remaining optional gates clearly listed. No release or next milestone.

## Exact test files and trustworthy seams

| File | Proof |
| --- | --- |
| `packages/tests/src/connection-auto-recovery.test.ts` (new) | Real ConnectionService with repo/credential/runtime dependencies and fake timers: manual-only intent, ON/OFF, 1/3/10s delays, exactly three attempts, duplicate event/start coalescing, stability at 60s without client signal, failure at 59s, stop/shutdown/OFF races, late callbacks, terminal status, fresh manual Retry budget and bound-context invalidation. Parameterize existing non-retryable codes/unknown errors, including cleanup failures. |
| `packages/tests/src/connection-desktop-lifecycle.test.ts` (new) | Controller plus shared shutdown composition: startup/snapshot does not launch with real legacy auto_start=1; setup/preferences do not grant intent; fresh stopped restart cannot establish it; renderer reload preserves same main intent; quit and Restart & Update revoke before await; stop failure prevents DB close/install; duplicate cleanup and failed-install latch behavior; Workspace selection/removal remains guarded. Use real service wherever practical, fake trusted Git/DB cleanup and update provider. |
| `packages/tests/src/fakes/fake-connection-runtime.ts` | Capture/current event identity and deliberately stale-event injection; retain onStart reentrancy seam and call counts. |
| `packages/tests/src/m0.3.test.ts` | Existing manual lifecycle, duplicate/reentrant calls, Workspace bind/negative prerequisites, safe DTO/audit and start/stop/restart remain valid; update event fixtures for scoped identity and new safe status. |
| `packages/tests/src/m0.5.test.ts` | Real tunnel runtime with process/health fakes: exit/timeout triggers, invalid URL reason, failed cleanup retained handle, stale ready/exit after restart, fixed launch/profile/credentials, strict safe output. Add a direct loopback health-probe case here if needed to prove reason mapping rather than only mocking it. |
| `packages/tests/src/m0.6.test.ts` | Legacy preferences IPC, strict DTO bounds/extras, controller actions and shared UI helper. Add recovery ON/OFF behavior and authoritative Disconnect/terminal Retry projection. |
| `packages/tests/src/m0.2.test.ts` | Existing SQLite/config compatibility remains valid; seed old true field and prove it remains inert through actual startup service/controller integration. |
| `packages/tests/src/m0.7.test.ts` | Update only scoped-event/status fixtures if its diagnostics integration uses affected types. |
| `packages/tests/src/app-shell-overview.test.ts` | Existing Overview/shell contract and recovery copy/action integration; update status fixtures only where affected. |
| `packages/tests/src/update-controller.test.ts` | Retain verified shutdown-before-install test; add shutdown-failure/no-install and post-shutdown provider-failure/forced-termination cases through the fixed callback. |
| `packages/tests/src/update-data-preservation.test.ts` | Keep updater data-preservation proof aligned to the shared `connection-shutdown.ts` seam: Connection shutdown before Git/DB cleanup, then provider install; assert production post-shutdown failure terminates the app. |
| `packages/tests/src/secure-runtime-api-key.test.ts`, `packages/tests/src/secure-tunnel-environment.test.ts` | Focused credential preparation/redaction, non-secret credential-revision mutation semantics and host-environment isolation regressions; never use real owner secrets. |

Required scenario coverage includes missing/changed Workspace root, missing/changed profile/tunnel config, removed/unavailable credential, a still-configured credential replaced after manual bind, unavailable runtime/client/gateway, failed stop, duplicate failure during timer delay, reentrant failure during runtime.start, queued ready then failure, shutdown before/at timer fire, OFF→ON before the 60-second stability reset without refunding attempts, stable client-only degraded without tunnel restart, the non-retryable runtime-failure matrix, shutdown failure with zero provider-install calls, and provider-install failure after successful cleanup forcing app termination. Parameterized cases should prove no process start beyond the accepted/bounded launch and no lingering timers/subscriptions after shutdown.

## Focused verification and owner test

For the implementation/repair candidate, build touched package dependencies in normal repository order and run the selected files above with repository Electron-as-Node Vitest setup and isolated synthetic LOCALAPPDATA where needed for native SQLite. Use affected typechecks/lint/build to make the candidate runnable. Do not mutate versions/lockfile to address an ABI/environment issue. Inspect the actual process/session ownership, credential validation and cleanup code. Run git diff --check. No full repository suite is required by this plan.

One final real Electron app/runtime smoke should cover:

1. Launch with a synthetic valid test profile including legacy auto_start=true: disconnected, no managed child. Click Connect and verify normal readiness/connection flow. Repeat fresh launch: still disconnected.
2. Enable Auto Recovery, terminate only the SUD-D-owned **test** tunnel process after its identity is verified; observe scheduled recovery then one fresh process via existing runtime path. Never use a broad process-name kill or owner live tunnel.
3. Make only the test process fail repeatedly: three attempts then terminal error/manual Retry. Short successful readiness periods must not reset the count; a 60-second stable period must reset it.
4. Disconnect during scheduled retry and wait beyond 10 seconds: no restart. Switch Workspace/config only after Disconnect and manually Connect again; recovery cannot silently rebind.
5. OFF: unexpected failure requires manual action. Client-only disconnect/degraded is verified with the trusted fake event seam, since production client telemetry is absent; do not claim real signal wiring exists.
6. Quit with retry pending; verify no retry/child remains. Reopen disconnected. Verify Restart & Update cancellation through the real shared callback with a **fake provider**; do not publish/install a new release for this candidate. A live installed A→B update remains separate owner/release acceptance, not claimed by this smoke.
7. Inspect Connection/Overview/shell agreement, recovery Disconnect, terminal Retry, keyboard focus/status announcements and narrower desktop wrapping. Keep test fixture/evidence local under .serena; use no real credentials in captures/logs.

Owner smoke has passed for fresh launch/manual Connect, Auto Recovery ON/OFF, bounded 1s/3s/10s retries, 60-second reset, exhaustion/no attempt 4, terminal UI, Disconnect no-relaunch, normal app close and fresh reopen. Final re-review passed and the owner subsequently authorized commit/push/release. v1.0.6 is published; publication evidence and pending installed update acceptance are tracked in the Handoff.

## Stop conditions

This implementation task ends with the approved Phase 1 production edits, focused lifecycle/security verification and minimal status/handoff updates. It performs no full-suite requirement, packaging, installer, release/tag, commit or push. Any need for fundamentally new Secure Tunnel/credential/process/Network authority remains a blocker, not implied permission. Parallel Team, Computer Use, Recovery/Delete, Serena/runtime updates and production client_connected wiring remain outside Phase 1.
