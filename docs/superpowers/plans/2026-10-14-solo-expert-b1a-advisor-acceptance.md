# SOLO-EXPERT-B1a — Independent ChatGPT Advisor Acceptance

**Date:** 2026-10-14\
**Verdict:** **ACCEPT WITH CONDITIONS — B1a INERT SOURCE-ONLY / SYNTHETIC SESSION AND APPROVAL.** Not permission for production activation, a real managed Serena shell command, privileged access, or B1b edits.\
**Binding scope:** [B1a exact eight-path assignment](2026-10-14-solo-expert-b1a-serena-assignment.md).\
**Serena evidence:** `.serena/reports/solo-expert-b1a-code-only-closeout-20261014.md` (ignored/local-only).\
**Design:** [B1 Codex report](../research/2026-10-14-solo-expert-b1-codex-design.md); [B1 Advisor decision](2026-10-14-solo-expert-b1-advisor-review.md).\
**Product Owner:** Option B cooperative Solo Expert selected. Willing in principle to conduct one harmless real Terminal smoke *after* SUD-D-mediated manual approval; this does not authorize a specific physical invocation today.

## 1. Review and independently reproduced evidence

Source inspection covered all eight B1a files and diffs of the three preexisting allowlisted files. Five were NEW; three EXISTING were modified within the scope. No Gateway registry, Approval database/real verifier, Desktop UI, Work Resume guard, package scripts, C1/B0 sources or native runner were changed by B1a.

| Check / inspected evidence | Advisor result |
| --- | --- |
| `pnpm exec vitest run packages/tests/src/solo-expert-serena-integration.test.ts packages/tests/src/solo-expert-serena-runtime.test.ts --reporter=dot` | **exit 0, 2 suites / 57 of 57 tests PASS**, independent rerun |
| `pnpm exec eslint` scoped to all 8 B1a paths, `--max-warnings 0` | **exit 0**, independent rerun |
| `pnpm exec tsc --project packages/domain/tsconfig.json --noEmit --incremental false` | **exit 0**, independent rerun |
| Same `tsc` for `packages/application/tsconfig.json` | **exit 0**, independent rerun |
| Same `tsc` for `packages/infrastructure/tsconfig.json` | **exit 0**, independent rerun |
| `pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false` | **exit 2: four existing out-of-scope diagnostics**: `git-safety-read-integration.test.ts:148,149` TS2339; `m0.7.test.ts:560` TS2345; `private-mvp-pre-h1-native-consent.test.ts:18` TS2741 |
| `git diff --check` | **exit 0** with preexisting unrelated LF-to-CRLF warnings |
| SHA-256 of eight new/modified B1a source/test files | **all eight independently recomputed, match Closeout in exact order** |
| SHA-256 of seven protected sources | **all seven independently recomputed, match Closeout** |

Serena Closeout also records TDD RED→GREEN, an isolated eight-path compiler check with **0 B1a errors**, and exact 266→274 Git-entry preservation fingerprint. Advisor independently reran the package checks and 57 tests; **did not rerun the custom isolated compiler program, did not reproduce the task-start Git fingerprint from a prior snapshot**, and did not verify every preexisting dirty file byte-for-byte. These are submitted agent evidence, not mislabeled independent checks. Source hashes and current Git state are independently confirmed.

**Current visible Git before this Advisor documentation edit:** branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`; 274 total Git-visible entries (41 modified tracked + 233 untracked); staged 0. The eight B1a files are precisely the reported three tracked changes and five new untracked paths. Preservation report says its original 266-entry porcelain fingerprint remained identical after filtering B1a paths. No Advisor Git stage/commit/push.

## 2. Spec acceptance and residual risks

**Accepted as source-only evidence:**

- One private fixed profile: `harmless-short-smoke / b1-smoke-v1`; inert command string `echo SUD_D_B1_OK` is only test data. Strict plain-intent admission rejects caller-selected shell/tool/argv/cwd/env and unknown authority. The exact user-sourced consumed Approval request and HMAC equality are **injected fake verifier/repository** tests using the existing Kernel/Policy/Approval coordinator *inside one isolated process*.
- Attempt states `prepared/claimed/closed/unknown/revoked` are modeled with injected in-memory ledger; a claimed invocation owner (Kernel invocation ID) is tracked to avoid unrelated concurrent retries changing the owner's attempt; outcome audit is checked before a claimed attempt may close; uncertainty retains a quarantine fence in that fake ledger.
- Ready-only managed Serena method requires an explicitly injected synthetic session/identity/schema receipt. The default production runtime does **not** supply it; without fixture, inspect returns unavailable and the fixed call denies. No lazy startup/install/repair or real shell is reachable through the new B1a methods in the normal product composition.
- Source-level configuration projection now fixes CHAR_COUNT estimator and adds SERENA_USAGE_REPORTING=false in the managed launch plan; SDK stderr listener discards raw PassThrough events in this code path. **These changes to preexisting runtime/config files are source modifications, NOT an observed live startup/privacy test**.

**Conditions / must remain blocked:**

1. **No live authority is proven.** B1a cannot authenticate installed Serena package/config/runtime/source integrity, Windows OS account, child-process ownership, or effective merged SDK environment. `integrity:'synthetic-fixture'` and synthetic SHA-like hex values only prove mock gating. Stock Serena may log raw arguments/results/errors to local file/memory/stderr and run as an unconstrained host Windows user. Token-estimator and telemetry configuration changes are not sandbox/no-egress proof.
2. **No durable cross-process consent/replay proof.** Ledger/WeakSet and manual verifier are local fakes. No actual SQLite attempt transaction, immutable persisted Approval projection, HMAC verifier in Gateway runtime, Workspace generation/Resume binding, manual per-call Desktop review, default-OFF registration or complete lifecycle/audit integration is implemented. Do not replace these injected ports with live transport just because 57 unit tests pass.
3. **Package type duplication debt:** prebuilt workspace `@sud-d/domain` declarations could not see new source contract without a package build, so Application and Infrastructure temporarily mirror small structural interface/types/constants. B1b must close type/parity drift under an explicitly permitted integrated build/type check. Current passing individual package `tsc` runs do not establish consumer import of newly built contracts.
4. **Response limits are not Process limits:** `max_answer_chars=2048` limits serialized upstream return, not stdout accumulation; 5-second Promise wait does not end `Popen(shell=True)` children. After transport uncertainty, no replay/relaunch on a new attempt until durable claim state is reconciled by future B1b.
5. **Existing semantic-runtime behavior was not physically regression-tested.** The changes to `prepareManagedSerenaConfig`, launch env and SDK stderr listener are authorized code-only but could have lifecycle compatibility implications; test via permitted fake/source seams and a later separately Owner-authorized physical B2 plan. The four global TypeScript errors are outside B1a and remain unresolved.

## 3. Forward action: B1b, then tightly bounded B2

B1a is **DONE / SOURCE CANDIDATE ACCEPTED**. Next is **B1b product integration**, with a new *exact source/test writable allowlist* and explicit Owner authorization. The existing [Codex B1 design](../research/2026-10-14-solo-expert-b1-codex-design.md) proposes around **15 additional production source paths and 4 new tests**, touching Approval/SQLite/migrations, genuine Workspace generation/Resume, manual-only HMAC verification, immutable human-visible Desktop review and Gateway default-OFF capability. Do not grant all of these automatically or assume the proposed list is final after B1a, because integrated type exports and real ownership boundaries need source-aligned recheck.

**Fast-closure recommendation:** prepare a bounded B1b implementation mission in the separate Serena chat after explicit Owner authorization. Organize it in two internal checkpoints (durable Approval/claim ledger first; Desktop/Gateway integration second), with STOP if a protected path outside agreed list is needed. B1b code-only acceptance must include negative tests of mode autoapproval, cross-process review changes/restart/double retry, Workspace drift, UNKNOWN without second dispatch, UI display completeness, default-OFF tool list and fake managed-SDK transport. If test-owned SQLite integration/build/renderer checks would require additional file or command scope, obtain approval first. Do not silently escalate to B2.

**B2 physical:** user is open to an early harmless one-shot only after B1b source acceptance. Still require an exact reviewed nonsecret command/device/account/Workspace/installed Serena identity, what may be written/logged, realistic wait vs cancel guarantees, one-use human Approval in SUD-D and a separate explicit physical authorization. No network/provider/spend/secret/delete/admin/TGNK/long job under this approval. A1 independent protected-consent checkpoint remains PAUSED/BLOCKED.

**Next actor:** Product Owner decides whether to authorize preparation/implementation of a separate B1b code-only exact-scope mission. Advisor should sync `SUD_D_HANDOFF.md` and `SUD_D_ROADMAP.md` to B1a independently accepted; do not leave B1a READY/IN PROGRESS. Serena B1a already STOPPED; do not re-run it.
