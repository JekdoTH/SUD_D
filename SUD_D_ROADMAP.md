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

---

## 5. Core Roadmap

### M1 — Tool Execution Kernel

Create the central typed execution path through which future tools must pass.

### M2 — Read-only File Tools

Initial capabilities:

- list
- read
- stat
- search

All operations remain workspace-bound and audited.

### M3 — Approval Workflow

Add explicit user approval semantics for protected actions with clear request context and Approve / Deny decisions.

### M4 — Safe File Mutation + Recovery

Introduce controlled file writes/mutations with recovery records and auditability.

### M5 — Safe Delete Semantics

Delete remains ASK and must be recoverable by default.

### M6 — Production MCP Tool Exposure

Expose production MCP capabilities only after required execution/security gates are sufficiently ready.

### M7 — Git Integration

Add repository-aware operations through the same Kernel / Policy / Approval / Audit model.

### M8 — Process / Execute Integration

Add controlled process execution only after policy/approval boundaries are mature. Execute remains ASK by default.

### Privileged capability gate

Privileged MCP tools must **not** be exposed before Tool Kernel + Policy + Approval + Recovery are sufficiently ready.

---

## Future Program — Team Mode / Agent Orchestration

**STATUS: APPROVED PRODUCT DIRECTION; DETAILED ARCHITECTURE AND IMPLEMENTATION DEFERRED.**

Team Mode is the domain-agnostic orchestration layer above SUD_D's secure execution foundation. It coordinates specialized agents toward a user goal and produces inspectable workspace artifacts and results. This direction does not authorize Team Mode implementation or change the current milestone sequence.

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

Future Team Mode design is expected to reason about these concepts without creating schemas or domain implementation now:

- Goal
- Task
- Subtask
- Agent Role
- Team / Team Preset
- Work Queue
- Artifact
- Checkpoint
- Workspace Memory
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

### Serena's Role

Serena is a development-time and optional specialist integration. It currently helps develop SUD_D and may serve as a semantic coding specialist, but Team Mode must not require Serena as a core runtime dependency.

A future Software Development team may choose either or both specialist paths:

```text
Developer Agent
 ├─ SUD_D native code tools
 └─ Serena adapter (optional)
```

Non-software presets such as Podcast Production and Research do not require Serena.

### User and Harness Responsibilities

The user should primarily define the Goal or Brief, set constraints, approve sensitive actions, and review the Final Result. SUD_D should own planning, delegation, coordination, verification, handoff, and progress tracking within those constraints.

### Relationship to the Secure Core

M0–M8 remain the required secure foundation and continue in their current order. Team Mode depends on Workspace Boundary, Tool Kernel, Policy, Approval, Audit, Recovery, file tools, process controls, and MCP/runtime foundations; it must not skip or weaken them. A detailed Team Mode roadmap will be designed only when the secure core is sufficiently ready.

### Approved vs Deferred

**Approved:**

- Team Mode / Personal AI Team Harness is the long-term North Star.
- Orchestration is domain-agnostic: user goal → team → artifacts and results.
- The secure SUD_D core remains the execution boundary for every agent role.
- Serena is optional and is not a required core runtime dependency.

**Deferred until Team Mode design begins:**

- exact agent runtime
- model and provider selection
- parallel execution design
- task scheduler
- conflict resolution
- memory storage format
- Team Preset format
- detailed UI
- detailed Team Mode milestone plan

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
Add Workspace
→ Select Workspace
→ Connect ChatGPT
→ Connected
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

## 7. Workspace Memory / Session Continuity

**PLANNED FEATURE — do not implement now.**

Goal: a new ChatGPT session can continue project work without depending on the previous conversation transcript.

Future Workspace Memory should support Team Mode continuity across chat sessions, devices, agent changes, and team handoffs. It may include:

- Current Goal
- Current Task and Subtasks
- Completed Tasks and Task History
- Checkpoints
- Decisions
- Artifacts
- Review Results
- Open Questions
- Last Successful Verification
- Last Commit
- Suggested Next Action

### Current strategy

```text
Home Chat ─┐
           ├→ Git Repository
Work Chat ─┘
                ↓
         SUD_D_HANDOFF.md
```

Before starting a session:

- git sync
- read `SUD_D_HANDOFF.md`
- inspect latest commit

Before ending a session:

- update handoff
- verification
- commit
- push

The **Git repository is the source of truth** for project state and continuity.

`.serena/` is local tooling state. It is **not** project memory and is not a source of truth.

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
- secure by default
- fail closed
- least privilege
- recoverable destructive actions
- auditable
- provider-independent where practical
- UI hides technical complexity
- security boundaries must not depend on UI
- renderer must not receive plaintext credentials

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

- New implementation should map to an explicit milestone before work begins.
- Security gates may become stricter without weakening the architecture; weakening them requires explicit architecture review.
- Future/cloud ideas listed here justify preserving architectural seams, not implementing them early.
- When roadmap and handoff differ, use `SUD_D_ROADMAP.md` for long-term direction and `SUD_D_HANDOFF.md` for current execution state.
