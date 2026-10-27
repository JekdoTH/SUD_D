import { afterAll, describe, expect, it } from 'vitest';
import { createApprovalRepository } from '../../infrastructure/src/approval-repository.js';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import { createToolKernel, createToolCapabilityRegistry } from '../../application/src/tool-kernel.js';
import { createSoloExpertB1aIntegration, soloB1ReviewProjection } from '../../application/src/solo-expert-serena-integration.js';
import type { SoloExpertReview } from '../../application/src/solo-expert-serena-integration.js';
import type { AuditEvent } from '../../domain/src/index.js';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../infrastructure/src/database.js';
import { createSoloExpertAttemptRepository } from '../../infrastructure/src/solo-expert-serena-attempt-repository.js';
import { createWorkspaceRepository } from '../../infrastructure/src/workspace-repository.js';

// One task-owned disposable directory for all controlled G2 continuation file-backed cases.
let taskDir: string | undefined;
function ownedTestDir(): string {
  return taskDir ??= mkdtempSync(join(tmpdir(),'sud-d-b1b-g2-continuation-'));
}
afterAll(() => {
  if(taskDir) {rmSync(taskDir,{recursive:true,force:true});taskDir=undefined;}
});
const digest = 'a'.repeat(64);
const now = '2026-10-14T11:00:00.000Z';
const until = '2026-10-14T11:01:00.000Z';
function setup() {
  const db = openDatabase(':memory:');
  const a = createSoloExpertAttemptRepository(db);
  return {db,a};
}
const prepared = (id: string) => ({
  attemptId: id, workspaceId:'test-workspace', workspaceGeneration:'1',
  reviewDigest: digest, createdAt:now, expiresAt:until,
});
describe('B1b Stage I real SQLite attempt durability', () => {
  it('migrates 001–013 in memory and allows exactly one unresolved across repository instances', async () => {
    const {db,a}=setup();
    try {
      expect(db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get()).toMatchObject({v:13});
      const b=createSoloExpertAttemptRepository(db);
      expect(await a.prepare(prepared('attempt-one'))).toBe(true);
      expect(await b.prepare(prepared('attempt-two'))).toBe(false);
      expect(await b.state('attempt-one')).toBe('prepared');
      expect(await b.revoke('attempt-one')).toBe(true);
      expect(await a.prepare(prepared('attempt-two'))).toBe(true);
      expect(await a.prepare(prepared('attempt-two'))).toBe(false);
    } finally {db.close();}
  });
  it('refuses claim until exact consumed user approval and immutable review digest match',async()=>{
    const {db,a}=setup();
    try {
      expect(await a.prepare(prepared('attempt-one'))).toBe(true);
      expect(await a.claim('attempt-one','untrusted-id',now)).toBe(false);
      expect(await a.state('attempt-one')).toBe('prepared');
    }finally{db.close();}
  });
  it('workspace generation increments for selection away/back even when clock does not change',()=>{
    const {db}=setup();
    try{
      const w=createWorkspaceRepository(db);
      const first=w.save('A','C:/b1b-a');
      const second=w.save('B','C:/b1b-b');
      w.setActive(first.id);
      const g1=w.getGeneration(first.id);
      w.setActive(second.id);w.setActive(first.id);
      expect(Number(w.getGeneration(first.id))).toBeGreaterThan(Number(g1));
      expect(w.findById(first.id)?.canonicalRoot).toBe('C:/b1b-a');
    }finally{db.close();}
  });
  it('two SQLite connections atomically admit once; consumed user review must match and unknown cannot be retried', async()=>{
    const {db,a}=setup();
    try{
      const b=createSoloExpertAttemptRepository(db);
      expect(await a.prepare(prepared('first'))).toBe(true);
      db.prepare([
        "INSERT INTO approval_requests(id,runtime_instance_id,binding_digest,session_id,session_type,",
        "capability,effect,sensitivity,policy_context,workspace_id,safe_title,status,",
        "created_at,expires_at,decided_at,consumed_at,decision_source,solo_review_digest)",
        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      ].join(' ')).run('one-approval','gateway','f'.repeat(64),'session','mcp-stdio',
        'solo_expert.smoke','execute','sensitive','workspace','test-workspace','reviewed',
        'consumed',now,until,now,now,'user',digest);
      expect(await a.claim('first','wrong',now)).toBe(false);
      expect(await a.claim('first','one-approval',now)).toBe(true);
      expect(await b.claim('first','one-approval',now)).toBe(false);
      expect(await b.prepare(prepared('second'))).toBe(false);
      await b.markUnknown('first');
      expect(await a.state('first')).toBe('unknown');
      expect(await b.prepare(prepared('second'))).toBe(false);
      expect(await b.close('first')).toBe(false);
    }finally{db.close();}
  });
  it('file-backed claimed fence survives independent Electron test-process restart; cleanup touches only owned TEMP', async()=>{
    const dir=ownedTestDir();
    const file=join(dir,'attempts.db');
    let first: ReturnType<typeof openDatabase> | undefined;
    try{
      first=openDatabase(file);
      const a=createSoloExpertAttemptRepository(first);
      expect(await a.prepare(prepared('restart-attempt'))).toBe(true);
      first.prepare([
        'INSERT INTO approval_requests (id,runtime_instance_id,binding_digest,session_id,session_type,',
        'capability,effect,sensitivity,policy_context,workspace_id,safe_title,status,',
        'created_at,expires_at,decided_at,consumed_at,decision_source,solo_review_digest)',
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ].join(' ')).run('reopen-approval','gateway','f'.repeat(64),'session','mcp-stdio',
        'solo_expert.smoke','execute','sensitive','workspace','test-workspace','reviewed',
        'consumed',now,until,now,now,'user',digest);
      expect(await a.claim('restart-attempt','reopen-approval',now)).toBe(true);
      first.close(); first=undefined;
      const code=[
        "const D=require('./packages/infrastructure/node_modules/better-sqlite3');",
        "const db=new D(process.argv[1],{readonly:true,fileMustExist:true});",
        "const rows=db.prepare('SELECT state,approval_id FROM solo_expert_attempts WHERE attempt_id=?').get('restart-attempt');",
        "const pending=db.prepare(\"SELECT count(*) AS count FROM solo_expert_attempts WHERE state IN ('prepared','claimed','unknown')\").get();",
        "console.log(JSON.stringify({rows,pending,abi:process.versions.modules}));",
        "db.close();",
      ].join('');
      const child=spawnSync(join(process.cwd(),'node_modules','electron','dist','electron.exe'),
        ['-e',code,file],{
          cwd:process.cwd(),encoding:'utf8',timeout:7500,
          env:{ELECTRON_RUN_AS_NODE:'1',
            SystemRoot:process.env.SystemRoot ?? 'C:\\Windows',
            Path:process.env.Path ?? process.env.PATH ?? ''},
        });
      expect(child.status,child.stderr).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual({
        rows:{state:'claimed',approval_id:'reopen-approval'},
        pending:{count:1},abi:'135',
      });
      const reopened=openDatabase(file);
      try{
        const b=createSoloExpertAttemptRepository(reopened);
        expect(await b.prepare(prepared('after-crash'))).toBe(false);
        await b.markUnknown('restart-attempt');
        expect(await b.state('restart-attempt')).toBe('unknown');
        expect(await b.prepare(prepared('after-unknown'))).toBe(false);
      }finally{reopened.close();}
    }finally{
      first?.close();
      expect(readdirSync(dir).every(name=>/^attempts\.db(?:-wal|-shm)?$/.test(name))).toBe(true);
      expect(existsSync(dir)).toBe(true); // afterAll owns the only TEMP-directory cleanup
    }
  });
});

const workerDb = process.env.SUD_D_G2A_WORKER_DB;
const workerApprovalId = process.env.SUD_D_G2A_WORKER_APPROVAL;
describe('G2a controlled synthetic decision worker (never product Desktop)',()=>{
  it.skipIf(!workerDb || !workerApprovalId)('G2a worker decision: actual separate test process uses ApprovalService with exact stored review digest',()=>{
    if(!workerDb||!workerApprovalId)throw Error('worker input missing');
    const db=openDatabase(workerDb);
    try {
      const repo=createApprovalRepository(db);
      const row=repo.findById(workerApprovalId);
      if(!row.ok||!row.value?.soloExpertReview)throw Error('worker missing reviewed grant');
      const decision=createApprovalService(repo,{append:()=>undefined},()=>new Date());
      expect(decision.respond(workerApprovalId,'approve',row.value.soloExpertReview.reviewDigest).ok).toBe(true);
      const after=repo.findById(workerApprovalId);
      expect(after.ok&&after.value?.decisionSource).toBe('user');
      expect(after.ok&&after.value?.status).toBe('approved');
    }finally{db.close();}
  });
});
describe('G2a separate-process manual decision and SQLite restart fences',()=>{
  it('prepared orphan remains fenced after separate DB reopen; Workspace generation persists across same-clock selection',async()=>{
    const file=join(ownedTestDir(),'prepared-orphan.db');
    const db=openDatabase(file);
    let workspaceId:string;let otherId:string;let priorGeneration:string|undefined;
    try{
      const workspaceRepo=createWorkspaceRepository(db);
      const a=workspaceRepo.save('A','C:/synthetic-g2a-root-a');
      const b=workspaceRepo.save('B','C:/synthetic-g2a-root-b');
      workspaceRepo.setActive(a.id);
      workspaceId=a.id;otherId=b.id;
      priorGeneration=workspaceRepo.getGeneration(a.id);
      expect(await createSoloExpertAttemptRepository(db).prepare(prepared('orphan-after-restart'))).toBe(true);
    }finally{db.close();}
    const reopened=openDatabase(file);
    try{
      const w=createWorkspaceRepository(reopened);
      expect(w.getGeneration(workspaceId)).toBe(priorGeneration);
      w.setActive(otherId);w.setActive(workspaceId);
      expect(Number(w.getGeneration(workspaceId))).toBeGreaterThan(Number(priorGeneration));
      const ledger=createSoloExpertAttemptRepository(reopened);
      expect(await ledger.state('orphan-after-restart')).toBe('prepared');
      expect(await ledger.hasUnresolved()).toBe(true);
      expect(await ledger.prepare(prepared('restarted-new-session'))).toBe(false);
    }finally{reopened.close();}
  });
  it('real second Electron-as-Node Vitest process approves stored exact digest; original coordinator HMAC consumes and fake executes once',async()=>{
    const file=join(ownedTestDir(),'decision.db');
    const db=openDatabase(file);
    try{
      const approvalRepo=createApprovalRepository(db);
      const ledger=createSoloExpertAttemptRepository(db);
      const timestamp=Date.now();const clock=()=>new Date(timestamp);
      const coordinator=createApprovalCoordinator({
        repository:approvalRepo,runtimeInstanceId:'g2a-original-gateway',
        hmacKey:Buffer.alloc(32,41),now:clock,mode:()=>'full_access',preserveOtherRuntimes:true,
      });
      const state={
        workspaceId:'test-workspace',canonicalRoot:'C:/g2a-synthetic-workspace',workspaceGeneration:'3',
        session:{id:'g2a-original-mcp-session',type:'mcp-stdio' as const},
        resumed:true,revoked:false,policyContext:'workspace' as const,
        gatewayEpoch:'g2a-gateway-epoch',managedEpoch:'g2a-managed-epoch',
        deviceLabel:'synthetic-device',deviceProvenance:'unverified-observation' as const,
        accountLabel:'synthetic-account',accountProvenance:'unverified-observation' as const,
        manifestDigest:'a'.repeat(64),artifactDigest:'b'.repeat(64),
        configDigest:'c'.repeat(64),schemaDigest:'d'.repeat(64),integrity:'synthetic-fixture' as const,
      };
      const invokes:SoloExpertReview[]=[];
      const audits:Array<Omit<AuditEvent,'id'>>=[];
      const integration=createSoloExpertB1aIntegration({
        identity:()=>state,
        ready:{
          inspect:()=>({
            workspaceId:state.workspaceId,canonicalRoot:state.canonicalRoot,
            workspaceGeneration:state.workspaceGeneration,managedEpoch:state.managedEpoch,
            manifestDigest:state.manifestDigest,artifactDigest:state.artifactDigest,
            configDigest:state.configDigest,schemaDigest:state.schemaDigest,integrity:state.integrity,
          }),
          invoke:async(review)=>{invokes.push(review);return {
            executionKind:'mock' as const,status:'simulated-success' as const,reason:'OK' as const,exitCode:0,
          };},
        },
        ledger:{
          prepare:(review)=>ledger.prepare({
            attemptId:review.attemptId,workspaceId:review.workspaceId,
            workspaceGeneration:review.workspaceGeneration,
            reviewDigest:soloB1ReviewProjection(review).reviewDigest,
            createdAt:new Date(review.issuedAtMs).toISOString(),
            expiresAt:new Date(review.expiresAtMs).toISOString(),
          }),
          claim:(id,approvalId)=>ledger.claim(id,approvalId,clock().toISOString()),
          close:(id)=>ledger.close(id),markUnknown:(id)=>ledger.markUnknown(id),state:(id)=>ledger.state(id),
        },
        approvals:{findById:(id)=>approvalRepo.findById(id)},
        verifyConsumedManual:async({request,approvalRequestId,record})=>
          coordinator.verifyConsumedManualSolo(request,approvalRequestId)===record.bindingDigest,
        coordinatorRuntimeId:coordinator.runtimeInstanceId,now:()=>timestamp,
      });
      const registry=createToolCapabilityRegistry([integration.capability]);
      if(!registry.ok)throw Error('synthetic test registry invalid');
      const kernel=createToolKernel({registry:registry.value,audit:{append:(event)=>{audits.push(event);}},
        approval:coordinator});
      const preparedReview=await integration.prepare({});
      if(!preparedReview.ok)throw Error('synthetic prepare denied');
      const review=preparedReview.value;
      const pending=await integration.invokeThroughKernel(kernel,review);
      if(pending.ok||!pending.approvalRequestId)throw Error('expected approval required');
      expect(pending.code).toBe('APPROVAL_REQUIRED');
      expect(invokes).toHaveLength(0);
      const worker=spawnSync(join(process.cwd(),'node_modules','electron','dist','electron.exe'),[
        'node_modules/vitest/vitest.mjs','run',
        'packages/tests/src/solo-expert-serena-persistence.test.ts',
        '-t','G2a worker decision:', '--reporter=default','--pool=forks',
        '--maxWorkers=1','--minWorkers=1',
      ],{
        cwd:process.cwd(),encoding:'utf8',timeout:18000,
        env:{
          ELECTRON_RUN_AS_NODE:'1',
          SUD_D_G2A_WORKER_DB:file,
          SUD_D_G2A_WORKER_APPROVAL:pending.approvalRequestId,
          SystemRoot:process.env.SystemRoot??'C:\\Windows',
          Path:process.env.Path??process.env.PATH??'',
          TEMP:process.env.TEMP??tmpdir(),
        },
      });
      expect(worker.status,worker.stderr+'\n'+worker.stdout).toBe(0);
      expect(worker.stdout).toContain('1 passed');
      const stored=approvalRepo.findById(pending.approvalRequestId);
      if(!stored.ok||!stored.value)throw Error('worker decision not durable');
      expect(stored.value.status).toBe('approved');
      expect(stored.value.decisionSource).toBe('user');
      // Original in-memory frozen review + original coordinator/HMAC are intentionally not serialized to worker.
      expect(integration.getReview(review.attemptId)).toBe(review);
      const admitted=await integration.invokeThroughKernel(kernel,review);
      expect(admitted).toMatchObject({ok:true,code:'EXECUTED',value:{executionKind:'mock'}});
      expect(invokes).toHaveLength(1);
      expect(await ledger.state(review.attemptId)).toBe('closed');
      expect(audits.some(event=>event.metadata.phase==='pre_execution')).toBe(true);
      expect(audits.some(event=>event.metadata.phase==='outcome')).toBe(true);
      expect((await integration.invokeThroughKernel(kernel,review)).ok).toBe(false);
      expect(invokes).toHaveLength(1);
      const independentlyReopened=openDatabase(file);
      try{
        expect(await createSoloExpertAttemptRepository(independentlyReopened).state(review.attemptId)).toBe('closed');
      }finally{independentlyReopened.close();}
    }finally{db.close();}
  },30000);
  it('two independent file SQLite connections reject second claim; claimed and UNKNOWN survive reopen with prepared orphan fence',async()=>{
    const file=join(ownedTestDir(),'fence.db');
    const first=openDatabase(file);const second=openDatabase(file);
    try{
      const a=createSoloExpertAttemptRepository(first);
      const b=createSoloExpertAttemptRepository(second);
      expect(await a.prepare(prepared('parallel-claimed'))).toBe(true);
      first.prepare([
        'INSERT INTO approval_requests (id,runtime_instance_id,binding_digest,session_id,session_type,',
        'capability,effect,sensitivity,policy_context,workspace_id,safe_title,status,',
        'created_at,expires_at,decided_at,consumed_at,decision_source,solo_review_digest)',
        'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ].join(' ')).run('same-review','synthetic-gateway','f'.repeat(64),'original-session','mcp-stdio',
        'solo_expert.smoke','execute','sensitive','workspace','test-workspace','reviewed',
        'consumed',now,until,now,now,'user',digest);
      const results=await Promise.all([
        a.claim('parallel-claimed','same-review',now),
        b.claim('parallel-claimed','same-review',now),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await b.state('parallel-claimed')).toBe('claimed');
      expect(await a.prepare(prepared('after-claimed'))).toBe(false);
      first.close();second.close();
      const third=openDatabase(file);
      try{
        const reopened=createSoloExpertAttemptRepository(third);
        expect(await reopened.state('parallel-claimed')).toBe('claimed');
        expect(await reopened.prepare(prepared('after-restart'))).toBe(false);
        await reopened.markUnknown('parallel-claimed');
        expect(await reopened.state('parallel-claimed')).toBe('unknown');
        expect(await reopened.prepare(prepared('after-unknown'))).toBe(false);
        expect(await reopened.close('parallel-claimed')).toBe(false);
      }finally{third.close();}
    }finally{
      // Connections are already closed before restart (do not touch Product DB).
      try{first.close();}catch{ /* already closed for restart proof */ }
      try{second.close();}catch{ /* already closed for restart proof */ }
    }
  });
});
