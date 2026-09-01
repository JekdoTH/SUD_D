# Serena Connector Runbook

Operational note for using the development-time Serena MCP connectors with SUD_D.

This is **development tooling**, not part of the SUD_D product runtime.

## Mental model

A Serena connector requires **two local processes** to be alive at the same time:

```text
ChatGPT / Serena connector
        ↓
OpenAI Secure MCP Tunnel (`tunnel-client`)
        ↓
local Serena MCP server
        ↓
SUD_D repository
```

`tunnel-client` is only the bridge. It does **not** start Serena itself.

If the tunnel is running but the local Serena MCP server is not listening, the tunnel may log connection-refused errors to the local MCP URL and ChatGPT may surface connector failures such as 404/429.

---

## Serena SUD-D Home

### Start

Open **PowerShell window 1** and start the local Serena MCP server:

```powershell
serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
```

Wait until it reports approximately:

```text
Uvicorn running on http://127.0.0.1:7006
```

Then open **PowerShell window 2** and start the tunnel:

```powershell
tunnel-client run --profile serena-sudd
```

Keep both windows running while using `@Serena SUD-D Home`.

Recommended order:

```text
Serena MCP server → tunnel-client → ChatGPT Serena connector
```

### Stop

For a normal shutdown:

1. Stop the tunnel window with `Ctrl+C`.
2. Stop the Serena MCP server window with `Ctrl+C`.

Closing the two terminal windows also stops them, but `Ctrl+C` is preferred because each process gets a normal shutdown opportunity.

### If the tunnel disconnects but Serena is still running

Do **not** restart Serena unnecessarily.

1. Confirm the Serena window still shows the server running on `127.0.0.1:7006`.
2. Stop/restart only the tunnel:

```powershell
tunnel-client run --profile serena-sudd
```

3. Retry the Serena connector in ChatGPT.

### If Serena MCP server stops but the tunnel is still running

The tunnel may show local errors similar to:

```text
dial tcp 127.0.0.1:7006: connectex: No connection could be made
```

Restart the Serena MCP server first:

```powershell
serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
```

Once `127.0.0.1:7006` is listening again, the existing tunnel may recover. If the ChatGPT connector still fails, restart only the tunnel after Serena is healthy.

### Quick local check

To verify whether Serena is listening on the Home port:

```powershell
netstat -ano | findstr :7006
```

No output means nothing is currently listening on port 7006.

---

## Serena Work

Work uses the **same two-process model**:

```text
local Serena MCP server for the Work repo
+
Work Serena tunnel-client profile
```

Do **not** blindly copy the Home profile, Home project path, or Home port. The exact Work profile/path/port must match the Work-PC connector configuration.

Once those exact Work values are confirmed, record them in this section so startup becomes deterministic like Home.

---

## Optional `.bat` launcher

A `.bat` launcher can make startup a one-double-click operation. Its job should only be to open two terminal windows:

1. Serena MCP server
2. tunnel-client

A launcher does not change the architecture and does not make either process a Windows service. The two child windows remain visible so failures can be inspected and each process can be stopped with `Ctrl+C`.

Recommended operational behavior:

- start Serena first
- wait briefly or perform a port check
- start the tunnel second
- never embed API keys/tokens in the `.bat`
- keep Home and Work launchers separate so their project/profile/port settings cannot be mixed accidentally

If automatic restart is later desired, prefer a small supervised launcher with health checks rather than an infinite blind restart loop.

---

## When asked how to start Serena Home

Use this concise answer:

```text
1. Start Serena MCP server:
   serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"

2. After it shows Uvicorn running on 127.0.0.1:7006, start the tunnel:
   tunnel-client run --profile serena-sudd

3. Keep both windows open, then use @Serena SUD-D Home in ChatGPT.
```
