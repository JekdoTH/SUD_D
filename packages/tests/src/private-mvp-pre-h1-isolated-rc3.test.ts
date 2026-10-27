import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';

const cwd=process.cwd();
const candidate='packages/desktop/.serena/pre-h1-controller-01-20261009-rc3';
const root=path.join(cwd,candidate);
const sha=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
const manifest=JSON.parse(read('frozen-diagnostic-manifest.json')) as {
 status:string;compiledPinnedFiles:number;
 compiledPinnedHashes:Record<string,string>;
 inspectedFiles:Record<string,string>;
};
const external=JSON.parse(fs.readFileSync(
 path.join(cwd,'.serena/reports/pre-h1-rc3-external-import-pins-20261009.json'),'utf8',
)) as {
 desktopExternalImports:string[];additionalExternalBytePins:Record<string,{bytes:number;sha256:string}>;
 mainSha256:string;compiledControllerPinCount:number;
};
describe('RC3 one fixed diagnostic Desktop — immutable code-only artifact inspection',()=>{
 it('production origin stays inert, production outputs unchanged and RC3 is not wired into renderer',()=>{
  // RC3 origin SHA is preserved inside the frozen manifest; current Source
  // advances to RC5 without mutating RC3 emitted bytes.
  const liveMain=fs.readFileSync(path.join(cwd,'packages/desktop/electron/main.ts'),'utf8');
  expect(liveMain).toContain('createPreH1MissionPreparationBridge');
  expect(liveMain).not.toContain('desktopRunnerOwner.startOnce()');
  expect(sha(path.join(cwd,'packages/desktop/dist-electron/main.js')))
   .toBe('ad2bb05216c2f1de2f443936ef7df7f0a4e66e01ac10d42866fedb026b4bea8b');
  for(const [file,flag] of [
   ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
   ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
   ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
   ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
  ]){
    expect(fs.readFileSync(path.join(cwd,'packages/infrastructure/src',file+'.ts'),'utf8'))
     .toContain('export const '+flag+'=false as const;');
    expect(fs.readFileSync(path.join(cwd,'packages/infrastructure/dist',file+'.js'),'utf8'))
     .toContain('export const '+flag+' = false;');
    expect(read('infrastructure/dist/'+file+'.js'))
     .toContain('export const '+flag+' = true;');
  }
 });
 it('real Electron Main has one internal whenReady activation, valid on-disk import and terminal shutdown',()=>{
  const s=read('desktop/dist-electron/main.js');
  const from=path.join(root,'desktop/dist-electron');
  const target=path.resolve(from,'../../infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
  expect(fs.existsSync(target)).toBe(true);
  expect(target.startsWith(root+path.sep)).toBe(true);
  expect(s).toContain('../../infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
  const tail=s.slice(s.lastIndexOf('app.whenReady().then'),s.indexOf('var quitCleanupInFlight'));
  expect(tail).toContain('desktopRunnerOwner.startOnce()');
  expect(tail).toContain('orderlyShutdown()');
  expect(tail).toContain('app.exit(74)');
  expect(tail.match(/startOnce\(\)/g)).toHaveLength(1);
  expect(tail).not.toContain('registerIpcHandlers()');
  expect(tail).not.toContain('createWindow()');
  expect(tail).not.toContain('checkOnStartup()');
 });
 it('pins all 61 Runner compiled imports and verifies the emitted diagnostic compiled lock',async()=>{
  expect(manifest.status).toBe('CODE-ONLY-UNEXECUTED-PENDING-OWNER-CONSENT');
  expect(manifest.compiledPinnedFiles).toBe(61);
  for(const [relative,pinned] of Object.entries(manifest.compiledPinnedHashes))
   expect(sha(path.join(cwd,relative))).toBe(pinned);
  const locked=await import('../../desktop/.serena/pre-h1-controller-01-20261009-rc3/infrastructure/dist/private-mvp-h1-compiled-lock.js');
  expect(()=>locked.verifyF2H1PinnedControllerClosure(cwd)).not.toThrow();
 });
 it('pins every issued artifact & the external imports incl SQLite addon and fixed Electron/Koffi identities',()=>{
  for(const [relative,pin] of Object.entries(manifest.inspectedFiles)){
    // Historical source SHA records remain immutable as evidence, but source
    // files deliberately evolve with RC4/RC5; test emitted bytes separately.
    if(relative.startsWith('packages/infrastructure/src/'))continue;
    const p=relative.startsWith('C:/')||relative.startsWith('packages/')||relative.startsWith('node_modules/')
      ?path.resolve(cwd,relative)
      :relative.startsWith('scripts/')?path.join(cwd,'packages/desktop',relative):path.join(root,relative);
    expect(sha(p)).toBe(pin);
  }
  expect(external.desktopExternalImports).toEqual(['better-sqlite3','electron','koffi']);
  expect(external.compiledControllerPinCount).toBe(61);
  expect(external.mainSha256).toBe(sha(path.join(root,'desktop/dist-electron/main.js')));
  for(const [relative,record] of Object.entries(external.additionalExternalBytePins)){
    const p=path.join(cwd,relative);
    expect(fs.statSync(p).size).toBe(record.bytes);
    expect(sha(p)).toBe(record.sha256);
  }
 });
 it('compiled activation relies only on pre-existing approved F2-A Mission and one terminal stop',()=>{
  const s=read('infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
  expect(s).toContain('PRE_H1_DIAGNOSTIC_ALREADY_ATTEMPTED');
  expect(s).toContain('readApprovedPreH1Diagnostic');
  expect(s).toContain('session.start()');
  expect(s).not.toContain('enrollApproved(');
  expect(s).not.toContain('reserveAttempt(');
  expect(read('infrastructure/dist/private-mvp-desktop-owned-session.js'))
   .toContain('claimNativePreparation');
 });
});
