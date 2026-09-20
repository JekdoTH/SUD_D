# Serena Runtime Spike Results

## Verdict

MILESTONE A: PASS

## Candidate Pin

- Package: `serena-agent==1.7.0`
- Tag: `v1.7.0`
- Commit: `949a27ef1e5fda1a6e7b561e777bcece345c6ffd`
- Wheel SHA-256: `6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891`

## Primary Sources

- Serena v1.7.0 tag: `git ls-remote --tags https://github.com/oraios/serena.git refs/tags/v1.7.0` returned `949a27ef1e5fda1a6e7b561e777bcece345c6ffd`.
- PyPI `serena-agent` 1.7.0 file details list the wheel SHA-256 above.
- Serena installation docs state Serena is managed by `uv` and installed with Python 3.13 using `uv tool install -p 3.13 serena-agent`.
- Serena running/docs state `start-mcp-server` supports `--project`, `--context`, `--mode`, and `--open-web-dashboard <true|false>` and that language servers are the default backend.
- Serena configuration docs define `desktop-app` as a desktop-application context and `no-onboarding` as a mode that skips initial onboarding.
- uv storage docs state `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_DIR`, and `UV_CACHE_DIR` can override tool, executable, Python, and cache storage locations.
- MCP TypeScript SDK v2 docs state `@modelcontextprotocol/client` with `StdioClientTransport` spawns a local child process over stdin/stdout, `connect()` runs initialize, `listTools()` returns tool definitions, `callTool()` invokes tools, and `close()` tears down the transport.

## Host Evidence

- Host: Microsoft Windows 10 Pro `10.0.19045` build `19045`, 64-bit.
- Node: `v24.18.1`.
- pnpm: `10.34.5`.
- uv: `uv 0.12.7 (61291a8ca 2026-08-27 x86_64-pc-windows-msvc)`.
- The spike used the user-installed `uv.exe` only as the package manager entrypoint.
- The Serena executable used for MCP was resolved only from the spike-owned `UV_TOOL_BIN_DIR`, not from a user-global `serena` command.

## Runtime Evidence

- Isolated install path model: each live run creates an OS-temp `sud-d-serena-spike-*` root with separate `uv-tools`, `bin`, `python`, `uv-cache`, and copied `project` directories.
- Exact install args: `uv tool install --python 3.13 serena-agent==1.7.0`.
- Exact server args: `start-mcp-server --project <temp-project> --context desktop-app --mode no-onboarding --open-web-dashboard false`.
- Transport: stdio through `@modelcontextprotocol/client` 2.0.0 `StdioClientTransport`.
- Installed version: `Serena 1.7.0`.
- MCP server identity: `Serena`, version `1.28.1`.
- Tool count discovered from MCP `tools/list`: `29`.
- Tool/schema snapshot: `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json`.
- Required tool names present: `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `search_for_pattern`, `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, `execute_shell_command`.
- Project activation/LSP proof: `get_symbols_overview` on copied fixture `src/calculator.ts` returned text containing the known `add` function and `Calculator` class.
- Process evidence: root PID was captured, bounded root/descendant PID count was `10`, and only integer PID values were used for cleanup checks.
- Cleanup result: `clean`; the temporary spike root was removed after the run.

## Compatibility Correction

The committed plan sketched synchronous `execFileSync` installation. On secondary validation device the first live `pnpm serena:spike` exercised Serena successfully but Vitest returned exit code `1` after a worker RPC timeout while the long uv install blocked the worker event loop. The harness was corrected to launch uv with asynchronous `spawn`, `shell: false`, `windowsHide: true`, bounded stdout/stderr counting, and no raw output persistence. This preserves the plan's security intent while making the live acceptance command deterministic under Vitest.

## Security/Scope Confirmation

- No production `code.*` tools were registered.
- Production MCP remains unchanged at 14 tools.
- No direct Serena MCP passthrough was exposed to the AI client.
- No Milestone B runtime manager, UI, Workspace Trust, Policy, Approval, update, rollback, or `code.run` was implemented.
- No Serena `execute_shell_command` call was made through SUD-D; it was only observed in Serena's discovered tool list/schema.
- No `.serena/` repo state, temp runtime root, uv cache, Python install, credential data, raw environment, credential-helper output, or raw Serena stderr/stdout is committed.
- The checked-in tool schema JSON contains only sorted tool definitions: `name`, optional `description`, and `inputSchema`.
