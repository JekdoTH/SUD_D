# Phase 1 — Connection Auto Recovery / Auto Restart

Date: 2026-10-05. Baseline: `42789cdfa9da6a09932c7146102c1a6a7fce269f` (clean working tree).
Status: **Architecture Review approved. Phase 1 implementation, owner smoke, final repair pass and focused re-review are complete. Owner-authorized release `v1.0.6` / commit `8a962e3` is published; Windows CI and public asset verification PASS. Installed-app owner acceptance remains pending.**

## Approved product decisions

Every fresh Desktop process starts disconnected. Only the user pressing Connect establishes initial connection intent; configured credentials, Workspace, old settings and previous ChatGPT activity confer no intent. Auto Start is removed from product direction. Intent lives only in the current app process. Disconnect, normal quit and Restart & Update cancel recovery before cleanup. Recovery is limited to unexpected failure of the SUD-D-managed runtime; client absence alone never starts recovery. Attempts must be finite, configuration failures fail closed, and existing fixed-purpose runtime/credential/Workspace/Policy boundaries remain intact.

Architecture Review ratified the implementation details below. The implementation task changed production source only within the approved lifecycle boundary and performed no database migration. The subsequent owner-authorized release checkpoint is tracked separately in the Handoff.

## Baseline lifecycle and evidence

The table below records the pre-Phase-1 baseline used for the design; implementation decisions and owner overrides later in this document are authoritative for the current candidate.

| Baseline source | Relevant behavior |
| --- | --- |
| `packages/domain/src/types.ts` | Eight existing Connection states and a fail-closed transition table. `error → stopping → stopped → starting` supports recovery without a new Connection state. |
| `packages/application/src/connection-service.ts` | Owns state, immutable session, safe error and synchronous lifecycle guard. Start validates profile, credential and active Workspace; stop cleans runtime; restart stops before starting but rejects transitional states. Runtime failures become `error`; no retry exists. Subscription currently has no disposal path. |
| `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` | Owns one process handle. Unexpected exit emits `TUNNEL_EXITED_UNEXPECTEDLY`; readiness failure emits `TUNNEL_HEALTH_FAILED`. Handle identity/stopping checks suppress some stale callbacks. Failed health cleanup can retain the process handle. |
| `packages/infrastructure/src/secure-tunnel-health.ts` | Loopback-only readiness probe: 15-second deadline, 250ms polls, 1-second request timeout. Stops after ready/failure. Invalid health URL and timeout currently share one failure callback. There is **no ongoing post-ready health monitor**. |
| `packages/desktop/electron/connection-controller.ts` | Baseline cached profile/credential presentation; new profiles originally defaulted both preferences OFF. Credential/tunnel changes require `stopped`. Preference changes are allowed while running. |
| `packages/infrastructure/src/database.ts`, `connection-profile-repository.ts` | `auto_start` and `auto_restart` boolean columns; domain/config/contracts retain both fields. Neither preference currently drives runtime automation. |
| `packages/desktop/src/pages/ConnectionPage.tsx` | Both toggles appear in advanced details as saved-only preferences. Connection/Overview/shell read status every two seconds. Error currently offers manual restart. |
| `packages/desktop/electron/main.ts` | Creates runtime/service without connection auto-start. Blocks switching/removing the bound Workspace while not stopped. Update callback stops Connection, disposes Git, closes DB; normal `before-quit` currently only disposes Git. |
| `packages/desktop/electron/update-controller.ts` | Verified manual Restart & Update awaits orderly shutdown before invoking provider installation. |

Client events are separate from runtime health. `client_disconnected` changes `connected → degraded`. Production `GatewayClientSignalPort` is not wired; `getStatus()` can infer initial connected state from trusted MCP audit activity while `waiting_for_client`. Neither a poll nor missing audit/client activity is a recovery trigger. Recovery cannot promise ChatGPT will automatically reattach or interrupted work will replay.

## Ownership and narrow interface

Extend the existing application **ConnectionService** with internal recovery behavior. It already owns runtime events and lifecycle serialization; a second controller/supervisor subscribing independently would duplicate ordering and state ownership. Infrastructure continues owning process/health cleanup; Electron main owns app lifetime; renderer only reads safe status and sends existing fixed-purpose actions.

Session-local fields: connection intent, bound profile/Workspace identity and launch-relevant configuration fingerprint, current launch identity, lifecycle epoch, consumed attempt count, recovery phase, retry timer, stability timer and shutdown latch. None enter SQLite. Fingerprints stay internal, exclude plaintext secrets and do not derive from credential values. Credential stores expose only a process-local monotonic revision counter: successful trusted set/setup/remove operations increment it, manual Connect binds the current revision, and automatic retry must match it. The revision is neither a credential fingerprint nor persisted/serialized/audited; because connection intent is also process-local, resetting revisions on app restart does not weaken the session boundary.

Use injected timer/monotonic-clock functions in ConnectionService options for deterministic tests; this is a private Connection-specific seam, not a scheduler service. Add a fixed-purpose `shutdown()` operation that latches termination before stopping and unsubscribing; it is internal main-process/application control and has no renderer IPC channel. Ordinary `stop()` always revokes intent and cancels timers, even if state is already stopped or cleanup fails. A narrow internal preference-change notification allows the Desktop controller to apply a successfully saved OFF immediately; it does not accept host-control parameters.

Add a safe read-only recovery projection to service status and the Desktop runtime DTO:

`{ phase: idle | scheduled | restarting | stabilizing | exhausted | blocked, attempt: 0..3 }`.

`attempt` is consumed automatic attempts (zero before the first). The renderer presents the next attempt as `attempt + 1` only when scheduled. Idle uses zero. Blocked/exhausted preserve the last consumed count. Strict contracts reject extra host-control or secret fields. The projection carries no timer handles, file paths, process diagnostics, config fingerprints or credentials. Preserve existing ConnectionState and safe error vocabulary; terminal status keeps the underlying safe error.

Runtime events must be associated with the **connectionSessionId** passed into runtime start. Infrastructure captures this identity with its handle/watch; service accepts events only for the current candidate/session. Clear/invalidate identity before cleanup. Guard callbacks with a per-launch terminal flag as well as handle identity so an obsolete ready callback cannot undo failure. During synchronous `runtime.start`, queue matching events until the candidate session is committed; discard them on start failure, then process in order. This addresses callback reentrancy without moving privileged work into the renderer or adding asynchronous starts.

## Lifecycle answers

| Question / event | Approved rule |
| --- | --- |
| Where is connection intent? | ConnectionService memory. Set only by explicit manual Connect after validation/accepted launch; a synchronous launch rejection clears it. An accepted launch awaiting readiness is eligible for recovery even before client attachment. Fresh construction/status reads always have false intent. |
| Where is retry state? | Same service, scoped to that intent and launch identity. Persist only the preference, never intent/budget/timers. |
| What starts recovery? | A matching trusted retryable `runtime_failed`, with intent true, saved Auto Recovery ON, no shutdown latch, unchanged bound context and available budget. |
| What cancels recovery? | Disconnect/stop, shutdown/update, successfully saved OFF, accepted configuration invalidation, changed bound context, deterministic failure or exhaustion. Clear both timers and bump epoch before effects. |
| Another retry already pending? | Coalesce matching duplicate events; never replace the scheduled deadline or refund attempts. Ignore obsolete identities. One start operation and at most one retry timer. |
| Disconnect during retry? | Revoke intent first, clear timers and stability accounting, invalidate epoch/launch, then stop normally. Late callback cannot start. Failed stop stays error with no automation. |
| Connect during recovery? | UI exposes Disconnect while scheduled/restarting/stabilizing. A duplicate start/restart request is rejected with existing lifecycle-busy semantics; it cannot accelerate retry, reset budget or start twice. After terminal failure, the existing explicit Retry/Restart connection action creates a new manual attempt/budget. A restart request from a fresh stopped Desktop session cannot substitute for initial Connect. |
| Workspace/profile/config changes? | Keep current UI/main guards: Disconnect before bound Workspace switch/removal or credential/tunnel mutation; reject such changes while recovery owns intent even if a cleanup briefly reports stopped. Rejected mutations do not cancel a valid recovery. If trusted external changes are accepted/detected, cancel and require a fresh manual Connect, never silently bind the new context. Re-read and compare bound identity/config before each retry; run existing service validations again. |
| Shutdown/update? | Latch shutdown and cancel synchronously before awaiting cleanup. Reject new starts thereafter. Share one orderly cleanup path for normal quit and update. Duplicate quit/update calls share cleanup rather than closing DB twice. |
| Exhaustion? | Existing runtime state `error`, `recovery.phase=exhausted`, no timers, false intent. Show manual action. Late ready/client events cannot revive the terminal session. |

An explicit manual restart of an already manually started connection remains supported outside automatic recovery. It is distinguished internally from the automatic attempt: only explicit user action resets the budget. Turning ON alone never starts/restarts a failed or disconnected connection; it applies to the next eligible failure of a still-active manually started intent. Turning OFF does not stop a healthy connection. If a recovery launch is already underway when OFF is processed, suppress further retries/reset timers and let that one accepted launch settle; do not initiate a second lifecycle operation. Turning OFF must not refund consumed attempts. If ON is restored on that same ready launch, start a fresh 60-second stabilization window while preserving the consumed count; only completion of that window may reset the budget.

## Retry classification and policy

Recommended fixed policy: **three automatic attempts**, delayed **1s, 3s, 10s** after the corresponding failure. The original manual attempt is not counted. Consume an attempt immediately before its restart, including any cleanup/start failure. Each attempt uses existing stop-then-start through ConnectionService, validates prerequisites again and creates a fresh immutable connection session with the same bound Workspace/profile. No concurrent start, no arbitrary executable/path/environment input, no repeated timer deferral when busy.

| Failure/event | Automatic behavior |
| --- | --- |
| `runtime_failed: TUNNEL_EXITED_UNEXPECTEDLY` | Eligible for bounded recovery while matching current intent/context. Exit code alone cannot establish authentication/config cause; do not parse raw stderr to decide authority or retries. |
| `runtime_failed: TUNNEL_HEALTH_FAILED` from readiness deadline/transient loopback failure | Eligible, including accepted initial launch and an automatic attempt that never becomes ready. |
| Invalid/non-loopback health URL | Non-retryable. Change health callback to a narrow typed reason (`timeout` versus `invalid_health_url`); runtime maps invalid URL to existing `TUNNEL_PROFILE_INVALID`. Preserve loopback validation and request deadlines. |
| Missing/invalid Workspace; missing credential; missing/invalid profile/tunnel; unavailable tunnel-client/gateway/runtime bootstrap | Non-retryable: existing `CONNECTION_WORKSPACE_NOT_SELECTED`, `WORKSPACE_INVALID`, `CONNECTION_CREDENTIAL_MISSING`, `CONNECTION_PROFILE_NOT_FOUND`, `TUNNEL_PROFILE_INVALID`, `TUNNEL_CLIENT_NOT_FOUND`, `MCP_GATEWAY_ENTRY_NOT_FOUND`, validation errors. |
| `TUNNEL_START_FAILED`, `CONNECTION_RUNTIME_START_FAILED`, `INTERNAL_ERROR`, unknown error | Non-retryable because current vocabulary conflates deterministic prerequisites and launch failures. Stop rather than guess retryability. |
| `TUNNEL_STOP_FAILED`, `CONNECTION_RUNTIME_STOP_FAILED` | Non-retryable; cleanup cannot prove exclusive ownership. Keep error/handle for explicit cleanup, no replacement process. |
| Client disconnect, degraded, absent telemetry/chat, absent MCP activity | Never restart the tunnel. |
| Busy/invalid transition/rebind mismatch | Reject/cancel as appropriate; not another retry source. |

Before executing retry, reconcile live bound context and preference, invalidate the previous launch and clean the old runtime. Failed cleanup blocks restart. If prerequisite validation fails while service is stopped after cleanup, deliberately transition `stopped → starting → error` for terminal recovery presentation, without runtime launch, using the existing domain transitions; do not report a healthy stopped state with a pending retry.

Keep consumed attempts across short-lived successful launches. On tunnel readiness, clear retry scheduling and enter `stabilizing`. Reset budget only after **60 continuous seconds from readiness with no matching runtime failure**, and still-active same intent/context. Accept `waiting_for_client`, `connected` or client-only `degraded` as ready runtime states; client absence never prevents reset or causes restart. A failure at second 59 retains the count; a failure after reset starts a new bounded incident. After the third launch, allow its stability window; a failure before stable reset exhausts immediately. This prevents rapid crash loops, while permitting later incidents after stable operation. It is a finite per-incident policy, not a lifetime guarantee of three attempts across hours of healthy use.

Stability means readiness achieved with no observed managed-runtime failure; it is **not** proof of ongoing end-to-end connectivity. Phase 1 reuses existing readiness and exit signals. Continuous post-ready health probing and production client signal wiring are outside this design. No separate generic watchdog is proposed.

## Shutdown and cleanup

Main must call service shutdown before Git disposal/DB closure, both from normal quit and update's `orderlyShutdown`. Prevent normal quit until this cleanup resolves, then re-enter quit through an already-completed guard. Shutdown cancels timers even when stop fails, and repeated cleanup must permit explicit stop retry without resuming automation. On stop failure, block orderly quit/install and surface the safe error while keeping DB open; never spawn a replacement to conceal cleanup failure. A forced OS/process kill is not a graceful-cleanup guarantee and never persists intent for relaunch.

If update installation fails after successful cleanup/DB close, leave recovery disabled and require reopening the app rather than operating against a closed DB. The trusted main-process update composition must immediately request app termination when the provider install call throws after orderly shutdown has completed; a shutdown failure itself must prevent provider install. Preserve updater signature/hash checks and its existing shutdown-before-install ordering. No auto-connect on the reopened process. No renderer API for clearing the shutdown latch.

## Legacy preferences

Use **strategy A** for Auto Start: remove the row and all behavioral use; retain the inert `autoStart` domain/contract/SQLite field for compatibility. Old `auto_start=1` data may round-trip but must never influence starts. New profiles set `autoStart=false`. The current strict preferences request sends `autoStart:false` when editing Auto Recovery; that may normalize the old row as an incidental preference save. Do not introduce a bulk rewrite, drop column or schema-version migration. Tests deliberately load old true data and prove zero startup launches. Full field removal can be a separate cleanup if justified; it is unnecessary to enforce manual initial Connect.

Retain persisted `autoRestart` under its existing storage name, relabeled as Auto Recovery. **ON:** recover unexpected eligible managed-runtime failure only within current manually established intent. **OFF:** no automatic attempt; failure requires user action. Preserve every existing profile's saved value. **Owner override after architecture approval:** newly created profiles default Auto Recovery ON (`autoRestart=true`) while `autoStart=false`; this default is creation-only, performs no migration, and never grants initial-connect consent. Fresh construction/startup remains disconnected until explicit Connect. No persistence of last-connected intent.

## Minimal UI brief (Impeccable / Operate)

The owner scans status and chooses Connect/Disconnect. Preserve the incumbent Desktop cards, typography, colors and existing advanced preference placement; no new page or controls for retry tuning.

- Remove Auto-start preference. Relabel remaining toggle **Reconnect automatically if the connection fails**; helper: **Only after you connect. Stops when you disconnect or close SUD-D.** No saved-only placeholder after implementation.
- Scheduled/restarting: **Reconnecting**, **Attempt 1 of 3** (bounded value); use existing informational treatment. Primary action is **Disconnect**, available across recovery phases. No countdown, toast loop or progress percentage.
- Stabilizing: show the truthful existing Waiting for ChatGPT/Connected/Needs attention status; Disconnect remains available. Do not present a runtime restart as confirmed client reattachment.
- Exhausted: **Couldn't reconnect. Check the connection setup, then retry.** Existing error treatment and manual **Retry connection** action; secondary Disconnect supports cleanup/setup. Blocked: existing safe prerequisite/cleanup message and relevant Connection/Environment route. No raw process output.
- Update the same safe presentation helper across Connection, Overview and shell so they agree on recovery. Preserve Gateway/Tunnel/Client truth separately from the recovery overlay, including terminal error. Existing two-second polling is sufficient; hidden page/renderer reload cannot drive retries.
- Status changes use polite accessible announcements once per phase/attempt; terminal failure uses existing error semantics. Keep keyboard labels/focus, text plus color, and narrow desktop wrapping. UI-only busy state must not disable authoritative Disconnect merely because a retry timer exists.

## Security and rejected alternatives

Connection recovery repeats the existing fixed-purpose connection launch; it does not execute user work or replay privileged tool calls. Gateway operations continue through Tool Kernel → Policy → Approval → Execution → Audit/Recovery. New MCP sessions must still bootstrap Work Memory and honor approvals. No credential getters, plaintext serialization, arbitrary executable/argv/cwd/env, renderer-selected path, generic Network/process authority or Workspace hot-switch is introduced. Keep credential preparation, launch environment isolation and safe error/audit behavior on every attempt.

Rejected: launch-time Auto Start (contradicts owner intent); persisted intent (reconnects without new session consent); infinite retry (crash storms); reset on `start()` return/client_connected (ready-but-crashing loop or telemetry dependency); renderer timers (page-dependent authority); duplicated recovery controller (two lifecycle owners); automatic Workspace rebinding (changes authorization context); broad DB migration (unnecessary compatibility risk); post-ready monitoring/client signal project (scope expansion).

## Review questions and risks

Architecture Review approved the toggle/default compatibility policy, 3 attempts/1-3-10s/60s policy, service ownership, scoped runtime events and typed health reason for Phase 1 implementation.

Known limits: tunnel auth/config failures may surface as generic unexpected exit and consume at most three attempts; ambiguous start errors stop immediately. There is no detection of a post-ready hung-but-alive process. Normal quit and Restart & Update now use the shared orderly shutdown path, and focused stale-event/shutdown race tests cover the implemented boundary. Any future need to widen Secure Tunnel, credential, Network, process or Workspace authority still requires architecture review rather than scope expansion.

Implementation sequence, exact files, tests and owner acceptance are in [the implementation plan](../plans/2026-10-05-connection-auto-recovery.md). Candidate evidence and the exact Owner Test are recorded in `SUD_D_HANDOFF.md`; no commit/push or release work is authorized here.
