# SUD-D

SUD-D is a local-first, personal-first Windows **Execution Control Gateway** and desktop development control center. It connects ChatGPT to a selected local Workspace through an OpenAI Secure MCP Tunnel and keeps capability execution behind Workspace boundaries, Tool Kernel, Policy, Approval and Audit.

This capability summary describes published [v1.0.8](https://github.com/JekdoTH/SUD_D/releases/tag/v1.0.8), revision `dc4dc7d`, audited on 2026-10-13. Source and field evidence are distinguished below; development branches and uncommitted experiments are not installed-release capabilities.

## What SUD-D Does

SUD-D controls access, execution and verification. It is not itself a Video Editor or AI Media Generator. A Workspace can use the gateway to run its own reviewed media script, just as another Workspace can run software tests.

The v1.0.8 source exposes:

- Workspace file read, search, create and write.
- Bounded Git workflows: repository/branch/remote setup, status/diff, commit, fetch, sync and push.
- Approval for protected actions and credential-safe Audit records.
- Managed Serena-backed semantic code reading and editing.
- Restricted Verify for declared test, lint, typecheck, build, diff and secret-scan actions.
- Read-only `runner.discover` for validated Workspace runner definitions; it does not execute them.
- Local Work Memory / resume across connected chat sessions.
- Sequential Team Mode V3: Planner → Worker → Validator → Reviewer.
- Windows installer and signed in-app update verification.

Generic shell execution, destructive Delete and Parallel Coding are not available capabilities.

## Verified Capabilities

| Evidence category | What is established | Boundary of the claim |
| --- | --- | --- |
| **Verified by Source Code** | Workspace/Kernel/Policy/Approval/Audit path; `work.resume`; six restricted `verify.run` actions; read-only discovery | Reviewed at tag v1.0.8, not inferred from dirty development files |
| **Verified by Automated Tests** | Release CI: 93 tests / 10 files passed. Packaged Gateway smoke: resume guard, approved real `verify.run(test)`, read-only discovery and Audit redaction passed | Isolated release fixture; not a live field-test receipt from the media Workspace |
| **Verified by Physical Field Test** | Existing MP4 files from owner-prepared scripts: real image/audio inputs, 640×360 render, BGM mixing, overlay and Thai soft-subtitle track | File hashes and read-only FFprobe checked during this audit; decode/subtitle-roundtrip success comes from retained QC receipts, not a new render or decode run |
| **Owner-Reported Manual Verification** | Owner confirmed a v1.0.8 test on another computer: MCP Connection, `work.resume`, `verify.run(test)`, `verify.run(build)` and a real-asset Final MP4. Owner also confirmed VLC Thai soft subtitles and personally accepted the newer 1080p video, narration, BGM, overlay and burned-in Thai subtitles | Owner confirmation is separate from stored automated QC and raw MCP/Audit evidence; clean-install and fresh-machine acceptance were not established |
| **Not Yet Implemented / Not Yet Verified** | General-purpose executable Workflow Runner, full AI media orchestration, AI TTS/image generation and complete fresh-machine acceptance | Successful FFmpeg output does not prove these capabilities |

The original real-asset runs are **640×360 at 10 FPS**. A newer **1920×1080 / 25 FPS** artifact dated 2026-10-13 passes hash/FFprobe checks, its report records successful build/decode, and the Owner reports manual video/audio acceptance **PASS**. Linked raw MCP/Audit evidence for that run was not independently verified here. See the [field-test evidence and limitations](docs/field-tests/v1.0.8-owner-workspace.md), including the missing local media-Workspace `test` receipt and the separately confirmed cross-device test.

## Workspace and Workflow Responsibility

| SUD-D Core | User Workspace / Workflow |
| --- | --- |
| MCP Gateway, selected Workspace access and resume context | Skills, agent instructions and workflow sequence |
| Kernel, Policy, Approval and Audit | Reviewed scripts, assets and provider configuration |
| Fixed execution profiles, bounded results and verification reporting | Renderer implementation, resolution, FPS and codec |
| Reporting whether an approved action succeeded or failed | Subtitle, BGM, overlay, transitions and workflow-specific QC |

A successful `verify.run(build)` reports the reviewed project script's result. The script must define and enforce its own media acceptance checks. SUD-D Core does not choose the decoration or render settings for every Workspace. Provider credentials, access and spending need their own authorized setup; the field scripts used existing owner-supplied media.

## Quick Start / Field Test

1. Download `SUD-D-Setup-<version>.exe` from the official [GitHub Releases](https://github.com/JekdoTH/SUD_D/releases/latest) and install for the current Windows user.
2. Add/select your local project in **Workspaces**.
3. In **Connection**, configure this device's **Runtime API Key** and **Secure Tunnel** / **Tunnel ID** as required, then choose **Connect ChatGPT**. Credentials and connection setup are local to each machine.
4. Open ChatGPT with the configured SUD-D connection and describe your task normally. The connected AI is instructed to call `work.resume` before substantive project work; users do not need to type that tool name into every prompt.
5. Review and approve protected actions in SUD-D when requested.

See the [Windows install and update guide](docs/release/PERSONAL_ALPHA_INSTALL.md) for installation, verification and recovery details. The installed app bundles its MCP Gateway. Running Workspace package scripts through `verify.run` additionally needs host Node and a supported package manager; media tools are not bundled.

Before a field test:

1. Review your own Workspace's `package.json` and the exact requested script. It must declare `pnpm@<version>` or `npm@<version>` and the relevant `test`, `lint`, `typecheck` or `build` script. Install project dependencies separately.
2. Put host Node on PATH. The supported pnpm CLI path is `%APPDATA%\npm\node_modules\pnpm\bin\pnpm.cjs`; npm uses `node_modules\npm\bin\npm-cli.js` beside `node.exe`. Missing profiles fail closed. `diff_check` and `secret_scan` require Git at `C:\Program Files\Git\cmd\git.exe` or `C:\Program Files\Git\bin\git.exe`.
3. Prepare any FFmpeg/FFprobe, media assets and workflow-specific configuration yourself. Check existing outputs and one-use guards before requesting a render; an old script is not automatically safe to rerun.
4. After Connect and `work.resume`, request an available action. In Standard approval mode, approve the contextual request in Activity and retry the same action. Keep the safe result and redacted Audit summary with the output/QC receipt.

Example prompt — optional, not a requirement for every Workspace:

> Use only my selected Workspace. Resume its context and inspect the declared scripts and prerequisites. If a reviewed test script exists, request `verify.run` with action `test` through the normal approval flow. Report the result and safe evidence. Do not change scripts, install dependencies or render media without separate scope. Propose a build only after its inputs, output location and QC are understood.

## Current Limitations

- `verify.run` accepts only an `action`: `test`, `lint`, `typecheck`, `build`, `diff_check` or `secret_scan`. Callers cannot supply arbitrary executable, arguments, directory, environment or timeout. Package-script execution defaults to **300 seconds** and **32 KiB** captured output, with redaction/truncation.
- Policy and Approval still apply. Standard-mode approval is contextual; automatic approval modes do not create a general workflow authorization. Approved package scripts run with the host user's permissions. `shell:false` at the adapter boundary does not make script contents a filesystem/network sandbox; process-tree cleanup is best effort, not Windows Job-grade containment.
- `runner.discover({})` reads validated version-1 `.sud-d/runners.json` candidates and returns `executionAvailable: false`. Production MCP has no `runner.start/status/logs/stop` or installed Workflow Run page. Discovery is not needed to use an existing `verify.run` profile.
- The field tests used owner-prepared scripts and local FFmpeg with existing images/audio. Full AI Video Workflow, new AI speech/images, autonomous phase/retry/resume execution and provider spending were not proven.
- The Owner confirmed functional v1.0.8 testing on another Windows computer. A clean installation, all fresh-machine prerequisites, state preservation and repeatable cross-device acceptance remain unverified by retained evidence.

### Normal Mode and Team Mode

Without an active Team mission, ordinary Skill/project work uses Normal Mode. To start a new mission, explicitly request **Team Mode** in your prompt, then manually approve **Start Team Mode for this task** in SUD-D. Each new mission requires this approval, including in Full Access mode. Pending or denied requests create no mission.

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

## Roadmap / Next Steps

v1.0.8 already includes bounded Auto Recovery after an explicit connection; every fresh Desktop session still requires manual Connect. Existing preferences are preserved.

Next evidence to collect is a linked redacted MCP/Audit record for the confirmed cross-device actions and 1080p run, plus clean-install prerequisites and state-preservation checks on an authorized machine. The Owner already confirmed 1080p visual/audio acceptance; the remaining items are evidence gaps, not newly approved implementation milestones.

The longer-term Personal AI Team Harness direction, executable runner work and Parallel Coding remain governed by [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) and the current [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md). This documentation update grants no new execution, provider spending or milestone authority.

## Architecture and security

Electron's renderer uses narrow, validated IPC; privileged host behavior stays behind fixed-purpose main/application/infrastructure boundaries. MCP capabilities follow:

```text
MCP Gateway → Workspace Boundary → Tool Kernel → Policy
→ Approval where required → Execution → Audit
```

MCP file operations remain inside approved Workspaces; outside-workspace/internal-root access stays denied at that boundary. Reviewed package scripts execute as the host user and must not be mistaken for an OS-enforced sandbox. The renderer cannot select arbitrary executable, argv, cwd or env. Team roles use the same capability boundaries as normal work. Destructive Delete remains unavailable until its recovery gates are ready.

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
