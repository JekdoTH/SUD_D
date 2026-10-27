> Codex 2026-10-14 A/B risk-model DESIGN-ONLY report; local absolute path prefixes converted to REPO_ROOT and USER_HOME for portable repo continuity. NOT Owner approval of Option A, Option B, implementation or physical execution.

**ข้อเสนอการตัดสินใจ: เลือก B แบบ Solo Expert ที่เปิดเอง เฉพาะงานของ Owner และเริ่มด้วยการอนุมัติรายคำขอ** เป็นทางที่ต้นทุนต่ำที่สุดตามเป้าหมาย Serena-first ส่วน A ควรเลือกเมื่อ “ข้อมูลต้องไม่เข้า upstream logs” เป็นเงื่อนไขที่ยอมผ่อนไม่ได้

B มีความเป็นไปได้จากซอร์ส แต่ **ยังเปิดใช้งานไม่ได้วันนี้** ต้องเติมการผูกคำขอกับ Approval ข้าม process, ตรวจ provenance ของ runtime และแปลผลอย่างปลอดภัยก่อน การยอมรับความเสี่ยงเป็นเพียงการเปลี่ยนเกณฑ์รับงานของโหมดใหม่ ไม่ได้ทำให้ logs ถูก redact, สคริปต์ถูก sandbox หรือ process ลูกหยุดได้แน่นอน

อ่าน assignment ครบแล้ว รายงานนี้เป็น **final CLI payload สำหรับ ChatGPT Project Advisor** ไม่มีการสร้าง report file เอง ไม่มีการเรียก Serena/ตัวแทน/Remote Commander ไม่มี source/docs edits, tests, build, install, runtime, network/provider/secret หรือ Git write

**1. ตารางตัดสินใจ A/B/C**

| ประเด็น | A — Privacy adaptation | B — Solo Expert cooperative consent | C — External Serena_Home_New |
|---|---|---|---|
| แนวทาง | ใช้ Serena engine เดิม ผ่าน launcher/wrapper/overlay ที่ตรวจและ pin | ใช้ stock managed Serena พร้อมยอมรับ local logging และ host-user risk อย่างชัดเจน | ใช้ connector ภายนอกเป็น workflow shortcut |
| ความเป็นไปได้จากซอร์ส | มี seam ให้ดัดแปลง แต่ยังไม่มี adaptation ที่พิสูจน์แล้ว | shell implementation มีจริง; production admission ยังขาด | ความสามารถ runtime ปัจจุบันไม่ได้ตรวจในงานนี้ |
| งานเพิ่มเฉพาะทาง | ป้องกันข้อมูลก่อน log/error sinks, startup privacy, packaging และ attestation | disclosure, manual grants, provenance, safe projection/result และ entry enforcement | ตรวจ connector/เครื่อง/TGNK readiness ตามขอบเขตใหม่ |
| งานที่ทั้ง A/B ยังต้องทำ | Approval/UI ข้าม process, Workspace/session/resume binding, audit และ lifecycle ที่กล่าวอ้างได้จริง | เช่นเดียวกับ A | ไม่พิสูจน์ SUD-D mediation |
| คำสั่งจริงครั้งแรก | หลัง adaptation proof **และ** admission/UI proof แล้วจึง physical smoke | หลังสองแพตช์ code-only ที่จำกัดขอบเขต แล้วหนึ่ง physical smoke ที่ Owner อนุมัติ | อาจลดงาน product integration แต่ยังไม่ทราบ readiness |
| ETA เป็นวัน | ประเมินไม่ได้อย่างรับผิดชอบ; P0 เดิม NO-GO | ไม่มีข้อมูล productivity พอให้ระบุวัน; จำนวน gate น้อยกว่า A | ไม่ทราบ |
| Final MP4 | ยังขึ้นกับ long-job/TGNK/provider/QC | เช่นเดียวกัน; B ไม่แก้ long-job gap | เป็น external pilot เท่านั้น |
| การย้อนกลับ | ปิด capability และย้อน adaptation version ได้; ข้อมูลที่ออกไปแล้วเรียกคืนไม่ได้ | ปิด opt-in/เพิกถอน grant ได้; ผลของคำสั่งและ logs ไม่ย้อนกลับเอง | แยกจาก product; ผลภายนอกยังคงอยู่ |
| ข้ออ้างสูงสุดวันนี้ | adaptation **น่าจะทำได้ แต่ยังไม่พิสูจน์** | stock tool **มี implementation แต่ยังไม่เปิดผ่าน SUD-D shell** | ไม่ถือเป็น SUD-D MVP success |

**คำแนะนำ hybrid:** ใช้ admission/registry/safe-result เดียวกัน แล้วระบุ `privacyProfile` เป็น `stock-local-logging` หรือ `adapted-no-payload` ใน identity และ grant ภายหลังเปลี่ยนจาก B ไป A ได้โดย invalidate grant เดิม ไม่ต้องสร้าง permission engine สองชุด การทำ A และ B พร้อมกันตอนนี้เพิ่มต้นทุนโดยยังไม่ช่วยให้คำสั่งแรกสำเร็จ

**2. ข้อเท็จจริงจากซอร์ส และ delta ที่ต้องทำ**

ฐาน installed upstream ที่อ่านจริงคือ:

`USER_HOME/AppData/Local/SUD-D/coding-engines/serena/1.7.0/uv-tools/serena-agent/Lib/site-packages`

ต่อไปใช้ `U/` แทนฐานนี้ ทั้งหมดเป็นการอ่าน source ไม่ใช่การตรวจ logs หรือรัน package

| หลักฐาน | ข้อเท็จจริง | ผลต่อการออกแบบ |
|---|---|---|
| [Manifest:787](REPO_ROOT/packages/infrastructure/src/serena-engine-manifest.ts:787) | pin 1.7.0, commit/wheel hash และ 22 expected tools | expected manifest ไม่เท่ากับ product exposure หรือ installed-byte attestation |
| [Runtime:105](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:105), mapping:216/278 | มี semantic read/write mapping 9 ตัว | ต้องเพิ่ม bridge ใหม่; ห้ามเสียบ live client เข้า C1 |
| [Gateway:297](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:297), registration:367 | production ประกอบ Workspace/Git/code/verify/runner-discovery/work-memory/team | ไม่มี production Serena shell capability |
| [Runtime:376](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:376) | ตรวจ expected tool schemas; extra discovered tools ไม่ถูกเพิ่มเข้าชุด validated โดยอัตโนมัติ | reuse schema validation ได้ แต่ไม่ใช้ discovery เป็น permission |
| [C1:78](REPO_ROOT/packages/application/src/serena-permission-bridge.ts:78), :167/:304 | fake-only, same-process identity และทิ้ง upstream response | C1 เป็น inert evidence; ไม่ใช่ production admission/result parser |
| [Approval:85](REPO_ROOT/packages/application/src/approval-service.ts:85) | Full Access auto-approve ได้เฉพาะเงื่อนไขที่เข้าเกณฑ์; `sensitive` ไม่เข้าเกณฑ์ | shell ใหม่ต้อง manual-only และตรวจ `decisionSource:user` เพิ่ม |
| [Approval:187](REPO_ROOT/packages/application/src/approval-service.ts:187), [Repository:263](REPO_ROOT/packages/infrastructure/src/approval-repository.ts:263) | มี consume approved record | reuse coordinator/repository; ไม่สร้าง Approval ซ้ำ |
| [DB:58](REPO_ROOT/packages/infrastructure/src/database.ts:58), [DTO:300](REPO_ROOT/packages/contracts/src/index.ts:300) | เก็บ digest/title/resourceLabel; ไม่มี Solo Expert review snapshot ครบ | ต้องมี safe projection ที่ Desktop อ่านได้และผูกกับ digest |
| [Resume guard:10](REPO_ROOT/packages/application/src/work-resume-guard.ts:10), :63 | ใช้รายชื่อ capability คงที่ | tool ใหม่ต้องถูก guard โดยชัดแจ้ง ไม่อาศัยข้อความ MCP instructions |
| [Kernel:200](REPO_ROOT/packages/application/src/tool-kernel.ts:200), :377 | Policy ก่อน Execution และ audit precondition ล้มเหลวแล้ว block | bridge ต้องอยู่ในเส้นทางเดิมทุก invocation |
| [Policy:25](REPO_ROOT/packages/domain/src/policy.ts:25) | outside/internal-root/network denied; execute ask | ห้ามใช้ B เป็น blanket permission หรือเปลี่ยน context เพื่อหลบ DENY |

**22 tools ใน expected manifest และ implementation ที่พบ**

| กลุ่ม | Tools | แหล่ง implementation |
|---|---|---|
| อ่านไฟล์ | `read_file`, `list_dir`, `find_file`, `search_for_pattern` | `U/serena/tools/file_tools.py:26,94,135,543` |
| แก้ไฟล์ | `create_text_file`, `replace_content`, `replace_in_files` | `file_tools.py:58,173,218` |
| อ่าน symbols | `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `find_implementations`, `find_declaration`, `get_diagnostics_for_file` | `symbol_tools.py:36,134,252,342,399,482` |
| แก้ symbols | `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`, `rename_symbol`, `safe_delete_symbol` | `symbol_tools.py:585,618,644,670,698` |
| config/instructions | `activate_project`, `get_current_config`, `initial_instructions` | `config_tools.py:22,57`; `workflow_tools.py:32` |
| shell | `execute_shell_command` | `cmd_tools.py:11`; `util/shell.py:16` |

SUD-D เปิด managed mapping เพียง `code.overview/find_symbol/find_references/search/diagnostics/replace_symbol/insert_before/insert_after/rename` ส่วน Workspace file tools ของ SUD-D มีเส้นทางของตนอยู่แล้ว จึงไม่จำเป็นต้องเปิด Serena file tools ซ้ำเพื่อพิสูจน์ shell slice

ไม่มี `process_start/status/logs/stop` ใน expected manifest นี้ และไม่มีหลักฐาน managed implementation ที่ให้ owned durable job contract แบบ Serena_Home_New การมีชื่อ `safe_delete_symbol` หมายถึงตรวจ references ไม่ได้พิสูจน์ recoverable deletion ของ SUD-D

**Registry แบบ generic แต่ controlled ทำได้:** ใช้ descriptor ที่ backend ตรวจแล้ว ได้แก่ logical action, upstream mapping/schema hash, validator, effect/risk resolver, safe-review projector, result parser และ lifecycle class เพิ่ม descriptor ได้โดยไม่ hardcode handler ใหม่ทุก tool แต่แต่ละ invocation ยังต้องผ่าน validation → trusted Workspace/resume → Policy → manual grant → audit → dispatch

ความเสี่ยงคำนวณจาก descriptor และ request ที่ตรวจแล้ว โดยยกระดับได้เมื่อพบ network/write/delete/secret/long-job scope ไม่ให้ caller หรือ upstream `readOnlyHint` ลดระดับเอง สำหรับ shell ไม่สามารถสรุปผลทั้งหมดของสคริปต์จากชื่อคำสั่งได้ ต้องแสดงทั้ง “ผลที่คาดหมาย” และ “ambient host capability ที่ยังควบคุมไม่ได้” Unknown tool/schema/effect ต้อง DENY ไม่ใช่ passthrough

**3. A ต้องแก้ตรงไหน และ B ยอมรับอะไร**

หลักฐาน privacy ของ stock Serena:

- `U/serena/mcp.py:97–101` เรียก `apply_ex(log_call=True, catch_exceptions=False)`
- `U/serena/tools/tools_base.py:269–279` log arguments; :404–410 log exception/traceback และ result
- `U/serena/cli.py:338–353` ตั้ง memory, stderr และ file handlers ก่อนสร้าง agent
- `U/serena/util/exception.py:43–50` log/print fatal exception
- `U/mcp/server/fastmcp/tools/base.py:99–117` ใส่ exception text ใน ToolError
- `U/serena/mcp.py:383–384` log initial instructions ด้วย

A จึงต้องป้องกัน **ก่อนข้อมูลถึง sinks** การ redact response ฝั่ง SUD-D หรือปรับ INFO เป็น WARNING อย่างเดียวไม่พอ

Seam ที่พอใช้เป็นฐานคือ `make_mcp_tool` ที่ `mcp.py:277`, `_set_mcp_tools:294`, `_create_serena_agent:309` และ startup/config ที่ :353 แต่มี private members และ logging ภายใน engine/dependencies จึงยังไม่พิสูจน์ว่า subclass wrapper เล็ก ๆ ครอบคลุมทั้งหมดได้ ทางที่ตรวจสอบได้ควรเป็น repo-owned/versioned launcher พร้อม wrapper หรือ minimal overlay ที่กำหนดขอบเขต privacy ชัดเจน ไม่แก้ installed vendor สด

A น่าจะกระทบ launcher/overlay ใหม่, `serena-managed-runtime.ts`, managed config, manifest/provisioner และ focused privacy tests นอกเหนือจาก admission/UI ที่ทั้งสองทางต้องทำ การเปลี่ยน upstream version ยังไม่มีหลักฐานว่าจะแก้ปัญหา ห้ามถือเป็นทางลัดที่พิสูจน์แล้ว

**Provenance gap ใช้กับทั้ง A และ B:** [Provisioner:111](REPO_ROOT/packages/infrastructure/src/serena-engine-provisioner.ts:111) ตรวจ executable ด้วย version output และ :133 install ด้วย package version ไม่ได้บังคับ wheel hash จาก manifest ดังนั้น version/schema ตรงยังไม่ยืนยัน installed bytes หรือ dependency identity ต้องมี reviewed artifact receipt ที่ครอบคลุม launcher/package/config/schema และตัวแก้ adaptation หากมี ไม่อ้างว่า same-user hash receipt เป็น protected A1 attestation

B สามารถยอมรับ local arguments/results/errors logging ของ non-secret owner data และสิทธิ์ ambient ของ host-user subprocess ได้ **หลัง Owner เปลี่ยน acceptance contract อย่างชัดเจน** แต่ต้องรักษา SUD-D credential serialization invariants และ direct DENY เดิม

| ขอบเขต | แนวทาง B แรก |
|---|---|
| งานสั้นใน owned Workspace ไม่มี credential/provider | เปิดได้หลัง admission และ physical proof |
| source/result ที่เข้า upstream local logs | Owner รับความเสี่ยงได้อย่างเจาะจง |
| Script/dependency ใช้สิทธิ์ Windows user และอาจทำสิ่งนอกคำอธิบาย | ต้องเปิดเผยและรับ residual risk; ไม่เรียกว่า containment |
| Network/API/provider/spend ที่ตั้งใจใช้ | แยก opt-in และ approved capability; ยังไม่อยู่ใน slice แรก |
| secret-bearing command/env/output, credential-store access | ยัง unavailable จนมี safe secret path; disclosure ไม่ลบข้อห้าม plaintext |
| Delete/destructive/system/admin/install | ปิดใน slice แรก; Recovery/Policy requirements ยังอยู่ |
| arbitrary cwd/internal-root/outside-workspace target | DENY ที่ entry |
| daemon/detached child/ComfyUI start/long render | unavailable จนมี lifecycle evidence |
| unknown effects หรือ artifact drift | fail closed |

**ความขัดแย้งที่ Owner ต้องตัดสิน:** หากยัง要求ว่า shell descendants ต้องถูกบังคับให้อยู่ใน Workspace และห้าม network จริง B แบบ stock host-user shell ทำไม่ได้ ส่วน A ที่แก้ privacy อย่างเดียวก็ทำไม่ได้เช่นกัน ต้องแยกงาน OS isolation ต่างหาก ไม่ควรแสดง checkbox ที่ทำให้ผู้ใช้เข้าใจว่าข้อจำกัดเหล่านั้นมีแล้ว

B จึงเหมาะกับการอนุมัติ **cooperative mode ใหม่** โดยคง direct tool boundaries และ default Restricted เดิม ไม่ใช่เปิด arbitrary shell แล้วกล่าวว่า security invariants เดิมยังรับประกันครบ

**4. Grants, privacy และ process lifecycle**

**Per-call เป็นค่าเริ่มต้นที่ต้นทุนต่ำสุด**

Backend สร้าง immutable snapshot แล้ว Desktop แสดง safe projection ของ snapshot เดียวกัน:

- logical action และ command/arguments ที่ไม่เป็น secret; แสดง expected shell semantics ด้วย
- canonical Workspace/root/generation, project, MCP session และ runtime epoch
- trusted device/account label และ provenance source; ปัจจุบัน `ClientSession` มีเพียง id/type ไม่ใช่ account attestation — ต้องไม่เติมชื่อที่ caller ส่งมาแล้วเรียกว่า trusted
- registry/schema/runtime/config/privacy-profile identity และ reviewed script/dependency evidence
- expected writes, network/API/spend scope, logging sensitivity และ script descendants
- attempt ID, expiry, max calls, wait/output budget และ stop limitations

Renderer เลือกอนุมัติ/ปฏิเสธด้วย request ID เท่านั้น ไม่กำหนด executable/argv/cwd/env Backend ตรวจ exact binding กับ consumed user-sourced Approval ก่อน reserve/dispatch และ recheck Workspace/epoch/artifact/grant หลัง await ที่เกี่ยวข้อง

หมดอายุ เปลี่ยน Workspace/runtime/config/script หรือ revoke แล้วต้อง re-review lost reply/timeout เป็น `UNKNOWN` และห้าม retry attempt เดิม การ consume ก่อน dispatch ให้ “ส่งได้ไม่เกินหนึ่งครั้ง” ไม่ใช่ durable exactly-once effect; crash หลัง consume อาจทำให้ไม่ได้ส่งเลย

**Per-session เป็นระยะถัดไป:** manual root grant ต้องระบุ finite action profiles, parameter bounds, Workspace/device/session/epoch, expiry, call/retry/write/spend budgets และ privacy risk version ทุก call ยังต้องตรวจ scope/remaining budget และ audit ไม่อนุญาต wildcard shell หรือสืบทอด Full Access โดยอัตโนมัติ ปัจจุบัน coordinator ยังไม่ใช่ session-grant ledger จึงห้ามสร้าง record ที่แกล้งอ้างว่าแต่ละ call เป็นการกดอนุมัติของคน

**Revocation หลัง launch:** ป้องกัน admission ครั้งต่อไปได้ ส่วนงานที่เริ่มแล้วเป็น “ขอหยุด” เท่านั้น ไม่ถอนผลที่เกิดแล้ว ไม่รับประกันหยุด descendants/network/API และไม่คืนเครดิต ถ้าไม่มีหลักฐาน terminal/cleanup ต้องแสดง `UNKNOWN — อาจยังทำงานอยู่` ไม่ใช่ `Stopped`

**Logs และ telemetry**

ตาม `U/serena/config/serena_config.py:63,126–134` managed log ที่คาดหมายคือ:

`<dataRoot>/coding-engines/serena/state/1.7.0/<SHA256(lowercase canonicalRoot)>/home/logs/<YYYY-MM-DD>/mcp_<datetime-tag>_<pid>.txt`

การสร้าง root นี้อ้างอิง [Runtime paths:24](REPO_ROOT/packages/infrastructure/src/serena-runtime-paths.ts:24) หาก `SERENA_HOME` ไม่ถูกตั้ง upstream fallback เป็น `~/.serena` ยังมี memory queue/buffer ที่ `U/serena/util/logging.py:26–68` และ stderr ที่ host client อาจรับไว้ ปิด dashboard ไม่ได้ปิด sinks เหล่านี้ งานนี้ไม่ได้อ่าน log และไม่ได้พิสูจน์ว่า stderr ถูกเก็บเป็นไฟล์ใด

Owner ควรเลือกการเก็บไว้เพื่อตรวจปัญหา หรือการลบเฉพาะ log ของ session ที่ปิดแล้วด้วยช่วง retention ที่กำหนดไว้ การลบอัตโนมัติยังไม่พบหลักฐานในเส้นทางที่ตรวจ และไม่รับประกันลบ backup/client copies หรือ secure erasure ไม่ต้องสร้าง log-management subsystem ก่อนคำสั่งแรก แต่ต้องแจ้งตำแหน่งและ retention truth ก่อนอนุมัติ

SUD-D approval/audit ควรเก็บ IDs, safe profile label, keyed binding digest, risk/disclosure version และ outcome code ไม่เก็บ raw command payload ที่อาจเป็น secret, stdout/stderr, traceback หรือ upstream error text คำสั่งแรกแสดง command ได้เพราะเป็น non-secret template ที่ backend สร้าง หากปิดบัง arguments แล้วตรวจผลที่แท้จริงไม่ได้ ให้ block แทนข้อความอนุมัติที่คลุมเครือ

`U/serena/agent.py:724–737` usage request ส่ง OS/dashboard/version/backend/context **ไม่พบ command/output ใน payload นี้** จึงไม่ใช่หลักฐาน command exfiltration หรือเหตุการณ์ leak จริง การตั้ง `SERENA_USAGE_REPORTING=false` ก่อน startup ปิดเส้นทางนี้ได้ตาม source แต่ยังไม่ใช่ network sandbox

`CHAR_COUNT` เป็น default จริงที่ `serena_config.py:895`; ไม่ควรกล่าวว่า config ปัจจุบันใช้ Anthropic estimator อย่างไรก็ตามควร pin ค่าให้ชัด เพราะ `analytics.py:26–40` มี tokenizer download path และ :54–69 มี dotenv/API estimator path

[Launch plan:342](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:342) ยังไม่ตั้ง usage-reporting flag และ SDK ที่ติดตั้งจริง `packages/infrastructure/node_modules/@modelcontextprotocol/client/dist/stdio.mjs:68–72` merge default environment เข้ากับ supplied env จึงต้องตรวจ effective environment ไม่ถือว่า `plan.env` คือทั้งหมด Startup ยังรวม config/cache/state writes, Python/LSP และ health probes; การ start/repair ที่ provisioner อาจ install ต้องไม่เกิดอัตโนมัติจาก shell grant

**Process limitation ที่ชี้ขาด**

`U/serena/util/shell.py:28–42` ใช้ `Popen(shell=True)` แล้ว `communicate()` ไม่มี process timeout ในฟังก์ชันนี้; `cmd_tools.py:41` ยอมรับ absolute cwd และ :50–52 จำกัดคำตอบหลังเก็บผลแล้ว `max_answer_chars` จึงไม่ใช่ hard output/memory cap

`U/serena/task_executor.py:80–107` ระบุว่า cancel future หลังเริ่มงานแล้ว thread ยังทำต่อได้ ส่วน managed cleanup ใช้ PID tree snapshot/CIM/taskkill ที่ [Runtime:520](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:520) ไม่ใช่หลักฐาน stable process identity หรือ Windows Job containment

ดังนั้น stock shell เหมาะเป็น candidate สำหรับ **reviewed short terminating commands** ไม่เหมาะเป็นฐาน long render/daemon ที่ต้อง durable status/logs/stop ทั้ง upstream doc ที่ `cmd_tools.py:26–28` ก็เตือนเรื่องนี้

เมื่อพบ long-job จริง ควรเติมเฉพาะ execution/lifecycle seam ที่ขาดให้ Serena หรือ reuse supervisor seam ที่มีหลักฐาน ไม่สร้าง Policy/Approval/agent loop ซ้ำ สำหรับ ComfyUI ที่เปิดอยู่ภายนอก SUD-D ให้ติดตาม workflow/job ID ผ่านบริการที่ได้รับอนุมัติ ไม่ถือว่า process เป็น owned child และไม่ kill shared server ด้วย PID ห้ามนำ native/A1 synthetic evidence มาใช้รับรอง lifecycle ใหม่

**5. Fast Closure ที่วัดได้**

| ขั้น | ผลที่ต้องได้ | เกณฑ์จบ |
|---|---|---|
| B0 — private code-only | registry/admission/result parser ผ่าน fake transport | negative cases ไม่ dispatch; valid case ส่งหนึ่งครั้ง; ไม่มี production exposure |
| B1 — production code-only | exact Approval projection/persistence, Gateway/managed mapping, resume/startup/revoke | ข้าม process ด้วย request ID ได้; drift/replay/mode/audit failure block; live default OFF |
| B2 — Owner-reviewed physical smoke | stock managed Serena เรียก harmless one-shot จริงใน owned Workspace | approved snapshot → one dispatch → exit code/known marker/audit ตรง; timeout เป็น UNKNOWN; STOP |
| B3 — development Workspace | profile เช่น reviewed `typecheck` หรือ focused test ผ่าน Serena | expected script/root/identity ตรง, typed exit/result และ owner-visible evidence; ไม่มี install/provider |
| B4 — long-job support เมื่อจำเป็น | durable job/status/log cursor/stop ที่ตรงกับ executor จริง | owned lifecycle หรือ external-service semantics ที่ตรวจแล้ว |
| B5 — TGNK fresh project | Topic→Script→Audio→Images→Video→QC→Final MP4 | fresh run attribution, legitimate human/provider gates, hash/probe/full decode และ Owner creative acceptance |

B0 ไม่ต้องหยุดอยู่ที่ echo: ใช้สอง descriptors ใน fake tests ได้แก่ harmless smoke และ development-script profile เพื่อพิสูจน์การเพิ่ม action โดยไม่เพิ่ม authority แต่ B2 เปิดเพียง harmless profile ก่อน แล้ว B3 จึงอนุมัติ script จริง

สำหรับ B3 backend resolve คำสั่งจาก reviewed project profile และ pinned package-manager/script identity ไม่รับ raw command จาก renderer; ตรวจ script/hash ก่อน dispatch การตรวจ hash ไม่ใช่ sandbox หรือคำรับประกัน dependency behavior ผลแรกอาจคืน exit code/typed summary เท่านั้น หากต้องให้ AI อ่าน diagnostics ต้องมี parser/projection ที่ตรวจแล้ว ไม่ส่ง raw logs กลับโดยอ้างว่า regex ลบ secret ได้แน่นอน

**เหตุที่ B1 ต้องเป็นแพตช์ที่สอง:** ต้องเชื่อม `approval-service`/repository/DB, safe contracts, Desktop Approval controller/Activity, Gateway, resume guard และ managed launch/mapping มีข้อมูลที่ต้องอยู่ข้าม process จึงไม่สามารถปิดงานทั้งหมดใน adapter สามไฟล์ได้ การใช้ safe projection table คู่กับ existing approval record เป็นทางเลือกที่หลีกเลี่ยงสร้าง Approval engine ใหม่ แต่ต้องให้ transaction/digest/expiry ตรงกัน

ยังไม่กำหนด allowlist B1 แบบกว้างล่วงหน้า และไม่อนุมัติยี่สิบไฟล์จากรายงานนี้ ต้องใช้ B0 interface/closeout ที่ตรวจแล้วจัดแพตช์ integration ที่แน่นอน

TGNK readiness ปัจจุบันเป็น **unknown จากงานนี้** แผน C1:20 บันทึก prior source inspection ว่ามี `production:run`/Factory Runner แต่ fresh autonomous path ยัง policy-gated ไม่ใช่ runtime proof และ Final MP4 เก่าหรือ imported-audio resume ไม่ผ่านเกณฑ์ใหม่ ไม่มีฐานให้ระบุ E2E ETA เป็นวัน

**6. ข้อความอนุมัติที่เสนอให้ Owner พิจารณา**

> เลือก B เป็นโหมด Solo Expert แบบเปิดเอง สำหรับ Workspace ของผมบนเครื่องที่ระบุ โดยเริ่มจากการอนุมัติรายคำขอ ผมรับทราบว่า stock Serena อาจบันทึก arguments/results/errors ลงไฟล์ หน่วยความจำ และ stderr และ subprocess ใช้สิทธิ์ Windows user ซึ่งไม่ได้ถูก sandbox ให้อยู่ใน Workspace หรือห้าม network การถอนสิทธิ์ป้องกันคำขอใหม่ได้ แต่ไม่รับประกันหยุดงานลูกที่เริ่มแล้ว\
>\
> ยอมรับ residual risk นี้เฉพาะขอบเขตที่แสดงในแต่ละคำขอ โดย default Restricted และ direct DENY เดิมคงอยู่ งาน secret/provider/network/spend/destructive/admin/long-job ต้องมี scope และหลักฐานแยกต่างหาก การเลือกนี้ไม่อนุมัติ physical execution และไม่แทน A1 protected independent Owner Consent

ข้อความนี้เป็น **risk-model decision** ไม่ใช่ launch grant ส่วน physical grant ภายหลังต้องระบุ command จริง, runtime artifacts/config, device/account, Workspace, startup writes/logs, จำนวนครั้ง และ outcome limits

**A ในรายงานนี้หมายถึง privacy adaptation; “A1 Option A” หมายถึง protected independent consent คนละเรื่องกัน** ทั้ง A และ B ยังไม่ได้แก้ A1 trust anchor การกด Approve ใน Desktop บน user เดียวกันเป็น cooperative authorization ไม่ใช่หลักฐาน independent protected human transaction

**7. ข้อเสนอส่งต่อ Serena CODE-ONLY — แยกจากรายงานตัดสินใจ**

ข้อความส่วนนี้เป็น **mission proposal ที่ยังไม่อนุมัติ** ผู้รับหลัง Advisor review และ Owner เลือก B พร้อมอนุมัติ scope คือ **Serena Implementation ในแชตแยก บนเครื่องที่มี repository working copy นี้**

> **Mission: SOLO-EXPERT-B0 — Private reviewed Serena bridge, fake transport only**
>
> **Role isolation:** ใช้ Serena และ project checks ที่ Owner อนุมัติเท่านั้น ห้าม Codex CLI/`codex exec`/Codex MCP/agent, agents/delegates และ Remote Commander ทุกกรณี Design gap ส่งกลับ ChatGPT Project Advisor แล้ว STOP
>
> **Outcome:** โมดูล private ที่พิสูจน์ controlled registry, exact manual per-call admission และ typed stock-shell response handling ผ่าน in-memory fakes ไม่เปิด production และไม่ start Serena
>
> **Risk Level:** Security / Data Critical\
> **Required Skill(s):** โหลด repo-local `tdd` และ `codebase-design` ก่อนงานที่เกี่ยวข้อง; router ตาม AGENTS ไม่ใช้ skill เพื่อขยาย authority
>
> **Bootstrap:** ตรวจ Git/active docs และเก็บ task-start inventory/hash ของ dirty/untracked source ที่มีอยู่ ห้าม stage/revert/reformat งานเดิม ตรวจว่าทั้งสาม path ด้านล่างยังไม่มี ถ้ามีแล้ว STOP แทน overwrite

**Exact phased writable allowlist**

| Phase ภายใน mission เดียว | เขียนได้ |
|---|---|
| P0 — pure registry/snapshot/admission | NEW `packages/application/src/solo-expert-serena-bridge.ts` และ NEW `packages/tests/src/solo-expert-serena-bridge.test.ts` |
| P1 — fake transport mapping/parser | เพิ่ม NEW `packages/infrastructure/src/solo-expert-serena-adapter.ts`; ปรับสองไฟล์ P0 ได้ |
| Delivery | ignored `.serena/reports/solo-expert-b-code-only-closeout-20261014.md` เท่านั้น |

ทั้งสาม source/test paths ตรวจแล้วว่า **ยังไม่มี ณ การตรวจนี้** ห้าม barrel exports, package/lockfile/config/docs edits, installed package edits หรือ production composition changes

> **Binding contract**
>
> 1. Descriptor registry มี logical action/schema/registry/privacy identity, strict bounded params และ risk resolver สอง test-only actions: harmless smoke กับ reviewed development-script template ทุก request ยัง `sensitive/execute/manual-only`
> 2. Caller ไม่กำหนด raw upstream tool/command/cwd/env/argv Backend test composition resolve profile; unknown/extra keys, prototypes/accessors และ schema/effect drift block
> 3. Trusted in-memory composition ให้ Workspace/root/generation, resume state, session, device/account labels พร้อมระดับ provenance, runtime epoch และ reviewed artifact/config identity ไม่รับ authority fields จาก invocation
> 4. ใช้ existing Tool Kernel/Policy/Approval coordinator ผ่าน isolated registry และ in-memory repository/audit fakes ไม่สร้าง Approval หรือ DB ใหม่ ตรวจ exact consumed user-sourced binding กับ request/session/runtime และ expiry
> 5. Recheck freshness/revocation ก่อน dispatch; reserve synchronously ก่อน await ส่งครั้งเดียว; timeout/lost reply/exception เป็น UNKNOWN และ quarantine attempt ไม่ retry
> 6. Adapter รับ injected fake transport เท่านั้น ไม่มี default live constructor, process imports, startup/provision/repair หรือ installed Serena import โครงสร้าง dependency ไม่ให้ infrastructure import application
> 7. Map เฉพาะ reviewed `execute_shell_command` schema Parse MCP `isError` และ shell JSON `{return_code,stdout,stderr,cwd}` อย่าง strict; exit nonzero เป็น command failure แม้ MCP `isError:false`
> 8. Safe result แยก simulated success/command failure/blocked/unknown พร้อม exit metadata ที่ตรวจแล้ว ทิ้ง raw output/error/cwd ที่ไม่ตรง snapshot ผลลัพธ์ทุกกรณีระบุ `executionKind:mock` ไม่อ้าง physical success
> 9. Logging risk เป็น disclosure field `stock-local-logging`; ไม่ pretend ว่า adapter redact upstream logs หรือควบคุม descendants/network ได้
> 10. ทดสอบ startup-plan receipt แบบข้อมูล inert ได้ แต่ห้ามสร้างหรือเปิด runtime จริง และห้ามแก้ C1

**TDD/negative proof ที่ต้องมี**

- ไม่มี/manual-denied/expired/mode-sourced Approval, wrong digest/request/session/Workspace/root/epoch/device identity หรือ no resume → fake dispatch **0**
- unknown tool/schema/risk, caller authority injection, script/config/artifact drift และ revoked grant → **0**
- valid consumed manual request → **1**; concurrent/replay/lost reply → ไม่เพิ่ม dispatch
- audit precondition failure → **0**; outcome-audit failure ไม่รายงาน clean success หรือ retry
- MCP error, malformed/truncated response, nonzero exit, cwd mismatch, timeout และ thrown exception แปลสถานะถูกต้อง
- synthetic poison strings ไม่ปรากฏใน safe review/result/audit/error; ไม่อ่าน credential จริง
- เพิ่ม descriptor ที่สองได้โดยใช้เส้นทาง admission เดิม และไม่ได้เปิด wildcard authority

> **Verification Plan:** รันเฉพาะ pure focused suite ของไฟล์ใหม่, scoped ESLint, Application/Infrastructure TypeScript `--noEmit --incremental false` และ `git diff --check` ใช้ installed tooling เท่านั้น ไม่ใช้ root `pnpm test` ซึ่งมี build ก่อน test ไม่เรียก managed-runtime acceptance/spike หรือ Electron
>
> ตัวอย่าง focused commands หลังได้รับอนุมัติ mission:
>
> ```text
> pnpm exec vitest run packages/tests/src/solo-expert-serena-bridge.test.ts --reporter=dot
> pnpm exec eslint packages/application/src/solo-expert-serena-bridge.ts packages/infrastructure/src/solo-expert-serena-adapter.ts packages/tests/src/solo-expert-serena-bridge.test.ts --max-warnings 0
> pnpm exec tsc --project packages/application/tsconfig.json --noEmit --incremental false
> pnpm exec tsc --project packages/infrastructure/tsconfig.json --noEmit --incremental false
> git diff --check
> ```
>
> แยก task-start diagnostics จาก introduced failures หาก type evidence ไม่ครอบคลุมไฟล์ใหม่ให้รายงาน inconclusive ไม่แก้ protected config หรืออ้าง PASS เกินขอบเขต Historical global TypeScript สี่ข้อไม่ใช่งานซ่อมของ mission นี้
>
> **Continuous repair:** ไม่เกินสามรอบต่อ diagnosed root cause ภายใน allowlist ไม่มี routine intermediate Owner handoff
>
> **STOP CONDITION:** จบเมื่อ focused proof และ closeout ครบ หรือทันทีที่ต้องแก้ protected source/contract, ต้องมี unresolved design decision, safe tooling ขาด หรือครบ repair limit ห้าม production registration, SQLite/product runtime, shell workload, test subprocess fixture, build/install/native/OS, provider/network/secret, TGNK, Team, Git write/commit/push ไม่มี B1/B2 authority ต่อท้าย
>
> **Closeout:** หนึ่งรายงานพร้อม changed paths/hashes, RED→GREEN/commands/exit codes, type limitations, task-start/final preservation evidence และข้อความ:
>
> `PRIVATE MOCK ONLY; NO PRODUCTION SHELL, PHYSICAL EXECUTION, FINAL MP4 OR A1 AUTHORITY.`
>
> Owner ส่ง closeout path กลับ ChatGPT Project Advisor เพื่อ review แล้ว Serena STOP

**8. ขอบเขตหลักฐานและลำดับถัดไป**

C1 21/21 และ global TypeScript failures สี่ข้อเป็น **หลักฐานเดิมจากเอกสาร acceptance** ไม่ได้รันใหม่ในงานนี้ C2a-P0 NO-GO ไม่ใช่ความล้มเหลวที่ต้องทำซ้ำ และไม่มี live/privacy/lifecycle/MP4 PASS ใหม่

ตรวจ installed source bytes แบบอ่านอย่างเดียว ได้ SHA-256:

```text
serena/mcp.py              de30cf112ee6fbcc68691716ee0b4b53ce5846ae1ca1e49aa0fe02bb1c31c0e0
serena/tools/tools_base.py c6547239c9bba58a761add6f9871fe3ca8d97a6043a2013e3476873cf919e2c5
serena/cli.py              1620577816b52632f611983d6d2044f228c049b6c8d931ef20b54cd1e113081a
serena/agent.py            54cd183eab556833b3756f8ae6207891e17d02d64b76c8754fa37de7fdb0bd5b
serena/util/shell.py       1cf0279a4075643eed6c1313ec34a4e4f8b9e8538e203dcfce2b984a5ef28628
```

นี่เป็น source identity สำหรับทำซ้ำการตรวจ ไม่ใช่ attestation ของ installed dependency graph หรือ host integrity ตรวจ Git ตอนจบ: `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged paths ว่าง รายการ dirty/untracked ที่เห็นตรงกับตอนเริ่ม ไม่มี write จากงานนี้ แต่ไม่ได้ทำ full byte inventory ของงานเดิมทั้งหมด

**สถานะ: DESIGN COMPLETE; A/B implementation และ physical execution ยังไม่อนุมัติ**

**ลำดับถัดไป:** ChatGPT Project Advisor ตรวจ final CLI payload นี้ซึ่ง host จะจับเก็บตาม assignment ที่ `.serena/reports/serena-first-solo-risk-model-codex-design-20261014.md` จากนั้น Product Owner เลือก risk model และอนุมัติ B0 mission แยก หากเลือก B ให้ส่ง **ส่วน 7 ทั้งก้อน** ไป Serena Implementation ในแชตแยก ห้ามส่งรายงานนี้เป็น blanket execution permission

**STOP — ไม่มีการดำเนินงานต่อจากรายงานนี้**