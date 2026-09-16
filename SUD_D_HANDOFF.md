# SUD_D Handoff

## Simple Git Workflow — Ready for Product Owner Acceptance (2026-09-16)

**Status: focused implementation and automated verification are complete on `feat/simple-git-workflow`; Product Owner manual acceptance remains. No merge or remote push has been performed.**

Changed:

- Git Desktop normal surface now shows active Workspace, current/safe local branch selector, concise status, `Get latest`, and `Commit & Push`.
- Create/merge/delete branch and remote configuration/selection controls are removed from the normal renderer surface; the existing fixed-purpose backend/tool capabilities remain available to ChatGPT/SUD-D.
- Existing trusted Git behavior is reused unchanged: deterministic tracking → persisted → sole safe remote resolution, bounded auto-commit for ordinary changes before Sync/Push, same-name no-upstream Push with verified upstream recording, and existing fail-closed Git/network/security boundaries.
- Approval-required Git actions still route to Activity. Automatic resume after approval is intentionally deferred because the current approval coordinator consumes approval on the next materially identical request; resuming the pending renderer action would require broader approval-action orchestration than this UX task authorizes.

Focused verification:

- Desktop Git focused test: **5/5 PASS** after RED→GREEN.
- Git Workspace service focused regression: **11/11 PASS**.
- `pnpm typecheck`: **PASS**.
- `pnpm build`: **PASS**.
- Impeccable detector: invoked once as required; Serena output exceeded its capture ceiling, so do not claim a clean detector result.

Immediate next action: Product Owner manual test of harmless `Commit & Push`, one `Get latest` after a remote change, and branch switching to an existing safe local branch. If accepted, decide separately whether to commit/push/integrate this feature branch under repo rules.

## Quick Git + Chat-first Sync/Push — Patch Ready for Product Owner Acceptance (2026-09-15)

**Status: IMPLEMENTATION AND FOCUSED/CRITICAL VERIFICATION ARE COMPLETE ON `feat/git-quick-actions-chat-first`. Product Owner real Sync/Push/Chat-first acceptance remains REMAINING. `master` is outside this patch and must remain untouched.**

Patch state:

- branch: `feat/git-quick-actions-chat-first`
- base/upstream source branch: `origin/feat/git-bootstrap-branch-remote-sync` at `027dcbfb5b53637aed4d5f14b7804f737492d591`
- `.serena/` remains local-only/untracked and must not be staged or committed
- this patch does not merge, rebase, fast-forward, or push `master`

Delivered behavior:

- `Sync` and `Push` remain fixed-purpose Git actions; no generic Git/process authority was added to the renderer, preload, IPC, or Tool Kernel surface.
- ordinary non-sensitive unstaged Workspace changes remain eligible for Sync/Push and are committed through the existing bounded Git commit adapter before the existing GitHub network mutation.
- default auto-save commit messages are `Save local changes before GitHub Sync` and `Save local changes before GitHub Push`.
- sensitive, staged, conflicted, gitlink/submodule, truncated, detached, unsupported, and non-normal Git states remain fail-closed before approval/network execution.
- Git page UX is chat-first/simple: `Sync` / `Push`, explicit auto-save copy for ordinary local changes, and concise success feedback (`Synced` / `Pushed`).

Verification policy for this personal-first patch:

- Product Owner explicitly changed patch verification policy to focused/affected critical paths plus real Product Owner acceptance; a full suite and heavyweight production smoke are not required when those critical paths are green.
- focused application + Desktop Git tests: **2 files / 16 tests PASS**
- affected bootstrap/security slice: **6 files / 86 tests PASS**
- deterministic GitHub integration: **1 file / 22 tests PASS** in isolation
- lint: **PASS / exit 0**
- typecheck: **PASS / exit 0**
- production build: **PASS / exit 0**
- `git diff --check`: **PASS / exit 0**
- monolithic full-suite attempts showed unrelated/long-running timeout pressure (including Vitest worker timing behavior); isolated failing paths passed, and Product Owner explicitly waived further full-suite reruns for this patch. The final in-progress rerun was stopped under that policy.
- heavyweight production Electron smoke was intentionally not rerun because no focused/affected product failure requires it under the Product Owner policy.

Final security/scope inspection before commit:

- tracked patch scope is limited to Git Workspace orchestration, Git page/CSS, focused service/Desktop tests, plus this handoff update
- no high-signal secret patterns found in added/changed product/test lines
- no renderer `ipcRenderer` / child-process / spawn / exec / argv / cwd / env authority added
- no force/reset/rebase/stash/destructive Git path added by this patch

Product Owner real acceptance: **REMAINING**

- exercise real ordinary-dirty `Sync` and confirm automatic bounded save + safe GitHub sync
- exercise real ordinary-dirty `Push` and confirm automatic bounded save + verified GitHub push
- confirm Chat-first copy/feedback is understandable in the real Desktop flow
- confirm approval behavior remains appropriate for the selected Approval Mode

Closure boundary:

- commit and push only `feat/git-quick-actions-chat-first`
- preserve `.serena/` as local-only
- STOP after feature-branch push; Product Owner will run real acceptance separately before any later master-integration decision


## Git Bootstrap + Branch + Remote Sync — Implementation Verified on Feature Branch (2026-09-15)

**Status: IMPLEMENTATION, SECURITY HARDENING, FINAL AUTOMATED GATES, STANDARDS/SPEC REVIEW, AND PRODUCTION ELECTRON SMOKE ARE COMPLETE ON `feat/git-bootstrap-branch-remote-sync`. Product Owner real GitHub acceptance remains separate and REMAINING. `master` has not been merged, rebased, fast-forwarded, or pushed by this closure work.**

Current branch/state at handoff update:

- feature branch: `feat/git-bootstrap-branch-remote-sync`
- task-start base / current `master` / current `origin/master`: `57c7366aa0e5cd0e21b6a800d857f1fd345a41e3`
- current pre-closure HEAD before Task 11 commit: `d98b2cf9682d2382eed2471c8b5ab3277858f737`
- approved design spec: `docs/superpowers/specs/2026-09-14-git-bootstrap-branch-remote-sync-design.md`
- implementation plan: `docs/superpowers/plans/2026-09-14-git-bootstrap-branch-remote-sync.md`
- `.serena/` remains local-only/untracked and must not be committed
- preserve `stash@{0}: On master: pre-bootstrap Home 2026-09-13 preserve local handoff`

Delivered implementation:

- Domain/contracts/application/infrastructure/Desktop now expose a fixed-purpose Git Workspace flow for repository inspection, initialize, Primary Remote configure/select, branch create/switch/merge/safe-delete, fetch, Sync from GitHub, Push to GitHub, and clone.
- Renderer-visible Git UI is state-first and bounded: it reads snapshots, sends displayed `snapshotId` for mutations, routes Approval Required to Activity, does not auto-retry stale/network operations, and exposes no generic Git/process authority.
- Primary Remote resolution is dynamic: tracking remote, persisted Workspace Primary Remote, sole remote, or missing/ambiguous. Default branch is resolved from trusted Git/remote state and is never hard-coded to `origin`, `main`, or `master`.
- Local workflow guards preserve clean-tree, linked-worktree, protected/default branch, conflict, dirty, stale, diverged, and no-upstream fail-closed behavior. Sync and Push never auto-merge, rebase, reset, stash, force-push, auto-commit, or delete remote branches.
- `github_network` remains a reviewed narrow ASK context; generic `network` remains DENY. Approval Mode may auto-approve only eligible fixed-purpose GitHub operations after Policy/path/state/remote validation.

Security hardening result:

- The original Git config blocker was reproduced: repository-local `url.*.insteadOf` could rewrite a validated GitHub URL to a forbidden host during network Git execution.
- The later TOCTOU blocker was reproduced: preflight-only config checks could pass, then a changed repo config could still redirect the subsequent network Git spawn.
- The final repair runs repository-backed network Git from a trusted temporary bare Git context instead of letting the network spawn read repository-local/worktree config. Fetch writes objects into the trusted workspace object store and imports refs through local hermetic Git; Push stages a verified source ref into the trusted context and reads workspace objects through bounded alternates.
- Unsafe repository/worktree config keys, protected host URL rewrites, protected host `http.curloptResolve`, unsafe includes, proxy/helper/process vectors, and malformed/unknown config scopes fail closed without exposing raw config values or credentials.
- `GIT_COMMON_DIR` is not accepted through the network trusted environment allowlist. Only the final bounded object-store environment required by trusted fetch/push staging remains.
- Production-built TOCTOU probe PASS: injection occurred, output stayed `https://github.com/acme/widgets.git`, and no forbidden host was attempted.

Final verification evidence on the stable runtime source before handoff update:

- integration workflow coverage: **22/22 PASS** via deterministic chunks after the batch runner exceeded Vitest worker/test timing limits
- exact focused aggregate: **15 target files covered** — 14 non-integration files exit 0 plus integration 22/22 chunked exit 0
- `git-bootstrap-network.test.ts`: **39/39 PASS**
- affected security slice: **5 files / 79 tests PASS**
- lint: **PASS / exit 0**
- typecheck: **PASS / exit 0**
- full suite after final env cleanup: **48 files passed / 3 skipped; 630 tests passed / 5 skipped; exit 0**
- production build: **PASS / exit 0**
- `git diff --check`: **PASS / exit 0**
- final Standards review: **PASS**
- final Spec review: **PASS**
- isolated production Electron smoke: **PASS** — production package entry launched with isolated app data, Git page rendered Repository / Branches / Remote Sync, Desktop Git preload bridge exposed only fixed Git methods, bounded Git snapshot returned `ready` and `clean` for a temp fixture Workspace, no renderer process/capability/argv/cwd/env authority was present, no horizontal overflow, and no runtime/log errors were observed

Durable local report pointers:

- `.serena/reports/task11-race-repair-focused-aggregate.md`
- `.serena/reports/task11-final-standards-spec-review.md`
- `.serena/reports/task11-production-electron-smoke.log`

Product Owner real GitHub acceptance: **REMAINING** unless performed separately by the owner:

- Home PC → work/commit → Push
- Work PC → Sync → work/commit → Push
- Home PC → Sync
- one Standard manual-approval path
- one eligible automatic-approval path

Closure boundary:

- Commit and push only `feat/git-bootstrap-branch-remote-sync` after final scope/secret/staged inspection.
- Do not merge, rebase, fast-forward, or push `master` in this task.
- Do not delete the feature branch or start the next milestone from this task.
- Next step after push is a separate Product Owner acceptance / master-integration decision.

## Personal Alpha Stabilization — Closure at STOP Condition (2026-09-13)

**Status: STABILIZATION IMPLEMENTATION VERIFIED TO THE APPROVED STOP CONDITION — no SUD-D repo commit/push has been made.**

Active specification: `docs/superpowers/specs/2026-09-13-personal-alpha-stabilization.md`.

Current branch/state:

- branch: `wip/personal-alpha-stabilization`
- HEAD: `ea15337fe97babdc84ed618b35b3a090b4cc04da`
- original checkpoint base: `16e9deb8e0e670fa6b4c03b4d7bb09225f953617`
- `master` was not merged, rebased, pulled, or edited during Home-PC continuation
- pre-existing Home-PC handoff edit remains preserved as `stash@{0}: pre-bootstrap Home 2026-09-13 preserve local handoff`
- `.serena/` remains local-only/untracked and is not part of the product diff
- no tracked file is staged; no SUD-D repo commit/push has been performed after the checkpoint

Delivered stabilization behavior:

- DGF-008 approval retry/binding remains reconnect-safe for materially identical retries without relying on ephemeral MCP session identity.
- Approval Modes `Standard`, `Approve for me`, and `Full Access` are wired through local SQLite, strict enum-only Desktop IPC/preload/UI, Tool Kernel Policy/Approval, and audit. Full Access still cannot override Policy DENY or workspace/process hard boundaries.
- Approval Mode persistence and its durable `approval.mode.changed` audit are atomic in one SQLite transaction; an audit-write failure leaves the prior mode unchanged and fails closed.
- Full Access hard-boundary proof covers `internal_root`, `outside_workspace`, and `network` Policy DENY plus rejection of caller-controlled `executable`, `argv`, `cwd`, `env`, `shell`, and `workspaceRoot` process selectors.
- DGF-001 hidden Connect runtime uses the trusted native runtime executable directly with `windowsHide`; no `node.cmd` shim is produced.
- DGF-007 normal development launch no longer opens DevTools automatically; `SUD_D_OPEN_DEVTOOLS=1` remains the explicit local opt-in.
- DGF-002 stale `Waiting for ChatGPT` state reconciles to `Connected` only from trusted persisted `mcp-stdio` activity after the current connection session began.
- Continuous Repair Loop is now documented in `AGENTS.md` and this stabilization spec: diagnose → minimal fix → focused verify → resume only invalidated/inconclusive gates, with a maximum of 3 repair cycles per root cause and a fresh budget for a materially new root cause.

Repair-loop closure highlights:

- stale Home-PC build artifacts were refreshed without treating generated `dist` drift as a source defect; the actual TypeScript binding-narrowing compile defect was fixed minimally.
- legacy Team migration fixture was corrected to represent the schema version it claimed, resolving the migration-007 regression.
- historical M0.4 gateway guard was narrowed to permit exactly the trusted `resolveApprovalRuntimeIdentity(process.env)` use while continuing to reject child-process/network authority in the gateway.
- M0.2 migration expectation was updated from versions 1–6 to 1–7 after migration 007.
- Standards/Security review found one blocking atomicity issue in Approval Mode persistence/audit; a RED test reproduced it, the implementation was moved behind one SQLite transaction, and focused proof turned GREEN in repair cycle 1/3.
- a derived unused-variable lint failure was repaired in its own root-cause budget and focused lint turned GREEN.
- UI-smoke harness issues (`work.resume` ordering and Windows runner exit propagation) were diagnosed as local harness defects; no product source change was required.

Final verification evidence on the stable tracked source:

- focused Approval Desktop after atomicity repair: **12/12 PASS**
- focused Approval production/security/desktop regressions: **40/40 PASS**
- focused M0.2 migration: **15/15 PASS**
- focused Team migration: **4/4 PASS**
- focused M0.4 gateway: **16/16 PASS**
- earlier integrated stabilization regression set: **120/120 PASS** before final gates; later full-suite evidence supersedes it for closure
- lint: **PASS**
- typecheck: **PASS**
- full suite: **519 PASS / 5 skipped / 0 failed** across 42 files
- production build: **PASS**
- `git diff --check`: **PASS** after the final source repair
- Standards code review: **PASS — 0 blocking findings after atomicity fix**
- Spec code review: **PASS — 0 implementation findings after atomicity fix**
- Impeccable production Electron/UI smoke: **PASS** at 1365×768 and 960×720; real renderer → preload → IPC mode changes `Approve for me → Full Access → Standard`, no horizontal overflow, and existing Approve/Deny/navigation smoke all passed
- Impeccable detector: **invoked once as required; Serena truncated the JSON above its capture ceiling, so do not claim the detector returned `[]`**
- local production SUD-D-only acceptance on a real linked-worktree fixture: **PASS** — exactly 27 production tools; `work.resume → git.status → Team → diff_check → secret_scan → git.commit → work.checkpoint`; Planner → Implementer → Validator → Reviewer → completed; Approve-for-me, Standard identical retry, Full Access hard-boundary negative, bounded fixture commit, and checkpoint all passed; Serena/Remote Commander were not invoked
- acceptance commit `00cf07a2f69aa068dc14dc83cfa393802c6356f6` belongs only to the disposable linked-worktree fixture, not to the SUD-D repository
- final repository scope inspection: **PASS** — 13 tracked unstaged files, 0 staged files, no untracked paths outside `.serena/`, no unrelated tracked paths, and no high-signal secret patterns in added tracked lines

Environment blocker / residual risk:

- the one authorized final live `SUD_D_HOME work.resume` retry returned HTTP 404 with `tunnel_client_not_seen`: tunnel-client had not been seen for >300 seconds. Per instruction and Continuous Repair Loop, this was recorded as an external environment/runtime availability blocker and was **not retried again**. This does not overturn the passing local production acceptance, but live external-tunnel proof remains unavailable in this closure session.
- Impeccable context reported pre-existing local design-metadata drift (an orphaned HomePage surface brief) and a newer Impeccable version; both are outside this stabilization scope and were not changed.

### STOP CONDITION REACHED

Stop here before commit/push. Do not start Git network sync, Playwright runtime implementation, cloud work, or another milestone. A later explicit task may review/commit/push this stabilization diff; until then preserve the working tree and the Home-PC stash exactly.

## Agent Skill System Upgrade

**Status: COMPLETE — autonomous repo-local skill routing and pinned third-party workflow snapshot adopted 2026-09-01.**

SUD_D now tracks its approved Matt Pocock engineering workflows under `.agents/skills/` from the official `mattpocock/skills` repository pinned at `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76` (MIT). Official selected skill directories are copied without SUD_D-specific edits; `.agents/skills/MATT-POCOCK-SKILLS.md` records provenance/update policy and `.agents/skills/MATT-POCOCK-LICENSE` preserves the upstream MIT notice.

Installed automatic skills: `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `code-review`, `prototype`, `research`, `resolving-merge-conflicts`, `grilling`, `writing-for-agents`, `impeccable`.

Installed explicit/user-invoked skills: `handoff`, `to-spec`, `wayfinder`.

`AGENTS.md` now owns a complete autonomous Skill Router: product scope still comes from the user/task, operating/security/STOP rules remain superior to skills, agents consume existing repo/task context before asking repeat questions, native Agent Skills runtimes may invoke `.agents/skills` directly, and non-native/Serena-assisted runtimes read the routed repo-local `SKILL.md` plus only required references. Skill updates are pinned and must occur only in a separate governance/tooling task.

Verification for the governance commit:

- official pinned checkout: **PASS** — exact upstream commit `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`
- selected snapshot integrity: **PASS** — 13 skill directories / 36 official files byte-equivalent to pinned upstream
- frontmatter canonical names: **PASS**
- excluded `deprecated`, `in-progress`, `grill-me`, `setup-matt-pocock-skills`: **ABSENT**
- router consistency: **PASS** — 10 automatic + 3 explicit, all local and no missing router targets
- autonomy / repeat-question / native+non-native loading / pinning rules: **PASS**
- MIT provenance/license: **PASS**
- governance secret scan: **PASS**
- `git diff --check`: **PASS**
- production source/runtime/config: **UNCHANGED**; full SUD_D production suite/build/smoke were not required or run for this governance-only task
- `.serena/`: **local-only / not committed**

Governance implementation commit:

`fbd8c8eaf80066bedc0c0dcb6bf0656402de022f` — `chore: adopt autonomous SUD-D agent skill router`

This governance upgrade does not start or authorize the next product milestone.

### Skill Router Hard-Gate v2

**Status: COMPLETE — verified on 2026-09-02.**

`AGENTS.md` now makes repo-local skill routing a mandatory session/task gate after minimum repository bootstrap and before substantive planning, investigation, debugging, design, editing, or skill-governed review. Every genuinely applicable skill must be loaded before its governed work; Serena/non-native runtimes must actually read the selected `.agents/skills/<skill>/SKILL.md`, while native repo-skill invocation counts as loading. The gate reruns for new sessions/tasks, device/runtime/handoff changes, material scope changes, and workflow phase transitions that newly trigger a skill. Progressive disclosure remains intact: route every time, load every applicable skill, never bulk-load the catalogue by default. The Pre-Implementation Compliance Check reuses the latest valid router result rather than performing a second selection pass.

Acceptance scenarios: **6/6 PASS** — fresh bug investigation, investigation→source fix, governance/docs, new Serena chat, Home→Work handoff, and no matching skill. `git diff --check`: **PASS**; changed tracked paths are only `AGENTS.md` and `SUD_D_HANDOFF.md`; package/runtime/source/config files are unchanged; `.agents/skills/*` is untouched; `.serena/` remains local-only and unstaged. No product test suite/build was required or run for this governance-only diff.

Immediate next approved task after this governance commit is **Impeccable pinned installation/integration** only. Do not start it from this task.

### Impeccable v4.1.3 pinned integration

**Status: COMPLETE — pinned repo-local installation/integration verified on 2026-09-02.**

- Official upstream: `https://github.com/pbakaus/impeccable`
- Release tag: `skill-v4.1.3`
- Pinned commit: `c0f495212236129c2e92aaf7714a3a9914569d13`
- Skill metadata version: `4.1.3`
- License: Apache-2.0, copied unchanged as `.agents/skills/IMPECCABLE-LICENSE`
- Canonical `.agents/skills/impeccable/` snapshot is copied completely and without SUD_D-specific edits; existing Matt Pocock skill files remain untouched.
- `.gitattributes` disables Git whitespace-error classification only for `.agents/skills/impeccable/**` because the pinned upstream snapshot contains whitespace that must remain byte-exact; this has no product/runtime effect.
- `AGENTS.md` routes `impeccable` automatically for SUD_D Desktop frontend/UI/UX work while preserving the Mandatory Skill Router Hard-Gate, progressive disclosure, all other applicable skills, product truth, and security/least-privilege boundaries.
- No Impeccable installer/update/init command, provider hook, global install, Serena connector change, `PRODUCT.md`, or `DESIGN.md` was created or run in this task.
- Snapshot integrity, provenance/license, routing acceptance, `git diff --check`, source-scope checks, pinned-skill preservation, and `.serena/` local-only checks passed; no application/runtime/package source changed, so the product test suite/build was not required.

### Mandatory Impeccable UI Gate

**Status: COMPLETE — renderer-visible UI/UX now hard-requires Impeccable before UI-governed work.**

`AGENTS.md` now requires every task that plans, designs, creates, modifies, fixes, reviews, audits, or polishes renderer-visible SUD_D UI/UX to select and load `impeccable` before that UI phase begins. Serena/non-native runtimes must actually read `.agents/skills/impeccable/SKILL.md`; merely naming it is insufficient. A backend-only task that later crosses into React/CSS or other renderer-visible UI/UX must rerun the Skill Router Gate and load `impeccable` before touching that phase, while backend-only work with no renderer-visible UI change/review does not trigger it. The gate remains subordinate to SUD_D security, explicit user/task scope, STOP conditions, fail-closed behavior, and all other genuinely applicable skills.

Governance acceptance: **6/6 PASS** — spacing-only, UI copy/error label, Connection onboarding, renderer-visible state bug, backend-only no-UI, and backend→UI phase transition. `git diff --check`: **PASS**; no production source/package change; `.agents/skills/impeccable/**` unchanged; `.serena/` remains local-only and unstaged. No product suite/build was required for this governance-only change.

Governance implementation commit:

`0fc1be87f5b9f29e3bcd44050e7d518fa32ce4d4` — `docs: hard-require impeccable for ui work`

Known Connection UX requirements intentionally deferred to the next explicit Connection task:

- `Waiting for ChatGPT` remains after a successful real MCP tool call.
- Connection should identify the current Tunnel clearly; a masked suffix is acceptable.
- First-time setup should make Workspace → Tunnel ID → API Key → Test/Connect understandable.
- Support Change/Remove Tunnel configuration.
- Support Replace/Remove API Key.
- Support resetting connection setup.
- Advanced details are visually hidden / poorly discoverable.
- A dev/runtime terminal window appears during Connect and should not appear in normal user experience.
- Closing SUD-D should safely clean up/disconnect automatically instead of requiring the user to remember manual Disconnect.

### App Shell + Overview Hybrid UX/UI Pass

**Status: COMPLETE — implemented, visually smoke-tested, Impeccable-reviewed, Security/Data Critical verified, and committed on 2026-09-03.**

Implementation commit:

`3bfbe61` — `feat: redesign app shell and overview`

Delivered scope:

- shared SUD-D Desktop App Shell now uses the approved SUD-D logo, restrained white/blue visual system, existing eight navigation destinations, clear active state, breadcrumb/current-page top bar, truthful health chip, and fixed-purpose `Open ChatGPT Web` action
- Overview now follows the approved hierarchy: concise heading → one real connection/status card → compact Approved workspaces summary → Recent activity + Safety status; the Connection Method selector row is completely absent
- Overview continues to consume existing connection/workspace/audit state and documented security facts; no Sign in, updater, account, Active Sessions, permissions, uptime, encryption, API-key suffix, or other unsupported capability/data was invented
- `Open ChatGPT Web` uses a newly reviewed fixed-purpose Electron IPC seam. Renderer/preload accepts zero URL/executable/argv/cwd/env input; unexpected raw input and invalid senders fail closed; the handler opens only `https://chatgpt.com/`
- other tab JSX/content was not redesigned; those pages only inherit the shared shell/common visual system
- first real Impeccable UI run created `packages/desktop/PRODUCT.md`, `packages/desktop/DESIGN.md`, `.impeccable/design.json`, and the Overview surface brief; pinned third-party `.agents/skills/impeccable/**` remains byte-untouched

Final evidence:

- focused App Shell/Overview regression: **5/5 PASS**, including fixed URL/no arbitrary renderer URL authority, approved hierarchy, muted-text contrast, and inert initial connection CTA
- relevant Desktop/security regressions: **74/74 PASS** across 6 files
- full suite: **377/377 PASS across 22 files**; exact production MCP surface remains 14 tools
- typecheck: **PASS**
- lint: **PASS**
- production build: **PASS**
- Electron visual smoke: **PASS** at 1365×768 and 960×720 with no horizontal overflow/clipping; approved logo loaded; all existing navigation destinations remained reachable
- real `Open ChatGPT Web` click through production Electron IPC: **PASS**
- Impeccable detector: **PASS (`[]`)**
- bounded Impeccable finish review: **`disposition: ship`** after one material fix batch (muted-text contrast + initial loading CTA) and one conclusive confirmation visual round
- `git diff --check`: **PASS**
- staged secret/log scan: **PASS**; `.serena/` remains local-only
- final Standards / Spec code review: **PASS / PASS**, 0 blocking findings
- Connection page source, MCP Gateway source, and pinned Impeccable third-party snapshot: **UNCHANGED**

**Next explicit UI task:** **Connection tab UX/UI + onboarding/state correctness pass**. Preserve the Connection requirements above; do not start that task from this App Shell + Overview pass.

### Overview Final Polish

**Status: COMPLETE — implementation verified and committed; finalization handoff/push completes this task.**

Final polish preserves the approved App Shell + Overview design and changes no Connection-tab content. The narrow-sidebar logo clipping root cause was the `<=1020px` rule forcing the approved 265×68 SUD-D logo into a 50×50 box with `object-fit: cover`; the rule now preserves the full logo proportionally with `contain`. A 68×68 `sud-d-app-icon.png`, derived directly from the approved logo without redraw, is wired as the fixed local Electron `BrowserWindow.icon`.

The topbar status now reads the existing real `connection.status()` result and presents it through `presentConnectionState(...)`; a failed status read fails safe as `Connection unavailable` rather than leaving a stale positive state. Overview no longer repeats the standalone `Overview` heading/subtitle beneath the breadcrumb. The secondary connection action is labeled exactly `Connection Setting` and continues to route to the existing `connection` page.

Verification evidence from the completed implementation session:

- focused App Shell/Overview: **7/7 PASS**
- relevant Desktop/UI regressions: **76/76 PASS**
- full suite: **379/379 PASS across 22 files**
- Electron smoke: **1365×768 PASS** and **960×720 PASS**, with no horizontal overflow; full logo ratio preserved and the existing Connection route remained reachable
- typecheck: **PASS**
- lint: **PASS**
- production build: **PASS**
- `git diff --check`: **PASS**
- bounded Impeccable finish review: **`disposition: ship`**, no material blocker
- Impeccable detector: **invoked once as required; Serena truncated the detector JSON because it exceeded the capture ceiling. Do not claim this final-polish detector returned `[]`.**

Implementation commit:

`5d9d0aff2db50969bcad954118ce531ffbeaa88e` — `fix: polish overview connection shell`

**Follow-up governance:** the Mandatory Impeccable UI Gate is now COMPLETE as recorded above. The next explicit product UI task remains **Connection tab UX/UI + onboarding/state correctness pass**; do not start it without a new explicit instruction.

### Branding Logo + App Icon v2

**Status: COMPLETE — approved branding renditions verified and implemented on Home PC; ready for Work-PC fast-forward pull after this handoff commit is pushed.**

- Approved production logo: **375×125**, SHA-256 `13a25ffade5475ac448304724e81a89f68eb51e979af7ab1c5ba26f840229d99`, replacing the existing trusted path `packages/desktop/src/assets/sud-d-logo.png`.
- Approved production app icon: **192×192**, SHA-256 `172bb88ca88a94f1c013f4f589dbf4ebdcbe2405fd6d9d241764fcb921eba467`, replacing the existing trusted path `packages/desktop/src/assets/sud-d-app-icon.png`.
- Approved high-resolution originals were downsampled locally at the task-required dimensions with aspect ratio preserved; destination hashes exactly match the local approved production renditions. No asset path, CSS, App Shell component, IPC, MCP Gateway, or security-authority seam changed.
- Focused App Shell/branding regression: **7/7 PASS** after the asset replacement; the same test was RED at **6/7** against the old committed assets.
- Relevant Desktop/UI regressions: **76/76 PASS across 6 files**.
- Real Electron branding smoke: **PASS** at **1365×768** and **960×720** across all eight shared-shell pages; logo loaded as 375×125, rendered proportionally with `object-fit: contain`, stayed inside the sidebar brand box, and produced no horizontal overflow.
- Windows runtime icon verification: native window handle plus non-zero small/big/class `WM_GETICON`/class icon handles **PASS**, covering the running-window icon source used by the titlebar/task switcher/taskbar. A separately packaged executable icon was **not produced or claimed** in this task.
- Impeccable: required context/polish/craft-floor workflow applied; manual detector invoked exactly once. Detector reported pre-existing advisory design-system drift outside this branding scope and **0 branding/logo/icon-related findings**; bounded finish disposition: **ship**.
- Typecheck: **PASS**; lint: **PASS**; production build: **PASS**; `git diff --check`: **PASS**; changed-text secret scan: **PASS**.
- `.agents/skills/impeccable/**`, MCP/core packages, Electron authority code, and unrelated page source: **UNCHANGED**. `.serena/` remains local-only and uncommitted.

Branding implementation commit:

`fef01754aa7ca799b476876e1ee68d502d5f3524` — `fix: refresh sud-d branding assets`

**Work-PC continuation:** begin with `git status`, `git fetch origin`, then `git pull --ff-only origin master`; rerun the fresh session bootstrap + Mandatory Skill Router Gate. The next explicit product UI task remains **Connection tab UX/UI + onboarding/state correctness pass**, and the Mandatory Impeccable UI Gate requires loading `.agents/skills/impeccable/SKILL.md` before renderer-visible UI/UX work.

### Overview Action Layout + Access Status

**Status: COMPLETE — bounded Overview-only UI polish verified and committed on 2026-09-03.**

Implementation commit:

`0795e27` — `fix: refine overview connection actions`

Delivered scope:

- Overview connection actions now live under the left-side connection copy, directly beneath the connection description/note, matching the approved reference hierarchy while preserving `runPrimaryAction()` behavior and the existing `Connection Setting` route to the Connection page.
- The connection card is now a two-region layout: left icon/copy/actions and right truthful Workspace / Runtime API Key / Secure Tunnel status list. No empty third action column remains.
- Approved workspaces now include a display-only `Access` column. Each visible row shows `Read & write` as the current product workspace capability baseline only.
- No per-workspace permission backend/model, IPC method, DTO field, database field, Policy setting, MCP Gateway change, Delete, Execute, or Network behavior was added.

Verification evidence:

- TDD RED: focused Overview regression failed against the previous layout because actions were still outside the left copy and the Access column was absent.
- Focused Overview/App Shell GREEN: **8/8 PASS** in `packages/tests/src/app-shell-overview.test.ts`.
- Full suite: **380/380 PASS across 22 files**; production MCP surface remains exactly 14 tools.
- Typecheck: **PASS**.
- Lint: **PASS**.
- Production build: **PASS**.
- `git diff --check`: **PASS**.
- Electron smoke: **1365×768 PASS** and **960×720 PASS** using the built Desktop path with a seeded temporary workspace row. Actions were under the left copy, status remained on the right at wide width, Access / `Read & write` were visible, no horizontal overflow was detected, and both connection buttons accepted keyboard focus.
- Impeccable: required context, layout reference, craft floor, and bounded smoke pass were applied. Detector output was captured under `.serena/reports/overview-impeccable-detect.json`; findings were advisory design-system drift only, not a blocker for this bounded layout task.
- Scope verification: only `packages/desktop/src/pages/HomePage.tsx`, `packages/desktop/src/index.css`, `packages/tests/src/app-shell-overview.test.ts`, and this handoff section changed. `.agents/skills/impeccable/**`, contracts, domain, application, infrastructure, MCP Gateway, connection runtime, and Connection page content remain unchanged.

**Next explicit UI task remains:** **Connection tab UX/UI + onboarding/state correctness pass**. Do not start it from this Overview polish task.

### Overview + Connection Minimal Refinement

**Status: COMPLETE — final code-review PASS, verified implementation committed on 2026-09-03.**

Implementation commit:

`b82092c0c8fd59051626499d99cac03cad9640c8` — `fix: refine overview and connection setup`

Delivered scope:

- Overview now shows only the active workspace in Approved workspaces.
- `+ Add Workspace` is visible and still navigates to the existing Workspaces page.
- Sidebar order is now Overview → Connection → Workspaces → Activity → Team → Security → Recovery → Environment / Doctor.
- The redundant Connection page-level title/subtitle/status row was removed; the shared topbar/breadcrumb remains, and the Connection hero now starts the page content.
- The Connection hero and existing three setup cards were preserved; this task did not redesign the cards.
- Runtime API Key card keeps the secure credential copy, places `Replace API Key` and `Remove API Key` on the same action row, and adds `Get API Key from OpenAI` below them.
- Secure Tunnel card keeps `Change Tunnel configuration` and adds `Open Tunnel Settings` below it.
- OpenAI setup navigation uses fixed-purpose zero-input Desktop IPC methods. The main process owns the exact allowed destinations: `https://platform.openai.com/settings/organization/api-keys` and `https://platform.openai.com/settings/organization/tunnels`.
- The renderer received no generic arbitrary-URL authority, no direct `shell.openExternal`, and no credential plaintext/suffix exposure.

Verification evidence:

- TDD RED: **5 focused failures** captured before the implementation for fixed OpenAI app channels, active-only Overview, sidebar order, Connection header removal, and setup links.
- Focused GREEN: `packages/tests/src/app-shell-overview.test.ts` **12/12 PASS**.
- Full suite: **384/384 PASS across 22 files**.
- Typecheck: **PASS**.
- Lint: **PASS**.
- Production build: **PASS**.
- `git diff --check`: **PASS**.
- Electron smoke: **1365×768 PASS** and **960×720 PASS**; Overview active-only/access/add-workspace and Connection minimal layout assertions passed with no horizontal overflow.
- Real external-click smoke: **PASS** for both OpenAI setup buttons in the built Electron app; exact URL ownership is covered by the focused IPC regression.
- Impeccable detector: invoked once; findings were advisory-only design-system drift, with no material blocker for this bounded task.
- Final code-review: **Standards PASS / Spec-Security PASS**, 0 blocking findings.
- Scope review: `.agents/skills/impeccable/**`, connection runtime semantics, workspace permission backend, credentials, and MCP production tool surface remain unchanged; `.serena/` remains local-only.

Broader Connection correctness remains deferred and was not started here:

- stale `Waiting for ChatGPT`
- terminal suppression
- close-app cleanup/disconnect

## Architecture / Process Decision

- Risk-Based Development is adopted: Security/Data Critical boundaries retain strict verification, while low-risk UI, cosmetic, and documentation work uses proportional verification and faster iteration.
- Pre-Implementation Compliance Check is adopted before milestone implementation or any source-changing task.
- M0.6 is COMPLETE.
- M0.7 is COMPLETE after Doctor + Activity integration, security/redaction verification, production Desktop smoke, and required final code review.
- M0.8 is COMPLETE after Secure Tunnel setup UX hardening, real Home-PC control-plane/tunnel acceptance, clean stop/fresh-start verification, regression coverage, production Desktop smoke, and required final code review.
- Post-M0.8 Secure Runtime API Key Setup is COMPLETE: SUD-D now supports Windows Credential Manager persistence through a Windows-native credential prompt, fixed profileId-only IPC, stopped-only credential mutation, stored-before-environment runtime preparation, and safe Set / Replace / Remove UI controls without exposing plaintext credentials to the renderer.
- Post-M0.8 Connection UI/UX Simplification is COMPLETE: normal workspace/key/tunnel setup and ChatGPT connection readiness are managed from the SUD-D UI through fixed-purpose safe boundaries. M1, Personal Alpha Workspace File Tools, and Git Safety + Integration have since completed as recorded below.

## Approved Future Direction

Team Mode / Agent Orchestration is adopted as SUD_D's long-term domain-agnostic Personal AI Team Harness direction. It remains above the secure SUD_D execution boundary, and Serena is optional rather than a core runtime dependency. Exact architecture, presets, runtime, scheduling, memory format, UI, and milestones remain deferred; this decision does not change the current milestone or authorize implementation.

## Current Execution State

**Work Memory / Automatic Resume MVP (2026-09-05)**

**WORK MEMORY / AUTOMATIC RESUME MVP: PASS — closed and ready to commit/push**

Fixed implementation baseline:

- `1cec2957ea42417f000b9256ab695e0c852285dd`

Delivered contract:

- Production MCP exposes exactly **26 tools**. Work Memory adds only `work.resume` and `work.checkpoint`; no generic memory, raw Serena-memory, shell/process, Network, Delete/Recovery, or new caller-selected authority was added.
- A fresh MCP session must `work.resume` before substantive project-scoped tools. Bootstrap is ephemeral per session and active Workspace; persisted Resume Context is Workspace-scoped and does not grant tool authority.
- `work.checkpoint` persists one bounded semantic context: goal, task/status, completed work, decisions, blockers, next action, safe artifact paths, verification, and trusted Git head/status references. History is capped at 20 with one authoritative current checkpoint per Workspace.
- Public checkpoint input is strict, bounded, rejects secret-like/raw-selector/raw-output fields, and remains capped at **64 KiB**. InternalRoot/outside-Workspace artifact paths remain denied.
- Trusted Git enrichment uses only existing Git Safety structured status. Sensitive paths are omitted; automatic paths are deterministically limited by count, **1,024-char path bound**, and remaining **64 KiB** checkpoint capacity. Excess enrichment is omitted rather than persisting an invalid context.
- Resume validates trusted Git drift without mutating Git or replacing saved context. Workspace switches invalidate bootstrap and cannot expose another Workspace's Resume Context.
- Activity suppresses routine successful Work Memory Tool Kernel noise while keeping resume-required, schema, persistence, and execution failures visible once; renderer DTOs remain free of raw checkpoint metadata.

Final Home-PC evidence:

- meaningful Git-enrichment RED: **PASS as RED evidence** — automatic overlong changed path violated the persisted artifact bound before the fix
- focused Work Memory suite: **12 passed / 1 gated acceptance skipped** across 6 files
- directly relevant Workspace/Git/Approval/MCP regressions: **111/111 PASS**
- refreshed Home-PC production acceptance: **2/2 PASS**, including restart continuity, real non-mutating Git drift, pathological long/aggregate trusted-Git enrichment, bounded persisted context, and Workspace A/B isolation
- lint: **PASS**
- typecheck: **PASS**
- final full repository suite: **35 files passed / 2 skipped; 476 tests passed / 4 skipped**
- production build: **PASS**
- final `git diff --check`: **PASS**
- exact production MCP surface: **26 unique tools**
- final Security/Data + Standards/Spec review: **PASS / PASS / PASS**, blockers **0**
- `.serena/` remains local-only and must not be committed

Closure note: the separate pre-existing Restricted Execute Home-PC note later in this handoff remains unrelated local working-tree state and must stay unstaged/uncommitted with Work Memory.

**Next approved step:** **Team Mode MVP** only under a new explicit user task plus a fresh Skill Router Gate. STOP after this Work Memory commit/push/fetch with `HEAD == origin/master` and divergence `0 0`; do not start Team Mode or any later milestone from this task.

**Restricted Verify — Personal Alpha (2026-09-05)**

**RESTRICTED VERIFY PERSONAL ALPHA: PASS — closed and ready to commit/push**

Fixed implementation baseline:

- `ad98d40972445f0c4e79fd5a69339c7d458723ff`

Delivered contract:

- Production MCP exposes exactly **24 tools**. Restricted Verify adds only `verify.run({action})`; actions are exactly `test | lint | typecheck | build`.
- `verify.run` uses the existing `execute` effect, so current Policy is **ASK** with exact one-time Approval bound to the selected action. Changed actions cannot reuse an approval; explicit denial blocks dispatch.
- Public input is strict and carries no caller-selected executable, argv, cwd, env, shell, Workspace root/id, raw Serena selector, Delete selector, or memory selector authority.
- Execution stays inside the active Workspace through the fixed Restricted Verify adapter. The adapter resolves only the declared pnpm/npm verification script, launches the resolved Node executable with fixed argv and `shell:false`, filters the child environment, and fails closed when the profile/runtime is unavailable.
- Workspace/InternalRoot resolution happens before approval; active-Workspace replacement is revalidated before dispatch. Workspace roots are immutable per repository Workspace ID, preventing same-ID root rebinding through the supported repository API.
- Verifier output is useful but hard-bounded and secret-shaped lines are redacted. Durable `restricted_verify.run` audit stores only stable action/result metadata; raw verifier output, raw host errors, argv/env, and secret sentinel values are not persisted.
- Timeout/process failure maps to stable Restricted Verify codes. Windows timeout proof confirms root + descendant process cleanup with no orphaned child.
- Activity shows approval, pass, verification failure, and timeout outcomes as concise Workspace events while suppressing duplicate successful Tool Kernel noise.
- No `code.run`, `dev.verify`, generic shell tool, raw Serena passthrough, Network tool, Delete/Recovery, package install/update, Work Memory, Team Mode, or Computer Use authority was added.

Final Home-PC evidence:

- Restricted Verify focused suite: **11/11 PASS**
- relevant Security/Data Critical regressions: **132/132 PASS**
- real Home-PC Windows production acceptance: **1/1 PASS** across `test`, `lint`, `typecheck`, and `build`; latest body runtime **5.32s**
- lint: **PASS**
- typecheck: **PASS**
- production build: **PASS**
- final full repository suite: **29 files passed / 2 skipped; 463 tests passed / 3 skipped**
- final `git diff --check`: **PASS**
- final security/data-boundary review: **PASS**
- final Standards / Spec review: **PASS / PASS**, blockers **0**
- `.serena/` remains local-only and must not be committed

Closure note: the separate pre-existing Restricted Execute Home-PC note later in this handoff remains unrelated local working-tree state and must stay unstaged/uncommitted with Restricted Verify.

**Next approved step:** **Work Memory / Automatic Resume MVP** only, and only under a new explicit user task plus a fresh Skill Router Gate. STOP after this Restricted Verify commit/push/fetch with `HEAD == origin/master` and divergence `0 0`; do not start Work Memory, Team Mode, `code.run`, general shell, Network tooling, Delete/Recovery, package install/update, or Computer Use from this task.

**Managed Serena Architecture — Milestone B managed runtime foundation (2026-09-04)**

**SERENA RUNTIME MILESTONE B: PASS**

Implementation baseline:

- `6a4a47303628fee6b9dfbca1d22c422465f6463f` — approved managed Serena runtime foundation plan baseline.

Milestone implementation history:

- `7113079` — `feat: add coding engine domain vocabulary`
- `a62d8bb` — `feat: define managed Serena runtime layout`
- `49562b8` — `feat: add managed Serena provisioner`
- `3457ebc` — `feat: add managed Serena stdio runtime`
- `ce36d55` — `feat: add coding engine lifecycle service`
- `fb77c47` — `docs: checkpoint Serena allowlist handoff`
- `8b98980b41aa129d4c7093caaea535ad4d481b1e` — `feat: complete managed Serena runtime foundation`

Delivered contract:

- SUD-D owns a fixed **22-name Product Mode Serena authorized allowlist** for the pinned `serena-agent==1.7.0` runtime. Upstream `tools/list` remains discovery/inventory only; unexpected upstream tools are Ready-but-blocked drift and gain no Product Mode authority.
- Every allowlisted tool must remain present and input-schema compatible. Missing or schema-incompatible allowlisted tools fail Coding Engine health closed.
- `CodingEngineRuntimeHealth.toolCount` is the effective SUD-D-authorized count (`22`), not raw upstream discovery count.
- Managed state stays under SUD-D DataRoot: `SERENA_HOME`, engine/cache/runtime directories, and managed project metadata are product-owned. The source Workspace `.serena` is not adopted or mutated.
- The exported managed runtime remains `start` / `stop` / `repair` only. Raw MCP `callTool(...)` exists only on the injected infrastructure/test session seam; Product Mode exposes no generic upstream tool-name dispatch surface.
- Production MCP remains exactly **14 Workspace/Git/Team tools**. No production `code.*`, renderer UI, direct Serena passthrough, `code.run`, or Milestone C capability was added.

Final Home-PC verification:

- focused Coding Engine tests: **26/26 PASS**
- real Windows managed-runtime acceptance: **1/1 PASS** — pinned runtime, central metadata, all 22 authorized tools present/schema-compatible, upstream extras blocked, LSP health, source `.serena` preserved, and process cleanup complete
- relevant Serena/runtime/process regressions: **99 PASS / 1 skipped**
- production MCP 14-tool regression: **PASS** under the repository Electron test runtime
- lint: **PASS**
- typecheck: **PASS**
- full suite: **417 PASS / 2 skipped across 27 files**
- production build: **PASS**
- `git diff --check`: **PASS**
- security/scope/secret review: **PASS** — no Desktop/MCP source drift, no `.serena/` tracking, no production `code.*`, no debug instrumentation, no secret-shaped added diff, and no raw Serena runtime persistence/logging
- final code review: **Standards PASS / Spec PASS**, blocking findings **0 / 0**

Task 6 diagnosis note: the Home-PC acceptance crash was caused by Node v24.14.0 on Windows fail-fast behavior during recursive `fs.cpSync(...)` from a Thai/Unicode source path. The acceptance harness now uses deterministic directory walking plus `copyFileSync`; no production runtime behavior was changed for that issue. The later child-process `.once(...)` typecheck blocker was resolved with a narrow consumed-event type adapter, without runtime behavior change or dependency pin churn.

Known Milestone B limitation: clean-machine/self-contained `uv` bootstrap and controlled Serena update/rollback promotion are **not enabled yet**; the current provisioner requires an available trusted `uv` bootstrap resolver.

**Next gate:** Milestone C (Semantic Read / read-only `code.*` facade) requires a new explicit user instruction and a fresh Skill Router Gate. Do not start Milestone C from this milestone closure.

**Managed Serena Architecture — Milestone A compatibility/runtime spike**

**Status: PASS on Work-PC (2026-09-04).**

Milestone A proved that SUD-D can manage one pinned Serena/LSP runtime as a compatibility spike without exposing production `code.*` tools.

Scope delivered:

- Pin: `serena-agent==1.7.0`, upstream tag/commit `949a27ef1e5fda1a6e7b561e777bcece345c6ffd`, wheel SHA-256 `6dbf1459670d96fb0595f84932adef34260a6fe14ba5135b901fdb3c8c76e891`.
- Transport: stdio through `@modelcontextprotocol/client@2.0.0` and `StdioClientTransport`.
- Backend: Serena LSP backend with `--context desktop-app`, `--mode no-onboarding`, and `--open-web-dashboard false`.
- Runtime model: OS-temp spike root with isolated `uv-tools`, `bin`, `python`, `uv-cache`, and copied TypeScript fixture project; no `.serena/` repo state committed.
- LSP proof: `get_symbols_overview` on copied fixture `src/calculator.ts` returned the known `add` function and `Calculator` class.
- Tool/schema capture: 29 Serena tools, sorted/unique canonical snapshot.
- Cleanup proof: root/descendant PIDs captured as integers only; final live smoke reported `cleanup: clean`; no spike-owned process tree remained after final verification.

Evidence:

- `docs/superpowers/research/2026-09-04-serena-runtime-spike-results.md`
- `docs/superpowers/research/2026-09-04-serena-v1.7.0-tool-schema.json`

Final verification on Work-PC:

- focused Serena spike tests: **PASS** — 7 passed / 1 skipped
- live `pnpm serena:spike`: **PASS** — 8/8, stdio MCP initialize/discovery, LSP overview, deterministic cleanup
- relevant runtime/process regressions: **PASS** — 87 passed / 1 skipped across 5 files
- lint: **PASS**
- typecheck: **PASS**
- full `pnpm test`: **PASS** — 391 passed / 1 skipped across 23 files
- production build: **PASS**
- `git diff --check`: **PASS**
- final Standards/Spec code review: **PASS**, blocking findings 0

Security/scope confirmation:

- production MCP remains exactly **14 tools**: six Workspace + four Git Safety + four Team.
- no production `code.*` tool was exposed.
- no `dev.verify`, no direct Serena passthrough, no renderer UI, no Workspace Trust/Policy/Approval changes, and no `code.run` implementation was added.
- no raw environment dump, credential helper output, arbitrary raw Serena stdout/stderr, temp runtime, uv cache, Python install, or `.serena/` state is committed.

Commits in this Milestone A slice:

- `d59e833` — `test: add Serena runtime spike prerequisites`
- `4c045da` — `test: add Serena TypeScript spike fixture`
- `6769a62` — `test: define isolated Serena spike seam`
- `e3ca65a` — `test: add managed Serena runtime spike harness`
- `9afaa0b` — `test: prove Serena stdio LSP compatibility`
- `ca47417` — `docs: record Serena runtime spike evidence`
- `126c956` — `test: clean Serena spike harness lint`

Immediate next action: **STOP.** Milestone B — managed runtime foundation requires a new explicit user authorization and a fresh Skill Router Gate. Do not start product Setup/Repair UI, runtime manager, `code.*`, Policy classification, approval interception, `code.run`, native tool removal, Restricted Execute, Delete/Recovery, network Git, scheduler/background agents, provider/model runtime, or another capability slice without a new explicit implementation instruction.


**SUD-D product connector runtime compatibility fix**

**Status: VERIFIED — local regression, full Security/Data Critical gates, and built product-profile acceptance pass; real Work-PC ChatGPT-through-Secure-Tunnel acceptance is still required.**

Root cause: the product Secure Tunnel profile launched the JavaScript MCP Gateway through plain `node`. The installed `better-sqlite3` native module is Electron-compatible, so the product profile could reach MCP `initialize` and fail with `-32603 Internal server error` before `tools/list` when the Gateway ran under an incompatible Node ABI.

Fix:

- production Electron context resolves the exact current Electron executable as the trusted Gateway runtime; plain trusted `node.exe` remains supported only outside Electron contexts
- the SUD-D-owned tunnel profile uses fixed `node.cmd <Gateway entry>` syntax for tunnel-client Windows parsing compatibility
- SUD-D atomically materializes an ASCII-only `node.cmd` shim under the secure-tunnel runtime root; it sets `ELECTRON_RUN_AS_NODE=1` and invokes only the trusted runtime path supplied internally through fixed `SUD_D_GATEWAY_RUNTIME_EXE`
- the tunnel launcher prepends only the SUD-D-owned runtime root to PATH and overwrites the fixed runtime environment variable; renderer/client input cannot choose executable, argv, cwd, env, profile path, or runtime path
- final security review also tightened the injected runtime seam: arbitrary existing `.exe` paths are rejected before launch; only `node.exe` or the exact current Electron executable is accepted
- production MCP remains exactly **14 tools**: six Workspace + four Git Safety + four Team; no Execute, Network, Delete/Recovery, or approval-decision capability was added

Fresh verification after the final review fix:

- TDD focused M0.5: **26/26 passed**, including the product-profile built Gateway regression and arbitrary-runtime rejection
- relevant connection/runtime regressions: **191/191 passed across 7 files**
- typecheck: **PASS**
- lint: **PASS**
- full suite: **372/372 passed across 21 files**
- production build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop renderer/main/preload bundles
- built product-connector acceptance under repo-standard Electron-as-Node runtime: **PASS** — trusted Electron resolver, runtime env override, runtime-root PATH precedence, MCP initialize, and exact **14-tool** `tools/list`
- `git diff --check`: **PASS**
- changed-surface secret scan: **PASS**
- final Standards / Spec / Security review: **PASS** after one review finding was fixed with RED→GREEN coverage; no blocking findings remain
- `.serena/`: **local-only / untracked**

Remaining acceptance: perform one real Work-PC ChatGPT connection through the configured SUD-D Secure Tunnel and confirm MCP initialize plus the exact 14-tool production surface. The local built acceptance proves the fixed product-profile/runtime path but does not claim the external ChatGPT/control-plane path is complete on Work-PC.

**Team Mode Personal Alpha MVP — V3**

**Status: COMPLETE — final closure gates passed on 2026-09-06.**

Team Mode now provides deterministic multi-Task orchestration for one connected AI session through the logical roles:

`Planner -> Worker (implementer) -> Validator -> Reviewer`

These are logical roles only. Team Mode owns orchestration state, not ambient filesystem/process/network authority; project reads, writes, Git, Verify, and Approval continue through their existing bounded capability paths.

Production MCP remains exactly **26 tools**, including exactly four Team tools: `team.start`, `team.status`, `team.submit`, `team.stop`. Team Mode adds no `code.*` surface and no `code.run`.

### Team Mode V3 contract

- Mission states: `planning`, `implementing`, `validating`, `reviewing`, `completed`, `blocked`, `stopped`.
- Task statuses: `pending`, `in_progress`, `validating`, `reviewing`, `done`, `blocked`.
- Submit outcomes are exactly `plan_ready`, `work_ready`, `validation_passed`, `validation_failed`, `task_approved`, `changes_requested`, `blocked`; legacy outcome aliases are rejected.
- Reviewer approval is impossible before Validator pass. Approved Tasks advance automatically to the next pending Task; the final approved Task completes the mission.
- Validator/Reviewer returns increment the current Task rework count; the fourth return attempt blocks terminally as `REVIEW_LOOP_LIMIT`.
- One active Team mission per Workspace is enforced; terminal missions are not reopened.
- Planner/Validator/Reviewer require matching trusted freshness. Worker `work_ready` adopts the trusted current baseline. `blocked`/`stop` require Workspace identity/root but not Git freshness matching.

### Atomic persistence / continuation

- Every state-changing Team path uses one `TeamTransitionUnitOfWork` SQLite transaction for Team rows + authoritative Work Memory checkpoint + required Team audit.
- Team, Work Memory, and audit persistence share transaction-scoped internal writer factories; the UoW contains no duplicate mutation SQL for those stores.
- Production MCP and Desktop both require and wire the same DB-backed Team UoW; no non-atomic TeamService fallback remains.
- Work Memory maps every Team state to one bounded continuation checkpoint and exact next action; fresh MCP sessions still require explicit `work.resume` before Team work can continue.
- Migration 006 upgrades legacy Team rows without editing migrations 004/005, maps legacy Reviewer state through Validator, resolves current Task only within the same mission, clamps legacy rework to 0..3, and reconciles Work Memory before normal continuation.

### Desktop / Activity

- Desktop Team remains observability-first with fixed-purpose `status + stop` only; there is no renderer start/submit authority.
- Team UI shows Validator, Worker label, Task progress, current rework count, validation/review phase, bounded next action, and bounded Final Result.
- Activity emits one meaningful safe Team transition event per transition while routine Team status/kernel success noise is suppressed.

### Final verification

- shared transaction-writer contract: **1/1 passed**.
- focused persistence/security slice: **115/115 passed**.
- affected production regressions: **55 passed / 1 skipped**.
- real Home-PC production acceptance: **1/1 passed**.
- `pnpm lint`: **PASS**.
- `pnpm typecheck`: **PASS**.
- fresh full `pnpm test`: **494 passed / 5 skipped across 41 files**.
- `pnpm build`: **PASS**.
- `git diff --check`: **PASS**.
- production MCP surface: **26 total / 4 Team**, no production `code.run`.
- `.serena/`: **local-only / untracked**.

### Final review

- **Security/Data:** PASS.
- **Standards:** PASS.
- **Spec:** PASS.
- **Blocking findings:** 0.

Closure commit message: `feat: complete team mode personal alpha mvp`.

**STOP after closure push/fetch proves `HEAD == origin/master` and divergence `0 0`. Do not begin dogfooding, post-MVP hardening, or a later milestone without a new explicit instruction.**

**Restricted Execute**

**Status: BLOCKED — SANDBOX ENFORCEMENT NOT PROVEN ON WORK-PC on 2026-09-02.**

Restricted Execute was retried on the Work-PC after Team Mode MVP — No-Execute completed. The mandatory Phase 0 Windows sandbox gate still did not pass, so no production Execute capability was implemented and no `dev.verify` MCP tool was registered. Production MCP remains exactly 14 tools.

### Restricted Execute Work-PC retry findings

Work-PC capability inventory:

- OS: Windows 10 Pro `10.0.19045` / build `19045`, x64
- `VirtualizationFirmwareEnabled`: `True`
- `HyperVisorPresent`: `True`
- Windows Sandbox / `Containers-DisposableClientVM`: **Enabled** (verified by user-run elevated probe)
- `Microsoft-Hyper-V-All`: Disabled
- `VirtualMachinePlatform`: Disabled
- `HypervisorPlatform`: Disabled
- `WindowsSandbox.exe`: present, version `10.0.19041.4957`
- `wsb.exe`: absent
- `processmodel.dll`: absent
- `CheckNetIsolation.exe`: present
- current Serena process: non-elevated

Microsoft primary documentation confirms Windows Sandbox on Windows 10 supports `.wsb` configuration including disabled networking and read-only mapped folders, and uses hardware-based virtualization with a separate kernel. The newer Sandbox CLI with session IDs plus `start` / `exec` / `stop` automation begins with Windows 11 24H2; it is not available on this Windows 10 Work-PC.

A harmless local-only `.serena/` spike launched a custom `.wsb` successfully without elevation, with networking disabled and only a read-only mapped probe folder. However, on this Windows 10 Sandbox version there is no supported deterministic guest-to-host result/control channel while writable host mappings remain forbidden. The `LogonCommand` produced no host-observable completion result, and the Sandbox session remained running until the disposable instance was stopped from the host.

Because a writable mapped results folder would itself create a host write channel forbidden by the candidate acceptance requirement, it was not used as a workaround.

Work-PC Phase 0 proof matrix therefore remains **NOT PROVEN** for Internet/localhost/LAN denial, outside-Workspace/user-profile/credential sentinel denial, child/grandchild confinement, guest timeout/tree cleanup, and privilege/capability containment. No broad admin/global firewall mutation was attempted; fail-closed behavior and absence of an unsandboxed fallback remain preserved.

### Restricted Execute decision

`RESTRICTED EXECUTE: BLOCKED — SANDBOX ENFORCEMENT NOT PROVEN ON WORK-PC`

- Production Execute capability/actions: **none**
- `dev.verify`: **absent**
- Production MCP: exactly **14 tools** — six Workspace + four Git Safety + four Team
- Team Mode MVP — No-Execute remains **COMPLETE** and separate
- Network DENY, Outside Workspace DENY, InternalRoot DENY, credential rules, Basic Approval, audit ordering, Workspace File, and Git Safety invariants remain unchanged
- Local report: `.serena/reports/restricted-execute.md` (local-only, not committed)

Historical Home-PC Phase 0 evidence remains relevant only as historical evidence: Windows 10 Pro 19045 there lacked a proven usable Sandbox/AppContainer route at the time. The Work-PC retry supersedes the current Restricted Execute decision but does not claim Home-PC support.

### Restricted Execute blocked-state review

- **Standards:** PASS for blocked state. Fail-closed behavior was preserved and no production process capability or insecure fallback was added.
- **Spec:** PASS for blocked state. The task requires blocking before production Execute when the full Phase 0 enforcement matrix cannot be proven.

**Team Mode MVP** remains **COMPLETE — No-Execute**.

**Basic Approval**

**Status: COMPLETE — Policy `ASK` now creates/reuses a safe pending approval, trusted Desktop Activity can Approve/Deny one exact action, an exact retry revalidates Policy/security and atomically consumes a one-time grant, production MCP remains exactly ten tools, credential-sensitive Workspace/Git flows pass end-to-end, production MCP/Desktop acceptance passed, and final Standards/Spec review found no blockers on 2026-09-02.**

The trusted path remains:

`MCP Gateway → Tool Kernel → validation/security resolution → Policy → Approval → mandatory pre-execution audit → Execution → outcome audit`

### Basic Approval model / binding

- State model: `pending`, `approved`, `denied`, `consumed`, `expired`; terminal requests are never reopened.
- Default TTL is **5 minutes**; active pending+approved runtime target is **50**, Desktop list cap is **50**, and terminal cleanup is bounded to approximately 24 hours.
- A grant authorizes one exact action once. The keyed binding covers Gateway runtime instance, client session id/type, capability, trusted effect, exact validated capability input/binding, resolved sensitivity/policy context, and Workspace id when present.
- The Gateway owns a random runtime-instance id and ephemeral random HMAC-SHA-256 key. SQLite stores only the opaque keyed digest and safe bounded metadata; the HMAC key/raw binding/tool input/content/diff are not persisted.
- A new Gateway runtime invalidates prior pending/approved runtime state. Approval ids are safe identifiers only and carry no authority on retry.
- Every retry repeats registry lookup, validation, trusted security resolution and Policy. Policy `DENY` remains stronger than approval; approved ASK execution remains truthfully `policyDecision=ask`.
- Grant consumption is atomic and occurs before mandatory pre-execution audit. A failed pre-exec audit does not refund the grant; post-exec audit failure preserves existing executed/non-retry semantics.

### Basic Approval Desktop / IPC

- Activity now contains a bounded **Pending approvals** card above Audit Activity.
- Renderer-facing approval DTOs contain only safe id/capability/effect/sensitivity/title/resource label/status/timestamps.
- Desktop privilege is fixed-purpose only: `approval:list` and `approval:respond`; respond accepts only approval request id plus `approve`/`deny` through strict IPC schemas and validated sender identity.
- No Always Allow, bulk/group approval, remembered decision, auto-approval, generic approval authority, approval MCP tool, or renderer-controlled policy/security/binding exists.
- Approve guidance tells the user to retry from the connected AI; Deny remains terminal for that request.

### Basic Approval production ASK cases

- Credential-sensitive `workspace.read_text`, `workspace.create_text_file`, and `workspace.write_text_file` now require Desktop approval and exact retry; no read/mutation occurs before approval.
- Credential-sensitive `git.diff` and `git.checkpoint` use the same one-time approval path. The dedicated Git adapter still blocks sensitive operations by default; trusted approved-sensitive adapter methods are selected only from Tool Kernel execution context after grant consumption.
- Git approval bindings include the trusted current Git `statusId`, so a later changed Git-sensitive state cannot reuse a stale grant.
- Production `tools/list` remains exactly the existing **10 tools**: six Workspace + four Git Safety. Basic Approval adds zero MCP tools.

### Basic Approval verification / acceptance

Fresh final Security/Data Critical evidence:

- focused Basic Approval: **35/35 passed**
- production Workspace/Git approval suite: **8/8 passed**
- relevant regressions: **271/271 passed across 17 files**
- typecheck: **PASS**
- lint: **PASS**
- full suite: **355/355 passed across 18 files**, clean exit 0
- build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop
- `git diff --check`: **PASS**
- changed/new package secret scan: **PASS**, 30 files / 0 real-secret findings
- SQLite/renderer/audit confidentiality: **PASS**; approval schema is safe-metadata-only and production UI-runtime sentinel plaintext is absent from approval rows, audit rows, DB/WAL/SHM, and built renderer
- automated built production MCP + real Desktop controller/IPC acceptance: **PASS** using temporary data only; proved exact ten tools, no approval MCP tool, safe pending list, Approve/Deny, exact retry, one-time consumption/fresh repeat approval, sensitive Git diff, and no sentinel leakage
- built production Activity UI path smoke: **PASS** with exactly one scripted Approve click and one scripted Deny click through renderer → preload → production IPC; Audit Activity and Overview/Connection navigation remained usable
- expiry tests use a controlled trusted clock for pending and approved expiry

### Basic Approval final review

Repo-local `code-review` routing was applied against task-start baseline `4f4c849d655106112dd8dedbeb9119cedde8e5fc`; Standards and Spec axes were executed separately in-session.

- **Standards:** PASS, no blocking findings. Security/Data Critical gates, fail-closed Policy/Approval/Audit ordering, secret-safe persistence/IPC, fixed-purpose Desktop authority, deep trusted seams, existing Workspace/Git security invariants, test economy, and `.serena/` local-only requirements are satisfied.
- **Spec:** PASS, no blocking findings. The required state model, one-time exact keyed binding, TTL/queue/list bounds, runtime invalidation, Desktop Activity Approve/Deny flow, safe MCP result/retry model, Workspace/Git ASK cases, atomic consume/audit failure semantics, exact ten-tool surface, confidentiality gates and production acceptance satisfy the Basic Approval task. No Restricted Execute scope was added.

### Basic Approval known limitations

- Approval grants intentionally do not survive Gateway restart; prior pending/approved requests become unusable.
- Personal Alpha keeps one local Desktop approver only; there is no remembered permission, multi-user/RBAC, mobile/cloud approval, notification/tray flow, or broad grant.
- Restricted Execute remains **NOT STARTED** and must be separately authorized/reviewed before any shell/process approval surface exists.

### Basic Approval implementation commit

`de42f5f4be99cf446e0af412947c7e3e3ce42689` — `feat: complete Basic Approval`

**Git Safety + Integration**

**Status: COMPLETE — four bounded local Git Safety capabilities route through the M1 Tool Kernel, production MCP exposes exactly ten approved tools, checkpoint plumbing preserves user Git state, isolated built-stdio acceptance passed, and final Standards/Spec review found no blockers on 2026-09-01.**

Production MCP now exposes the existing six Personal Alpha workspace tools plus exactly:

- `git.detect`
- `git.status`
- `git.diff`
- `git.checkpoint`

All four Git capabilities follow `MCP Gateway → Tool Kernel → validation/security resolution → Policy → dedicated Git adapter → Audit`. The caller cannot choose the repository root, executable, Git subcommand/argv, cwd, environment, config flags, `.git` path, ref name, commit message/author, remote, URL, or any generic process surface.

### Git Safety topology / adapter decisions

- Supported repository topology is deliberately narrow: a normal local non-bare repository whose canonical top-level is exactly the active SUD-D Workspace root.
- Parent-repository walking is not used. A Workspace nested under an outer repository is treated as not-a-repository for this slice; bare repositories, external/linked gitdirs/worktrees, and unborn HEAD are unsupported/fail-safe.
- The dedicated adapter resolves only trusted Program Files `git.exe` locations and uses `shell: false`, fixed command plans, active-Workspace cwd, sanitized environment/config, 10-second per-process timeout, and bounded stdout/stderr buffers.
- Trusted Git runtime neutralizes repository/user execution paths: isolated empty hooks path, `protocol.allow=never`, fsmonitor disabled, credential helper cleared, signing disabled, pager disabled, terminal/askpass prompts disabled, empty PATH, and isolated HOME/global/system config.
- `git.status` uses porcelain-v2 structured output, deterministic ordering, an opaque SHA-256 `statusId`, sensitivity flags, special-state reporting, and a 500-entry hard checkpoint-safe bound.
- `git.diff` is tracked-path only and credential-safe. It builds a raw-byte snapshot in an isolated index/object directory, hashes with `--no-filters`, and runs object-to-object `diff-tree` with external diff/textconv/renames/color disabled. Broad diff omits credential-like paths; at Git Safety milestone completion direct credential-targeted diff returned `APPROVAL_REQUIRED`. The current Basic Approval state above now permits only an exact one-time approved retry.
- `git.checkpoint` is not a normal branch commit. It seeds an isolated index from HEAD, snapshots current safe regular-file bytes, hashes with `--no-filters`, writes a tree, creates a fixed-message unsigned commit object, and creates only a generated append-only `refs/sud-d/checkpoints/<uuid>` via `update-ref <new> <old=zero>`.
- Checkpoint revalidates `statusId`/HEAD, repository operation state, sensitivity, gitlinks, user index fingerprint, file digests/deletions, and conflicting Git locks before final ref creation. It does not move HEAD/branch, alter the user index/staging state, or modify worktree files.
- Credential-like changed paths are classified before checkpoint object persistence. At Git Safety milestone completion they blocked as `APPROVAL_REQUIRED` with no secret blob/ref; the current Basic Approval state above permits persistence only after an exact one-time approved retry.
- `.git` remains denied through generic workspace file tools.

### Git Safety hard bounds

- changed/checkpoint paths: **500**
- diff output: **256 KiB**
- one checkpoint regular file: **8 MiB**
- aggregate checkpoint file bytes: **32 MiB**
- default captured Git output: **2 MiB**
- per trusted Git process timeout: **10 seconds**

### Git Safety verification / acceptance

Fresh stable final evidence:

- focused Git Safety tests: **37/37 passed** across four split test files with clean Vitest exit 0
- relevant Personal Alpha + M1 + policy/classifier/path/audit + M0.4/M0.5 regressions: **192/192 passed**
- typecheck: **PASS**
- lint: **PASS**
- full suite: **320/320 passed** across 14 test files
- build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop production bundles
- `git diff --check`: **PASS**
- staged changed-surface secret scan: **PASS** across 2,183 added lines; no real credential/private-key signatures detected
- malicious/temp artifact scan: **PASS**
- Vitest `onTaskUpdate` issue: **RESOLVED AS TEST-RUNNER/HARNESS BATCHING**, not product behavior. All 37 security assertions were preserved; splitting the long synchronous Git suite into four test files plus a typed shared harness produced clean exit 0 without skips/disabled tests.
- isolated real built-stdio production acceptance: **PASS** using temporary `%LOCALAPPDATA%`, SQLite, and Git repositories. It proved SUD-D initialize, exact ten-tool `tools/list`, detect/status/diff/checkpoint success, checkpoint ref/tree/parent correctness, HEAD/branch/index/worktree preservation, credential diff/checkpoint blocking, no malicious hook/filter/fsmonitor/signing/helper/alias/remote marker execution, traversal blocking, no parent-repo escape, and no Delete/Execute/Network/remote Git tool exposure.
- external Home Secure Tunnel repeat: **NOT REQUIRED / NOT RUN**; task explicitly permits local built stdio acceptance unless final review finds it insufficient, and final review did not.

### Git Safety final review

Repo-local `code-review` routing was applied against task-start baseline `fc51e951c95754ef9d4aa5925ab82ac19a7903bf`; this harness has no parallel subagent runtime, so Standards and Spec axes were executed separately in-session.

- **Standards:** PASS, no blocking findings. Security/Data Critical gates, Tool Kernel/Policy/Audit routing, fixed trusted process boundary, fail-closed path/topology handling, bounded operations, test economy, and `.serena/` local-only requirements are satisfied. No blocking Fowler smell was found; the deep Git adapter remains cohesive around one privileged boundary rather than becoming a generic runner.
- **Spec:** PASS, no blocking findings. The four approved capabilities, exact active-Workspace topology, safe status/diff/checkpoint semantics, hidden-execution hardening, credential handling, stale/race protection, hard bounds, audit/redaction, exact production MCP surface, regression matrix, and isolated real acceptance satisfy the Git Safety task. At that milestone Basic Approval/Restricted Execute/Team Mode and network Git were out of scope; the current state above records the later Basic Approval completion while Restricted Execute/Team Mode/network Git remain unimplemented.

### Git Safety known limitations

- Windows-first only: the trusted executable resolver intentionally accepts Git for Windows only from fixed Program Files locations.
- Credential-sensitive Git diff/checkpoint operations remain approval-gated. The current Basic Approval state above enables only exact one-time approved retries; no broad Git permission exists.
- No remote/network Git, branch mutation, normal commit/amend/reset/checkout/merge/rebase/cherry-pick/tag/stash, submodule mutation, linked-worktree support, or generic Git runner exists.
- Failed checkpoint attempts after safe non-sensitive blob/commit plumbing may leave ordinary unreachable Git objects until normal Git garbage collection; no SUD-D checkpoint ref, HEAD/branch/index/worktree mutation is created on those failures, and credential-like paths are blocked before object persistence.

### Git Safety implementation commit

`6bc621435c0b44539c14a3797018f53a8fb729fb` — `feat: add Git Safety integration`

### Prior completed slice — Personal Alpha Workspace File Tools — Read / Search / Write

**Status: COMPLETE — six workspace-bound production MCP file capabilities, active-Workspace trust binding, Windows path hardening, bounded text-only I/O, credential-safe Policy blocking, isolated production acceptance, and final review passed 2026-09-01.**

At the completion of this prior slice, production MCP exposed exactly the six workspace tools below; the current Git Safety state above has since extended production exposure to ten approved tools.

- `workspace.list`
- `workspace.stat`
- `workspace.read_text`
- `workspace.search_text`
- `workspace.create_text_file`
- `workspace.write_text_file`

Every capability routes through the completed M1 Tool Kernel. The active SUD-D Workspace is the trusted root; callers provide only workspace-relative paths and cannot choose roots, effects, sensitivity, policy, handlers, executable/argv/cwd/env, or other host controls.

### Personal Alpha security / data decisions

- Existing `validateRelativePath(...)`, canonicalization, `path.relative` containment, InternalRoot guard, and reparse-point denial remain authoritative; no string-prefix containment was introduced.
- Generic file tools deny `.git` traversal entirely and hide internal sibling mutation temp files.
- Reads/search are UTF-8 text-only and reject/skip binary or unsupported resource types.
- Hard bounds: relative path 1,024 chars; text read/write/create 256 KiB; directory list 200 entries; search query 256 chars; search 2,000 visited entries / 8 MiB scanned / 100 matches / 240-char preview.
- Search is literal/deterministic, remains inside the validated subtree, and skips credential-like resources, `.git`, binary content, reparse entries, and internal mutation files.
- `create_text_file` fails if the target exists; `write_text_file` fails if the target is missing/non-regular. Writes use a sibling temp file plus authorization recheck before replacement; no Delete/rename/move API was exposed.
- Baseline Policy received one narrow correction: credential `create`, like credential read/modify, is `ASK`. At this prior slice's completion Basic Approval was not yet implemented, so credential read/create/write returned `APPROVAL_REQUIRED` with no filesystem operation; the current Basic Approval state above now enables only exact one-time approved retries.
- Audit remains content-free through M1 Kernel semantics: no raw file contents, write payloads, environment/process data, raw OS errors/stacks, or credential-like fixture values are persisted/returned as audit metadata.
- At this prior slice's completion, production MCP schemas were strict/minimal and exposed only the six workspace capabilities. The current state above supersedes that historical exposure by adding exactly the four approved Git Safety tools; Delete, Execute/process/shell, Network, secrets/vault, Team Mode, generic filesystem, and renderer filesystem shortcuts remain absent.

### Verification / acceptance

Fresh stable final evidence:

- focused Personal Alpha file-tool tests: **50/50 passed**
- relevant Personal Alpha + M1 + baseline policy/classifier/path/audit + M0.4/M0.5 regressions: **191/191 passed**
- typecheck: **PASS**
- lint: **PASS**
- full suite: **283/283 passed** across 10 test files
- build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop bundles
- `git diff --check`: **PASS**
- changed-surface secret scan: **PASS**
- isolated real built-stdio production acceptance: **PASS** — SUD-D identity, exact six-tool `tools/list`, list/read/search/create/write success, traversal blocked, credential read/write `APPROVAL_REQUIRED` with no mutation/leakage, forbidden tools absent
- external Home Secure Tunnel repeat: **NOT REQUIRED / NOT RUN**; the isolated built stdio acceptance directly exercised the newly changed production capability boundary without reusing the Serena development tunnel

### Final review

User-supplied `code-review` workflow was applied against fixed point `0b0d02764e3fa88ea0adcb786790be2ec57bcffd`; subagents are unavailable in this harness, so the repository-permitted fallback ran the two axes separately in-session.

- **Standards:** PASS, no blocking findings. Review confirmed active-workspace binding/revalidation, fail-closed path/security behavior, existing Windows path hardening reuse, `.git` denial, bounded text-only I/O, safe mutation recheck, content-free audit, strict MCP schemas, and no process/network/renderer host-control surface. No blocking Fowler smell was found; larger file-adapter size is proportional to the six tightly related file operations rather than speculative generality.
- **Spec:** PASS, no blocking findings. The required production capability list, Tool Kernel routing, 48 acceptance seams, credential-create correction, exact production exposure, isolated acceptance, and OUT OF SCOPE exclusions were covered. At that milestone boundary Git Safety + Integration was still **NOT STARTED**; the current state above records its later completion.

### Known limitations

- Credential-like file operations remain approval-gated; the current Basic Approval state above enables only exact one-time approved retries and no broad permission.
- Full Recovery/versioning is deferred; Personal Alpha uses safe bounded writes and Git-backed committed state as the temporary rollback baseline, but this slice does not execute Git.
- File tools are intentionally text-first and Windows-only; no arbitrary binary API, delete, rename/move, generic glob/regex process, or cross-platform expansion was added.

### Implementation commit

`e02c53bf77d449af6d6340e55e87f6e9c8688422` — `feat: add personal alpha workspace file tools`

## M1 Tool Execution Kernel

- Added compact domain vocabulary for tool invocation identity, resolved security context, execution context, kernel outcomes/result codes, and deterministic registry errors.
- Added an application-level trusted capability definition/registry. A registered definition owns fixed capability name, `Effect`, input validation, trusted security resolution, and the bound execution handler.
- Untrusted invocation input cannot select or override effect, sensitivity, workspace/outside/internal/network context, policy decision, approval result, handler/executor, executable, argv, cwd, or env.
- Kernel ordering is fixed: registry lookup → validation → trusted security resolution → established `evaluatePolicy(...)` baseline → mandatory pre-execution audit → trusted handler → outcome audit.
- `deny` never executes. `ask` returns typed `APPROVAL_REQUIRED` and never executes in M1; no fake approval or approval persistence/UI was introduced.
- Unknown capability, invalid input, security-resolution failure, malformed/exceptional policy evaluation, executor exception/failure, and audit failures all fail closed through sanitized typed outcomes without raw exception/stack/input leakage.
- Pre-execution audit failure prevents execution. Post-execution audit failure reports an `executed` outcome with `AUDIT_OUTCOME_FAILED` so an already-executed operation is not retried by the Kernel.
- Audit evidence records safe capability/session/policy/result/outcome/duration metadata only; raw tool inputs, credentials, env, stdout/stderr, commands, argv, cwd, and raw exceptions are not serialized.
- Duplicate/invalid trusted registration fails deterministically instead of shadowing a capability.
- Test-only deterministic capabilities prove execution behavior. No production Read/Search/Write, Delete, Git, Approval, Execute/process, shell, network, Team Mode, or other privileged tool was added.
- `packages/mcp-gateway` production composition/source is unchanged and remains inert.

### Verification / Acceptance

Fresh final M1 evidence:

- focused M1 tests: **18/18 passed**
- relevant M1 + baseline policy/classifier/audit + inert MCP Gateway regressions: **118/118 passed**
- full suite: **233/233 passed** across 9 test files
- typecheck: **PASS**
- lint: **PASS**
- build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop production bundles
- production real stdio MCP regression: **PASS** — initialize succeeds and `tools/list = []`
- `git diff --check`: **PASS**
- changed-surface secret scan: **PASS**
- real external Secure Tunnel smoke: **NOT REQUIRED / NOT RUN** because connection/runtime code did not change and production Gateway remains inert

### Final Review

Repository-routed `domain-modeling`, `grilling`, and `code-review` workflows were applied using the user-supplied local skill archive under the repository's no-vendoring rule.

- **Standards:** PASS, no blocking findings. Review confirmed fail-closed ordering, fixed baseline policy invocation, no public policy override seam, no raw-input audit serialization, no generic process/network/env host-control surface, deterministic registry failure, and correct pre/post audit semantics.
- **Spec:** PASS, no blocking findings. The focused test matrix covers all 18 required M1 seams; production MCP remains inert and all OUT OF SCOPE Personal Alpha/File/Git/Approval/Execute/Team Mode capabilities remain absent.
- **Review fix resolved before completion:** an initially exposed trusted-composition `policyEvaluator` override seam was judged broader than necessary. It was removed so the Kernel always calls the established `evaluatePolicy(...)` path directly; affected focused/typecheck/full final gates were rerun successfully.

### Known Limitations

- M1 intentionally has no approval implementation. Policy `ask` remains a typed blocked/approval-required result until the later Basic Approval slice is explicitly authorized.
- M1 intentionally exposes no useful production MCP tools. The next approved roadmap slice is Personal Alpha Workspace File Tools — Read / Search / Write, but it is **NOT STARTED** and requires a new explicit implementation instruction.
- The existing M0.5 production client-connected signal limitation remains unchanged and unrelated to M1.

### Implementation Commit

`66ae28bdd809fadecc2e49c424de7a60bd7d7435` — `feat: complete M1 tool execution kernel`

## Post-M0.8 Connection UI/UX Simplification

- `connection:tunnelSetup` remains one fixed-purpose IPC path and now accepts only strict `{ profileId, tunnelReference }`; the Tunnel ID must match `^tunnel_[A-Za-z0-9_-]+$` with length 8–500.
- Tunnel configuration persists through the existing `ConnectionConfigService.updateProfile()` path and may change only while the connection runtime is `stopped`.
- Renderer snapshots continue to expose only `tunnelConfigured`; the stored raw Tunnel ID is not returned.
- No executable, argv, cwd, environment map/name/value, generic process control, or secret payload was added to renderer IPC.
- Legacy `CONTROL_PLANE_TUNNEL_ID` remains only as the existing trusted-backend seed for a missing reference and does not overwrite a persisted non-empty value.
- Runtime API Key handling is unchanged and remains Windows Credential Manager-backed with no plaintext renderer/IPC getter.
- Connection primary CTA order is Workspace → Runtime API Key → Secure Tunnel → Connect; active/waiting states use Disconnect, and Restart is shown only where existing ConnectionService semantics allow it.
- Overview remains glance-only and routes setup into the same Workspaces/Connection flows.
- The existing production `client_connected` limitation remains; no fake `Connected` state was synthesized.
- No tunnel process/runtime adapter, MCP Gateway behavior, privileged tools, or M1 implementation changed.

### Verification / Acceptance

Fresh completion evidence:

- focused M0.6 Connection/UI tests: **26/26 passed**
- relevant secure Runtime API Key + M0.5 tunnel/runtime + M0.6 Connection/UI regressions: **68/68 passed**
- full suite: **215/215 passed** across 8 test files
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for domain, contracts, infrastructure, application, MCP Gateway, and Desktop renderer/main/preload production bundles
- `git diff --check`: **PASS**
- changed-surface secret scan: **PASS**
- production Desktop UI smoke: **PASS** — isolated production bundle showed readiness cards, accepted a Tunnel ID through UI/strict IPC, persisted it without returning the raw value, and advanced the primary CTA to `Connect ChatGPT`
- real external tunnel/runtime acceptance was **not repeated** because the process/runtime boundary and lifecycle semantics did not change; M0.5 runtime regressions remained green

### Final Review

The repository-routed canonical `code-review` skill was not exposed in this runtime. The established fallback used the available review methodology plus separate Standards and Spec passes.

- **Standards:** no blocking finding. Renderer trust boundaries remain narrow, tunnel mutation is stopped-only, raw Tunnel ID is absent from renderer snapshots/audit metadata, API-key plaintext remains outside renderer IPC/state, and no generic env/process control was introduced.
- **Spec:** no blocking finding. First-time and returning-user flows match the requested status-first setup direction, Overview reuses the same flows, lifecycle controls follow existing service semantics, and fake ChatGPT telemetry was not introduced.

### Known Limitation

The existing M0.5 production client-connected signal is still not wired, so a healthy real runtime can remain `waiting_for_client`; this task intentionally does not synthesize `Connected`.

## Post-M0.8 Secure Runtime API Key Setup

SUD-D now provides a Windows-first persistent Runtime API Key boundary without requiring PowerShell or user-managed environment configuration for normal setup:

- `connection:credentialSetup` and `connection:credentialRemove` are fixed-purpose renderer actions with strict `{ profileId }` schemas; secret/process-shaped extra fields are rejected.
- The renderer never sends an API Key string, never receives a plaintext credential, and exposes only `credentialStatus = configured | missing`.
- Electron main uses `ConnectionConfigService` and a managed credential-store boundary backed by Windows Credential Manager.
- The native setup action uses a Windows credential prompt and writes the credential directly to Windows Credential Manager; no credential getter or generic vault IPC exists.
- Set / Replace / Remove are allowed only while the connection runtime is `stopped`; active states fail closed with safe guidance to disconnect first.
- Runtime start prefers a stored Windows credential, then an already-derived session credential, then legacy backend `CONTROL_PLANE_API_KEY` as a session-only fallback. Legacy environment credentials are never copied into Windows Credential Manager automatically.
- Secure Tunnel generated profiles continue to reference the fixed derived environment variable; plaintext keys do not enter SQLite, profile persistence, argv, renderer DTOs, audit metadata, or normal errors.
- Remove deletes the Windows-stored credential and derived session value without retrieving the old secret. If a legacy backend environment fallback still exists, effective renderer status correctly remains `configured` and audit does not falsely claim `missing`.
- Koffi `3.1.6` is used only inside the trusted infrastructure/main-process boundary to call the fixed Win32 CredUI / Credential Manager APIs. The native loader remains external in the Electron main bundle and is declared as a Desktop runtime dependency so its prebuilt Windows binary resolves correctly.

### Verification / Acceptance

Fresh final verification after the final audit-correctness fix:

- focused secure Runtime API Key tests: **18/18 passed**
- full suite: **214/214 passed**
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for all packages and Desktop renderer/main/preload bundles
- `git diff --check`: **PASS**
- isolated Windows Credential Manager integration: **PASS** for write → materialize → delete with cleanup
- manual production native-prompt smoke: **PASS** — `Replace API Key` launched the native Windows prompt; user Cancel returned safely without crash, renderer action recovered, no password input/raw credential text appeared, test Electron processes were cleaned, and no isolated `SUD_D/Test` credential targets remained
- secret scan: **PASS** — no configured environment credential/tunnel values, derived credential values, long `sk-...` token patterns, or private-key markers found in the source/doc diff

### Final Review

The repository-routed canonical `code-review` skill was not exposed in this runtime. Final review therefore used the established repository fallback: installed `requesting-code-review` methodology plus separate Standards and Spec passes over the working-tree diff.

- **Standards:** no blocking findings after review. Renderer/IPC trust boundaries remain narrow, credential storage is Windows-native, secret-bearing values are not persisted or surfaced, native FFI is internal-only, and packaging keeps the Koffi native loader external and resolvable.
- **Spec:** one blocking correctness finding was found and fixed before completion: credential removal audit previously claimed `status: missing` even when legacy environment fallback kept the effective credential configured. A RED regression test was added, the audit metadata was corrected, and all final gates were rerun successfully.

### Known Issue / Compatibility Note

- Legacy `CONTROL_PLANE_API_KEY` remains supported as a backend session-only migration/development fallback. Removing a Windows-stored credential does not modify a User environment variable; therefore effective status can remain configured until that legacy environment configuration is removed outside SUD-D.
- The existing M0.5 production client-connected signal limitation remains unchanged: the runtime can remain `waiting_for_client` until a real client-connected signal is wired in a future separately approved task.
- Historical note: Connection UI/UX Simplification was the next requested task after this credential foundation and is now complete as recorded above. M1 remains not started.

## M0.8 Status

### Secure Tunnel Setup UX / Root Cause

The pre-M0.8 Connection UI could show `Tunnel setup = Missing` even after `CONTROL_PLANE_TUNNEL_ID` had been configured at User scope when the running Electron process predated that environment change. The profile stored no tunnel reference yet, while the renderer-facing setup action still expected the user to paste a raw tunnel reference.

M0.8 keeps the existing fixed `connection:tunnelSetup` path but makes it fixed-purpose end to end:

- `DesktopConnectionTunnelSetupInput` now accepts only `profileId`; strict validation rejects tunnel references, env, credentials, executable, argv, cwd, and other extra fields.
- `DesktopConnectionController.configureTunnel()` resolves `CONTROL_PLANE_TUNNEL_ID` only from the trusted backend process environment and persists it through the existing `ConnectionConfigService.updateProfile()` boundary.
- plaintext `CONTROL_PLANE_API_KEY`, raw environment state, and the raw tunnel reference are never returned to the renderer.
- Connection shows a non-technical **Set up Secure Tunnel** action when credential state is configured but tunnel setup is missing.
- when the current SUD_D process cannot see a recently configured tunnel environment value, the action returns the safe guidance `Restart SUD-D to load the tunnel configuration.`
- after setup is persisted, the renderer sees only `tunnelConfigured: true`, displays `Secure Tunnel is ready.`, and enables **Connect ChatGPT** when workspace/credential prerequisites are also ready.
- Overview routes its tunnel-setup CTA into the same Connection flow; no second setup API was introduced.
- the auxiliary Restart button is now gated to `connected | degraded | error`, matching the states accepted by `ConnectionService.restart()` instead of offering Restart during transient states such as `waiting_for_client`.

### Windows Stop Acceptance Fix

Real M0.8 acceptance found a Windows process-tree race in the existing fixed internal `taskkill.exe /T /F` cleanup. `taskkill` can return a non-zero status when a descendant disappears during tree termination even though the owned tunnel-client root PID has already exited. The previous adapter interpreted that race as `TUNNEL_STOP_FAILED`, followed by `TUNNEL_EXITED_UNEXPECTEDLY`.

The launcher now treats a non-zero `taskkill` result as failure only when the owned root PID is still alive. This remains a fixed internal process boundary: renderer input cannot select the executable, PID, arguments, cwd, or environment, and actual surviving-process failures remain fail-closed.

### M0.8 Home-PC Acceptance

Fresh production-bundle acceptance on Home-PC verified:

1. active workspace configured
2. `CONTROL_PLANE_API_KEY` configured without exposing plaintext
3. dedicated SUD_D Home tunnel configured; Serena tooling tunnel was not reused
4. production runtime start reaches `Waiting for ChatGPT` after local tunnel readiness
5. `tunnel-client health --require-control-plane-poll` observes a real successful OpenAI control-plane poll
6. generated SUD_D-owned tunnel profile targets the fixed `packages/mcp-gateway/dist/stdio-entry.js`
7. MCP `initialize` returns server identity `SUD-D`
8. `tools/list` returns `[]`, preserving the inert M0 gateway
9. direct Disconnect produces a clean stopped state
10. a fresh start after stop again reaches real control-plane/tunnel readiness and the SUD_D Gateway remains available

The local acceptance harness used `CONTROL_PLANE_POLL_TIMEOUT=2s` only in the child-process test environment to shorten the default long-poll wait; production source, tunnel identity, endpoint, credential scope, and security policy were not changed for the acceptance.

### M0.8 Security Boundaries

- Renderer setup input is `profileId` only; no arbitrary tunnel ID or raw environment input crosses IPC.
- Renderer still cannot select executable, argv, cwd, env, PID, or generic process operations.
- At M0.8 completion, credentials remained session-only/environment-backed and were exposed to UI only as `configured | missing`; the post-M0.8 Secure Runtime API Key Setup section above supersedes that storage limitation with Windows Credential Manager while preserving the same renderer-facing status boundary.
- Tunnel reference persistence continues through the existing non-secret connection-profile repository; renderer snapshots expose only `tunnelConfigured`.
- Connection-profile audit metadata does not include tunnel reference or credential values.
- The dedicated Home-PC SUD_D tunnel is resolved only from the configured backend reference; production code does not select or infer a tunnel by name and does not reuse the Serena tooling profile.
- MCP Gateway remains inert with zero privileged tools. M1 policy/tool execution was not started.

### M0.8 Verification Results

Fresh verification after the final lifecycle/UI fixes:

- focused M0.5 + M0.6 tests: **49/49 passed**
- remaining M0 regression (M0.1–M0.4 + M0.7): **147/147 passed**
- full suite: **196/196 passed**
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for all packages and Desktop production bundles
- `git diff --check`: **PASS**
- Desktop production smoke: **PASS** with persisted Secure Tunnel setup, safe configured-state UI, and enabled Connect action
- real Home-PC M0.8 acceptance: **PASS** for control-plane poll, dedicated SUD_D tunnel, gateway target, MCP identity, inert `tools/list`, clean stop, and fresh start

### Required M0.8 Code Review

Final review used the attached `code-review` skill methodology against fixed baseline `6826f86df3944e51d6ad21755e21c60e5f8f45f7`, with separate Standards and Spec passes over the working-tree diff before commit.

- **Standards:** no blocking finding. Strict IPC and secret boundaries remain intact; the Windows stop compatibility change stays inside the fixed internal runtime adapter. Minor duplicated tunnel-setup presentation conditions between Overview and Connection are a judgement-call smell and were intentionally not refactored outside M0.8.
- **Spec:** no blocking finding after fixes. Acceptance discovered and closed the `taskkill` tree-race stop failure and the Restart-button/transient-state mismatch. The implementation reuses the existing M0.6 setup channel/service path and does not introduce generic tunnel/process configuration or privileged MCP behavior.

### M0.8 Known Issues / Open Questions

- The existing M0.5 client-connected signal seam is still not wired across the production tunnel-client process, so ConnectionService remains `waiting_for_client` instead of synthesizing a false `connected` state. M0.8 did not invent telemetry to hide that limitation.
- Historical note: credential storage was still session-only/environment-backed at M0.8 completion. The post-M0.8 Secure Runtime API Key Setup section above now supersedes this limitation with Windows Credential Manager persistence while preserving the no-plaintext-persistence/no-getter rules.
- Further Connection UI/UX simplification is intentionally deferred to the separate post-M0.8 UX task requested by the user; M1 is not part of that work.

## M0.7 Status

Implemented the approved Doctor + Activity integration without adding a new runtime boundary or telemetry subsystem.

### M0.7 Files Added / Changed

- `packages/contracts/src/index.ts` — typed/sanitized Doctor DTOs plus strict read-only Activity DTO/input contract and `activity:list` IPC channel.
- `packages/desktop/electron/diagnostics-controller.ts` — bounded read-only Doctor and Activity mapping over existing repositories, ConnectionService, and Secure Tunnel runtime status.
- `packages/desktop/electron/diagnostics-ipc.ts` — sender-validated Doctor/Activity IPC handlers with strict Zod validation.
- `packages/desktop/electron/main.ts` — wires real diagnostics dependencies and makes renderer `workspace:list` a read-only repository query so periodic Overview refresh does not create audit spam.
- `packages/desktop/electron/preload.ts` and `packages/desktop/src/global.d.ts` — expose only typed read-only Activity access; no raw diagnostics/log/process surface.
- `packages/desktop/src/pages/DoctorPage.tsx` — status-first Environment / Doctor summary and actionable safe checks.
- `packages/desktop/src/pages/ActivityPage.tsx` — newest-first readable Activity view backed by real audit events and minimal renderer-safe metadata.
- `packages/desktop/src/index.css` — narrow styling additions for Doctor/Activity using the existing M0.6 visual system.
- `packages/infrastructure/src/audit-repository.ts` — strengthens persistence redaction for raw environment/payload/process-shaped metadata and supports parameterized action exclusion before query `LIMIT`.
- `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` — adds fixed-purpose read-only availability checks for the trusted tunnel client and fixed MCP Gateway entrypoint.
- `packages/tests/src/m0.7.test.ts` — focused Doctor/Activity, redaction, no-spam, IPC, and renderer-surface coverage.
- `SUD_D_HANDOFF.md` — records M0.7 completion while preserving the approved Team Mode / North Star documentation.

`SUD_D_ROADMAP.md` was not changed by M0.7 because this milestone implements already approved integration scope and introduces no new architecture decision. The Team Mode / Personal AI Team Harness direction from the preceding Codex documentation commit remains unchanged.

### Doctor Integration

Environment / Doctor now reports real bounded local readiness for:

- application data directory writability
- SQLite readiness
- active workspace selection and root validity
- local connection-profile presence
- credential `configured | missing` state only
- Secure Tunnel reference configured/missing state without returning the reference
- fixed MCP Gateway entrypoint availability
- trusted `tunnel-client` availability
- ConnectionService runtime state
- gateway/tunnel/client presentation derived only from existing runtime/service status

Doctor output uses strict typed `healthy | warning | error` checks, short safe messages, and optional actionable guidance. Typed runtime failures are mapped to fixed user-facing text; raw runtime error messages, stack traces, credentials, environment values, commands, argv, and control-plane payloads are not forwarded to the renderer.

### Activity Integration

Activity reuses the existing audit repository and displays only real stored events. Existing connection/tunnel lifecycle actions receive readable presentation, including:

- `connection.start.requested`
- `connection.started`
- `connection.stop.requested`
- `connection.stopped`
- `connection.failed`
- `tunnel.ready`
- `tunnel.failed`

No gateway/client event was invented where no real audit source exists. Renderer-facing Activity metadata is allowlisted to safe `operation` and connection `state` values only.

Historical read/poll noise (`workspace:list`, `connection-profile:list`, `connection-profile:read`, `credential:status`) is excluded from the Activity query before `LIMIT`, so noise cannot starve meaningful lifecycle events. The underlying audit history is not deleted. Doctor/Activity refresh itself is read-only and does not append audit events.

### IPC / Contracts Changes

- Doctor continues to use the fixed `doctor:check` action with a richer strict typed DTO.
- Activity uses new fixed read-only `activity:list` with strict `{ limit }` input.
- Sender validation follows the existing Desktop pattern.
- Renderer cannot supply executable, command, argv, cwd, env, raw-log, or secret fields.
- No generic diagnostics command or process runner was added.

### Security / Redaction Decisions

Audit persistence still redacts the existing password/secret/token/API-key/auth/credential/private-key patterns and now also redacts keys representing environment, payload, raw data, stdout, stderr, command, argv, and cwd. Activity adds a second renderer boundary by allowlisting only minimal safe details.

The availability checks added for Doctor are fixed-purpose and deterministic: the tunnel client uses the existing trusted resolver, and MCP Gateway availability checks only the fixed SUD_D `stdio-entry.js` path. No renderer-controlled executable/arguments and no new network probe were introduced.

### M0.7 Tests

Focused M0.7 coverage contains **12 tests**, including:

1. healthy Doctor component/status mapping
2. fixed safe runtime-error mapping without raw error leakage
3. actionable missing workspace/profile/credential/tunnel setup states
4. real lifecycle Activity mapping with safe metadata allowlist
5. readable mapping for all currently sourced connection/tunnel lifecycle events
6. renderer read/poll noise filtering without deleting audit history
7. noise exclusion before query `LIMIT` so meaningful events are not starved
8. persistence redaction for raw payload/environment/process-shaped metadata
9. Doctor/Activity refresh does not append audit events
10. renderer workspace polling bypasses the audited WorkspaceService list use case
11. strict Activity IPC rejects arbitrary process-control payloads
12. renderer diagnostics surfaces expose no arbitrary command/process controls

TDD RED→GREEN evidence was observed for the two closing bugs: renderer `workspace:list` polling originally routed through the audited WorkspaceService, and Activity originally filtered historical noise only after the query `LIMIT`.

### M0.7 Verification Results

Fresh verification after the final code-review fix:

- M0.7 focused tests: **12/12 passed**
- M0.1–M0.6 regression: **178/178 passed**
- lint: **PASS**
- typecheck: **PASS**
- full suite: **190/190 passed**
- build: **PASS** for all packages and Desktop production bundles
- `git diff --check`: **PASS**

### M0.7 Desktop Smoke Result

**PASS** from the production Desktop bundle. CDP-driven smoke navigation verified:

- `Environment / Doctor` opens, its endpoint succeeds, and the status UI renders
- `Activity` opens, its endpoint succeeds, and recent-event UI renders
- existing `Connection` page still opens and renders `OpenAI Secure MCP Tunnel`
- application title remains `SUD-D Control Center`

M0.7 did not change the tunnel/gateway runtime lifecycle, so the heavyweight external Secure Tunnel acceptance from M0.5 was not repeated.

### Required M0.7 Code Review

Final review used two independent axes against fixed baseline `12ff6122b7f1ff4281524da405640359ba243e7a`. The exact external `code-review` skill resource was not exposed by the active Home-PC runtime during the resumed session; this limitation was reported before review. The installed `requesting-code-review` workflow plus the repository-required Standards/Spec checklist was used without weakening any required review criterion.

- **Standards:** no blocking finding after final verification. Security invariants, strict IPC, bounded diagnostics, redaction, and milestone scope remain intact. Minor duplication in diagnostic/presentation mapping is a judgement-call cleanup and was intentionally not refactored outside M0.7.
- **Spec:** one blocking finding was found and fixed: Activity originally filtered polling noise after `LIMIT`, allowing historical polling records to hide meaningful lifecycle events. Exclusion now occurs in the parameterized audit query before `LIMIT`, with RED→GREEN regression coverage. Final Spec review has no blocking finding.

### M0.7 Known Issues / Open Questions

- Activity intentionally shows only events with real existing audit sources. Gateway-start/client-connect lifecycle events are not synthesized; they can be added only when a future approved milestone provides a real source.
- M0.7 does not activate M0.8 end-to-end acceptance and does not change the existing M0.5/M0.6 runtime limitations recorded below.

### Recommendation for M0.8

Historical M0.7 handoff recommendation: M0.8 should validate the already implemented connection path while preserving the inert MCP Gateway and security boundaries. M0.8 was subsequently completed in the milestone recorded above without introducing privileged tools or new product scope.

## M0.6 Status

Implemented:

- status-first Desktop navigation: Overview, Workspaces, Connection, Activity, Security, Recovery, Environment / Doctor
- Overview cards for This Device, ChatGPT connection status, active workspace, baseline security summary, pending-approval placeholder, recent activity, and Recovery placeholder
- Connection page backed by the existing real `ConnectionService` and production Secure Tunnel runtime through a narrow controller + validated IPC boundary
- fixed lifecycle actions only: status, start, stop, restart, Secure Tunnel setup, and safe preference update
- renderer-safe snapshots that expose only configured/missing credential status and `tunnelConfigured`; plaintext credentials and raw tunnel references are not returned
- strict `autoStart` / `autoRestart` preference update contract accepting only `profileId` plus two boolean flags; executable/argv/cwd/env/secret fields are rejected
- auto-start / auto-restart are **saved preferences only** in M0.6; automatic lifecycle execution is not activated by this milestone
- active-workspace rebind/removal protection while a connection session is active
- Recovery page as an honest informational placeholder only; no recovery engine is implemented
- light neutral, card-based UI with technical details hidden behind an expandable Advanced section
- audit-neutral renderer status polling after initial local profile/credential bootstrap, avoiding repeated audit writes from unchanged status reads
- bundled Electron-safe fixed MCP Gateway entry-path resolution discovered through the production smoke test

### M0.6 Files Added / Changed

Primary M0.6 paths:

- `packages/contracts/src/index.ts`
- `packages/application/src/connection-config-service.ts`
- `packages/infrastructure/src/connection-profile-repository.ts`
- `packages/desktop/electron/connection-controller.ts`
- `packages/desktop/electron/connection-ipc.ts`
- `packages/desktop/electron/main.ts`
- `packages/desktop/electron/preload.ts`
- `packages/desktop/src/App.tsx`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/connection-ui-model.ts`
- `packages/desktop/src/index.css`
- `packages/desktop/src/pages/HomePage.tsx`
- `packages/desktop/src/pages/ConnectionPage.tsx`
- `packages/desktop/src/pages/RecoveryPage.tsx`
- `packages/desktop/src/pages/ProjectsPage.tsx`
- `packages/desktop/src/pages/SettingsPage.tsx`
- `packages/desktop/src/pages/DoctorPage.tsx`
- `packages/tests/src/m0.6.test.ts`

Narrow regression/integration compatibility changes made while closing M0.6:

- `packages/tests/src/m0.3.test.ts` — repository test double updated for the added profile-list seam
- `packages/infrastructure/src/secure-tunnel-process.ts` — type-only child-process event compatibility shim; runtime behavior unchanged
- `packages/infrastructure/src/secure-tunnel-profile.ts` and `packages/infrastructure/src/openai-secure-tunnel-runtime.ts` — fixed trusted gateway path resolution that works from both source and bundled Electron module locations

`SUD_D_ROADMAP.md` was not changed because M0.6 implements already approved UI/connection direction and introduces no new long-term architecture decision.

### M0.6 Security Boundaries

- Renderer does not receive plaintext credentials or raw Secure Tunnel identifiers after setup.
- Renderer does not choose arbitrary executable, argv, cwd, env, shell command, or privileged process behavior.
- Connection IPC validates sender and strict Zod payloads before controller execution.
- The selected workspace remains the authorization boundary; changing/removing a bound workspace requires disconnect/restart semantics.
- MCP Gateway remains inert with zero privileged tools; M0.6 does not bypass future Tool Kernel → Policy → Approval → Execution gates.
- `.serena/` remains local tooling state and is excluded from the milestone commit.

### M0.6 Verification

Fresh final verification after code-review fixes:

- M0.6 focused tests: **20/20 passed**
- M0.1–M0.5 regression group: **158/158 passed**
- full test suite: **178/178 passed**
- lint: **PASS**
- typecheck: **PASS**
- build: **PASS** for all packages and Desktop production bundle
- `git diff --check`: **PASS**
- Desktop production smoke: **PASS** — Electron process responsive, non-zero main window handle, title `SUD-D Control Center`

### Required Code Review

The final review used the approved two-axis `code-review` workflow against fixed base `origin/master` at `32a15844f5d9a1127dd91d365e2402c85b4cae36`.

- **Standards review:** no blocking finding after fixing audit spam caused by 2-second renderer status polling. The controller now caches only safe local profile metadata and configured/missing credential status after bootstrap. Minor UI refresh duplication and repeated state mapping are judgement-call cleanup only and were intentionally not refactored in M0.6.
- **Spec review:** no blocking finding after changing auto-start/auto-restart copy to state explicitly that M0.6 only saves preferences and does not activate automatic lifecycle behavior.

## M0.5 Status

Implemented the approved production direction:

```text
ChatGPT
→ OpenAI Secure MCP Tunnel
→ tunnel-client
→ stdio
→ SUD_D MCP Gateway
```

The Work-PC installed tunnel client inspected during M0.5 is:

```text
tunnel-client 0.0.12+881c9a8fed7cccbe6607cd419863bbca506b8215
```

The installed CLI documents stdio MCP commands, profile-based launch, `env:` secret references, `/healthz` / `/readyz`, health URL files, and fixed `channel=main` for the stdio sample. M0.5 uses only those documented local runtime surfaces.

## Files Added / Changed

- `packages/domain/src/result.ts`
  - Added safe typed tunnel/runtime failure codes and `ConnectionRuntimeFailure` with fixed non-secret messages.
- `packages/domain/src/connection.ts`
  - Added shared runtime readiness and runtime-event vocabulary for the production adapter boundary.
- `packages/contracts/src/index.ts`
  - Added M0.5 tunnel failure codes to the strict renderer-facing ConnectionService status error schema.
- `packages/application/src/connection-runtime-port.ts`
  - Extended the fixed-purpose port with typed runtime event subscription while preserving `start(context)` / `stop()`.
- `packages/application/src/connection-service.ts`
  - Maps safe typed runtime start/stop failures and consumes tunnel readiness/client/runtime-failure events through the existing M0.1 state machine.
- `packages/infrastructure/src/credential-store.ts`
  - Added session-only environment-backed tunnel credential storage with deterministic per-profile environment-variable references and no plaintext getter.
- `packages/infrastructure/src/secure-tunnel-profile.ts`
  - Added SUD_D-owned non-secret tunnel profile generation/materialization for a fixed stdio gateway command.
- `packages/infrastructure/src/secure-tunnel-process.ts`
  - Added trusted executable resolution, fixed tunnel launch-plan construction, Windows child-process launch, and deterministic process-tree stop.
- `packages/infrastructure/src/secure-tunnel-health.ts`
  - Added loopback-only `/readyz` monitoring using the tunnel client's generated health URL file.
- `packages/infrastructure/src/openai-secure-tunnel-runtime.ts`
  - Added the production OpenAI Secure Tunnel runtime adapter plus process/health/client-signal test seams.
- `packages/infrastructure/src/index.ts`
  - Exported the M0.5 production adapter boundary.
- `packages/tests/src/fakes/fake-connection-runtime.ts`
  - Extended the M0.3 deterministic fake with runtime-event subscription for regression compatibility.
- `packages/tests/src/m0.5.test.ts`
  - Added M0.5 configuration, lifecycle, security, process/health, ConnectionService integration, and M0.4 gateway regression coverage.
- `SUD_D_HANDOFF.md`
  - Updated milestone status and verification record.

`SUD_D_ROADMAP.md` was not changed because M0.5 implements the already approved Secure Tunnel adapter milestone and introduces no new approved long-term product direction.

## Tunnel Adapter Design

Production entry:

```text
createOpenAiSecureTunnelRuntime()
```

Public runtime surface remains fixed-purpose:

```text
- start(connectionSessionContext)
- stop()
- subscribe(runtimeEventListener)
- getStatus()
```

It exposes no generic executable, argv, shell command, cwd, environment map, arbitrary profile path, or process-runner API.

The production factory resolves only trusted SUD_D/runtime components:

- `tunnel-client.exe` through fixed Windows executable discovery and basename/file validation
- a Node runtime (`node.exe`) for the current JS gateway entrypoint
- the fixed M0.4 entrypoint `packages/mcp-gateway/dist/stdio-entry.js`

The trusted launch plan is always:

```text
<tunnel-client.exe>
run
--profile-file
<SUD_D-owned profile path>
```

`spawn` uses `shell: false`; renderer/client input never participates in executable/argv/cwd/env construction.

## Runtime Supervision Design

M0.5 adds only the process supervision required by the Secure Tunnel adapter:

- launch one fixed `tunnel-client` child
- retain its PID/process handle internally
- prevent duplicate runtime spawn
- observe unexpected process exit
- stop the health watcher during cleanup
- terminate the tunnel-client process tree on Windows using a fixed `taskkill.exe /PID <internal pid> /T /F` operation
- map raw process failures to fixed safe typed errors
- discard tunnel stdout/stderr instead of forwarding raw runtime output into renderer/audit/protocol responses

No generic process runner, arbitrary process tree API, or shell execution surface was added.

## Profile / Config Ownership

M0.5 generates only SUD_D-owned non-secret runtime profiles under:

```text
%LOCALAPPDATA%\SUD-D\runtime\secure-tunnel\profiles\<profileId>.yaml
```

Health URL files are SUD_D-owned under:

```text
%LOCALAPPDATA%\SUD-D\runtime\secure-tunnel\health\<profileId>.url
```

The generated profile contains only trusted/non-secret configuration:

- `control_plane.base_url = https://api.openai.com`
- validated `tunnel_<reference>` from the persisted connection profile
- credential **reference**, not value
- loopback ephemeral health listener (`127.0.0.1:0`)
- SUD_D-owned health URL file
- `channel: main`
- fixed stdio MCP command pointing to the SUD_D gateway

The profile does **not** contain an HTTP/localhost MCP upstream, arbitrary executable, arbitrary shell, user-controlled cwd/env, or plaintext credential.

User-managed tunnel profiles outside SUD_D ownership are not read/rewritten by the production adapter.

## Credential Handling

M0.5 preserves the no-plaintext-getter rule.

A new session-only environment-backed `CredentialStore` implementation stores each profile credential in a deterministic variable name derived from the profile ID, for example conceptually:

```text
SUD_D_CONTROL_PLANE_API_KEY_<PROFILE_ID>
```

The SUD_D-owned tunnel profile contains only:

```text
env:<derived variable name>
```

Properties:

- no credential getter was added
- secret value is not in SQLite
- secret value is not in generated YAML
- secret value is not in tunnel argv/launch plan
- secret value is not in renderer-facing status DTOs
- secret value is not in audit metadata
- secret value is not in safe errors
- delete removes the session environment value through the existing `CredentialStore` boundary

This is still session-only credential handling. Windows Credential Manager/DPAPI remains out of scope.

## ConnectionService Integration

M0.3 `ConnectionRuntimePort` remains fixed-purpose and synchronous at the lifecycle-call boundary. M0.5 adds a thin event seam rather than replacing the existing state machine or converting the whole service to a new async orchestration model.

Runtime events:

- `tunnel_ready`
- `client_connected`
- `client_disconnected`
- `runtime_failed` with a safe typed code

ConnectionService continues to use `transitionConnectionState()` from M0.1.

Production lifecycle:

```text
start()
→ stopped → starting → waiting_for_tunnel
→ tunnel-client child starts
→ /readyz becomes ready
→ runtime emits tunnel_ready
→ waiting_for_client
```

If a future fixed gateway/client signal is supplied, `client_connected` advances:

```text
waiting_for_client → connected
```

No production cross-process gateway-client signal is wired in M0.5, so the real adapter safely remains `waiting_for_client` after tunnel readiness until a later approved integration provides that signal.

Unexpected tunnel failure maps the active connection to `error` through existing transition rules. Stop still follows:

```text
<active/error> → stopping → stopped
```

## Health / Readiness Mapping

M0.5 uses the tunnel client's documented local health surface without coupling to undocumented control-plane internals.

The generated profile requests:

```text
health.listen_addr = 127.0.0.1:0
health.url_file = <SUD_D-owned health URL file>
```

The adapter:

- waits only for the SUD_D-owned health URL file
- accepts only an `http://127.0.0.1/...` base URL
- probes `/readyz`
- maps HTTP success with body `ready` to `tunnel_ready`
- retries transient startup races only until a fixed timeout
- maps timeout/invalid health URL/readiness failure to `TUNNEL_HEALTH_FAILED`
- never forwards raw response/body/system errors to renderer/audit

The adapter does not create its own HTTP server or external listener; the loopback ephemeral health listener belongs to `tunnel-client`.

## Error Handling

New safe typed runtime errors:

- `TUNNEL_CLIENT_NOT_FOUND` — `OpenAI Secure Tunnel client is not available`
- `TUNNEL_PROFILE_INVALID` — `Secure Tunnel profile configuration is invalid`
- `TUNNEL_START_FAILED` — `Secure Tunnel runtime failed to start`
- `TUNNEL_HEALTH_FAILED` — `Secure Tunnel runtime failed readiness checks`
- `TUNNEL_EXITED_UNEXPECTEDLY` — `Secure Tunnel runtime exited unexpectedly`
- `TUNNEL_STOP_FAILED` — `Secure Tunnel runtime failed to stop`
- `MCP_GATEWAY_ENTRY_NOT_FOUND` — `SUD-D MCP Gateway entrypoint is unavailable`

ConnectionService preserves existing `CONNECTION_CREDENTIAL_MISSING` when the credential store reports missing before runtime start.

Raw spawn/taskkill/path/environment/stack error text is not forwarded.

## Security Decisions

- MCP Gateway remains inert and exposes zero privileged tools.
- Tunnel adapter is not a generic process runner.
- Renderer/client cannot choose executable/argv/command/cwd/env/profile path.
- Tunnel ID/reference comes from validated persisted non-secret connection profile state.
- Gateway command is generated only from trusted runtime paths.
- Tunnel profile is written only under SUD_D-owned app data.
- No `http://127.0.0.1:<port>/mcp` upstream is generated.
- Secret is referenced through environment and never serialized into profile/argv/DTO/audit/error.
- Health URL is constrained to loopback `127.0.0.1`.
- Runtime stdout/stderr is not forwarded raw.
- M0.1 connection transition rules remain the only state machine.
- No filesystem/process/network AI tool capability was added to the MCP Gateway.

## Tests Added

`packages/tests/src/m0.5.test.ts` contains 23 tests covering:

1. fixed trusted SUD_D-owned tunnel profile/launch plan
2. stdio gateway command and no localhost HTTP MCP upstream
3. fixed-purpose runtime public API without executable/argv/cwd/env controls
4. missing credential rejected before process start
5. missing tunnel reference rejected before process start
6. missing tunnel-client maps to safe typed error
7. successful process launch leaves ConnectionService at `waiting_for_tunnel`
8. health ready advances to `waiting_for_client`
9. health failure maps fail-closed to `error`
10. unexpected child exit maps to safe typed error
11. stop cleans child + health watcher and ends at `stopped`
12. duplicate start does not spawn another tunnel process
13. duplicate stop does not stop process twice
14. restart stops old tunnel before a single fresh launch
15. Windows paths with spaces use fixed argv + quoted stdio gateway command
16. deterministic environment credential reference without plaintext serialization
17. no secret in DTO/audit/launch plan/profile/safe error
18. generated profile contains no arbitrary HTTP upstream
19. production gateway entrypoint resolves to M0.4 `dist/stdio-entry.js`
20. raw process start failure maps to safe tunnel error
21. raw process stop failure maps to safe tunnel error
22. renderer-facing ConnectionService status accepts new tunnel error codes and remains secret-free
23. real M0.4 stdio gateway still returns `tools/list = []`

TDD RED was observed before production implementation: 23/23 M0.5 tests failed because the M0.5 adapter exports did not exist.

## Relevant Tests Result

M0.5 focused command:

```text
corepack pnpm test packages/tests/src/m0.5.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       23 passed (23)
Exit code   0
```

## Regression Result

M0.1 + M0.2 + M0.3 + M0.4 command:

```text
corepack pnpm test packages/tests/src/phase1.test.ts packages/tests/src/m0.2.test.ts packages/tests/src/m0.3.test.ts packages/tests/src/m0.4.test.ts
```

Result:

```text
Test Files  4 passed (4)
Tests       135 passed (135)
Exit code   0
```

## Lint Result

```text
corepack pnpm lint
Exit code 0
No warnings/errors
```

## Typecheck Result

```text
corepack pnpm typecheck
Exit code 0
```

One initial typecheck failure was test-only: `m0.5.test.ts` imported the `CredentialStore` type from the domain package instead of infrastructure. The import was corrected to the existing package boundary; no production/security behavior was weakened.

## Full Suite Result

```text
corepack pnpm test
Test Files  5 passed (5)
Tests       158 passed (158)
Exit code   0
```

## Build Result

```text
corepack pnpm build
Exit code 0
```

Built successfully:

- domain
- contracts
- infrastructure
- application
- mcp-gateway
- desktop renderer/main/preload production bundles

## Local Acceptance Result

**PASS.**

Work-PC acceptance preflight found:

- `tunnel-client` installed and runnable (`0.0.12+881c9a8...`)
- `CONTROL_PLANE_API_KEY` available locally; value was not read/reported
- `CONTROL_PLANE_TUNNEL_ID` available from the local user environment; value was not read/reported
- SUD_D acceptance used a temporary SUD_D-owned data/runtime root
- SUD_D acceptance used `health.listen_addr = 127.0.0.1:0`, so it did not bind or collide with Serena's `127.0.0.1:8080`
- active `serena-sudd-work` tunnel was not stopped, modified, or reused

Initial acceptance exposed a Windows command parsing issue in the generated tunnel-client profile: an absolute quoted `node.exe` path with spaces was parsed by `tunnel-client doctor` as an invalid executable. The fix keeps a fixed `node` executable token, validates a trusted `node.exe` before profile generation, and quotes only the forward-slash normalized SUD_D gateway script argument.

Final acceptance output:

```text
preflight_tunnel_id=SET
preflight_api_key=SET
health_listen_addr=127.0.0.1:0
runtime_initial_tunnelReady=false
tunnel_client_ready=PASS
runtime_status=healthy
stdio_initialize=PASS
tools_list_empty=PASS
stdout_protocol_json=PASS
gateway_stderr_banner=PASS
acceptance=PASS
runtime_stop=PASS
```

Acceptance path verified:

```text
SUD_D production adapter
→ tunnel-client starts from SUD_D-owned profile
→ fixed SUD_D MCP Gateway entrypoint is validated over stdio
→ /readyz reports ready
→ MCP initialize succeeds
→ tools/list = []
```

## git diff --check Result

```text
Exit code 0
```

## Open Issues

1. The M0.5 production adapter reaches `waiting_for_client` after tunnel readiness. A production cross-process client-connected signal is not yet wired; a fixed signal seam exists for later integration.
2. Persistent Runtime API Key storage is now Windows Credential Manager-backed. Legacy `CONTROL_PLANE_API_KEY` remains only as a backend session-only migration/development fallback and is never silently persisted; removing the Windows-stored credential does not modify a User environment variable.
3. The current fixed gateway entry is JavaScript and therefore validates a trusted installed `node.exe`, while the tunnel profile command uses the `node` executable token for `tunnel-client` Windows command parsing compatibility. Future packaged runtime distribution may choose a bundled/fixed runtime, but renderer-controlled executable selection must remain forbidden.
4. Windows process cleanup uses fixed internal `taskkill.exe /T /F` because the current M0.3 lifecycle port is synchronous; no generic process-control API is exposed.
5. `.serena/` remains local tooling state and must not be committed.
6. M0.6 persists `autoStart` / `autoRestart` preferences only. Automatic lifecycle execution is intentionally not active and requires a separately reviewed future implementation; the renderer still cannot supply executable/argv/cwd/env.

## Immediate Next Action

Branding Logo + App Icon v2 is COMPLETE on Home PC. Work PC should begin with `git status`, `git fetch origin`, and `git pull --ff-only origin master`, then rerun the fresh session bootstrap + Mandatory Skill Router Gate.

The next explicit product UI task remains **Connection tab UX/UI + onboarding/state correctness pass**, but it is **NOT STARTED** and requires a new explicit instruction; the Mandatory Impeccable UI Gate requires loading `impeccable` before any renderer-visible UI/UX work.

The product connector still has one separate external acceptance item: on Work-PC, connect real ChatGPT through the configured SUD-D Secure Tunnel and confirm MCP initialize plus the exact 14-tool production surface. Restricted Execute remains **BLOCKED** because sandbox enforcement was not proven on Work-PC.

**STOP after Branding v2 handoff is committed/pushed and `origin/master...master` is `0 0`.** Do not begin Connection redesign, Personal Alpha retest, Restricted Execute implementation, broader Team Mode, generic Execute, Delete/Recovery, network Git, scheduler/background agents, provider/model runtime, or another capability slice without a new explicit instruction.

## Last Commit SHA

Branding Logo + App Icon v2 implementation:

`fef01754aa7ca799b476876e1ee68d502d5f3524` — `fix: refresh sud-d branding assets`

Mandatory Impeccable UI Gate governance implementation:

`0fc1be87f5b9f29e3bcd44050e7d518fa32ce4d4` — `docs: hard-require impeccable for ui work`

Overview Final Polish implementation:

`5d9d0aff2db50969bcad954118ce531ffbeaa88e` — `fix: polish overview connection shell`

App Shell + Overview implementation:

`3bfbe61792f6f9e26e76ad97b93db3e00cc546ec` — `feat: redesign app shell and overview`

Team Mode MVP — No-Execute implementation:

`be6ff3c8b0df6f53cb2716fb4828471208664ebb` — `feat: add Team Mode MVP no-execute`

Basic Approval implementation:

`de42f5f4be99cf446e0af412947c7e3e3ce42689` — `feat: complete Basic Approval`

Git Safety + Integration implementation:

`6bc621435c0b44539c14a3797018f53a8fb729fb` — `feat: add Git Safety integration`

Agent Skill System Upgrade governance implementation:

`fbd8c8eaf80066bedc0c0dcb6bf0656402de022f` — `chore: adopt autonomous SUD-D agent skill router`

Personal Alpha Workspace File Tools implementation:

`e02c53bf77d449af6d6340e55e87f6e9c8688422` — `feat: add personal alpha workspace file tools`

M1 Tool Execution Kernel implementation:

`66ae28bdd809fadecc2e49c424de7a60bd7d7435` — `feat: complete M1 tool execution kernel`


Post-M0.8 Connection UI/UX Simplification implementation:

`5bfa78b83ade3af59fbff3333c4e5f4e368cd3d3` — `feat: simplify connection setup ux`

M0.7 completion implementation:

`9dace143b3130128190deb34afae806f9afc85af` — `feat: complete M0.7 doctor activity integration`

M0.7 baseline documentation / Team Mode North Star preserved from:

`12ff6122b7f1ff4281524da405640359ba243e7a` — `docs: define Team Mode product north star`

M0.6 completion:

`bbe9e887b9dbfaf61d30def272a3ad56b03809c1` — `feat: complete M0.6 desktop connection UI`

Baseline immediately before M0.6 implementation:

`32a15844f5d9a1127dd91d365e2402c85b4cae36`

M0.5 implementation commit:

`a8dae31780ca68a893fce475f8c467d133af76fd` — `feat: complete M0.5 secure tunnel adapter`

M0.5 local acceptance compatibility fix:

`a113b70221c48ce1d93a1e6d2589e33919d5a350` — `fix: make M0.5 tunnel profile command compatible`

M0.4 implementation commit:

`8046f04239bb20392b7449295dd9ed6ed071790f` — `feat: complete M0.4 inert MCP gateway`

Current pushed baseline before M0.5:

`191cc52b49af8e8734b92cfeedf2980845c84108` — `docs: update M0.4 handoff`

## Stop Gate

Personal Alpha Workspace File Tools, Git Safety + Integration, Basic Approval, and Team Mode MVP — No-Execute are complete only as the explicitly approved capabilities described above.

Do **not** start Restricted Execute, broader Team Mode, Delete/Recovery, network Git, generic Execute, scheduler/background agents, provider/model runtime, or any later capability slice without a new explicit implementation instruction.
