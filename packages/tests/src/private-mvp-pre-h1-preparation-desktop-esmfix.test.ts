import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';

const repo=process.cwd();
const desktop=path.join(repo,'packages/desktop');
const name='packages/desktop/.serena/pre-h1-preparation-desktop-20261009-esmfix';
const root=path.join(repo,name);
const originalRoot=path.join(desktop,'.serena/pre-h1-preparation-desktop-20261009');
const main=fs.readFileSync(path.join(root,'dist-electron/main.js'),'utf8');
const preload=fs.readFileSync(path.join(root,'dist-electron/preload.cjs'),'utf8');
const originalMain=fs.readFileSync(path.join(originalRoot,'dist-electron/main.js'),'utf8');
const renderer=fs.readdirSync(path.join(root,'dist/assets')).filter(f=>f.endsWith('.js'))
 .map(f=>fs.readFileSync(path.join(root,'dist/assets',f),'utf8')).join('\n');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'preparation-only-manifest.json'),'utf8')) as {
 root:string;emittedPins:Record<string,{bytes:number;sha256:string}>;
 sourcePins:Record<string,{bytes:number;sha256:string}>;
 providerRuntime:string;nativeAuthority:boolean;autoPrepare:boolean;
 automaticProviderCheck:boolean;publicMcpRunnerExecution:boolean;
};
const sha=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');

describe('PRE-H1 offline preparation Desktop ESM/CJS startup regression (NO app launch)',()=>{
 it('reproduces EXACT old CommonJS named-export link failure with the actual Node loader',()=>{
   expect(originalMain).toContain('import { autoUpdater } from "electron-updater"');
   const check=spawnSync(process.execPath,[
     '--input-type=module','-e',"import { autoUpdater } from 'electron-updater';",
   ],{cwd:desktop,encoding:'utf8',timeout:9000});
   expect(check.status).not.toBe(0);
   expect(check.stderr).toContain("Named export 'autoUpdater' not found");
 });
 it('links ACTUAL new emitted ESM Main and worker with the Node VM module linker',()=>{
   const checked=spawnSync(process.execPath,[
     '--experimental-vm-modules','packages/desktop/scripts/verify-pre-h1-preparation-esmfix-link.mjs',
   ],{cwd:repo,encoding:'utf8',timeout:12000});
   expect(checked.status,checked.stderr).toBe(0);
   expect(checked.stdout).toContain('PRE_H1_NODE_ESM_LINK_PASS main.js');
   expect(checked.stdout).toContain('PRE_H1_NODE_ESM_LINK_PASS git-worker.js');
   expect(checked.stdout).toContain('PRE_H1_APP_MODULE_EVALUATED=false');
   expect(checked.stdout).toContain('PRE_H1_NATIVE_MODULES_LOADED=false');
   expect(checked.stdout).toContain('PRE_H1_PRODUCTION_SQLITE_OPENED=false');
 });
 it('removes updater runtime from this one-purpose offline package without changing ordinary code',()=>{
   expect(main).not.toContain('electron-updater');
   expect(main).not.toContain('autoUpdater');
   expect(main).not.toContain('updateController.checkOnStartup()');
   expect(main).toContain('PRE_H1_PREPARATION_UPDATES_DISABLED');
   expect(main).not.toContain('https://github.com/JekdoTH/SUD_D/releases/latest/download/sud-d-release.json');
   expect(main).not.toContain('VITE_DEV_SERVER_URL');
   expect(manifest.providerRuntime).toBe('offline-no-electron-updater');
   expect(manifest.automaticProviderCheck).toBe(false);
   expect(sha(path.join(repo,'packages/desktop/electron/update-provider.ts'))).not.toBe('');
 });
 it('preserves manual preparation-only Activity approval and native/import IPC fences',()=>{
   expect(main).toContain('createF2H1DesktopRunnerOwner');
   expect(main).toContain('createPreH1MissionPreparationBridge');
   expect(main).toContain('PRE_H1_PREPARATION_TERMINAL');
   expect(main).not.toContain('createPreH1DiagnosticDesktopLifecycle');
   expect(main).not.toContain('desktopRunnerOwner.startOnce()');
   expect(preload).toContain('require("electron")');
   expect(main).toContain('preload.cjs');
   for(const key of ['pre-h1:prepare:review','pre-h1:prepare:request',
     'pre-h1:prepare:cancel','approval:respond']){
     expect(main).toContain(key);expect(preload).toContain(key);
   }
   for(const text of ['Review fixed Mission','Mission SHA-256 binding',
     'preH1Review','preH1Request','preH1Cancel','Pending approvals']){
     expect(renderer).toContain(text);
   }
   expect(manifest.nativeAuthority).toBe(false);
   expect(manifest.autoPrepare).toBe(false);
   expect(manifest.publicMcpRunnerExecution).toBe(false);
 });
 it('verifies EVERY frozen old/new/RC3/RC4/RC5 emitted file and all four false production native gates',()=>{
   for(const file of Object.keys(manifest.sourcePins)){
     const rec=manifest.sourcePins[file]!;
     const f=path.join(repo,file);
     expect(fs.statSync(f).size,file).toBe(rec.bytes);
     expect(sha(f),file).toBe(rec.sha256);
   }
   const reports=[
     '.serena/reports/pre-h1-preparation-desktop-all-emitted-byte-pins-20261009.json',
     '.serena/reports/pre-h1-preparation-desktop-esmfix-all-emitted-pins-20261009.json',
     ...['rc3','rc4','rc5'].map(rc=>'.serena/reports/pre-h1-'+rc+'-all-emitted-byte-pins-20261009.json'),
   ];
   for(const report of reports){
     const pins=JSON.parse(fs.readFileSync(path.join(repo,report),'utf8')) as {
       root:string;files:Record<string,{bytes:number;sha256:string}>;
     };
     const count=Object.keys(pins.files).length;
     expect(count).toBe(report.includes('rc5')?256:report.includes('rc3')||report.includes('rc4')?248:10);
     for(const [name,rec] of Object.entries(pins.files)){
       const f=path.join(repo,pins.root,name);
       expect(fs.statSync(f).size,report+name).toBe(rec.bytes);
       expect(sha(f),report+name).toBe(rec.sha256);
     }
   }
   const gates=[
     ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
     ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
     ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
     ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
   ];
   for(const [stem,gate] of gates){
     const source=fs.readFileSync(path.join(repo,'packages/infrastructure/src',stem+'.ts'),'utf8');
     const compiled=fs.readFileSync(path.join(repo,'packages/infrastructure/dist',stem+'.js'),'utf8');
     expect(source).toContain('export const '+gate+'=false as const;');
     expect(compiled).toContain('export const '+gate+' = false;');
   }
 });
});
