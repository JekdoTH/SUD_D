'use strict';
// SUD_D B1b-G2b isolated compile: ONLY Node builtins + installed TypeScript.
// No product JS modules, Native, subprocess, network, or original dist writes.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto'),ts=require('typescript');
const ROOT=path.resolve(__dirname,'../../..');
const PACKAGES=['domain','infrastructure','application','mcp-gateway'];
const STAGE_NAME='sudd-b1b-g2b-isolated-stage-20261015';
const REPORT='.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md';
const SOURCE_REPORT='.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md';
const PUBLICATION_REPORT='.serena/reports/solo-expert-b1b-g2b-publication-plan-closeout-20261015.md';
const OLD_REPORT='.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md';
const EXPECTED={
  [SOURCE_REPORT]:'7c74dfab049895ae5ed2dc8eb5d647165d48df31ed5d2525b46f23e9553570cd',
  [PUBLICATION_REPORT]:'18b244f8645064d64742cb9cdf9e9ba4885f4e6a8c1108ee1479c16850679300',
  [OLD_REPORT]:'6d4085d5e461505619fb6366cc6452ff0faad8402930a91b99d77bb9a11d346b',
  'packages/contracts/dist/index.js':'a5eed5c47e059b2badb69c440c268f8d60600ae78051173e22b2f1640b156d9f',
  'packages/contracts/dist/index.js.map':'98010edf9fd2d794c3c6bc00690b7f136310d01b573750aa7dbc422a5b45d52c',
  'packages/contracts/dist/index.d.ts':'fe52a1339a98ca692a52b857be4bbbb91e720b7cc780421aeaaeba3c23006f4c',
  'packages/contracts/dist/index.d.ts.map':'7fe93993ef2807b3422c8c2ac79001472e0f8c836f94a6e8c32c26d3dcd2dde6',
  'packages/mcp-gateway/node_modules/@types/node/package.json':'a4d29a0f9a3b45be30a130591091ea1f7707d4193489960ef4ee98f35375a4e9',
  'packages/tests/src/b1b-g2b-artifact-evidence.cjs':'17e8ddb5eb25e780797a72951e2c019a11f7fd63c267a36f2a8da191c8063571',
  'packages/tests/src/b1b-g2b-publication-plan.cjs':'21712ff44499ed0fb6cc8f695fd43d7429a007b786a5ee5bcd0cb3e15e286390',
  'node_modules/typescript/lib/typescript.js':'3ae902c92cc44dace175c0e69e13a4b0899f6983c6121d76b9ab8dd5795e7675',
};
const fail=m=>{throw Error('G2B_ISOLATED_STAGE_FAIL_CLOSED '+m)};
const check=(b,m)=>{if(!b)fail(m)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const rootAbs=r=>path.resolve(ROOT,r);
const relative=f=>path.relative(ROOT,path.resolve(f)).replace(/\\/g,'/');
const under=(f,b)=>{const r=path.relative(b,f);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
const physical=r=>fs.existsSync(rootAbs(r))?sha(fs.readFileSync(rootAbs(r))):'ABSENT';
const hashMap=m=>sha([...m].sort((a,b)=>a[0].localeCompare(b[0])).map(([p,h])=>p+'\0'+h).join('\n'));
const equalMap=(a,b,why)=>check(hashMap(a)===hashMap(b),why+' SHA-256/read-set drift');
const key=p=>{
 const x=path.resolve(p);
 const link=/(?:[\\/])node_modules[\\/]@sud-d[\\/](domain|infrastructure|application|mcp-gateway)([\\/].*)?$/i.exec(x);
 return (link?path.resolve(ROOT,'packages',link[1],(link[2]||'').replace(/^[\\/]/,'')):x).toLowerCase();
};
const tempRoot=()=>{
 const trusted=path.resolve(os.tmpdir());
 const declared=process.env.TEMP?path.resolve(process.env.TEMP):trusted;
 check(trusted.toLowerCase()===declared.toLowerCase(),'OS TEMP mismatch');
 check(fs.existsSync(trusted),'OS TEMP absent');
 let x=trusted;
 while(true){
  const s=fs.lstatSync(x);
  check(!s.isSymbolicLink()&&s.isDirectory(),'OS TEMP symlink or anomalous ancestor '+x);
  const up=path.dirname(x);if(up===x)break;x=up;
 }
 return path.join(trusted,STAGE_NAME);
};
function safeOutputName(dest,seen=new Set()){
 check(typeof dest==='string'&&/^packages\/(domain|infrastructure|application|mcp-gateway)\/dist\/.+/.test(dest),
  'output outside four exact package dist layouts: '+dest);
 check(!dest.includes(':')&&!dest.includes('\\')&&!dest.includes('\0')&&
   !dest.split('/').some(x=>x==='.'||x==='..'||!x),'ADS / traversal in output');
 check(/(?:\.js|\.js\.map|\.d\.ts|\.d\.ts\.map)$/.test(dest),'unexpected emitted output extension '+dest);
 const absolute=rootAbs(dest);
 check(under(absolute,ROOT),'output escapes original repo');
 const folded=absolute.toLowerCase();
 check(!seen.has(folded),'case-insensitive collision '+dest);
 seen.add(folded);return dest;
}
function safeStagePath(stageRoot,logical,seen,io={
 exists:fs.existsSync,lstat:fs.lstatSync
}){
 const name=safeOutputName(logical,seen);
 const candidate=path.resolve(stageRoot,...name.split('/'));
 check(under(candidate,stageRoot),'TEMP stage escape');
 let x=stageRoot;
 check(io.exists(x),'stage root absent');
 while(true){
  if(io.exists(x)){
   const s=io.lstat(x);
   check(!s.isSymbolicLink(),'stage symlink/junction/reparse '+x);
   check(x===candidate?s.isFile():s.isDirectory(),'stage ancestor incorrect type '+x);
  }
  if(x===candidate)break;
  const remaining=path.relative(x,candidate).split(path.sep);
  x=path.join(x,remaining[0]);
 }
 return candidate;
}
function isFresh(stage,report){
 check(!fs.existsSync(stage)&&!fs.existsSync(report)&&!fs.existsSync(rootAbs(REPORT)),
  'stage or final report preexists; one-use / exclusive ownership');
}
function freezeFromReports(){
 const old=fs.readFileSync(rootAbs(SOURCE_REPORT),'utf8');
 const publication=fs.readFileSync(rootAbs(PUBLICATION_REPORT),'utf8');
 for(const [p,h] of Object.entries(EXPECTED))check(physical(p)===h,'protected evidence/config drift '+p);
 const accepted=new Map(),rows=new Map(),inputs=new Map();
 for(const line of old.split(/\r?\n/)){
  const m=/^\| \x60(packages\/(?:application|infrastructure|mcp-gateway|tests)\/[^\x60]+)\x60 \| (?:\x60[0-9a-f]{64}\x60|ABSENT) \| \x60([0-9a-f]{64})\x60 \|$/.exec(line);
  if(m)accepted.set(m[1],m[2]);
 }
 let section='';
 for(const line of publication.split(/\r?\n/)){
  if(line.startsWith('## Gate C ')&&line.includes('exact virtual publication'))section='table';
  else if(line.startsWith('## Gate C ')&&line.includes('independent runtime'))section='';
  else if(line.startsWith('### All newly observed compiler'))section='reads';
  else if(line.startsWith('### All protected accepted'))section='';
  if(section==='table'&&line.startsWith('| packages/')){
   const c=line.split('|').slice(1,-1).map(x=>x.trim());
   check(c.length>=7,'corrupted 512 row');
   const [dest,owner,kind,cls,before,proposed]=c;
   check(!rows.has(dest),'duplicate accepted output '+dest);
   rows.set(dest,{dest,owner,kind,cls,before,proposed});
  }
  if(section==='reads'){
   const m=/^- ([^\s]+) SHA-256 ([0-9a-f]{64})$/.exec(line);
   if(m)inputs.set(m[1],m[2]);
  }
 }
 check(accepted.size===16,'expected 16 frozen accepted Source/Test/Metadata inputs; '+accepted.size);
 check(rows.size===512,'expected 512 frozen publication artifact rows; '+rows.size);
 check(inputs.size===641,'expected 641 frozen compiler inputs; '+inputs.size);
 for(const [p,h] of accepted)check(physical(p)===h,'frozen source changed '+p);
 for(const [p,h] of inputs)check(physical(p)===h,'frozen compiler read changed '+p);
 const paths=new Set();
 for(const row of rows.values()){
  safeOutputName(row.dest,paths);
  check(physical(row.dest)===row.before,'frozen original dist changed '+row.dest);
 }
 return {accepted,rows,inputs,sourceHash:sha(old),publicationHash:sha(publication)};
}
function selfTest(){
 let passed=0;
 const yes=(name,b)=>{check(b,'self-test '+name);passed++;};
 const reject=(name,f)=>{
  let failSeen=false;try{f();}catch{failSeen=true;}
  yes(name,failSeen);
 };
 const reportBefore=physical(REPORT);
 const temp=tempRoot();
 yes('expected exact OS temp',path.basename(temp)===STAGE_NAME);
 yes('only-once stage missing',!fs.existsSync(temp));
 yes('report missing',reportBefore==='ABSENT');
 const dest='packages/domain/dist/fake.js';
 yes('ordinary logical stage path',safeStagePath(temp,dest,new Set(),{
  exists:p=>p===temp,lstat:()=>({isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>false})
 }).endsWith(path.join('packages','domain','dist','fake.js')));
 reject('traversal',()=>safeOutputName('packages/domain/dist/../outside.js'));
 reject('ADS',()=>safeOutputName('packages/domain/dist/fake.js:private'));
 reject('outside original dist',()=>safeOutputName('packages/domain/src/fake.js'));
 reject('case collision',()=>{
  const s=new Set();safeOutputName('packages/domain/dist/Fake.js',s);
  safeOutputName('packages/domain/dist/fake.js',s);
 });
 reject('missing root',()=>safeStagePath(temp,dest,new Set(),{exists:()=>false,lstat:()=>{}}));
 reject('symlink injected ancestor',()=>safeStagePath(temp,dest,new Set(),{
  exists:p=>p===temp,
  lstat:()=>({isDirectory:()=>true,isFile:()=>false,isSymbolicLink:()=>true})
 }));
 reject('read hash drift',()=>equalMap(new Map([['a','1']]),new Map([['a','2']]),'read'));
 reject('ABSENT vs present mismatch',()=>check('ABSENT'==='actualhash','destination mismatch'));
 reject('report overwrite',()=>isFresh('absent-stage',rootAbs(SOURCE_REPORT)));
 yes('self-test untouched existing report',physical(REPORT)===reportBefore);
 console.log('G2B_STAGE_SELF_TEST_PASS '+passed+' negative+inert checks');
}
function hostFor(options,overlay,observed) {
 const host=ts.createCompilerHost(options);
 const oldExists=host.fileExists.bind(host),oldRead=host.readFile.bind(host),oldReal=host.realpath?.bind(host);
 const isProjectDist=p=>PACKAGES.some(pkg=>key(p).startsWith(key(rootAbs('packages/'+pkg+'/dist'))+path.sep));
 const observe=p=>{
  const absolute=path.resolve(p);
  if(under(absolute,ROOT)&&fs.existsSync(absolute)&&fs.statSync(absolute).isFile())
   observed.set(relative(absolute),sha(fs.readFileSync(absolute)));
 };
 host.fileExists=p=>{
  if(overlay.has(key(p)))return true;
  if(isProjectDist(p))return false;
  const found=oldExists(p);
  if(found)observe(p);
  return found;
 };
 host.readFile=p=>{
  if(overlay.has(key(p)))return overlay.get(key(p)).toString('utf8');
  if(isProjectDist(p))return undefined;
  const result=oldRead(p);
  if(result!==undefined)observe(p);
  return result;
 };
 host.realpath=p=>{
  const x=oldReal?oldReal(p):fs.realpathSync.native(p);
  observe(p);observe(x);return x;
 };
 host.getSourceFile=(p,language,onError)=>{
  const body=host.readFile(p);
  if(body===undefined){if(onError)onError('Missing '+p);return undefined;}
  return ts.createSourceFile(p,body,language,true,ts.getScriptKindFromFileName(p));
 };
 host.writeFile=()=>fail('unexpected TypeScript disk write attempted');
 return host;
}
function parseConfigs(observed){
 const configs=new Map();
 const sys={...ts.sys,readFile:p=>{
  const value=ts.sys.readFile(p);
  if(value!==undefined&&under(path.resolve(p),ROOT))
   observed.set(relative(p),sha(fs.readFileSync(p)));
  return value;
 }};
 for(const pkg of PACKAGES){
  const errors=[];
  const config=ts.getParsedCommandLineOfConfigFile(rootAbs('packages/'+pkg+'/tsconfig.json'),{},{
   ...sys,onUnRecoverableConfigFileDiagnostic:d=>errors.push(d)
  });
  check(config&&errors.length===0&&config.errors.length===0,'invalid package tsconfig '+pkg);
  check(config.options.module===ts.ModuleKind.Node16&&
    config.options.moduleResolution===ts.ModuleResolutionKind.Node16&&
    config.options.strict===true&&config.options.skipLibCheck===true,
    'compiler strict Node16 config drift '+pkg);
  configs.set(pkg,config);
 }
 return configs;
}
function capture(frozen){
 const observed=new Map(),configs=parseConfigs(observed),overlay=new Map(),outputs=new Map(),stats=[];
 for(const pkg of PACKAGES){
  const cfg=configs.get(pkg),opts={...cfg.options,incremental:false,composite:false,noEmit:false};
  delete opts.tsBuildInfoFile;
  const h=hostFor(opts,overlay,observed),program=ts.createProgram(cfg.fileNames,opts,h);
  const problems=ts.getPreEmitDiagnostics(program).map(d=>
   d.code+' '+(d.file?relative(d.file.fileName):'compiler')+' '+ts.flattenDiagnosticMessageText(d.messageText,' '));
  check(problems.length===0,'compiler diagnostic '+pkg+' '+problems.slice(0,5).join(' / '));
  const sources=program.getSourceFiles().filter(sf=>!sf.isDeclarationFile&&
   under(path.resolve(sf.fileName),rootAbs('packages/'+pkg+'/src')));
  const seen=new Set();
  for(const sf of sources){
   let emittedFiles=0;
   const output=program.emit(sf,(p,body)=>{
    const name=safeOutputName(relative(p),seen);
    check(!outputs.has(name),'duplicate multi-package output '+name);
    const buf=Buffer.from(body,'utf8');
    const record={dest:name,owner:relative(sf.fileName),bytes:buf,sha:sha(buf),
     kind:name.endsWith('.d.ts.map')?'declaration-map':name.endsWith('.d.ts')?'declaration':
      name.endsWith('.js.map')?'runtime-map':'runtime-js'};
    outputs.set(name,record);
    if(record.kind==='declaration')overlay.set(key(rootAbs(name)),buf);
    emittedFiles++;
   });
   check(!output.emitSkipped&&emittedFiles===4,'compiler 4-output memory capture blocked '+relative(sf.fileName));
  }
  stats.push({pkg,sources:sources.length,diagnostics:problems.length});
 }
 check(stats.reduce((a,x)=>a+x.sources,0)===128,'source count diverged '+JSON.stringify(stats));
 check(outputs.size===512,'full compiler output differs from accepted 512; got '+outputs.size);
 const expectedSeen=new Set();
 for(const [dest,row] of frozen.rows){
  safeOutputName(dest,expectedSeen);
  const e=outputs.get(dest);
  check(!!e,'missing frozen emitted artifact '+dest);
  check(e.sha===row.proposed,'emitted candidate hash drift '+dest+' expected '+row.proposed+' got '+e.sha);
  check(e.owner===row.owner,'emitted artifact source owner drift '+dest);
  check(physical(dest)===row.before,'original dist changed before stage '+dest);
 }
 for(const [p,h] of frozen.accepted)check(physical(p)===h,'source drift mid-capture '+p);
 for(const [p,h] of frozen.inputs)check(physical(p)===h,'prior compiler-input drift '+p);
 const code=new Map();
 for(const x of outputs.values())if(x.kind==='runtime-js'){
  const f=rootAbs(x.dest);
  code.set(key(f),{source:rootAbs(x.owner),path:f,body:x.bytes});
 }
 // The existing accepted test helper exports a PURE AST graph tracer. Do NOT invoke
 // its one-time analysis() or any product/native executable or existing plan().
 const {traceGraph}=require('./b1b-g2b-artifact-evidence.cjs');
 const newGraph=traceGraph('@sud-d/mcp-gateway/gateway-core',code);
 const legacyGraph=traceGraph('@sud-d/mcp-gateway',code);
 check(newGraph.native.length===0,'new gateway core native static reachability');
 check(newGraph.reachable.length===47,'new gateway core closure drift '+newGraph.reachable.length);
 check(legacyGraph.native.length===11,'legacy native graph drift '+legacyGraph.native.length);
 return {configs,observed,overlay,outputs,stats,newGraph,legacyGraph};
}
function typecheck(captured){
 const results=[];
 for(const pkg of PACKAGES){
  const cfg=captured.configs.get(pkg);
  const opts={...cfg.options,noEmit:true,incremental:false,composite:false};
  delete opts.outDir;delete opts.rootDir;delete opts.tsBuildInfoFile;
  const host=hostFor(opts,captured.overlay,captured.observed);
  const program=ts.createProgram(cfg.fileNames,opts,host);
  const diag=ts.getPreEmitDiagnostics(program).map(d=>
   d.code+' '+(d.file?relative(d.file.fileName):'compiler')+' '+ts.flattenDiagnosticMessageText(d.messageText,' '));
  check(diag.length===0,'strict Node16 virtual declaration diagnostic '+pkg+' '+diag.slice(0,5).join(' / '));
  results.push({pkg,diagnostics:0,programFiles:program.getSourceFiles().length});
 }
 return results;
}
function verifyPreservation(frozen,inputs){
 for(const [p,h] of frozen.accepted)check(physical(p)===h,'accepted Source fingerprint drift '+p);
 for(const [p,h] of frozen.inputs)check(physical(p)===h,'accepted 641 read-set drift '+p);
 for(const [p,h] of Object.entries(EXPECTED))check(physical(p)===h,'protected R3/evidence drift '+p);
 for(const [p,h] of inputs)check(physical(p)===h,'fresh compiler observed input drift '+p);
 for(const r of frozen.rows.values())check(physical(r.dest)===r.before,'original dist drift '+r.dest);
}

function materialize(captured,frozen,stage){
 check(!fs.existsSync(stage),'stage root appeared concurrently');
 check(path.basename(stage)===STAGE_NAME&&path.dirname(stage)===path.resolve(os.tmpdir()),
  'stage not directly below exact trusted TEMP');
 fs.mkdirSync(stage,{recursive:false,mode:0o700});
 check(fs.lstatSync(stage).isDirectory()&&!fs.lstatSync(stage).isSymbolicLink(),'owned stage invalid');
 const records=[],seen=new Set();
 for(const output of [...captured.outputs.values()].sort((a,b)=>a.dest.localeCompare(b.dest))){
  const destination=path.resolve(stage,...output.dest.split('/'));
  check(under(destination,stage),'staging path escape');
  const parent=path.dirname(destination);
  fs.mkdirSync(parent,{recursive:true});
  safeStagePath(stage,output.dest,seen);
  const fd=fs.openSync(destination,'wx',0o600);
  try{fs.writeFileSync(fd,output.bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  check(sha(fs.readFileSync(destination))===output.sha,'staged file hash mismatch '+output.dest);
  records.push({path:output.dest,source:output.owner,kind:output.kind,
   bytes:output.bytes.length,sha256:output.sha,before:physical(output.dest)});
 }
 check(records.length===512,'staged file inventory not 512');
 const evidence={
  mission:'SUD_D B1b-G2b isolated compile 2026-10-15',
  stageRoot:stage,publicationAllowed:false,
  sourceCount:128,outputCount:512,
  candidateFingerprint:hashMap(new Map(records.map(x=>[x.path,x.sha256]))),
  originalBeforeFingerprint:hashMap(new Map(records.map(x=>[x.path,x.before]))),
  files:records
 };
 const file=path.join(stage,'stage-manifest.json');
 check(!fs.existsSync(file),'stage manifest preexists');
 fs.writeFileSync(file,JSON.stringify(evidence,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
 const mh=sha(fs.readFileSync(file));
 const all=[];
 const walk=p=>{
  for(const ent of fs.readdirSync(p,{withFileTypes:true})){
   const f=path.join(p,ent.name);
   check(!ent.isSymbolicLink(),'stage tree symlink '+f);
   if(ent.isDirectory())walk(f);
   else {check(ent.isFile(),'stage non-file '+f);all.push(f);}
  }
 };
 walk(stage);
 check(all.length===513,'not exactly 512 outputs plus owned manifest; got '+all.length);
 const names=new Set(all.map(p=>path.relative(stage,p).replace(/\\/g,'/')));
 for(const x of records)check(names.has(x.path),'stage file unexpectedly absent '+x.path);
 check(names.has('stage-manifest.json'),'stage manifest missing');
 return {records,manifest:file,manifestSha:mh,outputFingerprint:evidence.candidateFingerprint,
  originalsFingerprint:evidence.originalBeforeFingerprint,createdFileCount:all.length};
}
function render(frozen,captured,types,staged,stage,baseline,inputsBefore){
 const lines=[
 '# SUD_D B1b-G2b — Isolated Stage Candidate One-Mission Closeout',
 '',
 '**Date:** 2026-10-15 | **Verdict:** G2b ISOLATED COMPILED CANDIDATE STAGED; ORIGINAL DIST UNCHANGED; INSTALLED/PUBLISHED RUNTIME NOT_READY.',
 '**Authority ceiling:** TEST-ONLY staged compiler bytes under ONE TEMP owner path. Never canonical dist publication, Native/vendor runtime, Managed Serena, B2 or Owner consent.',
 '',
 '## Gate A — bootstrap, RED/self-test',
 'Active SUD_D on p0c-hyperv-spike, HEAD 7e4c54687f363b2abe6bd34ff71afb4d1a211299, staged 0 at preflight. Existing inherited dirty Git state baseline '+baseline+'.',
 'Selected repository skills: tdd (stage/filesystem boundary negative tests), writing-for-agents (agent-consumed final Closeout); no cross-agent involvement.',
 'Task-only CJS standalone mode --self-test tests unsafe traversal/ADS, case collision, symlink injection, stage absent, report no-overwrite, prior hash mismatch and read-set drift. This mode creates no file.',
 '',
 '## Gate B — pinned source and compiler capture (NO product module execution)',
 'Read the exact accepted 16 Source/Test/Metadata paths and SHA-256 values; validated each against disk. Accepted previous planner 512 output-state rows and 641 compiler-input hashes were independently parsed and validated BEFORE writes.',
 'Previous source Closeout '+SOURCE_REPORT+' SHA-256 '+EXPECTED[SOURCE_REPORT],
 'Previous publication planner '+PUBLICATION_REPORT+' SHA-256 '+EXPECTED[PUBLICATION_REPORT],
 'Prior static manifest '+OLD_REPORT+' SHA-256 '+EXPECTED[OLD_REPORT],
 'TS installed version '+ts.version+'; TS implementation SHA-256 '+EXPECTED['node_modules/typescript/lib/typescript.js'],
 'Frozen configured source/module statistics: '+captured.stats.map(x=>x.pkg+' '+x.sources+' source, '+x.diagnostics+' pre-emit diagnostics').join('; '),
 'Captured compiler output count '+captured.outputs.size+' (128 modules * 4 JS/map/declaration/map). All 512 captured SHA-256 values precisely matched the frozen proposed hashes; zero synthetic outputs. Memory-only compiler callback, TypeScript host.writeFile forbidden.',
 'Stage candidate fingerprint '+staged.outputFingerprint,
 'Accepted old physical dist SHA/ABSENT fingerprint '+staged.originalsFingerprint,
 'New capture CompilerHost observed input set '+inputsBefore.size+', fingerprint '+hashMap(inputsBefore)+
 '. The original 641 and all newer observed source/type/manifest/control reads were rehashed before/after. Instrumented reads are not a complete proof of every potential negative directory lookup.',
 '',
 '## Gate C — isolated task-owned TEMP stage (NOT installed)',
 'Stage root: '+stage,
 'Manifest: '+staged.manifest+' SHA-256 '+staged.manifestSha,
 'All '+staged.records.length+' captured artifacts materialized by exclusive new file opens beneath TEMP; physical SHA-256 validated after each write. Stage ownership exclusively newly-created; no temp root reuse, no symbolic stage entries found at postflight.',
 'All outputs preserve packages/<pkg>/dist/... layout only INSIDE TEMP. Exactly '+staged.createdFileCount+' files (512 captured and 1 manifest), no credentials/data roots/node_modules/user workspaces. Best-effort Node filesystem lstat junction/reparse check is NOT Windows physical reparse/transaction safety certification.',
 '',
 '### Exact full stage output inventory and canonical original before/after hashes',
 '| Stage-relative candidate | Source owner | Kind | Original BEFORE SHA/ABSENT | Captured / Staged SHA-256 | Original AFTER SHA/ABSENT | Bytes |',
 '|---|---|---|---|---|---|---|',
 ...staged.records.map(x=>'| '+x.path+' | '+x.source+' | '+x.kind+' | '+x.before+' | '+x.sha256+' | '+physical(x.path)+' | '+x.bytes+' |'),
 '',
 '## Gate C2 — strict original Node16 source consumer checks, virtual declarations',
 ...types.map(x=>'- '+x.pkg+': '+x.programFiles+' program files, diagnostics '+x.diagnostics),
 'No emitted/generated JS or .node import was evaluated. The output closure was statically traced from canonical new gateway export using only emitted JS AST: '+
  captured.newGraph.reachable.length+' reachable modules, '+captured.newGraph.native.length+' known native edges.',
 'The legacy Gateway root remains native-reaching: '+captured.legacyGraph.native.length+' Koffi edges (no legacy entry evaluation).',
 'The generated candidate remains an isolated TypeScript byte proof, NOT actual Node ESM loader/vendor conditional top-level evaluation.',
 '',
 '## Gate D — frozen evidence + protected physical outputs',
 'Trusted TEMP parent resolved by os.tmpdir() against process.env.TEMP. Original source, 641 accepted inputs, new observed compiler read paths, all 512 physical dist destinations and accepted Closeout+R3 compiled hashes checked before stage and after stage.',
 'All original output destinations match their previous SHA/ABSENT; no publication and zero writes under working-tree packages/**/dist.',
 '### All accepted Source/Test/Metadata fingerprints',
 ...[...frozen.accepted].sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>'- '+p+' SHA-256 '+h),
 '### All prior 641 read-set SHA-256 fingerprints',
 ...[...frozen.inputs].sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>'- '+p+' SHA-256 '+h),
 '### Additional CompilerHost observed current input fingerprints',
 ...[...inputsBefore].sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>'- '+p+' SHA-256 '+h),
 '### Protected original report, installed toolchain, nested Node typings and Contracts',
 ...Object.entries(EXPECTED).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>'- '+p+' SHA-256 '+h),
 '',
 '## Verification / exact authority boundary',
 'Operator: node --check packages/tests/src/b1b-g2b-isolated-stage.cjs; node packages/tests/src/b1b-g2b-isolated-stage.cjs --self-test; node packages/tests/src/b1b-g2b-isolated-stage.cjs (single normal stage invocation).',
 'Postflight Git status/diff check and final Closeout SHA verified by Serena separately after this single report write. Owner manual testing DEFERRED (never marked PASS).',
 'The staged candidate MUST NOT be copied/published into original dist absent new exact Advisor authority. Real vendor Native/ESM runtime and live product Gateway/Managed Serena remain NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.',
 '',
 '**FINAL: G2b ISOLATED COMPILED CANDIDATE STAGED; ORIGINAL DIST UNCHANGED; INSTALLED/PUBLISHED RUNTIME NOT_READY; OWNER TEST DEFERRED; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.**',''];
 return lines.join('\n');
}
function main(){
 const stage=tempRoot();
 isFresh(stage,rootAbs(REPORT));
 const frozen=freezeFromReports();
 const baseline=process.env.G2B_STATUS_BASELINE||'operator preflight status fingerprint retained';
 const captured=capture(frozen);
 const checked=typecheck(captured);
 const observedBefore=new Map(captured.observed);
 for(const [p,h] of observedBefore)check(physical(p)===h,'observed compiler reads drift '+p);
 verifyPreservation(frozen,observedBefore);
 isFresh(stage,rootAbs(REPORT));
 const staged=materialize(captured,frozen,stage);
 verifyPreservation(frozen,observedBefore);
 const finalTree=render(frozen,captured,checked,staged,stage,baseline,observedBefore);
 check(!fs.existsSync(rootAbs(REPORT)),'report unexpectedly appeared');
 fs.writeFileSync(rootAbs(REPORT),finalTree,{encoding:'utf8',flag:'wx'});
 console.log('G2B_ISOLATED_STAGE_ROOT '+stage);
 console.log('G2B_ISOLATED_STAGE_OUTPUTS '+staged.records.length+' SHA '+staged.outputFingerprint);
 console.log('G2B_ISOLATED_STAGE_MANIFEST '+staged.manifestSha+' files '+staged.createdFileCount);
 console.log('G2B_ISOLATED_STAGE_TYPECHECK '+checked.map(x=>x.pkg+':'+x.diagnostics).join(' '));
 console.log('G2B_ISOLATED_STAGE_GRAPH new:'+captured.newGraph.reachable.length+
  '/native:'+captured.newGraph.native.length+' legacyNative:'+captured.legacyGraph.native.length);
 console.log('G2B_ISOLATED_STAGE_REPORT '+REPORT+' bytes='+Buffer.byteLength(finalTree));
 console.log('G2B_ISOLATED_STAGE_VERDICT CANDIDATE_STAGED; ORIGINAL_DIST_UNCHANGED; RUNTIME_NOT_READY');
}
check(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--self-test'),
 'unsupported arguments');
if(process.argv[2]==='--self-test')selfTest();else main();
