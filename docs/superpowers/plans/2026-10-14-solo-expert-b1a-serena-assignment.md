# SOLO-EXPERT-B1a — Source-only Admission / Ready-only Managed Serena Integration

**Decision date:** 2026-10-14\
**Status update 2026-10-14:** **COMPLETED — Serena code-only B1a source/fake delivery independently [ACCEPTED WITH CONDITIONS](2026-10-14-solo-expert-b1a-advisor-acceptance.md)**, 57/57 focused tests on Advisor rerun. This original assignment is HISTORICAL and MUST NOT be dispatched again. B1b / live B2 remain separate unapproved scopes. The original acceptance contract below remains unchanged.\
**Risk:** Security / Data Critical. **Product mode:** Option B opt-in Solo Expert with cooperative host-user risk, **not** an OS sandbox.\
**Inputs:** [B0 independent acceptance](2026-10-14-serena-first-b0-advisor-acceptance.md), [Codex full source B1 design](../research/2026-10-14-solo-expert-b1-codex-design.md), [Advisor B1 review](2026-10-14-solo-expert-b1-advisor-review.md).\
**Result:** B1a is an inert CODE-ONLY integration seam; it does not register a production MCP tool or allow live shell, and B1b/physical B2 require separate scopes.

## 1. Exact mission and verified starting point

Recipient: **Serena Implementation in a separate chat with SUD_D Home New**. Do not launch this from Advisor chat. Product Owner's B1 preparation approval covers developing a bounded assignment; **this specific protected-file source modification scope still needs explicit Owner confirmation before dispatch**.

On project activation read `AGENTS.md`, `SUD_D_ADVISOR.md`, current tops of `SUD_D_HANDOFF.md` and `SUD_D_ROADMAP.md`, this entire assignment and the two linked source/Advisor B1 reviews. Review the three **B0 private source/test files** without editing them, plus current runtime/manifest/Approval/Kernel paths relevant to the seam. Confirm branch `p0c-hyperv-spike`, HEAD, pre-existing dirty/untracked/staged counts, and byte hashes on all existing files to be modified and critical protected boundaries before edit; preservation takes priority. If any new path already exists, STOP rather than overwrite.

Skill Router: run `AGENTS.md` gate, load canonical `.agents/skills/tdd/SKILL.md`, `.agents/skills/codebase-design/SKILL.md`, `.agents/skills/domain-modeling/SKILL.md` (security terms), `.agents/skills/writing-for-agents/SKILL.md` (Closeout); diagnose unexpected failures with `diagnosing-bugs`. No renderer/UI work in B1a, hence no UI implementation. Do not start Team/Planner.

**Absolute agent isolation:** Serena NEVER invokes Codex CLI, `codex`, `codex exec`, Codex MCP/agents, subagents/delegates that call Codex, or Remote Desktop Commander. If a new architecture decision arises, STOP and return to ChatGPT Project Advisor. Serena works only in its separately authorized Implementation role.

## 2. Exact writable source/test allowlist (eight paths total)

| Status | Exact repo path | Scope |
| --- | --- | --- |
| NEW | `packages/domain/src/solo-expert-serena.ts` | fixed B1 profile types, identity/review/attempt-state/result and private port interfaces |
| EXISTING | `packages/domain/src/index.ts` | minimal exports of B1 typed contract only |
| NEW | `packages/application/src/solo-expert-serena-integration.ts` | source-only preflight, admission/binding, injected verifier/ledger/review and Kernel outcome-aware wrapper |
| NEW | `packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts` | source-aligned fixed tool mapper and sanitizing response decoder |
| EXISTING | `packages/infrastructure/src/serena-managed-runtime.ts` | ready-only inspected seam, generation/epoch invalidation, fake-injectable fixed call contract, startup env/stderr safeguards |
| EXISTING | `packages/infrastructure/src/serena-managed-config.ts` | explicit usage-reporting/CHAR_COUNT privacy pin + pure fake-testable config plan |
| NEW | `packages/tests/src/solo-expert-serena-integration.test.ts` | TDD policy/approval/freshness/audit/replay/UNKNOWN and no-live negative cases with fakes |
| NEW | `packages/tests/src/solo-expert-serena-runtime.test.ts` | fake MCP session/ready-only/version/schema/env/decoder/epoch tests |

**Reporting-only file:** `.serena/reports/solo-expert-b1a-code-only-closeout-20261014.md` (ignored; single closeout).

**Protected/no edits:** existing B0/C1 files/tests, production application/infrastructure barrels, kernel, Policy, `approval-service.ts`, Approval repository/DB/migrations, Work Memory/Resume, Gateway/registration/metadata, Desktop/electron/UI/IPC/contracts, manifest/provisioner, installed Serena and package deps/lockfiles, A1/native/Runner, SUD_D root authoritative docs, all other tracked/untracked work. If a protected change is indispensable STOP; no implicit path additions, tests outside allowlist or blanket schema updates.

## 3. Binding acceptance contract

**One profile only:** `harmless-short-smoke` / `b1-smoke-v1`; backend-owned nonsecret reviewed command **`echo SUD_D_B1_OK`** as inert source data. Fixed `execute_shell_command` upstream mapping, exact argument schema and Windows expected stdout `SUD_D_B1_OK\r\n`, empty stderr, returned cwd equal trusted canonical Workspace. Input rejects caller command/tool/argv/cwd/env, overrides, prototypes/accessors/symbols, extra keys. `capture_stderr=true`, `max_answer_chars=2048` (serialized response cap, NOT host output cap), `maxCalls=1`, retry=0, review TTL proposed 90 seconds. A proposed 5-second response wait means **waiting deadline only**, NOT kill/child-stop guarantee.

**Trusted source:** canonical Workspace/root/generation, real session/work-resume, runtime epoch/session, installation/manifest/schema identity, actual origin of observed device/account labels, immutable profile/command/risk disclosure binding. Missing identity/attestation evidence must be **UNVERIFIED and fail closed** for operations requiring it; never manufacture OS attestation from caller-supplied labels. Audit/Review use safe projection and digest without raw poisoned output/errors. Distinguish `mcp` server handshake version from pinned Serena package version; validate compatible schema using source and test fakes. If strict runtime integrity cannot be verified without B1b or a live probe, return `NOT_READY`, do NOT call.

**Approval:** B1a *defines* integration port for the same Gateway Approval coordinator and exact HMAC digest check against complete reviewed binding, requiring consumed unexpired **user-sourced** manual decision even in `full_access` mode. **The real coordinator verifier is B1b**; B1a can use strict injected FAKE verifier/ledger only. Never use old Desktop-only pre-H1 verifier under another name or consider a 64-char digest shape sufficient. No production Approval/DB/UI registration in B1a.

**Attempt fence:** typed conceptual states `prepared`, `claimed`, `closed`, `unknown`, `revoked`. B1a tests injected ledger and Kernel outcome wrapper (post-outcome Audit matters); no claim of durable SQLite/restart correctness. Before transport a conditional claim must be recorded by port; when transport is uncertain/timeout/throws/output mismatch, or outcome audit failed, quarantine as `UNKNOWN` and NEVER auto-retry. Reconstruct-at-restart and DB constraints are B1b, not B1a. Consumed Approval is not proof of actual shell dispatch, and claimed dispatch is not proof of process effect.

**Managed Serena runtime:** add a *ready-only* narrow B1 fixed tool seam, with fake-injected `ManagedSerenaMcpSession`. NEVER call `startInternal`, auto `ensureInstalled`/install, `repair`, `semanticRead/Write` lazy startup or a real tool. Session missing, unhealthy/mismatched, closing, changed root/epoch, invalid schema/integrity/config = `NOT_READY` or explicit safe fail-closed. Early stderr capture must not persist raw data into safe DTO/Audit; source-level stock local file/memory stderr logs remain disclosed, not certified redacted. Pin `SERENA_USAGE_REPORTING=false` and `CHAR_COUNT`, but this is no network sandbox and proof of real effective SDK-merged environment/launcher has to be marked UNVERIFIED. B1a code paths should be testable via fakes only, with no physical setup.

**Policy/Resume:** leave existing default Restricted, Policy hard DENY and explicit Resume guard unchanged. The B1a private admission must fail closed until B1b supplies genuine runtime-bound cross-process identity, Resume provenance and durable ledger; tests prove denial under absent dependencies.

## 4. Minimum RED→GREEN / focused verification

Test at least:
- unknown/extra fields and every caller authority-injection pattern → zero fake call
- mode-sourced/pending/denied/expired Approval, wrong actual digest/request/runtime/session/Workspace, missing resume, root/generation stale → zero
- Kernel Policy outside/internal/network context and Audit precondition errors → zero
- valid **mock manual** one-use consumed decision → exactly one fake `callTool`; duplicate/concurrent/replay → zero additional calls
- denied/unavailable/preparing/closing managed runtime → no start/connect/install/provision/repair; true fake ready session maps only fixed tool schema
- fake tool pin/manifest/artifact/config/epoch drift before/after async boundary → fail closed; no silent rebind
- malformed/MCP error, wrong cwd/stdout/stderr, nonzero exit, late/lost reply, bad JSON/oversized response, poisoned errors → safe typed UNKNOWN/command failure, never raw poison
- pre/post audit uncertainty, durable-claim dependency missing, mock ledger failed/unknown → no false clean success, no retry, no cleanup assertion
- fake merged environment telemetry/credential filtering; explicit disable reporting and estimator pin, without claiming runtime egress proof
- no production Gateway/tool registration changes and no physical execution triggered by checks.

Verification commands only when repo-local tooling already exists, **no installs**:

```powershell
pnpm exec vitest run packages/tests/src/solo-expert-serena-integration.test.ts packages/tests/src/solo-expert-serena-runtime.test.ts --reporter=dot
pnpm exec eslint packages/domain/src/solo-expert-serena.ts packages/domain/src/index.ts packages/application/src/solo-expert-serena-integration.ts packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts packages/infrastructure/src/serena-managed-runtime.ts packages/infrastructure/src/serena-managed-config.ts packages/tests/src/solo-expert-serena-integration.test.ts packages/tests/src/solo-expert-serena-runtime.test.ts --max-warnings 0
pnpm exec tsc --project packages/domain/tsconfig.json --noEmit --incremental false
pnpm exec tsc --project packages/application/tsconfig.json --noEmit --incremental false
pnpm exec tsc --project packages/infrastructure/tsconfig.json --noEmit --incremental false
git diff --check
```

If root `tsconfig.check.json` is used, separate four historical B0 out-of-scope errors from introduced B1a findings. Test files may need an isolated no-emit compiler check if excluded by package scopes; report clearly what was actually covered. Focused suites should import pure/fake ports and must not start a managed server, SQLite product DB or any OS subprocess. Maximum three diagnosis/repair iterations per root cause within allowlist, then STOP on failures.

## 5. Hard STOP, ownership and Closeout

Do not run actual Serena server/shell, local OS child/native/physical workflow, PowerShell/provisioner test fixture, installer/build/Electron, provider/network/secrets/TGNK, admin/policy change, root-wide suites, Team/Planner, Codex/cross-agent, Git stage/reset/clean/commit/push. Existing unrelated dirty files immutable; take hashes/status and preserve. Source-only command `echo SUD_D_B1_OK` is **not authorized to execute** in B1a, regardless of Owner's willingness to test a Terminal later.

Return one Closeout at reporting-only path with: sources/byte hashes, baseline and final Git status, scopes/dirty preservation, RED→GREEN evidence and commands/exit codes/tests, safe fake result vs physical UNKNOWN distinctions, inspection of pinned installed Serena source/schema, any runtime config or privacy uncertainty and need for B1b. Literal closeout statement:

`B1a SOURCE-ONLY / FAKE PORTS; B1b NOT IMPLEMENTED; NO PRODUCTION SHELL OR PHYSICAL COMMAND; A1 STILL BLOCKED.`

STOP. Product Owner relays Closeout to ChatGPT Advisor for independent review; only then plan and separately authorize **B1b** (Approval persistence/UI/Gateway default OFF) and finally narrowly approved **B2** on actual SUD-D device/Workspace. No automatic escalation based on tests.
