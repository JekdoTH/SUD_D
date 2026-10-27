'use strict';
// SUD_D G2b compiler-only diagnostic. Never load product or native modules.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../../..');
const PKGS=['domain','infrastructure','application','mcp-gateway'];
const REPORT=path.join(ROOT,'.serena','reports','solo-expert-b1b-g2b-native-free-source-closeout-20261015.md');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const relative=x=>path.relative(ROOT,x).replace(/\\/g,'/');
const key=x=>{
  const resolved=path.resolve(x);
  // Node workspace symlinks: the virtual compiler output's canonical path and
  // a consuming package's node_modules/@sud-d path are one logical file.
  const link=/(?:[\\/])node_modules[\\/]@sud-d[\\/](domain|infrastructure|application|mcp-gateway)([\\/].*)?$/i.exec(resolved);
  return (link?path.resolve(ROOT,'packages',link[1],(link[2]||'').replace(/^[\\/]/,'')):resolved).toLowerCase();
};
const check=(value,message)=>{if(!value)throw Error('G2B_FAIL_CLOSED '+message);};
const within=(f,b)=>{const r=path.relative(b,f);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
const fingerprint=m=>sha([...m].sort((a,b)=>a[0].localeCompare(b[0])).map(e=>e.join('\0')).join('\n'));
const walk=(dir,filter,out=[])=>{
  for(const d of fs.readdirSync(dir,{withFileTypes:true})){
    const f=path.join(dir,d.name);
    check(!d.isSymbolicLink(),'source symlink '+f);
    if(d.isDirectory())walk(f,filter,out);
    else if(d.isFile()&&filter(f))out.push(f);
  }
  return out;
};
const frozenSources=()=>new Map(PKGS.flatMap(p=>walk(path.join(ROOT,'packages',p,'src'),n=>/\.tsx?$/.test(n)))
  .map(p=>[relative(p),sha(fs.readFileSync(p))]));
const fixedList=['tsconfig.base.json','package.json','pnpm-lock.yaml',
  'node_modules/typescript/lib/typescript.js','node_modules/typescript/package.json',
  ...PKGS.flatMap(p=>['packages/'+p+'/package.json','packages/'+p+'/tsconfig.json'])];
const frozenFixed=()=>new Map(fixedList.map(p=>[p,sha(fs.readFileSync(path.join(ROOT,p)))]));
const diskMap=names=>new Map([...names].map(n=>{
  const f=path.join(ROOT,n);return[n,fs.existsSync(f)?sha(fs.readFileSync(f)):'ABSENT'];
}));
const equal=(a,b,why)=>check(fingerprint(a)===fingerprint(b),why+' fingerprint drift');
function destination(f,pkg,seen,stat={
  exists:fs.existsSync,lstat:fs.lstatSync,reparse:()=>false,
}){
  const dir=path.join(ROOT,'packages',pkg,'dist'),abs=path.resolve(f),parts=relative(abs).split('/');
  check(within(abs,dir),'path escape');
  check(!parts.some(p=>p.includes(':')||p==='..'||p==='.'||!p),'ADS/traversal');
  check(/(?:\.js|\.js\.map|\.d\.ts|\.d\.ts\.map)$/.test(abs),'wrong output kind');
  check(!seen.has(key(abs)),'duplicate/case collision');
  let at=abs;
  while(true){
    if(stat.exists(at)){
      const st=stat.lstat(at);
      check(!st.isSymbolicLink()&&!stat.reparse(at),'symlink/reparse '+at);
      check(at===abs?st.isFile():st.isDirectory(),'invalid output ancestor '+at);
    }
    const up=path.dirname(at);if(up===at)break;at=up;
  }
  seen.add(key(abs));return abs;
}
function selfTest(){
  const reportHash=fs.existsSync(REPORT)?sha(fs.readFileSync(REPORT)):null;
  let count=0;const reject=(label,fn)=>{
    let rejected=false;try{fn();}catch{rejected=true;}
    check(rejected,'self-test failed '+label);count++;
  };
  const sample=path.join(ROOT,'packages','domain','dist','sample.js');
  const capture=new Map();capture.set(sample,Buffer.from('captured-only'));
  check(capture.get(sample).toString()==='captured-only','memory capture');count++;
  reject('traversal',()=>destination(path.join(ROOT,'packages','domain','oops.js'),'domain',new Set()));
  reject('outside',()=>destination(path.join(ROOT,'packages','application','dist','x.js'),'domain',new Set()));
  reject('ADS',()=>destination(sample+':stream','domain',new Set()));
  reject('extension',()=>destination(sample+'.node','domain',new Set()));
  reject('duplicate',()=>{const s=new Set();destination(sample,'domain',s);destination(sample,'domain',s);});
  reject('case collision',()=>{const s=new Set();destination(sample,'domain',s);destination(sample.toUpperCase(),'domain',s);});
  reject('symbolic ancestor',()=>destination(sample,'domain',new Set(),{
    exists:p=>p===path.dirname(sample),
    lstat:()=>({isSymbolicLink:()=>true,isDirectory:()=>true,isFile:()=>true}),reparse:()=>false,
  }));
  reject('Windows reparse',()=>destination(sample,'domain',new Set(),{
    exists:p=>p===path.dirname(sample),
    lstat:()=>({isSymbolicLink:()=>false,isDirectory:()=>true,isFile:()=>false}),
    reparse:p=>p===path.dirname(sample),
  }));
  reject('readset drift',()=>equal(new Map([['a','1']]),new Map([['a','2']]),'readset'));
  reject('destination drift',()=>equal(new Map([['b','3']]),new Map([['b','4']]),'destination'));
  check((fs.existsSync(REPORT)?sha(fs.readFileSync(REPORT)):null)===reportHash,'self-test modified report');
  console.log('G2B_SELF_TEST_PASS '+count+' checks; report untouched=true');
}
function config(pkg){
  const p=path.join(ROOT,'packages',pkg,'tsconfig.json');
  const result=ts.getParsedCommandLineOfConfigFile(p,{},{
    ...ts.sys,onUnRecoverableConfigFileDiagnostic:d=>{throw Error(ts.flattenDiagnosticMessageText(d.messageText,' '));}
  });
  check(result&&!result.errors.length,'bad config '+pkg);
  check(result.options.module===ts.ModuleKind.Node16&&result.options.moduleResolution===ts.ModuleResolutionKind.Node16,
    'config not Node16 '+pkg);
  check(result.options.strict===true&&result.options.skipLibCheck===true,'strictness mismatch '+pkg);
  return result;
}
function hostFor(opts,virtual){
  const host=ts.createCompilerHost(opts);
  const originalExists=host.fileExists.bind(host),originalRead=host.readFile.bind(host);
  // Never consume stale physical SUD_D dist declarations, even when present on disk.
  const projectDist=p=>PKGS.some(pkg=>key(p).startsWith(key(path.join(ROOT,'packages',pkg,'dist'))+path.sep));
  host.fileExists=p=>virtual.has(key(p))||(!projectDist(p)&&originalExists(p));
  host.readFile=p=>virtual.has(key(p))?virtual.get(key(p)).toString('utf8'):
    projectDist(p)?undefined:originalRead(p);
  host.getSourceFile=(p,languageVersion,onError)=>{
    const body=host.readFile(p);return body===undefined?undefined:
      ts.createSourceFile(p,body,languageVersion,true,ts.getScriptKindFromFileName(p));
  };
  host.writeFile=()=>{throw Error('G2B_DISK_COMPILER_EMIT_FORBIDDEN');};
  return host;
}
function jsEdges(body,file){
  const sf=ts.createSourceFile(file,body,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
  const edges=[],add=(kind,arg)=>edges.push({kind,from:relative(file),specifier:arg});
  const walkNode=n=>{
    if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier)
      add(ts.isExportDeclaration(n)?'export_star_or_named':'import',ts.isStringLiteral(n.moduleSpecifier)?n.moduleSpecifier.text:'NON_LITERAL');
    if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||
      (ts.isIdentifier(n.expression)&&n.expression.text==='require'))){
      const a=n.arguments[0];add(n.expression.kind===ts.SyntaxKind.ImportKeyword?'dynamic_import':'require',
        a&&ts.isStringLiteral(a)?a.text:'NON_LITERAL');
    }
    if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='URL'){
      const a=n.arguments?.[0],b=n.arguments?.[1];
      const moduleRelative=b&&ts.isPropertyAccessExpression(b)&&b.name.text==='url'&&
        b.expression.kind===ts.SyntaxKind.MetaProperty;
      // HTTP/remote URL parsing new URL(raw) or new URL('/readyz',baseUrl) is not a module resource.
      if(moduleRelative)add('new_URL_resource',a&&ts.isStringLiteral(a)?a.text:'NON_LITERAL');
    }
    if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&['Worker','SharedWorker'].includes(n.expression.text)){
      const a=n.arguments?.[0];
      if(!a||!(ts.isNewExpression(a)&&ts.isIdentifier(a.expression)&&a.expression.text==='URL'))
        add('worker_unknown','NON_LITERAL');
    }
    ts.forEachChild(n,walkNode);
  };walkNode(sf);return edges;
}
function formatDiag(d){
  const pos=d.file&&d.start!==undefined?d.file.getLineAndCharacterOfPosition(d.start):undefined;
  return [d.code,d.file?relative(d.file.fileName):'compiler',pos?pos.line+1:0,
    ts.flattenDiagnosticMessageText(d.messageText,' ').slice(0,350)].join(' / ');
}


// Static resolver: an existing dist file is NEVER authority for an uncaptured project edge.
function resolveProjectExport(spec, kind, available) {
  check(kind==='runtime'||kind==='types','unsupported project export condition');
  const match=/^@sud-d\/([^/]+)(?:\/(.+))?$/.exec(spec);
  check(!!match && PKGS.includes(match[1]),'unknown project package '+spec);
  const pkg=match[1],sub=match[2]?'./'+match[2]:'.';
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'packages',pkg,'package.json'),'utf8'));
  check(manifest.exports&&Object.hasOwn(manifest.exports,sub),'unknown package subpath '+spec);
  const entry=manifest.exports[sub];
  check(entry&&typeof entry==='object'&&!Array.isArray(entry),'unsupported export conditions '+spec);
  check(kind==='runtime'?Object.hasOwn(entry,'import'):Object.hasOwn(entry,'types'),
    'missing export condition '+kind+' '+spec);
  if(sub==='./gateway-core')check(Object.keys(entry)[0]==='types','unordered gateway subpath conditions');
  const logical=entry[kind==='runtime'?'import':'types'];
  check(typeof logical==='string'&&logical.startsWith('./dist/')&&!logical.includes('..'),
    'unsupported export target '+spec);
  const dest=path.resolve(ROOT,'packages',pkg,logical);
  check(available.has(key(dest)),'uncaptured package export '+spec+' '+kind+' -> '+relative(dest));
  return dest;
}
function resolveRuntime(spec,from,captured) {
  if(spec.startsWith('@sud-d/'))return {kind:'project',target:resolveProjectExport(spec,'runtime',captured)};
  if(spec.startsWith('.')){
    const target=path.resolve(path.dirname(from),spec);
    check(captured.has(key(target)),'uncaptured internal import/resource '+relative(from)+' -> '+spec);
    return {kind:'project',target};
  }
  if(spec==='NON_LITERAL')throw Error('G2B_FAIL_CLOSED nonliteral runtime/resource edge '+relative(from));
  return {kind:'external',target:spec};
}
function sourceEdges(body,file) {
  const ast=ts.createSourceFile(file,body,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);
  const edges=[];
  const walkNode=n=>{
    if(ts.isImportDeclaration(n) && n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
      const names=n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)?
        n.importClause.namedBindings.elements:[];
      const typeOnly=n.importClause?.isTypeOnly===true;
      edges.push({from:relative(file),specifier:n.moduleSpecifier.text,
        kind:typeOnly?'type-only import':'value import',
        erased:typeOnly});
      if(!typeOnly && names.length && names.every(e=>e.isTypeOnly))
        edges[edges.length-1].erased=true;
    }
    if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)){
      const allTyped=!!n.isTypeOnly||(n.exportClause&&ts.isNamedExports(n.exportClause)&&
        n.exportClause.elements.length>0&&n.exportClause.elements.every(e=>e.isTypeOnly));
      edges.push({from:relative(file),specifier:n.moduleSpecifier.text,
        kind:allTyped?'type-only reexport':'value reexport',erased:!!allTyped});
    }
    ts.forEachChild(n,walkNode);
  };walkNode(ast);return edges;
}
function traceGraph(entry,modules) {
  const captured=new Map([...modules].map(([k,m])=>[k,m]));
  const root=resolveProjectExport(entry,'runtime',new Map([...modules].map(([k])=>[k,true])));
  const queue=[root],reachable=new Set(),edges=[],native=[],external=new Set();
  while(queue.length){
    const file=queue.shift(),id=key(file);
    if(reachable.has(id))continue;
    const rec=captured.get(id);
    check(!!rec,'trace entry missing '+relative(file));
    reachable.add(id);
    for(const e of jsEdges(rec.body.toString('utf8'),file)){
      const result=resolveRuntime(e.specifier,file,captured);
      edges.push({...e,resolved:result.kind==='project'?relative(result.target):result.target});
      if(result.kind==='project')queue.push(result.target);
      else{
        external.add(result.target);
        if(result.target==='koffi'||result.target.endsWith('.node'))native.push(e);
      }
    }
  }
  return {entry,edges,native,external:[...external].sort(),reachable:[...reachable].map(x=>relative(x)).sort()};
}
function staticExternalEvidence(specifiers) {
  // Static-only installed-package traversal. This reads JS/metadata; never loads the module.
  const rows=[],unknown=[],native=[],seen=new Set(),queue=specifiers.map(s=>({spec:s,from:ROOT,mode:'import'}));
  const {isBuiltin}=require('node:module');
  const realPath=p=>fs.realpathSync.native(p);
  const candidates=(pkg,from)=>{
    const results=[];
    let at=fs.existsSync(from)&&fs.statSync(from).isFile()?path.dirname(from):from;
    for(let step=0;step<24;step++){
      results.push(path.join(at,'node_modules',...pkg.split('/')));
      const parent=path.dirname(at);if(parent===at)break;at=parent;
    }
    for(const name of ['mcp-gateway','application','infrastructure','domain'])
      results.push(path.join(ROOT,'packages',name,'node_modules',...pkg.split('/')));
    results.push(path.join(ROOT,'node_modules',...pkg.split('/')));
    return results;
  };
  const select=(node,mode)=>{
    if(typeof node==='string')return node;
    if(!node||typeof node!=='object'||Array.isArray(node))return undefined;
    // ESM or CommonJS Node conditions. First matching declared condition wins.
    for(const [k,v] of Object.entries(node)){
      if(k==='default'||k==='node'||(mode==='import'&&k==='import')||(mode==='require'&&k==='require'))
        return select(v,mode);
    }
    return undefined;
  };
  const locate=(spec,from,mode)=>{
    if(isBuiltin(spec)||spec.startsWith('node:'))return {kind:'builtin',file:spec};
    if(spec.startsWith('.')){
      const base=path.resolve(path.dirname(from),spec);
      const options=[base,base+'.js',base+'.mjs',base+'.cjs',
        path.join(base,'index.js'),path.join(base,'index.mjs')];
      const found=options.find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());
      return found?{kind:'file',file:found}:{kind:'unknown',why:'missing relative vendor module'};
    }
    const match=/^(@[^/]+\/[^/]+|[^/]+)(?:\/(.*))?$/.exec(spec);
    if(!match)return {kind:'unknown',why:'nonliteral/malformed vendor specifier'};
    const dir=candidates(match[1],from).find(d=>fs.existsSync(path.join(d,'package.json')));
    if(!dir)return {kind:'unknown',why:'vendor package manifest absent'};
    const manifest=path.join(dir,'package.json'),data=JSON.parse(fs.readFileSync(manifest,'utf8'));
    const sub=match[2]?'./'+match[2]:'.';
    let branch=data.exports;
    if(branch&&typeof branch==='object'&&!Array.isArray(branch)){
      if(Object.hasOwn(branch,sub))branch=branch[sub];
      else if(sub!=='.'){
        const pattern=Object.keys(branch).find(k=>k.endsWith('*')&&sub.startsWith(k.slice(0,-1)));
        if(pattern){
          const chosen=select(branch[pattern],mode);
          branch=typeof chosen==='string'?chosen.replace('*',sub.slice(pattern.length-1)):undefined;
        }else branch=undefined;
      }
    }
    let selected=select(branch,mode);
    if(selected===undefined&&!data.exports&&sub==='.')selected=data.module??data.main;
    if(selected===undefined)return {kind:'unknown',why:'unsupported or absent export branch'};
    if(!selected.startsWith('./'))return {kind:'unknown',why:'export escapes package base'};
    const file=path.resolve(dir,selected);
    if(!within(file,dir))return {kind:'unknown',why:'vendor export traversal'};
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())return {kind:'unknown',why:'vendor export file missing'};
    return {kind:'file',file,manifest};
  };
  while(queue.length){
    const {spec,from,mode}=queue.shift();
    const located=locate(spec,from,mode);
    if(located.kind==='builtin'){rows.push({specifier:spec,kind:'built-in',sha:'builtin'});continue;}
    if(located.kind!=='file'){
      unknown.push(relative(from)+' '+mode+' '+spec+' '+located.why);
      continue;
    }
    const file=realPath(located.file),id=key(file);
    if(seen.has(id))continue;
    seen.add(id);
    if(seen.size>1500){unknown.push('vendor graph exceeds bounded 1500 JS files');break;}
    const bytes=fs.readFileSync(file),body=bytes.toString('utf8'),extension=path.extname(file);
    const entry={specifier:spec,kind:'installed external transitive file',file:relative(file),sha:sha(bytes),
      ...(located.manifest?{manifestFile:relative(located.manifest),
        packageSha:sha(fs.readFileSync(located.manifest))}:{}),
      potentialLoaderPattern:/\bcreateRequire\s*\(|\bprocess\.dlopen\s*\(|\.node\b/.test(body)};
    rows.push(entry);
    if(extension==='.node'||/\bprocess\.dlopen\s*\(/.test(body))native.push(entry);
    if(!['.js','.mjs','.cjs'].includes(extension))continue;
    if(/\bcreateRequire\s*\(/.test(body))
      unknown.push(relative(file)+' createRequire variable loader needs review');
    for(const edge of jsEdges(body,file)){
      if(edge.specifier==='NON_LITERAL'){
        unknown.push(relative(file)+' '+edge.kind+' nonliteral vendor edge');continue;
      }
      if(edge.kind==='new_URL_resource'){
        if(edge.specifier.startsWith('.'))queue.push({spec:edge.specifier,from:file,mode:'import'});
        continue;
      }
      if(edge.kind==='worker_unknown'){unknown.push(relative(file)+' dynamic worker');continue;}
      queue.push({spec:edge.specifier,from:file,
        mode:edge.kind==='require'?'require':'import'});
    }
  }
  return {rows,unknown:[...new Set(unknown)].sort(),native};
}


function analysis(){
  const originalReport=fs.existsSync(REPORT)?fs.readFileSync(REPORT):null;
  check(originalReport===null,'closeout must be absent before one final run');
  const sourcesBefore=frozenSources(),fixedBefore=frozenFixed();
  const parsed=new Map(PKGS.map(p=>[p,config(p)]));
  const roots=new Map(PKGS.map(p=>[p,new Set([path.join(ROOT,'packages',p,'src','index.ts')])]));
  const overlay=new Map(),records=new Map();
  const dependencyPaths=new Set();
  const observeProgram=program=>{
    for(const sf of program.getSourceFiles()){
      const p=path.resolve(sf.fileName);
      if(within(p,ROOT)&&fs.existsSync(p)&&fs.statSync(p).isFile())dependencyPaths.add(relative(p));
    }
  };
  const capturePasses=[];
  let captured=new Map(),modules=new Map(),resourceUnknown=[];
  for(let pass=1;pass<=4;pass++){
    captured=new Map();modules=new Map();overlay.clear();
    for(const pkg of PKGS){
      const options={...parsed.get(pkg).options,incremental:false,composite:false,noEmit:false};
      delete options.tsBuildInfoFile;
      const h=hostFor(options,overlay),rootsNow=[...new Set([...parsed.get(pkg).fileNames,...roots.get(pkg)])];
      const program=ts.createProgram(rootsNow,options,h);
      observeProgram(program);
      const owned=program.getSourceFiles().filter(sf=>!sf.isDeclarationFile&&
        within(path.resolve(sf.fileName),path.join(ROOT,'packages',pkg,'src')));
      const seen=new Set();
      for(const sf of owned){
        const local=new Map();
        const output=program.emit(sf,(dest,body)=>{
          const target=destination(dest,pkg,seen);
          check(!captured.has(key(target)),'duplicate across packages');
          const bytes=Buffer.from(body,'utf8');
          captured.set(key(target),{path:target,source:path.resolve(sf.fileName),pkg,bytes});
          local.set(key(target),bytes);
          if(target.endsWith('.d.ts'))overlay.set(key(target),bytes);
        });
        check(!output.emitSkipped,'compiler failed to capture '+relative(sf.fileName));
        check(local.size===4,'expected 4 outputs '+relative(sf.fileName)+' found '+local.size);
        const expected=path.join(ROOT,'packages',pkg,'dist',
          path.relative(path.join(ROOT,'packages',pkg,'src'),sf.fileName).replace(/\.tsx?$/,'.js'));
        check(local.has(key(expected)),'missing emitted JS '+relative(expected));
        modules.set(key(expected),{source:path.resolve(sf.fileName),path:expected,body:local.get(key(expected)),pkg});
      }
      capturePasses.push({pkg,pass,rootPaths:rootsNow.map(relative),sources:owned.length,
        preEmitDiagnostics:ts.getPreEmitDiagnostics(program).map(formatDiag)});
    }
    const extras=new Map(PKGS.map(p=>[p,new Set()]));resourceUnknown=[];
    for(const rec of modules.values())for(const edge of jsEdges(rec.body.toString('utf8'),rec.path)){
      if(edge.kind!=='new_URL_resource')continue;
      if(edge.specifier==='NON_LITERAL'){
        resourceUnknown.push({...edge,reason:'nonliteral resource URL'});continue;
      }
      if(!edge.specifier.startsWith('.'))continue;
      const logical=path.resolve(path.dirname(rec.path),edge.specifier);
      const pkg=PKGS.find(p=>within(logical,path.join(ROOT,'packages',p,'dist')));
      if(!pkg){resourceUnknown.push({...edge,reason:'resource outside known package'});continue;}
      const src=path.join(ROOT,'packages',pkg,'src',
        path.relative(path.join(ROOT,'packages',pkg,'dist'),logical).replace(/\.js$/,'.ts'));
      if(!fs.existsSync(src))resourceUnknown.push({...edge,reason:'missing target '+relative(src)});
      else extras.get(pkg).add(src);
    }
    let added=0;
    for(const [pkg,files] of extras)for(const f of files){
      if(!roots.get(pkg).has(f)){roots.get(pkg).add(f);added++;}
    }
    if(!added)break;
    check(pass<4,'unresolved growing resource closure');
  }
  const allRows=[],destinationBefore=new Map();
  for(const item of [...captured.values()].sort((a,b)=>relative(a.path).localeCompare(relative(b.path)))){
    const dest=relative(item.path),onDisk=fs.existsSync(item.path)?fs.readFileSync(item.path):null;
    const before=onDisk===null?'ABSENT':sha(onDisk);
    const proposed=sha(item.bytes);
    const state=onDisk===null?'MISSING':before===proposed?'REUSED':'DIFFERENT';
    destinationBefore.set(dest,before);
    allRows.push({dest,source:relative(item.source),
      kind:dest.endsWith('.d.ts.map')?'declaration-map':dest.endsWith('.d.ts')?'declaration':
        dest.endsWith('.js.map')?'runtime-map':'runtime-js',state,before,proposed,
      reason:state==='REUSED'?'existing output matches memory compiler bytes':
        'current source-derived compiler bytes differ from present artifact'});
  }
  // Compiler packages are checked under their own Node16 configs, no generated output to disk.
  const packageDiagnostics=[];
  for(const pkg of PKGS){
    const opts={...parsed.get(pkg).options,noEmit:true,incremental:false,composite:false};
    delete opts.tsBuildInfoFile;delete opts.outDir;delete opts.rootDir;
    const h=hostFor(opts,overlay),prog=ts.createProgram(parsed.get(pkg).fileNames,opts,h);
    observeProgram(prog);
    const diagnostics=[...parsed.get(pkg).errors,...ts.getPreEmitDiagnostics(prog)].map(formatDiag);
    const files=prog.getSourceFiles().map(f=>path.resolve(f.fileName));
    packageDiagnostics.push({pkg,diagnostics,programFiles:files.length,
      overlayPaths:files.filter(f=>overlay.has(key(f))).map(relative).sort(),
      physicalPackageDeclarations:files.filter(f=>/packages[\\/](domain|infrastructure|application|mcp-gateway)[\\/]dist[\\/].*\.d\.ts$/.test(f)&&!overlay.has(key(f))).map(relative).sort()});
  }
  // Closed-world project graph. No physical dist existence shortcut is permitted.
  const fake=traceGraph('@sud-d/mcp-gateway/gateway-core',modules);
  const legacy=traceGraph('@sud-d/mcp-gateway',modules);
  check(fake.native.length===0,'new Gateway core has reachable Koffi/native edges');
  check(legacy.native.length>0,'legacy Gateway root unexpectedly lost native reachability');
  const sourcesGraph=[...modules.values()].flatMap(m=>sourceEdges(
    fs.readFileSync(m.source,'utf8'),m.source));
  const edges=[...modules.values()].flatMap(m=>jsEdges(m.body.toString('utf8'),m.path).map(e=>({
    ...e,target:e.specifier.startsWith('.')?relative(path.resolve(path.dirname(m.path),e.specifier)):
      e.specifier,
  })));
  const unknown=[];
  const native=legacy.native;
  const external=new Set([...fake.external,...legacy.external]);
  const externals=staticExternalEvidence(fake.external);
  for(const item of externals.rows){
    if(item.file&&within(path.resolve(ROOT,item.file),ROOT))dependencyPaths.add(item.file);
    if(item.manifestFile&&within(path.resolve(ROOT,item.manifestFile),ROOT))dependencyPaths.add(item.manifestFile);
  }
  const included=new Set([...modules.values()].map(m=>relative(m.source)));
  const excluded=[...sourcesBefore.keys()].filter(p=>!included.has(p)).sort();
  const count=state=>allRows.filter(r=>r.state===state).length;
  const readSet=new Map([...sourcesBefore,...fixedBefore]);
  for(const p of dependencyPaths){if(!readSet.has(p))readSet.set(p,sha(fs.readFileSync(path.join(ROOT,p))));}
  const readBefore=diskMap(readSet.keys());
  const readAfter=diskMap(readSet.keys());
  equal(readBefore,readAfter,'read set');
  equal(sourcesBefore,frozenSources(),'source');
  equal(fixedBefore,frozenFixed(),'configs/compiler/lockfile');
  equal(destinationBefore,diskMap(destinationBefore.keys()),'output destination');
  check(originalReport===null?!fs.existsSync(REPORT):
    (fs.existsSync(REPORT)&&sha(fs.readFileSync(REPORT))===sha(originalReport)),
    'report changed during compiler capture');
  records.set('sources',sourcesBefore);records.set('fixed',fixedBefore);
  return {rows:allRows,modules,edges,unknown,native,external,resourceUnknown,packageDiagnostics,
    fake,legacy,sourcesGraph,externals,
    included,excluded,capturePasses,sourcesBefore,fixedBefore,readBefore,destinationBefore,
    count:{total:allRows.length,different:count('DIFFERENT'),missing:count('MISSING'),reused:count('REUSED')}};
}

function render(d){
  const lines=[];
  const add=(...rows)=>lines.push(...rows);
  add('# SUD_D B1b-G2b — Native-free Source Isolation Code-only Closeout',
    '',
    '**Date:** 2026-10-15 | **Checkpoint:** G2b NATIVE-FREE SOURCE ISOLATION STATICALLY VERIFIED; COMPILED RUNTIME PARITY NOT_READY. No artifact publication, native or product execution.',
    '**G2a SOURCE/FAKE ACCEPTED; G2b DIST NOT AUTHORIZED; LIVE NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.**',
    '',
    '## Gate A/B — preflight, source-only relocation, red-to-green proof',
    'Preflight branch p0c-hyperv-spike; HEAD 7e4c54687f363b2abe6bd34ff71afb4d1a211299; staged 0; inherited dirty Git status SHA-256 879790d65845aa1dd0379b0a7215247572891bcd4a755c396f5e8afe6141fc2e (309 entries). Final independent operator recheck required.',
    'This mission has exactly 16 permitted metadata/source/test paths, four initially ABSENT; one new ignored Closeout report. Selected canonical skills: tdd, codebase-design, writing-for-agents, diagnosing-bugs for fixture unexpected RED. No Codex, subagents, Team or Remote Commander.',
    'RED static source test first rejected missing ./gateway-core package exports; GREEN focused CJS test checks 11 cases and existing inert harness --self-test checks 11; both must be independently rerun by operator for exit evidence. New runtime facades, factory-core file, original default composition and seven redirected application consumers are the only source changes within exact 16 allowlist. Inert compiler captures without emitting. ONE ignored Closeout is the only generated report; previous G2b static evidence report remains immutable.',
    '',
    '## Gate C — exact current configured compiler output evidence (source-only)',
    'Installed TypeScript '+ts.version+'; per-package tsconfig strict/skipLibCheck Node16, source/declaration maps; emitted individually through program.emit(sourceFile,captureWriteFile) into in-process Map; host.writeFile always throws. Zero disk build/dist/tsbuildinfo output.',
    'Total outputs '+d.count.total+'; different '+d.count.different+'; missing '+d.count.missing+'; reused '+d.count.reused+'. Counts are diagnostic, not an authorized write budget.',
    'Candidate byte fingerprint: '+fingerprint(new Map(d.rows.map(r=>[r.dest,r.proposed]))),
    '',
    '### Exact differing and missing outputs: ALL with owner/kind/existing and proposed hashes',
    '| Destination | Source owner | Kind | State | Before SHA-256 | Candidate SHA-256 | Reason |',
    '|---|---|---|---|---|---|---|',
    ...d.rows.filter(r=>r.state!=='REUSED').map(r=>'| '+r.dest+' | '+r.source+' | '+r.kind+' | '+r.state+' | '+r.before+' | '+r.proposed+' | '+r.reason+' |'),
    '',
    '### Every byte-identical reused output independently hashed',
    '| Reused output path | Source owner | Identical SHA-256 |',
    '|---|---|---|',
    ...d.rows.filter(r=>r.state==='REUSED').map(r=>'| '+r.dest+' | '+r.source+' | '+r.before+' |'),
    '',
    '### Compiler capture provenance',
    ...d.capturePasses.map(x=>'- Pass '+x.pass+', '+x.pkg+': '+x.sources+' modules; roots '+x.rootPaths.join(', ')+
      '; pre-emit diagnostics '+x.preEmitDiagnostics.length+
      (x.preEmitDiagnostics.length?': '+x.preEmitDiagnostics.join(' || '):'')),
    '',
    '## Gate C — native-free source/ESM/type/worker-resource closure',
    'Canonical ESM exports: package.json for each of Domain, Infrastructure, Application and MCP Gateway maps root import to ./dist/index.js and types to ./dist/index.d.ts. Source TS type-only edges do not load in JS; emitted ESM export * / value imports do. No generated code was executed.',
    'Captured '+d.included.size+' configured project source modules (includes unreferenced legacy modules for evidence), excluded '+d.excluded.length+' source files. Excluded modules are not claimed unnecessary.' ,
    '### New native-free Gateway entrypoint static closure',
    '- Reachable emitted JS modules: '+d.fake.reachable.length+'; native project Koffi edges: '+d.fake.native.length+'; imported external specifiers: '+d.fake.external.length,
    ...d.fake.reachable.map(p=>'- '+p),
    '### Legacy root static closure (native retained)',
    '- Reachable emitted JS modules: '+d.legacy.reachable.length+'; native Koffi edges: '+d.legacy.native.length,
    ...d.legacy.native.map(e=>'- '+e.from+' '+e.specifier),
    '### Independent TypeScript source AST import/reexport edges: '+d.sourcesGraph.length,
    '| From source | Edge | Specifier | Erased from emitted runtime? |',
    '|---|---|---|---|',
    ...d.sourcesGraph.map(e=>'| '+e.from+' | '+e.kind+' | '+e.specifier+' | '+e.erased+' |'),
    '### Included source owner paths',
    ...[...d.included].sort().map(p=>'- '+p),
    '### Excluded TS source paths with reason',
    ...d.excluded.map(p=>'- '+p+' — not reached from canonical package roots or static worker URL edges'),
    '',
    '### Complete captured emitted-JS edges',
    '| From | Edge kind | Raw specifier | Target |',
    '|---|---|---|---|',
    ...d.edges.map(e=>'| '+e.from+' | '+e.kind+' | '+e.specifier.replace(/\|/g,'\\|')+' | '+e.target.replace(/\|/g,'\\|')+' |'),
    '',
    '### External imports (static, not executed)', ...[...d.external].sort().map(x=>'- '+x),
    '### Installed external package entry / manifest static hashes',
    ...d.externals.rows.map(e=>'- '+e.specifier+' '+e.kind+' '+(e.file||'')+' '+e.sha+
       (e.packageSha?' manifest='+e.packageSha:'')+
       (e.potentialLoaderPattern?' potential-loader-pattern=true':'')),
    '### Unresolved transitive external dependency evidence (must BLOCK full native-free certification)',
    ...(d.externals.unknown.length?d.externals.unknown.map(x=>'- '+x):['- None found under bounded static vendor traversal; runtime evaluation was not performed.']),
    '### Externally native-reaching modules found by bounded static scan',
    ...(d.externals.native.length?d.externals.native.map(x=>'- '+x.file+' '+x.sha):['- None identified by bounded scan (not a native runtime attestation).']),
    '### Unresolved/nonliteral project edges (BLOCKED if any)',
    ...(d.unknown.length?d.unknown.map(e=>'- '+e.from+' '+e.kind+' '+e.specifier+' -> '+e.why):['- None detected in captured emitted JS AST']),
    ...d.resourceUnknown.map(e=>'- '+e.from+' resource '+e.specifier+' -> '+e.reason),
    '',
    '### Legacy native reachability and prohibition on runtime smoke',
    'New /gateway-core Gateway subpath has ZERO project/native Koffi edges by independent emitted-JS AST graph; bounded external import scan also found no identified native edge or unresolved import. The LEGACY canonical Gateway root still reaches Infrastructure native barrel, including credential-store/windows-credential-manager and private-mvp H0/H1 Koffi. Legacy default-OFF does not prevent module evaluation. NO RUNTIME SMOKE AUTHORIZED or performed; dynamic native loader safety is NOT attested by static scans.',
    ...d.native.map(e=>'- Native static edge: '+e.from+' '+e.kind+' '+e.specifier),
    '',
    '## Gate D — faithful strict Node16 package diagnostics with virtual declarations',
    'Each package checked using its actual source roots and compiler options: strict:true; skipLibCheck:true; Node16 module and resolution; noEmit:true; incremental:false; composite:false; generated upstream dist declarations provided by an in-memory host read/fileExists/getSourceFile overlay, with no fake stubs. Compiler disk write prohibited.',
    ...d.packageDiagnostics.flatMap(p=>[
      '### '+p.pkg+': '+p.diagnostics.length+' diagnostics; '+p.programFiles+' total program files',
      'Virtual declarations resolved ('+p.overlayPaths.length+'):',
      ...p.overlayPaths.map(x=>'- '+x),
      'Existing physical package declarations still resolved ('+p.physicalPackageDeclarations.length+'):',
      ...p.physicalPackageDeclarations.map(x=>'- '+x),
      'Source/compiler diagnostics:',
      ...(p.diagnostics.length?p.diagnostics.map(x=>'- '+x):['- None'])
    ]),
    'A previous mixed Node24/Node26/Undici diagnostic graph with skipLibCheck:false is NOT this faithful package gate. No dependency edits were made and no stubs or diagnostics were suppressed.',
    '',
    '## Gate D — immutable before/after fingerprints',
    'Source full set '+d.sourcesBefore.size+' files: '+fingerprint(d.sourcesBefore)+'; unchanged at report-write precondition.',
    'Config/toolchain/lockfile set '+d.fixedBefore.size+' files: '+fingerprint(d.fixedBefore)+'; unchanged at report-write precondition.',
    'Read-set combined '+d.readBefore.size+' files: '+fingerprint(d.readBefore)+'; unchanged.',
    'Existing/missing destinations '+d.destinationBefore.size+' outputs: '+fingerprint(d.destinationBefore)+'; unchanged.',
    'Hash equality is evidence of no observed drift, NOT exclusive file writer ownership.',
    '### All extra compiler-observed dependency declarations and module file hashes',
    ...[...d.readBefore].filter(([n])=>!d.sourcesBefore.has(n)&&!d.fixedBefore.has(n))
      .sort((a,b)=>a[0].localeCompare(b[0])).map(([n,h])=>'- '+n+' SHA-256 '+h),
    '### All frozen config/manifest/lock/compiler fingerprints',
    ...[...d.fixedBefore].map(([n,h])=>'- '+n+' SHA-256 '+h),
    '### All included/excluded source file hashes',
    ...[...d.sourcesBefore].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,h])=>'- '+n+' SHA-256 '+h),
    '',
    '### Reported limitations / exact next authority',
    'The source-import isolation candidate is intentionally NOT executed. The new Gateway core has zero reachable project Koffi edges in the statically traversed emitted project graph; external package source is inspected without execution. The legacy root remains native-reaching. Unsupported vendor conditional/dynamic edges must block full native-free certification. Any future artifact publication and runtime/native proof require a separate Advisor exact authorization. Old 444-output report remains protected.',
    '',
    '**FINAL: G2b NATIVE-FREE SOURCE ISOLATION STATICALLY VERIFIED; COMPILED RUNTIME PARITY NOT_READY; DIST NOT AUTHORIZED; LIVE MANAGED SERENA NOT_READY; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.**','');
  return lines.join('\n');
}

function main(){
  const d=analysis();
  // Hash source, config/toolchain and destinations one more time immediately before the ONLY write.
  equal(d.sourcesBefore,frozenSources(),'pre-report source');
  equal(d.fixedBefore,frozenFixed(),'pre-report fixed');
  equal(d.destinationBefore,diskMap(d.destinationBefore.keys()),'pre-report dest');
  const old=fs.existsSync(REPORT)?fs.readFileSync(REPORT):null;
  check(old===null,'closeout already exists');
  const text=render(d);
  // Publish exactly one new ignored Closeout, after frozen in-memory checks.
  fs.writeFileSync(REPORT,text,{encoding:'utf8',flag:'wx'});
  console.log('G2B_REPORT_CREATED '+relative(REPORT)+' size='+Buffer.byteLength(text));
  console.log('G2B_OUTPUTS '+JSON.stringify(d.count)+' MODULES '+d.included.size+' excluded '+d.excluded.length);
  console.log('G2B_PACKAGE_DIAGNOSTICS '+d.packageDiagnostics.map(x=>x.pkg+':'+x.diagnostics.length+
    '(virtual='+x.overlayPaths.length+',physical='+x.physicalPackageDeclarations.length+')').join('; '));
  console.log('G2B_GRAPH_UNRESOLVED '+d.unknown.length+' RESOURCE_UNKNOWN '+d.resourceUnknown.length+
    ' NEW_NATIVE '+d.fake.native.length+' LEGACY_NATIVE '+d.legacy.native.length+
    ' EXTERNAL_STATIC_UNRESOLVED '+d.externals.unknown.length+' EXTERNAL_NATIVE '+d.externals.native.length);
  console.log('G2B_READSET '+d.readBefore.size+' SHA '+fingerprint(d.readBefore));
  const partial=d.unknown.length>0||d.resourceUnknown.length>0||d.externals.unknown.length>0||
    d.externals.native.length>0||d.fake.native.length>0||d.packageDiagnostics.some(p=>p.diagnostics.length>0);
  console.log('G2B_SOURCE_VERDICT '+(partial?'PARTIAL/BLOCKED':'NATIVE_FREE_SOURCE_STATICALLY_VERIFIED')+'; COMPILED_RUNTIME_PARITY_NOT_READY; NO_DIST_WRITES; NO_NATIVE_EXECUTION');
  if(partial)process.exitCode=2;
}
if(require.main===module){
  check(process.argv.length===2||(process.argv.length===3&&process.argv[2]==='--self-test'),'invalid arguments');
  if(process.argv[2]==='--self-test')selfTest();else main();
}
module.exports={destination,jsEdges,fingerprint,equal,config,analysis,
  resolveProjectExport,resolveRuntime,sourceEdges,traceGraph,hostFor,staticExternalEvidence};
