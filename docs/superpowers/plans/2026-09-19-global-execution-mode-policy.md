# SUD-D Global Execution Mode Policy — Product Plan / Home Handoff

Date: 2026-09-19

## Purpose

Promote the repository-local SINGLE / TEAM execution-mode policy into a SUD-D product-level default so every connected project can use the same decision rules without recreating policy files per repository.

This is a product capability plan, not a claim that the feature already exists.

## Dogfood finding

Current behavior observed on Work PC:

- SUD-D exposes Team Mode through `team.start`, `team.status`, `team.submit`, and `team.stop`.
- The MCP server instructs the connected AI to call `work.resume` before substantive project work and to continue an existing Team mission when one already exists.
- Team Mode currently starts only when the connected AI explicitly calls `team.start(goal)`.
- The SUD-D database has global `approval_mode_settings`, but no global execution-mode / agent-policy setting.
- No product-level rule was found that tells the AI to evaluate every task and automatically choose SINGLE vs TEAM.
- A repository-local prototype was tested in another project using:
  - `AGENTS.md`
  - `docs/agent-execution-mode-policy.md`
- That prototype successfully caused the agent to report:
  `Execution mode: SINGLE — ...`
  without the owner explicitly choosing a mode.

Classification: **Product capability gap**.

## Desired product behavior

SUD-D should provide an execution-policy hierarchy:

```text
SUD-D Global Execution Policy
        ↓
Project / Repository Override
        ↓
Task / Owner Override
        ↓
Safety + Approval gates always remain authoritative
```

The connected AI should select execution mode automatically for substantial work.

## Default decision policy

### SINGLE

Use SINGLE when any of these are true:

- task is small or medium and strongly sequential
- one shared context/state dominates the work
- subtasks touch the same files or mutable state
- coordination overhead exceeds parallelism benefit
- safe ownership boundaries are unclear
- mode choice is uncertain

Default when uncertain: **SINGLE**.

### TEAM

Use TEAM only when:

- the task decomposes into clearly independent work items
- work can genuinely proceed in parallel or through distinct role boundaries
- ownership boundaries are explicit
- concurrent writes to the same files/state are not required
- integration/review boundaries are clear
- Team Mode provides a meaningful verification/review benefit

### TEAM exclusions

Do not choose TEAM when:

- multiple agents would modify the same file concurrently
- shared mutable state creates collision risk
- strict sequencing is required
- task size is too small to justify coordination
- a Team mission would weaken or complicate an existing safety gate

## Agent behavior

Before substantial work, the connected AI should:

1. call `work.resume`
2. evaluate Global Policy + Project Override + Task Override
3. select SINGLE or TEAM
4. report one short line:
   - `Execution mode: SINGLE — <reason>`
   - `Execution mode: TEAM — <reason>`
5. continue without asking the owner to choose a mode unless a real safety/authorization/user-decision boundary exists

Mode may change during a task:

- SINGLE -> TEAM only when new safe independent work boundaries become clear
- TEAM -> SINGLE when shared-state or concurrent-write risk appears

Any mode switch should be reported with a short reason.

## Closure mode policy

Execution mode and closure mode are separate decisions:

- Execution mode: `SINGLE` or `TEAM`
- Closure mode: `FAST` or `STANDARD`

Recommended global default for this owner: **FAST**.

### FAST Closure

Use FAST by default for normal personal dogfood/development work:

- run the smallest targeted verification that covers the changed risk boundary
- do not run a broad/full suite unless the changed area or repository policy truly requires it
- do not add unrelated refactors
- avoid repeated review loops when focused verification already passes
- prefer one focused build/check over redundant validation layers
- owner manual dogfood may be the final acceptance gate
- report clearly what was automated vs what remains for owner manual verification
- finish, commit, and hand off promptly once the targeted safety boundary is satisfied

FAST must still obey all safety, approval, Git freshness, destructive-operation, and authorization gates.

### STANDARD Closure

Escalate from FAST to STANDARD when one or more of these apply:

- release/signing/update pipeline
- security/auth/credential boundary
- destructive or data-loss risk
- schema/data migration
- shared production behavior with broad blast radius
- concurrency/recovery/idempotency changes
- repository policy explicitly requires broader validation
- owner explicitly requests STANDARD/full verification
- focused verification exposes uncertainty that cannot be bounded safely

The agent should report the selected closure mode with a short reason for substantial tasks:

- `Closure mode: FAST — <reason>`
- `Closure mode: STANDARD — <reason>`

If uncertain about closure depth, prefer FAST only when the risk boundary is well understood; otherwise escalate to STANDARD.

## Precedence and safety

Recommended precedence:

1. SUD-D safety / approval / capability policy
2. explicit current-task owner instruction
3. project/repository policy
4. SUD-D global execution policy
5. default SINGLE

Execution-mode selection must never grant additional authority or bypass:

- approvals
- workspace freshness checks
- Git safety checks
- destructive-operation restrictions
- tool/session limits
- Team Mode transition rules

## Product requirements

### 1. Global persistence

Add a user-level SUD-D setting persisted outside any project repository.

The setting should be available to every registered workspace on that SUD-D installation.

Candidate execution-mode states:

- `auto` — agent selects SINGLE / TEAM using policy
- `single` — default force SINGLE unless task explicitly overrides
- `team` — prefer TEAM only when Team eligibility/safety checks pass

Recommended execution-mode default: `auto`.

Candidate closure-mode states:

- `fast` — smallest risk-targeted verification; owner dogfood can be final acceptance
- `standard` — broader verification for high-risk changes

Recommended closure-mode default for this owner: `fast`.

Do not store this only in a project `AGENTS.md`.

### 2. Global policy payload

SUD-D should own a bounded, versioned global execution-policy payload.

It should be safe to inject into the MCP server instructions or an equivalent first-class context surface.

Avoid unbounded user prose in the system-level prompt path.

### 3. Project override

Support project-specific override without requiring every project to duplicate the whole global policy.

Possible sources may include repository policy metadata or an explicit SUD-D workspace setting.

Project policy must not bypass product safety.

### 4. Task override

Explicit task instructions such as:

- `Use Team Mode for this task`
- `Use SINGLE mode for this task`

should override the normal auto-selection for that task, subject to safety/capability checks.

### 5. MCP instruction / context integration

Current MCP instruction already tells the AI to call `work.resume` and continue an existing Team mission.

Extend the bounded instruction/context contract so a fresh task also receives the execution-mode selection rule.

The AI should not need the owner to repeat the rule in every prompt.

### 6. Team Mode integration

When AUTO selects TEAM:

- start one bounded Team mission through `team.start(goal)`
- respect existing Team mission limits and transitions
- do not create concurrent writers to shared files/state
- use Team roles only within supported Team semantics

When AUTO selects SINGLE:

- do not create a Team mission merely to record the decision

### 7. UI / settings

Add a clear SUD-D setting such as:

`Execution Mode: Auto / Single / Team-preferred`

Display safe explanatory copy.

Optional later enhancement:

- show selected execution mode for the active mission/work item
- show the short selection reason

### 8. Cross-machine behavior

Work PC and Home PC are separate SUD-D installations.

Define whether global execution policy is:

- installation-local, or
- synchronized through a future user/account configuration layer

Minimum acceptable V1:
- install-local persisted setting with identical defaults on every install

Preferred future behavior:
- account/user synced global policy where supported securely

Do not use Git to synchronize authenticated runtime/session state.

## Suggested implementation areas to inspect

Before implementation, locate current equivalents of:

- MCP server construction / `instructions`
- `work.resume` and resume-context assembly
- Team capability registration
- Team service/admission logic
- settings persistence / singleton settings tables
- renderer Settings / Team UI
- DTO/contracts exposed to renderer
- database migrations
- tests for MCP instructions, Team Mode, settings and policy precedence
- closure-mode selection and FAST -> STANDARD escalation rules

Do not assume exact file names until source inspection.

## Suggested implementation sequence

1. Read repository policy and current Team Mode design/plan.
2. Confirm current master / intended development branch.
3. Create a dedicated feature branch.
4. Specify bounded execution policy model and precedence.
5. Add persistence + migration.
6. Add application/domain contract.
7. Inject safe execution-policy context into MCP connection.
8. Add settings UI.
9. Add project/task override handling if in initial scope.
10. Add automated tests.
11. Dogfood on a real non-SUD-D project without an `AGENTS.md` execution-mode rule.
12. Verify Work PC and Home PC behavior.

## Required automated coverage

At minimum:

- AUTO + small sequential task => SINGLE guidance
- AUTO + clearly separable independent task => TEAM-eligible guidance
- uncertain task => SINGLE
- project override beats global default
- explicit task override beats project/global policy
- safety gate beats all execution-mode preferences
- TEAM exclusion for shared mutable file/state
- existing active Team mission still resumes correctly
- SINGLE selection does not accidentally create a Team mission
- setting persists across restart
- MCP context remains bounded and does not expose secrets
- FAST closure does not trigger broad/full suites without a documented risk/policy reason
- high-risk release/security/migration changes escalate to STANDARD
- explicit owner closure override wins subject to safety

## Dogfood acceptance

Use a project that does not contain the repository-local execution policy prototype.

Success requires:

1. owner provides a normal work request without saying SINGLE or TEAM
2. connected AI reads current SUD-D context
3. agent selects a mode automatically
4. agent reports mode + short reason
5. if TEAM is selected, `team.start` is used correctly
6. if SINGLE is selected, no unnecessary Team mission is created
7. no safety/approval behavior changes
8. result is repeatable across multiple projects
9. normal low-risk work defaults to FAST closure
10. FAST closure runs only focused checks and leaves final manual dogfood clearly to the owner when appropriate
11. a high-risk task escalates to STANDARD without owner having to remember to request it

## Non-goals

Do not in this feature:

- redesign Team Mode role/state machine
- add unrestricted multi-agent parallel file writes
- weaken approvals
- automatically resolve ambiguous destructive operations
- treat project Git state as global user settings
- copy repository-specific policies into every repository

## Current prototype reference

A repository-local prototype exists on the Playwright project branch and was committed as:

`4760719c88dc3544fa684a8442ee697c9a80580e`

Commit message:

`docs: define agent execution mode policy`

Use it as behavioral input only. The product implementation should live in SUD-D, not depend on that project's files.

## Home continuation

At Home PC:

1. fetch this plan branch
2. review this plan against current SUD-D source
3. create a dedicated implementation branch from the intended current development baseline
4. do not implement directly on this documentation-plan branch
5. preserve the existing Team Mode safety model
6. produce a dev handoff/final report with:
   - root cause / capability gap
   - design chosen
   - persistence model
   - precedence rules
   - files changed
   - tests
   - Home/Work dogfood procedure

## Branch for this plan

`plan/global-execution-mode-policy`

Base at creation:

`e1160d9e251cb57d119cd3996e4bb0985a878acb`
