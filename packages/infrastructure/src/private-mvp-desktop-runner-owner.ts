import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import koffi from 'koffi';
import {F2B2_FIXED_PROOF} from './private-mvp-win32-native-binding.js';
import {F2H0_FIXED_IDENTITY} from './private-mvp-h0-one-shot-gateway.js';
import {
  createF2H1DesktopOwnedSession,
  type F2H1DesktopOwnedSessionInput,
  type F2H1OwnedOsSession,
  type F2H1DesktopOwnedSessionPorts,
} from './private-mvp-desktop-owned-session.js';
import {createF2H1DesktopWin32PipeIo} from './private-mvp-desktop-pipe-io.js';
import {createF2H1DesktopGuardianWorker} from './private-mvp-desktop-guardian-worker.js';
import {verifyF2H1PinnedControllerClosure} from './private-mvp-h1-compiled-lock.js';

/**
 * F2-H1 Topology B. All Win32 OS creation is HARD-DISABLED for this code-only
 * assignment, including on explicit factory invocation. No PID adoption,
 * generalized argv/path/env, public DTO, or environment proof switch.
 *
 * Desktop owns Guardian/Runner/H0 references. Runner owns worker Job/H0.
 * The tunnel-spawned Gateway owns none of these and remains Kernel/Policy.
 */
export const F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED=false as const;
export const F2H1_TOPOLOGY_B=Object.freeze({
  revision:'f2-h1-desktop-runner-b-v1',
  stageFingerprint:createHash('sha256').update('f2-h1-desktop-runner-b-v1|'+F2H0_FIXED_IDENTITY.stageFingerprint).digest('hex'),
  recipeFingerprint:createHash('sha256').update('f2-h1-desktop-runner-b-v1|'+F2H0_FIXED_IDENTITY.recipeFingerprint).digest('hex'),
  executable:F2B2_FIXED_PROOF.executablePath,
  executableSha256:F2B2_FIXED_PROOF.executableSha256,
  desktopExecutable:'C:\\1.งานโด้\\SUD-D\\packages\\desktop\\node_modules\\electron\\dist\\electron.exe',
  desktopExecutableSha256:'1fcc9e4398b4fffe0d4d0fd133ccc49e223fae84ea6c5f5d82ff85923dc5a3ce',
  h0Executable:'C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2-h1-topology-b-candidate-20261008\\sud-d-f2-h0.exe',
  h0Sha256:'761daf6ad58a73d833fce6533f6fe2828796ff95e6e3c271bc987164359309e8',
  entry:'C:\\1.งานโด้\\SUD-D\\packages\\infrastructure\\dist\\private-mvp-runner-control-entry.js',
  entrySha256:'0a66738fa3fa2790b8e99013f856bcb9f81253dc8a811e491acfd8ea7c107f05', // local build artifact only; full import closure NOT reviewed
  handleList:Object.freeze(['runner-control-read','runner-control-write','desktop-process-query'] as const),
  guardian:Object.freeze({killOnClose:true,breakaway:false,inheritedByRunner:false}),
  worker:Object.freeze({jobOwner:'runner',resumeAuthorized:false,nestedGuardianRequired:true}),
  heartbeatMs:2000,leaseMs:8000,maxFrameBytes:4096,maxQueuedFrames:16,
  stageProfileOwner:'desktop' as const,
});
export {createF2H1RunnerControlProtocol} from './private-mvp-h1-control-protocol.js';
export type {F2H1RunnerControlFrame} from './private-mvp-h1-control-protocol.js';

/** Normal Desktop wiring is explicitly inert. Even a forged function
 * callback/epoch cannot turn a renderer/Gateway message into OS creation. */
export function createF2H1DesktopRunnerOwner() {
  // The production owner is created *after* startup journal recovery. In this
  // milestone it cannot acquire a native Job/PROCESS HANDLE at all; therefore
  // its only legitimate terminal outcome is NOT STARTED, never "OS cleanup
  // confirmed." Any future live state must carry exact source-owned handles
  // and independent zero-member evidence before downstream DB teardown.
  return Object.freeze({
    state:()=> 'inactive' as const,
    canCreateNative:()=> false as const,
    prepareNative:():never=>{throw Error('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');},
    shutdownEvidence:()=>Object.freeze({
      disposition:'not-started' as const,osStopProven:false as const,
    }),
    shutdown:async():Promise<boolean>=>true, // no native resources ever acquired
  });
}

/** Reviewed fixed CreateProcessW/Guardian Job source, never constructed today.
 * Creation-time PROC_THREAD_ATTRIBUTE_JOB_LIST is REQUIRED; assigning Runner
 * after it runs is forbidden. Here no syscall can occur while hard gate closed.
 *
 * The local source is a separate *proof target*, NOT production-wired launch.
 * Koffi x64 structs, nested Jobs, token checks, and OS lifetimes need native
 * tests under a later new Owner authorization.
 */
export function bindF2H1DesktopRunnerWin32() {
  if(!F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED)
    throw Error('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
  if(process.platform!=='win32'||process.arch!=='x64')
    throw Error('F2_H1_WINDOWS_X64_REQUIRED');
  const k=koffi.load('kernel32.dll');
  const fn=(name:string,ret:string,args:any[])=>
    k.func('__stdcall',name,ret,args);
  const createJob=fn('CreateJobObjectW','void *',['void *','void *']);
  const setJob=fn('SetInformationJobObject','bool',['void *','uint32','void *','uint32']);
  const inJob=fn('IsProcessInJob','bool',['void *','void *',koffi.out(koffi.pointer('uint32'))]);
  const initAttr=fn('InitializeProcThreadAttributeList','bool',['void *','uint32','uint32',koffi.out(koffi.pointer('size_t'))]);
  const updateAttr=fn('UpdateProcThreadAttribute','bool',['void *','uint32','size_t','void *','size_t','void *','void *']);
  const delAttr=fn('DeleteProcThreadAttributeList','void',['void *']);
  const create=fn('CreateProcessW','bool',['str16','void *','void *','void *','bool','uint32','void *','str16','void *','void *']);
  const createPipe=fn('CreatePipe','bool',[
    koffi.out(koffi.pointer('void *')),koffi.out(koffi.pointer('void *')),'void *','uint32']);
  const duplicate=fn('DuplicateHandle','bool',['void *','void *','void *',
    koffi.out(koffi.pointer('void *')),'uint32','bool','uint32']);
  const self=fn('GetCurrentProcess','void *',[]);
  const getFlags=fn('GetHandleInformation','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const close=fn('CloseHandle','bool',['void *']);
  const killJob=fn('TerminateJobObject','bool',['void *','uint32']);
  const wait=fn('WaitForSingleObject','uint32',['void *','uint32']);
  const getExit=fn('GetExitCodeProcess','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const query=fn('QueryInformationJobObject','bool',['void *','uint32','void *','uint32','void *']);
  const resume=fn('ResumeThread','uint32',['void *']);
  // PROC_THREAD_ATTRIBUTE_JOB_LIST (0x0002000d) + HANDLE_LIST (0x00020002)
  // must be installed before CreateProcessW; no after-creation assignment.
  const PROC_THREAD_ATTRIBUTE_JOB_LIST=0x0002000d;
  const PROC_THREAD_ATTRIBUTE_HANDLE_LIST=0x00020002;
  const CREATE_SUSPENDED=0x4,EXTENDED_STARTUPINFO_PRESENT=0x80000;
  // Hard-coded fixed recipe pins no inherited Job handle and exactly the
  // private channel inbound/outbound and least-rights Desktop reference.
  const allowed=F2H1_TOPOLOGY_B.handleList;
  // Only the fixed controller closure can be checked here, never caller-supplied
  // recipes or paths. The native Koffi binding must have its OWN enrolled
  // exact module identity before this check is a valid OS creation preflight.
  // The checked lock is a separate trusted root: it pins the compiled owner
  // itself, the entry, all reachable JS/Worker imports and the fixed Koffi addon.
  // An owner source file cannot securely include its own SHA-256 inline.
  function verifiedEntrypoint():void {
    // Retain the historical exact Runner executable pin. The compiled import
    // lock does not supersede executable identity or OS loader attestation.
    const exe=F2H1_TOPOLOGY_B.executable;
    if(!fs.existsSync(exe)||!fs.lstatSync(exe).isFile()
      ||createHash('sha256').update(fs.readFileSync(exe)).digest('hex')
        !==F2H1_TOPOLOGY_B.executableSha256)
      throw Error('F2_H1_CONTROLLER_EXECUTABLE_IDENTITY_MISMATCH');
    verifyF2H1PinnedControllerClosure(
      path.win32.resolve(path.win32.dirname(F2H1_TOPOLOGY_B.entry),'../../..'));
  }
  // Concrete fixed Win32 transaction. This method is inaccessible while the
  // factory's compile-time creation gate remains false. A future review MUST
  // independently authorize a real Mission+stage enrollment and full control
  // bootstrap before the gate changes. It never resumes even Runner.
  const SA=koffi.struct('SUD_F2_H1_B_SA',{
    nLength:'uint32',lpSecurityDescriptor:'void *',bInheritHandle:'uint32',
  });
  const SI=koffi.struct('SUD_F2_H1_B_SI',{
    cb:'uint32',lpReserved:'void *',lpDesktop:'void *',lpTitle:'void *',
    dwX:'uint32',dwY:'uint32',dwXSize:'uint32',dwYSize:'uint32',
    dwXCountChars:'uint32',dwYCountChars:'uint32',dwFillAttribute:'uint32',
    dwFlags:'uint32',wShowWindow:'uint16',cbReserved2:'uint16',
    lpReserved2:'void *',hStdInput:'void *',hStdOutput:'void *',hStdError:'void *',
  });
  const SIE=koffi.struct('SUD_F2_H1_B_SIE',{StartupInfo:SI,lpAttributeList:'void *'});
  const PI=koffi.struct('SUD_F2_H1_B_PI',{
    hProcess:'void *',hThread:'void *',dwProcessId:'uint32',dwThreadId:'uint32',
  });
  const BASIC=koffi.struct('SUD_F2_H1_B_BASIC',{
    PerProcessUserTimeLimit:'int64',PerJobUserTimeLimit:'int64',
    LimitFlags:'uint32',MinimumWorkingSetSize:'void *',MaximumWorkingSetSize:'void *',
    ActiveProcessLimit:'uint32',Affinity:'void *',PriorityClass:'uint32',SchedulingClass:'uint32',
  });
  const IO=koffi.struct('SUD_F2_H1_B_IO',{
    ReadOperationCount:'uint64',WriteOperationCount:'uint64',OtherOperationCount:'uint64',
    ReadTransferCount:'uint64',WriteTransferCount:'uint64',OtherTransferCount:'uint64',
  });
  const LIMIT=koffi.struct('SUD_F2_H1_B_LIMIT',{
    BasicLimitInformation:BASIC,IoInfo:IO,ProcessMemoryLimit:'void *',
    JobMemoryLimit:'void *',PeakProcessMemoryUsed:'void *',PeakJobMemoryUsed:'void *',
  });
  const ACCOUNT=koffi.struct('SUD_F2_H1_B_ACCOUNT',{
    TotalUserTime:'int64',TotalKernelTime:'int64',
    ThisPeriodTotalUserTime:'int64',ThisPeriodTotalKernelTime:'int64',
    TotalPageFaultCount:'uint32',TotalProcesses:'uint32',
    ActiveProcesses:'uint32',TotalTerminatedProcesses:'uint32',
  });
  const setFlags=fn('SetHandleInformation','bool',['void *','uint32','uint32']);
  const queryImage=fn('QueryFullProcessImageNameW','bool',
    ['void *','uint32','void *',koffi.out(koffi.pointer('uint32'))]);
  const processId=fn('GetProcessId','uint32',['void *']);
  const threadId=fn('GetThreadId','uint32',['void *']);
  const threadProcessId=fn('GetProcessIdOfThread','uint32',['void *']);
  const processSession=fn('ProcessIdToSessionId','bool',
    ['uint32',koffi.out(koffi.pointer('uint32'))]);
  const currentPid=fn('GetCurrentProcessId','uint32',[]);
  const openToken=koffi.load('advapi32.dll').func('__stdcall','OpenProcessToken',
    'bool',['void *','uint32',koffi.out(koffi.pointer('void *'))]);
  const tokenInfo=koffi.load('advapi32.dll').func('__stdcall','GetTokenInformation',
    'bool',['void *','uint32','void *','uint32',koffi.out(koffi.pointer('uint32'))]);
  const equalSid=koffi.load('advapi32.dll').func('__stdcall','EqualSid',
    'bool',['void *','void *']);
  const SID_AND_ATTRIBUTES=koffi.struct('SUD_F2_H1_B_SID_ATTR',{
    Sid:'void *',Attributes:'uint32',
  });
  const TOKEN_USER=koffi.struct('SUD_F2_H1_B_TOKEN_USER',{User:SID_AND_ATTRIBUTES});
  function rejectUnapprovedNative():void {
    if(!F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED)
      throw Error('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
  }
  const duplicateExactH0=fn('DuplicateHandle','bool',['void *','void *','void *',
    koffi.out(koffi.pointer('void *')),'uint32','bool','uint32']);
  const inGuardian=fn('IsProcessInJob','bool',
    ['void *','void *',koffi.out(koffi.pointer('uint32'))]);
  const handleFlags=fn('GetHandleInformation','bool',
    ['void *',koffi.out(koffi.pointer('uint32'))]);
  /**
   * Desktop PULLS from its already-owned exact Runner PROCESS object;
   * never OpenProcess/PID adoption. The remote local coordinate MUST come
   * from the authenticated fixed H0-created message/epoch, not MCP input.
   * Verify physical duplicated PROCESS HANDLE and Guardian membership
   * BEFORE replying with an H0-owned acknowledgment. This routine does not
   * create that channel or send an ACK and is never callable in this build.
   */
  function pullExactH0FromOwnedRunner(
    ownedRunner:bigint,desktopGuardian:bigint,
    authenticatedH0SourceCoordinate:bigint,
  ):never {
    rejectUnapprovedNative();
    const copy=[null];
    if(!validHandle(ownedRunner)||!validHandle(desktopGuardian)
      ||!validHandle(authenticatedH0SourceCoordinate))
      throw Error('F2_H1_B_UNTRUSTED_HANDLE_ORIGIN');
    if(duplicateExactH0(ownedRunner,authenticatedH0SourceCoordinate,self(),
      copy,0x101000,false,0)!==true)
      throw Error('F2_H1_B_H0_PROCESS_DUPLICATE_FAILED');
    const h=BigInt(copy[0] as unknown as bigint|number|string);
    let safeCleanup=false;
    try{
      const inherited=[0],member=[0];
      if(!validHandle(h)||handleFlags(h,inherited)!==true
        ||(inherited[0]&1)!==0
        ||inGuardian(h,desktopGuardian,member)!==true||member[0]!==1
        ||wait(h,0)!==0x102)
        throw Error('F2_H1_B_H0_ORIGIN_GUARDIAN_INVALID');
      const image=Buffer.alloc(65536),chars=[32768];
      if(queryImage(h,0,image,chars)!==true
        ||path.win32.normalize(image.subarray(0,chars[0]*2).toString('utf16le')).toLowerCase()
        !==path.win32.normalize(F2H1_TOPOLOGY_B.h0Executable).toLowerCase())
        throw Error('F2_H1_B_H0_IMAGE_INVALID');
      // A copy and image check alone does not prove the exact creation
      // epoch/thread/stage ownership. Wait for a separate authenticated
      // Desktop acknowledgment protocol and independent HANDLE mapping.
      throw Error('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
    }finally{
      try{safeCleanup=close(h)===true;}catch{safeCleanup=false;}
      if(!safeCleanup)throw Error('F2_H1_B_H0_DUP_CLEANUP_UNKNOWN_QUARANTINE');
    }
  }
  const validHandle=(h:unknown):h is bigint=>typeof h==='bigint'
    &&h>0n&&h!==0xffffffffffffffffn;
  const asHandle=(value:unknown):bigint=>{
    const h=BigInt(value as bigint|number|string);
    if(!validHandle(h))throw Error('F2_H1_B_BAD_NATIVE_HANDLE');
    return h;
  };
  const requireTrue=(value:unknown,why:string):void=>{
    if(value!==true)throw Error('F2_H1_B_'+why);
  };
  function fixedTokenMatchesCurrentNonElevated(child:bigint):boolean {
    const tokens:bigint[]=[];
    const buffers:any[]=[];
    try {
      function get(h:bigint):{readonly sid:unknown;readonly elevated:number} {
        const out=[null];
        requireTrue(openToken(h,0x0008,out),'TOKEN_QUERY');
        const token=asHandle(out[0]);tokens.push(token);
        const elevation=koffi.alloc('uint32',1);buffers.push(elevation);
        const length=[0];
        requireTrue(tokenInfo(token,20,elevation,4,length),'TOKEN_ELEVATION');
        const elevated=Number(koffi.decode(elevation,'uint32'));
        // Windows TOKEN_USER uses a pointer-sized SID_AND_ATTRIBUTES member.
        tokenInfo(token,1,null,0,length);
        if(length[0]<koffi.sizeof(TOKEN_USER)||length[0]>16384)
          throw Error('F2_H1_B_TOKEN_USER_BOUNDS');
        const user=koffi.alloc('uint8',length[0]);buffers.push(user);
        requireTrue(tokenInfo(token,1,user,length[0],length),'TOKEN_USER');
        const decoded=koffi.decode(user,TOKEN_USER) as {User:{Sid:unknown}};
        if(!decoded?.User?.Sid)throw Error('F2_H1_B_NO_OS_SID');
        return {sid:decoded.User.Sid,elevated};
      }
      // GetCurrentProcess() is the sole permitted pseudo HANDLE here: the
      // calling process owns it; remote H0/Runner object checks reject pseudo.
      const desktop=get(BigInt(self() as bigint|number|string));
      const runner=get(child);
      return desktop.elevated===0&&runner.elevated===0
        &&equalSid(desktop.sid,runner.sid)===true;
    } finally {
      let allClosed=true;
      for(const handle of tokens)try{if(close(handle)!==true)allClosed=false;}catch{allClosed=false;}
      for(const buffer of buffers)koffi.free(buffer);
      if(!allClosed)throw Error('F2_H1_B_TOKEN_HANDLE_CLEANUP_UNKNOWN_QUARANTINE');
    }
  }
  function prepareFixedGuardianAndSuspendedRunner():F2H1OwnedOsSession {
    // This one-way gate is ALSO hardcoded. No future caller-provided boolean,
    // fake OS port or epoch string can cause a Win32 creation in this build.
    rejectUnapprovedNative();
    verifiedEntrypoint(); // always refuses unreviewed import/owner closure
    const allocated:any[]=[];
    const held=new Set<bigint>();
    let guardian=0n,runner=0n,thread=0n,attributes:any=null;
    let created=false,confirmed=true,handedOff=false;
    const alloc=(t:any,n=1)=>{const value=koffi.alloc(t,n);allocated.push(value);return value;};
    const hold=(v:unknown)=>{const h=asHandle(v);held.add(h);return h;};
    const closeHeld=(h:bigint)=>{
      if(!held.has(h)||close(h)!==true)return false;
      held.delete(h);return true;
    };
    try {
      // Guardian has no name, no breakaway or silent nested-Job fallback.
      guardian=hold(createJob(null,null));
      const flags=[0];
      requireTrue(getFlags(guardian,flags),'GUARDIAN_FLAGS');
      if((flags[0]&1)!==0)throw Error('F2_H1_B_GUARDIAN_INHERITED');
      const limit=alloc(LIMIT);
      koffi.encode(limit,LIMIT,{
        BasicLimitInformation:{
          PerProcessUserTimeLimit:0,PerJobUserTimeLimit:0,
          LimitFlags:0x2000|0x8,MinimumWorkingSetSize:0,MaximumWorkingSetSize:0,
          ActiveProcessLimit:10,Affinity:0,PriorityClass:0,SchedulingClass:0,
        },
        IoInfo:{ReadOperationCount:0,WriteOperationCount:0,OtherOperationCount:0,
          ReadTransferCount:0,WriteTransferCount:0,OtherTransferCount:0},
        ProcessMemoryLimit:0,JobMemoryLimit:0,PeakProcessMemoryUsed:0,PeakJobMemoryUsed:0,
      });
      requireTrue(setJob(guardian,9,limit,koffi.sizeof(LIMIT)),'GUARDIAN_LIMITS');
      const sa=alloc(SA);
      koffi.encode(sa,SA,{nLength:koffi.sizeof(SA),lpSecurityDescriptor:0n,bInheritHandle:1});
      const childRead=[null],parentWrite=[null],parentRead=[null],childWrite=[null];
      requireTrue(createPipe(childRead,parentWrite,sa,4096),'PIPE_DESKTOP_TO_RUNNER');
      const pipeToRunner=hold(childRead[0]),desktopWrites=hold(parentWrite[0]);
      requireTrue(createPipe(parentRead,childWrite,sa,4096),'PIPE_RUNNER_TO_DESKTOP');
      const desktopReads=hold(parentRead[0]),pipeFromRunner=hold(childWrite[0]);
      requireTrue(setFlags(desktopWrites,1,0),'PARENT_WRITE_NOT_INHERITED');
      requireTrue(setFlags(desktopReads,1,0),'PARENT_READ_NOT_INHERITED');
      const desktopReference=[null];
      requireTrue(duplicate(self(),self(),self(),desktopReference,
        0x101000,true,0),'FIXED_DESKTOP_REFERENCE');
      const desktop=hold(desktopReference[0]);
      requireTrue(getFlags(desktop,flags),'DESKTOP_REF_FLAGS');
      if((flags[0]&1)!==1)throw Error('F2_H1_B_DESKTOP_REF_NOT_INHERITABLE');
      // JOB_LIST and HANDLE_LIST must exist in the SAME creation call. No
      // post-CREATE AssignProcessToJobObject allowed for the Runner.
      const needed=alloc('size_t');
      koffi.encode(needed,'size_t',0);
      initAttr(null,2,0,needed);
      const n=Number(koffi.decode(needed,'size_t'));
      if(n<32||n>65536)throw Error('F2_H1_B_JOB_LIST_UNAVAILABLE');
      attributes=alloc('uint8',n);
      requireTrue(initAttr(attributes,2,0,needed),'ATTRIBUTE_INIT');
      const jobPtr=alloc('void *');
      koffi.encode(jobPtr,'void *',guardian);
      requireTrue(updateAttr(attributes,0,PROC_THREAD_ATTRIBUTE_JOB_LIST,
        jobPtr,8,null,null),'JOB_LIST_REQUIRED');
      const allow=alloc('void *',3);
      koffi.encode(allow,koffi.array('void *',3),
        [pipeToRunner,pipeFromRunner,desktop]);
      requireTrue(updateAttr(attributes,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
        allow,24,null,null),'EXACT_HANDLE_LIST_REQUIRED');
      const si=alloc(SIE),pi=alloc(PI);
      koffi.encode(si,SIE,{
        StartupInfo:{
          cb:koffi.sizeof(SIE),lpReserved:0n,lpDesktop:0n,lpTitle:0n,
          dwX:0,dwY:0,dwXSize:0,dwYSize:0,dwXCountChars:0,dwYCountChars:0,
          dwFillAttribute:0,dwFlags:0x100,wShowWindow:0,cbReserved2:0,
          lpReserved2:0n,hStdInput:pipeToRunner,
          hStdOutput:pipeFromRunner,hStdError:pipeFromRunner,
        },
        lpAttributeList:attributes,
      });
      const command=Buffer.from('"'+F2H1_TOPOLOGY_B.executable+
        '" "'+F2H1_TOPOLOGY_B.entry+'"\0','utf16le');
      const env=Buffer.from('SystemRoot=C:\\Windows\0\0','utf16le');
      requireTrue(create(F2H1_TOPOLOGY_B.executable,command,null,null,true,
        CREATE_SUSPENDED|EXTENDED_STARTUPINFO_PRESENT|0x08000000|0x400,
        env,path.win32.dirname(F2H1_TOPOLOGY_B.entry),si,pi),
        'CREATE_SUSPENDED_WITH_GUARDIAN_AT_BIRTH');
      created=true;
      const native=koffi.decode(pi,PI) as {
        hProcess:unknown;hThread:unknown;dwProcessId:number;dwThreadId:number;
      };
      runner=hold(native.hProcess);thread=hold(native.hThread);
      // Exact creation-origin PROCESS and primary THREAD handles. Neither
      // a PID lookup nor OpenProcess/OpenThread is permitted here.
      const pid=processId(runner),tid=threadId(thread);
      const desktopSession=[0],runnerSession=[0];
      if(pid<=0||tid<=0||pid!==native.dwProcessId
        ||tid!==native.dwThreadId||threadProcessId(thread)!==pid
        ||processSession(pid,runnerSession)!==true
        ||processSession(currentPid(),desktopSession)!==true
        ||runnerSession[0]!==desktopSession[0]
        ||wait(runner,0)!==0x102)
        throw Error('F2_H1_B_CREATION_PROCESS_THREAD_SESSION_UNVERIFIED');
      const joined=[0];
      requireTrue(inJob(runner,guardian,joined),'IS_RUNNER_IN_GUARDIAN');
      if(joined[0]!==1||processId(runner)<=0
        ||!fixedTokenMatchesCurrentNonElevated(runner))
        throw Error('F2_H1_B_OS_PROCESS_TOKEN_OR_JOB_MISMATCH');
      const name=Buffer.alloc(65536);const chars=[32768];
      requireTrue(queryImage(runner,0,name,chars),'RUNNER_IMAGE_QUERY');
      if(path.win32.normalize(name.subarray(0,chars[0]*2).toString('utf16le')).toLowerCase()
         !==path.win32.normalize(F2H1_TOPOLOGY_B.executable).toLowerCase())
        throw Error('F2_H1_B_RUNNER_IMAGE_MISMATCH');
      if(!closeHeld(pipeToRunner)||!closeHeld(pipeFromRunner)||!closeHeld(desktop))
        throw Error('F2_H1_B_UNCONFIRMED_LAUNCH_COPIES');
      // Transfer EXACT creation-origin Job/PROCESS/THREAD and parent pipe
      // HANDLEs to the one internal Desktop Session. No Runner resume here.
      // The authorized Session MUST arm its independent watchdog and pipe
      // workers first; production remains unable to bind this factory.
      const owner:F2H1OwnedOsSession=Object.freeze({
        guardian,runner,thread,desktopReference:desktop,
        desktopReads,desktopWrites,
        resumeControlThread() {
          // One CREATE_SUSPENDED primary thread must have suspend count 1.
          // Count 0 or >1 is NOT the reviewed creation-origin transition.
          if(resume(thread)!==1)
            throw Error('F2_H1_B_RUNNER_CONTROL_RESUME_COUNT_UNVERIFIED');
        },
        terminateGuardian:()=>killJob(guardian,0xef)===true,
        waitExactRunnerExit(maxMs:number):boolean {
          if(!Number.isSafeInteger(maxMs)||maxMs<0||maxMs>5000)return false;
          return wait(runner,maxMs)===0 && getExit(runner,[0])===true;
        },
        queryGuardianZeroMembers():boolean {
          const account=koffi.alloc(ACCOUNT,1);
          try{return query(guardian,1,account,koffi.sizeof(ACCOUNT),null)===true
            && Number((koffi.decode(account,ACCOUNT) as {ActiveProcesses:number}).ActiveProcesses)===0;}
          finally{koffi.free(account);}
        },
        closeAllOwnedHandles():boolean {
          let all=true;
          // Child inherited pipe handles and parent Desktop reference were
          // already closed locally; those exact child copies die on process exit.
          for(const h of [thread,runner,desktopReads,desktopWrites,guardian]){
            if(held.has(h) && !closeHeld(h))all=false;
          }
          return all&&held.size===0;
        },
      });
      handedOff=true;
      return owner;
    } finally {
      if(attributes)try{delAttr(attributes);}catch{confirmed=false;}
      for(const mem of allocated.reverse())try{koffi.free(mem);}catch{confirmed=false;}
      if(created&&(!handedOff||!confirmed)){
        try{if(!guardian||killJob(guardian,0xef)!==true)confirmed=false;}
        catch{confirmed=false;}
        try{if(!runner||wait(runner,5000)!==0)confirmed=false;}
        catch{confirmed=false;}
        try{
          const accounting=koffi.alloc(ACCOUNT,1);
          try{if(query(guardian,1,accounting,koffi.sizeof(ACCOUNT),null)!==true
            ||Number((koffi.decode(accounting,ACCOUNT) as {ActiveProcesses:number}).ActiveProcesses)!==0)
            confirmed=false;
          }finally{koffi.free(accounting);}
        }catch{confirmed=false;}
      }
      if(!handedOff||!confirmed)for(const h of Array.from(held).reverse()){
        try{if(!closeHeld(h))confirmed=false;}catch{confirmed=false;}
      }
      if(!confirmed)throw Error('F2_H1_B_GUARDIAN_CLEANUP_UNKNOWN_QUARANTINE');
    }
  }

  return Object.freeze({
    verifiedEntrypoint,
    prepareFixedGuardianAndSuspendedRunner,
    /** The ONLY native assembly route: pending journal precedes OS creation.
     * Not registered in Desktop/MCP and gated at this Win32 factory. */
    createFixedDesktopSession(input:F2H1DesktopOwnedSessionInput,
      admission:F2H1DesktopOwnedSessionPorts['admission']) {
      return createF2H1DesktopOwnedSession(input,{
        admission,
        createSuspended:prepareFixedGuardianAndSuspendedRunner,
        pipe:createF2H1DesktopWin32PipeIo(),
        watchdog:createF2H1DesktopGuardianWorker(),
      });
    },
    pullExactH0FromOwnedRunner,
    nativeProofAvailable:false as const,
    // All imports are intentionally referenced; a future tightly-scoped
    // implementation must validate the ABI and implement zero-gap creation.
    attributeConstants:Object.freeze({
      PROC_THREAD_ATTRIBUTE_JOB_LIST,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
      CREATE_SUSPENDED,EXTENDED_STARTUPINFO_PRESENT,allowed,
    }),
    // Prevent a dead-code mock from masquerading as complete native support.
    readiness:()=>false as const,
    // Never expose generic Win32 primitives through the fixed owner module.
    // The reviewed creation transaction is NOT assembled or authorized yet.
  });
}
