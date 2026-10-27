import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import koffi from 'koffi';
import {F2B2_FIXED_PROOF} from './private-mvp-win32-native-binding.js';
import {
  F2H0_PINNED_LAUNCHER,
  type F2H0GatewayOsCalls,
  type F2H0PrivateControlPipes,
  type F2H0OwnedLauncherHandles,
  type F2H0LauncherBootstrapCopies,
} from './private-mvp-h0-win32-gateway-adapter.js';
import type {F2H0FixedRequest} from './private-mvp-h0-one-shot-gateway.js';
import {encodeF2H1PrivateFrames,decodeF2H1TransferReceipt} from './private-mvp-h1-wire.js';
import type {F2H1HeldReview} from './private-mvp-h1-win32-held-stage.js';
import {bindF2H0GatewayHandleSyscallsFromWin32,inspectAndRestrictF2H0GatewayTransfer} from './private-mvp-h0-win32-handle-proof.js';

/**
 * UNREGISTERED fixed Win32 Gateway source adapter. Only factory invocation
 * links to kernel32; no native calls are performed on module import or by
 * tests. It has no arbitrary process/path/argv/handle selectors.
 *
 * H1 NOT AUTHORIZED. Caller must independently establish a durable launch
 * claim, exact Desktop/Gateway/launcher heartbeat, complete stage and ACL
 * attestation, native authorization and root lifecycle ownership. This is
 * NOT a complete secure H1 integration simply because Win32 functions exist.
 * No renderer/MCP/production Runner obtains this constructor.
 */
const FILE = path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture.mjs');
const EXPECTED_ENTRY_SHA=F2B2_FIXED_PROOF.entrySha256;
const FILE_ID_INFO=18, JOB_ACCOUNTING=1, JOB_EXTENDED_LIMIT=9;
const CREATE_SUSPENDED=4, CREATE_NO_WINDOW=0x08000000;
const EXTENDED=0x80000, UNICODE_ENV=0x400;
const HANDLE_INHERIT=1, WAIT_OK=0, WAIT_TIMEOUT=0x102, STILL_ACTIVE=259;
const ATTR_HANDLE_LIST=0x20002;
const PROCESS_GATEWAY_RIGHTS=0x101040; // QUERY_LIMITED | DUP_HANDLE | SYNCHRONIZE
const JOB_DELEGATED_RIGHTS=0x10000d; // ASSIGN | QUERY | TERMINATE | SYNCHRONIZE
const STAGE_RIGHTS=0x120081; // READ_CONTROL|SYNCHRONIZE|FILE_READ_DATA|READ_ATTRIBUTES
const STAGE_OPEN=0x80000000 | 0x20000; // GENERIC_READ|READ_CONTROL
const OPEN_EXISTING=3, REPARSE_FLAG=0x200000, FILE_NORMAL=0x80;
const MAX_HOST_MS=8000;
const safe=(h:unknown):h is bigint=>typeof h==='bigint'&&h>0n&&h!==0xffffffffffffffffn;
type Native=(...args:any[])=>any;
const SA=koffi.struct('SUD_F2_H1_SA',{nLength:'uint32',lpSecurityDescriptor:'void *',bInheritHandle:'uint32'});
const SI=koffi.struct('SUD_F2_H1_SI',{
  cb:'uint32',lpReserved:'void *',lpDesktop:'void *',lpTitle:'void *',
  dwX:'uint32',dwY:'uint32',dwXSize:'uint32',dwYSize:'uint32',
  dwXCountChars:'uint32',dwYCountChars:'uint32',dwFillAttribute:'uint32',
  dwFlags:'uint32',wShowWindow:'uint16',cbReserved2:'uint16',
  lpReserved2:'void *',hStdInput:'void *',hStdOutput:'void *',hStdError:'void *',
});
const SIE=koffi.struct('SUD_F2_H1_SIE',{StartupInfo:SI,lpAttributeList:'void *'});
const PI=koffi.struct('SUD_F2_H1_PI',{
  hProcess:'void *',hThread:'void *',dwProcessId:'uint32',dwThreadId:'uint32',
});
const FILE_ID=koffi.struct('SUD_F2_H1_FILE_ID',{VolumeSerialNumber:'uint64',
  FileId:koffi.array('uint8',16)});
const ACCOUNTING=koffi.struct('SUD_F2_H1_ACCOUNTING',{
  TotalUserTime:'int64',TotalKernelTime:'int64',
  ThisPeriodTotalUserTime:'int64',ThisPeriodTotalKernelTime:'int64',
  TotalPageFaultCount:'uint32',TotalProcesses:'uint32',
  ActiveProcesses:'uint32',TotalTerminatedProcesses:'uint32',
});

export interface F2H1TrustedOwnedResources {
  /** Already-opened exact Gateway-owned worker Job HANDLE; never a PID. */
  readonly gatewayJob:bigint;
  /** Already admitted and durably claimed attempt; not a caller boolean. */
  readonly admittedAttempt:Readonly<F2H0FixedRequest>;
  /** Eight+ held exact fixed stage/ancestor/dependency OS objects, not an
   * assertion string; kept until independent worker Job cleanup. */
  readonly heldStage?:F2H1HeldReview;
  /** Independent OS stage reviewer must hold all ancestors/import closure. */
  stageLeaseHeld():boolean;
  /** Independent Desktop/Gateway peer and host watchdog must already be armed. */
  ownerPeersArmed():boolean;
}
function nativeFail(label:string):never {throw Error('F2H1_WIN32_'+label);}
function guard(value:unknown,label:string):void {
  if(value!==true&&value!==1) nativeFail(label);
}
function hashedFixed():string {
  const info=fs.lstatSync(F2H0_PINNED_LAUNCHER.path);
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>1024*1024) nativeFail('BINARY_METADATA');
  if(path.win32.normalize(fs.realpathSync.native(F2H0_PINNED_LAUNCHER.path)).toLowerCase()
     !== path.win32.normalize(F2H0_PINNED_LAUNCHER.path).toLowerCase()) nativeFail('BINARY_REPARSE');
  return createHash('sha256').update(fs.readFileSync(F2H0_PINNED_LAUNCHER.path)).digest('hex');
}
function encodePtr(ptr:any,type:any,value:Record<string,unknown>):void {koffi.encode(ptr,type,value);}
function ptr(raw:unknown):bigint {
  try {const n=BigInt(raw as string|number|bigint);if(safe(n))return n;}catch{/*reject*/}
  return nativeFail('INVALID_HANDLE');
}

/** Real Windows native-call implementation, NOT registered/constructed here.
 * The factory binds APIs ONLY on explicit invocation, and none were invoked
 * in this assignment. A mock of this factory cannot prove OS attestation.
 */
/** No H1 stage ACL enrollment or independent Desktop-host OS ownership exists.
 * A forged stageLeaseHeld/ownerPeersArmed boolean MUST NEVER reach Win32.
 * Unlike the C++ branch this denial does not need to preserve linker imports.
 */
export const F2H1_NATIVE_CREATION_GATE_OPEN=false as const;
export function createF2H1Win32HostCalls(owner:F2H1TrustedOwnedResources):F2H0GatewayOsCalls {
  if(!F2H1_NATIVE_CREATION_GATE_OPEN)
    throw Error('F2_H1_MISSING_NATIVE_STAGE_AND_INDEPENDENT_OWNER_PROOF');
  if(process.platform!=='win32'||process.arch!=='x64'||!safe(owner?.gatewayJob))
    nativeFail('OWNER_NOT_WIN32_X64');
  const k=koffi.load('kernel32.dll');
  const a=koffi.load('advapi32.dll');
  const fn=(lib:typeof k,name:string,out:string,args:any[]):Native=>lib.func('__stdcall',name,out,args);
  const C=fn(k,'CloseHandle','bool',['void *']);
  const createPipe=fn(k,'CreatePipe','bool',[
    koffi.out(koffi.pointer('void *')),koffi.out(koffi.pointer('void *')),'void *','uint32',
  ]);
  const flag=fn(k,'GetHandleInformation','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const setFlag=fn(k,'SetHandleInformation','bool',['void *','uint32','uint32']);
  const fileType=fn(k,'GetFileType','uint32',['void *']);
  const openFile=fn(k,'CreateFileW','void *',['str16','uint32','uint32','void *','uint32','uint32','void *']);
  const fileInfo=fn(k,'GetFileInformationByHandleEx','bool',['void *','int32','void *','uint32']);
  const getSecurity=fn(a,'GetSecurityInfo','uint32',['void *','uint32','uint32',
    koffi.out(koffi.pointer('void *')),'void *',
    koffi.out(koffi.pointer('void *')),'void *',koffi.out(koffi.pointer('void *'))]);
  const localFree=fn(k,'LocalFree','void *',['void *']);
  const init=fn(k,'InitializeProcThreadAttributeList','bool',['void *','uint32','uint32','void *']);
  const update=fn(k,'UpdateProcThreadAttribute','bool',['void *','uint32','size_t','void *',
    'size_t','void *','void *']);
  const del=fn(k,'DeleteProcThreadAttributeList','void',['void *']);
  const create=fn(k,'CreateProcessW','bool',['str16','void *','void *','void *','bool',
    'uint32','void *','str16','void *','void *']);
  const duplicate=fn(k,'DuplicateHandle','bool',['void *','void *','void *',
    koffi.out(koffi.pointer('void *')),'uint32','bool','uint32']);
  const self=fn(k,'GetCurrentProcess','void *',[]);
  const getPid=fn(k,'GetProcessId','uint32',['void *']);
  const resume=fn(k,'ResumeThread','uint32',['void *']);
  const write=fn(k,'WriteFile','bool',['void *','void *','uint32',koffi.out(koffi.pointer('uint32')),'void *']);
  const read=fn(k,'ReadFile','bool',['void *','void *','uint32',koffi.out(koffi.pointer('uint32')),'void *']);
  const peek=fn(k,'PeekNamedPipe','bool',['void *','void *','uint32','void *',
    koffi.out(koffi.pointer('uint32')),'void *']);
  const wait=fn(k,'WaitForSingleObject','uint32',['void *','uint32']);
  const exit=fn(k,'GetExitCodeProcess','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const kill=fn(k,'TerminateProcess','bool',['void *','uint32']);
  const killJob=fn(k,'TerminateJobObject','bool',['void *','uint32']);
  const queryJob=fn(k,'QueryInformationJobObject','bool',['void *','uint32','void *','uint32','void *']);
  const inJob=fn(k,'IsProcessInJob','bool',['void *','void *',koffi.out(koffi.pointer('uint32'))]);
  let pipes:F2H0PrivateControlPipes|undefined;
  let host:F2H0OwnedLauncherHandles|undefined;
  let heldEntry=0n;
  let attrScratch:any=null;
  let jobRemote=0n,stageRemote=0n,gateRemote=0n;
  let stageVolume=0n,stageFileId=Buffer.alloc(16);
  let rootOwner:readonly import('./private-mvp-h0-one-shot-gateway.js').F2H0HandleReceipt[]|undefined;
  let hostExited=false;
  let complete=false;
  const tracked=new Set<bigint>();
  const own=(h:bigint)=>{if(!safe(h))nativeFail('BAD_HANDLE');tracked.add(h);return h;};
  const close=(h:bigint)=>{
    if(!safe(h)||!tracked.has(h))return false;
    if(C(h)!==true)return false;tracked.delete(h);return true;
  };
  const inherited=(h:bigint)=>{
    const data=[0];guard(flag(h,data),'FLAGS');return (data[0]&HANDLE_INHERIT)!==0;
  };
  const attestLease=()=>{
    if(owner.stageLeaseHeld()!==true||owner.heldStage?.stillHeld()!==true
       ||owner.ownerPeersArmed()!==true)nativeFail('STAGE_OR_PEER_UNAVAILABLE');
    // Stage is opened with no sharing of delete/write, then held by Gateway
    // throughout OS creation. This is a partial OS witness: full ACL and
    // ancestor/import closure still require external trusted attestor.
    heldEntry=own(ptr(openFile(FILE,STAGE_OPEN,1,null,OPEN_EXISTING,FILE_NORMAL|REPARSE_FLAG,null)));
    const stage=koffi.alloc(FILE_ID,1);
    try{
      guard(fileInfo(heldEntry,FILE_ID_INFO,stage,koffi.sizeof(FILE_ID)),'FILE_ID');
      const data=koffi.decode(stage,FILE_ID) as {VolumeSerialNumber:bigint|number,FileId:number[]};
      stageVolume=BigInt(data.VolumeSerialNumber);
      stageFileId=Buffer.from(data.FileId);
      if(stageVolume===0n||stageFileId.length!==16||inherited(heldEntry))nativeFail('STAGE_OBJECT');
    }finally{koffi.free(stage);}
    const security=[null],ownerSid=[null],dacl=[null];
    if(getSecurity(heldEntry,1,0x00000001|0x00000004,ownerSid,null,dacl,null,security)!==0
      ||!ownerSid[0]||!dacl[0]||!security[0])nativeFail('STAGE_ACL');
    localFree(security[0]);
  };
  const packBootstrap=()=>{
    if(!safe(gateRemote)||!safe(jobRemote)||!safe(stageRemote)||!safe(stageVolume))
      nativeFail('BOOTSTRAP_INCOMPLETE');
    return {
      gatewayProcess:gateRemote,temporaryJob:jobRemote,
      heldEntry:stageRemote,stageVolume,stageFileId,
    };
  };
  const dupInto=(src:bigint,dest:bigint,rights:number)=>{
    const out=[null];
    guard(duplicate(self(),src,dest,out,rights,false,0),'DUPLICATE');
    return ptr(out[0]); // this is REMOTE, never CloseHandle locally
  };
  async function writeFully(handle:bigint,buffer:Buffer){
    let offset=0;
    while(offset<buffer.length){
      const sent=[0];
      guard(write(handle,buffer.subarray(offset),buffer.length-offset,sent,null),'WRITE');
      if(sent[0]<=0||sent[0]>buffer.length-offset)nativeFail('WRITE_COUNT');
      offset+=sent[0];
    }
  }
  async function readBounded(handle:bigint,count:number):Promise<Buffer|null>{
    const start=Date.now(),out=Buffer.alloc(count);
    let offset=0;
    while(offset<count&&Date.now()-start<MAX_HOST_MS){
      const available=[0];
      if(!peek(handle,null,0,null,available,null)){
        if(host&&wait(host.process,0)===WAIT_OK)return null;
        nativeFail('CONTROL_PIPE_BROKEN');
      }
      if(available[0]>0){
        const got=[0];
        const toRead=Math.min(available[0],count-offset);
        guard(read(handle,out.subarray(offset,offset+toRead),toRead,got,null),'READ');
        if(got[0]<=0||got[0]>toRead)nativeFail('READ_COUNT');
        offset+=got[0];
      }else{
        if(host&&wait(host.process,0)===WAIT_OK)return null;
        await new Promise<void>(resolve=>setTimeout(resolve,20));
      }
    }
    return offset===count?out:null;
  }
  const ensureLive=()=>{if(!owner.stageLeaseHeld()||!owner.heldStage?.stillHeld()
    ||!owner.ownerPeersArmed())
    nativeFail('OWNER_OR_STAGE_LOST');};
  return Object.freeze<F2H0GatewayOsCalls>({
    async binarySha256(){return hashedFixed();},
    async createFixedPrivatePipes(){
      ensureLive();
      if(pipes)nativeFail('PIPES_REPLAY');
      const sa=koffi.alloc(SA,1);
      try{
        encodePtr(sa,SA,{nLength:koffi.sizeof(SA),lpSecurityDescriptor:0n,bInheritHandle:1});
        const firstR=[null],firstW=[null],secondR=[null],secondW=[null];
        guard(createPipe(firstR,firstW,sa,4096),'CONTROL_INPUT_PIPE');
        const r=own(ptr(firstR[0])),w=own(ptr(firstW[0]));
        guard(createPipe(secondR,secondW,sa,4096),'CONTROL_OUTPUT_PIPE');
        const r2=own(ptr(secondR[0])),w2=own(ptr(secondW[0]));
        guard(setFlag(w,HANDLE_INHERIT,0),'GATEWAY_INPUT_NONINHERIT');
        guard(setFlag(r2,HANDLE_INHERIT,0),'GATEWAY_OUTPUT_NONINHERIT');
        pipes=Object.freeze({workerIn:r,workerOut:w2,gatewayIn:w,gatewayOut:r2});
        return pipes;
      }finally{koffi.free(sa);}
    },
    async verifyFixedControlPipeRoles(candidate){
      if(candidate!==pipes)return false;
      if(new Set(Object.values(candidate)).size!==4)return false;
      return [candidate.workerIn,candidate.workerOut,candidate.gatewayIn,candidate.gatewayOut]
        .every(h=>safe(h)&&fileType(h)===3)
        && inherited(candidate.workerIn)&&inherited(candidate.workerOut)
        && !inherited(candidate.gatewayIn)&&!inherited(candidate.gatewayOut);
    },
    async createSuspendedPinnedLauncher(exactPath,candidate){
      ensureLive();
      if(host||candidate!==pipes||exactPath!==F2H0_PINNED_LAUNCHER.path
         ||hashedFixed()!==F2H0_PINNED_LAUNCHER.sha256)nativeFail('LAUNCH_IDENTITY');
      attestLease();
      const needed=koffi.alloc('size_t',1);
      try{
        koffi.encode(needed,'size_t',0);
        init(null,1,0,needed);
        const n=Number(koffi.decode(needed,'size_t'));
        if(n<32||n>65536)nativeFail('ATTRIBUTE_SIZE');
        attrScratch=koffi.alloc('uint8',n);
        guard(init(attrScratch,1,0,needed),'ATTR_INIT');
        const list=koffi.alloc('void *',2);
        const startup=koffi.alloc(SIE,1);
        const output=koffi.alloc(PI,1);
        try{
          koffi.encode(list,koffi.array('void *',2),[candidate.workerIn,candidate.workerOut]);
          guard(update(attrScratch,0,ATTR_HANDLE_LIST,list,16,null,null),'HANDLE_LIST');
          encodePtr(startup,SIE,{
            StartupInfo:{
              cb:koffi.sizeof(SIE),lpReserved:0n,lpDesktop:0n,lpTitle:0n,
              dwX:0,dwY:0,dwXSize:0,dwYSize:0,dwXCountChars:0,dwYCountChars:0,
              dwFillAttribute:0,dwFlags:0x100,wShowWindow:0,cbReserved2:0,
              lpReserved2:0n,hStdInput:candidate.workerIn,hStdOutput:candidate.workerOut,
              hStdError:candidate.workerOut,
            },lpAttributeList:attrScratch,
          });
          // writable command line, exact target; no shell or caller argv
          const command=Buffer.from('"'+F2H0_PINNED_LAUNCHER.path+'"\0','utf16le');
          const env=Buffer.from('SystemRoot=C:\\Windows\0\0','utf16le');
          const fixedCwd=path.win32.dirname(F2H0_PINNED_LAUNCHER.path);
          guard(create(F2H0_PINNED_LAUNCHER.path,command,null,null,true,
            CREATE_SUSPENDED|CREATE_NO_WINDOW|EXTENDED|UNICODE_ENV,
            env,fixedCwd,startup,output),'CREATE_PINNED_SUSPENDED_HOST');
          const data=koffi.decode(output,PI) as {hProcess:unknown,hThread:unknown};
          host=Object.freeze({process:own(ptr(data.hProcess)),thread:own(ptr(data.hThread))});
          // Host owns inherited DUPLICATES; Gateway's launch ends are closed.
          if(!close(candidate.workerIn)||!close(candidate.workerOut))nativeFail('PIPE_PARENT_CLOSE');
          return host;
        }finally{koffi.free(list);koffi.free(startup);koffi.free(output);
          if(attrScratch){del(attrScratch);koffi.free(attrScratch);attrScratch=null;}
        }
      }finally{koffi.free(needed);}
    },
    async duplicateFixedGatewayAndJob(exactHost){
      ensureLive();
      if(exactHost!==host||!safe(heldEntry)||!safe(owner.gatewayJob)
         ||inherited(owner.gatewayJob)||inherited(heldEntry))nativeFail('DELEGATION_SCOPE');
      const peer=self() as bigint;
      gateRemote=dupInto(peer,exactHost.process,PROCESS_GATEWAY_RIGHTS);
      jobRemote=dupInto(owner.gatewayJob,exactHost.process,JOB_DELEGATED_RIGHTS);
      stageRemote=dupInto(heldEntry,exactHost.process,STAGE_RIGHTS);
      return Object.freeze(packBootstrap());
    },
    async writeEpochBoundFixedFrames(candidate,request,bootstrap){
      ensureLive();
      if(candidate!==pipes || !host || bootstrap.gatewayProcess!==gateRemote
          || bootstrap.temporaryJob!==jobRemote
          || request.missionId!==owner.admittedAttempt.missionId
          || request.attemptId!==owner.admittedAttempt.attemptId
          || request.ownerEpoch!==owner.admittedAttempt.ownerEpoch
          || !Object.keys(owner.admittedAttempt).every(k=>
              (request as unknown as Record<string,unknown>)[k]===
              (owner.admittedAttempt as unknown as Record<string,unknown>)[k]))
        nativeFail('STALE_ATTEMPT');
      const frames=encodeF2H1PrivateFrames(request,packBootstrap(),randomBytes(32));
      await writeFully(candidate.gatewayIn,frames);
      return true;
    },
    async resumeOnlyLaunchHost(exactHost){
      ensureLive();
      if(exactHost!==host)nativeFail('NOT_OWNED_HOST');
      const result=resume(exactHost.thread);
      return Number.isInteger(result)&&result===1;
    },
    async readFixedTransferFrame(candidate){
      if(candidate!==pipes||!host)return null;
      const raw=await readBounded(candidate.gatewayOut,24);
      return raw?decodeF2H1TransferReceipt(raw):null;
    },
    async restrictAndInspectTransferredHandles(receipt){
      if(!host||!owner.stageLeaseHeld()||!owner.heldStage?.stillHeld())nativeFail('NO_OWNER');
      const os=bindF2H0GatewayHandleSyscallsFromWin32(owner.gatewayJob);
      rootOwner=inspectAndRestrictF2H0GatewayTransfer(os,receipt);
      return rootOwner;
    },
    async waitForOwnedLauncherExit(exactHost){
      if(exactHost!==host||!rootOwner)return false;
      if(wait(exactHost.process,MAX_HOST_MS)!==WAIT_OK)return false;
      const code=[0];
      guard(exit(exactHost.process,code),'HOST_EXIT_CODE');
      hostExited=code[0]===0;
      return hostExited;
    },
    async confirmPermanentGatewayJob(receipts){
      if(!hostExited||receipts!==rootOwner || !owner.stageLeaseHeld()
         ||!owner.heldStage?.stillHeld()
         || !owner.ownerPeersArmed())return false;
      const accounting=koffi.alloc(ACCOUNTING,1);
      try {
        guard(queryJob(owner.gatewayJob,JOB_ACCOUNTING,accounting,koffi.sizeof(ACCOUNTING),null),'JOB_QUERY');
        const data=koffi.decode(accounting,ACCOUNTING) as {ActiveProcesses:number};
        if(data.ActiveProcesses!==1)return false;
        const belongs=[0];
        guard(inJob(rootOwner[0]!.value,owner.gatewayJob,belongs),'ROOT_IN_JOB');
        complete=belongs[0]===1;
        return complete;
      }finally{koffi.free(accounting);}
    },
    async terminateExactOwnedHostAndJob(){
      let okay=true;
      if(host&&!hostExited){
        if(kill(host.process,0xee)!==true)okay=false;
        if(wait(host.process,MAX_HOST_MS)!==WAIT_OK)okay=false;
      }
      if(killJob(owner.gatewayJob,0xee)!==true)okay=false;
      const acct=koffi.alloc(ACCOUNTING,1);
      try{
        if(!queryJob(owner.gatewayJob,JOB_ACCOUNTING,acct,koffi.sizeof(ACCOUNTING),null))okay=false;
        else if((koffi.decode(acct,ACCOUNTING) as {ActiveProcesses:number}).ActiveProcesses!==0)okay=false;
      }finally{koffi.free(acct);}
      return okay;
    },
    async closeOwnedTemporaryHandles(){
      let okay=true;
      // NEVER close permanent Job/root handles after successful handoff;
      // a separate owned lifetime controller must assume them before H1.
      for(const h of [...tracked]){
        if(complete && rootOwner?.some(v=>v.value===h))continue;
        try{if(!close(h))okay=false;}catch{okay=false;}
      }
      if(attrScratch){try{del(attrScratch);koffi.free(attrScratch);}catch{okay=false;}
        attrScratch=null;}
      return okay;
    },
  });
}
