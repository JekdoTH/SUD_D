import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';


const repo=process.cwd();
const target=path.join(repo,'packages/desktop/.serena/pre-h1-controller-01-20261009-rc1');
const hash=(p:string)=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=(p:string)=>fs.readFileSync(path.join(target,p),'utf8');
const manifest=JSON.parse(read('frozen-diagnostic-manifest.json')) as {
  completeRuntimeCompiledImportPinCount:number;
  completeRuntimeCompiledImportPins:Record<string,string>;
  newEmittedFiles:Record<string,{size:number;sha256:string}>;
  status:string;
};
describe('PRE-H1-01 isolated compiled Desktop image — code-only artifact audit',()=>{
 it('ordinary production gates remain false and historic Desktop build is byte-identical',()=>{
  for(const [file,flag] of [
    ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
    ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
    ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
    ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
  ]){
    expect(fs.readFileSync(path.join(repo,'packages/infrastructure/src',file+'.ts'),'utf8'))
      .toContain('export const '+flag+'=false as const;');
    expect(fs.readFileSync(path.join(repo,'packages/infrastructure/dist',file+'.js'),'utf8'))
      .toContain('export const '+flag+' = false;');
  }
  expect(hash('packages/desktop/dist-electron/main.js'))
   .toBe('ad2bb05216c2f1de2f443936ef7df7f0a4e66e01ac10d42866fedb026b4bea8b');
  const productionSource=fs.readFileSync('packages/desktop/electron/main.ts','utf8');
  expect(productionSource).toContain('const desktopRunnerOwner = createF2H1DesktopRunnerOwner();');
  expect(productionSource).not.toContain('startOnce()');
 });
 it('the ONLY compiled Desktop app.whenReady action is the one exact internal diagnostic start',()=>{
  const s=read('desktop/dist-electron/main.js');
  const tail=s.slice(s.lastIndexOf('app.whenReady().then'),s.indexOf('var quitCleanupInFlight'));
  expect(tail).toContain('desktopRunnerOwner.startOnce()');
  expect(tail).not.toContain('registerIpcHandlers()');
  expect(tail).not.toContain('createWindow()');
  expect(tail).not.toContain('checkOnStartup()');
  expect(s).toContain('pre-h1-diagnostic-activation.js');
  expect(tail.match(/startOnce\(\)/g)).toHaveLength(1);
 });
 it('all four isolated compiled gates are true ONLY in the new candidate',()=>{
  for(const [filename,flag] of [
   ['private-mvp-desktop-runner-owner.js','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
   ['private-mvp-runner-control-entry.js','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
   ['private-mvp-runner-control-watchdog.js','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
   ['private-mvp-desktop-pipe-worker.js','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
  ])expect(read('infrastructure/dist/'+filename)).toContain('export const '+flag+' = true;');
  const source=read('infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
  expect(source).toContain('session.start()');
  expect(read('infrastructure/dist/private-mvp-desktop-owned-session.js'))
    .toContain('claimNativePreparation');
 });
 it('every released compiled byte matches external frozen hash and fixed imported closure',async()=>{
  expect(manifest.completeRuntimeCompiledImportPinCount).toBe(61);
  for(const [relative,pin] of Object.entries(manifest.completeRuntimeCompiledImportPins))
    expect(hash(path.join(repo,relative))).toBe(pin);
  for(const [relative,record] of Object.entries(manifest.newEmittedFiles)) {
    const p=path.join(target,relative);
    expect(fs.statSync(p).size).toBe(record.size);
    expect(hash(p)).toBe(record.sha256);
  }
  const {verifyF2H1PinnedControllerClosure}=await import(
   '../../desktop/.serena/pre-h1-controller-01-20261009-rc1/infrastructure/dist/private-mvp-h1-compiled-lock.js');
  expect(()=>verifyF2H1PinnedControllerClosure(repo)).not.toThrow();
 });
 it('frozen one-case manifest cannot masquerade as native authorization',()=>{
   expect(manifest.status).toBe('CODE_ONLY_UNEXECUTED_OWNER_CONSENT_REQUIRED');
   expect(fs.existsSync(path.join(target,'desktop/package.json'))).toBe(true);
   expect(fs.existsSync(path.join(target,'infrastructure/dist/private-mvp-runner-control-entry.js'))).toBe(true);
 });
});
