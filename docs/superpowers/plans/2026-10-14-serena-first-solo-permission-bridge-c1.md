# Serena-First Solo MVP — Permission Bridge C1 and Fast Closure

**Owner decision:** 2026-10-14. **Advisor acceptance:** 2026-10-14. **Status:** **C1 CODE-ONLY DONE; C1R INDEPENDENTLY ACCEPTED WITH CONDITIONS**. Product integration / live Shell / Final MP4: NOT STARTED. [Independent C1R acceptance](2026-10-14-serena-first-c1r-advisor-acceptance.md) is the current evidence and next-gate decision.

## 1. Goal and binding requirement

> SUD-D must not unnecessarily reduce Serena's capabilities. The user chooses which tools and permission levels to authorize. SUD-D truthfully describes risk, requests informed Approval, enforces only boundaries it can actually guarantee, and records relevant Audit. Serena is the tool-operating hand. ChatGPT plans and invokes work through SUD-D.

**Product architecture:** ChatGPT → SUD-D Workspace/Tool Kernel → Policy → Approval → Audit → managed Serena → Workspace tools → results/evidence. **Domain-agnostic:** TGNK is the first real-world pilot, not product-specific logic inside SUD-D. Prefer reuse over building a duplicate execution engine. Normal Mode is sufficient for the pilot; Team Mode/Planner is not a prerequisite.

**First real-world acceptance:** a **new** TGNK project progresses through its legitimate Topic → Script → Audio → Images → Video → QC workflow with required human decisions and provider authorizations, ending in an **attributable, independently verified Final MP4**. Resume of a historical imported-audio episode is deferred; it is not the first acceptance criterion.

**Solo fast closure:** deliver the smallest reversible, testable capability slice, then owner test, then grow only where actual Serena/runtime evidence demonstrates a gap. “User approved the root command” does not equal per-child-activity approval, network sandboxing, or independently verifiable Owner Consent.

## 2. Verified starting point (source inspection, not live end-to-end evidence)

- SUD-D provisions and manages pinned **Serena 1.7.0** through `packages/infrastructure/src/serena-managed-runtime.ts`; its manifest includes `execute_shell_command` among 22 expected tools. The managed gateway currently exposes only the limited `code.*` semantic facade (9 methods), not arbitrary Serena tool calls.
- Managed Serena 1.7.0 shell uses shell-mediated execution that waits for completion; it does **not** provide a verified durable job ID, streaming log cursor, owned cancellation or process cleanup for long video renders. `Serena_Home_New`'s separate `process_start/status/logs/stop` tools must **not** be assumed present in SUD-D's pinned managed Serena.
- SUD-D already has Tool Kernel, Policy, Approval, Audit, Work Memory, Workspace boundaries, and source-level Project Runner foundations. Production Runner is **discovery-only**, and A1 native/real independently verifiable Owner Consent remains BLOCKED.
- External TGNK source-inspection handoff reports `production:run` and Factory Runner, but a fresh-project automated path remains policy-gated (`autonomous_local_production_ready:false`) and requires business/human gates; provider/network/runtime/readiness have **not** been physically verified here.
- Previous 2026-10-13 A1 inert/synthetic evidence closure was independently accepted (7 suites, 74/74 tests); that is **not** Windows/Native security proof.
- Source basis for the design: `packages/infrastructure/src/serena-engine-manifest.ts`, `serena-managed-runtime.ts`, `packages/application/src/approval-service.ts`, `tool-kernel.ts`, `work-resume-guard.ts`, `packages/mcp-gateway/src/workspace-file-server.ts`. Codex delivered a 2026-10-14 design report at ignored **local-only** `.serena/reports/serena-first-solo-permissions-codex-design-20261014.md`; this tracked-path plan is the portable handoff, not a link-only dependency on that ignored report.

## 3. Architectural decision and boundaries

**Select:** Serena-first, initially a **private reviewed-action Permission Bridge**. It must reuse SUD-D's Kernel → Policy → manual Approval → pre-execution Audit → injected Serena tool mapping → safe result/outcome Audit. It must expose *zero* new production tools during C1.

**Defer:** earlier generic/registered TGNK Job Runner implementation assignment as the immediate first milestone; keep its lifecycle, replay, cleanup, MP4 QC and durable job design as references/fallback **only when Serena process support is demonstrably insufficient**. Do not implement both paths in parallel.

**Permission direction:** existing Restricted behavior stays default. First implement **one exact, one-use reviewed invocation** with trusted session/Workspace/runtime binding. Later optional owner-configured bounded workflow grants and Solo Expert Mode require separate Product Owner decisions on UX and host risk. No automatic grant in Full Access mode; approved/consumed **human decision provenance** must be checked. Do not add raw upstream tool-name passthrough.

**Risk truth:** approving an `npm` or other shell command permits its own script/dependencies to invoke further programs and access whatever the host Windows account can. SUD-D approval at the boundary cannot individually intercept arbitrary inner actions, constrain the OS account to a Workspace, or guarantee network/credential isolation. A stop request is not proof of all descendants stopped. Serena 1.7.0's upstream arguments/results logging also needs safe, source-level inspection before any real-secret-bearing shell use. This cooperative host-user pilot **does not alter** A1 Option A's independent trust direction.

## 4. Milestones, evidence, and live status

| Gate | Deliverable and completion evidence | Status at 2026-10-14 |
| --- | --- | --- |
| R0 — Requirement/architecture | Owner explicitly confirmed Serena-first; Codex reviewed source and delivered design; Advisor inspected proposal and accepted narrower C1 | **DONE — DESIGN ACCEPTED** |
| A1 prior track | Inert/synthetic source closure 74/74 prior tests; protected Windows Owner trust anchor outstanding | **PAUSED; REAL TRUST BLOCKED** |
| C1 — Code-only Permission Bridge | Private strict reviewed action registry; fake Serena dispatch, exact manual approval, freshness/replay/privacy tests; no live tool | **DONE — 21/21 independently PASS; scoped TypeScript/ESLint PASS** |
| C1R — Independent review | Serena single Closeout; Advisor inspected 3 new files, independently reran tests, TypeScript, lint and hashes | **DONE — ACCEPT WITH CONDITIONS** ([C1R review](2026-10-14-serena-first-c1r-advisor-acceptance.md)) |
| C2 Design — Privacy/admission risk/readiness | Codex source-inspection proposal and Advisor review; split C2a code-only from C2b physical | **DONE — CONDITIONAL DESIGN / LIVE NO-GO** ([C2 review](2026-10-14-serena-first-c2-advisor-review.md)) |
| C2a-P0 — Privacy feasibility (code-only) | Serena read-only source feasibility; upstream pre-log privacy adaptation could not be proven within allowlist; no code/tests, justified STOP | **DONE — NO-GO ACCEPTED** ([Advisor review](2026-10-14-serena-first-c2a-p0-advisor-review.md)) |
| C2a remainder — Admission/UI | Requires Owner decision on new privacy/risk model and reviewed architecture before any production wiring | **HOLD — P0 BLOCKED; NEW DESIGN REQUIRED** |
| C2b — Short harmless physical dogfood | One separately Owner-approved, fully reviewed fixed invocation with safe receipt/cleanup limits | **HOLD; NOT AUTHORIZED** |
| C3 — Long-running job support | Source/contract verification for managed Serena process API or minimal reused Runner supervision; documented ability to observe/log/cancel/cleanup | **DESIGN DECISION PENDING EVIDENCE** |
| C4 — TGNK new-project E2E | Legitimate new-project startup, human/provider gates, safe job control and verified per-attempt Final MP4 | **NOT STARTED; TGNK READINESS UNVERIFIED** |
| C5 — Return to A1 | Resume previous independently verifiable Owner Consent feasibility work from accepted checkpoint | **DEFERRED** |

**Estimate/status updated after C2a-P0 NO-GO:** C1/C1R done; the former conditional 2–4 day C2a estimate is **no longer reliable** because pinned upstream privacy adaptation is not yet established under the current allowlist. C2b physical remains HOLD pending an entirely new approved source/consent envelope, and C3/C4 Final MP4 timing is still unproven. See the [C2a-P0 accepted NO-GO](2026-10-14-serena-first-c2a-p0-advisor-review.md). No Team Mode/background model runtime is required.

## 5. Approved immediate C1 implementation scope — Serena separate chat

**Historical C1 implementation assignment — COMPLETED, NOT to be rerun.** The following scope is retained for provenance and future review.\
**Recipient:** Serena Implementation in a separate conversation using SUD-D Home New.\
**Mission:** `SERENA-FIRST-C1 — Inert reviewed permission bridge`.\
**Outcome:** exactly one private module with fake dispatch, focused pure/Kernel integration tests and one Closeout, then STOP. The Owner relays this assignment; this Advisor chat does not itself act as Serena Implementation.

**Mandatory role separation:** Serena uses its own tools and explicitly permitted local code checks only. **NEVER** invoke Codex CLI (`codex`, `codex exec`), Codex MCP/agent/services, delegates/subagents that invoke Codex, Remote Desktop Commander, Team Planner or Team Mode. If a design decision or out-of-scope change is required, STOP and report to the ChatGPT Project Advisor.

**Repo bootstrap:** read `AGENTS.md`, `SUD_D_ADVISOR.md`, the *top active checkpoints* of `SUD_D_HANDOFF.md` and `SUD_D_ROADMAP.md`, this entire plan, and relevant source. Complete the Skill Router Gate; load canonical repo-local `tdd`, `codebase-design`, `domain-modeling`, `impeccable` (review-projection/copy), `writing-for-agents` (handoff). Use `diagnosing-bugs` only on unexpected failures. Confirm branch/HEAD, staged state, dirty/untracked baseline and task-start hashes before any edit. Do not overwrite existing work. STOP if any proposed new file already exists.

**Exact writable allowlist (three source/test paths must be NEW):**

1. `packages/application/src/serena-permission-bridge.ts` — a private, injected review/admission/mapping module; no barrel export or default live adapter.
2. `packages/tests/src/serena-permission-bridge.test.ts` — pure negative and positive behavior tests.
3. `packages/tests/src/serena-permission-bridge-kernel.test.ts` — real in-process Kernel + Approval coordinator with in-memory doubles and fake Serena tool.
4. `.serena/reports/serena-first-solo-permissions-serena-code-only-closeout-20261014.md` — one ignored final Closeout.

All other tracked, untracked, runtime and OS paths are immutable, apart from reviewed ordinary tool caches required by scoped checks. Protected examples: approval service, Tool Kernel, Policy, Resume guard, Serena managed runtime/config/provisioner/manifest, production gateway, Desktop, contracts/domain/database, Runner/native/A1, package manager metadata, canonical docs and old reports.

**Behavior contract:**

- One synthetic fixed `actionId` and bounded enum parameters; trusted private composition selects a fixed, non-secret harmless upstream `execute_shell_command` mapping. No arbitrary shell string, tool name, `argv`, `cwd`, `env` or provider parameters from caller. The only executor is an **injected fake** that records a call without running a subprocess.
- Validate strict plain input (including unknown/extra keys, getters/accessors, prototypes, symbols), expected pinned tool/schema version and capability risk. Unknown or drifting schema and unsupported long-job/stop/streaming operations are rejected, not magically enabled.
- Produce one immutable detached review snapshot binding action, parameters, command fingerprint, script/registry schema, limits, trusted Workspace identity/generation, trusted session and runtime epoch; recheck freshness before fake dispatch. Caller-supplied `approved:true`, approval ID or identity does not grant authority.
- Exercise existing `defineToolCapability`, real Tool Kernel and Approval coordinator in PRIVATE test composition. Force a **real user-sourced, consumed, unexpired, matching approval** and reject any mode-based autoapproval (notably `full_access`) before fake call. Avoid inventing a parallel Approval system. If the existing coordinator cannot prove this with the allowed files, STOP and report the design gap; do not modify protected production modules.
- Inject resume guard/check and audit, fail closed for non-resumed, wrong Workspace/session/epoch, denied policy, input drift or audit-precondition failure. Do not claim this private check has added production Resume coverage.
- Use an atomic in-memory attempt reservation for same-process duplicate/concurrent requests. Validate identity before cached lookup. On unknown, lost reply, timeout or outcome audit failure, quarantine and do not retry. No claim of durable exactly-once across restarts.
- Expose safe typed result metadata only. Never include raw stdout/stderr/exceptions or poison-marker synthetic secrets in review, DTO or audit. Test privacy with invented poison strings, not real credentials.
- Each test must prove fake call count (zero for denial; once for an authorized exact call), no subprocesses and no production registration changes.

**Required focused verification, after checking local scripts/tools and preserving task-start baseline:**

```powershell
pnpm exec vitest run packages/tests/src/serena-permission-bridge.test.ts packages/tests/src/serena-permission-bridge-kernel.test.ts --reporter=dot
pnpm exec eslint packages/application/src/serena-permission-bridge.ts packages/tests/src/serena-permission-bridge.test.ts packages/tests/src/serena-permission-bridge-kernel.test.ts --max-warnings 0
pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false
git diff --check
```

Use installed tooling only, no installation. Tests must import pure source and fakes rather than start a Serena server, SQLite runtime, external Process or TGNK. Record RED→GREEN, precise commands/exit codes/test totals and introduced vs task-start TypeScript diagnostics. Focused repairs permitted up to **three iterations per diagnosed root cause** within allowlist; no repeated Owner handoffs for routine safe work. If affected type evidence remains inconclusive, STOP.

**Hard STOP boundaries:** any change to protected files, exposing production shell/Runner, running process/native/physical fixtures, calling external provider/network/credential stores, reading secrets, changing Windows policies, admin install, build/package/dev/Electron, root-wide tests, git stage/reset/clean/commit/push, Team start, or unbounded repair. No user/provider risk authorization for those acts exists in this C1 handoff.

**Closeout:** one final Markdown report with changed paths/hash, task-start and final Git state, preservation proof (including existing dirty/untracked work), test evidence, remaining blockers and the exact statement: `mock/synthetic only; no production, physical, Final MP4 or Option A authority`. STOP. Owner returns report/path to ChatGPT Advisor for independent review. This is the only continuation trigger for C1R.

## 6. Later gates — what NOT to invent during C1

- C2 needs concrete Owner approval of specific harmless real process/command, machine, risk limits and credible secret-free upstream logging evidence.
- C3 decides whether compatible Serena lifecycle tools exist (managed version is not the separately connected Home New toolset); if not, reuse the least Runner supervision already designed, not a second policy/approval layer. Must establish job ownership, logs, status, cancellation uncertainty and cleanup proof.
- C4 requires **new** TGNK project entrypoint and legitimate human approvals, runtime/provider/readiness/credit checks, finite resource budgets, artifact attribution/hash, technical QC and creative Owner acceptance. A historical `final.mp4` does not count.
- C5 A1 Option A genuine Owner consent stays paused/blocked; this pilot's cooperative consent must not be described as A1 security proof.
- Document only verified closure; a test PASS from private mocks is not equivalent to real execution.

## 7. Resume from a new ChatGPT conversation

Use the Owner-facing bootstrap already in `SUD_D_ADVISOR.md`, or send:

> ผมต้องการให้คุณเป็น Project Advisor ของ SUD-D เชื่อม Serena Home New กับโปรเจกต์ SUD_D อ่าน AGENTS.md, SUD_D_ADVISOR.md, SUD_D_HANDOFF.md (จุดล่าสุด), SUD_D_ROADMAP.md (จุดล่าสุด) และ docs/superpowers/plans/2026-10-14-serena-first-solo-permission-bridge-c1.md แล้วสรุป DONE / IN PROGRESS / BLOCKED / NEXT และทำต่อเฉพาะงานที่ได้รับอนุมัติ ห้ามเริ่ม Serena Implementation เองหรือเปิด Native/Physical โดยไม่ได้รับอนุญาต

**After every material delivery:** ChatGPT Advisor independently reviews evidence and updates the **active checkpoint** in `SUD_D_HANDOFF.md` and the relevant status row in this plan (and `SUD_D_ROADMAP.md` only when the product direction/milestone changes). **2026-10-14 C1/C1R update DONE:** independent [Advisor review](2026-10-14-serena-first-c1r-advisor-acceptance.md) accepts inert source only; 21/21 focused tests and scoped TS/ESLint PASS; project-wide TS still has four unrelated errors. Do not rerun C1 assignment or claim production readiness. Preserve the earlier checkpoints as dated history rather than rewriting them as new facts.

**Important:** `docs/` files here are in the working repository, but remain uncommitted/unpushed until separately authorized. A different machine/clone will not receive them from Git remote until an authorized commit/push or explicit file transfer.
