# SUD_D — Desktop Owner-Test Source Workspace FileID Repair (Serena ONE LONG BOUNDED MISSION)
**Date:** 2026-10-15 | **Owner:** ChatGPT Project Advisor delegated routine Source/Test/Artifact authority
**Actor:** Serena Home New in separate IMPLEMENTATION chat
**Decision:** [Advisor independently accepted prior PARTIAL/BLOCKED and exact FileID root cause](2026-10-15-solo-expert-g2b-desktop-source-prep-fileid-advisor-partial-review.md).
**Risk:** Security/Data Critical, but defect is a two-line test-only metadata property mismatch. **FAST CLOSURE**: fix exactly that, do not start another design or broad investigation.
**Work:** ONE LONG BOUNDED MISSION; up to 3 focused repairs/root cause; ONE NEW final Closeout; STOP. No Owner manual testing during this mission.

## Gate A: exact authority/frozen baseline

Read `AGENTS.md`, `SUD_D_ADVISOR.md`, TOP current `SUD_D_HANDOFF.md`, fast-closure ROADMAP, the linked Advisor decision, and prior one-use final `.serena/reports/solo-expert-g2b-latest-desktop-owner-build-serena-closeout-20261015.md`. Run mandatory repo Skill Router Gate and load `tdd` for positive identity-copy seam, `codebase-design` if needed for helper's public test interface, `writing-for-agents` if touching the recipe/doc. **Role isolation: Serena MUST NEVER call Codex CLI/MCP/agent, invoke subagents/delegates using Codex, Team Mode or Remote Desktop Commander.** If scope/design boundary is ambiguous return to Advisor; do not self-expand.

Repository active `SUD_D`, branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged zero. Preserve inherited owner dirty/untracked work. Prior official `PARTIAL/BLOCKED` Closeout SHA256 **`ad9f67882b816baf5288a81b4ff6c3cd119984a6b4eeeab4ca42fd355cf6eb9d`**, immutable. Prior **FAILED** TEMP root `$env:TEMP\sudd-latest-desktop-owner-build-20261015-01` must remain **READ-ONLY**; its 201 existing copied/generated files and physical FileIDs/hashes are frozen by prior report. Do not resume/delete/overwrite it or write the missing inventory inside it. Previously 199 source copies + 1 generated Vite config + 1 recipe, individually and independently verified; missing `source-inventory.json` is the actual PARTIAL blocker. Frozen G2b 512 stage candidate SHA and original 512 canonical `dist` before hashes remain immutable.

**Specific bug (confirmed from actual existing CJS):** `createOwned` returns `identity`, and `executePrepare` persists `{...dest}` into `inventory.copies`; `verifyCopied` uses `row.destinationIdentity.dev/.ino` instead of `row.identity.dev/.ino`, causing TypeError. Prior 24/24 pure negative tests never exercised successful copying verification. Fix *actual* production-of-evidence positive path, not just a mock.

## EXACT limited writable paths — no others

1. Existing `packages/desktop/scripts/prepare-latest-owner-test-workspace.cjs` — targeted edit only:
   - Repair FileID data-model property mismatch, preferably through small `assertRecordedCopyIdentity(row,actual)` shared by verifier and pure positive/negative tests, requiring `row.identity`, `nlink=1`, matching `dev/ino` and refusing malformed records. No unsafe fallback to accepting missing or zero IDs. Do not change input scanning, Vite generator logic, security exclusions or build recipe.
   - Update hardcoded `TARGET_NAME` from suffix `-01` to EXACT `sudd-latest-desktop-owner-build-20261015-02` and old `REPORT` to EXACT new ignored Closeout `.serena/reports/solo-expert-g2b-latest-desktop-owner-build-fileid-repair-closeout-20261015.md`. No extra root names and no rename of old artifacts. Current Source digest `5ee5edb8bed85173a9050ab28d19fd6288764eced8ffd85e53ee15537bed5ad0` must match the new scanner result; if source bytes changed STOP with exact diff.
2. Existing `packages/tests/src/latest-owner-test-workspace.test.cjs` — add **one focused positive** pure identity-record case (`{identity:{dev,ino,nlink:1}}` matches actual and succeeds) and matching negative missing/foreign identity cases, using the same helper the real `verifyCopied()` calls. Keep prior 24 cases intact; no extra source/test files.
3. ONE NEW ignored Closeout `.serena/reports/solo-expert-g2b-latest-desktop-owner-build-fileid-repair-closeout-20261015.md`. Must be absent, create exclusive once at completion with exact before/after checks and test exits. Preserve the old Closeout.
4. ONE NEW exclusively task-owned disposable OS TEMP workspace `$env:TEMP\sudd-latest-desktop-owner-build-20261015-02`, independently verified ABSENT during Advisor preflight. Must remain absent through initial tests; only one `--prepare` can create it. Copied Source package trees/manifests/configs, generated owner-test Vite config, OWNER-TEST-RECIPE and source-inventory.json are the only authorized descendants, same allowlist and hardlink/reparse/path safety as original assignment. No different root if it fails.

All other repo files, `packages/**/dist`, original Desktop `build`, `dist-release`, original `node_modules`, previous TEMP directories/reports, Git history/status and user data/credentials are STRICTLY READ-ONLY. No Git write, package install/dependency change, Native/sqlite, Node product/package import, Vite/esbuild/Electron, `pnpm` build, Gateway/Managed Serena, network/provider, Windows policy/elevation, B2, Owner consent simulation.

## Gate B: RED→GREEN exactly one isolated defect

Write new fail-first positive identity test. Demonstrate RED from actual prior helper with no mutation of old root; correct property/guard, then GREEN using only stand-alone `node packages/tests/src/latest-owner-test-workspace.test.cjs`, `node --check` 2/2, both exit0. Avoid re-running old 512 compiler/test packages, full TypeScript, irrelevant vendor checks. Test explicit mismatch, missing `identity`, `nlink>1` fail closed.

## Gate C: ONE fresh source copy

Before creating `-02` require `--inspect-source` read-only success, exact **199** original selected Source/manifest files from current dirty/untracked worktree and source digest above; compare **199/199** source hashes recorded in immutable prior Closeout (same SHA/bytes), all original protected G2b source/stage/512 dist states immutable, `-02` root absent. Then run **one and only one** `--prepare` invocation against exact new `-02` root. Internally copies 199 existing current Source files + generated isolated Vite config + recipe, tests `verifyCopied`, and creates source-inventory.json only if checks pass. Fail closed on drift. Do not re-copy old root via links; new 202 files should be **independent**, no hardlink/junction/reparse to original. If the helper fails once on `-02`, STOP with one new Closeout and don't create another root.

## Gate D: independently inspect/report

Run `--inspect` read-only after `--prepare`; must exit0, check inventory completeness, **202 physical regular files** = 199 current Source copies + Vite config + recipe + inventory (report exact actual rather than fabricate). Rehash all inventory entries + original 199 sources, physical FileID and `nlink=1`, protected G2b stage 512 and canonical dist 512. Reconfirm frozen prior `-01` 201 file SHA/IDs and prior Closeout unchanged (reuse report vs direct focused recheck as needed), Git HEAD, staged zero, inherited status preserved except exact allowed two CJS edits; run `git diff --check` and check true exit. One Final Closeout with source digest, new root path, inventory SHA, count, test exit codes and explicitly `BUILD_NOT_RUN / NATIVE_RUNTIME_NOT_RUN / LIVE_SOLO_UNREGISTERED / OWNER_TEST_DEFERRED`.

**Expected completion ceiling:** `LATEST-SOURCE DESKTOP OWNER-TEST INPUTS PREPARED; BUILD_NOT_RUN; NATIVE_RUNTIME_NOT_RUN; LIVE_SOLO_UNREGISTERED; OWNER_TEST_DEFERRED; ORIGINAL DIST/RELEASE UNCHANGED.`

Owner-Test *input workspace* is NOT a compiled, installed, launchable or tested Windows app. Real Solo Expert is still unregistered in product production; fake is test-only. True future milestones are separate productive live-source integration and owner-authorized tightly isolated Native/Desktop build/smoke. Do not self-authorize either.

**ONE final Closeout to Advisor:** `.serena/reports/solo-expert-g2b-latest-desktop-owner-build-fileid-repair-closeout-20261015.md` then STOP.
