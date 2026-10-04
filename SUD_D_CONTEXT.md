# SUD_D Project Context

This document holds stable project context, not milestone progress. For approved sequencing and future scope, read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md). For the current milestone, completed work, verification, blockers, and next action, read [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md). For owner-facing product/architecture advisory governance and durable knowledge-capture rules, read [SUD_D_ADVISOR.md](SUD_D_ADVISOR.md).

## Product and North Star

SUD_D is a local-first Windows AI control gateway/runtime whose secure core supports the long-term North Star: a domain-agnostic **Personal AI Team Harness / Orchestrator**. A user defines a goal and constraints; Team Mode coordinates planning, specialist work, verification, review, handoff, memory, and final artifacts for user review or approval.

The MCP Gateway is a foundation rather than the final product destination. Implemented Team Mode V3 coordinates sequential logical Planner / Worker / Validator / Reviewer assignments through the connected AI session. Every role uses the same Tool Kernel → Policy → Approval → Execution path. Serena is an optional specialist integration behind the SUD_D-managed runtime and `code.*` facade; clean-machine bootstrap and controlled runtime update remain future work. Broader orchestration follows the approved roadmap.

SUD_D is local-first by design: project state and continuity live in Git, device runtime state stays local, and cloud infrastructure is not a prerequisite for the core product.

SUD_D is built for one primary owner who tests local changes in the app. The near-term delivery rhythm is a small working owner-test candidate, one relevant app check, then owner feedback; broad test suites normally belong to explicit milestone or publication closure unless the changed boundary requires them earlier. This preference changes development effort, not the Workspace, Policy, Approval, Audit, Recovery, or credential boundaries. [AGENTS.md](AGENTS.md) defines the verification rules.

## Security Model

The five security pillars are:

- **Workspace Boundary** — operations stay inside explicitly allowed workspaces; outside-workspace and internal-root access are denied.
- **Policy** — capability and sensitivity rules decide whether an operation is allowed, denied, or requires approval.
- **Approval** — protected actions require an explicit, contextual user decision.
- **Audit** — security-relevant activity is recorded without leaking credentials or unsafe raw data.
- **File Recovery** — destructive file actions are recoverable where practical.

Baseline policy:

| Capability | Baseline |
| --- | --- |
| Workspace read/search/write | ALLOW |
| Delete | ASK and recoverable |
| Execute | ASK |
| Secrets | ASK / DENY |
| Network | DENY by default |
| Outside Workspace | DENY |
| InternalRoot | DENY |
| Audit | ON |

All security behavior defaults to fail closed and least privilege. Privileged capabilities must remain on the enforced path:

```text
MCP Gateway → Tool Kernel → Policy → Approval → Execution
```

The renderer must not choose arbitrary executables, `argv`, `cwd`, or `env`. Plaintext credentials must not cross into SQLite, DTOs, audit records, logs, safe errors, or other non-secret serialization. The milestone gates and detailed security decisions live in the [roadmap](SUD_D_ROADMAP.md), not here.

## Architecture and Package Boundaries

SUD_D is a pnpm TypeScript monorepo with these current packages:

- `packages/domain` — core types, results, classification and policy primitives, connection state, and fail-closed transitions. It is the security and state-model foundation and has no workspace-package dependency.
- `packages/contracts` — strict Zod schemas and typed DTOs for IPC and runtime boundaries. It must expose validated, non-secret representations rather than host internals.
- `packages/infrastructure` — SQLite repositories, data-root and path adapters, Doctor checks, credential-store boundary, and fixed-purpose Secure Tunnel process/profile/health adapters. It depends on domain rules.
- `packages/application` — use-case orchestration for workspaces, connection configuration, and connection lifecycle through fixed-purpose ports. It coordinates domain and infrastructure without exposing generic host control.
- `packages/mcp-gateway` — the production stdio MCP boundary for approved Workspace, Git, semantic code, Restricted Verify, Work Memory, and Team tools. Calls pass through the guarded Tool Kernel; unavailable capabilities remain unexposed.
- `packages/desktop` — Electron main/preload and React renderer. Main owns privileged integrations, preload exposes validated IPC, and the renderer consumes safe contracts.
- `packages/tests` — milestone, integration, boundary, and regression coverage across packages.

Conceptually, external and desktop boundaries call application orchestration; domain and contracts define trusted semantics; infrastructure supplies adapters. Dependency direction must remain conservative: domain security rules do not depend on renderer concerns, and privileged behavior stays behind strict contracts and fixed-purpose APIs.

## Connection Architecture

The current connection path is:

```text
ChatGPT
→ OpenAI Secure MCP Tunnel
→ tunnel-client
→ stdio
→ SUD_D MCP Gateway
```

The gateway is the entry boundary for the enforced privileged path; connection transport alone grants no additional permission.

The current domain contract supports `openai_secure_mcp_tunnel` through `stdio`. Preserve the `ConnectionProvider` direction so future providers can be added behind the same secure lifecycle and status boundaries without leaking provider internals or weakening policy. A provider abstraction is an architectural seam, not permission to implement another provider early.

primary validation device and secondary validation device use separate Secure Tunnel instances and local device state. Each machine is configured, operated, and diagnosed independently; one machine's tunnel, credentials, or runtime ownership must not be assumed on the other.

GitHub OAuth, a Cloud Relay, cloud device discovery, account sync, and a SUD_D cloud service are future optional directions only. They must not be introduced without an explicitly approved milestone and security review.

## UI / UX Principles

The product UI is simple, status-first, card-based, and non-technical by default. Use a light neutral surface, white rounded cards, clear spacing, and consistent status meaning: green for connected/safe, amber for approval required, and red for denied/error.

Normal flow should feel like:

```text
Add Workspace → Select Workspace → Connect ChatGPT → Connected
```

Protected work should surface a clear Approve / Deny decision with enough context to understand the request. Normal users should not manage tunnel profile names, keys, executable paths, environment variables, or CLI commands. Advanced diagnostics may show safe technical metadata, never secret material or a renderer-controlled privileged surface.

## Work Memory / Automatic Resume and Session Continuity

Work Memory / Automatic Resume is implemented. A new MCP session calls `work.resume` before substantive project work; the guard requires a fresh resume for the active Workspace. SUD_D owns bounded local Goal/Task/checkpoint state, live Git drift information, and Resume Context rather than raw chat transcripts. Team transitions derive continuation through the same atomic Work Memory boundary.

New Team missions are opt-in: call `team.start` only when the current user explicitly requests Team Mode, or a future explicit SUD_D-owned routing policy authorizes it. No automatic complexity-based routing exists today. After `work.resume`, an existing active mission resumes through `team.status` and its bounded assignment; without an active mission, use Normal Mode. Complexity, Skills, file edits, validation, and review do not authorize a new mission. This is the model-facing routing contract, not a new kernel authorization mechanism.

Git plus `SUD_D_HANDOFF.md` remains the cross-device development continuity mechanism; local Work Memory is not cloud-synchronized. Inspect local state, read the relevant handoff, perform scoped work, and update it when project state materially changes. Commit/push only when authorized. `.serena/` is local tooling state and must not be committed.

## Document Responsibilities

Development agents are expected to follow the repository-defined skill routing in [AGENTS.md](AGENTS.md) autonomously. `AGENTS.md` is the sole source of truth for routing details and progressive-disclosure rules.

SUD_D follows a risk-based development model: use focused proof for changed security/data boundaries and quick app checks for ordinary UI work. The owner can test a local candidate before broader milestone/release verification.

Before changing production source, agents use the concise risk/verification check in [AGENTS.md](AGENTS.md); the detailed four-heading form applies to security/data changes and explicit milestone gates.

- [AGENTS.md](AGENTS.md) — operating rules for every coding agent.
- [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) — stable product, security, architecture, connection, and UX context.
- [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) — long-term plan, approved milestones, sequencing, gates, and future directions.
- [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) — current execution state, verification, open issues, latest commit, and immediate next action.
- [SUD_D_ADVISOR.md](SUD_D_ADVISOR.md) — owner-facing Product & Architecture Steward / Project Knowledge Custodian charter and automatic knowledge-capture rules.

Keep these responsibilities separate. Context and agent rules should reference the roadmap, handoff, and advisor charter rather than duplicate their milestone detail, progress history, or advisory process.
