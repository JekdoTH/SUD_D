# Managed Serena Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Milestone B's production backend foundation that owns one pinned Serena 1.7.0 LSP runtime for the active SUD-D Workspace, reports stable Coding Engine health/degraded states, and supports stop/restart/repair without exposing any production `code.*` capability.

**Architecture:** Add a small Coding Engine domain vocabulary and application lifecycle seam, then promote the proven Milestone A stdio/LSP mechanics into focused infrastructure modules: immutable engine manifest, SUD-D-owned paths/config, isolated uv provisioner, SUD-D-owned Product Mode Serena allowlist/capability filtering, and managed Serena runtime. Product Mode Serena state is forced under `%LOCALAPPDATA%\SUD-D`; the source Workspace is never used for Serena metadata. Upstream `tools/list` is discovery/inventory only; Product Mode may dispatch only SUD-D-allowlisted upstream capabilities, and allowlist membership alone does not expose any AI-facing `code.*` authority. The runtime is not wired into renderer UI or MCP in this milestone, so native production behavior remains unchanged while later milestones gain a tested backend seam.

**Tech Stack:** Windows 10/11, Node.js >=24, pnpm 10.34.5, TypeScript 5.8.3, Vitest 3.2.4, `@modelcontextprotocol/client` 2.0.0, Serena `serena-agent==1.7.0`, Python 3.13 via uv, stdio MCP, Serena LSP backend.

**Spec:** `docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md`

**Amendment gate (2026-09-04):** Product Mode Serena authority is enforced by a SUD-D-owned allowlist/capability filter, not by Serena mode semantics. This document amendment is approved for review only; do not resume or change implementation until the user explicitly approves the written amendment.

## Global Constraints

- This plan implements **Milestone B only — managed runtime foundation**.
- Milestone A is the compatibility source of truth: `docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md`.
- Managed-config research remains authoritative for Serena state placement/config mechanics: `docs/superpowers/research/2026-09-04-serena-managed-runtime-config-research.md`. Product Mode memory/tool **authority** follows this allowlist amendment rather than Serena mode semantics.
- Serena package pin: `serena-agent==1.7.0`.
- Serena upstream tag: `v1.7.0`.
- Serena upstream commit: `949a27ef1e5fda1a6e7b561e777bcece345c6ffd`.
- Serena top-level wheel SHA-256 recorded in the manifest: `6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891`.
- Python request: `3.13`.
- MCP client production dependency: exactly `@modelcontextprotocol/client` `2.0.0`.
- Transport remains **stdio**. No Streamable HTTP, SSE, local port, connector config, or user-visible MCP endpoint is introduced.
- Language backend remains **LSP**.
- Product Mode Serena context is `desktop-app` and mode is `no-memories`.
- `--mode no-memories` is **defense-in-depth / best-effort upstream reduction only**. Serena mode semantics are not the Product Mode authority boundary; pinned Serena 1.7.0 may still advertise memory/onboarding tools in `desktop-app`.
- The **SUD-D Product Mode Serena authorized allowlist** is exactly the following 22 sorted names:
  - `activate_project`
  - `create_text_file`
  - `execute_shell_command`
  - `find_declaration`
  - `find_file`
  - `find_implementations`
  - `find_referencing_symbols`
  - `find_symbol`
  - `get_current_config`
  - `get_diagnostics_for_file`
  - `get_symbols_overview`
  - `initial_instructions`
  - `insert_after_symbol`
  - `insert_before_symbol`
  - `list_dir`
  - `read_file`
  - `rename_symbol`
  - `replace_content`
  - `replace_in_files`
  - `replace_symbol_body`
  - `safe_delete_symbol`
  - `search_for_pattern`
- Upstream Serena `tools/list` is discovery/inventory only. Product Mode dispatch authority comes from the SUD-D allowlist/capability filter, not from what Serena advertises.
- Every allowlisted tool must be present and schema-compatible. Missing or schema-incompatible allowlisted tools are a health failure and fail closed.
- Additional/unexpected upstream tools are **Ready-but-blocked drift** when all 22 allowlisted tools remain present and schema-compatible. They must remain unreachable through Product Mode and do not gain authority merely because Serena advertises them.
- Product/AI callers must never be able to pass an arbitrary Serena tool name through to raw MCP `callTool(...)`; the SUD-D capability filter validates membership before dispatch.
- `CodingEngineRuntimeHealth.toolCount` represents the effective SUD-D-authorized count (`22`), not the raw upstream discovery count.
- Raw upstream extra names/count may be used only as bounded in-memory compatibility diagnostics/acceptance evidence and must not be persisted to audit, UI, SQLite, application state, errors, or other durable product state.
- The production MCP surface remains exactly the existing 14 `workspace.*`, `git.*`, and `team.*` tools. Milestone B adds no `code.*`, no `dev.verify`, and no direct Serena passthrough.
- No renderer-visible UI work occurs in Milestone B.
- No Workspace Trust UI/persistence, Approval changes, `code.run`, delete authority, network policy UI, update promotion, rollback UI, or Team/Harness change occurs in Milestone B.
- Serena home/config/logs/project metadata must live under SUD-D-owned managed storage, never in the source Workspace.
- Product runtime must set `SERENA_HOME` explicitly and must not read or modify the user's normal `~/.serena` / `%USERPROFILE%\.serena` state.
- Product runtime must pre-create its configured per-Workspace Serena data directory before launching Serena. This prevents Serena's fallback logic from adopting an existing `<workspace>\.serena` directory.
- A pre-existing developer `.serena/` folder in the source Workspace must remain byte-for-byte untouched by the managed runtime acceptance test.
- The runtime must never fall back to a global `serena` executable. It uses only the executable under the SUD-D-managed uv tool directory.
- Milestone B may use an already-installed `uv.exe` as a bootstrap dependency for backend development/acceptance. Missing uv maps to Coding Engine `Unavailable`; there is no user-facing claim yet that clean-machine Setup is complete. Self-contained uv provisioning and production update/promotion remain later work.
- Milestone B does not enable Serena auto-update or user-facing update. The recorded top-level wheel hash is not represented as a full transitive hash lock; full supply-chain promotion/rollback verification is required before Milestone F enables production updates.
- Raw Serena stdout/stderr, raw environment values, credential-helper output, or arbitrary MCP tool output must not be serialized into audit, UI, SQLite, reports, or error messages.
- The existing secret invariant remains exact: plaintext credentials must never enter SQLite, renderer-facing or IPC DTOs, audit records, logs, error messages, or other serialized non-secret state.
- Runtime failures surface only stable SUD-D error codes and safe metadata.
- One active Workspace maps to at most one managed Serena process/session. Rebinding uses stop-before-start.
- `stop()` is idempotent and must prove process-tree cleanup on Windows.
- `restart()` reuses the managed install and performs stop → start for the active Workspace.
- `repair()` may rewrite SUD-D-owned Serena config/state and repair the SUD-D-owned pinned engine install; it must never edit/delete project source.
- There is no silent fallback to PowerShell, another shell backend, another Serena installation, another Serena version, HTTP/SSE, or another coding engine.
- Native Workspace/Git/Team tools and Approval/Audit behavior remain operational if the managed Coding Engine is unavailable.
- This milestone is **Security / Data Critical** because it creates a production process/runtime seam.
- Final verification therefore requires focused TDD tests, relevant runtime/process regressions, lint, typecheck, full test suite, build, `git diff --check`, final `code-review`, and one real Windows managed-runtime acceptance run.
- Capture the implementation baseline immediately before source edits: `git rev-parse HEAD`. Use that fixed SHA for final `code-review` and scope comparison.
- STOP on any secret leak, Workspace metadata write, InternalRoot escape, uncontrolled process cleanup, wrong-version acceptance, Product Mode allowlist bypass, missing/schema-incompatible allowlisted tool, global Serena fallback, or inability to prove the runtime health/cleanup contract. Unexpected upstream tools alone are not a blocker when they remain unreachable and the authorized allowlist is fully compatible.
- STOP after Milestone B verification + handoff + safe commit/push. Do not begin Milestone C without a new explicit user instruction.

## Pre-Implementation Compliance Check

Before any source edit, publish this shape using the fresh Skill Router result for the implementation session:

```text
Risk Level
Security / Data Critical

Selected Skill(s)
research — current Serena managed-config/runtime facts and uv bootstrap constraints
codebase-design — Coding Engine lifecycle seam and deep managed-runtime modules
domain-modeling — stable Coding Engine states/failure vocabulary
tdd — runtime and lifecycle behavior through public seams
code-review — mandatory final runtime/security review

Verification Plan
Focused Coding Engine tests; managed config/path tests; runtime/process regressions; real Windows managed Serena acceptance; lint; typecheck; full test suite; build; git diff --check; final code-review; production MCP 14-tool regression.

STOP CONDITION
Stop after Milestone B PASS/BLOCKED/INCONCLUSIVE evidence, handoff, commit/push, and divergence proof. No production code.* and no Milestone C work.
```

---

## File Structure

### Domain

- Create: `packages/domain/src/coding-engine.ts` — stable Coding Engine states, workspace/runtime health DTOs, and safe runtime failure codes.
- Modify: `packages/domain/src/result.ts` — allow Coding Engine failure codes in `AppErrorCode` and provide safe mapping.
- Modify: `packages/domain/src/index.ts` — export Coding Engine vocabulary.

### Application

- Create: `packages/application/src/coding-engine-runtime-port.ts` — small async runtime seam consumed by application orchestration.
- Create: `packages/application/src/coding-engine-service.ts` — active-Workspace lifecycle, state mapping, restart/repair orchestration, and safe audit events.
- Modify: `packages/application/src/index.ts` — export Coding Engine application seam.

### Infrastructure

- Create: `packages/infrastructure/src/serena-engine-manifest.ts` — immutable Serena pin, 22-name Product Mode allowlist, reviewed input-schema compatibility metadata, and runtime flags.
- Create: `packages/infrastructure/src/serena-runtime-paths.ts` — versioned engine paths and per-Workspace managed state paths under SUD-D DataRoot.
- Create: `packages/infrastructure/src/serena-managed-config.ts` — deterministic SUD-D-owned `SERENA_HOME` config and pre-created project metadata directory.
- Create: `packages/infrastructure/src/serena-engine-provisioner.ts` — isolated uv-managed Serena/Python install verification and repair; no global Serena fallback.
- Create: `packages/infrastructure/src/serena-managed-runtime.ts` — stdio MCP lifecycle, SUD-D allowlist/schema health, blocked-drift enforcement, active-project/LSP health, and deterministic Windows cleanup; no generic Product Mode Serena dispatch surface is exposed in Milestone B.
- Modify: `packages/infrastructure/src/index.ts` — export managed Serena backend modules.
- Modify: `packages/infrastructure/package.json` — add exact MCP client dependency.
- Modify: `pnpm-lock.yaml` — lock production MCP client dependency placement.

### Tests / acceptance

- Create: `packages/tests/src/coding-engine-domain.test.ts` — stable state/failure vocabulary.
- Create: `packages/tests/src/serena-runtime-foundation.test.ts` — manifest, path, config, provisioner, health, cleanup, and failure behavior through public seams.
- Create: `packages/tests/src/coding-engine-service.test.ts` — application lifecycle/audit/rebind/repair semantics with a fake runtime.
- Create: `packages/tests/src/serena-managed-runtime.acceptance.test.ts` — opt-in real Windows test using the production runtime modules against a copied TypeScript fixture.
- Modify: `package.json` — add `serena:managed-runtime` opt-in acceptance command.
- Reuse unchanged: `packages/tests/fixtures/serena-runtime-spike-ts/**` — known TypeScript source used for LSP proof.

### Durable milestone state

- Modify after verification: `SUD_D_HANDOFF.md` — Milestone B verdict, commits, verification, remaining limitation, and Milestone C gate.

---

### Task 1: Add Stable Coding Engine Domain Vocabulary

**Files:**
- Create: `packages/domain/src/coding-engine.ts`
- Modify: `packages/domain/src/result.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/tests/src/coding-engine-domain.test.ts`

**Interfaces:**
- Produces: `CodingEngineState`, `CodingEngineFailureCode`, `CodingEngineWorkspaceContext`, `CodingEngineRuntimeHealth`, `CodingEngineStatus`, `CodingEngineRuntimeFailure`.
- Produces: `codingEngineRuntimeFailureAppError(code)`.
- Consumed by: Tasks 4–6.

- [ ] **Step 1: Write the failing domain tests**

Create `packages/tests/src/coding-engine-domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  CodingEngineRuntimeFailure,
  codingEngineRuntimeFailureAppError,
  type CodingEngineState,
} from '@sud-d/domain';

describe('Coding Engine domain vocabulary', () => {
  it('uses the approved user-facing availability states', () => {
    const states: CodingEngineState[] = ['unavailable', 'starting', 'ready', 'needs_repair'];
    expect(states).toEqual(['unavailable', 'starting', 'ready', 'needs_repair']);
  });

  it('maps runtime failures to safe app errors without raw process text', () => {
    const failure = new CodingEngineRuntimeFailure('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    const error = codingEngineRuntimeFailureAppError(failure.code);
    expect(error.code).toBe('CODING_ENGINE_TOOL_CONTRACT_MISMATCH');
    expect(error.message).toBe('Coding Engine tool contract does not match the pinned Serena manifest');
    expect(JSON.stringify(error)).not.toContain('stderr');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-domain.test.ts
```

Expected: FAIL because the Coding Engine exports do not exist yet.

- [ ] **Step 3: Implement the domain vocabulary**

Create `packages/domain/src/coding-engine.ts` with this public shape:

```ts
import type { AppError } from './result.js';

export const CODING_ENGINE_STATES = [
  'unavailable',
  'starting',
  'ready',
  'needs_repair',
] as const;

export type CodingEngineState = (typeof CODING_ENGINE_STATES)[number];
export type CodingEngineKind = 'serena';

export type CodingEngineFailureCode =
  | 'CODING_ENGINE_WORKSPACE_NOT_SELECTED'
  | 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE'
  | 'CODING_ENGINE_INSTALL_FAILED'
  | 'CODING_ENGINE_START_FAILED'
  | 'CODING_ENGINE_VERSION_MISMATCH'
  | 'CODING_ENGINE_TOOL_CONTRACT_MISMATCH'
  | 'CODING_ENGINE_PROJECT_MISMATCH'
  | 'CODING_ENGINE_LSP_UNAVAILABLE'
  | 'CODING_ENGINE_STOP_FAILED'
  | 'CODING_ENGINE_REPAIR_FAILED';

export interface CodingEngineWorkspaceContext {
  readonly workspaceId: string;
  readonly canonicalRoot: string;
  readonly projectName: string;
}

export interface CodingEngineRuntimeHealth {
  readonly engine: 'serena';
  readonly version: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly toolCount: number;
  readonly workspaceCanonicalRoot: string;
  readonly projectName: string;
  readonly lspReady: true;
}

export interface CodingEngineStatus {
  readonly engine: 'serena';
  readonly state: CodingEngineState;
  readonly workspaceId: string | null;
  readonly failure: AppError | null;
}

export class CodingEngineRuntimeFailure extends Error {
  readonly code: CodingEngineFailureCode;

  constructor(code: CodingEngineFailureCode) {
    super(code);
    this.name = 'CodingEngineRuntimeFailure';
    this.code = code;
  }
}
```

Extend `AppErrorCode` in `packages/domain/src/result.ts` with the same `CODING_ENGINE_*` values and add a fixed safe message map plus:

```ts
export function codingEngineRuntimeFailureAppError(code: CodingEngineFailureCode): AppError {
  return appError(code, CODING_ENGINE_FAILURE_MESSAGES[code]);
}
```

Import the type from `./coding-engine.js` with a type-only import to avoid a runtime cycle. Export `./coding-engine.js` from `packages/domain/src/index.ts`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add packages/domain/src/coding-engine.ts packages/domain/src/result.ts packages/domain/src/index.ts packages/tests/src/coding-engine-domain.test.ts
git commit -m "feat: add coding engine domain vocabulary"
```

---

### Task 2: Lock the Serena Manifest, Managed Paths, and Product Config

**Files:**
- Create: `packages/infrastructure/src/serena-engine-manifest.ts`
- Create: `packages/infrastructure/src/serena-runtime-paths.ts`
- Create: `packages/infrastructure/src/serena-managed-config.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Create/extend: `packages/tests/src/serena-runtime-foundation.test.ts`

**Interfaces:**
- Produces: `SERENA_ENGINE_MANIFEST`.
- Produces: `createSerenaRuntimePaths(dataRoot, workspace)`.
- Produces: `prepareManagedSerenaConfig(paths)`.
- Consumed by: Tasks 3–4.

- [ ] **Step 1: Write RED tests for manifest, state placement, and `.serena` fallback prevention**

Start `packages/tests/src/serena-runtime-foundation.test.ts` with tests equivalent to:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SERENA_ENGINE_MANIFEST,
  createSerenaRuntimePaths,
  prepareManagedSerenaConfig,
} from '@sud-d/infrastructure';

const roots: string[] = [];
const temp = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-serena-foundation-'));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Serena managed foundation', () => {
  it('pins the approved Serena Product Mode contract', () => {
    expect(SERENA_ENGINE_MANIFEST.version).toBe('1.7.0');
    expect(SERENA_ENGINE_MANIFEST.upstreamCommit).toBe('949a27ef1e5fda1a6e7b561e777bcece345c6ffd');
    expect(SERENA_ENGINE_MANIFEST.transport).toBe('stdio');
    expect(SERENA_ENGINE_MANIFEST.languageBackend).toBe('LSP');
    expect(SERENA_ENGINE_MANIFEST.modes).toEqual(['no-memories']);
    expect(SERENA_ENGINE_MANIFEST.expectedToolNames).toHaveLength(22);
    expect([...SERENA_ENGINE_MANIFEST.expectedToolNames].sort()).toEqual(SERENA_ENGINE_MANIFEST.expectedToolNames);
    expect(Object.keys(SERENA_ENGINE_MANIFEST.expectedToolInputSchemas).sort()).toEqual(
      [...SERENA_ENGINE_MANIFEST.expectedToolNames],
    );
  });

  it('keeps Serena home and project metadata outside the source workspace', () => {
    const root = temp();
    const dataRoot = path.join(root, 'data');
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(path.join(workspaceRoot, '.serena'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'keep');

    const paths = createSerenaRuntimePaths(dataRoot, {
      workspaceId: 'workspace-1',
      canonicalRoot: workspaceRoot,
      projectName: 'workspace',
    });
    prepareManagedSerenaConfig(paths);

    expect(paths.serenaHome.startsWith(dataRoot)).toBe(true);
    expect(paths.projectSerenaDir.startsWith(dataRoot)).toBe(true);
    expect(fs.existsSync(paths.projectSerenaDir)).toBe(true);
    expect(fs.readFileSync(path.join(workspaceRoot, '.serena', 'developer-marker.txt'), 'utf8')).toBe('keep');

    const config = fs.readFileSync(paths.serenaConfigPath, 'utf8');
    expect(config).toContain(JSON.stringify(paths.projectSerenaDir));
    expect(config).toContain('"trusted_project_path_patterns": []');
    expect(config).not.toContain(workspaceRoot + path.sep + '.serena');
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: FAIL because manifest/path/config modules do not exist.

- [ ] **Step 3: Implement the immutable manifest**

Create `packages/infrastructure/src/serena-engine-manifest.ts`. First define an immutable `SERENA_V1_7_0_PRODUCT_MODE_INPUT_SCHEMAS` map containing exactly the reviewed `inputSchema` objects for the same 22 allowlisted names, copied from `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json` and keyed by tool name. Do not include the seven memory/onboarding drift tools and do not include descriptions in the compatibility contract.

Then define the immutable manifest:

```ts
export const SERENA_ENGINE_MANIFEST = Object.freeze({
  engine: 'serena' as const,
  packageName: 'serena-agent',
  version: '1.7.0',
  upstreamCommit: '949a27ef1e5fda1a6e7b561e777bcece345c6ffd',
  wheelSha256: '6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891',
  pythonVersion: '3.13',
  transport: 'stdio' as const,
  languageBackend: 'LSP' as const,
  context: 'desktop-app',
  modes: Object.freeze(['no-memories'] as const),
  expectedToolNames: Object.freeze([
    'activate_project',
    'create_text_file',
    'execute_shell_command',
    'find_declaration',
    'find_file',
    'find_implementations',
    'find_referencing_symbols',
    'find_symbol',
    'get_current_config',
    'get_diagnostics_for_file',
    'get_symbols_overview',
    'initial_instructions',
    'insert_after_symbol',
    'insert_before_symbol',
    'list_dir',
    'read_file',
    'rename_symbol',
    'replace_content',
    'replace_in_files',
    'replace_symbol_body',
    'safe_delete_symbol',
    'search_for_pattern',
  ] as const),
  expectedToolInputSchemas: SERENA_V1_7_0_PRODUCT_MODE_INPUT_SCHEMAS,
});
```

Do not derive authority from live Serena at runtime. `expectedToolNames` is the SUD-D Product Mode authorized allowlist. The manifest must also own immutable `expectedToolInputSchemas` entries for those same 22 names, copied from the reviewed Milestone A schema evidence at `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json`; production runtime must not read the research document directly. Compatibility compares canonical JSON structure for each allowlisted `inputSchema` with object-key order ignored; descriptions are not part of the health gate. Any structural schema change for an allowlisted tool fails closed until explicitly reviewed. Unexpected upstream tool definitions remain discovery drift and are not added to either manifest map automatically.

- [ ] **Step 4: Implement managed paths**

Create `packages/infrastructure/src/serena-runtime-paths.ts`.

Use SHA-256 of `workspace.canonicalRoot.toLowerCase()` as a filesystem-safe opaque Workspace key rather than embedding Workspace names/paths into managed directory names. Produce these paths:

```text
<dataRoot>/coding-engines/serena/1.7.0/
  uv-tools/
  bin/
  python/
  uv-cache/

<dataRoot>/coding-engines/serena/state/1.7.0/<workspaceKey>/
  home/
    serena_config.yml
  project-data/.serena/
```

The returned `SerenaRuntimePaths` must include `engineRoot`, `toolDir`, `binDir`, `pythonDir`, `cacheDir`, `workspaceStateRoot`, `serenaHome`, `serenaConfigPath`, and `projectSerenaDir`.

- [ ] **Step 5: Implement deterministic managed config**

Create `packages/infrastructure/src/serena-managed-config.ts`.

`prepareManagedSerenaConfig(paths)` must:

1. `mkdir` `serenaHome` and **pre-create** `projectSerenaDir`;
2. write `serena_config.yml` atomically through a sibling temporary file + rename;
3. use JSON syntax (valid YAML) so Windows paths are escaped by `JSON.stringify` rather than hand-built YAML;
4. write this controlled input before Serena fills/migrates any additional default fields:

```ts
const config = {
  language_backend: 'LSP',
  gui_log_window: false,
  web_dashboard: false,
  web_dashboard_open_on_launch: false,
  trace_lsp_communication: false,
  project_serena_folder_location: paths.projectSerenaDir,
  trusted_project_path_patterns: [],
  base_modes: ['interactive', 'editing'],
  default_modes: [],
  projects: [],
};
```

Rewriting this config on each managed start is intentional: each Workspace has its own `SERENA_HOME`, and SUD-D—not a previous Serena session—is authoritative for Product Mode configuration.

- [ ] **Step 6: Export modules and verify GREEN**

Export the three modules from `packages/infrastructure/src/index.ts`, then run:

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```powershell
git add packages/infrastructure/src/serena-engine-manifest.ts packages/infrastructure/src/serena-runtime-paths.ts packages/infrastructure/src/serena-managed-config.ts packages/infrastructure/src/index.ts packages/tests/src/serena-runtime-foundation.test.ts
git commit -m "feat: define managed Serena runtime layout"
```

---

### Task 3: Promote Isolated Serena Provisioning into Infrastructure

**Files:**
- Create: `packages/infrastructure/src/serena-engine-provisioner.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Modify: `packages/tests/src/serena-runtime-foundation.test.ts`

**Interfaces:**
- Produces: `SerenaEngineProvisioner` with `ensureInstalled()` and `repairInstalledEngine()`.
- Produces: `createSerenaEngineProvisioner(dependencies)`.
- Produces: `resolveUvExecutable()` used only as a bootstrap locator; never resolves global Serena.
- Consumed by: Task 4.

- [ ] **Step 1: Add RED tests for no-global-Serena and safe bootstrap failures**

Add fake-process tests that assert:

```ts
it('reports unavailable when uv bootstrap is missing without probing global Serena', async () => {
  const provisioner = createSerenaEngineProvisioner({
    paths,
    resolveUv: () => undefined,
    runProcess: fakeRunProcess,
  });
  await expect(provisioner.ensureInstalled()).rejects.toMatchObject({
    code: 'CODING_ENGINE_BOOTSTRAP_UNAVAILABLE',
  });
  expect(fakeRunProcess.calls).toEqual([]);
});

it('rejects a managed Serena executable with the wrong version', async () => {
  // Arrange the managed executable path and make the injected process runner return `Serena 9.9.9`.
  // Assert CODING_ENGINE_VERSION_MISMATCH and never accept the executable as healthy.
});
```

The second test must create a real empty file at the managed executable path, inject a runner that returns the known non-secret version string `Serena 9.9.9`, and assert the exact failure code. Do not mock private helpers.

- [ ] **Step 2: Verify RED**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: FAIL because the provisioner does not exist.

- [ ] **Step 3: Implement bounded process execution and installation**

Create `packages/infrastructure/src/serena-engine-provisioner.ts` with these public interfaces:

```ts
export interface SerenaProvisionedEngine {
  readonly executablePath: string;
  readonly version: '1.7.0';
}

export interface SerenaEngineProvisioner {
  ensureInstalled(): Promise<SerenaProvisionedEngine>;
  repairInstalledEngine(): Promise<SerenaProvisionedEngine>;
}
```

The implementation must:

- resolve `uv.exe` only through the injected resolver / fixed bootstrap seam;
- never call `where serena` or use a global `serena` executable;
- install into `paths.toolDir`, `paths.binDir`, `paths.pythonDir`, and `paths.cacheDir` using the same isolated environment variables proven in Milestone A:

```ts
{
  UV_TOOL_DIR: paths.toolDir,
  UV_TOOL_BIN_DIR: paths.binDir,
  UV_PYTHON_INSTALL_DIR: paths.pythonDir,
  UV_CACHE_DIR: paths.cacheDir,
  UV_NO_MODIFY_PATH: '1',
}
```

- invoke uv with `shell: false`, `windowsHide: true`, and exact install args:

```text
tool install --python 3.13 serena-agent==1.7.0
```

- bound stdout + stderr to a maximum observed byte count of 2 MiB and discard content after extracting only the known `serena --version` result needed for version validation;
- convert spawn/exit failures to `CODING_ENGINE_INSTALL_FAILED` without embedding raw output;
- locate Serena only inside the managed bin directory (`serena.exe` or `serena.cmd` as supported by the validated Windows install);
- execute `<managed-serena> --version` and require exact Serena `1.7.0`;
- make `repairInstalledEngine()` remove only `paths.engineRoot`, recreate it, and reinstall the pinned engine; it must never receive a Workspace source path and therefore cannot delete project source.

`resolveUvExecutable()` may use Windows `where.exe uv` for this milestone's backend/bootstrap acceptance. If no executable is found, return `undefined`; do not download uv, invoke PowerShell web commands, or mutate PATH. Self-contained uv Setup remains later work.

- [ ] **Step 4: Verify focused GREEN**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the Milestone A spike regression**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: the non-live spike tests remain PASS and the live test remains skipped unless explicitly enabled.

- [ ] **Step 6: Commit Task 3**

```powershell
git add packages/infrastructure/src/serena-engine-provisioner.ts packages/infrastructure/src/index.ts packages/tests/src/serena-runtime-foundation.test.ts
git commit -m "feat: add managed Serena provisioner"
```

---

### Task 4: Build the Managed stdio Runtime and Health Contract

**Files:**
- Create: `packages/application/src/coding-engine-runtime-port.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/infrastructure/src/serena-managed-runtime.ts`
- Modify: `packages/infrastructure/src/serena-engine-manifest.ts` — preserve the same 22 names and add reviewed input-schema compatibility metadata required by the amended health contract.
- Modify: `packages/infrastructure/src/index.ts`
- Modify: `packages/infrastructure/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/tests/src/serena-runtime-foundation.test.ts`

**Interfaces:**
- Produces application seam:

```ts
export interface CodingEngineRuntimePort {
  start(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth>;
  stop(): Promise<void>;
  repair(context: CodingEngineWorkspaceContext): Promise<CodingEngineRuntimeHealth>;
}
```

- Infrastructure `ManagedSerenaRuntime` satisfies this interface structurally without importing the application package.
- Consumed by: Task 5.

- [ ] **Step 1: Add exact production MCP client dependency**

Modify `packages/infrastructure/package.json`:

```json
"@modelcontextprotocol/client": "2.0.0"
```

Run:

```powershell
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` updates without upgrading unrelated dependencies.

- [ ] **Step 2: Create the runtime port**

Create `packages/application/src/coding-engine-runtime-port.ts` with the interface above and type-only imports from `@sud-d/domain`. Export it from `packages/application/src/index.ts`.

- [ ] **Step 3: Write RED health-contract tests with injected MCP/process seams**

Extend `packages/tests/src/serena-runtime-foundation.test.ts` to assert at least:

1. exact 22 allowlisted tools with compatible schemas → health accepted with `toolCount === 22`;
2. the same 22 compatible tools plus one unexpected upstream tool → health still accepted with `toolCount === 22`, and the extra tool remains blocked/unreachable;
3. one missing allowlisted tool → `CODING_ENGINE_TOOL_CONTRACT_MISMATCH`;
4. one allowlisted tool with a structurally incompatible `inputSchema` → same failure;
5. `get_current_config` reporting the wrong active project → `CODING_ENGINE_PROJECT_MISMATCH`;
6. config not reporting `Language backend: LSP` → `CODING_ENGINE_LSP_UNAVAILABLE`;
7. symbolic `find_symbol` health probe rejecting/failing → `CODING_ENGINE_LSP_UNAVAILABLE`;
8. MCP child exit/start failure → `CODING_ENGINE_START_FAILED`;
9. repeated `stop()` calls are idempotent;
10. stop failure that leaves the root process alive → `CODING_ENGINE_STOP_FAILED`;
11. the exported Milestone B runtime interface exposes no generic Serena `callTool`/tool-name dispatch surface, so an unexpected upstream tool cannot be invoked through Product Mode.

Test the exported runtime factory/public seam. Do not reach into private functions. The injected raw MCP session remains an infrastructure test seam only; it must never become the Product Mode interface.

- [ ] **Step 4: Verify RED**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: FAIL until the managed runtime exists.

- [ ] **Step 5: Implement `serena-managed-runtime.ts`**

The runtime start sequence is fixed:

```text
create managed paths
→ pre-create project Serena folder + rewrite managed SERENA_HOME config
→ ensure pinned managed Serena is installed
→ launch pinned managed Serena over stdio
→ MCP initialize
→ discover upstream tools/list inventory
→ compute the effective 22-tool SUD-D allowlist surface
→ require every allowlisted tool/schema; keep unexpected tools blocked
→ get_current_config project/backend check
→ symbolic find_symbol sentinel health probe
→ Ready health result
```

Use:

```ts
new StdioClientTransport({
  command: provisioned.executablePath,
  args: [
    'start-mcp-server',
    '--project', context.canonicalRoot,
    '--context', 'desktop-app',
    '--mode', 'no-memories',
    '--open-web-dashboard', 'false',
  ],
  cwd: context.canonicalRoot,
  env: managedEnvironment,
  stderr: 'pipe',
  maxBufferSize: 10 * 1024 * 1024,
});
```

`managedEnvironment` may contain only the MCP transport's safe default inherited environment plus SUD-D-owned uv directory variables and:

```text
SERENA_HOME=<paths.serenaHome>
```

Do not copy `process.env` wholesale. Keep `--mode no-memories` in the launch plan as defense-in-depth, but never infer Product Mode authority from its effect on upstream discovery.

After `client.connect(transport)`:

- require `client.getServerVersion()?.name === 'Serena'` and a non-empty server version;
- treat `client.listTools().tools` as raw discovery inventory only;
- build a name → definition lookup in memory and require every `SERENA_ENGINE_MANIFEST.expectedToolNames` entry to exist;
- compare each allowlisted tool's `inputSchema` against `SERENA_ENGINE_MANIFEST.expectedToolInputSchemas[name]` by canonical JSON structure with object-key order ignored; any missing/incompatible allowlisted definition throws `CODING_ENGINE_TOOL_CONTRACT_MISMATCH`;
- compute the effective Product Mode surface from the allowlist only. Extra upstream tools are ignored for authority and remain unreachable; they do not fail health by themselves;
- return `toolCount: SERENA_ENGINE_MANIFEST.expectedToolNames.length`, never the raw `tools/list` count;
- do not return or persist raw extra names/count in `CodingEngineRuntimeHealth`, application status, audit, UI, SQLite, or errors;
- call `get_current_config` and inspect its text **in memory only**; require:
  - `Serena version: 1.7.0`
  - `Active project: ${context.projectName}`
  - `Language backend: LSP`
  - `Language server status:`
- call this read-only sentinel to require a functioning symbolic/LSP path:

```ts
await client.callTool({
  name: 'find_symbol',
  arguments: {
    name_path_pattern: '__SUD_D_HEALTH_PROBE_DO_NOT_MATCH__',
    relative_path: '',
    include_body: false,
    max_matches: 1,
  },
});
```

The sentinel need not find a symbol. Success means Serena could execute the LSP-backed symbolic path; any tool error maps to `CODING_ENGINE_LSP_UNAVAILABLE`.

The raw MCP session's generic `callTool(...)` method is an infrastructure implementation/test seam only. Milestone B's exported managed-runtime interface remains `start/stop/repair` and exposes no generic Serena dispatch method. Every runtime-owned health call uses an allowlisted tool name. When a later `code.*` milestone introduces dispatch, its fixed adapter mapping must revalidate the mapped upstream name against the same manifest allowlist before raw MCP dispatch; callers still never supply an arbitrary Serena tool name.

Return only the bounded `CodingEngineRuntimeHealth` DTO. Never return raw config/tool text or raw upstream drift inventory.

- [ ] **Step 6: Implement deterministic Windows cleanup**

Promote the Milestone A process-tree strategy rather than relying only on `StdioClientTransport.close()`:

- capture the stdio transport root PID after connect;
- immediately before stop, snapshot the current root/descendant PID tree with the same bounded CIM/PowerShell query pattern proven in Milestone A;
- call `client.close()` best-effort;
- call Windows `taskkill.exe /PID <root> /T /F` when the root/descendants remain;
- poll boundedly until the captured root/descendants are gone;
- if any remains after the deadline, throw `CODING_ENGINE_STOP_FAILED`;
- clear client/transport/context references only after cleanup is confirmed;
- never serialize command output or process command lines.

`stop()` with no active runtime returns successfully.

- [ ] **Step 7: Implement repair at the runtime seam**

`repair(context)` must:

1. call `stop()`;
2. recreate only the managed Workspace state/config;
3. call `provisioner.repairInstalledEngine()`;
4. call the same internal start/health path;
5. map any non-specific failure to `CODING_ENGINE_REPAIR_FAILED`, while preserving known safe Coding Engine failure codes.

No path accepted by repair may point inside `context.canonicalRoot`; only `dataRoot`-derived managed paths are deleted/rebuilt.

- [ ] **Step 8: Verify focused GREEN**

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```powershell
git add packages/application/src/coding-engine-runtime-port.ts packages/application/src/index.ts packages/infrastructure/src/serena-engine-manifest.ts packages/infrastructure/src/serena-managed-runtime.ts packages/infrastructure/src/index.ts packages/infrastructure/package.json pnpm-lock.yaml packages/tests/src/serena-runtime-foundation.test.ts
git commit -m "feat: add managed Serena stdio runtime"
```

---

### Task 5: Add Application Lifecycle, Degraded State, Restart, Repair, and Audit

**Files:**
- Create: `packages/application/src/coding-engine-service.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/tests/src/coding-engine-service.test.ts`

**Interfaces:**
- Consumes: `WorkspaceRepository`, `AuditRepository`, `CodingEngineRuntimePort`.
- Produces:

```ts
export interface CodingEngineService {
  getStatus(): CodingEngineStatus;
  start(): Promise<Result<CodingEngineStatus, AppError>>;
  stop(): Promise<Result<CodingEngineStatus, AppError>>;
  restart(): Promise<Result<CodingEngineStatus, AppError>>;
  repair(): Promise<Result<CodingEngineStatus, AppError>>;
}
```

- Later UI and `code.*` milestones consume this service; they do not know Serena process details.

- [ ] **Step 1: Write RED service tests through the public service interface**

Create `packages/tests/src/coding-engine-service.test.ts` with an in-test fake runtime and repository fakes. Cover these scenarios:

```text
initial status -> unavailable, failure null
start with no active Workspace -> unavailable + CODING_ENGINE_WORKSPACE_NOT_SELECTED
successful start -> starting internally, final ready for active Workspace
bootstrap unavailable -> unavailable + safe error
version/tool/project/LSP/start failure -> needs_repair + safe error
start while already ready on same Workspace -> idempotent, no second runtime start
start after active Workspace changed -> stop old runtime before start new runtime
stop -> unavailable + workspaceId null + failure null
stop twice -> idempotent
restart -> stop then start same current active Workspace
repair -> runtime.repair current active Workspace -> ready
repair failure -> needs_repair + CODING_ENGINE_REPAIR_FAILED or preserved safe runtime code
concurrent lifecycle call -> CODING_ENGINE_LIFECYCLE_BUSY
```

Add `CODING_ENGINE_LIFECYCLE_BUSY` to the domain failure/app-error vocabulary in Task 1's files when this test introduces the requirement; keep the message fixed and safe.

- [ ] **Step 2: Verify RED**

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-service.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the application service**

`createCodingEngineService(workspaceRepo, auditRepo, runtime)` must:

- find the currently active Workspace from `workspaceRepo.list()`;
- build `CodingEngineWorkspaceContext` using:

```ts
{
  workspaceId: workspace.id,
  canonicalRoot: workspace.canonicalRoot,
  projectName: path.basename(workspace.canonicalRoot),
}
```

- keep only `CodingEngineStatus` as application state; never keep raw MCP output;
- guard lifecycle methods with one in-process busy flag;
- map state before/after operations:
  - no runtime / intentionally stopped → `unavailable` with `failure: null`;
  - operation underway → `starting`;
  - validated runtime → `ready`;
  - `CODING_ENGINE_BOOTSTRAP_UNAVAILABLE` → `unavailable` with safe failure;
  - any install/start/version/tool/project/LSP/stop/repair failure → `needs_repair` with safe failure;
- if `start()` is called while ready for a different active Workspace, await `runtime.stop()` before `runtime.start(newContext)`;
- leave native SUD-D services untouched.

Audit only compact lifecycle events with safe metadata:

```text
coding_engine.start.requested
coding_engine.ready
coding_engine.stop.requested
coding_engine.stopped
coding_engine.restart.requested
coding_engine.repair.requested
coding_engine.failed
```

Permitted audit metadata is limited to `engine: 'serena'`, `workspaceId`, `operation`, and safe `failureCode`. Do not audit canonical paths, raw config, PIDs, MCP output, stderr, or environment values in this milestone.

- [ ] **Step 4: Verify GREEN**

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run focused domain + runtime foundation tests together**

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-domain.test.ts packages/tests/src/coding-engine-service.test.ts packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```powershell
git add packages/application/src/coding-engine-service.ts packages/application/src/index.ts packages/domain/src/coding-engine.ts packages/domain/src/result.ts packages/tests/src/coding-engine-service.test.ts
git commit -m "feat: add coding engine lifecycle service"
```

---

### Task 6: Prove the Production Runtime with a Real Windows Acceptance Test

**Files:**
- Create: `packages/tests/src/serena-managed-runtime.acceptance.test.ts`
- Modify: `package.json`
- Reuse unchanged: `packages/tests/fixtures/serena-runtime-spike-ts/**`

**Interfaces:**
- Exercises production `createSerenaEngineProvisioner`, `createManagedSerenaRuntime`, managed paths/config, MCP client, Serena, LSP, and cleanup.
- Does not expose the runtime through desktop IPC/MCP/UI.

- [ ] **Step 1: Write the opt-in acceptance test**

The test runs only when `SUD_D_SERENA_MANAGED_RUNTIME=1`; otherwise it is skipped in the ordinary suite.

The live test must:

1. require Windows;
2. resolve uv through the production bootstrap resolver;
3. create a temporary SUD-D `dataRoot`;
4. copy `packages/tests/fixtures/serena-runtime-spike-ts` to a temporary source Workspace;
5. deliberately create `<temp-workspace>/.serena/developer-marker.txt` containing `do-not-touch` **before** managed runtime start;
6. instantiate the **production** provisioner/runtime with the temporary `dataRoot`;
7. start the runtime with the temporary Workspace;
8. assert health:
   - engine `serena`
   - version `1.7.0`
   - server name `Serena`
   - `toolCount === 22`, meaning the effective SUD-D-authorized allowlist count rather than raw upstream discovery count
   - project name equals the copied Workspace folder name
   - `lspReady === true`;
9. through a **test-only bounded diagnostic seam**, inspect raw `tools/list` in memory only and assert all 22 allowlisted names are present; any unexpected upstream names are treated as drift evidence, not authority;
10. assert the production managed-runtime interface exposes no generic `callTool`/arbitrary Serena tool-name dispatch method, and the test-only raw session records no invocation of an unexpected upstream tool;
11. call runtime `stop()`;
12. assert `developer-marker.txt` is still exactly `do-not-touch` and no new files appeared under the source Workspace `.serena`;
13. assert SUD-D-managed `projectSerenaDir/project.yml` exists outside the source Workspace;
14. assert the managed root PID/process tree is gone through the runtime's public cleanup result/stop success, supplemented by the bounded Windows process check used by the test harness;
15. remove the temporary source Workspace and data root.

The diagnostic may report only bounded raw upstream tool count/names plus derived missing/unexpected name sets for acceptance evidence. If it wraps `listTools()`, it must forward the original tool definitions directly to the production runtime so schema health uses the real `inputSchema`; the diagnostic itself must not copy, print, serialize, or persist descriptions/schemas. Do not capture or persist raw Serena stdout/stderr, environment values, command lines, arbitrary MCP output, or secret-sensitive data.

- [ ] **Step 2: Add the root acceptance command**

Add to root `package.json`:

```json
"serena:managed-runtime": "cross-env SUD_D_SERENA_MANAGED_RUNTIME=1 vitest run packages/tests/src/serena-managed-runtime.acceptance.test.ts --reporter=verbose"
```

- [ ] **Step 3: Run the real secondary validation device acceptance**

```powershell
pnpm serena:managed-runtime
```

Expected: PASS. The first run may install the pinned Serena/Python into the temporary SUD-D data root used by the acceptance test; no project source metadata may be created/changed.

If this test cannot prove central metadata placement, LSP health, presence/schema compatibility of all 22 SUD-D-authorized tools, blocked/unreachable handling of unexpected upstream tools, or cleanup, stop with Milestone B BLOCKED rather than weakening the allowlist contract. Unexpected upstream tools alone are not a blocker when enforcement remains intact.

- [ ] **Step 4: Assert production MCP remains 14 tools**

Run the existing production MCP registration/tool-surface test(s) identified by searching for the current 14-tool assertion. If none has a direct count assertion, add a regression to the existing production gateway test file—not a new runtime exposure—that verifies:

```ts
expect(registeredToolNames).toHaveLength(14);
expect(registeredToolNames.some((name) => name.startsWith('code.'))).toBe(false);
```

Do not change the registration list to make the test pass.

- [ ] **Step 5: Commit Task 6**

```powershell
git add package.json packages/tests/src/serena-managed-runtime.acceptance.test.ts packages/tests/src
git commit -m "test: prove managed Serena runtime foundation"
```

Before committing, inspect `git diff --cached --name-only` and unstage any unrelated test file; the broad `packages/tests/src` add is permitted only after confirming every staged test change belongs to Milestone B.

---

### Task 7: Final Security Verification, Review, Handoff, and Stop Gate

**Files:**
- Modify: `SUD_D_HANDOFF.md`
- No production scope expansion.

**Interfaces:**
- Verifies all Milestone B outputs against the approved design and fixed implementation baseline.

- [ ] **Step 1: Run focused Coding Engine tests**

```powershell
pnpm exec vitest run packages/tests/src/coding-engine-domain.test.ts packages/tests/src/coding-engine-service.test.ts packages/tests/src/serena-runtime-foundation.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the real managed runtime acceptance one final time**

```powershell
pnpm serena:managed-runtime
```

Expected: PASS with the 22-tool SUD-D Product Mode Serena allowlist fully present/schema-compatible, any upstream extras blocked as Ready-but-blocked drift, central SUD-D metadata, LSP health, and clean process teardown.

- [ ] **Step 3: Run relevant runtime/process regressions**

Run the existing secure tunnel/process lifecycle tests plus Milestone A Serena spike non-live tests. Use repository search to select the exact current test files; include at least:

```powershell
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts packages/tests/src/serena-runtime-foundation.test.ts
```

Also include current tests covering `secure-tunnel-process` / connection runtime lifecycle that exercise Windows fixed-purpose process cleanup. Expected: PASS.

- [ ] **Step 4: Run Security / Data Critical final gates once**

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Expected: all PASS.

- [ ] **Step 5: Inspect scope and secret boundaries**

Run:

```powershell
git status --short
git diff <MILESTONE_B_BASE>...HEAD --stat
git diff <MILESTONE_B_BASE>...HEAD -- packages/mcp-gateway packages/desktop
```

Expected:

- no `.serena/` staged/committed;
- no renderer/UI implementation;
- no production `code.*` registration;
- no direct Serena passthrough and no exported generic Serena tool-name dispatch seam;
- unexpected upstream Serena tools remain blocked by the SUD-D Product Mode allowlist and do not alter the effective `toolCount`;
- no unexpected `packages/mcp-gateway` or renderer-visible Desktop behavior changes beyond a test-only 14-tool regression if that test location requires it;
- no raw Serena output, raw upstream drift inventory, environment dump, credential material, or user-global Serena path persisted.

- [ ] **Step 6: Run final `code-review` against the captured baseline**

Use the repo `code-review` skill with fixed point `<MILESTONE_B_BASE>` and spec:

```text
docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md
```

Review Standards and Spec separately. Security/runtime lifecycle, Product Mode allowlist bypass, missing/schema-incompatible allowlisted tools, source Workspace mutation, secret leakage, global Serena fallback, missing cleanup, and unauthorized MCP/UI exposure are blocking findings. Unexpected upstream tools are not blocking by themselves when the SUD-D filter keeps them unreachable and all allowlisted tools remain compatible.

- [ ] **Step 7: Determine the milestone verdict**

Use exactly one:

```text
SERENA RUNTIME MILESTONE B: PASS
```

only if all required verification and review are green.

Otherwise use:

```text
SERENA RUNTIME MILESTONE B: BLOCKED — <specific product/security blocker>
```

or:

```text
SERENA RUNTIME MILESTONE B: INCONCLUSIVE — <specific missing proof>
```

A connector/session timeout is not itself a product blocker; preserve local commits and resume the missing gate.

- [ ] **Step 8: Update handoff only after the verdict is known**

Append a concise Milestone B section to `SUD_D_HANDOFF.md` containing:

- exact verdict;
- implementation baseline SHA;
- milestone commit SHAs;
- Serena manifest pin and 22-tool **SUD-D Product Mode Serena authorized allowlist**, with the distinction that raw upstream discovery may contain additional blocked tools;
- managed state rule: `SERENA_HOME` + project metadata under SUD-D DataRoot, source `.serena` untouched;
- real Windows acceptance result;
- focused/full verification results;
- code-review result;
- explicit statement that production MCP remains 14 tools and no production `code.*` exists;
- explicit limitation: clean-machine/self-contained uv bootstrap and update/rollback promotion are not enabled yet;
- next gate: Milestone C requires a new explicit user instruction.

- [ ] **Step 9: Commit handoff**

```powershell
git add SUD_D_HANDOFF.md
git commit -m "docs: record managed Serena runtime foundation"
```

- [ ] **Step 10: Push safely and prove divergence**

```powershell
git push origin master
git fetch origin
git rev-parse HEAD
git rev-parse origin/master
git rev-list --left-right --count HEAD...origin/master
git status --short --branch
```

Required final state:

```text
HEAD == origin/master
divergence == 0 0
```

`.serena/` may remain untracked/local-only on a developer machine; it must not be staged or committed.

- [ ] **Step 11: STOP**

Do not start Milestone C, do not expose `code.overview`, and do not add any other `code.*` capability without a new explicit user instruction.

---

## Self-Review

### Spec coverage

- Product-owned managed Serena lifecycle: Tasks 2–6.
- Exact pinned Serena manifest with the unchanged 22-name SUD-D Product Mode allowlist and reviewed schema compatibility metadata: Tasks 2 and 4.
- SUD-D-owned allowlist authority / Ready-but-blocked upstream drift semantics: Tasks 4 and 6.
- SUD-D-owned Serena home/config/cache/project metadata: Tasks 2–4.
- Existing Workspace `.serena` not adopted/mutated: Tasks 2 and 6.
- Serena memory/onboarding capability is blocked from Product Mode by the SUD-D allowlist; `--mode no-memories` remains defense-in-depth only: Tasks 2, 4, and 6.
- stdio MCP only: Task 4.
- Version + allowlist/schema health: Task 4 requires all 22 authorized tools to remain present/schema-compatible while unexpected upstream tools remain blocked without becoming a health failure by themselves.
- No arbitrary upstream tool dispatch: Task 4 keeps raw `callTool` internal and Task 6 proves the exported Milestone B runtime exposes no generic tool-name seam.
- Correct active project check: Task 4 combines fixed canonical launch context with Serena-reported active project name.
- LSP usable health: Task 4 symbolic sentinel plus Task 6 real semantic fixture acceptance.
- One Workspace / one runtime and stop-before-rebind: Task 5.
- Restart/repair backend plumbing: Tasks 4–5.
- Degraded/Unavailable/Needs repair states: Tasks 1 and 5.
- No silent fallback: Tasks 3–5 plus final scope inspection.
- Native behavior unchanged and Serena failure does not remove native tools: no production wiring in Milestone B plus Task 6 14-tool regression.
- No production `code.*`: global constraints + Task 6 regression + final scope inspection.
- No UI: global constraints + final scope inspection.
- Secret/raw-output invariant: Tasks 3–5 + final review.
- Deterministic cleanup: Task 4 + Task 6 real Windows acceptance.
- Update/rollback not silently enabled: global constraints; Milestone F remains future work.

### Placeholder scan

The plan contains no `TBD`, `TODO`, “implement later”, or undefined product requirement. The only runtime-dependent discovery step is selecting already-existing process regression test filenames in Task 7; the required behaviors and minimum Serena test files are explicit.

### Type consistency

- `CodingEngineWorkspaceContext` is defined once in Domain and consumed by Application/Infrastructure.
- `CodingEngineRuntimeHealth` is the runtime success DTO across the port.
- `CodingEngineRuntimePort.start/repair` return `Promise<CodingEngineRuntimeHealth>`; `stop` returns `Promise<void>`.
- `CodingEngineService` returns `Result<CodingEngineStatus, AppError>` consistently for lifecycle methods.
- Infrastructure satisfies the application runtime port structurally without adding an Infrastructure → Application dependency.

## Execution Handoff

The Product Mode Serena Allowlist amendment is documented in this plan but **implementation is paused pending explicit user approval of the written amendment**. Do not change the current Milestone B implementation, manifest, or expected 22-name allowlist until that approval is given. After approval, resume Milestone B from the current repository state using the required execution workflow, apply the amended Task 4/Task 6 behavior through TDD, then continue the remaining Milestone B gates. Do not implement Milestone C in the same execution.