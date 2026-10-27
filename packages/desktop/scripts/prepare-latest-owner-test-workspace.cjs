'use strict';
// SUD_D G2b Desktop owner-test build INPUTS only; never executes product or build.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const HEAD='7e4c54687f363b2abe6bd34ff71afb4d1a211299';
const TARGET_NAME='sudd-latest-desktop-owner-build-20261015-02';
const TEMP_ROOT=path.resolve(os.tmpdir(),TARGET_NAME);
const REPORT='.serena/reports/solo-expert-g2b-latest-desktop-owner-build-fileid-repair-closeout-20261015.md';
const DIRS=['packages/desktop/src','packages/desktop/electron',
 ...['domain','contracts','infrastructure','application','mcp-gateway'].map(p=>'packages/'+p+'/src')];
const FILES=['packages/desktop/vite.config.ts','packages/desktop/tsconfig.node.json',
 'packages/desktop/tsconfig.web.json','packages/desktop/package.json',
 ...['domain','contracts','infrastructure','application','mcp-gateway'].flatMap(p=>[
  'packages/'+p+'/package.json','packages/'+p+'/tsconfig.json']),
 'package.json','pnpm-workspace.yaml','pnpm-lock.yaml','tsconfig.base.json','tsconfig.check.json'];
const EXT=new Set(['.ts','.tsx','.mts','.cts','.json','.html','.css','.svg','.png','.ico',
 '.txt','.yaml','.yml','.mjs','.cjs']);
const EXCLUDED=new Set(['.git','.serena','node_modules','dist','dist-electron','dist-release',
 'build','coverage','cache','.turbo','.cache']);
const RESERVED=new Set(['con','prn','aux','nul',...Array.from({length:9},(_,i)=>'com'+(i+1)),
 ...Array.from({length:9},(_,i)=>'lpt'+(i+1))]);
const PROTECTED={
 '.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md':'619f6e03b516ae979aa11363812eaa3b0ef1be3afee86d610d154d9171f4b016',
 '.serena/reports/solo-expert-b1b-g2b-local-dist-promotion-closeout-20261015.md':'236255718320e20ad97c8663a09beb3b0b527474d1ad8d21d18b54a460df6e68',
 '.serena/reports/solo-expert-b1b-g2b-isolated-owner-tree-closeout-20261015.md':'32e386b51a68a6c83179507fe61597d1171aaffca7c5acce45f5b41144d4955e',
 'packages/contracts/dist/index.js':'a5eed5c47e059b2badb69c440c268f8d60600ae78051173e22b2f1640b156d9f',
 'packages/contracts/dist/index.js.map':'98010edf9fd2d794c3c6bc00690b7f136310d01b573750aa7dbc422a5b45d52c',
 'packages/contracts/dist/index.d.ts':'fe52a1339a98ca692a52b857be4bbbb91e720b7cc780421aeaaeba3c23006f4c',
 'packages/contracts/dist/index.d.ts.map':'7fe93993ef2807b3422c8c2ac79001472e0f8c836f94a6e8c32c26d3dcd2dde6'
};
const fail=x=>{throw new Error('OWNER_TEST_BLOCKED '+x)};
const check=(yes,msg)=>{if(!yes)fail(msg)};
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const repo=x=>path.resolve(ROOT,x);
const pathUnder=(p,d)=>{const r=path.relative(d,p);
 return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
function safeRelative(s,seen){
 check(typeof s==='string'&&s.length>0&&!path.isAbsolute(s)&&!s.includes('\\')&&
   !s.includes(':')&&!s.includes('\0')&&!/[\u0000-\u001f]/.test(s),
   'bad absolute/ADS/Windows path '+String(s));
 const parts=s.split('/');
 check(parts.every(x=>x&&x!=='.'&&x!=='..'&&!x.endsWith('.')&&!x.endsWith(' ')&&
  x===x.trim()&&!RESERVED.has(x.split('.')[0].toLowerCase())),
  'path escape / Windows device alias '+s);
 const key=s.normalize('NFC').toLowerCase();
 if(seen){check(!seen.has(key),'case-fold/Unicode collision '+s);seen.add(key)}
 return parts;
}
function inside(d,f){
 check(pathUnder(path.resolve(f),path.resolve(d)),'output outside owned root '+f);
 return path.resolve(f);
}
function assertAbsent(f,exists=fs.existsSync){check(!exists(f),'preexisting foreign destination '+f);return true}
function reparse(f){
 const st=fs.lstatSync(f);
 check(!st.isSymbolicLink(),'symlink/junction '+f);
 check(path.resolve(f).toLowerCase()===fs.realpathSync.native(f).toLowerCase(),
   'reparse redirect '+f);
 return st;
}
function assertRegular(st,p){
 check(st&&typeof st.isSymbolicLink==='function'&&!st.isSymbolicLink()&&
  typeof st.isFile==='function'&&st.isFile(),'not an ordinary file '+p);return true;
}
function assertIndependent(src,dst){
 check(src&&dst&&dst.ino!=='0'&&dst.dev!=='0'&&String(dst.nlink)==='1'&&
  !(String(src.ino)===String(dst.ino)&&String(src.dev)===String(dst.dev)),
   'independent FileID/nlink violation');return true;
}
function assertSourceHash(actual,expected,p){
 check(actual===expected,'source changed during copy '+p);return true;
}
function assertAllowedSource(p){
 const parts=safeRelative(p);
 check(!parts.some(x=>EXCLUDED.has(x)||x.startsWith('.env')||x.endsWith('.tsbuildinfo')),
  'excluded path '+p);
 if(FILES.includes(p))return true;
 check(DIRS.some(d=>p.startsWith(d+'/'))&&EXT.has(path.posix.extname(p).toLowerCase()),
  'outside closed source allowlist '+p);return true;
}
function rejectReleaseFlags(env){
 for(const key of ['SUD_D_REQUIRE_CLEAN_RELEASE','SUD_D_REQUIRE_UPDATE_PUBLIC_KEY',
  'SUD_D_REQUIRE_BUILD_REVISION'])check(env[key]!=='1','release-mode forbidden '+key);
 return true;
}
function fileIdentity(f){
 const s=fs.statSync(f,{bigint:true});
 check(s.isFile()&&s.ino!==0n&&s.dev!==0n,'FileID unavailable '+f);
 return {dev:s.dev.toString(),ino:s.ino.toString(),nlink:s.nlink.toString()};
}
const digest=entries=>sha(entries.map(e=>e.path+'\0'+e.sha256+'\0'+e.bytes).join('\n'));
function generateOwnerVite(original,contentDigest){
 check(typeof original==='string'&&/^[0-9a-f]{64}$/.test(contentDigest),
  'Vite input/digest invalid');
 const must=["import { execFileSync } from 'node:child_process';",
  "import { readFileSync } from 'node:fs';",
  "const __dirname = path.dirname(fileURLToPath(import.meta.url));",
  "function resolveBuildRevision(): string {","function resolveUpdatePublicKey(): string {",
  "const buildRevision = resolveBuildRevision();",
  "const updatePublicKeyPem = resolveUpdatePublicKey();",
  "// Resolve workspace packages from TypeScript source",
  "'git-worker': path.join(__dirname, 'electron/git-worker.ts')",
  "input: path.join(__dirname, 'electron/preload.ts')",
  "external: ['better-sqlite3', 'koffi']","external: ['electron']",
  "outDir: path.join(__dirname, 'dist-electron')",
  "outDir: path.join(__dirname, 'dist')",
  "path.join(__dirname, '../contracts/src/index.ts')"];
 for(const part of must)check(original.includes(part),'unrecognized Vite template '+part);
 check(original.split("outDir: path.join(__dirname, 'dist-electron')").length===3&&
  original.split("outDir: path.join(__dirname, 'dist')").length===2,
  'Vite output count drift');
 let content=original.replace(/import \{ execFileSync \} from 'node:child_process';\r?\n/,'')
  .replace(/import \{ readFileSync \} from 'node:fs';\r?\n/,'');
 const start="const __dirname = path.dirname(fileURLToPath(import.meta.url));";
 const end="// Resolve workspace packages from TypeScript source";
 const a=content.indexOf(start),b=content.indexOf(end);
 check(a>=0&&b>a&&content.indexOf(end,b+1)===-1,'unknown Vite function boundaries');
 const replacement=[
  start,
  "const repoRoot = path.join(__dirname, '../..');",
  "// Task-only immutable source identity; no child process or Git lookup.",
  "const ownerTestPinnedGitHead = '"+HEAD+"';",
  "const ownerTestSourceDigest = '"+contentDigest+"';",
  "for (const key of ['SUD_D_REQUIRE_CLEAN_RELEASE', 'SUD_D_REQUIRE_UPDATE_PUBLIC_KEY',",
  "  'SUD_D_REQUIRE_BUILD_REVISION'] as const) {",
  "  if (process.env[key] === '1') throw new Error('Release mode forbidden in owner-test candidate: ' + key);",
  "}",
  "const buildRevision = ownerTestPinnedGitHead;",
  "const updatePublicKeyPem = '';",
  "void repoRoot;",
  "void ownerTestSourceDigest;",
  "", ""
 ].join('\n');
 content=content.slice(0,a)+replacement+content.slice(b);
 check(!content.includes('execFileSync')&&!content.includes('node:child_process')&&
  !content.includes('readFileSync')&&!content.includes('process.exit')&&
  content.includes(HEAD)&&content.includes(contentDigest),'generated Vite unsafe');
 check(content.includes("external: ['better-sqlite3', 'koffi']")&&
  content.includes("external: ['electron']"),'Vite native externals lost');
 return content;
}
const STAGE_MANIFEST_SHA='4da18d2e04b254992d02f941e7de0fdfa3eb505e6563627a100ced782f34a615';
const STAGE=path.join(os.tmpdir(),'sudd-b1b-g2b-isolated-stage-20261015');
const STAGE_MANIFEST=path.join(STAGE,'stage-manifest.json');
const BEFORE_STATUS='1704c91cf238f09b729e73647cd81b63a73f20f66e3f8e085b6d0f96610e7f15';
function shaPath(p){return fs.existsSync(p)?sha(fs.readFileSync(p)):'ABSENT'}
function trustedTemp(){
 const expected=path.resolve(process.env.TEMP||os.tmpdir());
 check(expected.toLowerCase()===path.resolve(os.tmpdir()).toLowerCase(),'TEMP mismatch');
 check(path.basename(TEMP_ROOT)===TARGET_NAME&&
  path.dirname(TEMP_ROOT).toLowerCase()===expected.toLowerCase(),'owner root name mismatch');
 check(path.parse(expected).root.toLowerCase()===path.parse(ROOT).root.toLowerCase(),'different volumes');
 let p=expected;
 while(true){
  check(reparse(p).isDirectory(),'unsafe TEMP ancestor '+p);
  const parent=path.dirname(p);if(parent===p)break;p=parent;
 }
 assertAbsent(TEMP_ROOT);assertAbsent(repo(REPORT));
}
function scanSource(){
 const rows=[],seen=new Set();
 const take=rel=>{
  assertAllowedSource(rel);safeRelative(rel,seen);
  const source=repo(rel);
  assertRegular(reparse(source),source);
  const data=fs.readFileSync(source);
  rows.push({path:rel,bytes:data.length,sha256:sha(data),
   identity:fileIdentity(source),provenance:'CURRENT_WORKTREE_INCLUDING_UNTRACKED'});
 };
 for(const directory of DIRS){
  const dir=repo(directory);
  check(reparse(dir).isDirectory(),'missing source directory '+directory);
  const walk=(folder,rel)=>{
   for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
    const name=rel+'/'+entry.name;
    if(entry.isSymbolicLink())fail('source symlink '+name);
    if(entry.isDirectory()){
     if(EXCLUDED.has(entry.name)||entry.name.startsWith('.env')||
       entry.name.endsWith('.tsbuildinfo'))continue;
     check(reparse(path.join(folder,entry.name)).isDirectory(),'source junction '+name);
     walk(path.join(folder,entry.name),name);
    }else if(entry.isFile()){
     if(EXCLUDED.has(entry.name)||entry.name.startsWith('.env')||
       entry.name.endsWith('.tsbuildinfo'))continue;
     take(name);
    }else fail('source filesystem special file '+name);
   }
  };
  walk(dir,directory);
 }
 for(const item of FILES){
  check(fs.existsSync(repo(item)),'required config missing '+item);
  take(item);
 }
 rows.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 check(rows.length>=199,'source file count unexpectedly small '+rows.length);
 for(const p of ['packages/mcp-gateway/src/workspace-file-server-core.ts',
  'packages/desktop/src/index.html','packages/desktop/electron/main.ts'])
  check(rows.some(x=>x.path===p),'critical live Source missing '+p);
 return {records:rows,digest:digest(rows),count:rows.length,
  sourceCount:rows.filter(x=>DIRS.some(d=>x.path.startsWith(d+'/'))).length};
}
function preservedStage(){
 check(shaPath(STAGE_MANIFEST)===STAGE_MANIFEST_SHA,'G2b stage manifest drift');
 const obj=JSON.parse(fs.readFileSync(STAGE_MANIFEST,'utf8'));
 check(obj.publicationAllowed===false&&obj.sourceCount===128&&obj.outputCount===512&&
  Array.isArray(obj.files)&&obj.files.length===512,'G2b stage contract drift');
 for(const x of obj.files){
  const rel=safeRelative(x.path),p=path.join(STAGE,...rel);
  check(fs.statSync(p).size===x.bytes&&shaPath(p)===x.sha256,'G2b stage drift '+x.path);
  check(shaPath(repo(x.path))===x.before,'canonical old dist drift '+x.path);
 }
 for(const [p,h] of Object.entries(PROTECTED))
  check(shaPath(repo(p))===h,'R3/report drift '+p);
 return {stageCount:512,oldDestinationCount:512,protectedCount:Object.keys(PROTECTED).length};
}
function makeRecipe(d,count){
 return [
 '# OWNER-TEST-RECIPE — SUD_D Latest Source (STOP-GATED, INERT)',
 '',
 'STATUS: INPUTS PREPARED ONLY; BUILD_NOT_RUN; NATIVE/RUNTIME_NOT_RUN; LIVE SOLO UNREGISTERED; OWNER TEST DEFERRED.',
 '',
 'This document is a PLAN, not a runnable launcher. No commands here have been executed.',
 'This source-only workspace contains no installed node_modules, compiled artifacts, native binaries, credentials or running app.',
 'No release, installer, packaged app, signer, Owner Desktop Approval or B2 is authorized.',
 '',
 '## Immutable provenance and entry prerequisites',
 '- Git HEAD: '+HEAD+'; dirty/untracked latest actual files copied.',
 '- Source inventory digest: '+d+'; file count: '+count+'.',
 '- Verify source-inventory.json and every copied SHA-256/FileID before later use.',
 '- Canonical desktop Vite config is copied byte-identically; vite.owner-test.config.ts is separate.',
 '- All release required modes are explicitly rejected, not bypassed.',
 '',
 '## STOP Gate 1: new Owner-controlled executable authorization',
 'Require a new exact decision covering trusted installed Windows Node, Electron, TypeScript, Vite, esbuild',
 'and SQLite addon path/version/SHA/architecture/Electron ABI, execution times, logs, root and rollback.',
 'Confirm offline dependencies and separately approved writable paths. No external network, package install or hooks.',
 '',
 '## STOP Gate 2: independent offline dependency materialization',
 'Only with future explicit authorization: copy pinned dependency closure as regular independent file copies',
 'into this TEMP workspace; rebase package-manager links exclusively within it, without fallback to original',
 'node_modules or Desktop build. Verify file identity, each manifest, hashes, optional vendor exports.',
 'Missing dependency/native ABI/conditional export => STOP.',
 '',
 '## STOP Gate 3: future bounded copied-tool builds, NOT RUN in this mission',
 'Compile copied Domain, Contracts, Infrastructure, Application and Gateway with separately authorized',
 'copied installed TypeScript. Invoke separately authorized isolated owner Vite config in build mode',
 'for Electron main, git-worker, preload and renderer; preserve better-sqlite3 and koffi external.',
 'Verify all 3 build output directories stay in this copied root. Vite/esbuild execution is Native-gated.',
 'Never call original prepare-mcp-gateway-runtime.mjs, predev, package:win, electron-rebuild,',
 'production signer or root pnpm build. No original dist/release/Desktop build writes.',
 '',
 '## STOP Gate 4: separately authorized static built-artifact evidence',
 'Trace actual compiled stdio-entry -> real production wrapper -> latest G2b core, plus Desktop',
 'Activity/Approval sources, Resume, Policy, Audit and Workspaces through emitted module records;',
 'preserve approved identity/security gates and correlate built output hashes with the source digest.',
 'Confirm secure-tunnel-profile gateway target resolves to isolated ../../mcp-gateway/dist/stdio-entry.js',
 'and never canonical dist. Do not use soloExpertFake as production wiring.',
 'Production does not register Solo Expert: synthetic solo_expert.smoke is not a live-readiness proof.',
 '',
 '## STOP Gate 5: Owner Native/Product Desktop runtime approval ONLY LATER',
 'Demand a new exact real Owner consent and confinement plan: copied native addon identity/ABI,',
 'disposable APPDATA and LOCALAPPDATA, Electron userData, and product database/data-root isolation',
 'BEFORE startup. Redirecting Electron userData alone does not prevent real SQLite profile writes.',
 'Bound logs, network/provider DENY, credentials, timeouts, rollback and disposal without touching real user files.',
 'Real managed Serena, human Approval, B2/terminal and Solo readiness require separate permission.',
 '',
 'OWNER PERSONAL TEST: DEFERRED, NOT PASS. THIS SOURCE TREE IS NOT AN APPLICATION.',
 ''
 ].join('\n');
}
function createOwned(rel,data){
 const parts=safeRelative(rel),target=inside(TEMP_ROOT,path.resolve(TEMP_ROOT,...parts));
 let dir=TEMP_ROOT;
 for(const segment of parts.slice(0,-1)){
  dir=path.join(dir,segment);
  if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:false,mode:0o700});
  check(reparse(dir).isDirectory(),'unsafe destination ancestor '+dir);
 }
 assertAbsent(target);
 const fd=fs.openSync(target,'wx',0o600);
 try{fs.writeFileSync(fd,data);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 check(shaPath(target)===sha(data),'owned bytes drift '+rel);
 return {path:rel,sha256:sha(data),bytes:data.length,identity:fileIdentity(target)};
}
function verifySnapshot(source){
 for(const e of source.records){
  const absolute=repo(e.path);
  assertRegular(reparse(absolute),absolute);
  const bytes=fs.readFileSync(absolute);
  assertSourceHash(sha(bytes),e.sha256,e.path);
  check(bytes.length===e.bytes,'source byte length drift '+e.path);
  const id=fileIdentity(absolute);
  check(id.dev===e.identity.dev&&id.ino===e.identity.ino,'source FileID changed '+e.path);
 }
}
function validateVitePaths(generated,d){
 check(generated.includes(d)&&generated.includes(HEAD),'generated source stamp drift');
 const dirs=[...generated.matchAll(/outDir: path\.join\(__dirname, '([^']+)'\)/g)].map(m=>m[1]);
 check(dirs.length===3&&dirs[0]==='dist-electron'&&dirs[1]==='dist-electron'&&
  dirs[2]==='dist','Vite Electron/renderer output map unsafe');
 const desktop=path.join(TEMP_ROOT,'packages/desktop');
 for(const name of dirs)inside(TEMP_ROOT,path.resolve(desktop,name));
 for(const p of ['electron/main.ts','electron/git-worker.ts','electron/preload.ts',
  'src/index.html','../domain/src/index.ts','../contracts/src/index.ts',
  '../infrastructure/src/index.ts','../application/src/index.ts']){
  const dest=path.resolve(desktop,p);
  inside(TEMP_ROOT,dest);check(fs.existsSync(dest),'Vite entry/alias target missing '+p);
 }
 check(!/node:child_process|execFileSync|spawn\(/.test(generated),'Vite generated process invocation');
}
function preflight(){
 rejectReleaseFlags(process.env);trustedTemp();
 const files=scanSource(),stage=preservedStage();
 return {files,stage};
}
function inventoryGitHead(){
 const dotgit=repo('.git');
 const info=fs.statSync(dotgit);
 check(info.isDirectory(),'nonstandard .git cannot pin HEAD without Git execution');
 const txt=fs.readFileSync(path.join(dotgit,'HEAD'),'utf8').trim();
 let actual=txt;
 if(txt.startsWith('ref: ')){
  const name=txt.slice(5);
  check(name==='refs/heads/p0c-hyperv-spike','unexpected git branch '+name);
  const ref=path.join(dotgit,...safeRelative(name));
  if(fs.existsSync(ref))actual=fs.readFileSync(ref,'utf8').trim();
  else {
   const packed=fs.readFileSync(path.join(dotgit,'packed-refs'),'utf8');
   const entry=packed.split(/\r?\n/).find(x=>x.endsWith(' '+name));
   check(!!entry,'HEAD packed ref missing '+name);
   actual=entry.split(' ')[0];
  }
 }
 check(actual===HEAD,'Git source revision drift '+actual);
 return {ref:txt,head:actual};
}
function assertRecordedCopyIdentity(row,actual){
 const recorded=row&&row.identity;
 check(recorded&&typeof recorded==='object'&&actual&&typeof actual==='object',
  'missing copied FileID identity record');
 for(const field of ['dev','ino']){
  check(typeof recorded[field]==='string'&&/^[1-9][0-9]*$/.test(recorded[field])&&
   typeof actual[field]==='string'&&/^[1-9][0-9]*$/.test(actual[field])&&
   recorded[field]===actual[field], 'copy FileID '+field+' mismatch or unavailable');
 }
 check(recorded.nlink==='1'&&actual.nlink==='1',
  'copy is hardlinked or file link count invalid');
 return true;
}
function verifyCopied(inventory){
 const paths=new Set(),all=[];
 for(const row of inventory.copies){
  const parts=safeRelative(row.path,paths);
  const target=inside(TEMP_ROOT,path.resolve(TEMP_ROOT,...parts));
  assertRegular(reparse(target),target);
  const bytes=fs.readFileSync(target),id=fileIdentity(target);
  check(bytes.length===row.bytes&&sha(bytes)===row.sha256,'copy SHA/length mismatch '+row.path);
  assertRecordedCopyIdentity(row,id);
  if(row.source){
   const src=repo(row.source),sid=fileIdentity(src);
   assertIndependent(sid,id);
   check(shaPath(src)===row.sha256,'copy source content changed '+row.source);
  }
 }
 const walk=(folder,rel)=>{
  check(reparse(folder).isDirectory(),'destination junction '+rel);
  for(const ent of fs.readdirSync(folder,{withFileTypes:true})){
   const name=rel?rel+'/'+ent.name:ent.name;
   const file=path.join(folder,ent.name);
   check(!ent.isSymbolicLink(),'foreign link in owner tree '+name);
   if(ent.isDirectory())walk(file,name);
   else{assertRegular(reparse(file),file);all.push(name)}
  }
 };
 walk(TEMP_ROOT,'');
 const inventoryExists=fs.existsSync(path.join(TEMP_ROOT,'source-inventory.json'));
 check(all.length===inventory.copies.length+(inventoryExists?1:0),
  'unknown owner tree outputs '+all.length);
 for(const f of all)if(f!=='source-inventory.json')check(paths.has(f.toLowerCase()),
   'unexpected copied artifact '+f);
 check(inventory.copies.filter(x=>x.kind==='CURRENT_SOURCE').length===inventory.inputs.length,
   'source inventory vs copy count drift');
 return {allFiles:all.length,sourceCopies:inventory.inputs.length};
}
function buildInventory(source,copies,generated){
 const inventory={
  mission:'SUD_D G2b latest Desktop source-only Owner-Test workspace preparation',
  head:HEAD,branch:'p0c-hyperv-spike',
  sourceDigest:source.digest,sourceCount:source.count,sourceTreeCount:source.sourceCount,
  cwd:ROOT,ownerRoot:TEMP_ROOT,
  copiedSourceIncludesDirtyUntracked:true,
  status:'BUILD_NOT_RUN; NATIVE_RUNTIME_NOT_RUN; LIVE_SOLO_UNREGISTERED; OWNER_TEST_DEFERRED',
  preservedStageManifestSha256:STAGE_MANIFEST_SHA,
  outputPaths:['packages/desktop/dist-electron','packages/desktop/dist'],
  generatedOwnerConfig:'packages/desktop/vite.owner-test.config.ts',
  generatedOwnerConfigSha256:sha(Buffer.from(generated)),
  inputs:source.records,copies
 };
 return inventory;
}
function executePrepare(){
 let created=false,inventory=null,source=null,stage=null,problem=null,steps=[];
 try{
  const git=inventoryGitHead();steps.push('HEAD_BARE_READ_OK '+git.head);
  const p=preflight();source=p.files;stage=p.stage;steps.push('GATE_A_SOURCE_AND_STAGE_SHA_OK');
  // Gate B snapshots only current filesystem, not git archive/HEAD-only checkout.
  verifySnapshot(source);
  const template=fs.readFileSync(repo('packages/desktop/vite.config.ts'),'utf8');
  const config=generateOwnerVite(template,source.digest);
  // Generated config not yet written; absence/escape guard first.
  check(!fs.existsSync(TEMP_ROOT),'owner root appeared before creation');
  fs.mkdirSync(TEMP_ROOT,{recursive:false,mode:0o700});created=true;
  check(reparse(TEMP_ROOT).isDirectory(),'unexpected owner temp root identity');
  const copies=[];
  for(const r of source.records){
   const current=fs.readFileSync(repo(r.path));
   assertSourceHash(sha(current),r.sha256,r.path);
   check(current.length===r.bytes,'copy source size drift '+r.path);
   const dest=createOwned(r.path,current);
   assertIndependent(r.identity,dest.identity);
   copies.push({...dest,source:r.path,sourceIdentity:r.identity,kind:'CURRENT_SOURCE'});
  }
  steps.push('GATE_B_INDEPENDENT_SOURCE_COPY_COMPLETE '+copies.length);
  validateVitePaths(config,source.digest);
  const viteName='packages/desktop/vite.owner-test.config.ts';
  const vite=createOwned(viteName,Buffer.from(config,'utf8'));
  copies.push({...vite,source:null,kind:'GENERATED_TASK_VITE_CONFIG'});
  const recipeName='OWNER-TEST-RECIPE.md';
  const recipe=createOwned(recipeName,Buffer.from(makeRecipe(source.digest,source.count),'utf8'));
  copies.push({...recipe,source:null,kind:'GATED_FUTURE_OWNER_RECIPE'});
  steps.push('GATE_C_TASK_CONFIG_RECIPE_GENERATED');
  inventory=buildInventory(source,copies,config);
  const preview=verifyCopied(inventory);
  const manifestBytes=Buffer.from(JSON.stringify(inventory,null,2)+'\n','utf8');
  const mf=createOwned('source-inventory.json',manifestBytes);
  check(mf.identity.nlink==='1','inventory reused hardlink');
  steps.push('GATE_D_OWNED_COPY_AND_INVENTORY_SNAPSHOT_OK '+preview.allFiles);
  verifySnapshot(source);
  preservedStage();
  const now=inventoryGitHead();
  check(now.head===HEAD,'HEAD changed after work');
 }catch(e){problem=String(e.stack||e)}
 let state=problem?'PARTIAL/BLOCKED':'LATEST-SOURCE DESKTOP OWNER-TEST INPUTS PREPARED';
 const result={state,head:HEAD,sourceDigest:source?.digest||'NOT_VERIFIED',
  sourceCount:source?.count||0,sourceTreeCount:source?.sourceCount||0,
  created,root:TEMP_ROOT,inventorySha:shaPath(path.join(TEMP_ROOT,'source-inventory.json')),
  generatedConfigSha:shaPath(path.join(TEMP_ROOT,'packages/desktop/vite.owner-test.config.ts')),
  gatedRecipeSha:shaPath(path.join(TEMP_ROOT,'OWNER-TEST-RECIPE.md')),
  stage,steps,problem,inventory};
 const doc=reportContent(result);
 check(!fs.existsSync(repo(REPORT)),'Closeout already exists; never overwrite');
 fs.writeFileSync(repo(REPORT),doc,{encoding:'utf8',flag:'wx'});
 console.log('G2B_DESKTOP_OWNER_SOURCE_CLOSEOUT '+REPORT+' SHA '+shaPath(repo(REPORT)));
 console.log('G2B_DESKTOP_OWNER_SOURCE_STATUS '+state);
 console.log('G2B_DESKTOP_OWNER_SOURCE_INPUTS '+result.sourceCount+' INVENTORY '+result.inventorySha);
 if(problem){console.error('G2B_DESKTOP_OWNER_HARD_STOP '+problem.slice(0,900));process.exitCode=2}
}
function inspect(){
 const target=path.join(TEMP_ROOT,'source-inventory.json');
 check(fs.existsSync(target)&&!fs.lstatSync(target).isSymbolicLink(),
  'no completed inventory (owner root may be partial); do not resume');
 const j=JSON.parse(fs.readFileSync(target,'utf8'));
 check(j.head===HEAD&&j.sourceDigest===digest(j.inputs)&&j.sourceCount===j.inputs.length,
  'owner inventory content/digest drift');
 check(j.ownerRoot===TEMP_ROOT,'owner root identity changed');
 const inspected=verifyCopied(j);
 for(const input of j.inputs)
  check(shaPath(repo(input.path))===input.sha256,
   'source changed after copy '+input.path);
 preservedStage();
 inventoryGitHead();
 console.log('G2B_DESKTOP_OWNER_READONLY_INSPECT_PASS '+JSON.stringify({
  copied:inspected.allFiles,source:inspected.sourceCopies,
  digest:j.sourceDigest,inventorySha:shaPath(target),configSha:j.generatedOwnerConfigSha256
 }));
 return inspected;
}
function inspectSource(){
 const p=preflight(),git=inventoryGitHead();
 const list=p.files.records.map(x=>({path:x.path,sha256:x.sha256,bytes:x.bytes}));
 console.log('G2B_DESKTOP_OWNER_SOURCE_INSPECT_OK '+JSON.stringify({
  head:git.head,paths:p.files.count,sourceTree:p.files.sourceCount,
  digest:p.files.digest,stage:p.stage.stageCount,
  outputRootAbsent:!fs.existsSync(TEMP_ROOT),sample:list.slice(0,6)
 }));
}
function reportContent(d){
 const lines=[
 '# SUD_D G2b — Latest-source Desktop Owner-Test Workspace Preparation Closeout',
 '',
 '**Date:** 2026-10-15 | **Role:** Serena Implementation | **Mode:** CODE-ONLY',
 '**Final verdict:** '+d.state,
 '**Allowed output:** ONE repo test-only helper, ONE repo standalone test, ONE ignored Closeout, ONE fresh disposable TEMP root.',
 '**Outcome ceiling:** BUILD_NOT_RUN; NATIVE/RUNTIME_NOT_RUN; LIVE_SOLO_UNREGISTERED; OWNER_TEST_DEFERRED; CANONICAL_DIST/RELEASE_UNCHANGED.',
 '',
 '## Authority / Gate A',
 '- Binding assignment: docs/superpowers/plans/2026-10-15-solo-expert-g2b-latest-desktop-owner-build-serena-assignment.md',
 '- Advisor Design Acceptance: docs/superpowers/plans/2026-10-15-solo-expert-g2b-latest-desktop-owner-build-advisor-final-design-acceptance.md',
 '- Canonical project SUD_D, Git branch p0c-hyperv-spike, pinned HEAD '+HEAD+', initial staged 0.',
 '- Inherited dirty/untracked Git status 343 entries, SHA256 '+BEFORE_STATUS+' before creation of two new CJS files.',
 '- Selected repository skills .agents/skills/tdd/SKILL.md (security copy seam),',
 '  .agents/skills/codebase-design/SKILL.md (new CLI Interface),',
 '  .agents/skills/writing-for-agents/SKILL.md (inert future owner recipe).',
 '- Root: '+d.root+'. Fresh task-only TEMP root: '+d.created,
 '',
 '## Gate A–D outcomes',
 ...d.steps.map(x=>'- '+x),
 '- Source inventory count: '+d.sourceCount+'; source tree count: '+d.sourceTreeCount,
 '- Current source hash digest: '+d.sourceDigest,
 '- Copied source metadata / identity, including previously dirty or untracked files, recorded in source-inventory.json.',
 '- Frozen accepted staged G2b manifest SHA256 '+STAGE_MANIFEST_SHA+
   '; prior 512 staged candidates and original 512 dist states checked read-only.',
 '- All existing 4 protected R3 Contracts and prior accepted G2b Closeouts checked unchanged.',
 '- Temp owner source inventory SHA256 '+d.inventorySha,
 '- Temp generated Vite config SHA256 '+d.generatedConfigSha,
 '- Temp gated Owner recipe SHA256 '+d.gatedRecipeSha,
 '- Native externals better-sqlite3 and koffi preserved in task-generated config.',
 '- Package source aliases, main/git-worker/preload/renderer paths and all three dist output references remain under TEMP root only.',
 '- Generated Vite config stamps pinned HEAD and dirty source digest; release-mode-required environment options explicitly rejected.',
 '- No production soloExpertFake wiring. Live Solo Expert remains UNREGISTERED in real production composition.',
 '',
 '## Exact per-file SHA256 and FileID inventory',
 '| Temporary relative file | Original current Source | SHA256 | Bytes | Device | Inode | nlink |',
 '|---|---|---|---:|---|---|---|',
 ...(d.inventory?.copies||[]).map(x=>'| '+x.path+' | '+(x.source||'TASK_GENERATED')+
  ' | '+x.sha256+' | '+x.bytes+' | '+x.identity.dev+' | '+x.identity.ino+
  ' | '+x.identity.nlink+' |'),
 '',
 '## Status and STOP limitations',
 d.problem?'**HARD STOP:** '+d.problem:'No blocker within SOURCE-COPY scope; NO executable/build/native evidence has been produced.',
 'No Vite/esbuild/TypeScript compiler CLI, Electron, SQLite, Gateway, Managed Serena, B2, network, installer or signer run.',
 'No Desktop Owner manual test claimed. User profile data, APPDATA/LOCALAPPDATA, credentials, Desktop Build, dist-release and canonical dist remain out of scope.',
 'The generated OWNER-TEST-RECIPE.md is a STOP-GATED PLAN requiring separate physical executable and later runtime consent.',
 'Git stage/commit/clean/reset/checkout untouched. Postflight node --check, focused tests, read-only --inspect and git diff --check to be independently recorded.',
 '',
 '**FINAL: '+(d.problem?
 'PARTIAL/BLOCKED; CANONICAL_DIST/RELEASE_UNCHANGED; BUILD_NOT_RUN; NATIVE/RUNTIME_NOT_RUN; LIVE_SOLO_UNREGISTERED; OWNER_TEST_DEFERRED.':
 'LATEST-SOURCE DESKTOP OWNER-TEST INPUTS PREPARED; BUILD_NOT_RUN; NATIVE/RUNTIME_NOT_RUN; LIVE_SOLO_UNREGISTERED; OWNER_TEST_DEFERRED; CANONICAL_DIST/RELEASE_UNCHANGED.')+'**',''
 ];
 return lines.join('\n');
}
if(require.main===module){
 check(process.argv.length===3&&
  ['--inspect-source','--prepare','--inspect'].includes(process.argv[2]),
  'explicit --inspect-source / --prepare / --inspect required; no default mutations');
 if(process.argv[2]==='--inspect-source')inspectSource();
 else if(process.argv[2]==='--prepare')executePrepare();
 else inspect();
}
module.exports={safeRelative,inside,assertAbsent,assertRegular,assertIndependent,
 assertSourceHash,generateOwnerVite,rejectReleaseFlags,assertAllowedSource,
 assertRecordedCopyIdentity};
