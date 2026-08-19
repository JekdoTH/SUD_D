# SUD-D — Claude Implementation Handoff: Phase 0 + Phase 1

**Project:** SUD-D  
**Platform:** Windows 10 x64+ / Windows 11 x64  
**Scope:** Personal-first, local-first, single user  
**Task:** Implement Phase 0 + Phase 1 only, then stop for review.

## Agent instruction

Inspect the repository and start coding. **Do not return a plan or redesign the architecture.** Use TDD for security/path behavior. Do not implement MCP, file-content tools, Git execution, shell, network, delete/quarantine, or later phases yet.

At the end, return only:

1. changed file paths;
2. verification commands with PASS/FAIL;
3. blockers, if any;
4. unavoidable spec deviations, if any.

Do not commit unless the owner explicitly requests it.

---

## Goal

Build the secure foundation of a Windows Electron desktop control center for a future local AI-agent runtime. This phase establishes renderer isolation, shared domain/application boundaries, SQLite state, trusted Workspace registration, Windows path security, sensitivity classification, baseline policy, audit, and a minimal Control Center UI.

The production Desktop UI is packaged Electron content, **not a localhost website**. A future MCP localhost endpoint is separate and out of scope now.

---

## Technology baseline

Use:

- TypeScript strict mode;
- Node.js 24 LTS development baseline;
- pnpm 10.x workspace, pinned in project metadata/lockfile;
- current stable Electron release supporting Windows 10 x64, no prerelease/nightly;
- React + Vite renderer;
- Zod for privileged-boundary validation;
- SQLite via `better-sqlite3` or an equally mature local Node SQLite binding;
- Vitest;
- ESLint + TypeScript checks.

Keep the repository small. Recommended logical modules:

- Desktop Control Center: Electron main/preload/renderer;
- Domain: pure concepts/results/errors;
- Application: use cases + ports + policy orchestration;
- Infrastructure: SQLite and Windows path/filesystem metadata adapters;
- Contracts: Zod/serializable IPC contracts.

Dependency direction: **Domain <- Application <- Adapters/Composition Roots**.

Do not add Docker, cloud services, authentication, DI containers, ORMs, message brokers, auto-update, telemetry, or microservices.

---

## Required security invariants

### 1. Renderer is unprivileged

Electron renderer:

- `nodeIntegration: false`;
- `contextIsolation: true`;
- sandbox enabled;
- local packaged content only in production;
- restrictive CSP;
- unexpected navigation/new windows denied;
- no raw `ipcRenderer` exposed;
- preload exposes narrow explicit methods only;
- every privileged IPC input validated with Zod;
- validate IPC sender/webContents;
- renderer never imports filesystem, child process, SQLite, Git, or privileged Electron main APIs.

### 2. One privileged application boundary

Renderer/IPC handlers call Application services. Application services own policy/orchestration. UI code and adapters do not duplicate authorization rules.

### 3. Agent-facing paths will be Workspace-relative

Design path APIs now around `workspaceId + relativePath`. Do not create an arbitrary-absolute-path agent API.

### 4. Canonicalize before authorization

Authorization is based on canonical filesystem paths, not string-prefix checks.

### 5. Internal roots are never normal Workspace resources

Create the concept of SUD-D `InternalRoot`. Any path under an InternalRoot is denied by normal resource resolution **before** ordinary Workspace containment checks. Quarantine is not implemented now; only the abstraction and tests are needed.

### 6. Fail closed

Malformed input, unknown Workspace, unsupported path form, failed canonicalization, ambiguous path state, or adapter failure returns a typed failure. Never fall back to permissive behavior.

### 7. Audit contains metadata, not secrets

Audit may store safe path/action metadata. It must not store raw credentials, `.env` values, file bodies, passwords, tokens, authorization headers, or arbitrary prompts.

---

## Canonical domain vocabulary

Use these names consistently.

- **Workspace** — user-registered local development directory.
- **WorkspaceRoot** — canonical absolute Windows directory selected locally by the owner.
- **RelativeResourcePath** — resource path relative to WorkspaceRoot.
- **InternalRoot** — SUD-D-owned private path excluded from ordinary tools.
- **ClientSession** — logical caller, currently `desktop`; reserve future `mcp-stdio`.
- **Capability** — local power category such as workspace.read/workspace.write/delete/process/network/secrets.read.
- **Effect** — read/create/modify/execute/delete.
- **Sensitivity** — normal/sensitive/credential.
- **Risk** — low/medium/high/critical.
- **PolicyDecision** — allow/ask/deny with machine-readable reason.
- **AuditEvent** — structured sanitized operation metadata.
- **AppError** — typed serializable application failure.

Domain code must not import Electron, SQLite, MCP, Git, or Node filesystem adapters.

---

## Result and error model

Application boundaries return typed success/failure rather than leaking raw adapter exceptions through IPC.

Support at least these relevant error codes now:

- `WORKSPACE_NOT_FOUND`
- `WORKSPACE_INVALID`
- `INVALID_PATH`
- `PATH_OUTSIDE_WORKSPACE`
- `DEVICE_PATH_DENIED`
- `REPARSE_POINT_DENIED`
- `INTERNAL_PATH_DENIED`
- `RESOURCE_NOT_FOUND`
- `SENSITIVE_RESOURCE`
- `VALIDATION_FAILED`
- `INTERNAL_ERROR`

Errors include a safe user message and sanitized metadata only.

---

## SQLite/local state

Canonical application data root: `%LOCALAPPDATA%\SUD-D`.

Use schema migrations from the start and WAL mode for cross-process readiness.

Implement records needed now:

### Workspaces

- generated Workspace ID;
- display name;
- canonical root;
- created/updated timestamps;
- optional active state/current selection.

### Audit Events

- event ID;
- timestamp;
- ClientSession ID/type;
- action;
- Workspace ID when relevant;
- sanitized relative/canonical resource metadata when relevant;
- PolicyDecision when relevant;
- result code;
- duration;
- sanitized structured metadata.

Do not store file payloads in SQLite.

---

## Workspace registration

Registration is a trusted Desktop action using a native directory picker.

A Workspace root must:

- exist;
- be a directory;
- be an absolute local drive-letter path;
- not be UNC;
- not use `\\.\`, `\\?\`, NT device, volume-GUID, or other device namespaces;
- resolve to a canonical root using native realpath behavior;
- persist with a stable generated Workspace ID.

UI supports:

- list Workspaces;
- add existing Workspace;
- select active Workspace;
- remove **registration only**.

Removing a Workspace registration must never delete/move/change project files.

Show the canonical root in Projects UI.

---

## Windows RelativeResourcePath contract

Create a reusable path validator/resolver now even though file-content operations come later.

For tool-style relative paths, reject:

- empty path when a resource is required;
- NUL;
- absolute paths;
- drive-qualified or drive-relative paths (`C:\x`, `C:x`);
- UNC paths;
- `\\?\`, `\\.\`, device/volume namespaces;
- any `..` component;
- colon in relative components (prevents NTFS alternate data streams);
- reserved device-name components such as `CON`, `PRN`, `AUX`, `NUL`, `COM1` etc., including extension-like forms;
- components ending in dot or space.

Normalize using Windows path semantics.

### Existing-resource resolution

When resolving an existing future resource:

1. canonicalize WorkspaceRoot;
2. canonicalize target;
3. verify containment without vulnerable string-prefix logic;
4. deny symlink/junction targets/components in MVP instead of following them;
5. deny InternalRoot paths first;
6. revalidate immediately before a future mutation.

### New-resource resolution

Prepare an API that can safely support future new-file creation:

1. find nearest existing ancestor;
2. canonicalize/validate ancestor within WorkspaceRoot;
3. deny symlink/junction existing components;
4. validate proposed new components;
5. revalidate ancestor immediately before future creation.

Do not implement file write yet.

A pure Node implementation cannot eliminate every malicious-local-process TOCTOU race. For this personal single-user MVP, minimize the window with canonicalization/revalidation and deny links. Do not add native filesystem code in this phase.

---

## Sensitivity classifier

Implement path-based classification now.

At minimum classify as `credential`:

- `.env` and `.env.*`;
- exempt `.env.example`, `.env.sample`, `.env.template`;
- `.npmrc`;
- `*.pem`, `*.key`, `*.pfx`, `*.p12`;
- `id_rsa*`, `id_ed25519*`;
- `credentials.json`, `secrets.json`;
- paths under `.ssh`, `.aws`, `.azure`, `.kube`.

No content reading exists yet. This classifier will gate future reads/search/Git diff.

---

## Baseline policy service

Implement explicit resource-aware decisions, not `safe/balanced/full` profiles.

Represent these defaults:

| Situation | Decision |
|---|---|
| normal Workspace read | allow |
| normal Workspace search | allow |
| normal Workspace create/modify | allow, future recovery requirement |
| delete | ask |
| credential read/modify | ask |
| process execute | ask conceptually; capability absent |
| network | deny |
| outside Workspace | deny |
| InternalRoot | deny |
| permanent delete from MCP | deny |

Settings UI should display the baseline policy. **No unrestricted/full-access toggle.**

Approval implementation is later; Phase 1 only needs policy vocabulary/decision output sufficient to express `ask`.

---

## Audit behavior

Workspace registration/list/select/remove and relevant policy/path operations should produce structured AuditEvents where useful.

Audit should answer what happened, caller type, Workspace, result, and duration without becoming a content log.

Create a sanitizer with tests proving supplied secret-like metadata values are not persisted raw.

Activity screen reads structured events from SQLite and displays recent events.

---

## Desktop UI required now

Create an original functional dark Control Center. Do not copy lnwjud branding/layout.

Required navigation shell:

- Home
- Projects
- Activity
- Settings
- Doctor

### Home

Show basic SUD-D readiness, active Workspace if any, Workspace count, and recent activity summary.

### Projects

Add/list/select/remove registrations and show canonical root.

### Activity

Show recent structured AuditEvents. No raw source/secret content.

### Settings

Show baseline permission decisions. No full/unrestricted mode.

### Doctor

Show actionable checks for:

- application data directory writable;
- SQLite healthy;
- registered Workspace root exists/available.

MCP/Git/recovery checks are added in later phases.

English-only UI is sufficient.

---

## Test seam and required tests

Primary security seam: Application services using real temporary filesystem + temporary SQLite adapter where practical. Test observable results, not private helper internals.

Use pure unit tests for domain classifier/policy logic and Windows integration tests for path behavior.

Required Phase 1 test matrix:

1. valid Workspace registration persists canonical root;
2. registered Workspace list/select/remove works and removal leaves project directory untouched;
3. normal relative path inside Workspace resolves;
4. `..` traversal rejected;
5. absolute tool path rejected;
6. drive-relative path rejected;
7. UNC path rejected;
8. `\\?\`/`\\.\` device namespace rejected;
9. NUL rejected;
10. colon/alternate-data-stream form rejected;
11. Windows reserved device-name component rejected;
12. trailing dot/space component rejected;
13. prefix confusion cannot escape (`C:\work\app` vs `C:\work\app-evil`);
14. symlink/junction denied when Windows test privileges allow creation; otherwise explicit test skip with reason;
15. InternalRoot denied before normal Workspace access;
16. missing Workspace fails closed;
17. malformed privileged IPC input fails Zod validation;
18. `.env.local` is credential;
19. `.env.example`, `.env.sample`, `.env.template` are not credential;
20. `.ssh`, `.aws`, `.azure`, `.kube` descendants classify credential;
21. policy returns deny for outside Workspace/InternalRoot/network;
22. policy returns ask for delete/credential access;
23. audit sanitizer does not persist secret-like fixture values;
24. application services return typed AppError rather than raw infrastructure exceptions.

Repository root must provide and pass:

- lint;
- typecheck;
- test;
- build;
- desktop development launch command.

---

## Phase 0 deliverable

Complete when:

- pnpm workspace is healthy;
- strict TS/lint/test/build scripts exist;
- secure Electron + React + Vite shell launches;
- narrow preload/typed IPC pattern works through a harmless health call;
- local data-root resolver works;
- SQLite migrations/WAL foundation works;
- Home/Projects/Activity/Settings/Doctor shell exists.

## Phase 1 deliverable

Complete when:

- Domain Result/AppError/policy/path vocabulary exists;
- Workspace persistence/use cases work through trusted Desktop UI;
- Windows path-security contract is implemented/tested;
- InternalRoot denial exists/tested;
- sensitivity classifier exists/tested;
- baseline policy service exists/tested;
- structured audit persists and Activity displays it;
- Doctor validates DB/data/Workspace state;
- all root verification commands pass.

---

## Hard stop / explicitly out of scope now

Do **not** implement any of the following in this run:

- MCP SDK/server/tool catalog;
- localhost MCP HTTP;
- Secure MCP Tunnel;
- file content read/search/write/patch/delete;
- recovery snapshots;
- quarantine/trash movement;
- Approval Request/Grant workflow beyond policy vocabulary;
- Git subprocesses;
- PowerShell/CMD/shell/process execution;
- package/test/build agent automation;
- network fetch;
- browser/DOM automation;
- screenshot/OCR;
- mouse/keyboard automation;
- clipboard/Office/audio/screen recording;
- child MCP;
- accounts/cloud/telemetry/updater/installer/localization.

No placeholder implementations for these features are required.

---

## Acceptance criteria — stop only when all pass

- [ ] clean dependency install succeeds with pinned pnpm;
- [ ] lint passes;
- [ ] TypeScript typecheck passes;
- [ ] tests pass;
- [ ] build passes;
- [ ] desktop dev launch succeeds on Windows;
- [ ] renderer is sandboxed and does not import privileged modules;
- [ ] Workspace add/list/select/remove persists correctly;
- [ ] registration removal never alters project files;
- [ ] canonical root is visible in Projects UI;
- [ ] full path-security matrix passes;
- [ ] sensitivity classifier matrix passes;
- [ ] InternalRoot denial passes;
- [ ] privileged IPC inputs use Zod validation and sender validation;
- [ ] Activity shows sanitized structured AuditEvents;
- [ ] Settings has no unrestricted/full toggle;
- [ ] Doctor reports DB/data/Workspace health;
- [ ] no later-phase capability was accidentally added.

**When this checklist is green, stop coding and return the concise implementation report.**
