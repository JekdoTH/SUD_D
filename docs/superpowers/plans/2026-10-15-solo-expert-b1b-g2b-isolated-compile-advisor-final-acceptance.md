# SUD_D B1b-G2b — Isolated Compiler Stage Advisor Final Acceptance (2026-10-15)

**VERDICT: ACCEPT EXACT TEST-ONLY ISOLATED COMPILED CANDIDATE.** This milestone is not a canonical `dist` publication, installed app parity, vendor/Native runtime proof, live managed Serena, B2, or Owner Manual Test.

## Source / scope
- Binding mission: `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-isolated-compile-serena-assignment.md`
- Serena final ignored Closeout: `.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md`; one new inert helper `packages/tests/src/b1b-g2b-isolated-stage.cjs`.
- Stage at trusted OS TEMP: `C:\Users\JJ\AppData\Local\Temp\sudd-b1b-g2b-isolated-stage-20261015`. Bound `stage-manifest.json` SHA-256 **`4da18d2e04b254992d02f941e7de0fdfa3eb505e6563627a100ced782f34a615`**. `publicationAllowed:false` in manifest.
- Frozen latest private `p0c-hyperv-spike` Source from 128 TS modules, installed TypeScript 5.9.3. 512 JS/maps/declarations/maps emitted in memory and staged as **512 task-owned output files + exactly 1 manifest**. The inherited workspace dirty state must be preserved.

## Advisor independent review (read-only)

1. Reopened actual Closeout, stage manifest and new helper source from connected `Serena_Home_New` on the activated local SUD_D repo. `node --check` helper exit **0**. TEMP stage exists, exactly **513 files**, **no detected reparse entries** under task-owned stage by PowerShell recursive attributes (best-effort, not Windows NTFS exclusive ownership proof).
2. Independently recomputed **all 512** stage file SHA-256 and byte sizes against exact stage manifest rows, including destination containment and duplicate path detection, and rehashed **all 512 canonical original `dist` path SHA-256 or ABSENT** against the frozen per-path `before` values. **512/512 exact matches; 0 mismatches**. Current canonical original output state: **339 matched**, **93 old/different**, **80 absent**.
3. Independently rehashed SHA-256 of the manifest: matched `4da18d2e04b254992d02f941e7de0fdfa3eb505e6563627a100ced782f34a615`. Parsed immutable manifest 512 rows and `sourceCount=128`.
4. Independently rehashed from Closeout **16/16 accepted Source/Test/Package Metadata paths**, **641/641 prior observed Compiler-input paths**, **637/637 newest CompilerHost observed input paths**, **11/11 protected older reports/R3 Contracts/tooling paths**; zero SHA mismatches. These are enumerated fingerprints, NOT proof of hypothetical negative filesystem lookups or imported native vendor behavior.
5. Current Git HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299` and staged files **zero**; `git diff --check` exit 0 with historical unrelated CRLF warnings. No root product `dist` mutations found; all frozen paths retain original hashes.
6. Serena reports configured original strict Node16 package consumer checks (Domain/Infrastructure/Application/Gateway) **0 diagnostics**, 47 static project module edges in new Gateway with zero known `koffi` edges; legacy root 11 native edges. Only static/TypeScript proof: no ESM/vendor/Native/Product execution or B2.
7. Advisor attempted to rerun helper `--self-test` **AFTER the task stage already exists**: it returned exit 1 for `self-test only-once stage missing`. This is a known precondition of the one-use script, **not a test regression** and must not be mislabeled as an independent 12/12 pass. The operator's completed initial 12/12 post-stage checks remain Serena-run evidence; independent cryptographic checks above corroborate the outcome. No one should delete/replace the legitimate stage to rerun one-time selftests.

## Next engineering decision

Owner explicitly prioritizes SOLO FAST CLOSURE and personally handles future Owner Manual Test, but is presently unavailable. Advisor may authorize *routine exact artifact engineering* without granting real B2/Native or product-host execution. To materially advance beyond a TEMP stage, the next proposed step is an **exactly bounded LOCAL DEVELOPMENT `dist` promotion** using preimage-SHA-locked **173** emitted files (93 DIFFERENT + 80 ABSENT), not the 89 narrowly classified runtime candidates. This maintains full source-current package output consistency; remaining **339** files must be present and already byte-identical, and must remain untouched. The allowlist is exactly the unique ordered rows in SHA-locked stage manifest where `before != sha256`; no wildcards or inferred new outputs. Before any local `dist` write a separate Advisor decision/Serena assignment must establish task-owned backup+rollback, dry-run preconditions, no active product processes, no reparse/symlink/foreign modifications and halt on any uncertainty. A dev-only promotion is NOT a user release or full G2b runtime acceptance.

**Labels:** `G2a SOURCE/FAKE ACCEPTED; G2b SOURCE STATIC ACCEPTED; G2b ISOLATED COMPILED CANDIDATE ACCEPTED; ORIGINAL DIST UNCHANGED; COMPILED PRODUCT RUNTIME NOT_READY; OWNER TEST DEFERRED; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.`
