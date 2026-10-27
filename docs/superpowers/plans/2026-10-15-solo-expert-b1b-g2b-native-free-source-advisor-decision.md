# SUD_D B1b-G2b — Advisor Native-free Source Seam Design Acceptance (2026-10-15)

**Decision:** ACCEPT `gpt-6.1-sol` / High independent READ-ONLY Source Seam Design WITH CONDITIONS. AUTHORIZE ONE NEW, EXACT-SCOPE **SOURCE-ONLY** Serena Long Bounded Mission. **NO generated `dist`, Build, Native/Runtime smoke, Desktop/Managed Serena/real Terminal/B2 or Git writes.**

## Inputs and independent constraints

- R3 and G2a SOURCE/FAKE accepted. G2b STATIC DIAGNOSTIC accepted with limitations: `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-static-diagnostic-advisor-acceptance.md`. The prior manifest in `.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md` and inert harness in `packages/tests/src/b1b-g2b-artifact-evidence.cjs` were validated; 444 outputs/643 source-read hashes, 4 configured Node16 strict virtual package checks = 0 diagnostics, 11 Koffi native edges.
- Read-only Codex design: `.serena/reports/solo-expert-b1b-g2b-native-free-source-seam-codex-design-20261015.md`. It compares: (A) additive subpaths/extracted injected MCP factory = recommended; (B) lazy native load = defer; (C) remove legacy exports = reject due compatibility. No implementation by Codex.
- Active `SUD_D` repo `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, index/staged zero, inherited dirty/untracked paths are user-owned. Before dispatch Advisor checked all 16 candidate path exist/absent states (12 existing, four new), and Git `diff --check` previously exit 0. Treat user-owned files and old accepted artifacts as protected unless enumerated below.
- Explicit Owner delegation in `SUD_D_ADVISOR.md` permits bounded engineering Source/Test/Metadata decisions inside approved direction; not privileged host, native or Desktop human consent. User prefers ONE LONG BOUNDED MISSION → ONE FINAL CLOSEOUT.

## Architecture approved

Add narrow native-free subpath package Interfaces to **existing packages**, retaining legacy root Interfaces and all native adapters unchanged:

- `@sud-d/infrastructure/gateway-core` → `./dist/gateway-core.js` and `./dist/gateway-core.d.ts`
- `@sud-d/application/gateway-core` → `./dist/gateway-core.js` and `./dist/gateway-core.d.ts`
- `@sud-d/mcp-gateway/gateway-core` → `./dist/workspace-file-server-core.js` and `./dist/workspace-file-server-core.d.ts`

Package exports entries must put `types` before `import`, preserve old `.`, main/types/scripts/dependencies/bin and no wildcard/CommonJS/source exports. Keep default composition in `workspace-file-server.ts` and extract original injected factory + schemas/dependency type/tool registration to `workspace-file-server-core.ts`, with original factory/type **still reexported unchanged** by legacy path. Redirect only the seven Codex-enumerated Application value consumers to narrow Infrastructure native-free facade; direct value imports must never reenter legacy Infrastructure/Application barrels along fake entry graph. Avoid new top-level side effects.

**No Security behavior changes:** preserve Tool Kernel/Policy, default-off Solo registration, session/Workspace generation Resume, same coordinator HMAC/manual Approval/digest, immutable review, one-use SQLite claim/UNKNOWN and Audit; move implementation AST intact, never weaken. Do not change credential implementation, Native H0/H1, DB migrations, Desktop/Renderer/IPC, Managed Serena, domain rules or existing accepted test suites.

## Exact new Serena permission (16 Source/Test/Metadata paths, one ignored Closeout)

**Binding separate Serena assignment:** `docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-native-free-source-serena-assignment.md`, which enumerates:
- 3 package manifests, 3 new narrow TS modules, 1 existing Gateway factory module, 7 existing Application import-consumer TS files;
- existing inert evidence harness `packages/tests/src/b1b-g2b-artifact-evidence.cjs` and one NEW standalone `packages/tests/src/b1b-g2b-native-free-source.test.cjs`;
- one ignored report `.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md`.

Any requested 17th source/test/metadata path or second report requires STOP and Advisor redesign. Permission is only for **source edits and in-memory compiler emission**; no `dist` publication, scripts/config/lockfile edits, temp test output or builds.

## Required proof & limits

- Static independently parsed source AST + emitted JS graph for new entrypoint: zero executable `koffi` / native addon edges. Legacy root retains native edges; that's expected, not a fail.
- Strong closed-world capture: every referenced internal SUD_D JS must be compiler-captured even if physical `dist` exists; package export subpath conditions resolved exactly; independent declaration overlay (Node16, `strict:true`, configured `skipLibCheck:true`) excludes physical fallback.
- Hash 100% configured sources and compiler read-set before/after; memory-only output with SHA exact inventory, typed/static resource closure and fail-closed unknown dynamic edges. Keep previously accepted full Manifest/report file byte-identical.
- Test-only CJS graph assertions and H1 self-test run one process, no product/native imports, no Vitest/Electron suites creating child processes or loading SQLite native binding. Existing R3/G2a 103 PASS evidence is preserved as **historical acceptance**, not freshly passing after source changes. Source isolation checkpoint verdict must not claim G2a full regression or canonical runtime parity. Later separate runtime/native boundary will need appropriately authorized verification.
- No `@sud-d/*` package/runtime import smoke, installed native `koffi`/better-sqlite3/worker process, no native network or real terminal. No git stage/commit/push/reset/clean, no cross-agent Codex invocation by Serena, no Remote Commander/Team. Run scoped static tests, TS overlays, ESLint, `git diff --check`, hash invariants and true process exit codes; up to 3 repairs/diagnosed cause.

**STOP:** after one final Closeout or actual scope/security/architecture/uncertainty failure. **Ceiling:** `G2b SOURCE NATIVE-FREE STATICALLY VERIFIED (if evidence passes), COMPILED RUNTIME PARITY PENDING; G2b DIST NOT AUTHORIZED; LIVE NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED`.

**Next Advisor decision after Closeout:** independent source/static review, then recapture exact output manifest on source freeze and only then consider an exact finite `dist` artifact write mission with rollback and strictly controlled runtime verification. Prior 81 differing/missing artifact candidates INVALIDATED as current publication evidence by the source change.
