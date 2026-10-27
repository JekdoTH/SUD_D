# Serena-First A/B Risk Model — ChatGPT Advisor Decision Review

**Date:** 2026-10-14\
**Review result:** **ACCEPT WITH CONDITIONS — CODEX DESIGN ONLY.** **OWNER ADDENDUM 2026-10-14:** Product Owner subsequently **SELECTED OPTION B / Solo Expert** and approved the bounded **B0 CODE-ONLY** work. Owner is also willing to permit a future **narrow real terminal smoke** if it speeds delivery; this is not a validated invocation grant or activation of product shell. Current binding [B0 Serena assignment](2026-10-14-serena-first-b0-serena-assignment.md) was subsequently **IMPLEMENTED AS PRIVATE MOCK ONLY and independently ACCEPTED WITH CONDITIONS**: [B0 Advisor acceptance](2026-10-14-serena-first-b0-advisor-acceptance.md). Historical statements below that B is only recommended are superseded by this addendum. B1/B2 and broad machine/provider/secret/network privileges have NOT been approved by this addendum.\
**Portable complete Codex report:** [A/B design](../research/2026-10-14-serena-first-a-b-codex-design.md), original ignored CLI report `.serena/reports/serena-first-solo-risk-model-codex-design-20261014.md`.\
**Previous evidence:** [C2a-P0 Advisor accepted NO-GO](2026-10-14-serena-first-c2a-p0-advisor-review.md), [C1R independent acceptance](2026-10-14-serena-first-c1r-advisor-acceptance.md).

## 1. Outcome and source-aligned findings

The Codex job `advisor-codex-serena-risk-model-compare-20261014` finished and a final CLI report was generated; Advisor read the complete report and spot-checked source facts: managed Serena manifest `packages/infrastructure/src/serena-engine-manifest.ts` includes `execute_shell_command` among 22 expected tools, while `packages/infrastructure/src/serena-managed-runtime.ts` implements only limited `semanticRead/semanticWrite` mappings. `packages/application/src/serena-permission-bridge.ts` is **fake-only**, and `packages/application/src/approval-service.ts` has mode-dependent auto-approval gates which a new sensitive Solo Expert capability must exclude explicitly. SUD-D Tool Kernel/Policy/Approval/Audit must remain the genuine entry barrier. Managed Serena 1.7.0 does NOT provide the separate external Serena_Home_New process manager's `process_start/status/logs/stop` interfaces.

Stock Serena upstream still logs tool parameters, results, exceptions/tracebacks to local file/memory/stderr paths; source-level telemetry can make a metadata HTTP request unless disabled (not proof of command/output exfiltration). The shell uses `Popen(shell=True)` / `communicate()`; this does not confer safe Windows job ownership, background process cancellation or hard child-workspace/network confinement. Both A and B need new cross-process admission/UI proof before any live shell invocation. User's click cannot undo logs/commands already emitted or stop descendants without lifecycle support.

**A — privacy-first pinned upstream adaptation:** appropriate only when upstream payload logging must be prevented before it happens. Installed Serena 1.7.0 has no proven stable adaptation under the previously approved C2a-P0 allowlist; a repo-owned reviewed launcher/overlay/version pin and protected runtime/provisioner changes require new security design, tests and authorization. A is not a free security proof or OS sandbox.

**B — opt-in stock Serena Solo Expert cooperative consent:** closer to Product Owner's original Serena-first/user-selected permission design and likely the minimum incremental engineering path, provided all residual privacy/host-user risks are truthfully disclosed. **No proof of B ready in production exists**. B still requires a new controlled registry/approval admission seam, immutable manual grant projection and persistence, safe typed result, audited real cross-process wiring, plus separately authorized short physical smoke. No upstream local secret redaction may be claimed. Keep default Restricted and existing direct Policy DENY unchanged. Informed opt-in does not authorize broadly dangerous or secret-bearing access in the initial scope.

External Serena_Home_New can be a separate pragmatic workflow option, but its tool capabilities do not prove in-product SUD-D permission mediation or the managed Serena pin's process lifecycle.

## 2. Accepted staged Fast Closure for B — only after Owner selects B

| Stage | What it would prove | Authority/status |
| --- | --- | --- |
| B0 — inert CODE-ONLY | One private registry + manual per-call reviewed snapshots + fake transport and typed shell result parsing; two fixed test descriptors, no live launch | **PROPOSED; NOT YET OWNER APPROVED** |
| B1 — production CODE-ONLY | Backend-generated safe projection in actual Approval UI, consumed user decision, trusted device/Workspace/session/runtime binding, Resume/Policy/Audit, default OFF | **PROPOSED; SCOPE WILL FOLLOW B0 EVIDENCE** |
| B2 — narrow physical smoke | Owner-approved short nonsecret terminating command via managed Serena and audited one-use decision | **NOT AUTHORIZED** |
| B3 — real development workspace | Pinned reviewed script `typecheck`/focused tests in selected Workspace, no install/provider | **NOT AUTHORIZED** |
| B4 — long-job extension | Own live status/logs/stop semantics or explicitly external shared service protocol; no false cleanup guarantee | **NOT DESIGNED/PROVEN FOR USE** |
| B5 — new TGNK workflow → verified Final MP4 | Real fresh project/human/provider gates, artifact provenance, QC and Owner creative review | **NOT STARTED** |

The full Codex report proposes a **three-path B0 source/test allowlist** (new `packages/application/src/solo-expert-serena-bridge.ts`, `packages/tests/src/solo-expert-serena-bridge.test.ts`, `packages/infrastructure/src/solo-expert-serena-adapter.ts`) and one ignored Closeout, with RED→GREEN and focused checks. Advisor accepts this as a **future scoped assignment proposal**, not automatic authority. B1 will need additional protected UI/Approval/DB/Gateway/runtime paths and must be reviewed separately; do not silently expand B0 to include them. Estimated days-to-real-MP4 cannot responsibly be determined from this design; conditional simpler-than-A does not equal a guaranteed schedule.

## 3. Mandatory conditions before advancing

1. **Explicit Owner risk-model decision:** Option B must be deliberately selected for a Solo Expert *cooperative host-user* mode and its local Serena file/memory/stderr logging, ambient Windows-account subprocess/network access, non-guaranteed descendant stop, and user-selected narrow Workspace scope understood. This is **not approval for any real process**.
2. **First B0 CODE-ONLY mission authorization:** after choosing B, Owner separately authorizes bounded inert implementation (may be in one message choosing B and approving B0 if clearly explicit). No activation, tool passthrough, startup, TGNK, provider, native, OS privilege or process smoke.
3. **Manual per-call first**; request origin, stable trusted root/runtime/profile/fingerprint, immutable review and consumed user decision; `full_access` cannot silently auto-approve. Unknown risk/tool/schema/parameter drift or audit failure denies. Attempt uncertainty must not be retried as if safe. No direct arbitrary shell string sent by renderer.
4. **Keep restricted direct Policy DENY**; caller cannot override external/internal root, network, secrets, destructive/admin/provider, long-running script via a consent checkbox on first slice. Ambient OS-user power of the approved root command must be disclosed, not represented as a hard sandbox.
5. **Preserve A1 Option A protected independent Owner Consent** checkpoint as separate PAUSED/BLOCKED security goal. An SUD-D same-user opt-in is not A1 assurance.

## 4. What to do in a new conversation

**Current truth:** Codex A/B analysis DONE; Advisor design ACCEPTED WITH CONDITIONS; Option B is Advisor's recommended next Product Owner choice, **NOT CHOSEN/APPROVED BY OWNER YET**. C1/C1R already independently accepted as inert, C2a-P0 accepted as a valid source NO-GO. No B0 code has been implemented; no real Serena shell, provider/network or TGNK launch performed. Current Git branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299` and staged 0 as last checked. Unrelated dirty working files remain; preserving them is mandatory.

**Next actor: Product Owner** — decide Option A privacy-first adaptation or Option B Solo Expert. **Advisor recommendation B**, with explicit bounded cooperative-consent acceptance, then one separate Serena B0 CODE-ONLY mission following the fully documented technical contract in the Codex report section 7. If Owner picks A, prepare a distinct pinned source-level privacy design; do not launch B0. Physical execution needs a later exact Owner risk packet and consent in either branch.

**Process management lesson:** Within one active Advisor response, poll Codex until final report or a meaningful time/resource limit and complete Advisor review in that same turn when possible. Once a ChatGPT response finishes, it cannot passively continue polling without an explicitly scheduled automation/new event. Do not tell Owner to re-prompt just because a readily-pollable job is still running within the current active response.

**Repo knowledge path:** `SUD_D_HANDOFF.md` top = active status; `SUD_D_ROADMAP.md` active product direction; this review = A/B decision/evidence; linked Codex report = design detail. Changes are local working tree only; no stage/commit/push.
