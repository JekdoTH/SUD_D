# SOLO-EXPERT-B1b-G2-Continuation — One Long Code-only Mission (Advisor Authorized 2026-10-15)

**Status:** APPROVED by ChatGPT Project Advisor under the Product Owner's 2026-10-15 bounded engineering delegation. **Dispatch target:** Serena Home New **separate Implementation chat**, via this repository-relative path. **Risk:** Security / Data Critical. **Execution:** ONE long bounded mission, internal C1→C2→C3→D→artifact analysis, ONE final Closeout / ONE Advisor review. **G2b generated-artifact publication: NOT AUTHORIZED. B2/live shell: NOT AUTHORIZED.**

## 0. Decision basis and authority

Read before code:
- `AGENTS.md`, `SUD_D_ADVISOR.md`, active top checkpoint `SUD_D_HANDOFF.md`, relevant `SUD_D_CONTEXT.md` / `SUD_D_ROADMAP.md`;
- Original binding G2a `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-serena-assignment.md`;
- Original G2a closeout `.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md`;
- Independent Advisor partial review `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-advisor-partial-review.md`;
- Independent **Codex GPT-6.1 Sol / High Read-only** report `.serena/reports/solo-expert-b1b-g2b-exact-artifact-codex-report-20261015.md` and **Advisor accepted-design decision** `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2-continuation-advisor-decision.md`.

This is a **new, separate, narrowly authorized G2 continuation**, not an implied override of the old G2a HARD STOP. The old G2a contract remains the security/acceptance baseline unless this document **explicitly specifies a different TypeScript verification surface** (source-graph checks that cannot claim compiled parity) and adds read-only/memory-only artifact analysis. **No rights to write dist.**

R3 Gate 0 Contracts transport and Gate 1 Desktop source/fake already accepted. G2a Gate A 4/4 source fake and B 3/3 DB Resume focused tests have evidence. **Preserve and regression-test; no replay of B0–R3 implementation or G2a A/B redesign.** G2a Gate C is incomplete, D blocked by stale generated Application/Infrastructure declarations. The Owner directs **long continuous execution then final review**, so continue every safe in-scope subgate and its repairs until completion; only actual HARD STOP boundaries interrupt.

**Mandatory agent isolation:** Serena must NOT invoke Codex CLI / `codex` / `codex exec`, Codex MCP/agent/services, delegates/subagents that invoke Codex, Remote Desktop Commander or Team Mode. Use Serena's own tools and approved local test commands only. If design/architecture decisions are needed, stop and return to ChatGPT Project Advisor, who separately handles Codex. Do not treat Advisor's delegated engineering authority as authority to bypass user-driven Desktop Approval.

## 1. Exact writable SOURCE/TEST allowlist — SAME EIGHT PATHS

1. `packages/application/src/index.ts`
2. `packages/application/src/work-resume-guard.ts`
3. `packages/infrastructure/src/index.ts`
4. `packages/mcp-gateway/src/workspace-file-server.ts`
5. `packages/tests/src/solo-expert-serena-gateway.test.ts`
6. `packages/tests/src/solo-expert-serena-runtime.test.ts`
7. `packages/tests/src/solo-expert-serena-persistence.test.ts`
8. `packages/tests/src/solo-expert-serena-resume.test.ts`

**Other authorized disk outputs ONLY:**
- ONE new ignored `.serena/reports/solo-expert-b1b-g2-continuation-code-only-closeout-20261015.md`;
- ONE uniquely task-owned OS TEMP directory for synthetic/nonsecret disposable SQLite DB, WAL/SHM, and fixed, controlled **test-only** interprocess/restart harness artifacts; use installed test host and avoid any unrelated filesystem writes;
- Existing tooling logs generated intrinsically by the approved test host, not intentional repository build outputs.

**Generated compiled artifacts: ZERO new/modified disk files.** Specifically no `packages/**/dist`, `tsbuildinfo`, Desktop/Vite/build output, R3 Contracts compiled indexes, config, lockfile, scripts, additional tests or production files. Protected integration/Approval/WorkMemory/Domain/Policy/Kernel/DB migrations, Desktop IPC/preload/UI, managed Serena runtime, TGNK/native are unchanged. If a ninth Source/Test path or publication output is essential, **HARD STOP with exact path/reason**; no self-expansion.

No Git stage/commit/push/reset/clean/rebase/sync; no package build/installer/rebuild/deploy; no product Desktop/Gateway/Managed Serena process or real shell; no provider/network/credentials/secret/spend/Windows Policy changes.

## 2. Mandatory preflight — read-only

- Verify active SUD_D project, canonical root; `git status --porcelain=v1 -uall`, branch, HEAD, staged 0, the **eight G2a STOP hashes**, pre-existing unrelated dirty/untracked work and protected/R3 contract artifact hashes. Expected branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`; any unexpected in-scope drift is STOP and report, not reset.
- Run repository **Skill Router Gate**; read canonical `.agents/skills/tdd/SKILL.md`, `.agents/skills/codebase-design/SKILL.md` and `.agents/skills/writing-for-agents/SKILL.md` as triggered by exact security/test boundaries, `diagnosing-bugs` on unexpected failure; record `Selected Skill(s)`. Respect all stop/verification rules in `AGENTS.md`.
- Pre-implementation compliance check: Security/Data Critical; selected skills; specified focused tests/typecheck/lint/security inspection; hard-stop boundaries. Verify installed Electron **36.9.5 as Node** (ABI135 better-sqlite3), installed TypeScript/Vitest/ESLint without installing/rebuilding. No Product DB or product startup.
- Baseline original R3 **75 tests** are prior evidence, NOT proof of this continuation until run again. Current G2a additions **5** (two gateway, three Resume).

## 3. C1 — MCP tool-list/call reliability and negative matrix

- Reuse actual source `createProductionMcpServer` on in-memory MCP transport with `soloExpertFake` **explicit test-composition opt-in only**. Default `createDefaultProductionMcpServer` has NO Solo tool; never start it to test.
- Fix test helper JSON-RPC **response correlation by request `id`**, not FIFO `waiting.shift()`, with bounded wait/close; needed for trustworthy concurrent tests. Reject unknown/unmatched/duplicate-response cases safely.
- Test strict first payload `{}` and exact retry `{attemptId:UUID}` with no extra keys, arbitrary command/argv/env/cwd/identity/root/generation/session/approval controls. Missing/expired/invalid attempt and failed `prepare` MUST fail closed, zero fake calls, zero claims, audited denial where required; inspect the `invokeKernel(kernel, 'solo_expert.smoke', input)` fallback but **do not** claim it is an observed bypass without proof. Keep existing WeakSet/frozen review barrier and original review object retry.
- Verify no start/repair/connect/provision/semantic-read/semantic-write/live call/network/product OS child process during list/deny/pending/invalid/failure, including disabled-factory unknown calls. Mock admitted execution occurs at most once, returns `executionKind:'mock'` only. Assert source-level counter ports rather than launching real product processes.
- Exhaust all Approval modes including manual-only `full_access`, strict exact displayed digest, pending/deny/TTL≤90s/expiry, wrong/stale/missing digest, HMAC/coordinator equality, key/session/runtime/root/generation/gateway+managed epochs, drift and revoked identity.

## 4. C2/C3 — real SQLite test-only process evidence, one-use Audit/UNKNOWN

- Use one task-owned disposable nonsecret TEMP SQLite area; multiple **actual SQLite connections** and **controlled separate test processes** with installed Electron-as-Node only. The test-only decision worker uses existing ApprovalService/repository and exact stored user-review digest; distinguish synthetic `decisionSource:'user'` fixture from **real Owner UI click** (NOT claimed). Gateway fixture owns original in-memory frozen Review, bound MCP session and HMAC key; don't export HMAC key or rehydrate serialized review as authority.
- Prove durable decision seen on original Gateway-side same coordinator, conditional claim atomicity and one winner under barrier-synchronized duplicate calls, zero second fake dispatch; separate-process reopen claimed/UNKNOWN/orphan restart fences, fail closed on drift/new session/stale generation. Test pre-invocation Audit failure, outcome Audit failure, poison/timeout/transport unknown and post-claim uncertainty. Never reset UNKNOWN or auto-close/reissue attempts to make suites pass.
- Preserve Workspace-bound Policy → Kernel → human Decision → HMAC → durable Claim → mock Execution → Audit sequence. Prepared orphan legitimately blocked is reported as blocked, not force-cleaned with new rights.

## 5. D — final source/fake verification without dist writes

**New source-graph diagnostic authority explicitly replaces the previously impossible `tsc -p` + stale published package declarations as the G2a SOURCE-only verification approach; it does NOT change or waive the future G2b canonical compiled-runtime gate.** Do not use handwritten stubs or suppress diagnostics.

1. Run all **six** original focused R3 suites (75 existing cases) **plus** the new Resume suite and all new C tests, via already-installed Electron-as-Node/Vitest safely (no root test scripts/build prehooks). Actual exit code **0**, reporter **zero failures**, counts >= original 75 + existing 5 G2a tests + newly added cases. On relevant failure diagnose and repair up to **three cycles per diagnosed cause** inside allowlist.
2. Run scoped ESLint across exact eight paths; TypeScript **source-graph strict noEmit** using installed TS 5.9.3 with Node16 resolution/real source interfaces, `noEmit:true`, `incremental:false`, `composite:false`, `writeFile` forbidden, `emit` never called. For a cross-package diagnostic graph, override `rootDir/outDir` only **in the in-memory compiler options of that diagnostic program** to avoid artificial rootDir errors; keep strict checking and correct canonical source resolution. Document graph roots, source-vs-package aliases, real compiler diagnostics and return status. Do not misrepresent Bundler/Vitest aliases as actual runtime package exports.
3. Run original package `noEmit` checks as read-only diagnostics if useful; record stale `.d.ts` blockers **truthfully as compiled parity NOT_READY**, not as failures of the separately authorized source-graph proof nor as passing canonical typechecks.
4. `git diff --check`, hash equality for protected modules and all R3 Contracts index outputs, full 8-path per-file source/test diffs, staged 0 and inherited unrelated work preservation. Zero additional Source/Test paths and zero generated runtime artifacts.
5. If the strict **source-graph** diagnostic finds real source errors, fix them **only inside the 8-path allowlist** and rerun invalidated tests/checks. Never mask errors by alias substitution or fake declarations. If required fix exceeds scope, STOP and report actual cause.
6. **Acceptance ceiling:** With C and source-only D passing, report `G2a SOURCE/FAKE VERIFIED; CANONICAL COMPILED PACKAGE PARITY NOT_READY`, NOT product-ready. If any mandatory negative/provenance proof not met, report PARTIAL with precise blocker. `LIVE MANAGED SERENA NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED` in every result.

## 6. Read-only / memory-only G2b artifact analysis — no publication

This step is **analysis permission**, not G2b compile/publish authority. Using **installed TypeScript** and a transient in-memory driver executed through approved finite test-host command only, after the source/test set is frozen:

- Map canonical package exports and resolution in order **Domain → Infrastructure → Application → MCP Gateway**. Use real package Node16 options and current source; identify exact runtime-import needs, no implicit large barrel build.
- Compiler API may `program.emit(targetSourceFile, captureWriteFile, …)` but the `writeFile` callback must capture **bytes exclusively in process memory** and never write repo/TEMP compilation outputs. This is *memory-only compiler emission* (not `noEmit`); distinguish clearly from D strict noEmit. No dynamic module execution or `stdio-entry.js` import (top-level startup hazard).
- Inventory missing/stale artifact candidates by **fully enumerated exact destination path**, source owner, output kind, current existing/missing state, current SHA-256 where applicable, candidate bytes/hash, direct/transitive import necessity and reused-neighbor byte hashes. Do not use patterns or a broad `448` ceiling as authority.
- If exact minimal dependency/byte manifest cannot be demonstrated with memory-only analysis, report **UNKNOWN/BLOCKED** and exact remaining analysis gap. Do not widen scope or perform a build. Keep R3 Contracts 4 compiled artifacts byte-identical.
- No stage/backup/publish/restore operations in this mission because NO dist writing authority exists. Those safeguards belong to a later exact separately accepted artifact publication.

Memory-only capture may be omitted ONLY if already proven impossible within the installed safe tool boundary; report why and preserve source/fake C/D evidence. Do not turn a noncritical manifest uncertainty into hidden G2b Build.

## 7. Single Closeout and STOP

Produce exactly ONE new ignored:
`.serena/reports/solo-expert-b1b-g2-continuation-code-only-closeout-20261015.md`

Include:
- Gate C1/C2/C3/D results, negative/one-use test matrix, independently controlled worker/reopen SQLite evidence, no-product-execution counters;
- tests grouped with original 75 + added counts, actual commands/exit statuses, reporter, TS strict source-graph diagnostics, ESLint and Git diff check;
- scoped source/test before/after SHA-256 and protected/R3 artifact hashes, branch/HEAD/status/staged and preservation;
- fully explicit memory-only artifact manifest OR precise blocker, **no writes to dist**, no production runtime readiness claim;
- one honest overall verdict and exact unresolved future parity/B2 prerequisites.

**STOP** after completed Closeout or any genuine HARD STOP. Return only the final Closeout path and short outcome to Owner for independent ChatGPT Project Advisor review. Do not start G2b publication, B2, native, actual Managed Serena, Desktop/Gateway startup, real terminal or Git writes. The Owner's preference for one long mission is NOT permission to cross those boundaries.
