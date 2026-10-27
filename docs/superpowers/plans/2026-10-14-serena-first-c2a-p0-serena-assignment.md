# SUD-D SERENA-FIRST C2a-P0 — Privacy Feasibility and Narrow Managed-Serena Adapter (CODE-ONLY)

**Date / Owner decision:** 2026-10-14. Owner approved progressing C2a **CODE-ONLY**, never physical activation. **Advisor-bounded dispatch:** this assignment covers **C2a-P0 privacy feasibility and an inert fixed adaptation contract ONLY**, not the entire broad C2a proposal. **Status update (2026-10-14): COMPLETED AS SOURCE-FEASIBILITY NO-GO / STOP; DO NOT REDISPATCH.** [Independent Advisor review](2026-10-14-serena-first-c2a-p0-advisor-review.md). The historical binding assignment below is retained as the authority for the completed STOP, not as instructions to resume.

**Why narrow:** The independently reviewed Codex C2 design identifies Serena 1.7.0 upstream argument/result/traceback logging, startup telemetry/effective environment, and stock `Popen(shell=True)` non-owned lifetime. Building a production Gateway / DB / Approval UI before proving a viable privacy-safe managed-Serena adaptation would risk a large, unusable duplicate system. Complete or responsibly NO-GO this P0 first; the later C2a admission/review integration can then receive its own exact scope. Do **not** replace managed Serena with an independent executor while calling it Serena.

## 1. Mandatory project bootstrap / actors

**Recipient:** Serena Implementation — SUD-D Home New in its SEPARATE conversation (not the ChatGPT Project Advisor conversation).

1. Activate and confirm project `SUD_D`. Read `AGENTS.md`, `SUD_D_ADVISOR.md`, the active tops of `SUD_D_HANDOFF.md` and `SUD_D_ROADMAP.md`, `SUD_D_CONTEXT.md`, this COMPLETE assignment, [C2 Advisor review](2026-10-14-serena-first-c2-advisor-review.md), [full source-grounded Codex report](../research/2026-10-14-serena-first-c2-codex-readiness.md) **sections C/D/F**, and [C1/C1R](2026-10-14-serena-first-c1r-advisor-acceptance.md). Older A1/Runner checkpoints are references only.
2. Before substantive work complete the `AGENTS.md` Skill Router Gate. Load canonical `.agents/skills/tdd/SKILL.md`, `.agents/skills/codebase-design/SKILL.md` and `.agents/skills/writing-for-agents/SKILL.md` when applicable; `domain-modeling` only if the terminology/security state machine changes; `diagnosing-bugs` only if an unexpected failure arises. No UI files are in scope.
3. Record baseline branch, HEAD, status (tracked/untracked separately), staged 0, existing source hashes of protected managed-runtime/manifest/C1/kernel/approval/gateway and paths that might be relevant. Many dirty files predate this task; **preserve all**. STOP if any NEW allowlist path is already present. Use install-free read-only code inspection of pinned managed Serena 1.7.0 source **only**; no raw logs, accounts, `.env`, credentials or runtime private state inspection.
4. **Role isolation (mandatory): Serena NEVER invokes Codex CLI, `codex`, `codex exec`, Codex MCP/agent/services or an agent/subagent/delegate that invokes Codex. NEVER Remote Desktop Commander, Team Planner or Team Mode.** Architectural questions return to ChatGPT Project Advisor. The Advisor and Codex jobs do not act as this implementation agent.

## 2. Goal and pre-agreed seams

Produce a **small, code-only, fail-closed candidate** proving whether a locally installed, version-pinned Serena can be **adapted at its actual upstream tool boundary** to avoid payload logging/error echo and unwanted startup egress, while retaining Serena as the tool implementation. Put strictly inert test-only mapping behind a **fixed, synthetic, non-secret recipe**, with no public/published capability and no live callable workflow.

**Public test seams are pre-agreed by this Owner-approved scope:**

- Python in-process source-level launcher/privacy-adapter construction against **fake** Serena factories, tool decorators, logger sinks, errors and child-process ports; without real MCP/Serena agent/server startup or real process launch.
- TypeScript in-process managed adapter admission/shape/environment projection against **fake** upstream definitions and merged-environment fixtures; no real `ManagedSerenaMcpSession` construction, install or network.
- Negative privacy contract: distinct synthetic poison markers for args, output, exception, traceback, MCP ToolError, file/memory/stderr and bootstrap paths, and verify **zero exposure to each sink**. Avoid printing markers in test output; test sinks in memory only.
- Behavior classification: prove only what the test fixture/source can support, and mark upstream real runtime / SDK merge / OS Process / network as **UNVERIFIED** until separate physical proof.

## 3. Exact writable allowlist (no other source or documentation edits)

**Four NEW paths; all must be absent at task start:**

1. `packages/infrastructure/src/serena-c2-adapter.ts`
   - Pure/private fixed-invocation contract and versioned upstream tool/schema/adapter fingerprints; no public `callTool`, no production export/registration, no default live runner or OS launch.
2. `packages/infrastructure/src/serena-c2-launcher.py`
   - Import-safe, side-effect-free **testable** construction/adapter function only. Must not bootstrap managed Serena on import or use upstream CLI that establishes raw payload log handlers. A Python/Python-Serena seam can be declared private, but must call actual Serena factory/tool implementation in a verifiable way when it is later integrated. If this is not feasible without monkeypatching unsafe global logging or changing installed Serena, report NO-GO and STOP rather than writing a misleading shim.
3. `packages/tests/src/serena-c2-privacy.test.ts`
   - Focused pure TypeScript tests for fixed recipe, schema/pin drift, merged effective-env fixture, denial of caller overrides, safe output DTO, no implicit live startup.
4. `packages/tests/src/serena_c2_launcher_test.py`
   - Pure Python unittest: faked upstream wrapper/loggers/error transport/startup/egress/child-process. No real Popen, shell, network or file LogHandler creation. Do not simulate away a source privacy gap while declaring production safe.

**One ignored Closeout, created once only:**

`.serena/reports/serena-first-c2a-p0-privacy-code-only-closeout-20261014.md`

**Immutable/protected:** all pre-existing files including `packages/infrastructure/src/serena-managed-runtime.ts`, `serena-managed-config.ts`, `serena-engine-provisioner.ts`, manifest/pins, C1 sources/tests, Kernel, Policy, Approval, Resume guard, Gateway, domain/contracts/database/migrations, Desktop/UI, native/A1/Runner; all package metadata/lockfiles, generated runtime and installed Python/Serena, authoritative context/roadmap/handoff/docs and unrelated dirty work. Ordinary existing **tool cache changes only if unavoidable and safely identified**; do not mutate OS/runtime home.

**If the privacy seam cannot be implemented within these FOUR paths, STOP with a precise source:line, minimum additional path/permission proposal and next Codex/Advisor decision—do not enlarge scope on your own.** There is deliberately no allowance to wire production UI, approval or Gateway yet.

## 4. Implementation sequence — one Long Bounded mission

**Phase 0 — Verify source-grounded feasibility (READ-ONLY).**

Inspect pinned installed Serena 1.7.0 and relevant SDK source **without starting it**, checking at least: `serena/mcp.py` (tool registration and `log_call`), `tools/tools_base.py` (input/outcome/error logging), `serena/cli.py` (startup handlers), `agent.py` (usage reporting), `analytics.py` (estimator/possible external calls), `serena/util/shell.py` + `cmd_tools.py` (shell behavior), and MCP stdio default env. Record version/identities and exact relevant source lines, but **no raw credential/log inspection**. Explicit question: can the **actual upstream tool** be safely wrapped/adapted before any raw argument/output/error reaches any logging sink, without editing installed Serena or creating an unrelated process runner? Source-only evidence may reject feasibility without code writes.

**Phase 1 — Privacy-first TDD, RED→GREEN if feasible.**

- Build the smallest fake-driven RED test at an existing upstream-call-adapter seam; GREEN with minimal implementation. Repeat vertical slices for args, returned output, exception+traceback, ToolError serialization and synthetic stderr/file/memory/early startup paths.
- Demonstrate source-safe behavior **before** upstream logger sees the payload. Filtering only after `callTool` returns is insufficient. No global mutable monkeypatch of all apps' logging as proof of safety; no silent use of upstream CLI that unconditionally installs file/memory/stderr payload handlers.
- Startup plan: pin `SERENA_USAGE_REPORTING=false`, local `CHAR_COUNT` estimator, gui/dashboard/trace disabled; prove explicit fake constructor receives those settings and lacks install/download/repair call paths. Determine effective env after a simulated SDK default merge (case-insensitive Windows names, system allowances, secret/PROVIDER variable rejection). **Do not claim real SDK/environment behavior has been observed.**
- Fixed synthetic command contract only (e.g. `SUD_D_C2_OK` echo marker) with no caller `command`, `toolName`, executable, `argv`, `cwd`, `env`, shell flags, side effects, secrets or provider parameters. Reject object prototypes, Symbol/accessor/extras and schema/version/recipe drift. Do not call a shell or create a process. This is *not* a general Serena terminal capability, approval/production admission or safe long-job Supervisor.
- Preserve non-secret reviewed adapter fingerprint and useful safe result metadata, without exposing raw stdout/stderr/traceback or upstream error text.

**Phase 2 — Scope and sufficiency decision.**

If all P0 tests pass **and the source-grounded seam is real**: deliver code-only **C2a-P0 candidate**, explain exact future integration path through managed Serena (not SUD-D's separate executor), enumerate what remains unproven before approval of later C2a admission/UI and C2b physical. If there is any **P0-PRIVACY source leak that cannot be sealed in this allowlist**, or upstream factory/private hook drift, mark **NO-GO**, retain only defensible evidence, and STOP. Do not pivot into building a fake demonstration that bypasses the original logging problem.

No intermediate Owner review after routine RED/GREEN. Maximum **three targeted repair cycles per diagnosed cause** in the allowlist. One Closeout then STOP whether PASS or NO-GO.

## 5. Required negative evidence and verification

**Acceptance/negative cases (must be real tests or explicitly report unproven):**

- Existing Serena wrapper emits potential raw args, results or exception: prove wrapper is not reached with such raw data, or unsafe path fails closed; never classify test-only mocks as installed upstream proof.
- Fake file/memory/stderr and MCP error sinks receive zero poison; startup/validation/transport errors return safe codes. Show both positive nonsecret and negative path.
- Simulated SDK-merged env cannot supply usage/reporting/credentials/API keys; allowance for OS env does not imply actual filesystem/network isolation.
- Version/schema/adapter pin mismatch, missing local estimator, invocation/param override, unexpected output or malformed fake response → rejection and zero fake calls.
- No calls on import; no Python `Popen`, subprocess shell, file logger, real Serena server, provider egress or native/physical process from the code-under-test; developer test runners only.
- No production tool registration/default activation, no modified protected files, no use of old A1/NATIVE proofs as consent.
- Document limits accurately: source/logging P0 design feasibility ≠ live privacy, SDK merge, process ownership, end-to-end approval, durable audit, physical Windows cleanup or Final MP4 proof.

**Permitted install-free verification (check local command availability first):**

```powershell
pnpm exec vitest run packages/tests/src/serena-c2-privacy.test.ts --reporter=dot
pnpm exec eslint packages/infrastructure/src/serena-c2-adapter.ts packages/tests/src/serena-c2-privacy.test.ts --max-warnings 0
pnpm exec tsc --project packages/infrastructure/tsconfig.json --noEmit --incremental false
pnpm exec tsc --project tsconfig.check.json --noEmit --incremental false
git diff --check
```

Pure Python `unittest` **only when already-installed approved interpreter is locatable** and tests are verified not to import/launch live Serena; do not install, resolve through network or start a product server. If no safe Python interpreter, record test UNVERIFIED rather than pretending PASS. `tsconfig.check.json` had **four historic out-of-scope TypeScript errors** at C1R; separate task-start/final diagnostics from introduced problems. An affected-file typecheck cannot be considered conclusive if scope changes force a protected project repair.

**Safety:** no `pnpm install`, build/package/dev/Electron, root-wide test suite, managed server startup, subprocess/native/job/physical test, TGNK machine, credentials/secrets/.env, provider/network/usage cost, Windows policy, Team mode, git stage/commit/push/reset/clean. Test commands are developer checks; code-under-test must remain inert.

## 6. Closeout, STOP, and next actor

Create **one** Closeout at the ignored path above. Include:

- Verdict **C2a-P0 CODE-ONLY CANDIDATE PASS / CONDITIONAL / NO-GO** with source:line of actual Serena 1.7.0 seam and whether upstream argument/results/exception can be prevented from entering logging **before** the sink;
- source/read-only installed identity, privacy/egress/SDK merged-env risks and unproven assertions;
- exact new files and SHA-256, task-start vs final Git branch/HEAD/status/staged; preservation proof and limitations;
- TDD RED→GREEN evidence, commands/exit/test totals, Python checks and task-start vs end TypeScript errors (including the four known unrelated);
- any remaining blocker that requires changing protected runtime, package, database, UI or production composition; **no unsupported claims about live secrecy**;
- precise proposal for remaining code-only C2a cross-process manual Approval/Resume/Audit with minimum file list **without implementing it here**;
- the literal line: **"mock/source-only; no production shell, physical process, TGNK Final MP4, or A1 Owner authority."**

**STOP at source feasibility gap OR after code-only P0 proof.** The Product Owner returns the Closeout path to the ChatGPT Project Advisor; the Advisor independently reviews and records status in `SUD_D_HANDOFF.md` and this plan. The remaining C2a production admission/UI is **not part of this dispatched scope**; its code-only direction is approved but needs a new precisely reviewed bounded dispatch after C2a-P0 evidence. C2b physical trial/Expert Mode/managed production shell remains **NOT AUTHORIZED**.
