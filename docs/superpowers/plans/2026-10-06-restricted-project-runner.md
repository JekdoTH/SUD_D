# Restricted Project Runner — proposed implementation plan

Started: 2026-10-06; latest P0c.3 design decision: 2026-10-07 (Asia/Bangkok). **STRONG STORAGE ISOLATION DECISION: SELECTED for later feasibility only**; latest task is design/spec/plan, not implementation or spike permission. P0b = PASS; P0c/P0c.1/P0c.2 = BLOCKED; runner.start = UNEXPOSED. Earlier P0c authorization and dirty foundations remain preserved. P0c.3 below replaces the open isolation prerequisite with a concrete contingent task; it does not close the storage gate. P0d/later remain unauthorized. Original baseline: `261d9d452bce31cb8ca6a6f70666c670f40bf84f`.

## P0c.3 dedicated Serena feasibility plan — NOT AUTHORIZED TO RUN

**Purpose:** test the selected full Hyper-V Windows guest + fixed guest disk/private host pool + bounded non-IP artifact broker. Read [selected capacity/security contract](../specs/2026-10-06-restricted-project-runner-design.md#p0c3-strong-storage-isolation--selected-for-feasibility-only) and [Windows options matrix](../research/2026-10-06-restricted-project-runner-windows.md#p0c3-strong-storage-isolation-research--2026-10-07). No production code or runner.start registration. P0c.2's actual AppContainer profile/registry writes reject the old no-write premise; do not rerun environment redirection as if it solved it.

### Authorization and smallest setup

Before dispatch, Product Owner explicitly decides whether to permit virtualization/feature enablement/reboot if needed, a licensed maintained guest image, substantial fixed storage/RAM, and a narrowly scoped privileged helper with independent failure supervision. State Desktop/guest runner unprivileged **and host helper privileged during jobs**. Any firmware/OS upgrade, service installation or global policy mutation requires separate explicit permission; none is inferred. No Home fallback, no global firewall/ACL/quota changes, no WinRM and no owner Workspace access. If owner rejects these tradeoffs, STOP BLOCKED with smallest alternative decision rather than silently relax the threat model.

Proposed disposable source/evidence location (not created): `.serena/runner-strong-storage-spike/p0c3-20261007/`; final local report: `.serena/reports/restricted-project-runner-strong-storage.md`. Never stage these. Use a distinct recorded VM GUID and private fixture/pool identity; never target an existing owner VM by display name. Record exact absolute fixture/disk paths before any cleanup. Source builds use existing authorized tools only; missing SDK/compiler/image requires an explicit next decision, no dependency installation in this plan task.

Start with one complete fixed Windows guest disk and one preprovisioned VM slot; pin guest/Node/helper/agent/input hashes. Choose and record exact byte values `G`, `P`, every auxiliary `H_i`, M=1, backing allocation allowance, guest/VM RAM/CPU limits, boot/run/stop/watchdog deadlines and artifact/log ceilings **before launch**. No changing caps midway to accommodate flood. Keep existing 64 MiB artifact, 256 MiB snapshot and 32 KiB log ceilings or stricter; include their physical copies/metadata in P. A missing finite capacity/deadline or an unsupported image blocks provisioning/launch. Do not create a huge speculative VM farm or native production adapter.

### Windows surfaces to test (fixed internal operations, not public shell)

- Hyper-V platform/management availability and target-build WMI v2 `Msvm_VirtualSystemManagementService` provisioning/settings/removal plus `Msvm_ComputerSystem.RequestStateChange` for the **one owned** VM. Read back no NIC, exact disk/device/integration graph, fixed memory, automatic start Nothing, stop TurnOff, disabled automatic/manual checkpoints, saved-state/expansion/migration/nested-virtualization policy. Validate target build supports settings; do not assume latest Server docs apply to 19045.
- Native VirtDisk `CreateVirtualDisk`, `OpenVirtualDisk`, `GetVirtualDiskInformation` and `AttachVirtualDisk`/`DetachVirtualDisk` for a trusted dedicated host pool only, with fixed allocation and measured backing/geometry. Hyper-V consumes guest VHDX directly; never mount a runner-mutated guest filesystem on host for results. All pool formatting is confined to disposable approved storage, never existing owner volumes.
- Winsock `socket(AF_HYPERV, SOCK_STREAM, HV_PROTOCOL_RAW)`, exact VM/service endpoint `connect` or exact-bound `bind/listen/accept`, bounded `send/recv`, cancellation/close. One owner-approved `GuestCommunicationServices` GUID registration; no wildcard VM listener. Test caller/service access control, not just a nonce in a frame.
- Guest registry APIs (HKCU/private AppContainer and privileged test fixture HKLM), profile/cache/temp writes, guest NTFS allocation behaviors and guest agent's suspended root/Job ownership. Test standard runner isolation from privileged guest-agent configuration and IPC. No runner-admin token.
- Host helper IPC authorization, fixed VM ownership, watchdog/supervision/restart reconciliation and finite host state paths. A disposable temporary helper may establish APIs; any installed service/recovery configuration needs explicit scoped authorization and a cleanup ledger.

### Minimal ordered proof / STOP matrix

| Step / real Windows test | PASS evidence / immediate BLOCKED condition |
| --- | --- |
| 1. Read-only preflight and owner consent | Record OS edition/build/servicing, virtualization/SLAT/feature state, SDK and host/guest/image provenance; exact granted setup scope and host storage/RAM reservation. Unsupported/missing/declined requirement = unavailable, no mutation fallback. |
| 2. Authority/channel inventory before code | Enumerate guest disks/devices, integrations/VMBus, host helper rights, all VM/broker/host auxiliary write paths including registration, paging, event/WER and DB/audit/WAL. Each has finite OS enforcement P or H_i. Unidentified/unbounded channel blocks further acceptance; default event-log retention is not assumed. |
| 3. Positive immutable offline Node fixture | Pinned Node runs under standard guest runner token, reads only approved input, returns declared safe artifact. Verify image/input/runtime hashes and protected agent process ownership. Original host/Workspace/InternalRoot and unrelated VM sentinels unchanged. |
| 4. Files/profile/registry bound | Attempt profile root, private INetCache/Cookies/History/Temp, user hive and guest-system-hive writes. Registry supporting files stay inside G; standard runner HKLM denial and separate privileged guest fixture demonstrate whole-guest disk semantics. Same-named synthetic host registry/files remain unchanged. No host hive/file inheritance/projection. |
| 5. Capacity exhaustion and concurrency | Simultaneously flood ordinary/small files, metadata/ADS, sparse/compressed files, profile/cache, registry hive/log growth, scratch, partials and guest dumps until disk full. Repeat across failed attempts. Native failure occurs at unchanged G/P/H_i; no spill/expansion/extra backing file, bounded total physical retained allocation. Logical byte counters/periodic samples alone cannot PASS. |
| 6. Host-pool/artifact exhaustion | Fill disposable P including reset copies, VM state, artifacts, interrupted output and retention; budget/reserve refusal before another launch; old evidence retained or explicit failure, no auto-grow/free-space fallback. Independently challenge every H_i or give a source-backed enforced finite boundary plus actual path evidence. Shared audit/DB growth outside a hard boundary = BLOCKED. |
| 7. Bounded artifact return | Exact-owned endpoint with no NIC/share; 64 MiB+1, malformed/oversized header/frame, extra IDs, invalid UTF-8, binary payloads, forbidden path labels, unknown/late attempt, forged guest status/hash, stalling reader and broker cancellation. Reject before excess persistent storage, bounded memory/backpressure; host hashes final private bytes. Unrelated VM cannot impersonate endpoint; no guest-selected host file operation. |
| 8. Filesystem/service escape | Demonstrably attempt host paths/shares, outside snapshot/InternalRoots/credentials using synthetic sentinels, reparse/junction/ADS labels, host service/file-copy/PowerShell Direct/other integration channels, hot-add/resize device and arbitrary helper VM/path/command requests. No host read/write authority or fallback; compare hashes/existence without printing secrets. |
| 9. Offline network | No vNIC. Actual Internet/DNS/LAN and host loopback listener/proxy requests fail from guest; no artifact-protocol TCP tunnel, no network inherited from helper. Guest-local loopback alone is not host connectivity. Network tests use authorized synthetic endpoints, no credentials/provider charges. |
| 10. Lifecycle / forged success | Root-child-grandchild, early root exit, guest service-mediated descendants, stop/timeout and broken artifact channel: exact VM Off plus closed/drained IO; unrelated VM/process untouched. Guest exit-zero claim without protected-agent evidence cannot publish success. Guest runner cannot alter agent/helper or budgets. |
| 11. Crash and orphan series | Separately crash guest/root, gateway, broker and privileged helper; independent supervision ends exact VM within fixed recorded deadline. Helper/VM state uncertainty blocks admission. Approved disposable host reboot/power-loss test or explicitly missing proof = BLOCKED. No Save/AVHDX/auto-start/resume; reboot reconciliation reclaims/quarantines same slot, charges debris, never allocates a second slot. |
| 12. Reset and cleanup | Prove VM Off/file handles closed before golden reset, hash sealed golden/new guest and erase previous-job authority; reset temporary copies remain within P even if interrupted. Fill pool during reset to force fail-closed admission. Exact VM GUID/service GUID/private paths ledger cleanup only; unrelated resources unchanged; no dropped reservations for uncleared data. |

Per-probe evidence must include actual executed negative attempt/result, device/build/profile hashes, ownership/configuration readback, enforced capacity mechanism, physical allocation inventory, timeouts and safe sentinel comparisons. A filesystem scan alone cannot enumerate service/registry authority; combine source-backed enforcement argument, complete device/channel inventory and negative tests. A few steady-state samples cannot prove a worst-case disk bound. Record missing/unsupported claims explicitly, never PASS by omission.

### Cleanup, verdict and handoff

Only delete/detach/remove exact disposable resources recorded in the approved setup ledger after stopping the exact VM and closing IO; resolve absolute paths inside the owned spike directory before recursive deletion. Remove only the newly registered service GUID/helper/test resources; preserve pre-existing features/services/VMs/owner settings. Feature disable/reboot/firmware restoration is separately owner-controlled, not automatic cleanup. Failure leaves a clearly reported quarantined charged resource and BLOCKED admission, not broad cleanup. No production/package source, dependency, release, commit or push.

**Spike PASS** requires every row and the entire physical bound including all H_i, protected execution evidence, fixed privilege seam, network/FS denial, artifact return and independent crash termination. Partial guest-disk/registry/broker success = **BLOCKED**. Record exact failing channel and smallest next owner choice. Even full spike PASS does not expose runner.start: return local report plus this spec/plan to architecture/security review, then obtain separately scoped production authorization. Existing P0c.1 implementation sequence stays contingent and its host-child transport/runtime must be revised for the selected VM before execution.

Forwarding after owner authorization: tell **Serena** to execute only this P0c.3 section in this existing plan, with the selected spec section and research matrix as prerequisites. Do not start the spike or send a new task automatically from this design review.

## Entry decisions and gates

Owner chooses offline Node snapshot/output-only P0, one acceptance fixture, and whether containment feasibility precedes Parallel Coding. Missing `SUD-D_NEUTRAL_RUNNER_ARCHITECTURE.md` must be supplied/reconciled before final architecture approval. Provider/media native execution is not silently part of offline P0.

Risk for future execution implementation: **Security / Data Critical**. Route `tdd` when security behavior changes; `codebase-design` for changed seams; `domain-modeling` for new state vocabulary; `impeccable` before approval UI design/edit/review; `writing-for-agents` for handoff; `diagnosing-bugs` only for unexpected failures; `research` for unresolved platform/runtime behavior. These are future triggers, not a claim they were all loaded or tests run in this design task.

Do not build the runtime and add trust controls afterward. Each independently authorized slice stops at its own focused proof and owner candidate. Final independent security/architecture review is required before any runner.start production exposure. A full repository suite, installer, publication and dependency changes are outside this design task and must not be inferred from this plan.

## 1. P0a — read-only contract / discovery

Likely new files:

- `packages/domain/src/project-runner.ts` — manifest vocabulary, bounded input schema, safe candidate/result/error types; no Node/host internals.
- `packages/infrastructure/src/runner-manifest.ts` — fixed-path bounded read, duplicate-key-aware parse, canonical digest, path/classifier guards.
- `packages/application/src/project-runner-capabilities.ts` — discover only at this slice, through Kernel/Policy.
- `packages/tests/src/project-runner-contract.test.ts`, `project-runner-discovery.test.ts`.

Likely existing files: package `src/index.ts` exports; `packages/mcp-gateway/src/workspace-file-server.ts` strict schema, registration/composition; `packages/application/src/work-resume-guard.ts`; `packages/domain/src/result.ts` only if its error union needs additive codes. Inspect current tool-list acceptance assertions before updating them; unavailable start/stop/log tools remain unregistered.

TDD order:

1. RED a candidate manifest discovered in exactly one active Workspace; no parent search/no launch.
2. RED unknown/duplicate keys, oversized bytes/count/schema, sensitive label/input, unsupported runtime/network/secret profiles, missing entry, traversal, absolute/UNC/ADS/reparse/InternalRoot cases.
3. RED deterministic canonical digest and each authority/schema/label change invalidating it. A manifest digest is named definitionDigest, **not** the execution fingerprint.
4. Implement the smallest parser/discovery path; prove guarded MCP dispatch and exact read-only exposure with no new execute/network/delete authority.

Focused checks: those two test files, affected typecheck, diff check; one real built-stdio discovery call against disposable fixtures. Owner acceptance: a candidate appears with blocked execution reason, README/package scripts alone confer no authority. STOP: discovery candidate only; no process launch or automatic enrollment.

## 2. P0b — disposable Windows enforcement feasibility

Run before any production runtime implementation. Save transient native spike artifacts under `.serena/` and never stage them. No owner Workspace, credentials, broad firewall changes, global ACL changes or package dependency churn. Use local synthetic sentinels and isolated fixture workspaces. A native helper/toolchain dependency must be separately scoped in the authorized spike task.

Internal seam to prove: `launchSealedOfflineJob(approvedSnapshot) → ownedHandle` with cancellation/job-empty evidence. It accepts only a host-resolved sealed plan; it is never an MCP/renderer interface. Future adapter can be mocked through this seam, but mocks cannot satisfy the OS gate.

Mandatory proof matrix (fresh on target Windows device; each negative attempt must demonstrably execute and be denied):

| Probe | Required evidence |
| --- | --- |
| Positive pinned Node fixture | Runs under actual isolated token, reads staged input, writes new private output |
| Live source / prior artifact read-write-truncate-delete | All denied; original hashes and existence unchanged |
| Outside Workspace, user-profile/.env/credential sentinels, SUD-D app data/InternalRoots | Read/write denied; sentinel contents never printed |
| Snapshot mutation, another Job, caller-created junction/reparse/hardlink | Denied or safe rejection; approved bytes unchanged |
| Internet/DNS/localhost/LAN, redirects/proxy env | No successful network; no inherited fallback |
| Child/grandchild + root exits early | Root and descendants remain owned, no early success |
| Breakaway, WMI/COM/service/broker launch, inherited privileged handles | Denied/contained; no unowned continuing child or privileged IO |
| Stop, timeout, gateway crash, tunnel loss, Job setup/assignment/resume failure | Entire owned job ends; unrelated sentinel process stays alive; no fallback |
| Process/memory/time caps | Enforced during execution |
| Aggregate writable-output / disk cap | **Deferred from P0b proof semantics to the mandatory P0c production-exposure gate; not required to declare P0b containment feasibility PASS** |
| Multiple owner instances and nested host jobs | Exclusive ownership or fail closed; no duplicate execution |
| Seal/hash/publish races | Held handles/ACLs prevent executing changed bytes or publishing switched path |

OS references: [research note](../research/2026-10-06-restricted-project-runner-windows.md). Job Object is lifecycle only; AppContainer defaults and compatibility are proof obligations. A successful safe fixture is insufficient without negative probes. Keep concise per-probe safe evidence with device/OS/runtime revisions.

STOP: any inconclusive or failed P0b containment/process-cleanup proof blocks P0c. P0b containment feasibility is now accepted from the recorded real-OS evidence. Aggregate writable-output/disk budget remains a separate mandatory P0c gate: if it cannot be enforced race-safely, keep `runner.start` unexposed. Do not invent a broader security exception or launch through Restricted Verify.

## P0c.1 broker candidate — BLOCKED before implementation

Historical contingent sequence: P0c.3 now defines the next isolation feasibility step. Its bounded whole-guest state supersedes the host-runner zero-persistence premise and host-child pipe/runtime assumption below. Do not execute this sequence unchanged or treat its logical broker subset as aggregate capacity proof. Remaining parser/accounting/atomic evidence requirements still apply after later review/authorization.

This is a contingent sequence for architecture review, **not approved implementation work**. Protocol/broker logical accounting is viable in isolation but cannot close the requested gate. Do not implement the easy broker subset and defer its exclusive-persistence premise. No new production files, dependencies, tests or native probes in the current task.

### Prerequisite owner decision / feasibility stop

Authorize a disposable Windows no-persistent-write + capacity-bound investigation, or separately select stronger isolation/storage. Exact property: runner and descendants cannot write persistent data outside bounded owned broker channels, including private profile/temp/registry/shared directories, inherited file handles and service-mediated channels; all broker/snapshot/orphan/retained storage has a finite enforced lifetime bound. LPAC + profile ACL hardening must be challenged, not assumed sufficient. Need a defensible enforcement argument plus actual positive runtime and negative bypass evidence; sentinel denials alone are not an exhaustive proof. If unsupported, STOP BLOCKED; no ordinary writable temp/output or unsandboxed fallback. Narrowing to broker logical bytes requires an explicit material requirement decision and cannot be treated as gate PASS.

### Inspected current foundations and likely file ownership

| Existing file | Contingent change after gate/review/authorization |
| --- | --- |
| `packages/domain/src/project-runner.ts` | Add bounded stream/profile/evidence vocabulary; private artifact ref separate from display relativePath; no Node/HANDLE/path authority in public types. |
| `packages/infrastructure/src/runner-manifest.ts` | Preserve strict parser/input; declared IDs/types/required outputs bind protocol. Path becomes display/export label, never stream-directed FS destination. |
| `packages/infrastructure/src/runner-snapshot.ts` | Extend effectivePolicy/resourcePolicyIdentity/fingerprint with immutable protocol/transport/storage/IO budgets and pinned wrapper/helper. Pending snapshot/runtime copies consume global reservation. |
| `packages/application/src/project-runner-service.ts` | Reuse existing runtime port and exact approval/stale logic; coordinate broker readiness, owned Job outcome and fenced evidence transaction. Keep module deep; no MCP streaming APIs. |
| `packages/application/src/project-runner-capabilities.ts` | Preserve manual exact runner.start binding. No production registration until every gate; no caller handle/path/FS operation or control frame. |
| `packages/infrastructure/src/project-runner-job-repository.ts`, `database.ts` | Extend existing migration/repository, not add duplicate runner-job-repository. Replace separate finish/publish success window with one fenced success + evidence + required-audit transaction; global reservations/owner/restart reconciliation. |
| `packages/application/src/approval-service.ts`, `tool-kernel.ts` | Preserve existing uncommitted manual-mode exclusion/cause handling; bind revised profile/review fields without broadening other capabilities. |

Likely **new**, not present/created: `packages/infrastructure/src/runner-artifact-protocol.ts` (bounded state parser); `runner-output-broker.ts` (deep attempt/readiness/drain/cancel/accounting/evidence owner); `runner-private-output-store.ts` (native private retained-file identity/reservation/sealing/orphan accounting); `windows-job-runtime.ts` (fixed suspended launch/verified token/Job/exact stdio pipes/native IO ownership); `runner-output.ts` (bounded safe stderr ring). Native helper/source location remains TBD by prerequisite proof; current `.serena/.../RunnerP0bSpike.cs` is evidence, not production packaging. No new dependency selected. Export only through existing infrastructure/application index files when independently authorized.

Later existing composition/lifecycle files: `packages/mcp-gateway/src/workspace-file-server.ts`, `stdio-entry.ts`; `packages/desktop/electron/main.ts`, `connection-shutdown.ts`; `packages/application/src/workspace-service.ts`, `work-resume-guard.ts`; safe DTO/approval display files already listed in P0c. These are not current edits. Broker-owned private IO remains a fixed internal capability, not an InternalRoot DENY exception for callers.

### Contingent vertical sequence / focused tests

1. **Protocol contract.** RED incremental header/state/JSON parsing, lengths/overflow/version/order/EOF/duplicate IDs and all byte/count/time caps; GREEN smallest parser. New `packages/tests/src/project-runner-artifact-protocol.test.ts`; split/coalesced/binary/invalid UTF-8/zero-byte artifacts, partial headers/payloads, giant length before allocation, huge metadata/frame flood.
2. **Application seam + fake broker.** RED readiness-before-Resume, cleanup ownership and no publication by runner calls; GREEN deep attempt session behind current port. Extend `project-runner-security.test.ts`; new `project-runner-output-broker.test.ts`. No new runnable tool yet.
3. **Budget invariants.** RED exact-limit/+1, per-artifact/total/count, concurrent producer/split-write/failing store, no refund/reopen/offset/transform bypass; GREEN atomic reservation before write. Assert `written <= accepted <= approved`, offender never written, whole tree cancellation. These tests prove logical broker accounting only.
4. **Private partial store.** RED collisions, parent/path substitution, reparse/junction/hardlink/ADS, preexisting target, global reservation/exhaustion, retained orphan/restart churn, permission/AV/disk-full/partial-write failure. New `project-runner-private-output-store.test.ts`; real disposable Windows filesystem identity checks, no owner data. No shared-directory polling represented as quota proof.
5. **Observed evidence.** RED claimed vs stored length/hash/MIME/QC, missing required/absent optional, later job failure, hash over partial successful writes only; GREEN protected stored-byte evidence and private references. New `project-runner-artifacts.test.ts`; no Workspace copy/export.
6. **Cancellation/IO faults.** RED stdout/stderr flood together, stalled reader/write/fsync, partial-frame idle, cancel-success race, root exit with descendant writer, leaked EOF handle; GREEN idempotent owned Job + native IO drain with deadline/cleanup-unconfirmed fencing. New `project-runner-jobs.test.ts` plus broker tests; no mocked IO proof accepted as Windows PASS.
7. **Inherited-pipe production adapter.** After all prerequisite gates: exact stdin/stdout/stderr ends, no file/DB/credential/Job inheritance, suspended token/Job/host-job verification and broker readiness before Resume. Choose existing Koffi vs fixed helper only from evidence; no unsafe fallback/extra-fd assumption. New `project-runner-windows-runtime.test.ts` (deterministic native-port cases).
8. **Real AppContainer/selected boundary acceptance.** New `project-runner.acceptance.test.ts`: pinned Node 24.14.0 + Windows 10 actual token/ACL/handle roles; all P0b regressions plus profile/temp/registry/shared-dir/service bypass, original/internal/other Job denial, zero direct artifact disk writes, observed byte caps/backpressure, blocked IO, descendant EOF, kill-on-close and unrelated-process preservation. Record allocated/global retained-store enforcement, not merely logical file lengths. Unsupported device/probe is BLOCKED, never a successful skip.
9. **Existing Job lifecycle integration.** Extend existing `project-runner-job-repository.test.ts` for owner-fenced atomic success/evidence/audit, no success-without-artifacts window, DB/audit fault cancellation and crash between write/seal/commit, private stale evidence, charged orphans, no retry replay. New `project-runner-production.test.ts` for guarded built gateway disposal; new `project-runner-desktop.test.ts` for fixed cross-process drain/switch/quit/update semantics. Run affected existing `connection-desktop-lifecycle.test.ts`, `connection-auto-recovery.test.ts`, Basic Approval, Team-start and Restricted Verify regressions only as needed.
10. **Review then remaining P0c.** Independent security/architecture review of enforcement + actual OS evidence before finishing pending approval display/registration/reads. runner.start stays unregistered until full P0c gate; passing stream tests alone cannot unblock it. P0d/provider/Python/native/FFmpeg/Network/secret/scratch/public export remain separate decisions.

Do not run these tests in this design-only task. After a future explicit implementation task, use the smallest changed seam first, affected typecheck/build only as needed, then mandatory Windows/production security matrix. No full-suite/package/release/commit/push inferred. STOP on either unresolved prerequisite, any runtime/cleanup uncertainty or failed gate.

## 3. P0c — complete safe execution slice (only after gate PASS)

Likely production files, to confirm against the approved spike:

| File | Responsibility |
| --- | --- |
| `packages/infrastructure/src/runner-snapshot.ts` (existing uncommitted foundation) | Bounded inventory/staging/fingerprint; extend revised broker/storage profile binding |
| `packages/infrastructure/src/windows-job-runtime.ts` (new) | Fixed-purpose isolated native launch integration, owned handles, budgets, job-empty cleanup |
| Native launcher source/build path | **TBD by spike**, not an assumed existing file or authorized dependency; fixed-purpose validated protocol only |
| `packages/infrastructure/src/project-runner-job-repository.ts` (existing uncommitted foundation) | Job/attempt/owner CAS, retention, atomic terminal facts/evidence and storage reservations |
| `packages/infrastructure/src/runner-output.ts` (new) | Streaming safe log ring, control stripping, cursor/drop bounds |
| `packages/infrastructure/src/runner-output-broker.ts`, `runner-private-output-store.ts` (candidate new) | Bounded protocol/store ownership and observed evidence; private-only references, no direct output path/Workspace publication |
| `packages/application/src/project-runner-service.ts` (existing uncommitted foundation) | Small Job interface; extend existing port with broker readiness/owned outcome/atomic persistence |
| `packages/application/src/project-runner-capabilities.ts` | Kernel bindings/security, strict tool inputs, one-time start, safe stop and read methods |
| `packages/domain/src/project-runner.ts`, `types.ts`, `policy.ts`, `result.ts` | Additive state/errors; explicit fixed cancellation allow semantics and unchanged generic Execute/Network DENY rules |
| `packages/domain/src/approval.ts` | Safe reviewed-details descriptor and digest; no host control fields |
| `packages/application/src/approval-service.ts` | Explicit runner.start exclusion from every auto-approval mode; bind reviewed projection digest |
| `packages/infrastructure/src/approval-repository.ts`, `database.ts` | Atomic Job rows/migration and bounded reviewed-details persistence |
| `packages/contracts/src/index.ts` | Strict safe approval details and lifecycle DTOs; no secret/raw input/raw command DTO |
| `packages/mcp-gateway/src/workspace-file-server.ts`, `stdio-entry.ts` | Compose one gateway-owned module, register tools only after gate, provide real disposal/signals/transport cleanup |
| `packages/application/src/work-resume-guard.ts` | Guard runner tool reads/start/stop for active Workspace sessions |
| `packages/desktop/electron/connection-shutdown.ts`, `main.ts` | Drain runner jobs before connection stop/update/DB close; failure cancels quit/switch |
| `packages/application/src/workspace-service.ts`, Desktop Workspace switch handler in `main.ts` | Stop old Workspace jobs before active-root mutation; no hidden async switch while jobs continue |
| `packages/desktop/electron/approval-controller.ts`, `approval-ipc.ts`, `preload.ts` | Safe read-only reviewed projection, existing fixed Approve/Deny path |
| `packages/desktop/src/pages/ActivityPage.tsx` | Minimal approval details and truthful blocked/pending/stale/terminal messages within existing visual system |

Cross-process control choice: keep runtime in gateway (where capabilities execute). Reuse shared SQLite for a **fixed lifecycle drain request**, generated only by trusted Desktop main during switch/shutdown/update, fenced by Workspace and owner epoch. Gateway observes this control flag, closes admission, cancels held Jobs and records job-empty acknowledgment before Desktop stops connection. No executable/PID/argv/path payload, TCP listener, public process-control tool or autonomous scheduler. If gateway stops responding, Desktop cannot infer cleanup from a PID disappearing; fixed managed-runtime termination plus owned-job OS evidence is required, otherwise block the switch/quit/update with safe failure. Validate this seam in spike/acceptance before exposure; if it needs a different transport, revise this contract through architecture review first.

Implement in vertical RED/GREEN increments through the public Job interface:

1. Schema/input/Workspace guard + fake runtime shows invalid input and unsupported profiles never stage/launch. Reject all caller command/cwd/env fields. Safe cancellation/reads cannot widen host Execute.
2. Snapshot inventory + fingerprints: every entry/import/data/dependency/profile change invalidates Approval. Race test changes file after binding; launch blocked. Show an unchanged approved snapshot uses exact bytes.
3. Approval exact binding: manual initial/every-run approval in all three modes, denied/expired/stale no launch, runtime replacement expires grants, unchanged retry only once. Verify review projection matches binding.
4. Job repository migration + exclusive owner/admission CAS + attempt idempotency. Concurrent same retry produces one Job; different start while busy fails. Failure before launch produces zero children. Crash after reserve/launch produces interrupted metadata, never replay.
5. Runtime handle lifecycle: starting/running/job-empty outcomes; stop/timeout and root-before-descendant exit; cancellation failure stays nonterminal/blocks admission. Use fake port for deterministic states plus mandatory actual OS probes from P0b.
6. Safe logs/artifacts: follow P0c.1 candidate only after its prerequisite review/proof. Sanitize bounded stderr before ring, count raw traffic, verify broker-owned stored bytes; no success/publication on partial or later Job failure. No runner-writable output/scratch or automatic Workspace publication.
7. Gateway/SQLite lifecycle and Desktop drain: job survives multiple same-gateway turns; disconnect/auto-recovery/gateway crash/restart does not resume it; drain races switch/start; DB/audit failure forces cancellation without fabricated success. Owner process and unrelated process must remain unchanged.
8. Production MCP and approval UI seam: exact tool exposure, guarded dispatch, foreign Job indistinguishable error, mode behavior and read-only detail controls. No generic Network or filesystem tool additions.

Likely new focused tests:

- `packages/tests/src/project-runner-security.test.ts` — input, paths, fingerprint/Approval, profiles, output secrecy, non-bypass.
- `packages/tests/src/project-runner-jobs.test.ts` — public interface transitions, duplicate retry, cleanup, concurrency and failure semantics.
- `packages/tests/src/project-runner-job-repository.test.ts` (existing) — migration, owner epochs, atomic success/evidence, CAS, corruption, retention and restart reconciliation.
- `packages/tests/src/project-runner-artifacts.test.ts` — observed evidence, publication and races.
- `packages/tests/src/project-runner-production.test.ts` — guarded built-stdio surface, safe DTOs, runtime composition and disposal.
- `packages/tests/src/project-runner.acceptance.test.ts` — actual approved Windows token/Job Object/descendant/network/IO probes; explicit device preflight and no unsafe skip counted as PASS.
- `packages/tests/src/project-runner-desktop.test.ts` — approval projection and fixed lifecycle drain contract.

Relevant existing regression seams: `basic-approval-security.test.ts`, `basic-approval-production.test.ts`, `restricted-verify.test.ts`, `restricted-verify.acceptance.test.ts`, `work-memory-production.test.ts`, `team-start-approval.test.ts`, `team-mode-atomicity.test.ts`; discover current connection-shutdown/update and Workspace-switch test filenames at task start. Preserve Verify's six actions and existing approval modes for unrelated capabilities.

Verification economy: run the smallest newly changed seam first, then only affected regressions/typecheck/build needed to run the candidate. Before production exposure, run the full focused runner security matrix, direct touched-boundary inspection, one real gateway/Desktop acceptance, `git diff --check`, and independent Standards + Spec review against the implementation task-start baseline. A full repository suite is required only if the approved implementation checkpoint adds it or shared impact makes focused evidence insufficient; it is not required in this design task.

Independent review must explicitly assess: full-access bypass, launch race, broker escape, original-file destruction, inherited credentials, unsafe process ownership, lifecycle drain cross-process authority, artifact overwrite/hash races, audit failures and no generic Network. A blocker prevents exposure; do not mark the slice complete with those failures deferred.

STOP: safety-complete offline owner candidate; no P1 profiles, package/release work, next milestone or automatic commit/push. Commit/push only when explicitly authorized in that implementation session.

## 4. P0d — Work Memory / sequential Team references

Likely files: `packages/domain/src/work-memory.ts`, `team.ts` only for additive references; `packages/application/src/work-memory-service.ts`, `work-memory-capabilities.ts`, `team-service.ts`, `team-continuation.ts`; `packages/infrastructure/src/work-memory-repository.ts`, `team-transition-unit-of-work.ts`, `database.ts`; guarded schemas in `workspace-file-server.ts` and safe DTOs in contracts.

RED: same-Workspace Job references resolve fresh status; unknown/foreign references rejected; completion updates Job only and cannot overwrite checkpoint; Team role transitions atomically project valid mission/work-item refs; running/failed required Job cannot be submitted as success; restart reports interrupted and never auto-starts a new mission/job. Then add smallest bounded jobRefs and resume projection using existing memory/UoW.

Tests: `packages/tests/src/project-runner-continuation.test.ts` plus affected Work Memory/Team atomicity tests. One same-gateway multi-turn acceptance after work.resume; one gateway replacement confirming metadata history without process adoption. No second memory system, leases, Worker concurrency or new mission state machine.

STOP: continuation references validated; Parallel Coding and cross-restart running continuity remain separately authorized architecture tasks.

## Owner acceptance scenarios

1. Manifest is a candidate; asking to run creates one pending approval and zero executing processes. Deny does not run; Full Access also requires manual approval.
2. Approve a tiny offline Node report fixture; retry exact attempt; receive one Job ID. Poll from a later turn; final artifact is independently hashed and originals unchanged.
3. Change entry/import/manifest after pending approval. Old retry is stale and cannot launch; fresh approval binds changed fingerprint.
4. Input containing shell metacharacters is data or validation failure; executable/cwd/env fields rejected. Malicious fixture tries outside/credential/network access and receives OS denial.
5. Fixture spawns child/grandchild. Stop and timeout terminate all owned processes and preserve unrelated sentinel process. Root-only exit cannot report success.
6. During a run, switch Workspace / Disconnect / shutdown / Restart & Update. Admission closes, owned job drains, then transition completes; cleanup failure leaves truthful blocked state. Reconnect/restart never replays Job.
7. Runner claims a missing MP4/report, writes a link, floods output, supplies QC pass with nonzero exit or targets an existing file. No false artifact success, overwrite or leaked raw output.
8. Normal Mode stays Normal. Explicit approved sequential Team uses discovered IDs and project QC without hardcoded workflow steps; resume returns same Goal/Task plus bounded Job facts.

## Current design-task closure evidence

Only design/spec/plan/research and minimal roadmap/handoff documentation may change. Check relative Markdown targets, referenced current source paths (distinguish new/TBD paths), scope markers, STOP conditions and diff whitespace. No runtime tests, sandbox proof, installer/release or implementation claim is made. Record actual documentation-check commands/results in handoff after they run; stop with the owner's precise next decision.
