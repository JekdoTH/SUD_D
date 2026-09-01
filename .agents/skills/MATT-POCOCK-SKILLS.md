# Matt Pocock Skills Snapshot

SUD_D tracks a curated third-party Agent Skills snapshot from the official Matt Pocock skills repository.

- Upstream: `https://github.com/mattpocock/skills`
- Pinned commit: `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`
- License: MIT; see `MATT-POCOCK-LICENSE` in this directory.
- Adopted: 2026-09-01
- Selected canonical skills: `tdd`, `diagnosing-bugs`, `codebase-design`, `domain-modeling`, `code-review`, `prototype`, `research`, `resolving-merge-conflicts`, `grilling`, `writing-for-agents`, `handoff`, `to-spec`, `wayfinder`.

Each selected directory is copied completely and without SUD_D-specific edits from the pinned official upstream commit. These are third-party workflow instructions and remain subordinate to SUD_D `AGENTS.md`, explicit task/user scope, security invariants, and STOP conditions.

## Update policy

Skill versions must not drift during ordinary product work. A future update is a separate governance/tooling task that pins a new upstream commit, reviews selected-directory changes and routing impact, replaces the exact copied files, updates this provenance record, verifies the snapshot, and commits the update separately. Do not run automatic skill updates during a milestone.
