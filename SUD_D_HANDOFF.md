# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Current Milestone

**M0.4 — Inert MCP Gateway**

**Status: COMPLETE — verified 2026-08-30.**

M0.4 adds a real SUD_D-owned MCP server over stdio while keeping privileged capability exposure at zero. It does **not** implement M0.5 tunnel-client integration, a production RuntimeSupervisor, filesystem/process/network AI tools, Tool Kernel, Policy execution, Approval, Recovery, or Desktop Connection UI.

## M0.4 Status

Implemented an inert MCP Gateway that can:

- speak MCP over stdio using the official TypeScript server SDK
- complete MCP initialize/handshake
- expose stable minimal server identity
- declare only an empty tools capability
- return `tools: []` from `tools/list`
- reject `tools/call` for unknown/unregistered tools safely
- reject malformed request parameters safely
- reject unknown MCP methods without crashing
- start/stop deterministically through a fixed-purpose gateway lifecycle API
- keep protocol stdout free of application logs
- run through a fixed real stdio entrypoint

The milestone ends at the gateway boundary. No tunnel-client or privileged tool path was added.

## Files Added / Changed

- `packages/mcp-gateway/package.json`
  - Added the dedicated `@sud-d/mcp-gateway` package.
  - Added official `@modelcontextprotocol/server@2.0.0` runtime dependency.
  - Added `@types/node@24.13.3` only for the Node stdio package type boundary.
- `packages/mcp-gateway/tsconfig.json`
  - Added package build/typecheck configuration following existing package conventions.
- `packages/mcp-gateway/src/metadata.ts`
  - Added stable non-secret MCP server identity (`SUD-D`, package version).
- `packages/mcp-gateway/src/server.ts`
  - Added internal inert `McpServer` factory with only empty tools capability.
- `packages/mcp-gateway/src/gateway.ts`
  - Added fixed-purpose deterministic gateway start/stop lifecycle and safe lifecycle errors.
- `packages/mcp-gateway/src/stdio.ts`
  - Added stdio-only server transport factory.
- `packages/mcp-gateway/src/stdio-entry.ts`
  - Added fixed real SUD_D MCP stdio entrypoint.
- `packages/mcp-gateway/src/index.ts`
  - Exported only safe lifecycle/metadata/stdio surfaces; raw MCP server registration is not part of the public package API.
- `packages/tests/src/m0.4.test.ts`
  - Added M0.4 protocol, lifecycle, security-boundary, static architecture, and real-entrypoint tests.
- `packages/tests/package.json`
  - Added workspace dependency on `@sud-d/mcp-gateway` for tests.
- `package.json`
  - Added gateway to root build.
  - Root tests now build `domain → mcp-gateway` before Vitest so real-entrypoint integration tests use fresh dist output rather than stale artifacts.
- `tsconfig.check.json`
  - Added gateway source/path to root typecheck.
- `vitest.config.ts`
  - Added the gateway source alias following existing package test aliases.
- `pnpm-lock.yaml`
  - Added lock entries required by the MCP server SDK and gateway Node typings.
- `SUD_D_HANDOFF.md`
  - Updated milestone status and verification record.

`SUD_D_ROADMAP.md` was not changed because M0.4 implements an already approved roadmap milestone and adds no new approved long-term product direction.

## MCP Gateway Design

The gateway is a separate package boundary: `@sud-d/mcp-gateway`.

This keeps the protocol-facing component separate from:

- persistence repositories
- Desktop renderer/main process
- workspace mutation implementation
- process execution implementation
- future Tool Kernel / Policy / Approval / Recovery implementation

Internal MCP server construction is not exported from the public package index. The public lifecycle surface is intentionally fixed-purpose:

```text
InertMcpGateway
- getStatus()
- start(transport)
- stop()
```

It exposes no generic execution or dynamic capability-registration surface.

Gateway lifecycle status reuses the existing M0.1 component vocabulary:

- gateway: `stopped | starting | healthy | error`
- client: `disconnected | connected`

No second connection state machine was introduced.

## Transport Decision

M0.4 supports **stdio only**.

The gateway uses `@modelcontextprotocol/server/stdio` from the official MCP TypeScript SDK.

Rules enforced by design/tests:

- stdin = MCP request channel
- stdout = MCP JSON-RPC response channel only
- diagnostics/banner = stderr
- no HTTP server
- no localhost listener
- no WebSocket
- no arbitrary port binding

The fixed entrypoint is:

```text
packages/mcp-gateway/dist/stdio-entry.js
```

Package bin name:

```text
sud-d-mcp-gateway
```

Desktop does not launch this entrypoint in M0.4.

## MCP SDK Decision

No MCP SDK existed in the repository before M0.4.

Selected dependency:

```text
@modelcontextprotocol/server 2.0.0
```

Reasons:

- official current TypeScript MCP server package
- stable v2 line
- Node engine requirement `>=20`, compatible with SUD_D Node `>=24`
- provides the required stdio server transport/entrypoint
- avoids installing client/framework/HTTP adapters not needed by M0.4

The SDK brings its own required MCP core/Zod v4 runtime dependencies. Existing SUD_D contract Zod usage was not upgraded or refactored.

## Capabilities Exposed

Actual initialize capability declaration:

```json
{
  "tools": {
    "listChanged": false
  }
}
```

Actual `tools/list` result:

```json
{
  "tools": []
}
```

Not exposed:

- resources
- prompts
- logging capability
- filesystem read/write/delete/search
- shell/process
- git
- network
- workspace mutation
- credential access
- arbitrary command execution

No tools, resources, or prompts are registered in M0.4.

## Security Boundary

The MCP Gateway is treated as an untrusted-client protocol boundary even though M0.4 transport is local stdio.

Security decisions:

- official SDK parses/validates MCP JSON-RPC messages before handlers execute
- malformed tool-list parameters return a protocol error; the server remains usable afterward
- unknown methods return a safe protocol error and do not crash the gateway
- unknown `tools/call` cannot execute anything because there are zero registered tools
- no dynamic tool/resource/prompt registration is present in SUD_D gateway source
- public gateway lifecycle API contains no executable/argv/command/cwd/env/network controls
- gateway source does not import `node:fs`, `node:child_process`, `node:net`, HTTP server modules, `@sud-d/infrastructure`, `@sud-d/application`, or Desktop code
- server identity contains only `name` and version; no workspace path, username, credential, tunnel id, or environment metadata
- lifecycle start errors are mapped to fixed typed safe errors rather than forwarding raw transport/system text
- stdout is reserved for MCP JSON-RPC only; gateway diagnostics use stderr
- privileged capability exposure remains zero until later Tool Kernel + Policy + Approval + Recovery gates are ready

## Entry Point

M0.4 includes a real fixed stdio entrypoint:

```text
packages/mcp-gateway/src/stdio-entry.ts
→ packages/mcp-gateway/dist/stdio-entry.js
```

Behavior is fixed:

- creates only the inert SUD_D MCP server
- uses stdio only
- no CLI-supplied executable/argv/cwd/env behavior
- no tunnel-client integration
- no network listener
- no privileged tools

## ConnectionService / RuntimePort Integration Seam

No production `ConnectionService` / `ConnectionRuntimePort` integration was added in M0.4.

Reason: Desktop does not launch the gateway process yet, and wiring the real stdio process into M0.3 at this point would pull production process supervision into M0.4, which is explicitly out of scope.

The gateway therefore remains a fixed independently runnable SUD_D-owned component. A later runtime/tunnel milestone can adapt this fixed entrypoint behind the existing M0.3 runtime boundary without allowing renderer/client-provided executable/argv/cwd/env controls.

## Tests Added

`packages/tests/src/m0.4.test.ts` contains 16 tests covering:

1. MCP initialize/handshake succeeds with stable SUD_D identity
2. identity contains no sensitive machine metadata
3. only minimal tools capability is declared and `tools/list` is empty
4. unregistered `tools/call` is rejected without execution side effects
5. malformed MCP request params fail safely and gateway remains healthy
6. unknown MCP method returns safe error and gateway remains healthy
7. deterministic start/stop and gateway/client state mapping
8. duplicate start/stop idempotency
9. transport start failure maps to typed safe error without leaking raw text
10. protocol responses do not contain secret/raw stack internals
11. resources/prompts/logging capabilities are not exposed
12. public lifecycle API has no arbitrary execution controls
13. static source boundary has no privileged imports or capability registrations
14. in-memory stdio stdout contains only parseable JSON-RPC
15. real compiled stdio entrypoint initializes and lists zero tools
16. real entrypoint keeps stdout parseable and diagnostics on stderr

The existing M0.1/M0.2/M0.3 tests remain unchanged.

## Relevant Tests Result

M0.4 focused command:

```text
corepack pnpm test packages/tests/src/m0.4.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       16 passed (16)
Exit code   0
```

## Regression Result

M0.1 + M0.2 + M0.3 command:

```text
corepack pnpm test packages/tests/src/phase1.test.ts packages/tests/src/m0.2.test.ts packages/tests/src/m0.3.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       119 passed (119)
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

## Full Suite Result

```text
corepack pnpm test
Test Files  4 passed (4)
Tests       135 passed (135)
Exit code   0
```

## stdio Smoke Test Result

Direct compiled-entrypoint smoke command sent real newline-delimited MCP JSON-RPC over stdin.

Observed stdout:

```json
{"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"SUD-D","version":"0.1.0"}},"jsonrpc":"2.0","id":900}
{"result":{"tools":[]},"jsonrpc":"2.0","id":901}
```

Observed stderr:

```text
SUD-D MCP Gateway running on stdio
```

Result: exit code 0. No application log text was mixed into stdout.

## git diff --check Result

```text
Exit code 0
```

## Open Issues

1. M0.4 gateway lifecycle is intentionally an in-process/fixed-entrypoint boundary; Desktop/process supervision is not implemented.
2. M0.4 uses the official MCP server SDK's stdio transport and supports the SDK's protocol negotiation/legacy compatibility; M0.5 still needs the actual OpenAI Secure Tunnel/tunnel-client adapter.
3. Client connected/disconnected status in the standalone lifecycle wrapper maps the controlled transport lifecycle. No production runtime health/event stream was added.
4. Privileged tool exposure is intentionally zero; Tool Kernel + Policy + Approval + Recovery remain future gates.
5. Dependency installation initially encountered an environment-only `EPERM` while root postinstall tried to replace the already-loaded `better-sqlite3` native binary. MCP dependencies were resolved successfully, install metadata was completed with scripts disabled, and the full Electron-mode test suite passed without changing tracked native artifacts.
6. `.serena/` remains local tooling state and must not be committed.

## Recommendation for M0.5

Next milestone is **M0.5 — OpenAI Secure Tunnel adapter**, but it has **not** been started.

Recommended M0.5 boundary:

- connect the approved OpenAI Secure Tunnel / `tunnel-client` path to this fixed stdio gateway
- keep tunnel process details behind a fixed-purpose adapter/runtime seam
- do not let renderer/client provide executable, argv, cwd, shell, or arbitrary env values
- preserve M0.3 immutable workspace/session binding and credential readiness checks
- keep gateway tool exposure at zero during tunnel integration
- do not start M0.6 Desktop Connection UI as part of M0.5

## Last Commit SHA

M0.4 implementation commit:

`8046f04239bb20392b7449295dd9ed6ed071790f` — `feat: complete M0.4 inert MCP gateway`

M0.3 implementation commit:

`4807338a1b562b39ec71fd7c9af8f8002104a241` — `feat: complete M0.3 connection service`

Current pushed baseline before M0.4:

`47a616ed0a6d8cbc8d89437481331d7cc7a23303` — `docs: update M0.3 handoff`

## Stop Gate

M0.4 is complete only as the inert stdio MCP gateway milestone described above.

Do **not** start M0.5 tunnel-client integration, tunnel process management, production RuntimeSupervisor work, Desktop Connection UI, or privileged MCP tools without a new explicit implementation session.
