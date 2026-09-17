# SUD-D Installer + In-App Update MVP — Design Specification

**Date:** 2026-09-17
**Status:** PO-approved design, pending written-spec review
**Target:** Windows Personal Alpha, 2 users/devices initially
**Source repository:** private `JekdoTH/SUD_D`
**Release channel:** one public release-only repository, `JekdoTH/SUD_D-Releases`
**Current app package version source:** `packages/desktop/package.json`

---

## 1. Goal

Deliver a simple Windows installer and in-app update flow so SUD-D can be installed once and then updated from inside the app without requiring normal users to use Git or PowerShell.

The MVP must stay free to operate for the current two-user Personal Alpha, preserve all local SUD-D data across updates, and keep the private source repository private.

Normal user experience:

```text
Install SUD-D Setup x.x.x.exe
→ launch SUD-D
→ app checks for update on startup
→ if a newer version exists, show version + release notes
→ user clicks Download Update
→ download and verify
→ user clicks Restart & Update
→ SUD-D restarts on the new version with local data preserved
```

---

## 2. Product Decisions Locked by PO

1. **Windows only** for this MVP.
2. **NSIS installer**, per-user install, no administrator rights by default.
3. **No paid code-signing certificate** for Personal Alpha.
4. Windows SmartScreen warnings on first install are an accepted Alpha limitation.
5. **One update channel** only: `latest`.
6. The app **checks for updates on startup**.
7. The app **does not auto-download** updates.
8. The app **does not silently restart/install** updates.
9. User explicitly clicks:
   - `Download Update`
   - then `Restart & Update`
10. Source code stays in private `JekdoTH/SUD_D`.
11. Install/update artifacts are published to public release-only `JekdoTH/SUD_D-Releases`.
12. Installed clients contain **no GitHub write token**.
13. Release publishing requires an explicit **PO release approval**.
14. Release notes are shown inside SUD-D and reused for the GitHub release.
15. Release note categories are:
   - `New`
   - `Improved`
   - `Fixed`
16. App **Version** and Git **Revision** remain distinct.
17. The MVP must use free infrastructure/services for the current two-user scope.

---

## 3. Version vs Revision

SUD-D must display these as different concepts:

```text
Version  = packaged application release, e.g. v0.2.1
Revision = source Git commit used to build it, e.g. 5c9a3dc
```

`packages/desktop/package.json` is the canonical application version source.

Example UI:

```text
SUD-D v0.2.1
Revision 5c9a3dc
```

The installer filename must reflect the Version, not the Git Revision:

```text
SUD-D Setup 0.2.1.exe
```

The build must embed the source revision used for that release so About/Update diagnostics can show both values.

Versioning for Personal Alpha uses SemVer `0.x.x`:

```text
v0.1.0  first installer release
v0.1.1  patch/fix release
v0.2.0  feature release
v1.0.0  future stable milestone
```

A released version number is immutable. A broken release is repaired by publishing a higher version, never by silently replacing the same version.

---

## 4. Architecture

### 4.1 Source and release separation

```text
Private source repo
JekdoTH/SUD_D
        │
        │ PO-approved release build
        ▼
Public release-only repo
JekdoTH/SUD_D-Releases
        │
        ├─ SUD-D Setup x.x.x.exe
        ├─ updater metadata
        ├─ signed release manifest
        └─ release notes
        │
        ▼
Installed SUD-D
```

The public release repository contains distributable artifacts and metadata only. It must not mirror or expose the private source tree.

### 4.2 Desktop updater boundary

Updater functionality belongs to the Electron main process, not the renderer.

Renderer responsibilities:
- render safe update status;
- show Version/Revision/release notes;
- request fixed-purpose actions such as `check`, `download`, and `restartAndInstall`.

Main-process responsibilities:
- contact the configured public release source;
- validate update metadata;
- control `electron-updater`;
- verify the downloaded artifact;
- coordinate safe shutdown;
- start the installer only after verification and explicit user action.

The renderer must never receive:
- GitHub tokens;
- arbitrary URLs to execute;
- executable paths chosen by the renderer;
- argv/cwd/env/process authority;
- private signing material.

The update bridge must be narrow and fixed-purpose, following the same least-authority philosophy as SUD-D's existing privileged boundaries.

---

## 5. Installer Design

Use `electron-builder` with Windows NSIS packaging.

Required installer behavior:
- per-user installation by default;
- no UAC/admin prompt for the normal path;
- conventional Start Menu/application shortcut behavior;
- full installer payload rather than a web-installer bootstrap;
- install application binaries separately from user/runtime data;
- uninstall/reinstall/update must not erase SUD-D local data by default.

Packaging configuration must produce at least:

```text
SUD-D Setup <version>.exe
latest.yml
required differential/update metadata generated by electron-builder
```

The exact generated update artifact set may vary by electron-builder, but only required runtime artifacts should be published.

---

## 6. User Data Preservation

Application installation files and SUD-D local state are separate trust/storage domains.

Application binaries may be replaced during update.

The following must survive installer updates unchanged:
- Workspace registrations/references;
- SQLite data;
- credentials stored through the existing credential-store boundary;
- user settings;
- approval mode/configuration;
- audit/history;
- Work Memory/runtime continuity data that already lives in the existing local data root.

Updater implementation must reuse the existing SUD-D data-root conventions. It must not introduce a second location for SQLite, credentials, or settings.

Before `Restart & Update`, SUD-D must perform an orderly shutdown of owned local resources, including SQLite/runtime ownership, before handing control to installation.

No schema migration may be hidden inside the updater subsystem. If a future application release requires a database migration, that migration remains an application startup/migration responsibility with its own tests and recovery rules.

---

## 7. Update Security Without Paid Windows Code Signing

### 7.1 Accepted limitation

The Personal Alpha installer is not Authenticode-signed. Windows may show SmartScreen or unknown-publisher warnings. This is acceptable for the current two-user Alpha and does not justify weakening the updater's own verification.

### 7.2 Signed SUD-D release manifest

Each release must include a SUD-D-owned signed manifest.

Use a modern public-key signature scheme such as Ed25519.

Trust model:
- public verification key is embedded in the SUD-D application;
- private signing key is never embedded in the application;
- private signing key is never committed to Git;
- private signing key exists only in a trusted release environment;
- release publishing signs the manifest only after explicit PO release approval.

The signed manifest contains at minimum:

```text
schemaVersion
version
revision
releaseDate
channel
artifactFileName
artifactSha512
releaseNotes
```

`releaseNotes` contains:
- New[]
- Improved[]
- Fixed[]

The signature covers the canonical serialized manifest payload.

### 7.3 Download verification

`electron-updater` is configured so that:
- `autoDownload = false`;
- automatic install-on-quit is disabled;
- a downloaded update cannot be installed merely because it finished downloading.

Before enabling `Restart & Update`, SUD-D must verify:
1. release manifest signature using the embedded public key;
2. manifest version is newer and matches the update being handled;
3. downloaded installer/update artifact SHA-512 matches the value in the signed manifest.

Only after all checks pass may the UI enter `ready-to-install`.

If signature/hash/version verification fails:

```text
Update couldn't be verified.
SUD-D was not changed.

[Try Again]
```

Do not expose raw stack traces, credentials, private paths, token values, or unsafe remote response bodies.

### 7.4 Release source compromise assumption

The design assumes a public release repository can be read by anyone and therefore does not treat repository visibility as an integrity control.

If the public release repository is compromised but the signing private key remains safe, a malicious artifact must fail SUD-D's manifest/hash verification and must not become installable through the in-app flow.

---

## 8. Update State Model and UX

The updater must expose a small deterministic state model such as:

```text
idle
checking
up-to-date
available
downloading
verifying
ready
error
```

The renderer receives only safe structured state.

### 8.1 Up to date

```text
SUD-D v0.2.0
Revision 5c9a3dc

You're up to date · v0.2.0

[Check for updates]
```

### 8.2 Update available

```text
Update available · v0.2.1

What's new

New
- ...

Improved
- ...

Fixed
- ...

[Download Update]
```

### 8.3 Downloading

Show concise progress if reliable progress data is available:

```text
Downloading v0.2.1 · 64%
```

Do not fabricate progress if the provider does not supply trustworthy values.

### 8.4 Verifying

```text
Verifying update…
```

### 8.5 Ready

```text
v0.2.1 is ready

[Restart & Update]
```

### 8.6 After successful update

On the first launch after an upgrade, show a one-time summary:

```text
Updated to v0.2.1

Changes in this update

New
- ...

Improved
- ...

Fixed
- ...
```

The one-time acknowledgement may be persisted locally using safe non-secret settings/state.

### 8.7 Error

Failures must preserve the currently installed version and show safe human-readable copy.

Examples:

```text
Couldn't check for updates.
Your current version is unchanged.

[Try Again]
```

```text
Update couldn't be verified.
SUD-D was not changed.

[Try Again]
```

---

## 9. Release Notes

Release notes are not generated directly from raw commit messages.

For each PO-approved release, Serena/release tooling creates a concise user-facing summary based on the actual accepted changes included in that release.

Canonical categories:

```text
New
Improved
Fixed
```

The same canonical release-note payload is used for:
- SUD-D Update UI;
- first-launch post-update summary;
- public GitHub Release description/metadata.

Release notes must describe user-visible behavior and important fixes rather than implementation detail unless the detail is necessary for diagnosis/security.

---

## 10. Release Workflow

Release is an explicit product event, not an automatic side effect of merging `master`.

Normal flow:

```text
feature work
→ verification
→ merge to master
→ PO explicitly approves release
→ bump canonical desktop version
→ generate user-facing release notes
→ build production installer/update artifacts
→ embed/build revision
→ generate signed manifest
→ verify artifacts/signature/hash
→ publish release-only artifacts
→ verify public release is readable
→ installed clients can detect the new version
```

No release is published merely because:
- a branch was merged;
- `master` changed;
- tests passed;
- Serena independently decides a release would be useful.

### 10.1 Release command UX

The eventual release workflow should support a simple bounded command surface such as:

```text
pnpm release:patch
pnpm release:minor
```

or an equivalent Serena/SUD-D fixed workflow.

These commands are orchestration conveniences, not generic shell authority exposed to normal app users.

### 10.2 Trusted publishing credentials

GitHub credentials needed to publish releases exist only in a trusted publisher environment.

They must not:
- be compiled into SUD-D;
- be stored in the public release repository;
- be written to SQLite/audit/logs;
- cross renderer IPC.

The installed updater only needs anonymous/public read access to release metadata and artifacts.

---

## 11. Git Revision Integration

The existing Git Revision Feedback feature remains separate from packaged app update behavior.

Development checkout:
- Git page continues to show source revision and `Get latest`.

Installed application:
- Update/About surface shows packaged Version + build Revision.
- Normal installed users do not need Git to update SUD-D.

Example:

```text
SUD-D v0.2.1
Revision 5c9a3dc
```

This makes Home/Work issue reports diagnosable even when both machines have the same Version but were accidentally built from different revisions.

A release verification gate must prevent publishing a release whose declared revision does not match the source revision actually used for the build.

---

## 12. Failure and Recovery Behavior

MVP deliberately avoids a full automatic rollback engine.

Required behavior:
- check failure → existing app continues;
- download failure → existing app continues;
- verification failure → update cannot be installed;
- user declines/restarts later → existing app continues;
- update is not installed until explicit `Restart & Update`;
- prior release installers remain available in the release repository during Personal Alpha for manual recovery;
- a bad release is repaired by releasing a higher version.

The updater must never attempt silent downgrade.

The updater must never delete/reinitialize local user data as a recovery technique.

---

## 13. Acceptance Criteria

The MVP is accepted only when all of the following are demonstrated on real Windows installations.

### Installer
- `SUD-D Setup x.x.x.exe` installs per-user.
- Normal installation does not require admin rights.
- SUD-D launches successfully after install.
- SmartScreen warning, if shown, is documented as an accepted unsigned-Alpha limitation.

### Update discovery
- Startup performs an update check without blocking normal application startup indefinitely.
- Manual `Check for updates` works.
- No newer release shows `You're up to date · vX.Y.Z`.
- Newer release shows target version and release notes.

### User control
- Update is not downloaded until user clicks `Download Update`.
- Update is not installed until user clicks `Restart & Update`.
- No silent forced restart.

### Verification/security
- Valid signed manifest + matching SHA-512 permits ready-to-install.
- Invalid manifest signature is rejected.
- Artifact hash mismatch is rejected.
- Version/manifest mismatch is rejected.
- Installed client requires no GitHub write credential.
- Renderer receives no token/private key/arbitrary process authority.

### Data preservation
After a real version upgrade:
- Workspace state survives;
- SQLite state survives;
- credentials remain usable;
- settings survive;
- audit/history survives;
- app opens on the new Version.

### Release notes
- Available-update screen shows `New / Improved / Fixed` when populated.
- first launch after upgrade can show the same release summary once.
- GitHub Release and in-app release notes derive from the same canonical release metadata.

### Diagnostics
- UI exposes both packaged Version and build Revision.
- release build verification confirms declared Revision equals build source revision.

### Failure safety
- failed check/download/verification leaves current installation usable;
- false `ready` or false `updated` success state is never shown;
- update errors expose only safe error codes/messages.

---

## 14. Verification Strategy

Use risk-based verification.

Security/data-critical paths require strict tests:
- manifest canonicalization/signature verification;
- artifact hash verification;
- update state transitions;
- renderer/main IPC validation;
- no auto-download/no auto-install behavior;
- data-root preservation;
- release revision/version binding.

Packaging/runtime verification:
- production desktop build;
- NSIS installer build;
- fresh-install smoke;
- installed-app startup smoke;
- local/test release endpoint update check;
- real `vA → vB` install/update/restart smoke;
- Home/Work Personal Alpha acceptance before declaring COMPLETE.

Where practical, updater-network tests should use deterministic fixtures rather than depending on live GitHub for every automated run.

---

## 15. Explicit Non-Goals for MVP

Do not add:
- paid Authenticode/code-signing certificate;
- multiple update channels;
- automatic background download;
- silent/forced updates;
- automatic downgrade;
- full automatic rollback engine;
- enterprise deployment/MSI management;
- cross-platform macOS/Linux packaging;
- cloud account/device management;
- source-repository exposure;
- generic network/process authority in renderer;
- automatic publishing on every `master` merge.

These require separate PO approval if needed later.

---

## 16. Implementation Boundaries

The implementation should be decomposed into clear units:

1. **Packaging/Version metadata**
   - NSIS builder config;
   - canonical version/revision injection.

2. **Release metadata/signing**
   - canonical release manifest;
   - Ed25519 signing CLI used only in trusted release context;
   - verification library used at runtime.

3. **Main-process updater service**
   - fixed-purpose update state machine;
   - `electron-updater` integration;
   - safe shutdown/install coordination.

4. **Strict Desktop contracts/preload IPC**
   - status read/subscription;
   - `check`;
   - `download`;
   - `restartAndInstall`;
   - no generic URL/process surface.

5. **Update UI**
   - Version/Revision;
   - status;
   - release notes;
   - Download / Restart & Update.

6. **Release tooling**
   - version bump;
   - release note payload;
   - build;
   - sign;
   - verify;
   - publish after PO gate.

7. **Installer/update acceptance**
   - real Windows fresh install;
   - real two-version update;
   - local-data preservation;
   - Home/Work dogfood.

Implementation must follow existing SUD-D architecture/security conventions and repository governance. Any discovery that requires broader process/network authority, credential exposure, or a new cloud service is a stop condition requiring PO/design review.

---

## 17. Completion Definition

This milestone is COMPLETE only when:
- a real installer has been produced and installed;
- a second higher version has been published through the approved release flow;
- an installed SUD-D detects it;
- the user manually downloads it;
- SUD-D verifies it;
- the user chooses `Restart & Update`;
- SUD-D launches on the new version;
- Version and Revision are correct;
- local user data remains intact;
- Home/Work Personal Alpha acceptance passes;
- `SUD_D_HANDOFF.md` records the verified result.

Until then, implementation or build success alone is not sufficient to call the updater complete.
