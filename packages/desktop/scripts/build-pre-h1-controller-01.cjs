/* One strictly local, non-executing PRE-H1 diagnostic build recipe.
 * Run only when separately authorized for CODE-ONLY compilation.
 * The output directory is fresh and immutable after COMPLETE marker creation.
 * NEVER opens Electron/Runner/Worker/Win32 APIs or production dist paths.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const repo=path.resolve(__dirname,'../../..');
const desktop=path.join(repo,'packages/desktop');
const infra=path.join(repo,'packages/infrastructure');
const candidate=path.join(infra,'.pre-h1-controller-01-rc-20261009');
const built=path.join(candidate,'infrastructure');
const rel=(p)=>path.relative(repo,p).split(path.sep).join('/');
const hash=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const forbidden=[path.join(infra,'dist'),path.join(desktop,'dist-electron'),path.join(desktop,'dist')];
function assertChild(file){
 const p=path.resolve(file);
 if(!p.startsWith(candidate+path.sep))throw Error('PRE_H1_BUILD_OUTSIDE_DIAGNOSTIC_DIR');
 for(const x of forbidden)if(p===x||p.startsWith(x+path.sep))throw Error('PRE_H1_PRODUCTION_OUTPUT_MUTATION');
}
function write(file,bytes){
 assertChild(file);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,bytes);
}
function copyTs(){
 const ts=require(path.join(repo,'node_modules/typescript'));
 const guards=Object.freeze({
  'private-mvp-desktop-runner-owner.ts':'F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED',
  'private-mvp-runner-control-entry.ts':'F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED',
  'private-mvp-desktop-pipe-worker.ts':'F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED',
  'private-mvp-runner-control-watchdog.ts':'F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED',
 });
 const entries=[];
 function walk(folder){
  for(const item of fs.readdirSync(folder,{withFileTypes:true})){
   const p=path.join(folder,item.name);
   if(item.isDirectory())walk(p);
   else if(item.name.endsWith('.ts')&&!item.name.endsWith('.d.ts'))entries.push(p);
  }
 }
 walk(path.join(infra,'src'));
 const entryFile=path.join(built,'private-mvp-runner-control-entry.js');
 const entryRel=path.win32.normalize(entryFile);
 let entrySha='';
 const emit=(file,source)=>{
  const js=ts.transpileModule(source,{
   compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,
     esModuleInterop:true,isolatedModules:true},fileName:file,
  }).outputText;
  const out=path.join(built,path.relative(path.join(infra,'src'),file).replace(/\.ts$/,'.js'));
  write(out,js);
  return out;
 };
 // Entry first: the owner pins the exact new diagnostic entry bytes.
 const entryTs=path.join(infra,'src/private-mvp-runner-control-entry.ts');
 let entrySource=fs.readFileSync(entryTs,'utf8');
 entrySource=enableOneGuard(entrySource,guards[path.basename(entryTs)]);
 emit(entryTs,entrySource);
 entrySha=hash(entryFile);
 for(const file of entries){
  if(file===entryTs||path.basename(file)==='private-mvp-h1-compiled-lock.ts')continue;
  let src=fs.readFileSync(file,'utf8');
  const guard=guards[path.basename(file)];
  if(guard)src=enableOneGuard(src,guard);
  if(path.basename(file)==='private-mvp-desktop-runner-owner.ts'){
    const original=/entry:'C:\\\\1\.[^']+private-mvp-runner-control-entry\.js'/;
    if(!original.test(src))throw Error('PRE_H1_FIXED_ENTRY_NOT_UNIQUELY_FOUND');
    src=src.replace(original,'entry:'+JSON.stringify(entryRel));
    const prior=/entrySha256:'[0-9a-f]{64}'/;
    if(!prior.test(src))throw Error('PRE_H1_OLD_ENTRY_PIN_NOT_FOUND');
    src=src.replace(prior,'entrySha256:'+JSON.stringify(entrySha));
    // Candidate is under packages/infrastructure/.pre-h1-.../infrastructure.
    src=src.replace("'../../..'","'../../../..'");
  }
  emit(file,src);
 }
 return entrySha;
}
function enableOneGuard(source,gate){
 if(!gate)return source;
 const old='export const '+gate+'=false as const;';
 const replacement='export const '+gate+'=true as const;';
 if(source.split(old).length!==2)throw Error('PRE_H1_GATE_TRANSFORM_UNEXPECTED:'+gate);
 return source.replace(old,replacement);
}
async function main(){
 if(fs.existsSync(candidate))throw Error('PRE_H1_CANDIDATE_PATH_ALREADY_EXISTS; NO_OVERWRITE');
 fs.mkdirSync(candidate,{recursive:true});
 const entrySha=copyTs();
 const {build}=require(path.join(repo,'node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild'));
 const aliases=Object.freeze({
  '@sud-d/domain':path.join(repo,'packages/domain/src/index.ts'),
  '@sud-d/contracts':path.join(repo,'packages/contracts/src/index.ts'),
  '@sud-d/application':path.join(repo,'packages/application/src/index.ts'),
  '@sud-d/infrastructure':path.join(repo,'packages/infrastructure/src/index.ts'),
 });
 const diagImport='../infrastructure/private-mvp-pre-h1-diagnostic-activation.js';
 const externals=new Set(['electron','koffi','better-sqlite3']);
 const plugin={
  name:'fixed-pre-h1-desktop-only',
  setup(ctx){
   ctx.onResolve({filter:/^@sud-d\/(domain|contracts|application|infrastructure)$/},args=>{
    return{path:aliases[args.path]};
   });
   ctx.onResolve({filter:/private-mvp-pre-h1-diagnostic-activation\.js$/},args=>{
    if(!args.importer.endsWith(path.join('electron','main.ts')))
      throw Error('PRE_H1_UNEXPECTED_DIAGNOSTIC_IMPORTER');
    return{path:diagImport,external:true};
   });
  },
 };
 const output=path.join(candidate,'dist-electron');
 // No Electron is started. A main-process module is compiled, not invoked.
 await build({
  entryPoints:[
   path.join(desktop,'electron/main.ts'),
   path.join(desktop,'electron/preload.ts'),
   path.join(desktop,'electron/git-worker.ts'),
  ],
  outdir:output,outbase:path.join(desktop,'electron'),
  bundle:true,platform:'node',format:'esm',target:'node22',
  splitting:false,packages:'bundle',write:true,
  external:[...externals],plugins:[plugin],
  define:{
   __SUD_D_PRE_H1_DIAGNOSTIC_BUNDLE__:'true',
   __SUD_D_BUILD_REVISION__:JSON.stringify(require('node:child_process')
    .execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()),
   __SUD_D_UPDATE_PUBLIC_KEY_PEM__:JSON.stringify(''),
  },
  logLevel:'warning',metafile:true,
 });
 const mainJs=path.join(output,'main.js');
 if(!fs.readFileSync(mainJs,'utf8').includes(diagImport))
  throw Error('PRE_H1_DIAGNOSTIC_MAIN_NOT_WIRED_TO_PRIVATE_INFRA');
 const {build:viteBuild}=await import(pathToFileURL(
  path.join(desktop,'node_modules/vite/dist/node/index.js')).href);
 const {default:react}=await import(pathToFileURL(
  require.resolve('@vitejs/plugin-react',{paths:[desktop]})).href);
 await viteBuild({
  configFile:false,root:path.join(desktop,'src'),base:'./',
  plugins:[react()],resolve:{alias:{'@':path.join(desktop,'src'),...aliases}},
  build:{outDir:path.join(candidate,'dist'),emptyOutDir:true,
   rollupOptions:{input:path.join(desktop,'src/index.html')}},
  logLevel:'warn',
 });
 write(path.join(candidate,'package.json'),JSON.stringify({
  name:'sud-d-pre-h1-controller-01-review-candidate',
  version:'0.0.0-review-only',private:true,type:'module',
  main:'./dist-electron/main.js',
  description:'DO NOT LAUNCH WITHOUT SEPARATE EXPLICIT OWNER NATIVE AUTHORIZATION',
 },null,2)+'\n');
 // Rebase the import lock onto the emitted diagnostic bytes, never old dist.
 const ordinary=await import(pathToFileURL(path.join(infra,'dist/private-mvp-h1-compiled-lock.js')).href);
 const oldPins=ordinary.F2H1_CONTROLLER_PINNED_FILES;
 const stem=rel(built)+'/';
 const pins={};
 for(const [old,h] of Object.entries(oldPins)){
  if(old.startsWith('packages/infrastructure/dist/')){
   const local=old.slice('packages/infrastructure/dist/'.length);
   const mapped=stem+local;
   if(local==='private-mvp-h1-compiled-lock.js')continue;
   const f=path.join(repo,...mapped.split('/'));
   if(!fs.existsSync(f))throw Error('PRE_H1_MISSING_PINNED:'+mapped);
   pins[mapped]=hash(f);
  }else{
   const f=path.join(repo,...old.split('/'));
   if(!fs.existsSync(f)||hash(f)!==h)throw Error('PRE_H1_CHANGED_INSTALLED_DEPENDENCY:'+old);
   pins[old]=h;
  }
 }
 // An actual diagnostic-only entrypoint, not in the normal 60-file closure.
 const activation=stem+'private-mvp-pre-h1-diagnostic-activation.js';
 pins[activation]=hash(path.join(repo,...activation.split('/')));
 const lockPath=path.join(built,'private-mvp-h1-compiled-lock.js');
 let lock=fs.readFileSync(path.join(infra,'dist/private-mvp-h1-compiled-lock.js'),'utf8');
 lock=lock.replace(/const F2H1_CONTROLLER_PINNED_FILES = Object\.freeze\(\{[\s\S]*?\}\);/,
  'const F2H1_CONTROLLER_PINNED_FILES = Object.freeze('+JSON.stringify(pins,null,2)+');');
 lock=lock.split('packages/infrastructure/dist/').join(stem);
 lock=lock.replace('const ROOTS = [','const ROOTS = ['+JSON.stringify(activation)+',');
 write(lockPath,lock);
 const external={};
 function record(file){
  const name=rel(file);external[name]={bytes:fs.statSync(file).size,sha256:hash(file)};
 }
 record(path.join(candidate,'package.json'));
 function collect(folder){
  for(const d of fs.readdirSync(folder,{withFileTypes:true})){
   const p=path.join(folder,d.name);
   if(d.isDirectory())collect(p);else record(p);
  }
 }
 collect(path.join(candidate,'infrastructure'));
 collect(path.join(candidate,'dist-electron'));
 collect(path.join(candidate,'dist'));
 for(const p of [
  'packages/desktop/node_modules/electron/dist/electron.exe',
  'C:/Program Files/nodejs/node.exe',
  'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
 ]){const file=path.isAbsolute(p)?p:path.join(repo,p);external[p]={bytes:fs.statSync(file).size,sha256:hash(file)};}
 const manifest={
  candidate:'PRE-H1-CONTROLLER-01',state:'CODE_ONLY_NOT_AUTHORIZED',
  isolation:'source-only build-time code substitution; ordinary production constants remain false',
  runnerEntrySha256:entrySha,
  activatedOn:'separately approved single synthetic F2-A Mission, actual diagnostic Electron main app.whenReady',
  maxNativeStarts:1,maxRetries:0,
  pinnedFiles:external,
 };
 write(path.join(candidate,'frozen-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 write(path.join(candidate,'BUILD_COMPLETE_NOT_EXECUTED'),[
  'PRE-H1-CONTROLLER-01','CODE_ONLY_BUILD','NO_NATIVE_EXECUTION','NO_OWNER_AUTHORIZATION',
 ].join('\n')+'\n');
 console.log('PRE_H1_DIAGNOSTIC_BUILD_COMPLETE='+candidate);
 console.log('INFRA_DIAGNOSTIC_PIN_COUNT='+Object.keys(pins).length);
 console.log('RUNNER_ENTRY_SHA256='+entrySha);
 console.log('DESKTOP_MAIN_SHA256='+hash(mainJs));
 console.log('MANIFEST_SHA256='+hash(path.join(candidate,'frozen-manifest.json')));
}
main().catch(e=>{console.error('PRE_H1_DIAGNOSTIC_BUILD_BLOCKED: '+String(e.stack||e));process.exitCode=1;});
