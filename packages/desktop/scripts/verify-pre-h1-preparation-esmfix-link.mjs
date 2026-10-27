/**
 * Pure code-only ECMAScript Module linker for the EXACT isolated preparation
 * Electron Main and existing Git Worker. It never calls module.evaluate(),
 * never imports electron, Koffi or better-sqlite3, and never starts the app.
 *
 * Native externals are resolved (NOT loaded) and are represented by
 * synthetic exports matching their CJS/known Electron loader interfaces.
 * All remaining Node builtin imports use actual Node ESM module namespaces.
 * A stale named import such as `{autoUpdater} from 'electron-updater'`
 * fails because unapproved externals are rejected by this linker.
 */
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {SourceTextModule,SyntheticModule} from 'node:vm';

const desktop=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(desktop,'../..');
const root=path.join(desktop,'.serena/pre-h1-preparation-desktop-20261009-esmfix');
const assert=(v,m)=>{if(!v)throw Error('PRE_H1_ESM_LINK_'+m);};
const electronExports=['app','BrowserWindow','clipboard','ipcMain','dialog','shell','session'];
const nativeExternals=new Map([
  ['electron',electronExports],
  ['better-sqlite3',['default']],
  ['koffi',['default']],
]);
const actualImports={};
for(const filename of ['main.js','git-worker.js']){
  const file=path.join(root,'dist-electron',filename);
  const code=fs.readFileSync(file,'utf8');
  assert(!code.includes('electron-updater'),'UPDATER_RETAINED_'+filename);
  assert(!code.includes('autoUpdater'),'UPDATER_SYMBOL_RETAINED_'+filename);
  const original=pathToFileURL(file).href;
  const entry=new SourceTextModule(code,{identifier:original,initializeImportMeta(meta){
    meta.url=original;
  }});
  const require=createRequire(file);
  const externals=new Set();
  await entry.link(async spec=>{
    if(spec.startsWith('node:')){
      const actual=await import(spec);
      const names=Object.keys(actual);
      return new SyntheticModule(names,function(){
        for(const key of names)this.setExport(key,actual[key]);
      },{identifier:spec});
    }
    if(nativeExternals.has(spec)){
      const resolved=require.resolve(spec);
      assert(fs.existsSync(resolved),'MISSING_INSTALLED_'+spec);
      externals.add(spec);
      const names=nativeExternals.get(spec);
      return new SyntheticModule(names,function(){
        for(const name of names)this.setExport(name,{});
      },{identifier:spec});
    }
    throw Error('PRE_H1_UNEXPECTED_EXTERNAL_IMPORT:'+spec);
  });
  assert(entry.status==='linked','EMITTED_MODULE_NOT_LINKED_'+filename);
  assert(!externals.has('electron-updater'),'CJS_UPDATER_EXTERNAL');
  actualImports[filename]=[...externals].sort();
  console.log('PRE_H1_NODE_ESM_LINK_PASS',filename,'EXTERNALS',actualImports[filename].join(',')||'none');
}
assert(actualImports['main.js'].includes('electron'),'ELECTRON_DESKTOP_MAIN_NOT_LINKED');
console.log('PRE_H1_APP_MODULE_EVALUATED=false');
console.log('PRE_H1_NATIVE_MODULES_LOADED=false');
console.log('PRE_H1_PRODUCTION_SQLITE_OPENED=false');
