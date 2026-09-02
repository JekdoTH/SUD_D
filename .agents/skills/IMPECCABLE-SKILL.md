# Impeccable Skill Snapshot

SUD_D tracks the Impeccable UI/UX Agent Skill as a pinned third-party repo-local snapshot.

- Upstream: `https://github.com/pbakaus/impeccable`
- Release tag: `skill-v4.1.3`
- Pinned commit: `c0f495212236129c2e92aaf7714a3a9914569d13`
- Skill metadata version: `4.1.3`
- License: Apache-2.0; see `IMPECCABLE-LICENSE` in this directory.
- Adopted: 2026-09-02
- Canonical installed skill: `impeccable`

The complete `.agents/skills/impeccable/` directory is copied without SUD_D-specific edits from the pinned official upstream release commit. These third-party workflow files remain subordinate to SUD_D `AGENTS.md`, explicit user/task scope, security invariants, least-privilege/fail-closed rules, and STOP conditions.

## Update policy

Impeccable must not drift during ordinary product work. Any upgrade is a separate explicit governance/tooling task that pins a new upstream tag and commit, reviews the snapshot/routing impact, replaces the canonical copied files, updates this provenance record and license when required, verifies byte/content equivalence, and commits the update separately. Do not run automatic Impeccable updates during a product task.
