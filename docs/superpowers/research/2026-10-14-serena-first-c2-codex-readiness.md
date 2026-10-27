> Portable copy of the completed 2026-10-14 Codex C2 read-only report. Absolute local path prefixes have been replaced by REPO_ROOT and USER_HOME; source line references and technical findings otherwise retained. This is a design proposal, NOT owner authorization or verified physical evidence.

# รายงาน C2 Readiness — Design/Spec/Risk/Plan เท่านั้น

วันที่ 2026-10-14 — สำหรับ ChatGPT Project Advisor และ Product Owner

**คำตัดสิน: CONDITIONAL สำหรับการเสนอ C2 แบบแคบ; NO-GO สำหรับการรันด้วย implementation ปัจจุบัน**

แนะนำแยก **C2a: code-only privacy/admission integration** กับ **C2b: physical smoke หนึ่ง invocation** โดย C2b ต้องได้รับอนุญาตใหม่หลังตรวจหลักฐาน C2a แล้ว

C1/C1R ยังคง **ACCEPTED — PRIVATE/INERT ONLY** ไม่ใช่ production shell หรือหลักฐาน Final MP4 ปัญหาที่ชี้ขาดจาก source คือ upstream logging บันทึก arguments/results, startup telemetry ยังไม่ได้ถูกปิดใน launch plan, timeout ไม่รับประกันหยุด process และยังไม่มี production seam สำหรับ reviewed invocation กับ Approval card ที่แสดง scope ครบ

รายงานนี้เป็น **final-output payload สำหรับผู้เรียก CLI จับเก็บ** ตามคำสั่ง ไม่ได้สร้างหรือแก้ report file เอง Assignment ที่อ่านไม่ได้ระบุชื่อไฟล์ผลลัพธ์โดยตรง จึงไม่อ้างว่าได้บันทึกไฟล์แล้ว

## A. ขอบเขตและระดับหลักฐาน

อ่าน assignment `.serena/reports/serena-first-c2-readiness-codex-assignment-20261014.md` ครบทั้งหมด รวมถึงบริบทปัจจุบัน, C1/C1R, source ที่เกี่ยวข้อง และ installed Serena implementation แบบอ่านอย่างเดียว

| หลักฐาน | สถานะ |
|---|---|
| Source ของ C1, Kernel, Policy, Approval, Resume, Gateway, Desktop และ managed runtime | ตรวจ source ใน working tree นี้ |
| Installed Serena | พบ metadata `serena-agent` version **1.7.0** และอ่าน implementation; ไม่เรียก executable |
| Installed managed config | อ่านเฉพาะค่าที่เกี่ยวกับ logging/runtime; ไม่อ่าน credential หรือ raw runtime logs |
| C1R 21/21, scoped ESLint/Application TS, diff-check | หลักฐานเดิมที่ Advisor บันทึก; **ไม่ได้ rerun ในงานนี้** |
| Global TypeScript | C1R บันทึก FAIL พร้อมสี่ diagnostics เดิม; ไม่อ้าง PASS |
| Managed session health, process identity, network behavior, cleanup | **PHYSICAL UNKNOWN** |
| TGNK ใหม่ถึง Final MP4 | **NOT PROVEN**; ไม่ตรวจเครื่องหรือ Workspace ของเพื่อน |

Selected Skill(s):

- `codebase-design` — อ่าน `.agents/skills/codebase-design/SKILL.md`
- `research` — อ่าน `.agents/skills/research/SKILL.md`
- `impeccable` — อ่าน `.agents/skills/impeccable/SKILL.md` และ reference สำหรับ shape/Operate
- `writing-for-agents` — อ่าน `.agents/skills/writing-for-agents/SKILL.md` สำหรับข้อเสนอส่งต่อ

ข้อกำหนดใน skill ที่ให้ใช้ background agent, รัน context script หรือเขียนไฟล์ถูกจำกัดด้วย explicit read-only assignment นี้ จึงทำ synchronous source inspection และส่งข้อเสนอใน final เท่านั้น ไม่ได้ใช้ delegate หรือรัน script ดังกล่าว

**Prerequisites ก่อนเสนอ C2b ให้ Owner อนุมัติ ต้องครบทั้งแปดข้อ:**

1. ปิด payload logging/error leakage **ก่อนถึง upstream sinks** และมี focused negative proof
2. ปิด startup usage reporting ใน child environment; pin local token estimator และตรวจ startup/LSP egress ที่เกี่ยวข้อง
3. มี fixed invocation adapter ที่ไม่รับ command/executable/argv/cwd/env จาก AI หรือ renderer
4. มี production Gateway → Resume → Kernel → Policy → manual Approval mapping จริง
5. Approval แสดง immutable command/scope/risk snapshot ครบ และ bind กับสิ่งที่จะเรียกจริง
6. ตรวจ installed runtime identity, tool schema, device/account/session/epoch และ Workspace freshness
7. มี one-use reservation, safe audit/result และ quarantine เมื่อ outcome/cleanup ไม่แน่นอน
8. Owner อนุมัติ **เครื่อง, Workspace, artifacts, startup envelope, คำสั่งหนึ่งครั้ง และ residual host-user risk** โดยเฉพาะ

ขณะนี้ยังไม่มี fresh test/physical evidence ที่ปิด prerequisites เหล่านี้

## B. End-to-end trace และช่องที่ยังขาด

### เส้นทางปัจจุบัน

| ขั้น | Source:line | สิ่งที่มี / สิ่งที่ขาด |
|---|---|---|
| ChatGPT เข้า SUD-D MCP | [workspace-file-server.ts:363](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:363) | มี production MCP server แต่ไม่มี reviewed Serena shell tool |
| Production capability registry | [workspace-file-server.ts:297](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:297) | มี Workspace/Git/code/Verify/Runner discovery/Work Memory/Team; ไม่มี C1 bridge |
| Trusted MCP session | [workspace-file-server.ts:719](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:719) | Gateway overwrite session ที่ request; caller เลือก identity ไม่ได้ |
| Invocation request | [tool-kernel.ts:10](REPO_ROOT/packages/domain/src/tool-kernel.ts:10), [workspace-file-server.ts:728](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:728) | `invocationId`, trusted `session`, `capability`, `input`; invocationId ใหม่แต่ละครั้งไม่ใช่ durable attempt identity |
| Work Resume | [work-resume-guard.ts:10](REPO_ROOT/packages/application/src/work-resume-guard.ts:10), [work-resume-guard.ts:63](REPO_ROOT/packages/application/src/work-resume-guard.ts:63) | เป็น capability whitelist; ชื่อใหม่จะผ่านไป Kernel หากไม่เพิ่ม guard |
| Kernel validation/security/Policy | [tool-kernel.ts:152](REPO_ROOT/packages/application/src/tool-kernel.ts:152), [policy.ts:25](REPO_ROOT/packages/domain/src/policy.ts:25) | มี validation และ fail-closed Policy; execute → ASK, network/outside/internal-root → DENY |
| Approval binding | [tool-kernel.ts:259](REPO_ROOT/packages/application/src/tool-kernel.ts:259), [approval-service.ts:122](REPO_ROOT/packages/application/src/approval-service.ts:122) | Kernel ขอ descriptor/binding; coordinator ทำ HMAC และ consume matching approval |
| Manual-only | [approval-service.ts:85](REPO_ROOT/packages/application/src/approval-service.ts:85), [serena-permission-bridge.ts:144](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:144) | `sensitive` ไม่ eligible autoapproval ปัจจุบัน; C1 ตรวจ `decisionSource:user` และ consumed record แต่ยังเป็น private composition |
| Immutable review | [serena-permission-bridge.ts:188](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:188), [serena-permission-bridge.ts:249](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:249) | C1 มี detached frozen snapshot และ binding; WeakSet/Set เป็น same-process เท่านั้น |
| Pre-execution audit | [tool-kernel.ts:364](REPO_ROOT/packages/application/src/tool-kernel.ts:364) | Audit failure block ก่อน executor |
| Managed Serena mapping | [serena-managed-runtime.ts:105](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:105) | มี semantic read/write mapping; ไม่มี approved short-shell method |
| Pin/schema | [serena-engine-manifest.ts:788](REPO_ROOT/packages/infrastructure/src/serena-engine-manifest.ts:788), [serena-managed-runtime.ts:376](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:376) | pin 1.7.0, 22 expected tools และ exact schema comparison; shell อยู่ใน manifest แต่ไม่ได้เปิดเป็น product capability |
| Managed stdio | [serena-managed-runtime.ts:471](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:471) | launch executable/cwd/env, stderr pipe, MCP client; ไม่ใช่ arbitrary public `callTool` |
| Upstream tool → shell | installed sources ในข้อ C/D | logging และ execution มีข้อจำกัดที่ต้องปิดก่อน activation |
| Safe result/outcome audit → user | [tool-kernel.ts:437](REPO_ROOT/packages/application/src/tool-kernel.ts:437), [workspace-file-server.ts:741](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:741) | มี generic result/audit serialization; executor ต้องคืน safe typed metadata เอง |

**ข้อสำคัญ:** C1 `fakeDispatch` ต้องเป็น fake ตาม [serena-permission-bridge.ts:78](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:78) และทิ้ง upstream response ตาม [บรรทัด 304](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:304) การเสียบ live client ลง dependency นี้จะละเมิด C1 contract และอาจตีความ upstream error เป็น success ต้องสร้าง C2 adapter แยกโดย reuse หลักการ admission ไม่แอบเปลี่ยน C1 ให้ live

### เส้นทาง C2 ที่เสนอ

```text
ChatGPT: ขอ fixed action
→ Gateway: สร้าง/หา trusted pending attempt เดิม
→ Work Resume และ Workspace/device/runtime freshness
→ Kernel → Policy ASK
→ Approval: immutable safe review + manual user decision
→ consume exact approval → pre-audit → reserve one attempt
→ managed Serena stdio: fixed reviewed adapter เท่านั้น
→ strict result validation
→ safe outcome audit/receipt
→ ChatGPT/user
```

ใช้ logical capability ที่เสนอ เช่น `serena.c2.fixed_smoke` โดย input ไม่รับ upstream tool name หรือคำสั่ง ไม่มี generic passthrough

การ retry หลัง Owner approve ต้องอ้าง **pending attempt เดิม** ไม่สร้าง snapshot/attempt ใหม่ทุกครั้ง การสร้างใหม่จะเปลี่ยน binding และวนขอ approval หรือเปิด replay gap

ไม่ต้องใช้ Team Mode, Planner หรือ background model runtime

### Approval UI ที่เสนอ

UI ปัจจุบันมี title/resourceLabel/effect/sensitivity/expiry และ Approve/Deny ที่ [ActivityPage.tsx:211](REPO_ROOT/packages/desktop/src/pages/ActivityPage.tsx:211) แต่ DTO จำกัด resourceLabel 240 ตัวอักษร และไม่มี C2 review ที่ [contracts/index.ts:300](REPO_ROOT/packages/contracts/src/index.ts:300)

**ไม่ควรยัด disclosure ทั้งหมดลง resourceLabel หรือให้ Owner อนุมัติ hash ที่ไม่มี readable scope**

ขยาย card เดิมใน Activity ด้วย optional typed `serenaC2Review` ซึ่งมาจาก trusted process เท่านั้น แสดง:

- “อนุญาตการทดสอบ Serena หนึ่งครั้ง”
- exact executable และ argv แบบอ่านอย่างเดียว
- Workspace ชื่อ/ID/root และ device/account scope
- attempt ID, expiry, runtime/recipe fingerprint
- expected output และ side effects: audit/runtime files รวมถึง startup ที่จำเป็น
- “ไม่มีสิทธิ์ใช้ provider, อ่าน secret, ลบ/เขียนไฟล์งาน หรือเรียกคำสั่งอื่น”
- “ใช้ host-user token; ไม่ได้ sandbox filesystem/network และไม่ใช่ A1 protected consent”
- “timeout เป็นขีดจำกัดการรอ; หากผลหรือ cleanup ไม่ทราบ จะหยุดรับงานต่อ”

Approve disabled เมื่อ review หาย, schema ไม่ตรง, expired หรือ freshness ไม่ผ่าน; Deny ยังใช้งานได้ ข้อความและ scope ต้องอ่านครบได้ในหน้าต่างแคบ, keyboard focus ชัดเจน และไม่พึ่งสีเพียงอย่างเดียว

Gateway และ Desktop คนละ process ตาม production composition ที่ [Gateway:378](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:378) และ [Desktop main:128](REPO_ROOT/packages/desktop/electron/main.ts:128) จึงแชร์ C1 WeakSet หรือ review callback ใน memory ตรง ๆ ไม่ได้

ทางเลือกเล็กที่สุดที่เสนอคือเก็บ **bounded non-secret C2 review projection** กับ approval record เดิม มี schema/version/hash ตรวจทั้งการแสดงและการ consume ไม่สร้าง approval queue ใหม่ การเปลี่ยน record/database นี้เป็น Security/Data Critical และต้องตรวจ migration บน disposable test DB เท่านั้น

## C. Privacy/logging P0

Installed source root ที่ตรวจ:

`USER_HOME\AppData\Local\SUD-D\coding-engines\serena\1.7.0\uv-tools\serena-agent\Lib\site-packages`

### ข้อค้นพบ

| จุด | หลักฐาน | ผลต่อ C2 |
|---|---|---|
| MCP wrapper เปิด tool logging | [serena/mcp.py:97](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/mcp.py:97) เรียก `apply_ex(log_call=True, catch_exceptions=False)` | downstream redaction ช้าเกินไป |
| Arguments logging | [tools_base.py:269](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/tools_base.py:269) รวม kwargs ลง log | command/cwd/content สามารถเข้าสู่ logs |
| Results/error logging | [tools_base.py:400](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/tools_base.py:400) | result INFO และ exception พร้อม `exc_info`; ปิด INFO อย่างเดียวไม่พอ |
| Startup log sinks | [cli.py:338](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/cli.py:338) | สร้าง memory, stderr และ FileHandler แม้ GUI/dashboard ปิด |
| Log files | [serena_config.py:126](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/config/serena_config.py:126) | อยู่ใต้ `SERENA_HOME/logs/<date>` |
| Memory logs | [util/logging.py:26](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/util/logging.py:26) | มี queue/buffer; ปิดหน้าจอไม่ได้ปิดการเก็บ |
| Error transport | [FastMCP tools/base.py:116](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/mcp/server/fastmcp/tools/base.py:116) | exception text ถูกใส่ ToolError; ต้องกันก่อน serialization |
| Fatal paths | [util/exception.py:43](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/util/exception.py:43) | fatal exception ถูก log พร้อม traceback |
| Startup usage egress | [agent.py:722](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/agent.py:722) | ส่ง HTTP usage request เว้นแต่ `SERENA_USAGE_REPORTING=false` หรือ CI conditions |
| Token estimator | [analytics.py:26](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/analytics.py:26), [analytics.py:54](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/analytics.py:54) | Tiktoken อาจ download; Anthropic estimator โหลด dotenv/ส่ง content ไป API |
| Current managed launch | [serena-managed-runtime.ts:323](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:323) | ไม่ส่ง `SERENA_USAGE_REPORTING=false` |
| Current config writer | [serena-managed-config.ts:9](REPO_ROOT/packages/infrastructure/src/serena-managed-config.ts:9) | ปิด GUI/dashboard/LSP trace แต่ไม่ใช่ source privacy control |

Installed config ที่พบใต้ managed `state/1.7.0/.../home/serena_config.yml` ระบุ `log_level:20`, `tool_timeout:240`, `token_count_estimator:CHAR_COUNT`, dashboard/GUI/trace ปิด หลักฐานนี้เป็นค่าของไฟล์ที่มีอยู่ ไม่ยืนยัน session ที่กำลังทำงานหรือ config ครั้งถัดไป เพราะ config writer สามารถเขียนใหม่

Usage request ใน source ส่ง OS/dashboard/version/backend/context; **ไม่พบ command/output ใน payload ของฟังก์ชันนี้** จึงไม่ควรกล่าวว่า telemetry นี้ส่ง shell content อย่างไรก็ตาม เป็น egress ที่ยังไม่อยู่ใน C2 offline consent

Tool usage statistics ตาม [agent.py:871](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/agent.py:871) และ [analytics.py:161](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/analytics.py:161) เก็บ counts ผ่าน estimator ไม่ใช่หลักฐานว่าเก็บ raw transcript ใน stats แต่ estimator ต้องถูก pin เป็น `CHAR_COUNT`

### Transport/environment

`safeManagedRuntimeEnvironment` ใช้ allowlist แต่ยังส่ง Path, ComSpec และ profile directories ที่ [provisioner:59](REPO_ROOT/packages/infrastructure/src/serena-engine-provisioner.ts:59)

Installed MCP client เพิ่ม default environment ก่อน overlay env ที่ [stdio.mjs:68](REPO_ROOT/packages/infrastructure/node_modules/@modelcontextprotocol/client/dist/stdio.mjs:68) รวม HOMEDRIVE/HOMEPATH/USERNAME ฯลฯ จึงต้องทดสอบ **effective environment หลัง SDK merge** ไม่ใช่ดู launch-plan object อย่างเดียว

Runtime ใช้ stderr pipe แต่ไม่พบ explicit bounded drain ใน session implementation ที่อ่าน ส่วน SDK pipe ไป PassThrough ที่ [stdio.mjs:108](REPO_ROOT/packages/infrastructure/node_modules/@modelcontextprotocol/client/dist/stdio.mjs:108) ต้องเติม drain ที่ทิ้ง raw text และเก็บเพียง safe counters เพื่อไม่ให้ pipe/backpressure กลายเป็น hang หรือ memory accumulation

### P0 ที่ต้องปิด

- **P0-PRIVACY:** payload/error/traceback ผ่าน upstream sinks
- **P0-EGRESS:** startup usage reporting และ runtime/LSP downloads ที่ยังไม่พิสูจน์ offline
- **P0-ADMISSION:** ไม่มี production exact invocation/manual review mapping
- **P0-OUTCOME:** C1 ไม่ตรวจ actual exit/output; timeout/cleanup ไม่ชี้ขาด

**Stock Serena 1.7.0 + config ปัจจุบันยังรับประกัน source privacy ตาม assignment ไม่ได้** การเพิ่ม `--log-level WARNING`, `capture_stderr=false`, ลด `max_answer_chars` หรือ redact หลัง MCP response ไม่ปิดทุกช่องข้างต้น

### Mitigation ที่เสนอ

เลือก **repo-owned narrow managed launcher/adapter** ซึ่ง reuse Serena factory/tool/schema แต่ต้องมี reviewed adaptation identity ของตัวเอง ไม่แก้ installed package สด:

1. ตั้ง privacy behavior ก่อนสร้าง Serena agent/MCP และก่อนมี handler ที่รับ payload
2. ไม่ใช้ CLI startup แบบเดิมที่สร้าง FileHandler โดยอัตโนมัติ
3. ไม่สร้าง raw file/memory logs; diagnostic sinks รับเฉพาะ allowlisted metadata หรือทิ้งข้อความทั้งหมด
4. ห้าม formatter/exception handler ส่ง `repr(error)`, traceback, args/result หรือ validation payload ออกไป
5. Shell tool wrapper ปิด call/result logging และแปลง error เป็น fixed safe code ก่อน FastMCP serialization
6. pin `CHAR_COUNT`, `SERENA_USAGE_REPORTING=false`, GUI/dashboard/trace ปิด
7. stdout ใช้เฉพาะ MCP protocol; stderr drain แบบ bounded discard
8. strict fixed input/output; response ต้องไม่มี raw command output ให้ generic transport logger เก็บ
9. ตรวจ `FileHandler`, memory sink, stderr, MCP error, malformed frame และ bootstrap failure ด้วย synthetic poison markers โดยไม่เปิด server/child process

การพึ่ง private upstream factory hooks ต้อง pin hash/schema และ fail closed หาก drift ไม่อ้างว่ามี supported plugin extension ที่ยังไม่พิสูจน์ หาก shim ทำไม่ได้โดยไม่เปลี่ยน upstream source ให้ STOP และส่ง narrow patch/overlay proposal กลับ Advisor

**ทางเลือก:** ใช้ SUD-D fixed short-command adapter โดยตรงจะลด upstream logging surface แต่ไม่ได้พิสูจน์ Serena เป็น execution hand จึงไม่ใช่คำแนะนำหลัก ต้องให้ Owner เลือกหากเส้นทางผ่าน managed Serena ปิด P0 ไม่ได้

## D. Windows/process/stop และคำสั่งสมมติ

### ข้อจำกัดที่ source พิสูจน์

[serena/util/shell.py:28](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/util/shell.py:28) ใช้ `Popen(shell=True)` แล้ว `communicate()` โดยไม่มี process timeout ในฟังก์ชันนั้น ไม่มี explicit env จึง inherit environment ของ Serena

[cmd_tools.py:38](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/tools/cmd_tools.py:38) รับ absolute cwd ได้; ไม่ใช่ Workspace containment enforcement ของ upstream เอง และ `max_answer_chars` ใช้หลังรวบรวมผลแล้ว จึงไม่ใช่ hard memory/output cap

[task_executor.py:80](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages/serena/task_executor.py:80) ระบุว่าหากงานเริ่มแล้ว underlying thread ทำต่อได้แม้ future ถูก cancel ดังนั้น:

- timeout ≠ process exited
- response lost ≠ command not executed
- cancel acknowledgement ≠ descendants stopped
- ปิด managed session ≠ verified cleanup ทั้ง tree

Managed stop ปัจจุบัน snapshot PID tree แล้ว close/cleanup ที่ [runtime:82](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:82), [runtime:450](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:450) และใช้ `taskkill /PID /T /F` ที่ [runtime:561](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:561)

เป็น best-effort tree cleanup ไม่ใช่ Owned Job Supervisor: มี snapshot race, detached children, PID reuse และไม่มี held process identity/Job-empty proof ที่แสดงใน path นี้ ห้ามอ้างว่า comment “authoritative” เป็น physical evidence และห้าม kill ตามชื่อ process

### Shell startup uncertainty

Installed Python [subprocess.py:1534](USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/python/cpython-3.13.15-windows-x86_64-none/Lib/subprocess.py:1534) เลือก ComSpec/SystemRoot และสร้าง `cmd /c` ที่บรรทัด 1545 โดยไม่มี `/d`

ดังนั้นยังถือไม่ได้ว่า stock shell invocation ของ `echo` จะมีเฉพาะ builtin echo ต้องปิดความไม่แน่นอนของ shell startup/AutoRun โดย fixed adapter; การใส่ `cmd /d` ซ้อนใน command string ไม่ควรถูกอ้างว่าป้องกัน outer shell ที่เริ่มไปแล้ว

### คำสั่งเดียวที่เสนอ — ยังไม่อนุญาตให้ execute

```text
Executable: C:\Windows\System32\cmd.exe
argv:       ["/d", "/s", "/c", "echo SUD_D_C2_OK"]
shell:      false
stdin:      DEVNULL
cwd:        canonical root ของ SUD-D-owned synthetic Workspace ที่ Owner ระบุ
output:     stdout ต้องตรง "SUD_D_C2_OK\r\n"; stderr ว่าง; exit code 0
attempts:   1; retry budget 0
```

`C:\Windows` เป็น path สมมติที่ต้องยืนยันกับเครื่องเป้าหมาย ไม่ใช่ค่าที่ตรวจ physical แล้ว Binary path/identity ต้อง resolve โดย trusted adapter และไม่มี PATH search

Managed Serena รับ fixed logical command `"echo SUD_D_C2_OK"` ผ่าน expected shell schema แต่ **narrow adapter แปลงเป็น launch ข้างต้น** ภายใน managed integration สิ่งนี้ต้องติดป้าย `managed-serena-fixed-adapter-v1` และเปิดเผยว่าเปลี่ยน semantics ของ stock `shell=True` ไม่ใช่หลักฐาน arbitrary upstream shell ผ่านแล้ว

Constraints:

- AI/renderer เปลี่ยน executable/argv/cwd/env ไม่ได้
- ไม่มี variable expansion, chaining, redirection, package scripts, external program หรือ detached child
- child env เป็น explicit reviewed allowlist; pin SystemRoot/ComSpec, ตัด provider/control-plane/HMAC/token/env loader variables
- ไม่มี secret อ่านเข้าเครื่องมือ; ไม่มี `.env`, credentials หรือ user media inputs
- capture stdout/stderr แบบ bounded; excess/invalid response → unknown/fail closed
- proposed wait deadline 5 วินาที; cleanup observation budgetแยก ไม่อ้าง hard wall-time guarantee
- cmd root exit/pipe EOF ต้องมีหลักฐาน; ไม่ใช้ generic managed-stop claim แทน

**Startup ของ managed Serena เป็น scope เพิ่มต่างหาก:** executable launcher/Python/LSP, config/cache/log-state writes และ health probes ไม่ใช่ “หนึ่ง cmd process” ทั้งหมด ต้อง inventory และรวมใน consent หรือใช้ session ที่มี valid receipt สำหรับ artifacts/config เดียวกัน การเริ่มใหม่หรือ runtime drift ต้องหมดอายุ approval เดิม

C2b ไม่จำเป็นต้องเปิด AppContainer/Native/A1 หรือ long-job Supervisor เพื่อ echo ครั้งเดียว หาก Owner ยอมรับ cooperative host-user scope ที่ระบุชัด แต่หากต้องการ guaranteed tree kill/containment ต้องเป็น C3/physical supervision gate ใหม่ ไม่ยืม mock proof มาอ้าง

## E. Authority gate matrix

| Authority | Default Restricted | C2 fixed invocation | Gate เพิ่มเติม |
|---|---|---|---|
| Approved Workspace tools เดิม | ตาม Policy เดิม | ไม่เปลี่ยน | ไม่มีสิทธิ์ใหม่จาก C2 |
| Fixed C2 command | ไม่เปิด | opt-in exact one-use + manual Approval | C2a accepted และ C2b Owner consent |
| Full Access/Approve for me | ไม่ข้าม Policy DENY | ห้าม autoapprove C2 | explicit exclusion + `decisionSource:user` |
| Arbitrary shell/scripts/npm | ไม่เปิด | ไม่อยู่ใน scope | Product/security model decision ใหม่ |
| Network | DENY เดิม | command ไม่มี network intent; startup reporting ต้องปิด | แยก approved egress scope; host token ไม่ใช่ network sandbox |
| Secret access | ไม่มี C2 grant | ห้าม | credential design/approval แยก |
| Delete/overwrite | Policy/Recovery เดิม | ห้ามผ่าน C2 | destructive/recovery gate แยก |
| Outside Workspace/InternalRoot | DENY เดิม | cwd อยู่ Workspace; ไม่มี filesystem operation ใน recipe | ห้ามเปลี่ยน label เพื่อเลี่ยง DENY |
| Admin/service/OS policy/Native | ไม่เปิด | ห้าม | setup/native risk gate ใหม่ |
| Provider/spend/upload | ไม่เปิด | ห้าม | provider/account/budget approval ใหม่ |
| Long render/job/streaming | ยังไม่รองรับ | ห้าม | C3 ownership/logs/stop evidence |
| Team/background model | ไม่จำเป็น | ไม่เริ่ม | แยก explicit scope |

Approval ของ root invocation **ไม่ intercept inner file/network/process actions** ของ arbitrary script และไม่ลดสิทธิ์ Windows account จึงต้องอธิบาย host-user residual risk ตรง ๆ

C2 cooperative consent ไม่ใช่ A1 Option A protected independent consent และไม่เปลี่ยนสถานะ A1 BLOCKED/PAUSED

## F. ข้อเสนอส่งต่อที่ 1 — C2a CODE-ONLY

**สถานะ: PROPOSED / NOT AUTHORIZED / NOT DISPATCHED**

**ผู้รับในอนาคต:** Serena Implementation — SUD-D Home New ผ่าน Owner หลัง Advisor review

**Role isolation:** Serena ใช้ Serena และ project checks ที่ Owner อนุญาตเท่านั้น **ห้าม Codex CLI/MCP/agent/delegate, Remote Commander และ agent/subagent delegation** Design gap ส่งกลับ ChatGPT Project Advisor

**Outcome:** privacy-safe fixed adapter และ production admission/review wiring ที่ยังปิด live activation ตามค่าเริ่มต้น พร้อม focused proof และ closeout ครั้งเดียว ไม่รัน managed server/product/command

**Risk Level:** Security / Data Critical

**Selected skills ที่ให้ route ในงานอนาคต:** canonical `tdd`, `codebase-design`, `impeccable`; `writing-for-agents` ตอน closeout; `diagnosing-bugs` เฉพาะ unexpected failure ไม่ใช้ expected RED เป็น trigger

### ลำดับภายในงานเดียว

1. Privacy/fixed-execution adaptation ก่อน: พิสูจน์ sink/error/egress/input behavior ด้วย fakes
2. เมื่อข้อแรกผ่าน จึงเพิ่ม production admission/Approval projection แบบ default-disabled
3. ทดสอบ complete request path ด้วย fake managed session และ disposable repository
4. ส่ง source hashes, RED/GREEN, exact commands/results, preserved baseline และ STOP

ไม่ต้องมี Owner handoff ระหว่าง routine repairs ภายใน scope แต่ **ห้ามผ่าน privacy blocker ไปทำ live integration**

### Exact proposed write allowlist

ไฟล์ใหม่ต้องไม่มีอยู่ก่อนเริ่ม; ถ้ามีให้ STOP เพื่อปรับ dispatch ไม่ overwrite:

```text
packages/infrastructure/src/serena-c2-adapter.ts
packages/infrastructure/src/serena-c2-launcher.py
packages/application/src/serena-c2-readiness.ts
packages/tests/src/serena-c2-privacy.test.ts
packages/tests/src/serena-c2-admission.test.ts
packages/tests/src/serena-c2-production.test.ts
packages/tests/src/serena-c2-approval.test.ts
packages/tests/src/serena_c2_launcher_test.py
```

Existing paths ที่อนุญาตให้เสนอแก้เฉพาะ C2 wiring:

```text
packages/infrastructure/src/serena-managed-runtime.ts
packages/infrastructure/src/serena-managed-config.ts
packages/infrastructure/src/serena-engine-provisioner.ts
packages/infrastructure/src/approval-repository.ts
packages/infrastructure/src/database.ts
packages/application/src/approval-service.ts
packages/application/src/work-resume-guard.ts
packages/domain/src/approval.ts
packages/contracts/src/index.ts
packages/mcp-gateway/src/workspace-file-server.ts
packages/desktop/electron/approval-controller.ts
packages/desktop/electron/main.ts
packages/desktop/src/pages/ActivityPage.tsx
```

หนึ่ง ignored closeout:

```text
.serena/reports/serena-first-c2a-code-only-closeout-20261014.md
```

ใช้ existing approval list/respond IPC และ preload DTO typing; ไม่เพิ่ม renderer execution API จึงยังไม่เปิด `approval-ipc.ts`, `preload.ts` หรือ global renderer declarations ให้แก้ หากจำเป็นจริงให้ STOP รายงาน design delta

**Protected:** C1 source/tests เดิม, Kernel, Policy, manifests/pins, package versions/lockfile, installed Serena/Python/node_modules, Runner/native/A1, authoritative docs และ unrelated dirty work ทั้งหมด ไม่มี production DB migration ในงาน code-only

### Contract ที่ต้องผ่าน

- Fixed recipe เดียว ไม่มี caller executable/tool/command/argv/cwd/env
- Managed-session adapter ไม่มี public arbitrary `callTool`
- Expected 1.7.0/schema และ local adaptation fingerprint ครบ; drift → zero calls
- ไม่ถือ manifest wheel hash เป็น installed-byte attestation: provisioner ปัจจุบันตรวจ version แต่ยังไม่พิสูจน์ wheel/source identity ตาม hash
- ชื่อ C2 เพิ่ม Resume whitelist; ยังตรวจ Workspace generation/session/epoch/device binding ก่อน dispatch
- เพิ่ม explicit manual-only exclusion ของ C2 แม้ `full_access`; consumed `user` decision และ exact binding ต้องตรง
- Review projection เป็น bounded strict safe data มี immutable readable recipe/scope; รวม projection fingerprint ใน binding
- Approval record เดิมเป็น storage สำหรับ review; malformed/missing review → approve ไม่ได้
- consume/reserve ก่อนส่ง; same attempt concurrent/retry มี call สูงสุดหนึ่ง
- restart/epoch drift expire admission; consumed/unknown attempt ไม่ relaunch
- C2b trial มี durable one-use state ผ่าน approval/receipt storage เดิม; ห้ามใช้แค่ Set ใน memory
- Outcome audit failure, lost response, timeout หรือ cleanup unknown → quarantine trial และปิด admission; ห้ามสร้างใหม่อัตโนมัติเพื่อ retry
- ค่า activation เริ่มปิด; default production tools list ไม่มี C2 tool
- ไม่ให้อ่าน arbitrary env flag/caller boolean เป็น authority
- Safe result ตรวจ `isError`, JSON shape, exit code, marker, output limit; fulfilled promise อย่างเดียวไม่ใช่ success
- Receipt เก็บ action/attempt/fingerprint/status/elapsed/safe counts และ cleanup evidence grade; ไม่เก็บ raw stdout/stderr/error
- ไม่มี automatic background/Team start, provider access หรือ adoption of old native gates

### Targeted acceptance matrix

| กลุ่ม | Proof ที่ต้องได้ |
|---|---|
| Privacy | synthetic args/output/error/traceback/validation poison ไม่หลุด file/memory/stderr/MCP error/DTO/audit |
| Startup | fake constructor ไม่ส่ง usage HTTP; local estimator เท่านั้น; ไม่เรียก install/repair/download |
| Environment | ตรวจ effective SDK-merged env, case-insensitive secret exclusions และ fixed cmd env |
| Fixed command | command/cwd/env override, unknown keys/accessors/Symbol/prototype → zero calls |
| Policy/Resume | deny, not-resumed, no/multiple/stale Workspace → zero calls |
| Approval | ทุก mode ต้อง pending จน manual decision; wrong record/digest/expired/replayed → zero calls |
| Review UI | complete safe projection; missing/stale projection approve ไม่ได้; same command display/binding/execution |
| Attempt | concurrent duplicate, lost reply, audit failure, reconstructed runtime → ไม่ relaunch |
| Result | malformed JSON, `isError`, wrong marker, nonzero exit, overflow → safe failure/unknown |
| Default | ordinary production server ไม่ register C2; ไม่มี process startup จาก import/composition |
| Preservation | C1/native/Policy/Kernel และ unrelated bytes ไม่เปลี่ยน |

### Verification ที่เสนอให้ Owner อนุญาตในอนาคต

- focused Vitest เฉพาะสี่ C2 TS test paths ข้างต้น
- pure Python unittest สำหรับ privacy/fixed launcher functions โดย mock constructor/Popen/network/file sinks; ไม่เริ่ม server
- scoped ESLint เฉพาะ changed TS/TSX
- affected Application/Infrastructure/Gateway/Desktop TypeScript checks
- ตรวจ database change กับ disposable test DB เท่านั้น
- `git diff --check` และ complete changed-path review
- Advisor independent Standards/Spec inspection ก่อน C2b

ต้องบันทึก RED → GREEN และ actual exit codes ไม่ rerun C1 เพื่อประกาศมันสำเร็จอีกครั้ง ไม่ซ่อมสี่ global TypeScript diagnostics เดิมนอก scope หาก installed checks ใช้ไม่ได้โดยไม่ install/build/native ให้รายงาน blocker

**STOP CONDITIONS:** ต้องแก้ protected file, เปลี่ยน product/security model, เพิ่ม arbitrary authority, ปิด P0 ไม่ได้, ต้องเริ่ม product/managed server, ต้อง install/compile/native, ต้องอ่าน secret/ใช้ network/provider/production DB หรือครบสาม repair cycles ต่อ root cause แล้วยังไม่ผ่าน เมื่อ candidate proof ครบให้ closeout ครั้งเดียวแล้ว STOP

## G. ข้อเสนอส่งต่อที่ 2 — C2b PHYSICAL GATE

**สถานะ: HOLD / NOT AUTHORIZED — ห้าม execute จากรายงานนี้**

C2b dispatch จะเป็นรูปธรรมได้หลัง C2a มี reviewed artifact hashes และ target device/Workspace ที่ยืนยันแล้ว จึงยังไม่ควรส่งเป็นคำสั่งรันให้ Serena ตอนนี้

**ผู้อนุมัติ:** Product Owner\
**ผู้เตรียม/ตรวจ:** ChatGPT Project Advisor\
**ผู้ปฏิบัติหลังอนุมัติ:** Serena Implementation บนเครื่องเป้าหมายที่ Owner ระบุ โดย no-cross-agent rule เดิม

### Consent packet ที่ต้อง freeze

- target device และ non-elevated Windows account scope
- exact registered SUD-D-owned synthetic Workspace/root/generation
- C2 implementation/runtime/config/Python/launcher/adapter artifact identities
- explicit managed startup process/write envelope และ health probes
- fixed command ข้อ D, environment policy, expected output
- one trial/one command attempt, retry 0, expiry และ wait/cleanup limits
- no provider/spend/credential/media/external Workspace authority
- cooperative host-user residual risk, source-privacy limitations และ stop uncertainty
- existing ChatGPT tunnel connectivity แยกจากคำสั่ง offline; ไม่อ้าง “ทั้งระบบไม่มี network”
- cancellation/quarantine/rollback behavior และหลักฐานที่จะส่งกลับ

### Before-command gate

1. C2a focused proof และ independent review ผ่านสำหรับ artifacts เดียวกัน
2. ไม่ install/repair/download/OS change เพื่อให้ preflight ผ่าน
3. startup egress path ปิดด้วย reviewed source/config; runtime/LSP prerequisites อยู่ local แล้ว
4. Workspace root/device/account/runtime schema/epoch ตรง receipt
5. UI แสดง frozen review ครบ; manual Approval จริงในทุก mode
6. pre-audit และ durable one-use reservation สำเร็จ
7. actual launch route ตรง fixed adapter; ไม่มี stock outer `shell=True` fallback
8. หาก identity/ownership/stop prerequisites ไม่พอ ให้ **STOP BEFORE COMMAND**

การเริ่ม managed Serena session เองต้องอยู่ใน Owner consent และมี startup receipt แยก ไม่ถือว่าไม่ใช่ physical actionเพราะยังไม่ได้เรียก cmd

### Physical acceptance

- denial/staleness → command ไม่เกิด
- valid exact approval → fixed cmd invocation หนึ่งครั้ง
- observed exit 0, exact marker, stderr ว่าง, bounded output/elapsed
- safe pre/post audit และ attempt receipt ตรงกัน
- root exit/stdio closure มี observation; ระบุ cleanup claim เท่าที่พิสูจน์
- ไม่มี unexpected child, file modification, egress หรือ prompt
- consume/retry test ใช้ admission rejection โดยไม่ launch command ครั้งที่สอง
- unexpected process/timeout/telemetry/privacy leak → UNKNOWN/FAIL, quarantine, STOP
- ไม่ทำ detached-child/kill/crash fault campaign ใน C2b นี้; เป็น C3 gate แยก

หากต้องบังคับ stop ให้ใช้อัตลักษณ์/handle ของ process ที่ owned และได้รับอนุญาต ไม่ใช้ name-based kill หรือ PID ที่ไม่ได้ผูก ownership ถ้าไม่สามารถ stop อย่างปลอดภัย ให้รายงาน resource unknown และใช้ Owner-controlled disposition ห้ามลอง relaunch

### Risk/rollback checklist

- [ ] live exposure default-off และปิดคืนหลัง trial
- [ ] authority ผูก exact artifacts/Workspace/device/session/expiry
- [ ] ไม่มี raw logs/secret-bearing receipt
- [ ] startup/command writes จำกัดตาม consent; Windows/user profile ไม่ถูกแก้
- [ ] consumed/unknown record คงอยู่เพื่อกัน retry
- [ ] disable capability และ expire unused approvals ได้
- [ ] ไม่ลบ audit/unknown evidence เพื่อทำให้ดูสำเร็จ
- [ ] source rollback จำกัด patch ของงาน ไม่ reset/clean dirty repository
- [ ] การย้อน source ไม่ถือว่าลบผล physical ที่เกิดแล้ว

## H. เส้นทางจาก C2 ไป Final MP4

| ขั้น | หลักฐานที่ต้องมี |
|---|---|
| C2a | privacy/admission/review source integration ผ่าน focused proof; live ยังปิด |
| C2b | fixed short command ผ่าน managed Serena adapter จริงตาม consent; ไม่ใช่ generic shell หรือ render proof |
| C3 | durable job identity/log cursor/status; owner-bound stop; restart/lost-response/cleanup quarantine; root/tree ownership และ actual cleanup evidence |
| C4 | legitimate **new** TGNK project entrypoint; human business gates; provider accounts/network/budgets; attributable artifacts และ independent QC |

Managed Serena 1.7.0 ที่ตรวจไม่มี established `process_start/status/logs/stop` contract แบบ connector Serena_Home_New จึงห้ามนำความสามารถของ connector นั้นมาอ้างใน SUD-D

เมื่อถึง C3 ให้เลือก reuse process-supervision seam เดิมเฉพาะที่ขาดจาก Serena ไม่สร้าง Policy/Approval/Audit/model loop ซ้ำ และไม่อ้างว่า old Runner/Job/native mocks เป็น owned physical supervision แล้ว

C4 ต้องมี:

- TGNK fresh-project readiness ที่ตรวจบน target จริง โดยไม่ใช้ Workspace เพื่อน
- Topic/Script/Audio/Images/Video/QC gates ที่ workflow กำหนด
- provider-specific consent, finite spending/retries/time และ stop on exhausted budget
- ไม่มี secret ผ่าน args/logs/DTO; upload/egress scope ชัดเจน
- manifest ผูก project/attempt/input/recipe/provider outputs กับ Final MP4
- artifact hash/path/technical media checks และ independent content/creative acceptance
- file `final.mp4` เดิมหรือ successful process exit อย่างเดียวไม่นับเป็น acceptance

Imported-audio resume ยังคง deferred

**ประมาณการสำหรับวางแผน ไม่ใช่ commitment:**

- C2a: ประมาณ 2–4 วันทำงาน หาก repo-owned privacy/fixed adapter ทำได้โดยไม่ fork/install และ cross-process review fit กับ storage เดิม
- C2b: ประมาณครึ่งถึงหนึ่งวันหลัง prerequisites และ specific Owner consent ครบ
- C3: ต้องตรวจ supervision feasibility ก่อน; หาก reuse seam ได้อาจเป็นหลายวัน แต่หากต้อง native ownership/watchdog ใหม่ระยะเวลายังประเมินไม่ได้
- C4/Final MP4: ยังไม่มีฐานพอให้ระบุวันสำเร็จ ขึ้นกับ TGNK gates, provider readiness/budget และ C3 cleanup proof

Blockers ที่มีแนวโน้มสูงสุดคือ upstream source privacy, managed startup/LSP egress, cross-process immutable Approval projection และ truthful process ownership/stop—not Team Mode หรือ model capability

## Owner decision card และการปิดงาน

**ข้อเสนอให้เลือก:** อนุมัติ C2a code-only ตาม allowlist/contract ข้างต้น โดยยอมรับ **narrow managed-Serena fixed adapter** ที่เปิดเผย adaptation identity และยังปิด physical execution ค่าเริ่มต้น จากนั้นให้ Advisor ตรวจ closeout ก่อนเสนอ C2b consent ที่ผูก artifacts/เครื่อง/Workspace จริง

**ยังไม่ควรอนุมัติ:** stock arbitrary Serena shell, Full Access blanket grant, real render/provider/TGNK run หรือ native/OS setup จากรายงานนี้

สถานะ repository ตอนปิดงาน:

- branch `p0c-hyperv-spike`
- HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`
- Git-visible dirty/untracked **252 entries: 38 tracked + 214 untracked**
- staged paths **0**
- อ่าน source/config/Git state เท่านั้น; ไม่มี writes, tests/build/install/network/provider/product/native execution หรือ Serena/agent invocation
- ไม่ได้ทำ fresh `git diff --check`, hash certification หรือ runtime smoke; ไม่อ้างผล PASS ใหม่
- ไม่แก้ HANDOFF เพราะงานนี้เป็น read-only proposal และไม่มี verified project-state transition

**ลำดับถัดไป:** ChatGPT Project Advisor ตรวจรายงานนี้ โดยเฉพาะ adapter trade-off และ C2a allowlist; Product Owner ตัดสิน code-only scope ก่อนให้ Owner ส่ง **ข้อ F ทั้งก้อนพร้อมข้อ C/D เป็น binding reference** ไปยัง Serena Implementation — SUD-D Home New ส่วนข้อ G ต้อง HOLD จนมี C2a evidence และ specific physical consent ใหม่

**STOP — ส่ง Design/Spec/Risk/Plan และข้อเสนอ code-only/physical gate แยกครบแล้ว ยังไม่มี implementation หรือ execution authority เพิ่มเติม**