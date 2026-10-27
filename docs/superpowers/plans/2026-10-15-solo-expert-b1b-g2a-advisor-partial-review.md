# SOLO-EXPERT-B1b-G2a — ChatGPT Advisor Independent Partial Review (2026-10-15)

**Decision:** ACCEPT FOCUSED EVIDENCE FOR GATE A/B ONLY; GATE C PARTIAL; GATE D BLOCKED; FULL G2a NOT ACCEPTED. This is a read-only Advisor assessment of source and Serena closeout, not re-execution of every test and not authority to build any generated output.

## Baseline and review sources

- Active project SUD_D, branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged 0 at review. Working tree holds extensive inherited user-owned modifications and untracked files. Preserve them.
- Original binding: `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-serena-assignment.md`; previous Codex G2: `docs/superpowers/research/2026-10-15-solo-expert-b1b-g2-codex-design.md`; approved G2a design: `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-advisor-review.md`.
- Serena actual closeout: `.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md`, ignored/local. Advisor independently read current Gateway factory, Solo integration, Work Resume guard, source exports, gateway/resume tests and TypeScript package configs. No Source/Dist modification or product/runtime invocation by Advisor.
- Serena closeout claims six G2a writable paths touched (four source, existing gateway test, new Resume test); old runtime/persistence tests unmodified; no generated artifacts. Report records path SHA-256 and protected/artifact pre/post equality. These hash claims were recorded by Serena, not independently recomputed for every protected file in this Advisor review.

## Gates

| Gate | Result | Grounding / limit |
| --- | --- | --- |
| A | **PASS for implemented source/fake slice** | Report: `solo-expert-serena-gateway.test.ts` 4/4, including two G2a tests. Real source factory over in-memory MCP: default OFF, synthetic opt-in, frozen retry + one fake invoke. No product host/real shell. |
| B | **PASS for in-memory DB/Resume slice** | New Resume tests 3/3; DB generation away→back + session loss fail closed. G2a file-backed distinct-process reopen still unproved. |
| C | **PARTIAL** | Positive fake HMAC/manual decision/SQLite claim/mock result; no complete denial/expiry/epoch/root drift/audit/concurrency/UNKNOWN across separate-process matrix. No actual Owner Desktop click. |
| D | **BLOCKED** | Application tsc noEmit exit 2, Infrastructure exit 0, Gateway exit 2. Installed Infrastructure/Application dist declarations are stale relative to source and are out of G2a write authority. No 75-case regression rerun, full new-negative suite, scoped ESLint/isolated TS checks. |

## Independent source observations (not allegations of production exploits)

1. Test-only `soloExpertFake` injects via `createProductionMcpServer` but is absent from `createDefaultProductionMcpServer`; uses same coordinator object for Kernel and Solo. Physical Gateway product activation is NOT evidenced.
2. The Gateway tool handler currently uses `invokeKernel(kernel,'solo_expert.smoke', input)` when `getReview` is missing or prepare fails. Solo capability's `issued` WeakSet validation appears to reject caller input, so this is **not a demonstrated bypass**; however negative tests should confirm rejection/audit/zero execution and Codex should review whether this fallback is an unnecessary authorization path.
3. Gateway test overrides `fileSystem.resolveExisting` synthetically for a non-existent sample root; this does **not** prove real filesystem containment. Do not substitute it for policy/workspace hardening proof.
4. Reported stale declarations: Infrastructure `dist/index.d.ts`, `workspace-repository.d.ts`, Application `dist/index.d.ts`, `work-memory-service.d.ts`, `approval-service.d.ts`, `work-resume-guard.d.ts`; two Solo-specific .d.ts absent. This is a **diagnostic list, not a complete permitted artifact manifest**. Prior Codex 448 outputs were only an estimated *ceiling* and are NOT approved.
5. Unknown/claimed durable retry fence and pre-execution/outcome audit are Security/Data Critical. Cannot waive final negative tests or the 75-case regression simply to close quickly.

## Decision and stop

- **Accept:** inherited R3 Gate 0/1 evidence and the narrowly proven G2a A/B slices; preserve already-written G2a source/test work.
- **Not accepted:** G2a as a whole, Gate C, Gate D, compiled-runtime artifact parity, live managed Serena readiness, A1 independent consent, B2 real command.
- **Do not:** build, mutate dist, expand source/test allowlist, start production Desktop/Gateway/Serena/shell, Git stage/commit/push/reset/clean, or invoke cross-role agents.
- **Next design task:** `.serena/reports/solo-expert-b1b-g2b-exact-artifact-codex-brief-20261015.md`, aimed at the **smallest exact finite** generated artifacts + safe single long Serena continuation (finish C/D + scoped parity). Codex must work **READ-ONLY**, no Serena/delegates. Codex CLI was attempted with explicitly specified `sol6.1` and `model_reasoning_effort=high`, but the CLI returned **HTTP 400 / model unsupported for ChatGPT account**. Therefore **no new Codex design was produced** and no substitution was silently made.
- **Advisor authorization status:** no G2b artifact rights granted pending exact scoped design; don't treat prior owner delegation as carte blanche to write unbounded dist. Owner direction needed only if choosing a different Codex model; when exact plan is verified, Advisor can authorize bounded continuation under the delegated engineering authority without additional per-Gate review.

## One-long-mission operating rule (Owner decision 2026-10-15)

Inside an approved exact task boundary, execute all safe internal phases and up to 3 repair cycles per diagnosed root cause, verify once at the end, and send **one final Closeout** for Advisor review. Escalate only true STOP conditions: required path/artifact authority changes, security weakening, architecture decisions, missing safe host, credential/privileged human consent, or exhausted repair budget. This does not resurrect or silently expand any stopped assignment.

**Final status:** `G2a PARTIAL / NOT ACCEPTED; G2b DESIGN BLOCKED ON MODEL; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.`
