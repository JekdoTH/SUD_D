# SUD_D SOLO MVP — Real Managed Serena Production Readiness/Registration: One Narrow Codex Design (QUEUED / NOT RUN)

**LATEST EXPLICIT OWNER OVERRIDE (2026-10-16):** Owner requests immediate Codex execution and changes model effort to Medium. Attempt one native Codex design job now; if Codex reports account rate limit, FAIL CLOSED and report without repeated retries. This authorizes only Codex READ-ONLY design, NOT B2, Native, product app execution, or any source write.

**Actor (now, owner-approved):** Codex CLI Native, `gpt-6.1-sol`, **medium** reasoning effort, `--ephemeral -s read-only`; ONE design report; never invoke Serena CLI/MCP/agents, subagents, Team Mode or Remote Desktop Commander. Do not run tests/compile/product/runtime, write Source, call Native, network/provider, credentials, Git or any Windows policy. The host Advisor reviews result and sends separately bounded Serena implementation assignment.

## Product priority

Solo user wants SUD-D **working**. Stop another compiler/copy/static-analyzer loop. Latest Source and Native-free G2b static compile accepted (512/512); actual Desktop Source input snapshot accepted [Advisor review](docs/superpowers/plans/2026-10-16-solo-expert-g2b-desktop-source-fileid-repair-advisor-final-acceptance.md), 199 original inputs + config/recipe/inventory in fresh `$env:TEMP\sudd-latest-desktop-owner-build-20261015-02`. App NOT_BUILT and NOT_RUN; Owner tests later. Canonical `dist` is hardlinked to old Desktop/release and shall remain untouched.

**Actual missing feature:** `packages/mcp-gateway/src/stdio-entry.ts` calls `createDefaultProductionMcpServer`, which in `workspace-file-server.ts` already calls extracted G2b `createProductionMcpServer`. But `workspace-file-server-core.ts` constructs Solo only from `dependencies.soloExpertFake` (trusted test composition), conditionally adds `solo_expert.smoke`. Production passes no fake. `packages/infrastructure/src/serena-managed-runtime.ts` `inspectSoloExpertReadyOnly` uses `soloExpertFixture` with synthetic-fixture receipt, NOT an actual active managed session. Thus running newly built Desktop would NOT make Live Solo work. Need real-session provenance/identity, Ready-only port and guarded tool registration without unsafe implicit execution.

## Exact question to solve

Recommend one **minimal source-only production composition and trust-boundary design** allowing a real connected **already authenticated/authorized managed Serena session** to expose a safe Solo Expert ready/inspect interface, while keeping untrusted identity, stale session/Workspace generations, revocation and policy fail-closed. Never auto-start/install/connect/provision/repair during a read-only readiness query. The real Review→manual Approval→single-use Execution→Audit/Recovery path remains existing ToolKernel Policy/Approval. No synthetic manifest/receipt can be used as evidence of real session.

Look specifically at:
- `packages/infrastructure/src/serena-managed-runtime.ts`: `ActiveSession`, `start()/stop()`, `inspectSoloExpertReadyOnly()`, `callSoloExpertReadyOnly()`, manifest schema, process supervisor, `validatedToolNames`.
- `packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts` fixed tool mapping, rejection paths.
- `packages/application/src/solo-expert-serena-integration.ts` B1a ports, approval ledger, identity, one-shot semantic contract.
- `packages/mcp-gateway/src/workspace-file-server-core.ts`, `workspace-file-server.ts`, `stdio-entry.ts` production composition.
- `packages/infrastructure/src/serena-engine-manifest.ts`, related workspace generation/revocation/approval tests when essential.
- Current `AGENTS.md`, `SUD_D_ADVISOR.md`, TOP handoff, [accepted latest Source workspace](docs/superpowers/plans/2026-10-16-solo-expert-g2b-desktop-source-fileid-repair-advisor-final-acceptance.md).

## Deliverable: <=1,500 words, ONE vertical slice

1. Provide exact minimal trusted contract between production managed session, gateway, ToolKernel; derive real `managedEpoch`, process/session/workspace identity and manifest/tool schema digest from **observed live session**, not caller-provided claims. If no existing attestation or ownership proof is sufficient, recommend explicit **fail-closed NOT_READY** and specify the small missing seam before attempting registration.
2. Name **minimal existing source paths** to change plus focused security/negative tests (no blanket source refactor). Separate real read-only READY check from actual privileged Native/B2 execution; warn of any implicit privilege escalation. Prevent `soloExpertFake`/synthetic `solo_expert.smoke` from leaking to production.
3. Define outcome gates `CODE_ONLY_REAL_SESSION_WIRING_STATICALLY_VERIFIED` vs `PHYSICAL_MANAGED_SESSION_NOT_RUN`, then **future owner-approved offline isolated Desktop native build and personal test**. Avoid 'ready' based only on unobserved process PID or arbitrary version string. Keep approval/Audit/Recovery semantics.
4. Give ONE exact proposed bounded Serena Implementation Assignment scope and STOP condition, no broad Windows/Native OS research unless unavoidable. If actual production live approval/deployment requires Owner consent before even writing code, explain the exact gate.

**Output only via outer report:** `.serena/reports/solo-expert-g2b-live-solo-production-wiring-codex-design.md`, one ignored local report, no edits by Codex. Advisor must explicitly accept design before Serena is dispatched.

**Hard prohibitions:** No production fake, no real Terminal/B2, no Native/Managed Serena or product process launch, no network/provider, no release/signing/Native Electron rebuild, no changes to old hardlinked `dist`, `dist-release`, real user profile or credentials.
