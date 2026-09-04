# Managed Serena Runtime Compatibility Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove on Windows that SUD-D can own one pinned Serena 1.7.0 LSP runtime end-to-end: isolated install, stdio MCP handshake, project activation, tool/schema discovery, one real semantic/LSP call, and deterministic cleanup, without exposing any production `code.*` tool.

**Architecture:** Milestone A is a test-only compatibility spike. The probe lives under `packages/tests`, uses the official MCP TypeScript client to launch Serena over stdio, copies a tiny TypeScript fixture into a temporary directory, and isolates uv/Python/tool/cache state under a spike-owned temporary root. No product runtime manager, renderer UI, Tool Kernel capability, approval flow, or production MCP registration is added in this milestone.

**Tech Stack:** Node.js >=24, pnpm 10.34.5, TypeScript 5.8.3, Vitest 3.2.4, `@modelcontextprotocol/client` 2.0.0, uv, Python 3.13, `serena-agent==1.7.0`, Windows PowerShell/taskkill for process-tree evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md`

## Global Constraints

- This plan implements **Milestone A only** from the approved design spec.
- Candidate Serena pin: PyPI `serena-agent==1.7.0`, upstream tag `v1.7.0`, upstream commit `949a27ef1e5fda1a6e7b561e777bcece345c6ffd`.
- Candidate wheel SHA-256 to record in the evidence report: `6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891`.
- MCP client dependency must be exactly `@modelcontextprotocol/client` `2.0.0`, matching the repo's current MCP v2 line.
- Serena runs over **stdio** in this spike. Streamable HTTP, SSE, user-visible ports, and external MCP config are out of scope.
- Serena runs with the **LSP backend**, `--context desktop-app`, `--mode no-onboarding`, and `--open-web-dashboard false`.
- The spike must not depend on or mutate a user-global Serena installation.
- The spike must not create `.serena/` state inside the SUD-D repository. Any Serena project state belongs only inside a temporary copied fixture and is deleted at cleanup.
- `.serena/` remains local-only and must never be committed.
- Production MCP surface remains exactly the existing 14 tools. No `code.*`, no `dev.verify`, and no direct Serena MCP passthrough may be registered.
- `execute_shell_command` may be observed in Serena's discovered tool list/schema, but this milestone must not expose or call it through SUD-D.
- No renderer-visible UI changes in Milestone A.
- Plaintext credentials must never enter SQLite, renderer/IPC DTOs, audit records, logs, error messages, reports, or other serialized non-secret state.
- Do not copy raw environment variables, credential helper output, or arbitrary Serena stderr into committed evidence.
- The spike is **Security / Data Critical** because it creates a process/runtime seam. Final verification therefore includes focused tests, relevant regression tests, lint, typecheck, full suite, build, `git diff --check`, `code-review`, and one real Windows smoke run.
- STOP if stdio lifecycle, isolated installation, LSP health, or process-tree cleanup cannot be made reliable without weakening existing SUD-D invariants.
- STOP after Milestone A evidence + handoff commit/push. Do not begin Milestone B without a new explicit instruction.

## Pre-Implementation Compliance Check

Before source edits begin, publish this exact shape in the implementation session:

```text
Risk Level
Security / Data Critical

Selected Skill(s)
research — current Serena/uv/MCP runtime facts
codebase-design — test-only runtime seam and lifecycle interface
tdd — integration behavior changes use red -> green
code-review — mandatory final privileged/runtime review

Verification Plan
Focused spike tests; relevant process/runtime regressions; lint; typecheck; full test suite; build; git diff --check; code-review; real Windows Serena smoke.

STOP CONDITION
Stop after Milestone A PASS/BLOCKED/INCONCLUSIVE evidence is committed and pushed. No production code.* tools and no Milestone B work.
```

---

## File Structure

The spike deliberately stays out of production packages.

- Modify: `package.json` — add one root command for the opt-in live spike.
- Modify: `packages/tests/package.json` — add the official MCP client used only by tests/spike code.
- Modify: `pnpm-lock.yaml` — lock the MCP client dependency.
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/package.json` — tiny TypeScript fixture metadata.
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/tsconfig.json` — deterministic TypeScript project settings.
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/src/calculator.ts` — known symbols for LSP proof.
- Create: `packages/tests/src/serena-runtime-spike-harness.ts` — the single test seam for isolated uv/Serena lifecycle, MCP connect/discover/call, and Windows cleanup evidence.
- Create: `packages/tests/src/serena-runtime-spike.test.ts` — pure contract tests plus opt-in real Windows smoke.
- Create after the real run: `docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md` — primary-source facts, environment summary, evidence, and verdict.
- Create after the real run: `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json` — canonical sorted Serena tool/schema snapshot captured from MCP, with no runtime logs or secrets.
- Modify after the verdict: `SUD_D_HANDOFF.md` — concise milestone status and next STOP gate.

The test seam is:

```ts
export interface SerenaRuntimeSpikeReport {
  readonly serenaVersion: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly SerenaDiscoveredTool[];
  readonly overviewText: string;
  readonly rootPid: number;
  readonly observedProcessIds: readonly number[];
  readonly cleanup: 'clean';
}

export async function runSerenaRuntimeSpike(
  options: SerenaRuntimeSpikeOptions,
): Promise<SerenaRuntimeSpikeReport>;
```

Tests and callers verify the spike through this interface; they do not reach into private subprocess or MCP implementation details.

---

### Task 1: Pin the probe dependencies and opt-in command

**Files:**
- Modify: `packages/tests/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: current repo Node/pnpm/Vitest setup.
- Produces: test-only `@modelcontextprotocol/client@2.0.0` and root `pnpm serena:spike` command.

- [ ] **Step 1: Add the failing import smoke test**

Create the first minimal version of `packages/tests/src/serena-runtime-spike.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

describe('managed Serena runtime spike prerequisites', () => {
  it('loads the official MCP v2 client and stdio transport', () => {
    expect(Client).toBeTypeOf('function');
    expect(StdioClientTransport).toBeTypeOf('function');
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: FAIL because `@modelcontextprotocol/client` is not installed in the test workspace.

- [ ] **Step 3: Add the exact dependency**

In `packages/tests/package.json`, add:

```json
"@modelcontextprotocol/client": "2.0.0"
```

Keep it test-only; do not add it to production packages in Milestone A.

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` changes only for the requested dependency graph.

- [ ] **Step 4: Add the root opt-in spike command**

In root `package.json` scripts, add:

```json
"serena:spike": "cross-env SUD_D_SERENA_SPIKE=1 vitest run packages/tests/src/serena-runtime-spike.test.ts --reporter=verbose"
```

Do not add the spike test to a separate always-on network/install path; the live test remains gated by `SUD_D_SERENA_SPIKE=1`.

- [ ] **Step 5: Run the focused prerequisite test and confirm GREEN**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: PASS without downloading or starting Serena.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/tests/package.json pnpm-lock.yaml packages/tests/src/serena-runtime-spike.test.ts
git commit -m "test: add Serena runtime spike prerequisites"
```

---

### Task 2: Add a deterministic TypeScript LSP fixture

**Files:**
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/package.json`
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/tsconfig.json`
- Create: `packages/tests/fixtures/serena-runtime-spike-ts/src/calculator.ts`
- Modify: `packages/tests/src/serena-runtime-spike.test.ts`

**Interfaces:**
- Consumes: filesystem only.
- Produces: immutable checked-in fixture copied to a fresh temporary project for every live spike.

- [ ] **Step 1: Write the failing fixture contract test**

Add:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, '../fixtures/serena-runtime-spike-ts');

it('ships a fixture with stable semantic symbols', () => {
  const source = fs.readFileSync(path.join(fixtureRoot, 'src', 'calculator.ts'), 'utf8');
  expect(source).toContain('export function add');
  expect(source).toContain('export class Calculator');
});
```

Run the focused test and confirm RED because the fixture is absent.

- [ ] **Step 2: Add fixture metadata**

`packages/tests/fixtures/serena-runtime-spike-ts/package.json`:

```json
{
  "name": "sud-d-serena-runtime-spike-fixture",
  "private": true,
  "type": "module"
}
```

`packages/tests/fixtures/serena-runtime-spike-ts/tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Add stable symbols**

`packages/tests/fixtures/serena-runtime-spike-ts/src/calculator.ts`:

```ts
export function add(left: number, right: number): number {
  return left + right;
}

export class Calculator {
  multiply(left: number, right: number): number {
    return left * right;
  }
}
```

- [ ] **Step 4: Run the fixture contract test and confirm GREEN**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: PASS, still without Serena/network activity.

- [ ] **Step 5: Commit**

```bash
git add packages/tests/fixtures packages/tests/src/serena-runtime-spike.test.ts
git commit -m "test: add Serena TypeScript spike fixture"
```

---

### Task 3: Build the isolated runtime-plan seam with pure tests

**Files:**
- Create: `packages/tests/src/serena-runtime-spike-harness.ts`
- Modify: `packages/tests/src/serena-runtime-spike.test.ts`

**Interfaces:**
- Consumes: a caller-provided temporary root and project root.
- Produces:

```ts
export const SERENA_SPIKE_VERSION = '1.7.0';
export const SERENA_SPIKE_UPSTREAM_COMMIT = '949a27ef1e5fda1a6e7b561e777bcece345c6ffd';

export interface SerenaSpikePaths {
  readonly root: string;
  readonly toolDir: string;
  readonly binDir: string;
  readonly pythonDir: string;
  readonly cacheDir: string;
  readonly projectDir: string;
}

export function createSerenaSpikePaths(root: string): SerenaSpikePaths;
export function buildUvEnvironment(paths: SerenaSpikePaths): Record<string, string>;
export function buildSerenaInstallArgs(): readonly string[];
export function buildSerenaServerArgs(projectDir: string): readonly string[];
```

- [ ] **Step 1: Write failing pure contract tests**

Add tests that assert exact values:

```ts
it('isolates every uv-managed directory under the spike root', () => {
  const paths = createSerenaSpikePaths('C:\\temp\\sud-d-serena-spike');
  const env = buildUvEnvironment(paths);
  expect(env.UV_TOOL_DIR).toBe(paths.toolDir);
  expect(env.UV_TOOL_BIN_DIR).toBe(paths.binDir);
  expect(env.UV_PYTHON_INSTALL_DIR).toBe(paths.pythonDir);
  expect(env.UV_CACHE_DIR).toBe(paths.cacheDir);
});

it('pins Serena and Python instead of installing latest', () => {
  expect(buildSerenaInstallArgs()).toEqual([
    'tool', 'install', '--python', '3.13', 'serena-agent==1.7.0',
  ]);
});

it('starts a single project over stdio with no dashboard or onboarding', () => {
  expect(buildSerenaServerArgs('C:\\temp\\fixture')).toEqual([
    'start-mcp-server',
    '--project', 'C:\\temp\\fixture',
    '--context', 'desktop-app',
    '--mode', 'no-onboarding',
    '--open-web-dashboard', 'false',
  ]);
});
```

Run focused tests and confirm RED because the harness does not exist.

- [ ] **Step 2: Implement only the pure runtime-plan functions**

Implementation shape:

```ts
import path from 'node:path';

export const SERENA_SPIKE_VERSION = '1.7.0';
export const SERENA_SPIKE_UPSTREAM_COMMIT = '949a27ef1e5fda1a6e7b561e777bcece345c6ffd';

export function createSerenaSpikePaths(root: string): SerenaSpikePaths {
  return {
    root,
    toolDir: path.join(root, 'uv-tools'),
    binDir: path.join(root, 'bin'),
    pythonDir: path.join(root, 'python'),
    cacheDir: path.join(root, 'uv-cache'),
    projectDir: path.join(root, 'project'),
  };
}

export function buildUvEnvironment(paths: SerenaSpikePaths): Record<string, string> {
  return {
    UV_TOOL_DIR: paths.toolDir,
    UV_TOOL_BIN_DIR: paths.binDir,
    UV_PYTHON_INSTALL_DIR: paths.pythonDir,
    UV_CACHE_DIR: paths.cacheDir,
    UV_NO_MODIFY_PATH: '1',
  };
}

export function buildSerenaInstallArgs(): readonly string[] {
  return ['tool', 'install', '--python', '3.13', `serena-agent==${SERENA_SPIKE_VERSION}`];
}

export function buildSerenaServerArgs(projectDir: string): readonly string[] {
  return [
    'start-mcp-server',
    '--project', projectDir,
    '--context', 'desktop-app',
    '--mode', 'no-onboarding',
    '--open-web-dashboard', 'false',
  ];
}
```

Merge only the minimum safe inherited environment needed to launch uv/Serena; never serialize the inherited environment into results.

- [ ] **Step 3: Run focused tests and confirm GREEN**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/tests/src/serena-runtime-spike-harness.ts packages/tests/src/serena-runtime-spike.test.ts
git commit -m "test: define isolated Serena spike seam"
```

---

### Task 4: Implement isolated installation and MCP lifecycle behind the test seam

**Files:**
- Modify: `packages/tests/src/serena-runtime-spike-harness.ts`
- Modify: `packages/tests/src/serena-runtime-spike.test.ts`

**Interfaces:**
- Consumes: `SerenaSpikePaths`, path to `uv.exe`, copied temporary project.
- Produces:

```ts
export interface SerenaDiscoveredTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: unknown;
}

export interface SerenaRuntimeSpikeOptions {
  readonly uvExecutable: string;
  readonly paths: SerenaSpikePaths;
  readonly fixtureSource: string;
}

export interface SerenaRuntimeSpikeReport {
  readonly serenaVersion: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly SerenaDiscoveredTool[];
  readonly overviewText: string;
  readonly rootPid: number;
  readonly observedProcessIds: readonly number[];
  readonly cleanup: 'clean';
}

export async function runSerenaRuntimeSpike(
  options: SerenaRuntimeSpikeOptions,
): Promise<SerenaRuntimeSpikeReport>;
```

- [ ] **Step 1: Write failing tests for dependency injection and fail-closed prerequisites**

Add pure/fakeable tests for:

```ts
it('rejects a missing uv executable before creating runtime state', async () => {
  await expect(runSerenaRuntimeSpike({
    uvExecutable: 'C:\\missing\\uv.exe',
    paths: createSerenaSpikePaths('C:\\temp\\spike'),
    fixtureSource: fixtureRoot,
  })).rejects.toThrow('SERENA_SPIKE_UV_NOT_FOUND');
});
```

Also test that a non-Windows real run is rejected with a stable `SERENA_SPIKE_WINDOWS_REQUIRED` code rather than attempting a platform fallback.

- [ ] **Step 2: Implement isolated install**

Use `execFileSync`/`spawnSync` with `shell: false` and the exact `buildSerenaInstallArgs()` result.

Requirements:

```ts
execFileSync(options.uvExecutable, [...buildSerenaInstallArgs()], {
  env: { ...safeInheritedEnvironment(), ...buildUvEnvironment(options.paths) },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

- Never call a user-global `serena` executable.
- Resolve the installed executable only from `paths.binDir` (`serena.exe` / `serena.cmd` as actually produced by uv on Windows).
- Verify version output contains `1.7.0` before starting MCP.
- Bound installation/version stderr/stdout kept in memory for error classification; do not include raw output in committed reports.

- [ ] **Step 3: Implement MCP stdio connection using the official client**

Core flow:

```ts
const client = new Client({ name: 'sud-d-serena-spike', version: '0.1.0' });
const transport = new StdioClientTransport({
  command: serenaExecutable,
  args: [...buildSerenaServerArgs(paths.projectDir)],
  cwd: paths.projectDir,
  env: safeSerenaEnvironment,
  stderr: 'pipe',
  maxBufferSize: 10 * 1024 * 1024,
});

await client.connect(transport);
const rootPid = transport.pid;
if (rootPid === null) throw new Error('SERENA_SPIKE_PID_UNAVAILABLE');
const { tools } = await client.listTools();
```

Capture `client.getServerVersion()` after connect. Fail if initialize/version metadata is absent.

- [ ] **Step 4: Implement one real semantic/LSP call**

Require `get_symbols_overview` in discovered tools, then call:

```ts
const overview = await client.callTool({
  name: 'get_symbols_overview',
  arguments: { relative_path: 'src/calculator.ts', depth: 1 },
});
```

Extract only text content into `overviewText`. The later live test asserts it contains the fixture's known symbols.

- [ ] **Step 5: Implement deterministic Windows process cleanup evidence**

Before shutdown, snapshot the root process plus descendants using a bounded PowerShell/CIM query. Do not capture command lines or environments; capture only integer `ProcessId`/`ParentProcessId` pairs.

Cleanup sequence:

1. `await client.close()` in `finally`.
2. Check each observed PID with `process.kill(pid, 0)`.
3. If the root still exists, run `taskkill.exe /PID <rootPid> /T /F` with `shell: false`.
4. If an observed descendant remains after the root exits, kill that PID explicitly with `taskkill.exe /PID <pid> /T /F`.
5. Poll for a bounded interval (maximum 5 seconds) and fail with `SERENA_SPIKE_CLEANUP_FAILED` if any observed process remains.

Return only `cleanup: 'clean'` on success.

- [ ] **Step 6: Run focused pure tests**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: PASS without the live environment variable; no Serena install occurs.

- [ ] **Step 7: Commit**

```bash
git add packages/tests/src/serena-runtime-spike-harness.ts packages/tests/src/serena-runtime-spike.test.ts
git commit -m "test: add managed Serena runtime spike harness"
```

---

### Task 5: Add the opt-in real Windows acceptance test

**Files:**
- Modify: `packages/tests/src/serena-runtime-spike.test.ts`

**Interfaces:**
- Consumes: `runSerenaRuntimeSpike()` and the checked-in fixture.
- Produces: real PASS/BLOCKED evidence for install, stdio, project activation, tool schema, LSP, and cleanup.

- [ ] **Step 1: Add a live-test gate that is skipped during normal test runs**

```ts
const liveSpikeEnabled = process.platform === 'win32' && process.env.SUD_D_SERENA_SPIKE === '1';
const live = liveSpikeEnabled ? it : it.skip;
```

Normal `pnpm test` must not download Python/Serena or access network merely because the spike exists.

- [ ] **Step 2: Add the live acceptance test**

Use OS temp state, never the repo as the Serena project:

```ts
live('installs, starts, discovers, uses LSP, and cleans one pinned Serena runtime', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-serena-spike-'));
  const paths = createSerenaSpikePaths(root);
  fs.cpSync(fixtureRoot, paths.projectDir, { recursive: true });

  try {
    const report = await runSerenaRuntimeSpike({
      uvExecutable: resolveUvExecutable(),
      paths,
      fixtureSource: fixtureRoot,
    });

    expect(report.serenaVersion).toContain('1.7.0');
    expect(report.serverName.toLowerCase()).toContain('serena');
    expect(report.tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'get_symbols_overview',
      'find_symbol',
      'find_referencing_symbols',
      'search_for_pattern',
      'replace_symbol_body',
      'insert_before_symbol',
      'insert_after_symbol',
      'rename_symbol',
      'execute_shell_command',
    ]));
    expect(report.overviewText).toContain('add');
    expect(report.overviewText).toContain('Calculator');
    expect(report.cleanup).toBe('clean');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 180_000);
```

If Serena 1.7.0's actual tool names/schema differ, do not silently change expectations. Capture the actual list, compare with upstream 1.7.0 source/docs, and classify the result as a compatibility finding before editing the expected contract.

- [ ] **Step 3: Prove normal suite stays offline**

Run:

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: pure tests PASS; live test SKIPPED.

- [ ] **Step 4: Run the real Home-PC spike**

Run from the repo root:

```bash
pnpm serena:spike
```

Expected sequence:

1. isolated uv directories created under OS temp,
2. Python 3.13/tool environment resolved inside the spike root,
3. `serena-agent==1.7.0` installed,
4. Serena stdio MCP initializes,
5. server version captured,
6. tool list/schema captured,
7. `get_symbols_overview` returns `add` and `Calculator`,
8. observed Serena/LSP process PIDs are gone after cleanup,
9. temporary root is removed.

If this step fails due to network/package availability, record `INCONCLUSIVE` only when the runtime design itself was not exercised. If the design is exercised and lifecycle/transport/LSP/cleanup fails, record `BLOCKED` with the exact stage.

- [ ] **Step 5: Commit**

```bash
git add packages/tests/src/serena-runtime-spike.test.ts
git commit -m "test: prove Serena stdio LSP compatibility"
```

---

### Task 6: Capture canonical compatibility evidence

**Files:**
- Create: `docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md`
- Create: `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json`

**Interfaces:**
- Consumes: successful or failed live spike result, primary upstream sources.
- Produces: durable evidence for the Milestone A verdict and Milestone B planning.

- [ ] **Step 1: Write the research/evidence report from primary sources**

The Markdown report must include:

```markdown
# Serena Runtime Spike Results

## Verdict
MILESTONE A: PASS | BLOCKED — <reason> | INCONCLUSIVE — <missing proof>

## Candidate Pin
- Package: serena-agent==1.7.0
- Tag: v1.7.0
- Commit: 949a27ef1e5fda1a6e7b561e777bcece345c6ffd
- Wheel SHA-256: 6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891

## Primary Sources
- Serena v1.7.0 release/tag
- Serena installation docs
- Serena running/stdio docs
- Serena project workflow/LSP docs
- uv tool storage/environment docs
- MCP TypeScript client stdio docs/source

## Host Evidence
- Windows edition/build
- Node version
- pnpm version
- uv version
- no user-global Serena dependency used

## Runtime Evidence
- isolated install path model
- exact server args
- initialize/server version
- tool count and schema snapshot path
- project activation result
- get_symbols_overview result summary
- root/descendant PID counts only
- cleanup result

## Security/Scope Confirmation
- no code.* registration
- production MCP remains 14 tools
- no shell call made
- no .serena repo state committed
- no raw environment/credential/log dump persisted
```

Do not commit raw Serena stderr. Summarize errors with stable stage/code and only the minimum non-secret detail needed.

- [ ] **Step 2: Save a deterministic tool/schema snapshot**

Serialize the discovered tools only, sorted by `name`, with the shape:

```json
[
  {
    "name": "find_symbol",
    "description": "...",
    "inputSchema": {}
  }
]
```

No server logs, cwd, PIDs, environment, or file contents belong in this JSON.

- [ ] **Step 3: Validate the snapshot is stable JSON**

Run a small Node check or test to parse it and verify names are strictly sorted and unique.

- [ ] **Step 4: Commit evidence**

```bash
git add docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json
git commit -m "docs: record Serena runtime spike evidence"
```

If verdict is `BLOCKED` or `INCONCLUSIVE`, proceed only to Task 8 handoff/verification; do not invent a fallback transport or start Milestone B.

---

### Task 7: Run Security / Data Critical final verification and code review

**Files:**
- Review all Milestone A changes since the task-start baseline.

**Interfaces:**
- Consumes: completed spike implementation/evidence.
- Produces: fresh final verification evidence and two-axis code review.

- [ ] **Step 1: Capture fixed-point baseline**

Use the commit that was `HEAD` immediately before Task 1 as `<baseline>`.

```bash
git log <baseline>..HEAD --oneline
git diff <baseline>...HEAD --stat
git diff <baseline>...HEAD
```

- [ ] **Step 2: Run focused spike tests without live network**

```bash
pnpm exec vitest run packages/tests/src/serena-runtime-spike.test.ts
```

Expected: PASS with live test SKIPPED.

- [ ] **Step 3: Re-run the real runtime acceptance once**

```bash
pnpm serena:spike
```

Expected: same verdict/evidence as the committed report. If runtime code changed after the evidence capture, regenerate the report/schema snapshot before finalizing.

- [ ] **Step 4: Run relevant process/runtime regressions**

Run tests covering current process lifecycle behavior, especially the existing secure-tunnel process/runtime tests discovered in the repo. Do not broaden into unrelated UI-only tests at this step.

- [ ] **Step 5: Run repository final gates**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

All required checks must pass for `MILESTONE A: PASS`.

- [ ] **Step 6: Run `code-review` against the fixed baseline**

Review two separate axes:

- **Standards:** `AGENTS.md`, repository invariants, process/security conventions.
- **Spec:** `docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md`, Milestone A only.

Blocking findings include secret leakage, global install mutation, unbounded process leftovers, silent fallback, accidental production MCP exposure, or scope creep into Milestone B.

- [ ] **Step 7: Fix only blocking/in-scope findings and refresh invalidated checks**

Do not refactor unrelated code. If a correction changes runtime behavior, rerun the focused test + real smoke and refresh evidence.

---

### Task 8: Update handoff, commit, push, and stop

**Files:**
- Modify: `SUD_D_HANDOFF.md`

**Interfaces:**
- Consumes: final verified verdict.
- Produces: the source-of-truth continuation point for the next session/device.

- [ ] **Step 1: Add a concise handoff entry**

For PASS, record:

```text
Managed Serena Architecture — Milestone A compatibility/runtime spike: PASS
Pin: serena-agent 1.7.0 / upstream 949a27ef...
Transport: stdio
Backend: LSP
Evidence: docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md
Production MCP: unchanged at 14 tools; no code.* exposed
Next: STOP. Milestone B requires explicit user authorization and fresh Skill Router.
```

For BLOCKED/INCONCLUSIVE, preserve the same structure but state the blocker/missing proof and explicitly say no fallback was added.

- [ ] **Step 2: Confirm repository hygiene**

```bash
git status --short
git diff --check
```

Confirm no `.serena/`, temp runtime, Python/uv cache, generated credential data, or unrelated user files are staged.

- [ ] **Step 3: Commit handoff**

```bash
git add SUD_D_HANDOFF.md
git commit -m "docs: record managed Serena runtime spike"
```

- [ ] **Step 4: Push only after all gates are satisfied**

```bash
git push origin master
```

- [ ] **Step 5: STOP**

Do not start runtime foundation, product Setup/Repair UI, `code.*`, Policy classification, approval interception, or `code.run` in this task.

## Primary Technical References for the Executor

Use current first-party sources during Task 6 and re-check them if upstream changed materially:

- Serena v1.7.0 tag: `oraios/serena@949a27ef1e5fda1a6e7b561e777bcece345c6ffd`.
- Serena installation: `docs/02-usage/010_installation.md` at the pinned upstream commit.
- Serena stdio/server args: `docs/02-usage/020_running.md` at the pinned upstream commit.
- Serena project/LSP workflow: `docs/02-usage/040_workflow.md` and `docs/01-about/020_programming-languages.md` at the pinned upstream commit.
- Serena `desktop-app` context and `no-onboarding` mode under `src/serena/resources/config/` at the pinned commit.
- uv tool isolation: official Astral `UV_TOOL_DIR`, `UV_TOOL_BIN_DIR`, `UV_PYTHON_INSTALL_DIR`, `UV_CACHE_DIR` docs.
- MCP client: official `@modelcontextprotocol/client` 2.0.0 `Client` + `StdioClientTransport`; inspect exact 2.0.0 source for `pid`/shutdown behavior before relying on it.

## Plan Self-Review

- Spec coverage: Milestone A exact pin, isolated install/start/stop, stdio handshake, tool/schema capture, project activation, LSP health, cleanup proof, and unchanged production MCP surface all map to explicit tasks.
- Scope: no Milestone B runtime manager, no UI, no `code.*`, no shell exposure.
- Placeholder scan: no `TBD`, `TODO`, unspecified implementation hand-wave, or deferred error-handling step remains.
- Type consistency: `SerenaSpikePaths`, `SerenaRuntimeSpikeOptions`, `SerenaDiscoveredTool`, `SerenaRuntimeSpikeReport`, and `runSerenaRuntimeSpike()` are defined once and used consistently.
- Security consistency: raw env/log persistence is prohibited; temporary Serena state is outside repo; cleanup evidence is explicit; unknown compatibility results fail closed.
