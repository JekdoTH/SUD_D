# Milestone D Semantic Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose exactly four bounded semantic-write `code.*` capabilities through SUD-D's production MCP surface, backed only by fixed allowlisted Serena mappings, while preserving Tool Kernel/Policy/Audit, active-Workspace/path/InternalRoot enforcement, Git visibility, and safe failure behavior.

**Architecture:** Extend the Milestone C facade with a separate canonical semantic-write request union and one write port. Application capabilities classify all four operations as normal `modify` effects and reuse the existing Workspace path-security resolver; infrastructure exposes one `semanticWrite(context, request)` method with a closed mapping to the four approved Serena 1.7.0 tools and revalidates the active allowlisted/schema-compatible session before dispatch. Production MCP adds four strict SUD-D schemas for an exact 23-tool surface; no raw Serena name, shell, network, delete, or `code.run` input is exposed.

**Tech Stack:** TypeScript, Zod, MCP SDK, existing Tool Kernel/Policy/Audit, Workspace path adapter, managed Serena 1.7.0 stdio runtime, Vitest/Electron repository test runner, Windows acceptance harness, Git CLI only inside disposable test fixtures for diff/status evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md`

## Global Constraints

- Milestone D only: `code.replace_symbol`, `code.insert_before`, `code.insert_after`, `code.rename`.
- Production MCP final surface is current 19 tools + exactly these 4 additions = exactly 23 tools.
- Fixed upstream mapping only: `replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`.
- No `code.run`, generic/raw Serena passthrough, caller-supplied upstream tool name, file delete, general shell, Network, Restricted Verify, Work Memory, Team Mode, Computer Use, or Recovery/Delete implementation.
- Public calls remain MCP Gateway → Tool Kernel → Policy → Audit → fixed semantic adapter → Product Mode Serena Allowlist/schema revalidation → managed runtime → active Workspace.
- Normal source semantic writes use the existing `modify` effect and baseline Policy; normal Workspace content stays ALLOW while existing sensitive-path Policy/Approval behavior remains unchanged.
- Every path-bearing request resolves as an existing path through `WorkspaceTextFileSystem.resolveExisting`; outside-Workspace, traversal, `.git`, and InternalRoot targets fail before semantic dispatch.
- All input objects are strict. `relativePath` is bounded by `WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars`; `namePath`/`newName` are non-empty bounded text without NUL; inserted/replacement bodies are non-empty UTF-8 and at most `WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes`.
- Raw Serena exceptions/output are never copied into safe errors, audit, Activity, SQLite, logs, or handoff evidence. Upstream failure maps to stable `CODING_ENGINE_UNAVAILABLE`.
- Preserve source Workspace `.serena`; managed Serena state remains under SUD-D DataRoot.
- Preserve the unrelated local `SUD_D_HANDOFF.md` Restricted Execute note and `.serena/` local-only state.
- Use focused-first/final-once/rerun-by-invalidation verification. No intermediate product-suite runs and no intermediate commit are required; commit/push only after final Milestone D gates are green.

---

### Task 1: Canonical semantic-write contract and Tool Kernel capabilities

**Files:**
- Create: `packages/domain/src/coding-semantic-write.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/application/src/coding-semantic-write-capabilities.ts`
- Modify: `packages/application/src/index.ts`
- Create: `packages/tests/src/semantic-write-milestone-d.test.ts`

**Interfaces:**

```ts
export const CODING_SEMANTIC_WRITE_CAPABILITY_NAMES = Object.freeze([
  'code.replace_symbol',
  'code.insert_before',
  'code.insert_after',
  'code.rename',
] as const);

export type CodingSemanticWriteRequest =
  | { capability: 'code.replace_symbol'; input: { namePath: string; relativePath: string; body: string } }
  | { capability: 'code.insert_before'; input: { namePath: string; relativePath: string; body: string } }
  | { capability: 'code.insert_after'; input: { namePath: string; relativePath: string; body: string } }
  | { capability: 'code.rename'; input: { namePath: string; relativePath: string; newName: string } };

export interface CodingSemanticWritePort {
  write(context: CodingEngineWorkspaceContext, request: CodingSemanticWriteRequest): Promise<unknown>;
}
```

- [ ] **Step 1: RED contract tracer.** Add a focused test asserting the exact four names and that the request vocabulary exposes SUD-D fields only; no `toolName`, command, argv, cwd, env, URL, or delete field exists in the public variants.
- [ ] **Step 2: Run RED with the repository test runtime.** Run `pnpm exec vitest run packages/tests/src/semantic-write-milestone-d.test.ts`; expected failure is the absent semantic-write contract/export, not an unrelated environment failure.
- [ ] **Step 3: Implement the minimal domain union and exports.** Do not merge read/write into a generic arbitrary-request type.
- [ ] **Step 4: RED `code.replace_symbol` Tool Kernel tracer.** Build a fake `CodingSemanticWritePort`, real capability registry, real Tool Kernel audit, and an active temp Workspace containing `src/index.ts`; assert normal source write returns `policyDecision: 'allow'`, `effect: 'modify'`, carries exact Workspace context, and records only bounded audit metadata.
- [ ] **Step 5: Implement `createCodingSemanticWriteCapabilities(...)` with only `code.replace_symbol`.** Validate strict `{ namePath, relativePath, body }`, resolve `relativePath` with `resolveExisting`, revalidate the authorized Workspace before execution, and map adapter exceptions to safe `CODING_ENGINE_UNAVAILABLE`.
- [ ] **Step 6: Run GREEN for `code.replace_symbol`.**
- [ ] **Step 7: Repeat one RED→GREEN slice for `code.insert_before`, `code.insert_after`, and `code.rename`.** Every definition uses `effect: 'modify'`; rename validates strict `{ namePath, relativePath, newName }`.
- [ ] **Step 8: Add security regressions.** Prove traversal, absolute path, `.git`, InternalRoot, empty/oversized body, empty/oversized name path/new name, and active-Workspace swap fail before adapter dispatch. Prove normal source writes require no approval ceremony, while existing sensitive-resource classification remains Policy-owned rather than bypassed.
- [ ] **Step 9: Add sanitization regression.** A fake adapter throwing `RAW_SERENA_WRITE_SECRET_SENTINEL` must produce stable `CODING_ENGINE_UNAVAILABLE`, and serialized result/audit must not contain the sentinel or submitted body text.
- [ ] **Step 10: Run Task 1 focused GREEN.**

---

### Task 2: Managed Serena fixed semantic-write mapping

**Files:**
- Modify: `packages/infrastructure/src/serena-managed-runtime.ts`
- Extend: `packages/tests/src/serena-runtime-foundation.test.ts`
- Extend: `packages/tests/src/semantic-write-milestone-d.test.ts`

**Interface:** `createManagedSerenaRuntime(...)` gains only:

```ts
semanticWrite(
  context: CodingEngineWorkspaceContext,
  request: CodingSemanticWriteRequest,
): Promise<unknown>
```

Fixed mapping:

```text
code.replace_symbol -> replace_symbol_body
code.insert_before  -> insert_before_symbol
code.insert_after   -> insert_after_symbol
code.rename         -> rename_symbol
```

- [ ] **Step 1: RED exported-runtime mapping test.** Call each of the four SUD-D requests through `runtime.semanticWrite(...)` and assert the injected MCP session receives exactly the fixed upstream names and snake_case argument objects:

```ts
[
  { name: 'replace_symbol_body', arguments: { name_path: 'add', relative_path: 'src/index.ts', body: '...' } },
  { name: 'insert_before_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', body: '...' } },
  { name: 'insert_after_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', body: '...' } },
  { name: 'rename_symbol', arguments: { name_path: 'Calculator', relative_path: 'src/index.ts', new_name: 'ArithmeticCalculator' } },
]
```

Also assert `'callTool' in runtime === false`.
- [ ] **Step 2: Run RED.** Failure must be the missing `semanticWrite` interface/mapping.
- [ ] **Step 3: Implement the closed write mapper and `semanticWrite`.** Reuse Milestone C's exact Workspace-session matching/lazy-start/rebind behavior; select upstream names only from the discriminated request union; verify the mapped name is in `SERENA_ENGINE_MANIFEST.expectedToolNames` and `active.validatedToolNames` immediately before raw dispatch.
- [ ] **Step 4: Keep Serena arguments schema-exact.** Do not send read-only `max_answer_chars` to write tools; pass only the required Serena 1.7.0 fields from the committed schema evidence.
- [ ] **Step 5: Add fail-closed tests.** Malformed cast requests cannot select `write_memory`, `execute_shell_command`, `safe_delete_symbol`, or any unexpected upstream name; missing/schema-incompatible allowlisted write definitions fail runtime readiness; unexpected upstream extras stay unreachable; raw call failure maps to sanitized `CODING_ENGINE_UNAVAILABLE`.
- [ ] **Step 6: Run runtime + write focused tests GREEN.**

---

### Task 3: Production MCP exact 23-tool composition

**Files:**
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Extend existing production-surface/harness tests that construct `ProductionMcpServerDependencies`
- Extend: `packages/tests/src/semantic-write-milestone-d.test.ts`

**Interfaces:**
- `ProductionMcpServerDependencies` gains `semanticWrite: CodingSemanticWritePort` beside the existing semantic-read port.
- Default composition adapts the same managed runtime only through `semanticRead.read(...)` and `semanticWrite.write(...)`.
- Register exactly four strict Zod schemas using SUD-D field names.

- [ ] **Step 1: RED exact-surface test.** Change the expected production tool set from 19 to exactly 23 and assert the only additions are `code.replace_symbol`, `code.insert_before`, `code.insert_after`, `code.rename`; explicitly assert absence of `code.run`, `dev.verify`, raw Serena names, delete, network, and generic execution tools.
- [ ] **Step 2: Wire the four application capabilities into the production registry.** Use the same Workspace repo, InternalRoot list, file-system resolver, Tool Kernel, Policy, audit repository, and approval coordinator already used by native tools/read facade.
- [ ] **Step 3: Register four fixed MCP handlers.** Each handler is `invokeKernel(kernel, '<fixed code.* name>', input)` and its Zod schema is strict; no caller-controlled upstream name or host-execution field exists.
- [ ] **Step 4: Wire default production composition.** Reuse the existing managed Serena runtime instance and adapt only `runtime.semanticWrite(context, request)`.
- [ ] **Step 5: Update test harness dependencies.** Use a fixed fake semantic-write port; do not add generic test-only dispatch surfaces.
- [ ] **Step 6: Run exact production-surface GREEN = 23.**

---

### Task 4: Activity/audit truth and Git diff visibility

**Files:**
- Extend: `packages/tests/src/semantic-write-milestone-d.test.ts`
- Extend Activity tests in `packages/tests/src/m0.7.test.ts` only if existing projection needs explicit semantic-write coverage
- Modify `packages/desktop/electron/diagnostics-controller.ts` only if a focused RED proves existing Activity is not human-readable/truthful enough

- [ ] **Step 1: Prove detailed audit behavior through the Tool Kernel seam.** Successful writes retain `tool_kernel.invoke` with `metadata.capability = code.*`, effect/policy semantics remain truthful, and submitted body/new-name/raw Serena result text is absent from durable audit serialization.
- [ ] **Step 2: Probe existing Activity projection with semantic-write audit events.** `code.replace_symbol`/insert operations must be visible as meaningful edit activity and `code.rename` must be represented truthfully as a rename rather than shell/file-delete authority. Read-noise suppression from Milestone C must remain unchanged.
- [ ] **Step 3: If Step 2 is RED, STOP this phase before renderer-visible editing, rerun the current-phase Skill Router Gate, load `impeccable`, and apply the smallest Activity presentation change plus focused test.** Do not redesign Activity.
- [ ] **Step 4: Prove Git visibility in a disposable Git fixture.** Establish a committed baseline, perform semantic writes through the trusted semantic-write seam, and assert `git status --short`/`git diff --` reports only the intended project-file changes. Test code may invoke fixed Git commands; no production Git authority changes.

---

### Task 5: Real primary validation device Windows managed semantic-write acceptance

**Files:**
- Modify: `packages/tests/src/serena-managed-runtime.acceptance.test.ts`

- [ ] **Step 1: Extend the existing copied TypeScript fixture, never the user's working tree.** Initialize/commit a disposable Git baseline inside the temp Workspace if the acceptance harness does not already provide one.
- [ ] **Step 2: After runtime health, execute the four real writes through `runtime.semanticWrite(...)`:**
  - replace `add` with a known valid replacement body,
  - insert a known declaration before `Calculator`,
  - insert a known declaration after `Calculator`,
  - rename `Calculator` to `ArithmeticCalculator` so Serena must update the inserted reference as part of the refactor.
- [ ] **Step 3: Assert resulting source semantics.** The replacement text is present, before/after insertions are at the intended symbol boundaries, old class name is absent where rename should refactor it, and the new class/reference name is present.
- [ ] **Step 4: Assert Git visibility.** `git status --short` reports only the fixture source modification and `git diff -- src/calculator.ts` contains the intended semantic changes.
- [ ] **Step 5: Assert authority/cleanup.** Observed raw upstream calls are health calls plus only the four fixed write mappings; all names belong to the committed 22-name allowlist; source `.serena` remains unchanged; no outside/InternalRoot file is modified; managed root PID is dead after `stop()`.
- [ ] **Step 6: Run one conclusive real Windows acceptance.** `pnpm serena:managed-runtime` must PASS. Do not rerun unless runtime/write code changes afterward or the result is inconclusive.

---

### Task 6: Final Security/Data Critical gates, review, handoff, commit, push

**Files:**
- Modify only the current execution section of `SUD_D_HANDOFF.md` when entering the handoff-doc phase; preserve the unrelated Restricted Execute local hunk unstaged.

- [ ] **Step 1: Run final focused Milestone D tests and relevant semantic/runtime/security regressions once on the stable implementation.** Include exact production MCP 23-tool regression, Tool Kernel/Policy/Audit, Workspace/path/InternalRoot security, managed Serena runtime/foundation, Activity if changed, and Git visibility.
- [ ] **Step 2: Run `pnpm lint` and `pnpm typecheck`.**
- [ ] **Step 3: Run the full repository suite once: `pnpm test`.**
- [ ] **Step 4: Run `pnpm build` and `git diff --check`.**
- [ ] **Step 5: Security/data-boundary review.** Prove four `modify` effects; exact 23-tool surface; no `code.run`; no generic/raw Serena passthrough; fixed mapping + allowlist/schema revalidation; Workspace/path/InternalRoot fail-closed behavior; existing Policy/Approval semantics preserved; stable sanitized failures; no raw result/body/secret persistence; no Network/Delete/general Execute authority; `.serena/` untracked.
- [ ] **Step 6: Current-phase router → `code-review`, then two-axis review from fixed point `57246e7a07572c57ed747509c421ea42d52ee858`.** Standards = `AGENTS.md` + security invariants; Spec = uploaded Milestone D task + approved Serena architecture. Blocking findings must be 0 / 0.
- [ ] **Step 7: Current-phase router → `writing-for-agents`, then update `SUD_D_HANDOFF.md` with Milestone D PASS, exact mappings, 23-tool surface, fresh verification, known blockers if any, and next gate requiring new explicit authorization.** Keep the pre-existing Restricted Execute primary validation device note as an unstaged unrelated hunk.
- [ ] **Step 8: Stage only Milestone D files/handoff hunk.** Inspect staged/unstaged diff, `git diff --cached --check`, staged secrets/scope, and verify `.serena/` remains untracked.
- [ ] **Step 9: Commit/push only after all gates are green.** Fetch, prove `HEAD == origin/master` and `origin/master...HEAD` divergence `0 0`.
- [ ] **Step 10: STOP.** Do not start Restricted Verify, Work Memory/Automatic Resume, Team Mode, `code.run`, Computer Use, or Full Recovery/Delete.
