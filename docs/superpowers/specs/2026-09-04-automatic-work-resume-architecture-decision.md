# SUD-D Work Memory / Automatic Resume — Approved Architecture Decision

Date: 2026-09-04
Status: Approved product direction
Implementation status: **NOT STARTED — this document does not authorize implementation.**

## Product goal

A user should be able to open a new ChatGPT conversation, connect to SUD_D, and continue unfinished work without copying the previous chat.

SUD_D owns continuation state. ChatGPT and Serena are not the authoritative memory store.

Team Mode remains the primary MVP target. Work Memory / Automatic Resume is a required foundation immediately before Team Mode MVP, not after it.

## Target user experience

Conceptually:

```text
New ChatGPT conversation
→ connect to SUD_D
→ automatic SUD_D session/workspace bootstrap
→ load bounded Resume Context for the active Workspace
→ validate live Workspace/Git state
→ continue unfinished work
```

The user-facing experience should be close to simply saying: `continue the work`.

## Automatic bootstrap contract

The exact public tool names remain a design detail. The intended contract is:

1. SUD_D exposes an idempotent session/workspace bootstrap/resume capability.
2. SUD_D MCP/server instructions tell a new AI session to run bootstrap before substantive project work.
3. Bootstrap resolves the active Workspace and returns bounded Resume Context when unfinished work exists.
4. Project-scoped privileged actions must not depend only on the model remembering this convention. Where practical, SUD_D should fail closed with a bootstrap/resume-required result until the current session/workspace bootstrap has occurred.
5. Bootstrap/resume state never grants additional authority. Tool Kernel / Policy / Approval / Audit rules remain unchanged.
6. Switching the active Workspace requires bootstrap/resume for the new Workspace.
7. The design does not require SUD_D to store or understand raw ChatGPT conversation transcripts.

Do not rely on a ChatGPT conversation ID as the source of truth. SUD_D work state is keyed to SUD_D Workspace / Goal / Task state.

## Minimal Resume Context

Persist bounded structured state per Workspace:

- Goal
- current Task / status
- Completed work
- important Decisions
- Blockers
- Next Action
- relevant Artifacts / changed paths
- verification evidence summary
- Git/checkpoint reference when available
- updated timestamp

Raw chat transcripts are not the primary memory model.

## Checkpoint model

Use both:

- automatic state derived from SUD_D tool/task activity where reliable; and
- explicit AI/task checkpoints at meaningful boundaries.

A checkpoint stays small and operational:

```text
Current Task / Completed / Decisions / Blocker / Next Action / Evidence
```

## Team Mode reuse

Do not build a second memory system for Team Mode.

Reuse the same state model for:

- Goal
- Task / Subtask
- Checkpoint
- Artifact
- Decision
- Task History
- Handoff
- Final Result

This same foundation supports both chat-to-chat continuation and agent-to-agent handoff in Team Mode.

## Near-term sequence

```text
Milestone B closure
→ Semantic Read
→ Semantic Write
→ Restricted Verify
→ Work Memory / Automatic Resume MVP
→ Team Mode MVP
→ real-world dogfooding / later hardening
```

Milestone B is closed as of this decision-recording change. The remaining steps still require their own explicit implementation instructions and gates.

General shell, Full Recovery/Delete, Auto-update, installer bundling, cross-platform, enterprise hardening, and non-critical polish remain outside this critical path unless separately approved.

## Device scope

For Personal Alpha, Work Memory may remain local-first per device.

Automatic Home-PC ↔ Work-PC memory synchronization is not required for this MVP. Continue using repository/handoff flow for cross-device work until a separate sync design is approved.

## Authority and source-of-truth rules

- SUD_D owns bounded continuation/work state.
- Git remains the project source of truth for repository state and cross-device continuity until a separate sync design is approved.
- `.serena/` is local tooling state, not project memory.
- Bootstrap/resume state does not bypass Workspace Boundary, Tool Kernel, Policy, Approval, Audit, or other security rules.
- This decision does not start Milestone C, expose `code.*`, or implement Work Memory.
