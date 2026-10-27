# SOLO-EXPERT-B0 — Independent Advisor Acceptance

**Date:** 2026-10-14\
**Verdict:** **ACCEPT WITH CONDITIONS — B0 PRIVATE / INERT MOCK ONLY.** This is an independently reviewed delivery, **not** production activation or physical execution consent.\
**Owner decision:** Option B Solo Expert / cooperative local-logging host-user risk accepted **for a future user-selected, clearly disclosed scope**. B0 code-only implementation approved. Owner additionally permits considering an early real Terminal proof to accelerate development, **provided the actual command and genuine SUD-D-mediated per-call approval are established first**.\
**Serena closeout:** `.serena/reports/solo-expert-b-code-only-closeout-20261014.md` (ignored/local-only).\
**Binding contract:** [B0 assignment](2026-10-14-serena-first-b0-serena-assignment.md).\
**Design:** [Accepted A/B review](2026-10-14-serena-first-a-b-advisor-review.md).

## 1. What was accepted

Reviewed three new, formerly nonexistent private files:

| Source/test | Independent SHA-256 (matches closeout) |
| --- | --- |
| `packages/application/src/solo-expert-serena-bridge.ts` | `bc67075b8c7af28d7d813e80ca335f25cee6870c2490c939096953cc84fb3b8c` |
| `packages/infrastructure/src/solo-expert-serena-adapter.ts` | `9849a8a9934dcc69dff208bdd06bceab3e36a4b52e1112b24504ceed20295036` |
| `packages/tests/src/solo-expert-serena-bridge.test.ts` | `078e0245141e8f29368c05fc1438f507be8aef8fabb8e6beb873a6a6a698980a` |

**Source inspection against B0 assignment:** Two fixed synthetic action profiles; strict caller input, version/fingerprint checks, safe reviewed metadata, user-sourced consumed per-call Approval in existing in-process Kernel/Policy/Approval and fake repository, freshness/resume/revocation/replay/audit gates, atomic same-process attempt reservation, and fake-only infrastructure `execute_shell_command` callTool-mapping/strict typed outcome. No newly exposed Gateway capability, barrel export, default live Serena session/constructor, Desktop/DB/native wiring or provider call. Test code uses synthetic poison markers, not real secrets. Actual code-under-test invokes no OS shell.

**Do not overclaim:** Local fake Approval repository and WeakSet snapshot do not supply a durable cross-process human grant; synthetic `setTimeout` does not terminate an OS process or descendants. The decoder's expected `isError`/JSON `{return_code,stdout,stderr,cwd}` and exact cwd/output remain **fixture contracts**, not independently verified responses from a live managed Serena 1.7.0 session. A short harmless stock shell may log request/response/error to local file/memory/stderr, run with Windows-account ambient permissions and have uncontained children. No live source privacy, startup/egress isolation, job ownership or independent A1 consent was demonstrated.

## 2. Independent verification

| Gate rerun by ChatGPT Advisor | Result |
| --- | --- |
| `pnpm exec vitest run packages/tests/src/solo-expert-serena-bridge.test.ts --reporter=dot` | **exit 0; 1 suite / 50 of 50 PASS** |
| Scoped ESLint of three files, `--max-warnings 0` | **exit 0** |
| Application `tsc --noEmit --incremental false` | **exit 0** |
| Infrastructure `tsc --noEmit --incremental false` | **exit 0** |
| Global `pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false` | **exit 2**, four diagnostics in unchanged out-of-B0 test files: `git-safety-read-integration.test.ts:148,149`, `m0.7.test.ts:560`, `private-mvp-pre-h1-native-consent.test.ts:18` |
| `git diff --check` | **exit 0**; unrelated preexisting CRLF warnings |
| SHA-256 independently recomputed | all three new files match submitted report |

Serena Closeout additionally documents a synthetic B0-only compiler root run with zero errors and TDD RED→GREEN progression. Advisor **independently checked scoped packages**, but did **not** independently reproduce the custom synthetic compiler-root setup; do not conflate package TypeScript checks with that synthetic compiler result. The prior four global type errors are still present as listed; no global type-check PASS.

**Git boundary:** Independent spot-check: branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, three B0 paths untracked, previously modified `SUD_D_HANDOFF.md` remains modified. Serena's closeout records staged 0 and preserved 259-entry non-B0 porcelain fingerprint before/after adding exactly three B0 paths (38 tracked changed; 221 prior untracked → 224 with B0); Advisor verified source hashes and current HEAD/diff, but a fresh complete staged-state enumeration was not consistently returned by the connected terminal. Do not claim independent byte-for-byte preservation of every unrelated dirty file. No Advisor stage/commit/push; keep all preexisting work.

## 3. B0 review findings / B1 hard gates

No B0-blocking deviation was found within its **private fake-only** acceptance contract. B0 test infrastructure can be used as a reference for the subsequent production seam, but **must not be registered or injected with a live transport without B1 review**.

The minimum distinct **B1 production code-only** proposal must address, with truthful Owner risk disclosure:

1. Version-pinned managed Serena 1.7.0 tool/schema compatibility at real session boundary; stock callTool response/JSON/error/cwd parsing independently verified with fakes and source. Never assume Home New process tools exist in managed Serena.
2. Real trusted Workspace/session/runtime identity and Resume/Policy/Approval/Audit through SUD-D cross-process boundaries; immutable backend-reviewed per-call nonsecret command + risk/logs projection, consumed **user-sourced** decision, expiry/revoke, mode `full_access` bypass denial, pre/post-audit failures and no replay/relaunch on UNKNOWN.
3. UI approval must actually display what the Owner is authorizing, including local Serena logging and lack of filesystem/network/descendant sandbox. Approved command/script may have indirect side effects. Device/account source must be labeled with honest provenance, not self-attestation.
4. Secure default/OFF production registration, no generic caller-chosen shell strings, no secret-bearing arguments/output/credentials, network/provider/spend/delete/admin/long-job or TGNK execution in first slice.
5. Safe result and audit metadata, upstream logging/startup/usage-reporting exposure documented with reasonable options for consenting/revoking. Revocation stops **future admission only** absent proven process ownership; unknown post-dispatch outcome stays UNKNOWN.
6. Scope B1 in one or more **minimal bounded allowlists**, likely managed runtime + gateway/resume + Approval UI/persistence; do not authorize a broad DB/desktop/native sweep without a source-grounded interface plan. A1 remains separately BLOCKED.

**Accelerated B2 physical:** Owner's broad willingness to allow a real Terminal proof does **not** make B0 fake dispatcher into a real SUD-D permission system. B2 should be one short nonsecret fixed command in a synthetic owned Workspace with a frozen command/Windows account/device/tool/version/logging/expected startup/effects/timeout/rollback card; do not use TGNK, install, network, provider, admin, secrets or long-running render for the first physical proof. Execute **only through the actual B1 SUD-D approval path** with explicit command-level user action. Avoid an alternative direct Serena Home New shell smoke being counted as SUD-D B2 proof. Owner need not wait for future A1/long-job support to reach this small stage.

## 4. Final status / next actors

| Milestone | State |
| --- | --- |
| C1 / C1R | DONE, previous inert candidate acceptance (21/21) |
| C2 design / C2a-P0 | design reviewed; P0 source privacy NO-GO under prior contract |
| A/B risk-model decision | **OPTION B OWNER SELECTED** |
| B0 private reviewed fake-only bridge | **DONE — independently ACCEPTED WITH CONDITIONS, 50/50** |
| B1 real product Approval / managed Serena integration | **PROPOSED / NOT IMPLEMENTED** |
| B2 one harmless real Shell smoke | **CONSENT IN PRINCIPLE; exact live approval and B1 proof not satisfied** |
| B3 development Workspace | NOT STARTED |
| B4 durable long job | NOT STARTED |
| B5 fresh TGNK project → verified MP4 | NOT STARTED |
| A1 protected independent consent | PAUSED / BLOCKED |

**Next:** ChatGPT Project Advisor should prepare a **narrow, source-grounded B1 contract/write allowlist** for Owner authorization and distinct Serena Implementation chat. Fast closure preferred; do not repeat B0 or dispatch a broad generic Runner. Owner approves the next protected-file scope; after Serena code-only B1 Closeout, Advisor validates it, then carries out or directs a separately explicitly scoped B2 physical approval. Status recorded in `SUD_D_HANDOFF.md` / `SUD_D_ROADMAP.md`; all docs are local uncommitted working-copy edits until Owner approves Git operation.
