# Restricted Project Runner — P0c.3 Hyper-V Strong Storage Isolation Feasibility Spike

Date: 2026-10-07 (Asia/Bangkok)

## Overall decision

**HYPER-V STORAGE ISOLATION FEASIBILITY: BLOCKED**

The spike stopped during mandatory pre-flight before provisioning any VM, VHDX, helper, broker, service GUID, or guest state.

The decisive blocker is privilege availability on the authorized host: the current execution token is not elevated and does not have Hyper-V management authority. After correcting the Remote Commander process-local `COMPUTERNAME` environment value, both `Get-VM` and `Get-VMHost` fail with an explicit Hyper-V permission denial. Because the approved architecture requires a narrowly scoped privileged host helper for exact VM lifecycle and broker operations, the mandatory lifecycle/storage proof cannot begin safely from the available token. No UAC bypass, generic admin shell, Hyper-V Administrators membership change, service installation, or alternative broad privilege path was attempted.

Partial pre-flight success does not satisfy the feasibility gate.

## Selected Skills

- `research` — selected for platform/runtime facts and real host evidence; read `.agents/skills/research/SKILL.md`.
- `codebase-design` — selected for the privileged-helper / Hyper-V adapter / broker seam; read `.agents/skills/codebase-design/SKILL.md`.
- `grilling` — selected initially to stress-test architecture assumptions; read `.agents/skills/grilling/SKILL.md`. No unresolved Product Owner decision was needed before the environment blocker.
- `diagnosing-bugs` — selected after `Get-VM` initially failed with a null-name error; read `.agents/skills/diagnosing-bugs/SKILL.md`. The first error was minimized to a Remote Commander environment issue (`COMPUTERNAME` empty), then the corrected repro exposed the actual permission denial.
- `tdd` — not selected because no production behavior or spike test implementation was started.
- `domain-modeling` — not selected because no domain/security terminology was changed.

## Risk Level

**SECURITY / DATA CRITICAL**

## Branch / commit

- Project: `SUD_D`
- Project path: `D:\8.Project prompt\SUD-D`
- Branch: `p0c-hyperv-spike`
- Expected/current HEAD: `85faef9ddee626faadbacdd3137ee4ac06b8c560`
- Initial working tree: clean
- Commit: **NONE**
- Push: **NONE**

## Host environment

Authorized host selected by matching the required project path and host profile:

- Device: `DESKTOP-2CGN37P`
- OS: Microsoft Windows 10 Pro
- Version: `10.0.19045`
- Display version: `22H2`
- Build / UBR: `19045.6466`
- Physical RAM: `12,825,288,704` bytes (~11.94 GiB)
- Hypervisor present: `True`
- D: free space at pre-flight: `642,189,668,352` bytes (~598 GiB)
- Recent observed servicing:
  - `KB5126256` installed 2026-09-11
  - Windows Update last successful installation: 2026-10-03
- ESU/license entitlement: not conclusively established from the non-elevated evidence. Do not infer entitlement from update presence alone.

A second online Remote Commander device (`JeabPC`) was rejected for this spike because `D:\8.Project prompt\SUD-D` was not present there.

## ISO path / size / SHA-256

- Path: `D:\SUD-D-Runner-Spike\images\26300.9457.260913-1737.26h2_ge_release_svc_refresh_CLIENTENTERPRISEEVAL_OEMRET_x64FRE_en-us.iso`
- Exists: **Yes**
- Exact size: `8,225,329,152` bytes
- SHA-256: `BC3F24086EBADC94489066B5AD78089E2CF5C3491E90E790BB81A2B199C10E38`
- Filename identity indicates a Windows client Enterprise Evaluation image, but no guest-image identity claim is promoted without a completed hash/image inspection.

The ISO was not mounted or used for provisioning.

## Hyper-V feature/service status

- `Microsoft-Hyper-V-All` optional feature InstallState: `1` (enabled)
- Hypervisor present: **Yes**
- `vmms`: Running, Automatic
- `vmcompute`: Running, Manual
- Hyper-V PowerShell module: `2.0.0.0` available
- WMI/CIM namespace `root/virtualization/v2`: readable enough to return one `Msvm_ComputerSystem` host object.
- Authoritative PowerShell VM inventory: **BLOCKED by permission**.

## Privilege state

Current identity:

- `DESKTOP-2CGN37P\Jekdo`
- Local Administrators membership exists, but current token is **not elevated**.
- `BUILTIN\Administrators` appears as **Group used for deny only**.
- No active `Hyper-V Administrators` group membership was observed.
- `ADMIN_ROLE=False` in the current token.

Corrected Hyper-V repro (after setting process-local `COMPUTERNAME=[Environment]::MachineName`):

- `Get-VM` -> `Microsoft.HyperV.PowerShell.VirtualizationException`: **You do not have the required permission to complete this task.**
- `Get-VMHost` -> same permission denial.

No attempt was made to bypass UAC or broaden privileges.

## Resource profile

Approved fixed profile, not modified:

- VM count `M = 1`
- Guest RAM: `4 GB`
- vCPU: `2`
- Guest disk `G = 80 GB`, fixed VHDX
- Host spike pool `P <= 256 GB` on D:
- Network: **NONE**
- Checkpoints: **NONE**
- Saved state: **NONE**
- Automatic VM start: **NONE**
- Dynamic disk: **NONE**

## Spike resource ledger

Resources created by this spike run:

- VM: **NONE**
- VHDX: **NONE**
- Checkpoint/AVHDX: **NONE**
- VM configuration/runtime files: **NONE**
- Hyper-V socket service GUID: **NONE**
- Privileged helper/service: **NONE**
- Broker state/artifacts/partials: **NONE**
- Guest state: **NONE**

Pre-existing resources observed but not created or modified by this run:

- `D:\SUD-D-Runner-Spike\images\...iso`

Because provisioning never started, no unrelated VM/disk/service/file resource was touched.

## Guest provisioning result

**NOT STARTED — BLOCKED during pre-flight privilege gate.**

The mandatory exact-VM inventory and lifecycle control could not be established through the intended Hyper-V management path. Proceeding would require privilege escalation or a helper installation/execution path that was not available through the current execution token.

## Fixed VHDX evidence

**NOT PROVEN.**

No 80 GB fixed VHDX was created. No geometry, allocation, no-expansion behavior, or disk-full behavior was tested.

## Guest persistent-state findings

**NOT PROVEN.**

No guest was installed or booted. Filesystem, registry hives/logs, profile, TEMP, caches, scratch, paging/dumps, partial artifacts, and orphan state were not tested.

## Host persistent-state inventory

Pre-flight identified the categories that remain mandatory for a later run:

- VM configuration/registration
- VHDX/backing metadata
- VM runtime state / VMRS / VMGS
- smart paging / host paging attributable to VM behavior
- Hyper-V event channels
- WER/crash state
- helper state
- broker partials/artifacts/logs
- SUD-D evidence/audit/SQLite/WAL if used
- reset/golden copies and cleanup debris

No spike-attributable Hyper-V persistence was created in this run.

## H_i findings

**NOT PROVEN.**

No auxiliary host persistence channel received an accepted finite `H_i` bound. The run stopped before provisioning, per fail-closed requirements.

## Artifact transport result

**NOT PROVEN.**

No `AF_HYPERV / SOCK_STREAM / HV_PROTOCOL_RAW` broker endpoint or service GUID was registered or exercised.

## Network isolation result

**NOT PROVEN.**

No VM existed to verify absence of vNIC, DNS, LAN, Internet, host loopback, proxy, or other network authority.

## Filesystem isolation result

**NOT PROVEN.**

No guest attempt against owner Workspace, host paths, mappings, shares, reparse paths, or host write surfaces was executed.

## Registry/profile containment result

**NOT PROVEN.**

No guest registry/profile/TEMP/cache writes were executed.

## Capacity exhaustion result

**NOT PROVEN.**

No fixed disk existed; no ordinary file, small-file, metadata, sparse/compressed, TEMP/profile, registry, scratch, partial artifact, or dump exhaustion test was run.

## Host-pool accounting result

**NOT PROVEN.**

No finite private host pool accounting was instantiated or challenged.

## Crash/orphan result

**NOT PROVEN.**

No guest/root/broker/gateway/helper/VM crash series was run.

## Privileged helper result

**BLOCKED BEFORE IMPLEMENTATION/EXECUTION.**

The architecture requires a fixed-purpose privileged helper constrained to the exact spike VM, exact spike paths, permitted lifecycle operations, and exact broker identity. The current execution environment did not provide an authorized elevated token/channel capable of performing those Hyper-V operations.

A generic admin shell, arbitrary VM/path/command interface, UAC bypass, Hyper-V Administrators membership mutation, or broad service installation would violate the spike constraints and was not used.

## Independent watchdog result

**NOT PROVEN.**

Because the privileged helper/VM could not be instantiated, helper-failure supervision, independent watchdog termination, and reboot/reconciliation behavior could not be exercised.

## Cleanup / quarantine result

- Hyper-V/guest resources created: **NONE**
- Cleanup required for VM/VHDX/helper/broker: **NONE**
- Quarantined spike capacity: **0 bytes from newly created Hyper-V resources**
- Existing ISO preserved.
- No broad Hyper-V cleanup attempted.

## Production files changed

**No.**

Only this local `.serena` evidence report is created; production source is not modified.

## Dependencies changed

**No.**

## git diff --check

**PASS** — exit code 0; no whitespace errors.

## git status

`## p0c-hyperv-spike...origin/p0c-hyperv-spike` with no modified/untracked production paths shown. `.serena/` remains local tooling state.

## Commit

**NONE**

## Push

**NONE**

## Blocking findings

1. The current host token is non-elevated and lacks Hyper-V management permission.
2. Corrected `Get-VM` and `Get-VMHost` calls fail explicitly with required-permission denial.
3. The approved architecture requires a privileged host helper to prove exact VM provisioning/lifecycle, bounded artifact broker setup, crash termination, watchdog/reconciliation, and cleanup.
4. No safe authorized elevation channel was available in this run. Bypassing UAC or widening admin authority would violate the spike contract.
5. Therefore VM inventory/provisioning and every mandatory downstream storage/lifecycle/artifact/failure proof remain unproven.
6. Partial pre-flight success cannot produce PASS.

### Smallest next action / decision

No architecture weakening is justified.

The smallest next operational prerequisite is an **authorized, narrowly scoped elevated execution channel for the P0c.3 helper on DESKTOP-2CGN37P**, bound to the exact spike VM and `D:\SUD-D-Runner-Spike\` paths. Once that channel exists, rerun the same pre-flight and spike from the beginning with the unchanged fixed profile.

If Product Owner does not permit that exact privileged execution mechanism, the selected Hyper-V architecture remains BLOCKED and should be rejected rather than replaced by a broader fallback.

## Ready for Architecture Review

**No — feasibility proof did not reach provisioning.**

The blocker is precise and fail-closed; the next review should decide/establish the narrow privileged-helper execution mechanism before repeating the spike.

---

**HYPER-V STORAGE ISOLATION FEASIBILITY: BLOCKED**
