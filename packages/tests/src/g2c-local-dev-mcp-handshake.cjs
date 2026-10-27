'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const cp=require('node:child_process');
const ROOT=path.resolve(os.tmpdir(),'sudd-g2c-dev-mcp-handshake-20261016-04');
const BIN='C:\\Users\\JJ\\AppData\\Local\\SUD-D\\coding-engines\\serena\\1.7.0\\bin\\serena.exe';
const NODE='C:\\Program Files\\nodejs\\node.exe';
const HASH='87f771d750e8587da7127cece585129b65c0cf317c068dc1f1aeb3c728b5252c';
const NODEHASH='63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088';
const fail=s=>{throw Error('G2C_HARD_STOP_'+s)};
const assert=(v,s)=>{if(!v)fail(s)};
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const id=p=>{const s=fs.statSync(p,{bigint:true});assert(s.isFile()&&s.nlink===1n&&s.ino!==0n,'BAD_FILEID');return {dev:String(s.dev),ino:String(s.ino),nlink:String(s.nlink),bytes:Number(s.size)}};
const contained=(root,p)=>{const rel=path.relative(root,p);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'ESCAPE');return p};
const filePin=(p,h,n)=>{let cur=path.parse(p).root;for(const component of p.slice(cur.length).split(path.sep).filter(Boolean)){cur=path.join(cur,component);assert(!fs.lstatSync(cur).isSymbolicLink()&&fs.realpathSync.native(cur).toLowerCase()===path.resolve(cur).toLowerCase(),'REPARSE');}const out=id(p);assert(out.bytes===n&&digest(p)===h,'PIN_MISMATCH');return {...out,sha256:h}};
function cimRows(filter) {
 const ps='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
 const select=" | Select-Object ProcessId,ParentProcessId,ExecutablePath,@{Name='CreationDate';Expression={$_.CreationDate.ToString('o')}} | ConvertTo-Json -Compress";
 const script=filter==="Name='serena.exe'"
  ? "Get-CimInstance Win32_Process | Where-Object Name -EQ 'serena.exe'"+select
  : "Get-CimInstance Win32_Process -Filter '"+filter+"'"+select;
 const r=cp.spawnSync(ps,['-NoProfile','-NonInteractive','-Command',script],
  {windowsHide:true,encoding:'utf8',timeout:9000,maxBuffer:65536});
 assert(!r.error&&r.status===0,'CIM_QUERY_FAILED_STATUS_'+String(r.status)+'_ERROR_'+String(r.error?.code||'none'));
 const v=r.stdout.trim();if(!v)return [];
 const items=JSON.parse(v);return Array.isArray(items)?items:[items];
}
function parseCim(row){
 assert(row&&Number.isInteger(row.ProcessId)&&row.ProcessId>0,'CIM_PID_MISSING');
 assert(Number.isInteger(row.ParentProcessId)&&row.ParentProcessId>=0,'CIM_PARENT_MISSING');
 assert(typeof row.ExecutablePath==='string'&&row.ExecutablePath.length>0,'CIM_IMAGE_MISSING');
 const date=Date.parse(row.CreationDate);
 assert(Number.isFinite(date),'CIM_CREATION_MISSING');
 return {pid:row.ProcessId,parent:row.ParentProcessId,image:path.resolve(row.ExecutablePath).toLowerCase(),created:date};
}
function matchesChild(row,expected){
 const r=parseCim(row);
 assert(r.pid===expected.pid&&!expected.preexisting.has(r.pid+':'+r.created),'CIM_PREEXISTING_COLLISION');
 assert(r.parent===expected.parent,'CIM_WRONG_PARENT');
 assert(r.image===path.resolve(BIN).toLowerCase(),'CIM_WRONG_IMAGE');
 assert(r.created>=expected.earliest-2000&&r.created<=Date.now()+2000,'CIM_WRONG_CREATION');
 if(expected.created!==undefined)assert(r.created===expected.created,'CIM_PID_REUSE');
 return r;
}
function childSnapshot(pid){return cimRows('ProcessId='+pid).find(r=>r.ProcessId===pid)}
function preflight(){
 assert(path.basename(ROOT)==='sudd-g2c-dev-mcp-handshake-20261016-04','WRONG_ROOT');
 assert(!fs.existsSync(ROOT),'FOREIGN_ROOT');
 assert(path.resolve(os.tmpdir()).toLowerCase()===path.resolve(process.env.TEMP||'').toLowerCase(),'TEMP_MISMATCH');
 const serena=filePin(BIN,HASH,46080),node=filePin(NODE,NODEHASH,91380224);
 const existingSerena=cimRows("Name='serena.exe'").map(parseCim);
 return {rootAbsent:true,serena,node,existingSerenaCount:existingSerena.length,cimFieldPresence:'VERIFIED',network:'DEV_NETWORK_EGRESS_UNGUARANTEED',signer:'RELEASE_AUTHENTICODE_UNVERIFIED'};
}
function selfTest(){
 const reject=f=>{let threw=false;try{f()}catch{threw=true}assert(threw,'NEGATIVE_TEST_FAIL')};
 reject(()=>contained(ROOT,path.resolve(ROOT,'..','not-owned')));
 reject(()=>contained(ROOT,ROOT));
 reject(()=>assert('0'.repeat(64)===HASH,'HASH'));
 reject(()=>assert(false,'PID_CREATE_TIME_MISMATCH'));
 reject(()=>assert(1025<=1024,'OVERSIZE_STDIO'));
 reject(()=>JSON.parse('{'));
 const good={ProcessId:42,ParentProcessId:9,ExecutablePath:BIN,CreationDate:new Date().toISOString()};
 const expected={pid:42,parent:9,earliest:Date.now()-1000,preexisting:new Set()};
 matchesChild(good,expected);
 reject(()=>matchesChild({...good,ProcessId:43},expected));
 reject(()=>matchesChild({...good,ParentProcessId:10},expected));
 reject(()=>matchesChild({...good,ExecutablePath:NODE},expected));
 reject(()=>matchesChild({...good,CreationDate:'2020-01-01T00:00:00'},expected));
 reject(()=>matchesChild(good,{...expected,preexisting:new Set(['42:'+Date.parse(good.CreationDate)])}));
 const env={...process.env,SECRET_KEY:'abc',HTTP_PROXY:'example'};
 const sanitized=cleanEnvironment(path.join(ROOT,'profile'));
 assert(!('SECRET_KEY'in sanitized)&&!('HTTP_PROXY'in sanitized),'ENV_LEAK');
 const localConfig=taskConfig(path.join(ROOT,'profile'));
 assert(localConfig.project_serena_folder_location.startsWith(ROOT+path.sep),'TEST_CONFIG_ESCAPE');
 assert(localConfig.trusted_project_path_patterns.length===0,'TEST_CONFIG_TRUST');
 assert(classifyDiagnostic('ModuleNotFoundError: sensitive details')==='ModuleNotFound','TEST_REDACTION');
 assert(!JSON.stringify({category:classifyDiagnostic('ModuleNotFoundError: SECRET')}).includes('SECRET'),'TEST_NO_SECRET');
 assert(!fs.existsSync(ROOT),'SELF_TEST_WROTE_ROOT');
 console.log('SELF_TEST_PASS 16/16');
}
function cleanEnvironment(profile){
 const windows=process.env.SystemRoot||'C:\\Windows';
 return {SystemRoot:windows,WINDIR:windows,ComSpec:path.join(windows,'System32','cmd.exe'),
  PATH:[path.join(windows,'System32'),windows,'C:\\Users\\JJ\\AppData\\Local\\Programs\\Python\\Python312'].join(';'),
  HOME:profile,USERPROFILE:profile,APPDATA:path.join(profile,'AppData'),
  LOCALAPPDATA:path.join(profile,'LocalAppData'),TEMP:path.join(profile,'Temp'),TMP:path.join(profile,'Temp'),
  SERENA_HOME:path.join(profile,'SerenaHome'),SERENA_USAGE_REPORTING:'false',
  PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};
}
function taskConfig(profile){
 const projectState=contained(ROOT,path.join(ROOT,'project-state','.serena'));
 const cfg={language_backend:'LSP',token_count_estimator:'CHAR_COUNT',gui_log_window:false,
 web_dashboard:false,web_dashboard_open_on_launch:false,trace_lsp_communication:false,
 project_serena_folder_location:projectState,trusted_project_path_patterns:[],
 base_modes:['interactive','editing'],default_modes:[],projects:[]};
 assert(projectState.startsWith(ROOT+path.sep),'CONFIG_ESCAPE');
 return cfg;
}
function classifyDiagnostic(text){
 const patterns=[['ModuleNotFound','ModuleNotFoundError'],['ImportError','ImportError'],
 ['PermissionError','PermissionError'],['ConfigParse','(?:yaml\\.parser|ParserError|ScannerError)'],
 ['FileNotFound','FileNotFoundError'],['AssertionError','AssertionError'],
 ['RuntimeError','RuntimeError'],['TypeError','TypeError']];
 for(const [code,pattern] of patterns)if(new RegExp(pattern,'i').test(text))return code;
 return 'UNKNOWN';
}
function copyFixtures(){
 const src=path.resolve('packages/tests/fixtures/serena-runtime-spike-ts'),dest=path.join(ROOT,'workspace');
 const copied=[];
 const walk=(folder,to)=>{
  for(const e of fs.readdirSync(folder,{withFileTypes:true})){
   const source=path.join(folder,e.name),target=contained(ROOT,path.join(to,e.name));
   assert(!e.isSymbolicLink(),'FIXTURE_LINK');
   if(e.isDirectory()){fs.mkdirSync(target);walk(source,target);continue}
   assert(e.isFile()&&['.ts','.json'].includes(path.extname(e.name).toLowerCase()),'FIXTURE_UNSAFE');
   assert(!fs.lstatSync(source).isSymbolicLink(),'FIXTURE_REPARSE');
   const b=fs.readFileSync(source);assert(b.length<100000,'FIXTURE_SIZE');
   fs.writeFileSync(target,b,{flag:'wx'});assert(digest(source)===digest(target)&&id(target).ino!==id(source).ino,'COPY_ID');
   copied.push({file:path.relative(dest,target).replaceAll('\\','/'),bytes:b.length,sha256:digest(target)});
  }
 };
 fs.mkdirSync(dest);walk(src,dest);return copied;
}
function record(root,name,value){fs.writeFileSync(contained(root,path.join(root,name)),JSON.stringify(value,null,2)+'\n',{flag:'wx'})}
async function observe(){
 const proof=preflight();
 // Read only already-running Serena identities; never attach or control them.
 const preexisting=new Set(cimRows("Name='serena.exe'").map(row=>{
  const r=parseCim(row);return r.pid+':'+r.created;
 }));
 fs.mkdirSync(ROOT,{recursive:false});
 const files=copyFixtures(),profile=path.join(ROOT,'profile');
 for(const sub of ['','AppData','LocalAppData','Temp','SerenaHome'])fs.mkdirSync(path.join(profile,sub));
 const config=taskConfig(profile);
 fs.mkdirSync(path.dirname(config.project_serena_folder_location),{recursive:true});
 fs.mkdirSync(config.project_serena_folder_location);
 const configFile=path.join(profile,'SerenaHome','serena_config.yml');
 fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 assert(fs.readFileSync(configFile,'utf8').includes('"language_backend": "LSP"'),'CONFIG_WRITE_MISMATCH');
 const args=['start-mcp-server','--project',path.join(ROOT,'workspace'),'--context','coding','--mode','interactive','--open-web-dashboard','false'];
 const summary={status:'DEV_MCP_HANDSHAKE_FAILED',network:'DEV_NETWORK_EGRESS_UNGUARANTEED',releaseSigner:'UNVERIFIED',
  peerAttestation:'UNVERIFIED',launches:0,steps:[],files,binary:proof.serena,child:null,exit:null,stderrBytes:0,stdoutBytes:0};
 let child,timeout,ownership;
 const finish=()=>{
  try{record(ROOT,'observation.json',summary)}catch(e){console.error('RESULT_WRITE_ERROR',String(e))}
  console.log('G2C_OBSERVATION '+JSON.stringify(summary));
 };
 try{
  assert(digest(BIN)===HASH,'BINARY_DRIFT_BEFORE_SPAWN');
  const spawnEarliest=Date.now();
  child=cp.spawn(BIN,args,{cwd:path.join(ROOT,'workspace'),env:cleanEnvironment(profile),
   shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
  summary.launches=1;
  let earlyStdout='',earlyStderr='',overflow=false;
  child.stdout.on('data',b=>{
   summary.stdoutBytes+=b.length;
   if(summary.stdoutBytes+summary.stderrBytes>1048576){overflow=true;child.stdin.end();return}
   earlyStdout+=b.toString('utf8');
  });
  child.stderr.on('data',b=>{
   summary.stderrBytes+=b.length;
   if(summary.stdoutBytes+summary.stderrBytes>1048576){overflow=true;child.stdin.end();return}
   earlyStderr+=b.toString('utf8');
   summary.stderrCategory=classifyDiagnostic(earlyStderr);
  });
  let done=false;
  const exit=new Promise(resolve=>{
   child.once('exit',(code,signal)=>{summary.exit={code,signal};done=true;resolve({code,signal})});
   child.once('error',e=>{summary.errorCode=e.code;done=true;resolve({error:e.code})});
  });
  assert(Number.isInteger(child.pid)&&child.pid>0,'SPAWN_PID_MISSING');
  ownership={pid:child.pid,parent:process.pid,earliest:spawnEarliest,preexisting};
  const observed=childSnapshot(child.pid);
  assert(observed,'CIM_CHILD_NOT_FOUND_AFTER_SPAWN');
  const bound=matchesChild(observed,ownership);
  assert(digest(BIN)===HASH,'BINARY_CHANGED_AFTER_SPAWN');
  summary.child={pid:bound.pid,parentPid:bound.parent,creationTime:new Date(bound.created).toISOString(),
   imageSha256:HASH,cimVerified:true};
  ownership.created=bound.created;
  let stdout=earlyStdout,pending=new Map(),nextId=1;
  const t=Date.now();
  let rejectExit;
  // exit listener was installed immediately after spawn, before slow CIM queries.
  const response=(id,result,error)=>{
   const item=pending.get(id);if(!item)return;pending.delete(id);error?item.reject(Error('MCP_RESPONSE_ERROR')):item.resolve(result);
  };
  child.stdout.removeAllListeners('data');
  child.stdout.on('data',chunk=>{
   summary.stdoutBytes+=chunk.length;
   if(summary.stdoutBytes+summary.stderrBytes>1048576){summary.status='MCP_OUTPUT_LIMIT';child.stdin.end();return}
   stdout+=chunk.toString('utf8');
   for(let idx;(idx=stdout.indexOf('\n'))!==-1;){
    const line=stdout.slice(0,idx).trim();stdout=stdout.slice(idx+1);
    if(!line)continue;
    try{const msg=JSON.parse(line);if(Object.hasOwn(msg,'id'))response(msg.id,msg.result,msg.error)}
    catch{summary.steps.push('UNPARSEABLE_STDIO_LINE')}
   }
  });
  // Early stderr listener retained; only allowlisted failure category is stored.
  const send=(method,params)=>{const num=nextId++;
    const answer=new Promise((resolve,reject)=>pending.set(num,{resolve,reject}));
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:num,method,params})+'\n');return answer;
  };
  const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('MCP_INITIALIZE_TIMEOUT')),120000)});
  try{
   const handshake=await Promise.race([send('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'sud-d-g2c-dev-isolated',version:'0.1.0'}}),deadline]);
   summary.steps.push('MCP_INITIALIZE_RECEIVED');
   summary.server=handshake?.serverInfo&&{name:String(handshake.serverInfo.name).slice(0,80),version:String(handshake.serverInfo.version).slice(0,80)};
   summary.protocolVersion=String(handshake?.protocolVersion||'');
   child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
   const list=await Promise.race([send('tools/list',{}),deadline]);
   summary.steps.push('MCP_TOOLS_LIST_RECEIVED');
   summary.tools=Array.isArray(list?.tools)?list.tools.map(x=>({name:String(x.name).slice(0,90),schemaPresent:!!x.inputSchema})).slice(0,100):null;
   summary.status=Array.isArray(summary.tools)?'DEV_MCP_HANDSHAKE_OBSERVED_PENDING_CLEAN_EXIT':'DEV_MCP_HANDSHAKE_FAILED';
  }catch(e){summary.failure=String(e.message).slice(0,120)}
  finally{clearTimeout(timeout);child.stdin.end()}
  await Promise.race([exit,new Promise(resolve=>setTimeout(resolve,5000))]);
  if(!done){
   summary.status='PROCESS_OWNERSHIP_UNCERTAIN';
   summary.failure='CHILD_NOT_EXITED_AFTER_STDIO_CLOSE; OWNED_CLEANUP_REQUIRED';
  } else if(summary.status==='DEV_MCP_HANDSHAKE_OBSERVED_PENDING_CLEAN_EXIT')
   summary.status=summary.exit?.code===0?'DEV_MCP_HANDSHAKE_OBSERVED_CLEAN_EXIT':'DEV_MCP_HANDSHAKE_FAILED';
  summary.elapsedMs=Date.now()-t;
  summary.afterSerenaSha256=digest(BIN);
  if(summary.afterSerenaSha256!==HASH)summary.status='PHYSICAL_PREFLIGHT_BLOCKED';
 }catch(e){summary.failure=String(e.message).slice(0,200);summary.status='PHYSICAL_PREFLIGHT_BLOCKED'}
 finally{
  clearTimeout(timeout);
  // Never terminate PID by name or an unverified/reused numeric identifier.
  if(child&&child.pid&&child.exitCode===null){
   try{
    if(child.stdin&&!child.stdin.destroyed)child.stdin.end();
    const latest=childSnapshot(child.pid);
    if(latest&&ownership&&ownership.created!==undefined){
     const exact=matchesChild(latest,ownership);
     summary.cleanupIdentity={pid:exact.pid,creationTime:new Date(exact.created).toISOString(),verified:true};
     const descendants=cimRows('ParentProcessId='+child.pid).map(parseCim);
     summary.descendants=descendants.map(d=>({pid:d.pid,created:new Date(d.created).toISOString()}));
     // Kill only the originally returned ChildProcess handle, and only if still verifiably the same process.
     if(child.exitCode===null){summary.ownedKillAttempted=true;child.kill();
       await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,20000))]);
     }
    } else if(latest){summary.status='PROCESS_OWNERSHIP_UNCERTAIN';summary.cleanupWarning='CHILD_IDENTITY_UNVERIFIED_NO_KILL'}
   }catch(e){summary.status='PROCESS_OWNERSHIP_UNCERTAIN';summary.cleanupWarning=String(e.message).slice(0,100)}
  }
  if(child&&child.pid){
   // Read-only independent exit/descendant verification, never kill descendants.
   try{
    const remaining=childSnapshot(child.pid);
    if(remaining){summary.status='PROCESS_OWNERSHIP_UNCERTAIN';summary.cleanupWarning='CHILD_STILL_PRESENT'}
    if(summary.descendants){
      summary.remainingDescendants=summary.descendants.filter(d=>cimRows('ProcessId='+d.pid).some(r=>
       Date.parse(r.CreationDate)===Date.parse(d.created)));
      if(summary.remainingDescendants.length){summary.status='PROCESS_OWNERSHIP_UNCERTAIN';summary.cleanupWarning='DESCENDANTS_STILL_PRESENT'}
    }
   }catch(e){summary.status='PROCESS_OWNERSHIP_UNCERTAIN';summary.cleanupWarning='CIM_POSTCHECK_FAILED'}
  }
  finish();
 }
}
const mode=process.argv[2];
assert(process.argv.length===3&&['--self-test','--preflight','--observe'].includes(mode),'BAD_MODE');
if(mode==='--self-test')selfTest();
else if(mode==='--preflight')console.log('G2C_PREFLIGHT '+JSON.stringify(preflight()));
else observe().catch(e=>{console.error('OBSERVE_ERROR',String(e));process.exitCode=2});
