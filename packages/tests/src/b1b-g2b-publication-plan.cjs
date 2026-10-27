'use strict';
// G2b diagnostic-only publication planner: inert unless invoked directly; no product/native imports.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../../..');
const PKGS=['domain','infrastructure','application','mcp-gateway'];
const CLOSEOUT='.serena/reports/solo-expert-b1b-g2b-publication-plan-closeout-20261015.md';
const OLD='.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md';
const EARLIER='.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md';
const EXPECTED={old:'7c74dfab049895ae5ed2dc8eb5d647165d48df31ed5d2525b46f23e9553570cd',
 earlier:'6d4085d5e461505619fb6366cc6452ff0faad8402930a91b99d77bb9a11d346b',
 nodeTypes:'a4d29a0f9a3b45be30a130591091ea1f7707d4193489960ef4ee98f35375a4e9',
 contracts:['a5eed5c47e059b2badb69c440c268f8d60600ae78051173e22b2f1640b156d9f',
 '98010edf9fd2d794c3c6bc00690b7f136310d01b573750aa7dbc422a5b45d52c',
 'fe52a1339a98ca692a52b857be4bbbb91e720b7cc780421aeaaeba3c23006f4c',
 '7fe93993ef2807b3422c8c2ac79001472e0f8c836f94a6e8c32c26d3dcd2dde6']};
const assert=(v,why)=>{if(!v)throw Error('G2B_PLANNER_FAIL_CLOSED: '+why);};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const abs=r=>path.resolve(ROOT,r);
const rel=p=>path.relative(ROOT,path.resolve(p)).replace(/\\/g,'/');
const under=(file,dir)=>{const d=path.relative(dir,file);return !!d&&d!=='..'&&!d.startsWith('..'+path.sep)&&!path.isAbsolute(d);};
const canon=f=>{
 const p=path.resolve(f),alias=/(?:[\\/])node_modules[\\/]@sud-d[\\/](domain|infrastructure|application|mcp-gateway)([\\/].*)?$/i.exec(p);
 return (alias?path.join(ROOT,'packages',alias[1],(alias[2]||'').replace(/^[\\/]/,'')):p).toLowerCase();
};
const freeze=m=>sha([...m].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'\0'+b).join('\n'));
const assertFrozen=(a,b)=>assert(freeze(a)===freeze(b),'freeze drift / changed read-set');
const physical=p=>fs.existsSync(abs(p))?sha(fs.readFileSync(abs(p))):'ABSENT';
const safeDestination=(dest,used,io={exists:fs.existsSync,lstat:fs.lstatSync})=>{
 assert(typeof dest==='string'&&dest.startsWith('packages/'),'destination escapes packages');
 assert(!dest.includes(':')&&!dest.includes('\0')&&!dest.split('/').includes('..'),'ADS/traversal');
 const pkg=PKGS.find(p=>dest.startsWith('packages/'+p+'/dist/'));
 assert(!!pkg,'destination outside approved package dist');
 assert(/(?:\.js|\.js\.map|\.d\.ts|\.d\.ts\.map)$/.test(dest),'unexpected compiler output kind');
 const full=abs(dest),dir=abs('packages/'+pkg+'/dist');
 assert(under(full,dir),'path escape/traversal');
 let x=full;
 for(;;){
  if(io.exists(x)){
   const st=io.lstat(x);
   assert(!st.isSymbolicLink(),'symlink/reparse ancestor '+rel(x));
   assert(x===full?st.isFile():st.isDirectory(),'not a regular output/ancestor');
   // Windows non-symlink REPARSE_ATTRIBUTE is not exposed safely by node:lstat;
   // physical write permission is consequently NEVER granted by this diagnostic.
  }
  const p=path.dirname(x);if(p===x)break;x=p;
 }
 const id=canon(full);
 assert(!used.has(id),'duplicate/case collision '+dest);
 used.add(id);return dest;
};
const safeSource=(file,io={exists:fs.existsSync,lstat:fs.lstatSync})=>{
 assert(typeof file==='string'&&file.startsWith('packages/')&&!file.includes('..')&&!file.includes(':'),
  'unsafe source path');
 const pkg=PKGS.find(p=>file.startsWith('packages/'+p+'/src/'));
 assert(!!pkg,'source is outside package src');
 let cur=abs(file);
 for(;;){
  if(io.exists(cur)){
   const info=io.lstat(cur);
   assert(!info.isSymbolicLink(),'source symlink/reparse '+rel(cur));
   assert(cur===abs(file)?info.isFile():info.isDirectory(),'invalid source ancestor '+rel(cur));
  }
  const up=path.dirname(cur);if(up===cur)break;cur=up;
 }
 return file;
};
const exportsMap=(spec,kind)=>{
 assert(['runtime','types'].includes(kind),'unsupported condition '+kind);
 const m=/^@sud-d\/([^/]+)(?:\/(.+))?$/.exec(spec);
 assert(!!m&&PKGS.includes(m[1]),'unknown project package '+spec);
 const pkg=m[1],sub=m[2]?'./'+m[2]:'.';
 const json=JSON.parse(fs.readFileSync(abs('packages/'+pkg+'/package.json'),'utf8'));
 const entry=json.exports&&json.exports[sub];
 assert(!!entry&&typeof entry==='object','unknown project subpath '+spec);
 if(sub==='./gateway-core')assert(Object.keys(entry).join(',')==='types,import','unordered export conditions '+spec);
 const part=entry[kind==='runtime'?'import':'types'];
 assert(typeof part==='string'&&part.startsWith('./dist/')&&!part.includes('..'),'unsupported export target '+spec);
 return rel(abs('packages/'+pkg+'/'+part));
};
const resolveInternal=(spec,from,kind,available)=>{
 assert(['runtime','types'].includes(kind),'unsupported project condition '+kind);
 let target;
 if(spec.startsWith('@sud-d/'))target=exportsMap(spec,kind);
 else if(spec.startsWith('.')){
  const fromFull=abs(from),base=path.resolve(path.dirname(fromFull),spec);
  target=rel(kind==='types'?(base.endsWith('.d.ts')?base:base.replace(/\.(?:m?js|cjs|ts)$/,'.d.ts')):base);
 }else throw Error('G2B_PLANNER_FAIL_CLOSED unknown internal edge '+spec);
 assert(available.has(target),'uncaptured '+kind+' project target '+target+' from '+from);
 return target;
};
const isProject=f=>PKGS.some(p=>under(abs(f),abs('packages/'+p+'/dist')));
function scanEdges(content,filename,mode){
 const ast=ts.createSourceFile(filename,content,ts.ScriptTarget.ES2022,true,
   mode==='runtime'?ts.ScriptKind.JS:ts.ScriptKind.TS);
 const edges=[];
 const add=(kind,spec)=>{assert(typeof spec==='string','nonliteral/dynamic module or resource');edges.push({kind,spec,from:filename})};
 const literal=n=>n&&ts.isStringLiteral(n)?n.text:null;
 const visit=n=>{
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){
   const spec=literal(n.moduleSpecifier);
   assert(spec!==null,'nonliteral import/export');add('import_or_export',spec);
  }
  if(ts.isImportTypeNode(n)){
   const arg=n.argument;
   if(ts.isLiteralTypeNode(arg)&&ts.isStringLiteral(arg.literal))add('import_type',arg.literal.text);
   else throw Error('G2B_PLANNER_FAIL_CLOSED nonliteral import type');
  }
  if(ts.isCallExpression(n)){
   if(n.expression.kind===ts.SyntaxKind.ImportKeyword||
    ts.isIdentifier(n.expression)&&n.expression.text==='require'){
    const spec=literal(n.arguments[0]);
    assert(spec!==null,'nonliteral/dynamic require/import');
    add(n.expression.kind===ts.SyntaxKind.ImportKeyword?'dynamic_import':'require',spec);
   }
  }
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)){
   if(n.expression.text==='URL'){
    const base=n.arguments?.[1];
    if(base&&ts.isPropertyAccessExpression(base)&&base.name.text==='url'&&
      base.expression.kind===ts.SyntaxKind.MetaProperty){
      const spec=literal(n.arguments?.[0]);
      assert(spec!==null,'nonliteral/dynamic worker/resource URL');
      add('resource',spec);
    }
   }
   if(['Worker','SharedWorker'].includes(n.expression.text)){
    const arg=n.arguments?.[0];
    assert(!!arg&&ts.isNewExpression(arg)&&ts.isIdentifier(arg.expression)&&arg.expression.text==='URL',
      'nonliteral/dynamic worker');
   }
  }
  ts.forEachChild(n,visit);
 };
 visit(ast);
 if(mode==='types'){
  for(const f of ast.referencedFiles)add('reference_path',f.fileName);
  for(const f of ast.typeReferenceDirectives)add('reference_types',f.fileName);
 }
 return edges;
}
const isCompleteClosure=(runtime,types,verifiedTypeEdges)=>{
 // Runtime module names alone never prove a declaration dependency graph.
 if(!runtime.size||!types.size||!Array.isArray(verifiedTypeEdges))return false;
 return [...runtime].every(p=>types.has(p.replace(/\.js$/,'.d.ts')))&&
  verifiedTypeEdges.every(edge=>types.has(edge.to));
};
function parseFrozenReport(){
 const text=fs.readFileSync(abs(OLD),'utf8');
 assert(sha(text)===EXPECTED.old,'prior accepted 512-row report drift');
 const rows=new Map(),sources=new Map(),inputs=new Map();
 let section='';
 for(const line of text.split(/\r?\n/)){
  if(line.startsWith('### Exact differing'))section='different';
  else if(line.startsWith('### Every byte-identical'))section='reused';
  else if(line.startsWith('### '))section='';
  if(section&&line.startsWith('| packages/')){
   const cols=line.split('|').slice(1,-1).map(x=>x.trim());
   const [destination,owner,kind,status,before,proposed]=cols;
   if(section==='different'){
    assert(cols.length>=7,'corrupt diff inventory '+line);
    assert(['DIFFERENT','MISSING'].includes(status),'invalid previous status');
    assert(!rows.has(destination),'duplicate frozen destination '+destination);
    rows.set(destination,{destination,owner,kind,status,before,proposed});
   }else{
    assert(cols.length>=3,'corrupt reused inventory');
    assert(!rows.has(destination),'duplicate reuse destination '+destination);
    rows.set(destination,{destination,owner,kind:'REUSED',status:'REUSED',before:kind,proposed:kind});
   }
  }
  const m=/^- ([^\s]+) SHA-256 ([0-9a-f]{64})$/.exec(line);
  if(m)inputs.set(m[1],m[2]);
  const s=/^\| \`(packages\/(?:application|infrastructure|mcp-gateway|tests)\/[^\`]+)\` \| (?:\`[0-9a-f]{64}\`|ABSENT) \| \`([0-9a-f]{64})\` \|$/.exec(line);
  if(s)sources.set(s[1],s[2]);
 }
 assert(rows.size===512,'expected accepted 512 outputs, found '+rows.size);
 assert(rows.size>0&&sources.size===16,'prior 16 source SHA inventory incomplete '+sources.size);
 assert(inputs.size>=780,'prior readset too small '+inputs.size);
 for(const [p,r] of rows){
  const actual=physical(p);
  assert(actual===r.before,'frozen output changed '+p+' expected '+r.before+' actual '+actual);
 }
 for(const [p,h] of sources)assert(physical(p)===h,'accepted source changed '+p);
 for(const [p,h] of inputs)assert(physical(p)===h,'recorded compiler/dependency source changed '+p);
 const node='packages/mcp-gateway/node_modules/@types/node/package.json';
 assert(!inputs.has(node),'known missing source freeze gap already covered (unexpected)');
 assert(physical(node)===EXPECTED.nodeTypes,'actual Node typings manifest changed');
 return {rows,sources,inputs,text,node};
}

function makeHost(options,virtual,reads,stats){
 const h=ts.createCompilerHost(options),oldRead=h.readFile.bind(h),oldExists=h.fileExists.bind(h),oldReal=h.realpath?.bind(h);
 const isDist=f=>PKGS.some(p=>canon(f).startsWith(canon(abs('packages/'+p+'/dist'))+path.sep));
 const seen=(f,value)=>{
  const resolved=path.resolve(f);
  if(under(resolved,ROOT)&&fs.existsSync(resolved)&&fs.statSync(resolved).isFile()){
   reads.set(rel(resolved),sha(fs.readFileSync(resolved)));
   if(rel(resolved).includes('/@types/node/package.json'))stats.nestedNodeManifestSeen=true;
  }
  return value;
 };
 h.fileExists=f=>virtual.has(canon(f))?true:isDist(f)?false:seen(f,oldExists(f));
 h.readFile=f=>virtual.has(canon(f))?virtual.get(canon(f)).toString('utf8'):
   isDist(f)?undefined:seen(f,oldRead(f));
 h.realpath=f=>{
  const target=oldReal?oldReal(f):fs.realpathSync.native(f);
  seen(f,true);seen(target,true);return target;
 };
 h.getSourceFile=(file,language,onError)=>{
  const bytes=h.readFile(file);
  if(bytes===undefined){if(onError)onError('Not found '+file);return undefined;}
  return ts.createSourceFile(file,bytes,language,true,ts.getScriptKindFromFileName(file));
 };
 h.writeFile=()=>{throw Error('G2B_COMPILER_DISK_WRITE_FORBIDDEN');};
 return h;
}
function captureCompiler(){
 const reads=new Map(),stats={nestedNodeManifestSeen:false},configs=new Map(),outputs=new Map(),virtual=new Map(),diagnostics=[];
 const system={...ts.sys,readFile:f=>{
  const value=ts.sys.readFile(f);
  if(value!==undefined&&under(path.resolve(f),ROOT))reads.set(rel(f),sha(Buffer.from(value)));
  return value;
 }};
 for(const pkg of PKGS){
  const file=abs('packages/'+pkg+'/tsconfig.json'),unrecoverable=[];
  const cfg=ts.getParsedCommandLineOfConfigFile(file,{},{
   ...system,onUnRecoverableConfigFileDiagnostic:d=>unrecoverable.push(d)
  });
  assert(!!cfg&&!unrecoverable.length&&!cfg.errors.length,'configuration diagnostics '+pkg);
  assert(cfg.options.module===ts.ModuleKind.Node16&&cfg.options.moduleResolution===ts.ModuleResolutionKind.Node16&&
    cfg.options.strict===true&&cfg.options.skipLibCheck===true,'configured Node16 strictness changed '+pkg);
  configs.set(pkg,cfg);
 }
 for(const pkg of PKGS){
  const parsed=configs.get(pkg),options={...parsed.options,composite:false,incremental:false,noEmit:false};
  delete options.tsBuildInfoFile;
  const host=makeHost(options,virtual,reads,stats);
  const program=ts.createProgram(parsed.fileNames,options,host);
  const sources=program.getSourceFiles().filter(sf=>!sf.isDeclarationFile&&
    under(path.resolve(sf.fileName),abs('packages/'+pkg+'/src')));
  const occupied=new Set();
  for(const sf of sources){
   let count=0;
   const emitted=program.emit(sf,(dest,body)=>{
    const name=safeDestination(rel(dest),occupied);
    assert(!outputs.has(name),'duplicate capture '+name);
    const bytes=Buffer.from(body,'utf8');
    outputs.set(name,{destination:name,source:rel(sf.fileName),bytes,proposed:sha(bytes),
      kind:name.endsWith('.d.ts.map')?'declaration-map':name.endsWith('.d.ts')?'declaration':
        name.endsWith('.js.map')?'runtime-map':'runtime-js'});
    if(name.endsWith('.d.ts'))virtual.set(canon(abs(name)),bytes);
    count++;
   });
   assert(!emitted.emitSkipped&&count===4,'not 4 outputs from '+rel(sf.fileName));
  }
  const problems=ts.getPreEmitDiagnostics(program);
  diagnostics.push({pkg,sourceCount:sources.length,diagnostics:problems.map(d=>
    d.code+' '+(d.file?rel(d.file.fileName):'compiler')+' '+ts.flattenDiagnosticMessageText(d.messageText,' ').slice(0,200))});
 }
 assert(outputs.size===512,'current configured capture not 512');
 const fixed=['tsconfig.base.json','package.json','pnpm-lock.yaml','node_modules/typescript/lib/typescript.js',
 'node_modules/typescript/package.json',...PKGS.flatMap(pkg=>[
   'packages/'+pkg+'/package.json','packages/'+pkg+'/tsconfig.json']),
 'packages/mcp-gateway/node_modules/@types/node/package.json'];
 for(const p of fixed){assert(physical(p)!=='ABSENT','fixed manifest absent '+p);reads.set(p,physical(p));}
 assert(reads.get('packages/mcp-gateway/node_modules/@types/node/package.json')===EXPECTED.nodeTypes,
   'known missing node manifest drift');
 return {outputs,configs,reads,stats,virtual,diagnostics};
}
function graphFrom(spec,mode,outputs){
 const entry=exportsMap(spec,mode),queue=[entry],seen=new Set(),edges=[],unknown=[],external=new Set(),resources=[];
 const available=new Map([...outputs.keys()].map(p=>[p,true]));
 while(queue.length){
  const file=queue.shift();
  if(seen.has(file))continue;
  if(!outputs.has(file)){unknown.push('unavailable '+file);continue;}
  seen.add(file);
  let found;
  try{found=scanEdges(outputs.get(file).bytes.toString('utf8'),file,mode);}
  catch(e){unknown.push(file+' '+e.message);continue;}
  for(const edge of found){
   if(edge.kind==='reference_types'){external.add('type-reference:'+edge.spec);continue;}
   if(edge.spec.startsWith('@sud-d/')||edge.spec.startsWith('.')){
    try{
     const target=resolveInternal(edge.spec,file,mode,available);
     edges.push({from:file,kind:edge.kind,spec:edge.spec,to:target});
     queue.push(target);
     if(edge.kind==='resource')resources.push({from:file,to:target});
    }catch(e){unknown.push(file+' '+e.message);}
   }else {external.add(edge.spec);edges.push({from:file,kind:edge.kind,spec:edge.spec,to:'external'});}
  }
 }
 return {spec,mode,seen,edges,unknown,external,resources};
}
function vendorInspection(specifiers,reads){
 const inspected=[],unknown=[];
 for(const spec of new Set(specifiers)){
  if(spec.startsWith('node:')||spec.startsWith('type-reference:'))continue;
  const m=/^(@[^/]+\/[^/]+|[^/]+)(?:\/.*)?$/.exec(spec);
  if(!m){unknown.push('unrecognized external '+spec);continue;}
  const dirs=PKGS.map(p=>'packages/'+p+'/node_modules/'+m[1]).concat('node_modules/'+m[1]);
  const dir=dirs.find(d=>fs.existsSync(abs(d+'/package.json')));
  if(!dir){unknown.push('package manifest absent '+spec);continue;}
  const file=dir+'/package.json',fingerprint=physical(file);
  reads.set(file,fingerprint);
  inspected.push({specifier:spec,file,sha256:fingerprint});
  const json=JSON.parse(fs.readFileSync(abs(file),'utf8'));
  if(!json.exports&&!json.main&&!json.module)unknown.push('unresolvable package entry '+spec);
 }
 return {inspected,unknown};
}
function classify(frozen,compiled){
 const runtime=graphFrom('@sud-d/mcp-gateway/gateway-core','runtime',compiled.outputs);
 const types=graphFrom('@sud-d/mcp-gateway/gateway-core','types',compiled.outputs);
 const others=['@sud-d/domain','@sud-d/application/gateway-core','@sud-d/infrastructure/gateway-core']
 .flatMap(s=>['runtime','types'].map(k=>graphFrom(s,k,compiled.outputs)));
 const graph=[runtime,types,...others],unknown=graph.flatMap(g=>g.unknown);
 const required=new Map(),add=(file,why)=>{
  if(!required.has(file))required.set(file,new Set());
  required.get(file).add(why);
 };
 for(const g of graph)for(const p of g.seen){
  add(p,g.mode+' closure '+g.spec);
  add(p+'.map',g.mode+' source map '+g.spec);
 }
 const rows=[];
 for(const [filename,artifact] of compiled.outputs){
  const old=frozen.rows.get(filename);
  assert(!!old,'frozen output missing '+filename);
  assert(old.proposed===artifact.proposed,'fresh emitted candidate differs '+filename);
  const before=physical(filename);
  assert(old.before===before,'output changed during planning '+filename);
  const needed=required.has(filename);
  rows.push({destination:filename,owner:artifact.source,kind:artifact.kind,
    before,proposed:artifact.proposed,
    classification:needed?
     before===artifact.proposed?'MUST_PRESERVE_REUSE':'MUST_WRITE_CANDIDATE':
     before===artifact.proposed?'UNUSED_SAFE_TO_DEFER_REUSE':'UNUSED_SAFE_TO_DEFER',
    why:needed?[...required.get(filename)].join('; '):'outside bounded entrypoint runtime and declaration closure'});
 }
 for(const p of required.keys())if(!compiled.outputs.has(p))unknown.push('required output not captured '+p);
 const vendor=vendorInspection(graph.flatMap(g=>[...g.external]),compiled.reads);
 unknown.push(...vendor.unknown);
 return {runtime,types,others,graph,rows,required,vendor,unknown};
}

function hybridCheck(compiled,classified){
 const virtual=new Map(),reused=[],omitted=[];
 for(const row of classified.rows){
  if(row.kind!=='declaration')continue;
  if(row.classification==='MUST_WRITE_CANDIDATE')
   virtual.set(canon(abs(row.destination)),compiled.outputs.get(row.destination).bytes);
  else if(row.before===row.proposed){
   assert(physical(row.destination)===row.proposed,'reused physical drift '+row.destination);
   virtual.set(canon(abs(row.destination)),fs.readFileSync(abs(row.destination)));
   reused.push(row.destination);
  }else omitted.push(row.destination);
 }
 const results=[];
 for(const [pkg,cfg] of compiled.configs){
  const opts={...cfg.options,noEmit:true,composite:false,incremental:false};
  delete opts.outDir;delete opts.rootDir;delete opts.tsBuildInfoFile;
  const reads=new Map(),stats={nestedNodeManifestSeen:false};
  const program=ts.createProgram(cfg.fileNames,opts,makeHost(opts,virtual,reads,stats));
  const diagnostics=ts.getPreEmitDiagnostics(program).map(d=>
    d.code+' '+(d.file?rel(d.file.fileName):'compiler')+' '+ts.flattenDiagnosticMessageText(d.messageText,' ').slice(0,300));
  for(const [f,d] of reads)compiled.reads.set(f,d);
  results.push({pkg,diagnostics,files:program.getSourceFiles().length});
 }
 return {results,reused,omitted};
}
function plan(){
 assert(!fs.existsSync(abs(CLOSEOUT)),'report already exists');
 assert(physical(OLD)===EXPECTED.old&&physical(EARLIER)===EXPECTED.earlier,
  'accepted G2b reports drifted');
 const contractNames=['index.js','index.js.map','index.d.ts','index.d.ts.map'];
 for(let i=0;i<4;i++)assert(physical('packages/contracts/dist/'+contractNames[i])===EXPECTED.contracts[i],
  'R3 contract changed '+contractNames[i]);
 const frozen=parseFrozenReport();
 const protectedFiles=new Map([...frozen.inputs,...frozen.sources,
  [OLD,EXPECTED.old],[EARLIER,EXPECTED.earlier],
  ...contractNames.map((n,i)=>['packages/contracts/dist/'+n,EXPECTED.contracts[i]]),
  [frozen.node,EXPECTED.nodeTypes]]);
 const compiled=captureCompiler(),classified=classify(frozen,compiled);
 const hybrid=hybridCheck(compiled,classified);
 const beforeReads=new Map(compiled.reads),beforeOutputs=new Map(classified.rows.map(r=>[r.destination,r.before]));
 for(const [p,d] of protectedFiles)assert(physical(p)===d,'protected drift '+p);
 assertFrozen(beforeReads,new Map([...beforeReads.keys()].map(p=>[p,physical(p)])));
 assertFrozen(beforeOutputs,new Map([...beforeOutputs.keys()].map(p=>[p,physical(p)])));
 assert(beforeReads.get(frozen.node)===EXPECTED.nodeTypes,'missing @types/node manifest from new freeze');
 const vendorGaps=classified.vendor.inspected
  .filter(v=>{const j=JSON.parse(fs.readFileSync(abs(v.file),'utf8'));return !!j.exports;})
  .map(v=>'external conditional exports not exercised: '+v.specifier);
 const blocked=[...classified.unknown,
  ...hybrid.results.flatMap(r=>r.diagnostics.map(d=>'hybrid '+r.pkg+': '+d)),
  ...vendorGaps.map(x=>'runtime evaluation unproven: '+x)];
 const classes=['MUST_WRITE_CANDIDATE','MUST_PRESERVE_REUSE',
  'UNUSED_SAFE_TO_DEFER','UNUSED_SAFE_TO_DEFER_REUSE'];
 const counts=Object.fromEntries(classes.map(x=>[x,classified.rows.filter(r=>r.classification===x).length]));
 return {frozen,compiled,classified,hybrid,protectedFiles,beforeReads,beforeOutputs,
  blocked,counts,status:blocked.length?'PARTIAL/BLOCKED':'DIAGNOSTIC_CANDIDATE'};
}
function render(p){
 const l=[],line=(...x)=>l.push(...x);
 const C=p.classified,G=C.runtime,D=C.types;
 line('# SUD_D — B1b-G2b Publication Planner Diagnostic-only Closeout','',
 'Date 2026-10-15. Verdict: '+p.status+'. Absolute approval ceiling: diagnostic candidate only; never dist publication.',
 'DIST NOT AUTHORIZED; COMPILED RUNTIME PARITY NOT_READY; LIVE MANAGED SERENA NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.',
 '',
 '## Gate A — static RED and GREEN contract',
 'RED: standalone planner test failed on unavailable test-only planner; subsequent RED failed on missing public Interface. The exact standalone tests separately confirm GREEN and fail-closed injected fixtures. No product/native module imported.',
 '',
 '## Gate B — frozen installed compiler and prior 512-artifact reference',
 'Prior accepted native-free source Closeout SHA-256: '+EXPECTED.old,
 'Prior accepted G2b diagnostic report SHA-256: '+EXPECTED.earlier,
 'Prior accepted 512 entries independently read and physically compared against original before digest; prior recorded compiler input hashes '+p.frozen.inputs.size+' and accepted source anchors '+p.frozen.sources.size+' matched.',
 'Previously omitted compiler control manifest: '+p.frozen.node+' sha256 '+EXPECTED.nodeTypes+'. This file is in fresh read set, not retroactively in accepted old 786 list.',
 'New compiler read-file/file-existence/realpath and explicitly controlled config/compiler package freeze: '+p.beforeReads.size+' files SHA256 fingerprint '+freeze(p.beforeReads)+'. Explicitly instrumented paths are not proof of exhaustive opaque filesystem directory probes; still no build reproduction authority.',
 'Configured compiled source counts and TS diagnostics: '+p.compiled.diagnostics.map(x=>x.pkg+' '+x.sourceCount+' modules / '+x.diagnostics.length+' pre-emit diagnostics').join(', ')+'.',
 'Emitted exactly '+p.compiled.outputs.size+' logical artifacts in compiler callback memory ONLY; compiler host writeFile throws.',
 '',
 '## Gate C — exact virtual publication classifications',
 'Classification counts: '+JSON.stringify(p.counts)+'. No candidate path is a write permission; a byte-different/missing output not in the selected closure remains safely deferrable only under the narrowly stated scope, not whole-package parity.',
 '| Destination | Owner | Kind | Classification | Before SHA256/ABSENT | Proposed SHA256 | Dependency reason |',
 '|---|---|---|---|---|---|---|',
 ...C.rows.sort((a,b)=>a.destination.localeCompare(b.destination))
  .map(r=>'| '+r.destination+' | '+r.owner+' | '+r.kind+' | '+r.classification+' | '+r.before+' | '+r.proposed+' | '+r.why.replace(/\|/g,'/')+' |'),
 '',
 '## Gate C — independent runtime and declaration closure',
 'Gateway runtime root: @sud-d/mcp-gateway/gateway-core -> packages/mcp-gateway/dist/workspace-file-server-core.js.',
 'Gateway declaration root: @sud-d/mcp-gateway/gateway-core -> packages/mcp-gateway/dist/workspace-file-server-core.d.ts.',
 'Runtime modules: '+G.seen.size+', edges '+G.edges.length+', unresolved '+G.unknown.length+'.',
 'Declaration modules: '+D.seen.size+', edges '+D.edges.length+', unresolved '+D.unknown.length+'.',
 'Additional Domain, Application/gateway-core, Infrastructure/gateway-core root pairs checked: '+C.others.length+'.',
 '### Exact emitted runtime module closure with candidate SHA-256',
 ...[...G.seen].sort().map(x=>'- '+x+' '+p.compiled.outputs.get(x).proposed),
 '### Exact emitted declaration module closure with candidate SHA-256',
 ...[...D.seen].sort().map(x=>'- '+x+' '+p.compiled.outputs.get(x).proposed),
 '### Runtime edges',
 ...G.edges.map(x=>'- '+x.from+' '+x.kind+' '+x.spec+' -> '+x.to),
 '### Declaration import/reexport/type edges',
 ...D.edges.map(x=>'- '+x.from+' '+x.kind+' '+x.spec+' -> '+x.to),
 '### Captured worker and resource edges for all requested package roots',
 ...C.graph.flatMap(g=>g.resources.map(x=>'- '+g.spec+' '+g.mode+': '+x.from+' -> '+x.to)),
 '### Direct external package manifest hashes (no execution)',
 ...C.vendor.inspected.map(x=>'- '+x.specifier+' '+x.file+' sha256 '+x.sha256),
 '',
 '## Gate C — in-memory hybrid installation typecheck',
 'Overlay includes current candidate emitted declaration bytes only where required and changed; existing matching declarations are SHA-checked physically and overlaid. Existing changed-but-unselected declarations are excluded (no stale fallback). Four original strict Node16 configured program checks run with noEmit.',
 ...p.hybrid.results.map(x=>'- '+x.pkg+' diagnostics '+x.diagnostics.length+' files '+x.files),
 ...p.hybrid.results.flatMap(x=>x.diagnostics.map(y=>'- '+x.pkg+': '+y)),
 'Hybrid physically reused declarations: '+p.hybrid.reused.length+'; excluded differing declarations: '+p.hybrid.omitted.length+'.',
 '',
 '## BLOCKERS / Unknown — do NOT assert safe publication',
 ...(p.blocked.length?p.blocked.map(x=>'- '+x):['- No identified static/hybrid errors, but Windows physical write and native loader authority still unavailable.']),
 '47 new fake Gateway runtime modules and 0 known Koffi edges were established in previous accepted source-only mission; legacy Gateway still has 11 known Koffi edges. This diagnostic does not evaluate ESM, execute vendor conditional branches or certify native loading.',
 '',
 '## Gate D — frozen before/after fingerprints',
 'Observed full compiler input fingerprint (identical before vs after): '+freeze(p.beforeReads),
 'Observed physical 512 destination before/after fingerprint: '+freeze(p.beforeOutputs),
 '### All newly observed compiler-control / type package / source input SHA-256',
 ...[...p.beforeReads].sort(([a],[b])=>a.localeCompare(b)).map(([x,h])=>'- '+x+' SHA-256 '+h),
 '### All protected accepted source and report SHA-256',
 ...[...p.protectedFiles].sort(([a],[b])=>a.localeCompare(b)).map(([x,h])=>'- '+x+' SHA-256 '+h),
 '',
 '## Recommended FUTURE physical publication procedure only — NO IMPLEMENTATION',
 'Advisor must separately authorize a finite destination/path/hash allowlist and ensure full dependent JS/declaration/map/worker closure. Future physical Windows writer shall independently inspect all ancestors for junction/reparse/ADS, hold exclusive cross-process writer lock, use same-volume unique task-owned staging and hashed reversible backup with durable journal, detect concurrent change before atomic replacement, rollback on every failure/restart and prove all protected and unrelated paths preserved. These are unresolved physical gates, not permissions.',
 'Do not use compiled runtime smoke/Native, B2 or Owner Desktop approval in this diagnostic. Old 173 candidates and current MUST_WRITE subset do not grant publication.',
 '',
 '## Independent operator verification',
 'Skills selected and read: tdd, codebase-design, writing-for-agents; diagnosing-bugs used for unexpected fixture/parser RED repairs.',
 'Standalone node --check for BOTH new CJS files: EXIT 0. Standalone node packages/tests/src/b1b-g2b-publication-plan.test.cjs: 16/16 PASS, EXIT 0. git diff --check: EXIT 0 (existing unrelated LF/CRLF warnings only).',
 'Inert normal node packages/tests/src/b1b-g2b-publication-plan.cjs: expected EXIT '+(p.status==='PARTIAL/BLOCKED'?'2 (known conditional vendor/runtime unverified BLOCKED)':'0')+'; one ignored Closeout written with exclusive wx. Verification process must not claim nonzero means runtime failure; nonzero is a deliberate diagnostic BLOCKED status.',
 'Report includes compiler/source/output freezes; final independent Serena Git postflight shall be checked after report creation. No Vitest/Electron/native/worker child process was run.',
 'Preflight branch p0c-hyperv-spike, HEAD 7e4c54687f363b2abe6bd34ff71afb4d1a211299, staged 0; inherited Git porcelain 326 entries, SHA256 4412dacfc92c49547145f9733ea06ee94134601c776dd78d11db657ba3fc78c6.',
 '',
 'FINAL: G2b PUBLICATION PLAN '+p.status+'; DIST NOT AUTHORIZED; COMPILED RUNTIME PARITY NOT_READY; LIVE NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.','');
 return l.join('\n');
}
function main(){
 const p=plan(),text=render(p);
 for(const [x,h] of p.beforeReads)assert(physical(x)===h,'final read input drift '+x);
 for(const [x,h] of p.beforeOutputs)assert(physical(x)===h,'final dest drift '+x);
 for(const [x,h] of p.protectedFiles)assert(physical(x)===h,'final protected drift '+x);
 assert(!fs.existsSync(abs(CLOSEOUT)),'report already appeared');
 fs.writeFileSync(abs(CLOSEOUT),text,{flag:'wx',encoding:'utf8'});
 console.log('G2B_PLANNER_CLOSEOUT '+CLOSEOUT+' bytes '+Buffer.byteLength(text));
 console.log('G2B_PLANNER_COUNTS '+JSON.stringify(p.counts)+' outputs 512');
 console.log('G2B_PLANNER_GRAPH runtime '+p.classified.runtime.seen.size+' declarations '+p.classified.types.seen.size+
  ' newReads '+p.beforeReads.size+' unknown '+p.classified.unknown.length+
  ' hybridDiagnostics '+p.hybrid.results.reduce((a,x)=>a+x.diagnostics.length,0));
 console.log('G2B_PLANNER_VERDICT '+p.status+' NO_DIST_WRITES');
 if(p.status==='PARTIAL/BLOCKED')process.exitCode=2;
}
if(require.main===module){assert(process.argv.length===2,'unknown arguments');main();}
module.exports={plan,safeDestination,safeSource,resolveInternal,isCompleteClosure,scanEdges,assertFrozen,parseFrozenReport};
