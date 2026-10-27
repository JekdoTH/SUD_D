import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {afterEach,describe,expect,it} from 'vitest';
const repo=process.cwd();
const root='packages/desktop/.serena/pre-h1-controller-01-20261009-native2';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const tempRoots:string[]=[];
afterEach(()=>{for(const f of tempRoots.splice(0))fs.rmSync(f,{recursive:true,force:true});});
describe('Native2 frozen compiled corrective / external runtime bytes',()=>{
 it('real frozen installed runtime and 274 emitted file bytes verify',async()=>{
   const contract=await import('../../desktop/.serena/pre-h1-controller-01-20261009-native2/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
   const exact=contract.readVerifiedPreH1NativeArtifacts();
   const inv=fs.readFileSync('.serena/reports/pre-h1-native2-all-emitted-byte-pins-20261009.json');
   expect(exact.nativeCandidateInventorySha).toBe(sha(inv));
   const manifest=JSON.parse(inv.toString());
   expect(Object.keys(manifest.files)).toHaveLength(274);
   expect(exact.native2RuntimePinManifestSha).toBe(sha(fs.readFileSync('.serena/reports/pre-h1-native2-runtime-byte-pins-20261009.json')));
 });
 it('actual Native2 emitted Activation has no unbound identifiers (Native1 RED control)',()=>{
   const require=createRequire(import.meta.url);
   const {Linter}=require('eslint') as {Linter:new()=>{verify:(text:string,settings:unknown)=>Array<{message:string}>}};
   const l=new Linter();
   const options={env:{node:true,es2022:true},parserOptions:{ecmaVersion:'latest',sourceType:'module'},rules:{'no-undef':'error'}};
   const old=fs.readFileSync('packages/desktop/.serena/pre-h1-controller-01-20261009-native1/infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js','utf8');
   const actual=fs.readFileSync(path.join(root,'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'),'utf8');
   expect(l.verify(old,options).some(x=>x.message.includes('privateMvpMissionBindingDigest'))).toBe(true);
   expect(l.verify(actual,options)).toEqual([]);
 });
 it('controlled emitted Activation boundary executes with mocked OS only',()=>{
   const proc=spawnSync(process.execPath,['--experimental-vm-modules','packages/desktop/scripts/verify-pre-h1-native2-mock-boundary.mjs'],
     {cwd:repo,timeout:15000,encoding:'utf8'});
   expect(proc.status,proc.stderr).toBe(0);
   expect(proc.stdout).toContain('NATIVE2_EMITTED_MOCK_BOUNDARY_PASS valid');
   expect(proc.stdout).toContain('NATIVE2_EMITTED_MOCK_BOUNDARY_PASS missing-consent');
   expect(proc.stdout).toContain('NATIVE2_REAL_WIN32_CALLS=0');
 });
 it('actual emitted ESM links without Electron, native addon or OS execution',()=>{
   const proc=spawnSync(process.execPath,['--experimental-vm-modules','packages/desktop/scripts/verify-pre-h1-native2-link.mjs'],
     {cwd:repo,timeout:20000,encoding:'utf8'});
   expect(proc.status,proc.stderr).toBe(0);
   expect(proc.stdout).toContain('NATIVE2_ACTUAL_ESM_LINK_PASS infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
   expect(proc.stdout).toContain('NATIVE2_NATIVE_PROCESS_STARTED=false');
 });
 it('disposable copies reject same-length binary tamper, missing and redirected runtime',async()=>{
   const contract=await import('../../desktop/.serena/pre-h1-controller-01-20261009-native2/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
   const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sudd-native2-runtime-copy-'));tempRoots.push(tmp);
   const src=path.join(repo,'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node');
   const before=fs.readFileSync(src);
   const names=['electronExe','koffiAddon','sqliteAddon','electronResolution','koffiResolution','sqliteResolution'];
   const pins:Record<string,{relative:string;realpath:string;bytes:number;sha256:string}>={};
   for(const n of names){
     const filename=path.join(tmp,n+'.copy.node');
     fs.copyFileSync(src,filename,fs.constants.COPYFILE_EXCL);
     pins[n]={relative:path.basename(filename),realpath:fs.realpathSync.native(filename),
       bytes:before.length,sha256:sha(before)};
   }
   const manifest={version:1,repo:tmp,selectedElectronRelative:pins.electronExe!.relative,
     binaryNames:names.slice(0,3),pins};
   expect(()=>contract.verifyNative2RuntimePinSet(tmp,manifest)).not.toThrow();
   const binary=path.join(tmp,pins.koffiAddon!.relative);
   const altered=Buffer.from(before);altered[100]^=1;fs.writeFileSync(binary,altered);
   expect(()=>contract.verifyNative2RuntimePinSet(tmp,manifest)).toThrow(/BYTES_OR_RESOLUTION_DRIFT/);
   fs.writeFileSync(binary,before);fs.rmSync(binary);
   expect(()=>contract.verifyNative2RuntimePinSet(tmp,manifest)).toThrow();
   fs.writeFileSync(binary,before);
   const redirected={...manifest,pins:{...pins,koffiAddon:{...pins.koffiAddon!,realpath:path.join(tmp,'other.node')}}};
   expect(()=>contract.verifyNative2RuntimePinSet(tmp,redirected)).toThrow(/BYTES_OR_RESOLUTION_DRIFT/);
 });
});
