import koffi from 'koffi';
import {createHmac,timingSafeEqual} from 'node:crypto';
import type {
  PrivateMvpWatchExactHost,PrivateMvpWatchExactPeer,
  PrivateMvpWatchOwnedJob,PrivateMvpPeerHeartbeat,
} from './private-mvp-owned-peer-watchdog.js';

/**
 * H1 exact-process/Job observation source (NO process/job creation).
 * Factory binds kernel32 lazily and requires *already-owned exact* HANDLEs,
 * not PID lookup. It cannot prove that a Desktop process independently owns
 * the Gateway + launcher or that its private channel is authenticated.
 * Not production registered. Mocked peers never grant H1 native authority.
 */
export const F2H1_OS_OWNERSHIP_PROOF_AVAILABLE=false as const;
const validHandle=(h:unknown):h is bigint=>typeof h==='bigint'
  && h>0n && h!==0xffffffffffffffffn;
export interface F2H1ExactProcessSet {
  readonly desktopProcess:bigint;
  readonly gatewayProcess:bigint;
  readonly launchHostProcess:bigint;
  readonly permanentWorkerJob:bigint;
  readonly ownerEpoch:string;
}
export interface F2H1ExactObservedPeers {
  readonly desktop:PrivateMvpWatchExactPeer;
  readonly gateway:PrivateMvpWatchExactPeer;
  readonly host:PrivateMvpWatchExactHost;
  readonly workerJob:PrivateMvpWatchOwnedJob;
  readonly nativeProofAvailable:false;
}
const ACCOUNT=koffi.struct('SUD_F2_H1_JOB_ACCOUNT',{
  TotalUserTime:'int64',TotalKernelTime:'int64',
  ThisPeriodTotalUserTime:'int64',ThisPeriodTotalKernelTime:'int64',
  TotalPageFaultCount:'uint32',TotalProcesses:'uint32',
  ActiveProcesses:'uint32',TotalTerminatedProcesses:'uint32',
});

/** Bind ONLY supplied already-owned OS process and Job HANDLEs, all
 * non-inheritable; never call OpenProcess/PID adoption/CreateJobObject.
 * Desktop must independently duplicate/hold exact Gateway and launcher OS
 * handles BEFORE the host is resumed; that integration does not exist yet.
 */
export function bindF2H1ExactOwnedPeers(
  pinned:F2H1ExactProcessSet,
):F2H1ExactObservedPeers {
  if(process.platform!=='win32'||process.arch!=='x64'
    ||!pinned||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(pinned.ownerEpoch))
    throw Error('F2_H1_OWNER_EPOCH_OR_PLATFORM');
  const handles=[
    pinned.desktopProcess,pinned.gatewayProcess,
    pinned.launchHostProcess,pinned.permanentWorkerJob,
  ];
  if(handles.some(h=>!validHandle(h))||new Set(handles).size!==handles.length)
    throw Error('F2_H1_EXACT_HANDLE_ROLES');
  const k=koffi.load('kernel32.dll');
  const fn=(name:string,result:string,args:any[])=>
    k.func('__stdcall',name,result,args);
  const getFlags=fn('GetHandleInformation','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const getPid=fn('GetProcessId','uint32',['void *']);
  const wait=fn('WaitForSingleObject','uint32',['void *','uint32']);
  const code=fn('GetExitCodeProcess','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const query=fn('QueryInformationJobObject','bool',['void *','uint32','void *','uint32','void *']);
  const terminate=fn('TerminateJobObject','bool',['void *','uint32']);
  const noninherited=(h:bigint)=>{
    const f=[0];return getFlags(h,f)===true&&(f[0]&1)===0;
  };
  if(handles.some(h=>!noninherited(h)))throw Error('F2_H1_INHERITABLE_OWNER_HANDLE');
  const pid=(h:bigint)=>Number(getPid(h));
  const ids=[
    pid(pinned.desktopProcess),pid(pinned.gatewayProcess),
    pid(pinned.launchHostProcess),
  ];
  if(ids.some(n=>!Number.isSafeInteger(n)||n<=0)||new Set(ids).size!==ids.length)
    throw Error('F2_H1_UNTRUSTED_SAME_OR_UNKNOWN_PROCESS');
  const alive=(h:bigint):'alive'|'exited'|'unknown'=> {
    try{
      if(!noninherited(h))return 'unknown';
      const w=Number(wait(h,0));
      const ec=[0];
      if(code(h,ec)!==true)return 'unknown';
      if(w===0&&ec[0]!==259)return 'exited';
      if(w===0x102&&ec[0]===259)return 'alive';
      return 'unknown';
    }catch{return 'unknown';}
  };
  const active=():number=>{
    const p=koffi.alloc(ACCOUNT,1);
    try{
      if(query(pinned.permanentWorkerJob,1,p,koffi.sizeof(ACCOUNT),null)!==true)
        return -1;
      const n=Number((koffi.decode(p,ACCOUNT) as {ActiveProcesses:number}).ActiveProcesses);
      return Number.isSafeInteger(n)?n:-1;
    }finally{koffi.free(p);}
  };
  const epoch=pinned.ownerEpoch;
  const peers=Object.freeze<F2H1ExactObservedPeers>({
    desktop:Object.freeze({kind:'owned-desktop-process' as const,ownerEpoch:epoch,
      alive:()=>alive(pinned.desktopProcess)}),
    gateway:Object.freeze({kind:'owned-gateway-process' as const,ownerEpoch:epoch,
      alive:()=>alive(pinned.gatewayProcess)}),
    host:Object.freeze({kind:'owned-one-shot-host-process' as const,ownerEpoch:epoch,
      alive:()=>alive(pinned.launchHostProcess)}),
    workerJob:Object.freeze({
      kind:'owned-worker-job' as const,ownerEpoch:epoch,
      alive:()=>{
        try{const count=active();return count>=0?'alive':'unknown';}
        catch{return 'unknown';}
      },
      async terminateAndConfirm(){
        try{
          if(terminate(pinned.permanentWorkerJob,0xee)!==true)return false;
          // Never return a false clean stop while an active Job member lives.
          // External owned deadline controller performs bounded rechecks;
          // zero now is necessary, not proof of profile/stage rollback.
          return active()===0;
        }catch{return false;}
      },
    }),
    nativeProofAvailable:false,
  });
  return peers;
}

/**
 * Private-channel MAC over exact fixed roles, nonce and owner epoch.
 * A caller-provided MAC cannot certify OS process ownership; constructor
 * requires a secret shared only by separately trusted Desktop/Gateway peers.
 * That OS channel establishment is still an H1 BLOCKER.
 */
export interface F2H1AuthenticatedBeat extends PrivateMvpPeerHeartbeat {
  readonly role:'desktop'|'gateway';
  readonly challenge:string; // exactly 32 bytes hex, pinned per epoch
  readonly mac:string; // HMAC-SHA-256
}
export function createF2H1EpochHeartbeatVerifier(input:{
  readonly ownerEpoch:string;
  readonly peerRole:'desktop'|'gateway';
  readonly challenge:string;
  readonly secret:Uint8Array;
}):(beat:F2H1AuthenticatedBeat)=>boolean {
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.ownerEpoch)
    ||!/^[0-9a-f]{64}$/.test(input.challenge)
    ||input.secret.length!==32)throw Error('F2_H1_PEER_EPOCH_KEY_UNAVAILABLE');
  const key=Buffer.from(input.secret);
  let last=0;
  return beat=>{
    if(!beat||beat.ownerEpoch!==input.ownerEpoch||beat.role!==input.peerRole
      ||beat.challenge!==input.challenge
      ||!Number.isSafeInteger(beat.sequence)||beat.sequence<=last
      ||!(/^[0-9a-f]{64}$/.test(beat.mac)))return false;
    const content=[
      'F2H1-PEER-HEARTBEAT-V1',input.ownerEpoch,input.peerRole,
      input.challenge,String(beat.sequence),
    ].join('|');
    const expected=createHmac('sha256',key).update(content).digest();
    const supplied=Buffer.from(beat.mac,'hex');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))
      return false;
    last=beat.sequence;
    return true;
  };
}
