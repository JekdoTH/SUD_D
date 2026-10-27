import type {PrivateMvpMissionAdmissionRepository,PrivateMvpMissionScope} from './private-mvp-mission-admission.js';
import type {
  F2H1OwnedOsSession,F2H1DesktopPipeIo,F2H1IndependentGuardian,
} from './private-mvp-desktop-owned-session.js';

/**
 * The journal accepts ONLY a one-use capability registered inside this module.
 * There is deliberately NO public string-only issuer. The capability is minted
 * after this function itself checks the exact owned OS stop, worker quiescence,
 * and CloseHandle results. These port checks are simulated in code-only tests;
 * trusted Windows provenance still requires separate native proof.
 */
const issued=new WeakMap<object,string>();
export interface F2H1CleanupProofBinding {
  readonly missionId:string;readonly attemptId:string;
  readonly ownerEpoch:string;readonly stageSealDigest:string;
}
const binding=(b:F2H1CleanupProofBinding)=>
  JSON.stringify([b.missionId,b.attemptId,b.ownerEpoch,b.stageSealDigest]);

export function consumeF2H1VerifiedCleanupEvidence(
  evidence:unknown,missionId:string,attemptId:string,ownerEpoch:string,stageSealDigest:string,
):boolean {
  if(!evidence||typeof evidence!=='object')return false;
  const proof=issued.get(evidence);
  if(proof===undefined)return false;
  issued.delete(evidence);
  return proof===binding({missionId,attemptId,ownerEpoch,stageSealDigest});
}

type Admission=Pick<PrivateMvpMissionAdmissionRepository,
  'markNativeTerminated'|'confirmNativeCleanupFromOwnedOs'>;
const stopBounded=<T>(value:Promise<T>|T,ms:number):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  return Promise.race([Promise.resolve(value),
    new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error('F2_H1_OS_STOP_TIMEOUT')),ms);}),
  ]).finally(()=>{if(timer)clearTimeout(timer);});
};

/** Only one caller-owned OS transaction is checked. Never interpret a timeout
 * as cancellation of a pending Win32 call: failed quiescence forbids CloseHandle
 * and requires cleanup_unknown and charge retention in the owner.
 */
export async function finishF2H1VerifiedOwnedOsStop(args:{
  readonly os:F2H1OwnedOsSession;
  readonly pipe:F2H1DesktopPipeIo;
  readonly watchdog:F2H1IndependentGuardian;
  readonly armInFlight?:Promise<void>;
  readonly scope:PrivateMvpMissionScope;
  readonly attemptId:string;
  readonly ownerEpoch:string;
  readonly stageSealDigest:string;
  readonly admission:Admission;
}):Promise<boolean> {
  const {os,pipe,watchdog,scope,attemptId,ownerEpoch,stageSealDigest,admission}=args;
  let confirmed=true;
  // Guardian termination is immediate, independent of any advisory cancel.
  try{if(!os.terminateGuardian())confirmed=false;}catch{confirmed=false;}
  try{if(!await stopBounded(os.waitExactRunnerExit(5000),5200))confirmed=false;}
  catch{confirmed=false;}
  try{if(!os.queryGuardianZeroMembers())confirmed=false;}catch{confirmed=false;}
  // A Worker may finish arming AFTER stop was requested. Wait for it to settle
  // before shutdown; if it never settles we cannot prove a safe CloseHandle.
  let armSettled=true;
  if(args.armInFlight) {
    try{await stopBounded(args.armInFlight,1100);}catch{armSettled=false;confirmed=false;}
  }
  let ioStopped=false,watchStopped=false;
  try{ioStopped=await stopBounded(pipe.shutdown(),30_000);}catch{/* unknown */}
  try{watchStopped=await stopBounded(watchdog.shutdown(),1000);}catch{/* unknown */}
  if(!ioStopped||!watchStopped)confirmed=false;
  // Only close owned handles if both Worker Threads are quiescent.
  if(ioStopped&&watchStopped&&armSettled) {
    try{if(!os.closeAllOwnedHandles())confirmed=false;}catch{confirmed=false;}
  }else confirmed=false;
  if(!confirmed)return false;

  try{
    if(admission.markNativeTerminated(scope,attemptId,ownerEpoch).ok!==true)return false;
    const token=Object.freeze({});
    issued.set(token,binding({missionId:scope.missionId,attemptId,ownerEpoch,stageSealDigest}));
    // One-use capability: consumed by admission regardless of transaction outcome.
    return admission.confirmNativeCleanupFromOwnedOs(
      scope,attemptId,ownerEpoch,stageSealDigest,token).ok===true;
  }catch{return false;}
}
