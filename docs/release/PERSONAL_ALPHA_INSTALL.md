# SUD-D Personal Alpha — Windows Install and Update

This guide is for the approved two-user Personal Alpha only. Installers are unsigned during this MVP, so Windows may show a SmartScreen warning.

## First install

1. Obtain `SUD-D Setup <version>.exe` only from the official SUD-D Personal Alpha release location approved by the Product Owner.
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