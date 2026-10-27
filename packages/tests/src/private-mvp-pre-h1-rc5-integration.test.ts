import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {
  createApprovalRepository,createAuditRepository,createWorkspaceRepository,
  createPrivateMvpMissionAdmissionRepository,openDatabase,
  privateMvpMissionBindingDigest,
} from '@sud-d/infrastructure';
import {createApprovalService} from '@sud-d/application';
import {createPreH1MissionPreparationBridge,observePreH1MissionBudget}
  from '../../desktop/electron/pre-h1-mission-preparation.js';

// ACTUAL RC5 emitted, side-effect-free preflight imported by RC5 Activation.
// No Electron main, Koffi, Win32 DLL or Runner controller is imported here.
import {readApprovedPreH1Diagnostic} from
  '../../desktop/.serena/pre-h1-controller-01-20261009-rc5/infrastructure/dist/private-mvp-pre-h1-diagnostic-preflight.js';

const roots:string[]=[];
const handles:ReturnType<typeof openDatabase>[]=[];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sudd-pre-h1-rc5-contract-'));
  roots.push(root);
  const file=path.join(root,'receipt.sqlite');
  const db=openDatabase(file);
  handles.push(db);
  const approval=createApprovalRepository(db),audit=createAuditRepository(db);
  const workspaces=createWorkspaceRepository(db);
  const ws=workspaces.save('Disposable review workspace',root);workspaces.setActive(ws.id);
  const bridge=createPreH1MissionPreparationBridge({
    db,approvals:approval,workspaces,audit,mode:()=> 'full_access',
    observeBudget:r=>observePreH1MissionBudget(db,r),
  });
  return{root,file,db,bridge,approval,audit,workspaces,ws};
}
async function prepare(f:ReturnType<typeof fixture>){
  const scope=f.bridge.inspect().mission;
  const pending=await f.bridge.request();
  expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(f.db.prepare('SELECT COUNT(*) AS n FROM runner_missions').get()).toEqual({n:0});
  const requestId=pending.approvalRequestId!;
  expect(createApprovalService(f.approval,f.audit).respond(requestId,'approve'))
    .toMatchObject({ok:true,value:{status:'approved',decisionSource:'user'}});
  expect(await f.bridge.request()).toMatchObject({ok:true,code:'EXECUTED',value:{reserved:true}});
  return{scope,requestId};
}
function reopen(f:ReturnType<typeof fixture>){
  f.db.close();
  const again=openDatabase(f.file);handles.push(again);
  return again;
}
afterEach(()=>{
  for(const db of handles.splice(0))if(db.open)db.close();
  for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});
});
describe('RC5 emitted diagnostic preflight: trusted Kernel HMAC -> F2-A Mission SHA',()=>{
  it('RC5 compiled activation has a CLOSED second Owner native consent gate before Win32 binding',()=>{
    const source=fs.readFileSync(path.join(process.cwd(),
      'packages/desktop/.serena/pre-h1-controller-01-20261009-rc5/infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'),'utf8');
    expect(source).toContain('export const PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED = false');
    const stop=source.indexOf('PRE_H1_RC5_SEPARATE_NATIVE_OWNER_CONSENT_REQUIRED');
    const bind=source.indexOf('bindF2H1DesktopRunnerWin32().createFixedDesktopSession');
    expect(stop).toBeGreaterThan(0);
    expect(bind).toBeGreaterThan(stop);
  });
  it('accepts exact manually approved reserved Mission after SQLite close and reopen',async()=>{
    const f=fixture(),{scope,requestId}=await prepare(f),again=reopen(f);
    const prepared=readApprovedPreH1Diagnostic(again,new Date());
    expect(prepared.scope).toEqual(scope);
    expect(prepared.attemptId).toBe('pre-h1-controller-01-attempt-01');
    expect(again.prepare('SELECT approval_id FROM runner_missions').get())
      .toEqual({approval_id:requestId});
    const approval=again.prepare('SELECT binding_digest,decision_source,status FROM approval_requests WHERE id=?')
      .get(requestId) as {binding_digest:string;decision_source:string;status:string};
    expect(approval).toMatchObject({status:'consumed',decision_source:'user'});
    expect(approval.binding_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.binding_digest).not.toBe(privateMvpMissionBindingDigest(scope));
    expect(again.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
      .toEqual({launch_claimed_at:null});
    expect(again.prepare('SELECT COUNT(*) AS n FROM runner_mission_native_attempts').get())
      .toEqual({n:0});
    expect(again.prepare('SELECT status FROM runner_missions').get())
      .toEqual({status:'active'});
  });
  for(const [name,mutate] of [
    ['HMAC tag no longer matches receipt commitment',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE approval_requests SET binding_digest=?').run('f'.repeat(64))],
    ['changed Mission SHA after trusted enrollment',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE runner_missions SET goal_digest=?').run('f'.repeat(64))],
    ['mismatched Approval ID',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE runner_missions SET approval_id=?').run('other-approval-id')],
    ['wrong capability',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE approval_requests SET capability=?').run('runner.mission')],
    ['mode approval instead of manual user',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE approval_requests SET decision_source=?').run('mode')],
    ['replayed launch claim',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE runner_mission_attempts SET launch_claimed_at=?')
        .run(new Date().toISOString())],
    ['stale active Workspace generation',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE workspaces SET updated_at=? WHERE is_active=1')
        .run('2026-01-01T00:00:00.000Z')],
    ['expired Mission',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE runner_missions SET expires_at=?').run('2001-01-01T00:00:00.000Z')],
    ['expired original Approval',(db:ReturnType<typeof openDatabase>)=>
      db.prepare('UPDATE approval_requests SET expires_at=?').run('2001-01-01T00:00:00.000Z')],
    ['unresolved native journal occupied',(db:ReturnType<typeof openDatabase>)=>{
      db.prepare(`INSERT INTO runner_mission_native_attempts
       (attempt_id,mission_id,state,owner_epoch,stage_seal_digest,prepared_at,updated_at)
       VALUES ('pre-h1-controller-01-attempt-01','pre-h1-controller-01','pending',
        'pre-h1-controller-01-epoch-01',?, ?,?)`)
        .run('a'.repeat(64),new Date().toISOString(),new Date().toISOString());
    }],
    ['missing trusted receipt enrollment audit',(db:ReturnType<typeof openDatabase>)=>
      db.prepare("DELETE FROM audit_events WHERE action='runner.mission.enroll'").run()],
    ['missing Kernel authorization audit',(db:ReturnType<typeof openDatabase>)=>
      db.prepare("DELETE FROM audit_events WHERE action='tool_kernel.invoke' AND result_code='EXECUTION_AUTHORIZED'").run()],
  ] as const){
    it('rejects '+name,async()=>{
      const f=fixture();await prepare(f);
      const db=reopen(f);mutate(db);
      expect(()=>readApprovedPreH1Diagnostic(db,new Date())).toThrow(/^PRE_H1_/);
    });
  }
  it('fails closed on a forged receipt with no Desktop Kernel authority',()=>{
    const f=fixture(),scope=f.bridge.inspect().mission;
    const repo=createPrivateMvpMissionAdmissionRepository(f.db);
    const result=repo.enrollApproved(scope,'fake-runtime',{
      requestId:'fake-request',runtimeInstanceId:'fake-runtime',
      kernelBindingDigest:'b'.repeat(64),missionBindingDigest:privateMvpMissionBindingDigest(scope),
      workspaceGeneration:scope.workspaceGeneration,revision:scope.revision,
      policyIdentity:scope.resourcePolicyIdentity,expiresAt:scope.expiresAt,
    });
    expect(result).toMatchObject({ok:false,error:{code:'RUNNER_APPROVAL_STALE'}});
    expect(repo.enrollApproved(scope,'fake-runtime'))
      .toMatchObject({ok:false,error:{code:'RUNNER_APPROVAL_STALE'}});
  });
  it('rolls back Enrollment when existing F2-A Audit insert fails',async()=>{
    const f=fixture();
    // Disposable-only SQLite fault injection. The trusted application still
    // calls the unmodified F2-A transaction and cannot skip its Audit write.
    f.db.exec(`CREATE TRIGGER test_fail_pre_h1_enroll_audit
      BEFORE INSERT ON audit_events WHEN NEW.action='runner.mission.enroll'
      BEGIN SELECT RAISE(ABORT,'TEST_F2A_AUDIT_FAILURE'); END`);
    const pending=await f.bridge.request();
    expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(createApprovalService(f.approval,f.audit)
      .respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
    expect(await f.bridge.request()).toMatchObject({ok:false,code:'EXECUTION_FAILED'});
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM runner_missions').get()).toEqual({n:0});
    expect(f.db.prepare('SELECT COUNT(*) AS n FROM runner_mission_attempts').get()).toEqual({n:0});
  });
});
