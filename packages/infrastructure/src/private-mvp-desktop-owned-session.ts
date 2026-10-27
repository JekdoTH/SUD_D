import {randomBytes} from 'node:crypto';
import {createF2H1RunnerControlProtocol,F2H1_FIXED_FRAME_BYTES,
  createF2H1PrivateControlV2,createF2H1V2DesktopH0AckOrdering,
} from './private-mvp-h1-control-protocol.js';
import type {F2H1ControlV2Frame,F2H1ControlV2Prepare,
  F2H1H0AckExpected,F2H1H0PhysicalEvidence} from './private-mvp-h1-control-protocol.js';
import type {
  PrivateMvpMissionAdmissionRepository, PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';
import {finishF2H1VerifiedOwnedOsStop} from './private-mvp-h1-native-cleanup-proof.js';

/**
 * One internal, non-production Desktop-owned Controller transaction.
 * Every implementation, including the Win32 factory, uses this SAME state
 * machine. No renderer/MCP route can construct its OS owner.
 * All injected ports stand for the exact handles returned by CreateProcessW.
 */
export interface F2H1OwnedOsSession {
  readonly guardian:bigint;
  readonly runner:bigint;
  readonly thread:bigint;
  readonly desktopReference:bigint;
  readonly desktopReads:bigint;
  readonly desktopWrites:bigint;
  /** Resume only the creation-origin CONTROL thread. */
  resumeControlThread():void;
  terminateGuardian():boolean;
  waitExactRunnerExit(maxMs:number):boolean;
  queryGuardianZeroMembers():boolean;
  /** Must verify CloseHandle success for EVERY retained handle. */
  closeAllOwnedHandles():boolean;
}
export interface F2H1DesktopPipeIo {
  /** Arm workers against the exact TWO returned parent pipe handles. */
  arm(readHandle:bigint,writeHandle:bigint):Promise<void>;
  send(bytes:Uint8Array):Promise<void>;
  nextFrame():Promise<Uint8Array>;
  /** Bounded drain and acknowledgement; never re-use handles after uncertainty. */
  shutdown():Promise<boolean>;
}
export interface F2H1IndependentGuardian {
  /** Resolve only after independent scheduling and OS handle preflight. */
  arm(guardian:bigint,runner:bigint):Promise<void>;
  authenticatedHeartbeat():void;
  /** Watcher stays armed until the exact OS kill/wait/zero checks complete. */
  shutdown():Promise<boolean>;
}

export interface F2H1DesktopOwnedSessionInput {
  readonly scope:PrivateMvpMissionScope;
  readonly attemptId:string;
  readonly ownerEpoch:string;
  readonly stageSealDigest:string;
}
export interface F2H1DesktopOwnedSessionPorts {
  readonly admission:Pick<PrivateMvpMissionAdmissionRepository,
    'claimNativePreparation'|'markNativeOwned'|'markNativeTerminated'|
    'markNativeCleanupUnknown'|'confirmNativeCleanupFromOwnedOs'>;
  readonly createSuspended:()=>F2H1OwnedOsSession;
  readonly pipe:F2H1DesktopPipeIo;
  readonly watchdog:F2H1IndependentGuardian;
  readonly now?:()=>number;
}
export type F2H1CleanupEvidence =
  |{readonly disposition:'not-started';readonly osStopProven:false}
  |{readonly disposition:'cleanup-unconfirmed';readonly osStopProven:false}
  |{readonly disposition:'verified-cleaned';readonly osStopProven:true};

// The one-use proof is package-private and never serialized.
const digest=/^[0-9a-f]{64}$/;
const identifier=/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const HEARTBEAT_MS=2000,LEASE_MS=8000;
const BOOTSTRAP_MS=5000;
const STOP_MS=5000;
const CLEANUP_MS=30_000;
function bounded<T>(promise:Promise<T>|T,ms:number,reason:string):Promise<T> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error(reason)),ms);}),
  ]).finally(()=>{if(timer)clearTimeout(timer);});
}
function requireJournal(value:{ok:boolean},kind:string):void {
  if(value.ok!==true)throw Error('F2_H1_JOURNAL_'+kind+'_UNCONFIRMED');
}
/** Fixed Desktop private-pipe writer shared by V1 diagnostic and inert V2.
 * A successful write is local IO only, never a Runner receipt or OS proof. */
function encodeF2H1PrivatePipeFrame(data:unknown):Uint8Array {
  const bytes=Buffer.from(JSON.stringify(data)+'\n','utf8');
  if(bytes.length>F2H1_FIXED_FRAME_BYTES)
    throw Error('F2_H1_CONTROLLER_FRAME_TOO_LARGE');
  return bytes;
}
export function createF2H1DesktopOwnedSession(
  input:F2H1DesktopOwnedSessionInput,ports:F2H1DesktopOwnedSessionPorts,
) {
  // Shape-check ORIGINAL caller record before taking a detached snapshot:
  // projecting ten known fields without this check would launder extra keys.
  // F2-A admission retains canonical ISO, resource-policy, expiry and DB authority.
  const supplied=input?.scope;
  const keys=['missionId','revision','goalDigest','workspaceId',
    'workspaceGeneration','runnerId','executionFingerprint','inputDigest',
    'resourcePolicyIdentity','expiresAt'].sort();
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)
    ||Object.keys(supplied).sort().join('|')!==keys.join('|')
    ||!Number.isSafeInteger(supplied.revision)||supplied.revision<=0
    ||!['missionId','goalDigest','workspaceId','workspaceGeneration','runnerId',
      'executionFingerprint','inputDigest','resourcePolicyIdentity','expiresAt']
      .every(k=>typeof supplied[k as keyof PrivateMvpMissionScope]==='string')
    ||!identifier.test(input.ownerEpoch)||!identifier.test(input.attemptId)
    ||!digest.test(input.stageSealDigest)
    ||!identifier.test(supplied.missionId)
    ||!digest.test(supplied.executionFingerprint))
    throw Error('F2_H1_UNTRUSTED_OWNED_SESSION_BINDING');
  // Copy all ten scalar fields by value. Never freeze or mutate the caller.
  // Thereafter every claim, protocol frame, bootstrap and cleanup uses this
  // exact one-use immutable attempt/epoch/seal/scope snapshot.
  const frozen=Object.freeze({
    scope:Object.freeze({
      missionId:supplied.missionId,
      revision:supplied.revision,
      goalDigest:supplied.goalDigest,
      workspaceId:supplied.workspaceId,
      workspaceGeneration:supplied.workspaceGeneration,
      runnerId:supplied.runnerId,
      executionFingerprint:supplied.executionFingerprint,
      inputDigest:supplied.inputDigest,
      resourcePolicyIdentity:supplied.resourcePolicyIdentity,
      expiresAt:supplied.expiresAt,
    }),
    attemptId:input.attemptId,
    ownerEpoch:input.ownerEpoch,
    stageSealDigest:input.stageSealDigest,
  });
  let os:F2H1OwnedOsSession|undefined;
  let phase:'inactive'|'claiming'|'claimed'|'suspended'|'active'|'fenced'|'cleaned'|'unknown'='inactive';
  let claimed=false;
  let armInFlight:Promise<void>|undefined;
  let creating=false;
  let resolveCreation!:(value:void)=>void;
  const creationDone=new Promise<void>(resolve=>{resolveCreation=resolve;});
  let rejectOnStop!:(reason:Error)=>void;
  // Cancel pending JavaScript awaits, NOT the underlying Win32/Worker operation.
  const stopSignal=new Promise<never>((_,reject)=>{rejectOnStop=reject;});
  void stopSignal.catch(()=>{});
  const checkNotStopped=()=>{
    if(phase==='fenced'||phase==='cleaned'||phase==='unknown'||stopPromise)
      throw Error('F2_H1_CONTROLLER_STOPPED');
  };
  const checked=async<T>(work:Promise<T>,ms:number,reason:string):Promise<T>=>{
    const value=await Promise.race([bounded(work,ms,reason),stopSignal]);
    checkNotStopped();
    return value;
  };
  let stopPromise:Promise<F2H1CleanupEvidence>|undefined;
  let interval:ReturnType<typeof setInterval>|undefined;
  let monitored=false;
  let lastBeat=0;
  let lastProgress=0;
  const now=ports.now??Date.now;
  const secret=randomBytes(32),challenge=randomBytes(32);
  const protocol=createF2H1RunnerControlProtocol({
    ownerEpoch:frozen.ownerEpoch,missionId:frozen.scope.missionId,
    attemptId:frozen.attemptId,stageSealDigest:frozen.stageSealDigest,
    executionFingerprint:frozen.scope.executionFingerprint,
    key:secret,challenge,localRole:'desktop',
  });
  let evidence:F2H1CleanupEvidence={disposition:'not-started',osStopProven:false};
  const encode=encodeF2H1PrivatePipeFrame;
  async function authenticateFrame():Promise<string> {
    const raw=await ports.pipe.nextFrame();
    if(raw.length===0||raw.length>F2H1_FIXED_FRAME_BYTES)
      throw Error('F2_H1_CONTROLLER_FRAME_BOUNDS');
    let frame:unknown;
    try{frame=JSON.parse(Buffer.from(raw).toString('utf8')); }
    catch{throw Error('F2_H1_CONTROLLER_FRAME_INVALID');}
    if(!protocol.accept('runner',frame))
      throw Error('F2_H1_CONTROLLER_UNAUTHENTICATED_PEER');
    return (frame as {kind:string}).kind;
  }
  const monitor=async()=>{
    while(monitored&&phase==='active') {
      try {
        const kind=await bounded(authenticateFrame(),LEASE_MS,
          'F2_H1_CONTROLLER_MISSING_HEARTBEAT');
        if(!monitored||phase!=='active')return;
        if(kind!=='heartbeat')throw Error('F2_H1_CONTROLLER_UNEXPECTED_FRAME');
        lastBeat=now();lastProgress=lastBeat;
        ports.watchdog.authenticatedHeartbeat();
      }catch{void stop('io-or-peer-failure');return;}
    }
  };
  async function start():Promise<void> {
    if(phase!=='inactive')throw Error('F2_H1_CONTROLLER_ALREADY_CLAIMED');
    // Reserve the state synchronously BEFORE calling the F2-A claim.
    phase='claiming';
    try {
      // Claim + PENDING/audit commits before ANY native creation.
      requireJournal(ports.admission.claimNativePreparation(frozen.scope,frozen.attemptId,
        frozen.ownerEpoch,frozen.stageSealDigest),'CLAIM');
      claimed=true;
      checkNotStopped();
      phase='claimed';
      checkNotStopped();
      creating=true;
      try{os=ports.createSuspended();}
      finally{creating=false;resolveCreation();}
      // Even a synchronous reentrant stop inside the OS factory cannot allow
      // a late returned PROCESS handle to resume or skip exact teardown.
      checkNotStopped();
      phase='suspended';
      requireJournal(ports.admission.markNativeOwned(frozen.scope,frozen.attemptId,
        frozen.ownerEpoch,frozen.stageSealDigest),'OWNED');
      checkNotStopped();
      // Watchdog is independent of IO worker AND Electron. No ResumeThread
      // until both Worker acknowledgements exist.
      armInFlight=Promise.resolve().then(()=>ports.watchdog.arm(os!.guardian,os!.runner));
      await checked(armInFlight,1000,'F2_H1_GUARDIAN_WATCHDOG_START_TIMEOUT');
      armInFlight=Promise.resolve().then(()=>ports.pipe.arm(os!.desktopReads,os!.desktopWrites));
      await checked(armInFlight,1000,'F2_H1_DESKTOP_IO_WORKER_START_TIMEOUT');
      armInFlight=undefined;
      checkNotStopped();
      os.resumeControlThread();
      const bootstrap={
        kind:'desktop-private-bootstrap-v1',
        ownerEpoch:frozen.ownerEpoch,missionId:frozen.scope.missionId,
        attemptId:frozen.attemptId,stageSealDigest:frozen.stageSealDigest,
        executionFingerprint:frozen.scope.executionFingerprint,
        challenge:challenge.toString('hex'),secret:secret.toString('hex'),
        inheritedDesktopProcess:os.desktopReference.toString(),
      };
      await checked(ports.pipe.send(encode(bootstrap)),BOOTSTRAP_MS,
        'F2_H1_CONTROLLER_BOOTSTRAP_WRITE_TIMEOUT');
      const kind=await checked(authenticateFrame(),BOOTSTRAP_MS,
        'F2_H1_CONTROLLER_READY_TIMEOUT');
      checkNotStopped();
      if(kind!=='ready')throw Error('F2_H1_CONTROLLER_MISSING_READY');
      phase='active';
      evidence={disposition:'cleanup-unconfirmed',osStopProven:false};
      lastBeat=now();lastProgress=lastBeat;monitored=true;
      ports.watchdog.authenticatedHeartbeat();
      // Outgoing fixed heartbeat; only authenticated incoming frames refresh
      // the guardian lease. A blocked write is fenced by the watchdog.
      interval=setInterval(()=>{
        if(phase!=='active')return;
        if(now()-lastBeat>LEASE_MS
          ||now()-lastProgress>LEASE_MS) {
          void stop('lease-or-io-timeout');return;
        }
        void bounded(ports.pipe.send(encode(protocol.issue('desktop','heartbeat',{}))),
          LEASE_MS,'F2_H1_CONTROLLER_HEARTBEAT_WRITE_TIMEOUT')
          .then(()=>{lastProgress=now();},()=>{void stop('heartbeat-write-failed');});
      },HEARTBEAT_MS);
      interval.unref?.();
      void monitor();
    }catch(err){
      if(claimed)await stop('startup-failure');
      else phase='fenced';
      throw err;
    }
  }
  function stop(reason='cancel'):Promise<F2H1CleanupEvidence> {
    if(stopPromise)return stopPromise;
    const previous=phase;
    // The terminal fence takes effect synchronously, before ANY async cleanup.
    phase='fenced';
    monitored=false;
    if(interval){clearInterval(interval);interval=undefined;}
    rejectOnStop(Error('F2_H1_CONTROLLER_STOPPED'));
    stopPromise=(async()=>{
      if(previous==='inactive'||!claimed)return evidence;
      // If the synchronous native creator has not returned its exact handles,
      // do not invent a PID or infer cleanup. Observe its completion first.
      if(creating)await creationDone;
      if(!os) {
        try{ports.admission.markNativeCleanupUnknown(frozen.scope,frozen.attemptId,frozen.ownerEpoch);}
        catch{/* recovery retains charge */}
        evidence={disposition:'cleanup-unconfirmed',osStopProven:false};
        phase='unknown';
        return evidence;
      }
      // An advisory cancel is best-effort, never awaited by exact Job kill.
      try{void bounded(ports.pipe.send(encode(protocol.issue('desktop','cancel',{}))),
        100,'F2_H1_CANCEL_NOT_DELIVERED').catch(()=>{});}catch{/* fenced */}
      // The proof module directly checks creation-origin OS exit, Guardian
      // zero-members, independent Worker quiescence and checked handle closure.
      const verified=await finishF2H1VerifiedOwnedOsStop({
        os,pipe:ports.pipe,watchdog:ports.watchdog,armInFlight,
        scope:frozen.scope,attemptId:frozen.attemptId,ownerEpoch:frozen.ownerEpoch,
        stageSealDigest:frozen.stageSealDigest,admission:ports.admission,
      });
      if(verified){
        evidence={disposition:'verified-cleaned',osStopProven:true};
        phase='cleaned';
      }else{
        try{ports.admission.markNativeCleanupUnknown(frozen.scope,frozen.attemptId,frozen.ownerEpoch);}
        catch{/* unresolved journal remains quarantined on restart */}
        evidence={disposition:'cleanup-unconfirmed',osStopProven:false};
        phase='unknown';
      }
      return evidence;
    })();
    return stopPromise;
  }
  return Object.freeze({
    start,stop,shutdown:()=>stop('desktop-shutdown'),shutdownEvidence:()=>evidence,
    state:()=>phase,
  });
}

/**
 * Inert PRIVATE-V2 Desktop role in the actual Desktop-owned session source.
 * Intended only AFTER the existing durable claim/PENDING+audit and verified
 * fixed Guardian/Runner creation/pipe/independent watchdog in a future
 * separately authorized live H1 implementation. This local pure interface
 * cannot create a process, select arbitrary handles, authorize H0/worker
 * resume or settle D3 cleanup. Injected evidence remains SYNTHETIC in tests.
 *
 * The real Desktop-owner H0 duplicate path still unconditionally throws
 * F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED; this is NOT that path.
 */
export function createF2H1DesktopInertV2Control(input:{
  readonly channel:Omit<Parameters<typeof createF2H1PrivateControlV2>[0],'localRole'|'send'>;
  readonly prepare:F2H1ControlV2Prepare;
  readonly expected:F2H1H0AckExpected;
  readonly write?:(frame:F2H1ControlV2Frame)=>Promise<void>;
  /** Existing owned Desktop pipe path; inert until an actual OS proof port exists. */
  readonly pipe?:Pick<F2H1DesktopPipeIo,'send'|'nextFrame'>;
  readonly duplicateAndInspectOwnedH0?:(sourceProcessCoordinate:string)=>{
    readonly sourceProcessCoordinate:string;readonly proof:F2H1H0PhysicalEvidence;
  };
}) {
  const pipeMode=!!input?.pipe;
  if(pipeMode===(typeof input?.write==='function'))
    throw Error('F2_H1_DESKTOP_V2_EXACTLY_ONE_WRITER');
  // A caller-injected "proof" may drive inert object-frame tests but never
  // the source-linked private pipe; physical H0 ownership is still absent.
  if(pipeMode&&input.duplicateAndInspectOwnedH0)
    throw Error('F2_H1_DESKTOP_V2_UNTRUSTED_PIPE_PROOF');
  if(!pipeMode&&typeof input?.duplicateAndInspectOwnedH0!=='function')
    throw Error('F2_H1_DESKTOP_V2_EXACT_H0_DUPLICATE_UNAVAILABLE');
  const write=pipeMode
    ?(frame:F2H1ControlV2Frame)=>input.pipe!.send(encodeF2H1PrivatePipeFrame(frame))
    :input.write!;
  const inspect=pipeMode
    ?(_coordinate:string):never=>{throw Error('F2_H1_DESKTOP_V2_OS_H0_PROOF_UNAVAILABLE');}
    :input.duplicateAndInspectOwnedH0!;
  const protocol=createF2H1PrivateControlV2({
    ...input.channel,localRole:'desktop',send:write,
  });
  const ordering=createF2H1V2DesktopH0AckOrdering({
    protocol,prepare:input.prepare,expected:input.expected,
    retainedRunnerEvidence:{duplicateAndInspectOwnedH0:inspect},
  });
  let phase:'awaiting-prepare'|'preparing'|'awaiting-owned'|
    'acknowledged'|'quarantined'='awaiting-prepare';
  function fence() {
    phase='quarantined';ordering.fence();protocol.fence();
    return phase;
  }
  async function sendPrepare() {
    if(phase!=='awaiting-prepare'){
      fence();throw Error('F2_H1_DESKTOP_V2_PREPARE_ONE_USE');
    }
    phase='preparing';
    try {
      await protocol.send('prepare',input.prepare);
      if(phase!=='preparing'||protocol.state()==='quarantined')
        throw Error('F2_H1_DESKTOP_V2_PREPARE_LATE_OR_FENCED');
      phase='awaiting-owned';
    }catch {
      fence();throw Error('F2_H1_DESKTOP_V2_PREPARE_UNCONFIRMED');
    }
  }
  async function receiveOwned(raw:unknown) {
    if(phase!=='awaiting-owned')return fence();
    // The accepted V2 ordering consumes the frame *once*, verifies R1-R4
    // and only then serializes the local ACK write. No double-authentication.
    const result=await ordering.receiveOwned(raw);
    if(result!=='acknowledged'||phase!=='awaiting-owned')return fence();
    return phase='acknowledged'; // local ACK WRITE only, not Runner receipt
  }
  /** Read one actual *frame* from the existing Desktop Pipe IO interface.
   * Parsing chooses the handler only; the V2 reader authenticates each MAC once.
   * Inert mode has no live watchdog side effect or OS cleanup authority. */
  async function receiveNext() {
    if(!pipeMode)throw Error('F2_H1_DESKTOP_V2_PIPE_NOT_BOUND');
    try {
      const raw=await input.pipe!.nextFrame();
      if(phase==='quarantined'||!(raw instanceof Uint8Array)
        ||raw.length===0||raw.length>F2H1_FIXED_FRAME_BYTES)return fence();
      const frame=JSON.parse(Buffer.from(raw).toString('utf8')) as Record<string,unknown>;
      if(!frame||typeof frame!=='object'||Array.isArray(frame))return fence();
      if((frame.kind==='ready'&&phase==='awaiting-prepare')
        ||(frame.kind==='heartbeat'&&(phase==='awaiting-prepare'||phase==='awaiting-owned'))) {
        const accepted=protocol.accept('runner',frame);
        if(!accepted||accepted.kind!==frame.kind)return fence();
        return frame.kind;
      }
      // 'stopped' is terminal and must never count as Full-H1 cleanup.
      if(frame.kind==='stopped'||frame.kind==='reject') {
        protocol.accept('runner',frame);return fence();
      }
      return await receiveOwned(frame);
    }catch{return fence();}
  }
  async function sendControl(kind:'heartbeat'|'cancel') {
    if(!pipeMode||phase==='quarantined')
      throw Error('F2_H1_DESKTOP_V2_CONTROL_UNAVAILABLE');
    // The ACK sequence is reserved while awaiting H0; do not interleave a beat.
    if(kind==='heartbeat'&&phase!=='awaiting-prepare')return 'paused' as const;
    try {
      await protocol.send(kind,{});
      if(kind==='cancel'){fence();return 'quarantined' as const;}
      return 'sent' as const;
    }catch{fence();throw Error('F2_H1_DESKTOP_V2_CONTROL_WRITE_UNCONFIRMED');}
  }
  return Object.freeze({
    sendPrepare,receiveOwned,receiveNext,sendControl,fence,state:()=>phase,
    nativeAuthorization:false as const,readiness:()=>false as const,
  });
}
