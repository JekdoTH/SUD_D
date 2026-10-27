'use strict';
// G2c single-purpose fail-closed preflight, no product import or process launch.
// The operative no-network/no-user-profile containment cannot be proved by
// sanitized environment variables alone; no child spawn is authorized here.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const EXPECTED=Object.freeze({
  serena:Object.freeze({path:'C:\\Users\\JJ\\AppData\\Local\\SUD-D\\coding-engines\\serena\\1.7.0\\bin\\serena.exe',sha256:'87f771d750e8587da7127cece585129b65c0cf317c068dc1f1aeb3c728b5252c',bytes:46080}),
  node:Object.freeze({path:'C:\\Program Files\\nodejs\\node.exe',sha256:'63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088',bytes:91380224}),
});
const ROOT=path.resolve(os.tmpdir(),'sudd-g2c-managed-serena-physical-20261016-01');
const helper=path.resolve(__filename);
const error=(m)=>{throw new Error('G2C_PREFLIGHT_BLOCKED '+m)};
const requireTrue=(v,m)=>{if(!v)error(m)};
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function validatePinned(actual,expected){
  requireTrue(actual&&actual.sha256===expected.sha256&&actual.bytes===expected.bytes,'BINARY_PIN_MISMATCH');
  requireTrue(actual.fileId&&actual.fileId.dev!=='0'&&actual.fileId.ino!=='0','BINARY_FILE_ID_MISSING');
}
function checkFile(spec){
  let current=path.parse(spec.path).root;
  for(const part of spec.path.slice(current.length).split(path.sep).filter(Boolean)){
    current=path.join(current,part);
    const l=fs.lstatSync(current);
    requireTrue(!l.isSymbolicLink()&&fs.realpathSync.native(current).toLowerCase()===path.resolve(current).toLowerCase(),'BINARY_REPARSE');
  }
  const stats=fs.statSync(spec.path,{bigint:true});
  requireTrue(stats.isFile()&&stats.ino!==0n&&stats.dev!==0n,'BINARY_NOT_ORDINARY');
  const result={sha256:sha(fs.readFileSync(spec.path)),bytes:Number(stats.size),
    fileId:{dev:String(stats.dev),ino:String(stats.ino),nlink:String(stats.nlink)}};
  validatePinned(result,spec);
  return result;
}
function checkRoot(){
  requireTrue(path.basename(ROOT)==='sudd-g2c-managed-serena-physical-20261016-01','WRONG_ROOT');
  requireTrue(path.resolve(process.env.TEMP||os.tmpdir()).toLowerCase()===path.resolve(os.tmpdir()).toLowerCase(),'UNTRUSTED_TEMP');
  requireTrue(!fs.existsSync(ROOT)&&!fs.existsSync(path.resolve(ROOT,'workspace')),'FOREIGN_ROOT_PRESENT');
}
function assertOwnedPid(actual,expected){
  requireTrue(actual&&expected&&Number.isSafeInteger(actual.pid)&&actual.pid>0
    &&actual.pid===expected.pid&&actual.creationTime===expected.creationTime
    &&actual.imageFileId===expected.imageFileId,'PROCESS_OWNERSHIP_UNCERTAIN');
}
function validateBounded(bytes,limit){requireTrue(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=limit,'OVERSIZE_OUTPUT')}
function assertNetworkDenied(evidence){requireTrue(evidence&&evidence.verifiedDeny===true&&evidence.enforcement==='OS_ENFORCED_TEST_ONLY','NETWORK_DENY_UNVERIFIED')}
function preflight(){
  checkRoot();
  const binaries={serena:checkFile(EXPECTED.serena),node:checkFile(EXPECTED.node)};
  return {binaries,rootAbsent:true,
    signature:'UNVERIFIED_OFFLINE_AUTHENTICODE',
    networkIsolation:'UNVERIFIED_NO_OS_ENFORCED_DENY',
    observedSession:'NOT_RUN'};
}
function selfTest(){
  const mustFail=(fn)=>{let stopped=false;try{fn()}catch(e){stopped=String(e).includes('G2C_PREFLIGHT_BLOCKED')}requireTrue(stopped,'NEGATIVE_TEST_DID_NOT_BLOCK')};
  const pin={sha256:EXPECTED.serena.sha256,bytes:EXPECTED.serena.bytes,
    fileId:{dev:'1',ino:'2',nlink:'1'}};
  validatePinned(pin,EXPECTED.serena);
  mustFail(()=>validatePinned({...pin,sha256:'0'.repeat(64)},EXPECTED.serena));
  mustFail(()=>validatePinned({...pin,fileId:{dev:'0',ino:'0'}},EXPECTED.serena));
  mustFail(()=>assertOwnedPid({pid:4,creationTime:2,imageFileId:'1'},{pid:5,creationTime:2,imageFileId:'1'}));
  mustFail(()=>assertOwnedPid({pid:4,creationTime:3,imageFileId:'1'},{pid:4,creationTime:2,imageFileId:'1'}));
  mustFail(()=>validateBounded(8193,8192));
  mustFail(()=>assertNetworkDenied({verifiedDeny:false}));
  mustFail(()=>assertNetworkDenied({verifiedDeny:true,enforcement:'ENV_ONLY'}));
  checkRoot();
  console.log('G2C_BUILTINS_SELF_TEST_PASS 8/8; no writes, spawn, network or product imports');
}
const mode=process.argv[2];
requireTrue(process.argv.length===3&&['--preflight','--self-test','--observe'].includes(mode),'UNSUPPORTED_MODE');
if(mode==='--self-test')selfTest();
if(mode==='--preflight')console.log('G2C_READ_ONLY_PREFLIGHT '+JSON.stringify(preflight()));
if(mode==='--observe'){
  preflight();
  // No platform-enforced network-deny mechanism is verified under this task's
  // allowlist. Environment scrub alone is not an OS network prohibition.
  assertNetworkDenied({verifiedDeny:false});
}
