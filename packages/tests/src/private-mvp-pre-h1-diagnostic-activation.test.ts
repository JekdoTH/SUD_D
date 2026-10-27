import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it,vi} from 'vitest';
const {nativeBindSpy}=vi.hoisted(()=>({nativeBindSpy:vi.fn(()=>{
  throw Error('PRE_H1_NATIVE_BIND_UNEXPECTED');
})}));
vi.mock('../../infrastructure/src/private-mvp-desktop-runner-owner.js',async(importOriginal)=>({
  ...(await importOriginal<typeof import('../../infrastructure/src/private-mvp-desktop-runner-owner.js')>()),
  bindF2H1DesktopRunnerWin32:nativeBindSpy,
}));
import {createApprovalRepository,createAuditRepository,createWorkspaceRepository,
  createPrivateMvpMissionAdmissionRepository,openDatabase,
} from '@sud-d/infrastructure';
import {createApprovalService} from '@sud-d/application';
import {createPreH1MissionPreparationBridge,observePreH1MissionBudget}
  from '../../desktop/electron/pre-h1-mission-preparation.js';
import {
  readApprovedPreH1Diagnostic,PRE_H1_FIXED_DIAGNOSTIC,
  createPreH1DiagnosticDesktopLifecycle,
} from '../../infrastructure/src/private-mvp-pre-h1-diagnostic-activation.js';

const dirs:string[]=[],dbs:ReturnType<typeof openDatabase>[]=[];
const now=new Date('2026-10-09T03:00:00.000Z');
async function fixture(approved=true){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'sud-pre-h1-rc5-activation-'));
  dirs.push(folder);
  const db=openDatabase(path.join(folder,'owner.sqlite'));dbs.push(db);
  const workspaces=createWorkspaceRepository(db);
  const workspace=workspaces.save('PRE-H1 fixture',folder);
  workspaces.setActive(workspace.id);
  db.prepare('UPDATE workspaces SET updated_at=? WHERE id=?')
    .run(now.toISOString(),workspace.id);
  const approval=createApprovalRepository(db),audit=createAuditRepository(db);
  const bridge=createPreH1MissionPreparationBridge({
    db,approvals:approval,workspaces,audit,now:()=>now,
    mode:()=>'full_access',
    observeBudget:root=>observePreH1MissionBudget(db,root),
  });
  const scope=bridge.inspect().mission;
  if(approved){
    const pending=await bridge.request();
    expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
    expect(createApprovalService(approval,audit,()=>now)
      .respond(pending.approvalRequestId!,'approve')).toMatchObject({ok:true});
    expect(await bridge.request()).toMatchObject({ok:true,code:'EXECUTED'});
  }
  const repo=createPrivateMvpMissionAdmissionRepository(db,{now:()=>now});
  return{db,repo,scope,bridge,workspace};
}
afterEach(()=>{
  vi.useRealTimers();nativeBindSpy.mockClear();
  for(const db of dbs.splice(0))if(db.open)db.close();
  for(const folder of dirs.splice(0))fs.rmSync(folder,{recursive:true,force:true});
});
describe('PRE-H1 RC5 diagnostic activation: trusted HMAC receipt, no OS binding',()=>{
 it('rejects missing user-approved Mission before any Win32 owner',async()=>{
  const{db}=await fixture(false);
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/AUTHORIZATION_MISSING/);
  vi.useFakeTimers();vi.setSystemTime(now);
  const lifecycle=createPreH1DiagnosticDesktopLifecycle(db);
  await expect(lifecycle.startOnce()).rejects.toThrow(/AUTHORIZATION_MISSING/);
  await expect(lifecycle.startOnce()).rejects.toThrow(/ALREADY_ATTEMPTED/);
  expect(nativeBindSpy).not.toHaveBeenCalled();
  expect(await lifecycle.shutdown()).toBe(true);
 });
 it('accepts one user-consumed Kernel grant, trusted F2-A enrollment and one reserved attempt',async()=>{
  const{db,scope}=await fixture();
  expect(readApprovedPreH1Diagnostic(db,now)).toEqual({
    scope,attemptId:PRE_H1_FIXED_DIAGNOSTIC.attemptId,
    ownerEpoch:PRE_H1_FIXED_DIAGNOSTIC.ownerEpoch,
    stageSealDigest:PRE_H1_FIXED_DIAGNOSTIC.stageSealDigest,
  });
 });
 it('rejects approval mode substitution and inactive Workspace',async()=>{
  const{db}=await fixture();
  db.prepare('UPDATE approval_requests SET decision_source=?').run('mode');
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/AUTHORIZATION_MISSING/);
  db.prepare('UPDATE approval_requests SET decision_source=?').run('user');
  db.prepare('UPDATE workspaces SET is_active=0').run();
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/AUTHORIZATION_MISSING/);
 });
 it('rejects changed HMAC commitment, expiration and journal replay',async()=>{
  const{db,repo,scope}=await fixture();
  const original=String((db.prepare('SELECT binding_digest FROM approval_requests').get() as {binding_digest:string}).binding_digest);
  db.prepare('UPDATE approval_requests SET binding_digest=?').run('0'.repeat(64));
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/PROVENANCE_MISSING/);
  db.prepare('UPDATE approval_requests SET binding_digest=?').run(original);
  expect(()=>readApprovedPreH1Diagnostic(db,new Date(now.getTime()+240_000)))
    .toThrow(/BINDING_OR_EXPIRY_STALE/);
  expect(repo.claimNativePreparation(scope,PRE_H1_FIXED_DIAGNOSTIC.attemptId,
    PRE_H1_FIXED_DIAGNOSTIC.ownerEpoch,PRE_H1_FIXED_DIAGNOSTIC.stageSealDigest).ok).toBe(true);
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/AUTHORIZATION_MISSING|NATIVE_CLAIM_ALREADY_USED/);
 });
 it('passes RC5 admission preflight but refuses native consent before calling binding',async()=>{
  const{db}=await fixture();
  expect(readApprovedPreH1Diagnostic(db,now).scope.workspaceGeneration).toBe(now.toISOString());
  vi.useFakeTimers();vi.setSystemTime(now);
  const lifecycle=createPreH1DiagnosticDesktopLifecycle(db);
  await expect(lifecycle.startOnce()).rejects
    .toThrow('PRE_H1_RC5_SEPARATE_NATIVE_OWNER_CONSENT_REQUIRED');
  expect(nativeBindSpy).not.toHaveBeenCalled();
  await expect(lifecycle.startOnce()).rejects.toThrow(/ALREADY_ATTEMPTED/);
  expect(db.prepare('SELECT launch_claimed_at FROM runner_mission_attempts').get())
    .toEqual({launch_claimed_at:null});
  expect(db.prepare('SELECT COUNT(*) AS n FROM runner_mission_native_attempts').get())
    .toEqual({n:0});
 });
 it('rejects active Workspace with changed generation, binds zero Win32 APIs',async()=>{
  const{db,scope}=await fixture();
  db.prepare('UPDATE workspaces SET updated_at=? WHERE id=?')
    .run(new Date(now.getTime()+1000).toISOString(),scope.workspaceId);
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/WORKSPACE_GENERATION_STALE/);
  vi.useFakeTimers();vi.setSystemTime(now);
  const lifecycle=createPreH1DiagnosticDesktopLifecycle(db);
  await expect(lifecycle.startOnce()).rejects.toThrow(/WORKSPACE_GENERATION_STALE/);
  expect(nativeBindSpy).not.toHaveBeenCalled();
 });
 it('rejects uncanonical Workspace generation',async()=>{
  const{db,scope}=await fixture();
  db.prepare('UPDATE workspaces SET updated_at=? WHERE id=?')
    .run('bad-timestamp',scope.workspaceId);
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/WORKSPACE_GENERATION_STALE/);
  expect(nativeBindSpy).not.toHaveBeenCalled();
 });
 it('does not accept a second Attempt or forged Mission ID',async()=>{
  const{db}=await fixture();
  db.prepare('UPDATE runner_mission_attempts SET attempt_id=?').run('different-attempt');
  expect(()=>readApprovedPreH1Diagnostic(db,now)).toThrow(/AUTHORIZATION_MISSING/);
 });
});
