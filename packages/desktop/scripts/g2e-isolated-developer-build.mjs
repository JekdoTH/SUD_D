import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {createRequire,isBuiltin} from 'node:module';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const desktop=path.resolve('packages/desktop'),repo=path.resolve('.'),root=path.resolve(os.tmpdir(),'sudd-g2g-latest-desktop-build-20261016-04'),mode=process.argv[2];
const requiredHead='7e4c54687f363b2abe6bd34ff71afb4d1a211299';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(x,m)=>{if(!x)throw Error('G2E_'+m)};
const inside=p=>{const r=path.relative(root,path.resolve(p));assert(r&&!r.startsWith('..')&&!path.isAbsolute(r),'OUTPUT_ESCAPE');return p};
const source=['packages/desktop/vite.config.ts','packages/desktop/electron/main.ts','packages/desktop/electron/git-worker.ts','packages/desktop/electron/preload.ts','packages/desktop/src/index.html','packages/infrastructure/src/serena-managed-runtime.ts'];
const snapshots=()=>Object.fromEntries(source.map(p=>[p,sha(path.join(repo,p))]));
function gate(){assert(process.env.SUD_D_REQUIRE_CLEAN_RELEASE!=='1'&&process.env.SUD_D_REQUIRE_UPDATE_PUBLIC_KEY!=='1','RELEASE_FLAGS');assert(!fs.existsSync(root),'ROOT_REUSE');assert(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim()===requiredHead,'HEAD_DRIFT');assert(execFileSync('git',['diff','--cached','--name-only'],{cwd:repo,encoding:'utf8'}).trim()==='','STAGED');const requireDesktop=createRequire(path.join(desktop,'package.json'));const v=requireDesktop.resolve('vite');const react=requireDesktop.resolve('@vitejs/plugin-react');const requireVite=createRequire(v);const requireRepo=createRequire(path.join(repo,'package.json'));const esbuild=requireVite.resolve('esbuild');const ts=requireRepo.resolve('typescript');for(const p of [v,react,esbuild,ts])assert(fs.statSync(p).isFile(),'MISSING_TOOL');return {source:snapshots(),toolchain:{vite:sha(v),react:sha(react),esbuild:sha(esbuild),typescript:sha(ts)},revision:requiredHead};}
function selfTest(){assert(path.resolve(root,'outputs/renderer')===inside(path.resolve(root,'outputs/renderer')),'PATH');for(const p of [repo,path.join(root,'..'),path.join(desktop,'dist')]){let rejected=false;try{inside(p)}catch{rejected=true}assert(rejected,'ESCAPE_NEGATIVE')}const requireDesktop=createRequire(path.join(desktop,'package.json'));const requireRepo=createRequire(path.join(repo,'package.json'));const resolvedVite=requireDesktop.resolve('vite');const resolvedEsbuild=createRequire(resolvedVite).resolve('esbuild');const resolvedTs=requireRepo.resolve('typescript');assert([resolvedVite,resolvedEsbuild,resolvedTs].every(p=>fs.statSync(p).isFile()),'ESM_RESOLVE_FAILED');const raw=fs.readFileSync(new URL(import.meta.url),'utf8');assert(!/(^|[^.\w])require\.resolve\(/.test(raw),'BARE_REQUIRE_RESOLVE');assert(BUILD_ORDER.join(',')==='renderer,electron-main-worker,electron-preload','STAGE_ORDER');const link=declarationLinks(path.join(root,'outputs'),['domain','contracts','infrastructure','application']);assert(link['@sud-d/infrastructure/*'][0]===path.join(root,'outputs','gateway','infrastructure','dist','*.d.ts'),'FRESH_DECLARATIONS');assert(link['@sud-d/application'][0]===path.join(root,'outputs','gateway','application','dist','index.d.ts'),'APP_DECLARATIONS');const requireGateway=createRequire(path.join(repo,'packages','mcp-gateway','package.json'));assert(fs.statSync(requireGateway.resolve('@types/node/package.json')).isFile(),'NODE_TYPES_RESOLVE');const alias=workspaceAliases();for(const n of ['domain','contracts','infrastructure','application'])assert(resolveWorkspaceAlias('@sud-d/'+n,alias)===path.join(repo,'packages',n,'src','index.ts'),'ROOT_ALIAS_'+n);for(const n of ['infrastructure','application'])assert(resolveWorkspaceAlias('@sud-d/'+n+'/gateway-core',alias)===path.join(repo,'packages',n,'src','gateway-core.ts'),'SUBPATH_ALIAS_'+n);assert(alias.every(entry=>fs.statSync(entry.replacement).isFile()),'ALIASES_NOT_FILES');assert(resolveWorkspaceAlias('@sud-d/infrastructure/other',alias)==='@sud-d/infrastructure/other','UNKNOWN_SUBPATH_SWALLOWED');const large=9007199254740997n;assert(BigInt(large.toString())===large,'BIGINT_FILEID_ROUNDTRIP');assert(!fs.existsSync(root),'SELFTEST_ROOT_WRITE');console.log('G2G_SELFTEST_PASS 19/19')}
function workspaceAliases(){
 const entries=[];
 for(const name of ['infrastructure','application']){
  entries.push({find:new RegExp('^@sud-d/'+name+'/gateway-core$'),replacement:path.join(repo,'packages',name,'src','gateway-core.ts')});
 }
 for(const name of ['domain','contracts','infrastructure','application']){
  entries.push({find:new RegExp('^@sud-d/'+name+'$'),replacement:path.join(repo,'packages',name,'src','index.ts')});
 }
 return entries;
}
function resolveWorkspaceAlias(specifier,entries=workspaceAliases()){
 for(const entry of entries)if(entry.find.test(specifier))return specifier.replace(entry.find,entry.replacement);
 return specifier;
}
const BUILD_ORDER=['renderer','electron-main-worker','electron-preload'];
function declarationLinks(outputs, completed){
 const paths={};
 for(const name of completed){
  const dir=inside(path.join(outputs,'gateway',name,'dist'));
  paths['@sud-d/'+name]=[path.join(dir,'index.d.ts')];
  paths['@sud-d/'+name+'/*']=[path.join(dir,'*.d.ts')];
 }
 return paths;
}
function safeError(e){
 const message=String(e?.message??'');
 const messageCategory=/could not resolve|cannot find module|failed to resolve/i.test(message)?'MODULE_RESOLUTION':
  /not exported/i.test(message)?'EXPORT_MISSING':
  /externalized for browser compatibility/i.test(message)?'BROWSER_EXTERNAL':
  /import\.meta/i.test(message)?'IMPORT_META': 'DETAIL_REDACTED';
 const idValue=typeof e?.id==='string'&&path.isAbsolute(e.id)?path.resolve(e.id):'';
 const relative=idValue?path.relative(repo,idValue):'';
 const safeImportPattern=/@sud-d\/(?:domain|contracts|infrastructure|application)(?:\/gateway-core)?(?=$|[\s'"()])/g;
 const diagnosticInputs=[e?.id,e?.message,e?.cause?.message].filter(x=>typeof x==='string');
 const allowedSpecifier=diagnosticInputs.flatMap(x=>[...x.matchAll(safeImportPattern)].map(m=>m[0]))[0]||null;
 const invalidIndexSubpath=diagnosticInputs.some(x=>/index\.ts[\\/]+gateway-core(?:[\\/]|$|[\s'"()])/i.test(x));
 const relativeSafe=relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)?relative.replaceAll('\\','/').slice(0,150):null;
 return {name:String(e?.name||'Error').replace(/[^A-Za-z0-9]/g,'').slice(0,45),
  code:String(e?.code||'UNSPECIFIED').replace(/[^A-Za-z0-9_]/g,'').slice(0,55),
  plugin:String(e?.plugin||'UNSPECIFIED').replace(/[^A-Za-z0-9:_-]/g,'').slice(0,60),
  id:relativeSafe||'REDACTED',
  missingSpecifier:allowedSpecifier,invalidIndexSubpath,
  normalizedMessage:invalidIndexSubpath?'INDEX_TS_SUBPATH':messageCategory};
}
async function build(){
 const g=gate();fs.mkdirSync(root,{recursive:false});
 const outputs=inside(path.join(root,'outputs'));fs.mkdirSync(outputs);fs.mkdirSync(inside(path.join(root,'evidence')));
 const evidence={gate:g,components:{},artifacts:[],startedAt:new Date().toISOString(),buildOrder:BUILD_ORDER};
 const required=['renderer','electron-main-worker','electron-preload','domain','contracts','infrastructure','application','mcp-gateway'];
 try{
  const req=createRequire(path.join(desktop,'package.json'));
  const vite=await import(pathToFileURL(req.resolve('vite')).href);
  const react=(await import(pathToFileURL(req.resolve('@vitejs/plugin-react')).href)).default;
  const alias=workspaceAliases();
  const defines={__SUD_D_BUILD_REVISION__:JSON.stringify(requiredHead),__SUD_D_UPDATE_PUBLIC_KEY_PEM__:JSON.stringify('')};
  const common={configFile:false,mode:'production',logLevel:'error',clearScreen:false,envDir:root,
   cacheDir:inside(path.join(root,'cache')),resolve:{alias},define:defines};
  const external=id=>isBuiltin(id)||id.startsWith('node:')||['electron','better-sqlite3','koffi'].includes(id);
  const stages=[
   {name:'renderer',cfg:{...common,root:path.join(desktop,'src'),base:'./',plugins:[react()],
    resolve:{alias:[{find:/^@(?=\/|$)/,replacement:path.join(desktop,'src')},...alias]},
    build:{outDir:inside(path.join(outputs,'renderer')),emptyOutDir:true,
     rollupOptions:{input:path.join(desktop,'src/index.html')}}}},
   {name:'electron-main-worker',cfg:{...common,root:desktop,ssr:{target:'node'},
    build:{ssr:true,outDir:inside(path.join(outputs,'electron')),emptyOutDir:true,
     target:'node20',minify:false,
     rollupOptions:{input:{main:path.join(desktop,'electron/main.ts'),
      'git-worker':path.join(desktop,'electron/git-worker.ts')},
      external,output:{format:'es',entryFileNames:'[name].js'}}}}},
   {name:'electron-preload',cfg:{...common,root:desktop,ssr:{target:'node'},
    build:{ssr:true,outDir:inside(path.join(outputs,'electron')),emptyOutDir:false,
     target:'node20',minify:false,
     rollupOptions:{input:{preload:path.join(desktop,'electron/preload.ts')},
      external,output:{format:'es',entryFileNames:'[name].js'}}}}}
  ];
  for(const stage of stages){
   try{await vite.build(stage.cfg);evidence.components[stage.name]={status:'BUILT',exitCode:0};}
   catch(e){evidence.components[stage.name]={status:'FAILED',exitCode:1,error:safeError(e)};}
  }
  const requireRepo=createRequire(path.join(repo,'package.json'));
  const tsm=await import(pathToFileURL(requireRepo.resolve('typescript')).href);
  const ts=tsm.default??tsm;
  const requireGateway=createRequire(path.join(repo,'packages','mcp-gateway','package.json'));
  const typesDir=path.dirname(path.dirname(requireGateway.resolve('@types/node/package.json')));
  assert(fs.statSync(path.join(typesDir,'node')).isDirectory(),'NODE_TYPES_MISSING');
  const completed=[];
  for(const name of ['domain','contracts','infrastructure','application','mcp-gateway']){
   const tsconfig=path.join(repo,'packages',name,'tsconfig.json');
   if(!fs.existsSync(tsconfig)){evidence.components[name]={status:'CONFIG_MISSING',exitCode:1};continue;}
   const config=ts.readConfigFile(tsconfig,ts.sys.readFile);
   if(config.error){evidence.components[name]={status:'CONFIG_ERROR',exitCode:1,diagnostics:[{code:config.error.code}]};continue;}
   const out=inside(path.join(outputs,'gateway',name,'dist'));fs.mkdirSync(out,{recursive:true});
   const overrides={outDir:out,declarationDir:out,tsBuildInfoFile:inside(path.join(out,'build.tsbuildinfo')),
    incremental:false,composite:false,baseUrl:repo,paths:declarationLinks(outputs,completed),
    typeRoots:[typesDir]};
   const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,path.dirname(tsconfig),overrides,tsconfig);
   const program=ts.createProgram(parsed.fileNames,{...parsed.options,noEmit:false,incremental:false,composite:false});
   const diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];
   const safeDiagnostics=diagnostics.slice(0,35).map(d=>{
    const filepath=d.file?path.relative(repo,d.file.fileName).replaceAll('\\','/'):'';
    const position=d.file&&typeof d.start==='number'?d.file.getLineAndCharacterOfPosition(d.start):null;
    return {code:d.code,file:filepath&&!filepath.startsWith('..')?filepath:'REDACTED',
     line:position?position.line+1:null};
   });
   if(diagnostics.length){
    evidence.components[name]={status:'EMIT_BLOCKED',exitCode:1,diagnosticCount:diagnostics.length,diagnostics:safeDiagnostics};
    continue;
   }
   const emitted=program.emit();
   evidence.components[name]={status:emitted.emitSkipped?'EMIT_BLOCKED':'EMITTED_ONLY',
    exitCode:emitted.emitSkipped?1:0,diagnosticCount:emitted.diagnostics?.length??0,
    diagnostics:(emitted.diagnostics||[]).slice(0,20).map(d=>({code:d.code}))};
   if(!emitted.emitSkipped)completed.push(name);
  }
 }catch(e){evidence.fatal=safeError(e);}
 finally{
  for(const p of fs.readdirSync(outputs,{recursive:true})){
   const x=inside(path.join(outputs,p));const st=fs.lstatSync(x,{bigint:true});
   assert(!st.isSymbolicLink(),'OUTPUT_LINK');
   if(st.isFile()){
    assert(st.nlink===1n,'OUTPUT_HARDLINK');
    assert(st.size<=BigInt(Number.MAX_SAFE_INTEGER),'OUTPUT_SIZE_UNSAFE');
    evidence.artifacts.push({path:p.replaceAll('\\','/'),bytes:Number(st.size),sha256:sha(x),
     nlink:st.nlink.toString(),dev:st.dev.toString(),ino:st.ino.toString()});
   }
  }
  evidence.completedAt=new Date().toISOString();
  evidence.overall=required.every(x=>evidence.components[x]&&evidence.components[x].exitCode===0)&&!evidence.fatal?'BUILT_PARTIAL_RUNTIME_UNVERIFIED':'FAILED_PARTIAL';
  fs.writeFileSync(inside(path.join(root,'evidence','result.json')),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
  console.log('G2F_RESULT '+JSON.stringify({overall:evidence.overall,components:evidence.components,artifacts:evidence.artifacts.length,root}));
  if(evidence.overall!=='BUILT_PARTIAL_RUNTIME_UNVERIFIED')process.exitCode=1;
 }
}
assert(process.argv.length===3&&['--self-test','--preflight','--build'].includes(mode),'BAD_MODE');
if(mode==='--self-test')selfTest();else if(mode==='--preflight')console.log('G2E_PREFLIGHT '+JSON.stringify(gate()));else await build();
