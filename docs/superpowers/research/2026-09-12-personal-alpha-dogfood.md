# Personal Alpha Dogfood — 2026-09-12

Status: ACTIVE OBSERVATION LOG — findings only; no fixes are authorized by this document.

Purpose: capture durable evidence from first real SUD-D Personal Alpha / Team Mode dogfooding without turning `SUD_D_HANDOFF.md` into a transcript. Root causes remain unconfirmed until separately diagnosed.

## Testing boundary

- Use SUD-D capabilities only for the dogfood workload.
- Do not substitute Remote/Desktop Commander or another external host-control tool when SUD-D is unavailable; stop and record the blocker instead.
- A finding is not an implementation authorization.

## Observed findings

### DGF-001 — Connect launches a visible terminal window

Observed: pressing Connect opens a dev/runtime terminal window that remains visible while the connection runs.

Expected direction: the required runtime/tunnel process should run in the background for normal product use; a visible terminal should not be required for the standard UX.

Current impact: UX friction; connection can still operate while the terminal remains open.

Status: OPEN / previously known; reconfirmed during dogfood.

### DGF-002 — `Waiting for ChatGPT` remains after a successful MCP call

Observed: SUD-D Desktop continues to display `Waiting for ChatGPT` after ChatGPT successfully reaches the SUD-D MCP surface. A read-only `workspace.stat` call reached SUD-D and returned `WORK_RESUME_REQUIRED`, proving the MCP request path was live while the Desktop status remained waiting.

Expected direction: connection presentation should reflect real client activity/connection evidence rather than remain stale when a real MCP client call has succeeded.

Current impact: misleading connection status; does not by itself prove the MCP transport is broken.

Status: OPEN / previously known; reconfirmed during dogfood.

### DGF-003 — Team Mode tool becomes disabled in the ChatGPT session

Observed: after the SUD-D MCP path had already responded to a workspace tool, attempting `team.start` returned that the `SUD-D_HOME` tool had been disabled and should not be called again. The testing chat correctly stopped instead of using Remote Commander as a fallback.

Expected runtime contract: the closed Team Mode Personal Alpha MVP exposes four Team tools (`team.start`, `team.status`, `team.submit`, `team.stop`) within the 26-tool production MCP surface.

Current impact at discovery: BLOCKER for Team Mode dogfood in that ChatGPT session. Basic MCP reachability and Team Mode tool availability were different outcomes.

Resolution evidence: after refreshing the SUD-D HOME actions in ChatGPT and starting a fresh ChatGPT session, `work.resume` succeeded and `team.status` succeeded with no active Team mission (`value: null`). No SUD-D code change was required.

Root-cause status: operationally isolated to a stale/incomplete ChatGPT host-visible action catalog or snapshot. The exact internal host caching mechanism is outside SUD-D and was not further diagnosed.

Status: RESOLVED OPERATIONALLY / action refresh + fresh ChatGPT session.

### DGF-004 — Fresh ChatGPT session does not expose `work.resume`

Observed: after reconnecting and using a fresh ChatGPT session for the SUD-D-only diagnostic, the host-visible SUD-D Home contract did not contain `work.resume`. The testing chat stopped before calling `team.status` or `team.start`, as instructed, and did not use Remote Commander or another external tool.

Expected runtime contract: the closed Work Memory / Automatic Resume MVP exposes `work.resume` and requires it before substantive project-scoped work in a fresh MCP session. The current production MCP contract is 26 tools, including Work Memory and the four Team tools.

Current impact at discovery: BLOCKER for normal fresh-session bootstrap and therefore for Team Mode dogfood.

Resolution evidence: refreshing SUD-D HOME actions in ChatGPT updated the host-visible contract. In a new ChatGPT session, `work.resume` succeeded, followed by successful `team.status` returning no active mission.

Root-cause status: operationally isolated to a stale/incomplete ChatGPT host-visible action catalog or snapshot rather than missing SUD-D registration.

Status: RESOLVED OPERATIONALLY / action refresh + fresh ChatGPT session.

### DGF-005 — Docs-only dogfood cannot complete required commit and repo-policy verification

Observed: the first real docs-only Team Mode workload started successfully, created Team mission `d0a8a299-4a74-4b7e-94a3-75bf6c558f76`, and stopped during the Planner phase before any file mutation because the current SUD-D HOME capability surface cannot satisfy the task's required completion gates.

Missing bounded capabilities for this task:

- no capability that can create the required Git commit,
- no action equivalent to `git diff --check`,
- no repo-policy secret-signature scan capability,
- `verify.run` is limited to `test`, `lint`, `typecheck`, and `build`.

Safety/control evidence: the mission honored the task STOP condition, did not mutate files, did not create an implementation plan, did not make runtime/source changes, did not produce a commit SHA, and did not fall back to Remote Commander/Desktop Commander or another external tool. Work checkpoint: `ad21ebcc-18e3-4c9e-b7fe-0fade6f06cc9`. Final mission state: `stopped`.

Interpretation: this is a Personal Alpha capability-coverage gap exposed by dogfood, not evidence that Team Mode state transitions themselves failed. Team Mode successfully started, entered Planner, detected an unsatisfied completion requirement, and stopped safely before side effects.

Impact at discovery: BLOCKER for any task whose required completion contract includes Git commit, exact diff whitespace validation, or repo-policy secret scanning through SUD-D only.

Implementation status (2026-09-13): APPROVED FIX IMPLEMENTED AND LOCALLY VERIFIED / SUD-D-only dogfood rerun pending. The bounded surface now adds `git.commit` and extends `verify.run` with `diff_check` and `secret_scan`; production MCP now exposes 27 tools while Team remains exactly four tools. The fix keeps Git/process behavior fixed-purpose and workspace-bound and does not add arbitrary shell, executable, argv, cwd, or env control. Final local verification: full suite 501 passed / 5 skipped, lint/typecheck/build PASS, `git diff --check` PASS, and built bounded diff/secret verification PASS with zero findings.

## Diagnostic evidence

### Local production composition / acceptance — PASS

A read-only/diagnostic inspection on the primary validation device confirmed the built production gateway registers exactly 26 tools. The compiled list includes `work.resume`, `work.checkpoint`, and exactly four Team tools: `team.start`, `team.status`, `team.stop`, `team.submit`.

The existing gated primary validation device Team Mode production acceptance was then run with `SUD_D_TEAM_MODE_ACCEPTANCE=1` against the current local repo. Result: **1/1 PASS**. That acceptance performs MCP `tools/list`, requires the exact approved 26-tool list, verifies exactly four `team.*` tools, verifies pre-resume Team calls fail with `WORK_RESUME_REQUIRED`, then successfully calls `work.resume` and continues the production Team flow.

The running tunnel was also observed healthy/ready against the current SUD-D gateway, with successful control-plane polling. Together with the successful ChatGPT action refresh recovery, this closes the Team/Work Memory availability blocker without a SUD-D implementation change.

## Current dogfood state

- DGF-001: OPEN — visible terminal on Connect.
- DGF-002: OPEN — stale `Waiting for ChatGPT` UI state after real MCP use.
- DGF-003: RESOLVED OPERATIONALLY — refresh ChatGPT actions, then use a fresh chat.
- DGF-004: RESOLVED OPERATIONALLY — refresh ChatGPT actions, then use a fresh chat.
- DGF-005: FIX IMPLEMENTED / DOGFOOD RERUN PENDING — local production surface now provides bounded commit + diff check + repo-policy secret scan; real SUD-D-only acceptance remains the closure criterion.
- Team/Work Memory entrypoints are callable through SUD-D HOME, and Team Mode has demonstrated safe STOP-before-side-effect behavior on an unsupported completion contract.

## Next dogfood step

1. Restart/refresh SUD-D HOME actions so ChatGPT sees the 27-tool contract and six fixed verify actions.
2. Open a fresh ChatGPT session, call `work.resume`, and rerun the same docs-only Team Mode workload from a new mission.
3. Require real `Planner → Worker → Validator → Reviewer → completed` evidence plus the required commit/diff/secret verification through SUD-D only.
4. Keep Remote Commander/Desktop Commander disabled during that acceptance workload; external fallback would invalidate the dogfood proof.
5. Mark DGF-005 resolved only after the fresh SUD-D-only workload completes successfully.
