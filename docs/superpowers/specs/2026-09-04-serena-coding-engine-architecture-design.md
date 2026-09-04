# SUD-D Managed Serena Coding Engine Architecture

Date: 2026-09-04
Status: Design approved in conversation; Product Mode Serena Allowlist amendment approved for documentation on 2026-09-04; implementation changes remain unapproved until explicit post-amendment approval
Scope: Architectural design for integrating Serena as SUD-D's default advanced coding engine while retaining SUD-D as the authority/control plane

## 1. Decision summary

SUD-D will not reimplement a Serena-class semantic coding engine. SUD-D will keep its native control primitives and place a managed Serena runtime behind a stable SUD-D `code.*` facade.

The product architecture is:

```text
ChatGPT / AI client
        |
        v
SUD-D MCP Gateway
        |
        v
SUD-D Tool Kernel
Policy / Approval / Audit / Trust
        |
        v
SUD-D Serena Adapter
        |
        v
Managed Serena Runtime
LSP backend
        |
        v
Trusted Developer Workspace
```

The user interacts with SUD-D only. Serena is an implementation detail of the product and is not connected to the AI client directly in Product Mode.

SUD-D remains responsible for authority, trust, approvals, audit, lifecycle, secrets policy, Team/Harness state, Git safety, recovery semantics, and product UX. Serena is responsible for advanced coding capabilities such as semantic navigation, symbol-aware editing/refactoring, diagnostics, and trusted developer shell execution.

Product Mode authority is enforced by SUD-D, not by Serena mode semantics. SUD-D owns an explicit Product Mode Serena Allowlist for upstream capabilities it may reach through the managed adapter. Upstream `tools/list` is discovery/inventory only; allowlist membership is necessary but never sufficient for AI-facing authority, which still requires an approved SUD-D `code.*` mapping and the normal Tool Kernel/Policy/Approval/Audit path.

## 2. Goals

This design has five goals:

1. Make SUD-D a practical developer tool capable of real coding workflows without rebuilding mature semantic/LSP tooling.
2. Preserve SUD-D's privileged invariant: `MCP Gateway -> Tool Kernel -> Policy -> Approval -> Execution -> Audit / Recovery`.
3. Give trusted development work high autonomy while reserving genuinely risky authority for the human.
4. Keep Serena replaceable and upgradeable behind a stable SUD-D contract.
5. Keep all installation, connection, runtime, health, repair, update, and rollback operations inside the SUD-D UI.

## 3. Non-goals

This design does not make arbitrary host execution a malware sandbox.

It does not claim that SUD-D can infer every side effect of an arbitrary shell command or a script launched by that command.

It does not make Serena the source of truth for SUD-D workflow state.

It does not remove SUD-D native Workspace, Git, Team, Policy, Approval, or Audit capabilities.

It does not expose every Serena tool in v1.

It does not include the Serena JetBrains backend in v1.

## 4. Core ownership model

### 4.1 SUD-D owns the control plane

SUD-D remains authoritative for:

- Workspace registration, activation, and trust.
- Tool Kernel and capability registry.
- Policy decisions.
- Human approvals.
- Audit and human-readable Activity.
- Credential and secret-handling invariants.
- Native safe Workspace primitives.
- Native Git safety/checkpoint primitives.
- Team/Harness workflow state.
- Serena installation, configuration, lifecycle, version compatibility, health, repair, update, and rollback.
- Product UI and ChatGPT/product connection.

### 4.2 Serena owns the advanced coding engine

Serena is the default backend for:

- Symbol/file code overview.
- Symbol search.
- Reference search.
- Advanced code/pattern search.
- LSP diagnostics.
- Symbol-aware edits.
- Semantic rename/refactor.
- Trusted developer shell execution.

SUD-D must not duplicate these capabilities merely to avoid depending on Serena.

### 4.3 Native SUD-D primitives remain

Current native tool families remain part of SUD-D:

- `workspace.*`
- `git.*`
- `team.*`

They provide a controlled baseline, degraded-mode functionality, generic non-code artifact operations, Git safety, and Team/Harness orchestration. Serena being unavailable must not make SUD-D unusable.

Removing a native capability from the production MCP surface in the future is a separate decision from deleting the implementation. Native capabilities may remain internally useful even when an overlapping AI-facing tool is hidden.

## 5. Trusted Developer Workspace model

### 5.1 Explicit trust

A Workspace does not receive developer execution authority silently.

On first enablement, SUD-D asks the user to explicitly trust the Workspace for development. Trust is persistent and revocable from SUD-D UI.

A trusted developer Workspace means the user accepts the repository/code as suitable for normal host development execution. It is not an assertion that SUD-D has sandboxed the repository.

### 5.2 Untrusted Workspace

For an untrusted or unknown Workspace:

- Host shell execution is denied.
- Native safe SUD-D capabilities may remain available according to their existing policy.
- No hidden fallback to another shell or execution backend is allowed.

### 5.3 Workspace boundary

For SUD-D-controlled high-level capabilities, all path-bearing inputs are validated against the active Workspace and SUD-D InternalRoot restrictions before dispatch.

Explicit requests to operate outside the active Workspace are denied. Explicit access to SUD-D InternalRoot, system credential stores, or other protected paths is denied.

Arbitrary shell is a documented exception to hard containment. Once trusted host code is launched, SUD-D cannot prove that nested scripts will remain inside the Workspace. The product must describe this truthfully and must not present full shell as sandboxed execution.

## 6. Permission model

SUD-D uses four policy outcomes:

- `ALLOW`: execute without human interruption.
- `ASK`: exact one-time approval.
- `HIGH_RISK_ASK`: exact one-time approval with stronger impact presentation and recovery/checkpoint information when reliable.
- `DENY`: execution is not allowed.

### 6.1 Normal development: ALLOW

Within a trusted active Workspace, normal development should be autonomous:

- Read/search/navigation.
- Code overview and references.
- Diagnostics.
- Create/edit normal project files through approved high-level tools.
- Symbol-aware edits and rename/refactor.
- Removing code inside an existing file as part of a semantic edit.
- Recognized local verification commands such as test, lint, typecheck, and build.
- Git status/diff/log/branch inspection through native safe tools.

The intended workflow is `understand -> edit -> verify -> diagnose -> edit -> verify` without approval spam.

### 6.2 Risky but normal developer actions: ASK

Examples include:

- Deleting a real file.
- Deleting a directory.
- Dependency installation/update or package restore.
- Git fetch/pull.
- Direct downloads or arbitrary network clients.
- Git commit.
- Shell commands classified as materially risky or opaque.

Approval is exact and one-time. A changed command/action requires a new decision.

### 6.3 High-risk actions: HIGH_RISK_ASK

Examples include:

- Large or recursive deletion.
- Deleting the active Workspace/project through a dedicated high-risk control path.
- Git push.
- Force-push.
- Git reset/clean that can destroy work.
- Publish/deploy/upload operations.
- Other externally visible or difficult-to-reverse operations.

Where SUD-D has a reliable recovery/checkpoint primitive, it should run or offer that primitive before the high-risk action. Where reliable recovery is not available, the UI must say so. SUD-D must never claim an action is recoverable when it is not.

Destructive Git commands that require a reliable recovery prerequisite may remain `DENY` until that prerequisite exists.

### 6.4 DENY

At minimum:

- Full shell in an untrusted Workspace.
- Explicit outside-Workspace targets.
- SUD-D InternalRoot and protected system locations.
- Credential-store access or plaintext credential extraction.
- Attempts to bypass SUD-D policy/approval.
- Unknown/unclassified Serena tools.
- AI-driven changes to Serena runtime/version/configuration authority.

## 7. Delete semantics

Policy follows the effect, not merely a tool name.

Removing an unused function from inside a source file is a normal semantic write and may be `ALLOW`.

Deleting a file from disk is `ASK`.

Deleting a directory or many files is `ASK` or `HIGH_RISK_ASK` based on scope.

Deleting the entire active Workspace is a dedicated high-risk action, not an ordinary `code.run` convenience path.

Deleting or modifying another project outside the active Workspace is `DENY`.

## 8. Network semantics

Network is risk-based for trusted developer work rather than globally denied.

Typical policy:

- Purely local test/lint/typecheck/build: `ALLOW` when recognized as a safe verification profile.
- Package install/restore and Git fetch/pull: `ASK`.
- Direct HTTP tools/downloads: `ASK`.
- Git push, publish, deploy, or upload: `HIGH_RISK_ASK`.
- Credential/secret extraction or deliberate secret transmission: `DENY`.

SUD-D/Serena product updates use a SUD-D-owned update path and are not delegated to AI shell commands.

A script launched inside trusted host execution may open network connections that are not inferable from its command string. This is part of the trusted-host threat model and must not be represented as a sandbox guarantee.

## 9. Git semantics

Native SUD-D Git safety tools remain the preferred read/inspection path.

Default policy:

- status/diff/log/branch inspection: `ALLOW`.
- commit: `ASK`.
- push: `HIGH_RISK_ASK`.
- reset-hard/clean/force-push: `HIGH_RISK_ASK` only when prerequisites and impact presentation are adequate; otherwise `DENY`.

The AI must not gain a broad session grant such as "all Git for one hour" during Alpha. Risky actions use exact one-time approval.

## 10. Approval model

Risky Serena-backed actions use the same SUD-D approval authority as native capabilities.

An approval grant is bound to the exact normalized action and can be used once. If the action, arguments, target, or risk classification changes, approval must be requested again.

Safe actions do not require approval merely because they are Serena-backed.

SUD-D must not offer a generic "approve all shell" grant in Alpha.

## 11. Activity and audit

### 11.1 Human-readable Activity

The normal Activity UI is intentionally summarized. It should show meaningful events such as:

- Edited a file.
- Renamed a symbol.
- Verification passed/failed.
- Shell command requested/executed.
- Delete requested/approved/denied.
- Git commit/push requested/approved/denied.
- Serena health/update/repair failure.

Routine semantic reads such as repeated symbol/reference lookup should not spam the primary Activity feed.

### 11.2 Detailed security audit

Security-relevant invocations remain auditable at an appropriate detail level.

The existing SUD-D secret invariant remains mandatory: plaintext credentials must never enter SQLite, renderer-facing or IPC DTOs, audit records, logs, error messages, or other serialized non-secret state.

Raw Serena/shell output must therefore never be copied indiscriminately into audit/UI/error serialization. Output handling requires bounded capture plus SUD-D sanitization/redaction appropriate to the existing invariant. `code.run` must not ship to production until this boundary has dedicated tests and review.

SUD-D does not promise to identify every arbitrary secret value produced by trusted code. The product guarantee is that SUD-D does not intentionally collect, persist, or surface secret sources through its managed state, and known credential-access/exfiltration requests are denied. If implementation cannot satisfy the repository's stronger invariant, `code.run` remains gated until the invariant is satisfied rather than weakening it silently.

## 12. Stable `code.*` facade

The AI sees SUD-D tools, not Serena tool names.

Initial v1 facade:

- `code.overview`
- `code.find_symbol`
- `code.find_references`
- `code.search`
- `code.diagnostics`
- `code.replace_symbol`
- `code.insert_before`
- `code.insert_after`
- `code.rename`
- `code.run`

Representative Serena mapping:

| SUD-D facade | Serena capability |
| --- | --- |
| `code.overview` | `get_symbols_overview` |
| `code.find_symbol` | `find_symbol` |
| `code.find_references` | `find_referencing_symbols` |
| `code.search` | `search_for_pattern` |
| `code.diagnostics` | Serena/LSP diagnostics |
| `code.replace_symbol` | `replace_symbol_body` |
| `code.insert_before` | `insert_before_symbol` |
| `code.insert_after` | `insert_after_symbol` |
| `code.rename` | `rename_symbol` |
| `code.run` | `execute_shell_command` |

The facade is intentionally thin. SUD-D must not recreate Serena's semantic engine.

The mapping isolates product contracts from upstream naming/schema changes and allows a future backend to replace individual capabilities without changing Team/Harness contracts.

## 13. Serena tool classification

Every Serena capability reachable through Product Mode has explicit SUD-D metadata describing at least:

- Read/write/destructive/execution category.
- Path/workspace behavior.
- Network/external-side-effect authority where applicable.
- Default policy classification.
- Audit requirements.
- Approval requirements.
- Supported upstream schema/version range.

### 13.1 Product Mode Serena Allowlist

The **Product Mode Serena Allowlist** is a SUD-D-owned backend authority seam. It defines the maximum upstream Serena tool names that Product Mode infrastructure may dispatch to. It is distinct from the global SUD-D Policy engine and distinct from the public `code.*` facade.

The governing rules are:

- Upstream Serena `tools/list` is discovery/inventory only. Serena does not decide Product Mode authority by what it advertises.
- The pinned 22-name set selected for the current Product Mode contract is the SUD-D-authorized upstream allowlist. Membership is necessary but not sufficient for AI-facing use; a later `code.*` milestone must still explicitly map/classify the capability and route it through Tool Kernel/Policy/Approval/Audit.
- Product/AI callers must not be able to submit an arbitrary Serena tool name to the raw MCP `callTool(...)` path. The SUD-D Serena adapter/capability filter validates the requested upstream capability against the allowlist before dispatch.
- An allowlisted tool that is missing or whose supported schema is incompatible is a Coding Engine health failure and fails closed.
- An unexpected upstream tool is **Ready-but-blocked drift** when every allowlisted capability remains present and schema-compatible. It stays unreachable through Product Mode and does not become authority merely because Serena advertises it.
- `--mode no-memories` remains enabled as defense-in-depth / best-effort upstream reduction only. Serena mode semantics are not the Product Mode security guarantee.
- Raw upstream extra names/count may be inspected only as bounded in-memory compatibility diagnostics or acceptance evidence. Milestone B does not persist them to audit, UI, SQLite, or other durable product state.

The pinned Serena 1.7.0 runtime has demonstrated why this separation is required: in the `desktop-app` context, `--mode no-memories` can still leave memory/onboarding tools advertised by upstream. SUD-D therefore treats mode configuration as a reduction hint, never as the authority seam.

No dynamic passthrough of all upstream Serena tools is allowed. A new or previously unclassified Serena tool remains blocked until a separately approved change reviews its schema/classification and promotes it into the SUD-D allowlist.

## 14. `code.run` and shell policy

`code.run` is trusted host execution, not arbitrary renderer-controlled process spawning.

### 14.1 Interface constraints

The AI may provide the command plus an optional relative subdirectory under the active Workspace.

Absolute `cwd` is not exposed by the v1 SUD-D facade even though Serena itself supports it.

SUD-D determines the trusted active Workspace and normalizes/validates any relative working directory before dispatch.

### 14.2 Classifier role

The shell classifier is a policy aid, not a sandbox.

It identifies clearly safe developer verification profiles and clearly risky/destructive/network/external operations. Conservative treatment is required for opaque commands.

Examples:

- recognized `test`/`lint`/`typecheck`/`build`: usually `ALLOW`.
- package install/update: `ASK`.
- Git commit: `ASK`.
- Git push: `HIGH_RISK_ASK`.
- reset-hard/clean: `HIGH_RISK_ASK` or `DENY` when prerequisites are absent.
- direct network clients: `ASK`.
- explicit outside-Workspace path: `DENY`.
- explicit credential-store/secret extraction: `DENY`.
- shell indirection, complex compound commands, inline interpreters, or commands that cannot be classified confidently: default to `ASK` rather than silently widening authority.

A permitted command can invoke project scripts with effects the classifier cannot see. This is accepted only because the Workspace is explicitly trusted for host development execution.

## 15. Managed Serena runtime

### 15.1 Product-owned lifecycle

The user does not manually run or configure Serena in Product Mode.

SUD-D owns:

- Setup/install.
- Version pin.
- Isolated product configuration.
- Start/stop/restart.
- Workspace activation.
- MCP transport.
- LSP initialization.
- Health checks.
- Repair.
- Controlled update.
- Rollback.
- Cleanup on Workspace change and app shutdown.

### 15.2 v1 backend

v1 uses Serena's LSP backend only.

The JetBrains backend is intentionally deferred because it adds IDE/plugin/payment/lifecycle dependencies that conflict with the v1 goal of a self-contained SUD-D experience.

### 15.3 Runtime topology

One active Workspace maps to one managed Serena runtime/session.

On Workspace switch:

1. Stop/cleanup the old Serena runtime.
2. Start a new runtime for the new Workspace.
3. Activate only the new Workspace.
4. Initialize/verify LSP.
5. Expose `code.*` only after health passes.

This avoids cross-project runtime/LSP context leakage.

### 15.4 Transport

Prefer a SUD-D-owned child-process/stdio MCP transport for the managed Serena runtime in v1. This avoids user-visible ports and external MCP configuration. If implementation research proves stdio unsuitable, a local-only alternative requires a design amendment rather than an implicit switch.

### 15.5 Managed installation

Serena and its required runtime are installed into a SUD-D-managed, versioned engine area rather than requiring a user-global Serena installation.

The normal user must not need to run `uv`, Python, Serena CLI commands, edit Serena YAML, choose a port, or kill processes.

The installer/update path must pin upstream artifacts and record a known-compatible tool contract. Supply-chain verification details are an implementation requirement and must be documented before production update is enabled.

### 15.6 Health state

Normal UI states are human-facing:

- Ready.
- Starting.
- Needs repair.
- Unavailable.

Health must verify more than process existence. At minimum it should establish:

- managed process responsiveness,
- expected Serena version/contract,
- every SUD-D-allowlisted upstream tool is present and schema-compatible,
- unexpected upstream tools remain blocked rather than gaining Product Mode authority,
- correct active project,
- usable LSP backend.

Unexpected upstream tools alone do not force `Needs repair` when the authorized allowlist remains compatible and enforcement is intact. `CodingEngineRuntimeHealth.toolCount` represents the effective SUD-D-authorized count, not the raw upstream discovery count. Low-level raw drift inventory, PID/transport/config details belong only in bounded diagnostics and must not become normal product state.

## 16. Source of truth and Serena memory

SUD-D is authoritative for long-lived product/workflow state:

- Workspace trust.
- Approval state.
- Audit.
- Team/Harness missions.
- Agent authority.
- Recovery metadata.
- Runtime compatibility state.

Serena memory capability is disabled from Product Mode by the SUD-D allowlist in v1. SUD-D also requests Serena's `no-memories` mode as defense-in-depth, but upstream advertisement of memory/onboarding tools does not make them reachable. Serena should remain as stateless as practical from SUD-D's perspective.

If Serena memory is enabled later, it may contain coding hints/cache only and must never become authoritative workflow state.

## 17. Update, compatibility, and rollback

Serena does not silently auto-update.

SUD-D operates with a known compatible Serena version/tool contract.

A controlled update flow is:

1. Obtain the candidate pinned Serena build through the SUD-D update path.
2. Install it side-by-side with the current known-good build where practical.
3. Run a compatibility probe.
4. Require every SUD-D-allowlisted upstream capability to remain present and schema-compatible.
5. Confirm any unexpected upstream capabilities remain blocked/unreachable through Product Mode; record only bounded drift evidence for review.
6. Run health/LSP probes.
7. Promote only on success.
8. Roll back to the previous known-good version on failure.

A new Serena tool never gains Product Mode authority merely because upstream added it. Promoting a new tool into the allowlist is a separately reviewed compatibility/authority change; ordinary upstream drift is not self-authorizing.

The exact initial pinned Serena version is selected during the implementation compatibility spike and recorded in a SUD-D-owned engine manifest. Production exposure of `code.*` cannot precede that pin.

## 18. Failure and degraded mode

Serena failure must not take down SUD-D.

When the managed coding engine is unavailable:

- SUD-D desktop remains usable.
- Native `workspace.*`, `git.*`, and `team.*` remain available according to their existing policies.
- Approval/Audit remain available.
- `code.*` returns a stable `CODING_ENGINE_UNAVAILABLE`-class result rather than hanging or silently switching backend.
- UI shows Coding Engine `Needs repair` or `Unavailable` and offers explicit Restart/Repair actions.

There is no silent PowerShell, native shell, different Serena installation, or alternative engine fallback.

Repair operations must preserve project source unless a user-approved repair explicitly requires otherwise.

## 19. Product UX contract

All normal operation ends in SUD-D UI.

The normal user should see concepts such as:

```text
Coding Engine
Ready
Engine: Serena
Workspace: <active workspace>
```

Normal actions are product-level actions such as:

- Setup.
- Restart.
- Repair.
- Check for update / Update.
- Revoke Workspace Trust.

The normal UX does not require knowledge of `uv`, Python environments, Serena config, MCP ports, PIDs, or LSP processes.

Advanced Diagnostics may expose low-level information for troubleshooting without exposing secrets.

## 20. Team/Harness integration

Team Mode and future Agent Runners consume the stable SUD-D tool contract, not Serena-specific MCP tools.

Example conceptual use:

```text
Planner     -> code.find_symbol / code.find_references
Implementer -> code.replace_symbol / code.run
Reviewer    -> git.diff / code.diagnostics / code.run
```

This keeps future logical/independent agents independent of the coding-engine implementation and allows SUD-D to enforce role authority centrally.

This design does not itself change current Team Mode from its existing sequential logical-role model.

## 21. Migration and rollout

Migration is incremental. No "big bang" replacement of the current 14 production MCP tools is allowed.

### Milestone A — compatibility/runtime spike

Goal: prove SUD-D can manage one pinned Serena/LSP runtime reliably on supported Windows systems.

Deliverables:

- exact upstream pin recorded,
- isolated managed install/start/stop,
- stdio MCP handshake or approved amended transport,
- tool-list/schema capture,
- project activation,
- basic LSP health,
- cleanup proof,
- no production `code.*` exposure yet.

STOP if lifecycle/transport cannot be made reliable without violating SUD-D invariants.

### Milestone B — managed runtime foundation

Add runtime manager, health/degraded-mode state, engine manifest, SUD-D-owned Product Mode Serena Allowlist enforcement at the discovery/compatibility seam, and repair/restart backend plumbing. Milestone B validates that every authorized upstream tool is present/schema-compatible, treats unexpected tools as blocked drift, and exposes **no generic upstream tool-dispatch interface**. Native production tool behavior remains unchanged and no `code.*` capability is exposed yet.

### Milestone C — read-only semantic facade

Expose the first low-risk `code.*` subset:

- overview,
- find symbol,
- find references,
- search,
- diagnostics.

All calls pass Tool Kernel/Policy/Audit and adapter classification. The Serena adapter uses fixed SUD-D `code.*` mappings and revalidates the mapped upstream tool against the Product Mode Serena Allowlist before raw MCP dispatch; no caller can supply an arbitrary upstream Serena tool name.

### Milestone D — semantic write facade

Add:

- replace symbol,
- insert before/after,
- rename.

Verify Workspace/path boundaries, Activity summaries, Git diff visibility, and audit behavior.

### Milestone E — trusted host `code.run`

Add shell only after:

- explicit persistent Workspace Trust exists,
- exact one-time approval integration is proven,
- command classification is tested,
- relative cwd enforcement is tested,
- bounded output handling is tested,
- secret invariant review/tests pass,
- timeout/process cleanup semantics are defined and verified,
- no claim of sandbox containment is present.

If these prerequisites fail, semantic Serena integration may ship while `code.run` remains disabled.

### Milestone F — update/rollback and polished UX

Add controlled update, compatibility validation, rollback, Setup/Repair/Restart UI, and Advanced Diagnostics.

### Milestone G — evaluate native MCP exposure

Only after real usage data exists, review whether any overlapping native AI-facing Workspace tool should be hidden from the default tool surface.

Do not delete native implementations merely because Serena overlaps them.

## 22. Verification strategy

Each milestone needs focused tests plus full repository verification where execution capability permits.

At minimum the architecture requires tests for:

- Workspace trust persistence and revocation.
- AI cannot bypass SUD-D to call Serena directly in Product Mode or supply an arbitrary upstream Serena tool name.
- Unexpected/unclassified upstream Serena tools remain blocked and unreachable even when advertised by `tools/list`.
- Unexpected upstream tools alone do not fail health when all allowlisted tools remain present and schema-compatible.
- Missing or schema-incompatible allowlisted tools fail closed.
- High-level path inputs cannot escape the active Workspace.
- InternalRoot is denied.
- Native tools remain usable when Serena is down.
- Runtime starts/stops cleanly on Workspace changes.
- Health detects wrong version/wrong project/unresponsive engine.
- Approval is exact and one-time.
- Risky command mutation requires new approval.
- Absolute `cwd` is unavailable through `code.run` v1.
- Relative cwd traversal is denied.
- Recognized verification command follows intended policy.
- Package/network/destructive/Git command profiles follow intended policy.
- Complex/opaque commands fail conservatively to ASK or DENY.
- Shell timeout/process cleanup semantics are deterministic.
- Output is bounded and does not violate secret/audit/UI invariants.
- Activity is human-readable without semantic-read spam.
- Update cannot activate unknown tools.
- Failed update rolls back to known-good runtime.
- No silent fallback occurs.

## 23. Security claims

SUD-D may claim:

- Product Mode routes AI-accessible Serena capability through SUD-D policy/approval/audit.
- SUD-D, not Serena mode semantics, enforces the Product Mode Serena Allowlist before any upstream Serena dispatch.
- High-level facade path targets are constrained by SUD-D validation.
- Unexpected/unclassified upstream tools remain blocked and cannot be invoked through Product Mode.
- Risky direct actions require policy decisions and exact approvals according to their category.
- Serena lifecycle/version is product-managed and controlled.

SUD-D must not claim:

- Serena `--mode no-memories` or any other upstream mode/configuration alone enforces the Product Mode authority boundary.
- `code.run` is sandboxed merely because it is mediated.
- command-string classification can prove the behavior of nested trusted code.
- trusted host execution cannot access host resources.
- every destructive effect inside an arbitrary script can be intercepted before it occurs.
- an action is recoverable when SUD-D lacks a tested recovery primitive.

## 24. Alternatives considered

### Alternative A — direct Serena passthrough

Expose Serena MCP tools almost directly and place only a broad policy gate in front.

Rejected as the primary design because upstream tool names/schemas would become the SUD-D product contract, tool updates could widen authority too easily, and future Team/Harness consumers would be coupled to Serena.

### Alternative B — SUD-D facade plus thin Serena adapter (selected)

Keep a small stable `code.*` contract and explicitly map/classify known Serena capabilities.

Selected because it preserves SUD-D authority and replaceability without rebuilding Serena.

### Alternative C — fork/embed Serena internals

Fork Serena or copy its semantic engine into SUD-D.

Rejected because it creates a large Python/LSP/upstream maintenance burden and defeats the goal of reusing a mature coding engine.

## 25. Final architectural contract

The intended product relationship is:

```text
ChatGPT = reasoning / agent
Serena  = advanced coding engine
SUD-D   = authority / control plane / product harness
```

And the governing rule is:

> Serena decides how to perform advanced coding operations; SUD-D decides whether the requested authority is available, how it is approved, how it is surfaced to the user, and how the managed engine is operated.

For normal trusted development, SUD-D should stay out of the way. For destructive, external, credential-sensitive, or otherwise high-risk authority, SUD-D keeps the human in control.

## 26. Implementation gate

This document authorizes no production implementation by itself.

Before implementation begins:

1. The user reviews and approves this committed design spec.
2. A fresh SUD-D Skill Router run is performed for the implementation task.
3. The implementation phase invokes the required planning workflow and produces a milestone-by-milestone implementation plan.
4. Production changes begin only after that plan and its STOP conditions are accepted.

The first implementation activity should be Milestone A, the compatibility/runtime spike, not `code.run` and not removal of existing native tools.
