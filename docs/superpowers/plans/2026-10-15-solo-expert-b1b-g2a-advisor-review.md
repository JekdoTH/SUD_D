# SOLO-EXPERT-B1b-G2a — Advisor Read-only Design Acceptance (2026-10-15)

**Verdict:** **ACCEPT CODEX G2 DESIGN WITH CONDITIONS; G2a Source/Fake MCP integration is next; no G2a source edit or generated-artifact build has been authorized in this turn.** Prior R3 remains accepted **Gate 0 compiled Contracts**, **Gate 1 Desktop source/fake**, **Gate 2 PARTIAL/NO-GO**, 75/75 focused tests PASS. New G2a code is a new protected source/test scope requiring exact Product Owner confirmation.

**Primary report:** [portable Codex B1b Gate 2 design](../research/2026-10-15-solo-expert-b1b-g2-codex-design.md) (~49 KB); original ignored `.serena/reports/solo-expert-b1b-g2-codex-design-20261015.md`. Codex read-only job `advisor-codex-b1b-g2-recovery-design-20261015` completed and STOPPED. This is not a Serena Implementation mission, and Codex did not invoke Serena/agents, build, tests, product shell or modify Source.

**Binding proposal:** [G2a eight-path Serena assignment](2026-10-15-solo-expert-b1b-g2a-serena-assignment.md), **PREPARED / NOT DISPATCHED OR OWNER SOURCE-EDIT APPROVED**. Owner originally directed Advisor to decide Design vs Implementation and proceed with agent Design in the project; this authorizes this read-only review, not an unspecified 8-file modification.

## Architecture and source-truth review

1. `packages/infrastructure/src/serena-managed-runtime.ts`'s production `ActiveSession` closes over `context/session/rootPid/validatedToolNames`. Its Solo ready-only inspector accepts **only injected `integrity:'synthetic-fixture'`**, not authenticated independently provisioned live session. The actual runtime `startInternal` can write config/install and start a process. **Live attestation still HARD STOP.** A Serena connector connected in another context is not a managed Session of this Gateway process and cannot supply credible receipt. Hashing current installed files without process-bound attestation is insufficient.
2. `packages/infrastructure/src/workspace-repository.ts` already offers DB-owned `getGeneration` with transactional monotonic increments on selection changes; `packages/application/src/work-memory-service.ts` already offers `requireResumedSolo(session,id,generation)`. Production Gateway does not inject the DB generation reader into WorkMemoryService. `packages/application/src/work-resume-guard.ts` currently omits `solo_expert.smoke`; generic missing-workspace fallback must never admit Solo.
3. `packages/mcp-gateway/src/workspace-file-server.ts` currently has **no Solo tool registration**. The R3 `solo-expert-serena-gateway.test.ts` covers direct ToolKernel/SQLite fake path, **not actual MCP tools/list and tools/call from createProductionMcpServer**. Source-level opt-in fake dependency for tests only is the next minimal deep seam; default `createDefaultProductionMcpServer` must remain OFF/unregistered and without env/caller activation.
4. Consent/HMAC/claim/audit code and SQLite restart tests are already present and should be reused. The exact same Gateway approval coordinator object must authorize the Kernel and Solo capability; human decision may be persisted across separate test-process via existing DB/Service, without a second approval authority or HMAC in renderer.
5. Generated-package-artifact parity is still **not ready**: Contracts four index artifacts were approved/compiled in R3, but Application/Infrastructure dist are stale, Desktop compiled UI/Electron graph unproven, managed Serena actual ownership not proven. Codex estimates that naïve package compiler/import closure could emit hundreds (up to **448 candidate artifacts** in its source analysis), **not independently accepted as an exact generated-file allowlist**. G2b must instead obtain a narrowed, enumerated build/provisioning plan after G2a; do not authorize whole-package builds from this estimate.

## Decision: a single narrow G2a mission before G2b

**Exact G2a proposed 8 paths (4 SOURCE + 4 TEST):**
1. `packages/application/src/index.ts` — narrow existing Solo integration export.
2. `packages/application/src/work-resume-guard.ts` — fail-closed Solo-specific DB-generation Work Resume admission/audit.
3. `packages/infrastructure/src/index.ts` — narrow existing attempt-ledger export.
4. `packages/mcp-gateway/src/workspace-file-server.ts` — actual `createProductionMcpServer` in-memory MCP transport with explicit *test-only* fake opt-in; no default prod Solo route.
5. `packages/tests/src/solo-expert-serena-gateway.test.ts` — add real test-owned MCP tool-list/call and immutable approval retry to existing R3 fake Kernel tests.
6. `packages/tests/src/solo-expert-serena-runtime.test.ts` — prove no managed runtime start/connect/provision/semantic calls on denied/list/prepare.
7. `packages/tests/src/solo-expert-serena-persistence.test.ts` — reuse real test-owned SQLite TEMP file and distinct-process restart/decision durability checks.
8. NEW `packages/tests/src/solo-expert-serena-resume.test.ts` — DB generation away/back, same-clock, missing workspace, session drift, restart; audit deny.

**Generated artifact changes = ZERO.** No changes to Domain, solo integration module, WorkMemoryService, DB migrations, approval source/repository, Managed Serena Runtime/manifest/provisioner, installed Serena, existing Contracts runtime outputs, Desktop IPC/UI, node_modules/build configuration/lockfiles. A single task-owned TEMP directory (test-only SQLite/decision harness) and one ignored new Closeout are proposed as non-source outputs. This does **not** authorize Gateway activation in the actual product.

**G2a completion conditions:** Default actual MCP factory OFF/no Solo tool; test-only fake opt-in tool supports strict initial `{}` and retry `{attemptId:UUID}` with no caller-provided authority; DB-backed Work Resume and generation+session/root binding fail closed on drift; same Coordinator/Kernel/manual user-sourced HMAC, persisted Approval/ledger/UNKNOWN/audit; no shell/start/repair/provision/network/OS product child process in all admission/list/deny flows; fake one-use invocation only after claim. R3 **75/75 baseline regressions retained**, plus G2a negative/positive tests, safe build-free TS/lint, SHA-256/Git inventory preservation. Max 3 repairs per diagnosed root cause. If stale prebuilt declarations require dist writes, **STOP** and report the minimum missing file/artifact permission; no covert build.

**G2a PASS means SOURCE/FAKE MCP GATEWAY ACCEPTED; LIVE NOT_READY.** It does not authorize real `execute_shell_command`, B2, A1 independent Owner Consent, persistent physical worker ownership, provider/network/spend or TGNK.

## Next actor and gate

**Owner:** explicitly approve or reject the G2a exact eight source/test path Code-only and test-owned SQLite TEMP/dedicated test-host scope. Advisor has only prepared the assignment, not sent a production source edit task to Serena. Once authorized, paste the [G2a bounded Implementation prompt](2026-10-15-solo-expert-b1b-g2a-serena-assignment.md) to **separate Serena Home New Implementation chat** (not Codex through Serena), one Closeout and STOP. Advisor independently reviews before planning G2b package artifacts and any B2 physical consent. Do not re-run B0/B1a/R1–R3.

**Continuity:** original `SUD_D_Home__work_resume` connector was unavailable at this Advisor review due to stale tunnel-client connection; `Serena_Home_New` source access and the read-only Codex design completed. This connector limitation is **not** live Managed Serena readiness proof and must not be handled by turning on product Shell.
