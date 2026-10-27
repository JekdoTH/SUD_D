import {F2H0_FIXED_IDENTITY,type F2H0FixedRequest,type F2H0Outcome} from './private-mvp-h0-one-shot-gateway.js';
import type {PrivateMvpMissionScope} from './private-mvp-mission-admission.js';

/**
 * Unregistered H1 claim->host transaction coordinator. One durable Mission
 * claim is consumed BEFORE any possible OS creation. An OS operation cannot
 * participate atomically in SQLite; instead failure is permanently fenced
 * and quarantined. A pending row is NEVER accepted native evidence.
 */
export interface F2H1ClaimedAttempt {
  readonly mission:PrivateMvpMissionScope;
  readonly attemptId:string;
  readonly ownerEpoch:string;
  readonly stageFingerprint:string;
  readonly recipeFingerprint:string;
}
export interface F2H1DurableClaim {
  claimLaunch(mission:PrivateMvpMissionScope,attemptId:string,fingerprint:string):{readonly ok:boolean};
}
export interface F2H1DurableEvidence {
  /** Exactly this claim identity and fixed native identity, pending ONLY. */
  pending(input:Readonly<F2H1ClaimedAttempt>):Promise<boolean>;
  /** Fences the claim and retains charge when OS cleanup is uncertain. */
  quarantine(input:Readonly<F2H1ClaimedAttempt>):Promise<boolean>;
}
export type F2H1PendingOutcome=
  |{readonly ok:true;readonly nativeAuthorization:false;readonly evidence:'pending'}
  |{readonly ok:false;readonly reason:
       'stale-binding'|'already-claimed'|'launch-claim-rejected'
       |'gateway-unconfirmed'|'pending-evidence-unconfirmed'};

const NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** Not a production integration; H1 owner must supply actual reviewed stage,
 * authenticated process/epoch and concrete repository methods, never mock
 * stage/session values. Any mock can only produce a pending nonproof row.
 */
export function createF2H1ClaimBoundPreparation(
  durable:F2H1DurableClaim,
  evidence:F2H1DurableEvidence,
  prepareGateway:(request:Readonly<F2H0FixedRequest>)=>Promise<F2H0Outcome>,
) {
  let consumed=false;
  return async(input:F2H1ClaimedAttempt):Promise<F2H1PendingOutcome>=>{
    if(consumed)return {ok:false,reason:'already-claimed'};
    const m=input?.mission;
    if(!m||!NAME.test(m.missionId)||!NAME.test(input.attemptId)||!NAME.test(input.ownerEpoch)
      ||!NAME.test(m.workspaceId)||!NAME.test(m.workspaceGeneration)
      ||!Number.isSafeInteger(m.revision)||m.revision<1
      ||m.executionFingerprint.length!==64
      ||input.stageFingerprint!==F2H0_FIXED_IDENTITY.stageFingerprint
      ||input.recipeFingerprint!==F2H0_FIXED_IDENTITY.recipeFingerprint
      ||!Number.isFinite(Date.parse(m.expiresAt))
      ||Date.parse(m.expiresAt)<=Date.now())
      return {ok:false,reason:'stale-binding'};
    consumed=true; // no retry if DB claim rejected or any OS call throws
    let claimed=false;
    try {
      const accepted=durable.claimLaunch(m,input.attemptId,m.executionFingerprint);
      if(!accepted.ok)return {ok:false,reason:'launch-claim-rejected'};
      claimed=true;
      const request=Object.freeze({
        missionId:m.missionId,revision:m.revision,attemptId:input.attemptId,
        ownerEpoch:input.ownerEpoch,workspaceId:m.workspaceId,
        workspaceGeneration:m.workspaceGeneration,
        stageFingerprint:input.stageFingerprint,recipeFingerprint:input.recipeFingerprint,
      });
      const result=await prepareGateway(request);
      if(result.ok!==true) {
        await evidence.quarantine(input);
        return {ok:false,reason:'gateway-unconfirmed'};
      }
      if(await evidence.pending(input)!==true){
        await evidence.quarantine(input);
        return {ok:false,reason:'pending-evidence-unconfirmed'};
      }
      return {ok:true,nativeAuthorization:false,evidence:'pending'};
    } catch {
      if(claimed) {
        try{await evidence.quarantine(input);}catch{/* leave persistent claim consumed */}
      }
      return {ok:false,reason:'gateway-unconfirmed'};
    }
  };
}
