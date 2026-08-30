# SUD_D Handoff

## M0.1 Status

**COMPLETE — verified 2026-08-30.**

M0.1 implements only the typed connection/runtime state model, contracts, typed errors, and transition tests. It does **not** implement a process supervisor, tunnel-client integration, MCP Gateway runtime, credential persistence, file tools, or M0.6 UI.

### Files Added/Changed

- `packages/domain/src/types.ts`
  - Added connection lifecycle states and component-state types.
  - Added typed, fail-closed connection state transition rules.
  - Added typed invalid-transition result/error.
- `packages/contracts/src/index.ts`
  - Added Zod contracts for provider, transport, runtime errors, component statuses, lifecycle inputs, aggregate connection status, and status-change events.
- `packages/tests/src/phase1.test.ts`
  - Added M0.1 state transition and connection contract coverage.
- `SUD_D_HANDOFF.md`
  - Added this handoff/status record and future M0.6 UX direction.

## Architecture Decisions

### Connection provider and transport

SUD_D v1 uses **OpenAI Secure MCP Tunnel** with a **stdio-first** transport.

```text
ChatGPT
  ↓
OpenAI Secure MCP Tunnel
  ↓
tunnel-client
  ↓ stdio
SUD_D MCP Gateway
```

The current provider contract is intentionally narrow:

- `provider = openai_secure_mcp_tunnel`
- `transport = stdio`

The architecture should preserve a `ConnectionProvider` abstraction so another provider can be added later, but **no other provider is implemented in M0.1**.

Not part of the current architecture:

- GitHub OAuth
- SUD_D Cloud
- Device Relay
- cloud account system
- cloud device registry
- cloud relay
- account sync

### Two-device local model

Current intended topology:

```text
Home-PC → SUD_D → OpenAI Secure Tunnel
Work-PC → SUD_D → OpenAI Secure Tunnel
```

Each machine performs its own Secure Tunnel setup once. After setup, the SUD_D Desktop application should hide command/profile/key/path complexity from the normal user workflow and expose simple UI lifecycle controls such as Start, Stop, Connect, Disconnect, and Status.

Each machine may have local identity/state such as:

- `deviceId`
- `deviceName`
- `connectionStatus`
- `activeWorkspace`

These are **local-device concepts** at this stage. There is no cloud identity or synchronization system yet.

## State Model

### Connection states

- `stopped`
- `starting`
- `waiting_for_tunnel`
- `waiting_for_client`
- `connected`
- `degraded`
- `stopping`
- `error`

### Component states

Gateway:

- `stopped`
- `starting`
- `healthy`
- `error`

Tunnel:

- `stopped`
- `starting`
- `healthy`
- `error`

Client:

- `disconnected`
- `connected`

### Baseline transition rules

The model is fail-closed: transitions not explicitly listed are rejected with a typed `INVALID_CONNECTION_STATE_TRANSITION` error.

Allowed transitions currently include:

```text
stopped → starting
starting → waiting_for_tunnel | stopping | error
waiting_for_tunnel → waiting_for_client | stopping | error
waiting_for_client → connected | degraded | stopping | error
connected → degraded | stopping | error
degraded → connected | stopping | error
stopping → stopped | error
error → starting | stopping
```

Same-state transitions are not treated as valid lifecycle transitions. Stop idempotency is intentionally deferred to the lifecycle/service orchestration milestone rather than weakening the state-transition model.

## Contracts Added

Zod/typed contracts added in `packages/contracts/src/index.ts`:

- `ConnectionProviderSchema` / `ConnectionProvider`
- `ConnectionTransportSchema` / `ConnectionTransport`
- `ConnectionStateSchema` / `ConnectionStateDto`
- `RuntimeComponentSchema` / `RuntimeComponent`
- `RuntimeErrorCodeSchema` / `RuntimeErrorCode`
- `RuntimeErrorDtoSchema` / `RuntimeErrorDto`
- `GatewayStatusDtoSchema` / `GatewayStatusDto`
- `TunnelStatusDtoSchema` / `TunnelStatusDto`
- `ClientConnectionStatusDtoSchema` / `ClientConnectionStatusDto`
- `RuntimeStartInputSchema` / `RuntimeStartInput`
- `RuntimeStopInputSchema` / `RuntimeStopInput`
- `RuntimeRestartInputSchema` / `RuntimeRestartInput`
- `ConnectionStatusDtoSchema` / `ConnectionStatusDto`
- `ConnectionStatusChangedDtoSchema` / `ConnectionStatusChangedDto`

Lifecycle input schemas are `.strict()` and do not expose arbitrary command, executable, shell arguments, or working-directory configuration.

`RuntimeStartInput` contains only:

- Workspace ID
- approved connection provider
- approved transport

`RuntimeStopInput` and `RuntimeRestartInput` are strict empty objects in M0.1. Runtime/process details remain internal future implementation concerns.

## Tests Added

M0.1 tests cover:

- `stopped → starting`
- `starting → waiting_for_tunnel`
- `waiting_for_tunnel → waiting_for_client`
- `waiting_for_client → connected`
- `connected → stopping`
- `stopping → stopped`
- recoverable `connected → degraded`
- fatal runtime paths to `error`
- invalid transition rejection with typed error
- same-state transition rejection
- OpenAI Secure MCP Tunnel + stdio start contract
- rejection of arbitrary `command`, `executable`, and `cwd` fields
- discriminated Gateway/Tunnel/Client status contracts
- typed runtime errors for component error states
- aggregate `ConnectionStatusDto`
- `ConnectionStatusChangedDto`

## Test Results

### Relevant tests

Command:

```text
pnpm test -- packages/tests/src/phase1.test.ts
```

Result after root-cause fix:

```text
Test Files  1 passed (1)
Tests       84 passed (84)
Exit code   0
```

### Initial verification issue

The first real relevant-test run produced 10 failures in the new transition tests while all new contracts passed. Investigation showed ignored, stale generated artifacts under `packages/domain/src` — specifically an old `types.js` — were being resolved for the `./types.js` re-export instead of the newly edited `types.ts` during Vitest runtime loading.

The stale ignored artifact was removed from the working tree. No tracked source/config/security behavior needed to be weakened or refactored. The relevant suite then passed 84/84.

This is a development-environment hygiene issue worth remembering if ignored in-place TypeScript outputs reappear.

## Lint Result

Command:

```text
pnpm lint
```

Result:

```text
Exit code 0
No warnings/errors
```

## Typecheck Result

Command:

```text
pnpm typecheck
```

Result:

```text
Exit code 0
```

## Full Suite Result

Command:

```text
pnpm test
```

Result:

```text
Test Files  1 passed (1)
Tests       84 passed (84)
Exit code   0
```

## Issues / Open Questions

1. Ignored generated `.js/.d.ts` artifacts can exist inside `packages/*/src`. A stale `packages/domain/src/types.js` caused runtime resolution to differ from TypeScript/LSP resolution during the first M0.1 test run. No tracked project change was needed for M0.1, but build/test hygiene should be considered separately if this recurs.
2. `RuntimeStopInput`/`RuntimeRestartInput` intentionally contain no process configuration. Idempotent Stop semantics belong to future lifecycle orchestration, not this pure state model.
3. Device identity fields (`deviceId`, `deviceName`) are architecture direction only and are not persisted or synchronized in M0.1.
4. Provider extensibility is preserved conceptually, but only `openai_secure_mcp_tunnel` is accepted now.
5. No credential persistence is implemented yet.

## M0.6 UI/UX Direction — Design Only

**Do not implement this section during M0.1.** It records the approved direction for the future M0.6 Desktop UI milestone.

### Principles

The UI should be:

- simple
- status-first
- card-based
- approachable for non-technical users
- free of CLI requirements in the normal workflow

Visual direction:

- light neutral background
- white rounded cards
- clear spacing and hierarchy
- primary action visually prominent
- green = connected / safe
- amber = Ask / approval required
- red = deny / error
- technical details hidden by default
- advanced details expandable

Use other applications only as UX/layout inspiration. Do not copy another product's branding or UI 1:1.

### Overview direction

Conceptual layout:

```text
SUD-D                                      ● Connected

This Device
Home-PC / Work-PC

Connection
● ChatGPT
OpenAI Secure Tunnel
[ Connect / Disconnect ]

Active Workspace
C:\...\project
Active

Security
Read       Allow
Write      Allow
Delete     Ask
Execute    Ask
Network    Deny

Pending Approval
<number of requests waiting for user>

Recent Activity
<latest tool/action>

Recovery
<recoverable changes>
```

### Navigation direction

- Overview
- Workspaces
- Connection
- Activity
- Security
- Recovery
- Environment / Doctor

### Normal UX flow

```text
Add Workspace
→ Select Workspace
→ Connect ChatGPT
→ Connected
→ AI works inside allowed Workspace
```

### Approval UX flow

```text
AI requests protected action
→ notification/card appears
→ user Approve / Deny
```

M0.6 should hide tunnel profile, key, command-line, executable path, and similar implementation details from normal users. Advanced technical details may be available through an expandable diagnostics area when needed.

## Stop Gate

M0.1 is complete only as the verified contracts/state-model milestone described above.

Do **not** start M0.2, process supervisor work, tunnel-client integration, MCP Gateway implementation, or M0.6 UI implementation until the next architecture review explicitly authorizes it.
