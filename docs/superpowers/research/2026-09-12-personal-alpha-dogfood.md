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

## Next diagnostic step

Reproduce DGF-003 without external host-control fallback:

1. reconnect/refresh the SUD-D ChatGPT integration using normal product controls;
2. start a fresh ChatGPT session if needed so tool discovery is fresh;
3. call `work.resume` when required by the Workspace contract;
4. retry one Team read/start path through SUD-D only;
5. record whether the Team tools are listed/callable and the exact safe error code/message if they are not.

Stop if Team tools remain disabled; do not bypass through Remote Commander or unrelated tools.
