/** Native3 emitted Activation behavioral proof with ONLY synthetic modules.
 * No Electron, Koffi, Win32, SQLite or real Guardian evaluation. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SourceTextModule,SyntheticModule} from 'node:vm';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const emitted=path.join(repo,'packages/desktop/.serena/pre-h1-controller-01-20261009-native3/infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
const source=fs.readFileSync(emitted,'utf8');
const match='c'.repeat(64);
async function verifyScenario(scenario){
 const events=[];
 const bindings={
  "node:crypto":{createHash},
  "./private-mvp-pre-h1-diagnostic-preflight.js":{
   readApprovedPreH1Diagnostic:()=>{events.push('preflight');return {scope:{missionId:'pre-h1-controller-01'},ownerEpoch:'pre-h1-controller-01-epoch-01'};}},
  "./private-mvp-mission-admission.js":{
   createPrivateMvpMissionAdmissionRepository:()=>({}),
   privateMvpMissionBindingDigest:()=>{events.push('binding-sha');return match;}},
  "./private-mvp-pre-h1-native-consent.js":{
   consumePreH1NativeAuthorization:()=>{events.push('consume');if(scenario==='missing-consent')throw Error('DENY_CONSENT');
     return {scope:{missionBindingDigest:scenario==='changed-sha'?'0'.repeat(64):match,
       ownerEpoch:scenario==='changed-epoch'?'WRONG':'pre-h1-controller-01-epoch-01'}};}},
  "./private-mvp-desktop-runner-owner.js":{
   bindF2H1DesktopRunnerWin32:()=>{events.push('mock-native-boundary');return {
    createFixedDesktopSession:()=>({start:async()=>{events.push('mock-session-start');throw Error('CONTROLLED_MOCK_ABORT')},
     stop:async()=>({disposition:'verified-cleaned',osStopProven:true})})};}},
 };
 const mod=new SourceTextModule(source,{identifier:emitted});
 await mod.link(spec=>{
  const b=bindings[spec];if(!b)throw Error('UNEXPECTED_IMPORT:'+spec);
  return new SyntheticModule(Object.keys(b),function(){
   for(const [name,value] of Object.entries(b))this.setExport(name,value);
  },{identifier:spec});
 });
 await mod.evaluate();
 const controller=mod.namespace.createPreH1DiagnosticDesktopLifecycle({});
 let failure='';
 try{await controller.startOnce();}catch(e){failure=String(e.message);}
 if(scenario==='valid'){
  if(failure!=='CONTROLLED_MOCK_ABORT'||events.join(',')!=='preflight,consume,binding-sha,mock-native-boundary,mock-session-start')
   throw Error('MOCK_VALID_BOUNDARY_FAILED:'+JSON.stringify({failure,events}));
 }else if(events.includes('mock-native-boundary')||events.includes('mock-session-start')||!failure){
  throw Error('MOCK_DENIAL_CALLED_NATIVE:'+JSON.stringify({scenario,failure,events}));
 }
 console.log('NATIVE3_EMITTED_MOCK_BOUNDARY_PASS '+scenario+' '+events.join('>'));
}
for(const scenario of ['valid','missing-consent','changed-sha','changed-epoch'])
 await verifyScenario(scenario);
console.log('NATIVE3_REAL_WIN32_CALLS=0');
console.log('NATIVE3_REAL_ELECTRON_LAUNCHES=0');
