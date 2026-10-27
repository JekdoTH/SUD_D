> Portable source-grounded Codex B1b-G2 READ-ONLY design, accepted with bounded caveats by Advisor. Machine-specific prefixes converted to REPO_ROOT and USER_HOME. Source-path anchors are references, not guaranteed clickable links. Neither build nor source modification permission is granted by this file.

**ข้อเสนอ: ทำ B1b-G2a แบบ source/fake จำนวน 8 paths ก่อน แล้วแยก G2b สำหรับ generated artifacts โดยขอสิทธิ์ใหม่ต่างหาก ส่วน B2 ยัง HARD STOP**

รายงานนี้เป็นผล DESIGN แบบ read-only เท่านั้น ไม่ใช่การอนุมัติ implementation/build/คำสั่งจริง ผมไม่ได้เรียก Serena, subagent, Remote Desktop Commander, Team หรือเริ่มผลิตภัณฑ์ ทดสอบ build หรือ network และไม่ได้เขียนไฟล์ใด รายงานฉบับสมบูรณ์ส่งผ่านคำตอบนี้ตามข้อกำหนดให้ capture final output

**คำแนะนำสำหรับ Owner — หนึ่งหน้า**

R3 Gate 0 compiled Contracts และ Gate 1 source/fake Desktop ยังคงเป็นฐานที่ยอมรับแล้ว ไม่ควรทำใหม่ ส่วน 75/75 เป็นหลักฐานที่ Advisor บันทึกไว้ ผมไม่ได้รันทดสอบซ้ำในงานนี้

G2a ควรปิดช่องว่างที่พิสูจน์ได้โดยไม่ต้องมี live Serena ได้แก่ **MCP tool registration/default-OFF, Workspace Resume ที่ใช้ DB generation จริง และเส้นทาง MCP → Kernel → manual Approval → durable claim → fake adapter → Audit** การผ่าน G2a ให้สถานะได้เพียง `SOURCE/FAKE GATEWAY ACCEPTED; LIVE NOT_READY`

หลักฐานใน source ไม่รองรับการนำ `ActiveSession` ปัจจุบันมายืนยัน provenance ของ live process: ไม่มี verified provisioning receipt, installed-byte inventory หรือ managed epoch ที่ผูกกับ session ทั้งยังไม่มี cross-process registry สำหรับรับช่วง session จาก process อื่น การเติม digest จาก fixture หรือ hash ไฟล์ปัจจุบันจึงไม่ทำให้เป็น trusted live attestation

เสนอให้ Owner พิจารณาสิทธิ์สองชุดแยกกัน:

| ชุดสิทธิ์ที่เสนอ | ขอบเขต | ผลที่อนุญาตให้กล่าวอ้าง |
|---|---|---|
| **G2a — แนะนำเป็นงานถัดไป** | 4 source + 4 test paths; generated artifacts **0**; test-owned TEMP และ closeout หนึ่งไฟล์ | MCP registration/Resume/Approval/ledger ผ่านด้วย fake execution |
| **G2b — ยังไม่เริ่ม** | compiler closure ที่กำหนดด้านล่าง สูงสุด **448 artifacts**; ไม่มี source edits หรือ Desktop build | parity ของ package graph ที่กำหนด หลังตรวจ actual compiled imports |
| **B2 — ยังไม่อนุมัติ** | ต้องมี scope ใหม่สำหรับ runtime ownership/provenance, Desktop/runtime artifacts และหนึ่งคำสั่งจริง | หลักฐาน physical invocation เฉพาะคำสั่งที่ได้รับอนุญาต |

**Risk Level: Security / Data Critical.** G2a ใช้ RED→GREEN และ regression 75 กรณีเดิม พร้อม MCP list/call, SQLite/coordinator/restart, generation away/back, TTL/HMAC และ UNKNOWN tests จำกัดสาม repair cycles ต่อ root cause หยุดเมื่อจำเป็นต้องเพิ่ม path/authority, ใช้ live process, ลด security gate หรือพิสูจน์สิ่งที่อ้างไม่ได้

**Owner’s next action:** ให้ ChatGPT Project Advisor ตรวจรับแบบนี้ก่อน จากนั้น Owner จึงเลือกอนุมัติ **G2a ตาม 8 paths และศูนย์ generated artifacts** แล้วส่ง assignment ท้ายรายงานไปยัง **Serena Implementation ใน separate Serena Home New chat** ไม่ควรส่ง R3 ซ้ำ และไม่ควรอนุมัติ G2b/B2 รวมโดยปริยาย

---

**ข้อเท็จจริงที่ตรวจจาก source และผลต่อการออกแบบ**

| Source | ข้อเท็จจริง | ผลต่อ Gate 2 |
|---|---|---|
| [managed runtime:87](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:87) | `ActiveSession` เก็บ context, session, rootPid และ validated tool names ใน closure ของ runtime instance | ไม่มี installed-byte receipt, generation หรือ managed epoch ให้ ready-only reuse ตรวจ |
| [ready-only:107](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:107) | ตรวจเฉพาะ `soloExpertFixture` และรับ `integrity:'synthetic-fixture'` | ยังไม่อ่านหรือรับรอง production `active` |
| [startup:204](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:204) | เตรียม config → provision → connect → schema/config/LSP checks | เป็นเส้นทางที่มี write/process/tool calls ห้ามใช้จาก read/deny/list |
| [provisioner:111](REPO_ROOT/packages/infrastructure/src/serena-engine-provisioner.ts:111) | ตรวจ executable ด้วย `--version`; คืน executablePath/version | ไม่ใช่ verified installation receipt |
| [manifest:787](REPO_ROOT/packages/infrastructure/src/serena-engine-manifest.ts:787) | มี package/version/upstream/wheel SHA และ expected schemas | การประกาศ pin ยังไม่พิสูจน์ bytes ที่ติดตั้งหรือ process ที่กำลังรัน |
| [schema/config checks:441](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:441) | ตรวจ schemas จาก MCP; config ตรวจข้อความ version/project/LSP | ไม่ได้เก็บ canonical schema/config digest เป็น receipt ของ session |
| [Workspace repository:38](REPO_ROOT/packages/infrastructure/src/workspace-repository.ts:38) | มี DB-owned generation; selection เพิ่ม generation ใน transaction | ใช้ของเดิมได้ ไม่ต้องสร้าง timestamp generation ใหม่ |
| [Work Memory:55](REPO_ROOT/packages/application/src/work-memory-service.ts:55) | มี `requireResumedSolo` และ generation reader แบบ optional | โครงสร้างพร้อม แต่ production composition ยังไม่ส่ง reader |
| [Gateway:260](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:260) | สร้าง Work Memory ด้วย repository/gitSafety เท่านั้น | Solo generation admission ยังไม่ต่อเข้าของจริง |
| [Resume guard:10](REPO_ROOT/packages/application/src/work-resume-guard.ts:10) | รายชื่อ guarded capabilities ไม่มี `solo_expert.smoke` | ต้องเพิ่ม Solo-specific fail-closed branch |
| [Gateway:297](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:297) | registry และ registration ไม่มี Solo capability/tool | default OFF ปัจจุบันเป็นการไม่ลงทะเบียน ยังไม่มี opt-in proof |
| [R3 Gateway test:13](REPO_ROOT/packages/tests/src/solo-expert-serena-gateway.test.ts:13) | ใช้ Kernel/SQLite/coordinator โดยตรง ไม่มี MCP server/transport | 2/2 เดิมยังไม่พิสูจน์ production factory tool-list/call |

**Ownership และ ready-session reuse**

Production Gateway สร้าง managed runtime ของตัวเองที่ [workspace-file-server.ts:396](REPO_ROOT/packages/mcp-gateway/src/workspace-file-server.ts:396) และ session อยู่ใน closure ของ runtime นั้น ไม่มี source ที่แสดงว่า Serena connector, Desktop หรือ Gateway อีก process สามารถนำ session ของกันและกันมาใช้ได้ การมี connector พร้อมใช้งานจึงไม่ใช่หลักฐานว่า Gateway นี้มี managed session พร้อมใช้

`rootPid` มาจาก SDK transport ที่ [serena-managed-runtime.ts:550](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:550) เป็น transport PID ไม่ใช่ OS process identity ที่มี creation time/handle และไม่ได้รับรอง Python interpreter, imported package bytes หรือ descendants ทั้งหมด

เส้นทาง semantic read/write สามารถ lazy-start และเปลี่ยน Workspace แล้ว restart ได้ที่ [serena-managed-runtime.ts:169](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:169) จึงห้ามนำมาใช้เป็น fallback ของ Solo ready-only

Config paths ผูกกับ data root/version และ hash ของ lowercase canonical root ที่ [serena-runtime-paths.ts:19](REPO_ROOT/packages/infrastructure/src/serena-runtime-paths.ts:19) แต่ยังไม่ผูก generation การเตรียม config เขียนไฟล์จริงที่ [serena-managed-config.ts:34](REPO_ROOT/packages/infrastructure/src/serena-managed-config.ts:34) ดังนั้น inspection ต้องไม่เรียก preparation เพื่อสร้างหลักฐานให้ตัวเอง

**คำตัดสินเรื่อง attestation: HARD STOP สำหรับ live readiness ปัจจุบัน** ยังไม่มี verified provisioning receipt ให้ reuse อย่างปลอดภัยตามโจทย์ การ hash installed files แบบ read-only ในอนาคตพิสูจน์ได้เพียง bytes ณ เวลาตรวจ ไม่พิสูจน์ว่า process เดิมโหลด bytes เหล่านั้น และไม่มี independent same-user protection ตาม A1 ซึ่งยัง PAUSED/BLOCKED

ทางออกขั้นต่ำคือทำ G2a ให้ครบในระดับ fake อย่างซื่อสัตย์ แล้วใช้ design/permission ใหม่สำหรับ runtime owner ที่บันทึก provenance ตั้งแต่ authorized startup และ physical proof ภายหลัง ห้ามเปลี่ยน `synthetic-fixture` เป็นคำว่า verified เพื่อผ่าน Gate

---

**G2a: Interface และพฤติกรรมที่เสนอ**

ใช้ `createProductionMcpServer` เดิม เพิ่ม dependency สำหรับ **test-only synthetic opt-in** ที่รับได้จาก trusted composition เท่านั้น ไม่มี environment switch, renderer flag หรือ MCP argument ที่เปิด feature ได้ `createDefaultProductionMcpServer` ต้องไม่ส่ง dependency นี้และยังไม่ลงทะเบียน Solo

ใน opt-in test composition ให้ใช้ coordinator object เดียวกับที่ส่งเข้า Kernel ผ่าน `dependencies.approval` ตรวจ object identity ก่อนลงทะเบียน และใช้ Approval repository/attempt repository ของ test DB เดียวกัน ไม่รับ caller-supplied `approved`, `resumed`, HMAC, root หรือ generation

สร้าง bound MCP session ก่อนประกอบ Solo identity แล้ว reuse session object เดียวตลอด factory instance สร้าง Gateway epoch ใหม่ต่อ factory instance; managed epoch มาจาก fake receipt ที่ระบุว่า synthetic เท่านั้น

MCP tool ที่เสนอชื่อ `solo_expert.smoke`:

- ครั้งแรกรับ strict `{}` เพื่อเตรียม review ภายใน แล้วเรียก Kernel จนได้ `APPROVAL_REQUIRED`
- retry รับ strict `{attemptId: UUID}` เท่านั้น และดึง **review object เดิม** ผ่าน `getReview` ของ integration
- ปฏิเสธ command/tool/cwd/env/identity/approval flags/extra keys
- ส่งกลับเฉพาะ safe result, attemptId และ Approval request identifier ที่จำเป็น ไม่มี raw tool payload หรือ HMAC

การ retry หลัง human approval คือการขอให้ Kernel ตรวจ request เดิมอีกครั้ง ยังไม่มีการ dispatch fake tool ก่อน approval และไม่ใช่ execution retry หลัง claim

ใช้ integration เดิมที่มี WeakSet/frozen review, HMAC verification และ durable claim ตาม [solo-expert-serena-integration.ts:204](REPO_ROOT/packages/application/src/solo-expert-serena-integration.ts:204) โดยไม่เปลี่ยน interface หรือผล `executionKind:'mock'`

| สถานะ | `tools/list` | `tools/call` | fake invoke |
|---|---|---|---|
| Default ไม่มี fixture | ไม่มี Solo | unknown/unregistered tool | 0 |
| Explicit test fixture แต่ไม่มี Resume | มี Solo | `WORK_RESUME_REQUIRED` | 0 |
| Resume ถูกต้อง แต่ ready receipt ไม่ตรง | มี Solo | safe blocked/not-ready | 0 |
| พร้อม แต่ยังไม่ให้ human approval | มี Solo | `APPROVAL_REQUIRED` พร้อม immutable review | 0 |
| Human deny/TTL หมด/digest ผิด | มี Solo | denied/blocked | 0 |
| Human exact digest, generation/epochs ตรง | มี Solo | ผ่าน Kernel/claim แล้วจึง fake execution | 1 |
| Workspace away/back หรือ epoch drift ก่อน claim | มี Solo | blocked; ไม่ใช้ review ใหม่แทนของเดิม | 0 |
| Drift/transport uncertainty หลัง claim | มี Solo | failure + UNKNOWN หรือ retained claimed fence | ไม่มี dispatch ซ้ำ |
| Restart | default ยัง OFF; fixture ต้องประกอบใหม่ | ต้อง Resume ใหม่; ห้าม rehydrate old review เป็น authority | 0 จาก old attempt |

การมีชื่อ tool ใน test list ไม่ใช่ execution authority และไม่ต้องทำ dynamic listChanged ใน slice นี้

**Workspace admission**

ส่ง `getWorkspaceGeneration` จาก repository ตัวเดียวเข้า Work Memory เพิ่ม Solo branch ใน Resume guard ที่:

1. ต้องมี active Workspace เพียงหนึ่งรายการและ generation ที่อ่านได้
2. เรียก `requireResumedSolo` ของ bound session
3. ไม่มี Workspace, DB error, missing generation หรือ Resume mismatch ต้อง block และ audit
4. ห้ามใช้ fallback ปัจจุบันที่ปล่อยให้ Kernel ทำต่อเมื่อหา active Workspace ไม่พบสำหรับ Solo
5. identity ใน integration ต้องอ่าน root/generation ปัจจุบันจาก repository/ready receipt ทุกครั้ง ไม่ใช่ flags จาก request

ทดสอบ A→B→A โดยตรึง clock ให้เท่ากัน และทดสอบ DB reopen เพื่อพิสูจน์ว่าการเปลี่ยน generation มาจาก DB จริง ส่วน canonical root ต้องผ่าน Workspace/InternalRoot checks เดิม ไม่ใช้เพียง regex ของ integration เป็น containment proof

**Approval, ledger และ audit**

Gateway เป็นผู้คำนวณ HMAC และตรวจ consumed grant ด้วย coordinator เดิมที่ [approval-service.ts:226](REPO_ROOT/packages/application/src/approval-service.ts:226) Desktop ใช้ Service/Repository บันทึก human decision ผ่าน DB ไม่จำเป็นต้องมี HMAC key หรือสร้าง coordinator ตัวที่สองสำหรับ Solo

HMAC ครอบ runtime/capability/effect/security/binding; Solo binding รวม review digest, Workspace/root/generation, session, epochs, provenance digests และ limits ที่ [solo-expert-serena-integration.ts:162](REPO_ROOT/packages/application/src/solo-expert-serena-integration.ts:162) ต้องคง equality verification, `decisionSource:'user'`, consumed state และ TTL สูงสุด 90 วินาที Full Access ต้องไม่ autoapprove

ledger มี global unresolved fence สำหรับ `prepared/claimed/unknown` ที่ [database.ts:484](REPO_ROOT/packages/infrastructure/src/database.ts:484) และ conditional claim ที่ [solo-expert-serena-attempt-repository.ts:21](REPO_ROOT/packages/infrastructure/src/solo-expert-serena-attempt-repository.ts:21) ห้ามเพิ่ม reset UNKNOWN หรือเปลี่ยน claimed เป็น closed หลัง restart

Kernel ต้องเขียน pre-execution audit ก่อน executor และ integration ปิด ledger หลัง outcome audit สำเร็จเท่านั้น ตาม [tool-kernel.ts:377](REPO_ROOT/packages/application/src/tool-kernel.ts:377) และ [solo-expert-serena-integration.ts:346](REPO_ROOT/packages/application/src/solo-expert-serena-integration.ts:346)

Prepared row ที่หมดอายุ/ค้างหลัง restart ยังอาจทำให้ feature blocked อยู่ได้ใน slice นี้ ต้องรายงานชัดเจน ไม่เพิ่ม automatic recovery authority เงียบ ๆ

**ขอบเขตหลักฐาน human consent**

R3 Desktop เป็น actual handler/controller/SQLite ใน fake IPC harness ยังไม่ใช่คนกด UI ใน running Desktop G2a อาจเพิ่มสอง test processes ใช้ disposable SQLite เดียวกัน: process A เป็น Gateway coordinator, process B เป็น decision-service harness ทั้งคู่ต้องระบุว่า simulated human decision นี่พิสูจน์ DB handoff และ restart semantics แต่ยังไม่ใช่ actual cross-process Owner consent

---

**Source/Test permission proposal ของ G2a — รวม 8 paths**

| # | Writable path | งานที่อนุญาตให้เสนอ |
|---|---|---|
| 1 | `packages/application/src/index.ts` | export integration เดิม |
| 2 | `packages/application/src/work-resume-guard.ts` | Solo-specific fail-closed generation guard |
| 3 | `packages/infrastructure/src/index.ts` | export attempt repository เดิม |
| 4 | `packages/mcp-gateway/src/workspace-file-server.ts` | generation wiring, test-only composition, strict registration/call |
| 5 | `packages/tests/src/solo-expert-serena-gateway.test.ts` | actual factory + in-memory MCP list/call และ same-coordinator tests |
| 6 | `packages/tests/src/solo-expert-serena-runtime.test.ts` | negative no-start/provision/process tests |
| 7 | `packages/tests/src/solo-expert-serena-persistence.test.ts` | coordinator/ledger/two-process restart และ generation proof |
| 8 | `packages/tests/src/solo-expert-serena-resume.test.ts` | **ไฟล์ใหม่** สำหรับ real repository + Resume guard integration |

ไฟล์ integration, Work Memory, Domain, migration, ApprovalService/Repository, fixed adapter, managed runtime/provisioner/manifest/config และ Desktop ทั้งหมดเป็น **read-only ใน G2a** หากต้องเปลี่ยนจริงให้ STOP พร้อม exact delta ไม่มีสิทธิ์ยก 23 paths เก่ามาใช้ใหม่ทั้งหมด

Generated artifact authority = **0 files** รวมถึง Contracts ทั้งสี่ที่ R3 ทำแล้ว ต้องรักษาไว้

เสนอสิทธิ์ประกอบงานแยกจากแปด paths: หนึ่ง task-owned TEMP directory สำหรับ disposable SQLite/child harness และหนึ่ง ignored closeout `.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md` ไม่มี Handoff/Docs writes โดย Serena

---

**Package graph และ artifact permission proposal ของ G2b**

Package exports ของ Domain/Application/Infrastructure/Contracts/Gateway ชี้ไป `dist/index.js` และ `dist/index.d.ts` ดังนั้น TypeScript source ผ่านไม่ได้รับรอง runtime package exports

ลำดับ dependency จริงคือ:

```text
Domain → Infrastructure → Application → MCP Gateway
Contracts ───────────────────────────→ Desktop
Domain / Infrastructure / Application → Desktop
```

Infrastructure ยังพึ่ง MCP client, SQLite, Koffi และ UUID; Gateway พึ่ง MCP server และ Zod คนละ major กับ Contracts/Desktop ต้องใช้ installed resolution ตาม package จริง ไม่สลับ dependency เพื่อให้ diagnostic ผ่าน

ข้อแตกต่างสำคัญคือ [Desktop Vite aliases:46](REPO_ROOT/packages/desktop/vite.config.ts:46) ใช้ source ของ workspace packages สำหรับ main/preload/renderer แต่ Gateway stdio entry ใช้ package runtime graph ผ่าน compiled modules การ refresh App/Infra dist จึงไม่ทำให้ Desktop bundle ปัจจุบันสดตามโดยอัตโนมัติ

ห้ามใช้:

- root `test` เพราะ script มี package builds ก่อนรัน tests
- root build หรือ recursive package build
- Desktop `dev` ซึ่งมี native rebuild prehook
- Desktop `package:win` หรือ `prepare-mcp-gateway-runtime.mjs`

ตัวเตรียม Gateway runtime มี recursive deletion, dependency builds, deploy และ native rebuild จริงที่ [prepare-mcp-gateway-runtime.mjs:50](REPO_ROOT/packages/desktop/scripts/prepare-mcp-gateway-runtime.mjs:50) จึงเกินขอบเขตนี้

**Bounded compiler sets ที่นับจาก source ปัจจุบัน**

ผมไล่ relative module references แบบ read-only โดยรวม type references/dynamic relative imports ไม่ได้รัน TypeScript compiler จึงเป็น **static closure inventory** ที่ต้องตรวจซ้ำด้วย compiler ก่อน emit:

| Package | Compiler roots | TS closure | Artifact ceiling |
|---|---|---:|---:|
| Domain | `src/index.ts` | 17 | 68 |
| Infrastructure | `src/index.ts`, `src/solo-expert-serena-attempt-repository.ts` | 61 | 244 |
| Application | `src/index.ts`, `src/solo-expert-serena-integration.ts` | 27 | 108 |
| MCP Gateway | `src/index.ts`, `src/stdio-entry.ts` | 7 | 28 |
| **รวม** | | **112** | **448** |

แต่ละ source stem อนุญาต candidate outputs ได้เพียง:

```text
packages/<package>/dist/<stem>.js
packages/<package>/dist/<stem>.js.map
packages/<package>/dist/<stem>.d.ts
packages/<package>/dist/<stem>.d.ts.map
```

ไม่รวม Contracts, Desktop `dist`, `dist-electron`, portable runtime, node_modules, native binaries หรือ tsbuildinfo

รายชื่อ stems ของ bounded sets:

```text
DOMAIN — 17
approval, classifier, coding-engine, coding-semantic-read,
coding-semantic-write, connection, git, index, policy, project-runner,
restricted-verify, result, solo-expert-serena, team, tool-kernel, types,
work-memory

APPLICATION — 27
approval-mode-service, approval-service, coding-engine-runtime-port,
coding-engine-service, coding-semantic-read-capabilities,
coding-semantic-write-capabilities, connection-config-service,
connection-runtime-port, connection-service, git-safety-capabilities,
git-workflow-capabilities, git-workspace-service, index,
project-runner-capabilities, project-runner-service,
restricted-verify-capabilities, solo-expert-serena-integration,
team-capabilities, team-continuation, team-legacy-reconciler,
team-service, tool-kernel, work-memory-capabilities,
work-memory-service, work-resume-guard, workspace-file-capabilities,
workspace-service

INFRASTRUCTURE — 61
approval-mode-repository, approval-repository, approval-runtime-identity,
audit-repository, connection-profile-repository, credential-store,
database, data-root, doctor, git-command-runner, git-github-remote,
git-safety-adapter, index, openai-secure-tunnel-runtime, path-adapter,
private-mvp-appcontainer-job-runtime, private-mvp-desktop-guardian-worker,
private-mvp-desktop-owned-session, private-mvp-desktop-pipe-io,
private-mvp-desktop-pipe-worker, private-mvp-desktop-runner-owner,
private-mvp-h0-one-shot-gateway, private-mvp-h0-win32-gateway-adapter,
private-mvp-h0-win32-handle-proof, private-mvp-h1-claim-binding,
private-mvp-h1-compiled-lock, private-mvp-h1-control-protocol,
private-mvp-h1-exact-owned-peers, private-mvp-h1-native-cleanup-proof,
private-mvp-h1-win32-held-stage, private-mvp-h1-win32-host-calls,
private-mvp-h1-wire, private-mvp-handle-isolation,
private-mvp-koffi-bridge-preparation, private-mvp-mission-admission,
private-mvp-owned-peer-watchdog, private-mvp-runner-control-entry,
private-mvp-runner-control-watchdog, private-mvp-trusted-synthetic-stage,
private-mvp-win32-native-binding, project-runner-job-repository,
restricted-verify-adapter, runner-manifest, runner-snapshot,
secure-tunnel-health, secure-tunnel-process, secure-tunnel-profile,
serena-engine-manifest, serena-engine-provisioner,
serena-managed-config, serena-managed-runtime, serena-runtime-paths,
solo-expert-serena-attempt-repository, solo-expert-serena-fixed-adapter,
team-repository, team-transition-unit-of-work,
windows-credential-manager, work-memory-repository,
workspace-git-settings-repository, workspace-repository,
workspace-text-file-system

MCP GATEWAY — 7
gateway, index, metadata, server, stdio, stdio-entry,
workspace-file-server
```

จำนวนนี้มากเพราะ Infrastructure barrel ดึง legacy private-mvp modules ด้วย แม้ Solo ไม่ใช้ จึงแนะนำให้ **Owner อนุมัติ G2a ก่อน** และตัดสินใจ G2b ภายหลังโดยเห็น inventory นี้ ไม่ขยาย build จากสี่ Contracts files เดิมโดยอัตโนมัติ

**ขั้นตอน G2b ที่เสนอ — ยังไม่ได้รับอนุมัติ**

1. ตรึง source/package/config/compiler hashes หลัง G2a; ไม่มี source edits ใน G2b ตรวจ expanded 448-path inventory ก่อนทำอะไรกับ dist หาก compiler พบ source/output นอกชุดนี้ให้ STOP
2. ใช้ installed TypeScript ผ่าน compiler API แบบ single-root sets ข้างต้น ไม่ใช้ `tsc -p` ที่ include source ทั้ง package
3. ใช้ options เดิม ES2022/Node16/strict/declaration/declarationMap/sourceMap พร้อม `noEmitOnError:true`, `incremental:false`, `composite:false`
4. ลำดับ Domain → Infrastructure → Application → Gateway ให้ compiler resolve workspace declaration imports ไปยัง staged outputs ของ dependency ที่ผ่านแล้ว ไม่ใช่ stale live declarations และห้ามลาก cross-package source มาปล่อย output เพิ่ม
5. Intercept `writeFile` ให้ capture candidate bytes ก่อนเขียน destination จริง ใช้ logical final output paths เพื่อให้ source/declaration maps ถูกต้อง Diagnostic error หรือ output เกิน allowlist ต้องไม่เขียน runtime destinations
6. ก่อน publish สร้าง task-owned TEMP backup ของทุก target ที่มีอยู่ พร้อม path, SHA-256, size และ existence marker ของ target ที่ยังไม่มี บันทึก compiler/source/options/output hashes ไม่มี secret
7. Publish เฉพาะ permitted outputs ที่ bytes เปลี่ยน ตรวจทุก destination อยู่ภายใน exact dist roots ไม่มี symlink/reparse escape และไม่มี concurrent change
8. หาก write/verification ล้มเหลว restore เฉพาะ paths ที่ task แตะ และลบเฉพาะ newly created allowed outputs ที่ task สร้างเอง ห้ามลบ directory หรือ dist ทั้งชุด หาก restore ยืนยันไม่ได้ให้ STOP
9. ตรวจ actual compiled imports โดยไม่มี Vite/Vitest aliases ทดสอบ compiled Gateway factory ผ่าน in-memory MCP และ same SQLite test host ห้าม import `stdio-entry.js` เพื่อ diagnostic เพราะ top-level เรียก `serveStdio`; ตรวจ entry นั้นแบบ static
10. แยกหลักฐาน compiler parity, compiled fake integration และ live readiness ห้ามอ้าง transaction atomicity ของ multi-file publication หรือผลิตภัณฑ์พร้อมจาก compile PASS

G2b ไม่อนุญาต Desktop build จึงยังไม่ปิด physical Desktop graph ต้องมี proposal ใหม่ที่ระบุ isolated bundler outputs และ publication scope ก่อน B2 การรัน Vite ปัจจุบันตรง ๆ มี `emptyOutDir:true` ที่ [vite.config.ts:116](REPO_ROOT/packages/desktop/vite.config.ts:116) จึงไม่ใช่ narrow artifact operation ที่อนุมัติได้โดยปริยาย

---

**Ordered RED→GREEN gates และเกณฑ์จบ G2a**

1. **Preflight:** บันทึก branch/HEAD/status/staged และ SHA-256 ของ writable/protected paths อ่าน canonical `tdd` และ `codebase-design` ตาม router ก่อนแก้ ไม่โหลด UI workflow เมื่อไม่เปลี่ยน UI
2. **RED registration:** ทดสอบ actual production factory ผ่าน streams ในหน่วยความจำ default list/call ต้องไม่มี Solo; fixture opt-in ต้องพบ tool และ strict input ขณะนี้ positive registration จะยังไม่ผ่าน
3. **RED Resume:** ใช้ real repository/Work Memory ตรวจ missing Resume, missing reader, no/multiple active Workspace, DB failure, A→B→A และ new session/restart
4. **GREEN composition:** แก้เฉพาะสี่ source paths ใช้ integration/Approval/ledger เดิม ไม่มี live-runtime adapter
5. **Authority/ledger proof:** manual source ทุก Approval mode, exact digest/HMAC, TTL boundary, wrong key/session/runtime/root/generation/epoch, concurrent duplicate, consumed-once, pre/outcome audit failure และ UNKNOWN restart
6. **No-execution proof:** list/deny/invalid/pending flows ต้องไม่เรียก semantic read/write, runtime start/repair, provisioner, connect, OS process, network หรือ fake invoke; admitted path เรียกเฉพาะ injected fake หนึ่งครั้ง
7. **Regression:** ทั้งหก suites เดิมรวม 75 tests ต้องยังอยู่และผ่าน พร้อม tests ใหม่ ไม่ลด coverage หรือแก้ fixture เพื่อทำให้ security check อ่อนลง ใช้ reliable reporter และ exit code
8. **Static checks:** scoped ESLint; no-emit checks ของ packages ที่เกี่ยวข้องและ isolated new-test program โดยไม่มี root scripts/build หาก stale declarations ทำให้ตรวจ contract ที่เปลี่ยนไม่ได้ให้รายงาน blocker ไม่ regenerate dist ใน G2a
9. **Closeout:** `git diff --check`, full scoped diff/status/hash inventory, checks/exit codes, gate verdict และ limitations แล้ว STOP

Test runner workers และ fixed disposable SQLite restart harness เป็น **development-test process exceptions ที่ต้องระบุใน Owner permission ของ G2a** ไม่ใช่ product child-process authority ส่วน guard assertion ว่า “zero process” หมายถึง product execution path ภายใน test ไม่รวมตัว test host เอง ห้ามเปิด acceptance flags ที่เริ่ม Git/runtime/network จริง

---

**สิ่งที่ต้องครบก่อน freeze B2 หนึ่งคำสั่ง**

G2a หรือ G2b ผ่านยังไม่ทำให้ B2 freeze ได้ ข้อที่ยังไม่ครบต้องมีหลักฐานและสิทธิ์แยก:

- actual managed-runtime owner และ session provenance ที่ผูก installation inventory, manifest/schema/config, Workspace/generation และ epoch ตั้งแต่ authorized startup; ห้ามย้อนหลังรับรอง session เดิมด้วย self-reported PID
- reviewed runtime receipt lifecycle: invalidate เมื่อ stop/repair/reconnect/config/artifact drift และตรวจซ้ำก่อน dispatch
- actual installed/source return schema ของ shell tool ปัจจุบัน fixed adapter ต้องการ JSON `return_code/stdout/stderr/cwd` และคืน `mock` ตาม [fixed-adapter.ts:45](REPO_ROOT/packages/infrastructure/src/solo-expert-serena-fixed-adapter.ts:45) จึงยังไม่ใช่ live decoder ที่พิสูจน์แล้ว
- compiled Gateway graph และ Desktop artifact identity ที่ตรง source พร้อม actual trusted-sender IPC/DB handoff
- Owner เห็น exact immutable review ใน running Desktop แล้วกดด้วยตนเอง Gateway เดิมตรวจ consumed HMAC และ ledger claim ได้จริง
- explicit default-OFF→live activation จาก trusted SUD-D composition โดยไม่มี caller flag หรือ alternate approval authority
- freeze exact device/account, SUD-D-owned Workspace/root/generation, session/epochs, package/artifact hashes, literal command, shell behavior, effects/output, expiry, one-use/no retry และ abort/UNKNOWN procedure
- Owner ยืนยัน Option B risks สำหรับครั้งนั้น: stock local raw logging, ambient host-user filesystem/network และไม่มี proven descendant termination

คำสั่งใน source `echo SUD_D_B1_OK` เป็น **candidate profile เท่านั้น** ยังไม่มีสิทธิ์รันจริงในงานนี้ ต้องตรวจ shell startup behavior ด้วย เพราะคำสั่งสั้นไม่ได้พิสูจน์ว่า shell initialization ไม่มี effects อื่น

A1 ยัง PAUSED/BLOCKED และห้ามอ้าง independent protected consent การอนุญาต B2 ภายใต้ Option B ต้องกล่าวความเสี่ยง cooperative same-user ตามจริง ไม่ตีความ A1 เป็น PASS หรือเพิ่มเป็นเงื่อนไขที่บอกว่าปิดแล้ว

---

**ข้อความเสนอให้ Owner อนุมัติ — ยังไม่ใช่การอนุมัติ**

> อนุมัติ B1b-G2a code-only เฉพาะ 8 source/test paths ในรายงานนี้ generated artifacts ศูนย์ไฟล์ อนุญาต focused development tests ด้วย installed Electron-as-Node/SQLite และ fixed disposable two-process restart harness ในหนึ่ง task-owned TEMP directory พร้อมหนึ่ง ignored closeout เท่านั้น ไม่อนุมัติ G2b build/artifacts, product runtime, managed Serena startup, real shell/B2, network/provider/native หรือ Git writes

G2b ต้องขออีกครั้งหลัง G2a review โดยแนบ frozen expanded inventory ของ bounded sets ข้างต้น ไม่รวมในข้อความนี้

**Paste-ready Serena Implementation assignment — ส่งได้หลัง Owner อนุมัติ exact G2a scope เท่านั้น**

```text
ภารกิจ: SOLO-EXPERT-B1b-G2a — source/fake MCP registration และ trusted
Workspace Resume integration เท่านั้น

สถานะข้อความนี้เป็น assignment proposal ไม่ใช่หลักฐาน Owner authorization
ก่อนเริ่มต้องมี Owner อนุมัติ exact scope ด้านล่าง หากไม่มีให้ STOP โดยไม่แก้ไฟล์

ผู้รับ: Serena Implementation ใน separate Serena Home New chat
อ่าน AGENTS.md, SUD_D_ADVISOR.md, active HANDOFF/ROADMAP,
B1b-G2 Codex design report ฉบับเต็ม และ R3 Advisor acceptance dated 2026-10-15
R3 Gate 0/1 จบแล้ว ห้าม dispatch/rewrite R3 ใหม่โดยไม่มี regression reason

ROLE ISOLATION:
ห้าม invoke Codex CLI/codex exec/Codex MCP/agent/services,
subagents/delegates, Remote Desktop Commander หรือ Team Mode
หากต้องตัดสิน architecture เพิ่มให้ STOP ส่งปัญหากลับ ChatGPT Project Advisor
Serena ทำ source/tests ด้วยเครื่องมือที่อนุมัติเองเท่านั้น

ผลลัพธ์ที่ต้องส่ง:
actual createProductionMcpServer MCP list/call ผ่าน in-memory streams,
default OFF, explicit test-only fake opt-in, DB generation Resume,
same-coordinator manual HMAC/SQLite/claim/Audit/UNKNOWN proof
สถานะสูงสุดคือ SOURCE/FAKE ACCEPTED; LIVE NOT_READY
ไม่รับรอง live session และไม่เปิด real shell

RISK: Security / Data Critical
ทำ Skill Router Gate และอ่าน canonical .agents/skills/tdd/SKILL.md,
codebase-design/SKILL.md ก่อนงานที่กำกับ
diagnosing-bugs เฉพาะ unexpected failure ตาม trigger
ไม่มี Desktop/UI changes ใน scope นี้

EXACT WRITABLE SOURCE/TEST — 8 PATHS:
1 packages/application/src/index.ts
2 packages/application/src/work-resume-guard.ts
3 packages/infrastructure/src/index.ts
4 packages/mcp-gateway/src/workspace-file-server.ts
5 packages/tests/src/solo-expert-serena-gateway.test.ts
6 packages/tests/src/solo-expert-serena-runtime.test.ts
7 packages/tests/src/solo-expert-serena-persistence.test.ts
8 packages/tests/src/solo-expert-serena-resume.test.ts [NEW]

GENERATED ARTIFACTS: ZERO
ห้ามเขียน dist ใด รวม Contracts สี่ไฟล์ที่ R3 ยอมรับแล้ว
ห้ามเปลี่ยน Domain, integration module, WorkMemoryService, migration,
ApprovalService/Repository, managed runtime/provisioner/manifest/config,
fixed adapter, Desktop IPC/preload/controller/renderer, package/config/lockfile
หากต้องแก้เพิ่มเติมให้ STOP ระบุ exact path/reason ไม่ขยาย allowlist เอง

Administrative output เมื่อ Owner อนุมัติ:
หนึ่ง uniquely task-owned TEMP directory สำหรับ disposable SQLite
และ fixed restart/decision harness; ไม่ใช้ Product DB
หนึ่ง ignored Closeout:
.serena/reports/solo-expert-b1b-g2a-code-only-closeout-20261015.md
ห้ามเขียน Handoff/Docs หรือทับ closeouts เก่า

PREFLIGHT:
git status, branch/HEAD/staged; baseline hashes ของ writable/protected paths
รักษา inherited dirty/untracked work
ตรวจ installed Electron-as-Node/SQLite test-host capability ตามหลักฐานเดิม
หาก ABI ใช้ไม่ได้ STOP ไม่ install/rebuild/native-repair

RED → GREEN:
A. เพิ่ม actual MCP factory/in-memory transport list/call tests:
   default ไม่มี Solo; unknown invocation ไม่เข้าถึง adapter
   explicit test-only fixture จึงลงทะเบียน strict solo_expert.smoke
   first input {}, retry {attemptId:UUID}; extra keys/command/root/env/
   identity/approved/resumed flags ต้องปฏิเสธ
B. เพิ่ม real Workspace Repository + WorkMemory Resume tests:
   missing Resume/reader, missing or multiple active Workspace, DB error,
   same-clock A→B→A, new session และ restart ต้อง fail closed
C. แก้สี่ source paths:
   export existing integration และ attempt repository
   ส่ง repository getGeneration เข้า WorkMemoryService
   เพิ่ม Solo generation branch ใน Resume guard
   ประกอบ bound session ก่อน Solo identity
   default production factory ไม่ส่ง fixture และไม่มี env/caller activation
D. fixture ต้องเป็น synthetic/mock เท่านั้น
   coordinator ของ Solo ต้องเป็น object เดียวกับ dependencies.approval
   ไม่สร้าง coordinator/HMAC authority เพิ่ม
   ใช้ repository/ledger ของ test DB เดียวกัน
   root/generation มาจาก trusted repository; session/epoch มาจาก composition
   ไม่มี live ready-session attestation หรือ fallback ไป semantic methods
E. initial call prepare immutable review เดิมแล้วผ่าน Kernel จน pending
   retry ต้องใช้ original stored object ผ่าน getReview
   เรียก integration.invokeThroughKernel เพื่อคง outcome-audit finalization
   ไม่ส่ง deserialized review เข้าข้าม WeakSet gate
F. human-decision simulation ใช้ existing ApprovalService/Repository
   exact displayed digest, source=user, consumed HMAC equality,
   all Approval Modes, TTL<=90s, one use, no dispatch retry
   missing/wrong/stale digest/key/session/runtime/root/generation/epoch deny
G. พิสูจน์ concurrent claim, audit pre/outcome failure, poison/timeout,
   pre/post-claim drift และ UNKNOWN/claimed fence ข้าม repository/process
   ห้าม reset UNKNOWN หรือ auto-close/replay หลัง restart
   prepared orphan ที่ยัง recover ไม่ได้ให้รายงาน blocked ตามจริง
H. list/deny/pending flows ต้องไม่มี product start/repair/provision/connect,
   semantic runtime call, network, shell หรือ OS child process
   admitted invocation เรียก injected fake ครั้งเดียวและผลเป็น mock
   development test-host workers/fixed SQLite harness เป็นข้อยกเว้นเฉพาะ test
   ห้ามเรียก production runtime เพื่อทำให้ test เขียว
I. ขยาย fixed TEMP harness เพื่อพิสูจน์ Gateway-coordinator process กับ
   decision-service process ใช้ SQLite เดียวกัน และ restart invalidation
   ใช้ synthetic decision เท่านั้น ไม่อ้าง actual human Desktop consent
   ห้าม serialize HMAC key ลงไฟล์/DB/log/DTO

REGRESSION:
รันหก suites เดิมโดยตรงผ่าน installed Electron-as-Node/Vitest:
solo-expert-serena-integration.test.ts
solo-expert-serena-runtime.test.ts
solo-expert-serena-approval.test.ts
solo-expert-serena-persistence.test.ts
solo-expert-serena-desktop.test.ts
solo-expert-serena-gateway.test.ts
คง 75 tests เดิม พร้อม tests ใหม่และ new resume suite
ต้องได้ reliable reporter + successful exit code ห้าม masked wrapper success
ไม่ใช้ root pnpm test เพราะมี build side effects

STATIC:
scoped ESLint, affected package noEmit และ isolated test typecheck
หาก stale declarations ขวาง ให้รายงาน BLOCKER ไม่ emit dist ใน G2a
git diff --check, scoped complete diff/status/hash inventory
ห้าม unrelated suites/acceptance flags ที่เริ่ม runtime/Git/network จริง

ABSOLUTE PROHIBITIONS:
ไม่มี product Desktop/Gateway/managed Serena startup,
real shell/B2, provider/network/secrets/spend, native/Windows policy,
install/rebuild/package/build/deploy, Git stage/commit/push/reset/clean
ไม่มี G2b artifact authority และไม่ใช้สิทธิ์ R3 เก่าขยาย scope

REPAIR/STOP:
ต่อได้ภายใน approved scope ไม่เกิน 3 repairs ต่อ diagnosed root cause
STOP เมื่อเกิน path/authority, ต้องลด security, missing safe dependency,
architecture decision ใหม่, live provenance จำเป็นต่อ proof,
หรือครบ repair budget แล้วยังไม่ผ่าน
ไม่ STOP เพียงเพราะ live readiness ยัง unavailable หากกำลังทำ G2a fake proof
ที่อนุมัติอยู่; ปิดภารกิจด้วยข้อจำกัดนั้นโดยไม่อ้าง live readiness

CLOSEOUT:
รายงานแต่ละ gate PASS/FAIL/BLOCKED, commands/reporters/exit codes,
75-case regression + tests ใหม่, no-execution counters,
coordinator/SQLite/restart/generation/HMAC/TTL/UNKNOWN evidence,
changed paths/SHA256, protected/artifact hashes และ Git boundary
แยก simulated decision, cross-process DB proof และ actual human proof
กล่าวชัด:
G2a SOURCE/FAKE ONLY; LIVE MANAGED SERENA NOT_READY;
B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.
ส่ง Closeout หนึ่งฉบับกลับ ChatGPT Project Advisor ผ่าน Owner แล้ว STOP
```

**สถานะเมื่อจบงาน read-only นี้:** branch `p0c-hyperv-spike`, HEAD `7e4c54687f363b2abe6bd34ff71afb4d1a211299`, staged 0 และ Git-visible status 294 entries ตามการนับ `-uall` ตอนตรวจ ไม่ได้แก้ source/tests/artifacts/docs `git diff --check` ผ่าน exit 0 มีเพียงคำเตือน LF/CRLF ของไฟล์เดิม ไม่ได้รัน tests/build/runtime และไม่ได้รับรอง installed/live process

งาน Codex รอบนี้จบที่รายงานและ permission proposal นี้ **STOP**