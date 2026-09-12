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

## Diagnostic evidence

### Local production composition / acceptance — PASS

A read-only/diagnostic inspection on the Home PC confirmed the built production gateway registers exactly 26 tools. The compiled list includes `work.resume`, `work.checkpoint`, and exactly four Team tools: `team.start`, `team.status`, `team.stop`, `team.submit`.

The existing gated Home-PC Team Mode production acceptance was then run with `SUD_D_TEAM_MODE_ACCEPTANCE=1` against the current local repo. Result: **1/1 PASS**. That acceptance performs MCP `tools/list`, requires the exact approved 26-tool list, verifies exactly four `team.*` tools, verifies pre-resume Team calls fail with `WORK_RESUME_REQUIRED`, then successfully calls `work.resume` and continues the production Team flow.

The running tunnel was also observed healthy/ready against the current SUD-D gateway, with successful control-plane polling. Together with the successful ChatGPT action refresh recovery, this closes the Team/Work Memory availability blocker without a SUD-D implementation change.

## Current dogfood state

- DGF-001: OPEN — visible terminal on Connect.
- DGF-002: OPEN — stale `Waiting for ChatGPT` UI state after real MCP use.
- DGF-003: RESOLVED OPERATIONALLY — refresh ChatGPT actions, then use a fresh chat.
- DGF-004: RESOLVED OPERATIONALLY — refresh ChatGPT actions, then use a fresh chat.
- Team/Work Memory entrypoints are callable again through SUD-D HOME.

## Next dogfood step

1. Close/disable Remote Desktop Commander before resuming the workload so evidence remains SUD-D-only.
2. Keep SUD-D HOME connected.
3. Continue in the fresh ChatGPT session that successfully completed `work.resume` and `team.status`.
4. Start the real Team Mode dogfood workload through SUD-D only.
5. If any SUD-D capability is missing or disabled again, stop and record the blocker rather than falling back to an external host-control tool.
