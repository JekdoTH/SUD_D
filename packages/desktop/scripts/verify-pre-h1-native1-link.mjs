/** Actual Node ESM linker proof WITHOUT evaluating any Electron or native code. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {SourceTextModule,SyntheticModule} from 'node:vm';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const root=path.join(repo,'packages/desktop/.serena/pre-h1-controller-01-20261009-native1');
const entries=[
  'desktop/dist-electron/main.js',
  'consent-desktop/dist-electron/main.js',
  'consent-desktop/dist-electron/git-worker.js',
  'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js',
  'infrastructure/dist/private-mvp-pre-h1-native-consent.js',
];
const named={
 'electron':['app','BrowserWindow','clipboard','ipcMain','ipcRenderer','contextBridge','dialog','shell','session'],
 'better-sqlite3':['default'],
 'koffi':['default'],
};
const moduleCache=new Map();
async function lookup(spec,ref){
  if(spec.startsWith('node:')){
    const imported=await import(spec);
    const names=Object.keys(imported);
    return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,imported[name]);},{identifier:spec});
  }
  if(Object.hasOwn(named,spec)){
    const resolver=createRequire(ref);
    const f=resolver.resolve(spec);
    if(!fs.existsSync(f))throw Error('MISSING_EXTERNAL_PACKAGE:'+spec);
    const exports=named[spec];
    return new SyntheticModule(exports,function(){for(const name of exports)this.setExport(name,{});},{identifier:spec});
  }
  if(spec==='uuid'){
    const resolver=createRequire(ref);
    const requireFile=resolver.resolve('uuid');
    const packageFolder=path.dirname(path.dirname(requireFile));
    const esm=await import(pathToFileURL(path.join(packageFolder,'wrapper.mjs')).href);
    const names=Object.keys(esm);
    return new SyntheticModule(names,function(){for(const name of names)this.setExport(name,esm[name]);},{identifier:spec});
  }
  if(!spec.startsWith('.') && !spec.startsWith('@sud-d/'))
    throw Error('UNAPPROVED_EXTERNAL:'+spec);
  const resolved=spec.startsWith('.')
    ?path.resolve(path.dirname(fileURLToPath(ref)),spec)
    :spec.startsWith('@sud-d/')
      ?path.join(repo,'packages',spec.slice('@sud-d/'.length),'dist/index.js')
      :createRequire(ref).resolve(spec);
  if(!(resolved.startsWith(root+path.sep)
    ||resolved.startsWith(path.join(repo,'packages')+path.sep)
    ||resolved.startsWith(path.join(repo,'node_modules')+path.sep))
    ||!fs.existsSync(resolved))
    throw Error('UNPINNED_IMPORT:'+resolved);
  return load(resolved);
}
function load(f){
  if(moduleCache.has(f))return moduleCache.get(f);
  const source=fs.readFileSync(f,'utf8');
  const url=pathToFileURL(f).href;
  const value=new SourceTextModule(source,{identifier:url,initializeImportMeta(meta){meta.url=url;}});
  moduleCache.set(f,value);
  return value;
}
for(const name of entries){
  const f=path.join(root,name);
  const entry=load(f);
  if(entry.status==='unlinked')await entry.link((spec,ref)=>lookup(spec,ref.identifier));
  if(entry.status!=='linked')throw Error('EMITTED_ENTRY_NOT_LINKED:'+name+':'+entry.status);
  console.log('NATIVE1_ACTUAL_ESM_LINK_PASS '+name);
}
const activation=fs.readFileSync(path.join(root,entries[3]),'utf8');
const a=activation.indexOf('readApprovedPreH1Diagnostic(db, new Date())');
const b=activation.indexOf('consumePreH1NativeAuthorization(db, new Date())');
const c=activation.indexOf('bindF2H1DesktopRunnerWin32().createFixedDesktopSession');
if(a<0||b<=a||c<=b)throw Error('NATIVE_CONSENT_PREBIND_ORDER_VIOLATED');
for(const name of entries.slice(0,2)){
 const s=fs.readFileSync(path.join(root,name),'utf8');
 if(s.includes('electron-updater')||s.includes('autoUpdater'))
  throw Error('UPDATER_CJS_IN_EMITTED_MAIN:'+name);
}
console.log('NATIVE1_NATIVE_PROCESS_STARTED=false');
console.log('NATIVE1_ELECTRON_MAIN_EVALUATED=false');
console.log('NATIVE1_PRODUCTION_SQLITE_OPENED=false');
