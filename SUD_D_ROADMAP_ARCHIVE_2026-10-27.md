> Historical snapshot preserved on 2026-10-27 before documentation consolidation.
> Read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) for current direction and gates. Old ACTIVE/NEXT/approval statements below are historical records, not new dispatch or execution authority. Referenced technical contracts retain their own security requirements.

# SUD_D Roadmap

## LATEST ACTIVE — G2h ABI METADATA MISMATCH SAFE STOP; G2i OFFICIAL ABI135 PREBUILT TO REAL GUI (2026-10-16)

[Advisor G2h Final Acceptance + G2i Risk Decision](docs/superpowers/plans/2026-10-16-solo-expert-g2h-advisor-final-acceptance-and-g2i-prebuilt-decision.md): last G2h did not open Electron because `better-sqlite3 11.10.0` installed native build metadata was Node ABI137 while installed Electron36.9.5 expects ABI135; module never actually load-tested. G2h report SHA `f3f2b2e88e8160e23df522c0dfd9f61f5a59e5d543828be670d064d2349cbaa7` independently matched, zero launches and zero G2h task TEMP created; original G2g 532/532 and G2b old staged/canonical dist preserved. No User DB/Profile/Vault touched.

Advisor externally verified a **real official-release path to avoid full MSVC/Header rebuild**: `WiseLibs/better-sqlite3 v11.10.0` release has `Prebuild for Electron 36` and a public release mirror catalogs `better-sqlite3-v11.10.0-electron-v135-win32-x64.tar.gz` (~937kB). Exact native archive not yet fetched/loaded; do not claim ABI proven. Local MSVC BuildTools installation actually exists at `C:\BuildTools`, but this fast path does not require installing Electron headers/rebuilding. Narrow reversible DEV permission for ONE exact official GitHub release/CDN public download into task-owned TEMP ONLY (no credentials/provider/npm installs, no unsigned alternate mirrors; hash+metadata check, report lack of independent release signature truthfully). If higher-priority network policy forbids it, STOP not bypass. Owner delegated bounded safe engineering and wants usable Desktop urgently.

**NEXT G2i LONG BOUNDED MISSION ready for separate Serena Home New chat** [official prebuilt ABI135 + up to one task-contained Electron-as-Node SQLite memory load and 3 genuine isolated GUI Dev attempts](docs/superpowers/plans/2026-10-16-solo-expert-g2i-prebuilt-abi135-isolated-electron-serena-assignment.md); five focused task-only fixes permitted, three fresh `sudd-g2i-isolated-electron-20261016-01/-02/-03` TEMP roots, one task launcher and optional prior task-only build driver correction only if sandbox Preload output format breaks. Main opens `LOCALAPPDATA/SUD-D/sud-d.db` at startup; all LOCALAPPDATA/APPDATA/Chromium/UserProfile MUST be task-local BEFORE spawn, absolute original profile/DataRoot NEVER used. All old original `dist`, `dist-electron`, `dist-release`, node_modules native add-on and G2g 532 outputs READ ONLY. Verify Win32 owned child PID/time/image and cleanup, no broad taskkill; prove IPC/UI when possible, no fake GUI/Live Solo, no actual Gateway/Serena/B2/Provider/credential/Human Approval. If official archive/ABI/install closure fails report exact blocker, no further engineering loop without new evidence. ONE Final Serena Closeout to Advisor once.

**CURRENT:** G2g code build ACCEPTED; G2h PRELAUNCH HARD STOP ACCEPTED; G2i prebuilt real GUI attempt APPROVED/PENDING; Live Solo still UNREGISTERED/NOT_READY, Owner human GUI Test DEFERRED, B2 NOT AUTHORIZED.

---

## PRIOR ACTIVE — G2g CURRENT-SOURCE COMPILATION ACCEPTED; G2h REAL ISOLATED ELECTRON DEV BOOT (2026-10-16)

[Independent Advisor G2g Final Acceptance](docs/superpowers/plans/2026-10-16-solo-expert-g2g-advisor-final-acceptance-and-g2h-runtime-decision.md): ONE actual latest-current-Source local Vite/TypeScript compile produced **532/532 artifacts physical SHA256, bytes, BigInt-exact dev/ino & nlink1 PASS**. Renderer/Electron main/git-worker/preload BUILT exit0; Domain/Contracts/Infrastructure/Application/MCP Gateway 0 TS diagnostics EMITTED; Gateway `stdio-entry.js` compiles real production default server, but transitive deps/native Electron SQLite ABI and GUI NOT TESTED. Immutable Closeout SHA `cedcacf9b4d9c7f3365d3acc86297c898134e55dfa7329dd8f8054c839244203`; G2g root `sudd-g2g-latest-desktop-build-20261016-04` and result SHA `9b6bf69aa683d09bdddb5a46fe55e56a0a1dde66612b178c94067c008844efc3`, all checked. Original canonical hardlinked dist/release preserved; Owner GUI not launched, Live Solo UNREGISTERED/NOT_READY, B2 unauthorized. G2g compiler loop STOPPED after FIRST success, no further build needed.

**NEXT long bounded mission (ONE final review, READY NOT DISPATCHED):** [G2h task-only Electron Dev runtime closure & actual isolated GUI/SQLite/preload smoke](docs/superpowers/plans/2026-10-16-solo-expert-g2h-isolated-desktop-runtime-serena-assignment.md) under [Owner delegated long-mission rule](docs/superpowers/plans/2026-10-16-solo-expert-owner-delegated-long-bounded-mission-rule.md). Up to 5 focused task-only launcher/isolated output-format corrections and up to 3 distinct OS-owned Electron physical DEV attempts in new TEMP roots `sudd-g2h-isolated-desktop-runtime-20261016-01/-02/-03`, with no intermediate Advisor review. Main ESM eagerly opens SQLite from `LOCALAPPDATA/SUD-D`, so task-only LOCALAPPDATA/APPDATA/UserData and safe clean fixtures are HARD gate, as is exact installed Electron+native addon FileID/ABI/provenance, no accidental real Credential Manager access, owned PID+creation-time verified cleanup. Existing Node packages read-only, copied minimal task-owned dependency closure, sandbox/preload/IPC security unchanged, no default build or signed release. Actually observe Renderer window/Health + test-only new DB if possible; if unavailable report exact `UI_UNVERIFIED`. No user real data/workspace/tunnel/Provider/Network/B2/Native runner, no fake Solo, no credential operations or human Approval simulation. Stop early on real success or hard blocker; ONE final Closeout then Advisor acceptance/Owner test handoff.

---

## PRIOR ACTIVE — OWNER LONG BOUNDED RULE + G2g FIRST LIVE BUILD EVIDENCE PASSES, PENDING FINAL CLOSEOUT (2026-10-16)

Owner delegated **long bounded Serena engineering missions, one final Advisor review**, reducing repeated handoffs. [Standing decision](docs/superpowers/plans/2026-10-16-solo-expert-owner-delegated-long-bounded-mission-rule.md) preauthorizes (in task-specific exact assignments) up to five focused source/build-driver repairs and three isolated real DEV build attempts in predeclared task-owned distinct TEMP roots, with HARD STOP on security/out-of-scope risk. [G2g revised assignment](docs/superpowers/plans/2026-10-16-solo-expert-g2g-exact-electron-alias-build-serena-assignment.md) documents updated authority. No native Electron Product/Serena/B2, real user data, network/provider, OS policy, original canonical dist/release writes or human Approval bypass authorized.

**CRITICAL RACE HANDOFF NOTE:** Another separate Serena chat apparently started original G2g concurrently while Advisor revised instructions. On independent follow-up the already-approved **FIRST root** `sudd-g2g-latest-desktop-build-20261016-04` **EXISTS**, with actual `evidence/result.json` and **Renderer, Electron Main/Git Worker, Preload and 5 TypeScript packages all exit0; 532 artifacts**. Advisor independently verified 532/532 SHA+bytes+exact BigInt NTFS FileID/nlink1, 0 mismatches; physical Electron main.js/git-worker.js/preload.js, Renderer index.html and Gateway stdio-entry.js PRESENT. `overall:'BUILT_PARTIAL_RUNTIME_UNVERIFIED'`; desktop/native Gateway runtime NOT RUN and product Solo NOT READY. **ONE G2g Final Closeout was not yet created** at read-only check. **Do not start another mission or -05/-06 retries now**; G2g success fulfills early-stop condition. Serena should finish original ONE final report, Advisor accepts once, then next separate physical isolated Electron Native/Owner Test gate if warranted. The new policy applies to future missions and is not retroactive launch permission for an in-flight task.

---

## PRIOR ACTIVE — OWNER AUTHORIZES LONG BOUNDED G2g REPAIRS/BUILDS, ONE FINAL ADVISOR REVIEW (2026-10-16)

Owner requests **longer consolidated Serena Implementation missions**, not stop/review after each trivial build error; highest priority is real usable SUD-D Solo Desktop. [Owner-delegated Long Bounded Mission Rule](docs/superpowers/plans/2026-10-16-solo-expert-owner-delegated-long-bounded-mission-rule.md) now sets default up to **5 task-scoped Code/Build-Driver repairs and 3 isolated actual developer build attempts**, all preauthorized from Advisor in specific task-owned fresh TEMP roots, and **one FINAL Closeout/review**. Security HARD STOP and actual Native/Electron/Product/Provider/B2/credentials/Human Approval/release permission boundaries remain unmodified.

[Revised G2g LONG BOUNDED operative Serena Assignment](docs/superpowers/plans/2026-10-16-solo-expert-g2g-exact-electron-alias-build-serena-assignment.md) supersedes old G2g ONE-build-and-stop instruction **before first G2g Closeout or TEMP existed**. Only existing G2e/G2f Driver Source edit permitted; repair exact workspace `gateway-core` subpath aliases, `lstat({bigint:true})` FileIDs, safe actionable Vite diagnostics; pre-approved fresh `sudd-g2g-latest-desktop-build-20261016-04`, `-05`, `-06` (each exclusive, never reused/deleted), with up to 3 real compile attempts from live current Source, targeted fix/tests between attempts as needed. ONE final report only; next mission after successful compile addresses isolated Native/Electron ABI + Owner Test. Do not simulate actual usable GUI or Live Solo when only compiler has run. Previous G2f 529 emitted SHA+bytes pass, Main/Git Worker still build-blocked; original dist/release and user data protected.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2f RENDERER/PRELOAD/GATEWAY EMITTED, G2g FIX ELECTRON MAIN ALIAS (2026-10-16)

[Advisor final independent G2f actual partial build acceptance](docs/superpowers/plans/2026-10-16-solo-expert-g2f-advisor-acceptance.md): G2f one real isolated current-Source Vite+TS build produced **Renderer 4** and **Electron Preload 1** actual bundles and **Domain 76 + Contracts 12 + Infrastructure 284 + Application 120 + MCP Gateway 32** TypeScript emitted files, all five TS packages **0 diagnostics**; Gateway real `stdio-entry.js` emitted but isolated dependencies/SQLite ABI NOT runtime checked. Electron Main+Git Worker FAILED `vite:load-fallback`/`PLUGIN_ERROR`, exact missing module name redacted; no RUNNABLE Desktop/Owner test. Advisor independently rehashed all **529/529 SHA/bytes/nlink=1**, but 27/529 previously recorded NTFS FileID IDs differ slightly from exact BigInt stat due build-driver `String(Number)` precision; never claim all FileIDs identical to evidence. Original G2b frozen stage/canonical dist unchanged per Serena, original Desktop/Release count+representative hash match, not entire release hashes. Git HEAD/staged unchanged.

Advisor read actual Build Driver/Vite config and scanned 135 relevant TypeScript sources: driver uses **prefix `@sud-d/application`/`@sud-d/infrastructure` aliases pointing to `src/index.ts`**, but current Source imports `@sud-d/application/gateway-core` and `@sud-d/infrastructure/gateway-core`, whose naive alias rewrites become NONEXISTENT `src/index.ts/gateway-core`; real `src/gateway-core.ts` exists for both. **Definite build-driver alias config defect**, plausible reason for Vite load-fallback error; exact error-cause not proven due old over-redacted ID.

**NEXT ONE BOUNDED SERENA MISSION APPROVED/READY, NOT DISPATCHED:** [G2g exact package/subpath alias + BigInt FileID driver repair, ONE new actual isolated build](docs/superpowers/plans/2026-10-16-solo-expert-g2g-exact-electron-alias-build-serena-assignment.md). Only existing `packages/desktop/scripts/g2e-isolated-developer-build.mjs` writable, one new ignored report and new absent `$env:TEMP\sudd-g2g-latest-desktop-build-20261016-04`. Add exact Vite regex aliases for four package roots and both `gateway-core` subpaths, safe actionable missing-specifier errors, BigInt FileIDs in new artifacts; test no-write aliases/preflight, then ONE actual local Vite/TS build from latest Source. Preserve original hardlinked dist/release, all prior TEMP, Installed Native packages, no default package build/rebuild, no Electron/Native Product or Serena/B2 launch and no Network/Provider. If all compile, Advisor next selects short isolated native Electron runtime/dependency closure and real Owner Test; Live Solo still UNREGISTERED/NOT_READY, cannot claim product running or safe approval until verified.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2e 372 REAL EMITS ACCEPTED, G2f FULL DESKTOP/GATEWAY BUILD (2026-10-16)

[Independent Advisor G2e actual partial build acceptance](docs/superpowers/plans/2026-10-16-solo-expert-g2e-partial-build-advisor-review.md): one real isolated Vite/TypeScript build generated Domain76/Contracts12/Infrastructure284 artifacts (**372/372 independently rehashed SHA/size/nlink PASS**). Renderer/Preload were skipped because Electron main+git-worker stage failed; App9/Gateway19 TS diagnostics; no runnable app or actual prod Gateway. Vite Electron backend incorrectly used browser-default builtins rather than Node/SSR (observed warnings; exact error missing), current driver compiled CJS despite `import.meta.url`, stopped all Vite stages on first error and failed to log true error codes. Advisor independently reproduced TS diagnostics with noEmit: Application errors arose from old canonical `dist` declaration types (missing current gateway-core, WorkspaceRepository.getGeneration). Direct mapping to current G2e isolated Domain/Contracts/Infrastructure d.ts + installed Node typeRoots yields **Application 0 diagnostics**. Gateway depends on updated Application, so compile and link in order, not Production type hacking. Preserve G2e -02 evidence, original dist/release and Git.

**NEXT ONE LONG BOUNDED SERENA TASK, APPROVED/READY, NOT YET DISPATCHED:** [G2f Driver-only Node/SSR Vite + isolated TS type linkage ONE actual build](docs/superpowers/plans/2026-10-16-solo-expert-g2f-build-root-cause-implementation-serena-assignment.md). Modify ONLY old `packages/desktop/scripts/g2e-isolated-developer-build.mjs`; one new ignored final report and fresh exclusive `sudd-g2f-latest-desktop-build-20261016-03` TEMP. Renderer FIRST independently, then Electron SSR/Node builtins+ESM main and preload, and Domain→Contracts→Infrastructure→Application→Gateway TS compiler API with paths targeting CURRENT just-emitted declarations rather than canonical stale dist. Read-only pure preflight, one true Vite/esbuild/TS build after pinpointed driver repair, bounded component error details/real exit flags, no re-launch/retry after build. Do not run default repo build/predev/package:win or destructive prepare runtime; never write canonical hardlinked dist/release/node_modules, open Electron/Native product, Serena runtime, Network/Provider/B2 or fake live Solo. Genuine Owner Desktop test requires NEXT separately reviewed native ABI, profile/SQLite isolation and actual human approval; live Solo remains UNREGISTERED/NOT_READY.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2e ESM RESOLVER BUG FIX THEN ONE REAL BUILD (2026-10-16)

First G2e isolated DEV build attempt was executed ONCE but **failed inside newly authored `.mjs` helper before entering Vite/esbuild/TypeScript**: `ERR_AMBIGUOUS_MODULE_SYNTAX` due bare CommonJS `require.resolve` in a top-level-await ES module. Original one-shot TEMP build root -01 ABSENT, ZERO emitted artifacts, old canonical `dist`/`dist-electron`/`dist-release` unchanged. Report `.serena/reports/solo-expert-g2e-latest-desktop-isolated-dev-build-closeout-20261016.md` SHA `9c14acdc0b38d31a7205b1845d5c4b06eeb3642994422077e354de2882b6c17b` independently verified. **This is build-driver code defect, NOT proof actual Desktop/Gateway Source compile is broken.**

[Advisor's code-grounded G2e ESM review/authorization](docs/superpowers/plans/2026-10-16-solo-expert-g2e-esm-driver-advisor-acceptance.md) found **TWO** bare `require.resolve` sites, one in initial `gate()` for esbuild and a second after Vite stages for TypeScript. Independently READ-ONLY verified installed `createRequire` resolves Vite 6.4.3, plugin-react 4.7.0, TypeScript 5.9.3 and esbuild 0.25.12. [Binding G2e focused implementation + ONE actual build mission](docs/superpowers/plans/2026-10-16-solo-expert-g2e-esm-driver-repair-serena-assignment.md) is CREATED and READY, not yet dispatched: edit ONLY existing `packages/desktop/scripts/g2e-isolated-developer-build.mjs`, repair both ESM sites, pin actual installed toolchain, run `node --check`, `--self-test`, **read-only `--preflight` EXIT0**, then ONE actual Vite/esbuild/TypeScript build into NEW exclusive absent TEMP `sudd-g2e-latest-desktop-build-20261016-02`, with ONE new ignored final Closeout. Prevent any canonical hardlinked output, Desktop Gateway runtime, release, installed node_modules, user profile/native/product process write/start, or old `pnpm build`/`predev`/`package:win`. Component emitted hashes and real compiler statuses only, no false `RUNNABLE`/Live Solo claim.

**After actual isolated Build:** Advisor should choose quickest isolated Electron Native Dependency/ABI + APPDATA/LOCALAPPDATA containment and manual Owner Test of real existing Workspace/file/git/Approval UI. Real Solo production feature remains UNREGISTERED and NOT_READY, Serena DEV handshake failure loop CLOSED, B2 NOT AUTHORIZED. No repeated static/mock/ESM-only gate if true build is feasible. Current G2e artifact count ZERO, Owner Test DEFERRED.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2e REAL ISOLATED CURRENT-SOURCE DESKTOP/GATEWAY DEVELOPMENT BUILD (2026-10-16)

**G2d CLOSED / ACCEPTED.** [Advisor Final Acceptance + G2e Decision](docs/superpowers/plans/2026-10-16-solo-expert-g2d-advisor-final-acceptance-and-g2e-build-decision.md): Serena Source-only result `NO_PRODUCTION_PATCH_JUSTIFIED` independently confirmed. DEV Serena `FileNotFound` remains only a redacted failure CATEGORY: the failed DEV helper stripped Git/Node from PATH while actual production launcher inherits host PATH and prepares Config. No proof of matching Product defect, so no Source/Test patch; no G2c physical retry. Real Production desktop/Gateway already offers bounded Workspace/file/git/Approval/Audit and Managed Serena semantic adapters; dedicated Solo smoke is still test-only, Live Solo not registered.

**G2e ONE ACTUAL DEV BUILD — ADVISOR AUTHORIZED UNDER OWNER ENGINEERING DELEGATION:** [Binding ONE LONG Serena isolated developer build assignment](docs/superpowers/plans/2026-10-16-solo-expert-g2e-isolated-desktop-gateway-developer-build-serena-assignment.md). After bounded pinned toolchain+side-effect preflight, create ONE task-owned build driver, ONE fresh TEMP `sudd-g2e-latest-desktop-build-20261016-01` and ONE new ignored Closeout. Use real locally installed Vite/esbuild to build Renderer and Electron main/git-worker/preload from **CURRENT Source**, optionally safe TypeScript API emitted Gateway/core packages. **All Vite/Electron/Gateway outputs and caches live in the NEW isolated TEMP root**. Do NOT invoke old canonical Vite config, `pnpm build`, `predev`, `package:win`, destructive `prepare-mcp-gateway-runtime.mjs`, installed package manager or native-rebuild. Do NOT write hardlinked old `dist`, `dist-electron`, `dist-release`, gateway-runtime or installed `node_modules`, no app/electron/Serena/B2 PRODUCT launch, no Network/Provider. Component-level build success requires actual artifacts and hashes, not preflight or tests alone. Report Native Electron ABI/Gateway runtime closure as UNVERIFIED and app `NOT_YET_OWNER_TESTABLE` until genuinely isolated launch.

**NEXT AFTER ACTUAL BUILD:** decide exact small, task-owned Electron DEV Native Runtime/Owner Test with separate strict isolated `APPDATA`/`LOCALAPPDATA`, SQLite native ABI and controlled human Approval. Owner delegated bounded engineering build permission to Advisor; user actions that really approve privileged execution cannot be simulated. No additional G2c process-lifecycle/signer/static compile loops without new evidence. Goal is to hand Owner an actual working SUD-D latest build, not synthetic `solo_expert.smoke`.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2c FINAL DEV MCP FAILURE ACCEPTED; MOVE TO ACTUAL PRODUCT BUILD (2026-10-16)

Second and FINAL one-shot installed Serena DEV MCP test consumed, exact [Advisor acceptance](docs/superpowers/plans/2026-10-16-solo-expert-g2c-last-physical-smoke-advisor-final-review.md). With task-local startup config and early sanitized stderr capture, real child CIM-owned PID11332 still never answered `initialize` within 120s, stdout0/stderr3484, category `FileNotFound` (missing file/path UNKNOWN), exit1, postrun root child PID absent; `tools/list` NOT RUN. Immutable Closeout SHA `248711768f8e3214a1bca2d353f65de8983fad7f1d2fc4b4f5e04f29b31248fd` and TEMP -04 observation SHA `9e90e4729346ad4aee6c2d7aee54d5a4dcb0bdd0c2d2aed48b84bc1e7b77017e`, independently checked. **STOP G2c PHYSICAL SMOKE LOOP, NO -05 OR RETRY.** No Live Solo readiness/peer attestation, Native app build or Owner Test proved.

Advisor observed a concrete DEV/PRODUCTION difference: task-only sanitized PATH omitted installed Git and Node directory, whereas real `safeManagedRuntimeEnvironment` carries host PATH; this may explain missing dependency but is **not proven exact FileNotFound cause**, and should not trigger unsafe Product policy changes. Production currently already composes G2b Core + real SQLite/Approval/Audit and actual Serena semantic read/write adapters; separate `solo_expert.smoke` only exists for injected trusted test `soloExpertFake`, NOT production. Future product MUST NOT register fake as live.

**NEXT ONE Serena focused Source-only task** [G2d Production Startup Dependency Recovery](docs/superpowers/plans/2026-10-16-solo-expert-g2d-production-launch-readiness-serena-assignment.md): read-only inspect Serena installed pre-MCP startup and real vs DEV launch env, test/patch within only current `serena-managed-runtime.ts` + `serena-managed-runtime.acceptance.test.ts` **if and only if an actual production bug can be proven**; else no Source modifications and exact diagnostic. One new ignored Closeout, NO Process launch, no fake, no native code/B2, no external network, no old root writes. Complete with one actionable isolated latest-Source Desktop/Gateway Development Build plan for Owner Test; then STOP for Advisor acceptance. This is to avoid another useless stack of mock/preflight gates while still protecting host and original hardlinked `dist`/release.

**CURRENT:** `G2c PHYSICAL MCP SMOKE CLOSED FAILED; G2d LAST PRODUCT-FOCUSED SOURCE RECOVERY APPROVED/SERENA PENDING; LIVE SOLO UNREGISTERED; DESKTOP BUILD NOT_RUN; OWNER TEST DEFERRED; B2 NOT AUTHORIZED.`

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: DEV MCP INITIALIZE TIMEOUT; STARTUP PARITY FIX THEN FINAL RETRY (2026-10-16)

One actual installed Serena 1.7.0 child started on exclusively owned TEMP -03 and was bound to CIM PID+Parent+CreationTime+Exe Image before MCP. **Result FAILED:** `initialize` no response 90s, `tools/list` not sent, 0 stdout/3484 stderr bytes, child exit1; separately read-only CIM proves root PID absent after. [Advisor Independent Failed DEV Smoke Review](docs/superpowers/plans/2026-10-16-solo-expert-g2c-physical-mcp-failure-advisor-review.md) accepted honest `DEV_MCP_HANDSHAKE_FAILED`, froze one-shot Closeout/root, did NOT mark live Solo ready. Task-owned 338-byte Serena log proves initialization started but not `Starting MCP server …`; installed Serena `cli.py` calls factory/startup configuration before serving MCP. The -03 harness lacked Production-equivalent pre-prepared `SERENA_HOME/serena_config.yml`, although production `serena-managed-config.ts` supplies it; exact fatal exception **UNKNOWN** because helper dropped content of stderr. Also attach stdout/stderr stream listeners early and confirm MCP SDK framing. No secondary launch was made. Git HEAD/staged preserved and previous dist/stage frozen.

[ONE FINAL bounded Serena task — Startup parity + actionable diagnostics](docs/superpowers/plans/2026-10-16-solo-expert-g2c-startup-parity-one-final-dev-serena-assignment.md) is READY for separate Serena Home New chat. Only existing DEV helper `packages/tests/src/g2c-local-dev-mcp-handshake.cjs` may change, one new ignored Closeout and one new task-owned TEMP -04 (absent). Read-only inspect installed Python Serena start/config + existing MCP SDK; prepare only task-root Serena config, attach stdout/stderr immediately and capture bounded redacted failure category, preserve proven CIM PID/exe ownership and safe child cleanup; focused builtins tests; exactly one additional DEV-only pinned child with disposable no-secret fixture only if fixed parity/protocol checks pass (120sec max+30sec cleanup). DEV network egress isolation, Authenticode and peer attestation are UNVERIFIED and explicitly not product-verified. No real ToolKernel commands/B2/Native/Electron, external service, User data, package install or release. If retry fails, STOP this smoke loop and take precise error to next actual Solo product integration decision. Production Solo still UNREGISTERED/NOT_READY, Desktop Build NOT_RUN, Owner Test DEFERRED.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: CIM CHILD OWNERSHIP REPAIR, ONE REAL DEV MCP TEST (2026-10-16)

Serena's latest `G2c One-Time Local DEV MCP Handshake` stopped truthfully at `PHYSICAL_PREFLIGHT_BLOCKED`: sha `a11e2b7ca80a57eac08cc3b3fcc6c2be9007bc2b8231496d3ee873205d10bf56`, pinned binary FileID and hash PASS, builtins tests 7/7 PASS, 0 physical Serena launches, 0 MCP Tool List, task TEMP -02 ABSENT. Previous protocol demanded a future spawned child PID's OS creation timestamp and image identity **before the process existed**. Advisor independently READ-ONLY proved Windows `Get-CimInstance Win32_Process` returns `ProcessId`, `CreationDate`, `ExecutablePath`, `ParentProcessId` for an Advisor-owned PowerShell process and an existing Serena process, non-admin. User's many real Serena processes MUST NOT be killed/reused. No speculative Native security framework: [Advisor root cause decision](docs/superpowers/plans/2026-10-16-solo-expert-g2c-cim-process-identity-advisor-decision.md) approves using the **already existing helper** with typed post-spawn CIM identity validation, captured ChildProcess handle, safe graceful close, and conservative kill of only proven owned child.

[One precise Serena implementation assignment READY for separate Serena Home New chat](docs/superpowers/plans/2026-10-16-solo-expert-g2c-cim-child-owned-mcp-serena-assignment.md): edit ONLY `packages/tests/src/g2c-local-dev-mcp-handshake.cjs`, a NEW ignored final Closeout and new one-use OS TEMP `sudd-g2c-dev-mcp-handshake-20261016-03` (currently absent). One pinned Serena 1.7.0 DEV launch, 90s MCP initialize/tools-list only, 30s bounded cleanup; validate actual new child PID/creation-time/image/parent **after spawn and before MCP**, revalidate before any child.kill; no broad taskkill/foreign process kill; if uncertain keep evidence. Network egress OS-deny UNVERIFIED but risk accepted only for single stripped no-secret DEV fixture; signer/offline revocation NOT VERIFIED, cannot claim production trust or Live Solo Ready. No Codex/subagents, network/provider requests, B2, native product startup, original dist/release or Git writes. ONE real observation result then stop, **do not add more mock/compile loops**.

**NEXT after successful observed handshake:** direct selected Solo Expert real production ToolKernel→Policy→human Approval→Audit implementation plus latest isolated Desktop app build, not an enterprise process-verifier stack. Real product still UNREGISTERED/NOT_READY; Desktop Build NOT_RUN; Owner Test DEFERRED.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: LOCAL DEV MCP HANDSHAKE RISK-BOUNDED, NOT ANOTHER PRECHECK LOOP (2026-10-16)

Serena correctly returned `BLOCKED_PHYSICAL_PREFLIGHT` on its previously required OS-enforced no-network condition. Installed Serena SHA/FileID and Node SHA/FileID pinned, builtins-only helper 8/8 PASS; **zero child launches, zero MCP handshakes**, root absent; original G2b stage and dist unchanged. [Advisor accepts the NO-GO and makes one new exact Development risk decision](docs/superpowers/plans/2026-10-16-solo-expert-g2c-network-blocked-advisor-acceptance-dev-risk-decision.md): for ONE disposable no-secret local MCP handshake ONLY, explicit Owner engineering delegation allows residual **network egress unverified** risk; it is NOT a guarantee of offline mode, not intentional Network/Provider permission, not a Production security or F2 Authenticode release waiver. OS/firewall/Windows Sandbox enablement is not part of this fast path. Never use user profile, real project or credentials.

**NEXT SerenA assignment, READY NOT DISPATCHED:** [G2c Single local DEV handshake](docs/superpowers/plans/2026-10-16-solo-expert-g2c-local-dev-mcp-handshake-serena-assignment.md): one new builtins CJS helper, one ignored final closeout, one new task-owned TEMP root `sudd-g2c-dev-mcp-handshake-20261016-02`; one pinned installed Serena 1.7.0 process on disposable fixture, 90s max handshake and 30s conservative owned cleanup. MCP methods `initialize` + `tools/list` only, no tool execution/shell/B2/LSP/writes/Native product, no package install/repair, no OS policy elevation; existing 6 observed foreign Serena processes must not be killed/reused. Stop if unsafe root, binary or uncertain PID ownership. Preserve old failed helper/report and old ROOT absence. Next after one physical result: **bounded real Production Solo ToolKernel+Human Approval integration, isolated latest Desktop build and Owner test**, no repeated compiler/vendor mocks. Solo still NOT_READY and UNREGISTERED until real proof.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: ONE-SHOT INSTALLED SERENA DEV OBSERVATION, THEN REAL SOLO (2026-10-16)

Owner explicitly authorizes Advisor to decide task-specific engineering process permissions on Owner's behalf in pursuit of a **usable Solo MVP**. Advisor chose **one bounded DEV-only physical MCP handshake** on existing installed Serena 1.7.0 executable, not another compiler/static/fake loop. Already present `%LOCALAPPDATA%\SUD-D\coding-engines\serena\1.7.0\bin\serena.exe` SHA256 `87f771d750e8587da7127cece585129b65c0cf317c068dc1f1aeb3c728b5252c` (46080 bytes); SHA is byte identity only, NOT Authenticode signer/remote process proof. Old strict Node/F2 offline revocation result stays BLOCKED and is not relabeled. The exact [Advisor DEV-only Owner delegation decision](docs/superpowers/plans/2026-10-16-solo-expert-g2c-dev-observation-advisor-owner-delegated-decision.md) and [one bounded Serena observed connection assignment](docs/superpowers/plans/2026-10-16-solo-expert-g2c-managed-serena-dev-observation-serena-assignment.md) are ready, NOT YET DISPATCHED to separate implementation chat. Max one fresh task-owned TEMP root `sudd-g2c-managed-serena-physical-20261016-01`, exclusive helper/report, single local supervised launcher after trust/OS preflight, 120s handshake and read-only tools/list ONLY, conservative cleanup, no network/install/credentials/B2/native product/real Owner click. NO-GO if signature gate, process ownership, preimage or isolation requirements fail. Even successful dev handshake proves neither real peer attestation nor registered Solo product.

**Fast Closure after one physical observation:** next choose one bounded actual production ToolKernel→Policy→Human Approval→Execution→Audit integration (no synthetic `soloExpertFake`), then isolated current-source Desktop executable build and Owner Test. Avoid another enterprise trust framework or optional research loop. Preserve old hardlinked original `dist`, `dist-release`, Desktop build, user data, G2b compiled evidence and historic Source snapshot. Current product Solo remains UNREGISTERED/NOT_READY until real gates pass. This authorization does not silently permit B2, external Provider/Network, OS policy, privileged execution or release.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2c PASSIVE SEAM ACCEPTED; REAL PEER TRUST OWNER GATE (2026-10-16)

[Advisor independently ACCEPTED Serena G2c code-only observation](docs/superpowers/plans/2026-10-16-solo-expert-g2c-passive-session-advisor-final-acceptance.md): `serena-managed-runtime.ts` now exposes a synchronous nonsecret `inspectLiveSoloReadinessOnly()` that ALWAYS yields NOT_READY (absent/invalidated/unverified provenance); stop revokes immediately. Five injected fake-only tests PASS, two focused TypeScript checks zero diagnostics; no real managed process, Native, Gateway product or Desktop Build executed.

Serena reported 351→352 Git porcelain entries without attribution. Advisor reproduced exact Gate D SHA256 and proved **the sole additional entry** was previously clean tracked `packages/tests/src/serena-managed-runtime.acceptance.test.ts`, one of exactly two authorized modified Source/Test files. Deleting only that status line reproduced exact Gate A 351-entry SHA256. Git HEAD/staged unchanged, `git diff --check` 0; 512 frozen stage/original dist hashes and 201 TEMP owner copy Hash/FileIDs unchanged. Inherited git status preserved; do not claim full unrelated dirty byte snapshot certification. Closeout immutable as originally authored.

Fast closure NEXT means stop static/mock looping and address only **real peer→process→executable attestation**. [Isolated offline managed Serena physical provenance OWNER GATE](docs/superpowers/plans/2026-10-16-solo-expert-g2c-managed-serena-physical-provenance-owner-gate.md) is drafted, NOT AUTHORIZED: exact pinned binary signing/digests, one isolated supervised local start, no Terminal/B2/network/provider, conservative ownership cleanup. It needs **explicit separate Owner physical process consent**, then Advisor exact Serena mission and validation. Do not automatically launch, escalate privilege, reuse old release/owner build snapshot, or register fake `solo_expert.smoke` in Production. Real Live Solo NOT_READY, Desktop app NOT_BUILT, Owner personal test DEFERRED.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: G2c PASSIVE REAL-SESSION TRUST SEAM (2026-10-16)

Codex `gpt-6.1-sol` **Medium** read-only design for Live Solo Production Wiring produced `.serena/reports/solo-expert-g2b-live-solo-production-wiring-codex-design.md` and Advisor independently source-reviewed, [ACCEPTED WITH NARROWING](docs/superpowers/plans/2026-10-16-solo-expert-g2c-live-session-codex-medium-advisor-final-review.md). The initial Codex dispatcher recursion was stopped; successful isolated second run had restricted shell inspection, so report is not an independent code audit. No Codex process remains running. The actual production Solo path remains **UNREGISTERED**: `soloExpertFake` only activates synthetic smoke, and managed Serena's ready receipt is a `synthetic-fixture`. Existing retained ActiveSession/rootPid/tool contract do **NOT** authenticate peer→process/executable provenance; do not enable execution by merely adding a new real integrity label.

**NEXT ONE LONG BOUNDED SERENA CODE-ONLY IMPLEMENTATION:** [G2c Passive Managed Session Provenance assignment](docs/superpowers/plans/2026-10-16-solo-expert-g2c-passive-managed-session-provenance-serena-assignment.md), exact edits to `packages/infrastructure/src/serena-managed-runtime.ts` and `packages/tests/src/serena-managed-runtime.acceptance.test.ts` ONLY, one ignored Closeout. Provide passive synchronous `inspectLiveSoloReadinessOnly()` that always yields `NOT_READY` due absent peer attestation; no calls that spawn/connect/repair/tool/Native/OS, no Production Gateway/Application registration change, no scope expansion to B2. Focused negative tests with fake sessions and automatic stop invalidation. One Serena mission → Advisor Review. Real authenticated peer ownership and approved local binary digest, Native/Electron build, and personal Owner Test remain SEPARATE Owner-controlled future gates. No old `dist` write, no stale Desktop owner snapshot reuse for newly modified source; preserve prior G2b accepted compiler evidence and previous TEMP Source snapshot as history.

**CURRENT:** `G2c NOT_READY CODE-ONLY IMPLEMENTATION APPROVED / SERENA PENDING; CODEX MEDIUM DESIGN REVIEWED; REAL SOLO NOT_REGISTERED; DESKTOP_BUILD_NOT_RUN; PHYSICAL_MANAGED_SESSION_NOT_RUN; OWNER_TEST_DEFERRED.`

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: DESKTOP SOURCE PREP ACCEPTED; LIVE SOLO PRODUCTION WIRING NEXT (2026-10-16)

Advisor ACCEPTED completed Serena FileID focused repair: [independent review](docs/superpowers/plans/2026-10-16-solo-expert-g2b-desktop-source-fileid-repair-advisor-final-acceptance.md). Current latest Source bundle under `$env:TEMP\sudd-latest-desktop-owner-build-20261015-02` includes **199 current Source/manifest/config copies + isolated Vite config + inert Owner-Test recipe + committed source-inventory.json = 202 physical files**; **29/29 focused tests**, `--inspect` PASS, 201/201 copied SHA256/FileID nlink=1, 199/199 original SHA256, 512/512 G2b staged and original canonical dist preserved, previous failed `-01` root unchanged. Inventory `dbb2470c244c90f5ae3620f3ab8fa6fb17cbf662ad7ddc922f1be16aff1620db`, Closeout `223e2e8659548cc6520877fef0359436e5dc1574f3d57e6867431df45d061173`. Code-only input milestone CLOSED; **app BUILD_NOT_RUN and RUNTIME_NOT_RUN**, Owner test DEFERRED.

**Next meaningful product step:** Production Gateway composes G2b core, but real Solo Expert remains UNREGISTERED; current implementation registers `solo_expert.smoke` only via injected synthetic `soloExpertFake` and managed Serena readiness uses synthetic-fixture, not real managed-session verification. Must design trusted live managed-session observation/identity, Policy→Approval→one-use Execution→Audit/Recovery. A single [narrow read-only design brief for Codex](docs/superpowers/plans/2026-10-16-solo-expert-g2b-live-production-wiring-codex-pending-brief.md) is PREPARED, NOT RUN; Owner reports Codex 5-hour rate limit, do not invoke until access recovers. Advisor reviews design then delegates one bounded Serena code-only implementation, later seeks separate native host consent for isolated Desktop executable build/runtime. No repeated compiler/static copy missions, no unsafe old `dist-release` package build or production fake wiring. User personal Owner Test remains deferred, not passed.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: FILEID POSITIVE TEST / DESKTOP OWNER-TEST SOURCE WORKSPACE REPAIR (2026-10-15)

Serena completed CODE-ONLY latest Desktop Source snapshot of **199 current Source/Manifest + 2 generated files** into exclusively owned TEMP `...-01`, but correctly STOPPED before `source-inventory.json` after helper `verifyCopied()` referenced nonexistent `row.destinationIdentity` rather than actual `row.identity`. Advisor independently rehashed **201/201** copied bytes, file IDs and `nlink=1` and original 199/199 source hashes; [PARTIAL Acceptance / exact cause](docs/superpowers/plans/2026-10-15-solo-expert-g2b-desktop-source-prep-fileid-advisor-partial-review.md). Old partial root and original ignored Closeout remain frozen evidence, not to be resumed/cleaned. Source/Stage/Canonical dist/release unchanged; no Vite/Native/Product runtime occurred.

ONE next bounded delegated Serena mission [Focused FileID Repair](docs/superpowers/plans/2026-10-15-solo-expert-g2b-desktop-source-prep-fileid-repair-serena-assignment.md): edit ONLY task's two current CJS helper/test paths to align `identity` with consumer and prove positive + negative FileID seam, point to a fresh `-02` TEMP root (must be absent) and ONE NEW ignored Closeout. Exactly one fresh source copy, inventory commit and read-only `--inspect`; no old root modifications, native execution, Git writes, arbitrary dependency expansion, release packaging or B2. Avoid redoing broad Compiler/AST diagnostics. Owner manual app test remains DEFERRED. Even a PASS gives only reproducible latest-source **Desktop build INPUTS**, **not** a compiled/runnable Solo Expert app. Real live Solo wiring is still absent from production; fake-only `solo_expert.smoke` must never be enabled in production to pass a test.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: DESKTOP OWNER-TEST SOURCE WORKSPACE (CODE-ONLY) (2026-10-15)

Codex `gpt-6.1-sol` High READ-ONLY last-mile Desktop Design completed and Advisor independently accepted [exact review](docs/superpowers/plans/2026-10-15-solo-expert-g2b-latest-desktop-owner-build-advisor-final-design-acceptance.md). **Important product gap discovered:** Real stdio → default production wrapper already imports extracted G2b Core, but Solo registration requires `soloExpertFake` and managed readiness is a `synthetic-fixture`; **NO live Solo tool is registered by production.** Neither staging 512 compiler outputs nor shipping a Desktop UI alone closes Solo MVP. Do not inject fake into production to claim success.

Advisor bounded next Serena mission: [CODE-ONLY new isolated Owner-Test workspace preparation](docs/superpowers/plans/2026-10-15-solo-expert-g2b-latest-desktop-owner-build-serena-assignment.md); exactly 2 new CJS source/test paths, one ignored Closeout, one new independent `$env:TEMP\sudd-latest-desktop-owner-build-20261015-01` root; preserve current uncommitted/untracked Source bytes, generate isolated Vite config + nonexecuting future build recipe and cryptographic inventory. Do not run Vite/esbuild/Electron, pnpm builds, Native, installed module/Product Gateway, network, release packaging, real B2 or Owner machine actions. Existing `prepare-mcp-gateway-runtime.mjs` begins by deleting old Desktop runtime, native SQLite rebuild and `package:win` writes shared old `dist-release`, so all disallowed until a separate exactly bounded physical Owner gate. Code-only workspace **is not a compiled or runnable app**. User personal test deferred. Serena one long mission, one Advisor final review. Do not repeat accepted compiler/static/vendor checks.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: OWNER TREE COPIES/TYPE RESOLVED; NEXT REAL PRODUCT INTEGRATION (2026-10-15)

Serena's isolated owner-tree mission stopped honestly at `better-sqlite3`, leaving immutable TEMP evidence (`inventory.json` absent). Independent Advisor reread the Closeout and rehashed **1581/1581** copy-journal outputs (all nlink=1), **512/512** copied compiled staged artifacts and 512 original canonical before-images. Correctly retain PARTIAL/BLOCKED. A frozen source AST shows the 47-module selected Gateway-core project **value-runtime graph does not reach SQLite**, but the 99-module declaration closure reaches `database.d.ts` via a TYPE-ONLY legacy Infrastructure root reexport; TypeScript 5.9.3 Node16 real resolution maps bare `better-sqlite3` to the **existing** copied `@types/better-sqlite3/index.d.ts`. Strict virtual Node16 consumer compiler NO-EMIT, `skipLibCheck:false`, 0 diagnostics, 0 unexpected repo fallback. This is a **custom static resolver overconstraint**, not evidence to install/execute Native SQLite. See [accepted evidence review](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-owner-tree-type-only-advisor-review.md).

Do not run another copy/diagnostic loop to reproduce this type result; do not modify/resume the one-shot partial TEMP root or unlock original hardlinked `dist`. Genuine next gate is *latest-source Owner-Test Desktop/runtime integration*: existing `prepare-mcp-gateway-runtime.mjs` would delete prior Desktop runtime and execute build/deploy/native Electron rebuild, so it is **not** authorized to run unattended under current policy. Preserve Owner explicit Desktop consent and existing security/data protections. Manual Owner testing remains DEFERRED, not accepted; completed static stage is not a runnable product. No B2/Native/privileged host/release action without separately exact-scoped permissions.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: SAFE COPY-ONLY ISOLATED G2b OWNER CANDIDATE (2026-10-15)

Canonical original G2b local `dist` promotion **HARD STOP NO-GO**: Serena found 69 existing changed artifacts with nlink=10 also shared with unrelated Desktop builds and older release copies; original `dist` not touched. Advisor independently confirmed 69/93 hardlinked plus 24/93 singly linked and 80 missing, frozen 512 stage row SHA/ABSENT unchanged. Retain original release/workspace artifacts, no in-place write or accidental foreign hardlink modifications.

Advisor reviewed Codex `gpt-6.1-sol` High read-only design and **CHOOSE B** for fastest solo owner-test preparation: build a new disposable, independently copied `@sud-d` package tree from 512 already verified compiler artifacts + frozen manifests/Contracts + bounded installed vendor payloads in fresh owner TEMP; no canonical `dist` promotion or runtime execution. See [binding one-long Serena mission](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-hardlink-safe-owner-tree-serena-assignment.md) and [exact Advisor decision](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-hardlink-safe-owner-tree-advisor-decision.md). Limited task-only hardlink fixture may demonstrate filesystem semantics but never grant canonical root writes. STOP on missing vendor dependency, symlinks, unexpected file identity, inherited tree mutation or permission expansion; no overengineering of native Windows transaction.

User manually tests later by explicit owner action. This is **NOT** a certified runnable owner-test app; actual ESM/vendor/native/managed Serena/B2 still blocked pending separate verified rights. Preserve current private source/manifest evidence and avoid rebuilding old v1.0.8. No Serena Implementation chat dispatched yet; next action is Owner sends one Assignment to separate Serena Home New chat; Advisor later reviews ONE Final Closeout.

---

## PRIOR ACTIVE — SOLO FAST CLOSURE: ISOLATED COMPILE ACCEPTED; LOCAL DEV DIST PROMOTION (2026-10-15)

Owner temporarily skips manual app testing and delegates exact routine engineering continuation. Advisor independently accepted frozen G2b isolated TEMP 512-output compile and permitted a bounded, REVERSIBLE **LOCAL DEVELOPMENT** `dist` promotion of only 173 SHA/preimage-locked output paths, with backup/journal and hard STOP if OS/path guards cannot be satisfied. Read [binding Serena mission](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-local-dist-promotion-serena-assignment.md) and [Advisor exact decision](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-local-dist-promotion-advisor-decision.md). No live/product/Native/Vendor runtime, privileged B2, installation/release, Provider/network or genuine Desktop Approval without separate rights. Original Source/worktree and 339 already matching compiled outputs preserved. User manual test remains DEFERRED, never PASS. This accelerates build preparation rather than adding new speculative Win32 mechanisms.

---

## PRIOR OWNER INSTRUCTION — SKIP MANUAL OWNER TEST FOR NOW; CONTINUE SOLO COMPILE ENGINEERING (2026-10-15)

Owner is temporarily away and explicitly requests **do not pause for Owner Desktop/app testing**. Continue the next engineering step autonomously within routine Advisor-delegated authorization, prioritize Solo Expert MVP fast closure, reuse passing Source/static evidence. Current approved engineering task: [B1b-G2b isolated local compiled-candidate Serena assignment](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-isolated-compile-serena-assignment.md); [Advisor decision](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2b-isolated-compile-advisor-decision.md). Scope is one test-only CJS helper, one ignored Closeout and one disposable task-owned TEMP stage directory. Compile installed TS source into staging only; validate types, hashes and static imports; **never change original `dist`, execute product/native packages or represent the candidate as an installed app**. One long Serena Implementation mission in the separate chat → one final Advisor review. No new speculative static/Win32 research or duplicate accepted tests.

**Manual owner test is DEFERRED (not passed), superseding the immediately previous dogfood-v1.0.8-first next action.** Published v1.0.8 is older and missing recent Solo Expert source; do not send Owner back to that release as proof of Solo Expert. On owner return, test only a properly staged/promoted and separately authorized latest-code owner-test candidate. Genuine Owner human Desktop consent, real B2/Native, network/provider, sensitive data and machine security-policy changes remain separate hard gates.

---

## ACTIVE OWNER DECISION — SOLO FAST CLOSURE / OWNER DOGFOOD FIRST (2026-10-15)

**Priority override for sequencing, not security:** The Product Owner explicitly delegated routine product/engineering sequencing decisions to ChatGPT Steward and prioritizes **finishing a usable one-person flow quickly**, avoiding speculative multi-user/enterprise-grade mechanism research. The Owner personally performs real system testing. Advisor should choose the smallest *working owner-test candidate*, reuse earlier focused evidence, and route only owner-observed blockers to ONE long bounded Serena repair mission followed by one final review. No automatic extra Codex/Serena research loop, release, package rebuild or full-suite replay merely to establish theoretical perfection.

**Immediate dogfood path:** verified, publicly published **v1.0.8** Windows owner-test release (see `.serena/reports/owner-test-windows-release-closeout-20261012.md`); Owner tests in their **own authorized Workspace**: current version/revision, work.resume, Workspace connection, restricted verify.run(action=test) via actual Activity/Approval/Audit and preservation of profile. This v1.0.8 build **does not contain the new private B1b/G2b Solo Expert Source Isolation** and should not be represented as a test of that feature. Known newer G2b source checkpoint remains static-only, publication/runtime BLOCKED; hold additional Native/Windows feasibility research until a concrete G2b owner-test implementation/release gate is in scope. A future carefully bounded dev/owner-test candidate may be authorized by Advisor but only with explicit written artifact path/scope and rollback checks; owner-performed manual testing is NOT proof or blanket permission to change Windows policy, bypass Product Approval, run B2/native, or write broad product `dist`.

**Fast-closure exit criterion:** Owner gives real usability outcome and one blocker/error or confirms the tested flow works. Fix affected boundary, rerun only invalidated evidence, ship a clearly labeled owner-test patch via the existing signed-manifest release path if needed; do not advertise full Solo Expert live acceptance until actual approved test. Security/credential/data/Workspace/Policy/Approval/Audit invariants remain hard gates. Owner manual consent when the app presents contextual Approval remains a real action no agent can simulate.

---

## ACTIVE OWNER DIRECTION — Serena-First Solo MVP / User-Controlled Permissions (2026-10-14)

**Owner-approved product requirement:** Use Serena as the practical Workspace tool-execution hand without unnecessarily removing its capabilities. SUD-D is the independent Workspace/Policy/Approval/Audit boundary; the user chooses explicit permission scope after truthful risk disclosure. Prefer managed Serena reuse and one minimal reviewed capability/permission bridge over building a duplicate execution engine. Keep SUD-D domain-agnostic: TGNK is the FIRST real-workflow pilot, **not** embedded SUD-D product logic. New TGNK workflow → properly authorized stages → verified Final MP4 is the real-world outcome; historical imported-audio resume is deferred.

**LATEST G2a DESIGN/ASSIGNMENT READY — SOURCE-EDIT OWNER APPROVAL NEXT (2026-10-15):** Advisor continued from independently accepted R3 without repeating B0–R3, initiated and completed one Codex **READ-ONLY** Gate 2 architecture assignment. [Full portable Codex G2 report](docs/superpowers/research/2026-10-15-solo-expert-b1b-g2-codex-design.md), [Advisor ACCEPT WITH CONDITIONS](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-advisor-review.md), [PREPARED exact Serena G2a assignment](docs/superpowers/plans/2026-10-15-solo-expert-b1b-g2a-serena-assignment.md). **G2a candidate is EXACT 8 SOURCE/TEST paths (4 + 4), generated artifacts ZERO**, synthetic test-only `createProductionMcpServer` list/call default OFF, trusted DB generation Work Resume/actual MCP session, same coordinator manual HMAC/SQLite audit/claimed/UNKNOWN with fake one-use tool and R3 baseline 75/75 tests. **NOT YET OWNER-AUTHORIZED FOR PROTECTED SOURCE EDITS; SERENA IMPLEMENTATION NOT DISPATCHED.** R3 Gate 0/1 remain accepted. G2a source/fake pass does NOT establish real managed Serena installed-byte/session provenance or actual Desktop package-graph readiness; separate exact G2b source/compiled artifact/lifecycle design and B2 real one-shot user permission remain distinct. A1 PAUSED/BLOCKED, default Restricted; no provider/network/Native/TGNK/product Terminal. [Current Handoff](SUD_D_HANDOFF.md).

**PRIOR VERIFIED B1b-R3 OVERNIGHT CLOSEOUT (2026-10-15):** User could not locate the separate Serena chat, but R3 Closeout was found in ignored `.serena/reports/solo-expert-b1b-r3-code-only-closeout-20261014.md` (last modified 2026-10-15 00:51 local). ChatGPT Advisor independently reran **75/75 focused tests in 6 suites, exit 0**, verified **9/9 R3 Source/Test/generated Contracts artifact SHA-256** and live nonsecret compiled Contracts schema `reviewDigest` checks. [R3 independent Advisor acceptance](docs/superpowers/plans/2026-10-15-solo-expert-b1b-r3-advisor-acceptance.md): **Gate 0 compiled Contracts transport PASS; Gate 1 fake/source Desktop reviewed consent PASS WITH LIMIT; Gate 2 PARTIAL / HARD STOP. FULL B1b NOT READY.** True managed Serena ready-installed identity/epoch, trusted Workspace Resume/Gateway OFF-to-opt-in registration and stale Application/Infrastructure dist remain unanswered. R3 source-only completed and STOPPED, should NOT be rerun. Next is NEW bounded read-only Gate 2 architecture/artifact scope before new Owner authorization; no real managed Serena Shell/B2/Native/TGNK/provider/network under R3 permission. [Active Handoff](SUD_D_HANDOFF.md).

**PRIOR OWNER-AUTHORIZED B1b-R3 CONTINUATION (historical; 2026-10-14):** Product Owner expressly **APPROVED Code-only R3**: original 23 B1b-R2 Source/Test paths **plus exactly four ignored generated Contracts runtime index artifacts** (`packages/contracts/dist/index.js`, `index.js.map`, `index.d.ts`, `index.d.ts.map`) and **one uniquely task-owned TEMP backup/restore**. [Owner-approved binding R3 Serena assignment](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r3-serena-assignment.md) is **READY TO FORWARD TO SEPARATE SERENA CHAT; NOT DISPATCHED/EXECUTED BY ADVISOR**. One bounded mission: **Gate 0** source-first optional strict SHA256-shape `reviewDigest`, exact single-root narrow Contracts compile and real compiled-schema compatibility tests → **Gate 1** unchanged protected IPC/Preload + exact Desktop review/Controller digest/SQLite path → **Gate 2** default-OFF Gateway/Kernel/manual HMAC/Resume/Audit/UNKNOWN with fake ready-only Serena and Stage A regressions. No full Contracts build (3 TS sources might emit 12 files), no other Domain/Application/Infrastructure dist, no dynamic raw shell or physical B2. Source/transport proof is **NOT full product runtime acceptance**; stale other package dist and real runtime integrity need separate future review. Full [R3 Advisor design review](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r3-advisor-review.md). A1 independently protected consent PAUSED/BLOCKED; default Restricted. See [Active Handoff](SUD_D_HANDOFF.md).

**PRIOR B1b-R3 DESIGN MILESTONE (historical pre-approval; 2026-10-14):** B1b-R2 Gate A 67/67 independently PASS; Gate B NO-GO. Codex targeted read-only R3 source/compiled-Contracts trust assessment COMPLETED and Advisor independently [ACCEPTED DESIGN WITH CONDITIONS](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r3-advisor-review.md); full portable [Codex R3 design](docs/superpowers/research/2026-10-14-solo-expert-b1b-r3-codex-design.md). Contracts **source and compiled `dist` both lack `reviewDigest`**; Build of unedited source cannot cure. Option A source-first narrow single-entry compilation recommended: original 23 bounded source/test paths PLUS **only four ignored `packages/contracts/dist/index.*` artifacts** and one isolated owned TEMP backup, subject to explicit NEW Owner permission. Normal Contracts package build would include 3 TS sources, potentially 12 artifacts, so not automatically authorized. Current Desktop Controller/Activity still do not forward/show Solo review; built Application/Infrastructure dist also stale. **Contracts transport PASS != product B1b ready**. [R3 exact Serena Implementation proposal](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r3-serena-assignment.md) PREPARED / NOT DISPATCHED OR OWNER-APPROVED. No protected IPC/Preload edits, no Production Shell/B2/Provider/TGNK/A1. [Active Handoff](SUD_D_HANDOFF.md).

**PRIOR B1b-R2 STOP (historical):** R2 Gate A independent **67/67 Focused PASS**, scoped ESLint + Domain/App/Infra TS PASS; **Gate B NO-GO**, real IPC still rejects `reviewDigest`. [R2 Advisor acceptance of STOP](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r2-advisor-review.md). Important: current Contracts **SOURCE** `ApprovalRespondInputSchema` also only has two fields, so a plain rebuild of existing source is insufficient; must first extend strict source schema with optional digest and then explicitly Owner-authorize a narrow build/verification of ignored runtime `dist`. Desktop Controller also drops digest and Activity lacks full review, so B1b remains NOT ACCEPTED, B2 HOLD. Targeted read-only Codex R3 contract/artifact design is IN PROGRESS (`advisor-codex-b1b-r3-contracts-20261014`), Advisor to review final then ask Owner exact artifact/build/scope approval. Default Restricted, A1 independent Owner Consent blocked, no product Shell/Provider/TGNK. [Active Handoff](SUD_D_HANDOFF.md).

**PRIOR R2 OWNER AUTHORIZATION RECORD (historical, implemented and stopped):** Product Owner explicitly APPROVED the **23-path B1b-R2 source/test allowlist**: original B1b 22 plus ONLY `packages/tests/src/solo-expert-serena-integration.test.ts` (existing B1a test) for exact immutable displayed `reviewDigest` fixture compatibility. [Updated R2 Serena Implementation Assignment](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r2-serena-assignment.md). Serena in a **SEPARATE chat** may repair Stage I Approval tests and two TS declaration mismatches and rerun real SQLite/owned TEMP cross-process restart + full B1a regressions. **Stage II fake Gateway/Desktop is permitted only AFTER Stage I is GREEN** within this same bounded code-only mission. **Not yet dispatched/started; no R2 Closeout.** Product Shell/B2 managed Serena/Provider/Network/Native/TGNK and any new file scope are NOT authorized; Default Restricted and A1 paused remain. See [active Handoff](SUD_D_HANDOFF.md) for the next actor.

**PRIOR B1b-R1 RESULT / ADVISOR REVIEW (2026-10-14):** Authorized R1 Electron 36.9.5 ABI135 test-host recovery **PASS** and source-only SQLite persistence/restart **5/5 independent PASS**, but B1b Stage I overall **PARTIAL BLOCKED / NO-GO**: 3/5 new Approval tests FAIL due required stored/displayed reviewDigest omitted by fixtures, existing B1a regression also FAIL, Application/Infrastructure TS have 2 stale-prebuilt-declaration diagnostics. **Strict Solo reviewDigest is intentionally not weakened.** [B1b-R1 independent Advisor verdict](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r1-advisor-review.md). **NEXT Owner decision:** authorize the original 22 B1b source/test paths **plus ONE additional B1a regression test path** `packages/tests/src/solo-expert-serena-integration.test.ts` — [exact B1b-R2 assignment (23 paths)](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r2-serena-assignment.md), PREPARED / NOT DISPATCHED. Keep code-only Stage I test fix / negative proofs first; Stage II Desktop/Gateway only after all Stage I + B1a regression gates GREEN. No managed Product Shell, B2, A1/Native/Provider/TGNK or Git commit/push. [Active Handoff](SUD_D_HANDOFF.md).

**PRIOR R1 APPROVAL RECORD (historical):** Product Owner approved [B1b-R1 test-only recovery plus conditional 22-path Code-only B1b re-entry](docs/superpowers/plans/2026-10-14-solo-expert-b1b-r1-test-host-recovery.md). This permits a **test-only** installed Electron 36.9.5 Node-host compatibility probe `ELECTRON_RUN_AS_NODE=1` with in-memory `better-sqlite3`/fixed `SELECT 1`; if and only if ABI probe PASS, resumed B1b Stage I source/tests within the original 22-path allowlist, real in-memory SQLite constraints, and one uniquely owned TEMP file SQLite cross-process reopen/restart test. Stage II fake Gateway/Desktop only after Stage I security/durability proofs PASS. New Closeout `.serena/reports/solo-expert-b1b-r1-code-only-closeout-20261014.md`. **READY TO FORWARD TO SEPARATE SERENA IMPLEMENTATION; NOT STARTED.** No reinstall/rebuild of ABI135 binding, real SUD-D Shell/B2, Product DB/Runtime, Provider/network, Native/A1/TGNK or Git writes. [Active handoff](SUD_D_HANDOFF.md) is authoritative.

**PRIOR B1b STOP / ADVISOR VERDICT (2026-10-14):** B1b Stage I preflight **NO-GO ACCEPTED**: existing `better-sqlite3@11.10.0` addon built for ABI 135 cannot load under current Node v24.14.0 ABI 137 (`ERR_DLOPEN_FAILED`). Serena correctly STOPPED before source edits/Stage II; NO SQLite durability proof, no production Shell. Advisor independently replicated failure, verified 17/17 existing source SHA-256 hashes and default Git boundary. [Accepted NO-GO and R1 test-only recovery packet](docs/superpowers/plans/2026-10-14-solo-expert-b1b-abi-nogo-advisor-review.md). Repo-installed Electron 36.9.5 maps to ABI 135 per repo's `node-abi` package; **Electron-as-Node test-only path PROPOSED, NOT EXECUTED** and requires specific Owner permission. In-memory SQLite validates SQL constraints only while open; actual restart persistence needs separate **test-owned disposable temp-file DB** and cross-process reopen proof. No rebuilding shared node_modules binding. B1b 22-path mission can restart only under a fresh scoped approval after R1 preflight PASS; A1, B2, TGNK remain HOLD. Current source of truth: [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).

**PRIOR B1b ASSIGNMENT PREPARATION (2026-10-14):** Advisor reviewed current Gateway/Approval/Desktop/SQLite/Workspace B1a seams and prepared [B1b exact 22-path code-only Serena assignment](docs/superpowers/plans/2026-10-14-solo-expert-b1b-serena-assignment.md). One bounded mission, **Stage I 10 paths** (durable review/HMAC/claim fence/monotonic Workspace generation) → **Stage II 12 paths** (B1a contract wiring, real Resume/ready-only managed session, Desktop informed consent and default-OFF MCP Gateway, fake E2E). Workspace Repository is newly included because timestamps alone cannot prove away/back generation. B1a still independently ACCEPTED 57/57; B1b has NOT been implemented or dispatched and exact-source edit permission is NOT automatic from plan preparation. Future B2 actual harmless Terminal remains separate, needs user-approved exact machine/Workspace/command/risk packet and genuine SUD-D Approval. No Process, provider, secret, network spend, Native/A1 or TGNK is authorized under B1b plan. See [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).

**PRIOR VERIFIED B1a MILESTONE (2026-10-14):** Serena implemented B1a under exactly eight source/test paths; ChatGPT Advisor independently [ACCEPTED WITH CONDITIONS](docs/superpowers/plans/2026-10-14-solo-expert-b1a-advisor-acceptance.md) after inspecting source and rerunning **57/57 focused tests**, 8-file ESLint, Domain/Application/Infrastructure TypeScript, 8 SHA-256 and 7 protected SHA-256; project-wide TS still has **four existing out-of-scope errors**. **B1a remains private/source-only**, with fake Approval, in-memory attempts and synthetic ready-only Serena session. **NEXT B1b** is the real durable Approval/SQLite/Workspace Resume/Desktop reviewed-consent/Gateway default-OFF integration, needing new exact approved source/test paths; the prior [Codex B1 design](docs/superpowers/research/2026-10-14-solo-expert-b1-codex-design.md) lists a candidate but is not automatic edit authority. **B2 real harmless Terminal** remains future; requires B1b acceptance, frozen device/Workspace/command/logging/effects packet and distinct actual Owner manual Approval. A1 remains PAUSED/BLOCKED, no TGNK/prod process launched. Current handoff: [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).

**PRIOR B1 SOURCE DESIGN (historical):** Owner approved preparing the B1 code-only scope/Serena prompt. Codex read-only source design completed; Advisor accepted the split [B1a/B1b scope decision](docs/superpowers/plans/2026-10-14-solo-expert-b1-advisor-review.md) and preserved [full Codex B1 design](docs/superpowers/research/2026-10-14-solo-expert-b1-codex-design.md). Full B1 would touch ~27 source/test paths; do NOT dispatch it wholesale. **B1a exact eight-path source-only fake-session assignment PREPARED, pending explicit Owner source-edit permission:** [B1a Implementation Assignment](docs/superpowers/plans/2026-10-14-solo-expert-b1a-serena-assignment.md). B1b later adds durable per-call Approval, UNKNOWN claim ledger, Desktop review and Gateway OFF-by-default wiring. B2 one harmless real managed Shell test remains future, requires a real SUD-D Approval and command-specific risk packet. Neither B1a/B1b code nor real B2 product Terminal has run yet. B0 50/50 private mock acceptance below remains accurate historical evidence.

**PRIOR VERIFIED STATUS (2026-10-14): Option B selected; B0 CODE-ONLY DONE / independently [ACCEPTED WITH CONDITIONS](docs/superpowers/plans/2026-10-14-serena-first-b0-advisor-acceptance.md), 50/50 focused Vitest and scoped checks PASS. B0 remains PRIVATE/INERT; no SUD-D production Shell is enabled. Owner's willingness to run a real Terminal command is an accelerated future small physical smoke direction, not permission to bypass real SUD-D Approval. NEXT = scope exact default-OFF B1 product/Approval/Serena wiring, then individually reviewed B2 short nonsecret Terminal proof. B1 source integration not yet authorized or implemented; B2 not yet exercised.**

**PRIOR OWNER DECISION (2026-10-14): Option B — opt-in Solo Expert was SELECTED; B0 CODE-ONLY AUTHORIZED.** Build on stock managed Serena 1.7.0 with user-selected *per-call* manual consent. Clearly disclose that Serena can retain raw tool arguments/results/errors in local logs/memory/stderr and any launched shell script acts with ambient Windows-user rights, no OS sandbox or proven descendant stop. Owner also approved the **direction of accelerating to a real short Terminal test** instead of waiting for every advanced security/long-job feature; the actual specific B2 command/device/workspace/expiry/effects/logging and SUD-D-mediated human authorization have **not** been established, so **no real shell is yet enabled or run**. Restricted default/direct Policy DENYs and A1 independent-consent BLOCKED status stay unchanged. **B0 separate Serena implementation mission ready, not started:** [B0 Binding Assignment](docs/superpowers/plans/2026-10-14-serena-first-b0-serena-assignment.md). B1 production cross-process integration and B2 harmless physical smoke are separate next gates; B3–B5 development script, long job, TGNK Final MP4 later. The active milestone state is in [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).

**Decision and rationale:** Adopt **Serena-first C1** ahead of the previously proposed TGNK registered Runner code mission. Reuse existing Serena/Tool Kernel/Policy/Approval/Audit and preserve the Runner lifecycle design as fallback only if an evidence-backed long-job gap requires it. This **supersedes the 2026-10-13 priority to implement a Trusted Local Runner first for near-term Solo Fast Closure**, but does NOT cancel historical Runner/A1 research or change the A1 Option A independent-consent security goal.

**HISTORICAL C1 acceptance boundary (C1 was inert and remains so):** C1 = inert code-only private reviewed Permission Bridge, fake Serena tool invocation and focused negative tests; **not a live shell, Expert Mode grant, production tool registration, physical test or MP4**. Default Restricted Mode unchanged. Manual Approval cannot guarantee per-child-process actions, filesystem/network confinement or safe secret logging inside a host-user shell. Long jobs still require actual process/stop/log proof. Any real host-user execution, privacy/network/provider/spend, new machine access or OS/native work requires a concrete separately scoped Owner authorization; A1 genuine trust anchor remains BLOCKED.

**HISTORICAL STATUS THROUGH C2 (updated Owner B choice is above):** Codex Serena-first Design/Spec/Plan DONE; Serena separate C1 private/fake-tool implementation DONE; ChatGPT Advisor **INDEPENDENTLY ACCEPTED WITH CONDITIONS — INERT ONLY** after 21/21 focused tests, scoped ESLint/Application TypeScript and source hash verification. Project-wide TypeScript still has four unchanged, out-of-scope diagnostics. No production shell/tool exposure or physical Process is authorized. **Canonical contract and milestone table:** [Serena-First C1 plan](docs/superpowers/plans/2026-10-14-serena-first-solo-permission-bridge-c1.md). **Evidence/decision:** [C1R Advisor acceptance](docs/superpowers/plans/2026-10-14-serena-first-c1r-advisor-acceptance.md). **C2 Codex Readiness Design DONE; Advisor reviewed/CONDITIONAL, live NO-GO.** See [portable full C2 design](docs/superpowers/research/2026-10-14-serena-first-c2-codex-readiness.md) and [C2 Advisor review](docs/superpowers/plans/2026-10-14-serena-first-c2-advisor-review.md). Owner approved narrow C2a-P0 Code-only, **completed as a source-feasibility NO-GO** (Serena correctly STOPPED before code/tests). ChatGPT Advisor independently [ACCEPTED the bounded NO-GO](docs/superpowers/plans/2026-10-14-serena-first-c2a-p0-advisor-review.md); stock Serena logging/early startup is not privacy-proven under the four-file allowlist. The former Owner decision was whether to engineer a pinned upstream privacy adaptation or consent to local Serena logging/host-user risk; the Owner now SELECTED B, as recorded above. A/B read-only Codex comparison completed and Advisor conditionally accepted: [A/B Decision Review](docs/superpowers/plans/2026-10-14-serena-first-a-b-advisor-review.md), [full report](docs/superpowers/research/2026-10-14-serena-first-a-b-codex-design.md). Advisor recommends opt-in Solo Expert B with per-call approval and accurate local logging/host-user risk disclosure, and the Owner subsequently SELECTED B and APPROVED B0 (see latest decision above).  No implied loosening of A1 or production defaults. Remaining C2a Approval/UI and C2b physical invocation are HOLD. No execution authority granted. No production shell/Process authority follows from C2. **Current execution status:** [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) top. Older A1 priorities/checkpoints remain historical while paused.

---

## PRIOR PRODUCT DIRECTION — Personal AI Work Harness / Trusted Execution Design (Owner, 2026-10-13; near-term priority superseded 2026-10-14)

**Decision: GOAL AND DESIGN PRIORITY APPROVED; INERT SLICES 1 AND 2A ACCEPTED; SLICE 2B SUPPLEMENTAL DESIGN ACCEPTED WITH CONDITIONS; PRODUCTION HOST IMPLEMENTATION AND PHYSICAL RISK ACCEPTANCE PENDING.** The Owner's near-term success criterion is that single-user SUD-D can complete a real coding task comparably to using Serena/Codex: inspect through managed Serena, edit, invoke approved development tools, run tests/build, diagnose, repair within budget, review diffs and return evidence. This is not a plan to develop a smarter model or duplicate Serena.

**Historical 2026-10-13 priority (superseded for current new work by Serena-First C1 above):** Design a **Trusted Local Runner + bounded Autonomous Agent Loop** before further Parallel Coding-first and Strong-Isolation-first implementation. Prior sequence/P0c/Hyper-V conclusions remain historical or applicable to their own restricted/isolation contracts, not proof of a new trusted host-user mode. Keep shipped Restricted Mode as default; Computer Use, background autonomy and parallel work remain later candidates.

**Options for Codex to compare, not pre-approved implementation:**
- Restricted Mode retains the v1.0.8 fixed capabilities. Candidate Trusted Local host-user execution would require explicit Owner opt-in, bounded task/time/retries, approvals, status/logs/cancel and audit. Isolated Mode remains a separate option for untrusted work.
- A host-user process may access out-of-Workspace files, network, and secrets. Task approval or Workspace checks are not OS-enforced filesystem/network sandboxing. Assess dependency supply chain, prompt injection, destructive changes, privilege, secrets, egress, cost, process ownership/cleanup and recovery.
- Reuse managed Serena, Git, Work Memory and Kernel/Policy/Approval/Audit. Distinguish a ChatGPT-connected tool loop from an independent/background agent runtime, which requires separately designed model integration and authorization.

**CURRENT A1 TRUST FEASIBILITY (READ-ONLY, 2026-10-13):** After 74/74 pure source-level evidence closure, Advisor recorded `.serena/reports/trusted-runner-supervisor-slice2b-a1-owner-trust-feasibility-packet-20261013.md`. Historical fixed CPUS_CREDUI protected presenter/low-privilege control service is a conditional OS-feasibility candidate only, NOT installed or proven and NOT transferable consent from the earlier restricted runner path. Actual SYSTEM secure presenter/context, credential-free completion, service control identity, key/journal protection and machine setup remain unverified and unapproved. Avoid additional speculative Pure TS implementation; next material work requires one long bounded DESIGN-ONLY feasibility/risk/rollback proposal, then a separate narrow Owner decision before any privileged host changes, signing/key provisioning, Native Build/PHYS. No background work or agent dispatched from this read-only packet.**

**CURRENT A1 EVIDENCE-CLOSURE ACCEPTANCE (2026-10-13): Separate Serena completed the approved four-file Long Bounded TypeScript-only repair. Advisor independent review `.serena/reports/trusted-runner-supervisor-slice2b-a1-option-a-evidence-closure-advisor-review-20261013.md`: F-A1-01 synthetic campaign evidence completeness, F-A1-02 Z4 prerequisite and F-A1-03 one-snapshot codec source-level findings CLOSED with conditions. Recomputed four SHA-256 hashes matched Serena Closeout, 7 suites / 74 of 74 Pure Vitest PASS, scoped TypeScript/ESLint and `git diff --check` PASS; HEAD unchanged `7e4c546`, staged 0, 246 existing Git-visible modified/untracked items. Inert only: `UNVERIFIED/MISSING/launchAllowed:false`; no compiled C++/Native/Physical evidence. A1 genuine protected independently verifiable Owner Consent TRUST ANCHOR STILL BLOCKED. NEXT ADVISOR step is one LONG READ-ONLY trust-anchor feasibility/Owner decision packet, NOT another speculative synthetic-code pass. BUILD/PREP, PHYS, actual Owner provisioning, host-user process risk, Native/Production Trusted Mode, commit/push still NO-GO. See SUD_D_HANDOFF.md top.**

**NEW ACTIVE A1 SOURCE REVIEW (2026-10-13): Separate Serena Implementation delivered six new pure TypeScript Owner-consent contract/codec/ledger files. Advisor independently reran seven suites / 65 of 65 tests PASS, strict TypeScript/ESLint/diff PASS, preserved Git HEAD 7e4c546 and staged 0, 246 existing dirty/untracked entries (240+6 new). ACCEPT WITH CONDITIONS as INERT SOURCE ONLY. Source evidence closure REVISE: F-A1-01 campaign completion currently accepts merely reserved slots without modeled terminal/audit evidence, F-A1-02 detached Z4 recovery ignores prerequisite state, F-A1-03 optional codec single-snapshot robustness. One LONG BOUNDED separate Serena repair assignment ready at `.serena/reports/trusted-runner-supervisor-slice2b-a1-option-a-evidence-closure-long-serena-assignment-20261013.md` (4 TS files + ignored Closeout), not running, one final review. A1 actual independent Owner Consent trust anchor HARD BLOCKED; Option A still design direction only; real 13 roots / 65 proof creation requests unapproved; BUILD/PREP/PHYS NO-GO, no C++ compile/native test/privileged policy/production stage. Latest details SUD_D_HANDOFF.md top.**

**OWNER LATEST SECURITY DIRECTION (2026-10-13): Option A — Independently Verifiable Owner Consent is selected for A1 design. Option B weaker same-user cooperative consent is rejected as default. This is a direction decision, NOT a proven trust anchor, credential/key provisioning, or authorization to compile, run Native/Physical Process, modify Windows policy, commit/push or ship. Owner requests long bounded safe missions with internally permitted TDD/repair and one final Advisor review, not repeated intermediate handoffs; all security and physical-risk STOP gates remain. Latest S1 pure synthetic module: independent Advisor review 44/44 focused Vitest PASS + TypeScript/ESLint PASS, accepted only as INERT MODEL. Codex CLI A1 Option A long read-only design COMPLETE (437-line report) and independently Advisor reviewed: conditional INERT CONTRACT DESIGN ONLY, while actual independent trust anchor/Owner presenter/issuer/enforcement remains BLOCKED. A new six-file pure contract/codec/synthetic-ledger Long Bounded Serena Implementation assignment is READY FOR SEPARATE SERENA CHAT RELAY, NOT RUNNING, with one Closeout and no intermediate Owner reviews. No new production/native admission exists. Read SUD_D_HANDOFF.md top for active sequence.**

**PRIOR PROGRESS (2026-10-13): Slice 1 and Slice 2A inert contracts accepted; Slice 2B inert C++ source scaffold accepted only as SOURCE-ONLY. Serena repaired F1 exactPipePeer declaration order and F2 lifecycle fence, and Advisor independently ACCEPTED the bounded source repair (31/31 pure tests plus scoped static checks PASS). C++ entries remain unconditionally disabled, never compiled or Native/Physical tested. A1 actual independently verifiable Owner/Kernel authorization is HARD BLOCKED; no historical PRE-H1 consent automatically applies. S1 has conditional DESIGN-only proposal of four independent subcampaigns P0 47/P1 6/P2 6/P3 6 = 65 unapproved proof creation requests, 13 unapproved command-root attempts; native issuer/framework processes remain uninventoried. Owner preference: work in one LONG BOUNDED safe source-only mission with internal TDD/repair and single final Closeout/Advisor review, no recurrent handoffs. NEXT: Serena Implementation separate chat ONE dispatch for the prepared pure S1 campaign model/negative tests/A1 options packet (read `SUD_D_HANDOFF.md` top); not currently running. BUILD/PREP and PHYS NO-GO; host-user risk, final manifest/workspace, signer/policy and actual consent are not approved. Restricted Mode stays default; production Trusted host and Agent Loop not shipped.** Historical design dispatch statement follows: **CODEX DESIGN/READ-ONLY REVIEW ONLY.** Verify published v1.0.8 versus dirty development code, compare reviewed command profiles, trusted host-user process, low-privilege Windows user and strong OS isolation; deliver threat model, residual Owner-risk decisions, smallest real coding MVP and bounded Serena assignment. ChatGPT Advisor reviews design before separate explicit authorization for implementation. No current approval for generic Shell exposure, security-gate changes, Native execution, provider/spend, code implementation, staging, commit/push or release.

This decision supersedes earlier *priority/next-action claims for new work* in lower historical sections, including the already-completed 2026-10-12 limited release mission. Refer to the top of [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) for current state and dispatch.

---

> Master Plan / Source of Truth for long-term architecture, milestones, product direction, and approved future ideas.

For current execution status, verification, open issues, immediate next action, and latest completed milestone commit, see `SUD_D_HANDOFF.md`.


## ACTIVE RELEASE DIRECTION — Publish Testable SUD-D Desktop Now, Validate Other Machine Later (Owner 2026-10-12)

Owner **superseded** the prior wait-until-complete-E2E gate: issue a limited **OWNER-TEST Windows Desktop** release **now**, delegate the release engineering and verified publish to Codex, then use practical testing on the other approved machine/Workspace to learn what is missing, and fix in later patch releases. Current hardcoded local 30s synthetic MP4 is a proven integration sample, **not shipped full Thai-TTS/AI images/end-to-end provider support**. Preserve truthful release notes, workspace/secret/billing boundaries and on-device data; no third-party Workspace access.

**ACTIVE Codex Release Mission:** `.serena/reports/solo-owner-test-windows-release-codex-assignment-20261012.md` SHA-256 `7d1eca361a7a4a847d2a66300bb37b0e84fb8ce0376d1fa973dba810f4304618`. Requires inspecting currently dirty `p0c-hyperv-spike` working copy and release delta from v1.0.6, creating isolated **clean** reviewed release source, running Windows packaged smoke/CI/signature/hash/update preservation checks, bumping to next free version only once real field-test value is proven, and then verified Github `master` ancestry/tag/workflow/published release. Do not stage all dirty files or accidentally package old F2/H1 Native experiments. Do not skip package or update validation. Release remains NOT PUBLISHED until verified GitHub URL. Previous 'complete E2E before release' section below is HISTORICAL and superseded.

---

## HISTORICAL SUPERSEDED GOAL — Complete Workspace-defined E2E Product FIRST, Release ONCE afterward (Owner 2026-10-12)

Owner expressly requires all practical SUD-D code/runtime/Desktop/packaging work for real Workspace-defined goal→script→QA→TTS→images→subtitles→render→QC→verified MP4 to be complete **before creating ONE Windows Desktop update release for a separate trusted tester**. No interim Release, tag, publication or touch of their Workspace. This supersedes any shorter-term proposal to update Desktop early just to smoke-test the UI. Agent handoff `.serena/reports/solo-pre-release-real-workspace-e2e-closure-assignment-20261012.md` contains the 5-workstream pre-release acceptance: portable Workspace manifest, managed workflow lifecycle through Kernel/Policy/Approval/Audit and durable checkpoint, actual Desktop operation UI, self-contained Windows package toolchain/ABI, and full owned Workspace acceptance with physically independently verified MP4 plus failure/recovery/provenance tests. Real provider-backed media on another machine is an explicit **post-release** acceptance, with provider configuration/budget permission supplied by that device's owner; offline media placeholder results cannot be marketed as real provider E2E.

Important present gaps: Developer-only `verify.run` physical MP4 success depends on host-global Node/pnpm and owner-local FFmpeg path, and currently runs in isolated test production MCP server, not active Desktop; packaged installer only includes MCP gateway resources. It cannot yet drive other-machine workflow as shipped. Keep media/TTS/image business logic in each user's Workspace; SUD-D only provides reviewed launch contract/orchestration/provider permission boundary and portable binary/runtime. Preserve existing Workspaces/Policy/Approval/Audit, avoid generic arbitrary shell and legacy F2 Native opening. Do not install from unverified source, charge providers, access friend's Workspace, or publish release before the explicit final Owner gate.

---

## LATEST SOLO OWNER-TEST CHECKPOINT — Physical `verify.run` → independently decoded MP4 PASS (2026-10-12)

**REAL bounded output achieved:** One fresh, isolated, SUD-D-owned RUN Workspace (`C:\1.งานโด้\SUD-D-Solo-Run-Workspace`) hosted a fixed `pnpm run build` renderer under genuine production MCP → Workspace → Policy → Approval → `verify.run` adapter; one single physical build produced `outputs\solo-real-via-verify-20261012\media\final.mp4` with a 30s MPEG4 320x180 video, AAC mono and Thai subtitle stream. Independent ffprobe + complete video/audio decode PASS, SHA `659dbf8ee9ea765fccb7dbd0cdca02d284e5a8d6f752fb0bee45e7a9298d4d77`, 10 numbered provenance phase receipts and isolated test Audit. Test opt-in 4/4 PASS. `VERIFY_RUN_ACTUAL=true` and `MP4_FILE_INDEPENDENTLY_DECODED=true`; **`TEN_PHASE_REAL_AUTO_RUN=false`** because TTS is silent, images synthetic colors and no live Desktop/Provider. Artifact is real MP4, not a mock. `SUD_D_HANDOFF.md` and `.serena/reports/solo-real-video-via-verify-steward-review-20261012.md` own exact proof/hashes.

**Now move toward OWNER-USABLE control:** use actual connected SUD-D Desktop, register ONLY owned RUN Workspace via legitimate UI/repository flow, expose the reviewed fixed build as a repeatable fresh-run-ID action with progress/cancel/retry+receipt, and one true live-Desktop controlled media run. Then real Thai TTS, generated images and semantic QA under newly approved local/provider credentials and spend budget. Do not relaunch consumed one-shot or modify existing frozen static inputs. Keep Workspace, Approval, Audit, no raw shell, no friend's resources and cost/secret limits. Disproportionate legacy AppContainer/Hyper-V/F2 Native gates are not Solo fixed developer-test prerequisites and remain CLOSED on their original path; no trust/Job-grade cleanup claims. Current Home/Work MCP tunnel disconnected and run only proved production server path within an isolated test process. Avoid more paper-only readiness exercises.

---

## ACTIVE PRIORITY — Solo Zero-Touch MVP (Owner decision 2026-10-11)

**APPROVED PRODUCT REPRIORITIZATION + SOLO RISK CONTRACT (2026-10-11); SLICE 1 CODE-ONLY ONLY.** The Product Owner explicitly changed the near-term MVP audience from **exactly two trusted users to one primary owner on a personally controlled Windows machine**, because the existing Native F2-H1 proof-first path is delaying a usable result. The single unchanged core outcome is **one goal + one bounded initial Mission approval -> fully automated real Workspace phases, finite retry/resume and independent QC -> real verified Final MP4**, without human-operated phase commands. The long-term multi-user/AI Team vision is deferred, not deleted. This section supersedes the **delivery priority and user count** of the 2026-10-08 Private MVP plan below; historical design/security evidence and its blocked gates remain factually unchanged.

**Fastest-useful-slice direction:** reuse existing SUD-D Kernel/Policy/Approval/Audit/Workspace/Work Memory and proven connected tools. Have Codex design the *smallest reviewed, fixed-purpose/allowlisted local execution interface* for one owner, one enrolled Workspace and one actual video workflow; keep business script/TTS/image/subtitle/render/QC details inside that Workspace, not hardcoded in SUD-D core. Reuse actual installed media tools and existing provider profiles only after read-only inventory and explicit scoped authorization. Do not introduce a generic shell, arbitrary model-selected executable/argv/cwd/env, plaintext-secret transport, ambient provider network, unreviewed AI code execution or unrestricted write/delete. One initial Mission authorizes only its bound actions, budgets, spend, egress, retry/resume and outputs; still stop on unknown cleanup, charges or QC. Solo convenience is NOT a grant of privileged execution.

**Owner accepted the proposed reduced Solo host-token isolation risk (design contract only, 2026-10-11):** Windows AppContainer/H0/Topology-B guardian/worker Job and multi-layer Handle/ABI/Stage/ACL proof may move **off the Solo MVP critical path** if a smaller safe-enough supervised fixed-runner boundary is designed with a transparent weaker-isolation guarantee, bounded process lifecycle, exact allowlist, denial and recovery proofs. Do not mark the existing F2 proof PASS or silently remove its gates. Any old F2-H1 process/Stage Native path remains STOP/BLOCKED and `runner.start` remains UNEXPOSED until a separately approved new code+runtime path meets its own recorded admission gates. If safe limited execution cannot be demonstrated, report BLOCKED instead of allowing shell/ambient-host fallback.

**Active transition:** keep the Owner-approved **V3 disposable inspector code-only hardening** on HOLD as an *unneeded prospective legacy-F2 path*, notwithstanding its reported code-only closeout. If it was already started, stop at its safe current checkpoint and return the work/evidence without destructive cleanup; do not run Native. Do not keep producing V4/V5 inspector packets by default. Existing F0 Option B / H1 Topology B / frozen Stage packets are preserved for later optional hardening, not declared incorrect or completed. The subsequent 2026-10-11 Owner decision additionally authorizes **only** Slice 1 inert CODE-ONLY enrollment/source/tests and source-backed reference workflow analysis under the latest scope correction; it does NOT authorize runtime rewiring, Win32/Native tests, child creation, package installation, provider charges, paid account setup, changing security flags, Commit/Push, or F3 implementation.

**Owner correction (2026-10-11, superseding Slice-1 Workspace premise):** The video production Workflow discussed earlier belongs to a **friend's project**, not the Owner's SUD-D Workspace. It is a **read-only design reference**, NOT a runner enrollment/execution target. The actual requirement is to **model and test a comparable workflow entirely in a new, separately scoped SUD-D-owned Test Workspace**, using controlled test inputs and independently verified outputs. Do not ask for the friend's Workspace path/registration, copy their code/data or use their providers/secrets. The documented high-level reference is script/QA → TTS → images → subtitles → render → QC/MP4; detailed friend-specific semantics are UNVERIFIED without an accessible source document/diagram. Prior Slice-1 request for an existing registered TGNK/video Workspace is canceled as a mistaken requirement, and does not block Code-only reference mapping. The future SUD-D Test Workspace creation and real media execution require a new precise scope; current Code-only/Native STOP remains. Superseding agent instruction: `.serena/reports/solo-zero-touch-mvp-reference-workflow-scope-correction-20261011.md`.

**Next checkpoint (Owner risk acceptance + Slice 1 authorization, 2026-10-11; corrected reference scope):** Codex design `.serena/reports/solo-zero-touch-mvp-codex-rebaseline-delta-20261011.md` and Steward design review `.serena/reports/solo-zero-touch-mvp-codex-rebaseline-steward-review-20261011.md` were accepted by the Owner **as a design/risk decision**: `solo-reviewed-host-v1` uses one non-elevated host-user Runner under one Desktop-owned Windows Job for initial Solo MP4, WITHOUT AppContainer OS file/network/credential sandboxing; a compromised runner/tool may access owner-user files/network/secrets outside Workspace. Owner approved Serena Slice 1 CODE-ONLY profile/enrollment; the earlier proposed inspection of a supposedly Owner-owned video Workspace was **superseded** by the latest requirement to analyze the friend's workflow only as reference for an independent SUD-D test. Bounded task: `.serena/reports/solo-zero-touch-mvp-slice1-serena-assignment-20261011.md`. **Do not request the friend's Workspace root/ID; no third-party file/network access. Own Test Workspace selection/creation is a future separately bounded task.** Do not edit the old native gates or expose `runner.start`; Slice 2 Native/Job lifecycle, Slice 3 provider/secret/spend and F4 remain separately blocked pending future explicit approvals. Historical F2/H1 native proofs remain BLOCKED; R1 63/63 or V3 20/20 pure tests do not make OS/Media PASS.

---

**Latest Owner scope authorization (2026-10-12, static fixture ONLY):** After independent Advisor ACCEPT of the inert Slice-1 source/tests (`.serena/reports/solo-zero-touch-mvp-slice1-steward-review-20261012.md`), Owner approved creation of a new **SUD-D-owned STATIC Test Workspace**, focused pure tests and `S1-SHAPE-01` all-own-key shape regression fix, **not** running a workflow. Single exact proposed root: `C:\1.งานโด้\SUD-D-Solo-Test-Workspace` (Advisor read-only precheck: absent; must reverify before creation). Serena assignment `.serena/reports/solo-zero-touch-mvp-owned-static-test-workspace-assignment-20261012.md`. The friend's project stays workflow-design reference ONLY, never an execution/data source. Any real SUD-D Workspace enrollment/DB write, local media process/Native/Job, Runner start, Provider/Secret/spend, offline synthetic execution or Final MP4 still needs future explicit bounded authorization. Prior sentences requesting consent for creating our own static test fixture are superseded by this Owner approval; no implementation has started.

---

**Latest product-operating preference (Owner 2026-10-12):** minimize Owner-as-messenger work and enable **safe automatic continuation within one narrowly approved Mission**, including preapproved bounded retries of harmless implementation and code-only static-file transport failures, deterministic evidence review and STOP/report on ambiguity. This is a **requirement/direction**, not a currently implemented ChatGPT→Serena dispatch mechanism or a standing privilege grant. Historical partial static fixture: S1-SHAPE-01 11/11 pure tests ACCEPTED, seven-file fixture BLOCKED with only README plus two empty folders after Windows command-line-length failure. Exact preserved partial-root recovery packet `.serena/reports/solo-zero-touch-mvp-static-partial-recovery-assignment-20261012.md`, not dispatched; `SUD_D_HANDOFF.md` owns the detailed active status. General auto bypass of authorization, unknown cleanup, process creation, Workspace registration, provider charges, real execution and access to friend's Workspace remains strictly DENIED.

---

**Static owned Test Workspace checkpoint ACCEPTED (Advisor, 2026-10-12):** Exact approved SUD-D-owned fixture now contains 7/7 static files, synthetically modeling the ten phase dependency DAG and future independent QC/MP4 checks, no friend's data. Serena Closeout `.serena/reports/solo-zero-touch-mvp-static-partial-recovery-closeout-20261012.md`; independent Advisor review `.serena/reports/solo-zero-touch-mvp-static-fixture-steward-accepted-20261012.md` (18/18 focused pure tests re-run PASS, file hashes verified). All runtime registration/Runner/Native/Provider/MP4 remain NOT RUN/BLOCKED; physical Workspace folder != enrolled Workspace. **Next pending Owner scope decision:** prefer one pure in-process no-write synthetic orchestration diagnostic on this immutable fixture (finite phase order, one controlled recoverable non-billable failure, retry/checkpoint evidence) before any separately authorized physical execution. Auto-continue preference does not silently authorize the new scope or skip OS/spend gates.

---

**Latest Owner decision — accelerated delegated Solo execution management (2026-10-12):** Owner expressly approves pure in-process offline synthetic 10-stage diagnostic now and delegates **routine low-risk task selection, test-repair loops and bundled end-of-task reviews** to ChatGPT Project Advisor. Priority is a **working SUD-D-owned real end-to-end workflow**, not endless packet/faux-proof gates. Prefer one long bounded Serena delivery with focused tests and up to three in-scope fix cycles instead of prompting Owner after each harmless code-only failure. The current approved next Serena packet `.serena/reports/solo-zero-touch-mvp-inprocess-diagnostic-serena-mission-20261012.md` is PREPARED but **not autonomously dispatched** because Home/Work Team tunnels are disconnected; `SUD_D_HANDOFF.md` is authoritative for current status. This grant does not disable strict Repo/OS/Provider/third-party/secret/spend/irreversible action checks and does NOT yet authorize a physical Job/Runner or real media call. Proceed from code-only diagnostic to explicitly controlled real owned local offline execution as soon as its physical authority/identity/cleanup safeguards are genuinely reviewed; preserve the friend's Workspace as DESIGN REFERENCE ONLY.

---

**2026-10-12 newest checkpoint / fast-track real Workflow:** Project Advisor independently ACCEPTED the latest Solo Pure In-process Diagnostic: 29/29 focused tests + strict and infrastructure typechecks, one fault at subtitles with 5 in-memory checkpointed receipts, 2-attempt simulated resume, ZERO real process/provider/media. Review `.serena/reports/solo-zero-touch-mvp-inprocess-diagnostic-steward-review-20261012.md`. Host targeted read-only discovery: `node.exe` `C:\Program Files\nodejs\node.exe` SHA-256 `63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088`; binary signer status unverified, ffmpeg/ffprobe not in PATH (not proven absent). Advisor used Owner's delegated low-risk authority to queue **one long CODE-ONLY fixed first offline subprocess readiness packet** `.serena/reports/solo-zero-touch-mvp-fixed-offline-smoke-readiness-serena-assignment-20261012.md` (not dispatched owing unavailable Home tunnel). This candidate will merely plan/deny execution of pinned `node.exe --version` until explicit physical Job/supervisor/consumed-approval gates are met; no run yet. Real offline physical proof/Workspace registration, media/tool TTS/image Provider charges and MP4 remain separate future gates. Do not conflate simulation with end-to-end product acceptance.

---

**2026-10-12 latest SOLO fast-track checkpoint:** Project Advisor independently ACCEPTED Fixed Offline Smoke CODE-ONLY readiness, **39/39 focused pure tests** and TS checks PASS, exact new reviewed fixed operation `node.exe --version` (readiness Source/Test hashes in `.serena/reports/solo-zero-touch-mvp-fixed-offline-smoke-readiness-steward-review-20261012.md`). No actual physical execution: `PHYSICAL_LAUNCH_NOT_AUTHORIZED`. Owner's next genuinely required decision is a **single bounded authorization** for Serena to implement and, only after reverified signer/OS-native Job/independent watchdog/consumed one-shot scope/sanitized environment and cleanup preflights, run **one fixed offline Windows Job-supervised `node.exe --version` physical smoke**. Fail closed before spawn if any prerequisite unmet; no legacy F2 gates, arbitrary launch, provider, secrets/spend, SUD-D Workspace registration, friend's workspace or MP4 claim. Native host-token isolation is weaker than AppContainer; Job does not enforce OS egress/file-system sandbox. Avoid more code-only toy packets; prefer this real lifecycle proof with ONE closeout and one Advisor review, then go toward first real offline synthetic MP4. Owner must explicitly authorize the physical test; code-only delegation does not itself promote runtime authority.

---

**LATEST Owner physical scope authorization (2026-10-12):** The Owner expressly approved **one conditional real supervised Windows Job/Native test-only process** with exact binary `C:\Program Files\nodejs\node.exe` SHA-256 `63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088` and argv `['--version']` (exactly one OS CreateProcess attempt, not arbitrary Runner). ChatGPT Advisor prepared `.serena/reports/solo-zero-touch-mvp-single-physical-job-smoke-serena-assignment-20261012.md` for Serena Home New: one long bounded test-only supervisor/ABI/mock-negative-tests + only-if-all-safe actual Job-born subprocess + exact root/Job/stdio/handle cleanup; atomic one-use marker prevents retry. If signer trusted chain, binary/FileID/ABI/closure, dedicated independent watchdog, Job membership at creation and sanitized env/one-use authority cannot be proved, STOP BEFORE SPAWN. Old F2 Native gates unchanged and Runner/Gateway/DB/Workspace enrollment, FFmpeg/Provider/spend/network/friend resources and Final MP4 are still excluded. Owner-approved Host-token weaker isolation risk remains material; Windows Job is not a general Windows file/network sandbox. No physical execution has happened yet; Home/Work Agent tunnel unavailable, requires Serena Home New to receive this exact approved assignment by working handoff. Real test receipt then Advisor independent review, next bounded real offline Media milestone only after separate evidence/scope.

---

**LATEST 2026-10-12 SOLO physical test blocker / next decision:** Owner's expressly approved ONE conditional fixed `C:\Program Files\nodejs\node.exe --version` Win32 Job smoke was NOT RUN: `PHYSICAL_NO_GO` at mandatory Authenticode trust preflight (`Microsoft.PowerShell.Security` duplicate TypeData loader failure). Serena Closeout `.serena/reports/solo-zero-touch-mvp-single-physical-job-smoke-closeout-20261012.md`; independent Advisor review `.serena/reports/solo-zero-touch-mvp-physical-nogo-signer-steward-review-20261012.md`. No CreateProcess, attempt marker or new Supervisor files. Advisor read-only inspection extracted signed-file cert subject OpenJS Foundation, issuer Microsoft ID Verified CS AOC CA 02, short-lived Feb 2026 leaf cert (expired now); plain offline X509Chain.Build returned NotTimeValid + OfflineRevocation + RevocationStatusUnknown. **Signer crypto/timestamp/chain not yet trusted**: certificate extraction is not WinVerifyTrust PASS, and a legitimate trusted Authenticode timestamp might allow an expired leaf cert. Advisor delegated **one bounded signer-only offline recovery assignment** `.serena/reports/solo-zero-touch-mvp-offline-authenticode-recovery-serena-assignment-20261012.md`; optional test-only verified WinVerifyTrust helper, no network/security policy relaxation or Node/Job launch. If offline CRL evidence absent, return precise Owner decision about trusted constrained online verification or revised alternative provenance, never silently waive. Follow with ONE re-reviewed physical Job test mission after all signer/ABI/watchdog/ownership go/no-go gates, then real offline media/verified MP4. Parent/home agent tunnel remains disconnected; Serena Home New must explicitly receive assignment. Preserve user-owned dirty Git, exact immutable 7 static fixture bytes and all legacy F2 Native hard-stops.

---

**ACTIVE FASTTRACK ONE-OWNER PRODUCT DECISION (2026-10-12):** The Owner expressly demands usable SUD-D Solo as soon as practical and removal of disproportionate security/paperwork from the Solo DEV/TEST critical path. Use existing product `verify.run` through Workspace/Kernel/Approval with reviewed local fixed script instead of blocking simple personal use on legacy Hyper-V, AppContainer, old F2-H1 Windows Job proof or offline Code Signing CRL caches. **Do not weaken global policies, re-enable blocked legacy F2 paths, allow arbitrary AI-specified shell, third-party/friend Workspace, credential leak, paid provider calls or unverifiable process cleanup.** Reuse real restricted verify process adapter; recognize its timeout PID-only cleanup limits and avoid claiming Job proof. One real SUD-D-owned Active RUN Workspace + app-managed `verify.run` success is the next capability proof. Then one physical synthetic 30s/3-scene MP4 from the same owned inputs with separately decoded stream/duration/scene/subtitle QC, truthful placeholder/non-Thai-TTS status. Real Thai TTS/images and fully automated 10 phases are later acceptances after concrete credentials/tooling/budget. Host FFmpeg/FFprobe not on PATH, installed Windows speech voices observed en-US only; no fake MP4 claim. Serena assignment `.serena/reports/solo-one-owner-real-mp4-fasttrack-serena-mission-20261012.md`; alternate Codex CLI engineering agent started locally via bounded workspace-write sandbox because normal SUD_D_Home/Work tunnels absent; await Advisor independent review. Preserve historic strict F2/H1 gates as blocked, but stop making them prerequisites for newly scoped ordinary Solo fixed-test execution.

---

## Private MVP Full Loop priority — approved direction 2026-10-08

- **Decision:** prioritize a Full Zero-Touch Workflow for exactly two trusted users: one goal and initial bounded Mission authorization -> reusable Workspace runner -> automatic phases/retry/resume/QC -> verified real Final MP4. Human-operated phase execution is diagnostic only and cannot satisfy MVP acceptance.
- **Why:** deliver a useful local product quickly while keeping SUD-D a generic orchestrator/execution bridge. Business workflow, providers, rendering and project QC stay in their Workspaces; no TGNK/video logic in core.
- This priority supersedes the earlier human-assisted Private MVP finish line and takes precedence over the older post-MVP expansion sequence while this critical path is active. Those future capabilities are deferred, not deleted.
- P0c.5 trusted confirmation/provisioning is **DEFERRED / NOT PASS**; its research/design/implementation continuation is stopped. Historical P0c.1-.4 evidence, original Gate A PASS and R3 clean-build PASS remain preserved. Gate B NOT AUTHORIZED; P0c production execution BLOCKED; runner.start UNEXPOSED.
- **F0 Option B approved (2026-10-08):** pinned reviewed Workspace runner/native dependencies/local controller are application TCB. Same-user compromise of that TCB/consent/secrets is outside the Private MVP guarantee; total persistent storage uses operational budgets/monitoring, not an OS-hard aggregate physical cap. Residual substituted approval/state, secret theft, Workspace damage and disk exhaustion remain explicit. Arbitrary AI code/external inputs/unrelated processes are not declared trusted.
- **F0 REBASELINE DOCUMENTED; no further threat-model decision required.** Keep Mission/Kernel/Policy/Approval/Audit/Workspace/least-privilege gates, available enforced resource limits, finite retries/spend and fail-closed behavior. No shell/caller process selectors/unreviewed code/automatic Administrator. Practical F2 is per-user fixed AppContainer/Job execution with application storage controls; old high-assurance properties are excluded, not claimed proven. The old five-gate sequence is not required.
- **Handle-isolation decision approved (2026-10-08):** F2 uses reviewed Windows inheritance allowlists, a pinned isolated fixed-purpose creation owner and real native negative tests under Option B, replacing exhaustive independent child-handle-table attestation. No exhaustive OS proof is claimed. AppContainer/Job/Workspace/Mission/watchdog/stage identity/audit/budgets/fail-closed gates and genuine zero-touch verified Final MP4 acceptance stay mandatory. Native readiness remains BLOCKED / NOT PROVEN; known leakage blocks. [Revised contract](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#f2-reviewed-handle-isolation-contract--owner-decision-2026-10-08) and [bounded proof sequence](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#f2-handle-isolation-native-proof-acceptance). Next is Steward review, not a new implementation/native authorization.
- **H1 ownership topology selected B (2026-10-08), pending Steward review:** Desktop directly owns one fixed unprivileged Runner control process/guardian Job; Runner owns worker Job and H0; tunnel-spawned Gateway remains the request frontend. This replaces the unsupported exact Gateway-handle acquisition premise without a service/elevation/account/session change. Native H1 remains BLOCKED, old manifest stale for this topology, runner.start unchanged. [Ownership contract](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#f2-h1-process-ownership-topology--selected-b-2026-10-08) / [one code assignment and suspended-only proof stop](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#f2-h1-selected-topology-implementation-and-proof-stop).
- Authoritative [approved F0 contract and finite F2 profile](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#f0-approved-private-mvp-security-contract). Sequence: F0 documented -> Steward review; F1 discovery independently when assigned; verified F2 prerequisites/runtime -> F3 one real Workspace/provider/render/QC slice -> F4 unchanged real unattended MP4 acceptance. F2/F3 readiness and runner.start exposure still require actual evidence/new bounded authorization. See [plan](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#private-mvp-full-loop-critical-path--2026-10-08).
- Implementation, machine setup and public installer/release remain separately authorized checkpoints. Current next action is ChatGPT Steward review; this priority update grants no implementation/build, Gate B, service/provider/Hyper-V setup, paid dependency, Remote Commander, commit or push.


---

## 1. North Star

SUD_D is a **local-first Personal AI Team Harness / Orchestrator for Windows**, built on a secure personal AI control gateway/runtime. The MCP Gateway is an important integration boundary, not the final product destination.

The long-term product flow is:

```text
User defines a Goal and constraints
→ SUD_D forms and coordinates an AI team
→ the team plans, delegates, works, verifies, reviews, hands off, and preserves context
→ SUD_D returns artifacts and a Final Result for user review or approval
```

Goals:

- Make it easy for ChatGPT/AI to work with local projects.
- Be safer than an unrestricted generic agent.
- Keep CLI out of the normal user workflow.
- Make AI actions bounded and auditable.
- Support local continuity across ChatGPT sessions and cross-device project continuity through Git commit/push/pull.
- Let the user direct outcomes through goals, constraints, sensitive-action approvals, and final review instead of micro-managing every agent.
- Reach a useful **Personal Alpha and Team Mode MVP quickly** for the primary Windows user before investing in enterprise-scale hardening or broad platform polish.

SUD_D is not an unrestricted shell wrapper. Security decisions must be enforced below the UI and remain effective even if the UI is bypassed or compromised.

### Security pillars

- Workspace Boundary
- Policy
- Approval
- Audit
- File Recovery

### Baseline policy

| Capability | Baseline |
| --- | --- |
| Workspace read/search/write | ALLOW |
| Delete | ASK |
| Execute | ASK |
| Secrets | ASK / DENY |
| Network | DENY by default |
| Outside Workspace | DENY |
| InternalRoot | DENY |
| Audit | ON |
| Delete | Recoverable |

Security defaults are fail-closed and least-privilege. Destructive actions must be recoverable where practical.

---

## 2. Current Repository Architecture

SUD_D is currently a pnpm TypeScript monorepo with these package boundaries:

- `packages/domain` — core types, policy/classification primitives, connection state model, fail-closed state transitions.
- `packages/contracts` — Zod schemas and typed DTOs for IPC/runtime boundaries.
- `packages/infrastructure` — SQLite repositories, path/data-root adapters, audit persistence, and Doctor checks.
- `packages/application` — orchestration/use-case services such as workspace management.
- `packages/mcp-gateway` — guarded production stdio tools and model-facing session instructions.
- `packages/desktop` — Electron main/preload plus renderer UI shell.
- `packages/tests` — phase/integration coverage.

Architecture direction:

```text
Desktop / External Boundary
        ↓
Application Orchestration
        ↓
Domain + Contracts
        ↓
Infrastructure Adapters
```

Exact dependency direction should stay conservative: domain/security rules must not depend on renderer concerns, and privileged host behavior must remain behind validated boundaries.

---

## 3. Connection Architecture

### SUD_D v1

```text
ChatGPT
→ OpenAI Secure MCP Tunnel
→ tunnel-client
→ stdio
→ SUD_D MCP Gateway
→ Tool Kernel
→ Policy
→ Approval
→ Execution
```

Current connection direction:

- Provider: `openai_secure_mcp_tunnel`
- Transport: `stdio`
- Preserve a `ConnectionProvider` abstraction so future providers can be added without weakening current boundaries.

### Current device model

- primary validation device uses its own Secure Tunnel.
- secondary validation device uses its own Secure Tunnel.
- Secure Tunnel setup is performed once per machine.
- SUD_D Desktop hides profile/key/path/CLI complexity from normal UX.
- primary validation device and secondary validation device are independent local devices at this stage.

Conceptual device state:

- `deviceId`
- `deviceName`
- `provider`
- `connectionStatus`
- `activeWorkspace`

### Not implemented now

- GitHub OAuth
- SUD_D Cloud
- Cloud Relay
- Account Sync
- Cloud Device Registry

Do not build cloud infrastructure in the current roadmap phase.

### Current product decision

Cloud Relay, cloud Device Registry/discovery and cloud Work Memory synchronization are not currently planned. Git commit/push/pull provides project continuity between the owner's Windows machines; connection credentials and runtime state remain local to each device. Existing provider seams do not make cloud services an active requirement.

---

## 4. M0 — Connection Foundation

### M0.1 — Contracts + State Model

**STATUS: COMPLETE**

Delivered foundation includes:

- typed connection/runtime state model
- fail-closed transition rules
- provider/transport contracts
- component status/error contracts
- strict lifecycle input schemas
- transition and contract tests

M0.1 intentionally does not implement credential persistence, process supervision, tunnel integration, MCP Gateway runtime, privileged tools, or Connection UI.

### M0.2 — Non-secret Config + Credential Boundary

**STATUS: COMPLETE**

Purpose: establish a safe boundary between ordinary connection configuration and secret credential material before lifecycle orchestration begins.

Direction:

- Keep non-secret connection configuration separate from credentials.
- Preserve provider-independent boundaries where practical.
- Renderer must never receive plaintext credentials.
- Credentials must not leak into normal config serialization, logs, audit events, IPC DTOs, or error messages.
- Missing/invalid credential state must fail closed.
- Preserve current `openai_secure_mcp_tunnel` + `stdio` scope.
- Do not add cloud identity, cloud relay, account sync, or privileged MCP tools.

### M0.3 — ConnectionService + Test Doubles

Introduce lifecycle orchestration behind interfaces with deterministic test doubles. Keep provider/process specifics behind adapters.

### M0.4 — Inert MCP Gateway

- MCP connection only.
- No privileged tools.
- Validate lifecycle and transport boundaries before tool exposure.

### M0.5 — OpenAI Secure Tunnel Adapter

Add the concrete tunnel-client / OpenAI Secure MCP Tunnel adapter while preserving the provider abstraction.

### M0.6 — Desktop Connection + Overview UI

Expose safe lifecycle/status controls through Desktop UI without exposing credentials or CLI complexity.

### M0.7 — Doctor + Activity Integration

Integrate connection health/status into Doctor and auditable Activity surfaces.

### M0.8 — End-to-End Connection Acceptance

Verify the complete connection path from ChatGPT through Secure Tunnel to the inert/safe SUD_D runtime before moving into privileged tool milestones.

Post-M0.8 Secure Runtime API Key Setup and Connection UI/UX Simplification are complete; see `SUD_D_HANDOFF.md` for current execution evidence.

---

## 5. Accelerated Personal Alpha Roadmap

SUD_D is currently personal-first: one primary Windows user with approximately one occasional tester. Personal Alpha, Work Memory, and Team Mode MVP V3 are implemented. The current phase is post-MVP dogfooding, owner feedback, and bounded hardening while keeping the core security boundary intact.

### Implemented — Git Bootstrap + Branch + Remote Sync

The implemented Product Owner-approved design is [Git Bootstrap + Branch + Remote Sync Design](docs/superpowers/specs/2026-09-14-git-bootstrap-branch-remote-sync-design.md), with its sequence in [Git Bootstrap + Branch + Remote Sync Implementation Plan](docs/superpowers/plans/2026-09-14-git-bootstrap-branch-remote-sync.md). Current production includes the bounded bootstrap, branch, remote, fetch/sync/push/clone workflow; verification history lives in the handoff.

Durable scope:

- repository bootstrap, local branch workflow, **Sync from GitHub**, and **Push to GitHub** remain core;
- GitHub HTTPS and SSH are the only v1 network Git transports/host scope;
- Primary Remote is resolved from trusted repository state/user choice and is not hard-coded to `origin`;
- Primary / Default Branch is resolved from trusted Git state and is not hard-coded to `master` or `main`;
- existing linked-worktree compatibility remains, while user-facing worktree create/list/remove lifecycle is deferred;
- creating a GitHub repository from SUD_D remains deferred;
- Network Git remains fixed-purpose behind Kernel / Policy / Approval / Audit; generic Network DENY, credential secrecy, and no-shell/no-force/no-auto-rebase rules remain intact.

Detailed behavior, error states, authentication, safety rules, UI, and verification live in the design spec rather than this roadmap.

The completed foundation below is historical context. The approved post-MVP phases that follow govern new work rather than the historical milestone numbers:

```text
Connection Foundation + Connection UX COMPLETE
→ M1 Tool Execution Kernel COMPLETE
→ Personal Alpha Workspace File Tools: Read / Search / Write COMPLETE
→ Git Safety + Integration COMPLETE (including bounded network Git)
→ Basic Approval COMPLETE
→ Milestone B CLOSED (Managed Serena Runtime Foundation)
→ Semantic Read COMPLETE
→ Semantic Write COMPLETE
→ Restricted Verify COMPLETE
→ Work Memory / Automatic Resume MVP COMPLETE
→ Team Mode MVP V3 COMPLETE
→ Windows installer + signed in-app updates COMPLETE
```

This acceleration changes sequencing and scope, not the security architecture. No capability may bypass the Tool Kernel, Policy, Approval where applicable, workspace boundary, audit, or secret rules.

### Approved Post-MVP Order — Product Owner decision (2026-10-05)

**Historical sequencing for new work after 2026-10-13:** The active Personal AI Work Harness / Trusted Execution design priority at the top of this file supersedes the former Parallel Coding-first order. The old sections remain useful background for their own previously recorded scope and gates; they do not authorize implementation or prove a Trusted Local execution boundary.

Direction approval is not implementation authorization. Each phase needs its own explicit task; Parallel Coding requires an approved architecture specification before implementation. v1.0.6 Phase 1 is published; installed-app owner acceptance is the current closure checkpoint. No subsequent phase is authorized.

**Restricted Project Runner P0c — owner-authorized production slice (2026-10-07):** P0b Windows containment feasibility is accepted from the recorded real-OS AppContainer/Job/filesystem/network/process evidence. P0c is authorized for the smallest offline Node production slice. Aggregate writable-output/disk budget remains a mandatory P0c production-exposure gate and is not proven by P0b; `runner.start` stays unavailable until that budget and all other P0c security invariants are proven in the production path. This authorization grants no Network, secrets, generic shell, P0d Work Memory integration, Parallel Coding, package/release work, or automatic commit/push.

**P0c.1 design-only review (2026-10-07): OUTPUT BROKER DESIGN BLOCKED.** Direct runner-writable host output is rejected. The broker candidate can bound its accepted logical artifact bytes, but sole persistent-writer authority and physical/global retained-storage bounds are not established. Next prerequisite is a separately authorized no-persistent-write/capacity-bound feasibility or stronger-isolation decision; no P0c.1 implementation starts from this review. P0b PASS and runner.start UNEXPOSED remain unchanged. Details belong in the [existing runner spec](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#p0c1-bounded-artifact-output-broker--architecture-review) and [plan](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#p0c1-broker-candidate--blocked-before-implementation), not a new milestone or reordered post-MVP roadmap.

#### Phase 0 — Current closure

**P0c.5 design prerequisite (2026-10-07): OS-SEPARATED CONTROL AUTHORIZATION DESIGN BLOCKED.** Resolve trusted automatic confirmation before P0c.4 helper feasibility and P0c.3 retry. Dedicated low-privilege service ownership of Runner Kernel/Policy/Approval/admission is the recommended direction; separate account/session is permitted for design comparison only, with existing-account normal use, no manual switching and automatic installer/runtime management. No supported complete review route is selected yet. [Current contract](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#p0c5-os-separated-control-authorization--design-blocked), [design gate/contingent proof](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#p0c5-control-authorization-prerequisite--blocked-not-authorized-to-run). No account/service/machine changes or Serena spike authorized; subsequent Serena prompts prohibit Remote Commander. Post-MVP order and OS policy unchanged; runner.start UNEXPOSED.

**P0c.4 design-only prerequisite (2026-10-07): PRIVILEGED HELPER DESIGN BLOCKED.** P0c.3 Work-PC spike stopped at privileged-management preflight without creating VM/storage/helper resources. Before retry, resolve the application-specific authorization identity of an unprivileged client against another same-user process, acknowledge administrative Hyper-V TCB authority, and prove independent finite termination. Virtual-account Windows Service plus separate watchdog is a conditional recommendation, not installation or production approval. [P0c.4 contract](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#p0c4-privileged-execution-channel--design-blocked), [prerequisite/contingent plan](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#p0c4-privileged-channel-prerequisite--blocked-not-authorized-to-run). P0b PASS; P0c/P0c.1/P0c.2 BLOCKED; P0c.3 BLOCKED at preflight; runner.start UNEXPOSED. Post-MVP order and OS support policy are unchanged.

**P0c.3 design-only decision (2026-10-07): STRONG STORAGE ISOLATION SELECTED for later feasibility only.** P0c.2 actual AppContainer profile/private-registry persistence is BLOCKED. A full Hyper-V Windows guest with fixed whole-guest disk, finite host-owned pool and bounded AF_HYPERV return is selected for a separately authorized Serena spike before any P0c broker/runtime production integration. Owner must review virtualization/one-time setup, privileged helper and fixed image/storage/RAM costs; complete host auxiliary capacity and crash-supervision proof are mandatory. P0b PASS; P0c/P0c.1/P0c.2 BLOCKED; runner.start UNEXPOSED. This changes only the prerequisite isolation sequence, not post-MVP order or global Windows support policy. Details: [existing spec](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md#p0c3-strong-storage-isolation--selected-for-feasibility-only), [plan](docs/superpowers/plans/2026-10-06-restricted-project-runner.md#p0c3-dedicated-serena-feasibility-plan--not-authorized-to-run).

Complete owner acceptance of the installed Team opt-in fix: no active mission plus no explicit Team request means Normal Mode. Each new mission requires manual user approval in SUD-D, including in Full Access mode; an explicit Team request followed by approval must start sequential Team normally. The owner reported v1.0.3 instruction-only opt-in failed; current repair/release evidence belongs in the handoff. This closes existing behavior, not a new feature milestone.

#### Phase 1 — Connection Auto Recovery / Auto Restart — manual initial Connect only

Product Owner decision (2026-10-05): Auto Start is removed from product direction. Every fresh app session stays disconnected until the user explicitly presses Connect. Phase 1 implements bounded recovery only for unexpected managed-runtime failure inside that manually started, session-local connection intent, with cancellation on Disconnect, shutdown or Restart & Update. Existing profile values are preserved; newly created profiles default Auto Recovery ON while `autoStart=false`, and this never auto-connects on launch. Architecture-approved design and implementation details are in [Connection Auto Recovery design](docs/superpowers/specs/2026-10-05-connection-auto-recovery-design.md) and [implementation plan](docs/superpowers/plans/2026-10-05-connection-auto-recovery.md). Owner real-app smoke and final repair/focused re-review passed. Owner-authorized commit `8a962e3` / release `v1.0.6` is published with Windows CI and public signature/hash/download verification PASS; installed-app acceptance remains pending. Keep the fixed-purpose connection lifecycle, Secure Tunnel and credential boundaries; the renderer cannot select executable, argv, cwd or env.

#### Phase 2 — Parallel Coding Team architecture / design

The next major capability after the small connection improvement is explicitly requested **Parallel Team** for coding. The current user-opened ChatGPT conversation automatically becomes the **Requirement / Lead Chat**; the user need not request or configure a separate Lead role. Users manually open Worker Chat A/B/C. SUD_D does not create ChatGPT conversations or add an OpenAI API/model runtime for this Personal Alpha approach.

The Lead understands project requirements, inspects repository truth, splits bounded Tasks, identifies dependencies and truly independent work, sets scope/likely paths/do-not-touch boundaries and verification criteria, then coordinates integration, verification and final review. It acts as a Worker only for an explicit Integration Task.

```text
User → Requirement / Lead Chat → dependency-aware Tasks
→ SUD_D Task Queue → manually opened Worker Chats A/B/C
→ structured Task Results → Lead integration
→ integrated verification → final review → Final Result
```

Script/content production does not currently need Parallel Team orchestration: independent ChatGPT chats for Channel A/B/C can produce independent outputs. The design targets coding dependencies and integration first.

#### Phase 3 — Parallel Task coordination

Only after architecture approval, design/implement readiness and a dependency graph; Task claim/lease and worker/session ownership; available / claimed / working / blocked / completed states; safe lease expiry/recovery; and multiple active Tasks within one Team mission. These are proposed concepts, not current V3 states.

No Worker may silently take another Worker's Task. SUD_D mission state coordinates work without a direct Worker-to-Worker chat dependency. Define an explicit evolution of the sequential V3 state machine rather than weakening its existing transitions. Live parallel coding remains gated on Phase 4 isolation.

#### Phase 4 — Internal Task worktree / branch isolation

Internal isolation is a prerequisite for safe Parallel Coding; user-facing Worktree Management UI remains a later convenience. A mission has its main Workspace and each coding Task has an isolated branch/worktree, allowing Workers to change the same repository paths without live filesystem overwrites.

Preserve Workspace containment, Git Safety, Policy / Approval / Audit, and user-owned changes. Use no reset-hard, clean or force shortcuts. This phase does not expose destructive Delete authority.

#### Phase 5 — Task Result and Lead integration

Workers return bounded structured results: Task ID/state, branch/worktree, commit/reference when applicable, changed paths, verification evidence, blockers/findings and dependency/result notes. Repository artifacts and structured SUD_D state carry results; large code blobs exchanged between chats are not the coordination mechanism.

The Lead inspects results, releases newly unblocked Tasks, integrates in dependency order, handles merge conflicts explicitly, runs integrated verification, performs final review and produces the Final Result.

Review Work Memory for parallel ownership: the existing single Workspace current checkpoint must not let Worker A overwrite Worker B's continuation. Reuse Mission/Task/Handoff concepts rather than creating a second memory system. The approved spec must establish this boundary before concurrent Worker execution.

#### Phase 6 — Computer Use

Approved later major capability after Parallel Coding is stable. Execution must follow SUD_D capability → Tool Kernel → Policy → Approval where required → Execution → Audit. Desktop/browser control grants no security bypass or generic uncontrolled host authority.

### Later — Only when usage justifies it

- Restricted Project Runner / Self-Development expansion beyond Restricted Verify.
- Full Recovery and Safe Delete / recoverable destructive mutation. Both remain required before exposing Delete; they do not block isolated Parallel Coding while Delete stays unavailable.
- Self-contained uv bootstrap for clean-machine Serena setup. For the current small Windows user base, installing trusted uv once per new machine is acceptable; SUD_D already manages pinned Python/Serena thereafter. Revisit when onboarding friction justifies self-provisioning.
- Controlled Serena update/rollback and Team Presets.
- User-facing GitHub repository creation and general Worktree Management UI; internal Task isolation has the separate prerequisite priority above.
- Direct production `client_connected` wiring: trusted MCP-activity reconciliation is sufficient now. Revisit only if dogfooding demonstrates a real Waiting-for-ChatGPT problem.

### Not currently planned

Cloud Relay, cloud Device Registry/discovery, cloud/cross-device Work Memory sync, provider/model-selection runtime, macOS/Linux support and enterprise/multi-user architecture are outside the active implementation path. Git remains the accepted cross-device project mechanism; local Work Memory remains per-device. Parallel Coding's use of manually opened chats does not require independent/background model runtimes or a general scheduler.

### M1 — Tool Execution Kernel

Create the central typed execution path through which future tools must pass.

M1 is complete. Its typed request/result, policy/classification, execution dispatch, audit, and fail-closed seams remain the foundation for later capabilities.

### Personal Alpha File Tools — Read / Search / Write

This near-term slice combines the original M2 read-only goal with a deliberately narrow early portion of file mutation so SUD_D becomes useful for real project work sooner.

Implemented capabilities:

- list
- read
- stat
- search
- create file
- update/write file

Rules for the Personal Alpha slice:

- all paths remain workspace-bound and audited
- outside-workspace and InternalRoot remain denied
- no delete capability
- no destructive rename/move semantics unless separately approved
- no arbitrary process or network capability
- writes must use the Tool Kernel and policy path rather than direct renderer/filesystem access
- Git-backed project workspaces are the preferred Personal Alpha safety model; the latest committed repository state is an accepted temporary rollback baseline for early real-world testing
- this temporary Git safety model does **not** replace the planned full Recovery engine

### Git Safety + Integration — Pulled Forward

Git is promoted ahead of full Recovery because it provides high value for a personal development workflow: inspectable diffs, checkpoints, repository state, and a practical rollback baseline for committed project files.

The implemented local-first slice includes detection, status, diff, checkpoint/commit and bounded bootstrap/branch/remote workflows. Fixed-purpose GitHub network operations are also implemented; generic network authority remains denied.

Git operations must use the same Kernel / Policy / Approval / Audit model. Network Git operations such as push/fetch remain separate from local repository operations and must not silently bypass the default Network DENY policy.

Git is an **Alpha recovery aid**, not a complete recovery guarantee. Untracked files and uncommitted changes may not be recoverable from Git; full Recovery is usage-driven later scope and remains a gate before destructive Delete.

### Basic Approval — Pulled Before Full Recovery

Implemented: pending requests, trusted Desktop Approve / Deny, exact retry binding and one-time grants for protected Personal Alpha actions.

The goal is not a generalized enterprise approval system. It is a simple, reliable user boundary for actions whose policy is ASK, especially restricted process execution and later sensitive Git/file operations.

### Restricted Verify — Early Team Mode Prerequisite

Implemented: `verify.run` supports fixed/validated test, lint, typecheck, build, diff_check, and secret_scan actions with their existing Policy / Approval decisions. It does not implement general shell or project packaging/release actions.

The Restricted Verify slice must remain narrow:

- no unrestricted or general shell surface
- no renderer-controlled arbitrary executable, argv, cwd, or env
- prefer fixed/validated verification actions such as test, lint, typecheck, and build
- preserve Policy / Approval where applicable, bounded safe output/error handling, and audit
- no generic process manager surface

General shell / broader Execute remains outside the critical path unless separately approved.

### Restricted Project Runner / Self-Development — P0c offline slice authorized; broader expansion usage-driven

The Product Owner authorized the minimal offline P0c Restricted Project Runner production slice on 2026-10-07 after accepting P0b containment feasibility. Production exposure remains fail-closed: `runner.start` is unavailable until the aggregate writable-output/disk budget and the complete P0c security gate pass. Broader runner actions still require demonstrated usage need and separate explicit authorization.

Durable intent:

- user commands continue to come through normal SUD_D chat/agent workflows; no separate CLI-first user workflow is required;
- reuse/extend the existing Restricted Verify path where practical rather than creating a parallel execution subsystem;
- support the project-declared development actions actually needed for self-development, starting from existing verification actions and bounded packaging/release-candidate actions such as the repository's `package:win` workflow;
- keep execution Workspace-bound, audited, and behind Tool Kernel / Policy / Approval where applicable;
- do not expose caller-controlled arbitrary executable, argv, cwd, env, shell, raw command text, or generic process authority;
- the goal is installed SUD_D -> open SUD_D source Workspace -> edit -> verify/build/package -> Git, while preserving the existing security architecture.

This is an approved capability direction, not authorization to implement a general shell. Exact command allowlisting, project-profile discovery, packaging approval semantics, and UI belong in a separately authorized design/implementation task.

### Incremental Production MCP Exposure

Production MCP exposure is no longer treated as one monolithic late gate. Approved capability slices may be exposed incrementally **only after their own required Kernel/Policy/security/verification gates pass**.

This allows the Personal Alpha to become useful earlier without exposing Delete, unrestricted Execute, secrets, outside-workspace access, or unfinished future capabilities.

### Team Mode MVP — Primary Product Target

Implemented and verified: Team Mode V3 uses one connected AI session with sequential logical Planner / Worker / Validator / Reviewer roles, bounded Tasks/rework, persisted state, and atomic Team/Work Memory/audit transitions. New missions require an explicit user Team request; existing active missions resume through `work.resume` / `team.status`. Task complexity alone does not authorize `team.start`.

The MVP should prove the North Star flow:

```text
User Goal
→ SUD_D coordinates a small AI team
→ team plans / works / verifies / reviews
→ all tool use stays behind SUD_D security boundaries
→ artifacts + final result return to the user
```

Team Mode MVP does **not** require full Delete/Recovery, generic Execute, installer polish, cloud sync, cross-platform support, or enterprise orchestration features. Capabilities not yet implemented remain unavailable to Team Mode rather than being bypassed.

### Retained post-MVP boundaries

The implemented MVP does not grant additional authority. Apply the approved post-MVP phases above; retain these boundaries:

- arbitrary/general shell and broader Execute
- full Safe File Mutation + Recovery engine
- Safe Delete semantics and recoverable delete
- Serena auto-update / unattended runtime promotion
- Computer Use only after stable Parallel Coding under Phase 6
- further packaged distribution polish (Windows installer and signed in-app updates are implemented)
- cross-platform support and enterprise/multi-user architecture are not currently planned
- non-critical UI polish

Prioritize real-world dogfooding after Team Mode MVP; promote later hardening when usage demonstrates the need.

### Current Capability Classification

This inventory distinguishes shipped bounded tools from approved future directions; current evidence and owner acceptance belong in the handoff. None of the future items below authorizes implementation in the current task.

| Status | Capability / boundary |
| --- | --- |
| Implemented / Complete | Workspace read/search/create/write; Tool Kernel / Basic Approval / Audit; local and bounded GitHub Git workflows; managed Serena 1.7.0 lifecycle/repair and semantic `code.*`; Restricted Verify; local Work Memory; sequential Team Mode V3; Windows installer and signed in-app update. |
| Published / installed owner acceptance pending | Phase 1 Connection Auto Recovery / Auto Restart with manual initial Connect only (Auto Start rejected), bounded 1s/3s/10s retries, 60-second stability reset, credential-revision invalidation and fail-closed shutdown/update handling. Owner smoke and final repair/focused re-review passed; `v1.0.6` publication, Windows CI and public asset verification PASS. |
| Approved, not implemented — ordered | Design-first Parallel Coding Team with coordination, internal Task isolation and Lead integration; Computer Use after stable Parallel Coding. Each requires its own explicit task and gates above. |
| Authorized / foundations preserved, execution blocked | Restricted Project Runner P0c offline Node foundations; P0c.1/P0c.2 BLOCKED. P0c.3 full Hyper-V/fixed whole-state storage candidate SELECTED for later owner-authorized feasibility only; aggregate host/guest storage and all P0c gates remain unproven. runner.start UNEXPOSED. |
| Later / usage-driven | Restricted Project Runner expansion beyond P0c; full Recovery / Safe Delete; self-contained uv bootstrap; controlled Serena update/rollback; Team Presets; user-facing GitHub repository creation / Worktree UI; direct production client-connected signal. |
| Blocked | Restricted Execute / general process execution: sandbox enforcement was not proven on the secondary device. No generic shell or unsandboxed fallback is exposed. Fixed-purpose Restricted Verify is implemented independently. |
| Not currently planned | Cloud Relay / device discovery / Work Memory sync; provider/model-selection runtime; macOS/Linux; enterprise/multi-user architecture. A general scheduler/background model runtime is not required for the approved manually opened chat approach. |

`autoStart` remains an inert compatibility field and never starts a connection. Persisted `autoRestart` now drives same-session Auto Recovery only after manual Connect; existing values are preserved and new profiles default it ON without granting startup intent. The tunnel has a client-signal port, but production wiring is absent; client absence is not a recovery trigger and this limitation does not invalidate the owner's real ChatGPT connection acceptance on Home and Work. Managed Serena can provision its pinned version through an available trusted `uv`; it is not a self-contained bootstrap on a machine without `uv`. Model instructions guide explicit Team requests; the Kernel additionally requires manual user approval before each new mission. This grants no authority to infer user intent from a prompt.

### Privileged capability gate

The privileged path remains:

```text
MCP Gateway → Tool Kernel → Policy → Approval → Execution → Audit / Recovery
```

Incremental Alpha exposure may use only the capabilities whose own gates are ready. Delete stays unavailable until its recovery semantics are implemented. Execute stays ASK and restricted until a later approved expansion. Team Mode receives no direct filesystem/process/network privileges and can only use capabilities SUD_D has safely exposed.

---

## Team Mode / Agent Orchestration — Implemented MVP and Future Expansion

**STATUS: MVP V3 IMPLEMENTED; BROADER ORCHESTRATION REMAINS FUTURE SCOPE.**

Team Mode is the orchestration layer above SUD_D's secure execution foundation. The current V3 MVP coordinates sequential logical roles through one connected AI session and produces inspectable artifacts/results. Future Parallel Coding uses one Requirement / Lead Chat and manually opened Worker chats, with design-first sequencing in Section 5; it is approved but not implemented. Presets remain usage-driven later scope.

### Core Team Model

```text
User
 ↓ Goal
SUD_D Team Mode
 ↓
Lead / Orchestrator
 ├─ Planner
 ├─ Worker / Specialist
 ├─ Tester / Validator
 ├─ Reviewer
 └─ Handoff / Memory
        ↓
     Workspace / Artifacts
```

For a future Software Development preset, the conceptual roles are:

```text
Lead / Orchestrator
 ├─ Planner
 ├─ Developer
 ├─ Tester
 ├─ Reviewer
 └─ Handoff / Memory
```

The Lead / Orchestrator coordinates work; it is not a security superuser. The implemented V3 workflow is Planner → Worker → Validator → Reviewer. The broader role diagrams and preset examples describe future expansion.

### Domain-Agnostic Presets

Team Mode must not be coupled to software development. Future Team Presets may include:

- Software Development
- Podcast Production
- Research
- Content Writing
- Custom Team

A future Podcast Production preset might express this flow:

```text
User Brief
→ Lead / Orchestrator
→ Brief Analyst
→ Research Agent
→ Script Writer
→ Editor
→ Fact Checker
→ QA Reviewer
→ Final Script
```

These examples establish domain independence only; preset definitions and workflows are deferred.

### Conceptual Orchestration Vocabulary

The current model implements Goal, Task, logical Role, checkpoint/Work Memory, handoff, findings and Final Result. The vocabulary below also includes future extensions; it is not a claim that presets, independent agents or a scheduler exist:

- Goal
- Task
- Subtask
- Agent Role
- Team / Team Preset
- Work Queue
- Artifact
- Checkpoint
- Work Memory / Automatic Resume
- Task History
- Review Result
- Approval
- Tool Access
- Agent Status
- Handoff
- Final Result

### Secure Execution Boundary

Team Mode sits above, and never bypasses, the existing privileged path:

```text
Team / Agent
→ SUD_D Tool Interface
→ Tool Kernel
→ Policy
→ Approval
→ Execution
→ Audit / Recovery
```

Every role, including the Lead / Orchestrator, uses this same path. Agent roles do not gain direct filesystem or process access, bypass Policy or Approval, gain privilege through coordination status, or send arbitrary executable, `argv`, `cwd`, or `env` through the renderer.

Capabilities that are deferred at Team Mode MVP—especially Delete and broad Execute—remain unavailable rather than being implemented through a shortcut.

### Serena's Role

Target product experience: Serena behaves like a built-in SUD_D coding dependency rather than something the user installs, configures, starts, or repairs manually. SUD_D owns Serena install/provisioning, the reviewed version pin, managed config, start/stop lifecycle, health, and repair behind the SUD_D control plane.

Internally Serena remains a pinned SUD_D-managed runtime behind fixed SUD_D `code.*` mappings and the normal capability/security boundary. Do not fork, copy, or vendor Serena source into SUD_D merely to make the integration appear built in.

Serena remains a specialist capability rather than a universal Team Mode dependency. A future Software Development team may choose either or both specialist paths:

```text
Developer Agent
 ├─ SUD_D native code tools
 └─ Serena-backed semantic code tools
```

Non-software presets such as Podcast Production and Research do not require Serena.

### Approved Capability Vision

The approved product direction is goal-based orchestration: the user supplies a Goal and constraints; SUD_D plans, coordinates, verifies, and advances the work until the Goal is complete or a user approval/stop condition is reached.

- **Multi-agent handoff** uses the shared Goal / Task / Checkpoint / Artifact / Decision / Handoff model. Team Mode must not invent a parallel continuity system.
- **Cross-chat continuation** is provided by Work Memory / Automatic Resume and its bounded Workspace-scoped Resume Context.
- **Automatic result-checking and next-step dispatch** belong to the Lead / Orchestrator: inspect results, decide the next Task, dispatch it, and repeat within the approved constraints.
- **Files / code / test / Git work** uses SUD_D secure tools, with Serena-backed semantic coding capabilities where appropriate.
- **Computer Use** is an approved future browser/desktop-control capability direction. It must enter through SUD_D capability, Tool Kernel, Policy, Approval, and Audit boundaries and is not required before Team Mode MVP unless separately approved.
- **Sensitive actions** remain governed by SUD_D Policy / Approval. Agent role, Serena capability, Computer Use, or orchestration status never grants bypass authority.

Durable North Star:

```text
User gives Goal
→ SUD_D Orchestrator plans/coordinates
→ selects appropriate agent/tool/Serena/Computer Use capability
→ executes through Tool Kernel / Policy / Approval / Audit
→ verifies results
→ dispatches the next step
→ stores bounded Work Memory/checkpoints
→ returns Final Result to the user
```

### User and Harness Responsibilities

The user should primarily define the Goal or Brief, set constraints, approve sensitive actions, and review the Final Result. SUD_D should own planning, delegation, coordination, verification, handoff, and progress tracking within those constraints.

### Relationship to the Secure Core

M0 plus the accelerated Personal Alpha foundation in Section 5 are the required near-term base for Team Mode MVP. Team Mode depends on the Workspace Boundary, Tool Kernel, Policy, Basic Approval, Audit, workspace file tools, Git safety, Restricted Verify, Work Memory / Automatic Resume, and MCP/runtime foundations that are actually available at that time.

Full Recovery, Safe Delete and broader Execute remain later scope under Section 5, with no authority available until their gates pass. Windows installer/updates are implemented; cross-platform support is not currently planned. None was required for the first sequential Team Mode experiment.

For Git-backed Personal Alpha projects, the latest committed repository state is accepted as the temporary rollback baseline during early testing. This does not change the long-term requirement for recoverable destructive actions and does not authorize Delete before the full recovery design is implemented.

### Approved vs Deferred

**Approved:**

- Team Mode / Personal AI Team Harness is the primary product North Star.
- Team Mode MVP V3 and its Personal Alpha prerequisites are implemented; current work is dogfooding and bounded fixes.
- Orchestration is domain-agnostic: user goal → team → artifacts and results.
- The secure SUD_D core remains the execution boundary for every agent role.
- Serena is optional and is not a required core runtime dependency.
- Full Recovery/Delete and broad Execute may follow the first Team Mode MVP rather than blocking it.

**Approved future direction; not implemented by the V3 MVP:**

- Parallel Coding design, dependency-aware coordination, internal worktree isolation and explicit Lead integration/conflict handling, in Section 5 order.
- Computer Use after Parallel Coding is stable.
- Team Presets and further orchestration UI only when usage justifies them; current Desktop Team status/stop UI is implemented.

Independent/background model runtime and a general scheduler are not required by the approved chat approach. Model/provider selection and cloud Work Memory sync are not currently planned.

---

## 6. UI / UX Direction

Use UI references the user likes as inspiration only. Do not copy branding or UI 1:1.

### Style

- simple
- status-first
- card based
- light neutral background
- white rounded cards
- clear spacing
- non-technical by default

### Status colors

- green = connected / safe
- amber = Ask / approval required
- red = Deny / Error

### Main navigation

- Overview
- Workspaces
- Connection
- Activity
- Security
- Recovery
- Environment / Doctor

### Overview content

- This Device
- Connection status
- Active Workspace
- Security summary
- Pending Approval
- Recent Activity
- Recovery

### Normal UX

```text
Open SUD-D
→ Choose Workspace
→ Set up Runtime API Key
→ Set up Secure Tunnel
→ Connect ChatGPT
→ AI works inside allowed workspace
```

### Approval UX

```text
AI requests protected action
→ notification/card
→ Approve / Deny
```

Normal users should not need to manage tunnel profile names, keys, executable paths, or CLI commands. Advanced diagnostics may expose safe technical metadata when needed.

---

## 7. Work Memory / Automatic Resume

**IMPLEMENTED — Workspace-scoped resume/checkpoint and guarded session bootstrap.**

Work Memory / Automatic Resume is the implemented continuity foundation used by Team Mode V3. A new ChatGPT conversation can connect and resume bounded Workspace state without copying the previous chat. SUD_D owns continuation state; ChatGPT and Serena are not authoritative memory stores.

The intended flow is:

```text
New ChatGPT conversation
→ connect to SUD_D
→ call work.resume (required before substantive project work)
→ load bounded Resume Context for the active Workspace
→ validate live Workspace/Git state
→ continue unfinished work
```

The bootstrap/resume contract is product-owned and authority-neutral:

- expose an idempotent session/workspace bootstrap/resume capability;
- instruct a new AI session to bootstrap before substantive project work;
- resolve the active Workspace and return bounded Resume Context when unfinished work exists;
- where practical, fail project-scoped privileged work closed until the current session/Workspace has bootstrapped;
- require a fresh bootstrap when the active Workspace changes;
- never grant additional Tool Kernel / Policy / Approval / Audit authority;
- never require raw ChatGPT conversation transcripts or a ChatGPT conversation ID as the source of truth.

Minimal Resume Context remains bounded structured state per Workspace, not one global memory pool: Goal, current Task/status, Completed work, important Decisions, Blockers, Next Action, relevant Artifacts/changed paths, verification evidence summary, Git/checkpoint reference when available, and updated timestamp.

Use both automatic state derived from SUD_D tool/task activity where reliable and explicit checkpoints at meaningful boundaries. Checkpoints stay operational: Current Task / Completed / Decisions / Blocker / Next Action / Evidence.

Team Mode must reuse this same state model rather than create a second memory system. Shared concepts include Goal, Task/Subtask, Checkpoint, Artifact, Decision, Task History, Handoff, and Final Result.

Work Memory remains local per-device; cloud synchronization is not a current product requirement. Git commit/push/pull plus repository handoff provides cross-device development continuity. Parallel Task ownership and continuation must be reviewed under Section 5 before concurrent Workers are enabled. `.serena/` remains local tooling state, not project memory.

Durable architecture contract: `docs/superpowers/specs/2026-09-04-automatic-work-resume-architecture-decision.md`.

---

## 8. Multi-device Direction

Device concept:

- `deviceId`
- `deviceName`
- `provider`
- `connectionStatus`
- `activeWorkspace`

### Current

primary validation device and secondary validation device are independent local devices. Each manages its own Secure Tunnel connection and local state.

Project continuity uses Git commit/push/pull. Local Work Memory, credentials and connection/runtime ownership remain per-device. Cloud Relay, Device Registry/discovery and cloud Work Memory sync are not currently planned; any future change needs a new Product Owner decision and security review.

---

## 9. Design Principles

- local-first
- personal-first and fast to usable Alpha
- secure by default
- fail closed
- least privilege
- recoverable destructive actions
- auditable
- provider-independent where practical
- UI hides technical complexity
- security boundaries must not depend on UI
- renderer must not receive plaintext credentials
- defer enterprise-scale complexity until demonstrated need

---

## 10. Document Responsibilities

### `SUD_D_ROADMAP.md`

Owns:

- long-term architecture
- milestones
- product direction
- approved future ideas
- milestone sequencing and security gates

This file is the long-term Master Plan / Source of Truth for approved product direction.

### `SUD_D_HANDOFF.md`

Owns:

- current milestone
- current status
- completed work
- verification
- open issues
- immediate next action
- latest completed milestone commit

Do not duplicate the entire roadmap in the handoff. Link back to this file instead.

---

## 11. Change Control

- New implementation should map to an explicit milestone or approved accelerated capability slice before work begins.
- Section 5's approved post-MVP phases govern new execution priorities; completed historical milestone numbers remain useful capability labels.
- Security gates may become stricter without weakening the architecture; weakening them requires explicit architecture review.
- Deferring Full Recovery/Delete does not authorize destructive file operations before those gates are ready.
- Approved future directions require separate explicit tasks; excluded cloud/platform/model-runtime ideas are outside the active path.
- When roadmap and handoff differ, use `SUD_D_ROADMAP.md` for long-term direction and `SUD_D_HANDOFF.md` for current execution state.
