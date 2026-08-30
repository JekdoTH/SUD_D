# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Current Milestone

**M0.5 — OpenAI Secure Tunnel Adapter**

**Status: COMPLETE — automated verification passed 2026-08-30.**

Local production acceptance was **not started** because Work-PC has a control-plane credential available but no dedicated SUD_D tunnel ID/reference in the checked environment. `CONTROL_PLANE_TUNNEL_ID`, `SUD_D_TUNNEL_REFERENCE`, and `SUD_D_ACCEPTANCE_TUNNEL_REFERENCE` were unset; sanitized `profiles list` / `runtimes list` checks found no `tunnel_...` candidate. This is an acceptance-environment blocker only; no secret or user-managed profile was read, printed, changed, or reused.

M0.5 connects the M0.3 runtime boundary to a fixed-purpose OpenAI Secure Tunnel runtime and the M0.4 SUD_D MCP Gateway. It does **not** implement M0.6 Desktop Connection UI, privileged MCP tools, Tool Kernel, Policy execution, Approval, Recovery, Git tools, cloud/relay infrastructure, or Windows Credential Manager/DPAPI.

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

**BLOCKED SAFELY / NOT STARTED.**

Work-PC environment inspection found:

- `tunnel-client` installed and runnable (`0.0.12+881c9a8...`)
- `CONTROL_PLANE_API_KEY` is set (value was not read/reported)
- `CONTROL_PLANE_TUNNEL_ID` is unset
- `SUD_D_TUNNEL_REFERENCE` is unset
- `SUD_D_ACCEPTANCE_TUNNEL_REFERENCE` is unset
- sanitized `tunnel-client profiles list --json` parsed successfully and exposed no `tunnel_...` candidate
- sanitized `tunnel-client runtimes list --json` parsed successfully and exposed no `tunnel_...` candidate
- no dedicated SUD_D tunnel-client profile/reference is configured in the checked environment

The real production adapter acceptance was not started because the adapter requires a non-secret tunnel ID/reference from trusted config plus a credential reference. Creating or guessing a tunnel ID would exceed the acceptance step and hardcoding any value would violate M0.5 requirements.

To run the real M0.5 acceptance later, provide/configure a **dedicated SUD_D tunnel ID/reference** (non-secret). The existing Work-PC control-plane credential can remain in the local environment; do not paste it into chat or config.

Once a dedicated tunnel exists, the acceptance target is:

```text
SUD_D production adapter
→ tunnel-client starts from SUD_D-owned profile
→ fixed SUD_D MCP Gateway launches over stdio
→ /readyz reports ready
→ MCP initialize succeeds
→ tools/list = []
```

## git diff --check Result

```text
Exit code 0
```

## Open Issues

1. Real production tunnel acceptance still needs a dedicated SUD_D tunnel ID/profile; the current Serena tunnel is intentionally not reused.
2. The M0.5 production adapter reaches `waiting_for_client` after tunnel readiness. A production cross-process client-connected signal is not yet wired; a fixed signal seam exists for later integration.
3. Credential storage remains session-only environment-backed; secure persistent Windows credential storage is still deferred and must preserve the existing no-getter/no-plaintext-persistence rule.
4. The current fixed gateway entry is JavaScript and therefore resolves a trusted installed `node.exe`; future packaged runtime distribution may choose a bundled/fixed runtime, but renderer-controlled executable selection must remain forbidden.
5. Windows process cleanup uses fixed internal `taskkill.exe /T /F` because the current M0.3 lifecycle port is synchronous; no generic process-control API is exposed.
6. `.serena/` remains local tooling state and must not be committed.

## Recommendation for M0.6

Next milestone is **M0.6 — Desktop Connection + Overview UI**, but it has **not** been started.

Recommended M0.6 boundary:

- consume existing ConnectionService status/start/stop/restart only through strict IPC contracts
- hide tunnel-client/profile/env/CLI details from normal UX
- never send plaintext credential back to renderer
- show safe `configured | missing` credential state and safe typed connection/tunnel errors only
- do not let renderer choose executable/argv/cwd/env/profile path
- keep MCP Gateway tools empty until later Tool Kernel + Policy + Approval + Recovery milestones
- surface the local acceptance prerequisite clearly if a dedicated SUD_D tunnel has not been configured

## Last Commit SHA

M0.5 implementation commit: **PENDING — filled after the verified implementation commit is created.**

M0.4 implementation commit:

`8046f04239bb20392b7449295dd9ed6ed071790f` — `feat: complete M0.4 inert MCP gateway`

Current pushed baseline before M0.5:

`191cc52b49af8e8734b92cfeedf2980845c84108` — `docs: update M0.4 handoff`

## Stop Gate

M0.5 is complete only as the fixed-purpose Secure Tunnel adapter/runtime milestone described above.

Do **not** start M0.6 Desktop Connection UI/visual design work or expose privileged MCP tools without a new explicit implementation session.
