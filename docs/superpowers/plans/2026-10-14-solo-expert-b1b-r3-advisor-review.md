# SOLO-EXPERT-B1b-R3 — ChatGPT Advisor Design Acceptance and Exact-Artifact Decision

**Date:** 2026-10-14\
**Verdict:** **ACCEPT CODEX R3 READ-ONLY DESIGN WITH CONDITIONS; RECOMMEND SOURCE-FIRST NARROW CONTRACTS BUILD, NOT A NEW IPC TRANSPORT.** **OWNER AUTHORIZATION ADDENDUM — 2026-10-14:** Product Owner subsequently approved **exactly the R3 23 Source/Test paths + 4 Contracts index dist outputs + one isolated owned TEMP backup**, solely Code-only/limited compile/verification. [Binding R3 Serena assignment](2026-10-14-solo-expert-b1b-r3-serena-assignment.md) updated to **OWNER-APPROVED / READY TO FORWARD, NOT DISPATCHED OR EXECUTED**. The original proposal statements and status table below are the *historical pre-approval design review*, not current permission status. No live product Shell/B2/Managed Serena, no full package build or broad dist output.\
**Full portable Codex report:** [R3 Contracts/IPC design](../research/2026-10-14-solo-expert-b1b-r3-codex-design.md); ignored original `.serena/reports/solo-expert-b1b-r3-codex-design-20261014.md`. Codex finished job `advisor-codex-b1b-r3-contracts-20261014` without implementation or tests.\
**Prior independent review:** [B1b-R2 Gate A ACCEPT / Gate B NO-GO](2026-10-14-solo-expert-b1b-r2-advisor-review.md).\
**Approved exact mission, not yet implemented:** [R3 Code-only + exact four generated Contracts artifacts](2026-10-14-solo-expert-b1b-r3-serena-assignment.md), OWNER-AUTHORIZED; separate Serena Implementation dispatch remains next.

## 1. What was grounded independently

- Advisor independently reran **67/67** Gate A tests with exact installed Electron-as-Node ABI135 test host and exit 0, scoped lint on four changed paths exit 0, Domain/Application/Infrastructure TypeScript noEmit exit 0, validated four changed SHA-256 and five protected source SHA-256 plus compiled Contracts JS SHA-256 against closeout, and reproduced `unrecognized_keys(reviewDigest)` in actual `packages/contracts/dist/index.js`.
- Source **`packages/contracts/src/index.ts:245-249` still also has the original two-field strict ApprovalRespondInputSchema**, so compiling existing Source unmodified will NOT fix the gap. `packages/contracts/package.json` exports runtime `./dist/index.js`; protected `packages/desktop/electron/approval-ipc.ts` imports and validates with this actual schema. Its existing sender validation and forwarded parsed object can be kept if Source + built runtime schema are genuinely updated. Protected `preload.ts` already forwards the argument object.
- `packages/desktop/electron/approval-controller.ts` currently **drops the digest** before calling `approvalService.respond`; `ActivityPage.tsx` uses basic two-field response and lacks complete Solo risk projection. Merely adding a dist field is not proof of actual human Review. These Controller/Activity paths were already in original B1b source allowlist.
- Contracts `tsconfig.json` includes entire `src`; current `packages/contracts/src` has **3 .ts files** (`index.ts`, `trusted-supervisor.ts`, `trusted-task-grant.ts`), while `dist` currently contains **four index artifacts only**. Ordinary package build could produce up to **12 generated files**, violating a four-file artifact permission. Source-only / fake tests often alias packages to `src`, so cannot prove the installed runtime distribution.
- The **stale artifact problem is larger than Contracts**: built `packages/application/dist/approval-service.js` and `packages/infrastructure/dist/approval-repository.js` still expose/implement the old responder signature. **A Contracts-only build is a transport checkpoint, NOT evidence that live Desktop/Backend package graph or B2 is ready.** Do not silently rebuild additional packages or alter trusted OS state as a follow-on.

## 2. Recommended R3 scope after explicit Owner consent

**No extra source file is necessary by evidence so far:** reuse **exact same 23 B1b-R2 writable Source/Test paths** (including `contracts/src/index.ts`, Controller, Desktop Activity, Gateway, already-authorized tests). Add **ONLY four explicitly Owner-approved ignored generated outputs**:

```text
packages/contracts/dist/index.js
packages/contracts/dist/index.js.map
packages/contracts/dist/index.d.ts
packages/contracts/dist/index.d.ts.map
```

Additionally require **one uniquely owned disposable OS TEMP backup directory** for *bytes of only these four existing artifacts* and narrowly approved rollback, plus previously approved test-owned SQLite TEMP scope. No other dist, `tsbuildinfo`, package.json/tsconfig/lockfiles, no new tests outside 23 sources, no installed native .node modifications. Source compilation should target ONLY `packages/contracts/src/index.ts` with pinned local TypeScript 5.9.3 ES2022 Node16 options, declarations+maps, `noEmitOnError`, `incremental:false`, `composite:false`, exact rootDir/outDir and observed output inventory. Standard `pnpm --filter @sud-d/contracts build` is NOT permitted because it includes all 3 TS files and likely emits 12 artifacts. If single-root compile emits outside four files or cannot prove rollback, STOP.

**Order:** First SOURCE add optional strict SHA256-shaped display `reviewDigest` and strictly bounded optional Solo review DTO, legacy 2-key Basic Approval remains legal. Then backup+compile exactly 4 Contracts index artifacts. **Checkpoint 1 TRANSPORT:** independently import exact compiled `dist` and test nonsecret legacy, valid 64-hex digest, malformed digest, extra unknown key; simulate **existing unchanged real IPC registration** with a fake sender validator and fake controller while forcing exact runtime schema import, not Vitest's source alias. Verify Controller forwards the **displayed** digest and Desktop reviews the same persisted snapshot. Wrong/stale/digestless Solo must stay fail-closed while Basic Approval preserves compatibility.

**Checkpoint 2 FULL B1b SOURCE/FAKE INTEGRATION:** real shared Gateway coordinator/HMAC, consumed user-sourced Approval through persisted SQLite, claimed/UNKNOWN fence, Workspace generation/Resume and default-OFF tool registration with fake ready-only managed Serena. Full End-to-end tests, including actual source/compiled-entry parity and dependent dist staleness caveat; if genuine runtime install/source attestation or cross-process HMAC/ownership remains missing, label **BLOCKED**, do not promote to B2. Missing ability to show exact risk or to Deny stale/corrupt review should be documented as a bounded UX/security architectural gate, not patched with a digest bypass.

**Security contract:** Display review SHA256 is an integrity binder, NOT Gateway HMAC. Host may log args/results/errors, OS Windows-user ambient filesystem/network powers persist, timeout does not kill descendants; A1 protected independent consent remains PAUSED/BLOCKED. No source/tests ever prove live process isolation. No physical managed Serena command, provider/network spend, OS policy, Native/TGNK or B2 authority.

## 3. Explicit unresolved design edges

1. *Deny on malformed/stale review:* Current Production ApprovalService/SQLite repository require matching digest for Solo on **both** Approve and Deny, while original B1b UX requirement says Deny should remain possible. Codex recommends valid current display digest on both actions, and says stale/corrupt denial recovery needs separate Owner/Advisor contract choice rather than a silent bypass.
2. *Source-to-dist parity of other packages:* Even a fully passing Contracts compiled schema and controller source fake test cannot attest runtime Application/Infrastructure dist loaded by actual Desktop. A later distinct **whole package-graph deterministic build/provisioning scope** may be needed before physical B2. Do not smuggle this into R3 by broadening ignored `dist` folders.
3. *Artifact durability:* Contracts dist is ignored; this narrow local build is not a checked-in, multi-machine release protocol. Record exact build inputs, artifact hashes and reproducible release requirement.
4. *True managed Serenity runtime integrity:* B1a `synthetic-fixture` ready-only session is not actual installed-byte attestation; keep Default OFF and STOP when the cross-process runtime cannot be independently proven safe.

## 4. Milestones and actors

| Checkpoint | Truth |
| --- | --- |
| B0 / B1a private work | accepted before R2 |
| B1b-R2 Gate A | **accepted**, 67/67 independent |
| B1b-R2 Gate B | **NO-GO accepted**; actual compiled Contracts rejects digest |
| R3 Codex read-only design / Advisor review | **COMPLETE — accepted with conditions** |
| R3 code-only 23-source + four generated Contracts index artifacts | **PROPOSED / NOT OWNER AUTHORIZED / NOT DISPATCHED** |
| Full B1b product admission/RTC parity | **NOT ACCEPTED** |
| B2 real product Terminal command | **NOT AUTHORIZED / NOT EXECUTED** |
| A1 separately protected Owner Consent | **PAUSED/BLOCKED** |

**NEXT (after subsequent Owner approval on 2026-10-14):** Advisor forwards the binding R3 prompt to **SEPARATE Serena Home New Implementation**. Serena never calls Codex/other agents/Remote Commander/Team and returns one ignored R3 Closeout. Advisor independently reviews and updates repo. No Commit/Push.
