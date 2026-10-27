# SOLO-EXPERT-B1b-R2 — Approval Review-Digest Regression and Conditional B1b Continuation

**Date:** 2026-10-14\
**OWNER AUTHORIZATION — 2026-10-14:** Product Owner explicitly **APPROVED B1b-R2 CODE-ONLY** on this exact 23-path writable allowlist: original B1b 22 paths plus **only** `packages/tests/src/solo-expert-serena-integration.test.ts` as an additional B1a test regression compatibility file. Existing R1 test-only Electron-as-Node/owned TEMP SQLite scope remains valid. Serena may repair Stage I (strict reviewed-digest fixtures and existing two TS declaration mismatches) and, **only after full Stage I + B1a regression PASS**, advance to source/fake-only Stage II within the exact original 12 Stage II paths. Approval explicitly EXCLUDES running real managed Serena, Production Shell or B2, new source path, installer/build/rebuild, provider/network/secrets, Windows Policy, Native/TGNK, Git stage/commit/push, Codex/agent delegation. **READY TO FORWARD TO SEPARATE SERENA IMPLEMENTATION; NOT YET DISPATCHED/STARTED in this Advisor chat.** The rest of this assignment is binding.\
**Evidence:** [Independent B1b-R1 Advisor acceptance of partial STOP](2026-10-14-solo-expert-b1b-r1-advisor-review.md), [R1 passed-ABI test host scope](2026-10-14-solo-expert-b1b-r1-test-host-recovery.md), [original B1b full 22-path assignment](2026-10-14-solo-expert-b1b-serena-assignment.md), [B1a 57/57 prior accepted](2026-10-14-solo-expert-b1a-advisor-acceptance.md). The old R1 Closeout is immutable ignored local evidence.

## 1. Exact binding source allowlist — 23 paths

**Owner has approved the original B1b 22 paths plus the one test-only extension listed as path 23. This is the complete active allowlist; do not enlarge it.** Stage I remains the original ten paths:

1. `packages/domain/src/approval.ts`
2. `packages/domain/src/solo-expert-serena.ts`
3. `packages/application/src/approval-service.ts`
4. `packages/infrastructure/src/database.ts`
5. `packages/infrastructure/src/approval-repository.ts`
6. `packages/infrastructure/src/solo-expert-serena-attempt-repository.ts` (already created by R1; preserve its content and diff)
7. `packages/infrastructure/src/workspace-repository.ts`
8. `packages/application/src/work-memory-service.ts`
9. `packages/tests/src/solo-expert-serena-approval.test.ts` (already created; 3 failing test fixtures need digest)
10. `packages/tests/src/solo-expert-serena-persistence.test.ts` (already created; 5/5 pass, must stay green)

Stage II (only after Stage I and B1a regression tests pass; original 12 paths):

11. `packages/application/src/solo-expert-serena-integration.ts` (already modified under R1; preserve)
12. `packages/infrastructure/src/serena-managed-runtime.ts`
13. `packages/infrastructure/src/index.ts`
14. `packages/application/src/index.ts`
15. `packages/application/src/work-resume-guard.ts`
16. `packages/mcp-gateway/src/workspace-file-server.ts`
17. `packages/contracts/src/index.ts`
18. `packages/desktop/electron/approval-controller.ts`
19. `packages/desktop/electron/main.ts`
20. `packages/desktop/src/pages/ActivityPage.tsx`
21. `packages/tests/src/solo-expert-serena-gateway.test.ts` (NEW if absent)
22. `packages/tests/src/solo-expert-serena-desktop.test.ts` (NEW if absent)

**One and ONLY new authorization outside the original 22 paths:**

23. `packages/tests/src/solo-expert-serena-integration.test.ts` — EXISTING B1a **test-only regression compatibility**; may update fake reviewed Approval fixtures/assertions to supply immutable stored/displayed `reviewDigest` and test negative missing/wrong/stale digest. Do NOT modify B1a production code outside existing 22 scope, or silently change the meaning of user approval.

**Single new ignored Closeout only:** `.serena/reports/solo-expert-b1b-r2-code-only-closeout-20261014.md`. Keep previous B1b-R1 and initial B1b NO-GO Closeouts untouched. Serena must not write authoritative Handoff/Roadmap/other docs; Advisor will do so on review.

**STOP outside these 23 paths** including Product DB, electron IPC/preload, Metadata, Desktop CSS and native Runner, installed Serena, shared `node_modules` addon, package.json/lockfiles/build/dist declarations, AGENTS/docs. Never Git stage/commit/push/reset/clean.

## 2. Ownership / bootstrap / safety

Recipient: **Serena Home New Implementation in its SEPARATE conversation**. Activate and confirm `SUD_D`. Read complete `AGENTS.md`, `SUD_D_ADVISOR.md`, current top `SUD_D_HANDOFF.md`, `SUD_D_ROADMAP.md`, this entire R2 scope and original B1b/R1 contract and review. Complete Skill Router Gate; use TDD/codebase-design/domain-modeling/writing-for-agents and `impeccable` for UI. If unexpected failure, diagnosing-bugs. Record branch, HEAD, staged, full Git status fingerprint (tracked/untracked) and hashes for already-dirty allowlist/protected sources; preserve every preexisting user edit. Do not start task if any expected NEW path collides with a preexisting user file.

**Absolute role isolation:** Serena does NOT invoke Codex CLI/MCP/agent, subagent/delegate, Remote Desktop Commander, Team Planner/Team Mode. No unapproved provider/network, secret, paid model, repair/install/native rebuild, OS policy, product SUD-D Desktop/Gateway/Managed Serena startup, or physical shell/TGNK. Existing stock Serena local logs and host-user risk remain disclosed, not newly cured; first real B2 is separately authorized only after full source acceptance.

**Dev-test host scope reused, not widened:** use only installed Electron 36.9.5 with scoped `ELECTRON_RUN_AS_NODE=1` for focused real SQLite tests using the existing ABI135 `better-sqlite3`. One unique test-owned SQLite directory under OS TEMP with nonsecret test data is permitted for cross-process reopen/restart claim; never open Product DB. Use package-local Vitest/TS/eslint runners only if locally installed and confirmed. The already verified R1 ABI probe need not be repeated unless the binary identity/environment changed; report existing evidence versus fresh evidence separately.

## 3. Strict sequence — ONE bounded mission; do not progress past RED Stage I

**R2 Gate A — Repair exact review-digest test contract FIRST (Stage I repair):**

- Inspect current `ApprovalService.respond(id, decision, reviewDigest?)` and SQLite repository's conditional UPDATE. For only `solo_expert.smoke`, approval must compare the **same stored nonsecret reviewDigest shown to the human**; never approve merely from an arbitrary caller-provided digest or omit HMAC/user-sourced consumed check.
- In the newly authorized B1a regression test file, fix **all** old `decision.respond(id,'approve'/'deny')` fixture calls through a typed helper retrieving the exact pending displayed review projection/digest. Assertions must verify positive user decision plus no-digest/wrong-digest/stale projection denied. Do not simply remove/skip assertions or change production to accept digest-less input. Non-Solo Basic Approval remains backward compatible.
- Fix the allowlisted `solo-expert-serena-approval.test.ts` cases for **standard, approve_for_me and full_access** to call approval with an exact displayed/stored digest and assert no-digest/wrong/stale digest is rejected before any consumed grant. HMAC runtime/source binding remains separate from display SHA-256.
- Repair the **two known TypeScript diagnostics inside original allowlist**: Application `approval-service.ts:377` TS2554 (prebuilt Infrastructure interface accepts 2–3 args, source has 4); Infrastructure `approval-repository.ts:262` TS2339 (prebuilt Domain declaration missing additive review field). Use minimal locally type-safe structural adapter or no-emit source compilation/parity proof; do not build or modify installed/prebuilt dist. If genuine cross-package type safety cannot be proven without a protected build/artifact, **STOP** and present minimum extra authorization, not an unsafe cast or unverified claim.
- Repeat both 5-case SQLite Approval suite and 5-case persistence suite, the **full B1a 43-case integration suite** (plus relevant B1a Runtime regressions), focused lint and Domain/App/Infra TypeScript; any Stage I RED or source-trust uncertainty → STOP. Require actual complete test reporter `0 failed`, not just wrapper return_code (Advisor observed a wrapper reporting exit 0 with 3 failing tests under Electron-as-Node). For the file-backed restart test, preserve real distinct-process proof and only owned TEMP cleanup. Historic intermediate 10/10 is not sufficient.

**R2 Gate B — Stage II Code-only cross-process fake E2E (ONLY after Gate A passes):**

Use ONLY the original Stage II twelve paths. Follow full original B1b binding for durable same-coordinator manual-only Approval/SQLite `claimed/unknown`, trusted Workspace monotonic generation/real Resume, default-OFF Gateway, exact shown `reviewDigest` via existing safe Desktop IPC, safe Activity approval display, ready-only independently verified Managed Serena contract, and fake-only E2E. Never route a product live command or auto-start/provision/repair. If actual runtime attestation or manual approval path cannot be verified within exact 23 paths, **STOP / B1b CONDITIONAL-BLOCKED**, not a fake-only 'production READY' claim. Runtime version labels are not installed-byte attestation. B1a synthetic fixture may not become live authority.

**TDD/verification budget:** RED→GREEN focused steps (max three repairs per diagnosed root cause). No broad root suites, build/install, or test tool substitutions. Check known four historical project TypeScript errors separately without treating existing failures as an R2 PASS. Test both SQLite real constraints/restart and fake UI/Gateway route; normal mode defaults unchanged. A consumed Approval is not proof of dispatch; UNKNOWN fence is no auto-retry. B1b source pass is not B2 physical proof.

## 4. Closeout / STOP

Create one NEW ignored `.serena/reports/solo-expert-b1b-r2-code-only-closeout-20261014.md` with source hashes, version/probe identity, test reporter totals/exits, RED→GREEN, negative approvals and regressions, SQLite real TEMP cross-process proof, changed-file/untouched-file hash and Git preservation, complete Stage I/II status, stale built declaration risks, other Architecture Gaps, and exact proposal for future separate B2 risk/Owner-consent packet. Literal sentence:

`B1b-R2 CODE-ONLY DEFAULT-OFF; NO REAL MANAGED SERENA SHELL, NO PHYSICAL PROCESS, NO TGNK FINAL MP4; A1 OWNER TRUST STILL BLOCKED.`

**STOP** after Closeout or first Hard STOP, return to Product Owner/ChatGPT Advisor for independent review. Owner approval of R2 never authorizes B2, admin/network/provider/spend, native/Windows policy, default ON, or Git commit/push.
