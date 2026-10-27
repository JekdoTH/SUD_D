# Solo Expert B1 - Advisor Design Review and Staged Implementation Decision

**Date:** 2026-10-14. **Original design result:** CODEX B1 DESIGN ACCEPTED WITH CONDITIONS; SPLIT B1a/B1b. **LATEST VERIFIED ADDENDUM:** Serena B1a implemented exactly eight paths and the Advisor independently [ACCEPTED B1a WITH CONDITIONS](2026-10-14-solo-expert-b1a-advisor-acceptance.md): 57/57 focused tests, scoped lint and Domain/Application/Infrastructure tsc PASS, global 4 prior errors remain. Original statements below that B1a was awaiting authorization are historical; B1b and B2 are still not authorized/started.

**Full source-grounded Codex design:** [B1 research](../research/2026-10-14-solo-expert-b1-codex-design.md) (portable copy; ignored original at .serena/reports/solo-expert-b1-integration-codex-design-20261014.md). Job advisor-codex-solo-expert-b1-integration-20261014 completed read-only. **Prior:** [B0 independent acceptance](2026-10-14-serena-first-b0-advisor-acceptance.md): 50/50 focused PASS; PRIVATE MOCK ONLY. **Proposed B1a mission:** [eight-path Serena assignment](2026-10-14-solo-expert-b1a-serena-assignment.md), awaiting specific file-scope approval.

## Source-aligned decision

- Advisor independently read current Gateway registry/composition at packages/mcp-gateway/src/workspace-file-server.ts (capability registry around 343; default Gateway/managed runtime 378-395), private callTool/lazy start at packages/infrastructure/src/serena-managed-runtime.ts, mode eligibility at packages/application/src/approval-service.ts, explicit resume whitelist at packages/application/src/work-resume-guard.ts, stored Approval ledger, and the Desktop approval-controller.ts / ActivityPage.tsx title/resourceLabel-only generic UI.
- B0 WeakSet snapshot, same-process reservation, simulated 300-ms timeout and fake Approval are NOT persisted cross-process human consent or OS execution/cleanup controls. Merely injecting the live Serena callTool into B0 would be an unreviewed bypass.
- Codex demonstrates that full B1 likely affects ~27 source/test paths across Gateway, Kernel/Approval, Database, Desktop UI and managed Runtime. Accept source-only B1a first (eight exact paths); do NOT grant blanket 27-path authority.
- B1a builds typed domain contract, injected admission/exact-manual-verifier/claim-and-UNKNOWN ports, fixed safe mapper and ready-only Serena runtime + source-aligned env config, two fake-only suites. **B1a modifies three existing code files** including Managed Runtime/Config, previously protected: requires new explicit Owner acknowledgement. No product Gateway, Approval DB/UI, installed Serena, process or executable grant.
- B1b later requires a separately reviewed complete immutable review persistence and exactly one conditional dispatch ledger through SQLite; consumed human-only HMAC equality, Workspace generation-bound Resume, Desktop visible scope/risks/digest review, Gateway registry/capability OFF by default and fake full-path tests. No implicit B1b authority.
- B2 later may test fixed nonsecret proposed command echo SUD_D_B1_OK, but only after B1b source review, real consumed SUD-D per-call Approval and exact machine/runtime/Workspace/logging/startup/effect packet. External Serena Home New direct shell is not proof of SUD-D Gateway permissions.

## Required risk and evidence boundaries

1. Proposed max_answer_chars=2048 is an upstream serialized reply setting, NOT a memory/shell output bound. Proposed 5000-ms wait is response waiting deadline, not a stop guarantee. Stock Serena shell has uncontained descendants; UNKNOWN/failure means NO automatic retry.
2. Manifest wheel/schema/version declarations are not runtime installation attestation. MCP server handshake version need not equal the Serena package version. Unattested device/account labels do not confer OS authority.
3. Consumed Approval and actual dispatch are different; durable claimed state must not be closed as success until Kernel OUTCOME audit succeeds. Root, generation, session/runtime epoch, exact command/recipe/digest, privacy-risk disclosure, user-sourced manual approval and expiry are binding inputs.
4. Option B Owner-approved cooperative risk means stock Serena may log args/results/errors to local file/memory/stderr and shell acts as Windows user; NOT OS sandbox, guaranteed secrets protection or descendant stop. Default Restricted/Policy direct DENY, A1 independently verified consent PAUSED/BLOCKED. Secret/provider/network/spend/delete/admin/TGNK and long job remain separate unauthorized scopes.

## Status matrix

| Gate | Status |
| --- | --- |
| B0 inert Bridge | DONE - independently accepted, 50/50 |
| B1 Codex source design and Advisor review | DONE - accepted with conditions |
| B1a eight-path code-only source seam | PREPARED; awaiting exact Owner file-scope approval, NOT STARTED |
| B1b persisted Approval / UI / Gateway integration | DEFERRED until B1a, new allowlist approval |
| B2 one harmless real Terminal invocation | Owner willing in principle; NO COMMAND SPECIFIC APPROVAL |
| B3/B4/B5 and TGNK Final MP4 | NOT STARTED |
| A1 independent Owner consent | PAUSED / BLOCKED |

**Next actor:** Owner explicitly approves or declines the proposed B1a eight-file allowlist; then the Advisor provides the separate Serena Implementation prompt with binding assignment. Serena completes one bounded code-only TDD/fakes Closeout and STOP. Advisor independently checks and updates repo DONE only on evidence. Do not dispatch B1b, B2, Team/Planner or process startup without new exact scope. All current documentation changes remain local Working Repository, no commit/push.
