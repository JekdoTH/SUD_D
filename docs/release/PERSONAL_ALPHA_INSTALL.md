# SUD-D Personal Alpha — Windows Install and Update

This guide is for the approved two-user Personal Alpha only. Installers are unsigned during this MVP, so Windows may show a SmartScreen warning.

## First install

1. Obtain `SUD-D-Setup-<version>.exe` only from the official SUD-D Personal Alpha release location approved by the Product Owner.
2. Confirm the expected Version/Revision from the release notes before running it.
3. Run the installer as the current Windows user. Normal installation is per-user, uses the default SUD-D install location, and must not require administrator elevation. Custom installation directories are not supported in this Personal Alpha MVP.
4. If Windows SmartScreen warns about the unsigned Alpha, use **More info → Run anyway** only when you personally trust the artifact and its source.
5. Launch SUD-D and open **Update**.
6. Confirm the displayed `SUD-D v<version>` and `Revision <7-char>` match the approved release.

Never install SUD-D binaries obtained from an untrusted third party.

## In-app update

1. Open **Update**. SUD-D may check for an update at startup; this does not download one automatically.
2. Use **Check for Updates** when you want to check manually.
3. If a newer approved release exists, review its version and categorized release notes.
4. Click **Download Update**. The update must reach verification before it can become ready.
5. Only after signature/version/hash verification passes will **Restart & Update** become available.
6. Click **Restart & Update** to install. SUD-D must not silently restart or install without this action.
7. After restart, confirm the new Version/Revision and the one-time update summary.

If verification fails, do not bypass it or run the downloaded update manually.
## Manual recovery

If an approved update cannot be completed:

1. Keep SUD-D closed.
2. Use the prior approved Personal Alpha installer for the version you were previously running.
3. Do not delete `%LOCALAPPDATA%\SUD-D`; application data is deliberately stored outside the install directory and should survive binary replacement.
4. Reopen SUD-D and verify Workspace/settings/history are still present.
5. Report the failed Version/Revision and the safe error shown by the Update page.

Do not use force-delete, database reset, credential deletion, or an installer from an untrusted source as a recovery step.

## Local pre-release smoke — 2026-09-17

Before public publication, the local unsigned candidate `SUD-D Setup 0.1.0.exe` was installed successfully from a normal per-user path under a non-admin Windows token. The installed app launched against an isolated test data root and rendered `SUD-D v0.1.0` / `Revision c7d9c69` on the Update screen.

The local build had no Mark-of-the-Web, so a SmartScreen prompt was not observed in this local smoke. The artifact is Authenticode `NotSigned`; a warning after real browser download remains an accepted Personal Alpha limitation and must not be bypassed unless the user personally trusts the official artifact.

Custom-path diagnostics found crashes both with the silent NSIS `/D=<alternate path>` harness and with the normal interactive Browse flow on this Windows test machine. The Product Owner approved closing custom installation-directory support for this MVP. The supported path is the fixed default per-user install location; the installer configuration disables changing the installation directory.
## v1.0.8 owner field test

Use only your own authorized Windows Workspace. The release operator does not access another tester's files or credentials.

1. Upgrade using the in-app flow above, then confirm v1.0.8 and the release's seven-character revision on Update. Preserve the existing data folder and confirm Workspace/settings/history survive. Credentials stay protected by the existing Windows credential store; never export them for this test.
2. Select your Workspace and manually Connect. In the connected AI session call work.resume before Workspace-dependent tools. Connection credentials are configured locally by the tester; never include them in a defect report.
3. For verify.run test/lint/typecheck/build, install host Node on PATH. The Workspace package.json must declare pnpm@<version> or npm@<version> and the corresponding script. For pnpm the supported CLI location is %APPDATA%\npm\node_modules\pnpm\bin\pnpm.cjs; for npm it is node_modules\npm\bin\npm-cli.js beside node.exe. Confirm each path exists and install the Workspace's dependencies separately. Missing profiles fail closed; no runtime is downloaded by SUD-D. Git for Windows must be installed at C:\Program Files\Git\cmd\git.exe (or bin\git.exe) for diff_check and secret_scan.
4. Review the project's scripts and dependencies before authorizing execution. Request verify.run with action test; in Standard approval mode, approve its contextual request in Activity and retry the same action. Confirm its bounded result and Audit summary. Repeat only the actions declared by your own project.
5. If the Workspace has a version-1 .sud-d/runners.json with node-offline-v1 definitions, call runner.discover with empty arguments. It reads metadata only and returns executionAvailable=false; runner.start is unavailable. An absent manifest returns a safe failure and does not prevent verify.run.
6. A media script additionally requires its own reviewed FFmpeg/FFprobe/TTS/image/provider environment. These are not bundled, no provider budget is granted, and this release has no Workflow Run UI. Field workflow and real AI media success remain unverified until the tester returns evidence.
7. Return Version/Revision, the action, safe error code, result and relevant redacted Audit summary. Omit Workspace contents, credentials and raw sensitive output. On failure use the manual recovery route above with the prior approved 1.0.6 installer; retain %LOCALAPPDATA%\SUD-D.

The installer remains per-user, without elevation. Binary rollback preserves the data root; no new database migration is introduced by this release. The signed update manifest does not imply Authenticode signing of the EXE.
