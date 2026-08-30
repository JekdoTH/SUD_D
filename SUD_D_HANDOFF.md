# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Current Milestone

**Current milestone = M0.2 — Non-secret Config + Credential Boundary**

Status: **NEXT / NOT STARTED**

This documentation alignment authorizes M0.2 as the next milestone but does **not** implement it.

## Completed Work

### M0.1 — Contracts + State Model

**COMPLETE — verified 2026-08-30.**

M0.1 delivered only the connection/runtime contracts and state-model foundation:

- connection lifecycle states and component-state types
- fail-closed connection state transition rules
- typed invalid-transition error/result
- OpenAI Secure MCP Tunnel provider contract
- stdio transport contract
- strict lifecycle input schemas
- gateway/tunnel/client status contracts
- typed runtime errors
- aggregate connection status/event contracts
- transition and contract test coverage

M0.1 did **not** implement credential persistence, process supervision, tunnel-client integration, MCP Gateway runtime, privileged file/process tools, or M0.6 UI.

## Current Architecture Snapshot

Repository package boundaries:

- `packages/domain` — domain/security/state primitives
- `packages/contracts` — Zod schemas and boundary DTOs
- `packages/infrastructure` — persistence and host adapters
- `packages/application` — application orchestration/services
- `packages/desktop` — Electron main/preload and renderer UI
- `packages/tests` — phase/integration tests

Current connection direction remains:

```text
ChatGPT
→ OpenAI Secure MCP Tunnel
→ tunnel-client
→ stdio
→ SUD_D MCP Gateway
→ Tool Kernel
→ Policy
→ Approval
→ Execution
```

Only `openai_secure_mcp_tunnel` + `stdio` are current provider/transport scope. Preserve a `ConnectionProvider` abstraction for future use without implementing cloud/provider expansion now.

## Verification

Last successful M0.1 verification:

```text
pnpm test -- packages/tests/src/phase1.test.ts
Test Files  1 passed (1)
Tests       84 passed (84)
Exit code   0

pnpm lint
Exit code   0

pnpm typecheck
Exit code   0

pnpm test
Test Files  1 passed (1)
Tests       84 passed (84)
Exit code   0
```

Development-environment note: an ignored stale `packages/domain/src/types.js` previously caused Vitest runtime resolution to differ from TypeScript/LSP resolution. Removing that ignored artifact restored the expected 84/84 result; no tracked source/config/security weakening was required.

## Open Issues / Constraints

1. Ignored generated `.js/.d.ts` files under `packages/*/src` can create runtime-resolution confusion if they reappear.
2. `RuntimeStopInput` / `RuntimeRestartInput` intentionally contain no process configuration; lifecycle orchestration/idempotency belongs to later connection-service work.
3. Device identity (`deviceId`, `deviceName`) remains architecture direction only; there is no cloud identity or synchronization system.
4. Provider extensibility is conceptual; only `openai_secure_mcp_tunnel` is accepted now.
5. Credential persistence/boundary work has not started yet and is the subject of M0.2.
6. Privileged MCP tools must not be exposed before Tool Kernel + Policy + Approval + Recovery are sufficiently ready.

## Immediate Next Action

When a future implementation session is explicitly started, begin **M0.2 — Non-secret Config + Credential Boundary** from `SUD_D_ROADMAP.md` and this handoff.

Do not begin M0.3+, privileged MCP tools, cloud infrastructure, or Workspace Memory implementation as part of M0.2.

## Latest Completed Milestone Commit

`ddb9f3c492d96995b9aff6b77116efc01ac40eaf` — `feat: complete M0.1 connection contracts`

## Session Continuity

The Git repository is the project source of truth.

Before starting a session:

- git sync
- read `SUD_D_HANDOFF.md`
- read `SUD_D_ROADMAP.md` when long-term direction matters
- inspect latest commit

Before ending a session:

- update handoff as needed
- run required verification
- commit
- push

`.serena/` is local tooling state and is **not** project memory/source of truth.
