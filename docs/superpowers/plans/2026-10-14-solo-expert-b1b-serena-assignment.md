# SOLO-EXPERT-B1b — Code-only Production Permission, Persistence, Desktop Review and Default-OFF Gateway

**Date:** 2026-10-14. **LATEST STATUS ADDENDUM:** Serena was subsequently dispatched with Owner-approved B1b scope, but **STOPPED BEFORE SOURCE EDITS** at the Stage I Native SQLite ABI mismatch; ChatGPT Advisor independently [ACCEPTED THE NO-GO](2026-10-14-solo-expert-b1b-abi-nogo-advisor-review.md). **THIS ORIGINAL ASSIGNMENT IS A STOPPED HISTORICAL CONTRACT, NOT AN ACTIVE DISPATCH.** New Owner authorization is required for the proposed test-only Electron-as-Node R1 prerequisite and B1b re-entry. The original text below retains its source/test rules; no physical shell or product process has been authorized by the STOP.

**Authoritative source:** [B1a accepted source-only](2026-10-14-solo-expert-b1a-advisor-acceptance.md); [B1 Advisor analysis](2026-10-14-solo-expert-b1-advisor-review.md); [full Codex B1 design](../research/2026-10-14-solo-expert-b1-codex-design.md). This B1b assignment refines Codex's original additional-path proposal after direct Advisor inspection of current approval DB, Workspace mutation, Desktop controller/IPC, B1a contracts and Gateway. **Do not replay completed B0/B1a/C2a-P0.**

## 1. Target proof and non-goals

Build the **smallest source-grounded, code-only cross-process B1b integration candidate** for a SINGLE trusted `harmless-short-smoke / b1-smoke-v1` command identity, using B1a modules, stock managed Serena 1.7.0 as the eventual tool hand, and SUD-D's own Policy, Kernel, Approval, Audit, Workspace and Resume controls.

**Outcome at B1b acceptance:** A fake-enabled production-composition test shows the real Gateway/Approval/SQLite/renderer DTO pipeline performs exact informed **human** one-use authorization with a durable `prepared/claimed/closed/unknown/revoked` claim fence, source-owned command, validated Workspace and trusted runtime provenance, default-OFF production MCP registration and no shell/process; request schema and all known failure paths deny. No user-visible 'ready for unrestricted shell' claim.

**Explicitly OUT:** any execution of `echo SUD_D_B1_OK` or any actual shell; enabling Shell by default, initiating managed Serena startup/provision/repair on a Solo request, Native/OS process lifecycle or Windows-security-policy changes, provider/network/spend/secret, delete/admin, TGNK/render/Final MP4, arbitrary caller-defined command/cwd/env/argv, A1 independent Owner Consent or a general-purpose tool passthrough. This work is **B1b CODE-ONLY**, not B2.

## 2. Mandatory bootstrap / role and Skill Router

Recipient: **Serena Home New, separate Serena Implementation chat only.** Read AGENTS.md, SUD_D_ADVISOR.md, current tops of SUD_D_HANDOFF.md / SUD_D_ROADMAP.md, this whole contract, linked B1a accepted review and Codex B1 design. Before changing files perform the AGENTS.md mandatory Skill Router Gate and read canonical `.agents/skills/tdd/SKILL.md`, `.agents/skills/codebase-design/SKILL.md`, `.agents/skills/domain-modeling/SKILL.md`, `.agents/skills/writing-for-agents/SKILL.md`, and **`.agents/skills/impeccable/SKILL.md` for Desktop Approval UI**, following its scoped setup when permitted. Use diagnosing-bugs if unexpected failures; do not allow a UI workflow to override security gates or add unauthorized files.

Risk: **Security / Data Critical**. Capture branch/HEAD, exact Git porcelain fingerprint excluding this allowlist (many dirty files), staged count and protected hashes; no baseline overwrite. Confirm the sole NEW files below are absent before edit. If existing dirty files on allowlist have unrelated owner changes, preserve them; do not reset/reformat whole files.

**Agent isolation:** Serena NEVER invokes Codex CLI, `codex exec`, Codex MCP/agent, any delegate/subagent invoking Codex, Remote Desktop Commander, Team Planner or Team Mode. No further Codex design loop from Serena. Any architecture gap returns to ChatGPT Project Advisor.

## 3. EXACT WRITABLE ALLOWLIST — 22 source/test paths, nothing else

**Stage I — Durable consent/claim and Workspace generation (10 paths; complete this source/fake test gate before Stage II):**

| Change | Exact path | Authorized reason |
| --- | --- | --- |
| EXISTING | `packages/domain/src/approval.ts` | add strictly typed optional immutable **nonsecret** Solo review projection |
| EXISTING B1a | `packages/domain/src/solo-expert-serena.ts` | narrowly extend synthetic-only source contract for production-verified trusted provenance; do not weaken fakes/defaults |
| EXISTING | `packages/application/src/approval-service.ts` | exact Gateway-coordinator user-sourced consumed/manual HMAC verifier; explicit `solo_expert.smoke` no-mode-autoapproval even in full_access, TTL/digest validation |
| EXISTING | `packages/infrastructure/src/database.ts` | **append** new SQLite migration only; no rewrite old 001–012, durable attempt constraints, persisted projection/generation |
| EXISTING | `packages/infrastructure/src/approval-repository.ts` | create/read immutable reviewed projection bound to request/digest; preserve older Basic Approval |
| NEW | `packages/infrastructure/src/solo-expert-serena-attempt-repository.ts` | transactional unique/unresolved `prepared→claimed`, `closed/unknown/revoked`, restart/quarantine; no replay/cleanup erasure |
| EXISTING | `packages/infrastructure/src/workspace-repository.ts` | monotonically increment trusted generation on relevant enrolment/root/active selection/removal, including away-back within same timestamp; additive migration consistent with old API |
| EXISTING | `packages/application/src/work-memory-service.ts` | expose/recheck real per-session resumed Workspace generation, not caller `resumed:true` |
| NEW | `packages/tests/src/solo-expert-serena-approval.test.ts` | human-only Approval/HMAC/projection drift/TTL/mode denial and source safety |
| NEW | `packages/tests/src/solo-expert-serena-persistence.test.ts` | test-owned in-memory SQLite migrations, atomic claim uniqueness, crash/reopen-fence simulation, generation bump, cleanup failsafe |

**Stage II — default-OFF Gateway/renderer integration and B1a source parity (12 paths; begin only after Stage I focused evidence):**

| Change | Exact path | Authorized reason |
| --- | --- | --- |
| EXISTING B1a | `packages/application/src/solo-expert-serena-integration.ts` | inject real trustworthy verifier/ledger/resume/identity, not fake `synthetic-fixture`; outcome-audit success before close |
| EXISTING B1a | `packages/infrastructure/src/serena-managed-runtime.ts` | inspect real **already-ready** managed Serena session with source-derived integrity/epoch; no lazy provision/start; require verified manifest/schema/artifact or fail-closed NOT_READY |
| EXISTING | `packages/infrastructure/src/index.ts` | minimal type/adapter export needed by Gateway composition |
| EXISTING | `packages/application/src/index.ts` | minimal reviewed admission/guard export; no broad shell barrel |
| EXISTING | `packages/application/src/work-resume-guard.ts` | explicitly guard Solo capability and bind real Workspace session/generation |
| EXISTING | `packages/mcp-gateway/src/workspace-file-server.ts` | Gateway opt-in OFF-by-default MCP registration, same-coordinator Kernel/Approval/Audit, safe activation flag injected in fake tests; no hidden bypass |
| EXISTING | `packages/contracts/src/index.ts` | strict versioned Solo review DTO + decision `reviewDigest` so Desktop approves exactly displayed projection |
| EXISTING | `packages/desktop/electron/approval-controller.ts` | Desktop fetches persisted pending review and validates exact stored digest/source before user decision |
| EXISTING | `packages/desktop/electron/main.ts` | minimal repository/controller injection using existing safe IPC/same DB, never launches worker |
| EXISTING | `packages/desktop/src/pages/ActivityPage.tsx` | inline accessible detailed Solo Expert review (exact fixed command, Workspace, device/account provenance, logging/host access/children warning, expiry, one-use) + explicit Approve/Deny |
| NEW | `packages/tests/src/solo-expert-serena-gateway.test.ts` | fake Gateway + kernel/resume/approval/session/epoch, OFF default, no process/network/startup |
| NEW | `packages/tests/src/solo-expert-serena-desktop.test.ts` | strict DTO/controller/sender/approve-vs-digest/stale UI and safe projection tests |

**One ignored reporting output only:** `.serena/reports/solo-expert-b1b-code-only-closeout-20261014.md`. Do not modify HANDOFF/ROADMAP or other docs during Serena implementation; Advisor updates them on review.

**STRICT STOP outside 22 paths:** `packages/mcp-gateway/src/metadata.ts`, `packages/desktop/electron/approval-ipc.ts`, `packages/desktop/src/index.css`, `packages/infrastructure/src/serena-engine-manifest.ts`, `packages/desktop/electron/preload.ts`, `packages/contracts/src/global.d.ts`, `packages/application/src/tool-kernel.ts`, Policy/Runner/A1/native/provisioner/package.json/lockfiles/installed Serena, any migration tooling or new tests are **NOT** pre-authorized. These were conditional in the original Codex design; if needed, STOP with exact minimum delta before edits. No silent import/export recompilation or broad prettify.

## 4. Critical security/data rules (binding)

**Trust / runtime:** Input surface accepts only strict empty `{}` or existing fixed reviewed nonsecret profile enum (whichever existing B1a contract uses); no client/tool caller provided executable/command/cwd/env/approval/device/account/workspace/session. Gateway resolves canonical Workspace and historical generation **transactionally**, actual session Resume and owned runtime epoch. Compare full immutable digest after every await before claim/dispatch; if session/package/config/schema/artifact integrity unknown, **NOT_READY**, not 'verified' from a manifest hex/handshake value or user label. Restore stale claim as UNKNOWN after restart. Changing Workspace away and back must invalidate stale grant. No real runtime call in tests.

**Approval:** persist a bounded validated review snapshot (including literal fixed nonsecret command `echo SUD_D_B1_OK`, exact Workspace root/id, profile, effect, local file/memory/stderr logs, ambient Windows user filesystem/network permissions, descendants and no stop promise, expiry, observed/unverified device/account labels, display revision and digest). Do not persist raw tool output/error/credentials; UI must display complete command before approval. Approve sends `approvalRequestId`, action and **displayed reviewDigest only**. Backend compares it with its current persisted immutable projection using the **same Gateway coordinator runtime/HMAC**, status `consumed` and source `user`, expiry, request/session/runtime/Workspace equality; must explicitly reject `approve_for_me`/ `full_access` autoapproval. If actual HMAC material/runtime identity cannot be safely shared between Desktop/Gateway, or approver can swap review, **STOP**; never use a Desktop-only verifier as alternate authority.

**Persistence / attempt:** SQLite append-only migration with transactional conditional claim and uniqueness; at-most-once admission across Gateway instances/restarts. `claimed` can mean dispatched or pre-dispatch unknown; no automatic new attempt if ANY unresolved fence. Post-audit failure keeps UNKNOWN. Approval retention cleanup must never erase unresolved attempt/review evidence; no cascade-loss. Expired/denied/revoked only blocks future admission; cannot claim stopped OS children. Test stored review digest, restart/cleanup, fatal DB error and reconciliation.

**Gateway/Runtime:** production default OFF (not listed or callable); fake-enabled composition only in B1b tests. The real ready-session seam may expose only the fixed reviewed tool; no lazy `startInternal`, `ensureInstalled`, repair, install or network from any prepare/list/pending/deny path. B1a `integrity:synthetic-fixture` must **never** be passed as production attestation. If current installed-byte verification cannot be done inside 22 paths, keep real call disabled and mark **B1b CONDITIONAL/NOT_READY**, instead of a fake success. Do not auto-enable for B2 or tell the user Terminal is ready.

**UI:** Use current Activity Approvals surface; no new wizard. Show full nonsecret command, verified canonical root, capability, human-observed account/device provenance, local stock Serena log storage possibility, stdout/error metadata retention, process rights and descendant cleanup limitation, one-shot/expiry and immutable digest. Enable Approve only when current projection matches persisted digest, otherwise show unavailable/stale explanation; Deny remains possible. Sender validation and typed IPC must remain authoritative, never trust renderer-controlled command. No claims of hard containment or no network/secret access merely because the fixed echo recipe is benign.

**Privacy:** Option B accepts upstream Serena local raw logging as an explicitly disclosed risk, not cured. Startup `SERENA_USAGE_REPORTING=false` / CHAR_COUNT pins do not prove no external egress. Limit initial code-only proof to synthetic nonsecret content. No changing OS policy or reading log files/secrets.

**Package build/type debt:** B1a Application/Infrastructure used local structural mirrors because prebuilt `@sud-d/domain` declarations were stale. B1b may validate with install-free no-emit combined synthetic/isolated TS program. A source build that writes dist or metadata is NOT authorized by default; if unavoidable, STOP for a narrow artifact/build permission rather than silently building whole monorepo. Contract parity must have tests and be reported honestly.

## 5. Verification and bounded mission procedure

**One long bounded Serena mission with TWO INTERNAL CODE-ONLY gates. No new Owner message is needed between routine RED→GREEN steps while within the exact allowlist; nevertheless failure of an architectural or required security gate must STOP.**

**Stage I:** establish schema migration/backward compatibility and typed review + real user-sourced Approval + transactional attempt/generation with smallest RED→GREEN tests. Check approved/denied/expired/mode-source/wrong HMAC and manual-only with all existing modes; claim atomicity across repository instances; unique unresolved after restart/cleanup; Workspace selection away-back (same timestamp); corrupted/missing persisted projection, DB failure fail closed. If storage/Approval source cannot be safely implemented within Stage-I allowed paths, **STOP** before UI/Gateway work; no fake-only durability success.

**Stage II:** wire strictly default-OFF production Gateway with fake-enabled test construction, real non-bypass Work Resume and trusted Workspace/generation, real coordinator verification, managed Serena session ready-only port, and Desktop safe review using existing IPC. Test empty/invalid intent, off tool-list/off invoke; bounded review→user response→exact retry through existing Kernel, no pending-list wake or auto-dispatch; stale/missing/malformed UI/digest, invalid sender/IPC; session/epoch/config/schema/root drift, pre/post-audit failure, double submit/concurrency/UNKNOWN, no new attempt after crash and no rebind, poison response/error absent from DTO/audit. **No live Serena/Python/OS subprocess**. If actual `mcp-stdio` session cannot safely drive a true Desktop-reviewed one-use Approval through the existing DB/IPC boundary, **STOP / BLOCKED**, not a fake success. Preserve stable other tools and old migrations.

**Checks, install-free:** focused Vitest four new B1b test files and selected B1a regression suites; scoped ESLint on 22 paths; Domain/Application/Infrastructure/Contracts/Gateway/Desktop `tsc --noEmit --incremental false` where existing tsconfigs permit; optional isolated 22-path TypeScript compiler-root check including new tests; `git diff --check`. Root global `tsconfig.check.json` may still report 4 existing out-of-B1 diagnostics; compare exact codes/locations, do not claim global PASS. For SQLite, use **test-owned in-memory database only** if the existing locally installed dependency can be safely used under Code-only developer checks; never open/modify the real product DB, install or build native bindings. If native-addon use is disallowed by current project gates or unavailable, STOP/mark durability UNVERIFIED and request explicit test-only permission, do not silently fake the claim. UI visual assertions via safe component tests; do not launch Electron/Browser without separate approval.

**Repair budget:** max three focused repairs per diagnosed root cause within allowlist. Only one final Closeout, not a string of intermediate handoffs. Do not run root-wide suite/packaging, shell workloads, native/job/provisioner, remote provider/network, admin/OS policy, TGNK, Git stage/commit/push/reset/clean, Codex/agents/Remote Commander/Team Mode.

## 6. Mandatory single Closeout and STOP

Write one ignored `.serena/reports/solo-expert-b1b-code-only-closeout-20261014.md`, reporting **B1b CODE-ONLY PASS WITH CONDITIONS / PARTIAL BLOCKED / NO-GO**, precise changed-path SHA-256 and untouched critical hashes, task-start/final HEAD, staged, filtered dirty fingerprint; Stage I/II TDD RED→GREEN and focused commands/exits; in-memory SQLite evidence distinguished from actual crash/process; exact B1a parity and package-type limitations; fake approval/UI/Gateway evidence, any necessary **unapproved extra paths**; privacy/OS residual risks and separate frozen B2 owner-consent packet proposal. Include literal:

`B1b DEFAULT-OFF CODE-ONLY; NO REAL MANAGED SERENA SHELL, NO PHYSICAL PROCESS, NO TGNK FINAL MP4; A1 OWNER TRUST STILL BLOCKED.`

**STOP** after Closeout; return only to Product Owner / ChatGPT Project Advisor. Advisor independently reviews B1b as source-only, updates Repository, then prepares a distinct **B2 harmless physical smoke** packet. This B1b plan/Owner code-only authorization, if granted, does not authorize executing `echo SUD_D_B1_OK` or starting managed Serena just to make a test pass.
