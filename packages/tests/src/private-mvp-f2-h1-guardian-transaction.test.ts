import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  bindF2H1DesktopRunnerWin32,
  createF2H1DesktopRunnerOwner,
  F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED,
  createF2H1RunnerControlProtocol,
} from '@sud-d/infrastructure';

const source=readFileSync(join(process.cwd(),'packages/infrastructure/src/private-mvp-desktop-runner-owner.ts'),'utf8');
const s=(start:string,end:string):string=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  expect(a).toBeGreaterThanOrEqual(0);expect(b).toBeGreaterThan(a);
  return source.slice(a,b);
};
describe('H1 Desktop Guardian creation Win32 assembly (static + code-only, NEVER bind native)',()=>{
 it('actually assembles two attributes, strict JOB_LIST, no after-creation Runner Job assignment',()=>{
   const body=s('function prepareFixedGuardianAndSuspendedRunner()', '  return Object.freeze({');
   for(const part of ['createJob(null,null)','setJob(guardian,9','createPipe(childRead,parentWrite',
     'createPipe(parentRead,childWrite','duplicate(self(),self(),self(),desktopReference',
     'initAttr(attributes,2','updateAttr(attributes,0,PROC_THREAD_ATTRIBUTE_JOB_LIST',
     'updateAttr(attributes,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST','CREATE_SUSPENDED|EXTENDED_STARTUPINFO_PRESENT',
     'inJob(runner,guardian,joined)','fixedTokenMatchesCurrentNonElevated(runner)',
     'queryImage(runner,0','killJob(guardian,0xef)','wait(runner,5000)'])
     expect(body).toContain(part);
   expect(body.indexOf('JOB_LIST_REQUIRED')).toBeLessThan(body.indexOf('CREATE_SUSPENDED_WITH_GUARDIAN_AT_BIRTH'));
   expect(body.indexOf('EXACT_HANDLE_LIST_REQUIRED')).toBeLessThan(body.indexOf('CREATE_SUSPENDED_WITH_GUARDIAN_AT_BIRTH'));
   expect(body).not.toMatch(/\bAssignProcessToJobObject\s*\(/);
   expect(body).not.toContain('ResumeThread(');
 });
 it('never leaks Guardian Job into the three child startup handle slots',()=>{
   const body=s('function prepareFixedGuardianAndSuspendedRunner()', '  return Object.freeze({');
   expect(body).toContain('[pipeToRunner,pipeFromRunner,desktop]');
   expect(body).not.toContain('[pipeToRunner,pipeFromRunner,guardian]');
   expect(body).toContain('setFlags(desktopWrites,1,0)');
   expect(body).toContain('setFlags(desktopReads,1,0)');
   expect(body).toContain('setFlags');
   expect(body).toContain('confirmed=false');
   expect(body).toContain('F2_H1_B_GUARDIAN_CLEANUP_UNKNOWN_QUARANTINE');
 });
 it('Desktop H0 pull uses source already-owned Runner OS PROCESS, not OpenProcess/PID adoption',()=>{
   const body=s('function pullExactH0FromOwnedRunner(', '  const validHandle=');
   expect(body).toContain('duplicateExactH0(ownedRunner,authenticatedH0SourceCoordinate,self()');
   expect(body).toContain('inGuardian(h,desktopGuardian,member)');
   expect(body).toContain('queryImage(h,0,image,chars)');
   expect(body).toContain('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
   expect(body).not.toContain('OpenProcess(');
   expect(body).not.toContain('ResumeThread(');
 });
 it('forged caller cannot bind Koffi or create Job/process; inert Desktop shutdown has no active owner',async()=>{
   expect(F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED).toBe(false);
   expect(()=>bindF2H1DesktopRunnerWin32()).toThrow('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
   const owner=createF2H1DesktopRunnerOwner();
   expect(owner.state()).toBe('inactive');
   await expect(owner.shutdown()).resolves.toBe(true);
   expect(()=>owner.prepareNative()).toThrow('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
 });
 it('physical peer remains unproven even with a forged but signed current-epoch heartbeat',()=>{
   const key=Buffer.alloc(32,21),challenge=Buffer.alloc(32,22);
   const desktop=createF2H1RunnerControlProtocol({
     ownerEpoch:'epoch-1',missionId:'mission-1',attemptId:'attempt-1',
     stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64),
     key,challenge,localRole:'desktop',
   });
   const runner=createF2H1RunnerControlProtocol({
     ownerEpoch:'epoch-1',missionId:'mission-1',attemptId:'attempt-1',
     stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64),
     key,challenge,localRole:'runner',
   });
   expect(desktop.accept('runner',runner.issue('runner','heartbeat',{}))).toBe(true);
   expect(desktop.accept('runner',runner.issue('runner','h0-owned',{}))).toBe(true);
   // Native factory remains shut even when protocol validates every frame.
   expect(()=>bindF2H1DesktopRunnerWin32()).toThrow();
 });
});
