/**
 * PRE-H1 private preparation-only Desktop: isolated SOURCE build only.
 * This compiles existing reviewed Desktop Main/Preload/React, keeps the
 * ordinary inert F2H1 owner and NEVER launches Electron or opens SQLite.
 * No installer, native invocation, public MCP capability or diagnostic path.
 *
 * The new folder intentionally lives beneath packages/desktop so external
 * modules resolve via the ALREADY INSTALLED packages/desktop/node_modules;
 * it is not a standalone installer or independently portable runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {build as viteBuild} from 'vite';
import react from '@vitejs/plugin-react';

const here=path.dirname(fileURLToPath(import.meta.url));
const desktop=path.resolve(here,'..');
const repo=path.resolve(desktop,'../..');
const root=path.join(desktop,'.serena/pre-h1-preparation-desktop-20261009-esmfix');
const electronDir=path.join(root,'dist-electron');
const rendererDir=path.join(root,'dist');
const name='PRE-H1-CONTROLLER-01-PREPARATION-ONLY';
const sha=data=>createHash('sha256').update(data).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const assert=(truth,reason)=>{if(!truth)throw Error('PRE_H1_PREPARATION_BUILD_'+reason);};
assert(!fs.existsSync(root),'CANDIDATE_ALREADY_EXISTS');
const esbuild=createRequire(path.join(repo,'node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/package.json'))('esbuild');
const aliases=Object.fromEntries(['domain','contracts','infrastructure','application']
  .map(n=>['@sud-d/'+n,path.join(repo,'packages',n,'src/index.ts')]));
const originalMain=fs.readFileSync(path.join(desktop,'electron/main.ts'),'utf8').replace(/\r\n/g,'\n');
// Guard against a different current Main or a surprise native owner selection.
assert(originalMain.includes('const desktopRunnerOwner = createF2H1DesktopRunnerOwner();'),'INERT_OWNER_MISSING');
assert(originalMain.includes('const preH1PreparationBridge=createPreH1MissionPreparationBridge({'),'BRIDGE_MISSING');
assert(originalMain.includes('registerDesktopApprovalIpcHandlers('),'APPROVAL_IPC_MISSING');
assert(originalMain.includes('app.whenReady().then(() => {\n  registerIpcHandlers();\n  createWindow();'),'NORMAL_UI_STARTUP_MISSING');
assert(!originalMain.includes('createPreH1DiagnosticDesktopLifecycle'),'DIAGNOSTIC_IN_PRODUCTION_MAIN');
assert(!originalMain.includes('desktopRunnerOwner.startOnce()'),'NATIVE_AUTOSTART_IN_PRODUCTION_MAIN');
// Only a dedicated code-only package changes the updater startup behavior:
// the Owner must explicitly use this PREPARATION UI; opening it does not
// automatically contact an update provider. The ordinary source is untouched.
const oldUpdaterStartup='  updateController.checkOnStartup();';
assert(originalMain.split(oldUpdaterStartup).length===2,'UPDATE_STARTUP_REPLACEMENT_AMBIGUOUS');
const preparedMain=originalMain.replace(oldUpdaterStartup,
  '  // Isolated PRE-H1 preparation-only build: no automatic provider update check.');
// Force offline local renderer for this fixed preparation candidate; never
// allow VITE_DEV_SERVER_URL to redirect the privileged WebContents to a URL.
const preparedOffline=preparedMain.replaceAll("process.env['VITE_DEV_SERVER_URL']", 'undefined')
  .replace("const preloadPath = fs.existsSync(path.join(__dirname, 'preload.mjs'))\n    ? path.join(__dirname, 'preload.mjs')\n    : path.join(__dirname, 'preload.js');",
    "const preloadPath = path.join(__dirname, 'preload.cjs');");
assert(preparedOffline.includes("const preloadPath = path.join(__dirname, 'preload.cjs');"),
  'SANDBOX_PRELOAD_PATH_MISMATCH');
assert(!preparedOffline.includes("process.env['VITE_DEV_SERVER_URL']"),'REMOTE_RENDERER_NOT_DISABLED');

fs.mkdirSync(electronDir,{recursive:true});
await esbuild.build({
  entryPoints:[path.join(desktop,'electron/main.ts')],
  outfile:path.join(electronDir,'main.js'),
  bundle:true,format:'esm',platform:'node',target:'node22',
  packages:'bundle',external:['electron','better-sqlite3','koffi'],
  alias:aliases,legalComments:'none',
  banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"},
  define:{
    __SUD_D_BUILD_REVISION__:JSON.stringify('7e4c54687f363b2abe6bd34ff71afb4d1a211299'),
    __SUD_D_UPDATE_PUBLIC_KEY_PEM__:'""',
  },
  plugins:[{name:'fixed-pre-h1-preparation-main-offline-updater',setup(build){
    build.onLoad({filter:/[\\/]electron[\\/]update-provider\.ts$/},args=>{
      assert(path.resolve(args.path)===path.resolve(desktop,'electron/update-provider.ts'),
        'UNEXPECTED_UPDATE_PROVIDER');
      // Offline, purpose-limited package: no electron-updater import,
      // HTTPS request, download, install, or implicit updater initialization.
      return {loader:'ts',resolveDir:path.dirname(args.path),contents:`
        export function createElectronUpdateProvider(){
          return Object.freeze({
            async check(){throw Error('PRE_H1_PREPARATION_UPDATES_DISABLED');},
            async download(){throw Error('PRE_H1_PREPARATION_UPDATES_DISABLED');},
            restartAndInstall(){throw Error('PRE_H1_PREPARATION_UPDATES_DISABLED');},
          });
        }
        export async function loadSignedReleaseManifest(){
          throw Error('PRE_H1_PREPARATION_UPDATES_DISABLED');
        }
      `};
    });
    build.onLoad({filter:/[\\/]electron[\\/]main\.ts$/},args=>{
      assert(path.resolve(args.path)===path.resolve(desktop,'electron/main.ts'),'UNEXPECTED_MAIN');
      return {contents:preparedOffline,loader:'ts',resolveDir:path.dirname(args.path)};
    });
  }}],
  logLevel:'warning',
});
await esbuild.build({
  entryPoints:[path.join(desktop,'electron/git-worker.ts')],
  outfile:path.join(electronDir,'git-worker.js'),
  bundle:true,format:'esm',platform:'node',target:'node22',
  packages:'bundle',external:['electron','better-sqlite3','koffi'],
  alias:aliases,legalComments:'none',logLevel:'warning',
});
await esbuild.build({
  entryPoints:[path.join(desktop,'electron/preload.ts')],
  outfile:path.join(electronDir,'preload.cjs'),
  bundle:true,format:'cjs',platform:'node',target:'node22',
  packages:'bundle',alias:aliases,external:['electron'],
  legalComments:'none',logLevel:'warning',
});
await viteBuild({
  configFile:false,root:path.join(desktop,'src'),base:'./',
  plugins:[react()],
  resolve:{alias:{'@':path.join(desktop,'src'),...aliases}},
  build:{
    outDir:rendererDir,emptyOutDir:false,assetsDir:'assets',
    rollupOptions:{input:path.join(desktop,'src/index.html')},
  },
  logLevel:'warn',
});
const icon=path.join(desktop,'src/assets/sud-d-app-icon.png');
assert(fs.existsSync(icon),'APP_ICON_MISSING');
fs.mkdirSync(path.join(root,'src/assets'),{recursive:true});
fs.copyFileSync(icon,path.join(root,'src/assets/sud-d-app-icon.png'),fs.constants.COPYFILE_EXCL);
fs.copyFileSync(path.join(desktop,'package.json'),path.join(root,'package.json'),fs.constants.COPYFILE_EXCL);
const compiledMain=fs.readFileSync(path.join(electronDir,'main.js'),'utf8');
const compiledPreload=fs.readFileSync(path.join(electronDir,'preload.cjs'),'utf8');
assert(compiledPreload.includes('require("electron")'),'SANDBOX_REQUIRE_ELECTRON_MISSING');
assert(!compiledPreload.includes('from "zod"'),'SANDBOX_EXTERNAL_ZOD_IMPORT');
const html=fs.readFileSync(path.join(rendererDir,'index.html'),'utf8');
const assets=fs.readdirSync(path.join(rendererDir,'assets')).filter(n=>n.endsWith('.js'));
const renderer=assets.map(n=>fs.readFileSync(path.join(rendererDir,'assets',n),'utf8')).join('\n');
const needed=['pre-h1:prepare:review','pre-h1:prepare:request','pre-h1:prepare:cancel',
  'approval:list','approval:respond'];
for(const route of needed){
  assert(compiledMain.includes(route),'MAIN_ROUTE_MISSING_'+route);
  assert(compiledPreload.includes(route),'PRELOAD_ROUTE_MISSING_'+route);
}
for(const x of ['preH1Review','preH1Request','preH1Cancel',
    'Review fixed Mission','Mission SHA-256 binding','Pending approvals']){
  assert(renderer.includes(x),'RENDERER_WORKFLOW_MISSING_'+x);
}
assert(compiledMain.includes('PRE_H1_PREPARATION_TERMINAL'),'PRIVATE_KERNEL_BRIDGE_NOT_EMITTED');
assert(compiledMain.includes('preload.cjs'),'MAIN_SANDBOX_PRELOAD_PATH_MISSING');
assert(compiledMain.includes('createF2H1DesktopRunnerOwner'),'INERT_OWNER_NOT_EMITTED');
assert(!compiledMain.includes('createPreH1DiagnosticDesktopLifecycle'),
  'DIAGNOSTIC_ACTIVATION_IN_MAIN');
assert(!compiledMain.includes('PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED'),
  'RC5_NATIVE_DIAGNOSTIC_BUNDLED');
assert(!compiledMain.includes('desktopRunnerOwner.startOnce()'),'RUNNER_AUTOSTART');
assert(!compiledMain.includes('updateController.checkOnStartup()'),'AUTO_UPDATE_STILL_PRESENT');
assert(!compiledMain.includes('electron-updater'),'CJS_UPDATER_IMPORT_STILL_PRESENT');
assert(!compiledMain.includes('autoUpdater'),'CJS_UPDATER_RUNTIME_STILL_PRESENT');
assert(!compiledMain.includes('https://github.com/JekdoTH/SUD_D/releases/latest/download/sud-d-release.json'),
  'UPDATE_NETWORK_MANIFEST_PRESENT');
assert(compiledMain.includes('PRE_H1_PREPARATION_UPDATES_DISABLED'),
  'NO_OFFLINE_UPDATER_FENCE');
assert(!compiledMain.includes('VITE_DEV_SERVER_URL'),'REMOTE_RENDERER_CONTROL_STILL_PRESENT');
assert(!/runner\.mission.*registerTool|runner\.start.*registerTool/.test(compiledMain),
  'PUBLIC_EXECUTION_ROUTE');
assert(html.includes('assets/')&&!html.includes('http://')&&!html.includes('https://'),
  'RENDERER_ASSET_URL_NOT_OFFLINE');
const requireForBundle=createRequire(path.join(electronDir,'main.js'));
for(const module of ['electron','better-sqlite3','koffi']){
  const resolved=requireForBundle.resolve(module);assert(fs.existsSync(resolved),'EXTERNAL_MISSING_'+module);
}
// The reviewer can separately hash every byte in this output, including this
// manifest, against the external immutable inventory that is issued later.
const emitted=[];
function collect(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const f=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw Error('PRE_H1_UNEXPECTED_EMITTED_SYMLINK');
    if(entry.isDirectory())collect(f);
    else if(entry.isFile())emitted.push(f);
  }
}
collect(root);
const files=Object.fromEntries(emitted.sort().map(f=>[path.relative(root,f).replaceAll('\\','/'),
  {bytes:fs.statSync(f).size,sha256:hash(f)}]));
const sourcePaths=[
  'packages/desktop/electron/main.ts','packages/desktop/electron/preload.ts',
  'packages/desktop/electron/approval-ipc.ts','packages/desktop/electron/approval-controller.ts',
  'packages/desktop/electron/pre-h1-mission-preparation.ts',
  'packages/desktop/src/App.tsx','packages/desktop/src/pages/ActivityPage.tsx',
  'packages/contracts/src/index.ts','packages/application/src/approval-service.ts',
  'packages/infrastructure/src/private-mvp-mission-admission.ts',
  'packages/infrastructure/src/private-mvp-pre-h1-preparation-contract.ts',
  'packages/desktop/scripts/build-pre-h1-preparation-desktop-esmfix.mjs',
];
const sourcePins=Object.fromEntries(sourcePaths.map(f=>[f,{bytes:fs.statSync(path.join(repo,f)).size,
  sha256:hash(path.join(repo,f))}]));
const identity={
  caseId:name,status:'CODE_ONLY_PREPARATION_DESKTOP_NOT_EXECUTED',
  root:path.relative(repo,root).replaceAll('\\','/'),
  desktopMain:'dist-electron/main.js',preload:'dist-electron/preload.cjs',
  renderer:'dist/index.html',gitWorker:'dist-electron/git-worker.js',
  existingOwner:'inert createF2H1DesktopRunnerOwner()',
  missionAuthority:'pre-h1.prepare; manual owner; enroll/reserve ONLY',
  nativeAuthority:false,autoPrepare:false,automaticProviderCheck:false,
  providerRuntime:'offline-no-electron-updater',
  publicMcpRunnerExecution:false,requiresInstalledElectronRuntime:true,
  installedExternalResolutions:Object.fromEntries(['electron','better-sqlite3','koffi']
    .map(m=>[m,path.relative(repo,requireForBundle.resolve(m)).replaceAll('\\','/')])),
  sourcePins,emittedPins:files,
};
fs.writeFileSync(path.join(root,'preparation-only-manifest.json'),JSON.stringify(identity,null,2)+'\n',{flag:'wx'});
console.log('PRE_H1_PREPARATION_DESKTOP_BUILT='+root);
console.log('PRE_H1_EMITTED_COUNT_WITHOUT_MANIFEST='+emitted.length);
console.log('PRE_H1_MAIN_SHA256='+hash(path.join(electronDir,'main.js')));
console.log('PRE_H1_PRELOAD_SHA256='+hash(path.join(electronDir,'preload.cjs')));
console.log('PRE_H1_RENDERER_HTML_SHA256='+hash(path.join(rendererDir,'index.html')));
console.log('PRE_H1_MANIFEST_SHA256='+hash(path.join(root,'preparation-only-manifest.json')));
console.log('PRE_H1_IPC_UI_IMPORT_INTEGRITY=PASS');
