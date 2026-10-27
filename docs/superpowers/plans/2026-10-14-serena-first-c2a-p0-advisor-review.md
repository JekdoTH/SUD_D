# Serena-First C2a-P0 — Independent Advisor NO-GO Review

**Date:** 2026-10-14\
**Verdict:** **ACCEPT AS CORRECT, BOUNDED NO-GO / SOURCE-FEASIBILITY STOP**. This is a valid completion of the approved C2a-P0 assignment, **NOT** acceptance of a privacy-safe adapter or any executable capability.\
**Serena source report:** `.serena/reports/serena-first-c2a-p0-privacy-code-only-closeout-20261014.md` (ignored/local-only).\
**Binding scope:** [C2a-P0 assignment](2026-10-14-serena-first-c2a-p0-serena-assignment.md). **Previous design:** [C2 Codex research](../research/2026-10-14-serena-first-c2-codex-readiness.md) and [C2 review](2026-10-14-serena-first-c2-advisor-review.md).

## 1. Independent acceptance evidence

- I read the entire Serena closeout and confirmed the task's Phase-0 STOP provision: source-only feasibility failed **before** any implementation/TDD was permitted. Zero adapter/test files is the correct bounded outcome, **not** a delivery of working code.
- Independently inspected installed, pinned Serena 1.7.0 source lines under the locally provisioned Serena package (read-only, no server invocation). `serena/mcp.py:97-101` invokes `tool.apply_ex(log_call=True, catch_exceptions=False)`; `serena/tools/tools_base.py:269-279,399-417` includes raw argument/result/error log and usage-stat paths; `serena/cli.py:338-353` installs memory, stderr and file handlers; `serena/util/exception.py:43-50` emits exception text and traceback; `mcp/server/fastmcp/tools/base.py:99-117` wraps exception text into ToolError. This means masking data only in downstream SUD-D responses does **not** establish that source log sinks are safe.
- `serena/agent.py:722-737` has conditional HTTP usage reporting; its shown payload includes OS/dashboard/version/backend/context, **not a proven command/output exfiltration**. Startup/telemetry and effective environment require separate evidence. `serena/util/shell.py:28-42` uses `subprocess.Popen(shell=True)` and `communicate()`, not a proven owned process-job lifecycle.
- Independently computed and compared SHA-256 for `serena/mcp.py`, `serena/tools/tools_base.py`, `serena/cli.py`, `serena/agent.py`, and `serena/util/shell.py`; **all five matched** Serena's closeout. Independently recomputed three relevant protected repo hashes: `serena-managed-runtime.ts` `caecdf8e...`, `serena-managed-config.ts` `187fa166...`, C1 `serena-permission-bridge.ts` `1fdae579...` — matched reported values.
- Checked Git: `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, 38 tracked-modified and 217 untracked (255 entries) **before Advisor docs edits**, staged 0. Confirmed four C2a-P0 source/test files **do not exist**. Serena reports identical before/after ordered porcelain fingerprint `24f40554bbcfbfe62b1402c8ae3ce856f541c40c`; Advisor independently verified the current counts and paths, not the historical fingerprint's underlying raw bytes. `git diff --check` PASS / exit 0 (unrelated line-ending warnings).
- No C2a-P0 Vitest, Python unittest, ESLint or TypeScript was run after source STOP. **Do not claim a test PASS.** The four prior global TypeScript errors belong to the earlier C1R checkpoint; they were not freshly rerun for this NO-GO.

**Exact claim boundary:** The reviewed stock path is unsafe to certify for the C2a requirement **under this write allowlist**. A carefully modified/version-pinned upstream integration might be feasible; no claim that future Serena use is impossible or that a privacy leak occurred in a real execution. No private logs, credentials or runtime sessions were read here.

## 2. Product direction / meaningful options

The Owner-approved product requirement remains: **Serena should be the hand that uses Workspace tools; SUD-D should ask the user to choose authority, disclose risk honestly and enforce only guarantees it can substantiate**. TGNK is the first external pilot; no hardwiring of video into SUD-D. The A1 independent protected-consent track remains PAUSED/BLOCKED and distinct.

**Option A — Privacy-preserving upstream Serena adaptation (higher engineering cost):** Design a pinned, source-reviewable Serena launcher/factory/overlay with privacy before upstream sinks, safe startup/error transport, command/tool-semantic identity, and strict default-off Gateway/Approval integration; no change to installed vendor package in place. This likely expands protected runtime/provisioning/source scope, requires new code-only acceptance and later physical smoke. Its security evidence must be earned; a private hook or logging monkeypatch is not automatically a stable or safe solution.

**Option B — Explicit Solo Expert / cooperative host-user risk acceptance (likely faster, different guarantees):** Owner may choose to knowingly accept Serena's existing upstream local argument/result/error logs and host-user shell risks for a bounded, user-chosen Workspace/tool/session, subject to truthful disclosure, manual per-invocation or bounded grant, expiry, revocation, safe Audit/approval and a documented secret/network/provider exposure envelope. User consent **cannot** by itself prevent source logging, OS child behavior or data exposure. This option changes the C2a source-privacy acceptance contract and needs a separate explicit Owner security/product decision **before** implementation or physical testing; it is not a stealth relaxation or an A1 security proof.

**Alternative outside SUD-D:** using the separately connected Serena Home New may immediately offer process tools, but **is not the same thing** as proving SUD-D's managed Serena has those tools or SUD-D-mediated permissions. Do not declare direct connector operations an SUD-D MVP acceptance.

**Advisor recommendation:** Avoid another speculative NO-GO implementation wave. First request a **single Codex DESIGN-ONLY architecture delta** comparing A vs B against the Owner's original Serena-first, user-controlled permission intent, including realistic scope, source logging trade-offs, user-facing risk language, minimum versioned code changes and quick Solo MVP path. **This review does not authorize Codex dispatch, new protected-file edits, live shell/process, telemetry, provider, TGNK, or A1 changes.** Owner chooses the desired risk model first.

## 3. Status and continuation gate

| Milestone | State |
| --- | --- |
| C1 / C1R private inert review | **ACCEPTED WITH CONDITIONS**, earlier 21/21 scoped tests |
| C2 Codex privacy/readiness design | **DONE / CONDITIONAL, LIVE NO-GO** |
| C2a-P0 Serena source feasibility | **DONE AS BOUNDED NO-GO, independently accepted**; no code/tests |
| C2a-P0 privacy-safe integration | **BLOCKED under current allowlist** |
| C2a approval/UI remainder | **HOLD**, must re-scope after Owner risk-model decision |
| C2b physical short smoke | **NOT AUTHORIZED** |
| C3 owned long-running process control | **NOT PROVEN** |
| C4 fresh TGNK workflow → verified Final MP4 | **NOT STARTED** |
| A1 protected independently verifiable Owner Consent | **PAUSED / BLOCKED** |

**Next actor: Product Owner + ChatGPT Project Advisor**. Decide whether to design privacy-preserving Serena upstream adaptation, opt-in risk-accepted Solo Expert Mode, or compare both via one constrained Codex design-only delta. A fresh bounded Serena implementation dispatch can occur only after accepted design and explicit Owner approval. Preserve STOP at the current sensitive boundary; do not rerun C2a-P0 or proceed to C2b.
