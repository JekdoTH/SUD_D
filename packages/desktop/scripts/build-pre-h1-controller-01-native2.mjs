/**
 * ONE purpose-built, NON-EXECUTING PRE-H1-CONTROLLER-01 build recipe.
 * Never run or launch the resulting Electron app/Runner/Worker/Job.
 * Runs installed TypeScript/esbuild compilers only. Not an installer.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const desktop=path.join(repo,'packages/desktop');
const infra=path.join(repo,'packages/infrastructure');
const relRoot='packages/desktop/.serena/pre-h1-controller-01-20261009-native2';
const candidate=path.join(repo,...relRoot.split('/'));
const infraDist=path.join(candidate,'infrastructure/dist');
const newPrefix=relRoot+'/infrastructure/dist/';
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function checkReplace(source,oldValue,newValue,label) {
  if(!source.includes(oldValue)||source.indexOf(oldValue)!==source.lastIndexOf(oldValue))
    throw Error('BUILD_REPLACEMENT_EXPECTED_ONCE:'+label);
  return source.replace(oldValue,newValue);
}
if(fs.existsSync(candidate))throw Error('DIAGNOSTIC_DISPOSABLE_PATH_ALREADY_EXISTS');
fs.mkdirSync(infraDist,{recursive:true});
const pnpm=process.platform==='win32'?'pnpm.cmd':'pnpm';
const args=['--filter','@sud-d/infrastructure','exec','tsc','--project','tsconfig.json','--outDir',infraDist];
const built=spawnSync(pnpm,args,{cwd:repo,encoding:'utf8',shell:process.platform==='win32',maxBuffer:8*1024*1024});
if(built.status!==0)throw Error('DIAGNOSTIC_TSC_FAILED:'+(built.stderr||built.stdout));
const files=[
 ['private-mvp-desktop-runner-owner.js','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
 ['private-mvp-runner-control-entry.js','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
 ['private-mvp-runner-control-watchdog.js','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
 ['private-mvp-desktop-pipe-worker.js','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
];
for(const [name,flag] of files) {
 const filename=path.join(infraDist,name);
 let source=fs.readFileSync(filename,'utf8');
 source=checkReplace(source,'export const '+flag+' = false;','export const '+flag+' = true;',flag);
 fs.writeFileSync(filename,source);
}
// Native-2: modify the ISOLATED emitted activation, not ordinary Source or frozen RC5.
const activationFile=path.join(infraDist,'private-mvp-pre-h1-diagnostic-activation.js');
let activation=fs.readFileSync(activationFile,'utf8');
activation=checkReplace(activation,
  "import { bindF2H1DesktopRunnerWin32 } from './private-mvp-desktop-runner-owner.js';",
  "import { bindF2H1DesktopRunnerWin32 } from './private-mvp-desktop-runner-owner.js';\\nimport { consumePreH1NativeAuthorization } from './private-mvp-pre-h1-native-consent.js';".replaceAll('\\n','\n'),
  'NATIVE_CONSUMER_IMPORT');
activation=checkReplace(activation,
  "import { consumePreH1NativeAuthorization } from './private-mvp-pre-h1-native-consent.js';",
  "import { consumePreH1NativeAuthorization } from './private-mvp-pre-h1-native-consent.js';\nimport { privateMvpMissionBindingDigest } from './private-mvp-mission-admission.js';",
  'NATIVE2_EXPLICIT_MISSION_DIGEST_BINDING');
activation=checkReplace(activation,
  "if (!PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED)\\n                throw Error('PRE_H1_RC5_SEPARATE_NATIVE_OWNER_CONSENT_REQUIRED');".replaceAll('\\n','\n'),
  "const nativeConsent = consumePreH1NativeAuthorization(db, new Date());\\n            if (nativeConsent.scope.missionBindingDigest !== privateMvpMissionBindingDigest(binding.scope)\\n                || nativeConsent.scope.ownerEpoch !== PRE_H1_FIXED_DIAGNOSTIC.ownerEpoch)\\n                throw Error('PRE_H1_NATIVE_CONSENT_BINDING_MISMATCH');".replaceAll('\\n','\n'),
  'ONE_USE_CONSENT_BEFORE_BIND');
if(activation.indexOf('consumePreH1NativeAuthorization(db') >=
  activation.indexOf('session = bindF2H1DesktopRunnerWin32()'))
  throw Error('NATIVE_CONSENT_ORDER_INVALID');
fs.writeFileSync(activationFile,activation);
const entry=path.join(infraDist,'private-mvp-runner-control-entry.js');
const ownerFile=path.join(infraDist,'private-mvp-desktop-runner-owner.js');
let owner=fs.readFileSync(ownerFile,'utf8');
// Enrol the exact NEW emitted diagnostic Controller instead of production dist.
owner=owner.replace(/entry: 'C:\\\\1\.[^\n]+private-mvp-runner-control-entry\.js',/,
  'entry: '+JSON.stringify(entry)+',');
if(!owner.includes(JSON.stringify(entry)))throw Error('DIAGNOSTIC_RUNNER_ENTRY_NOT_REPINNED');
owner=owner.replace(/entrySha256: '[0-9a-f]{64}'/, 'entrySha256: '+JSON.stringify(digest(entry)));
owner=checkReplace(owner,
  "path.win32.resolve(path.win32.dirname(F2H1_TOPOLOGY_B.entry), '../../..')",
  JSON.stringify(repo),'DIAGNOSTIC_LOCK_ROOT');
// The isolated Guardian must enforce exactly ONE member (Runner only).
// The production unexecuted topology source/byte identity is unchanged.
owner=checkReplace(owner,'ActiveProcessLimit: 10,','ActiveProcessLimit: 1,',
  'DIAGNOSTIC_ONE_RUNNER_JOB_LIMIT');
fs.writeFileSync(ownerFile,owner);
// The authoritative lock is a separate compiled root. Rebuild every changed
// identity, including itself via an EXTERNAL manifest SHA. Do not self-pin.
const sourceLock=path.join(infraDist,'private-mvp-h1-compiled-lock.js');
let lock=fs.readFileSync(sourceLock,'utf8');
const {F2H1_CONTROLLER_PINNED_FILES:oldPins}=await import(pathToFileURL(path.join(infra,'dist/private-mvp-h1-compiled-lock.js')).href);
lock=lock.replaceAll('packages/infrastructure/dist/',newPrefix);
const added='private-mvp-pre-h1-diagnostic-activation.js';
const activationRel=newPrefix+added;
const additionalRoots=[
  'private-mvp-pre-h1-diagnostic-preflight.js',
  'private-mvp-pre-h1-preparation-contract.js',
  'private-mvp-pre-h1-native-consent.js',
  'private-mvp-pre-h1-native-consent-contract.js',
];
lock=checkReplace(lock,'const ROOTS = [','const ROOTS = [\n    '+JSON.stringify(activationRel)+',','DIAGNOSTIC_ACTIVATION_ROOT');
const newPins={};
for(const [name,oldHash] of Object.entries(oldPins)) {
  const next=name.startsWith('packages/infrastructure/dist/')
    ?newPrefix+name.slice('packages/infrastructure/dist/'.length):name;
  const actual=path.join(repo,...next.split('/'));
  const newHash=digest(actual);
  newPins[next]=newHash;
  if(name.startsWith('packages/infrastructure/dist/')){
    const oldLiteral=JSON.stringify(next)+': '+JSON.stringify(oldHash);
    const nextLiteral=JSON.stringify(next)+': '+JSON.stringify(newHash);
    if(oldLiteral!==nextLiteral)lock=checkReplace(lock,oldLiteral,nextLiteral,'PIN:'+name);
  }
}
const activationHash=digest(path.join(infraDist,added));
const additionalPins=Object.fromEntries([added,...additionalRoots]
  .map(name=>[newPrefix+name,digest(path.join(infraDist,name))]));
Object.assign(newPins,additionalPins);
lock=checkReplace(lock,
  'export const F2H1_CONTROLLER_PINNED_FILES = Object.freeze({',
  'export const F2H1_CONTROLLER_PINNED_FILES = Object.freeze({\n    '+
    Object.entries(additionalPins).map(([file,hash])=>
      JSON.stringify(file)+': '+JSON.stringify(hash)+',').join('\n    '),
  'DIAGNOSTIC_LOCK_ACTIVATION');
fs.writeFileSync(sourceLock,lock);
// Compile a TRUE Electron *main-process* entry by transforming current main.ts
// at build time. The ordinary source/main and public IPC remain untouched.
const esbuildRequire=createRequire(path.join(repo,'node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/package.json'));
const esbuild=esbuildRequire('esbuild');
const main=path.join(desktop,'electron/main.ts');
const desktopDir=path.join(candidate,'desktop');
const electronDir=path.join(desktopDir,'dist-electron');
fs.mkdirSync(electronDir,{recursive:true});
const importExpression="await import(new URL('../../infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js',import.meta.url).href)";
const plugin={
 name:'pre-h1-native2-fixed-offline-desktop',
 setup(build) {
  build.onLoad({filter:/[\\/]electron[\\/]update-provider\.ts$/},args=>{
    if(path.resolve(args.path)!==path.join(desktop,'electron/update-provider.ts'))
      throw Error('UNEXPECTED_PROVIDER_ENTRY');
    return{loader:'ts',resolveDir:path.dirname(args.path),contents:`
      export function createElectronUpdateProvider(){return Object.freeze({
        async check(){throw Error('PRE_H1_NATIVE_OFFLINE_UPDATE_DISABLED')},
        async download(){throw Error('PRE_H1_NATIVE_OFFLINE_UPDATE_DISABLED')},
        restartAndInstall(){throw Error('PRE_H1_NATIVE_OFFLINE_UPDATE_DISABLED')}
      })}
      export async function loadSignedReleaseManifest(){
        throw Error('PRE_H1_NATIVE_OFFLINE_UPDATE_DISABLED')}
    `};
  });
  build.onLoad({filter:/[\\/]electron[\\/]main\.ts$/},async args=>{
   let contents=fs.readFileSync(args.path,'utf8').replace(/\r\n/g,'\n');
   contents=checkReplace(contents,
    'const desktopRunnerOwner = createF2H1DesktopRunnerOwner();',
    'const {createPreH1DiagnosticDesktopLifecycle} = '+importExpression+';\nconst desktopRunnerOwner = createPreH1DiagnosticDesktopLifecycle(db);',
    'DESKTOP_PRIVATE_OWNER_REPLACEMENT');
   // Diagnostic main has NO renderer IPC, Window, Connect or update/network
   // startup path; its only app.whenReady action is this one-shot Controller.
   contents=checkReplace(contents,
    "app.whenReady().then(() => {\\n  registerIpcHandlers();\\n  createWindow();\\n  updateController.checkOnStartup();\\n\\n  app.on('activate', () => {\\n    if (BrowserWindow.getAllWindows().length === 0) createWindow();\\n  });\\n});".replaceAll('\\n','\n'),
    "app.whenReady().then(() => {\n  void (async () => {\n    try {\n      await desktopRunnerOwner.startOnce();\n      await new Promise(resolve => setTimeout(resolve, 30_000));\n    } catch {\n      console.error('[PRE-H1-01] One-use startup denied or fenced');\n    }\n    try {\n      await orderlyShutdown();\n      app.quit();\n    } catch {\n      console.error('[PRE-H1-01] Cleanup uncertainty; retaining F2-A charge');\n      app.exit(74);\n    }\n  })();\n});",
    'DESKTOP_ONLY_STARTUP_TRIGGER');
   return{contents,loader:'ts',resolveDir:path.dirname(args.path)};
  });
 }
};
const aliases=Object.fromEntries(['domain','contracts','infrastructure','application']
  .map(n=>['@sud-d/'+n,path.join(repo,'packages',n,'src/index.ts')]));
await esbuild.build({
 entryPoints:[main],outfile:path.join(electronDir,'main.js'),
 bundle:true,format:'esm',platform:'node',target:'node22',
 packages:'bundle',external:['electron','better-sqlite3','koffi'],alias:aliases,plugins:[plugin],
 define:{__SUD_D_BUILD_REVISION__:JSON.stringify('7e4c54687f363b2abe6bd34ff71afb4d1a211299'),
  __SUD_D_UPDATE_PUBLIC_KEY_PEM__:'""'},
 logLevel:'warning',legalComments:'none',
});
await esbuild.build({
 entryPoints:[path.join(desktop,'electron/preload.ts')],
 outfile:path.join(electronDir,'preload.mjs'),bundle:true,platform:'node',
 format:'esm',target:'node22',packages:'external',alias:aliases,
 logLevel:'warning',legalComments:'none',
});
fs.copyFileSync(path.join(desktop,'package.json'),path.join(desktopDir,'package.json'));
const staticRender=path.join(desktop,'dist');
const psQuote=s=>"'"+s.replaceAll("'","''")+"'";
function buildOnlyPowerShell(command,label){
  const output=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
    {cwd:repo,encoding:'utf8',maxBuffer:2*1024*1024});
  if(output.status!==0)throw Error('DIAGNOSTIC_BUILD_'+label+':'+(output.stderr||output.stdout));
}
// Installed Node 24 on this Windows image fail-fasts during fs.cpSync. Use
// the installed shell to copy ONLY preexisting static renderer bits into the
// NEW output. No running Electron, no provisioning, no source/binary overwrite.
if(fs.existsSync(staticRender)){
  const target=path.join(desktopDir,'dist');
  buildOnlyPowerShell("New-Item -ItemType Directory -Force -Path "+psQuote(target)+
    " | Out-Null; Copy-Item -LiteralPath "+psQuote(path.join(staticRender,'index.html'))+
    " -Destination "+psQuote(path.join(target,'index.html'))+
    "; Copy-Item -LiteralPath "+psQuote(path.join(staticRender,'assets'))+
    " -Destination "+psQuote(path.join(target,'assets'))+" -Recurse",'COPY_RENDERER');
}
// Only a junction INSIDE the disposable candidate to the installed, unchanged
// infrastructure dependencies. No install or binary mutation.
buildOnlyPowerShell("New-Item -ItemType Junction -Path "+
  psQuote(path.join(candidate,'infrastructure/node_modules'))+" -Target "+
  psQuote(path.join(infra,'node_modules'))+" | Out-Null",'LINK_EXISTING_DEPENDENCIES');
// Verify the final exact Controller closure without loading any Koffi DLL,
// Win32 API, Worker or Electron runtime.
const diagnosticLock=await import(pathToFileURL(sourceLock).href);
diagnosticLock.verifyF2H1PinnedControllerClosure(repo);
const packageInfo={
  caseId:'PRE-H1-CONTROLLER-01',
  status:'CODE-ONLY-NATIVE2-CORRECTIVE-NOT_EXECUTED',
  repoCommit:'7e4c54687f363b2abe6bd34ff71afb4d1a211299',
  targetRoot:relRoot,
  fixedMissionId:'pre-h1-controller-01',
  fixedAttemptId:'pre-h1-controller-01-attempt-01',
  diagnosticCompiledGates:files.map(([filename,name])=>({filename:newPrefix+filename,name,value:true})),
  productionSourceGatesRemainFalse:true,
  compiledPinnedFiles:Object.keys(newPins).length,
  compiledPinnedHashes:newPins,
  inspectedFiles:{
    'desktop/dist-electron/main.js':digest(path.join(electronDir,'main.js')),
    'desktop/dist-electron/preload.mjs':digest(path.join(electronDir,'preload.mjs')),
    'infrastructure/dist/private-mvp-h1-compiled-lock.js':digest(sourceLock),
    'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js':activationHash,
    'infrastructure/dist/private-mvp-runner-control-entry.js':digest(entry),
    'infrastructure/dist/private-mvp-desktop-runner-owner.js':digest(ownerFile),
    'infrastructure/dist/private-mvp-desktop-pipe-worker.js':digest(path.join(infraDist,'private-mvp-desktop-pipe-worker.js')),
    'infrastructure/dist/private-mvp-runner-control-watchdog.js':digest(path.join(infraDist,'private-mvp-runner-control-watchdog.js')),
    'C:/Program Files/nodejs/node.exe':digest('C:/Program Files/nodejs/node.exe'),
    'packages/desktop/node_modules/electron/dist/electron.exe':digest(path.join(desktop,'node_modules/electron/dist/electron.exe')),
    'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node':
      digest(path.join(repo,'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node')),
    'scripts/build-pre-h1-controller-01-native2.mjs':digest(fileURLToPath(import.meta.url)),
    'packages/infrastructure/src/private-mvp-pre-h1-diagnostic-activation.ts':
      digest(path.join(infra,'src/private-mvp-pre-h1-diagnostic-activation.ts')),
  },
};
const emittedMain=fs.readFileSync(path.join(electronDir,'main.js'),'utf8');
if(emittedMain.includes('electron-updater')||emittedMain.includes('autoUpdater')
  ||!emittedMain.includes('PRE_H1_NATIVE_OFFLINE_UPDATE_DISABLED'))
  throw Error('NATIVE1_UPDATER_RUNTIME_NOT_DISABLED');
fs.writeFileSync(path.join(candidate,'frozen-diagnostic-manifest.json'),
 JSON.stringify(packageInfo,null,2)+'\n');
console.log('PRE_H1_CODE_ONLY_ARTIFACT_BUILT='+candidate);
console.log('PRE_H1_COMPILED_PINS='+Object.keys(newPins).length);
console.log('PRE_H1_DESKTOP_MAIN_SHA256='+packageInfo.inspectedFiles['desktop/dist-electron/main.js']);
console.log('PRE_H1_RUNNER_ENTRY_SHA256='+packageInfo.inspectedFiles['infrastructure/dist/private-mvp-runner-control-entry.js']);
console.log('PRE_H1_LOCK_ROOT_SHA256='+packageInfo.inspectedFiles['infrastructure/dist/private-mvp-h1-compiled-lock.js']);
