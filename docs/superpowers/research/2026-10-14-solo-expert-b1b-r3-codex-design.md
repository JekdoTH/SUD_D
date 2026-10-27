> Repo-portable copy of completed Codex B1b-R3 READ-ONLY design, independently evaluated by ChatGPT Advisor. Original machine-specific reference prefixes converted to REPO_ROOT/USER_HOME. Some source links are reference markers rather than directly navigable links. Not Owner implementation or build authorization.

**ข้อเสนอ R3: ใช้ A แบบ compile เฉพาะ `contracts/src/index.ts` หลังแก้ source และคง IPC/preload เดิมได้ แต่ Contracts 4 artifacts เพียงอย่างเดียวยังปิด B1b หรืออนุญาต B2 ไม่ได้ครับ**

อ่าน assignment ทั้งหมดแล้ว งานนี้ตรวจแบบ read-only เท่านั้น ไม่รัน test/build/runtime และไม่เขียนไฟล์ จึงส่งรายงานกับ prompt proposal ในคำตอบนี้

**ข้อเท็จจริงจาก source**

- [Contracts source](REPO_ROOT/packages/contracts/src/index.ts:246) และ [dist](REPO_ROOT/packages/contracts/dist/index.js:189) ยังรับเพียง `approvalRequestId` + `decision` แบบ strict — build source เดิมก็ยังปฏิเสธ `reviewDigest`
- [preload](REPO_ROOT/packages/desktop/electron/preload.ts:94) ส่ง input ทั้ง object; [protected IPC](REPO_ROOT/packages/desktop/electron/approval-ipc.ts:100) ตรวจ sender แล้ว `safeParse` ก่อนส่ง parsed data ให้ Controller จึงไม่จำเป็นต้องแก้สองไฟล์นี้
- [Controller](REPO_ROOT/packages/desktop/electron/approval-controller.ts:49) ยังไม่ส่ง digest เข้า ApprovalService และ projection ที่บรรทัด 77 ไม่มี Solo review; [Activity](REPO_ROOT/packages/desktop/src/pages/ActivityPage.tsx:59) ยังส่งสอง field และไม่มี complete Solo review
- [ApprovalService](REPO_ROOT/packages/application/src/approval-service.ts:342) และ [Repository](REPO_ROOT/packages/infrastructure/src/approval-repository.ts:256) มีการเทียบ digest กับ persisted review แล้ว ต้องรักษาไว้
- **runtime มีสองทาง:** package exports ชี้ dist แต่ [Vitest](REPO_ROOT/vitest.config.ts:14) และ [Desktop Vite](REPO_ROOT/packages/desktop/vite.config.ts:46) alias ไป source ดังนั้น source tests ผ่านไม่ได้พิสูจน์ dist; refresh Contracts ไม่ได้อัปเดต Desktop bundle เดิม
- [Application dist](REPO_ROOT/packages/application/dist/approval-service.js:154) และ [Infrastructure dist](REPO_ROOT/packages/infrastructure/dist/approval-repository.js:146) ยังใช้ responder แบบไม่มี digest จึงห้ามอ้างว่า runtime package graph พร้อมหลัง build Contracts อย่างเดียว

**Trust flow ที่ต้องรักษา**

```text
Gateway สร้าง immutable review → persisted SQLite
→ Controller ส่ง validated nonsecret projection → Activity แสดงครบ
→ click ส่ง requestId + decision + digest ของ snapshot ที่เห็น
→ preload → sender-validated strict IPC
→ Controller → ApprovalService → conditional SQLite decision
→ ผู้เรียก retry ผ่าน Kernel/Policy
→ Gateway coordinator เดิม consume และ verify HMAC
→ atomic claimed ledger → fake execution → outcome Audit → closed
                                  ↘ ไม่แน่นอน: UNKNOWN / ห้าม retry
```

Contracts เพิ่ม `reviewDigest` เป็น **optional string ที่ regex `^[0-9a-f]{64}$`** และคง `.strict()` เพื่อให้ Basic Approval สอง field เดิมใช้ได้ ส่วน Solo backend ยังต้องปฏิเสธ missing/wrong/stale digest รวมถึงหมดอายุและ scope drift

เพิ่ม optional `soloExpertReview` ใน Desktop DTO ภายใน `contracts/src/index.ts` โดยใช้ projection 22 fields ตาม [Domain](REPO_ROOT/packages/domain/src/approval.ts:15) และลำดับ serialization ของ [producer](REPO_ROOT/packages/application/src/solo-expert-serena-integration.ts:144) ตรวจ shape/hash/expiry ก่อนแสดง ไม่ส่ง HMAC key, `bindingDigest`, raw output/error หรือ credential ให้ renderer

Activity ใช้ pending-approval surface เดิม แสดง command เต็ม, root/Workspace, provenance ว่า unverified, local logging, host-user/network/descendant risk, expiry และ one-use ให้ callback จับ **snapshot ที่แสดงจริง** ห้ามเปลี่ยนไปใช้ digest ใหม่อย่างเงียบ ๆ เมื่อ refresh; malformed/stale ให้ปิด Approve และ refresh เพื่อ review ใหม่

**Gateway เป็น authority:** ใช้ `verifyConsumedManualSolo` ของ coordinator ที่ Kernel ใช้จริง ตรวจ runtime/HMAC, `consumed`, `decisionSource:'user'`, projection/session/Workspace/epoch และ expiry ตาม [source](REPO_ROOT/packages/application/src/approval-service.ts:226) Desktop บันทึก human decision ผ่าน DB เดิม ไม่ต้องสร้าง coordinator หรือรับ HMAC key อีกชุด การมี digest รูปแบบถูกต้องไม่ใช่สิทธิ์ execution

ข้อขัดแย้งที่ต้องบันทึก: Service/Repository ปัจจุบันต้องการ digest สำหรับ Solo **ทั้ง Approve และ Deny** แม้ original spec บอก “Deny remains possible” จึงให้ valid review ส่ง digest สำหรับทั้งสอง decision; ห้าม Serena เพิ่ม digest-less denial fallback เอง หากต้องการ Deny ตอน review เสีย ต้องกลับให้ Advisor ตัดสิน contract นี้ก่อน

**Artifact/scope ที่แนะนำ**

Source/test scope สูงสุดยังเป็น **23 paths ลำดับ 1–23 ใน [R2 binding allowlist](REPO_ROOT/docs/superpowers/plans/2026-10-14-solo-expert-b1b-r2-serena-assignment.md:12)** ไม่ใช่คำสั่งให้แก้ทุกไฟล์ ส่วน transport ต้องแก้ Contracts, Controller และ Activity; `main.ts` ใช้ service/IPC wiring เดิมได้ ไม่ต้องเพิ่ม Desktop coordinator

ขอ Owner อนุญาตเพิ่ม generated artifacts **เพียง**:

```text
packages/contracts/dist/index.js
packages/contracts/dist/index.js.map
packages/contracts/dist/index.d.ts
packages/contracts/dist/index.d.ts.map
```

| ทางเลือก | ข้อเสนอ |
|---|---|
| A: source-first + narrow emit | แนะนำ compile single root `src/index.ts` ด้วย installed TypeScript 5.9.3 และ options ตรึงไว้ |
| B: staged emit ก่อน copy | ใช้ได้ถ้า Owner อนุญาต TEMP staging เพิ่ม; ต้องตรวจ inventory ก่อน copy เพียงสี่ไฟล์ แต่ไม่จำเป็นสำหรับขั้นเล็กสุด |
| C: แก้ protected IPC | ยังไม่มีเหตุผลจาก source; ไม่เพิ่ม scope IPC/preload |

**ห้ามใช้ package build เดิม:** [tsconfig](REPO_ROOT/packages/contracts/tsconfig.json:7) include ทั้ง `src` ซึ่งตอนนี้มีสาม `.ts` จึงคาดว่าจะ emit **12 files** เพิ่ม `trusted-supervisor` และ `trusted-task-grant` อย่างละ `.js`, `.js.map`, `.d.ts`, `.d.ts.map` ไม่ตรง four-artifact scope ข้อความ “sole src/index.ts” ใน Advisor report ต้องแก้ตาม source truth

Single-root compile ต้องตรึง ES2022/Node16, strict และ options จาก base พร้อม `declaration`, `declarationMap`, `sourceMap`, **`noEmitOnError:true`, `incremental:false`, `composite:false`**; rootDir/outDir ชี้ Contracts เท่านั้น ไม่สร้าง tsbuildinfo/config/script ใหม่ และไม่ install

ก่อน emit ให้ hash และสำรอง bytes เดิมของสี่ไฟล์ใน TEMP ที่ Owner อนุญาต ตรวจ output inventory และ diff ทั้งหมดหลัง emit เพราะ index source มี PRE-H1 additions เดิมที่ dist ยังไม่มีด้วย ต้องระบุเป็น pre-existing source parity ไม่ลบทิ้งหรือถือว่าได้รับ Native authority หาก gate ล้มเหลว restore เฉพาะสี่ owned artifacts จาก backup; ห้าม clean/reset/dist-directory deletion

**ลำดับ proof สำหรับ Serena หลังได้รับอนุญาตใหม่**

1. **RED:** ผ่าน real IPC handler กับ schema ที่ import จาก exact dist โดยหลีกเลี่ยง Vitest alias; legacy packet ผ่าน แต่ valid digest packet ถูกปฏิเสธ และ Controller ยังไม่ส่ง digest
2. แก้ source DTO/schema → narrow emit → **GREEN:** fresh dist import `safeParse` ด้วย synthetic UUID/digest; legacy ผ่าน, valid hex ผ่าน, malformed/unknown keys ถูกปฏิเสธ ทดสอบ handler จริงและ invalid sender ด้วย fake IPC
3. Controller ส่ง digest ถึง Service จริง; Activity ส่ง snapshot ที่เห็น ทดสอบ positive legacy/Solo และ negative missing/wrong/stale/expired/corrupt review รวมสาม Approval modes โดยไม่มี autoapproval
4. Gate A regressions และ Stage II fake composition: real source coordinator/HMAC/Kernel/SQLite, trusted Resume + DB generation รวม away/back, default-OFF list/invoke, duplicate claim, pre/post-Audit failure, restart/UNKNOWN และ poison-output redaction
5. distinct-process TEMP SQLite proof ต้องผ่าน actual reviewed decision/coordinator path ไม่ใช้ SQL ใส่ `consumed` row เป็นหลักฐาน consent; MCP transport/Serena executor เป็น fake ไม่เปิดผลิตภัณฑ์จริง

Source+dist transport PASS เป็น checkpoint ได้ แต่ **FULL Gate B ยังต้องผ่าน coordinator, durability, Resume และ ready-attestation gates ทั้งหมด** ปัจจุบัน [ready-only runtime](REPO_ROOT/packages/infrastructure/src/serena-managed-runtime.ts:107) และ [integration](REPO_ROOT/packages/application/src/solo-expert-serena-integration.ts:113) ยังยอมรับ synthetic fixture เท่านั้น ห้ามเปลี่ยน label ให้เป็น production attestation; ถ้าพิสูจน์ไม่ได้ภายใน scope ให้คง `NOT_READY` และ STOP

Dist ถูก ignore จึงไม่เดินทางข้ามเครื่องด้วย Git ต้องวางแผน reproducible build/provisioning แยกภายหลัง รวม Desktop/dependent artifacts ก่อน live acceptance ความเสี่ยง stock logging, ambient host-user rights, unproven egress และ descendants หลัง timeout ยังอยู่; A1/B2 ยัง HOLD

**ข้อความเสนอให้ Advisor ใช้เตรียม dispatch — ยังไม่ใช่ authorization**

```text
ถึง ChatGPT Project Advisor: โปรด review ข้อเสนอ B1b-R3 นี้และขอ Product Owner
อนุญาตใหม่ก่อนส่งให้ Serena Implementation ในแชตแยก

Mission: Security/Data Critical, default-OFF CODE-ONLY.
Writable source/test สูงสุดคือ paths 1–23 ใน
docs/superpowers/plans/2026-10-14-solo-expert-b1b-r2-serena-assignment.md
เพิ่มเฉพาะ packages/contracts/dist/{index.js,index.js.map,index.d.ts,index.d.ts.map}
และหนึ่ง owned TEMP backup directory; closeout ใหม่เพียง
.serena/reports/solo-expert-b1b-r3-code-only-closeout-20261014.md

Serena NEVER invokes Codex CLI/MCP/agent, subagents/delegates,
Remote Commander หรือ Team. โหลด required canonical skills ตาม binding/router.
ห้ามแก้ protected approval-ipc.ts/preload.ts/global.d.ts, config/package/lockfiles,
dist อื่น, authoritative docs หรือ user-owned work นอก scope

ทำ RED→GREEN ตาม proof ข้างต้น: source-first strict optional digest + bounded DTO,
Controller forwarding, Activity displayed snapshot; compile เฉพาะ Contracts index
ด้วย local compiler/options ตรึงและ noEmitOnError/noIncremental/noComposite.
ห้าม package build ที่ emit 12 files. Hash/backup/inventory/diff/rollback เฉพาะสี่ artifacts.
ทดสอบ exact dist import และ real unchanged IPC handler โดยไม่ให้ source alias กลบผล.

Gate A ต้อง GREEN ก่อน Stage II. ใช้ source coordinator ตัวเดียวกับ Kernel,
real SQLite claimed/UNKNOWN, trusted Resume/generation และ fake-only runtime.
รักษา test-only installed Electron-as-Node ABI135/owned TEMP scope เดิม;
หากต้องเพิ่ม distinct-process approval harness ต้องให้ Owner อนุญาตรายการนั้นชัดเจน.
Focused suites, scoped no-emit TS/lint และ git diff --check; max 3 repairs/root cause.
ไม่มี root build/install/rebuild, product Desktop/Gateway/Managed Serena startup,
real Shell/B2/Native/TGNK, network/provider/secret/spend หรือ Git writes.

STOP หากต้องใช้ path/artifact เพิ่ม, ต้อง weaken gate, runtime attestation/consent
พิสูจน์ไม่ได้ หรือ verification ยัง inconclusive. รายงาน transport PASS แยกจาก
FULL Gate B; synthetic/fake และ stale dependent dist ไม่ใช่ live acceptance.
ส่งหนึ่ง closeout พร้อม hashes/output inventory/commands/exits/ข้อจำกัด แล้ว STOP.
```

ตรวจ fresh hashes แล้ว R2 สี่ไฟล์ที่แก้, protected IPC/preload และ Contracts JS ตรง closeout; **67/67 เป็นหลักฐาน Serena/Advisor ไม่ใช่การ rerun ในงานนี้** ตรวจ Git ตอนจบ: branch `p0c-hyperv-spike`, HEAD `7e4c546`, staged ว่าง มีงานเดิมจำนวนมากและ Advisor docs อัปเดตระหว่างการอ่าน ผมไม่ได้เขียนไฟล์ใด ๆ

**ลำดับถัดไป: ChatGPT Project Advisor review รายงานนี้และจัด exact R3 consent ให้ Product Owner; จากนั้นจึงส่ง bounded assignment ไป Serena Implementation แชตแยก — Codex STOP.**