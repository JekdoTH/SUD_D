# SUD_D Project Context

This document holds stable project context, not milestone progress. For approved sequencing and future scope, read [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md). For the current milestone, completed work, verification, blockers, and next action, read [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md).

## Product and North Star

SUD_D is a local-first Windows AI control gateway/runtime. Its North Star is to let ChatGPT and other approved AI clients work with local projects through bounded, understandable, and auditable capabilities without making an unrestricted shell the normal operating model. The desktop experience should hide infrastructure and CLI complexity, while security enforcement remains below the UI so it still holds if the renderer is bypassed or compromised.

SUD_D is local-first by design: project state and continuity live in Git, device runtime state stays local, and cloud infrastructure is not a prerequisite for the core product.

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
- `packages/mcp-gateway` — the stdio MCP boundary. It is currently a deliberately inert gateway boundary; privileged tools must wait for the roadmap's Tool Kernel, Policy, Approval, Audit, and Recovery gates.
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

The gateway remains the entry boundary for the future privileged path; connection transport alone is not permission to expose privileged tools.

The current domain contract supports `openai_secure_mcp_tunnel` through `stdio`. Preserve the `ConnectionProvider` direction so future providers can be added behind the same secure lifecycle and status boundaries without leaking provider internals or weakening policy. A provider abstraction is an architectural seam, not permission to implement another provider early.

Home-PC and Work-PC use separate Secure Tunnel instances and local device state. Each machine is configured, operated, and diagnosed independently; one machine's tunnel, credentials, or runtime ownership must not be assumed on the other.

GitHub OAuth, a Cloud Relay, cloud device discovery, account sync, and a SUD_D cloud service are future optional directions only. They must not be introduced without an explicitly approved milestone and security review.

## UI / UX Principles

The product UI is simple, status-first, card-based, and non-technical by default. Use a light neutral surface, white rounded cards, clear spacing, and consistent status meaning: green for connected/safe, amber for approval required, and red for denied/error.

Normal flow should feel like:

```text
Add Workspace → Select Workspace → Connect ChatGPT → Connected
```

Protected work should surface a clear Approve / Deny decision with enough context to understand the request. Normal users should not manage tunnel profile names, keys, executable paths, environment variables, or CLI commands. Advanced diagnostics may show safe technical metadata, never secret material or a renderer-controlled privileged surface.

## Workspace Memory and Session Continuity

The long-term Workspace Memory direction is to let a new ChatGPT session resume project work from repository-backed task state, checkpoints, architecture decisions, open questions, verification, and commit history rather than depend on an old chat transcript. It is planned product direction, not permission to implement it now.

Until an approved Workspace Memory milestone exists, Git is the continuity mechanism: sync the repository, read the handoff, inspect recent commits, perform scoped work, update the handoff when project state changes, verify, commit, and push. `.serena/` is local tooling state and must not be treated as project memory or committed.

## Document Responsibilities

SUD_D uses an agent-skill workflow with progressive disclosure. Skill selection and trigger rules are defined in [AGENTS.md](AGENTS.md).

SUD_D follows a risk-based development model: security and data-critical boundaries receive strict verification, while low-risk UI/cosmetic work favors lightweight verification and fast iteration.

- [AGENTS.md](AGENTS.md) — operating rules for every coding agent.
- [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) — stable product, security, architecture, connection, and UX context.
- [SUD_D_ROADMAP.md](SUD_D_ROADMAP.md) — long-term plan, approved milestones, sequencing, gates, and future directions.
- [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) — current execution state, verification, open issues, latest commit, and immediate next action.

Keep these responsibilities separate. Context and agent rules should reference the roadmap and handoff rather than duplicate their milestone detail or progress history.
