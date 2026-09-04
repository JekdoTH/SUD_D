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
- Support continuity across ChatGPT sessions and, eventually, across devices.
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

- Home-PC uses its own Secure Tunnel.
- Work-PC uses its own Secure Tunnel.
- Secure Tunnel setup is performed once per machine.
- SUD_D Desktop hides profile/key/path/CLI complexity from normal UX.
- Home-PC and Work-PC are independent local devices at this stage.

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

### Future optional direction

A future connection layer may support:

```text
SUD_D Connect
→ GitHub OAuth
→ Device Registry / discovery
→ Home-PC / Work-PC
→ Cloud Relay
→ account / cross-device sync
```

This is an approved future concept only. It is not permission to implement cloud infrastructure early.

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

SUD_D is currently personal-first: one primary Windows user with approximately one occasional tester. The approved near-term priority is to reach a useful **Personal Alpha and Team Mode MVP as quickly as practical** while keeping the core security boundary intact.

The near-term execution order is intentionally capability-driven rather than strictly following the historical milestone numbers:

```text
Connection Foundation + Connection UX COMPLETE
→ M1 Tool Execution Kernel
→ Personal Alpha Workspace File Tools: Read / Search / Write
→ Git Safety + Integration
→ Basic Approval
→ Milestone B CLOSED (Managed Serena Runtime Foundation)
→ Semantic Read
→ Semantic Write
→ Restricted Verify
→ Work Memory / Automatic Resume MVP
→ Team Mode MVP
→ real-world dogfooding
→ later hardening only when usage proves the need
```

This acceleration changes sequencing and scope, not the security architecture. No capability may bypass the Tool Kernel, Policy, Approval where applicable, workspace boundary, audit, or secret rules.

### M1 — Tool Execution Kernel

Create the central typed execution path through which future tools must pass.

M1 is complete. Its typed request/result, policy/classification, execution dispatch, audit, and fail-closed seams remain the foundation for later capabilities.

### Personal Alpha File Tools — Read / Search / Write

This near-term slice combines the original M2 read-only goal with a deliberately narrow early portion of file mutation so SUD_D becomes useful for real project work sooner.

Initial capabilities may include:

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

The first Git slice should remain local-first and bounded. Prefer capabilities such as repository detection, status, diff, and safe checkpoint/commit workflows before broad Git mutation or network operations.

Git operations must use the same Kernel / Policy / Approval / Audit model. Network Git operations such as push/fetch remain separate from local repository operations and must not silently bypass the default Network DENY policy.

Git is an **Alpha recovery aid**, not a complete recovery guarantee. Untracked files and uncommitted changes may not be recoverable from Git; full Recovery remains planned after Team Mode MVP.

### Basic Approval — Pulled Before Full Recovery

Implement the smallest approval workflow needed for protected Personal Alpha actions with clear request context and explicit Approve / Deny decisions.

The goal is not a generalized enterprise approval system. It is a simple, reliable user boundary for actions whose policy is ASK, especially restricted process execution and later sensitive Git/file operations.

### Restricted Verify — Early Team Mode Prerequisite

Add only the fixed/validated project verification actions needed for useful development workflows before Work Memory / Automatic Resume and Team Mode MVP.

The Restricted Verify slice must remain narrow:

- no unrestricted or general shell surface
- no renderer-controlled arbitrary executable, argv, cwd, or env
- prefer fixed/validated verification actions such as test, lint, typecheck, and build
- preserve Policy / Approval where applicable, bounded safe output/error handling, and audit
- no generic process manager surface

General shell / broader Execute remains outside the critical path unless separately approved.

### Incremental Production MCP Exposure

Production MCP exposure is no longer treated as one monolithic late gate. Approved capability slices may be exposed incrementally **only after their own required Kernel/Policy/security/verification gates pass**.

This allows the Personal Alpha to become useful earlier without exposing Delete, unrestricted Execute, secrets, outside-workspace access, or unfinished future capabilities.

### Team Mode MVP — Primary Product Target

After the secure Personal Alpha foundation, Semantic Read, Semantic Write, Restricted Verify, and Work Memory / Automatic Resume MVP are sufficiently usable and verified, begin a deliberately small Team Mode MVP.

The MVP should prove the North Star flow:

```text
User Goal
→ SUD_D coordinates a small AI team
→ team plans / works / verifies / reviews
→ all tool use stays behind SUD_D security boundaries
→ artifacts + final result return to the user
```

Team Mode MVP does **not** require full Delete/Recovery, generic Execute, installer polish, cloud sync, cross-platform support, or enterprise orchestration features. Capabilities not yet implemented remain unavailable to Team Mode rather than being bypassed.

### Deferred until after Team Mode MVP

The following remain future product capabilities, but they do not block the first usable Team Mode MVP unless separately approved:

- arbitrary/general shell and broader Execute
- full Safe File Mutation + Recovery engine
- Safe Delete semantics and recoverable delete
- Serena auto-update / unattended runtime promotion
- Computer Use implementation unless separately approved earlier
- bundled installer / packaged distribution polish
- cross-platform support
- enterprise/load/multi-user hardening
- non-critical UI polish

Prioritize real-world dogfooding after Team Mode MVP; promote later hardening when usage demonstrates the need.

### Privileged capability gate

The privileged path remains:

```text
MCP Gateway → Tool Kernel → Policy → Approval → Execution → Audit / Recovery
```

Incremental Alpha exposure may use only the capabilities whose own gates are ready. Delete stays unavailable until its recovery semantics are implemented. Execute stays ASK and restricted until a later approved expansion. Team Mode receives no direct filesystem/process/network privileges and can only use capabilities SUD_D has safely exposed.

---

## Future Program — Team Mode / Agent Orchestration

**STATUS: APPROVED PRIMARY PRODUCT TARGET; MVP FOLLOWS THE ACCELERATED PERSONAL ALPHA FOUNDATION.**

Team Mode is the domain-agnostic orchestration layer above SUD_D's secure execution foundation. It coordinates specialized agents toward a user goal and produces inspectable workspace artifacts and results. Detailed implementation remains deferred until the accelerated prerequisites in Section 5 are sufficiently ready, but Team Mode MVP is now an explicit near-term product milestone rather than an indefinitely deferred program.

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

The Lead / Orchestrator coordinates work; it is not a security superuser. Role names and workflow details remain conceptual until Team Mode design begins.

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

Future Team Mode design is expected to reason about these concepts without creating schemas or domain implementation before its approved milestone:

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

Full Recovery, Safe Delete, broader Execute, installer polish, and cross-platform support are **post-MVP hardening** and are not prerequisites for the first Team Mode experiment. Until those capabilities are implemented, Team Mode must simply be unable to use them.

For Git-backed Personal Alpha projects, the latest committed repository state is accepted as the temporary rollback baseline during early testing. This does not change the long-term requirement for recoverable destructive actions and does not authorize Delete before the full recovery design is implemented.

### Approved vs Deferred

**Approved:**

- Team Mode / Personal AI Team Harness is the primary product North Star.
- Team Mode MVP is a near-term milestone after the accelerated Personal Alpha foundation.
- Orchestration is domain-agnostic: user goal → team → artifacts and results.
- The secure SUD_D core remains the execution boundary for every agent role.
- Serena is optional and is not a required core runtime dependency.
- Full Recovery/Delete and broad Execute may follow the first Team Mode MVP rather than blocking it.

**Deferred until Team Mode design begins:**

- exact agent runtime
- model and provider selection
- parallel execution design
- task scheduler
- conflict resolution
- memory storage format
- Team Preset format
- detailed UI
- exact Team Mode MVP milestone breakdown

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

**APPROVED PREREQUISITE — implement only under a new explicit task.**

Work Memory / Automatic Resume is now a required foundation immediately before Team Mode MVP. The goal is that a new ChatGPT conversation can connect to SUD_D and continue unfinished Workspace work without copying the previous chat. SUD_D owns continuation state; ChatGPT and Serena are not authoritative memory stores.

The intended flow is:

```text
New ChatGPT conversation
→ connect to SUD_D
→ automatic SUD_D session/workspace bootstrap
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

For Personal Alpha, Work Memory may remain local-first per device. Automatic Home-PC ↔ Work-PC memory synchronization is not required for this MVP; repository/handoff flow remains the cross-device continuity mechanism until a separate sync design is approved. `.serena/` remains local tooling state, not project memory.

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

Home-PC and Work-PC are independent local devices. Each manages its own Secure Tunnel connection and local state.

### Future optional

- GitHub OAuth
- cloud device discovery
- cloud relay
- account sync

Future cloud/device discovery work requires sufficient product and security justification. Do not build cloud infrastructure now.

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
- The Section 5 accelerated sequence is the approved near-term execution priority; historical milestone numbers remain useful capability labels but no longer require strict numeric implementation order.
- Security gates may become stricter without weakening the architecture; weakening them requires explicit architecture review.
- Deferring Full Recovery/Delete does not authorize destructive file operations before those gates are ready.
- Future/cloud ideas listed here justify preserving architectural seams, not implementing them early.
- When roadmap and handoff differ, use `SUD_D_ROADMAP.md` for long-term direction and `SUD_D_HANDOFF.md` for current execution state.
