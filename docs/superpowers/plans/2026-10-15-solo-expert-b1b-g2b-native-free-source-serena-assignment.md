# SUD_D B1b-G2b — Native-free ESM Source Seam (ONE LONG BOUNDED SERENA MISSION)
**Date:** 2026-10-15
**Actor:** Serena Home New, in **SEPARATE IMPLEMENTATION CHAT**.
**Status:** **APPROVED BY CHATGPT PROJECT ADVISOR** under Owner's delegated bounded engineering approval (`SUD_D_ADVISOR.md`).
**Risk:** Security / Data Critical. **One Mission → One Final Closeout → STOP.** Internal safe Gate-to-Gate progress and at most three focused repairs per diagnosed root cause require no interim Advisor review. **No G2b artifact publication or runtime smoke rights.**

## 1. Mandatory preflight and authoritative inputs

Read and follow `AGENTS.md`, `SUD_D_ADVISOR.md`, latest **top** `SUD_D_HANDOFF.md`, relevant `SUD_D_CONTEXT.md` and `SUD_D_ROADMAP.md`; run Skill Router Gate, load canonical `.agents/skills/codebase-design/SKILL.md`, `.agents/skills/tdd/SKILL.md`, and `.agents/skills/writing-for-agents/SKILL.md` (as applicable to final agent-facing report); load `diagnosing-bugs` only on unexpected failure. Record selected skills.

Read:
- `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-native-free-source-advisor-decision.md` — binding delegated Advisor decision;
- `.serena/reports/solo-expert-b1b-g2b-native-free-source-seam-codex-design-20261015.md` — independent Codex GPT-6.1 Sol High READ-ONLY design (never invoke Codex yourself);
- `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-static-diagnostic-advisor-acceptance.md` and `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-continuation-advisor-final-acceptance.md` — accepted prior evidence/limitations;
- `.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md` — 444 output prior frozen manifest, preserved BYTE-IDENTICALLY; old 81 different/missing artifacts are not a writable list.

Verify active `SUD_D` canonical repo, branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged zero, dirty/untracked user work preserved. Capture before hashes of all exact 16 writable paths (including ABSENT for 4 new paths), protected Source, 4 R3 Contracts `dist/index.*` outputs, previous G2b manifest, all affected Package Exports, compiler/config/lock/read-set. Confirm nothing else is written during this mission. Unexpected drift: HARD STOP, do not reset/checkout/clean.

**Role isolation:** Serena **NEVER calls Codex CLI/`codex exec`/MCP/agent/delegates/subagents, Remote Desktop Commander or Team Mode**. Design gaps return to Advisor. Serena uses its own authorized Source edits and inert, installed local Compiler API only; no product process spawning.

## 2. EXACT 16 ALLOWED SOURCE/TEST/PACKAGE WRITABLE PATHS

**Metadata — EDIT existing only (3)**
1. `packages/application/package.json`
2. `packages/infrastructure/package.json`
3. `packages/mcp-gateway/package.json`

**Core facades and factory — CREATE 3, EDIT 1**
4. `packages/application/src/gateway-core.ts` (**NEW**)
5. `packages/infrastructure/src/gateway-core.ts` (**NEW**)
6. `packages/mcp-gateway/src/workspace-file-server-core.ts` (**NEW**)
7. `packages/mcp-gateway/src/workspace-file-server.ts` (**EDIT**)

**Application runtime value imports — EDIT existing only (7)**
8. `packages/application/src/coding-semantic-read-capabilities.ts`
9. `packages/application/src/coding-semantic-write-capabilities.ts`
10. `packages/application/src/workspace-file-capabilities.ts`
11. `packages/application/src/git-safety-capabilities.ts`
12. `packages/application/src/git-workspace-service.ts`
13. `packages/application/src/project-runner-service.ts`
14. `packages/application/src/workspace-service.ts`

**Inert static evidence/testing — EDIT existing 1, CREATE 1**
15. `packages/tests/src/b1b-g2b-artifact-evidence.cjs` (**EDIT**)
16. `packages/tests/src/b1b-g2b-native-free-source.test.cjs` (**NEW**)

**ONE AND ONLY other authorized output:**
`.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md` (**NEW ignored report**).

Everything outside these **exact 17 paths** is READ-ONLY. No other notes, test artifacts/fixtures, generated code, `dist`, `tsbuildinfo`, `TEMP`, package scripts, `pnpm-lock.yaml`, TypeScript configs, security core, Policy/Approval/Kernel, DB/Migration, Domain/Contracts, Desktop IPC/Renderer, credential/native implementations, managed Serena runtime, or legacy test-suite changes. No installs, build/package, privileged terminal/native, project/runtime/package import, provider/network, Desktop App/Gateway/MCP production, real Managed Serena, B2, git stage/commit/push/reset/clean. If a 17th Source/Test/Metadata path or second report is needed, HARD STOP and return exact reason. Owner permission to do a long mission never widens this allowlist.

## 3. Gates (complete sequentially in one mission)

**Gate A — No-native Interface design & RED proof.** Compare the Codex exact design against current source. Record signature/AST snapshots of existing `createProductionMcpServer`, its tools/schema/registration, `createDefaultProductionMcpServer`, dependency types and original seven consumers. Add static graph unit tests in the one new standalone `.cjs` file using Node built-ins + installed TypeScript only. Avoid importing the old harness before ensuring it is protected by a `require.main===module` entrypoint guard (allowed targeted initial neutral-safety edit). RED assertions must show old graph/source configuration fails to meet new native-free subpath and capture-closed-world requirements. No product module evaluation.

**Gate B — Exact Additive Interfaces / Source extraction.**
- Introduce three explicit `package.json exports` subpaths:
  - `@sud-d/infrastructure/gateway-core`: `./dist/gateway-core.js` (import), `./dist/gateway-core.d.ts` (types)
  - `@sud-d/application/gateway-core`: same names in its package
  - `@sud-d/mcp-gateway/gateway-core`: `./dist/workspace-file-server-core.js`, corresponding `.d.ts`.
  For every subpath `types` before `import`; keep legacy `.`, main/types/bin, all scripts/deps/old exports unchanged. No wildcard, source-only or require branch.
- Infrastructure narrow facade: named value reexports ONLY as Codex specifies from `path-adapter`, `workspace-text-file-system`, `git-safety-adapter`, `runner-manifest`, `runner-snapshot`. No Infrastructure barrel import or native module value export. Type-only imports from legacy modules are permitted only when strictly erased.
- Application narrow facade: named values from the Codex enumerated capabilities/services leaves (coding semantic, git, work-memory/resume, Solo integration, Team, Tool Kernel, workspace file), **not** `application/src/index.ts`. Use `import type`/type exports where needed; no `connection-config-service` or `connection-service` native/credential composition in new facade.
- Extract the unchanged **injected** MCP factory, schemas, dependency interface and helpers to `workspace-file-server-core.ts`. Legacy `workspace-file-server.ts` keeps default composition and reexports original factory/dependency type, with original synchronous signature, schemas/tool-registration logic unchanged. Preserve all preexisting exports; no new execution side effects in core. The new import-only Gateway subpath resolves directly to the extracted core. Do not change privileged behavior or registration.
- Redirect only seven exact Application Value consumers listed in §2 to the new narrow Infrastructure subpath, splitting mixed type/value clauses correctly. Connection/credential consumer modules remain unchanged. No extra App source file modifications.
- Preserve Default-OFF Solo tool behavior, same-coordinator HMAC/manual Approval, Resume/Workspace generation/session, frozen digest, one-use ledger/UNKNOWN and Audit, all Policy→Kernel→human review checks. Use moved source/helper AST equivalence plus strict TypeScript diagnostics; **do not replace existing runtime acceptance with mere TypeScript success**.

**Gate C — Harness strengthening and GREEN static proof.**
Modify existing `b1b-g2b-artifact-evidence.cjs` *in place*, making it side-effect-free when imported by its standalone fixture test. Keep existing eleven safety assertions, make source/read-set and report generation deterministic, remove historical hardcoded counts.

Required changes:
1. Capture complete configured package `parsed.fileNames` (plus package-root/bin/resource targets), not only old 111/125 subset. Count actual current emitted modules; do not promise 444, 81 or 448. All TypeScript `emit` bytes exclusively in memory; never call compiler disk write.
2. Project ESM import and declaration resolution is **closed world**: every internal `@sud-d/*` import/reexport/resource target must be represented in the captured map/virtual declaration overlay, **never accepted merely because stale physical `dist` exists**. Support exact subpaths with condition-ordered `types`/`import` package exports; unknown branch/path fails closed, no handwritten stubs.
3. Independently parse TypeScript source AST and emitted JS AST, verify source erased type edges and value/reexport edges, explicit package entries, computed/worker resource references; classify static/externally unresolved patterns or BLOCKED. Legacy native reaches Koffi and remains expected; **new native-free Gateway subpath → ZERO native addon/koffi edges**. Don't load any external dependency: inspect package exports/source bytes and hash external read-set statically. If external native loader uncertainty remains, report static source-level proof qualified, not “runtime safe”.
4. Run all four configured strict Node16 package typechecks with real captured virtual declaration overlay and existing `skipLibCheck:true`, zero diagnostics. Preserve scoped lint, no extra dependencies or configs.
5. Add standalone CJS tests: stale physical target but absent capture fails; unknown subpath fails; ordered export conditions; type-only versus value edges; transitive Koffi root rejection; missing declaration cannot fall through to physical disk; variable worker/resource edges blocked; AST factory/schema unchanged (relocation only); legacy root and default factory preserved; source/read-set drift rejection; test import never starts harness or writes report; eleven existing selftests still pass. Single-process `node` runner only, NO Vitest/Electron child process.
6. Move evidence harness reporting to the ONE new Closeout path for this mission and leave the earlier accepted `.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md` byte-identical. Keep harness `--self-test` report untouched. Do not write intermediate JSON/artifacts/temp files.

**Gate D — Final once Verification and preservation.** Run `node --check` for both CJS files, `node ...b1b-g2b-native-free-source.test.cjs`, `node ...b1b-g2b-artifact-evidence.cjs --self-test`, normal in-memory analysis (only final ignored report output), Node16 strict virtual package diagnostics, scoped ESLint for all changed TS paths, `git diff --check`. Report actual true tool/process exit statuses, counts/failures/edge cases, package-export signature preservation, 16-path before/after SHA-256, and unchanged 4 R3 Contracts artifact and earlier G2b report hashes. Record Git HEAD/staged/status before+after; preserve inherited dirty tree, not blindly clean.

**Previously accepted R3/G2a 103 PASS + one worker-only SKIP is historical evidence ONLY.** Do not rerun it under this authorization: those suites use installed SQLite native addon and the persistence test starts a child test process. Source extraction may invalidate prior runtime equivalence; record it as future parity gate, not falsely newly passed. The `source-only` gate cannot certify canonical package runtime smoke without compiled publication.

## 4. STOP and closeout

On scope/security/architecture/unstable read-set/unsupported compiler/external unresolved Native/required real process or extra output path, HARD STOP with exact evidence; do not expand. Otherwise proceed through safe internal Gates A→B→C→D including repair cycles (up to three per diagnosed root cause) **WITHOUT returning per-Gate reviews**.

Create only `.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md` as the ONE final ignored Closeout. Include source/export/AST/native-edge closure diagrams/tables, exact fresh memory-only artifact inventory (as candidate only), 4 package typechecks, independently running selftests, restricted test host proof, preservation hashes, tool exits and any limits. If all pass report **`G2b NATIVE-FREE SOURCE ISOLATION STATICALLY VERIFIED; COMPILED RUNTIME PARITY NOT_READY`**. If blocked report **PARTIAL/HARD STOP** with exact reason. In either case: `DIST NOT AUTHORIZED; LIVE MANAGED SERENA NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED`.

Return Closeout path and short outcome to Owner for ONE Advisor review, then **STOP**. No automatic G2b Build, `dist` publication, native/runtime smoke, product host or new milestone.
