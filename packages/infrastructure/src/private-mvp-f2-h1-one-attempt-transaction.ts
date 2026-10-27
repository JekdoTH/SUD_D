import {
  createF2H1PrivateControlV2,createF2H1V2DesktopH0AckOrdering,
  createF2H1V2RunnerH0AckReceipt,
} from './private-mvp-h1-control-protocol.js';
import type {
  F2H1ControlV2Frame,F2H1ControlV2Prepare,F2H1H0AckExpected,
  F2H1H0PhysicalEvidence,
} from './private-mvp-h1-control-protocol.js';
import type {
  PrivateMvpMissionAdmissionRepository,PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';

/**
 * Code-only, one-attempt fixed Topology B transaction. All effects are
 * injected TEST-OWNED ports. NOT imported by Desktop/Runner entry or index.
 * This module has no Win32, DB, file, process, or native imports.
 *
 * IMPORTANT: the held H0 record and Desktop duplicate observation here are
 * synthetic evidence, not OS provenance; there is no native permission.
 * Only the coordinator may invoke the test-owned H0 CONTROL-resume callback.
 */
export interface F2H1OneAttemptPorts {
  readonly admission:Pick<PrivateMvpMissionAdmissionRepository,
    'claimNativePreparation'|'markNativeCleanupUnknown'>;
  readonly os:{
    /** Simulates outer Guardian and already-suspended Runner creation. */
    readonly createSuspendedRunner:()=>Promise<void>;
    readonly armGuardian:()=>Promise<void>;
    readonly armIo:()=>Promise<void>;
    readonly resumeRunnerControl:()=>Promise<void>;
    /** Simulated Runner-origin H0 PROCESS+THREAD, still suspended. */
    readonly createHeldH0:()=>Promise<{
      readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
      readonly stageSealDigest:string;readonly executionFingerprint:string;
      readonly runnerCreationToken:string;readonly h0Identity:string;
      readonly sourceProcessCoordinate:string;readonly state:'h0-control-suspended';
    }>;
    /** Simulates Desktop's duplicate from its RETAINED Runner PROCESS. */
    readonly duplicateAndInspectOwnedH0:(coordinate:string)=>{
      readonly sourceProcessCoordinate:string;readonly proof:F2H1H0PhysicalEvidence;
    };
    /** Pure test-owned effect; never a Native ResumeThread permission. */
    readonly resumeH0Control:()=>void;
    /** Exact injected stop; it cannot establish D3 full cleanup. */
    readonly stopExactAttempt:()=>Promise<void>;
  };
  readonly pipe:{
    readonly writeDesktop:(frame:F2H1ControlV2Frame)=>Promise<void>;
    readonly writeRunner:(frame:F2H1ControlV2Frame)=>Promise<void>;
    readonly readDesktop:()=>Promise<unknown>;
    readonly readRunner:()=>Promise<unknown>;
  };
  readonly now:()=>number;
}
export interface F2H1OneAttemptInput {
  readonly scope:PrivateMvpMissionScope;
  readonly attemptId:string;readonly ownerEpoch:string;
  readonly stageSealDigest:string;readonly expected:F2H1H0AckExpected;
  readonly prepare:F2H1ControlV2Prepare;
  readonly key:Uint8Array;readonly challenge:Uint8Array;
  readonly ownerDeadlineMs:number;readonly missionDeadlineMs:number;
  readonly leaseDeadlineMs:number;
}
export type F2H1OneAttemptResult=Readonly<{
  readonly disposition:'CLEANUP_UNKNOWN';
  readonly chargeRetained:true;
  readonly fullH1Cleaned:false;
  /** True only after the test-owned H0 control callback returns normally while
   * the attempt is still live. False means UNCONFIRMED, not known absent.
   * This never attests to physical/native H0 thread resumption. */
  readonly h0ControlResumed:boolean;
  readonly workerResumed:false;
  readonly reason:string;
}>;

const identifier=/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const digest=/^[0-9a-f]{64}$/;
function assertOneAttemptBinding(input:F2H1OneAttemptInput):void {
  const s=input?.scope,p=input?.prepare,e=input?.expected;
  if(!s||!p||!e||!identifier.test(input.attemptId)
    ||!identifier.test(input.ownerEpoch)||!digest.test(input.stageSealDigest)
    ||!identifier.test(s.missionId)||!identifier.test(s.workspaceId)
    ||!identifier.test(s.workspaceGeneration)||!identifier.test(s.runnerId)
    ||!digest.test(s.executionFingerprint)||!digest.test(s.goalDigest)
    ||!digest.test(s.inputDigest)||!digest.test(s.resourcePolicyIdentity)
    ||!Number.isSafeInteger(s.revision)||s.revision<1
    ||p.missionRevision!==s.revision||p.workspaceGeneration!==s.workspaceGeneration
    ||e.ownerEpoch!==input.ownerEpoch||e.missionId!==s.missionId
    ||e.attemptId!==input.attemptId||e.stageSealDigest!==input.stageSealDigest
    ||e.executionFingerprint!==s.executionFingerprint
    ||e.recipeFingerprint!==p.recipeFingerprint
    ||e.runnerCreationToken!==p.creationToken
    ||!identifier.test(p.stageIdentity)||!identifier.test(p.h0Identity)
    ||!Number.isSafeInteger(p.deadlineMs)||p.deadlineMs<=0)
    throw Error('F2_H1_ONE_ATTEMPT_BINDING_INVALID');
}
export function createF2H1OneAttemptTransaction(
  original:F2H1OneAttemptInput,ports:F2H1OneAttemptPorts,
) {
  assertOneAttemptBinding(original);
  const scope=Object.freeze({...original.scope});
  const expected=Object.freeze({...original.expected});
  const prepare=Object.freeze({...original.prepare});
  const input=Object.freeze({...original,scope,expected,prepare,
    key:Buffer.from(original.key),challenge:Buffer.from(original.challenge)});
  if(!ports?.admission||!ports?.os||!ports?.pipe
    ||typeof ports.now!=='function'
    ||typeof ports.admission.claimNativePreparation!=='function'
    ||typeof ports.admission.markNativeCleanupUnknown!=='function'
    ||![
      ports.os.createSuspendedRunner,ports.os.armGuardian,ports.os.armIo,
      ports.os.resumeRunnerControl,ports.os.createHeldH0,
      ports.os.duplicateAndInspectOwnedH0,ports.os.resumeH0Control,
      ports.os.stopExactAttempt,ports.pipe.writeDesktop,ports.pipe.writeRunner,
      ports.pipe.readDesktop,ports.pipe.readRunner,
    ].every(f=>typeof f==='function'))
    throw Error('F2_H1_ONE_ATTEMPT_PORTS_INVALID');
  const stamp=ports.now();
  if(!Number.isSafeInteger(stamp))
    throw Error('F2_H1_ONE_ATTEMPT_CLOCK_INVALID');
  let lastTime=stamp;
  const deadline=Math.min(stamp+5000,input.ownerDeadlineMs,
    input.missionDeadlineMs,input.leaseDeadlineMs,prepare.deadlineMs);
  if(!Number.isSafeInteger(deadline)||deadline<=stamp)
    throw Error('F2_H1_ONE_ATTEMPT_DEADLINE_INVALID');
  const base={ownerEpoch:input.ownerEpoch,missionId:scope.missionId,
    attemptId:input.attemptId,stageSealDigest:input.stageSealDigest,
    executionFingerprint:scope.executionFingerprint,
    key:input.key,challenge:input.challenge,now:ports.now,
    ownerDeadlineMs:deadline,missionDeadlineMs:deadline,leaseDeadlineMs:deadline};
  const desktop=createF2H1PrivateControlV2({...base,localRole:'desktop',
    send:ports.pipe.writeDesktop});
  const runner=createF2H1PrivateControlV2({...base,localRole:'runner',
    send:ports.pipe.writeRunner});
  const receipt=createF2H1V2RunnerH0AckReceipt({protocol:runner});
  const sender=createF2H1V2DesktopH0AckOrdering({
    protocol:desktop,expected,prepare,
    retainedRunnerEvidence:{
      duplicateAndInspectOwnedH0:ports.os.duplicateAndInspectOwnedH0,
    },
  });

  let begun=false,terminal=false,claimAttempted=false,created=false,resumed=false;
  let stopRequested=false,stopped:Promise<void>|undefined;
  let reason='terminal-stop';
  let rejectAbort!:(error:Error)=>void;
  const abortSignal=new Promise<never>((_,reject)=>{rejectAbort=reject;});
  void abortSignal.catch(()=>{});
  const output=():F2H1OneAttemptResult=>Object.freeze({
    disposition:'CLEANUP_UNKNOWN',chargeRetained:true,fullH1Cleaned:false,
    h0ControlResumed:resumed,workerResumed:false,reason,
  });
  function checkLive() {
    const time=ports.now();
    if(!Number.isSafeInteger(time)||time<lastTime||time>=deadline
      ||terminal||stopRequested
      ||desktop.state()==='quarantined'||runner.state()==='quarantined'
      ||sender.state()==='quarantined'||receipt.state()==='quarantined')
      throw Error('F2_H1_ONE_ATTEMPT_FENCED_OR_EXPIRED');
    lastTime=time;
  }
  async function guarded<T>(effect:()=>Promise<T>|T):Promise<T> {
    checkLive();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const remaining=Math.max(0,deadline-ports.now());
      const timeout=new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(Error('F2_H1_ONE_ATTEMPT_TIMEOUT')),remaining);
      });
      const result=await Promise.race([
        Promise.resolve().then(()=>{checkLive();return effect();}),
        abortSignal,timeout,
      ]);
      checkLive();
      return result as T;
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }
  function fence(why='cancelled'):void {
    if(!terminal)reason=why;
    terminal=true;
    desktop.fence();runner.fence();sender.fence();receipt.fence();
    rejectAbort(Error('F2_H1_ONE_ATTEMPT_ABORTED'));
  }
  async function finish():Promise<void> {
    if(stopped)return stopped;
    fence(reason);
    stopped=(async()=>{
      // A synchronous cancel MUST fence before any awaited cleanup effect.
      if(created) {
        try{await ports.os.stopExactAttempt();}catch{/* OS cleanup unknown */ }
      }
      if(claimAttempted) {
        try{ports.admission.markNativeCleanupUnknown(scope,input.attemptId,input.ownerEpoch);}
        catch{/* Uncertain journal state retains the charge. */}
      }
    })();
    return stopped;
  }
  async function run():Promise<F2H1OneAttemptResult> {
    if(begun)throw Error('F2_H1_ONE_ATTEMPT_ONE_USE');
    begun=true;
    try {
      checkLive();
      claimAttempted=true;
      const claim=ports.admission.claimNativePreparation(
        scope,input.attemptId,input.ownerEpoch,input.stageSealDigest);
      if(claim?.ok!==true)throw Error('F2_H1_ONE_ATTEMPT_CLAIM_OR_AUDIT_UNCONFIRMED');
      checkLive();
      created=true; // Includes partially-returned creation effects.
      await guarded(ports.os.createSuspendedRunner);
      await guarded(ports.os.armGuardian);
      await guarded(ports.os.armIo);
      await guarded(ports.os.resumeRunnerControl);
      await guarded(()=>desktop.send('prepare',prepare));
      if(receipt.receivePrepare(await guarded(ports.pipe.readRunner))!=='awaiting-held-creation')
        throw Error('F2_H1_ONE_ATTEMPT_PREPARE_REJECTED');
      const held=await guarded(ports.os.createHeldH0);
      if(receipt.pinHeldCreation(held)!=='awaiting-ack')
        throw Error('F2_H1_ONE_ATTEMPT_HELD_H0_REJECTED');
      await guarded(receipt.sendOwned);
      const ownedRaw=await guarded(ports.pipe.readDesktop);
      const sent=await guarded(()=>sender.receiveOwned(ownedRaw));
      if(sent!=='acknowledged')throw Error('F2_H1_ONE_ATTEMPT_DESKTOP_ACK_REJECTED');
      // Local Desktop write alone is NOT receipt.
      const raw=await guarded(ports.pipe.readRunner);
      if(receipt.receiveAck(raw)!=='ack-received-for-this-frozen-epoch')
        throw Error('F2_H1_ONE_ATTEMPT_RUNNER_ACK_REJECTED');
      checkLive();
      // No await between the final Runner-local fence and ONE test-owned effect.
      // Invocation alone is not completion: a throw or reentrant stop leaves
      // its result UNCONFIRMED, regardless of any partial side effect.
      ports.os.resumeH0Control();
      if(!terminal){
        resumed=true; // only normal return on the still-live synthetic attempt
        reason='simulated-control-resume-only';
      }
    }catch(err){
      if(!terminal)reason=err instanceof Error?err.message:'F2_H1_ONE_ATTEMPT_ERROR';
    }finally{await finish();}
    return output();
  }
  return Object.freeze({run,stop:(why='cancelled')=>{fence(why);void finish();},
    state:()=>terminal?'quarantined':begun?'active':'inactive',
    nativeAuthorization:false as const,readiness:()=>false as const});
}
// Keep the typed async caller inside the guarded effect; no read is preauthenticated.
async function awaitValue(reader:()=>Promise<unknown>):Promise<unknown> {return reader();}
