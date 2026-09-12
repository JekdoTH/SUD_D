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

Current impact: BLOCKER for Team Mode dogfood in that ChatGPT session. Basic MCP reachability and Team Mode tool availability are currently different outcomes.

Root cause: UNCONFIRMED. Candidate areas for later diagnosis include host-side tool/action exposure state, stale tool catalog/session state, or SUD-D runtime exposure/activation. Do not treat any candidate as established until reproduced with a tight SUD-D-only loop.

Status: OPEN / blocking current Team Mode dogfood.

### DGF-004 — Fresh ChatGPT session does not expose `work.resume`

Observed: after reconnecting and using a fresh ChatGPT session for the SUD-D-only diagnostic, the host-visible SUD-D Home contract did not contain `work.resume`. The testing chat stopped before calling `team.status` or `team.start`, as instructed, and did not use Remote Commander or another external tool.

Expected runtime contract: the closed Work Memory / Automatic Resume MVP exposes `work.resume` and requires it before substantive project-scoped work in a fresh MCP session. The current production MCP contract is 26 tools, including Work Memory and the four Team tools.

Current impact: BLOCKER for normal fresh-session bootstrap and therefore for Team Mode dogfood. This is stronger evidence than a single disabled Team action because the required Work Memory entrypoint itself is absent from the host-visible contract.

Root cause: UNCONFIRMED. The evidence is consistent with an incomplete/stale host-visible tool catalog or an exposure mismatch, but does not yet prove whether the fault is in ChatGPT host/action refresh, Secure Tunnel/session discovery, or the SUD-D runtime surface.

Status: OPEN / blocking current Personal Alpha dogfood.

## Diagnostic evidence

### Local production composition / acceptance — PASS

A read-only/diagnostic inspection on the Home PC confirmed the built production gateway registers exactly 26 tools. The compiled list includes `work.resume`, `work.checkpoint`, and exactly four Team tools: `team.start`, `team.status`, `team.stop`, `team.submit`.

The existing gated Home-PC Team Mode production acceptance was then run with `SUD_D_TEAM_MODE_ACCEPTANCE=1` against the current local repo. Result: **1/1 PASS**. That acceptance performs MCP `tools/list`, requires the exact approved 26-tool list, verifies exactly four `team.*` tools, verifies pre-resume Team calls fail with `WORK_RESUME_REQUIRED`, then successfully calls `work.resume` and continues the production Team flow.

This evidence materially narrows DGF-003/DGF-004: the current local production composition and Team/Work Memory contract are intact. The remaining failure is between the running integration/session and the ChatGPT host-visible catalog, or a stale already-running gateway process/catalog, rather than missing registration in current SUD-D source/build.

## Next diagnostic step

1. Disconnect SUD-D cleanly.
2. Fully close SUD-D so the current tunnel/gateway process is not reused.
3. Reopen SUD-D and Connect again, forcing a fresh gateway process from the current build.
4. Open a new ChatGPT session and check for `work.resume` before attempting the dogfood workload.
5. If `work.resume` is still absent or a Team tool is disabled, treat the result as host/integration catalog evidence and stop; do not retry the workload or substitute Remote Commander.

Do not bypass the blocker through Remote Commander or unrelated tools.
