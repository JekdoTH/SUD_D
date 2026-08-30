# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Current Milestone

**M0.3 — ConnectionService + test doubles**

**Status: COMPLETE — verified 2026-08-30.**

M0.3 adds application-layer lifecycle orchestration only. It does **not** implement a production RuntimeSupervisor, process spawning, tunnel-client integration, MCP Gateway runtime, privileged AI tools, network listeners, or M0.6 UI.

## M0.3 Status

Implemented a deterministic `ConnectionService` that composes the M0.1 state model with the M0.2 connection profile / credential boundaries.

The service can:

- report current connection status
- start a connection from a profile + active workspace
- stop a connection
- restart by composing stop → start
- validate profile/provider/transport
- require configured credential status before runtime start
- require a valid active workspace before runtime start
- bind an immutable connection session context
- reject silent workspace hot-switching while a session is active
- map runtime failures to typed safe errors
- reject re-entrant lifecycle operations deterministically
- emit non-secret lifecycle audit events

## Files Added / Changed

- `packages/domain/src/connection.ts`
  - Added immutable connection session context and service status vocabulary.
- `packages/domain/src/result.ts`
  - Added M0.3 lifecycle error codes.
- `packages/contracts/src/index.ts`
  - Added strict M0.3 start/stop/restart request schemas, session-context DTO, service-status DTO, and lifecycle error-code schema.
- `packages/application/src/connection-runtime-port.ts`
  - Added fixed-purpose runtime port with only `start(context)` and `stop()`.
- `packages/application/src/connection-service.ts`
  - Added lifecycle orchestration, validation, state coordination, idempotency/re-entrancy guards, session binding, safe error mapping, and audit integration.
- `packages/application/src/index.ts`
  - Exported M0.3 runtime/service boundaries.
- `packages/tests/src/fakes/fake-connection-runtime.ts`
  - Added deterministic in-memory runtime test double.
- `packages/tests/src/m0.3.test.ts`
  - Added M0.3 lifecycle/security/orchestration coverage.
- `SUD_D_HANDOFF.md`
  - Updated milestone status and verification record.

`SUD_D_ROADMAP.md` was not changed because M0.3 introduced no new long-term direction beyond the already approved orchestration/test-double milestone.

## ConnectionService Design

`ConnectionService` depends on existing boundaries rather than owning host/runtime implementation details:

- `ConnectionProfileRepository`
- `WorkspaceRepository`
- `CredentialStore`
- `AuditRepository`
- `ConnectionRuntimePort`

Public lifecycle surface:

- `getStatus()`
- `start(profileId)`
- `stop()`
- `restart(profileId)`

The application service does not accept executable, argv, command, cwd, shell, or arbitrary environment configuration.

Before runtime start, the service validates in order:

1. connection state permits start
2. profile exists
3. profile provider is `openai_secure_mcp_tunnel`
4. profile transport is `stdio`
5. credential is configured through `CredentialStore.hasCredential()`
6. an active workspace exists
7. the stored workspace root is a valid absolute workspace root
8. the workspace root still exists and is a directory

Only after those checks does lifecycle state advance and the runtime test double receive a session context.

## Runtime Port / Test Double Design

Production-facing M0.3 port:

```text
ConnectionRuntimePort
- start(context) -> RuntimeReadiness
- stop() -> void
```

`RuntimeReadiness` contains only:

- `tunnelReady`
- `clientConnected`

The port has no API for:

- executable
- argv
- shell command
- cwd
- environment map
- process spawning
- network listener

`packages/tests/src/fakes/fake-connection-runtime.ts` provides the only runtime implementation in M0.3. It is deterministic, in-memory, and supports controlled readiness/failure behavior for tests only.

No tunnel-client or production RuntimeSupervisor implementation was added.

## Session Context Design

A successful runtime start binds a frozen `ConnectionSessionContext` containing:

- `connectionSessionId`
- `profileId`
- `workspaceId`
- `workspaceCanonicalRoot`
- `startedAt`
- `provider`
- `transport`
- `deviceName`
- optional non-secret `tunnelReference`

The context is created from validated repository state rather than renderer-provided runtime fields.

The context object is frozen at runtime and all domain properties are readonly.

If the active workspace changes while a session remains active, `start()` does not hot-switch the existing context. It returns `CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART`. A deliberate `restart(profileId)` stops the old runtime first, then creates a new session bound to the newly active workspace.

## Lifecycle / Idempotency Decisions

M0.3 reuses `transitionConnectionState()` from M0.1 for every lifecycle transition; no second state machine was created.

Start path:

```text
stopped
→ starting
→ waiting_for_tunnel
→ waiting_for_client (when tunnelReady)
→ connected (when clientConnected)
```

A deterministic fake may remain at `waiting_for_tunnel` or `waiting_for_client` based on returned readiness.

Stop path for an active/error runtime follows existing transition rules:

```text
<allowed active/error state>
→ stopping
→ stopped
```

Restart semantics:

- from `stopped`: equivalent to start with the requested profile
- from `connected`, `degraded`, or `error`: stop completely, then start a fresh session
- from `starting`, `waiting_for_tunnel`, `waiting_for_client`, or `stopping`: reject deterministically instead of bypassing state validation

Idempotency / concurrency decisions:

- stop while already `stopped` is a no-op success and does not call runtime stop
- stop while already `stopping` is a no-op success
- duplicate start while connected is rejected and does not call runtime start again
- lifecycle calls use a small synchronous re-entrancy guard; a nested lifecycle call returns `CONNECTION_LIFECYCLE_BUSY`
- no complex concurrency framework was introduced in M0.3

## Error Handling

M0.3 uses existing `AppError` / `Result` patterns and adds only lifecycle-specific error codes:

- `CONNECTION_CREDENTIAL_MISSING`
- `CONNECTION_WORKSPACE_NOT_SELECTED`
- `CONNECTION_RUNTIME_START_FAILED`
- `CONNECTION_RUNTIME_STOP_FAILED`
- `INVALID_CONNECTION_STATE_TRANSITION`
- `CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART`
- `CONNECTION_LIFECYCLE_BUSY`

Existing codes reused where appropriate:

- `CONNECTION_PROFILE_NOT_FOUND`
- `WORKSPACE_INVALID`
- `VALIDATION_FAILED`
- `INTERNAL_ERROR`

Runtime exceptions are not forwarded. Start/stop exceptions are mapped to fixed safe messages:

- `Connection runtime failed to start`
- `Connection runtime failed to stop`

Raw process/runtime error text and credential values are not exposed through service results or audit metadata.

## Security Decisions

- Credential readiness is checked only through `CredentialStore.hasCredential(profileId)`.
- ConnectionService has no plaintext credential getter and never receives credential plaintext during lifecycle operations.
- Runtime context contains no credential value.
- Renderer-facing M0.3 DTOs contain only non-secret session/status data.
- M0.3 request schemas are strict and reject executable/argv/command/cwd/env injection.
- Existing M0.1 strict lifecycle schemas remain unchanged.
- Profile/provider/transport are loaded from validated persisted configuration rather than accepted as arbitrary runtime controls.
- Workspace binding is immutable for the lifetime of a connection session.
- Runtime failure text is mapped to fixed safe errors before leaving the application boundary.
- Lifecycle audit metadata contains only IDs, state, operation, provider-independent status metadata, and safe error codes.
- No production process/tunnel/network/MCP capability was added.

## Tests Added

`packages/tests/src/m0.3.test.ts` contains 20 tests covering:

1. start from stopped using approved transition rules
2. successful deterministic runtime readiness to connected
3. missing credential rejected before runtime start
4. missing profile rejected before runtime start
5. missing active workspace rejected
6. invalid/missing active workspace root rejected
7. duplicate start does not start runtime again
8. stop reaches stopped
9. stop while stopped is deterministic/idempotent
10. restart performs stop then fresh start/session
11. runtime start failure maps to safe typed error and error state
12. runtime stop failure maps fail-closed while preserving bound session context
13. invalid lifecycle transition is rejected
14. session context is frozen and binds profile/workspace/device/provider/transport
15. workspace change cannot silently hot-switch and restart performs explicit rebind
16. renderer-facing status/session DTOs are strict and secret-free
17. lifecycle audit metadata is secret-free
18. lifecycle request contracts/runtime fake expose no arbitrary execution controls
19. re-entrant lifecycle request is rejected without state corruption
20. corrupted invalid provider/transport profile is rejected before runtime start

## Relevant Tests Result

M0.3 focused command:

```text
corepack pnpm test packages/tests/src/m0.3.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       20 passed (20)
Exit code   0
```

M0.1 + M0.2 regression command:

```text
corepack pnpm test packages/tests/src/phase1.test.ts packages/tests/src/m0.2.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       99 passed (99)
Exit code   0
```

## Lint Result

Command:

```text
corepack pnpm lint
```

Result:

```text
Exit code 0
No warnings/errors
```

## Typecheck Result

Command:

```text
corepack pnpm typecheck
```

Result:

```text
Exit code 0
```

## Full Suite Result

Command:

```text
corepack pnpm test
```

Result:

```text
Test Files  3 passed (3)
Tests       119 passed (119)
Exit code   0
```

## git diff --check Result

```text
Exit code 0
```

## Open Issues

1. `ConnectionRuntimePort` is deliberately synchronous and backed only by a deterministic test double in M0.3. Production async/process lifecycle belongs to later runtime/tunnel milestones.
2. The M0.3 re-entrancy guard prevents synchronous nested lifecycle corruption; async cancellation/serialization should be designed only when a real asynchronous runtime port is introduced.
3. Secure persistent credential storage remains deferred; M0.3 consumes only configured/missing readiness from the M0.2 session-only `CredentialStore`.
4. ConnectionService/status DTOs are not wired to Desktop IPC/UI in M0.3.
5. No runtime health event stream is implemented; the M0.3 fixed-purpose runtime port returns deterministic readiness from `start()` only.
6. `.serena/` remains local tooling state and must not be committed.

## Recommendation for M0.4

Next milestone is **M0.4 — Inert MCP Gateway**, but it has **not** been started.

Recommended M0.4 boundary:

- add MCP connection/gateway plumbing only
- keep privileged tool exposure at zero
- consume M0.3 lifecycle/status boundaries rather than bypassing them
- do not introduce tunnel-client integration yet (M0.5)
- do not introduce production process supervision early
- preserve strict request/session DTOs and immutable workspace binding
- keep all future privileged capabilities behind later Tool Kernel + Policy + Approval + Recovery gates

## Last Commit SHA

M0.3 implementation commit:

`4807338a1b562b39ec71fd7c9af8f8002104a241` — `feat: complete M0.3 connection service`

M0.2 implementation commit:

`3a7049b0de5f5b1de60a4c77d593b3750ba54c41` — `feat: complete M0.2 connection config boundary`

Current pushed baseline before M0.3:

`d8f864e03b35d3b51f3adf77ebf013be8686b49c` — `docs: update M0.2 handoff`

## Stop Gate

M0.3 is complete only as the application-layer orchestration/test-double milestone described above.

Do **not** start M0.4, MCP Gateway implementation, tunnel adapter work, production RuntimeSupervisor/process spawning, privileged AI tools, cloud infrastructure, or M0.6 UI work without a new explicit implementation session.
