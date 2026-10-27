import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
// No native addon is loaded. Node 24 built-in SQLite, disposable files only.
vi.mock('better-sqlite3',async()=>({default:(await import('./private-mvp-pre-h1-test-sqlite-adapter.js')).DisposableBetterSqlite3Adapter}));
import {
  openDatabase,createApprovalRepository,createAuditRepository,createWorkspaceRepository,
} from '@sud-d/infrastructure';
import {createApprovalService} from '@sud-d/application';
import {createPreH1MissionPreparationBridge,observePreH1MissionBudget}
  from '../../desktop/electron/pre-h1-mission-preparation.js';
import {createPreH1NativeConsentBridge} from '../../desktop/electron/pre-h1-native-consent.js';
import {consumePreH1NativeAuthorization}
  from '../../infrastructure/src/private-mvp-pre-h1-native-consent.js';
import type {PreH1NativeArtifactIdentity}
  from '../../infrastructure/src/private-mvp-pre-h1-native-consent-contract.js';
const artifacts:PreH1NativeArtifactIdentity=Object.freeze({
  rc5InventorySha:'a'.repeat(64),rc5ExternalSha:'b'.repeat(64),
  nativeCandidateInventorySha:'c'.repeat(64),nativeMainSha:'d'.repeat(64),
  rc5MainSha:'e'.repeat(64),rc5ActivationSha:'f'.repeat(64),
});
const roots:string[]=[];
const dbs:ReturnType<typeof openDatabase>[]=[];
function fixture(mode:'standard'|'full_access'|'approve_for_me'='full_access',
  pinSet:PreH1NativeArtifactIdentity=artifacts,failKernelOutcome=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sudd-preh1-native-consent-'));
  roots.push(root);const file=path.join(root,'native-consent.sqlite');
  const db=openDatabase(file);dbs.push(db);
  const approvals=createApprovalRepository(db);
  const audit=createAuditRepository(db);
  const workspaces=createWorkspaceRepository(db);
  const ws=workspaces.save('Disposable Native Consent',root);
  workspaces.setActive(ws.id);
  const prep=createPreH1MissionPreparationBridge({
    db,approvals,workspaces,audit,mode:()=>mode,
    observeBudget:r=>observePreH1MissionBudget(db,r),
  });
  const nativeAudit=failKernelOutcome?{
    append(event:Parameters<typeof audit.append>[0]){
      if(event.action==='tool_kernel.invoke'&&event.resultCode==='EXECUTED'
        &&event.metadata?.capability==='pre-h1.native-consent')
        throw Error('TEST_KERNEL_OUTCOME_AUDIT_FAILURE');
      return audit.append(event);
    },
  }:audit;
  const native=createPreH1NativeConsentBridge({
    db,approvals,audit:nativeAudit,mode:()=>mode,artifactReader:()=>pinSet,
  });
  return {root,file,db,approvals,audit,workspaces,prep,native};
}
async function prepare(f:ReturnType<typeof fixture>){
  const pending=await f.prep.request();
  expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  const response=createApprovalService(f.approvals,f.audit)
    .respond(pending.approvalRequestId!,'approve');
  expect(response).toMatchObject({ok:true,value:{decisionSource:'user'}});
  expect(await f.prep.request()).toMatchObject({ok:true,code:'EXECUTED'});
  return pending.approvalRequestId!;
}
async function grant(f:ReturnType<typeof fixture>){
  const prepId=await prepare(f);
  const reviewed=f.native.inspect();
  expect(reviewed.preparationApprovalId).toBe(prepId);
  const pending=await f.native.request();
  expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  const requestId=pending.approvalRequestId!;
  expect(requestId).not.toBe(prepId);
  expect(f.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.grant'").get())
    .toEqual({n:0});
  expect(createApprovalService(f.approvals,f.audit)
    .respond(requestId,'approve')).toMatchObject({ok:true,value:{decisionSource:'user'}});
  expect(await f.native.request()).toMatchObject({ok:true,code:'EXECUTED',value:{recorded:true}});
  return {prepId,requestId,reviewed};
}
const reopen=(f:ReturnType<typeof fixture>)=>{
  f.db.close();const db=openDatabase(f.file);dbs.push(db);return db;
};
afterEach(()=>{
  for(const db of dbs.splice(0))if(db.open)db.close();
  for(const r of roots.splice(0))fs.rmSync(r,{recursive:true,force:true});
});
describe('Second PRE-H1 one-use native consent via genuine private Kernel & Audit',()=>{
  it('full_access mode cannot auto-grant; manual approve then reopen and consume once',async()=>{
    const f=fixture('full_access');
    const {prepId,requestId}=await grant(f);
    const db=reopen(f);
    const proof=consumePreH1NativeAuthorization(db,new Date(),artifacts);
    expect(proof.nativeApprovalId).toBe(requestId);
    expect(proof.scope.preparationApprovalId).toBe(prepId);
    expect(proof.scope.maxActiveMs).toBe(30_000);
    expect(proof.scope.maxRetries).toBe(0);
    expect(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.consume'").get())
      .toEqual({n:1});
    expect(db.prepare('SELECT COUNT(*) n FROM runner_mission_native_attempts').get())
      .toEqual({n:0});
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts))
      .toThrow(/REPLAYED/);
  });
  it('rejects no Native consent even with valid Preparation',async()=>{
    const f=fixture();await prepare(f);
    expect(()=>consumePreH1NativeAuthorization(reopen(f),new Date(),artifacts))
      .toThrow(/MISSING_OR_REPLAYED/);
  });
  it('refuses forged approval metadata / HMAC commitment',async()=>{
    const f=fixture();const {requestId}=await grant(f);const db=reopen(f);
    db.prepare('UPDATE approval_requests SET binding_digest=? WHERE id=?')
      .run('0'.repeat(64),requestId);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts))
      .toThrow(/MANUAL_APPROVAL_INVALID/);
  });
  it('refuses mode-approved row even if grant exists',async()=>{
    const f=fixture();const {requestId}=await grant(f);const db=reopen(f);
    db.prepare("UPDATE approval_requests SET decision_source='mode' WHERE id=?").run(requestId);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts))
      .toThrow(/MANUAL_APPROVAL_INVALID/);
  });
  it('refuses changed candidate binary hash / inventory identity',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),
      {...artifacts,nativeMainSha:'0'.repeat(64)})).toThrow(/GRANT_PROVENANCE_INVALID/);
  });
  it('refuses stale Workspace generation',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    db.prepare("UPDATE workspaces SET updated_at='2026-01-01T00:00:00.000Z' WHERE is_active=1").run();
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/PRE_H1_/);
  });
  it('refuses expired Mission (retains the original four-minute window)',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    const expired=new Date(Date.now()+5*60_000);
    expect(()=>consumePreH1NativeAuthorization(db,expired,artifacts)).toThrow(/PRE_H1_/);
  });
  it('refuses occupied Native Journal',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    const now=new Date().toISOString();
    db.prepare(`INSERT INTO runner_mission_native_attempts
      (attempt_id,mission_id,state,owner_epoch,stage_seal_digest,prepared_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run(
      'pre-h1-controller-01-attempt-01','pre-h1-controller-01','pending',
      'pre-h1-controller-01-epoch-01','0'.repeat(64),now,now);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/PRE_H1_/);
  });
  it('Audit failure rolls back one-use consumption',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    db.exec(`CREATE TRIGGER native_test_fail_consume BEFORE INSERT ON audit_events
      WHEN NEW.action='pre-h1.native.consume'
      BEGIN SELECT RAISE(ABORT,'NATIVE_TEST_AUDIT_FAIL'); END`);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow();
    expect(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.consume'").get())
      .toEqual({n:0});
    db.exec('DROP TRIGGER native_test_fail_consume');
    expect(consumePreH1NativeAuthorization(db,new Date(),artifacts).nativeApprovalId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('refuses missing original Kernel audit',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    db.prepare("DELETE FROM audit_events WHERE action='tool_kernel.invoke' AND session_id='pre-h1-native-desktop-owner'").run();
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/KERNEL_AUDIT_MISSING/);
  });
  it('compiled diagnostic one-use consent accepts exact frozen bytes after SQLite reopen',async()=>{
    const contract=await import('../../desktop/.serena/pre-h1-controller-01-20261009-native2/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
    const emitted=await import('../../desktop/.serena/pre-h1-controller-01-20261009-native2/infrastructure/dist/private-mvp-pre-h1-native-consent.js');
    const exact=contract.readVerifiedPreH1NativeArtifacts();
    const f=fixture('full_access',exact);
    const {requestId}=await grant(f);
    const db=reopen(f);
    expect(emitted.consumePreH1NativeAuthorization(db,new Date()).nativeApprovalId).toBe(requestId);
    expect(()=>emitted.consumePreH1NativeAuthorization(db,new Date())).toThrow(/REPLAYED/);
  });
  it('refuses expired second Native Approval without extending Mission',async()=>{
    const f=fixture();const {requestId}=await grant(f);const db=reopen(f);
    db.prepare("UPDATE approval_requests SET expires_at='2001-01-01T00:00:00.000Z' WHERE id=?").run(requestId);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/MANUAL_APPROVAL_INVALID/);
  });
  it('rejects a failed durable GRANT audit and issues no durable native authorization',async()=>{
    const f=fixture();await prepare(f);
    f.db.exec(`CREATE TRIGGER test_grant_audit_fail BEFORE INSERT ON audit_events
      WHEN NEW.action='pre-h1.native.grant' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILED'); END`);
    const p=await f.native.request();
    expect(p).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(createApprovalService(f.approvals,f.audit).respond(p.approvalRequestId!,'approve')).toMatchObject({ok:true});
    expect(await f.native.request()).not.toMatchObject({ok:true,code:'EXECUTED'});
    expect(f.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.grant'").get()).toEqual({n:0});
  });
  it('reopen on a second connection cannot consume an already used Native grant',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    const independent=openDatabase(f.file);dbs.push(independent);
    consumePreH1NativeAuthorization(db,new Date(),artifacts);
    expect(()=>consumePreH1NativeAuthorization(independent,new Date(),artifacts)).toThrow(/REPLAYED/);
  });
  it('refuses orphaned Grant without successful Kernel outcome Audit',async()=>{
    const f=fixture();const {requestId}=await grant(f);const db=reopen(f);
    db.prepare("DELETE FROM audit_events WHERE action='tool_kernel.invoke' AND result_code='EXECUTED' AND session_id='pre-h1-native-desktop-owner'").run();
    expect(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.grant'").get()).toEqual({n:1});
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/KERNEL_OUTCOME/);
  });
  it('rejects failed or inconsistent Kernel outcome while valid Grant remains',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    db.prepare("UPDATE audit_events SET result_code='EXECUTION_FAILED' WHERE action='tool_kernel.invoke' AND result_code='EXECUTED' AND session_id='pre-h1-native-desktop-owner'").run();
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/KERNEL_OUTCOME/);
  });
  it('real Kernel outcome append failure leaves an orphaned Grant but cannot authorize Native',async()=>{
    const f=fixture('full_access',artifacts,true);await prepare(f);
    const pending=await f.native.request();
    expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(createApprovalService(f.approvals,f.audit).respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
    const completion=await f.native.request();
    expect(completion).toMatchObject({ok:false,code:'AUDIT_OUTCOME_FAILED'});
    const db=reopen(f);
    expect(db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.grant'").get()).toEqual({n:1});
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/KERNEL_OUTCOME/);
  });
  it('rejects a changed Kernel outcome invocation even if Approval ID matches',async()=>{
    const f=fixture();await grant(f);const db=reopen(f);
    const row=db.prepare("SELECT id,metadata FROM audit_events WHERE action='tool_kernel.invoke' AND result_code='EXECUTED' AND session_id='pre-h1-native-desktop-owner'").get() as {id:string;metadata:string};
    const m=JSON.parse(row.metadata);m.invocationId='00000000-0000-4000-8000-000000000000';
    db.prepare('UPDATE audit_events SET metadata=? WHERE id=?').run(JSON.stringify(m),row.id);
    expect(()=>consumePreH1NativeAuthorization(db,new Date(),artifacts)).toThrow(/KERNEL_OUTCOME/);
  });
  it('refuses denied Native request and never inserts grant',async()=>{
    const f=fixture();await prepare(f);
    const pending=await f.native.request();
    expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(createApprovalService(f.approvals,f.audit)
      .respond(pending.approvalRequestId!,'deny')).toMatchObject({ok:true});
    expect(await f.native.request()).not.toMatchObject({ok:true,code:'EXECUTED'});
    expect(f.db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='pre-h1.native.grant'").get())
      .toEqual({n:0});
  });
});
