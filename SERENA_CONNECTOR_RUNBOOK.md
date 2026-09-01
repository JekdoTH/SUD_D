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

### Current validated launcher workflow

**Validated on Home-PC on 2026-09-01:** the preferred launcher is the v4 pattern using **one Windows Terminal window with two tabs**.

```text
Start-Serena-Home-v4.bat
→ PowerShell 7 launcher
→ Windows Terminal
   ├─ Tab 1: Serena MCP Home — port 7006
   └─ Tab 2: Serena SUD-D Home Tunnel — health/admin port 7005
```

The launcher behavior that worked successfully is:

1. verify PowerShell 7, Windows Terminal, Serena, tunnel-client, and the Home SUD_D project path
2. refuse to start if port 7006 or 7005 is already occupied by a previous Serena/tunnel process
3. open the Serena tab first
4. start Serena on `127.0.0.1:7006`
5. the Tunnel tab waits until port 7006 is listening
6. the Tunnel tab clears `CONTROL_PLANE_TUNNEL_ID` **only inside that tab/process**
7. start `tunnel-client run --profile serena-sudd`
8. verify the tunnel log identifies `Serena SUD-D Home`
9. use `@Serena SUD-D Home` in ChatGPT

No API key or Tunnel ID is embedded in the launcher. Existing machine/profile configuration is reused, so normal startup does **not** require reinstalling Serena/tunnel-client or re-entering API key/Tunnel ID.

### Manual start fallback

If the launcher is unavailable, open PowerShell 7 and start the local Serena MCP server:

```powershell
serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
```

Wait until it reports approximately:

```text
Uvicorn running on http://127.0.0.1:7006
```

Then open another PowerShell 7 tab/window and start the Serena tunnel without inheriting the normal SUD_D tunnel-ID override:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID=$null
tunnel-client run --profile serena-sudd
```

Recommended order:

```text
Serena MCP server → clear Serena tunnel-tab override → tunnel-client → ChatGPT Serena connector
```

### Stop — preferred clean shutdown

With the v4 two-tab Windows Terminal layout, normal shutdown is:

1. go to the **Tunnel tab (7005)** and press `Ctrl+C`
2. wait until tunnel-client stops/returns to a prompt
3. go to the **Serena tab (7006)** and press `Ctrl+C`
4. after both processes have stopped, close the Windows Terminal window if desired

Closing the entire Windows Terminal window also terminates both processes, but `Ctrl+C` in **Tunnel first → Serena second** is the preferred routine because each process gets a clean shutdown opportunity.

### If the tunnel disconnects but Serena is still running

Do **not** restart Serena unnecessarily.

1. Leave the Serena tab running on `127.0.0.1:7006`.
2. Restart only the Tunnel tab/process, always clearing the inherited tunnel-ID override first:

```powershell
$env:CONTROL_PLANE_TUNNEL_ID=$null
tunnel-client run --profile serena-sudd
```

3. Confirm the tunnel log identifies `Serena SUD-D Home`, then retry the connector in ChatGPT.

### If Serena MCP server stops but the tunnel is still running

The tunnel may show local errors similar to:

```text
dial tcp 127.0.0.1:7006: connectex: No connection could be made
```

Restart Serena first:

```powershell
serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
```

Once port 7006 is healthy, the existing tunnel may recover. If ChatGPT still cannot connect, restart only the Tunnel process after Serena is healthy and clear `CONTROL_PLANE_TUNNEL_ID` before rerunning the Serena profile.

### Quick local checks

Serena MCP server:

```powershell
netstat -ano | findstr :7006
```

No output means Serena is not listening.

Serena tunnel health/admin listener:

```powershell
netstat -ano | findstr :7005
```

If the intended Serena tunnel is stopped, this should normally produce no output before a clean restart.

To compare an inherited tunnel override against the Serena profile without printing credentials:

```powershell
Write-Host "ENV TUNNEL =" $env:CONTROL_PLANE_TUNNEL_ID
Select-String -Path "$env:APPDATA\tunnel-client\serena-sudd.yaml" -Pattern 'tunnel_id|server_url|listen_addr'
```

If the environment tunnel ID and profile tunnel ID differ, clear the environment override in the Serena tunnel tab/process before starting the profile.

---

## Serena Work

Work uses the **same architecture and preferred launcher pattern**:

```text
one Windows Terminal window
├─ Tab 1: local Serena MCP server for Work repo
└─ Tab 2: Work Serena tunnel-client profile
```

When configuring Work-PC, reuse the Home v4 design but **discover and verify the Work-specific values first**:

- Work SUD_D project path
- Work Serena MCP port
- Work tunnel health/admin port
- Work Serena tunnel-client profile name
- Work Serena tunnel identity/name
- whether Work-PC also has `CONTROL_PLANE_TUNNEL_ID` set for the normal SUD_D runtime

The same environment-override risk may apply on Work-PC. The Work launcher should clear `CONTROL_PLANE_TUNNEL_ID` only inside its Tunnel tab/process before starting the Work Serena profile.

Do **not** blindly copy Home tunnel IDs, project path, or ports. Keep Home and Work launchers separate so configuration cannot be mixed accidentally.

Once Work values are confirmed on the Work-PC, update this runbook with the exact validated Work commands and launcher behavior.

---

## Launcher design notes

The preferred implementation is:

```text
small .bat launcher
→ PowerShell 7 .ps1 engine
→ Windows Terminal one window / two tabs
```

Why this pattern is preferred:

- `.bat` provides easy double-click startup
- PowerShell 7 handles the Thai project path reliably
- Serena and Tunnel logs remain separate in tabs
- either process can be restarted independently
- the launcher can wait for Serena readiness before Tunnel startup
- the Tunnel tab can isolate `CONTROL_PLANE_TUNNEL_ID` without changing persistent Windows settings
- no secret needs to be stored in launcher files

Avoid putting long inline PowerShell scripts directly into `wt.exe` arguments; the v3 attempt demonstrated Windows Terminal quoting/argument parsing problems. The validated v4 pattern calls the same `.ps1` file with short `-Mode Serena` / `-Mode Tunnel` arguments instead.

If automatic restart is later desired, prefer explicit health-aware supervision rather than a blind infinite restart loop.

---

## When asked how to start Serena Home

Use this concise answer:

```text
Preferred:
1. Double-click the validated Start-Serena-Home-v4.bat launcher.
2. Keep the Windows Terminal window open with both tabs:
   - Serena MCP Home — 7006
   - Serena SUD-D Home Tunnel — 7005
3. Confirm the Tunnel tab identifies Serena SUD-D Home.
4. Use @Serena SUD-D Home in ChatGPT.

Manual fallback:
1. Start Serena MCP:
   serena start-mcp-server --transport streamable-http --host 127.0.0.1 --port 7006 --project "C:\1.งานโด้\SUD-D"
2. In a second PowerShell 7 tab:
   $env:CONTROL_PLANE_TUNNEL_ID=$null
   tunnel-client run --profile serena-sudd
```

## When asked how to stop Serena Home

Use this concise answer:

```text
1. Tunnel tab (7005) → Ctrl+C
2. Serena tab (7006) → Ctrl+C
3. Then close Windows Terminal if desired.

Closing the whole Terminal window also stops both, but Ctrl+C in that order is preferred for a clean shutdown.
```
