# SUD_D Solo G2c — Passive Managed Serena Live-Session Provenance (Serena ONE LONG BOUNDED Mission)
**2026-10-16 | Risk: Security/Data Critical | Actor: Serena Home New Implementation, separate chat**
**Authority:** [Advisor-reviewed Codex `gpt-6.1-sol` Medium design, WITH NARROWING](2026-10-16-solo-expert-g2c-live-session-codex-medium-advisor-final-review.md).
**Goal:** one small meaningful SOURCE-only trust seam observing *already retained* managed-session state without granting any real `READY`, without spawning, and WITHOUT production Solo tool registration. **Never use a synthetic fixture to claim real Live readiness.** Owner defers personal testing.

ONE LONG BOUNDED MISSION → focused tests/repair up to THREE cycles per diagnosed cause → ONE FINAL CLOSEOUT → STOP. Do not dispatch another mission yourself.

## 0. Mandatory authority + skill router

Read `AGENTS.md`, `SUD_D_ADVISOR.md`, TOP current `SUD_D_HANDOFF.md` and ROADMAP, binding Advisor decision above, and accepted desktop input snapshot review `docs/superpowers/plans/2026-10-16-solo-expert-g2b-desktop-source-fileid-repair-advisor-final-acceptance.md`. Run repository Mandatory Skill Router Gate, load `tdd` for trusted session acceptance seam and `codebase-design` if needed; `impeccable` is NOT triggered since no UI/renderer work is authorized. Test seam is the existing exported `createManagedSerenaRuntime(...).inspectLiveSoloReadinessOnly()` observation on fake *injected session objects*, never a real tool or Native Session. Use existing `serena-managed-runtime.acceptance.test.ts` mock infrastructure; its real `live` cases are forbidden and must remain skipped. If actual test runner unexpectedly launches native/process/provider operations, HARD STOP and report without running.

**No cross-agent invocation:** Serena NEVER calls Codex CLI/MCP/agent, subagents/delegates, Team Mode or Remote Desktop Commander, including as a test helper. Don't run `codex` or start other agents.

Preflight active `SUD_D`, branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged 0 and large inherited dirty user tree PRESERVED. Do not `git clean/reset/checkout/stage/commit/push`; never overwrite unrelated modifications. Previously accepted latest Source copy `$env:TEMP\sudd-latest-desktop-owner-build-20261015-02` and frozen 512 staged G2b outputs remain read-only historical evidence; don't refresh or mutate them in this mission. Its source digest cannot be considered latest after new edits.

## 1. EXACT writable allowlist — NO expansion

(1) **EXISTING** `packages/infrastructure/src/serena-managed-runtime.ts`. Add one PUBLIC, documented and narrowly typed `inspectLiveSoloReadinessOnly()` method to returned runtime and, only as needed, private passive lifetime/stop state within same file. The method:
- must be synchronous and read only already-present in-memory `active` references and flags, never call `startInternal`, `start`, `repair`, `semanticRead`, `semanticWrite`, `callTool`, `listTools`, `processSupervisor`, OS process inspection, file I/O, logger, network or environment;
- returns an immutable discriminated outcome with `status:'not-ready'` only, and bounded, NONSECRET reason enums such as `NO_ACTIVE_SESSION`, `SESSION_INVALIDATED`, `PROVENANCE_UNVERIFIED`; no root/PID/credentials/hostname/digests leaked into renderer or logs;
- if no retained session, pending/incomplete tool contract, stop/repair/reconnection/replacement or invalidated observation: must return NOT_READY; even if `startInternal()` previously reports success, **PID+server handshake+tool schema+manifest expected digest do not prove process/peer identity**, therefore return NOT_READY for missing ownership/executable-to-peer binding;
- guarantee immediate fail-closed invalidation when explicit `stop()` begins, not only after asynchronous cleanup; avoid changing normal managed runtime `start/stop/semanticRead/semanticWrite` behavior beyond such passive invalidation. If race proof requires external process owner API, HARD STOP without implementing it.
- absolutely preserve preexisting `inspectSoloExpertReadyOnly()`/`callSoloExpertReadyOnly()` synthetic-only API semantics and every existing fixed Serena contract.
- do NOT introduce a `ready:true`, `integrity:'verified-real'` or authentication claim; no production registration, no privilege escalation, no Team/native B2.

(2) **EXISTING** `packages/tests/src/serena-managed-runtime.acceptance.test.ts`: add minimally sized focused tests on the genuine new method using faked processSupervisor/connection/provisioner/transport only. Verify: absent session NOT_READY, a prefilled fake/old synthetic fixture NEVER yields real READY, during active fake session after schema checks still NOT_READY due missing peer provenance, synchronous `stop()` transition invalidates before awaits, reconnect/replacement not reusable, and `inspect` never causes launches/connect/listTools/callTool or external effects. RED→GREEN for the actual new method only. Preserve existing fixture/live test segregation and all unrelated tests. No new broad fixtures or extra test files.

(3) **ONE NEW ignored Closeout** `.serena/reports/solo-expert-g2c-passive-managed-session-provenance-serena-closeout-20261016.md`, required initially ABSENT. Create exclusively once after focused verification; no overwriting old reports.

ALL other files STRICTLY READ-ONLY: `packages/application/**`, `packages/mcp-gateway/**`, `packages/domain/**`, package manifests/lockfile/toolchain, Tests except the single allowed test, all `dist`/`dist-release`/Desktop Build, installed `node_modules`, frozen TEMP roots, real %LOCALAPPDATA%/APPDATA%, Windows OS policy, credentials, Git. Even if Codex's preliminary design listed 7 potential files, THIS assignment intentionally authorizes only 2 actual source/test paths.

## 2. Internal Gates

**A — READ-ONLY PRECHECK / RED:** confirm pin, source before-state of the two authorized files, prior real Live Solo unregistered behavior. Implement a failing focused test proving no active observation yields NOT_READY and inspecting does not mutate/start. Tests must use only existing fake dependencies, not real MCP/Serena.

**B — MINIMAL IMPLEMENTATION / GREEN:** add typed passive read-only method within 1 allowed source file and any minimal stop-invalidation flag. Pass focused negative cases. If an actual `READY` can only be asserted by PID/handshake/config/tool-list or synthetic fixture, HARD STOP with `PROVENANCE_UNVERIFIED` rather than weaken the gate.

**C — NO SIDE-EFFECT TESTS:** run narrow source-target TypeScript checks and affected fake-only focused tests only if runner does not trigger an unapproved Native/OS/Product process; reporter+exit code both checked. No full suite / package build / root compile / Vite/esbuild/Electron, Native Koffi/SQLite, Product Gateway or Managed Serena launch, B2/real Terminal, network/provider, install/rebuild, Windows policy/elevation. If relevant safe runner unavailable, report `TEST_BLOCKED` and do not claim PASS; static inspection alone is not runtime proof.

**D — PRESERVATION / ONE CLOSEOUT:** inspect all two-file diff and `git diff --check`, pin HEAD/staged unchanged, inherited unrelated dirty state preserved, no original `dist` or previously accepted TEMP owner workspace edits, existing synthetic Solo tests/contracts unchanged. Report exactly executed tests and exit codes, new public method contract, evidence limits and unmet peer attestation chain. One ignored Closeout then STOP.

## Outcome ceiling

If all allowed checks pass: `G2c PASSIVE MANAGED SESSION NOT_READY SEAM CODE_ONLY VERIFIED; REAL_PEER_PROVENANCE_UNVERIFIED; PRODUCTION_SOLO_UNREGISTERED; PHYSICAL_SESSION_NOT_RUN; DESKTOP_BUILD_NOT_RUN; OWNER_TEST_DEFERRED; B2_NOT_AUTHORIZED`.

This is **not** Live Solo ready, not a real Studio/Host activation or MVP closure. Real peer/process ownership and executable-to-session attestation require **separate Owner-controlled Native/physical permission and further design** before expanding Application `snapshotIdentity()`/Gateway tool registration. No `soloExpertFake` production use. Follow only approved Gate A–D; if any evidence or right is missing, STOP with precise PARTIAL/BLOCKED report and no self-escalation.

**FINAL:** `.serena/reports/solo-expert-g2c-passive-managed-session-provenance-serena-closeout-20261016.md`. Return this single Closeout path to ChatGPT Project Advisor, then STOP.
