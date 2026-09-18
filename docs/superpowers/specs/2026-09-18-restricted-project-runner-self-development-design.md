# Restricted Project Runner / Self-Development Design

**Date:** 2026-09-18  
**Status:** APPROVED DIRECTION / DESIGN READY FOR IMPLEMENTATION  
**Baseline:** `e1160d9e251cb57d119cd3996e4bb0985a878acb`

## 1. Goal

Enable an installed SUD-D to develop the SUD-D source Workspace through the existing chat/agent workflow:

```text
open SUD-D source Workspace
→ edit through existing Workspace / semantic-write capabilities
→ verify / build through Restricted Verify
→ package a Windows installer candidate
→ inspect / commit / push through existing Git capabilities
```

The capability must remain bounded. It is not a general shell, process manager, release publisher, package installer, or secret-bearing release system.

## 2. Current Product Truth

The current trusted execution path remains:

```text
MCP Gateway → Tool Kernel → Policy → Approval → Execution → Audit
```

Production already exposes one fixed-purpose `verify.run({ action })` capability. Its public input is strict and carries no caller-selected executable, argv, cwd, env, shell, Workspace root/id, or raw command text.

Current approved actions are:

```text
test
lint
typecheck
build
diff_check
secret_scan
```

The process-backed actions resolve a declared pnpm/npm script, launch the resolved Node executable with fixed argv and `shell:false`, use a filtered environment, bound/redact output, enforce timeout/tree cleanup, and execute only inside the active Workspace.

The SUD-D root already declares `package:win`; the Desktop package script builds the app and NSIS installer with `--publish never`. Packaging requires a full Git revision, a clean tracked worktree, and the update verification public key.

## 3. v1 Scope Decision

Extend the existing Restricted Verify module instead of creating a second execution subsystem.

Add exactly one public action:

```text
package_win
```

The external tool remains:

```text
verify.run({ action: "package_win" })
```

No new MCP tool is added. Production tool count therefore remains unchanged.

The existing result shape remains unchanged:

```ts
{
  action,
  passed,
  exitCode,
  output,
  truncated,
  durationMs
}
```

This deliberate compatibility choice keeps the public interface small even though `verify.run` now covers one bounded packaging action in addition to verification actions.

## 4. Explicit Non-Goals

v1 does not add:

- arbitrary executable, argv, cwd, env, shell, or raw command input;
- a generic process manager or `code.run`;
- dependency/package installation or update;
- version bumping;
- release-manifest signing;
- private signing-key access;
- GitHub release publication or any `--publish always` path;
- generic Network capability;
- Delete/Recovery expansion;
- a new renderer execution surface;
- automatic branch/commit/push behavior.

Release signing and publication remain separate release authority.

## 5. SUD-D Project Profile

`package_win` is initially available only for the recognized SUD-D source profile.

The resolver must fail closed unless all of these are true:

1. the active Workspace resolves exactly to its canonical root under the existing Workspace/InternalRoot rules;
2. the root manifest identifies the SUD-D private pnpm workspace;
3. the root `package:win` script matches the implementation-approved SUD-D script contract;
4. the Desktop manifest identifies `@sud-d/desktop`;
5. the Desktop `package:win` script matches the implementation-approved fixed packaging contract;
6. the trusted update verification public-key file exists at the fixed Workspace-relative path;
7. that file canonicalizes inside the Workspace and contains a public-key PEM, never private-key material;
8. the required local Node/pnpm runtime and project dependencies are available.

The caller cannot select a profile, script, executable, package manager, path, or environment value.

Future projects may add separately reviewed profiles later. v1 is intentionally SUD-D-first.

## 6. Fixed Action Mapping

The runner owns the mapping:

```text
test         → root script "test"
lint         → root script "lint"
typecheck    → root script "typecheck"
build        → root script "build"
package_win  → root script "package:win"
diff_check   → existing fixed Git diff-check adapter
secret_scan  → existing fixed Git secret-scan adapter
```

`package_win` must never accept a caller-supplied script name.

The implementation should keep the mapping local to the Restricted Verify/Project Runner module rather than spreading action-specific conditionals across MCP, Policy, and callers.

## 7. Public Verification Key Decision

The update verification public key is public material by design: the installed application already embeds it to verify update manifests.

For self-contained packaging, track the current production update verification public key inside the source repository at a fixed path such as:

```text
packages/desktop/release/update-public-key.pem
```

The private signing key remains outside Git and outside the runner.

For `package_win`, the runner injects only:

```text
SUD_D_RELEASE_PUBLIC_KEY_FILE=<fixed canonical Workspace path>
```

into the child environment. This value is computed by trusted code and cannot come from the caller.

The runner must not forward:

```text
SUD_D_RELEASE_PRIVATE_KEY_FILE
GH_TOKEN
GITHUB_TOKEN
```

or any other secret-bearing release credential.

This replaces the old local packaging dependency on an externally configured public-key file while preserving the private-key boundary.

## 8. Git / Release Preconditions

`package_win` preserves the existing package pipeline's hard gates:

- full Git revision is required;
- tracked worktree must be clean;
- updater public key is required;
- packaging uses `--publish never`;
- package/version/revision consistency remains checked by existing packaging code/tests.

Do not weaken `SUD_D_REQUIRE_BUILD_REVISION`, `SUD_D_REQUIRE_CLEAN_RELEASE`, or `SUD_D_REQUIRE_UPDATE_PUBLIC_KEY`.

A dirty worktree or invalid profile fails closed. The runner does not auto-commit, reset, stash, clean, or modify Git state to make packaging pass.

## 9. Policy and Approval Semantics

`verify.run` keeps the existing `execute` effect and Tool Kernel path.

`package_win` is exact-bound to the action in one-time Approval.

Approval Mode behavior:

- **Standard:** explicit approval required;
- **Approve for me:** `package_win` is NOT added to the routine auto-approval action set, so explicit approval remains required;
- **Full Access:** retain the existing Full Access semantics; do not create a special package-only bypass.

Existing routine verification actions keep their current behavior.

The approval title for `package_win` should be user-readable, e.g. **Package Windows installer**, rather than exposing the internal action token.

## 10. Process / Output Bounds

Keep existing safe process behavior:

- resolved Node executable only;
- fixed pnpm/npm invocation;
- `shell:false`;
- active Workspace cwd only;
- filtered environment;
- stdout/stderr capture only;
- secret-shaped output redaction;
- bounded UTF-8 output;
- process-tree cleanup on timeout.

Packaging may need a larger timeout than ordinary verification. Use a fixed action-specific timeout for `package_win` (recommended ceiling: 15 minutes) while leaving existing verification limits unchanged.

No caller timeout override is allowed.

## 11. Network Boundary

The runner adds no general Network capability and passes no release/network credentials.

The SUD-D packaging contract remains fixed to `--publish never`.

v1 assumes project dependencies and required packaging tooling are already installed locally. Missing local prerequisites must fail closed; the runner must not add a fallback dependency-install, package-update, or publish flow.

If implementation evidence shows the packaging path requires new network authority rather than merely using existing local dependencies/tooling, stop and return to Product Owner review instead of broadening the runner.

## 12. Audit / Activity

Keep the existing `restricted_verify.run` summary event and bounded result metadata.

For `package_win`, durable audit may record only safe fields already used by Restricted Verify, including:

- action;
- pass/fail;
- exit code;
- truncation flag;
- duration;
- stable result code.

Do not persist raw package output, argv, environment, key contents, absolute public-key path, tokens, or private-key material.

Existing Approval Activity remains the user decision surface. No new page is required.

## 13. Failure Model

Reuse existing stable Restricted Verify failure behavior where possible.

Profile mismatch, missing trusted public key, missing local runtime/dependencies, or unsupported SUD-D package profile must fail closed as profile unavailable or a narrowly added stable project-profile error if a distinct code materially improves diagnosis.

Process start and timeout keep their existing stable failures.

A non-zero package exit is an executed result with `passed: false`, not a privileged fallback trigger.

## 14. Security Invariants

Implementation is invalid if it introduces any of these:

- caller-selected process authority;
- shell text;
- caller-selected environment;
- outside-Workspace package inputs;
- private signing-key access;
- release publication;
- silent dependency installation;
- automatic Git mutation to satisfy packaging;
- raw secret-bearing output or audit persistence;
- a renderer-controlled privileged process seam.

The private release signing key remains completely outside this capability.

## 15. Acceptance

Implementation is complete only when all are demonstrated:

1. existing six actions retain current behavior;
2. `verify.run({ action: "package_win" })` is accepted and malformed extra fields still fail closed;
3. production MCP tool names are unchanged;
4. non-SUD-D Workspace/profile rejects `package_win`;
5. modified/unapproved packaging script shape rejects `package_win`;
6. fixed public-key path is Workspace-contained and private-key markers are rejected;
7. Standard and Approve-for-me require explicit one-time approval for `package_win`;
8. changed action cannot reuse approval;
9. package execution keeps `shell:false`, fixed cwd/argv, filtered env, bounded/redacted output, and timeout tree cleanup;
10. real Home-PC production MCP acceptance creates a Windows installer from the SUD-D source Workspace through installed SUD-D;
11. the generated installer embeds the expected Version and full Git Revision;
12. the tracked source stays clean after packaging;
13. no private key/token is present in package output or audit;
14. existing updater/release packaging regressions remain green;
15. Security/Data + Standards + Spec final review has zero blockers.

## 16. Fast Closure

Use focused-first / final-once verification.

Reuse the already accepted installer/update evidence for unchanged source. During implementation, run focused RED/GREEN tests for the runner/profile/public-key changes. At final closure run the Security/Data gates invalidated by this capability once.

Do not rerun public release A→B acceptance unless the implementation changes updater runtime behavior, signing/manifest semantics, or the installed update path.

## 17. STOP CONDITION

Stop after the Restricted Project Runner implementation is verified, Product Owner real packaging acceptance is complete, the implementation branch is committed/pushed, and the handoff records the exact result.

Do not proceed automatically into release signing, public publication, arbitrary Execute, package installation, or another milestone.
