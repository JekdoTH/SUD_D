# SOLO-EXPERT-B1b-G2a — Inert MCP Gateway, DB-Generation Resume, One-use Fake Approval

**Prepared:** 2026-10-15 by ChatGPT Project Advisor. **STATUS: PREPARED / OWNER EXACT 8-PATH SOURCE-EDIT APPROVAL PENDING / SERENA NOT DISPATCHED.** This is an implementation binding proposal, not an authority to edit code until the Product Owner approves exactly the 8 paths and test-only side effects below.\
**Previous milestone:** [R3 Advisor Acceptance](2026-10-15-solo-expert-b1b-r3-advisor-acceptance.md) — Gate 0 Contracts compiled/pass, Gate 1 Desktop source/fake/pass with limitation, Gate 2 source/fake partial HARD STOP, 75/75 focused. Preserve all R3 work.\
**Design support:** [Advisor G2a design decision](2026-10-15-solo-expert-b1b-g2a-advisor-review.md), [full portable G2 Codex read-only design](../research/2026-10-15-solo-expert-b1b-g2-codex-design.md).\
**Product aim:** first one-use real reviewed Terminal via SUD-D in **separately authorized B2**, not under this task. **Maximum G2a verdict:** SOURCE/FAKE MCP-GATEWAY ACCEPTED; LIVE MANAGED SERENA NOT_READY.

## 1. Exact writable allowlist: 4 source + 4 test = 8 paths

| Type | Exact path | Intended bounded edit |
| --- | --- | --- |
| EXISTING SOURCE | `packages/application/src/index.ts` | export already accepted private Solo integration without exposing an arbitrary shell |
| EXISTING SOURCE | `packages/application/src/work-resume-guard.ts` | add Solo-specific fail-closed Work Resume using trusted DB generation; missing active Workspace/reader/Resume, DB errors → blocked and audited |
| EXISTING SOURCE | `packages/infrastructure/src/index.ts` | export existing SQLite Solo Attempt Repository only as needed for fake composition |
| EXISTING SOURCE | `packages/mcp-gateway/src/workspace-file-server.ts` | register Solo only with an **explicit test-composition fake dependency**; default product factory OFF; bind MCP session/Kernel/Coordinator/Resume/ledger to same trusted Workspace |
| EXISTING TEST | `packages/tests/src/solo-expert-serena-gateway.test.ts` | real `createProductionMcpServer` through **in-memory MCP transport**, default tool-list/unknown-call, fake opt-in review→human decision→immutable retry, negative cases |
| EXISTING TEST | `packages/tests/src/solo-expert-serena-runtime.test.ts` | no start/repair/connect/provision/callTool/semantic fallback on list, denied, pending, invalid, missing Resume |
| EXISTING TEST | `packages/tests/src/solo-expert-serena-persistence.test.ts` | real in-memory and unique TEMP-file SQLite claimed/UNKNOWN and controlled distinct-test-process reopen/decision evidence |
| NEW TEST | `packages/tests/src/solo-expert-serena-resume.test.ts` | generation away→back same clock, wrong/new Session, missing/multiple Workspace, DB error, restart, audit-on-denial |

**Generated Source/Build Outputs: ZERO.** No `dist`, `tsbuildinfo`, lockfile, package/build config, replacement of R3 Contracts artifacts, Desktop/UI source, Gateway metadata, provisioning/managed-runtime edits. Do not change `packages/application/src/solo-expert-serena-integration.ts`, `packages/application/src/work-memory-service.ts`, Domain/Approval/DB migration/Policy/ToolKernel source, installed Serena, `node_modules`, A1/Native/TGNK. If any non-allowlisted path is actually necessary, **HARD STOP** and report the exact requested delta. No stage/commit/push/reset/clean.

**Other narrowly authorized outputs, contingent on Owner approval:** ONE new ignored closeout `.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md`, ONE uniquely task-owned OS TEMP directory only for synthetic/nonsecret disposable SQLite database, WAL/SHM and bounded fixed decision/restart harness artifacts. Development-test host may use already-installed Electron 36.9.5 `ELECTRON_RUN_AS_NODE=1` for ABI135 `better-sqlite3` tests and bounded child test processes for this synthetic TEMP SQLite proof. Those testing processes do **not** authorize any SUD-D product or managed Serena child process, native job, package installer, remote provider or network access. Never open Product DB or mutate user's Workspace files.

## 2. Separate actor/bootstrap/continuity

**Serena Home New Implementation in a separate Owner-started chat ONLY.** Confirm active project `SUD_D` and canonical repo. Read complete `AGENTS.md`, `SUD_D_ADVISOR.md`, active checkpoint at tops of `SUD_D_HANDOFF.md`, `SUD_D_ROADMAP.md`, this entire assignment and linked R3 acceptance/Codex G2 read-only design. Run Skill Router Gate; load canonical TDD, codebase-design, writing-for-agents and any other triggered skills (diagnosing-bugs on unexpected failure). **No Desktop/UI work in this allowlist.** Preserve preexisting dirty/untracked files, exact branch/HEAD and staged 0; snapshot pre-change source/protected hashes and serialized Git inventory.

**Agent isolation:** Serena must NOT call Codex CLI/`codex exec`, Codex MCP/agent/subagent/delegate, Remote Desktop Commander, Team Mode or external paid/network agent. Advisor design has already been completed by Codex independently. Do not launch production Desktop/Gateway/Managed Serena, call real terminal, native runner, TGNK, provider, network, paid model, Windows Policy/admin, install/rebuild or Git writes. No use of SUD_D_Home Work Resume connector as an implicit product-approval substitute.

## 3. ONE LONG BOUNDED MISSION: ordered RED→GREEN gates, Code-only

**Gate A — actual MCP factory default-OFF and test-only opt-in:**
- With test-owned dependencies/SQLite only, exercise **real source `createProductionMcpServer` and MCP tools/list/tools/call using an in-memory MCP transport**. No `createDefaultProductionMcpServer` startup or Product DB. Assert baseline no `solo_expert.smoke` tool, unregistered invoke cannot reach fake/managed runtime; no environment, user-parameter or renderer-controlled ON switch.
- Test-specific trusted composition opt-in may inject **synthetic** Solo dependencies tied to the same `dependencies.approval` coordinator object actually passed to ToolKernel. Do not instantiate second/alternate HMAC coordinator. Session identity must be the bound MCP session created once inside factory, not a caller-supplied session.
- Strict first input `{}` and exact retry `{attemptId:UUID}`; deny arbitrary command/tool/cwd/argv/env, caller-supplied device/account/approved/resumed/workspace/epoch and unknown keys. Return safe state/IDs only, no raw tool output, HMAC or credentials.
- First call prepares exactly one immutable reviewed grant and returns Approval-required through Kernel. Retry uses **the original frozen attempt/review object** from existing integration, not a deserialized/caller-created replacement. Retrying before human approval must never invoke the fake tool.

**Gate B — true DB-owned Workspace generation Resume:**
- Reuse `WorkspaceRepository.getGeneration`, `WorkMemoryService.requireResumedSolo` from approved R1/R2 source; inject actual repository's generation reader into WorkMemoryService in the fake production factory. Add Solo-specific fail-closed guard to `work-resume-guard.ts`; no Workspace/no single active Workspace/no generation/DB exception/no Resume/invalid session → deny and bounded Audit, never generic fallback to Kernel.
- Test selection A→B→A with frozen timestamps, lost/restarted session and DB reopen, generation stale after every state transition, re-enrollment same root. Use trusted repo canonical root/Workspace generation, not regex or user-supplied flags. Protected InternalRoot/workspace policy unchanged.
- Preserve `full_access` Solo manual-only Approval and all three mode negative tests.

**Gate C — same-coordinator manual Consent, claimed/UNKNOWN and no-execution:**
- Real existing ApprovalService, repository, HMAC/Kernel Policy, SQLite claimed/unknown ledger and synthetic frozen ready-only fake adapter. Verify exact displayed `reviewDigest`, `decisionSource:'user'`, `consumed`, HMAC equality, session/runtime/workspace/generation/epoch + TTL (up to 90 seconds), no autoapproval, no second dispatch.
- Test denied, pending, expiry, wrong/missing/stale digest, key/Workspace/session/runtime/epoch drift, simultaneous calls, pre-execution Audit failure, outcome Audit failure, fake timeout/poison response, post-claim uncertainty, restart/new process and unresolved UNKNOWN/claimed fence. Never reset UNKNOWN or automatically reconcile orphaned approvals into another dispatch.
- **No product execution** on tool list, validation, deny, pending, rejected retry; never touch runtime `start`/`repair`/`semanticRead`/`semanticWrite`, provisioner, real Serena `callTool`, network or OS process. The eventual admitted outcome remains `executionKind:'mock'` via injected test fake **one time only**. Distinguish test-owned process pair and fake Desktop human decision from actual owner clicking installed Desktop.
- Prepared orphan state may remain blocked; report it rather than invent cleanup rights.

**Gate D — complete focused verification and STOP:**
- Run previous R3 six source/fake suites (75 known cases) plus new G2a gateway/Resume/cross-process tests via existing safe test hosts; confirm **reporter zero failures AND exit code 0**. No package build, root-wide monorepo tests or product-starting npm scripts.
- Scoped ESLint for the eight paths; Domain/Application/Infrastructure/MCP-Gateway relevant noEmit tsc and isolated focused TypeScript if installed tooling allows **without writing any dist**. If stale compiled declaration conflicts require dist regeneration, STOP and report precise missing scope. `git diff --check` and hash checks; preserve old Closeouts/R3 compiled Contracts bytes.
- Max **3 focused repairs per diagnosed root cause** inside the exact eight paths. One Closeout only. Not a reason to stop early merely because real Serena attestation remains unavailable; that is an expected G2a **LIVE NOT_READY** qualifier, not permission to disguise it as passing.

## 4. Mandatory Closeout and hard STOP

Create `.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md` (new ignored report, no overwrite of R3/R2/R1). Include Gate A/B/C/D findings, 75 baseline tests + new test counts, RED→GREEN, reporter and reliable process exits, real test-only SQLite separate-process restart evidence and fake decision scope, strict MCP default-OFF and input rejection, HMAC/user-consumed/UNKNOWN and no-product-start proofs, Source/Protected hashes, Git status filtered preservation, any prebuilt dist or Owner permission blocker.

Include exact literal truth: `G2a SOURCE/FAKE ONLY; LIVE MANAGED SERENA NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.`

STOP after success or any true Hard STOP. Return **one Closeout** to Product Owner and ChatGPT Project Advisor for independent review. Advisor then scopes G2b compile/package graph with enumerated artifact authority, separately from B2 actual user-reviewed command. This assignment does **not** authorize any real command `echo SUD_D_B1_OK` through SUD-D, external Serena tool, production Gateway/Renderer or installed runtime.
