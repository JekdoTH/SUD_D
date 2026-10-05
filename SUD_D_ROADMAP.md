# SUD_D Roadmap

> Master Plan / Source of Truth for long-term architecture, milestones, product direction, and approved future ideas.

For current execution status, verification, open issues, immediate next action, and latest completed milestone commit, see `SUD_D_HANDOFF.md`.

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

Direction approval is not implementation authorization. Each phase needs its own explicit task; Parallel Coding requires an approved architecture specification before implementation. v1.0.5 is published; owner-authorized v1.0.6 Phase 1 publication is pending Windows CI, followed by installed-app acceptance. No subsequent phase is authorized.

#### Phase 0 — Current closure

Complete owner acceptance of the installed Team opt-in fix: no active mission plus no explicit Team request means Normal Mode. Each new mission requires manual user approval in SUD-D, including in Full Access mode; an explicit Team request followed by approval must start sequential Team normally. The owner reported v1.0.3 instruction-only opt-in failed; current repair/release evidence belongs in the handoff. This closes existing behavior, not a new feature milestone.

#### Phase 1 — Connection Auto Recovery / Auto Restart — manual initial Connect only

Product Owner decision (2026-10-05): Auto Start is removed from product direction. Every fresh app session stays disconnected until the user explicitly presses Connect. Phase 1 implements bounded recovery only for unexpected managed-runtime failure inside that manually started, session-local connection intent, with cancellation on Disconnect, shutdown or Restart & Update. Existing profile values are preserved; newly created profiles default Auto Recovery ON while `autoStart=false`, and this never auto-connects on launch. Architecture-approved design and implementation details are in [Connection Auto Recovery design](docs/superpowers/specs/2026-10-05-connection-auto-recovery-design.md) and [implementation plan](docs/superpowers/plans/2026-10-05-connection-auto-recovery.md). Owner real-app smoke and final repair/focused re-review passed. The owner authorized commit/push/release; commit `8a962e3` and tag `v1.0.6` are pushed, with publication pending Windows CI. Keep the fixed-purpose connection lifecycle, Secure Tunnel and credential boundaries; the renderer cannot select executable, argv, cwd or env.

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

### Restricted Project Runner / Self-Development — Approved later, usage-driven

The retained capability direction is a minimal Restricted Project Runner for installed SUD_D self-development. It is not the next milestone: the approved post-MVP order above takes priority, and broader runner actions require demonstrated usage need and a separate explicit task.

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
| Integrated / publication pending | Phase 1 Connection Auto Recovery / Auto Restart with manual initial Connect only (Auto Start rejected), bounded 1s/3s/10s retries, 60-second stability reset, credential-revision invalidation and fail-closed shutdown/update handling. Owner smoke and final repair/focused re-review passed; owner-authorized commit/tag `v1.0.6` pushed, Windows release CI pending. |
| Approved, not implemented — ordered | Design-first Parallel Coding Team with coordination, internal Task isolation and Lead integration; Computer Use after stable Parallel Coding. Each requires its own explicit task and gates above. |
| Later / usage-driven | Restricted Project Runner expansion; full Recovery / Safe Delete; self-contained uv bootstrap; controlled Serena update/rollback; Team Presets; user-facing GitHub repository creation / Worktree UI; direct production client-connected signal. |
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
