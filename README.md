# SUD-D

SUD-D is a local-first, personal-first Windows AI control gateway and desktop development control center. It connects ChatGPT to a selected local Workspace through an OpenAI Secure MCP Tunnel and keeps capability execution behind Workspace boundaries, Tool Kernel, Policy, Approval and Audit.

## Available today

- Workspace file read, search, create and write.
- Bounded Git workflows: repository/branch/remote setup, status/diff, commit, fetch, sync and push.
- Approval for protected actions and credential-safe Audit records.
- Managed Serena-backed semantic code reading and editing.
- Restricted Verify for declared test, lint, typecheck, build, diff and secret-scan actions.
- Local Work Memory / resume across connected chat sessions.
- Sequential Team Mode V3: Planner → Worker → Validator → Reviewer.
- Windows installer and signed in-app update verification.

Generic shell execution, destructive Delete and Parallel Coding are not available capabilities.

## Install and start working

1. Download `SUD-D-Setup-<version>.exe` from the official [GitHub Releases](https://github.com/JekdoTH/SUD_D/releases/latest) and install for the current Windows user.
2. Add/select your local project in **Workspaces**.
3. In **Connection**, configure this device's **Runtime API Key** and **Secure Tunnel** / **Tunnel ID** as required, then choose **Connect ChatGPT**. Credentials and connection setup are local to each machine.
4. Open ChatGPT with the configured SUD-D connection and describe your task normally. The connected AI is instructed to call `work.resume` before substantive project work; users do not need to type that tool name into every prompt.
5. Review and approve protected actions in SUD-D when requested.

See the [Windows install and update guide](docs/release/PERSONAL_ALPHA_INSTALL.md) for installation, verification and recovery details. An installed app includes its MCP Gateway runtime and does not require a source checkout, Node.js or pnpm for normal use.

### Normal Mode and Team Mode

Without an active Team mission, ordinary Skill/project work uses Normal Mode. Complexity alone does not start a new Team mission. To start one, explicitly request **Team Mode** in your prompt.

An existing active mission can resume: after `work.resume`, the AI calls `team.status` and continues its bounded assignment. Current Team V3 uses sequential logical roles through one connected AI session; parallel Workers are planned separately.

### Managed Serena / Coding Engine

You do not need a global Serena installation. SUD-D manages its pinned Serena and Python runtime in its own local managed area for semantic coding tools.

On a new Windows machine, a trusted **uv** installation must already be available before SUD-D can provision that runtime. This is normally a one-time machine prerequisite for the Coding Engine, not a requirement for every non-coding task. Self-contained uv installation and controlled Serena update/rollback are not implemented yet.

## Releases and updates

Official releases use this repository's GitHub Releases. Installed SUD-D checks for newer versions and can show an in-app startup notice with **View Update / Later**. Download and installation remain your choice: **Update → Check for Updates → Download Update → Restart & Update**.

The update path verifies an Ed25519-signed release manifest, version/revision and artifact hash before installation. Manifest signing is separate from Windows Authenticode signing; Personal Alpha installers may show a SmartScreen warning. Follow the install guide and use only the official release source.

The v1 series introduced a new update trust root/feed. Users still on 0.1.x need one manual installation of the current supported v1 release; subsequent supported v1 versions update through SUD-D.

## Cross-device project work

Between the owner's Windows machines, project continuity uses **Git commit → push → pull**. Local Work Memory stays per-device; cloud synchronization is not required or provided. Inspect each machine's local work before syncing and preserve uncommitted changes.

## Product direction — planned

Near term: complete installed-release / Team opt-in dogfooding, then improve Connection `autoStart` / `autoRestart` behavior. Those stored preferences do not currently run automation.

Next major capability: **Parallel Coding Team**, design-first. An explicit Parallel Team request makes the current user-opened conversation the Requirement / Lead Chat; users manually open Worker chats. Planned coordination includes dependency-aware Tasks, claims/ownership, internal branch/worktree isolation, structured Worker results and Lead integration, verification and final review. This Personal Alpha approach adds no OpenAI API/model runtime. It is not implemented by Team V3.

Computer Use follows stable Parallel Coding. Later usage-driven work includes Restricted Project Runner expansion, Recovery / Safe Delete, self-contained uv bootstrap, controlled Serena update/rollback and Team Presets. Cloud relay/device discovery, cloud Work Memory sync, model/provider-selection runtime, macOS/Linux and enterprise/multi-user architecture are not current priorities.

See [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for authoritative sequencing and approval gates.

## Architecture and security

Electron's renderer uses narrow, validated IPC; privileged host behavior stays behind fixed-purpose main/application/infrastructure boundaries. MCP capabilities follow:

```text
Workspace Boundary → Tool Kernel → Policy
→ Approval where required → Execution → Audit
```

Operations remain inside approved Workspaces. Outside-workspace/internal-root access and generic network authority stay denied. The renderer cannot select arbitrary executable, argv, cwd or env. Team roles use the same capability boundaries as normal work. Destructive Delete remains unavailable until its recovery gates are ready.

Never commit credentials, signing private keys or secret-bearing environment files. See [SECURITY.md](SECURITY.md) for vulnerability reporting and [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) for stable architecture context.

## Development

Source development requires Windows, Node.js 24 or newer and pnpm 10.34.5.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Useful checks are `pnpm lint`, `pnpm typecheck` and `pnpm test`; choose checks appropriate to the changed boundary under [AGENTS.md](AGENTS.md).

Windows release packaging is fail-closed and requires the tracked Ed25519 update public key through `SUD_D_RELEASE_PUBLIC_KEY_FILE`. The protected release workflow builds the NSIS installer, verifies package provenance and signs the manifest; the private key stays in the protected GitHub release environment.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull-request expectations.

## License

MIT. See [LICENSE](LICENSE).
