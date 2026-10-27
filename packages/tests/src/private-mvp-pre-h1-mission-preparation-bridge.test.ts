import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {
  createApprovalRepository,createAuditRepository,createWorkspaceRepository,
  createPrivateMvpMissionAdmissionRepository,openDatabase,privateMvpMissionBindingDigest,
} from '@sud-d/infrastructure';
import {createApprovalService,createApprovalModeService} from '@sud-d/application';
import {createDesktopApprovalController} from '../../desktop/electron/approval-controller.js';
import {createApprovalModeRepository} from '@sud-d/infrastructure';
import {createPreH1MissionPreparationBridge,observePreH1MissionBudget}
  from '../../desktop/electron/pre-h1-mission-preparation.js';

const dirs:string[]=[];
const dbs:ReturnType<typeof openDatabase>[]=[];
function setup(mode:'standard'|'approve_for_me'|'full_access'='standard') {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sud-pre-h1-bridge-'));
  dirs.push(dir);
  const db=openDatabase(path.join(dir,'test.sqlite'));dbs.push(db);
  const approvals=createApprovalRepository(db);
  const audit=createAuditRepository(db);
  const workspaceRepo=createWorkspaceRepository(db);
  const saved=workspaceRepo.save('Bridge test Workspace',dir);
  workspaceRepo.setActive(saved.id);
  const owner=createApprovalService(approvals,audit);
  const bridge=createPreH1MissionPreparationBridge({
    db,approvals,workspaces:workspaceRepo,audit,mode:()=>mode,
    observeBudget:root=>observePreH1MissionBudget(db,root),
  });
  return {dir,db,approvals,owner,bridge,workspaceRepo,saved};
}
afterEach(()=>{
  for(const db of dbs.splice(0))if(db.open)db.close();
  for(const dir of dirs.splice(0))fs.rmSync(dir,{recursive:true,force:true});
});

describe('PRE-H1 private Desktop Kernel → manual Owner → one-use F2-A bridge',()=>{
 for(const mode of ['standard','approve_for_me','full_access'] as const) {
  it('requires a real Owner decision before enrollment in '+mode+' mode',async()=>{
    const{db,owner,bridge}=setup(mode);
    const review=bridge.inspect();
    expect(review.mission.missionId).toBe('pre-h1-controller-01');
    expect(review.mission.runnerId).toBe('fixed-synthetic');
    expect(review.mission.workspaceGeneration).toBe(
      (db.prepare('SELECT updated_at FROM workspaces WHERE id=?')
        .get(review.mission.workspaceId) as {updated_at:string}).updated_at);
    expect(review.missionBindingDigest).toBe(privateMvpMissionBindingDigest(review.mission));
    const first=await bridge.request();
    expect(first).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
    expect(db.prepare('SELECT COUNT(*) AS c FROM runner_mission_attempts').get()).toEqual({c:0});
    const approvalId=first.approvalRequestId!;
    expect(bridge.reviewForPendingApproval(approvalId)).toEqual(review);
    const desktopOwner=createDesktopApprovalController(owner,
      createApprovalModeService(createApprovalModeRepository(db)),bridge.reviewForPendingApproval);
    const desktopList=desktopOwner.list({limit:50});
    expect(desktopList.ok).toBe(true);
    if(!desktopList.ok)throw Error('Desktop review unavailable');
    expect(desktopList.value[0]?.preH1Review).toEqual(review);
    const pending=owner.list();
    expect(pending.ok&&pending.value).toHaveLength(1);
    if (!pending.ok)throw Error('pending');
    expect(pending.value[0]).toMatchObject({id:approvalId,status:'pending',
      capability:'pre-h1.prepare',effect:'execute'});
    expect(await bridge.request()).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(owner.respond(approvalId,'approve')).toMatchObject({
      ok:true,value:{status:'approved',decisionSource:'user'}});
    const executed=await bridge.request();
    expect(executed).toMatchObject({ok:true,code:'EXECUTED',value:{reserved:true}});
    const admission=db.prepare('SELECT mission_id,status,attempt_count,charged_bytes,approval_id FROM runner_missions').get() as Record<string,unknown>;
    expect(admission).toMatchObject({mission_id:'pre-h1-controller-01',status:'active',
      attempt_count:1,approval_id:approvalId});
    expect(admission.charged_bytes).toBe(671088640);
    expect(db.prepare('SELECT attempt_id,ordinal,state,launch_claimed_at FROM runner_mission_attempts').get())
      .toEqual({attempt_id:'pre-h1-controller-01-attempt-01',ordinal:1,state:'reserved',launch_claimed_at:null});
    expect(db.prepare('SELECT COUNT(*) AS c FROM runner_mission_native_attempts').get()).toEqual({c:0});
    expect(db.prepare('SELECT status,decision_source FROM approval_requests WHERE id=?').get(approvalId))
      .toEqual({status:'consumed',decision_source:'user'});
    await expect(bridge.request()).rejects.toThrow(/TERMINAL/);
    expect(bridge.cancelUnused()).toMatchObject({ok:true});
    expect(db.prepare('SELECT state FROM runner_mission_attempts').get()).toEqual({state:'settled'});
    expect(db.prepare('SELECT status,charged_bytes FROM runner_missions').get())
      .toEqual({status:'closed',charged_bytes:0});
    expect(bridge.cancelUnused()).toMatchObject({ok:false});
  });
 }
 it('denial is not approval and cannot create any Mission',async()=>{
  const{db,owner,bridge}=setup();
  const req=await bridge.request();
  expect(req).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(owner.respond(req.approvalRequestId!,'deny')).toMatchObject({ok:true});
  expect(await bridge.request()).toMatchObject({ok:false,code:'APPROVAL_DENIED'});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('Workspace generation changed after pending approval is stale even if ID is active',async()=>{
  const{db,owner,bridge,workspaceRepo,saved}=setup();
  const req=await bridge.request();
  expect(req).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(owner.respond(req.approvalRequestId!,'approve')).toMatchObject({ok:true});
  workspaceRepo.setActive(saved.id);
  expect(await bridge.request()).toMatchObject({ok:false,code:'SECURITY_RESOLUTION_FAILED'});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('tampering with Kernel HMAC prevents consuming that request or F2-A Enrollment',async()=>{
  const{db,owner,bridge}=setup();
  const req=await bridge.request();
  expect(req).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(owner.respond(req.approvalRequestId!,'approve')).toMatchObject({ok:true});
  // TEMP fixture tampering only; genuine code cannot forge a HMAC.
  db.prepare('UPDATE approval_requests SET binding_digest=? WHERE id=?').run('f'.repeat(64),req.approvalRequestId);
  expect(await bridge.request()).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('F2-A never accepts fake receipt or SHA/HMAC swap without trusted verifier',()=>{
  const{db,bridge}=setup();
  const review=bridge.inspect();
  const fake=createPrivateMvpMissionAdmissionRepository(db);
  const result=fake.enrollApproved(review.mission,'attacker-runtime',{
    requestId:'fake-request',runtimeInstanceId:'attacker-runtime',
    kernelBindingDigest:review.missionBindingDigest,missionBindingDigest:'0'.repeat(64),
    workspaceGeneration:review.mission.workspaceGeneration,revision:1,
    policyIdentity:review.mission.resourcePolicyIdentity,expiresAt:review.mission.expiresAt,
  });
  expect(result).toMatchObject({ok:false,error:{code:'RUNNER_APPROVAL_STALE'}});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('a consumed launch claim cannot be cancelled or release a charge',async()=>{
  const{db,owner,bridge}=setup();
  const review=bridge.inspect();
  const pending=await bridge.request();
  expect(owner.respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
  expect(await bridge.request()).toMatchObject({ok:true,code:'EXECUTED'});
  const f2a=createPrivateMvpMissionAdmissionRepository(db);
  expect(f2a.claimLaunch(review.mission,review.attemptId,review.mission.executionFingerprint))
   .toMatchObject({ok:true});
  expect(bridge.cancelUnused()).toMatchObject({ok:false,error:{code:'RUNNER_BUSY'}});
  expect(f2a.settleAttempt(review.mission,review.attemptId,true,true))
   .toMatchObject({ok:false,error:{code:'RUNNER_BUSY'}});
  expect(db.prepare('SELECT state FROM runner_mission_attempts').get()).toEqual({state:'reserved'});
  expect((db.prepare('SELECT charged_bytes FROM runner_missions').get() as {charged_bytes:number}).charged_bytes)
   .toBe(671088640);
 });
 it('an unresolved native journal in disposable SQLite cannot be cancelled or release a charge',async()=>{
  const{db,owner,bridge}=setup();
  const review=bridge.inspect();
  const pending=await bridge.request();
  expect(owner.respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
  expect(await bridge.request()).toMatchObject({ok:true,code:'EXECUTED'});
  const f2a=createPrivateMvpMissionAdmissionRepository(db);
  const seal='a'.repeat(64);
  // SQLite-only F2-A journal contract simulation: NO OS objects are created.
  expect(f2a.claimNativePreparation(review.mission,review.attemptId,'pre-h1-controller-01-epoch-01',seal))
   .toMatchObject({ok:true});
  expect(bridge.cancelUnused()).toMatchObject({ok:false,error:{code:'RUNNER_BUSY'}});
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get()).toEqual({state:'pending'});
  expect((db.prepare('SELECT charged_bytes FROM runner_missions').get() as {charged_bytes:number}).charged_bytes)
   .toBe(671088640);
 });
 it('a failing Tool Kernel pre-execution audit never enrolls a Mission',async()=>{
  const {db,approvals,workspaceRepo}=setup();
  const audit=createAuditRepository(db);
  const bridge=createPreH1MissionPreparationBridge({db,approvals,workspaces:workspaceRepo,
    audit:{append:event=>{if(event.action==='tool_kernel.invoke' && event.resultCode==='EXECUTION_AUTHORIZED')throw Error('TEST_AUDIT_FAILURE');
      return audit.append(event);}},mode:()=>'standard',
    observeBudget:root=>observePreH1MissionBudget(db,root)});
  const owner=createApprovalService(approvals,audit);
  const pending=await bridge.request();
  expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  expect(owner.respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
  const response=await bridge.request();
  expect(response.ok).toBe(false);
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('expired manual Approval never becomes a consumed F2-A grant',async()=>{
  const{db,owner,bridge}=setup();
  const pending=await bridge.request();
  expect(owner.respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
  // Shorten only the approved fixture's TTL to simulate expiration.
  db.prepare('UPDATE approval_requests SET expires_at=? WHERE id=?')
    .run('2000-01-01T00:00:00.000Z',pending.approvalRequestId);
  const answer=await bridge.request();
  expect(answer).toMatchObject({ok:false});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('Approval from a different runtime cannot enroll the fixed Mission',async()=>{
  const{db,owner,bridge}=setup();
  const pending=await bridge.request();
  expect(owner.respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
  db.prepare('UPDATE approval_requests SET runtime_instance_id=? WHERE id=?')
    .run('forged-other-runtime',pending.approvalRequestId);
  expect(await bridge.request()).toMatchObject({ok:false});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
 it('the isolated bridge compiler contains no executable/native binding import path',()=>{
  const compiled=fs.readFileSync(path.join(process.cwd(),
    'packages/desktop/.serena/pre-h1-mission-bridge-20261009-codeonly/electron/pre-h1-mission-preparation.js'),'utf8');
  expect(compiled).not.toMatch(/koffi|private-mvp-win32-native-binding|private-mvp-pre-h1-diagnostic-activation|createF2H1DesktopRunnerOwner/);
  const gateway=fs.readFileSync(path.join(process.cwd(),
    'packages/mcp-gateway/src/workspace-file-server.ts'),'utf8');
  expect(gateway).not.toContain('pre-h1.prepare');
  expect(gateway).not.toContain("registerTool('runner.mission'");
  expect(gateway).not.toContain("registerTool('runner.start'");
 });
 it('an insufficient real reservation budget fails closed before enrollment',async()=>{
  const {db,approvals,workspaceRepo}=setup();
  const audit=createAuditRepository(db);
  const bridge=createPreH1MissionPreparationBridge({db,approvals,workspaces:workspaceRepo,
    audit,mode:()=>'standard',observeBudget:()=>({observedFreeBytes:1,observedOwnedBytes:0})});
  const owner=createApprovalService(approvals,audit);
  const req=await bridge.request();
  expect(owner.respond(req.approvalRequestId!,'approve')).toMatchObject({ok:true});
  expect(await bridge.request()).toMatchObject({ok:false,code:'EXECUTION_FAILED'});
  expect(db.prepare('SELECT COUNT(*) AS c FROM runner_missions').get()).toEqual({c:0});
 });
});
