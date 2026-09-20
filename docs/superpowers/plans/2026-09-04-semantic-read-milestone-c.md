# Milestone C Semantic Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose exactly five read-only `code.*` capabilities through the production MCP surface, backed by fixed SUD-D mappings to the managed Serena runtime, while preserving Tool Kernel / Policy / Audit, Workspace boundaries, blocked upstream drift, and stable degraded-mode behavior.

**Architecture:** Add one canonical SUD-D semantic-read request vocabulary, five Tool Kernel capabilities in application, and one managed-runtime semantic-read method that accepts only that discriminated request union. Infrastructure maps each SUD-D capability to one reviewed Serena 1.7.0 allowlisted tool, revalidates the selected mapping before dispatch, lazily binds the managed runtime to the authorized active Workspace, and never accepts an arbitrary upstream tool name. Production MCP registers only the five new facade tools; detailed Tool Kernel audit remains durable while the primary Activity projection suppresses routine semantic-read noise.

**Tech Stack:** TypeScript, Zod, MCP SDK, existing Tool Kernel/Policy/Audit, managed Serena 1.7.0 stdio runtime, Vitest/Electron test runner.

**Spec:** `docs/superpowers/specs/2026-09-04-serena-coding-engine-architecture-design.md`

## Global Constraints

- Milestone C only: `code.overview`, `code.find_symbol`, `code.find_references`, `code.search`, `code.diagnostics`.
- Production MCP final surface is existing 14 native tools + exactly these 5 additions = 19 tools.
- No Semantic Write, `code.run`, generic Serena passthrough, arbitrary upstream dispatch, shell, Delete, Network, Restricted Verify, Work Memory, Team Mode, or UI redesign.
- All public calls pass MCP Gateway → Tool Kernel → Policy → Audit before the fixed semantic adapter.
- A mapped Serena target must be in the committed Product Mode Serena Allowlist and the active runtime's schema-compatible validated tool set.
- Source Workspace `.serena` stays untouched; managed Serena state remains under SUD-D DataRoot.
- No raw Serena runtime output/error is persisted to audit/UI/SQLite/errors. Authorized semantic results are returned only to the caller.
- Preserve the unrelated local `SUD_D_HANDOFF.md` Restricted Execute note and `.serena/` local-only state.
- Per the user task, do not create an intermediate implementation commit; commit/push only after all Milestone C final gates are genuinely green.

---

### Task 1: Canonical semantic-read contract

**Files:**
- Create: `packages/domain/src/coding-semantic-read.ts`
- Modify: `packages/domain/src/coding-engine.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/tests/src/semantic-read-milestone-c.test.ts`

**Interfaces:**
- Produces `CODING_SEMANTIC_READ_CAPABILITY_NAMES` with exactly five approved `code.*` names.
- Produces a discriminated `CodingSemanticReadRequest` union with SUD-D camelCase fields and no upstream Serena tool-name field.
- Adds stable `CODING_ENGINE_UNAVAILABLE` failure vocabulary for unavailable/unresponsive semantic reads.

- [ ] **Step 1: Write a failing contract test.** Assert the exact five names and a stable safe `CODING_ENGINE_UNAVAILABLE` AppError mapping.
- [ ] **Step 2: Run RED.** `pnpm exec vitest run packages/tests/src/semantic-read-milestone-c.test.ts` must fail because the contract is absent.
- [ ] **Step 3: Implement the minimal union.** Variants are:

```ts
export type CodingSemanticReadRequest =
  | { capability: 'code.overview'; input: { relativePath: string; depth?: number } }
  | { capability: 'code.find_symbol'; input: { namePathPattern: string; relativePath?: string; depth?: number; includeBody?: boolean; substringMatching?: boolean; maxMatches?: number } }
  | { capability: 'code.find_references'; input: { namePath: string; relativePath: string } }
  | { capability: 'code.search'; input: { pattern: string; relativePath?: string; codeOnly?: boolean } }
  | { capability: 'code.diagnostics'; input: { relativePath: string; startLine?: number; endLine?: number; minSeverity?: 1 | 2 | 3 | 4 } };
```

No variant contains `toolName`, `command`, `argv`, `cwd`, `env`, or network input.
- [ ] **Step 4: Run focused test GREEN.**

---

### Task 2: Five Tool Kernel semantic-read capabilities

**Files:**
- Create: `packages/application/src/coding-semantic-read-capabilities.ts`
- Modify: `packages/application/src/index.ts`
- Extend: `packages/tests/src/semantic-read-milestone-c.test.ts`

**Interfaces:**

```ts
export interface CodingSemanticReadPort {
  read(context: CodingEngineWorkspaceContext, request: CodingSemanticReadRequest): Promise<unknown>;
}
```

`createCodingSemanticReadCapabilities({ workspaceRepo, internalRoots, fileSystem, semanticRead })` returns exactly five `RegisteredToolCapability` definitions.

- [ ] **Step 1: RED tracer bullet for `code.overview`.** Use a fake semantic port plus the real Tool Kernel registry/audit. Prove effect `read`, policy `allow` for normal source, correct Workspace context/request, and durable audit metadata `capability: code.overview`.
- [ ] **Step 2: Implement only `code.overview`.** Strict input validation; resolve the path through `WorkspaceTextFileSystem.resolveExisting`; revalidate the authorized active Workspace at execution; return safe `Result` failures rather than throwing raw adapter errors.
- [ ] **Step 3: Run overview GREEN.**
- [ ] **Step 4: Repeat one RED→GREEN slice for `find_symbol`, `find_references`, `search`, and `diagnostics`.** Optional whole-Workspace paths use `.` only for local security resolution and map back to `''` for Serena.
- [ ] **Step 5: Add security regressions.** Traversal, absolute paths, `.git`, and InternalRoot targets must fail before adapter dispatch; active Workspace swap between authorization and execution must fail closed; all five definitions remain effect `read`; normal source reads require no human approval.
- [ ] **Step 6: Prove an unavailable semantic port becomes a stable safe cause (`CODING_ENGINE_UNAVAILABLE`) with no raw error text in audit/result.**
- [ ] **Step 7: Run Task 1–2 focused tests GREEN.**

---

### Task 3: Managed Serena fixed mapping and lazy Workspace binding

**Files:**
- Modify: `packages/infrastructure/src/serena-managed-runtime.ts`
- Extend: `packages/tests/src/serena-runtime-foundation.test.ts`
- Extend: `packages/tests/src/semantic-read-milestone-c.test.ts`

**Interface:** `createManagedSerenaRuntime(...)` gains only:

```ts
semanticRead(context: CodingEngineWorkspaceContext, request: CodingSemanticReadRequest): Promise<unknown>
```

It still exposes no raw `callTool` or arbitrary Serena tool-name dispatch.

Fixed mapping:

```text
code.overview        -> get_symbols_overview
code.find_symbol     -> find_symbol
code.find_references -> find_referencing_symbols
code.search          -> search_for_pattern
code.diagnostics     -> get_diagnostics_for_file
```

- [ ] **Step 1: Write RED mapping tests at the exported runtime seam.** Each SUD-D request must call exactly one fixed upstream name with fixed snake_case arguments; `callTool` must remain absent from the runtime object.
- [ ] **Step 2: Run RED.**
- [ ] **Step 3: Refactor `assertToolContract` to return the validated allowlisted-name set and store it in `ActiveSession`.** No extra upstream names are persisted.
- [ ] **Step 4: Implement `semanticRead`.** Lazily start if no active session; stop-before-rebind if the supplied exact Workspace context differs; select upstream name only from the closed mapping; verify it is in the manifest allowlist and active validated set; translate arguments; force an internal bounded `max_answer_chars`; dispatch through the internal session only.
- [ ] **Step 5: Map an unresponsive raw call to `CodingEngineRuntimeFailure('CODING_ENGINE_UNAVAILABLE')`; never serialize the upstream exception/output into the failure.**
- [ ] **Step 6: Add fail-closed regressions.** Missing/schema-incompatible allowlisted definitions prevent semantic readiness; unexpected extras remain unreachable; malformed requests cannot select an extra tool.
- [ ] **Step 7: Run runtime + semantic focused tests GREEN.**

---

### Task 4: Production MCP composition and exact 19-tool surface

**Files:**
- Modify: `packages/mcp-gateway/src/workspace-file-server.ts`
- Extend: `packages/tests/src/team-mode.test.ts`
- Extend: `packages/tests/src/semantic-read-milestone-c.test.ts`

**Interfaces:**
- `ProductionMcpServerDependencies` gains a fixed `semanticRead: CodingSemanticReadPort` dependency for testable composition.
- Default production composition creates one managed Serena runtime under the existing DataRoot and adapts only its `semanticRead(context, request)` method.
- Register five strict Zod schemas using SUD-D field names; every handler is `invokeKernel(kernel, '<fixed code.* name>', input)`.

- [ ] **Step 1: RED production-surface test.** Update exact expectation from 14 to 19 and assert the additions are exactly the five approved names; forbidden Milestone D/E/generic names remain absent.
- [ ] **Step 2: Wire semantic capabilities into the production registry beside Workspace/Git/Team.** Use the same Workspace repository, InternalRoot list, file-system security resolver, Tool Kernel, Policy, and audit repository.
- [ ] **Step 3: Register exactly five fixed MCP tools.** No arbitrary JSON passthrough, Serena name, executable, argv, cwd, env, or URL input.
- [ ] **Step 4: Wire the default managed runtime.** Native tools remain registered and usable if Serena is unavailable; only `code.*` fails safely.
- [ ] **Step 5: Run production-surface GREEN with exactly 19 tools.**

---

### Task 5: Detailed audit without Activity spam

**Files:**
- Modify: `packages/desktop/electron/diagnostics-controller.ts`
- Extend: `packages/tests/src/m0.7.test.ts`

**Interface:** Detailed audit continues storing `tool_kernel.invoke` with `metadata.capability = code.*`; `listActivity()` filters only the five routine semantic-read capabilities from the primary Activity projection.

- [ ] **Step 1: RED Activity test.** Seed a `code.find_symbol` Tool Kernel event plus a meaningful non-code event; assert the semantic read is absent from Activity while the other event remains.
- [ ] **Step 2: Implement the minimal metadata-capability filter.** Do not hide semantic writes (future), Git, Team, approvals, coding-engine health/repair failures, or unrelated Tool Kernel events.
- [ ] **Step 3: GREEN Activity test and prove detailed audit still contains semantic-read events.**

---

### Task 6: Real Windows managed semantic-read acceptance

**Files:**
- Modify: `packages/tests/src/serena-managed-runtime.acceptance.test.ts`

- [ ] **Step 1: Extend the existing opt-in acceptance after runtime health.** Call all five `runtime.semanticRead(...)` operations against the copied TypeScript fixture: overview, find symbol, references, search, diagnostics.
- [ ] **Step 2: Assert every result is bounded, observed raw upstream names contain only existing health calls + the five fixed mapped names, source `.serena` remains byte-equivalent, and cleanup kills the managed root PID.**
- [ ] **Step 3: Run the real primary validation device Windows acceptance.** `pnpm serena:managed-runtime` must PASS.

---

### Task 7: Final gates, review, handoff, commit, push

**Files:**
- Modify only the Milestone C/current execution section of `SUD_D_HANDOFF.md`; preserve the unrelated Restricted Execute local note correctly.

- [ ] **Step 1: Run focused Milestone C tests plus Serena foundation and exact production-surface tests.**
- [ ] **Step 2: Run relevant regressions:** Tool Kernel/Policy/Audit, Workspace/path security, Serena/runtime/process, MCP production surface, Activity.
- [ ] **Step 3: Run `pnpm lint` and `pnpm typecheck`.**
- [ ] **Step 4: Run `pnpm test` once on the stable tree.**
- [ ] **Step 5: Run `pnpm build` and `git diff --check`.**
- [ ] **Step 6: Security/data-boundary review.** Prove exact 19-tool surface; five read effects only; Tool Kernel/Policy/Audit path; fixed mapping + allowlist revalidation; no arbitrary upstream dispatch; traversal/InternalRoot denied before dispatch; unavailable/unresponsive safe failure without fallback; no raw Serena output/errors persisted; `.serena/` untracked.
- [ ] **Step 7: Two-axis code review from fixed point `3e5cbcb2780c338ce26c199228de8c419a619d7c`.** Standards = `AGENTS.md`/security invariants; Spec = uploaded Milestone C task + approved Serena architecture. Blocking findings must be 0 / 0.
- [ ] **Step 8: Update `SUD_D_HANDOFF.md` with Milestone C PASS, mappings, fresh evidence, and next gate = Semantic Write requires a new explicit instruction.** Preserve the unrelated local Restricted Execute note outside the staged Milestone C hunk.
- [ ] **Step 9: Stage only Milestone C files.** Inspect `git diff --cached --name-only`, `git diff --cached --check`, staged secret/scope checks, and verify `.serena/` is not tracked.
- [ ] **Step 10: Commit, push `master`, fetch, prove `HEAD == origin/master` and divergence `0 0`.** STOP immediately; do not start Milestone D or later roadmap items.
