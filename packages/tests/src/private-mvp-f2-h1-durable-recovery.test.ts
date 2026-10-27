import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {
 createApprovalRepository,createPrivateMvpMissionAdmissionRepository,
 openDatabase,PRIVATE_MVP_RESOURCE_POLICY,PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
 privateMvpMissionBindingDigest,createF2H1RunnerControlProtocol,
 type PrivateMvpMissionScope,
} from '@sud-d/infrastructure';
import {createF2H1DesktopOwnedSession} from '../../infrastructure/src/private-mvp-desktop-owned-session.js';
import * as cleanupProof from '../../infrastructure/src/private-mvp-h1-native-cleanup-proof.js';

const folders:string[]=[];
const databases:ReturnType<typeof openDatabase>[]=[];
const now=new Date('2026-10-08T08:00:00.000Z');
const later=new Date('2026-10-08T08:00:20.000Z');
const scope:PrivateMvpMissionScope={
 missionId:'h1-mission-a',revision:1,goalDigest:'a'.repeat(64),
 workspaceId:'h1-workspace-a',workspaceGeneration:'generation-a',
 runnerId:'fixed-synthetic',executionFingerprint:'b'.repeat(64),
 inputDigest:'c'.repeat(64),resourcePolicyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
 expiresAt:'2026-10-08T08:25:00.000Z',
};
const budget={observedFreeBytes:3*1024**3,observedOwnedBytes:0};
function fixture() {
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sud-h1-db-'));
 folders.push(folder);
 const dbPath=path.join(folder,'state.sqlite');
 const db=openDatabase(dbPath);databases.push(db);
 const approvals=createApprovalRepository(db);
 const pending=approvals.createPending({
  runtimeInstanceId:'trusted-owner-runtime',
  bindingDigest:privateMvpMissionBindingDigest(scope),
  sessionId:'owner-session',sessionType:'desktop',
  capability:'runner.mission',effect:'execute',
  sensitivity:'normal',policyContext:'workspace',
  workspaceId:scope.workspaceId,title:'H1 bounded offline Mission',
  createdAt:now.toISOString(),
  expiresAt:new Date(now.getTime()+60_000).toISOString(),
 });
 expect(pending.ok).toBe(true);
 if(!pending.ok)throw Error('test-approval');
 expect(approvals.respond(pending.value.id,'approve',now.toISOString()).ok).toBe(true);
 const repo=createPrivateMvpMissionAdmissionRepository(db,{now:()=>now});
 expect(repo.enrollApproved(scope,'trusted-owner-runtime').ok).toBe(true);
 expect(repo.reserveAttempt(scope,'h1-attempt-a',budget).ok).toBe(true);
 return{db,dbPath,repo};
}
afterEach(()=>{
 for(const db of databases.splice(0))if(db.open)db.close();
 for(const folder of folders.splice(0))fs.rmSync(folder,{recursive:true,force:true});
});
const epoch='owner-epoch-01';
const seal='d'.repeat(64);

async function createVerifiedOsSession(
 repo:ReturnType<typeof fixture>['repo'],captureEvidence?:(e:unknown)=>void,
) {
 const pending:Uint8Array[]=[];
 let resolveRead:((value:Uint8Array)=>void)|undefined;
 const pipe={
  arm:async(_read:bigint,_write:bigint)=>{},
  send:async(raw:Uint8Array)=>{
   const body=JSON.parse(Buffer.from(raw).toString('utf8'));
   if(body.kind!=='desktop-private-bootstrap-v1')return;
   const runner=createF2H1RunnerControlProtocol({
    ownerEpoch:body.ownerEpoch,missionId:body.missionId,attemptId:body.attemptId,
    stageSealDigest:body.stageSealDigest,executionFingerprint:body.executionFingerprint,
    key:Buffer.from(body.secret,'hex'),challenge:Buffer.from(body.challenge,'hex'),
    localRole:'runner',
   });
   const packet=Buffer.from(JSON.stringify(runner.issue('runner','ready',{})));
   if(resolveRead){resolveRead(packet);resolveRead=undefined;}
   else pending.push(packet);
  },
  nextFrame:async()=>pending.shift()??new Promise<Uint8Array>(resolve=>{resolveRead=resolve;}),
  shutdown:async()=>true,
 };
 const osOwner={
  guardian:101n,runner:102n,thread:103n,desktopReference:104n,
  desktopReads:105n,desktopWrites:106n,
  resumeControlThread:()=>{},
  terminateGuardian:()=>true,
  waitExactRunnerExit:(_ms:number)=>true,
  queryGuardianZeroMembers:()=>true,
  closeAllOwnedHandles:()=>true,
 };
 const session=createF2H1DesktopOwnedSession({
  scope,attemptId:'h1-attempt-a',ownerEpoch:epoch,stageSealDigest:seal,
 },{
  admission:{...repo,confirmNativeCleanupFromOwnedOs:(s,a,e,d,proof)=>{
   captureEvidence?.(proof);
   return repo.confirmNativeCleanupFromOwnedOs(s,a,e,d,proof);
  }},createSuspended:()=>osOwner,pipe,
  watchdog:{arm:async()=>{},authenticatedHeartbeat:()=>{},shutdown:async()=>true},
 });
 await session.start();
 return session;
}

describe('H1 native preparation journal on existing F2-A admission DB (SQLite only)',()=>{
 it('atomically consumes one launch claim and inserts pending row; replay never creates a second job',()=>{
  const {db,repo}=fixture();
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal))
   .toEqual({ok:true,value:undefined});
  expect(db.prepare('SELECT state,owner_epoch,stage_seal_digest FROM runner_mission_native_attempts')
   .get()).toMatchObject({state:'pending',owner_epoch:epoch,stage_seal_digest:seal});
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(false);
  expect(repo.claimLaunch(scope,'h1-attempt-a',scope.executionFingerprint).ok).toBe(false);
  expect(db.prepare('SELECT COUNT(*) AS n FROM runner_mission_native_attempts').get())
   .toMatchObject({n:1});
 });
 it('reopens a pending claimed attempt, fences it to cleanup_unknown and retains charge',()=>{
  const {db,dbPath,repo}=fixture();
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(true);
  db.close();
  const second=openDatabase(dbPath);databases.push(second);
  const owner=createPrivateMvpMissionAdmissionRepository(second,{now:()=>later});
  expect(owner.recoverNativeJournalAfterRestart()).toEqual({ok:true,value:1});
  expect(second.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'cleanup_unknown'});
  expect(second.prepare('SELECT charged_bytes FROM runner_missions').get())
   .toMatchObject({charged_bytes:PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes});
  expect(owner.reserveAttempt(scope,'another-attempt',budget).ok).toBe(false);
  expect(owner.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(false);
  expect(owner.recoverNativeJournalAfterRestart()).toEqual({ok:true,value:0});
 });
 it('persistently records owned then terminated; even two fake cleanup confirmations cannot release charge',()=>{
  const {db,repo}=fixture();
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(true);
  expect(repo.markNativeOwned(scope,'h1-attempt-a',epoch,seal).ok).toBe(true);
  expect(repo.markNativeTerminated(scope,'h1-attempt-a',epoch).ok).toBe(true);
  expect(repo.finishNativeCleanup(scope,'h1-attempt-a',epoch,true,false).ok).toBe(false);
  expect(repo.finishNativeCleanup(scope,'h1-attempt-a',epoch,true,true).ok).toBe(false);
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'terminated'});
  expect(repo.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(false);
  expect(db.prepare('SELECT charged_bytes FROM runner_missions').get())
   .toMatchObject({charged_bytes:PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes});
 });
 it('unknown cleanup and audit failure never release reserved bytes or allow new process claim',()=>{
  const {db,repo}=fixture();
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(true);
  expect(repo.markNativeCleanupUnknown(scope,'h1-attempt-a',epoch).ok).toBe(true);
  expect(repo.finishNativeCleanup(scope,'h1-attempt-a',epoch,true,true).ok).toBe(false);
  expect(repo.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(false);
  expect(db.prepare('SELECT charged_bytes FROM runner_missions').get())
   .toMatchObject({charged_bytes:PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes});
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(false);
 });
 it('audit failure rolls back launch claim and pending journal together',()=>{
  const {db,repo}=fixture();
  db.exec("CREATE TRIGGER fail_native_audit BEFORE INSERT ON audit_events WHEN NEW.action = 'runner.mission.native_pending' BEGIN SELECT RAISE(FAIL, 'audit denied'); END;");
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(false);
  expect(db.prepare('SELECT COUNT(*) AS n FROM runner_mission_native_attempts').get()).toMatchObject({n:0});
  expect(db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
   .toMatchObject({launch_claimed_at:null});
 });
 it('recovery-audit failure leaves uncertain owner entries locked, never silently marks cleaned',()=>{
  const {db,repo}=fixture();
  expect(repo.claimNativePreparation(scope,'h1-attempt-a',epoch,seal).ok).toBe(true);
  db.exec("CREATE TRIGGER fail_recovery BEFORE INSERT ON audit_events WHEN NEW.action = 'runner.mission.native_recover' BEGIN SELECT RAISE(FAIL, 'audit denied'); END;");
  expect(repo.recoverNativeJournalAfterRestart().ok).toBe(false);
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get()).toMatchObject({state:'pending'});
  expect(repo.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(false);
 });
 it('commits CLEANED only from a one-use owned OS proof; existing settle path then releases charge',async()=>{
  const {db,repo}=fixture();
  const session=await createVerifiedOsSession(repo);
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'owned'});
  expect(await session.stop()).toEqual({disposition:'verified-cleaned',osStopProven:true});
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'cleaned'});
  expect(repo.finishNativeCleanup(scope,'h1-attempt-a',epoch,true,true).ok).toBe(false);
  expect(repo.confirmNativeCleanupFromOwnedOs(scope,'h1-attempt-a',epoch,seal,{}).ok).toBe(false);
  expect(repo.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(true);
  expect(db.prepare('SELECT charged_bytes FROM runner_missions').get())
   .toMatchObject({charged_bytes:0});
  expect(repo.recoverNativeJournalAfterRestart()).toEqual({ok:true,value:0});
 });
 it('there is no ordinary string-only issuer; forged, mismatched and replayed proofs cannot clean SQLite',async()=>{
  const {db,repo}=fixture();
  expect(Reflect.get(cleanupProof,'issueF2H1VerifiedCleanupEvidence')).toBeUndefined();
  let captured:unknown;
  const session=await createVerifiedOsSession(repo,e=>{captured=e;});
  expect(await session.stop()).toMatchObject({disposition:'verified-cleaned'});
  expect(captured).toBeTruthy();
  expect(repo.confirmNativeCleanupFromOwnedOs(scope,'other-attempt',epoch,seal,captured).ok).toBe(false);
  expect(repo.confirmNativeCleanupFromOwnedOs(scope,'h1-attempt-a','wrong-epoch',seal,captured).ok).toBe(false);
  expect(repo.confirmNativeCleanupFromOwnedOs(scope,'h1-attempt-a',epoch,seal,captured).ok).toBe(false);
  expect(repo.confirmNativeCleanupFromOwnedOs(scope,'h1-attempt-a',epoch,'a'.repeat(64),{}).ok).toBe(false);
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'cleaned'});
 });
 it('CLEANED audit rollback preserves charge and quarantines same owned session; no boolean bypass',async()=>{
  const {db,repo}=fixture();
  const session=await createVerifiedOsSession(repo);
  db.exec("CREATE TRIGGER fail_native_clean BEFORE INSERT ON audit_events WHEN NEW.action = 'runner.mission.native_cleaned' BEGIN SELECT RAISE(FAIL, 'clean audit rejected'); END;");
  expect(await session.stop()).toEqual({disposition:'cleanup-unconfirmed',osStopProven:false});
  expect(db.prepare('SELECT state FROM runner_mission_native_attempts').get())
   .toMatchObject({state:'cleanup_unknown'});
  expect(db.prepare('SELECT charged_bytes FROM runner_missions').get())
   .toMatchObject({charged_bytes:PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes});
  expect(repo.settleAttempt(scope,'h1-attempt-a',true,true).ok).toBe(false);
 });
});
