# Installer + In-App Update MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a free Windows Personal Alpha installer and explicit in-app update flow for SUD-D, with signed release metadata, preserved local data, user-facing release notes, and no GitHub write token in installed clients.

**Architecture:** Keep release/update authority in the Electron main process behind strict fixed-purpose IPC. Package with `electron-builder`/NSIS, use `electron-updater` with `autoDownload=false` and no automatic install-on-quit, and add a SUD-D Ed25519-signed release manifest whose exact payload binds Version, Revision, release notes, and installer SHA-512. Publish only distributable artifacts to a separate public release-only repository after an explicit PO release gate.

**Tech Stack:** TypeScript, Electron 36, React 18, Zod contracts, Node 24 crypto/fs, `electron-builder` 25, `electron-updater`, Vitest, pnpm 10, Windows NSIS.

**Spec:** `docs/superpowers/specs/2026-09-17-installer-in-app-update-design.md`

## Global Constraints

- Windows only for this MVP.
- NSIS per-user install; no administrator requirement on the normal path.
- No paid Authenticode/code-signing certificate.
- One update channel only: `latest`.
- Startup check is allowed; automatic download is forbidden.
- Installation/restart occurs only after the user clicks `Restart & Update`.
- Source repository stays private: `JekdoTH/SUD_D`.
- Public release-only repository: `JekdoTH/SUD_D-Releases`.
- Installed clients contain no GitHub write token, private signing key, generic process authority, arbitrary URL execution authority, or renderer-selected executable/argv/cwd/env.
- Canonical application Version comes from `packages/desktop/package.json`.
- Build Revision must match the Git source revision used for that build.
- Release notes use only `New`, `Improved`, and `Fixed`.
- User data root, SQLite, credentials, settings, approvals, audit/history, and Work Memory must survive upgrades.
- Updater errors fail closed and expose only safe user-facing messages/codes.
- Publishing a release requires a separate explicit PO release approval. Implementation completion does not imply release approval.
- Do not publish on every `master` merge.
- Do not add multiple channels, silent updates, auto-downgrade, automatic rollback, MSI/enterprise deployment, macOS/Linux packaging, or a new cloud service.
- Follow existing SUD-D security architecture and repository governance.
- Start from latest verified `master`; create `feat/installer-in-app-update-mvp`.
- `.serena/` remains local-only.

---

## File Structure Locked by This Plan

### New files

- `docs/superpowers/specs/2026-09-17-installer-in-app-update-design.md`
  - Approved product/architecture design.
- `docs/superpowers/plans/2026-09-17-installer-in-app-update.md`
  - This implementation plan.
- `packages/desktop/electron/update-manifest.ts`
  - Runtime manifest decoding, Ed25519 verification, safe parsed release metadata, and SHA-512 helpers.
- `packages/desktop/electron/update-controller.ts`
  - Deterministic update state machine and orchestration.
- `packages/desktop/electron/update-provider.ts`
  - Narrow provider interface plus real `electron-updater` adapter.
- `packages/desktop/electron/update-ipc.ts`
  - Fixed-purpose IPC handlers: status/check/download/restart.
- `packages/desktop/src/pages/UpdatePage.tsx`
  - Version/Revision, release notes, update actions/status.
- `scripts/release/create-manifest.mjs`
  - Trusted release-side manifest creation/signing.
- `scripts/release/verify-release.mjs`
  - Release-side independent signature/hash/revision/version verification.
- `scripts/release/bump-version.mjs`
  - Bounded SemVer `patch|minor` desktop version bump.
- `scripts/release/render-release-notes.mjs`
  - Render canonical release note payload to GitHub-release Markdown.
- `packages/tests/src/update-manifest-security.test.ts`
  - Signature/hash/version binding tests.
- `packages/tests/src/update-controller.test.ts`
  - State-machine tests with deterministic fake provider.
- `packages/tests/src/update-desktop-ipc.test.ts`
  - Contract/preload/IPC authority tests.
- `packages/tests/src/update-ui.test.ts`
  - Static UI/source contract tests consistent with the repo's current test style.
- `packages/tests/src/update-packaging.test.ts`
  - Packaging/version/revision/data-path config assertions.
- `packages/tests/src/update-release-tooling.test.ts`
  - Release scripts, manifest, notes, and version bump tests.
- `packages/tests/src/update-data-preservation.test.ts`
  - Deterministic data-root preservation tests around installer/runtime boundaries.
- `docs/release/RELEASE_NOTES.template.json`
  - Canonical release-note input shape with empty arrays, safe for copy/use.
- `docs/release/PERSONAL_ALPHA_INSTALL.md`
  - SmartScreen/install/update/recovery instructions for two-user Alpha.

### Existing files to modify

- `packages/contracts/src/index.ts`
  - Add validated update DTO schemas and IPC channel constants.
- `packages/desktop/package.json`
  - Add `electron-updater`; package/build scripts; `electron-builder` config or pointer.
- `package.json`
  - Add root bounded release/package scripts.
- `pnpm-lock.yaml`
  - Dependency lock update.
- `packages/desktop/electron/main.ts`
  - Compose updater controller/provider, register IPC, start packaged-app startup check, orderly shutdown hook.
- `packages/desktop/electron/preload.ts`
  - Expose narrow `window.sudD.update` API.
- `packages/desktop/src/global.d.ts`
  - Type the new fixed update API.
- `packages/desktop/src/App.tsx`
  - Add Update navigation/route using the existing app shell pattern.
- `packages/desktop/src/index.css`
  - Minimal Update-page styles using existing tokens/patterns.
- `packages/desktop/vite.config.ts`
  - Inject build revision into renderer/main build only if existing environment/define mechanism cannot supply it safely.
- `SUD_D_HANDOFF.md`
  - Record implementation/verification/release gates and later PO acceptance.

No existing Git, Tool Kernel, Policy, Approval, Team, Connection, or MCP authority file should change unless a failing test proves an unavoidable integration dependency. If such a dependency appears, stop for PO/design review before broadening scope.

---

# Task 0: Persist Approved Design and Plan; Create Isolated Feature Branch

**Files:**
- Create: `docs/superpowers/specs/2026-09-17-installer-in-app-update-design.md`
- Create: `docs/superpowers/plans/2026-09-17-installer-in-app-update.md`

**Interfaces:**
- Consumes: PO-approved design text and this plan.
- Produces: committed durable design/plan on `feat/installer-in-app-update-mvp`.

- [ ] **Step 1: Verify starting state**

Run:

```powershell
git switch master
git fetch origin
git status --short --branch
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count master...origin/master
```

Expected:
- clean tracked working tree;
- `master` and `origin/master` are not diverged;
- no destructive cleanup is needed.

If the worktree is not clean, preserve user work and stop. Do not reset/clean/discard.

- [ ] **Step 2: Create isolated feature branch**

Run:

```powershell
git switch -c feat/installer-in-app-update-mvp
```

Expected: active branch is `feat/installer-in-app-update-mvp`.

- [ ] **Step 3: Add the approved design and this plan at the exact paths above**

The design file content must match the PO-approved design, including:
- public release-only repo;
- no paid code signing;
- explicit Download and Restart & Update;
- Ed25519 signed manifest;
- Version vs Revision;
- release notes categories;
- data preservation;
- explicit PO release gate.

- [ ] **Step 4: Commit planning documents before production changes**

Run:

```powershell
git add docs/superpowers/specs/2026-09-17-installer-in-app-update-design.md docs/superpowers/plans/2026-09-17-installer-in-app-update.md
git diff --cached --check
git commit -m "docs: plan installer and in-app update"
```

Expected: one docs-only commit; no production code changed.

---

# Task 1: Add Update Contracts and Safe IPC Surface

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/tests/src/update-desktop-ipc.test.ts`

**Interfaces:**
- Produces these safe renderer-facing types:
  - `UpdateReleaseNotesDto`
  - `DesktopUpdatePhase`
  - `DesktopUpdateStatusDto`
  - `UpdateActionInputSchema`
  - fixed IPC channels for `status`, `check`, `download`, `restartAndInstall`
- No URL, local installer path, token, public/private key, executable, argv, cwd, or env appears in renderer-facing DTOs.

- [ ] **Step 1: Write failing contract tests**

Add tests asserting the public shape is equivalent to:

```ts
type UpdateReleaseNotesDto = {
  new: string[];
  improved: string[];
  fixed: string[];
};

type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up_to_date'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'error'
  | 'unavailable';

type DesktopUpdateStatusDto = {
  phase: DesktopUpdatePhase;
  currentVersion: string;
  currentRevision: string;
  targetVersion: string | null;
  targetRevision: string | null;
  progressPercent: number | null;
  releaseNotes: UpdateReleaseNotesDto | null;
  errorCode: 'CHECK_FAILED' | 'DOWNLOAD_FAILED' | 'VERIFY_FAILED' | 'INSTALL_FAILED' | null;
};
```

Also assert:
- versions are strict SemVer `x.y.z`;
- revisions are lowercase/uppercase hex SHA length 40 internally, formatted to 7 chars only in UI;
- `progressPercent` is null or within `0..100`;
- note arrays contain bounded non-empty strings;
- unknown fields fail validation.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
pnpm --filter @sud-d/contracts build
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
```

Expected: FAIL because update schemas/channels do not exist.

- [ ] **Step 3: Add minimal Zod schemas and IPC constants**

In `packages/contracts/src/index.ts`, use the file's existing schema style. Add strict schemas whose inferred TS types match the shape above.

Required channel names:

```ts
UPDATE_STATUS: 'update:status'
UPDATE_CHECK: 'update:check'
UPDATE_DOWNLOAD: 'update:download'
UPDATE_RESTART_AND_INSTALL: 'update:restart-and-install'
```

Do not add a renderer-provided URL or file path input.

- [ ] **Step 4: Run focused test and contracts build**

Run:

```powershell
pnpm --filter @sud-d/contracts build
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/contracts/src/index.ts packages/tests/src/update-desktop-ipc.test.ts
git commit -m "feat: add desktop update contracts"
```

---

# Task 2: Implement Signed Release Manifest Verification

**Files:**
- Create: `packages/desktop/electron/update-manifest.ts`
- Create: `packages/tests/src/update-manifest-security.test.ts`
- Modify: `packages/desktop/package.json` only if a dependency is actually needed; prefer Node built-in `crypto`.

**Interfaces:**
- Consumes a signed envelope:
  - `payload`: base64url of UTF-8 canonical JSON bytes
  - `signature`: base64url Ed25519 signature
- Produces:
  - `VerifiedReleaseManifest`
  - safe verification error code without raw payload leakage
- Runtime public key is a fixed compiled value supplied at build/release configuration time; private key never exists in runtime code.

Use an envelope so runtime verifies the exact signed payload bytes and never needs to reconstruct JSON key order.

Canonical decoded payload shape:

```ts
type ReleaseManifestPayload = {
  schemaVersion: 1;
  version: string;
  revision: string;       // full 40-hex Git SHA
  releaseDate: string;    // ISO-8601 UTC
  channel: 'latest';
  artifactFileName: string;
  artifactSha512: string; // lowercase 128-hex SHA-512
  releaseNotes: {
    new: string[];
    improved: string[];
    fixed: string[];
  };
};
```

- [ ] **Step 1: Write failing security tests**

Cover:
1. valid Ed25519 signature accepts;
2. one-byte payload mutation rejects;
3. signature mutation rejects;
4. unsupported schemaVersion rejects;
5. non-`latest` channel rejects;
6. malformed artifact filename rejects path separators;
7. malformed SHA-512 rejects;
8. malformed SemVer rejects;
9. malformed Git revision rejects;
10. safe error does not include payload, signature, local paths, or key bytes.

Generate ephemeral Ed25519 test key pairs with Node `crypto.generateKeyPairSync('ed25519')`; do not check in private test keys.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-manifest-security.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement minimal verifier**

`update-manifest.ts` should expose pure functions equivalent to:

```ts
export function verifyReleaseEnvelope(
  raw: unknown,
  publicKeyPem: string,
): { ok: true; value: VerifiedReleaseManifest } | { ok: false; code: 'VERIFY_FAILED' };

export async function sha512FileHex(filePath: string): Promise<string>;
```

Rules:
- validate outer envelope before decoding;
- decode payload base64url;
- verify Ed25519 signature over exact decoded payload bytes;
- parse JSON only after signature verification succeeds;
- validate payload with strict Zod schemas;
- return safe typed values;
- hash file using a stream, not `readFile()` of the whole installer;
- never log private data/raw response bodies from failure paths.

- [ ] **Step 4: Run tests and typecheck**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-manifest-security.test.ts --reporter=verbose
pnpm --filter @sud-d/desktop typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/desktop/electron/update-manifest.ts packages/tests/src/update-manifest-security.test.ts
git commit -m "feat: verify signed release manifests"
```

---

# Task 3: Build Deterministic Update Controller Before Live Network Integration

**Files:**
- Create: `packages/desktop/electron/update-controller.ts`
- Create: `packages/desktop/electron/update-provider.ts`
- Create: `packages/tests/src/update-controller.test.ts`

**Interfaces:**
- `UpdateProvider` is fixed-purpose and contains no generic fetch/process entry point:

```ts
export type ProviderUpdateInfo = {
  version: string;
};

export type DownloadedUpdate = {
  filePath: string; // main-process internal only
};

export interface UpdateProvider {
  check(): Promise<{ available: false } | { available: true; info: ProviderUpdateInfo }>;
  download(): Promise<DownloadedUpdate>;
  restartAndInstall(): void;
}
```

- Add a separate fixed manifest loader dependency to the controller, injected for tests:

```ts
export type SignedManifestLoader = () => Promise<unknown>;
```

- Controller public API:

```ts
export interface DesktopUpdateController {
  getStatus(): DesktopUpdateStatusDto;
  check(): Promise<IpcResult<DesktopUpdateStatusDto>>;
  download(): Promise<IpcResult<DesktopUpdateStatusDto>>;
  restartAndInstall(): Promise<IpcResult<null>>;
  checkOnStartup(): void;
}
```

- [ ] **Step 1: Write failing state-machine tests**

Use fake provider/manifest loader. Cover:
1. startup check enters `checking` then `up_to_date`;
2. startup check failure ends `error/CHECK_FAILED` and does not throw into app startup;
3. newer provider version + valid matching signed manifest → `available`;
4. manifest version mismatch → `error/VERIFY_FAILED`;
5. `download()` rejected unless phase is `available`;
6. no provider download occurs automatically after `check`;
7. download event goes `downloading` → `verifying` → `ready` only after installer SHA-512 matches signed manifest;
8. hash mismatch → `error/VERIFY_FAILED`, never `ready`;
9. `restartAndInstall()` rejected unless `ready`;
10. `restartAndInstall()` calls injected orderly-shutdown callback before provider install;
11. duplicate check/download while an operation is already running fails safely;
12. no failure path shows false target/update success.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-controller.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement the controller with immutable status snapshots**

Controller dependencies:

```ts
type UpdateControllerDeps = {
  currentVersion: string;
  currentRevision: string;
  publicKeyPem: string;
  provider: UpdateProvider;
  loadSignedManifest: SignedManifestLoader;
  orderlyShutdown: () => Promise<void>;
  isPackaged: boolean;
};
```

Behavior:
- if `isPackaged=false`, startup check does no network and returns phase `unavailable`;
- manual live operations in development also remain unavailable unless tests inject packaged=true;
- all target metadata comes from verified manifest;
- compare versions using a bounded SemVer helper local to the controller; no prerelease/channel complexity in MVP;
- public DTO never exposes `filePath`.

- [ ] **Step 4: Run focused tests**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-controller.test.ts packages/tests/src/update-manifest-security.test.ts --reporter=verbose
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/desktop/electron/update-controller.ts packages/desktop/electron/update-provider.ts packages/tests/src/update-controller.test.ts
git commit -m "feat: add update state machine"
```

---

# Task 4: Integrate `electron-updater` Behind the Provider Adapter

**Files:**
- Modify: `packages/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/desktop/electron/update-provider.ts`
- Test: `packages/tests/src/update-controller.test.ts`
- Test: `packages/tests/src/update-desktop-ipc.test.ts`

**Interfaces:**
- Real provider owns `autoUpdater`; renderer never imports `electron-updater`.
- Fixed release repository:
  - owner: `JekdoTH`
  - repo: `SUD_D-Releases`
  - channel: `latest`
- Stable signed-manifest URL:
  - `https://github.com/JekdoTH/SUD_D-Releases/releases/latest/download/sud-d-release.json`

- [ ] **Step 1: Add failing source/security assertions**

Tests must assert real adapter configuration contains:
- `autoDownload = false`;
- `autoInstallOnAppQuit = false`;
- no renderer-supplied provider URL;
- no `GH_TOKEN`/GitHub write token passed into runtime updater;
- release repository owner/name are fixed build-time constants.

- [ ] **Step 2: Add `electron-updater` dependency**

Run:

```powershell
pnpm --filter @sud-d/desktop add electron-updater
```

Do not add a generic HTTP client package unless required. Prefer Electron/Node built-ins for the fixed manifest GET.

- [ ] **Step 3: Implement real provider**

Use `autoUpdater.checkForUpdates()`, `downloadUpdate()`, and `quitAndInstall(...)` only inside `update-provider.ts`.

The provider must:
- normalize provider exceptions to safe controller errors;
- retain downloaded installer file path only in main-process memory;
- not install on its own;
- not emit renderer-accessible local file paths;
- not consume arbitrary URLs from IPC.

Manifest loading must fetch only the fixed HTTPS URL above and enforce:
- HTTP success;
- bounded response size before JSON parse;
- JSON only;
- timeout/abort;
- no redirects to non-HTTPS/non-GitHub hosts. If Electron's updater performs internal provider redirects, that does not grant a generic renderer URL surface.

- [ ] **Step 4: Run focused tests and desktop typecheck**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-controller.test.ts packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
pnpm --filter @sud-d/desktop typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add packages/desktop/package.json pnpm-lock.yaml packages/desktop/electron/update-provider.ts packages/tests/src/update-controller.test.ts packages/tests/src/update-desktop-ipc.test.ts
git commit -m "feat: connect bounded desktop updater"
```

---

# Task 5: Register Strict Update IPC and Preload API

**Files:**
- Create: `packages/desktop/electron/update-ipc.ts`
- Modify: `packages/desktop/electron/main.ts`
- Modify: `packages/desktop/electron/preload.ts`
- Modify: `packages/desktop/src/global.d.ts`
- Test: `packages/tests/src/update-desktop-ipc.test.ts`

**Interfaces:**
- Renderer API must be exactly:

```ts
window.sudD.update.status(): Promise<IpcResult<DesktopUpdateStatusDto>>
window.sudD.update.check(): Promise<IpcResult<DesktopUpdateStatusDto>>
window.sudD.update.download(): Promise<IpcResult<DesktopUpdateStatusDto>>
window.sudD.update.restartAndInstall(): Promise<IpcResult<null>>
```

Do not expose:
- provider URL;
- local path;
- signature/public/private key;
- raw network response;
- process command;
- install arguments.

- [ ] **Step 1: Extend failing IPC tests**

Assert:
- invalid sender is rejected;
- extra IPC arguments are rejected/ignored by a no-input schema, following current contract style;
- returned status is validated before renderer exposure;
- preload exposes only the four fixed methods;
- no `ipcRenderer` object leaks to renderer.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement `update-ipc.ts` following existing `git-ipc.ts` / `overview-status-ipc.ts` patterns**

Use the same sender validation passed from `main.ts`.

- [ ] **Step 4: Compose in `main.ts`**

Use:
- `app.getVersion()` for packaged current Version;
- an embedded build revision constant/environment that is produced by Task 6;
- existing `getDataRoot()`/DB ownership rather than a new data path.

Orderly shutdown callback must close owned runtime resources that already have explicit stop/close methods and then close the SQLite DB before install. Do not invent deletion/reinitialization.

Register IPC alongside existing fixed-purpose handlers.

Call `controller.checkOnStartup()` only after app readiness/window initialization has reached a safe point, and it must not block the window from opening indefinitely.

- [ ] **Step 5: Implement preload/global typing**

Follow existing `contextBridge` pattern.

- [ ] **Step 6: Run tests/typecheck**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-desktop-ipc.test.ts packages/tests/src/update-controller.test.ts --reporter=verbose
pnpm --filter @sud-d/desktop typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/desktop/electron/update-ipc.ts packages/desktop/electron/main.ts packages/desktop/electron/preload.ts packages/desktop/src/global.d.ts packages/tests/src/update-desktop-ipc.test.ts
git commit -m "feat: expose fixed desktop update ipc"
```

---

# Task 6: Package Version + Build Revision + NSIS Installer Configuration

**Files:**
- Modify: `packages/desktop/package.json`
- Modify: `packages/desktop/vite.config.ts` if needed
- Modify: `package.json`
- Create: `packages/tests/src/update-packaging.test.ts`

**Interfaces:**
- Canonical Version: `packages/desktop/package.json#version`.
- Full Revision is injected at build time from `git rev-parse HEAD`.
- Packaged renderer/main can read Revision but cannot invoke Git to discover it at runtime.
- Installer output: `SUD-D Setup <version>.exe`.

- [ ] **Step 1: Write failing packaging tests**

Tests should load config/scripts and assert:
- `electron-builder` Windows target is NSIS;
- `perMachine: false`;
- normal path does not request elevation;
- artifact name includes `${version}`;
- app data is not packaged from local SUD-D data root;
- updater publish provider points to public release repo only;
- build revision is required for package/release commands and matches 40-hex;
- package version is strict SemVer.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-packaging.test.ts --reporter=verbose
```

- [ ] **Step 3: Configure electron-builder**

Prefer `packages/desktop/package.json` unless config complexity materially harms readability.

Required equivalent builder configuration:

```json
{
  "appId": "local.sudd.desktop",
  "productName": "SUD-D",
  "win": {
    "target": ["nsis"]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowElevation": false,
    "allowToChangeInstallationDirectory": true
  },
  "artifactName": "SUD-D Setup ${version}.${ext}",
  "publish": [{
    "provider": "github",
    "owner": "JekdoTH",
    "repo": "SUD_D-Releases",
    "releaseType": "release"
  }]
}
```

If `allowElevation=false` proves incompatible with electron-builder's required per-user behavior on the current version, preserve **no-admin normal path** and document the exact supported setting after a real installer smoke; do not silently change to machine-wide install.

- [ ] **Step 4: Add package scripts**

Desktop scripts must include equivalent bounded operations:

```json
{
  "package:win": "...build app then electron-builder --win nsis --publish never"
}
```

Root scripts:

```json
{
  "package:win": "pnpm --filter @sud-d/desktop package:win"
}
```

Do not add `--publish always` to normal build/package scripts.

- [ ] **Step 5: Inject build revision**

At package time:
1. resolve `git rev-parse HEAD`;
2. require full 40-hex SHA;
3. expose it as a compile-time constant, e.g. `__SUD_D_BUILD_REVISION__`;
4. use the same value in release manifest generation;
5. fail package/release if unavailable or dirty-source policy from Task 10 is violated.

Development builds may show the checkout revision if available; packaged release must never use `unknown`.

- [ ] **Step 6: Run packaging tests, typecheck, production build**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-packaging.test.ts --reporter=verbose
pnpm --filter @sud-d/desktop typecheck
pnpm build
```

- [ ] **Step 7: Commit**

```powershell
git add package.json packages/desktop/package.json packages/desktop/vite.config.ts packages/tests/src/update-packaging.test.ts
git commit -m "feat: configure windows installer packaging"
```

Only stage `vite.config.ts` if actually changed.

---

# Task 7: Build the Update UI and Release Notes Experience

**Files:**
- Create: `packages/desktop/src/pages/UpdatePage.tsx`
- Modify: `packages/desktop/src/App.tsx`
- Modify: `packages/desktop/src/index.css`
- Create: `packages/tests/src/update-ui.test.ts`

**Interfaces:**
- Consumes only `window.sudD.update.*`.
- Displays Version and 7-char Revision.
- Release notes render from `new`, `improved`, `fixed`.
- Buttons map exactly to `check`, `download`, `restartAndInstall`.

- [ ] **Step 1: Write failing UI/source tests**

Cover:
- `SUD-D v<version>`;
- `Revision <7-char>`;
- `You're up to date · vX.Y.Z`;
- `Update available · vX.Y.Z`;
- category headings only when category has entries;
- Download button only for `available`;
- Restart button only for `ready`;
- checking/downloading/verifying buttons disabled appropriately;
- error copy contains no raw error/detail field;
- Update page does not accept/display local installer paths or URLs.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-ui.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement `UpdatePage.tsx`**

Use existing card/status/button patterns.

Copy requirements:

`up_to_date`:
```text
You're up to date · v0.2.0
```

`available`:
```text
Update available · v0.2.1
What's new
New
Improved
Fixed
```

`downloading`:
```text
Downloading v0.2.1 · 64%
```
Only include percentage when non-null.

`verifying`:
```text
Verifying update…
```

`ready`:
```text
v0.2.1 is ready
Restart & Update
```

`error`:
- `CHECK_FAILED`: `Couldn't check for updates. Your current version is unchanged.`
- `DOWNLOAD_FAILED`: `Couldn't download the update. Your current version is unchanged.`
- `VERIFY_FAILED`: `Update couldn't be verified. SUD-D was not changed.`
- `INSTALL_FAILED`: `SUD-D couldn't start the update. Your current version is unchanged.`

- [ ] **Step 4: Add Update navigation/route**

Follow the existing App shell navigation model. Do not create a second router system.

- [ ] **Step 5: Add minimal CSS**

Reuse existing variables/card typography/spacing. No unrelated redesign.

- [ ] **Step 6: Run test/typecheck/build**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-ui.test.ts packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
pnpm --filter @sud-d/desktop typecheck
pnpm --filter @sud-d/desktop build
```

- [ ] **Step 7: Commit**

```powershell
git add packages/desktop/src/pages/UpdatePage.tsx packages/desktop/src/App.tsx packages/desktop/src/index.css packages/tests/src/update-ui.test.ts
git commit -m "feat: add in-app update experience"
```

---

# Task 8: Add Canonical Release Notes and One-Time Post-Update Summary

**Files:**
- Create: `docs/release/RELEASE_NOTES.template.json`
- Modify: `packages/desktop/electron/update-controller.ts`
- Modify: `packages/desktop/src/pages/UpdatePage.tsx`
- Test: `packages/tests/src/update-controller.test.ts`
- Test: `packages/tests/src/update-ui.test.ts`

**Interfaces:**
- Canonical input:

```json
{
  "new": [],
  "improved": [],
  "fixed": []
}
```

- One-time post-update summary state contains only:
  - installed version;
  - release notes;
  - acknowledged boolean/version marker.

- [ ] **Step 1: Write failing tests**

Cover:
- after current Version increases from persisted previous installed Version, controller exposes `Updated to vX.Y.Z` summary;
- summary uses notes from the verified manifest cached in safe local metadata before restart;
- acknowledgement hides it on subsequent launch;
- no credentials/private key/raw manifest are persisted;
- if no prior version marker exists (fresh install), do not pretend an update occurred.

- [ ] **Step 2: Implement minimal safe persistence**

Use the existing local data root, in a small dedicated non-secret JSON state file or existing settings repository if it already supports generic safe settings cleanly.

Preferred file if no suitable repository exists:

```text
<dataRoot>/update-state.json
```

Allowed fields only:

```ts
type PersistedUpdateState = {
  lastSeenVersion: string;
  pendingSummary: {
    version: string;
    releaseNotes: UpdateReleaseNotesDto;
  } | null;
};
```

Use atomic write (`temp` + rename) and bounded JSON validation. Do not store signatures, raw responses, download paths, tokens, or private key material.

- [ ] **Step 3: Update UI**

Show one-time card:

```text
Updated to v0.2.1
Changes in this update
```

Reuse category renderer.

- [ ] **Step 4: Run tests**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-controller.test.ts packages/tests/src/update-ui.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```powershell
git add docs/release/RELEASE_NOTES.template.json packages/desktop/electron/update-controller.ts packages/desktop/src/pages/UpdatePage.tsx packages/tests/src/update-controller.test.ts packages/tests/src/update-ui.test.ts
git commit -m "feat: show release notes after update"
```

---

# Task 9: Prove User Data Preservation Boundary

**Files:**
- Create: `packages/tests/src/update-data-preservation.test.ts`
- Modify: `packages/desktop/electron/main.ts` only if shutdown sequencing needs a testable extraction.

**Interfaces:**
- Existing data root remains `getDataRoot()`.
- Installer application directory is never used as SQLite/credential/settings storage.
- Orderly shutdown closes runtime ownership and DB; it does not delete data.

- [ ] **Step 1: Write failing preservation tests**

Use a temporary data root and deterministic fixtures to assert:
- SQLite file exists outside packaged application resources/install root;
- workspace/audit/update-state fixtures are unchanged by package/update orchestration;
- orderly shutdown closes DB so installer can replace binaries;
- no updater code calls `rm`, `unlink`, directory recreation, DB reset, or credential deletion on failure;
- no release/package config includes local data root contents.

- [ ] **Step 2: Run RED if an extraction is needed**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-data-preservation.test.ts --reporter=verbose
```

- [ ] **Step 3: Extract only the minimum shutdown coordinator if necessary**

Example interface:

```ts
export async function prepareForDesktopUpdate(deps: {
  stopConnection: () => Promise<void> | void;
  closeDatabase: () => void;
}): Promise<void>
```

Do not add generic process killing.

If existing lifecycle methods already provide this cleanly, test them directly and do not create an extra abstraction.

- [ ] **Step 4: Run preservation + critical desktop tests**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-data-preservation.test.ts packages/tests/src/update-controller.test.ts packages/tests/src/update-desktop-ipc.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```powershell
git add packages/tests/src/update-data-preservation.test.ts packages/desktop/electron/main.ts
git commit -m "test: protect local data across updates"
```

Only stage `main.ts` if changed.

---

# Task 10: Add Trusted Release Tooling (No Automatic Publish)

**Files:**
- Create: `scripts/release/create-manifest.mjs`
- Create: `scripts/release/verify-release.mjs`
- Create: `scripts/release/bump-version.mjs`
- Create: `scripts/release/render-release-notes.mjs`
- Create: `packages/tests/src/update-release-tooling.test.ts`
- Modify: `package.json`

**Interfaces:**
- Private signing key is supplied only through a release-machine environment variable pointing to a key file:
  - `SUD_D_RELEASE_PRIVATE_KEY_FILE`
- No private key content is accepted as CLI argument because arguments may leak through process inspection/history.
- Release note input file path is repository-relative and bounded to `docs/release/`.
- Output is written only under `dist-release/`.
- Publishing is not part of these scripts.

- [ ] **Step 1: Write failing release-tool tests**

Cover:
1. `bump-version patch` from `0.1.0` → `0.1.1`;
2. `bump-version minor` from `0.1.1` → `0.2.0`;
3. invalid mode rejects;
4. release note JSON rejects unknown keys and non-string entries;
5. manifest creation refuses dirty tracked worktree;
6. manifest creation reads full Git HEAD revision and package version;
7. manifest creation hashes named installer;
8. manifest creation signs exact payload with key from key-file env;
9. private key content is absent from stdout/stderr/output JSON;
10. verification independently verifies signature/hash/version/revision;
11. release-notes Markdown is generated from same canonical JSON.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-release-tooling.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement bounded scripts**

Required CLI surface:

```text
node scripts/release/bump-version.mjs patch
node scripts/release/bump-version.mjs minor
node scripts/release/create-manifest.mjs docs/release/release-notes.json
node scripts/release/verify-release.mjs
node scripts/release/render-release-notes.mjs docs/release/release-notes.json
```

`create-manifest.mjs` must:
- fail if `git status --porcelain --untracked-files=no` is non-empty;
- read `packages/desktop/package.json`;
- read exact `git rev-parse HEAD`;
- locate exactly one expected installer in `dist-release/`;
- compute SHA-512;
- create ordered payload object;
- UTF-8 JSON stringify;
- sign bytes using Ed25519 private key;
- write `dist-release/sud-d-release.json`.

Never print the key or environment.

- [ ] **Step 4: Add root scripts**

Equivalent:

```json
{
  "release:bump:patch": "node scripts/release/bump-version.mjs patch",
  "release:bump:minor": "node scripts/release/bump-version.mjs minor",
  "release:manifest": "node scripts/release/create-manifest.mjs docs/release/release-notes.json",
  "release:verify": "node scripts/release/verify-release.mjs"
}
```

Do not add automatic GitHub publication to these commands.

- [ ] **Step 5: Run tests**

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run packages/tests/src/update-release-tooling.test.ts packages/tests/src/update-manifest-security.test.ts --reporter=verbose
```

- [ ] **Step 6: Commit**

```powershell
git add scripts/release packages/tests/src/update-release-tooling.test.ts package.json
git commit -m "feat: add trusted release tooling"
```

---

# Task 11: Build Real Unsigned NSIS Installer and Run Fresh-Install Smoke

**Files:**
- Modify: `docs/release/PERSONAL_ALPHA_INSTALL.md`
- Modify: `SUD_D_HANDOFF.md`
- No production source change unless a real packaging defect is reproduced first.

**Interfaces:**
- Input: verified feature branch at a clean revision.
- Output: local `dist-release/SUD-D Setup <version>.exe` plus updater metadata.
- No publication yet.

- [ ] **Step 1: Generate a disposable local test signing key outside the repository**

Use PowerShell/Node to create a test-only Ed25519 key pair under a user temp directory, never inside repo and never commit it.

The production Personal Alpha signing key will be created later at the explicit release gate; the local test key only proves mechanics.

- [ ] **Step 2: Create local test release notes**

Create `docs/release/release-notes.json`:

```json
{
  "new": [
    "Windows installer and in-app update controls"
  ],
  "improved": [
    "Version and build revision are visible in the Update screen"
  ],
  "fixed": []
}
```

This file is candidate metadata; do not call it published release notes yet.

- [ ] **Step 3: Build installer without publishing**

Run the project package command equivalent to:

```powershell
pnpm package:win
```

Expected:
- exit 0;
- NSIS Setup `.exe`;
- `latest.yml`;
- required update blockmap/artifacts;
- no network publication.

- [ ] **Step 4: Generate and verify signed manifest locally**

Set `SUD_D_RELEASE_PRIVATE_KEY_FILE` to the temp test key file and run:

```powershell
pnpm release:manifest
pnpm release:verify
```

Expected: PASS.

- [ ] **Step 5: Install on Windows in an isolated Personal Alpha test profile/data root**

Verify:
- installer is per-user;
- no admin/UAC is required in normal path;
- unsigned SmartScreen warning may appear and is documented;
- app launches;
- Update page shows Version + Revision;
- no GitHub write token is present in packaged files/config;
- existing SUD-D developer checkout remains separate.

- [ ] **Step 6: Record exact smoke evidence**

In `SUD_D_HANDOFF.md`, record:
- branch/SHA;
- installer filename/version/revision;
- per-user/no-admin result;
- packaged startup result;
- SmartScreen behavior observed;
- data-root path class (not secrets);
- Update screen result;
- no publish performed.

- [ ] **Step 7: Update Personal Alpha install guide**

Include:
- first-install steps;
- SmartScreen `More info → Run anyway` only when the user personally trusts the artifact;
- Update page workflow;
- manual recovery using prior release installer;
- warning never to obtain SUD-D installers from untrusted third parties.

- [ ] **Step 8: Commit docs/evidence**

```powershell
git add docs/release/PERSONAL_ALPHA_INSTALL.md docs/release/release-notes.json SUD_D_HANDOFF.md
git commit -m "docs: record installer smoke"
```

Do not commit `dist-release/` binaries to the private source repo unless repo policy explicitly says artifacts are tracked; default is do not commit generated binaries.

---

# Task 12: Deterministic Two-Version Update Smoke Before Public Release

**Files:**
- Test/support only where needed; prefer existing test harness and local HTTP fixture.
- Modify: `SUD_D_HANDOFF.md`

**Interfaces:**
- Use a deterministic local fixture/update source for this task.
- Real public GitHub release publication is still forbidden until the PO release gate.

- [ ] **Step 1: Create version A installer from a clean known commit**

Use a temporary test branch or worktree created specifically for smoke, without rewriting feature history.

Record:
- Version A;
- Revision A;
- installer hash.

- [ ] **Step 2: Seed local user data before update**

Create real Personal Alpha state through the application:
- at least one Workspace;
- at least one settings/approval-mode change;
- at least one audit event;
- credential-presence test using the existing credential-store flow if safe to do on the test machine.

Record non-secret identifiers only.

- [ ] **Step 3: Create version B candidate**

Version B must be higher than A and built from a distinct clean revision.

Use release notes with at least one populated category so UI behavior is exercised.

- [ ] **Step 4: Serve version B metadata/artifacts through the deterministic test provider/harness**

Do not weaken production provider URL restrictions. The test provider is injected through the controller seam; production config remains fixed to GitHub Releases.

- [ ] **Step 5: Exercise complete flow**

From installed A:
1. launch;
2. update check shows B + release notes;
3. verify it does not auto-download;
4. click Download Update;
5. verify progress/verifying/ready;
6. verify invalid-signature fixture rejects;
7. verify hash-mismatch fixture rejects;
8. return to valid fixture;
9. click Restart & Update;
10. app launches as B.

- [ ] **Step 6: Verify data survived**

Confirm:
- Workspace still present;
- SQLite-backed state still present;
- settings/approval mode preserved;
- audit/history preserved;
- credential remains usable/present through existing safe interface;
- Version = B;
- Revision = B;
- one-time release summary appears once.

- [ ] **Step 7: Record evidence in handoff**

Mark deterministic installer/update smoke PASS or document blockers precisely.

- [ ] **Step 8: Commit only if source/docs changed**

Use a focused commit; generated binaries remain outside Git.

---

# Task 13: Security/Quality Gate on Feature Branch

**Files:**
- Modify only failures found by verification/review.
- Modify: `SUD_D_HANDOFF.md`

**Interfaces:**
- No release publication.

- [ ] **Step 1: Run focused updater suite**

```powershell
pnpm --filter @sud-d/domain build
pnpm --filter @sud-d/contracts build
pnpm --filter @sud-d/infrastructure build
pnpm --filter @sud-d/application build
pnpm --filter @sud-d/mcp-gateway build
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run `
  packages/tests/src/update-manifest-security.test.ts `
  packages/tests/src/update-controller.test.ts `
  packages/tests/src/update-desktop-ipc.test.ts `
  packages/tests/src/update-ui.test.ts `
  packages/tests/src/update-packaging.test.ts `
  packages/tests/src/update-release-tooling.test.ts `
  packages/tests/src/update-data-preservation.test.ts `
  --reporter=verbose
```

Expected: all PASS.

- [ ] **Step 2: Run affected existing security/Desktop tests**

At minimum:
- app shell/overview regression;
- desktop preload/IPC security slice;
- connection startup/lifecycle test if `main.ts` shutdown composition changed;
- Git approval/worker security regression if shared preload/main composition changed.

Select exact existing files by dependency impact; document the list and counts in handoff.

- [ ] **Step 3: Run repo gates**

```powershell
pnpm lint
pnpm typecheck
pnpm build
pnpm package:win
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Inspect packaged output for secret/authority leaks**

Check packaged JS/resources for:
- `SUD_D_RELEASE_PRIVATE_KEY`;
- private-key PEM markers;
- GitHub write tokens;
- `GH_TOKEN`;
- arbitrary renderer process execution bridges;
- unexpected installer local path exposure.

This is a targeted inspection, not proof by string scan alone. Review preload/update IPC code structurally.

- [ ] **Step 5: Review against spec**

Spec/security review must explicitly answer:
- no auto-download;
- no auto-install;
- fixed public release source;
- signature before trusting manifest;
- artifact hash before ready;
- user data unchanged;
- private key absent;
- renderer authority narrow;
- Version/Revision binding;
- PO release gate still enforced.

- [ ] **Step 6: Update handoff**

Set status to:
`IMPLEMENTATION VERIFIED / PUBLIC RELEASE + PO REAL UPDATE ACCEPTANCE PENDING`

Do not call the milestone COMPLETE.

- [ ] **Step 7: Commit verification fixes/docs**

Use one focused commit if needed.

---

# Task 14: Push Feature Branch and STOP for PO Release Approval

**Files:**
- No new production work.

- [ ] **Step 1: Verify clean feature state**

```powershell
git status --short --branch
git log --oneline --decorate -10
git diff master...HEAD --stat
git diff --check master...HEAD
```

- [ ] **Step 2: Push only the feature branch**

```powershell
git push -u origin feat/installer-in-app-update-mvp
```

- [ ] **Step 3: Verify local/remote feature SHA**

```powershell
git rev-parse HEAD
git rev-parse origin/feat/installer-in-app-update-mvp
```

Expected: identical.

- [ ] **Step 4: STOP**

Report to PO:
- branch + HEAD SHA;
- files changed;
- focused/full affected verification results;
- installer smoke result;
- deterministic A→B update smoke result;
- exact installer candidate Version + Revision;
- any SmartScreen behavior;
- confirmation that no public release was published;
- confirmation `master` was not integrated by this task unless separately approved;
- proposed first public Personal Alpha release version and user-facing release notes.

Wait for an explicit statement equivalent to:
`PO approves publishing SUD-D vX.Y.Z Personal Alpha release`.

No public release repo creation/publication or GitHub Release asset upload occurs before that approval.

---

# Task 15: After Explicit PO Release Approval — Create/Verify Public Release-Only Repository

**Gate:** Execute only after explicit PO release approval for a named version.

**External resource:**
- Public GitHub repository: `JekdoTH/SUD_D-Releases`

**Files:**
- Modify: `SUD_D_HANDOFF.md`
- No source repo secret files.

- [ ] **Step 1: Ensure release repo is public and release-only**

Repository requirements:
- no private source tree copied into it;
- no signing private key;
- no GitHub token;
- no user data;
- README may state it hosts official SUD-D Personal Alpha binaries only.

- [ ] **Step 2: Create production Personal Alpha Ed25519 signing key outside both repositories**

Store private key only on trusted release machine using OS-protected local storage/file permissions appropriate for the two-user Alpha.

Export only the public key for embedding in the application.

If the public key embedded in the already-built release candidate does not match the production signing key, rebuild and rerun Task 13 verification. Never patch a binary after verification.

- [ ] **Step 3: Verify candidate is built from clean approved source**

Confirm:
- package Version equals approved release version;
- embedded Revision equals `git rev-parse HEAD`;
- tests/build/package gates passed on that revision.

- [ ] **Step 4: Generate release assets**

Using the production signing key:
- installer;
- `latest.yml`;
- required blockmap/update artifacts;
- `sud-d-release.json`;
- rendered release notes Markdown.

- [ ] **Step 5: Independently verify release assets before upload**

Run:

```powershell
pnpm release:verify
```

Expected: signature, SHA-512, Version, Revision all PASS.

---

# Task 16: Publish First Public Personal Alpha Release and Verify Anonymous Read

**Gate:** Same explicit PO release approval remains in effect for this exact version/revision.

- [ ] **Step 1: Publish one GitHub Release to `JekdoTH/SUD_D-Releases`**

Attach only required artifacts.

Release tag/name:
```text
v<Version>
```

Release body: rendered canonical release notes.

- [ ] **Step 2: Verify assets anonymously/publicly**

From a context without GitHub write credentials:
- release page is readable;
- `latest.yml` downloadable;
- installer downloadable;
- signed manifest downloadable from the stable latest-download path;
- no source/private file exposed.

- [ ] **Step 3: Verify installed client check**

On an installed lower version:
- startup check detects new version;
- no token configuration is needed;
- release notes match canonical metadata;
- no auto-download occurs.

- [ ] **Step 4: Record release evidence**

Update `SUD_D_HANDOFF.md` with tag, Version, Revision, hashes, verification status. Do not record private key or token details.

---

# Task 17: Real Home/Work A→B Personal Alpha Acceptance

**Gate:** A second higher-version release requires its own explicit PO release approval.

The milestone requires proving real in-app update, so two public releases are needed:
- Version A: first installable Personal Alpha baseline.
- Version B: higher version used to prove live update.

- [ ] **Step 1: Install Version A on Home and Work**

For each:
- install per-user;
- verify app starts;
- verify user data/root behavior;
- verify Version + Revision;
- note SmartScreen behavior.

- [ ] **Step 2: Prepare Version B through the same verified release process**

Version B must:
- be a higher immutable SemVer;
- have its own Revision;
- contain canonical release notes;
- pass Task 13 gates;
- receive explicit PO publish approval.

- [ ] **Step 3: Publish B**

Use Tasks 15–16 without bypassing signing/hash/revision checks.

- [ ] **Step 4: Home acceptance**

On Version A:
- open SUD-D;
- update available B appears;
- release notes correct;
- no download until click;
- Download Update;
- verify;
- Restart & Update;
- starts as B;
- local data intact;
- one-time summary correct.

- [ ] **Step 5: Work acceptance**

Repeat independently on secondary validation device.

- [ ] **Step 6: Failure-path spot check**

On one test instance/provider fixture:
- invalid signature → rejected;
- mismatched hash → rejected;
- current app remains usable.

Do not intentionally tamper with the production public release.

- [ ] **Step 7: Final handoff closure**

Record:
- Home PASS/FAIL;
- Work PASS/FAIL;
- Version A/B;
- Revision A/B;
- data preservation result;
- public release read result;
- updater verification result;
- any accepted SmartScreen limitation.

Only now may handoff say:
`Installer + In-App Update MVP — COMPLETE / Personal Alpha Acceptance PASS`.

---

# Final Verification Commands

Before any master-integration decision, run the feature-branch gates appropriate to actual changed boundaries:

```powershell
pnpm lint
pnpm typecheck
pnpm build
pnpm package:win
git diff --check
```

Focused updater suite:

```powershell
pnpm exec cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run `
  packages/tests/src/update-manifest-security.test.ts `
  packages/tests/src/update-controller.test.ts `
  packages/tests/src/update-desktop-ipc.test.ts `
  packages/tests/src/update-ui.test.ts `
  packages/tests/src/update-packaging.test.ts `
  packages/tests/src/update-release-tooling.test.ts `
  packages/tests/src/update-data-preservation.test.ts `
  --reporter=verbose
```

Do not mechanically run unrelated heavyweight suites if the repo's approved risk-based policy says the affected critical slice plus real packaging/update smoke is sufficient. If shared security/runtime boundaries were changed, expand verification to the affected existing suites and document why.

---

# PO Manual Acceptance Checklist

The PO should not need PowerShell for the normal installed-user flow.

Fresh install:
1. Run `SUD-D Setup <A>.exe`.
2. Install per-user.
3. Open SUD-D.
4. Confirm `Version A` and `Revision A`.
5. Confirm existing/local data is present as expected.

Update:
1. Publish approved Version B.
2. Open installed Version A.
3. Confirm update notice names Version B and shows release notes.
4. Confirm no download starts automatically.
5. Click `Download Update`.
6. Confirm progress/verifying state.
7. Confirm `Restart & Update` appears only after verification.
8. Click it.
9. Confirm SUD-D reopens as Version B / Revision B.
10. Confirm Workspace, settings, credentials, audit/history remain usable.
11. Confirm one-time `Updated to vB` notes appear.
12. Reopen and confirm the one-time summary is not repeatedly forced.

If any data is lost, any unverified artifact becomes installable, a token/private key is exposed, or the app silently downloads/installs contrary to the design, acceptance fails and the milestone stays open.

---

# Plan Self-Review Result

- Spec coverage: all approved design sections map to tasks above.
- Security boundaries: fixed-purpose main-process updater, signed manifest, artifact hash, no client write token/private key, no renderer generic process/network authority.
- Product controls: startup check, explicit Download, explicit Restart & Update, Version/Revision, release notes, no auto-publish.
- Data preservation: explicit deterministic and real acceptance gates.
- Release governance: implementation stops before first public publication; every public release requires PO approval.
- Scope: Windows Personal Alpha only; no paid signing, multiple channels, silent updates, rollback engine, enterprise deployment, or cross-platform work.
- Placeholder scan: no implementation placeholders; any conditional branch states the exact decision rule/stop condition.
- Type consistency: updater DTO/controller/provider names are consistent across tasks.
