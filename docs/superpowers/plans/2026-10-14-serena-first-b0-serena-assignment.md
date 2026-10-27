# SOLO-EXPERT-B0 — Serena-First Reviewed Tool Bridge (Code-only Mission)

**Decision date:** 2026-10-14\
**Product Owner approved:** Option **B** — opt-in Solo Expert **cooperative host-user risk**; **B0 CODE-ONLY** now. The Owner also expressed willingness to permit a **real Terminal test if it accelerates delivery**. This is **consent in principle to a later narrowly scoped, reviewable physical smoke**, **NOT** permission to bypass SUD-D Approval/Policy or launch an unspecified command now.\
**STATUS UPDATE 2026-10-14: B0 SERENA DELIVERY COMPLETED and independently [ACCEPTED WITH CONDITIONS](2026-10-14-serena-first-b0-advisor-acceptance.md). THIS ASSIGNMENT IS HISTORICAL, NOT TO BE RERUN.** The text below is the original binding B0 implementation scope; current next action is bounded B1 cross-process integration planning/approval, not production shell activation.\
**Risk:** Security/Data Critical; keep production default Restricted, A1 independent consent PAUSED.

## Goal and invariant

ChatGPT plans; SUD-D mediates trusted Workspace/Policy/one-use user Approval/Audit; **Serena remains the actual Workspace tool hand**. Start with one small private, source-only, fake-transport proof so a later separately reviewed product integration can expose stock Serena 1.7.0 tools without replacing Serena with a generic shell runner.

**User-selected Option B intentionally changes the acceptance contract:** stock Serena can write tool arguments, output and exceptions to local file/memory/stderr logs; its shell runs under the Windows user with potential descendant, filesystem and network behavior beyond per-call SUD-D controls. This mode is **cooperative consent, not OS sandbox containment**; stopping/canceling does not guarantee killing descendants. Use only **synthetic nonsecret payloads** for B0. Secret/provider/spend, arbitrary shell, deletion, admin, network-dependent, long-job/TGNK render and stock logs containing real credentials are NOT approved in B0.

## Read first (single separate Serena Implementation chat)

1. Activate project `SUD_D`, then read `AGENTS.md`, `SUD_D_ADVISOR.md`, `SUD_D_CONTEXT.md`, **ACTIVE tops** of `SUD_D_HANDOFF.md` and `SUD_D_ROADMAP.md`, and this complete assignment. Review the [A/B Advisor acceptance](2026-10-14-serena-first-a-b-advisor-review.md) and the portable [A/B Codex Design, section 7](../research/2026-10-14-serena-first-a-b-codex-design.md). Existing [C1R accepted inert bridge](2026-10-14-serena-first-c1r-advisor-acceptance.md) is read-only reference.
2. Follow `AGENTS.md` Skill Router Gate before work. Read canonical `.agents/skills/tdd/SKILL.md`, `.agents/skills/codebase-design/SKILL.md`, `.agents/skills/writing-for-agents/SKILL.md` if handoff writing triggers, and any other actually applicable skills. No renderer work.
3. Baseline Git branch/HEAD, count and inventory dirty/untracked/staged files, task-start protected file hashes and task allowlist absence. Repo is heavily dirty, all pre-existing user work must remain untouched. STOP if any NEW path below is occupied.
4. **Role isolation** — Serena NEVER invokes Codex CLI (`codex`, `codex exec`), Codex MCP, Codex agents/subagents/delegates or any other assistant that invokes Codex. NEVER use Remote Desktop Commander, Team Mode or Team Planner. Architecture gaps go back to ChatGPT Project Advisor, not to Codex through Serena.

## Exact writable allowlist

**Phase P0 — PRIVATE registry, review, admission and fake-only authority path**

- **NEW** `packages/application/src/solo-expert-serena-bridge.ts`
- **NEW** `packages/tests/src/solo-expert-serena-bridge.test.ts`

**Phase P1 — PRIVATE fake transport adapter and typed result decoder**

- **NEW** `packages/infrastructure/src/solo-expert-serena-adapter.ts`
- The P0 pair may be modified for integration/unit tests.

**One final ignored closeout only**

- `.serena/reports/solo-expert-b-code-only-closeout-20261014.md`

Everything else **immutable**: C1 source/tests, existing Tool Kernel, Policy, Approval coordinator/repository, Work Resume, managed Serena runtime/config/manifest/provisioner, Gateway registration, domain/contracts, database/migrations, Desktop, native/A1, Runner, project docs, package-lock/metadata, installed Serena files, local provider/secrets and unrelated work. **No barrel export** or production composition. Ordinary existing check-tool caches only when inevitable and identified; no installer/repair.

If C1 private contracts cannot be reused within these files, choose minimal independent test-only projection without weakening production; report any need for new protected production interface and STOP. Do not claim tests imply production capability.

## Binding behavior contract

- **Generic controlled descriptors, not arbitrary passthrough.** Two synthetic profiles resolved by trusted composition: `harmless-short-smoke` (fixed reviewed nonsecret marker) and `reviewed-development-script` (fake-only profile illustrating how future typecheck/focused test profile can be added). Both have stable logical id, schema/config/version/fingerprint, declared risk `sensitive`, effect `execute`, expected result, privacy `stock-local-logging`, finite timeout/output and known lifecycle=short. The fake development profile MUST NOT execute a real project script.
- **No authority from caller.** Input is strict plain data: reject prototype/accessors/symbols/extra keys and any caller-controlled command, executable, argv, cwd, env, workspace root, toolName, approval flag, device/account identity, runtime epoch, risk, script or provider. Backend-reviewed profile resolves fixed command and allowed arguments. If a nonsecret parameter is necessary, give it a tight bounded enum. Fixed descriptors only. Unknown tool/schema/risk/version/behavior/drift → DENY.
- **Manual one-use human Approval.** Bind immutable review to trusted Workspace identity/root/generation, SUD-D session/resume, runtime epoch, pinned managed Serena tool schema, device/account labels *with provenance class* (never pretend account labels prove OS attestation), reviewed artifacts/config/profile and risk disclosure version. Use existing Kernel/Policy/Approval coordinator through private isolated test composition with fake repositories/audit. Guard against `full_access` mode-sourced autoapproval; require matching consumed, unexpired, **user-sourced** decision. No duplicate Approval subsystem.
- **Request lifecycle.** Recheck trusted context, grant/revocation, schema/profile and resume after any await before fake dispatch. Reserve attempt before await; valid per-call request dispatches once only, concurrent/replay/lost response/timeout/uncertain audit quarantines and never auto-retries. In-memory proof is **not** durable exactly-once across restart.
- **Injected fake transport only.** Adapter accepts fake `callTool`-like function injected in tests; no constructor that can call managed Serena. Do **NOT** import/start real Serena/Python, shell, subprocess, OS process, provider/network or use production side-effect tools. Infrastructure must not depend on Application implementation. Validate upstream stock `execute_shell_command` payload contract and strict MCP response `isError` plus JSON `{return_code,stdout,stderr,cwd}`; handle malformed response, nonzero code, thrown ToolError, output poison, cwd/profile drift and transport uncertainty with safe typed result codes.
- **Privacy disclosure not privacy certification.** Add `stock-local-logging` label and risk wording to nonsecret reviewed metadata. Do not claim upstream logs are redacted or commands/children sandboxed. Safe test result and audit must exclude raw stdout/stderr, error/tracebacks and synthetic poison markers, preserving only reviewed exit/status/diagnostic metadata. All result DTOs must say `executionKind:'mock'`.
- **Existing A1/security boundaries unchanged.** Direct Policy DENY for outside/internal Workspace, no implicit provider/network/credentials, no arbitrary shell. A later opt-in product mode is a design choice; it is not active until separately authorized and verified.

## Tests / checks (TDD RED → GREEN)

Focused unit and in-process Kernel integration tests must cover:
1. Two fixed descriptors exercise the same admission path, no wildcard authority.
2. No approval, denied/expired/mode-sourced approval, wrong request digest, inactive resume, wrong session/root/generation/runtime epoch/provenance or drift/revocation → zero fake dispatches.
3. Valid consumed manual user approval → **exactly one** fake dispatch. Concurrent replay, lost reply, timeout or outcome-audit uncertainty → no second dispatch or clean-success claim.
4. Audit precondition error → zero dispatch; postcondition error marked UNCERTAIN.
5. Unknown/extra keys, prototypes/accessors/symbols, fake tool name/command/cwd/env parameter injection, schema/registry risk mismatch → DENY.
6. MCP `isError`, malformed/truncated JSON, nonzero exit with MCP `isError:false`, wrong cwd, thrown fake transport exception, stderr poison, timeout → correctly classified safe metadata with no raw poison in review/result/audit.
7. No real managed Serena server, filesystem process writes, native Process, network or TGNK launched from implementation/test code.

Permitted install-free focused checks once dependencies confirmed locally:

```powershell
pnpm exec vitest run packages/tests/src/solo-expert-serena-bridge.test.ts --reporter=dot
pnpm exec eslint packages/application/src/solo-expert-serena-bridge.ts packages/infrastructure/src/solo-expert-serena-adapter.ts packages/tests/src/solo-expert-serena-bridge.test.ts --max-warnings 0
pnpm exec tsc --project packages/application/tsconfig.json --noEmit --incremental false
pnpm exec tsc --project packages/infrastructure/tsconfig.json --noEmit --incremental false
git diff --check
```

Optional `pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false` to compare prior four unchanged out-of-scope errors; do not declare global PASS without evidence. If an affected new file is excluded by these typechecks, explicitly note the limitation. Maximum **three repair iterations per diagnosed root cause** within allowlist; finish one long bounded mission, not repeated intermediate handoffs.

**Hard STOP**: any need for protected file changes, live runtime, real terminal/provision/repair, OS process test, A1/native, credential/provider/network, long-running job, database/Gateway/UI integration, build/install, git stage/reset/clean/commit/push, Team, cross-agent invocation, or architecture question. No patch outside exact allowlist.

## Closeout and next gate

One final Closeout at path above with changed file hash/paths, RED→GREEN tests and exit codes, target and whole-project TypeScript evidence separated, task-start vs final Git fingerprint/dirty work preservation, source version/schema findings and outstanding B1 real integration gaps. Include literal:

`PRIVATE MOCK ONLY; NO PRODUCTION SHELL, PHYSICAL EXECUTION, FINAL MP4 OR A1 AUTHORITY.`

**After STOP**, Owner returns Closeout to ChatGPT Project Advisor. Advisor independently reviews and updates active Repository docs. **Then** prepare B1 product cross-process Approval/registry wiring with exact bounded write allowlist; do not automatically begin it under B0. Design the earliest **B2 harmless physical smoke** in parallel as a reviewed packet to minimize waiting, but do not execute until B1 is in place, command/device/root/log/privacy/provenance are frozen and SUD-D shows genuine manual Approval.

**Owner's Terminal instruction recorded:** real terminal may be considered without finishing the entire long-job/A1 architecture first, but the permission is not a wildcard to run `execute_shell_command` now. Before real B2 invocation, confirm the exact command and risk packet through SUD-D's permission flow or a separately specific explicit Owner authorization; no undocumented bypass.
