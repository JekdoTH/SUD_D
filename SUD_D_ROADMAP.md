# SUD_D Roadmap

This file owns approved direction, sequencing and capability gates. [SUD_D_HANDOFF.md](SUD_D_HANDOFF.md) owns current execution, evidence and the next assignment. [SUD_D_CONTEXT.md](SUD_D_CONTEXT.md) owns stable architecture/security facts; [AGENTS.md](AGENTS.md) owns development rules.

## North Star and personal-first delivery

SUD_D is a local-first Windows Personal AI Team Harness / Orchestrator: a user supplies a goal and constraints, tools operate through the secure core, and verified artifacts/results return to the user. It is domain-agnostic; project-specific coding, content, providers, rendering and QC belong in Workspaces.

The primary user is the Owner. Prioritize a usable one-person flow, small owner-test candidates and evidence-driven repairs. Enterprise/multi-user architecture, speculative scale and extra coordination ceremony are not prerequisites. Single-user delivery does not relax security or data boundaries.

**Current priority:** the 2026-10-14 Serena-first direction and 2026-10-15 fast-closure decision supersede the earlier Trusted Local Runner-first and Parallel Coding-first priorities. Preserve their designs and gates for later use; do not reactivate their old next actions.

## Near-term sequence — Serena-first Solo MVP

| Order | Outcome | Gate before advancing |
| --- | --- | --- |
| 1 | A genuinely usable Desktop owner-test candidate using existing Workspace/file/Git/Approval capabilities | Actual required build/runtime/profile-isolation evidence; truthful limitations and exact owner test steps. Current bounded assignment is linked from HANDOFF. |
| 2 | Opt-in Solo Expert integration through managed Serena and real SUD-D review/consent | Real durable Approval, Workspace generation/Resume, Gateway default-OFF registration, managed-session identity, logging/risk disclosure and focused negative proofs. Synthetic source tests are not runtime acceptance. |
| 3 | B2: one harmless real managed tool/Terminal proof | Separate command/device/Workspace/expiry/effects/logging risk packet and genuine contextual SUD-D human Approval; prerequisite integration accepted. No general shell grant follows. |
| 4 | B3–B5: useful development scripts, long jobs and a real Workspace workflow | Explicit bounded tasks with actual ownership/stop/log/retry/resume proof and any required provider, credential or spend consent. |

TGNK is the first external workflow pilot, not SUD-D core logic. The intended pilot outcome is a new authorized workflow through verified Final MP4; imported-audio historical resume is deferred. A synthetic media sample does not prove real Thai TTS, AI imagery or provider integration. The earlier two-trusted-user Private MVP goal is retained as background; current delivery targets the primary Owner.

**Selected direction:** Option B, opt-in Solo Expert, uses stock managed Serena with per-call manual consent and truthful disclosure of local raw logging and ambient Windows-user rights. Cooperative consent is not OS-enforced filesystem/network confinement, safe secret logging, proven descendant termination or A1 independently verifiable consent. Restricted Mode remains the default. This direction alone enables no real process/tool.

Detailed contracts and rationale:

- [Serena-first C1 plan and milestone contract](docs/superpowers/plans/2026-10-14-serena-first-solo-permission-bridge-c1.md).
- [A/B decision review](docs/superpowers/plans/2026-10-14-serena-first-a-b-advisor-review.md).
- [B1 integration design](docs/superpowers/research/2026-10-14-solo-expert-b1-codex-design.md).
- [G2 source/artifact/lifecycle design](docs/superpowers/research/2026-10-15-solo-expert-b1b-g2-codex-design.md).

Read these only for their relevant boundary. Old prepared/approved assignments inside them do not replace the current assignment or renew consumed attempts.

## Capability baseline

This is the retained capability classification, not a fresh runtime or installed-release verification. Use HANDOFF and the relevant task evidence for exact revision/device readiness.

| Classification | Capability |
| --- | --- |
| Implemented foundation | M0 connection foundation; Tool Kernel/Basic Approval/Audit; bounded Workspace read/search/create/write; local and bounded GitHub Git workflows; Restricted Verify; local Work Memory; sequential Team Mode V3. |
| Implemented managed tooling | Pinned managed Serena lifecycle/repair and semantic code facade; trusted uv is still a prerequisite. |
| Implemented distribution/connection | Windows installer and signed in-app updates; manual initial Connect and bounded same-session Auto Recovery. Publication is distinct from installed-app owner acceptance. |
| In development, acceptance gated | Serena-first Solo Expert; source/compiled proof must not be described as live product readiness. |
| Unexposed/blocked | General Execute, legacy restricted runner production exposure, and A1 independently verifiable Owner Consent. |
| Deferred | Delete/full Recovery, Parallel Coding, Computer Use and the usage-driven capabilities below. |

Git is an Alpha rollback aid for committed files, not a recovery guarantee for untracked or uncommitted data. Full Recovery remains necessary before destructive Delete exposure. Fixed-purpose GitHub network capabilities do not authorize generic network access. Restricted Verify exposes validated actions, not arbitrary shell or packaging/release authority.

## Retained security and blocked-path gates

All capabilities use the [security model](SUD_D_CONTEXT.md#security-model) and [agent security invariants](AGENTS.md#security-invariants). Incremental exposure requires the capability's own Kernel/Policy/Approval/security/verification gates. Team roles receive no additional authority.

| Boundary | Retained gate |
| --- | --- |
| Restricted Project Runner P0c | P0b evidence does not prove aggregate writable-output/disk bounds or all production invariants. P0c.1–P0c.4 feasibility remains blocked; P0c.5 is deferred/not passed. runner.start stays unexposed. No unsandboxed fallback. |
| Private MVP F0/F2/H1 | Preserve the approved Option B application-TCB/operational-storage-budget contract, reviewed handle-isolation approach and selected topology B. Native readiness and remaining physical gates are not proven by inert source; old grants do not authorize new attempts. |
| A1 independently verifiable Owner Consent | Option A remains the selected design and is paused/blocked. Solo Expert cooperative consent does not satisfy or weaken this separate trust-anchor requirement. |
| Real host execution | Explicit applicable scope, provenance/identity, data isolation, approval and cleanup proof are required. Missing mandatory evidence means STOP, not simulated readiness. |
| Delete / Recovery | Delete remains unavailable until reviewed recoverability and destructive-action semantics are implemented and verified. |
| Release / publication | Separate authorization and required package/update/signature/hash checks. A dev candidate or compiled artifact is not a signed release. |

Authoritative retained runner contracts: [Restricted Project Runner specification](docs/superpowers/specs/2026-10-06-restricted-project-runner-design.md) and [plan](docs/superpowers/plans/2026-10-06-restricted-project-runner.md), including their P0c, F0, F2 and H1 sections. These boundaries remain applicable to their respective paths; do not impose legacy F2/Hyper-V gates on separately approved ordinary Restricted Verify work or treat that separate route as permission to bypass a legacy gate.

A1 rationale/evidence is preserved in the [historical roadmap](SUD_D_ROADMAP_ARCHIVE_2026-10-27.md). Resuming a blocked path requires a new bounded assignment and applicable approval, not merely reading an archive.

## Later sequence — Parallel Coding, then Computer Use

The 2026-10-05 expansion sequence is retained after the near-term Solo priority; no phase starts automatically.

1. **Parallel Coding architecture:** after an explicit Parallel Team request, the user's existing conversation is Requirement / Lead Chat; the user manually opens Worker chats. No automatic creation of ChatGPT conversations or new OpenAI API/model runtime.
2. **Task coordination:** approve dependency/readiness, claims/leases, worker/session ownership, expiry/recovery and the evolution of sequential V3 before implementation. Workers cannot silently take one another's work.
3. **Internal branch/worktree isolation:** prerequisite for live concurrent coding, preserving Workspace/Git/Policy/Approval/Audit and owner changes. User-facing Worktree Management UI can wait. No reset-hard/clean/force shortcuts.
4. **Task Result and Lead integration:** bounded results carry task/state, branch/reference, changed paths, evidence and blockers. Lead integrates in dependency order, handles conflicts and verifies the integrated result. Lead writes only through an explicit Integration Task. Work Memory must prevent one Worker overwriting another's continuation before concurrent execution.
5. **Computer Use:** only after stable Parallel Coding and a separately approved capability design; same Kernel/Policy/Approval/Audit path.

Coding dependency/integration work is the target. Independent content chats need not acquire Parallel Team machinery. Sequential V3 remains the available Team behavior until the future contracts are implemented and verified.

## Later — only when usage justifies it

- Restricted Runner/self-development expansion beyond existing Restricted Verify; prefer existing fixed-purpose seams over a duplicate execution engine.
- Full Recovery / Safe Delete, with the destructive capability gate intact.
- Self-contained uv bootstrap; controlled Serena update/rollback. Managed Serena remains pinned; do not vendor/fork it merely to appear built in.
- Team Presets, additional orchestration UI, user-facing GitHub repository creation and Worktree Management UI.
- Direct production client-connected signaling when real dogfood evidence warrants it; client absence alone is not a recovery trigger.

The product remains domain-agnostic. Future Software Development, Podcast, Research and Content presets are examples, not mandatory subsystems. Serena is not a universal dependency for all presets. Reuse Goal/Task/Artifact/Checkpoint/Decision/Handoff/Final Result and existing Work Memory; do not invent parallel memory stores.

## Not currently planned

Cloud Relay, cloud device discovery/registry, cloud Work Memory sync, provider/model-selection runtime, macOS/Linux support and enterprise/multi-user architecture remain outside the active path. An independent/background model runtime or general scheduler is not required by the manually opened chat approach.

Git is the cross-device project mechanism. Device connection state, runtime ownership, credentials and Work Memory stay local; one machine's acceptance does not prove another's. Existing architectural seams grant no authority to implement deferred providers or cloud services.

## Reference and change control

- Stable connection, package, UX and resume contracts live in [CONTEXT](SUD_D_CONTEXT.md); [automatic resume architecture](docs/superpowers/specs/2026-09-04-automatic-work-resume-architecture-decision.md) remains the detailed continuity reference.
- [Connection Auto Recovery design](docs/superpowers/specs/2026-10-05-connection-auto-recovery-design.md) and [plan](docs/superpowers/plans/2026-10-05-connection-auto-recovery.md) retain manual-start and fixed-purpose lifecycle requirements.
- Every implementation maps to one explicit task/checkpoint. Approved future direction is not implementation, runtime, machine-change or publication authority.
- Product direction changes belong here; technical gate detail belongs in its task/spec; progress and immediate next action belong only in HANDOFF. Update links rather than copy execution history across files.
- Security weakening requires explicit Owner decision and architecture/security review; a smaller workflow never waives required proof.

## History

[Complete pre-consolidation roadmap snapshot](SUD_D_ROADMAP_ARCHIVE_2026-10-27.md) preserves the original decisions, milestone descriptions, evidence and superseded sequencing verbatim. It is an evidence/design lookup, not routine bootstrap or an active dispatch queue. This consolidation changes document organization, not milestone approvals or product runtime status.
