# SUD_D B1b-G2b — Isolated Local Compiled Candidate (Serena One Long Bounded Mission)
**Date:** 2026-10-15 | **Actor:** Serena Home New Implementation, separate chat
**Risk:** Security / Data Critical | **Decision:** [Advisor exact bounded approval](2026-10-15-solo-expert-b1b-g2b-isolated-compile-advisor-decision.md)
**Product priority:** SOLO FAST CLOSURE. User is away and requested **skip User Manual Testing for now**. Do as much safe compiler/integration preparation as possible **without Owner interaction**. One long mission; one final closeout; STOP.

## Preflight and retained evidence

Read `AGENTS.md`, `SUD_D_ADVISOR.md`, CURRENT TOP `SUD_D_HANDOFF.md`, active roadmap fast-closure direction; run Skill Router Gate and read selected canonical repository skill(s), including `tdd` for output/mutation boundary if triggered and `writing-for-agents` for closeout when triggered. Read exact Advisor decision above and the accepted G2b evidence:
- `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-native-free-source-advisor-final-acceptance.md`
- `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-publication-planner-advisor-final-review.md`
- `.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md`
- `.serena/reports/solo-expert-b1b-g2b-publication-plan-closeout-20261015.md`

Preflight canonical repo `SUD_D` branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged 0, inherited dirty/untracked work preserved. Fingerprint accepted 16 Source/Test/Package Metadata paths, four R3 `packages/contracts/dist/index.*` hashes, old G2b reports, 512 physical logical output SHA-or-ABSENT rows, 641 prior recorded inputs and installed TypeScript, package manifests and configs. Use the current actual source as source of truth; if input drift is detected relative to accepted evidence, **HARD STOP** with affected paths rather than silently refreshing the freeze.

Historical 512 compiler products = 93 byte-different, 80 missing, 339 same from 128 TS source modules. Later publication planner classified 89 MUST_WRITE candidates, 207 REUSE, 84 DEFER, 132 DEFER/REUSE. None is permission to overwrite `dist`. G2a/R3 focused tests and static G2b tests were accepted; **do not repeat them** unless stage-specific failure invalidates evidence.

**Role isolation:** Serena NEVER invokes Codex CLI, Codex MCP/agent, subagents/delegates invoking Codex, Team Mode or Remote Desktop Commander. No assistant/agent approval substitute for human Desktop consent.

## EXACT NEW writable scope

1. **ONE NEW task-only inert CJS helper:** `packages/tests/src/b1b-g2b-isolated-stage.cjs` (confirmed absent at Advisor preparation). This is the only allowed repo Source/Test edit. No modifications to current product Source, package.json, tsconfig, lock, installed toolchain, previous test scripts or evidence.
2. **ONE NEW ignored Closeout:** `.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md`.
3. **ONE NEW disposable staging directory:** resolve `$env:TEMP` from local trusted OS (Advisor observed `C:\Users\JJ\AppData\Local\Temp`); basename EXACTLY `sudd-b1b-g2b-isolated-stage-20261015`. Assert this joined path is absent, parent is the actual expected TEMP root and not a symlink/junction/reparse. Create it with exclusive new ownership; if existing or anomalous, STOP without reuse/deletion. Outputs allowed ONLY beneath this one task-owned directory, preserving package-relative `packages/<domain|infrastructure|application|mcp-gateway>/dist/... ` structure and task-owned manifest. No symbolic links, junctions, ADS, original-repo dist paths, and no borrowing user-owned directories. Cap created output at compiler captured exact set (reported 512) and bounded JSON/hash evidence inside this temp root; do not copy credentials/workspaces/reports or node_modules into it.

All other paths are **READ ONLY**, including `packages/**/dist` in canonical working tree, R3 contracts, Windows user profile data and existing dirty/untracked files. No Git stage/commit/push/clean/reset/checkout/worktree, package install, root `pnpm build`, production app/Gateway/Managed Serena, no loaded/evaluated compiled SUD_D JS, no Native `koffi`/SQLite/native addons, provider/network/DNS, real Terminal/B2, Windows Policy/elevation/installer or owner click.

## Work order (no Owner interaction)

**A — RED / safety preflight.** Implement simple self-check mode in the ONE helper for destination escape, path collision/case and ABSENT-vs-present mismatch, accidental original `dist` write, stale read hashes, symlink/reparse ancestors (best-effort checking; do not claim OS guarantee), nonexistent expected staging root, and no report overwrite. Use Node built-ins + installed TypeScript Compiler API only. Read package config via Compiler API/data; DO NOT `require` product packages, product `index.js`, compiled output or Native dependencies. Keep test in same helper; no extra test file.

**B — full candidate capture.** Compile the actual pinned package source roots in dependency order Domain → Infrastructure → Application → MCP Gateway, `Node16`, `strict:true`, repo's configured `skipLibCheck` and declaration/maps. TypeScript `writeFile` callback captures bytes **in memory**; compiler host disk write forbidden and `noEmitOnError` handled explicitly. Use prior G2b source/freeze/read-set evidence to check no unexpected artifact paths; expected complete 128 modules/512 outputs are diagnostics, not a reason to fabricate count. Reproduce exact output hashes from previous report for every captured logical output. **If outputs or source state differ, STOP with precise diff.** Do not call existing `analysis()` or `plan()` that intentionally disallow rerun after their Closeout exists, and do not bypass those gates. Build only through installed TypeScript APIs, no executed generated JavaScript.

**C — stage only in owned TEMP.** After verifying all candidate logical outputs/hash/dependency closure and preexisting destination hash state read-only, materialize captured bytes into newly created TEMP root, with path traversal and reparse checks for every staged logical file; open exclusive new files, hash bytes after stage. NEVER publish into original `dist`, modify package `exports`, load Vendor MCP/Zod, or spawn a native app. Check four package strict Node16 consumer types against a **virtual declaration overlay** referencing staged in-memory emissions and SHA-checked Contract reuse; zero diagnostics required. Static inspect emitted Gateway `gateway-core` and legacy entry as previously: no known project native edge in core, 11 known legacy native edges; detect newly unresolved imports/resources. Do not claim that this is vendor top-level runtime verification or OS sandbox proof.

**D — one focused verification/Closeout.** Run `node --check` + `node packages/tests/src/b1b-g2b-isolated-stage.cjs --self-test`, then one staging run, inspect reporter, tool exit code and staged output completeness. If staging helper must run twice, do not overwrite the existing staging root; self-tests should be in-memory and the normal write path must fail closed when stage exists. Rehash all original protected Source, R3 Contracts, prior Closeouts, 512 original output destinations and current compiler read-set; ensure not changed. `git diff --check`, HEAD/staged unchanged, report exact repo path status; user dirty tree unchanged as observed, do not claim full independent byte proof for unscanned files.

**Repair budget:** up to 3 attempts per diagnosed helper/test-only cause within exact one CJS file. If source code or package metadata must change, cannot determine exact emit/freeze, compiler typecheck is broken, source drift occurs, file output guard cannot be enforced, dependency gap requires actual ESM/native load or extra writable path: **HARD STOP**; report blocker. Do not continue by broadening scope.

## Verdict and STOP

Create ONE NEW ignored report:
`.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md`

Report exact stage root and file inventory/hashes, 512 original destination before/after hashes, candidate capture count/checksums, source/compiler fingerprints, type diagnostics, exit codes, and assurance of **zero modifications to actual package dist**. If completed: `G2b ISOLATED COMPILED CANDIDATE STAGED; ORIGINAL DIST UNCHANGED; INSTALLED/PUBLISHED RUNTIME NOT_READY`; if incomplete: `PARTIAL/BLOCKED`. This staging proof is useful build preparation, **not** real Native/Win32 publication, canonical production package parity, vendor runtime validation, live Managed Serena, or B2. User testing is DEFERRED, not PASS.

Send one Final Closeout path back to ChatGPT Project Advisor; STOP. Do not start next publication or anything requiring Owner Desktop human Approval.
