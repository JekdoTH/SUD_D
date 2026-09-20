# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SUD-D is personal-first software for a primary Windows user who wants ChatGPT/AI to work with local projects through a secure local runtime without needing to operate the underlying tunnel, credential, or CLI details during normal use. Approximately one occasional tester may also use the product.

## Product Purpose

SUD-D is a local-first Windows AI control gateway/runtime and the foundation of a Personal AI Team Harness. It gives ChatGPT bounded access to approved local workspaces while keeping privileged behavior behind SUD-D's Tool Kernel, Policy, Approval, Audit, and recovery boundaries. Success means the user can understand connection, workspace, and safety state quickly and let AI work inside explicit limits without exposing host-control complexity.

## Positioning

SUD-D is not an unrestricted agent shell. Its distinguishing mechanism is a local secure execution boundary: external AI reaches only the capabilities SUD-D deliberately exposes, and every privileged operation remains subject to workspace, policy, approval, audit, and least-privilege rules.

## Operating Context

SUD-D runs as an Electron desktop application on Windows. Normal use centers on choosing an approved workspace, configuring the local ChatGPT/Secure MCP connection, checking health and activity, and allowing AI work only through the exposed SUD-D tool surface. primary validation device and secondary validation device are independent local devices with separate runtime state.

## Capabilities and Constraints

- Current navigation: Overview, Workspaces, Connection, Activity, Team, Security, Recovery, Environment / Doctor.
- Current ChatGPT connection path: ChatGPT → OpenAI Secure MCP Tunnel → tunnel-client → stdio → SUD-D MCP Gateway.
- Renderer code must not control arbitrary executables, argv, cwd, env, or arbitrary privileged host actions.
- Plaintext credentials must not enter renderer-facing DTOs, logs, audit records, normal serialization, or UI copy.
- Workspace access remains bounded to explicitly approved workspaces; outside-workspace and internal-root access are denied.
- Network is denied by default except for separately reviewed fixed-purpose product behavior.
- Product UI must report real connection, workspace, audit, policy, and security state rather than invent unsupported account, updater, session, permission, uptime, or encryption claims.
- This redesign task changes only the shared App Shell and Overview content; page-specific redesign of other tabs remains out of scope.

## Brand Commitments

- Product name: SUD-D.
- The user-approved SUD-D logo supplied for the App Shell is a binding brand asset for this redesign.
- Normal product language is concise, status-first, non-technical by default, and must preserve established SUD-D terminology and security meaning.

## Evidence on Hand

- Repository product/security truth: `SUD_D_CONTEXT.md`, `SUD_D_ROADMAP.md`, `SUD_D_HANDOFF.md`, and current implementation.
- User-approved Overview reference screenshot and approved SUD-D logo supplied with the active task.
- User-approved App Shell + Overview preview for this implementation pass.
- No account/sign-in, updater-status, fabricated active-session, or unsupported commercial proof should be inferred from visual references.

## Product Principles

1. Local-first and trustworthy before broad capability.
2. Security boundaries stay effective even when UI is bypassed.
3. Normal workflows hide tunnel, credential, path, and CLI complexity without hiding meaningful state.
4. Status and next action should be understandable at a glance.
5. Product truth outranks decorative fidelity to a reference image.

## Accessibility & Inclusion

Desktop UI work must preserve semantic navigation and buttons, visible keyboard focus, sufficient contrast, non-color-only status meaning, and practical target sizes at normal and narrower Windows desktop widths.
