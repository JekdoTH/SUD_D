# Restricted Project Runner / Self-Development Implementation Plan

**Date:** 2026-09-18
**Design:** `docs/superpowers/specs/2026-09-18-restricted-project-runner-self-development-design.md`
**Implementation baseline:** `e1160d9e251cb57d119cd3996e4bb0985a878acb`

## Task Contract

Implement the approved v1 design only.

The public capability stays `verify.run({ action })`. Add exactly one action, `package_win`, backed by the existing Restricted Verify process runner and Tool Kernel/Policy/Approval/Audit path.

Do not add a new process tool, shell, release signing, publishing, package installation, or private-key authority.

## Mandatory Start

Before source edits:

1. run the repository bootstrap required by `AGENTS.md`;
2. capture task-start baseline and preserve unrelated work;
3. run the Mandatory Skill Router Gate;
4. load at least:
   - `tdd` for source behavior changes;
   - `codebase-design` if the Restricted Verify profile/runner interface is materially reshaped;
   - `impeccable` before changing/reviewing renderer-visible approval copy;
5. publish the Security/Data Critical Pre-Implementation Compliance Check;
6. use this design as the primary Spec.

Expected final review must route `code-review`.

## Task 1 — RED: Public Action and Surface

Primary files:

- `packages/domain/src/restricted-verify.ts`
- `packages/tests/src/restricted-verify.test.ts`
- production MCP surface tests

Add RED coverage proving:

- exact actions become the existing six plus `package_win`;
- `verify.run({ action: "package_win" })` is valid;
- any extra process-control field remains invalid;
- no new MCP tool name appears.

Completion: focused tests are RED for the missing action and surface behavior only.

## Task 2 — RED: Approval Semantics

Primary files:

- `packages/application/src/approval-service.ts`
- `packages/application/src/restricted-verify-capabilities.ts`
- Basic Approval production/security tests

Add RED coverage proving:

- Standard requires explicit approval;
- Approve-for-me still requires explicit approval for `package_win`;
- existing routine verification actions keep current Approve-for-me behavior;
- package approval binding contains trusted current `headSha`, `statusId`, and a bounded package-profile digest in addition to the action;
- changing the action, HEAD, tracked state, package-script contract, or trusted public key cannot reuse an approval;
- dirty/unsupported Git state or invalid package profile fails before package approval is offered;
- Full Access keeps existing global semantics without a package-specific bypass;
- user-facing approval title is `Package Windows installer` or equivalent approved copy.

Use the existing `approval.bind(input, security)` seam. Resolve the active Workspace from trusted `workspaceId`, then derive Git/package binding fields through trusted dependencies; do not add revision/profile fields to MCP input.

Completion: approval-focused tests are RED before implementation.

## Task 3 — Trusted Public Verification Key

Add one tracked public-key file at the fixed design path:

`packages/desktop/release/update-public-key.pem`

Source requirements:

- obtain only the current production **public** verification key from the trusted release environment or other already trusted public source;
- never read, copy, print, persist, or derive the private signing key in logs/reports;
- verify that the candidate public key matches the currently accepted update trust root before committing it;
- public-key content may be tracked because it is already embedded in shipped SUD-D; private key remains external.

Add focused tests proving:

- file is a valid public-key PEM;
- no private-key marker exists;
- package profile rejects missing/invalid/private-key content;
- canonical key path is inside the active Workspace.

If the current trusted public key cannot be established safely, STOP before production packaging support rather than using a placeholder.

## Task 4 — SUD-D Project Profile

Primary file:

`packages/infrastructure/src/restricted-verify-adapter.ts`

Introduce the smallest local profile logic needed for `package_win`.

Expose only the minimum trusted internal helper needed by the capability to resolve a package approval context before execution. That helper should return safe bounded state such as `headSha`, `statusId`, and `profileDigest`; keep raw manifests, absolute key paths, and command text inside the implementation.

Required behavior:

- caller still supplies only `action`;
- fixed mapping is `package_win → package:win`;
- recognize only the approved SUD-D root/Desktop package profile;
- validate the current root and Desktop packaging-script contracts;
- reject a non-SUD-D Workspace;
- reject modified/unapproved `package:win` script shape;
- require local Node/pnpm/project prerequisites;
- require a supported Git repository with a full HEAD and clean tracked state for package approval/execution;
- create a stable profile digest from the approved root/Desktop packaging contract plus the trusted public-key identity;
- create a launch plan only after the full profile passes.

Do not create a generic user-editable command registry in v1.

Completion: profile-focused RED tests turn GREEN without changing public input shape.

## Task 5 — Fixed Packaging Environment and Limits

Extend launch planning so `package_win` receives only the existing safe environment plus:

`SUD_D_RELEASE_PUBLIC_KEY_FILE=<canonical fixed Workspace public-key path>`

Explicitly prove the child environment does not forward:

- `SUD_D_RELEASE_PRIVATE_KEY_FILE`;
- `GH_TOKEN`;
- `GITHUB_TOKEN`;
- arbitrary caller/host release variables.

Keep:

- resolved Node executable;
- fixed pnpm/npm invocation;
- active Workspace cwd;
- `shell:false`;
- stdio capture only;
- existing output redaction and bounds;
- process-tree cleanup.

Add a fixed package-specific timeout of at most 15 minutes. Existing action limits must not be unintentionally widened.

Completion: launch-plan and process-boundary tests are GREEN.

## Task 6 — Preserve Release Safety Gates

Do not weaken the existing Desktop `package:win` script or Vite release checks.

Focused tests must prove the packaging path still requires:

- full Git revision;
- clean tracked worktree;
- update public key;
- `--publish never`.

Dirty worktree behavior must fail; do not add auto-commit/reset/stash/clean.

No version bump, manifest signing, GitHub publication, or private key is in scope.

## Task 7 — Audit / Activity / Safe Output

Keep `restricted_verify.run` as the summary audit action unless a change is strictly necessary.

Prove package execution records only bounded metadata:

- action;
- pass/fail;
- exit code;
- truncation;
- duration;
- stable result code.

Raw output, argv, env, absolute key path, token values, and key content must not enter durable audit.

Activity should reuse the existing Approval/result flow. No new page is required.

If approval copy is changed, load `impeccable` before that renderer-visible copy phase and perform only the bounded copy/state review required by the repo gate.

## Task 8 — Focused GREEN / Regression

Run the smallest fresh set that proves the change:

1. Restricted Verify focused contract/profile/process tests;
2. Basic Approval production/security tests covering `verify.run`;
3. production MCP surface test;
4. updater/package regression tests invalidated by the tracked public key and packaging profile;
5. any work-resume/Team regression whose exact verify action assumptions changed.

Do not run the full suite between each edit.

## Task 9 — Real Home-PC Production Acceptance

Use the installed SUD-D → production MCP path, not a direct shell invocation as the acceptance seam.

Acceptance flow:

1. active Workspace is the real SUD-D source repository on the approved implementation branch;
2. `work.resume`;
3. establish a clean committed source revision;
4. call `verify.run({ action: "package_win" })`;
5. confirm Approval Required;
6. approve through the trusted Desktop approval surface;
7. prove a revision/profile change invalidates the old grant in focused acceptance coverage, then restore the accepted clean candidate;
8. retry the exact action against the same trusted HEAD/profile state;
9. confirm PASS and bounded safe output;
10. verify a Windows installer is produced in the existing ignored release-output location;
11. verify packaged Version and full Git Revision match the source candidate;
12. verify source tracked worktree remains clean;
13. verify no release was published and no release/private-key credential was used;
14. verify existing local SUD-D user data is unchanged.

A direct `pnpm package:win` run may be used only as diagnosis if the production acceptance fails; it is not the acceptance result.

## Task 10 — Final Security/Data Gates

After source is stable, run final-once gates required by `AGENTS.md` and invalidated by this change:

- focused tests;
- relevant regressions;
- lint;
- typecheck;
- full test suite;
- build;
- `git diff --check`;
- secret scan;
- required real smoke/acceptance;
- final `code-review` Standards + Spec/Security.

Because this is Security/Data Critical, do not skip the full suite at final closure.

Do not repeat installer A→B public update acceptance unless the implementation changes updater runtime/signature/update semantics.

## Task 11 — Handoff / Commit / Push

Before commit:

- inspect full diff and staged paths;
- confirm `.serena/` is untracked/local-only;
- confirm no private key, token, credential, or secret-derived output is staged;
- update `SUD_D_HANDOFF.md` with exact implementation/verification/acceptance results;
- record any blocked environmental prerequisite explicitly.

Commit and push only the implementation branch authorized for this task.

## STOP CONDITION

Stop after:

- `package_win` is implemented through the bounded existing runner;
- Security/Data final gates pass;
- real Home-PC installed-SUD-D packaging acceptance passes;
- final Standards/Spec review has zero blockers;
- implementation branch is committed/pushed and handoff is current.

Do not begin release signing/publication, arbitrary Execute, dependency installation, or a later milestone.
