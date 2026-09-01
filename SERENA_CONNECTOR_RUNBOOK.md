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

## Important: tunnel profile can be overridden by environment

On Home-PC, `CONTROL_PLANE_TUNNEL_ID` is also used by the normal SUD_D runtime. A PowerShell session can therefore inherit the SUD_D product tunnel ID.

`tunnel-client` environment configuration can override the `tunnel_id` stored in `serena-sudd.yaml`. If this happens, running:

```powershell
tunnel-client run --profile serena-sudd
```

may accidentally start the **SUD-D HOME** tunnel instead of **Serena SUD-D Home**, even though the Serena profile name was supplied.

This failure was confirmed on 2026-09-01: the Serena profile contained its own tunnel ID, while the inherited `CONTROL_PLANE_TUNNEL_ID` pointed at the normal SUD_D HOME tunnel. The resulting ChatGPT Serena connector calls returned 404/429 even though the local Serena server itself was healthy.

For Serena tunnel sessions, clear only the tunnel-ID override in that terminal process before starting the Serena profile:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID=$null
tunnel-client run --profile serena-sudd
```

This does **not** delete the Windows/User environment value and does not change SUD_D configuration. It only removes the override from that PowerShell process so the Serena profile's own tunnel ID wins.

A healthy Home Serena tunnel log should identify the tunnel name as approximately:

```text
Serena SUD-D Home
```

and should show an MCP session initialized against the local Serena server.

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

Then open **PowerShell window 2** and start the Serena tunnel without inheriting the normal SUD_D tunnel-ID override:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID=$null
tunnel-client run --profile serena-sudd
```

Keep both windows running while using `@Serena SUD-D Home`.

Recommended order:

```text
Serena MCP server → clear Serena terminal tunnel-ID override → tunnel-client → ChatGPT Serena connector
```

### Stop

For a normal shutdown:

1. Stop the tunnel window with `Ctrl+C`.
2. Stop the Serena MCP server window with `Ctrl+C`.

Closing the two terminal windows also stops them, but `Ctrl+C` is preferred because each process gets a normal shutdown opportunity.

### If the tunnel disconnects but Serena is still running

Do **not** restart Serena unnecessarily.

1. Confirm the Serena window still shows the server running on `127.0.0.1:7006`.
2. Stop/restart only the tunnel, clearing the inherited tunnel-ID override first:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID=$null
tunnel-client run --profile serena-sudd
```

3. Confirm the tunnel log identifies `Serena SUD-D Home`, then retry the Serena connector in ChatGPT.

### If Serena MCP server stops but the tunnel is still running

The tunnel may show local errors similar to:

```text
dial tcp 127.0.0.1:7006: connectex: No connection could be made
```

Restart the Serena MCP server first:

```powershell
serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
```

Once `127.0.0.1:7006` is listening again, the existing tunnel may recover. If the ChatGPT connector still fails, restart only the tunnel after Serena is healthy and clear `CONTROL_PLANE_TUNNEL_ID` in the tunnel terminal before rerunning the Serena profile.

### Quick local checks

To verify whether Serena is listening on the Home MCP port:

```powershell
netstat -ano | findstr :7006
```

No output means nothing is currently listening on port 7006.

The Serena tunnel health/admin listener currently uses port 7005. To check for a stale/duplicate tunnel process:

```powershell
netstat -ano | findstr :7005
```

If the intended Serena tunnel is stopped, this should normally produce no output before a clean restart.

To compare an inherited tunnel override against the Serena profile without printing credentials:

```powershell
Write-Host "ENV TUNNEL =" $env:CONTROL_PLANE_TUNNEL_ID
Select-String -Path "$env:APPDATA\tunnel-client\serena-sudd.yaml" -Pattern 'tunnel_id|server_url|listen_addr'
```

If the environment tunnel ID and profile tunnel ID differ, clear the environment override in the Serena tunnel terminal before starting the profile.

---

## Serena Work

Work uses the **same two-process model**:

```text
local Serena MCP server for the Work repo
+
Work Serena tunnel-client profile
```

The same environment-override risk may apply on Work-PC if `CONTROL_PLANE_TUNNEL_ID` is configured for that machine's normal SUD_D runtime. The Work launcher should therefore clear the tunnel-ID override in its own tunnel process before starting the Work Serena profile.

Do **not** blindly copy the Home profile, Home project path, or Home port. The exact Work profile/path/port must match the Work-PC connector configuration.

Once those exact Work values are confirmed, record them in this section so startup becomes deterministic like Home.

---

## Optional `.bat` launcher

A `.bat` launcher can make startup a one-double-click operation. Its job should only be to open two terminal windows:

1. Serena MCP server
2. tunnel-client

A launcher does not change the architecture and does not make either process a Windows service. The two child windows remain visible so failures can be inspected and each process can be stopped with `Ctrl+C`.

Recommended Home launcher behavior:

- start Serena first
- wait briefly or perform a port-7006 readiness check
- start the tunnel second
- in the tunnel child process, clear only `CONTROL_PLANE_TUNNEL_ID` before `tunnel-client run --profile serena-sudd`
- never embed API keys/tokens in the `.bat`
- keep Home and Work launchers separate so project/profile/port settings cannot be mixed accidentally

For a `.bat` child process, the equivalent environment isolation is conceptually:

```bat
set "CONTROL_PLANE_TUNNEL_ID="
tunnel-client run --profile serena-sudd
```

This clears the variable only inside that command window; it does not delete the user's persistent Windows environment setting.

If automatic restart is later desired, prefer a small supervised launcher with health checks rather than an infinite blind restart loop.

---

## When asked how to start Serena Home

Use this concise answer:

```text
1. Start Serena MCP server:
   serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"

2. After it shows Uvicorn running on 127.0.0.1:7006, open another PowerShell and run:
   $env:CONTROL_PLANE_TUNNEL_ID=$null
   tunnel-client run --profile serena-sudd

3. Confirm the tunnel log says Serena SUD-D Home, keep both windows open, then use @Serena SUD-D Home in ChatGPT.
```
