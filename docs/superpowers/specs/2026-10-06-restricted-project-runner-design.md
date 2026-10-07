# Restricted Project Runner / Job Runtime — proposed design

Started: 2026-10-06; latest P0c.3 architecture decision: 2026-10-07 (Asia/Bangkok), **design only**. **STRONG STORAGE ISOLATION DECISION: SELECTED for later feasibility only.** P0b = PASS; P0c/P0c.1/P0c.2 = BLOCKED; runner.start = UNEXPOSED. Earlier P0c authorization and uncommitted foundations are preserved, not extended by this task. Original baseline: `261d9d452bce31cb8ca6a6f70666c670f40bf84f`. P0c.3 below supersedes the unresolved isolation prerequisite, not the aggregate gate; P0c.1 supersedes historical writable-directory/publication suggestions.

## P0c.3 strong storage isolation — SELECTED for feasibility only

### Selected boundary and owner tradeoff

Select **one preprovisioned full Hyper-V Generation 2 Windows guest, fixed-size complete OS VHDX, finite host-owned runner storage pool, and bounded Hyper-V socket output broker**. The guest has no virtual NIC or host filesystem/registry projections. Registry hives/logs, all user/AppContainer profiles, temp, caches, scratch, guest paging/dumps and abandoned guest output reside within guest disk sectors. The runner cannot add disks, expand backing capacity or control the hypervisor. This is more direct than proving all host services/registry/profile paths obey a dedicated-user quota. Full comparison and primary-source facts: [P0c.3 research matrix](../research/2026-10-06-restricted-project-runner-windows.md#p0c3-strong-storage-isolation-research--2026-10-07).

This is not proof that all host persistence is bounded. Selected means sufficiently precise/promising to justify the later spike; any unresolved aggregate-write channel keeps P0c BLOCKED. P0b's AppContainer/Job acceptance is not inherited VM acceptance. Direct host runtime fallback, broker-only artifact accounting and cleanup-after-crash remain rejected.

Setup requires owner permission for Hyper-V optional feature/management components, possible reboot/firmware virtualization, a supported licensed pinned guest image, fixed disk/RAM reservation and a fixed-purpose privileged host helper. Win10/11 Pro/Enterprise are candidate hosts, not Home; record actual servicing/ESU on Win10. Do not silently change the product's minimum OS. No feature, user, service, driver, quota, machine policy or guest is created by this design task.

Normal Desktop requests and guest runner run without elevation; guest runner is a standard account. **The host helper retains privileged VM-management authority during jobs.** This is a real product/security cost, not a privilege-free design after setup. Do not add Desktop to Hyper-V Administrators, permit caller-selected VM/host paths, expose a generic management/shell API, enable WinRM, or alter global firewall/ACL policies. Helper authorization must bind one owned slot and fixed operations; only its private storage/IPC ACLs may be provisioned by separately approved setup. Whether a production service and its retained privilege are acceptable is an explicit owner decision.

### Hard capacity contract, including host state

Define before provisioning: `G` = guest-addressable disk capacity; `P` = capacity of dedicated private host runner pool; `M = 1` = fixed VM slot count; `H_i` = independently OS-enforced finite capacity of each unavoidable auxiliary host persistence channel. Capacities are bytes with physical/backing metadata allowance, not arbitrary artifact counters. No numeric guest image/RAM/storage floor is invented here; exact values, geometry and disk-full reserve must be approved and recorded in the later spike profile before launch. Existing artifact/snapshot/log limits remain ceilings, not extra uncounted storage.

1. One complete fixed guest disk, no dynamic expansion, differencing disks, checkpoints/AVHDX, additional writable virtual disks, passthrough, USB/drive/GPU redirection, network storage or live migration. Read-only sealed input media or a fixed typed stream uploads the approved immutable input into the guest disk; no writable Workspace share. Guest image and input digests must be verified before project code runs.
2. Preprovision a finite fixed-backed private host pool (trusted host volume, not the hostile guest filesystem). Guest backing disk, sealed golden/reset copy, input images, VM configuration/runtime files including VMCX/VMRS/VMGS, artifact store, partials, broker logs, reservations and quarantined attempts must be inside it. Any reset duplicate consumes this same capacity. One slot is reused; failed cleanup cannot cause a new slot/pool allocation. No expansion when full. Underlying host exhaustion fails closed, never redirects writes elsewhere.
3. Total retained physical bound is `backing(P) + sum(H_i)`, not `P + G` when guest backing already lies in P. Guest sector cap G includes guest filesystem metadata and all registry backing files. Fixed pool capacity contains host filesystem metadata on that pool; backing-file/header/host-filesystem allocation overhead must also have a defensible finite bound. Do not claim virtual size alone is exact physical allocation.
4. Inventory **every host auxiliary channel**: Hyper-V registration/configuration outside chosen paths, host paging/smart-paging, Event Log/WER/crash data, helper state, SUD-D job/evidence/audit/SQLite-WAL and retention/retries. Eliminate it, place it in P, or prove an independent finite OS-enforced H_i. Measuring a plateau, periodic scan, best-effort cleanup, logical row cap or excluding 'OS overhead' does not satisfy this contract. Shared database/audit placement and atomicity are unresolved; relocating them would be a separately reviewed shared-contract change, not automatic authority from this design.
5. Guest code has no authority to change P/G/M/H_i. Broker rejects before storing an over-budget byte; metadata/partial/retained reservation counts against P. Admission requires sealed profile, free reserved capacity and reconciled slot ownership. Crash debris stays charged until exact owned cleanup succeeds. Any missing H_i or growing path outside these enforced boundaries = BLOCKED.

This finite pool is a capacity primitive, not a new caller-visible filesystem capability. No existing owner volume is reformatted. If host auxiliary persistence cannot be bounded without unacceptable global policy or product-wide storage changes, reject E rather than weakening the definition.

### Artifact and evidence seam

Keep current `ProjectRunnerRuntimePort.start(snapshot)` as the application boundary; a future deep Hyper-V adapter owns helper/VM/broker details. Do not expose VM management via MCP/renderer. Bind image, helper/protocol revision, virtual-device graph, G/P/M/H_i policy and exact input/runtime hashes into the effective execution fingerprint; old approvals become stale. Public callers still cannot choose executable, argv, cwd, env, VM ID, service GUID, image path or host destination.

Use a single fixed-purpose `AF_HYPERV / SOCK_STREAM / HV_PROTOCOL_RAW` channel over VMBus. One setup-time registered service GUID; exact owned VM endpoint, no wildcard partition listener. Attempt/epoch fencing and authenticated fixed helper requests supplement endpoint ownership; a guest-supplied job ID/nonce is not authentication. No IP network, writable shared folder, unrestricted host named pipe, detachable guest filesystem mounted on host, or guest-selected host path.

P0c.1 bounded framing, declaration, logical budgets, backpressure, private host-chosen artifact identity/hash, cancellation/drain and atomic success/evidence/audit rules remain required. Its host-child inherited-pipe transport is superseded for this candidate by a guest-agent relay over the bounded socket; both relay and parser must reject malformed/extra/late bytes. Guest local output remains charged to G, accepted host copies to P. Host owns final bytes/evidence; guest paths and claimed hashes/status are untrusted. No automatic export to Workspace or existing artifacts.

Trusted guest agent launches pinned Node under a standard runner token, owns root/descendants and reports termination through a protected local channel. Its integrity and child ownership must be proved; guest-reported exit zero alone is not host-observed execution success. Host VM-Off observation proves no continuing guest process, not that a declared program succeeded. Publish only if required bounded artifacts, protected-agent execution evidence, host stop/drain and fenced atomic audit/evidence commit all pass; otherwise terminal failure with no published success. Hyper-V sockets are transport, not trust or additional runner network authority.

### Network, resources and crash contract

No vNIC/switch, host routing/proxy, mapped host drive/registry, enhanced-session/RDP clipboard/printer, guest file-copy service, PowerShell Direct task execution, unnecessary integration transport or device passthrough. Enumerate allowed integration services and every VMBus endpoint; reject an unreviewed writable channel. The approved artifact/input protocol cannot tunnel arbitrary TCP/DNS or host IO. Guest loopback is not host loopback; an internal guest-local socket does not grant Internet/LAN/host connectivity.

Fixed VM RAM/CPU are additional host-resource budgets, distinct from existing runner process/memory/CPU/time limits inside guest. Whole-VM kill handles guest descendants; Job Objects inside guest supplement per-runner limits. Guest boot/agent/runner/stop deadlines are fixed and tested, no infinite recovery wait. Offline Node is the first compatibility proof. Python/FFmpeg later require separately pinned image/toolchain and scratch/resource proof; provider network/secrets remain outside P0.

Unlike JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, a VM can outlive Desktop/helper handles. A fixed privileged helper owns lease/watchdog and exact VM termination on cancel, broker/gateway loss or deadline. If helper dies, VM storage is still finite but execution may continue until independent supervision/reconciliation stops it: no success/admission claim in that interval. Prove bounded termination independent of Desktop and helper failure; if no such supervision is acceptable, lifecycle gate remains BLOCKED. Host stop action must be TurnOff, not Save; automatic guest start/checkpoints are disabled. Host reboot/restart reconciles exact slot, stops any leftover VM, closes IO and quarantines dirty data before another launch; never auto-resume/replay work.

Reset from sealed golden image only after proven VM-Off and closed files/socket handles. Golden, current and reset temporary copies are budgeted in P; cleanup failure blocks new admission, never creates another VM or drops orphan accounting. No cleanup of unrelated VM/resources. See [exact later feasibility obligations](../plans/2026-10-06-restricted-project-runner.md#p0c3-dedicated-serena-feasibility-plan--not-authorized-to-run). Even a spike PASS requires separate architecture/security review and production implementation authorization before runner.start exposure.

The supplied task requests architecture and an implementation plan only. `SUD-D_NEUTRAL_RUNNER_ARCHITECTURE.md` was absent from the repository (including hidden file search) and the task attachment directory. Its separate contents have not been reviewed. Recommendations below use the pasted request and current source; comparison against that missing reference remains an open review dependency.

## Recommendation and product problem

Workspaces already own useful build/content/media/data workflows. SUD-D needs a project-neutral way to invoke them without giving an AI host shell authority. A manifest plus user approval restricts selection, but **does not restrict what the selected program can do**. A trusted script can invoke other tools, read credentials, destroy files or use the network. Approval cannot replace containment.

Recommend a dedicated declarative manifest, typed stdin, one manually approved invocation at a time, immutable input snapshot, OS-enforced offline containment, new output only, and a gateway-owned Job lifecycle. Put the enforcement feasibility gate before production execution. The smallest useful executable P0 supports offline Node entry scripts; it does not promise every existing workflow runs unchanged. Discovery/validation can ship separately while execution stays unavailable.

The historical Restricted Execute Phase 0 remains NOT PROVEN on the secondary device (handoff section “Restricted Execute retry”). If the new proof also fails, stop after discovery/contract artifacts and report `RUNNER_RUNTIME_UNAVAILABLE`. Do not adopt an unsandboxed trusted-manifest fallback. This is the task's STOP condition, not a new exception to it.

## Goals, non-goals and responsibility

| SUD-D owns | Workspace owns |
| --- | --- |
| Discovery validation, execution identity, Kernel/Policy/Approval/Audit, containment and limits | Runner entry code, business logic, providers, project dependencies and QA |
| Runtime resolution, typed input delivery, process ownership, safe job records | Output generation and project result interpretation |
| Filesystem evidence and bounded Work Memory references | Human workflow documentation and runner descriptions |

Goals: jobs can outlive a ChatGPT turn in the same live connection; typed project inputs cannot choose host authority; state and artifact evidence are inspectable; sequential Team Mode uses the same capabilities as Normal Mode.

Non-goals: generic shell/executable/argv/cwd/env tools, general Network, Delete/Recovery, Computer Use, parallel Workers, cloud/remote runners, containers, a model/provider runtime, packaging/release implementation, TGNK logic, a scheduler, a general OS process manager. Approval of this proposal is not authorization for those capabilities.

## Current source architecture and reusable seams

| Current file / seam | Observed behavior and design consequence |
| --- | --- |
| `packages/application/src/tool-kernel.ts` | Validates, resolves security, evaluates Policy, binds Approval, writes pre-execution audit, invokes, writes outcome. Reuse this path for all runner tools; no direct MCP/runtime dispatch. |
| `packages/domain/src/policy.ts` | Execute ASK; outside Workspace/InternalRoot and generic Network DENY. GitHub network is a separate fixed-purpose context. Do not borrow that context for runners. |
| `packages/application/src/approval-service.ts` | Stable keyed digest, TTL, one-time consumption, runtime identity. Uncommitted foundations exclude runner.start and team.start from mode auto-approval; no production runner exposure. |
| `packages/infrastructure/src/approval-repository.ts` | Persisted pending/approved/consumed records and exact atomic consumption. Retain semantics; add a bounded safe reviewed-details projection, not raw input or launch plan. |
| `packages/application/src/restricted-verify-capabilities.ts` | Six actions; approval binding currently contains action only. Active Workspace rechecked at execution. Keep verify.run's public contract untouched. |
| `packages/infrastructure/src/restricted-verify-adapter.ts` | Resolves npm/pnpm from package.json and trusted runtime discovery; shell:false; 32 KiB output, 300s timeout; env allowlist includes host HOME/PATH/TEMP; regex output redaction; PID taskkill timeout cleanup. Useful patterns, **not** sandbox/immutable-definition/owned-handle proof. Package scripts themselves can execute shell commands. |
| `packages/infrastructure/src/git-command-runner.ts` | Fixed-purpose local/GitHub process adapters with private environment/config. Reuse safe error/limit ideas; do not expose their lower-level args interface to runner callers. |
| `packages/infrastructure/src/path-adapter.ts`, `workspace-text-file-system.ts` | Relative path validation, canonical containment, InternalRoot-first check, reparse denial; stat/list/read/write. These validate host-mediated IO, not arbitrary child IO. Revalidate actual file handles for evidence. |
| `packages/infrastructure/src/credential-store.ts`, `windows-credential-manager.ts` | Credential references/revisions and privileged native materialization, no public plaintext getter. Tunnel credential materialization targets host environment; never reuse its populated environment for jobs. |
| `packages/infrastructure/src/audit-repository.ts` | Metadata-key sanitizer is defense in depth, not a general output secret detector. Runner emits explicit safe metadata allowlist. |
| `packages/application/src/work-memory-service.ts`, `work-resume-guard.ts` | Workspace/session resume guard, bounded checkpoint, live Git drift. Add runner tools to the guard; job records are operational facts, checkpoints remain continuation memory. |
| `packages/domain/src/team.ts`, `team-service.ts`, `team-continuation.ts` | Sequential mission/work-item roles and bounded submissions. Runner does not authorize Team startup or change role sequencing. |
| `packages/infrastructure/src/team-transition-unit-of-work.ts` | Atomic Team + checkpoint + audit writes. Extend reference projection there when Team links are added; do not let asynchronous job events overwrite the current checkpoint. |
| `packages/infrastructure/src/database.ts`, `project-runner-job-repository.ts` | Uncommitted migration 009 adds Job/artifact rows, unique attemptId and one active Job per Workspace. Admission/CAS/orphan metadata exist; separate finish/publish does not yet provide atomic success-and-evidence publication. No second Task/Mission queue. |
| `packages/mcp-gateway/src/workspace-file-server.ts`, `stdio-entry.ts` | Default production gateway opens its own DB and constructs guarded capabilities, including Verify. Runtime ownership belongs to that gateway instance; Desktop is a separate process, not an in-memory singleton with it. |
| `packages/desktop/electron/main.ts`, `connection-shutdown.ts` | Shutdown stops connection, disposes Git, then closes Desktop DB; quit/update cancels on shutdown failure. Integrate runner shutdown with gateway/tunnel teardown; Desktop DB closure alone does not stop gateway jobs. |
| `packages/infrastructure/src/secure-tunnel-process.ts` | Fixed tunnel launch, internal PID/tree cleanup and bounded diagnostic capture. Reuse lifecycle conventions only; do not repurpose tunnel runtime as a runner. |

Existing filesystem MCP surface: `workspace.list`, `workspace.stat`, `workspace.read_text`, `workspace.search_text`, `workspace.create_text_file`, `workspace.write_text_file`. Runner P0 needs internal snapshot copy, exclusive output-directory creation, binary stat/hash, and guarded publication only. It needs **no new generic mkdir/copy/move/delete tools**. Existing text tools cannot stand in for MP4/binary evidence.

## Domain vocabulary and threats

**Runner definition:** untrusted Workspace declaration of a bounded capability. **Candidate:** valid declaration found by discovery, still unapproved. **Execution fingerprint:** digest of reviewed definition, exact staged code/data/dependencies and trusted authority profile revisions. **Invocation grant:** one-time approval for that fingerprint and exact validated input. **Job:** one operational execution attempt with a SUD-D generated identity. **Artifact evidence:** SUD-D observed file metadata/hash, separate from runner claims and project QC.

There is no permanent “trusted because it is in the Workspace” flag in P0. Trust means one reviewed execution snapshot is approved; it is not a claim that its code is harmless.

| Threat | Mandatory control / failure |
| --- | --- |
| Documentation or AI-edited manifest grants execution | Discovery never enrolls or launches. Every start needs manual one-time Approval even Full Access. |
| Manifest unchanged, package script/import/dependency changed | Fingerprint covers staged execution contents, not only manifest or Git HEAD. Changed bytes/profile revisions invalidate pending grants. |
| Approval-to-launch race / Workspace switch | Recompute and compare fingerprint and Workspace generation; hold immutable staged bytes; stop admission during switch. Never reopen live code at spawn. |
| Input used as command, option, path or URL | Small schema subset; no input-to-argv/env mapping; OS sandbox limits malicious interpretation of stdin. |
| Child reads profile/.env/SQLite/tunnel credentials | Snapshot excludes credential-sensitive and InternalRoot material; isolated token denies live roots; no inherited credentials/handles. |
| Child writes/deletes source or existing output | Live Workspace denied; snapshot read-only. Direct runner-writable host output is rejected for P0c. Broker storage is host-only, but denial of alternate persistent writes remains BLOCKED. Git checkpoint is not Recovery. |
| Network/loopback/LAN/DNS/exfiltration | OS enforced network deny for descendants, broker escape probes; no proxy or network capability. Env labels alone are insufficient. |
| Root exits but descendants remain / PID reuse | Retained OS job handle, no breakaway, wait for job-empty; never stop by PID/name from SQLite. |
| Arbitrary stdout/log/artifact prompt injection | Untrusted bounded plain text only; no instruction execution, HTML/terminal escape rendering or stdout authority. |
| Huge output/files/input, endless job | Hard time/process/memory/disk/input/output budgets; fail closed when enforcement unavailable. |
| Duplicate retries / crash after spawn before response | Durable attempt key + CAS state transitions; same approved retry returns same Job; no automatic re-execution. |

Local owner/admin deliberately modifying the sandbox or SUD-D binary is outside this capability's threat model. Project code and caller inputs are not. See [Windows primary-source research](../research/2026-10-06-restricted-project-runner-windows.md) for the OS facts and limits.

## Discovery and runner definition

Choose **A: dedicated manifest** at exactly `.sud-d/runners.json` in the active Workspace. Strict UTF-8 JSON, versioned, at most 64 KiB and 16 runners; reject duplicate JSON keys, unknown fields, links/reparse points, InternalRoot intersections and traversal. Never search parent directories. Discovery returns safe candidate summaries, schema and support/blocked reason; it confers no execution authority.

README/AGENTS/package.json/Makefile/scripts/tools remain human discovery inputs. B (package-script discovery with approval) is tempting but inherits shell, pre/post hooks, mutable dependencies and installation/network semantics. C can later suggest manifest candidates from package scripts, but never auto-enroll them. P0 direct Node entry is intentionally simpler; workspaces can own a wrapper without putting business logic into SUD-D.

Illustrative P0 contract (a proposal, not a supported production format):

```json
{
  "version": 1,
  "runners": [{
    "id": "report",
    "label": "Create local report",
    "runtime": "node-offline-v1",
    "entry": "tools/report.mjs",
    "snapshotPaths": ["tools", "data"],
    "inputSchema": {
      "type": "object",
      "properties": {"preset": {"type": "string", "enum": ["short", "full"]}},
      "required": ["preset"],
      "additionalProperties": false
    },
    "artifacts": [{"id": "report", "path": "report.json", "type": "application/json", "required": true}],
    "limits": {"timeoutMs": 300000, "maxArtifactBytes": 16777216},
    "networkProfile": "none",
    "secretProfile": "none"
  }]
}
```

`runtime` selects a SUD-D implemented adapter, not an executable path. `entry` and `snapshotPaths` resolve inside the Workspace and become read-only staged content. Snapshot construction includes nested regular files, enforces count/byte limits, excludes `.git`, runner job output and sensitive paths, and requires entry to be included. Missing imports/dependencies fail safely; no install/download at start. Bundled project code is the smallest P0 fixture; node_modules can be included only as bounded copied regular content with no escaping links and a full digest. No PATH execution, shebang dispatch, npm scripts or arbitrary fixed arguments in P0.

SUD-D fixes cwd to the staged snapshot root and argv to pinned Node plus staged entry. Manifest cannot select cwd/executable/env/host paths/endpoints; limits only reduce caps. Broker candidate maps artifact IDs to generated private identities: path is a reviewed display/export label, not a writable destination. No globs or automatic Workspace export. Labels remain untrusted text.

Input schema subset: closed objects, bounded strings/enums, finite numeric/integer ranges, booleans, bounded arrays; depth <= 4, input <= 16 KiB, strings <= 2 KiB, arrays <= 100. No external refs, remote resolution, arbitrary regex, code/default execution, or schema-provided authority. Reject secret-like input; actual secrets never use this channel. The adapter writes one bounded versioned JSON envelope to stdin and closes it. An enum/string's validity is not proof of harmlessness; containment still applies.

## Approval, fingerprint and reviewed details

For each start, prepare an immutable snapshot before asking. Build a canonical digest over schema version, all normalized definition fields (including label/schema/artifact requirements and limits), Workspace identity/canonical-root generation, sorted relative-path/content-digest snapshot inventory, runtime binary identity/version/digest, sandbox profile revision, and network/secret/environment profile revisions. Secret values are never digested into public fingerprints. P0 has no secret values.

Bind existing keyed Approval digest to `{runnerId, executionFingerprint, validatedInput, attemptId}` plus existing runtime/security context. Validated input is transient and non-secret; only the keyed binding and safe reviewed projection are persisted. Add a separate server-produced invocation-detail digest to prevent approving a different displayed review. UUID attemptId is an idempotency token, not execution authority. Caller surface `runner.start({runnerId,input,attemptId})`; retry exactly after Approval. No Job is running while pending. A bounded pending snapshot reservation is operational staging, not a runnable queued job.

On retry, resolve current definition/contents/profile revisions again. If changed, expire reservation/grant and require new Approval; never silently launch the old approved snapshot against changed project state. On unchanged retry, consume once, append required audit, durably reserve Job, recheck admission/fingerprint, then launch only retained immutable bytes. TOCTOU prevention requires host-owned file handles/ACL sealing or equivalently proven immutable snapshots; merely hashing a live directory is inadequate. Release unchanged pending reservations at TTL expiry; no automatic destructive cleanup tool is exposed.

P0 `runner.start` always requires **manual** Desktop approval, including Full Access and Approve For Me. No persistent enrollment, auto-approval list or trusted runner wildcard. Subsequent manual invocations also require Approval. This combines initial trust review and invocation approval without two separate consent screens or a persistent trust subsystem.

Current title/resourceLabel DTOs cannot adequately display this review. Future implementation needs bounded structured approval details: runner ID, Workspace, exact definition fingerprint, runtime/profile identity, readable staged file inventory with capped page access, input summary, offline/no-secrets claim derived from validated plan, output-only access and limits. Main supplies a safe manifest/authority projection, never executable/argv/env editing. All inventory entries remain retrievable within the hard manifest cap; truncation cannot hide authority fields. Existing Approve/Deny interaction stays in Activity, Operate mode, keyboard accessible and status-first. Pending/stale/denied/expired/unsupported/cleanup-unconfirmed each has distinct truthful feedback. This is a UX brief only, not a UI implementation or redesign.

## Runtime containment and process ownership — blocking gate

P0b proved disposable AppContainer + Job containment, not a production adapter. Current source has a runtime port but no composed native runner. Node spawn alone cannot satisfy suspended token/Job setup. Existing Koffi or a fixed helper is a future selection from evidence; no dependency choice here. A complete no-persistent-write profile remains the P0c.1 prerequisite, not a presumed AppContainer default.

Candidate sequence: reserve host-private broker attempt and arm readers; isolate identity/read-only snapshot; grant pinned runtime/startup/input read access only; deny live Workspace, broker store, credentials, other Jobs and network. Remove all direct persistent-write channels or fail closed. Create root suspended with exact pipe handles; verify token/Job/constraints/broker readiness before Resume. No breakaway; non-inheritable kill-on-close Job handle. Jobs are not filesystem/network isolation; WMI/COM/service-assisted escape remains a proof obligation. No writable Workspace job area or temp grant.

Historical runner-writable output is **rejected for P0c**: truncate/append/many-file/sparse/ADS growth can race a scanner. No Job Object aggregate disk quota is assumed. Broker files/handles are never granted to the runner; no helper copies arbitrary destinations back. In-place builds and writable scratch are unsupported, not exceptions.

Current policy foundation: 32 active processes (root included), 512 MiB Job memory, 30-minute user-time ceiling, 256 MiB snapshot/10,000 files, 64 MiB aggregate output, 32 KiB logs/4 KiB poll; manifest caps wall timeout at 30 minutes and per-artifact bytes at 16 MiB, parser allows 50 declarations. One Job per device/Workspace, no queue, remain required; DB index alone proves per-Workspace admission. Candidate stream/metadata/raw-log limits and logical vs physical/global retained-storage semantics are below. 64 MiB is not a proven writable-area disk quota. Unsupported enforcement keeps runtime disabled.

Hold the Job Object handle and process handles inside the gateway adapter. Record owner runtime epoch in SQLite, not serialized handles. Never call broad process-name kill or PID-only taskkill from stale records. Root exit with children alive is still running. On timeout/stop, terminate owned Job Object, wait for all owned processes to exit, then publish terminal state. If ownership/cleanup cannot be confirmed, report blocked cleanup and deny further admission. Do not report cancelled/timed_out while processes may still be running.

## Job lifecycle, ownership and persistence

Gateway-owned Job module exposes `discover`, `start`, `status`, `logs`, `stop`, `artifacts`; keep six methods because paged logs and evidence have different budgets. No extra enroll/execute/publish tool in P0. `status` optionally lists a bounded recent set when jobId is omitted; other job methods accept only server-issued jobId, plus bounded log cursor/limit. All requests cross Kernel with active-Workspace checks; missing/foreign jobs return the same safe unavailable result. Start is Execute ASK; reads are ordinary policy-governed reads; stopping an owned Job is a fixed cancellation capability with an explicit allow rule, not generic Execute permission or fresh start Approval. Automated timeout/shutdown cancellation is an internal safety duty and never waits for a new user grant.

Lifecycle: `starting → running → succeeded | failed | cancelled | timed_out | interrupted`. A stop/timeout sets a private termination intent while status remains running until job-empty. `interrupted` means previous owner disappeared and result could not be certified; it never means resumed execution. No persisted queue or independent Task state machine.

SQLite `runner_jobs` stores jobId, Workspace ID, optional mission/work-item references, runnerId, fingerprint, attempt key, owner epoch, state, times, safe failure code, exit code, limits/profile revisions and terminal evidence summary. Separate bounded artifact-evidence rows store relative path/type/size/hash/observed time. No raw manifest/input/env/logs/secrets, host executable or argv. Logs are memory-only in P0; retention for metadata: 100 terminal Jobs per Workspace / 30 days, with preserved dangling checkpoint references yielding unavailable-history rather than fabricated success. Job files are not automatically deleted through a new Recovery bypass; storage cap blocks admission when exhausted. Retention of DB facts does not authorize deleting user outputs.

Use DB uniqueness on `(workspaceId, ownerEpoch, attemptId)` and transactional CAS for admission and completion. An instance-wide exclusive owner lock plus persisted epoch fences multiple gateways; a second owner cannot adopt a live Job. Reserve starting row + audit intent before launch, retain handle immediately after launch, finalize after job-empty. On persistence/audit failure before launch, do not start. On failure after launch, terminate owned job and report uncertainty; no auto retry. A successful process exit with failed artifact evidence is `failed`, not succeeded.

Chat turns do not own the process: same live gateway keeps handles and accepts polling after fresh `work.resume`. A new MCP session can inspect Workspace-bound operational records, but cannot adopt a process by PID. Gateway loss/Disconnect/recovery restart ends running jobs in P0; Job handle close must kill descendants. Desktop restart preserves terminal/metadata history, **not execution continuity**. On owner restart, after exclusive-lock acquisition and isolation cleanup proof, mark nonterminal rows `interrupted`. If a former owner or sandbox remains unconfirmed, block new runs. No resume/relaunch of prior code automatically.

Desktop shutdown/update/Disconnect: close admission, cancel owned jobs, await job-empty, then stop transport/runtime and close DB. Desktop main requests a fixed lifecycle drain through shared SQLite, fenced by Workspace/owner epoch; gateway polls and acknowledges only after held Jobs are empty. This carries no PID, executable or host-path input and exposes no public process control. If gateway cannot acknowledge, fixed managed-runtime termination still needs OS-owned-job cleanup evidence; otherwise block the lifecycle transition. Prove this cross-process seam before exposure. Gateway disposal/signals/transport closure must implement the same idempotent cleanup. Abrupt process termination relies on OS kill-on-close; acceptance tests must kill gateway and tunnel separately. Connection Auto Recovery must not replay Jobs or retain an old approval runtime. Workspace switch closes admission and stops old Workspace Jobs before proceeding; if cleanup fails, switch/start stays blocked. A running job uses its sealed definition; editing live manifest does not mutate it and only affects future starts.

## Environment, secrets and network

Build environment from empty: fixed CI/NO_COLOR and minimal resolved startup keys. No host PATH/HOME/APPDATA authority, SSH agent, tunnel credentials, proxies, NODE_OPTIONS or package-manager config. Any home/temp location must be proven non-writable; env redirection is not enforcement. Runtime/helpers are pinned. Stdin carries bounded input/protocol context, not host output paths/configurable handles.

Snapshot exclusions use the existing sensitivity classifier plus explicit credential/config deny paths and bounded secret scanning; classification failure blocks staging. Unknown secrets disguised as ordinary data cannot be reliably identified by regex. First acceptance therefore uses reviewed offline fixtures containing no credentials; this is a known input-data review limitation, not a claim of universal secret detection. If the real workflow cannot establish credential-free inputs/results under these boundaries, it is unsupported by P0 and needs a stronger separately reviewed data/secret-channel contract. Artifact bytes must also pass credential/sensitivity screening before publication; a pattern scan alone does not make secret-bearing workflows safe.

P0 secretProfile=`none`, networkProfile=`none`. All non-none declarations are unsupported, even after Approval. Do not use process.env as a shared job secret bus. Later named profiles must be host-enrolled and revision-bound, map to least-privilege providers, materialize only in private child memory/environment, never return plaintext, and never reuse Secure Tunnel credentials. Revocation stops affected Jobs. Redaction of known values cannot guarantee secrecy against encoded/derived output; any later secret-bearing runner must also restrict result channels and artifacts or remain disabled.

P1 Network requires an independent reviewed Policy context and enforcement adapter: endpoint/protocol/port allowlist, DNS/redirect/loopback/LAN restrictions and inherited descendant enforcement. Approval names a profile; it cannot turn generic Network DENY into allow. A proxy env variable, manifest destination list or Job Object is not enforcement. Provider workflows remain unavailable until that proof exists.

## Logs, audit, artifacts and QC

Logs: incremental UTF-8 decoding and complete-line sanitization with bounded partial-line overlap, known-secret and pattern suppression, control/ANSI stripping, truncation/drop counters and monotonic cursors. Overlong/incomplete unsafe lines are dropped rather than emitting unreviewed prefixes. Redact **before** entering the public ring; never persist raw stdout/stderr. Exhausted ring returns cursor-gap flag. Never persist raw runtime errors, stack traces or shell output in audit. P0 carries no injected secrets and cannot read credential sources; sanitization remains defense in depth, not an exfiltration sandbox.

Audit explicit safe metadata: Job ID, runner ID, fingerprint, phase, status, safe result code, duration, exit status/counts. Required intent/outcome transitions use authoritative audit; existing optional Verify summary is not sufficient for job integrity. Safety cancellation still occurs if audit storage fails, with unavailable status reported until persistence reconciles.

Broker candidate writes declared-ID streams into exclusively created host-private regular files, hashes successful writes, and validates retained-handle identity/length/link state after all processes exit. Claimed paths/hashes/MIME/QC are not evidence; reject undeclared output and validate safe types. Current relativePath evidence needs a private-storage/display-label distinction, not exposure of InternalRoot paths. Content remains untrusted.

P0c.1 keeps files private; publish bounded references through an atomic success/evidence transaction only after the full gate. No automatic Workspace copy/rename. Later binary export requires separately approved host-authorized new-only race-safe creation. No generic overwrite/move/delete, execution or preview. Private store access is a fixed internal broker capability, not a caller exception to InternalRoot DENY.

Safe result example: `{jobId,runnerId,status,exitCode,durationMs,artifacts:[{id,relativePath,type,sizeBytes,sha256,observedAt}],qc:{source:"runner",verdict:"pass"}}`. `exitCode` may be null for start/interruption; QC is optional bounded validated claim from a declared JSON result file. SUD-D evidence proves bytes existed, not business correctness. Validator inspects project QA and artifacts independently; malformed/missing required results fail the Job, nonzero exit cannot be overridden by claimed QC pass. Failed/cancelled partial artifacts are quarantined and never presented as completed deliverables. Result hash describes observed bytes; later reads revalidate changes and report stale evidence.

## Work Memory and Team integration

Reuse Workspace → existing checkpoint / optional Mission + work item → bounded Job references. Extend `work.resume` with a bounded safe recent/active job projection or typed jobRefs that resolve current records; do not invent raw “job:” artifact paths or forge filesystem evidence in today's string artifacts array. P0 inspection via runner.status list can precede that additive Work Memory contract. Jobs store operational facts; Work Memory keeps goal/task/next action. It is not the job log or executor queue.

A background completion event updates job rows only. It must not write a competing current checkpoint. Explicit `work.checkpoint` may attach existing same-Workspace jobRefs; Team transitions project references through the existing UoW and validate mission/work-item membership. Checkpoint history survives restart while Jobs become interrupted; resume presents that limitation.

Planner reads workflow docs and discovers supported candidates; Implementer edits Workspace if necessary then requests approved start; Validator uses terminal status, artifacts and project QC; Reviewer assesses final result. Editing runner/code invalidates fingerprints and requires new Approval. Team remains sequential and user-opt-in; no hardcoded media/software workflow and no automatic team.start. Team transition cannot claim work_ready/validation_passed while an attached required Job is nonterminal/failed without an explicit bounded handling outcome. Normal Mode can use runners independently. Parallel Coding is separately designed later.

## Validation across Workspace types

| Example | Generic mapping | P0 / dependency |
| --- | --- | --- |
| Software | Separate `test`, `build`, `integration` IDs → project Node wrappers → result/package artifact | Offline bundled/preinstalled snapshot fixtures possible. npm script adapter, native compiler toolchain, package/release scripts and unrestricted caches are not P0. |
| Script/content | Typed topic/preset → project services and QA → files | Offline content fixture P0; provider credentials/network require separately proven P1. |
| Media/video | Project wrapper owns script/TTS/images/subtitles/render/QC → MP4 | Offline precomputed fixtures possible; real FFmpeg/Python need pinned native runtime profiles; provider steps additionally need P1. No TGNK tools in core. |
| Data/research | Project entry owns fetch/process/analyze/export → report | Local-data analysis/export P0; external fetch requires P1 Network. |

These examples validate responsibility boundaries, not a claim that all four full business workflows are runnable in MVP. The owner should select one real offline fixture first; if the blocker requires providers/native tools immediately, P0 alone will not solve it and scope must be decided explicitly.

## Phasing, rejected alternatives and limits

**P0a:** manifest/schema/discovery and fingerprint contract, read-only tool exposure only after its gate. **P0b:** disposable Windows containment feasibility proof; accepted real-OS evidence covers AppContainer/Job/filesystem/network/process ownership and cleanup, while aggregate writable-output budget is explicitly not part of P0b closure. **P0c:** authorized safety-complete production slice: atomic approval + staged launch + Job ownership + stop/timeout + aggregate writable-output budget + safe logs + artifact evidence. `runner.start` stays unexposed until every P0c production gate passes. **P0d:** bounded Work Memory and sequential Team references remains out of scope. Each later phase requires its own authorization and STOP.

**P1:** pinned Python/native/media/package-script adapters when justified; named secret profiles and separately enforceable Network; larger/later job limits; carefully scoped persistence across connection loss/restart only if real usage demands it. Offline/native and provider support are independent review gates, not bundled automatic authority.

Rejected: free executable/args/shell; trusting package scripts by name; manifest-only hashes; wildcard approvals; Full Access auto-start; ambient env; PID/taskkill identity; Jobs as filesystem sandbox/disk quota; runner-writable host output/original Workspace; overwrite/deletion; stdout declarations as evidence; providers before output proof; parallel scheduler/second memory; generic runner via verify.run. Framed stdout transport is not stdout-only evidence.

Known limitations: P0b containment feasibility is proven only for the recorded Windows 10 Pro 22H2 environment and must be reproduced in the production path; aggregate writable-output/disk budget remains unproven and is a blocking P0c production-exposure gate. Node/dependency compatibility may be poor; snapshot hashing must remain capped; no default profile grants may be accepted without tests; copy/publish race safety still needs production proof; no execution survives gateway restart; old metadata may outlive on-disk output; safe offline P0 does not cover current provider/media workflows automatically. No existing security invariant is waived.

## Roadmap and owner review

Recommend moving **Runner design and containment feasibility** ahead of Parallel Coding: the real blocker is invoking existing project work, and safe generic job evidence also benefits later coding validation. Runner execution is conditional on proof; Parallel Coding should not wait indefinitely if containment stays blocked. Preserve the 2026-10-05 approved sequence until the owner chooses the change. Roadmap adds only this explicit proposed sequencing note, not a silently approved reordered milestone.

Current next decision is the P0c.1 prerequisite feasibility/isolation choice below, not a repeat of earlier P0c authorization. The absent neutral reference remains an unreviewed historical comparison, not substitute evidence for this gate. Provider/native media and Parallel Coding do not gain scope from this review.

Ready for Architecture Review: **Yes, with P0c.1 BLOCKED findings below**. Ready for P0c.1 implementation/execution/gate closure: **No**. No production code, dependencies, runtime tests, full suite, installer, release, commit or push in this task.

## P0c.1 bounded artifact output broker — architecture review

Historical P0c.1 assessment remains BLOCKED. P0c.3 supersedes its unproven host-runner no-persistent-write/sole-writer premise and inherited-pipe runtime choice: the selected candidate permits guest persistence only within hard whole-state capacity. Retain bounded protocol, accepted-byte accounting and evidence/lifecycle obligations; apply the latest P0c.3 aggregate contract rather than demand guest files never exist. No production permission follows from either section.

### Decision, current source and exact blocker

**OUTPUT BROKER DESIGN: BLOCKED.** The candidate can bound bytes accepted through its own artifact channel. It cannot yet establish the required aggregate writable-output/disk bound: absence of alternate persistent-write authority is unestablished, and logical bytes are not physical allocation or lifetime-retained storage. This is an evidence/design gap, not a claim Windows can never deny writes. Do not approve sole-writer authority merely because the broker is the only intended writer.

P0b remains **PASS** on Windows 10 Pro 22H2 build 19045.6466 / Node 24.14.0 for its recorded scope. Its `StartContained` grants output-directory Modify and inherits NUL plus a writable debug.log handle shared by stdout/stderr; `BuildEnvironment` redirects home/temp/local app data there. It proves neither artifact pipes, zero persistent writes nor bounded log capture. Removing that directory/file grant is necessary but insufficient: regular AppContainer has private storage accessible via native APIs. LPAC reduces ambient access but is not a global no-write switch. Profile ACL hardening + LPAC is an investigation candidate, not accepted enforcement. Registry persistence and OS/COM/service-mediated disk channels cannot silently be excluded from an aggregate disk promise.

Inspected current uncommitted foundations: domain `project-runner.ts`; infrastructure `runner-manifest.ts`, `runner-snapshot.ts`, `project-runner-job-repository.ts`, migration 009; application `project-runner-service.ts`, `project-runner-capabilities.ts`, Approval/Kernel changes; existing `project-runner-security.test.ts` and `project-runner-job-repository.test.ts`. Policy already names brokered-output-v1 and hashes its numeric limits; that name is intention, not proof. `ProjectRunnerRuntimePort.start(snapshot)` exists, but no broker/parser/private store/native runner composition or gateway/Desktop registration exists. runner.start is defined internally, **not exposed**. Snapshot chmod/hash checks are not Windows ACL immutability proof. Separate repository finish(succeeded) then publishSucceededArtifacts is not an atomic success/evidence transaction. These are future obligations; no source was edited and tests were not run/reported PASS.

### Deep module and transport

One gateway-owned broker attempt behind the existing runtime/service seam: `open(approvedContext, ownedReaders, cancellationSink) -> session`; `session.settle(ownedJobOutcome) -> Result<sealedEvidence>`; `session.abort(safeReason) -> cleanupResult`. Open validates policy, reserves storage, creates private identity, owns protocol/log drain and reports readiness before Resume. Settle requires process-tree outcome plus protocol/EOF/store proof; project code cannot call it into success. Abort is idempotent, cancels owned IO/processes without Approval. Keep parsing/budgets/files/hashing/failure ordering inside this deep module. Internal fake byte-source/store/cancellation adapters support tests; they are not public extensible writer plugins.

No MCP begin/write/finish/publish APIs, caller paths/handles/PIDs, generic writers or second scheduler. Application coordinates existing Job state/transaction; infrastructure owns native handles/files and typed safe failures.

| Transport | Candidate assessment |
| --- | --- |
| **A: inherited anonymous stdout artifact pipe + stderr log pipe** | Recommend for minimal offline Node. Ordinary standard handles avoid a new raw-HANDLE-to-Node-fd bridge. stdout is exclusively binary framed; accidental console text fails closed. Wrapper routes logs to stderr; no writable output path. |
| B: separate extra inherited artifact handle + stdout/stderr logs | Better library separation, but Windows HANDLE is not portable fd 3. Needs pinned bootstrap/native mapping, extra exact handle and drain proof. Defer unless A is unsuitable; Node child_process stdio options are not proof of external native-launch mapping. |
| Named pipe | Adds addressable listener, ACL/namespace/first-instance/impersonation/connection races and packaged/unpackaged compatibility. Not default; no caller pipe name or public listener/fallback. |
| Writable file / plain stdout / NDJSON alone | File bypasses pre-write budgets; text alone cannot bound allocation before parsing. Framed stdout is transport, not artifact evidence. |

A root allowlist has exactly **three distinct pipe ends**: stdin read-only (<=16 KiB input plus <=4 KiB fixed context, then EOF), stdout artifact write-only, stderr log write-only. Parent owns complementary ends, non-inheritable, closes child-end copies after creation. HANDLE_LIST + STARTF_USESTDHANDLES must match exactly, with inheritable child ends and bInheritHandles=TRUE. No default inheritance sweep, writable file/debug/temp/directory handle, SQLite, credentials, Job, broker reader, host process/token or tunnel handle. Inspect types/rights before Resume; path ACL denial cannot revoke already inherited file rights.

Physical pipe association binds a Job, not a claimed ID/nonce. A hostile child can copy/pass its write handle to descendants; clearing inherit flags/cooperative wrapper is not proof it cannot. All owned-tree writers are untrusted and charged to the same budget; interleaving fails parsing, never widens authority. Deny unowned duplication/reopening/broker launch. A leaked outside writer preventing EOF is cleanup-unconfirmed. Keep the Job handle private/non-inheritable so kill-on-close remains valid.

### Bounded artifact-stream-v1 protocol candidate

Fixed **24-byte little-endian header**: magic SDB1 (4 bytes), version u16 (=1), kind u16, payloadLength u32, artifactOrdinal u32, sequence u32, flags u32 (=0). No pointer fields, signed lengths or fallback negotiation. Validate header/state/limits **before** payload allocation/read; reject unknown version/kind/flags, wrong sequence or overflow. Sequence starts 0, increments per frame, cannot wrap. Arbitrary transport splits/coalescing require incremental exact-length reads, not one read = one frame.

| Kind | Payload / legal state |
| --- | --- |
| START | First only; ordinal 0; closed strict UTF-8 JSON <=4 KiB with protocol, expected job/attempt/fingerprint matching approved host context. Claims are not authentication. |
| META | <=1 KiB closed JSON `{declaredId,mediaType,expectedLength?}`; ordinal = approved declaration slot 1..50. ID/type match approval; length is bounded claim. One open artifact, one META per ID. No path/name/URL/env/command/FS operation. |
| CHUNK | 1..65,536 raw bytes for open ordinal. Check per-artifact/total budgets before acceptance/write. No offsets, seek, holes, compression/decompression, base64 or caller transform. |
| END | Zero payload; closes current artifact and verifies claimed length if present; completes host hash/length validation. META then END permits a zero-byte artifact, consuming one slot. |
| JOB_END | Ordinal 0; <=1 KiB closed JSON with optional approved QC claim only (enum verdict, <=128-character code). All artifacts closed, required IDs present; optional IDs may be absent. Marks protocol complete, **not success**. EOF must follow; any trailing byte fails. |
| ERROR | Ordinal 0; <=256-byte closed JSON fixed enum failure code; whole-attempt failure. No raw exception/message/path. |

No runner CANCEL frame controls Jobs; ERROR fails this attempt only. Host cancellation is OS Job termination/reader cancellation, not a responsive stdin request. Metadata JSON rejects duplicate/unknown keys, malformed UTF-8, nonfinite/unsafe integers, controls and excessive depth after bounded framing. CHUNK is binary, never text-decoded. Missing/out-of-order/duplicate/nested frames/IDs, partial EOF, oversized payload or wrong ordinal are fatal: terminate Job, quarantine all, no resync.

Additional candidate host-profile caps: <=20,000 frames, <=64 KiB cumulative metadata payload, <=66 MiB wire bytes (headers included), <=10 s idle/frame deadline plus approved total wall timeout. Thus empty/control-frame floods have byte/count/time limits. Legitimate workloads must fit both payload and frame limits; huge/many tiny-chunk workloads fail honestly. Constants or approved reductions only, not caller tuning.

### Accounting and the unclosed disk/storage gate

**Received** = all wire bytes read; **accepted/reserved** = valid CHUNK bytes charged before IO; **written** = successful native write byte counts; **sealed** = finished validated private files; **published** = reachable success evidence; **allocated** = device/filesystem space including metadata/rounding/ADS; **retained** = every managed pending/active/failed/sealed attempt and reservation across restarts. Never conflate these.

One sequential parser/sole writer atomically checks `n <= perArtifactLimit - artifactAccepted` and `n <= totalLimit - jobAccepted` before accepting/writing a CHUNK. Validate integer-safe finite policy; use checked bounded counters, never unchecked addition/u64-to-Number conversion. Charge full chunk monotonically, no refund/reopen/delete churn. Successful written <= accepted <= approved 64 MiB total and <= approved per-artifact cap (max 16 MiB), count <= approved declarations (max 50). A manifest may reduce limits. Existing policy allows 32 active processes including root, 512 MiB memory, 256 MiB snapshot/10,000 files, 30-minute hard wall/user-time ceiling, 32 KiB log ring/4 KiB poll. Device-wide one-Job lock is needed beyond current per-Workspace DB index.

No transforms/extraction, seeks/sparse instructions, ADS or runner-directed FS operations. Archives are opaque bytes, never expanded; future decoded output needs a separate budget. Host sequentially appends ordinary unnamed streams; reject unsupported allocation/compression attributes. Overflow kills the owned tree before offending write; no truncated success. OS-buffered received bytes are not accepted or published bytes.

**Unclosed property:** 64 MiB logical bytes do not cap cluster/MFT/directory/journal allocation, registry persistence, snapshot/runtime copies or DB/audit growth. CreatePipe buffer size is a suggestion, not a hard OS memory quota. A separately approved finite managed-store reservation/allocation contract must include pending snapshots, runtime copies, failed partials, retained successes, crash orphans and cleanup failures. Refuse admission if free capacity/reservation/orphan inventory is unconfirmed; release only after verified deletion, not Job finish. RAM-only logs; bound audit rows/transitions, never per-frame persistent audit. Workspace/restart churn cannot bypass the device-wide retained-store budget. Shared NTFS free-space polling cannot guarantee a hard physical ceiling; literal allocated-disk bounds require a separately selected/proven capacity-limited boundary or remain BLOCKED. No overhead/capacity number, machine-wide quota or admin storage change is invented/authorized here.

### Backpressure, IO cancellation and logs

Arm bounded artifact and concurrent stderr readers before Resume, off the gateway event loop; neither waits for the other stream or tool polling. At most one <=64 KiB frame buffer plus one <=64 KiB pending-write buffer, no accumulated chunks/promises/native callback queue. Pause artifact reading while its write is pending; pipe pressure may block runner WriteFile as expected. Actual OS/native buffer footprint and shutdown behavior need runtime proof, not inference from CreatePipe's suggested size.

stderr is untrusted bytes, never artifact instructions. Incremental safe UTF-8 decode, <=4 KiB partial line, complete-line secret screening/control/ANSI stripping before the 32 KiB public ring. Drop invalid/incomplete/unsafe long lines; expose safe drop/cursor-gap counters. No raw persistence. Candidate max 1 MiB raw stderr per Job; cancel beyond it instead of unbounded CPU dropping traffic. Poll <=4 KiB. Raw/ring/poll limits enter profile identity.

Anonymous pipes do not support normal overlapped IO. Dedicated synchronous native reader threads plus CancelSynchronousIo/handle-close are candidates; never blocking ReadFile on the event loop. IO cancellation can race/fail. Candidate cleanup deadline 5 s: cancel owned Job, request reader/write cancellation and retain reservation until all workers/handles close. AV/storage can stall WriteFile/fsync; timeout marks uncertainty, not imaginary completion. Unconfirmed IO/tree closure blocks admission and Desktop lifecycle transition; no detached writer or fabricated terminal success. Test flooded stderr + artifacts, idle/partial frames, blocked writes, reader starvation, descendant-held handles and early root exit.

### Private partial storage and observed evidence

Unique host-generated job/attempt storage key beneath a dedicated canonical private SUD-D root, outside mutable Workspace; only fixed broker operations access it. No caller root/name, output path in stdin or Workspace fallback. Manifest path becomes reviewed display/export label only; declaration ID maps to host-generated ordinal/file identity. Exclusive create-new attempt/files, reject collisions, ancestor/file reparse/junction, hardlink count !=1, nonregular objects/ADS. Native retained directory/file handles, identity/ACL validation and no write/delete sharing are mandatory; realpath/lstat then open is not race-safe. Root provisioning must also be protected. Runner receives neither storage keys nor file handles; owner/admin deliberately modifying the app is outside the established threat model. Internal private IO does not create a generic InternalRoot policy exception.

Hash SHA-256 only bytes with successful write completion, handling partial writes; accepted bytes may exceed written. Failed/unknown completion means failed artifact, no completed hash claim. END verifies actual retained-handle length/identity and re-read hash as needed for storage evidence. Generated artifact ID is independent of filesystem/display label; bind evidence to Workspace/job/attempt/fingerprint/profile, observed size/hash/time. Declared length/MIME/hash/QC are claims; hash proves stored bytes, not correctness/secrecy. Type/sensitivity/required-ID checks remain independent.

END never publishes. All outputs remain private partials through stream completion, EOF, root exit, Job-empty and final evidence/audit. Nonzero root exit, ERROR, late descendant activity, stop/timeout or missing required output invalidates the whole result, even if earlier artifact hashes completed. Optional absent outputs are allowed. No auto-render/run/extract.

Seal protected file identities before **one transaction** committing succeeded + artifact rows + required audit under owner/job CAS. Current separate finish/publish must change in future implementation. Transaction failure leaves unreachable orphan, not success. Optional rename must be same-volume/no-replace with proved semantics; rename alone is not atomic with SQLite nor a durability guarantee. P0c.1 stays private, so no Workspace rename/export required. Disk-full/IO/permission/AV/fsync faults fail the entire attempt; no replay, automatic new attempt or fallback path. Crash between writes/flush/seal/commit never exposes partials. On later read/restart revalidate evidence and report missing/corrupt storage unavailable; do not claim power-loss durability solely from rename/flush.

Orphan cleanup is fixed private-store lifecycle, not generic Delete/Recovery and never targets Workspace user outputs. Restart acquires exclusive owner lock, proves old tree/IO gone, marks nonterminal Jobs interrupted and reconciles bounded inventory (candidate <=100 attempts). Count all retained bytes/reservations; quarantine unknown entries, no unbounded startup recursion or symlink-following. Cleanup batch <=10 attempts; validate exact root/identity, no link traversal. Failed AV/permission/IO deletions remain charged. Inventory overflow, unknown owner or capacity exhaustion blocks admission. No PID adoption, old partial publication or automatic rerun.

### Approval and existing Job lifecycle

Future immutable profile revision replaces current p0c-offline-v1/brokered-output-v1 semantics. Include protocol/schema, transport A/exact handle roles, no-write isolation revision, allocation/retention profile, count/per-artifact/total/frame/wire/metadata/raw-log/ring/timeout/cleanup caps and artifact requirements, wrapper/helper/runtime binary identity. Current resourcePolicyIdentity is the extension point. All authority fields enter execution fingerprint + keyed Approval; changing cap/type/declaration/protocol/storage/transport/sandbox/runtime makes grants stale. No silent reinterpretation of an approved path as host write access. Manual Approval always, including Full Access; sealed Jobs retain original profile revisions. Retry is idempotency, not restart permission.

Order: exclusive ownership/storage reservation + audit intent + starting row → broker readiness/readers → suspended launch/token/Job/handle verification → Resume/running. Pre-Resume fault executes zero project code; post-launch fault cancels held Job. Stop/timeout/shutdown fence completion transaction; winning termination intent prevents late success. Success requires valid protocol through JOB_END/EOF, root exit 0, Job active count 0, both readers done, no cancellation/IO/cleanup uncertainty and all required evidence. Root exit, EOF and JOB_END independently are insufficient. Descendants retaining handles keep it nonterminal until deadline/termination.

Reuse starting/running/terminal states and bounded safe codes: artifact-invalid for protocol/evidence, resource-limit for budgets, runtime-unavailable for IO/runtime and cleanup-unconfirmed for uncertain ownership. Required DB/audit failure cancels even if persistence is unavailable; never fabricated success. Disconnect/tunnel/gateway loss, switch/quit/update use existing fenced drain plus broker IO-empty. Only after tree/readers/writers close can Desktop transition. Crash relies on final Job-handle close killing descendants, then interrupted reconciliation without replay. Public status/artifact access remains Workspace-guarded and hides private paths; no automatic Team/checkpoint changes.

### Threat review and future compatibility

| Threat / failure | Required control or unresolved finding |
| --- | --- |
| Huge/overflow length, binary/metadata/frame flood, malformed UTF-8/JSON, partial EOF | Preallocation header checks, cumulative byte/count/time limits, fatal failure without resync/partial success. |
| Duplicate/out-of-order artifact, forged size/hash/MIME/QC, unapproved attempt | Exact approved ID/state mapping; dedicated host pipe association; generated observed evidence; no launch before approval/readiness. |
| Many writers/interleaving, descendant retains pipe, root exits | One parser and tree budget, wait Job-empty + EOF, deadline/Job termination, leak blocks admission. |
| Privileged inherited/duplicated handles, named-pipe impersonation/connection race | Exact anonymous allowlist, host handles non-inheritable, no named listener; real denial proofs, same-tree writer remains untrusted. |
| Target collision/path swap/reparse/junction/hardlink/ADS | Host-generated names, exclusive handle-based private create/inspection, no runner paths or automatic export. |
| Sparse/encoded/compressed expansion | No seek/transform/extraction; opaque bytes counted; actual allocation overhead remains separate storage gate. |
| Disk full/partial write/fsync/permission/AV hang | Fail whole attempt, retain charged partials, cancel tree/IO; uncertainty blocks admission. |
| Cancel-success race; broker/gateway crash; stale partials | Fenced atomic success/evidence transaction, interrupted restart, bounded orphan accounting, no adoption/replay. |
| Profile/temp/registry/shared-dir/OS-service writes | **Unsolved sole persistent-writer property.** Env redirection or selected sentinels are not exhaustive enforcement. |
| Restart/Workspace churn, retained failed attempts, physical space growth | **Unsolved global/allocated-storage bound.** All retained reservations count; a per-job stream counter is insufficient. |

Node stdio is a plausible minimal wrapper surface, but pinned 24.14.0 flushing/backpressure/no-scratch behavior needs acceptance. Python can later emit the same binary stdio protocol; Windows extra HANDLE mapping is not POSIX pass_fds. FFmpeg can stream some formats, but seeking codecs/containers and tools requiring writable temp/cache/output/build trees are unsupported. Future pinned Python/native/FFmpeg adapters need separate authorization and bounded scratch/storage proof; no generic shell/native/Network/temp-write fallback is added.

### Windows primary-source findings and review outcome

Checked 2026-10-07: [AppContainer/LPAC launch](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer) documents private profile/temp and reduced LPAC ambient access, not global no-write. [Isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation) permits private/authorized persistent files; [registry location](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-getappcontainerregistrylocation) is another persistence surface. Inference: zero-capability regular AppContainer does not establish broker sole-writer authority. No supported complete no-write profile is established by current evidence; LPAC/profile hardening alone is not approval.

[CreatePipe](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createpipe) describes suggested buffering/blocking writes; [anonymous operations](https://learn.microsoft.com/en-us/windows/win32/ipc/anonymous-pipe-operations) excludes overlapped IO. [Handle-list launch](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-updateprocthreadattribute), [inheritance](https://learn.microsoft.com/en-us/windows/win32/procthread/inheritance) and [IO cancellation](https://learn.microsoft.com/en-us/windows/win32/fileio/canceling-pending-i-o-operations) support investigation of A, not SUD-D runtime acceptance. [Named-pipe security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) and [app IPC](https://learn.microsoft.com/en-us/windows/apps/develop/communication/interprocess-communication) add gates for a named alternative.

[Sparse files](https://learn.microsoft.com/en-us/windows/win32/fileio/sparse-files), [disk quotas](https://learn.microsoft.com/en-us/windows/win32/fileio/disk-quota-limits), [MoveFileEx](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexa) and [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew) distinguish logical allocation, visibility and durability; none supplies the missing per-Job physical disk bound here. [Node process IO](https://nodejs.org/docs/latest-v24.x/api/process.html) and [Python subprocess](https://docs.python.org/3/library/subprocess.html) explain runtime surfaces, not full AppContainer/Job integration proof.

**Blocking findings:** (1) complete enforceable denial/bounding of every runner persistent-write bypass; (2) physical/global retained-storage contract including crashes/cleanup. These prevent design approval now. After resolving them, production pipe/cancellation/sealing/transaction/lifecycle proof is still mandatory. P0b PASS is unchanged; direct writable host output rejected; aggregate gate remains NOT PROVEN; runner.start UNEXPOSED.

**Next Product Owner decision:** authorize a narrow disposable Windows no-persistent-write + capacity-bound feasibility investigation, or separately review a stronger isolation/storage boundary. Narrowing to broker-accepted logical bytes is a material security/product change, not assumed. Existing plan records contingent files/tests but no P0c.1 implementation begins here. Selected Skills: codebase-design, domain-modeling, grilling, research, writing-for-agents. Documentation checks only. Ready for Architecture Review: **Yes**; approved/gate closed: **No**. Commit: **NONE**. Push: **NONE**.
