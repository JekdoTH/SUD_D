# C1R Independent Advisor Acceptance — Serena-First Permission Bridge

**Date:** 2026-10-14\
**Decision:** **ACCEPT WITH CONDITIONS — C1 inert/code-only candidate only.**\
**Owner requirement and portable source plan:** [2026-10-14-serena-first-solo-permission-bridge-c1.md](2026-10-14-serena-first-solo-permission-bridge-c1.md)\
**Serena Closeout:** `.serena/reports/serena-first-solo-permissions-serena-code-only-closeout-20261014.md` (ignored/local-only). This tracked acceptance records the evidence needed by a fresh chat even if the ignored report is unavailable.

## Scope accepted

Serena created exactly the three new task-allowlisted implementation/test files:

- `packages/application/src/serena-permission-bridge.ts` — private inert reviewed-action module, injected **fake** dispatcher only
- `packages/tests/src/serena-permission-bridge.test.ts` — strict review/input/freshness checks
- `packages/tests/src/serena-permission-bridge-kernel.test.ts` — real in-process Tool Kernel + Approval coordinator with in-memory fakes

One ignored closeout was created. No production Gateway registration, barrel export, managed Serena runtime adapter, Desktop UI, native code, TGNK run, provider call, or live shell is part of C1. No source changes outside these three files appear in the C1 path inventory; the preexisting dirty working tree was preserved to the extent independently observable. **No full task-start byte inventory of unrelated dirty files exists**: this is not a historical byte-by-byte preservation certification.

**Code inspection:** strict input, trusted snapshot/session/Workspace/epoch binding, bounded synthetic action, manual consumed/user-sourced Approval provenance, fake-dispatch reservation prior to call, safe-output handling and uncertainty behavior meet the inert C1 contract. Static private composition and injected checks are **not** evidence of actual production Resume integration, source-of-truth secret privacy on a live Serena server, or durable Windows job control.

## Independent checks performed by Advisor

| Check | Independent result |
| --- | --- |
| Focused Vitest for the two C1 test files | **PASS**, 2 suites / **21/21 tests**, exit 0 |
| Scoped ESLint for three C1 paths | **PASS**, exit 0 |
| `pnpm exec tsc --project packages/application/tsconfig.json --noEmit --incremental false` | **PASS**, exit 0 |
| `pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false` | **FAIL**, exit 2, exactly four errors in unchanged, non-C1 test sources |
| `git diff --check` | **PASS**, exit 0; preexisting line-ending warnings only |
| Git and hashes | HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`; branch `p0c-hyperv-spike`; staged 0; SHA-256 of all 3 C1 paths **exactly matches Closeout** |

SHA-256 independently recomputed (same as the Serena Closeout):

- `serena-permission-bridge.ts`: `1fdae579959747a21d07255bbfc79a3afd8aa95213ca7f92c2830772c4b46779`
- `serena-permission-bridge.test.ts`: `1b280631892ff532b82ce6f8b6c3b88aea21ec20399d5a821f0f4a80f08a6404`
- `serena-permission-bridge-kernel.test.ts`: `a68019102a86691bca2aaf6c72cbc4ff1ec8df7c03c141169eac090f81ef686d`

Independently recomputed protected current source hashes match Serena's closeout for `tool-kernel.ts`, `approval-service.ts`, `work-resume-guard.ts`, `serena-managed-runtime.ts` and `workspace-file-server.ts`. These matches establish report fidelity, not a proof of task-start hashes.

**Four global TypeScript failures (still present, unchanged out-of-scope sources):**

- `packages/tests/src/git-safety-read-integration.test.ts:148` — TS2339 `serverInfo`
- `packages/tests/src/git-safety-read-integration.test.ts:149` — TS2339 `capabilities`
- `packages/tests/src/m0.7.test.ts:560` — TS2345 missing `listActivityForWorkspace`
- `packages/tests/src/private-mvp-pre-h1-native-consent.test.ts:18` — TS2741 missing `native2RuntimePinManifestSha`

They are reported by the Closeout to reproduce with C1 paths excluded; Advisor separately reproduced the same four current errors. No overall TypeScript PASS is claimed. Fixing them is **outside** the C1 allowlist and is not needed to accept the scoped inert candidate.

## Conditional limits / later gates

1. **C1 source-only acceptance cannot authorize host execution.** The fake `echo` mapping is not a general-purpose Serena Shell or SUD-D production capability.
2. C1's same-process reservation, in-memory/weak identity and 250-ms synthetic timeout are not durable exactly-once, cancellation, OS cleanup or protected Owner consent. Never promote them as evidence of real job safety.
3. Live Serena's upstream argument/result logging, credential privacy and possible server egress must receive source-grounded review **before** a real command—even a seemingly harmless invocation. Safe downstream DTO filtering is not sufficient proof of source-level privacy.
4. `full_access` may auto-approve new SUD-D executable capabilities unless they are explicitly protected. Real production composition requires **manual-only** consumed-user authorization and an effective kernel/resume/audit path; no naive raw tool passthrough.
5. C2 (short live proof), C3 (long job support), C4 (new TGNK end-to-end) remain **NOT IMPLEMENTED / NOT AUTHORIZED**. Windows physical Process, Provider/Network, Expert Mode and TGNK machine permission require their own bounded Owner decisions. A1 independently verifiable consent remains BLOCKED at its separate accepted checkpoint.

## Next decision

**C1R CLOSED — Advisor accepts.** Preserve C1 candidate. **NEXT actor: ChatGPT Project Advisor + Codex only after the Owner chooses to advance**: a bounded design/read-only C2 readiness/risk packet for a genuinely harmless approved short invocation, including upstream logging, install/version contracts, safe review UI/provenance and explicit STOP gates. Do not dispatch Serena code changes or live execution from this acceptance alone.

After a separately scoped Owner approval of the physical risk packet, a future Serena Implementation mission may integrate the smallest safe path and test a physical invocation. Do not start the old TGNK Runner mission in parallel. Mark a milestone `DONE` only when its own independent evidence exists.

**Repository continuity:** `SUD_D_CONTEXT.md` = stable Owner requirement; `SUD_D_ROADMAP.md` = active priority; `SUD_D_HANDOFF.md` = current status; tracked plan = detailed scope/evidence; this review = C1R decision. Docs remain local working-copy edits until separately authorized Git commit/push.
