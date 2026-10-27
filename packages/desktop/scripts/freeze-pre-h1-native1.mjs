/** Freeze exactly one Native1 candidate, INCLUDING the separate consent
 * issuance Desktop. Do not follow the one trusted existing dependency junction. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const relative='packages/desktop/.serena/pre-h1-controller-01-20261009-native1';
const root=path.join(repo,relative);
const dest=path.join(repo,'.serena/reports/pre-h1-first-native-all-emitted-byte-pins-20261009.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
if(fs.existsSync(dest))throw Error('NATIVE1_INVENTORY_ALREADY_FROZEN');
for(const f of ['desktop/dist-electron/main.js',
  'consent-desktop/dist-electron/main.js',
  'consent-desktop/dist-electron/preload.cjs',
  'infrastructure/dist/private-mvp-pre-h1-native-consent.js',
  'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'])
 if(!fs.existsSync(path.join(root,f)))throw Error('NATIVE1_MISSING_COMPILED:'+f);
const allowedJunction=path.join(root,'infrastructure/node_modules');
const expectedJunction=path.join(repo,'packages/infrastructure/node_modules');
if(!fs.existsSync(allowedJunction)||fs.realpathSync(allowedJunction)!==fs.realpathSync(expectedJunction))
 throw Error('NATIVE1_DEPENDENCY_JUNCTION_UNEXPECTED');
const inventory={caseId:'PRE-H1-CONTROLLER-01',status:'CODE_ONLY_NO_NATIVE_EXECUTION',
 root:relative,excludedDependencyJunction:'infrastructure/node_modules',files:{}};
function collect(dir){
 for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,ent.name);
  if(file===allowedJunction)continue;
  if(ent.isSymbolicLink())throw Error('NATIVE1_UNEXPECTED_SYMLINK:'+file);
  if(ent.isDirectory())collect(file);
  else if(ent.isFile()){
   const b=fs.readFileSync(file);
   inventory.files[path.relative(root,file).replaceAll('\\','/')]={bytes:b.length,sha256:hash(b)};
  }else throw Error('NATIVE1_NONREGULAR_OUTPUT:'+file);
 }
}
collect(root);
if(Object.keys(inventory.files).length<260)throw Error('NATIVE1_UNEXPECTED_FILE_COUNT');
const main=fs.readFileSync(path.join(root,'desktop/dist-electron/main.js'),'utf8');
const issuer=fs.readFileSync(path.join(root,'consent-desktop/dist-electron/main.js'),'utf8');
const activation=fs.readFileSync(path.join(root,'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'),'utf8');
if(main.includes('electron-updater')||issuer.includes('electron-updater')
  ||!issuer.includes('pre-h1.native-consent')
  ||!(activation.indexOf('readApprovedPreH1Diagnostic(db, new Date())')
     <activation.indexOf('consumePreH1NativeAuthorization(db, new Date())')
     &&activation.indexOf('consumePreH1NativeAuthorization(db, new Date())')
       <activation.indexOf('bindF2H1DesktopRunnerWin32().createFixedDesktopSession')))
 throw Error('NATIVE1_FROZEN_RUNTIME_FENCE_FAILED');
fs.writeFileSync(dest,JSON.stringify(inventory,null,2)+'\n',{flag:'wx'});
console.log('NATIVE1_FROZEN_FILE_COUNT='+Object.keys(inventory.files).length);
console.log('NATIVE1_INVENTORY_SHA256='+hash(fs.readFileSync(dest)));
for(const f of ['desktop/dist-electron/main.js','consent-desktop/dist-electron/main.js',
 'consent-desktop/dist-electron/preload.cjs',
 'infrastructure/dist/private-mvp-pre-h1-native-consent.js',
 'infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js',
 'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js',
 'infrastructure/dist/private-mvp-h1-compiled-lock.js'])
 console.log('EMITTED '+f+'='+inventory.files[f].sha256);
