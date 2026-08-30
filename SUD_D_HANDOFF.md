# SUD_D Handoff

Long-term plan: see `SUD_D_ROADMAP.md`.

## Current Milestone

**M0.2 — Non-secret Config + Credential Boundary**

**Status: COMPLETE — verified 2026-08-30.**

M0.2 establishes persistence and credential boundaries only. It does **not** implement M0.3 lifecycle orchestration, process supervision, tunnel-client integration, MCP Gateway runtime, privileged tools, or M0.6 UI.

## M0.2 Status

Implemented the rule:

> Non-secret connection configuration may persist; plaintext credentials must not enter SQLite, normal config, audit payloads, or renderer-facing DTOs.

Current provider/transport remain intentionally narrow:

- `provider = openai_secure_mcp_tunnel`
- `transport = stdio`

## Files Added / Changed

- `packages/domain/src/connection.ts`
  - Added connection profile/domain vocabulary and `configured | missing` credential status.
- `packages/domain/src/index.ts`
  - Exported connection domain types.
- `packages/domain/src/result.ts`
  - Added typed `CONNECTION_PROFILE_NOT_FOUND` application error code.
- `packages/contracts/src/index.ts`
  - Added strict profile create/update schemas, profile DTO, profile ID, and credential-status DTO.
- `packages/infrastructure/src/database.ts`
  - Added migration 002 for non-secret connection profiles.
- `packages/infrastructure/src/connection-profile-repository.ts`
  - Added SQLite repository for non-secret profile create/read/update.
- `packages/infrastructure/src/credential-store.ts`
  - Added `CredentialStore` abstraction and session-only in-memory implementation.
- `packages/infrastructure/src/index.ts`
  - Exported M0.2 infrastructure boundaries.
- `packages/application/src/connection-config-service.ts`
  - Added thin connection configuration/credential-status service.
- `packages/application/src/index.ts`
  - Exported connection configuration service.
- `packages/tests/src/m0.2.test.ts`
  - Added M0.2 persistence, credential-boundary, contract, audit, and migration tests.
- `SUD_D_HANDOFF.md`
  - Updated milestone status and verification record.

`SUD_D_ROADMAP.md` was not changed because M0.2 introduced no new approved long-term architecture decision.

## DB Migration

Migration 002 adds only `connection_profiles` with non-secret fields:

- `profile_id`
- `display_name`
- `provider`
- `transport`
- `device_name`
- `auto_start`
- `auto_restart`
- `tunnel_reference` (optional, non-secret reference only)
- `created_at`
- `updated_at`

Security properties:

- no credential/API-key/token/secret columns
- provider CHECK restricted to `openai_secure_mcp_tunnel`
- transport CHECK restricted to `stdio`
- boolean fields CHECK restricted to `0 | 1`
- uses the existing ordered `MIGRATIONS` mechanism
- each unapplied migration is executed inside the existing SQLite transaction
- upgrade from migration 001 is tested
- reopening the upgraded database is idempotent and does not duplicate migration 002

## Connection Profile Design

Domain profile fields:

- `profileId`
- `displayName`
- `provider`
- `transport`
- `deviceName`
- `autoStart`
- `autoRestart`
- optional `tunnelReference`
- `createdAt`
- `updatedAt`

Provider and transport are selected at profile creation and are not exposed as mutable update fields in M0.2. Profile updates are limited to ordinary user preferences/labels and the optional non-secret tunnel reference.

Renderer/request contracts are strict Zod schemas. Unknown fields, including credential/process configuration, are rejected.

## CredentialStore Design

`CredentialStore` exposes only:

- `hasCredential(profileId)`
- `setCredential(profileId, credential)`
- `deleteCredential(profileId)`

M0.2 implementation is session-only in-memory storage.

There is intentionally **no plaintext credential getter** and no file/SQLite fallback. Application-facing status is only:

- `configured`
- `missing`

Windows Credential Manager / DPAPI persistence remains out of scope.

## Application Boundary

`ConnectionConfigService` is intentionally thin and supports only:

- create profile
- read profile
- update profile/preferences
- set session credential
- delete session credential
- read `configured | missing` credential status

It does not start/stop processes, invoke tunnel-client, supervise runtime components, expose MCP tools, or perform UI wiring.

## Security Decisions

- Plaintext secrets are never represented in `ConnectionProfile`.
- Plaintext secrets are never persisted in migration 002 / SQLite.
- Plaintext secrets are never included in profile/status DTOs.
- Plaintext secrets are never added to audit metadata by the connection configuration service.
- Credential audit events contain only profile ID and safe status such as `configured` / `missing`.
- `ConnectionProfileCreateInputSchema` and `ConnectionProfileUpdateInputSchema` are strict.
- Existing M0.1 lifecycle schemas remain strict.
- Arbitrary executable, command, cwd, shell/environment configuration, and plaintext credential fields cannot be injected through lifecycle/profile contracts.
- No renderer-facing `getPlaintextCredential()` or equivalent was added.
- No fallback plaintext credential persistence was added.

## Tests Added

`packages/tests/src/m0.2.test.ts` covers:

1. non-secret profile create/read/update persistence
2. credential/API-key value absent from SQLite and profile columns
3. renderer-facing profile/status DTO serialization does not expose plaintext secret
4. credential plaintext absent from audit events
5. credential status exposes only `configured | missing`
6. delete credential through the `CredentialStore` boundary via application service
7. invalid provider rejected
8. invalid transport rejected
9. profile create/update schemas are strict
10. executable/command/cwd/env/environment injection rejected by lifecycle/profile contracts
11. migration 001 → 002 upgrade and idempotent reopen
12. existing M0.1 regression suite remains green

## Relevant Tests Result

Command:

```text
corepack pnpm test packages/tests/src/m0.2.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       15 passed (15)
Exit code   0
```

M0.1 regression command:

```text
corepack pnpm test packages/tests/src/phase1.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       84 passed (84)
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
Test Files  2 passed (2)
Tests       99 passed (99)
Exit code   0
```

## git diff --check Result

```text
Exit code 0
```

## Issues / Open Questions

1. Secure persistent credentials are intentionally deferred; the current in-memory `CredentialStore` is session-only.
2. Future secure persistence should implement the existing `CredentialStore` boundary without adding renderer plaintext access or SQLite/file fallback.
3. Only `openai_secure_mcp_tunnel` + `stdio` are accepted now; future provider support must preserve the same secret/config separation.
4. Work-PC verification required the repository's existing Electron rebuild script after `better-sqlite3` had been rebuilt for the host Node ABI. This was environment-only and produced no tracked project change.
5. `.serena/` remains local tooling state and must not be committed.

## Recommendation for M0.3

Next milestone is **M0.3 — ConnectionService + test doubles**, but it has **not** been started.

Recommended boundary for M0.3:

- consume M0.1 state/contracts plus M0.2 non-secret profile and credential-status boundaries
- introduce lifecycle orchestration behind interfaces/test doubles
- keep provider/process specifics behind adapters
- do not add real tunnel-client execution until M0.5
- do not expose privileged MCP tools
- continue fail-closed behavior when required configuration/credential status is missing

## Last Commit SHA

M0.2 implementation commit:

`3a7049b0de5f5b1de60a4c77d593b3750ba54c41` — `feat: complete M0.2 connection config boundary`

Pre-M0.2 baseline:

`6894d6214dcfd3e2cfbbbb3b4d4ba555db17204b` — `docs: add SUD_D master roadmap`

## Stop Gate

M0.2 is complete only as the config/credential boundary described above.

Do **not** start M0.3, RuntimeSupervisor, tunnel-client integration, MCP Gateway implementation, privileged AI tools, cloud infrastructure, or M0.6 UI work without a new explicit implementation session.
