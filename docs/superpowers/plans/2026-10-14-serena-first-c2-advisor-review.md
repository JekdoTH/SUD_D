# Serena-First C2 — ChatGPT Advisor Review and Readiness Decision

**Date:** 2026-10-14\
**Scope:** Review of completed Codex READ-ONLY C2 Design/Spec/Risk/Readiness.\
**Disposition:** **DESIGN ACCEPTED WITH CONDITIONS; CURRENT LIVE ACTIVATION = NO-GO.** **Owner and result update (2026-10-14):** C2a-P0 Code-only was approved, run as source inspection and independently [CLOSED AS NO-GO](2026-10-14-serena-first-c2a-p0-advisor-review.md); later C2a integration scope now requires a new Owner risk-model decision. C2b physical smoke remains separately BLOCKED.\
**Portable full Codex evidence:** [C2 Codex design report](../research/2026-10-14-serena-first-c2-codex-readiness.md) (local absolute path prefixes redacted; 487-line original).\
**Previous independent checkpoint:** [C1R independent acceptance](2026-10-14-serena-first-c1r-advisor-acceptance.md).

## Decision for the Owner

- **DONE:** Codex C2 design investigation and Advisor source-aligned review. C1/C1R remains accepted as **private/inert only** (21/21 independently rerun focused tests; scoped TS/ESLint PASS; project global typecheck four outside-C1 errors).
- **NOT READY:** enabling Serena `execute_shell_command` inside production SUD-D, enabling generic Expert Mode or approving TGNK real render. The current managed Serena 1.7.0 is not yet a safe, permission-mediated, long-running Workspace execution service.
- **Recommended next:** one Owner-authorized **code-only C2a** mission, explicitly staged with **privacy feasibility first**. No physical process/tool is authorized by this review. Future **C2b** requires a separate immutable device/Workspace/command risk packet and express Owner approval.
- **Product contract remains unchanged:** ChatGPT plans, Serena uses Workspace tools, SUD-D handles trusted identity/Policy/explicit User Approval/Audit. TGNK remains external; a **new** full workflow → attributable Final MP4 is the eventual acceptance. Historical imported-audio resume remains deferred. A1 Option A genuine independently verifiable Owner Consent remains BLOCKED and separate.

## Findings accepted from source (no runtime claim)

1. **Serena logging/privacy is the primary hard blocker.** The installed 1.7.0 MCP wrapper invokes tool logging; upstream code logs arguments and result/error/traceback and creates file, memory, and stderr sinks. Redacting raw strings after SUD-D receives the MCP response is too late. A privacy-safe managed adapter requires source-level contract/fakes and verified suppression of sensitive **upstream** sinks before any live shell; no stored secret values were inspected.
2. **Startup/egress remains unproven.** Current managed launch does not explicitly disable usage reporting; installed implementation has a usage-reporting path and selectable token estimators. Existing config disables GUI/trace/dashboard but that is NOT sufficient proof of no other downloads, logs or network activity. Effective environment after SDK merge, LSP startup and stderr drain need scrutiny. Codex did not execute startup, so these remain unknown in practice.
3. **Permission integration is missing.** Production MCP has no C1/C2 command registration; Resume guard uses a literal capability whitelist; C1's private WeakSet and fake dispatcher cannot cross the actual Desktop/Gateway process boundary as durable authority. The current Approval record/card doesn't expose the complete immutable executable, Workspace, Windows-account scope and risk projection. A new sensitive capability must require consumed **user-sourced** manual Approval even in `full_access`; missing review/drift must deny.
4. **Stock Serena shell is not short-job supervision.** It uses `Popen(shell=True)` plus `communicate()` and timeout/cancellation does not prove child exit, handle closure, or cleanup. For a fixed short smoke, Codex proposes a **version-pinned narrow managed adapter** with a fixed `cmd.exe /d /s /c echo SUD_D_C2_OK` recipe and **shell=false** semantics. This is an adapted command path, **not** proof that unrestricted stock Serena Shell runs safely. Consent must accurately display the adaptation, startup envelope and residual host-user access. No first-run shell test is yet authorized.
5. **Goal versus first proof:** C2b could prove **one** harmless, short, permission-mediated invocation. It would not establish arbitrary Serena tool access, durable Job lifecycle, GPU/FFmpeg/TGNK production, provider spending, or MP4 QC. C3 must choose reuse of Serena-supported Job API if verifiable, otherwise the smallest owned supervision seam from existing Runner design; no duplicate Kernel/Approval/Audit.

These are source/code-path findings, not fresh physical validation. No C2 code was written, no tests/build/install were run, and no privilege/network/Secret was granted.

## Architecture / Fast-Closure conditions on Codex proposal

**Accept** the C2a/C2b split, reviewed fixed command identity, exact one-use human Approval, source-level logging privacy, fail-closed drift/replay/audit handling and the no-relaunch-when-UNKNOWN rule. **Do not automatically approve the entire C2a proposed write allowlist**: it spans Infrastructure, Application, Domain, Contracts, Gateway, Database, Desktop and tests. That may be justified for real cross-process review UI, but is too broad to treat as a trivial C1 continuation without explicit scope and preservation review.

The recommended implementation sequence—if Owner approves code-only work—is:

1. **C2a-P0 privacy/launch contract:** independently establish whether managed Serena 1.7.0 can be safely adapted without mutating installed packages or silently replacing Serena with a separate execution engine; prove upstream log/error/effective-env/startup/egress behavior with pure synthetic fakes. If upstream factories lack a supported stable adaptation seam or secret-free source behavior cannot be proven, **STOP** and return an architecture delta to Advisor/Codex. No live integration.
2. **C2a admission and review UI:** only after P0 source checks pass, implement minimum cross-process immutable review, exact manual-only Approval, Resume/Policy/Audit, one-use durable attempt and safe result projection, default-disabled, with focused tests. Scope any schema/migration/UI modifications explicitly to avoid touching unrelated A1/Runner work. If changes require protected files or exceed reviewed write allowlist, STOP for new authorization.
3. **C2aR independent review:** Advisor checks full changed-path diff, source hashes, RED/GREEN, test evidence including current four non-C2 TypeScript diagnostics, privacy negative tests and absence of side effects. No production live command enabled.
4. **C2b separate Owner decision:** frozen exact device, Windows account, SUD-D-owned synthetic Workspace, fixed command/artifact hashes, expected startup writes and network, TTL/retry0, bounded observation, cleanup/quarantine/rollback. Only then a later physical test; explicit approval for the actual invocation is still required. No friend's device/workspace/provider.

**No silent role substitution:** a fixed SUD-D direct-process adapter may be a fallback if genuine Serena upstream cannot meet privacy/ownership conditions, but would NOT establish the Owner requirement to reuse Serena as execution hand. Surface that as a separate Owner architecture choice—not a disguised success.

## Verification and evidence boundaries

- Codex process `advisor-codex-serena-first-c2-readiness-20261014`: ended (`running:false`); design report was generated and its contents inspected by Advisor.
- Current Git at report generation: `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged 0, 252 preexisting Git-visible changed/untracked entries prior to these new docs. This design/review does not modify product source.
- C1R 21/21 and scoped static PASS are **historical independently verified C1R evidence**; Codex C2 did **not** rerun tests or make physical claims.
- Global `tsconfig.check.json` remains **FAIL** on four out-of-scope test diagnostics at last C1R review. Do not count overall project TypeScript as PASS.
- C2a estimated roughly **2–4 working days** only if upstream privacy adaptation and cross-process projection can be proven with existing APIs; C2b roughly **0.5–1 day** after explicit risk consent. C3 ownership/lifecycle and C4 TGNK Final MP4 remain unestimated.
- No Git stage, commit, reset, clean, push, real shell/server/TGNK/provider activity is authorized by the design review.

## Status / new-chat bootstrap

| Milestone | Status |
| --- | --- |
| Serena-first Owner direction | **APPROVED** |
| C1/C1R inert permission bridge | **ACCEPTED WITH CONDITIONS** |
| C2 Codex DESIGN/READINESS | **DONE — REVIEWED / CONDITIONAL NO-GO LIVE** |
| C2a-P0 privacy feasibility CODE-ONLY | **COMPLETED AS SOURCE NO-GO; ADVISOR ACCEPTED STOP** ([C2a-P0 review](2026-10-14-serena-first-c2a-p0-advisor-review.md)) |
| C2a remainder: admission / UI CODE-ONLY | **HOLD — OWNER PRIVACY/RISK-MODEL CHOICE REQUIRED** |
| C2b managed Serena harmless physical smoke | **HOLD — explicit future Owner consent required** |
| C3 owned long-running lifecycle | **NOT PROVEN / NOT STARTED** |
| C4 new TGNK project → verified Final MP4 | **NOT STARTED** |
| A1 independent Owner trust anchor | **PAUSED / BLOCKED** |

**Next actor (final update 2026-10-14):** [C2a-P0 was completed as an accepted bounded source NO-GO](2026-10-14-serena-first-c2a-p0-advisor-review.md), not a privacy adapter PASS. Product Owner chooses whether to investigate a pinned upstream privacy adaptation or an explicitly risk-accepted Solo Expert mode. An optional single Codex DESIGN-ONLY comparison may precede that decision. Do not rerun C2a-P0, start C2b, or enable production/physical execution.

For future conversations: read `AGENTS.md`, `SUD_D_ADVISOR.md`, current top `SUD_D_HANDOFF.md`, the Serena-first C1 plan, this C2 review and its linked full Codex design. Preserve the source-of-truth distinction: approved design ≠ implemented capability ≠ physical proof.
