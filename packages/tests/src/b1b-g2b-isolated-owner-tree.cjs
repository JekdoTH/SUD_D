'use strict';
// Test-only isolated owner copy. Node builtins and TypeScript Compiler API ONLY.
// Never load SUD_D, vendor code, native addons, child workers, product runtime or network.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const ts=require('typescript');
const ROOT=path.resolve(__dirname,'../../..');
const STAGE=path.join(os.tmpdir(),'sudd-b1b-g2b-isolated-stage-20261015');
const TREE=path.join(os.tmpdir(),'sudd-b1b-g2b-owner-tree-20261015');
const REPORT='.serena/reports/solo-expert-b1b-g2b-isolated-owner-tree-closeout-20261015.md';
const STAGE_REPORT='.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md';
const MFILE=path.join(STAGE,'stage-manifest.json');
const EXPECT_MANIFEST='4da18d2e04b254992d02f941e7de0fdfa3eb505e6563627a100ced782f34a615';
const EXPECT_HEAD='7e4c54687f363b2abe6bd34ff71afb4d1a211299';
const PACKAGES=['domain','infrastructure','application','mcp-gateway'];
const COUNTS={domain:76,infrastructure:284,application:120,'mcp-gateway':32};
const EXTERNAL=[
 ['@modelcontextprotocol/server','2.0.0','packages/mcp-gateway/node_modules/@modelcontextprotocol/server'],
 ['@modelcontextprotocol/core','2.0.0','node_modules/.pnpm/@modelcontextprotocol+server@2.0.0/node_modules/@modelcontextprotocol/core'],
 ['zod','4.5.4','packages/mcp-gateway/node_modules/zod'],
 ['@types/better-sqlite3','7.6.13','packages/infrastructure/node_modules/@types/better-sqlite3'],
 ['@types/node','24.13.3','packages/mcp-gateway/node_modules/@types/node'],
 ['undici-types','7.18.2','node_modules/.pnpm/@types+node@24.13.3/node_modules/undici-types']
];
const PROTECTED={
 '.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md':'7c74dfab049895ae5ed2dc8eb5d647165d48df31ed5d2525b46f23e9553570cd',
 '.serena/reports/solo-expert-b1b-g2b-publication-plan-closeout-20261015.md':'18b244f8645064d64742cb9cdf9e9ba4885f4e6a8c1108ee1479c16850679300',
 '.serena/reports/solo-expert-b1b-g2b-isolated-stage-closeout-20261015.md':'619f6e03b516ae979aa11363812eaa3b0ef1be3afee86d610d154d9171f4b016',
 '.serena/reports/solo-expert-b1b-g2b-local-dist-promotion-closeout-20261015.md':'236255718320e20ad97c8663a09beb3b0b527474d1ad8d21d18b54a460df6e68',
 'packages/contracts/dist/index.js':'a5eed5c47e059b2badb69c440c268f8d60600ae78051173e22b2f1640b156d9f',
 'packages/contracts/dist/index.js.map':'98010edf9fd2d794c3c6bc00690b7f136310d01b573750aa7dbc422a5b45d52c',
 'packages/contracts/dist/index.d.ts':'fe52a1339a98ca692a52b857be4bbbb91e720b7cc780421aeaaeba3c23006f4c',
 'packages/contracts/dist/index.d.ts.map':'7fe93993ef2807b3422c8c2ac79001472e0f8c836f94a6e8c32c26d3dcd2dde6'
};
// last hash replaced below after independent verification if typo; never silently refresh evidence.
const fail=x=>{throw Error('OWNER_TREE_FAIL_CLOSED '+x)};
const check=(v,x)=>{if(!v)fail(x)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=p=>path.resolve(ROOT,p);
const stable=(p)=>path.relative(ROOT,path.resolve(p)).replace(/\\/g,'/');
const under=(f,d)=>{const r=path.relative(d,f);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
const fingerprint=p=>fs.existsSync(p)?sha(fs.readFileSync(p)):'ABSENT';
const saved=p=>fingerprint(root(p));
const sameId=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.ino!==0n;
const fileId=(p)=>{
 const s=fs.statSync(p,{bigint:true});check(s.isFile(),'not ordinary file '+p);
 check(s.ino!==0n&&s.dev!==0n,'identity unavailable '+p);
 return {dev:s.dev.toString(),ino:s.ino.toString(),nlink:s.nlink.toString()};
};
const identitiesEqual=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const reparse=p=>{const s=fs.lstatSync(p);return s.isSymbolicLink()||
    (typeof s.mode==='number'&&false)||
    (!!s.fileAttributes&&Boolean(s.fileAttributes&0x400));};
function safeRel(v,seen){
 check(typeof v==='string'&&v.length>0&&!path.isAbsolute(v)&&!v.includes('\\')&&
  !v.includes(':')&&!v.includes('\0')&&!/[\u0000-\u001f]/.test(v),'bad path/ADS '+v);
 const parts=v.split('/');
 check(parts.every(x=>x&&x!=='.'&&x!=='..'&&x.trim()===x)&&
  !parts.some(x=>x.endsWith('.')||x.endsWith(' ')),'traversal or win32 alias '+v);
 const lowered=v.normalize('NFC').toLowerCase();
 if(seen){check(!seen.has(lowered),'case collision / duplicated path '+v);seen.add(lowered)}
 return parts;
}
function assertTrustedTemp(){
 const real=fs.realpathSync.native(os.tmpdir()),environment=process.env.TEMP?path.resolve(process.env.TEMP):real;
 check(real.toLowerCase()===environment.toLowerCase(),'TEMP disagrees with OS');
 check(path.parse(real).root.toLowerCase()===path.parse(ROOT).root.toLowerCase(),'different Windows volume');
 let p=real;
 while(true){
  check(!reparse(p),'TEMP reparse ancestor '+p);
  const st=fs.statSync(p);check(st.isDirectory(),'TEMP ancestor not directory');
  const parent=path.dirname(p);if(parent===p)break;p=parent;
 }
 check(path.basename(TREE)==='sudd-b1b-g2b-owner-tree-20261015'&&
  path.dirname(TREE).toLowerCase()===real.toLowerCase(),'TEMP root unexpected');
 return real;
}
function requireAbsent(){
 check(!fs.existsSync(TREE)&&!fs.existsSync(root(REPORT)),'prior owner tree/Closeout exists; inspect only');
}
function sectionPairs(lines,header,stop){
 const start=lines.findIndex(x=>x.startsWith(header));
 check(start>=0,'missing accepted report section '+header);
 const end=lines.findIndex((x,i)=>i>start&&x.startsWith(stop));
 check(end>start,'missing next section '+stop);
 const out=new Map();
 for(const line of lines.slice(start+1,end)){
  const m=/^- (\S+) SHA-256 ([0-9a-f]{64})$/.exec(line);
  if(m){check(!out.has(m[1]),'duplicated accepted freeze '+m[1]);out.set(m[1],m[2])}
 }
 return out;
}
function freezeInputs(){
 const closeout=fs.readFileSync(root(STAGE_REPORT),'utf8').split(/\r?\n/);
 const source=sectionPairs(closeout,'### All accepted Source/Test/Metadata fingerprints',
   '### All prior 641 read-set SHA-256 fingerprints');
 const prior=sectionPairs(closeout,'### All prior 641 read-set SHA-256 fingerprints',
   '### Additional CompilerHost observed current input fingerprints');
 const latest=sectionPairs(closeout,'### Additional CompilerHost observed current input fingerprints',
   '### Protected original report, installed toolchain, nested Node typings and Contracts');
 check(source.size===16&&prior.size===641&&latest.size===637,
  'frozen source/input counts '+[source.size,prior.size,latest.size]);
 const frozen=new Map([...source,...prior,...latest,...Object.entries(PROTECTED)]);
 const changes=[];
 for(const [p,d]of frozen)if(saved(p)!==d)changes.push(p);
 check(changes.length===0,'accepted source/input/protected drift '+changes.slice(0,7).join(','));
 return {source,prior,latest,frozen};
}
function stageManifest(){
 check(fingerprint(MFILE)===EXPECT_MANIFEST,'stage manifest hash drift');
 const j=JSON.parse(fs.readFileSync(MFILE,'utf8'));
 check(j.publicationAllowed===false&&j.sourceCount===128&&
  j.outputCount===512&&Array.isArray(j.files)&&j.files.length===512,'stage manifest contract drift');
 const seen=new Set(),counts={domain:0,infrastructure:0,application:0,'mcp-gateway':0};
 let outputs=0;
 for(const r of j.files){
  const parts=safeRel(r.path,seen);
  check(parts[0]==='packages'&&PACKAGES.includes(parts[1])&&parts[2]==='dist'&&parts.length>=4,
    'output not in exact project package '+r.path);
  check(typeof r.sha256==='string'&&/^[0-9a-f]{64}$/.test(r.sha256)&&
    (r.before==='ABSENT'||/^[0-9a-f]{64}$/.test(r.before))&&
    Number.isSafeInteger(r.bytes)&&r.bytes>=0,'bad stage row '+r.path);
  const staged=path.join(STAGE,...parts);
  const b=fs.readFileSync(staged);
  check(b.length===r.bytes&&sha(b)===r.sha256,'stage SHA/size drift '+r.path);
  check(saved(r.path)===r.before,'original dist preimage drift '+r.path);
  counts[parts[1]]++;outputs+=b.length;
 }
 check(PACKAGES.every(p=>counts[p]===COUNTS[p]),'per-package 512 count drift');
 check(outputs===2583674,'stage byte count drift '+outputs);
 return {manifest:j,counts,bytes:outputs};
}
function immutable(){
 assertTrustedTemp();requireAbsent();
 const freeze=freezeInputs(),staged=stageManifest();
 check(fingerprint(MFILE)===EXPECT_MANIFEST,'manifest drift after scan');
 return {...freeze,...staged};
}
function copySpec(plan,dest,src,expected,tag){
 const parts=safeRel(dest,plan.keys);
 const filename=path.resolve(TREE,...parts);
 check(under(filename,TREE),'owner tree target escape '+dest);
 const st=fs.lstatSync(src);
 check(st.isFile()&&!st.isSymbolicLink()&&!reparse(src),'source not ordinary '+src);
 const bytes=fs.readFileSync(src);
 check(bytes.length<=160*1024*1024,'individual source byte cap');
 const hash=sha(bytes);
 if(expected)check(hash===expected,'unexpected source SHA '+src);
 plan.files.push({path:dest,source:src,sha256:hash,bytes:bytes.length,tag,sourceId:fileId(src)});
 return bytes;
}
function inspectVendorRoots(){
 const out=[],limits={files:0,bytes:0};
 for(const [name,version,provided] of EXTERNAL){
  const linked=root(provided);
  check(fs.existsSync(linked),'missing exact vendor '+name);
  const base=fs.realpathSync.native(linked);
  check(under(base,root('node_modules/.pnpm')),'vendor realpath outside pnpm store '+name);
  const json=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8'));
  check(json.name===name&&json.version===version,'vendor version mismatch '+name);
  const files=[],seen=new Set();
  const scan=(directory,relative)=>{
   const st=fs.lstatSync(directory);
   check(st.isDirectory()&&!reparse(directory),'vendor reparse directory '+directory);
   for(const ent of fs.readdirSync(directory,{withFileTypes:true})){
    check(ent.name!=='node_modules','vendor nested node_modules not in payload '+directory);
    const relativeName=relative?relative+'/'+ent.name:ent.name;
    const parts=safeRel(relativeName);
    const file=path.join(directory,ent.name);
    check(!ent.isSymbolicLink()&&!reparse(file),'vendor symlink/reparse '+file);
    if(ent.isDirectory())scan(file,relativeName);
    else {
     check(ent.isFile()&&!relativeName.endsWith('.node'),'vendor nonregular/native '+file);
     const meta=fs.statSync(file);
     safeRel('node_modules/'+name+'/'+relativeName,seen);
     limits.files++;limits.bytes+=meta.size;
     check(limits.files<=8000&&limits.bytes<=160*1024*1024,'vendor cap exceeded');
     files.push({relative:relativeName,source:file,size:meta.size,sha256:fingerprint(file)});
    }
   }
  };
  scan(base,'');
  check(files.some(x=>x.relative==='package.json'),'vendor package manifest absent '+name);
  out.push({name,version,base,files,manifestSha:fingerprint(path.join(base,'package.json'))});
 }
 return {roots:out,limits};
}

function checks(){
 let n=0;const yes=(x,b)=>{check(!!b,'selftest '+x);n++};
 const denied=(name,fn)=>{let stopped=false;try{fn()}catch{stopped=true};yes(name,stopped)};
 yes('expected empty new owner root',!fs.existsSync(TREE));
 yes('one-use report absent',!fs.existsSync(root(REPORT)));
 yes('trusted exact TEMP',assertTrustedTemp()===fs.realpathSync.native(os.tmpdir()));
 const set=new Set();safeRel('node_modules/@sud-d/domain/dist/index.js',set);
 denied('canonical root path escape',()=>safeRel('node_modules/../../packages/domain/dist/index.js'));
 denied('ADS escape',()=>safeRel('node_modules/@sud-d/domain/dist/index.js:stream'));
 denied('Windows backslash escape',()=>safeRel('node_modules\\@sud-d\\domain'));
 denied('case-fold output collision',()=>safeRel('NODE_MODULES/@sud-d/DOMAIN/DIST/INDEX.JS',set));
 denied('unsafe null or empty segments',()=>safeRel('node_modules//@sud-d/domain'));
 denied('stale stage SHA',()=>check(sha(Buffer.from('wrong'))===EXPECT_MANIFEST,'stale hash'));
 denied('unknown external package',()=>validateVendorName('eventsource'));
 denied('wrong independent identity',()=>independentIdentity({dev:'1',ino:'5',nlink:'1'},{dev:'1',ino:'5',nlink:'1'}));
 denied('hardlinked copied dest',()=>independentIdentity({dev:'1',ino:'5',nlink:'2'},{dev:'1',ino:'7',nlink:'2'}));
 denied('synthetic source reparse',()=>check(!fakeReparse({isSymbolicLink:()=>true,fileAttributes:0}), 'reparse'));
 denied('single owner root reusage',()=>check(!fs.existsSync(ROOT),'unexpected existing tree'));
 console.log('G2B_OWNER_TREE_SELFTEST_PASS '+n+' inert negative/boundary assertions; zero writes');
 return n;
}
function validateVendorName(s){
 check(EXTERNAL.some(row=>row[0]===s),'unknown vendor package '+s);return s;
}
function independentIdentity(src,dst){
 check(src.dev!==dst.dev||src.ino!==dst.ino,'copied output still hardlinked to source');
 check(dst.ino!=='0'&&dst.dev!=='0'&&dst.nlink==='1','destination inode unavailable or hardlinked');return true;
}
function fakeReparse(stat){
 return stat.isSymbolicLink()||Boolean(stat.fileAttributes&&stat.fileAttributes&0x400);
}
function freshFile(dest,buffer){
 const fd=fs.openSync(dest,'wx',0o600);
 try{fs.writeFileSync(fd,buffer);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 check(sha(fs.readFileSync(dest))===sha(buffer),'exclusive written bytes changed '+dest);
}
function ensureOwnedPath(rel){
 const parts=safeRel(rel);
 let parent=TREE;
 for(const p of parts.slice(0,-1)){
  parent=path.join(parent,p);
  if(!fs.existsSync(parent))fs.mkdirSync(parent,{recursive:false,mode:0o700});
  check(fs.lstatSync(parent).isDirectory()&&!reparse(parent),'unsafe destination ancestor '+parent);
 }
 return path.join(TREE,...parts);
}
function fixtureId(file){
 const s=fs.statSync(file,{bigint:true});
 check(s.ino!==0n&&s.dev!==0n&&s.isFile(),'no fixture file identity '+file);
 return {dev:s.dev.toString(),ino:s.ino.toString(),nlink:s.nlink.toString(),hash:fingerprint(file)};
}
function fixtureEqual(a,b,why){
 check(a.dev===b.dev&&a.ino===b.ino&&a.hash===b.hash,why);
}
function runFixture(log){
 const dir=path.join(TREE,'fixture'),notes=[],H0=Buffer.from('SUD-D G2b H0 immutable fixture bytes'),
 H1=Buffer.from('SUD-D G2b H1 replacement bytes'),H2=Buffer.from('SUD-D G2b foreign injected bytes');
 fs.mkdirSync(dir,{mode:0o700});
 const p=x=>path.join(dir,x);
 const canonical=p('canonical'),fa=p('foreign-a'),fb=p('foreign-b'),backup=p('backup-alias'),replacement=p('replacement');
 const noted=(name,detail)=>{notes.push({name,...detail});log({fixture:name,...detail})};
 freshFile(canonical,H0);fs.linkSync(canonical,fa);fs.linkSync(canonical,fb);
 const old=fixtureId(canonical);
 check(old.nlink==='3'&&old.hash===sha(H0),'fixture H0 not triple hardlinked');
 fixtureEqual(old,fixtureId(fa),'foreign-a identity mismatch');
 fixtureEqual(old,fixtureId(fb),'foreign-b identity mismatch');
 fs.linkSync(canonical,backup);
 check(fixtureId(canonical).nlink==='4','fixture backup hardlink count');
 freshFile(replacement,H1);const newer=fixtureId(replacement);
 check(!identitiesEqual(old,newer)&&newer.nlink==='1','new H1 inode not independent');
 noted('three genuine NTFS hardlinks and backup', {status:'PASS',oldIdentity:old,newIdentity:newer});
 try{
  fs.renameSync(replacement,canonical);
  const current=fixtureId(canonical),otherA=fixtureId(fa),otherB=fixtureId(fb);
  check(current.hash===sha(H1)&&identitiesEqual(newer,current)&&current.nlink==='1',
    'NTFS rename canonical H1/inode failure');
  fixtureEqual(old,otherA,'foreign-a H0 violated');
  fixtureEqual(old,otherB,'foreign-b H0 violated');
  check(otherA.nlink==='3'&&otherB.nlink==='3','old alias object nlink count unexpected');
  noted('rename over hardlinked fixture canonical',{status:'PASS',canonical:current,aliases:[otherA,otherB]});
  // Rollback uses task-owned backup name, but only with exact target identity.
  check(identitiesEqual(current,fixtureId(canonical)),'rollback preimage identity changed');
  fs.renameSync(backup,canonical);
  const rolled=fixtureId(canonical);
  fixtureEqual(old,rolled,'rollback failed to restore H0 FileID');
  check(rolled.nlink==='3','rollback H0 link count not three');
  noted('fixture-only rollback',{status:'PASS',rolled});
 }catch(e){
  noted('rename/rollback fixture',{status:'FAIL',reason:String(e).slice(0,380)});
  // Do not remove or retry any path: fixture status must remain observable.
  return {status:'PARTIAL/BLOCKED',tests:notes};
 }
 // Hold a read-only handle to old object while attempting a second independent rename.
 const oldStill=fixtureId(canonical),handle=fs.openSync(canonical,'r');
 const heldName=p('held-replacement');freshFile(heldName,H1);const heldNew=fixtureId(heldName);
 try{
  fs.renameSync(heldName,canonical);
  const current=fixtureId(canonical),alias=fixtureId(fa),viaHandle=fs.fstatSync(handle,{bigint:true});
  check(identitiesEqual(current,heldNew)&&current.hash===sha(H1),'held-handle canonical not replaced');
  check(alias.hash===sha(H0)&&identitiesEqual(alias,oldStill),'held-handle foreign mutated');
  check(viaHandle.ino.toString()===oldStill.ino&&viaHandle.dev.toString()===oldStill.dev,
   'held read handle FileID moved');
  const heldBuf=Buffer.alloc(H0.length);fs.readSync(handle,heldBuf,0,H0.length,0);
  check(sha(heldBuf)===sha(H0),'held reader H0 bytes changed');
  noted('read-only old handle during replacement',{status:'PASS',heldId:oldStill,newId:current});
  // Can roll back only when current still precisely matches task-owned H1 bytes + identity.
  const taskBackup=p('second-backup');
  fs.linkSync(fa,taskBackup);
  check(identitiesEqual(current,fixtureId(canonical)),'held rollback foreign identity');
  fs.renameSync(taskBackup,canonical);
  fixtureEqual(oldStill,fixtureId(canonical),'held rollback alias identity');
  noted('held fixture rollback',{status:'PASS'});
 }catch(e){
  noted('held-handle fixture',{status:'UNSUPPORTED',reason:String(e).slice(0,380)});
 }finally{fs.closeSync(handle)}
 // Independent same-byte foreign writer: SHA alone cannot prove inode ownership.
 const currentBefore=fixtureId(canonical),same=p('same-bytes-foreign');
 freshFile(same,Buffer.from(fs.readFileSync(canonical)));const injected=fixtureId(same);
 check(injected.hash===currentBefore.hash&&!identitiesEqual(injected,currentBefore),
  'foreign identical-hash different-inode fixture failed');
 fs.renameSync(same,canonical);
 const actual=fixtureId(canonical);
 let refused=false;
 try{check(identitiesEqual(currentBefore,actual),'foreign same-SHA writer replaced target')}catch{refused=true}
 check(refused,'foreign same-SHA writer was not refused');
 noted('same-SHA different-file-ID foreign rollback refusal',{status:'PASS',before:currentBefore,foreign:actual});
 // Race between last precheck and rename: no CAS binding to the identity.
 const raceReplacement=p('would-be-new'),raceForeign=p('race-foreign');
 freshFile(raceReplacement,H1);freshFile(raceForeign,H2);
 const expected=fixtureId(canonical);
 check(identitiesEqual(expected,fixtureId(canonical)),'fixture last precheck changed');
 fs.renameSync(raceForeign,canonical);
 let raceRefused=false;
 try{check(identitiesEqual(expected,fixtureId(canonical)),'foreign writer raced after precheck')}catch{raceRefused=true}
 check(raceRefused,'post-precheck race not detected');
 noted('foreign writer after final check demonstrates missing atomic FileID CAS',
  {status:'PASS_DID_NOT_OVERWRITE_FOREIGN',precheck:expected,race:fixtureId(canonical)});
 // Test-owned aliases remain inside fixture only, and are never original repository links.
 return {status:'PASS_INFORMATIONAL_NOT_AUTHORITY',tests:notes};
}
function beginJournal(){
 const file=path.join(TREE,'journal.jsonl'),fd=fs.openSync(file,'wx',0o600);
 const append=event=>{
  fs.writeSync(fd,Buffer.from(JSON.stringify({timestamp:'2026-10-15',...event})+'\n'));
  fs.fsyncSync(fd);
 };
 append({kind:'BEGIN',owner:'sudd-b1b-g2b-owner-tree-20261015'});
 return {file,append,close:()=>fs.closeSync(fd)};
}
function copyOwned(dest,src,expected,tag,plan,log){
 const bytes=copySpec(plan,dest,src,expected,tag);
 const target=ensureOwnedPath(dest);
 check(!fs.existsSync(target),'destination already exists '+dest);
 log({kind:'COPY_INTENT',dest,expected:sha(bytes)});
 freshFile(target,bytes);
 const own=fileId(target),from=fileId(src);
 independentIdentity(from,own);
 check(!reparse(target),'copied target reparse '+dest);
 const entry=plan.files[plan.files.length-1];
 entry.identity=own;
 check(fingerprint(target)===entry.sha256,'copy verify failed '+dest);
 log({kind:'COPIED',dest,sha256:entry.sha256,bytes:entry.bytes,identity:own});
 return entry;
}
function assemble(){
 const trust=immutable();
 const vendors=inspectVendorRoots();
 check(!fs.existsSync(TREE),'tree appeared during Gate 0');
 fs.mkdirSync(TREE,{recursive:false,mode:0o700});
 check(!reparse(TREE)&&fs.statSync(TREE).isDirectory(),'owned temp root not ordinary');
 const journal=beginJournal();
 const notes={fixture:null,copyCounts:{},vendor:vendors.roots.map(v=>({
  name:v.name,version:v.version,root:v.base,files:v.files.length,manifestSha:v.manifestSha
 }))};
 const plan={keys:new Set(['journal.jsonl']),files:[]};
 try{
  notes.fixture=runFixture(journal.append);
  const minimal=Buffer.from(JSON.stringify({name:'sudd-b1b-g2b-owner-candidate',private:true,type:'module'},null,2)+'\n');
  // Task-only root package, no scripts/hooks, no product runtime.
  const rootPkg='package.json',rootPath=ensureOwnedPath(rootPkg);
  safeRel(rootPkg,plan.keys);journal.append({kind:'COPY_INTENT',dest:rootPkg});
  freshFile(rootPath,minimal);
  plan.files.push({path:rootPkg,source:'TASK_ONLY_MINIMAL_ROOT',sha256:sha(minimal),
   bytes:minimal.length,tag:'root',identity:fileId(rootPath)});
  journal.append({kind:'COPIED',dest:rootPkg,sha256:sha(minimal)});
  const expected=trust.manifest.files,totals={domain:0,infrastructure:0,application:0,'mcp-gateway':0};
  for(const r of expected){
   const parts=safeRel(r.path),pkg=parts[1],tail=parts.slice(2);
   const dest='node_modules/@sud-d/'+pkg+'/'+tail.join('/');
   const src=path.join(STAGE,...parts);
   check(fs.statSync(src).size===r.bytes&&fingerprint(src)===r.sha256,
    'frozen source artifact changed just before copy '+r.path);
   copyOwned(dest,src,r.sha256,'stage-compiled',plan,journal.append);
   totals[pkg]++;
  }
  for(const pkg of PACKAGES){
   check(totals[pkg]===COUNTS[pkg],'copied package stage count '+pkg);
   const src=root('packages/'+pkg+'/package.json');
   copyOwned('node_modules/@sud-d/'+pkg+'/package.json',src,fingerprint(src),
    'exact-package-manifest',plan,journal.append);
  }
  const cp=root('packages/contracts/package.json');
  copyOwned('node_modules/@sud-d/contracts/package.json',cp,fingerprint(cp),
   'protected-contracts-manifest',plan,journal.append);
  for(const file of ['index.js','index.js.map','index.d.ts','index.d.ts.map']){
   const source='packages/contracts/dist/'+file;
   copyOwned('node_modules/@sud-d/contracts/dist/'+file,root(source),
    PROTECTED[source],'protected-R3',plan,journal.append);
  }
  for(const v of vendors.roots){
   notes.copyCounts[v.name]=0;
   for(const f of v.files){
    check(fingerprint(f.source)===f.sha256&&fs.statSync(f.source).size===f.size,
      'source vendor changed '+f.source);
    copyOwned('node_modules/'+v.name+'/'+f.relative,f.source,f.sha256,
     'vendor-'+v.name,plan,journal.append);
    notes.copyCounts[v.name]++;
   }
  }
  check(plan.files.length===512+4+5+vendors.limits.files+1,
   'independent copy inventory incorrect '+plan.files.length);
  journal.append({kind:'ALL_COPIES_COMPLETE',copyCount:plan.files.length});
  // No fallback to original node_modules: structural/static validation is next.
  const inspection=validateTree(plan,trust,vendors,notes);
  notes.inspection=inspection;
  const inventory={
   mission:'G2b hardlink-safe isolated owner candidate, copy-only',
   manifestSha256:EXPECT_MANIFEST,sourceModules:128,stageOutputs:512,
   ownerTree:TREE,publicationAllowed:false,runtimeVerified:false,
   copiedFiles:plan.files.length,copyCounts:notes.copyCounts,
   fixture:notes.fixture,vendorLimit:vendors.limits,inspection,
   files:plan.files
  };
  const inventoryBytes=Buffer.from(JSON.stringify(inventory,null,2)+'\n');
  safeRel('inventory.json',plan.keys);
  journal.append({kind:'INVENTORY_INTENT',bytes:inventoryBytes.length});
  freshFile(ensureOwnedPath('inventory.json'),inventoryBytes);
  const inventorySha=sha(inventoryBytes);
  journal.append({kind:'SUCCESS',inventorySha,copyCount:plan.files.length});
  return {trust,vendors,notes,plan,inspection,inventorySha,inventoryBytes:inventoryBytes.length,
   status:inspection.blocked.length?'PARTIAL/BLOCKED':'CANDIDATE_STATIC_VERIFIED'};
 }finally{journal.close()}
}

function originPackage(file){
 const r=path.relative(path.join(TREE,'node_modules'),file).replace(/\\/g,'/');
 const parts=r.split('/');
 const pkg=parts[0].startsWith('@')?parts.slice(0,2).join('/'):parts[0];
 check(EXTERNAL.some(v=>v[0]===pkg)||PACKAGES.some(x=>pkg==='@sud-d/'+x)||
  pkg==='@sud-d/contracts','unexpected external package '+pkg+' from '+file);
 return pkg;
}
const BUILTINS=new Set(require('node:module').builtinModules.map(x=>x.replace(/^node:/,'')));
function relativeModule(spec,from,mode){
 check(spec.startsWith('./')||spec.startsWith('../'),'not relative '+spec);
 check(!spec.includes(':')&&!spec.includes('\0')&&!spec.includes('\\'),'relative import path escape '+spec);
 const raw=path.resolve(path.dirname(from),spec);
 check(under(raw,TREE),'module escapes isolated owner tree '+spec+' from '+from);
 const base=originPackage(from),locBase=path.join(TREE,'node_modules',...base.split('/'));
 check(under(raw,locBase),'relative module escapes its physical package '+spec);
 const variants=mode==='runtime'?[raw]:[
  raw.endsWith('.mjs')?raw.slice(0,-4)+'.d.mts':raw.endsWith('.cjs')?raw.slice(0,-4)+'.d.cts':
  raw.endsWith('.js')?raw.slice(0,-3)+'.d.ts':raw,
  raw.endsWith('.js')?raw.slice(0,-3)+'.d.mts':raw,
  raw.endsWith('.js')?raw.slice(0,-3)+'.d.cts':raw,
  raw+'.d.ts',raw+'.d.mts',raw+'.d.cts'
 ];
 const found=variants.find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());
 check(!!found,'unresolved relative '+mode+' '+spec+' from '+from);
 check(under(found,locBase),'relative module resolved outside own package');
 return found;
}
function chooseExport(node,mode){
 if(typeof node==='string')return node;
 check(node&&typeof node==='object'&&!Array.isArray(node),'unsupported conditional exports');
 const applicable=new Set(mode==='runtime'?['node','import','default']:['types','node','import','default']);
 // Honor source object condition insertion order, not a reordered preference list.
 for(const [condition,value] of Object.entries(node)){
  if(!applicable.has(condition))continue;
  try{
   const result=chooseExport(value,mode);
   if(result)return result;
  }catch(e){
   // A matching condition with unsupported value must not be silently skipped.
   throw e;
  }
 }
 fail('unresolved package exports conditions '+Object.keys(node).join(','));
}
function packageBare(spec,mode){
 const m=/^(@[^/]+\/[^/]+|[^/]+)(?:\/(.+))?$/.exec(spec);
 check(!!m,'malformed bare specifier '+spec);
 const name=m[1],sub=m[2]?'./'+m[2]:'.';
 check(EXTERNAL.some(v=>v[0]===name)||name.startsWith('@sud-d/')&&
  [...PACKAGES.map(p=>'@sud-d/'+p),'@sud-d/contracts'].includes(name),
  'unknown external package / scope extension '+name);
 const dir=path.join(TREE,'node_modules',...name.split('/'));
 const meta=path.join(dir,'package.json');
 check(fs.existsSync(meta),'package manifest missing '+name);
 const pkg=JSON.parse(fs.readFileSync(meta,'utf8'));
 check(pkg.name===name,'package manifest name mismatch '+name);
 let target;
 if(pkg.exports){
  let branch=typeof pkg.exports==='object'?pkg.exports[sub]:undefined,star=null;
  if(branch===undefined&&typeof pkg.exports==='object'){
   const matches=[];
   for(const [key,value] of Object.entries(pkg.exports)){
    if(!key.includes('*'))continue;
    const pos=key.indexOf('*'),prefix=key.slice(0,pos),suffix=key.slice(pos+1);
    if(sub.startsWith(prefix)&&sub.endsWith(suffix)&&sub.length>=prefix.length+suffix.length)
     matches.push({key,value,matched:sub.slice(prefix.length,sub.length-suffix.length)});
   }
   check(matches.length<=1,'ambiguous wildcard package exports '+spec);
   if(matches.length){branch=matches[0].value;star=matches[0].matched;}
  }
  check(branch!==undefined,'unexported package subpath '+spec);
  target=chooseExport(branch,mode);
  if(star!==null)target=target.replace(/\*/g,star);
 }else{
  check(sub==='.', 'package lacks subpath exports '+spec);
  target=mode==='runtime'?(pkg.module||pkg.main):(pkg.types||pkg.typings);
 }
 check(typeof target==='string'&&target.startsWith('./'),'unsafe package exports target '+spec);
 const candidate=path.resolve(dir,target);
 check(under(candidate,dir),'package export escape '+spec);
 const options=mode==='runtime'?[candidate]:[
  candidate,
  candidate.endsWith('.mjs')?candidate.slice(0,-4)+'.d.mts':candidate,
  candidate.endsWith('.js')?candidate.slice(0,-3)+'.d.ts':candidate,
  candidate.endsWith('.js')?candidate.slice(0,-3)+'.d.cts':candidate
 ];
 const chosen=options.find(x=>fs.existsSync(x)&&fs.statSync(x).isFile());
 check(!!chosen,'package exports target missing '+spec+' -> '+target+' '+mode);
 check(under(chosen,TREE),'resolved candidate outside owner tree '+spec);
 return chosen;
}
function scanImports(file,mode){
 const data=fs.readFileSync(file,'utf8');
 const ast=ts.createSourceFile(file,data,ts.ScriptTarget.ES2022,true,
  /\.(?:d\.mts|mjs)$/.test(file)?ts.ScriptKind.JS:ts.ScriptKind.TS);
 const edges=[],literal=n=>n&&ts.isStringLiteralLike(n)?n.text:null;
 const add=(name,kind)=>{
  check(typeof name==='string'&&name.length>0,'computed/dynamic module name in '+file);
  edges.push({specifier:name,kind});
 };
 const visit=n=>{
  if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){
   if(mode==='runtime'&&ts.isImportDeclaration(n)&&n.importClause?.isTypeOnly){}
   else if(mode==='runtime'&&ts.isExportDeclaration(n)&&n.isTypeOnly){}
   else add(literal(n.moduleSpecifier),'static');
  }
  if(mode==='types'&&ts.isImportTypeNode(n)){
   const arg=n.argument;
   check(ts.isLiteralTypeNode(arg)&&ts.isStringLiteralLike(arg.literal),'nonliteral import type '+file);
   add(arg.literal.text,'type-import');
  }
  if(ts.isCallExpression(n)&&
   (n.expression.kind===ts.SyntaxKind.ImportKeyword||
   ts.isIdentifier(n.expression)&&n.expression.text==='require')){
   const arg=literal(n.arguments[0]);
   check(arg!==null,'computed/dynamic module load in '+file);
   add(arg,'literal-dynamic-or-require');
  }
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&
    ['Worker','SharedWorker'].includes(n.expression.text)){
   const first=n.arguments?.[0];
   check(first&&ts.isNewExpression(first)&&ts.isIdentifier(first.expression)&&
      first.expression.text==='URL'&&first.arguments?.length>=2&&
      literal(first.arguments[0])!==null,
    'unknown dynamic worker/resource path '+file);
   add(literal(first.arguments[0]),'worker-resource');
  }
  if(ts.isImportEqualsDeclaration(n)&&ts.isExternalModuleReference(n.moduleReference)){
   add(literal(n.moduleReference.expression),'import-equals');
  }
  ts.forEachChild(n,visit);
 };
 visit(ast);
 if(mode==='types'){
  for(const x of ast.referencedFiles)add(x.fileName,'triple-slash');
  for(const x of ast.typeReferenceDirectives)add('@types/'+x.fileName,'types-directive');
 }
 return edges;
}
function closure(spec,mode){
 const first=packageBare(spec,mode),queue=[first],visited=new Set(),project=new Set(),
  external=new Set(),edges=[],resources=[];
 while(queue.length){
  const file=queue.shift();
  if(visited.has(file))continue;
  visited.add(file);
  check(under(file,path.join(TREE,'node_modules')),'graph module outside owner copy tree '+file);
  const pkg=originPackage(file);
  if(pkg.startsWith('@sud-d/'))project.add(file);
  else external.add(file);
  const found=scanImports(file,mode);
  for(const edge of found){
   const s=edge.specifier;
   if(s.startsWith('node:')||BUILTINS.has(s))continue;
   const next=s.startsWith('.')?relativeModule(s,file,mode):packageBare(s,mode);
   check(!next.endsWith('.node'),'native addon resolved in static graph '+next);
   edges.push({from:path.relative(TREE,file).replace(/\\/g,'/'),
    specifier:s,to:path.relative(TREE,next).replace(/\\/g,'/'),kind:edge.kind});
   if(edge.kind==='worker-resource')resources.push(edge);
   if(!visited.has(next))queue.push(next);
   check(visited.size+queue.length<4000,'static traversal upper bound exceeded');
  }
 }
 return {spec,mode,project:[...project],external:[...external],edges,resources,
  total:visited.size};
}
function verifyTreeAll(plan,trust,vendors){
 const expected=new Set(plan.files.map(x=>x.path.normalize('NFC').toLowerCase()));
 const inspected=[];
 for(const f of plan.files){
  const target=path.join(TREE,...safeRel(f.path));
  check(fs.existsSync(target)&&!reparse(target),'owner target missing/reparse '+f.path);
  const id=fileId(target);
  check(id.nlink==='1'&&identitiesEqual(id,f.identity),'output file identity/link changed '+f.path);
  check(fingerprint(target)===f.sha256&&fs.statSync(target).size===f.bytes,
    'copied file hash/size drift '+f.path);
  if(typeof f.source==='string'&&fs.existsSync(f.source)){
   const sid=fileId(f.source);
   independentIdentity(sid,id);
   check(fingerprint(f.source)===f.sha256,'source changed after copy '+f.source);
  }
  inspected.push({path:f.path,sha256:f.sha256,id});
 }
 // Confirm no unwanted symlink/junction or untracked output anywhere in the new tree.
 const all=[],fixture=[];
 const walk=(dir,prefix)=>{
  check(!reparse(dir),'new tree has reparse directory '+dir);
  for(const child of fs.readdirSync(dir,{withFileTypes:true})){
   const local=prefix?prefix+'/'+child.name:child.name,abs=path.join(dir,child.name);
   check(!child.isSymbolicLink()&&!reparse(abs),'new tree link/reparse '+local);
   if(child.isDirectory())walk(abs,local);
   else {
    check(child.isFile(),'new tree unexpected special file '+local);
    if(local.startsWith('fixture/'))fixture.push(local);
    else if(!['journal.jsonl','inventory.json'].includes(local))
      check(expected.has(local.normalize('NFC').toLowerCase()),'unowned/extra candidate file '+local);
    all.push(local);
   }
  }
 };
 walk(TREE,'');
 check(inspected.length===plan.files.length,'full inventory mismatch');
 check(all.filter(x=>!x.startsWith('fixture/')&&!['journal.jsonl','inventory.json'].includes(x)).length===plan.files.length,
  'unexpected owner package files');
 return {allFileCount:all.length,fixtureFiles:fixture,packageFiles:plan.files.length,shaVerified:inspected.length};
}
function validateTree(plan,trust,vendors,notes){
 const newGraph=closure('@sud-d/mcp-gateway/gateway-core','runtime');
 const declGraph=closure('@sud-d/mcp-gateway/gateway-core','types');
 const native=newGraph.edges.filter(x=>/koffi|\.node(?:$|\/)/i.test(x.specifier+' '+x.to));
 check(newGraph.project.length===47,'native-free project JS graph mismatch '+newGraph.project.length);
 check(declGraph.project.length===99,'native-free declaration project graph mismatch '+declGraph.project.length);
 check(native.length===0,'new path static native edge '+native.length);
 for(const pkg of ['mcp-gateway','application','infrastructure']){
  const meta=JSON.parse(fs.readFileSync(path.join(TREE,'node_modules','@sud-d',pkg,'package.json'),'utf8'));
  check(Object.keys(meta.exports['./gateway-core']).join(',')==='types,import',
    'gateway-core export condition order changed '+pkg);
  check(fs.existsSync(packageBare('@sud-d/'+pkg+'/gateway-core','types'))&&
   fs.existsSync(packageBare('@sud-d/'+pkg+'/gateway-core','runtime')),
   'gateway-core target missing '+pkg);
 }
 const physical=verifyTreeAll(plan,trust,vendors);
 return {
  runtime:{project:newGraph.project.length,vendor:newGraph.external.length,
   total:newGraph.total,edges:newGraph.edges.length,native:native.length},
  declarations:{project:declGraph.project.length,vendor:declGraph.external.length,
   total:declGraph.total,edges:declGraph.edges.length},
  physical,blocked:[], // fail-closed exceptions prevent success for unknown vendors/dynamic edges
  runtimeEdges:newGraph.edges,declarationEdges:declGraph.edges,
  vendorFileCounts:notes.copyCounts
 };
}

function inspectOnly(){
 check(fs.existsSync(TREE)&&!reparse(TREE),'no existing task-owned root to inspect');
 const inventory=path.join(TREE,'inventory.json'),journal=path.join(TREE,'journal.jsonl');
 const files=[];
 const walk=(dir)=>{
  check(!reparse(dir),'inspect reparse directory '+dir);
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
   const name=path.join(dir,ent.name);
   check(!ent.isSymbolicLink()&&!reparse(name),'inspect unexpected link '+name);
   if(ent.isDirectory())walk(name);
   else{check(ent.isFile(),'nonregular owner file '+name);files.push({
    path:path.relative(TREE,name).replace(/\\/g,'/'),bytes:fs.statSync(name).size,
    sha256:fingerprint(name),identity:fileId(name)})}
  }
 };
 walk(TREE);
 if(fs.existsSync(inventory)){
  const json=JSON.parse(fs.readFileSync(inventory,'utf8'));
  check(Array.isArray(json.files),'inventory incomplete');
  const lookup=new Map(files.map(x=>[x.path,x]));
  for(const entry of json.files){
   const f=lookup.get(entry.path);
   check(f&&f.sha256===entry.sha256&&f.bytes===entry.bytes&&
     identitiesEqual(f.identity,entry.identity)&&f.identity.nlink==='1',
     'inventory postflight mismatched '+entry.path);
  }
 }
 console.log('G2B_OWNER_TREE_INSPECT '+JSON.stringify({
  root:TREE,inventoryPresent:fs.existsSync(inventory),journalPresent:fs.existsSync(journal),
  files:files.length,inventorySha:fs.existsSync(inventory)?fingerprint(inventory):'ABSENT',
  journalSha:fs.existsSync(journal)?fingerprint(journal):'ABSENT'
 }));
 return {files,inventorySha:fingerprint(inventory),journalSha:fingerprint(journal)};
}
function preservation(){
 const f=freezeInputs(),s=stageManifest(),test={
  acceptedSources:f.source.size,priorReads:f.prior.size,recentReads:f.latest.size,
  protected:Object.keys(PROTECTED).length,originalLogical:512,stageArtifacts:512,
  stageManifest:EXPECT_MANIFEST
 };
 check(fingerprint(MFILE)===EXPECT_MANIFEST,'postflight immutable stage drift');
 return test;
}
function evidenceResult(failure,success,preflight){
 const present=fs.existsSync(TREE),journal=path.join(TREE,'journal.jsonl');
 const part={rootPresent:present,journal:fingerprint(journal),
  inventory:fingerprint(path.join(TREE,'inventory.json')),partialCopies:[]};
 if(present&&fs.existsSync(journal)){
  for(const line of fs.readFileSync(journal,'utf8').split(/\r?\n/)){
   if(!line)continue;
   try{const row=JSON.parse(line);if(row.kind==='COPIED')part.partialCopies.push({
    path:row.dest,sha256:row.sha256,bytes:row.bytes,identity:row.identity
   })}catch{part.partialCopies.push({error:'incomplete journal record'})}
  }
 }
 return {failure:failure?String(failure.stack||failure):null,
  status:failure?'PARTIAL/BLOCKED':
  success?.status||'PARTIAL/BLOCKED',success,partial:part,preflight};
}
function reportText(e){
 const data=e.success,lines=[
 '# SUD_D B1b-G2b — Hardlink-safe Isolated Owner Candidate Closeout',
 '',
 '**Date:** 2026-10-15 | **Mission:** COPY-ONLY / LOCAL DEVELOPMENT',
 '**Verdict:** '+e.status,
 '**Scope:** One fresh task-only TEMP root; one new test-only CJS; one ignored Closeout; canonical dist remains read-only.',
 '**Authority ceiling:** NO PRODUCT/VENDOR/ESM RUNTIME; NO NATIVE / B2 / MANAGED SERENA / NETWORK / GIT WRITE.',
 '',
 '## Gate 0 — frozen preflight',
 'Project SUD_D, branch p0c-hyperv-spike, HEAD '+EXPECT_HEAD+', staged=0 at preflight; inherited user porcelain count 339, SHA256 15120f886d3088e4c6b22752009d3424fe91d398767609a08ad24058994fafd4.',
 'Exact immutable TEMP stage-manifest '+MFILE+' SHA256 '+EXPECT_MANIFEST+
 '; publicationAllowed:false; 512 entries / 128 source modules; byte sum 2,583,674.',
 'Expected 512 staged contents + original physical SHA-or-ABSENT and frozen 16 Source/Test/Metadata, 641 prior inputs, 637 newest compiler inputs, 4 R3 Contracts and accepted older Closeouts checked in preflight.',
 'External fixed allowlist: '+EXTERNAL.map(v=>v[0]+'@'+v[1]).join('; '),
 'All protected prior Source/Metadata/Stage/Reports and existing Release/Desktop/Links are READ-ONLY.',
 '',
 '## Gate 0 — RED→GREEN inert tests',
 'Initially test-only --self-test failed intentionally with RED "copy-only safety interface not implemented" (exit 1). Followed by one fixed CJS helper with in-memory fail-closed cases for traversal/ADS, case collision, missing owner root, stale SHA, source reparse, duplicate/file-ID identity, unknown vendor and report overwrite.',
 'The self-test runs in one Node process and creates no file; exact final exit/code reported by operator.',
 '',
 '## Gate 1 — disposable NTFS hardlink fixture (informational only)',
 'Fixture root (strictly owned): '+path.join(TREE,'fixture'),
 ...(data?.notes?.fixture?.tests||[]).map(x=>'- '+x.name+': '+x.status+' '+JSON.stringify(x)),
 'Fixture status: '+(data?.notes?.fixture?.status||'NOT_COMPLETED'),
 'The fixture does not authorize canonical dist mutation, and Node rename does not offer expected-destination-FileID atomic CAS.',
 '',
 '## Gate 2 — independent copy-only owner tree',
 'Owner tree root '+TREE+'.',
 'One minimal scriptless private package.json and actual ordinary per-package node_modules directories; no source/package scripts, no symlink/hardlink copies from source.',
 'Source-current four package outputs: Domain 76, Infrastructure 284, Application 120, Gateway 32 = 512 from immutable TEMP stage.',
 'Four exact Source package.json manifests and Contracts package.json+4 R3 dist files copied independently, and only six pinned vendor package payloads.',
 'Expected vendor cap <=8000 files and 160MiB; no .node payloads or copied nested node_modules.',
 'All copied files must have distinct dev/ino from source and nlink=1.',
 '### Vendor source package roots/counts',
 ...(data?.notes?.vendor||[]).map(x=>'- '+JSON.stringify(x)),
 '### Exact copy file inventory SHA-256 and independent NTFS IDs',
 '| Destination inside owner root | Physical source | SHA-256 | Bytes | DEV | INO | nlink | Tag |',
 '|---|---|---|---:|---|---|---|---|',
 ...(data?.plan?.files||[]).map(x=>
  '| '+x.path.replace(/\|/g,'/')+' | '+x.source.replace(/\|/g,'/')+' | '+x.sha256+
  ' | '+x.bytes+' | '+(x.identity?.dev||'UNWRITTEN')+' | '+(x.identity?.ino||'UNWRITTEN')+
  ' | '+(x.identity?.nlink||'UNWRITTEN')+' | '+x.tag+' |'),
 '',
 '## Gate 3 — static Node16 project and vendor closure, NO evaluation',
 data?.inspection?JSON.stringify({
   runtime:data.inspection.runtime,declarations:data.inspection.declarations,
   physical:data.inspection.physical,vendorFileCounts:data.inspection.vendorFileCounts
 }):'NOT VERIFIED / blocked before static closure completed',
 '### Selected runtime graph exact resolution edges',
 ...(data?.inspection?.runtimeEdges||[]).map(x=>'- '+JSON.stringify(x)),
 '### Selected declaration graph exact resolution edges',
 ...(data?.inspection?.declarationEdges||[]).map(x=>'- '+JSON.stringify(x)),
 'All selected physical module resolutions must remain in new owner tree. Unknown package/specifier/conditional branches or dynamic loads BLOCK completion, never trigger new vendor package copy.',
 'New gateway expected project graph 47 runtime JS and 99 declaration files; static project native edge 0, previously accepted legacy root 11 known native edges; no entrypoint executed.',
 '',
 '## One-use owned copy journal / inventory and postflight',
 'Journal: '+e.partial.journal+' at '+path.join(TREE,'journal.jsonl'),
 'Inventory: '+e.partial.inventory+' at '+path.join(TREE,'inventory.json'),
 'Journal contains task-only exclusively created writes and remains for inspection. Existing root must never auto-resume or silently delete.',
 'All original canonical dist, dist-release, Desktop build, installed node_modules, 339 reused, prior staging, Source/Input/reports and 4 R3 Contracts preserved by identical frozen SHA/ABSENT.',
 'Operator will run exact no-write inspector, Git diff --check and verify HEAD/staged/dirty tree preserved after this Closeout.',
 '### Protected authority artifact SHA-256',
 ...Object.entries(PROTECTED).map(([p,h])=>'- '+p+' SHA256 '+h),
 '',
 '## Blockers and next authority',
 e.failure||'No unexpected exception. Static proof is only selected Node16 imports/declarations, not runtime ESM/vendor side-effect/Native verification.',
 'Manual Owner Test: DEFERRED, NOT PASS. No canonical dist promotion; previous 69-hardlink HARD STOP remains accepted and unchanged.',
 '',
 '**FINAL: '+(e.status==='CANDIDATE_STATIC_VERIFIED'?
 'G2b ISOLATED OWNER CANDIDATE TREE STATICALLY VERIFIED; ORIGINAL DIST UNCHANGED; PRODUCT/VENDOR/ESM RUNTIME NOT_READY; OWNER TEST DEFERRED; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.':
 'G2b ISOLATED OWNER CANDIDATE PARTIAL/BLOCKED; ORIGINAL DIST UNCHANGED; PRODUCT/VENDOR/ESM RUNTIME NOT_READY; OWNER TEST DEFERRED; B2 NOT AUTHORIZED; A1 PAUSED/BLOCKED.')+'**',''
 ];
 if(!data)lines.push('### Task-owned partial journal-listed paths',
 ...e.partial.partialCopies.map(x=>'- '+JSON.stringify(x)));
 return lines.join('\n');
}
function executeAssembly(){
 requireAbsent();
 let failure=null,success=null,frozen=null;
 try{
  frozen=immutable();
  success=assemble();
  // Revalidate every previously accepted path and stage/original before writing report.
  preservation();
 }catch(e){failure=e}
 let reportResult=evidenceResult(failure,success,frozen?{source:frozen.source.size,
  prior:frozen.prior.size,latest:frozen.latest.size,stage:frozen.manifest.files.length}:null);
 const closeout=reportText(reportResult);
 check(!fs.existsSync(root(REPORT)),'final Closeout must not overwrite any file');
 fs.writeFileSync(root(REPORT),closeout,{encoding:'utf8',flag:'wx'});
 console.log('G2B_OWNER_TREE_CLOSEOUT '+REPORT+' SHA256 '+fingerprint(root(REPORT))+
  ' bytes '+Buffer.byteLength(closeout));
 console.log('G2B_OWNER_TREE_VERDICT '+reportResult.status+
  ' ROOT_EXISTS='+fs.existsSync(TREE)+' INVENTORY='+reportResult.partial.inventory);
 if(failure){console.error('G2B_OWNER_TREE_HARD_STOP '+String(failure.message||failure));process.exitCode=2}
}
if(require.main===module){
 check(process.argv.length===3,'explicit one of --self-test, --assemble, --inspect required');
 const mode=process.argv[2];
 check(['--self-test','--assemble','--inspect'].includes(mode),'unsupported helper mode '+mode);
 if(mode==='--self-test'){requireAbsent();checks()}
 else if(mode==='--assemble')executeAssembly();
 else inspectOnly();
}
module.exports={safeRel,independentIdentity,validateVendorName,chooseExport,scanImports};
