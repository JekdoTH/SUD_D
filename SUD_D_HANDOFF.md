# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Documentation-only Agent Skill Routing

`AGENTS.md` is the sole source of truth for detailed skill routing. It now states explicitly that development agents apply its triggers autonomously, invoke applicable automatic skills without waiting for per-prompt skill names, use progressive disclosure, and report unavailable routed skills before taking any permitted fallback. `SUD_D_CONTEXT.md` keeps only the high-level expectation and link; no routing table or detailed rules were copied there.

`SUD_D_ROADMAP.md` and the rest of this handoff were reviewed for conflicting routing guidance; none required changes. The routed `writing-for-agents` skill was unavailable in the active runtime and that limitation was reported before editing. This clarification changes development-governance documentation only, does not change product architecture or behavior, and does not authorize M1.

Verification for this clarification: the complete documentation diff was reviewed, changed-path scope was limited to `AGENTS.md`, `SUD_D_CONTEXT.md`, and this handoff, `git diff --check` passed, and the scoped secret-pattern scan found zero matches. No production source or tests changed.

## Architecture / Process Decision

- Risk-Based Development is adopted: Security/Data Critical boundaries retain strict verification, while low-risk UI, cosmetic, and documentation work uses proportional verification and faster iteration.
- Pre-Implementation Compliance Check is adopted before milestone implementation or any source-changing task.
- M0.6 is COMPLETE.
- M0.7 is COMPLETE after Doctor + Activity integration, security/redaction verification, production Desktop smoke, and required final code review.
- M0.8 is COMPLETE after Secure Tunnel setup UX hardening, real Home-PC control-plane/tunnel acceptance, clean stop/fresh-start verification, regression coverage, production Desktop smoke, and required final code review.

## Approved Future Direction

Team Mode / Agent Orchestration is adopted as SUD_D's long-term domain-agnostic Personal AI Team Harness direction. It remains above the secure SUD_D execution boundary, and Serena is optional rather than a core runtime dependency. Exact architecture, presets, runtime, scheduling, memory format, UI, and milestones remain deferred; this decision does not change the current milestone or authorize implementation.

## Current Milestone

**M0.8 — End-to-End Connection Acceptance**

**Status: COMPLETE — Secure Tunnel setup UX, Home-PC real control-plane/tunnel acceptance, clean stop/fresh-start lifecycle, M0 regression, production Desktop smoke, and required final code review passed 2026-08-31.**

M0.8 validates the existing ChatGPT → OpenAI Secure MCP Tunnel → `tunnel-client` → stdio → inert SUD_D MCP Gateway path on Home-PC without adding privileged tools or weakening the M0 security boundaries. M1 Tool Execution Kernel is **NOT STARTED**.

## M0.8 Status

### Secure Tunnel Setup UX / Root Cause

The pre-M0.8 Connection UI could show `Tunnel setup = Missing` even after `CONTROL_PLANE_TUNNEL_ID` had been configured at User scope when the running Electron process predated that environment change. The profile stored no tunnel reference yet, while the renderer-facing setup action still expected the user to paste a raw tunnel reference.

M0.8 keeps the existing fixed `connection:tunnelSetup` path but makes it fixed-purpose end to end:

- `DesktopConnectionTunnelSetupInput` now accepts only `profileId`; strict validation rejects tunnel references, env, credentials, executable, argv, cwd, and other extra fields.
- `DesktopConnectionController.configureTunnel()` resolves `CONTROL_PLANE_TUNNEL_ID` only from the trusted backend process environment and persists it through the existing `ConnectionConfigService.updateProfile()` boundary.
- plaintext `CONTROL_PLANE_API_KEY`, raw environment state, and the raw tunnel reference are never returned to the renderer.
- Connection shows a non-technical **Set up Secure Tunnel** action when credential state is configured but tunnel setup is missing.
- when the current SUD_D process cannot see a recently configured tunnel environment value, the action returns the safe guidance `Restart SUD-D to load the tunnel configuration.`
- after setup is persisted, the renderer sees only `tunnelConfigured: true`, displays `Secure Tunnel is ready.`, and enables **Connect ChatGPT** when workspace/credential prerequisites are also ready.
- Overview routes its tunnel-setup CTA into the same Connection flow; no second setup API was introduced.
- the auxiliary Restart button is now gated to `connected | degraded | error`, matching the states accepted by `ConnectionService.restart()` instead of offering Restart during transient states such as `waiting_for_client`.

### Windows Stop Acceptance Fix

Real M0.8 acceptance found a Windows process-tree race in the existing fixed internal `taskkill.exe /T /F` cleanup. `taskkill` can return a non-zero status when a descendant disappears during tree termination even though the owned tunnel-client root PID has already exited. The previous adapter interpreted that race as `TUNNEL_STOP_FAILED`, followed by `TUNNEL_EXITED_UNEXPECTEDLY`.

The launcher now treats a non-zero `taskkill` result as failure only when the owned root PID is still alive. This remains a fixed internal process boundary: renderer input cannot select the executable, PID, arguments, cwd, or environment, and actual surviving-process failures remain fail-closed.

### M0.8 Home-PC Acceptance

Fresh production-bundle acceptance on Home-PC verified:

1. active workspace configured
2. `CONTROL_PLANE_API_KEY` configured without exposing plaintext
3. dedicated SUD_D Home tunnel configured; Serena tooling tunnel was not reused
4. production runtime start reaches `Waiting for ChatGPT` after local tunnel readiness
5. `tunnel-client health --require-control-plane-poll` observes a real successful OpenAI control-plane poll
6. generated SUD_D-owned tunnel profile targets the fixed `packages/mcp-gateway/dist/stdio-entry.js`
7. MCP `initialize` returns server identity `SUD-D`
8. `tools/list` returns `[]`, preserving the inert M0 gateway
9. direct Disconnect produces a clean stopped state
10. a fresh start after stop again reaches real control-plane/tunnel readiness and the SUD_D Gateway remains available

The local acceptance harness used `CONTROL_PLANE_POLL_TIMEOUT=2s` only in the child-process test environment to shorten the default long-poll wait; production source, tunnel identity, endpoint, credential scope, and security policy were not changed for the acceptance.

### M0.8 Security Boundaries

- Renderer setup input is `profileId` only; no arbitrary tunnel ID or raw environment input crosses IPC.
- Renderer still cannot select executable, argv, cwd, env, PID, or generic process operations.
- Credentials remain session-only/environment-backed and are exposed to UI only as `configured | missing`.
- Tunnel reference persistence continues through the existing non-secret connection-profile repository; renderer snapshots expose only `tunnelConfigured`.
- Connection-profile audit metadata does not include tunnel reference or credential values.
- The dedicated Home-PC SUD_D tunnel is resolved only from the configured backend reference; production code does not select or infer a tunnel by name and does not reuse the Serena tooling profile.
- MCP Gateway remains inert with zero privileged tools. M1 policy/tool execution was not started.

### M0.8 Verification Results

Fresh verification after the final lifecycle/UI fixes:

- focused M0.5 + M0.6 tests: **49/49 passed**
- remaining M0 regression (M0.1–M0.4 + M0.7): **147/147 passed**
- full suite: **196/196 passed**
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for all packages and Desktop production bundles
- `git diff --check`: **PASS**
- Desktop production smoke: **PASS** with persisted Secure Tunnel setup, safe configured-state UI, and enabled Connect action
- real Home-PC M0.8 acceptance: **PASS** for control-plane poll, dedicated SUD_D tunnel, gateway target, MCP identity, inert `tools/list`, clean stop, and fresh start

### Required M0.8 Code Review

Final review used the attached `code-review` skill methodology against fixed baseline `6826f86df3944e51d6ad21755e21c60e5f8f45f7`, with separate Standards and Spec passes over the working-tree diff before commit.

- **Standards:** no blocking finding. Strict IPC and secret boundaries remain intact; the Windows stop compatibility change stays inside the fixed internal runtime adapter. Minor duplicated tunnel-setup presentation conditions between Overview and Connection are a judgement-call smell and were intentionally not refactored outside M0.8.
- **Spec:** no blocking finding after fixes. Acceptance discovered and closed the `taskkill` tree-race stop failure and the Restart-button/transient-state mismatch. The implementation reuses the existing M0.6 setup channel/service path and does not introduce generic tunnel/process configuration or privileged MCP behavior.

### M0.8 Known Issues / Open Questions

- The existing M0.5 client-connected signal seam is still not wired across the production tunnel-client process, so ConnectionService remains `waiting_for_client` instead of synthesizing a false `connected` state. M0.8 did not invent telemetry to hide that limitation.
- Credential storage remains session-only/environment-backed; secure persistent Windows credential storage remains future work and must preserve the no-plaintext-persistence rule.
- Further Connection UI/UX simplification is intentionally deferred to the separate post-M0.8 UX task requested by the user; M1 is not part of that work.

## M0.7 Status

Implemented the approved Doctor + Activity integration without adding a new runtime boundary or telemetry subsystem.

### M0.7 Files Added / Changed

- `packages/contracts/src/index.ts` — typed/sanitized Doctor DTOs plus strict read-only Activity DTO/input contract and `activity:list` IPC channel.
- `packages/desktop/electron/diagnostics-controller.ts` — bounded read-only Doctor and Activity mapping over existing repositories, ConnectionService, and Secure Tunnel runtime status.
- `packages/desktop/electron/diagnostics-ipc.ts` — sender-validated Doctor/Activity IPC handlers with strict Zod validation.
- `packages/desktop/electron/main.ts` — wires real diagnostics dependencies and makes renderer `workspace:list` a read-only repository query so periodic Overview refresh does not create audit spam.
- `packages/desktop/electron/preload.ts` and `packages/desktop/src/global.d.ts` — expose only typed read-only Activity access; no raw diagnostics/log/process surface.
- `packages/desktop/src/pages/DoctorPage.tsx` — status-first Environment / Doctor summary and actionable safe checks.
- `packages/desktop/src/pages/ActivityPage.tsx` — newest-first readable Activity view backed by real audit events and minimal renderer-safe metadata.
- `packages/desktop/src/index.css` — narrow styling additions for Doctor/Activity using the existing M0.6 visual system.
- `packages/infrastructure/src/audit-repository.ts` — strengthens persistence redaction for raw environment/payload/process-shaped metadata and supports parameterized action exclusion before query `LIMIT`.
- `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` — adds fixed-purpose read-only availability checks for the trusted tunnel client and fixed MCP Gateway entrypoint.
- `packages/tests/src/m0.7.test.ts` — focused Doctor/Activity, redaction, no-spam, IPC, and renderer-surface coverage.
- `SUD_D_HANDOFF.md` — records M0.7 completion while preserving the approved Team Mode / North Star documentation.

`SUD_D_ROADMAP.md` was not changed by M0.7 because this milestone implements already approved integration scope and introduces no new architecture decision. The Team Mode / Personal AI Team Harness direction from the preceding Codex documentation commit remains unchanged.

### Doctor Integration

Environment / Doctor now reports real bounded local readiness for:

- application data directory writability
- SQLite readiness
- active workspace selection and root validity
- local connection-profile presence
- credential `configured | missing` state only
- Secure Tunnel reference configured/missing state without returning the reference
- fixed MCP Gateway entrypoint availability
- trusted `tunnel-client` availability
- ConnectionService runtime state
- gateway/tunnel/client presentation derived only from existing runtime/service status

Doctor output uses strict typed `healthy | warning | error` checks, short safe messages, and optional actionable guidance. Typed runtime failures are mapped to fixed user-facing text; raw runtime error messages, stack traces, credentials, environment values, commands, argv, and control-plane payloads are not forwarded to the renderer.

### Activity Integration

Activity reuses the existing audit repository and displays only real stored events. Existing connection/tunnel lifecycle actions receive readable presentation, including:

- `connection.start.requested`
- `connection.started`
- `connection.stop.requested`
- `connection.stopped`
- `connection.failed`
- `tunnel.ready`
- `tunnel.failed`

No gateway/client event was invented where no real audit source exists. Renderer-facing Activity metadata is allowlisted to safe `operation` and connection `state` values only.

Historical read/poll noise (`workspace:list`, `connection-profile:list`, `connection-profile:read`, `credential:status`) is excluded from the Activity query before `LIMIT`, so noise cannot starve meaningful lifecycle events. The underlying audit history is not deleted. Doctor/Activity refresh itself is read-only and does not append audit events.

### IPC / Contracts Changes

- Doctor continues to use the fixed `doctor:check` action with a richer strict typed DTO.
- Activity uses new fixed read-only `activity:list` with strict `{ limit }` input.
- Sender validation follows the existing Desktop pattern.
- Renderer cannot supply executable, command, argv, cwd, env, raw-log, or secret fields.
- No generic diagnostics command or process runner was added.

### Security / Redaction Decisions

Audit persistence still redacts the existing password/secret/token/API-key/auth/credential/private-key patterns and now also redacts keys representing environment, payload, raw data, stdout, stderr, command, argv, and cwd. Activity adds a second renderer boundary by allowlisting only minimal safe details.

The availability checks added for Doctor are fixed-purpose and deterministic: the tunnel client uses the existing trusted resolver, and MCP Gateway availability checks only the fixed SUD_D `stdio-entry.js` path. No renderer-controlled executable/arguments and no new network probe were introduced.

### M0.7 Tests

Focused M0.7 coverage contains **12 tests**, including:

1. healthy Doctor component/status mapping
2. fixed safe runtime-error mapping without raw error leakage
3. actionable missing workspace/profile/credential/tunnel setup states
4. real lifecycle Activity mapping with safe metadata allowlist
5. readable mapping for all currently sourced connection/tunnel lifecycle events
6. renderer read/poll noise filtering without deleting audit history
7. noise exclusion before query `LIMIT` so meaningful events are not starved
8. persistence redaction for raw payload/environment/process-shaped metadata
9. Doctor/Activity refresh does not append audit events
10. renderer workspace polling bypasses the audited WorkspaceService list use case
11. strict Activity IPC rejects arbitrary process-control payloads
12. renderer diagnostics surfaces expose no arbitrary command/process controls

TDD RED→GREEN evidence was observed for the two closing bugs: renderer `workspace:list` polling originally routed through the audited WorkspaceService, and Activity originally filtered historical noise only after the query `LIMIT`.

### M0.7 Verification Results

Fresh verification after the final code-review fix:

- M0.7 focused tests: **12/12 passed**
- M0.1–M0.6 regression: **178/178 passed**
- lint: **PASS**
- typecheck: **PASS**
- full suite: **190/190 passed**
- build: **PASS** for all packages and Desktop production bundles
- `git diff --check`: **PASS**

### M0.7 Desktop Smoke Result

**PASS** from the production Desktop bundle. CDP-driven smoke navigation verified:

- `Environment / Doctor` opens, its endpoint succeeds, and the status UI renders
- `Activity` opens, its endpoint succeeds, and recent-event UI renders
- existing `Connection` page still opens and renders `OpenAI Secure MCP Tunnel`
- application title remains `SUD-D Control Center`

M0.7 did not change the tunnel/gateway runtime lifecycle, so the heavyweight external Secure Tunnel acceptance from M0.5 was not repeated.

### Required M0.7 Code Review

Final review used two independent axes against fixed baseline `12ff6122b7f1ff4281524da405640359ba243e7a`. The exact external `code-review` skill resource was not exposed by the active Home-PC runtime during the resumed session; this limitation was reported before review. The installed `requesting-code-review` workflow plus the repository-required Standards/Spec checklist was used without weakening any required review criterion.

- **Standards:** no blocking finding after final verification. Security invariants, strict IPC, bounded diagnostics, redaction, and milestone scope remain intact. Minor duplication in diagnostic/presentation mapping is a judgement-call cleanup and was intentionally not refactored outside M0.7.
- **Spec:** one blocking finding was found and fixed: Activity originally filtered polling noise after `LIMIT`, allowing historical polling records to hide meaningful lifecycle events. Exclusion now occurs in the parameterized audit query before `LIMIT`, with RED→GREEN regression coverage. Final Spec review has no blocking finding.

### M0.7 Known Issues / Open Questions

- Activity intentionally shows only events with real existing audit sources. Gateway-start/client-connect lifecycle events are not synthesized; they can be added only when a future approved milestone provides a real source.
- M0.7 does not activate M0.8 end-to-end acceptance and does not change the existing M0.5/M0.6 runtime limitations recorded below.

### Recommendation for M0.8

Historical M0.7 handoff recommendation: M0.8 should validate the already implemented connection path while preserving the inert MCP Gateway and security boundaries. M0.8 was subsequently completed in the milestone recorded above without introducing privileged tools or new product scope.

## M0.6 Status

Implemented:

- status-first Desktop navigation: Overview, Workspaces, Connection, Activity, Security, Recovery, Environment / Doctor
- Overview cards for This Device, ChatGPT connection status, active workspace, baseline security summary, pending-approval placeholder, recent activity, and Recovery placeholder
- Connection page backed by the existing real `ConnectionService` and production Secure Tunnel runtime through a narrow controller + validated IPC boundary
- fixed lifecycle actions only: status, start, stop, restart, Secure Tunnel setup, and safe preference update
- renderer-safe snapshots that expose only configured/missing credential status and `tunnelConfigured`; plaintext credentials and raw tunnel references are not returned
- strict `autoStart` / `autoRestart` preference update contract accepting only `profileId` plus two boolean flags; executable/argv/cwd/env/secret fields are rejected
- auto-start / auto-restart are **saved preferences only** in M0.6; automatic lifecycle execution is not activated by this milestone
- active-workspace rebind/removal protection while a connection session is active
- Recovery page as an honest informational placeholder only; no recovery engine is implemented
- light neutral, card-based UI with technical details hidden behind an expandable Advanced section
- audit-neutral renderer status polling after initial local profile/credential bootstrap, avoiding repeated audit writes from unchanged status reads
- bundled Electron-safe fixed MCP Gateway entry-path resolution discovered through the production smoke test

### M0.6 Files Added / Changed

Primary M0.6 paths:

- `packages/contracts/src/index.ts`
- `packages/application/src/connection-config-service.ts`
- `packages/infrastructure/src/connection-profile-repository.ts`
- `packages/desktop/electron/connection-controller.ts`
- `packages/desktop/electron/connection-ipc.ts`
- `packages/desktop/electron/main.ts`
- `packages/desktop/electron/preload.ts`
- `packages/desktop/src/App.tsx`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/connection-ui-model.ts`
- `packages/desktop/src/index.css`
- `packages/desktop/src/pages/HomePage.tsx`
- `packages/desktop/src/pages/ConnectionPage.tsx`
- `packages/desktop/src/pages/RecoveryPage.tsx`
- `packages/desktop/src/pages/ProjectsPage.tsx`
- `packages/desktop/src/pages/SettingsPage.tsx`
- `packages/desktop/src/pages/DoctorPage.tsx`
- `packages/tests/src/m0.6.test.ts`

Narrow regression/integration compatibility changes made while closing M0.6:

- `packages/tests/src/m0.3.test.ts` — repository test double updated for the added profile-list seam
- `packages/infrastructure/src/secure-tunnel-process.ts` — type-only child-process event compatibility shim; runtime behavior unchanged
- `packages/infrastructure/src/secure-tunnel-profile.ts` and `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` — fixed trusted gateway path resolution that works from both source and bundled Electron module locations

`SUD_D_ROADMAP.md` was not changed because M0.6 implements already approved UI/connection direction and introduces no new long-term architecture decision.

### M0.6 Security Boundaries

- Renderer does not receive plaintext credentials or raw Secure Tunnel identifiers after setup.
- Renderer does not choose arbitrary executable, argv, cwd, env, shell command, or privileged process behavior.
- Connection IPC validates sender and strict Zod payloads before controller execution.
- The selected workspace remains the authorization boundary; changing/removing a bound workspace requires disconnect/restart semantics.
- MCP Gateway remains inert with zero privileged tools; M0.6 does not bypass future Tool Kernel → Policy → Approval → Execution gates.
- `.serena/` remains local tooling state and is excluded from the milestone commit.

### M0.6 Verification

Fresh final verification after code-review fixes:

- M0.6 focused tests: **20/20 passed**
- M0.1–M0.5 regression group: **158/158 passed**
- full test suite: **178/178 passed**
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for all packages and Desktop production bundle
- `git diff --check`: **PASS**
- Desktop production smoke: **PASS** — Electron process responsive, non-zero main window handle, title `SUD-D Control Center`

### Required Code Review

The final review used the approved two-axis `code-review` workflow against fixed base `origin/master` at `32a15844f5d9a1127dd91d365e2402c85b4cae36`.

- **Standards review:** no blocking finding after fixing audit spam caused by 2-second renderer status polling. The controller now caches only safe local profile metadata and configured/missing credential status after bootstrap. Minor UI refresh duplication and repeated state mapping are judgement-call cleanup only and were intentionally not refactored in M0.6.
- **Spec review:** no blocking finding after changing auto-start/auto-restart copy to state explicitly that M0.6 only saves preferences and does not activate automatic lifecycle behavior.

## M0.5 Status

Implemented the approved production direction:

```text
ChatGPT
→ OpenAI Secure MCP Tunnel
→ tunnel-client
→ stdio
→ SUD_D MCP Gateway
```

The Work-PC installed tunnel client inspected during M0.5 is:

```text
tunnel-client 0.0.12+881c9a8fed7cccbe6607cd419863bbca506b8215
```

The installed CLI documents stdio MCP commands, profile-based launch, `env:` secret references, `/healthz` / `/readyz`, health URL files, and fixed `channel=main` for the stdio sample. M0.5 uses only those documented local runtime surfaces.

## Files Added / Changed

- `packages/domain/src/result.ts`
  - Added safe typed tunnel/runtime failure codes and `ConnectionRuntimeFailure` with fixed non-secret messages.
- `packages/domain/src/connection.ts`
  - Added shared runtime readiness and runtime-event vocabulary for the production adapter boundary.
- `packages/contracts/src/index.ts`
  - Added M0.5 tunnel failure codes to the strict renderer-facing ConnectionService status error schema.
- `packages/application/src/connection-runtime-port.ts`
  - Extended the fixed-purpose port with typed runtime event subscription while preserving `start(context)` / `stop()`.
- `packages/application/src/connection-service.ts`
  - Maps safe typed runtime start/stop failures and consumes tunnel readiness/client/runtime-failure events through the existing M0.1 state machine.
- `packages/infrastructure/src/credential-store.ts`
  - Added session-only environment-backed tunnel credential storage with deterministic per-profile environment-variable references and no plaintext getter.
- `packages/infrastructure/src/secure-tunnel-profile.ts`
  - Added SUD_D-owned non-secret tunnel profile generation/materialization for a fixed stdio gateway command.
- `packages/infrastructure/src/secure-tunnel-process.ts`
  - Added trusted executable resolution, fixed tunnel launch-plan construction, Windows child-process launch, and deterministic process-tree stop.
- `packages/infrastructure/src/secure-tunnel-health.ts`
  - Added loopback-only `/readyz` monitoring using the tunnel client's generated health URL file.
- `packages/infrastructure/src/openai-secure-tunnel-runtime.ts`
  - Added the production OpenAI Secure Tunnel runtime adapter plus process/health/client-signal test seams.
- `packages/infrastructure/src/index.ts`
  - Exported the M0.5 production adapter boundary.
- `packages/tests/src/fakes/fake-connection-runtime.ts`
  - Extended the M0.3 deterministic fake with runtime-event subscription for regression compatibility.
- `packages/tests/src/m0.5.test.ts`
  - Added M0.5 configuration, lifecycle, security, process/health, ConnectionService integration, and M0.4 gateway regression coverage.
- `SUD_D_HANDOFF.md`
  - Updated milestone status and verification record.

`SUD_D_ROADMAP.md` was not changed because M0.5 implements the already approved Secure Tunnel adapter milestone and introduces no new approved long-term product direction.

## Tunnel Adapter Design

Production entry:

```text
createOpenAiSecureTunnelRuntime()
```

Public runtime surface remains fixed-purpose:

```text
- start(connectionSessionContext)
- stop()
- subscribe(runtimeEventListener)
- getStatus()
```

It exposes no generic executable, argv, shell command, cwd, environment map, arbitrary profile path, or process-runner API.

The production factory resolves only trusted SUD_D/runtime components:

- `tunnel-client.exe` through fixed Windows executable discovery and basename/file validation
- a Node runtime (`node.exe`) for the current JS gateway entrypoint
- the fixed M0.4 entrypoint `packages/mcp-gateway/dist/stdio-entry.js`

The trusted launch plan is always:

```text
<tunnel-client.exe>
run
--profile-file
<SUD_D-owned profile path>
```

`spawn` uses `shell: false`; renderer/client input never participates in executable/argv/cwd/env construction.

## Runtime Supervision Design

M0.5 adds only the process supervision required by the Secure Tunnel adapter:

- launch one fixed `tunnel-client` child
- retain its PID/process handle internally
- prevent duplicate runtime spawn
- observe unexpected process exit
- stop the health watcher during cleanup
- terminate the tunnel-client process tree on Windows using a fixed `taskkill.exe /PID <internal pid> /T /F` operation
- map raw process failures to fixed safe typed errors
- discard tunnel stdout/stderr instead of forwarding raw runtime output into renderer/audit/protocol responses

No generic process runner, arbitrary process tree API, or shell execution surface was added.

## Profile / Config Ownership

M0.5 generates only SUD_D-owned non-secret runtime profiles under:

```text
%LOCALAPPDATA%\SUD-D\runtime\secure-tunnel\profiles\<profileId>.yaml
```

Health URL files are SUD_D-owned under:

```text
%LOCALAPPDATA%\SUD-D\runtime\secure-tunnel\health\<profileId>.url
```

The generated profile contains only trusted/non-secret configuration:

- `control_plane.base_url = https://api.openai.com`
- validated `tunnel_<reference>` from the persisted connection profile
- credential **reference**, not value
- loopback ephemeral health listener (`127.0.0.1:0`)
- SUD_D-owned health URL file
- `channel: main`
- fixed stdio MCP command pointing to the SUD_D gateway

The profile does **not** contain an HTTP/localhost MCP upstream, arbitrary executable, arbitrary shell, user-controlled cwd/env, or plaintext credential.

User-managed tunnel profiles outside SUD_D ownership are not read/rewritten by the production adapter.

## Credential Handling

M0.5 preserves the no-plaintext-getter rule.

A new session-only environment-backed `CredentialStore` implementation stores each profile credential in a deterministic variable name derived from the profile ID, for example conceptually:

```text
SUD_D_CONTROL_PLANE_API_KEY_<PROFILE_ID>
```

The SUD_D-owned tunnel profile contains only:

```text
env:<derived variable name>
```

Properties:

- no credential getter was added
- secret value is not in SQLite
- secret value is not in generated YAML
- secret value is not in tunnel argv/launch plan
- secret value is not in renderer-facing status DTOs
- secret value is not in audit metadata
- secret value is not in safe errors
- delete removes the session environment value through the existing `CredentialStore` boundary

This is still session-only credential handling. Windows Credential Manager/DPAPI remains out of scope.

## ConnectionService Integration

M0.3 `ConnectionRuntimePort` remains fixed-purpose and synchronous at the lifecycle-call boundary. M0.5 adds a thin event seam rather than replacing the existing state machine or converting the whole service to a new async orchestration model.

Runtime events:

- `tunnel_ready`
- `client_connected`
- `client_disconnected`
- `runtime_failed` with a safe typed code

ConnectionService continues to use `transitionConnectionState()` from M0.1.

Production lifecycle:

```text
start()
→ stopped → starting → waiting_for_tunnel
→ tunnel-client child starts
→ /readyz becomes ready
→ runtime emits tunnel_ready
→ waiting_for_client
```

If a future fixed gateway/client signal is supplied, `client_connected` advances:

```text
waiting_for_client → connected
```

No production cross-process gateway-client signal is wired in M0.5, so the real adapter safely remains `waiting_for_client` after tunnel readiness until a later approved integration provides that signal.

Unexpected tunnel failure maps the active connection to `error` through existing transition rules. Stop still follows:

```text
<active/error> → stopping → stopped
```

## Health / Readiness Mapping

M0.5 uses the tunnel client's documented local health surface without coupling to undocumented control-plane internals.

The generated profile requests:

```text
health.listen_addr = 127.0.0.1:0
health.url_file = <SUD_D-owned health URL file>
```

The adapter:

- waits only for the SUD_D-owned health URL file
- accepts only an `http://127.0.0.1/...` base URL
- probes `/readyz`
- maps HTTP success with body `ready` to `tunnel_ready`
- retries transient startup races only until a fixed timeout
- maps timeout/invalid health URL/readiness failure to `TUNNEL_HEALTH_FAILED`
- never forwards raw response/body/system errors to renderer/audit

The adapter does not create its own HTTP server or external listener; the loopback ephemeral health listener belongs to `tunnel-client`.

## Error Handling

New safe typed runtime errors:

- `TUNNEL_CLIENT_NOT_FOUND` — `OpenAI Secure Tunnel client is not available`
- `TUNNEL_PROFILE_INVALID` — `Secure Tunnel profile configuration is invalid`
- `TUNNEL_START_FAILED` — `Secure Tunnel runtime failed to start`
- `TUNNEL_HEALTH_FAILED` — `Secure Tunnel runtime failed readiness checks`
- `TUNNEL_EXITED_UNEXPECTEDLY` — `Secure Tunnel runtime exited unexpectedly`
- `TUNNEL_STOP_FAILED` — `Secure Tunnel runtime failed to stop`
- `MCP_GATEWAY_ENTRY_NOT_FOUND` — `SUD-D MCP Gateway entrypoint is unavailable`

ConnectionService preserves existing `CONNECTION_CREDENTIAL_MISSING` when the credential store reports missing before runtime start.

Raw spawn/taskkill/path/environment/stack error text is not forwarded.

## Security Decisions

- MCP Gateway remains inert and exposes zero privileged tools.
- Tunnel adapter is not a generic process runner.
- Renderer/client cannot choose executable/argv/command/cwd/env/profile path.
- Tunnel ID/reference comes from validated persisted non-secret connection profile state.
- Gateway command is generated only from trusted runtime paths.
- Tunnel profile is written only under SUD_D-owned app data.
- No `http://127.0.0.1:<port>/mcp` upstream is generated.
- Secret is referenced through environment and never serialized into profile/argv/DTO/audit/error.
- Health URL is constrained to loopback `127.0.0.1`.
- Runtime stdout/stderr is not forwarded raw.
- M0.1 connection transition rules remain the only state machine.
- No filesystem/process/network AI tool capability was added to the MCP Gateway.

## Tests Added

`packages/tests/src/m0.5.test.ts` contains 23 tests covering:

1. fixed trusted SUD_D-owned tunnel profile/launch plan
2. stdio gateway command and no localhost HTTP MCP upstream
3. fixed-purpose runtime public API without executable/argv/cwd/env controls
4. missing credential rejected before process start
5. missing tunnel reference rejected before process start
6. missing tunnel-client maps to safe typed error
7. successful process launch leaves ConnectionService at `waiting_for_tunnel`
8. health ready advances to `waiting_for_client`
9. health failure maps fail-closed to `error`
10. unexpected child exit maps to safe typed error
11. stop cleans child + health watcher and ends at `stopped`
12. duplicate start does not spawn another tunnel process
13. duplicate stop does not stop process twice
14. restart stops old tunnel before a single fresh launch
15. Windows paths with spaces use fixed argv + quoted stdio gateway command
16. deterministic environment credential reference without plaintext serialization
17. no secret in DTO/audit/launch plan/profile/safe error
18. generated profile contains no arbitrary HTTP upstream
19. production gateway entrypoint resolves to M0.4 `dist/stdio-entry.js`
20. raw process start failure maps to safe tunnel error
21. raw process stop failure maps to safe tunnel error
22. renderer-facing ConnectionService status accepts new tunnel error codes and remains secret-free
23. real M0.4 stdio gateway still returns `tools/list = []`

TDD RED was observed before production implementation: 23/23 M0.5 tests failed because the M0.5 adapter exports did not exist.

## Relevant Tests Result

M0.5 focused command:

```text
corepack pnpm test packages/tests/src/m0.5.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       23 passed (23)
Exit code   0
```

## Regression Result

M0.1 + M0.2 + M0.3 + M0.4 command:

```text
corepack pnpm test packages/tests/src/phase1.test.ts packages/tests/src/m0.2.test.ts packages/tests/src/m0.3.test.ts packages/tests/src/m0.4.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests       135 passed (135)
Exit code   0
```

## Lint Result

```text
corepack pnpm lint
Exit code 0
No warnings/errors
```

## Typecheck Result

```text
corepack pnpm typecheck
Exit code 0
```

One initial typecheck failure was test-only: `m0.5.test.ts` imported the `CredentialStore` type from the domain package instead of infrastructure. The import was corrected to the existing package boundary; no production/security behavior was weakened.

## Full Suite Result

```text
corepack pnpm test
Test Files  5 passed (5)
Tests       158 passed (158)
Exit code   0
```

## Build Result

```text
corepack pnpm build
Exit code 0
```

Built successfully:

- domain
- contracts
- infrastructure
- application
- mcp-gateway
- desktop renderer/main/preload production bundles

## Local Acceptance Result

**PASS.**

Work-PC acceptance preflight found:

- `tunnel-client` installed and runnable (`0.0.12+881c9a8...`)
- `CONTROL_PLANE_API_KEY` available locally; value was not read/reported
- `CONTROL_PLANE_TUNNEL_ID` available from the local user environment; value was not read/reported
- SUD_D acceptance used a temporary SUD_D-owned data/runtime root
- SUD_D acceptance used `health.listen_addr = 127.0.0.1:0`, so it did not bind or collide with Serena's `127.0.0.1:8080`
- active `serena-sudd-work` tunnel was not stopped, modified, or reused

Initial acceptance exposed a Windows command parsing issue in the generated tunnel-client profile: an absolute quoted `node.exe` path with spaces was parsed by `tunnel-client doctor` as an invalid executable. The fix keeps a fixed `node` executable token, validates a trusted `node.exe` before profile generation, and quotes only the forward-slash normalized SUD_D gateway script argument.

Final acceptance output:

```text
preflight_tunnel_id=SET
preflight_api_key=SET
health_listen_addr=127.0.0.1:0
runtime_initial_tunnelReady=false
tunnel_client_ready=PASS
runtime_status=healthy
stdio_initialize=PASS
tools_list_empty=PASS
stdout_protocol_json=PASS
gateway_stderr_banner=PASS
acceptance=PASS
runtime_stop=PASS
```

Acceptance path verified:

```text
SUD_D production adapter
→ tunnel-client starts from SUD_D-owned profile
→ fixed SUD_D MCP Gateway entrypoint is validated over stdio
→ /readyz reports ready
→ MCP initialize succeeds
→ tools/list = []
```

## git diff --check Result

```text
Exit code 0
```

## Open Issues

1. The M0.5 production adapter reaches `waiting_for_client` after tunnel readiness. A production cross-process client-connected signal is not yet wired; a fixed signal seam exists for later integration.
2. Credential storage remains session-only environment-backed; secure persistent Windows credential storage is still deferred and must preserve the existing no-getter/no-plaintext-persistence rule.
3. The current fixed gateway entry is JavaScript and therefore validates a trusted installed `node.exe`, while the tunnel profile command uses the `node` executable token for `tunnel-client` Windows command parsing compatibility. Future packaged runtime distribution may choose a bundled/fixed runtime, but renderer-controlled executable selection must remain forbidden.
4. Windows process cleanup uses fixed internal `taskkill.exe /T /F` because the current M0.3 lifecycle port is synchronous; no generic process-control API is exposed.
5. `.serena/` remains local tooling state and must not be committed.
6. M0.6 persists `autoStart` / `autoRestart` preferences only. Automatic lifecycle execution is intentionally not active and requires a separately reviewed future implementation; the renderer still cannot supply executable/argv/cwd/env.

## Immediate Next Action

M0.8 is complete. **Do not start M1 Tool Execution Kernel without a new explicit milestone instruction.**

The next requested work is a separate Connection UI/UX improvement task focused on making setup/connect/start/stop easier to test without PowerShell. That future UX task must preserve the existing narrow Connection IPC, credential/tunnel-reference boundary, audit redaction, workspace binding, inert MCP Gateway, and no-generic-process-control invariants; it does not authorize M1.

## Last Commit SHA

M0.7 completion implementation:

`9dace143b3130128190deb34afae806f9afc85af` — `feat: complete M0.7 doctor activity integration`

M0.7 baseline documentation / Team Mode North Star preserved from:

`12ff6122b7f1ff4281524da405640359ba243e7a` — `docs: define Team Mode product north star`

M0.6 completion:

`bbe9e887b9dbfaf61d30def272a3ad56b03809c1` — `feat: complete M0.6 desktop connection UI`

Baseline immediately before M0.6 implementation:

`32a15844f5d9a1127dd91d365e2402c85b4cae36`

M0.5 implementation commit:

`a8dae31780ca68a893fce475f8c467d133af76fd` — `feat: complete M0.5 secure tunnel adapter`

M0.5 local acceptance compatibility fix:

`a113b70221c48ce1d93a1e6d2589e33919d5a350` — `fix: make M0.5 tunnel profile command compatible`

M0.4 implementation commit:

`8046f04239bb20392b7449295dd9ed6ed071790f` — `feat: complete M0.4 inert MCP gateway`

Current pushed baseline before M0.5:

`191cc52b49af8e8734b92cfeedf2980845c84108` — `docs: update M0.4 handoff`

## Stop Gate

M0.8 is complete only as the End-to-End Connection Acceptance milestone described above.

Do **not** start M1 Tool Execution Kernel, privileged MCP tools, Policy/Approval execution, or any later milestone without a new explicit implementation instruction.
