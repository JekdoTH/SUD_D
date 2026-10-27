> Portable copy of the 2026-10-14 Codex B1 source-grounded read-only design. Local machine-path prefixes replaced with REPO_ROOT and USER_HOME; paths/line refs refer to the source snapshot and must be verified before implementation. Not a grant to edit protected files or execute Terminal.

**สรุปสำหรับ Owner:** B1 ทำได้ในระดับ source แต่ไม่ควรเสียบ B0 เข้ากับ live Serena โดยตรง แนะนำแยก **B1a: admission/runtime seam ที่ยังไม่เปิดใช้** และ **B1b: Approval/DB/Desktop/Gateway integration** เพราะ B1 เต็มรูปต้องแตะประมาณ **27 source/test paths** ตามแบบที่เสนอด้านล่าง

ข้อจำกัดที่ต้องแก้ก่อนเปิดใช้คือ immutable consent ข้าม process, การตรวจ HMAC ให้ตรงคำขอจริง, durable replay/UNKNOWN fence, Workspace/Resume freshness และ Approval card ที่แสดง command กับความเสี่ยงครบ ส่วน B2 ยังต้องมีคำอนุมัติจริงแยกต่างหาก

อ่าน assignment ครบแล้ว ใช้เฉพาะการอ่าน/search source ไม่มี Serena/MCP/delegate, tests/build/install, runtime startup, network หรือการเขียนไฟล์ ใช้ baseline Git ที่ assignment ระบุโดย **ไม่ได้ตรวจ Git ซ้ำ** รายงานนี้ส่ง inline ให้ host capture; ไม่มีไฟล์รายงานที่สร้างขึ้นใหม่

**หลักฐานจาก source**

| จุดตรวจ | ข้อเท็จจริงและผลต่อ B1 |
|---|---|
| [B0 bridge:197](REPO_ROOT/packages/application/src/solo-expert-serena-bridge.ts:197) | `WeakSet` และ `Set` ผูก snapshot/replay กับหน่วยความจำของ process เดียว |
| [B0 receipt:164](REPO_ROOT/packages/application/src/solo-expert-serena-bridge.ts:164) | ตรวจว่า digest เป็น hex 64 ตัว แต่ไม่ได้คำนวณเทียบ HMAC ของ exact request; B1 ต้องตรวจ equality |
| [B0 adapter:61](REPO_ROOT/packages/infrastructure/src/solo-expert-serena-adapter.ts:61) | response decoder และ 300 ms timeout เป็น fixture contract; ห้ามยกระดับเป็น OS guarantee |
| [Managed runtime:35](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:35) | มี session `callTool` ภายใน infrastructure แต่ production façade เปิดเฉพาะ semantic operations |
| [Lazy start:105](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:105), [startup:140](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:140) | semantic call อาจเริ่ม runtime และเรียก provisioner; B1 shell admission ต้องไม่ใช้เส้นทางนี้ |
| [Provisioner:142](REPO_ROOT/packages/infrastructure/src/serena-engine-provisioner.ts:142) | ถ้า engine ไม่มี `ensureInstalled()` จะติดตั้ง; shell request ต้องไม่ก่อ install/repair/download |
| [Manifest:36](REPO_ROOT/packages/infrastructure/src/serena-engine-manifest.ts:36), [pin:787](REPO_ROOT/packages/infrastructure/src/serena-engine-manifest.ts:787) | มี shell schema และ Serena 1.7.0/upstream/wheel pins แล้ว; manifest declaration ยังไม่พิสูจน์ installed bytes |
| [Runtime contract:376](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:376) | ตรวจ expected schemas แต่ startup เก็บเพียง context/session/PID/tool names; ยังไม่มี B1 epoch/integrity receipt |
| [Gateway composition:297](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:297), [default:378](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:378) | Gateway process สร้าง Kernel, Approval coordinator และ managed runtime |
| [Session binding:359](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:359), [result mapping:728](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:728) | MCP session เป็น backend-generated; retry ได้ invocation ID ใหม่ จึงใช้ invocation ID เป็น stable attempt identity ไม่ได้ |
| [Desktop composition:121](REPO_ROOT/packages/desktop/electron/main.ts:121) | Desktop main ใช้ ApprovalService กับ ledger เดียวกันเพื่อบันทึก human decision; ไม่ใช่ Gateway coordinator |
| [Tunnel identity:202](REPO_ROOT/packages/infrastructure/src/secure-tunnel-process.ts:202), [identity resolver:18](REPO_ROOT/packages/infrastructure/src/approval-runtime-identity.ts:18) | Tunnel launch สร้าง runtime ID/HMAC key ส่งให้ Gateway; Desktop ไม่ต้องรับ key และ renderer ต้องไม่เห็น key |
| [Approval digest:132](REPO_ROOT/packages/application/src/approval-service.ts:132) | HMAC ครอบ runtime/capability/effect/security/binding; B1 binding ต้องรวม session และ complete reviewed scope |
| [Atomic consume:263](REPO_ROOT/packages/infrastructure/src/approval-repository.ts:263) | conditional UPDATE กัน consume ซ้ำได้ แต่หลัง `consumed` coordinator อาจสร้าง pending ใหม่; ต้องมี B1 attempt fence เพิ่ม |
| [Descriptor](REPO_ROOT/packages/domain/src/approval.ts:16), [Desktop DTO:300](REPO_ROOT/packages/contracts/src/index.ts:300), [Activity:214](REPO_ROOT/packages/desktop/src/pages/ActivityPage.tsx:214) | title/resourceLabel ไม่พอสำหรับ complete consent projection |
| [Resume:46](REPO_ROOT/packages/application/src/work-memory-service.ts:46) | ปัจจุบันจำเพียง session ID → Workspace ID; ไม่ตรวจ root/generation ของ resume receipt |
| [Resume guard:10](REPO_ROOT/packages/application/src/work-resume-guard.ts:10) | guarded capabilities เป็น explicit set; B1 ต้องเพิ่มชื่อ capability |
| [Kernel:364](REPO_ROOT/packages/application/src/tool-kernel.ts:364), [outcome:435](REPO_ROOT/packages/application/src/tool-kernel.ts:435) | pre-audit อยู่ก่อน executor; post-audit อยู่หลัง executor จึงปิด attempt สำเร็จภายใน executor ก่อน post-audit ไม่ได้ |
| [DB:448](REPO_ROOT/packages/infrastructure/src/database.ts:448) | migrations ปัจจุบันถึง 012; เพิ่ม migration ต่อท้ายโดยไม่แก้ migration เก่า |

ตรวจ installed stock source โดยอ่านไฟล์เท่านั้น:

- [cmd_tools.py:38](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/cmd_tools.py:38): cwd ที่ upstream รับอาจเป็น absolute; upstream ไม่บังคับ Workspace containment ให้ SUD-D
- [util/shell.py:28](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/util/shell.py:28): `Popen(shell=True)` แล้ว `communicate()`; ไม่มี process timeout ในฟังก์ชันนี้
- [tools_base.py:281](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/tools_base.py:281): `max_answer_chars` จำกัด **serialized result หลังรวบรวมผลแล้ว** และอาจคืนข้อความ “answer too long”
- [mcp.py:97](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/mcp.py:97), [tools_base.py:404](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/tools_base.py:404): tool arguments/results/errors อาจเข้าสู่ local logging
- [agent.py:725](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/agent.py:725): `SERENA_USAGE_REPORTING=false` ปิด usage-reporting branch นี้ แต่ไม่ใช่ network sandbox
- [SDK stdio:68](REPO_ROOT/packages/infrastructure/node_modules/@modelcontextprotocol/client/dist/stdio.mjs:68): effective environment คือ SDK default env รวม supplied env
- [Python MCP server:183](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/mcp/server/lowlevel/server.py:183): MCP handshake version อาจเป็นเวอร์ชันแพ็กเกจ `mcp`; **ห้ามสมมติว่าต้องเท่ากับ Serena 1.7.0**

Serena_Home_New tools/process manager ไม่ใช่ managed Serena instance นี้ และใช้เป็นหลักฐาน B1/B2 ไม่ได้

**สัญญา B1 ที่แนะนำ**

ใช้ profile เดียว: `harmless-short-smoke`, revision `b1-smoke-v1` กับ command คงที่ **`echo SUD_D_B1_OK`** เป็นข้อเสนอสำหรับ source profile เท่านั้น ยังไม่อนุญาตรันจริง ไม่เปิด development-script profile ใน B1

- Upstream tool คงที่ `execute_shell_command`
- Backend เติม canonical Workspace cwd; caller/renderer ไม่ส่ง command/tool/executable/argv/cwd/env
- `capture_stderr=true`, `max_answer_chars=2048` สำหรับ JSON envelope ของ profile นี้; decoder จำกัด response และทิ้ง raw payload ทุก error path
- stdout ที่ยอมรับสำหรับ Windows profile นี้คือ `SUD_D_B1_OK\r\n`, stderr ว่าง, cwd ตรง reviewed canonical root
- waiting deadline ที่เสนอ 5,000 ms; disclosure ต้องเรียกว่า **เวลารอผล** ไม่ใช่ OS execution deadline
- review TTL 90 วินาที, `maxCalls=1`, `maxRetries=0`
- fixed command ไม่มี file/network/provider intent แต่ implicit shell startup และ managed Serena/LSP/cache/log effects ต้องเปิดเผยและตรวจใน B2

การไหลขั้นต่ำ:

```text
ChatGPT → Gateway backend creates stable attempt
→ genuine Workspace + fresh Work Resume + ready managed-session identity
→ Kernel → Policy ASK
→ immutable review persisted with Approval
→ Desktop displays review; human approves that review once
→ exact retry → same Gateway coordinator consumes manual Approval
→ Kernel pre-audit
→ durable dispatch claim + final freshness checks
→ fixed managed Serena invocation
→ safe result → Kernel outcome audit
→ close attempt, or retain durable UNKNOWN fence
```

Public input รับเพียง `{}` เพื่อขอ attempt ใหม่ หรือ `{attemptId}` เพื่อดำเนิน attempt เดิม ชื่อ capability ที่เสนอคือ `solo_expert.smoke` โดย request ใหม่ต้องไม่ผ่านเมื่อมี unresolved claimed/UNKNOWN attempt อยู่

Complete binding ต้องรวม attempt/profile/revision, exact command และ recipe digest, disclosure revision, Workspace ID/root/root digest/generation, MCP session ID/type, Gateway epoch, managed-session epoch, artifact/config/schema identity, device/account observation และ provenance, issued/expiry, waiting deadline/output settings และ one-use limits

การตรวจ consent ต้องทำโดย **Gateway coordinator เดิม**: เพิ่ม specialized `verifyConsumedManualSoloExpert()` ตรวจ HMAC equality ของ exact authorization request พร้อม request ID, runtime ID, session, capability, effect, security, `status=consumed`, `decisionSource=user` และ expiry ห้ามนำ verifier ของ Desktop-only pre-H1 มาใช้โดยเปลี่ยน label

`full_access` และ `approve_for_me` ต้องถูกปฏิเสธสำหรับ capability นี้โดย explicit capability exclusion เพิ่มจากการจัด sensitivity เป็น `sensitive`

**Persistence และ UNKNOWN**

เพิ่ม typed `soloExpertReview` ใน ApprovalDescriptor/record; SQLite เก็บเฉพาะ validated nonsecret review JSON ส่วน audit เก็บ IDs/digests/reason codes ไม่มี raw command/output/error

เพิ่ม `solo_expert_attempts` แยกจาก Approval status เดิม:

- `prepared`: ยังไม่ dispatch
- `claimed`: durable claim ก่อน transport; crash ที่นี่ถือว่า unresolved
- `closed`: มี trusted result และ outcome audit สำเร็จ
- `unknown`: ผล/transport/audit/freshness หลัง dispatch ไม่ชัดเจน
- `revoked`: ปิด attempt ที่ยังไม่ dispatch

Claim ต้องเป็น conditional transactional transition พร้อม unique approval ID และ constraint ให้มี unresolved attempt ได้อย่างมากหนึ่งรายการ ข้าม Gateway instances ได้ ห้าม cleanup ของ Approval ลบ attempt fence หรือ cascade ทำให้ UNKNOWN หาย

Capability executor ไม่เปลี่ยน `claimed` เป็น `closed` เอง ให้ integration wrapper ตรวจ Kernel result หลัง outcome audit แล้วจึงปิด Crash/DB failure หลัง dispatch คง `claimed` ไว้และปิด admission ต่อไป Late result ไม่เปิด fence หรือ retry อัตโนมัติ

นี่คือ **at-most-once admission/dispatch claim** ไม่ใช่ durable exactly-once process effect: crash หลัง claim อาจยังไม่ส่ง หรือส่งแล้วแต่ไม่ได้รับผล Revocation หยุด future admission; ไม่รับประกันหยุด subprocess/descendants

**Workspace, Resume และ runtime freshness**

ใช้ genuine Workspace resolver และ canonical containment checks เดิม ไม่ใช้ B0 string validation เป็นความเชื่อถือ

สำหรับ B1 เพิ่ม monotonic Workspace generation ที่ SQLite เพิ่มเมื่อ Workspace enrollment/root/active selection เปลี่ยน รวมกรณีเปลี่ยนออกแล้วกลับมาใน timestamp เดียวกัน เก็บ generation นี้จาก `work.resume` จริง และตรวจใหม่ก่อน prepare/consume/claim ไม่รับ caller `resumed:true`

Managed runtime เพิ่ม ready-only inspection และ fixed invocation:

- ไม่เรียก `startInternal`, ensure/install/repair หรือ semantic lazy start จาก B1 request
- ไม่มี active healthy session ตรง Workspace → `MANAGED_SESSION_NOT_READY`
- epoch invalidate ทันทีเมื่อ stop/rebind/repair/transport failure เริ่มขึ้น; ห้ามใช้ session ที่กำลังปิด
- ตรวจ Serena package/config version, exact shell schema และ reviewed artifact/config identity แยกจาก MCP handshake version
- expected integrity inventory ที่ยังไม่ตรวจจริง → fail closed; wheel hash ใน manifest อย่างเดียวไม่พอ
- pin launch env `SERENA_USAGE_REPORTING=false`; pin config estimator `CHAR_COUNT`
- drain stderr ตั้งแต่ก่อน connect โดยทิ้ง raw bytes; ไม่สะสมหรือส่งเข้า DTO/audit
- Gateway close ต้องปิด admission/invalidate epoch ก่อน best-effort lifecycle cleanup; ไม่อ้าง durable descendant termination

B1 ไม่เพิ่ม installed-only startup workflow ในครั้งนี้ การเตรียม real active runtime อยู่ใน B2 packet ที่ต้องอนุมัติแยก

**Approval UX ขั้นต่ำ**

ใช้ inline review ใน pending Approval ของ Activity ไม่สร้าง wizard ใหม่:

1. Exact command แสดงครบและเลือกคัดลอกได้
2. Workspace name/root, request short ID, expiry และ “ครั้งเดียว”
3. Device/account label พร้อม provenance เช่น “observed Gateway OS user; child token not independently attested” ถ้าไม่มี reliable observation ให้แสดง “unverified”; label ไม่เป็น authority
4. เปิดเผย Serena file/memory/stderr logging, stdout/error logging และ log location ของ managed runtime
5. เปิดเผย ambient Windows-user file/network rights, implicit/indirect side effects, descendants และการรอผลที่ไม่รับประกันหยุด process
6. Explicit action “Approve this Solo Expert action once” และ Deny
7. Missing/malformed/stale review → Approve disabled และ backend reject
8. Approve ส่ง request ID พร้อม displayed `reviewDigest`; ไม่ส่ง command/root/env กลับเป็น execution input Backend ตรวจ digest กับ persisted projection
9. Approve บันทึก consent เท่านั้น; exact ChatGPT retry จึงดำเนินต่อ

ไม่มี persistent Full Access หรือ global Solo toggle ใน slice นี้ Production registration มี backend gate **default false**; B1 tests inject fake-enabled composition ได้ การเปลี่ยน default gate เพื่อ B2 เป็นการอนุมัติ source activation แยก ห้ามรายงานว่า production READY ระหว่าง gate ยัง OFF

**Exact writable allowlist ที่เสนอ**

รายการนี้เป็นข้อเสนอให้ Owner/Advisor อนุมัติ ไม่ใช่ write authorization จาก turn นี้ ไม่มี wildcard

**B1a — required; 6 source + 2 tests**

| สถานะ | Exact path | งาน |
|---|---|---|
| NEW | `packages/domain/src/solo-expert-serena.ts` | fixed profile, typed review/identity/result และ admission/ledger interfaces |
| EXISTING | `packages/domain/src/index.ts` | export สัญญาที่ใช้ข้าม package |
| NEW | `packages/application/src/solo-expert-serena-integration.ts` | admission, exact binding, freshness, Kernel wrapper; injected verifier/ledger |
| NEW | `packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts` | fixed request mapper และ source-grounded safe decoder |
| EXISTING | `packages/infrastructure/src/serena-managed-runtime.ts` | ready-only fixed seam, epoch, identity checks, early stderr drain, env flag; dependency injection สำหรับ fakes |
| EXISTING | `packages/infrastructure/src/serena-managed-config.ts` | explicit config pins และ pure config builder เพื่อ fake-only tests |
| NEW | `packages/tests/src/solo-expert-serena-integration.test.ts` | admission/Approval/Kernel negative matrix |
| NEW | `packages/tests/src/solo-expert-serena-runtime.test.ts` | fake session/runtime/decoder/environment matrix |

B1a **ไม่เปลี่ยน B0 ทั้งสามไฟล์**, ไม่ export integration จาก application/infrastructure barrels, ไม่แตะ Gateway/Desktop/DB และไม่มี production registration

**B1b — required additions; 15 source + 4 tests**

B1b ต้องอนุมัติรายการด้านล่าง **รวม B1a paths ที่ต้องต่อ wiring** จึงรวม 27 source/test paths:

| สถานะ | Exact path | งาน |
|---|---|---|
| EXISTING | `packages/domain/src/approval.ts` | typed optional immutable review |
| EXISTING | `packages/application/src/approval-service.ts` | projection validation, manual-only exclusion, exact verifier, TTL clamp |
| NEW | `packages/infrastructure/src/solo-expert-serena-attempt-repository.ts` | persistent claim/quarantine/generation operations |
| EXISTING | `packages/infrastructure/src/database.ts` | append migration: review column, attempt table, generation/constraints |
| EXISTING | `packages/infrastructure/src/approval-repository.ts` | persist/read review; preserve immutability |
| EXISTING | `packages/infrastructure/src/index.ts` | narrow adapter/repository exports |
| EXISTING | `packages/application/src/index.ts` | narrow integration export |
| EXISTING | `packages/application/src/work-memory-service.ts` | genuine generation-bound B1 resume receipt |
| EXISTING | `packages/application/src/work-resume-guard.ts` | guard new capability |
| EXISTING | `packages/mcp-gateway/src/workspace-file-server.ts` | same-coordinator composition, stable attempt protocol, OFF gate, mapping/lifecycle |
| EXISTING | `packages/mcp-gateway/src/metadata.ts` | record optional tool-surface revision |
| EXISTING | `packages/contracts/src/index.ts` | strict review DTO และ optional decision review digest |
| EXISTING | `packages/desktop/electron/approval-controller.ts` | safe projection และ backend decision validation |
| EXISTING | `packages/desktop/electron/main.ts` | inject ledger/Workspace review reader; ไม่สร้าง live executor |
| EXISTING | `packages/desktop/src/pages/ActivityPage.tsx` | complete per-call review/consent UI |
| NEW | `packages/tests/src/solo-expert-serena-gateway.test.ts` | fake production composition/MCP flow |
| NEW | `packages/tests/src/solo-expert-serena-approval.test.ts` | coordinator/manual decision/binding |
| NEW | `packages/tests/src/solo-expert-serena-persistence.test.ts` | ledger/restart/claim/migration seams |
| NEW | `packages/tests/src/solo-expert-serena-desktop.test.ts` | DTO/controller/IPC/UI projection |

Conditional paths, **ไม่เปิดเขียนอัตโนมัติ**:

- `packages/desktop/src/index.css`: เฉพาะ review wrapping/reflow ที่ existing styles รองรับไม่ได้
- `packages/desktop/electron/approval-ipc.ts`: เฉพาะเมื่อ typed pass-through เดิมไม่เพียงพอ; คง sender validation และ channels เดิม
- `packages/infrastructure/src/serena-engine-manifest.ts`: เฉพาะ vetted pin ที่ feasibility gate พิสูจน์ว่าต้องเพิ่ม; ห้ามเปลี่ยน version/schema เพื่อให้ผ่าน

`preload.ts`, `global.d.ts`, `approval-runtime-identity.ts`, `secure-tunnel-process.ts`, Kernel/Policy source และ provisioner ไม่ต้องเปลี่ยนตามแบบนี้ ถ้าจำเป็นต้องแตะให้ STOP กลับ Advisor พร้อมเหตุผล

Closeout-only output ที่เสนอแยกจาก code allowlist:
`.serena/reports/solo-expert-b1a-code-only-closeout-20261014.md` หรือ B1b equivalent ห้าม stage/commit ไม่มี Context/Roadmap/Handoff edits ใน implementation mission นี้

**Feasibility gates และลำดับ patch**

| Gate | ต้องพิสูจน์ก่อนเดินต่อ |
|---|---|
| F1 — source compatibility | mapper/parser ตรง installed shell/MCP source; ไม่ copy B0 envelope/exit range assumptions โดยไม่ตรวจ |
| F2 — ready-only runtime | inspection/request ทั้ง blocked/pending ไม่ start/connect/provision/repair/download; shell ใช้ matching active epoch เท่านั้น |
| F3 — exact manual consent | persisted immutable projection → Desktop → user decision → same-coordinator HMAC equality → one-use consume |
| F4 — durable fence | replay/concurrent/crash/UNKNOWN กัน admission หลัง reconstruct; post-audit failure ปิด success |
| F5 — trusted freshness | session/root/generation/resume/runtime/config/artifact changes block; labels ไม่สร้าง authority |
| F6 — default OFF | default Gateway list/invoke ไม่มี B1 execution; fake-enabled composition ใช้ได้เฉพาะ reviewed fake tests |
| F7 — live readiness | real artifact identity, prepared runtime, owner-visible UI และ exact B2 scope ยัง NOT PROVEN |

ลำดับแนะนำ: **B1a contracts → fake admission tests → fixed decoder → ready-only runtime → focused checks → STOP** จากนั้น Advisor review และ Owner อนุมัติ B1b allowlist ก่อน **migration/ledger → Approval verifier → Resume freshness → Desktop projection → Gateway fake wiring/default-OFF → focused checks → STOP**

B1a ผ่านหมายถึง **source-only seam candidate**; B1b ผ่านหมายถึง **default-OFF source integration candidate** ทั้งสองไม่ใช่ physical PASS

**Focused tests ที่ต้องมี**

ทุก execution/runtime/provider boundary ใช้ fakes ไม่มี real managed startup, shell หรือ OS process:

- default OFF, prepare/list/review/resume/deny/expiry มี shell/start/provision calls เป็นศูนย์
- extra keys, command/cwd/env/argv/tool/account/session injection, accessors/prototypes/symbols ถูกปฏิเสธ
- pending/denied/expired/unconsumed/mode-sourced Approval ไม่ dispatch; ทดสอบทั้งสาม Approval Modes
- well-formed **แต่ผิด** HMAC, swapped request ID, other runtime/session/profile/attempt ถูกปฏิเสธ
- root/enrollment/generation/active-switch-away-and-back, Resume missing/stale, epoch/config/artifact/schema drift block ก่อน dispatch
- change หลัง async audit/consume และก่อน transport ถูก recheck; หลัง dispatch ห้ามรายงาน clean success
- concurrent exact retries claim ได้หนึ่งครั้ง; consumed/claimed attempt ไม่สร้าง pending ใหม่เพื่อ relaunch
- lost reply/throw/deadline/MCP error/malformed/too-long response/cwd mismatch เป็น UNKNOWN หลัง dispatch
- valid nonzero exit เป็น `command-failed` แม้ MCP `isError=false`; ไม่เท่ากับ command success
- pre-audit failure: zero dispatch; post-audit failure: claimed/UNKNOWN durable fence
- restart reconstruction, late result และ new attempt ID ไม่หลบ unresolved fence; failure to persist outcome ไม่ล้าง claim
- typed projection แสดง command/disclosure/root/account provenance/expiry ครบ; missing or changed digest approve ไม่ได้
- IPC invalid sender ไม่ list/approve; response ไม่รับ execution controls
- poisoned output/error ไม่เข้าสู่ safe DTO/audit/persisted review
- effective SDK-merged environment ไม่มี credential/HMAC/provider inheritance; reporting flag และ CHAR_COUNT ตรง pin
- Gateway close/rebind invalidate admission/epoch; fake cleanup ไม่ถูกนับเป็น child-stop proof

Persistence tests ใช้ fake reconstructed durable-store seam ตาม fake-only scope นี้ ต้องระบุชัดว่า **ไม่ใช่ actual cross-process SQLite/OS durability proof** หากต้องการตรวจ real SQLite migration/transaction/reopen ต้องจัด scope สำหรับ test-owned DB แยกก่อน ห้ามเปิด production DB หรืออ้าง mock persistence เป็นหลักฐานจริง

ใช้ focused Vitest files, scoped lint/typecheck และ `git diff --check` ใน **Serena mission ที่อนุมัติแล้วเท่านั้น** ไม่ใช้ root `pnpm test`, runtime acceptance scripts หรือ physical suites โดยอัตโนมัติ Global TypeScript สี่ข้อผิดพลาดเป็นข้อมูลจาก B0 acceptance เดิม ไม่ใช่ผลที่รันซ้ำใน turn นี้

**ข้อความสำหรับส่ง Serena ในแชตแยก — B1a proposal**

ส่งข้อความนี้ให้ Serena Implementation บนเครื่องที่มี working tree นี้ **หลัง Owner อนุมัติ B1a exact scope**:

```text
SUD-D SOLO EXPERT B1a — CODE-ONLY IMPLEMENTATION
This packet is actionable only after Owner approves this exact scope.

Role: Serena Implementation. Use Serena and approved project tools for
source/focused tests only. NEVER invoke Codex CLI, codex exec, Codex
MCP/agent/services, delegates/subagents, Remote Commander, Team Planner.

Read AGENTS.md, SUD_D_ADVISOR.md, current Handoff/Roadmap tops,
docs/superpowers/plans/2026-10-14-serena-first-b0-advisor-acceptance.md,
and the Owner-approved Codex B1 report attached to this message.
Preserve preexisting dirty work. B0 remains accepted PRIVATE/INERT.
Restricted default and A1 paused status remain unchanged.

Outcome: B1a source-only admission/runtime seam candidate, fake-only
proof, no production registration, no physical/runtime readiness claim.

REQUIRED SKILLS: repo-local codebase-design and tdd.
Risk: Security / Data Critical. Complete repository compliance check.

Writable source/test allowlist — exactly:
NEW packages/domain/src/solo-expert-serena.ts
EXISTING packages/domain/src/index.ts
NEW packages/application/src/solo-expert-serena-integration.ts
NEW packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts
EXISTING packages/infrastructure/src/serena-managed-runtime.ts
EXISTING packages/infrastructure/src/serena-managed-config.ts
NEW packages/tests/src/solo-expert-serena-integration.test.ts
NEW packages/tests/src/solo-expert-serena-runtime.test.ts

Reporting-only NEW:
.serena/reports/solo-expert-b1a-code-only-closeout-20261014.md

Implement the attached report's single fixed b1-smoke-v1 profile,
typed complete review, exact-binding/manual-verifier seam, injected
ledger/UNKNOWN fence interface, Kernel outcome wrapper, fixed decoder,
and ready-only managed runtime inspection/invocation with epoch checks.
No shell request may start, connect, provision, repair or download.
No raw command/cwd/env/argv/tool inputs. No live factory injection into
B0. Keep all B0 source/tests unchanged.

Before implementation, source-check the stock shell/MCP envelope,
version distinction, config/env/SDK merge and runtime test injection.
If production integrity/resume/ledger dependencies are unavailable,
represent them as unavailable/fail-closed injected interfaces;
do not invent an attested identity or claim durable production proof.

Use TDD and the B1a-relevant focused matrix in the attached report.
All session/process/transport/provider dependencies must be fakes.
Mock config/filesystem effects; no actual managed startup, shell,
OS child, network/provider, installation, production DB or Workspace
registration. Do not run physical/runtime acceptance or root pnpm test.
Use scoped lint/typechecks and git diff --check; no build/package.
Do not repair unrelated historical type errors.

For relevant failures: diagnose, smallest in-scope fix, focused rerun;
maximum three repair cycles per diagnosed root cause.
STOP on security weakening, out-of-allowlist change, contract/design
gap, missing safe test dependency, or unresolved failure at that limit.
Return design gaps to Advisor through Owner; never invoke Codex.

STOP after focused B1a proof and one closeout.
Do not implement B1b, export production integration, enable capability,
change defaults, run B2, edit durable docs, stage/commit/push.

Closeout: exact changed paths, source feasibility findings, tests and
exit codes actually observed, fake-vs-real evidence, unresolved pins,
and status B1a SOURCE-ONLY CANDIDATE / B1b NOT IMPLEMENTED /
PHYSICAL NOT RUN. Owner returns this one closeout to ChatGPT Advisor.
```

**B2 proposal template — ยังไม่ใช่ runtime authorization**

ก่อน B2 ต้องเติมและให้ Owner อนุมัติ packet ที่มี:

- exact target device และ enrolled SUD-D-owned Workspace ID/canonical root/generation
- exact profile revision/command, interpreter-selection/implicit shell startup caveat
- actual managed package/artifact/config/schema identities และ account/device provenance
- separate scope สำหรับเตรียม installed runtime/startup probes/cache/log effects; ไม่มี auto install/network
- source activation gate และ complete immutable Approval card ที่ Owner จะกดจริง
- one attempt, expiry, waiting deadline, expected marker/exit/cwd, startup/logging/effect expectations
- safe audit/result evidence และ cleanup limits; UNKNOWN → quarantine/STOP ไม่มี retry
- เรียกผ่าน ChatGPT → SUD-D Gateway → Kernel/Policy/manual Approval/Audit เท่านั้น
- exclude provider/spend/secrets/admin/delete/long job/TGNK และ Home New direct-shell proof

**ลำดับถัดไป:** ChatGPT Project Advisor ตรวจแบบนี้ แล้ว Product Owner อนุมัติ **B1a 8 paths** ก่อนส่งข้อความข้างต้นให้ Serena ในแชตแยก B1b และ B2 ยังไม่อนุญาต รายงานเป็นข้อเสนอที่ยัง Discussed จึงไม่มี durable-doc update ใน turn นี้ **STOP**