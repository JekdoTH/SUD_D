import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
 createF2H1DesktopRunnerOwner,
 F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED,
 F2H1_TOPOLOGY_B,
 createF2H1RunnerControlProtocol,
} from '@sud-d/infrastructure';

const entry=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
describe('Topology B Desktop-owned Runner control code contract (NEVER native execution)',()=>{
 it('keeps the compiled private Runner entry and all production creation unavailable',async()=>{
   const native=entry('packages/infrastructure/src/private-mvp-desktop-runner-owner.ts');
   expect(native).toContain('PROC_THREAD_ATTRIBUTE_JOB_LIST');
   expect(native).toContain('PROC_THREAD_ATTRIBUTE_HANDLE_LIST');
   expect(native).toContain('CREATE_SUSPENDED');
   expect(native).toContain('CreateProcessW');
   expect(native).not.toContain('OpenProcess(');
   expect(native).not.toContain('ShellExecute');
   expect(F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED).toBe(false);
   const owner=createF2H1DesktopRunnerOwner();
   expect(owner.state()).toBe('inactive');
   expect(owner.canCreateNative()).toBe(false);
   await expect(owner.shutdown()).resolves.toBe(true);
   expect(()=>owner.prepareNative()).toThrow('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
 });
 it('fixed image + script/guardian policy never permit external executable, argv or inherited Job handles',()=>{
   expect(F2H1_TOPOLOGY_B.revision).toBe('f2-h1-desktop-runner-b-v1');
   expect(F2H1_TOPOLOGY_B.handleList).toEqual(['runner-control-read','runner-control-write','desktop-process-query']);
   expect(F2H1_TOPOLOGY_B.guardian.breakaway).toBe(false);
   expect(F2H1_TOPOLOGY_B.guardian.inheritedByRunner).toBe(false);
   expect(F2H1_TOPOLOGY_B.worker.resumeAuthorized).toBe(false);
 });
 it('H0 profile bootstrap consumes exact trusted SID, never creates, adopts or deletes it',()=>{
   const native=entry('packages/infrastructure/native/f2-h0/one-shot-launch-host.cpp');
   expect(native).not.toContain('CreateAppContainerProfile(');
   expect(native).not.toContain('DeleteAppContainerProfile(');
   expect(native).toContain('DeriveAppContainerSidFromAppContainerName');
   expect(native).toContain('EqualSid(');
   expect(native).toContain('expectedProfileSid');
   expect(native).not.toContain('ResumeThread(');
 });
 it('private channel rejects stale epoch, forged MAC, replay, wrong-role and oversized input',()=>{
   const key=Buffer.alloc(32,71);
   const c=createF2H1RunnerControlProtocol({
     ownerEpoch:'desktop-epoch-123',missionId:'mission-1',attemptId:'attempt-1',
     stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64),
     key,challenge:Buffer.alloc(32,5),
   });
   const message=c.issue('desktop','heartbeat',{});
   expect(c.accept('desktop',message)).toBe(false); // own role cannot impersonate Runner
   expect(c.accept('runner',message)).toBe(false);
   const good=c.issue('runner','heartbeat',{});
   expect(c.accept('runner',good)).toBe(true);
   expect(c.accept('runner',good)).toBe(false);
   expect(c.accept('runner',{...good,sequence:2,mac:'0'.repeat(64)})).toBe(false);
   expect(c.accept('runner',{...good,epoch:'old-epoch'})).toBe(false);
   expect(c.accept('runner',{...good,payload:{text:'x'.repeat(4500)}})).toBe(false);
 });
 it('no runner.start registration or native bootstrap on the normal Desktop startup path',()=>{
   const main=entry('packages/desktop/electron/main.ts');
   expect(main).toContain('createF2H1DesktopRunnerOwner');
   expect(main).toContain('runnerLifecycle: desktopRunnerOwner');
   expect(main.indexOf('recoverNativeJournalAfterRestart')).toBeLessThan(main.indexOf('const desktopRunnerOwner = createF2H1DesktopRunnerOwner'));
   expect(main).not.toContain('runner.start');
   const runner=entry('packages/infrastructure/src/private-mvp-runner-control-entry.ts');
   expect(runner).toContain('F2_H1_RUNNER_ENTRY_EXECUTION_NOT_AUTHORIZED');
   expect(runner).not.toContain('serveStdio');
   expect(runner).not.toContain('OpenProcess(');
 });
});
