/* Freeze all files of ONE new PRE-H1 offline ESM/CJS-corrected preparation
 * candidate. Read/hash only, never imports compiled Desktop or opens DB. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const relRoot='packages/desktop/.serena/pre-h1-preparation-desktop-20261009-esmfix';
const root=path.join(repo,relRoot);
const out=path.join(repo,'.serena/reports/pre-h1-preparation-desktop-esmfix-all-emitted-pins-20261009.json');
if(fs.existsSync(out))throw Error('ESMFIX_INVENTORY_ALREADY_EXISTS');
const sha=b=>createHash('sha256').update(b).digest('hex');
const files={};
function collect(folder){
 for(const x of fs.readdirSync(folder,{withFileTypes:true})){
  const f=path.join(folder,x.name);
  if(x.isSymbolicLink())throw Error('ESMFIX_SYMLINK_FORBIDDEN');
  if(x.isDirectory())collect(f);
  else if(x.isFile()){
   const b=fs.readFileSync(f);
   files[path.relative(root,f).replaceAll('\\','/')]={bytes:b.length,sha256:sha(b)};
  }
 }
}
collect(root);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'preparation-only-manifest.json')));
if(manifest.root!==relRoot || Object.keys(files).length!==10)
  throw Error('ESMFIX_EMITTED_SCOPE_UNEXPECTED');
for(const [name,record] of Object.entries(manifest.emittedPins)){
 const measured=files[name];
 if(!measured||measured.bytes!==record.bytes||measured.sha256!==record.sha256)
  throw Error('ESMFIX_EMITTED_CONTENT_DRIFT:'+name);
}
if(Object.keys(manifest.emittedPins).length!==9)throw Error('ESMFIX_PIN_COUNT_DRIFT');
const frozen={caseId:'PRE-H1-CONTROLLER-01-PREPARATION-ONLY',
 status:'CODE_ONLY_NOT_EXECUTED_NOT_LAUNCHED',root:relRoot,
 startupFix:'offline-updater-provider-disables-cjs-named-autoUpdater-import',
 evaluatedElectron:false,verifiedNodeEsmModuleLink:true,files};
fs.writeFileSync(out,JSON.stringify(frozen,null,2)+'\n',{flag:'wx'});
console.log('PRE_H1_PREPARATION_ESMFIX_EMITTED_FILE_COUNT='+Object.keys(files).length);
console.log('PRE_H1_PREPARATION_ESMFIX_FROZEN_INVENTORY_SHA256='+sha(fs.readFileSync(out)));
for(const key of ['dist-electron/main.js','dist-electron/preload.cjs','dist-electron/git-worker.js',
 'dist/index.html','preparation-only-manifest.json'])console.log(key+'='+files[key].sha256);
