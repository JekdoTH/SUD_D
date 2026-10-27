import {createHash} from 'node:crypto';
import {
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  privateMvpMissionBindingDigest,
  type PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';

/**
 * Frozen PRE-H1-CONTROLLER-01 NO-STAGE preparation contract. Pure JS only.
 * Both the Desktop Kernel Approval binding and isolated RC5 diagnostic
 * preflight use this exact recipe, never the native synthetic stage.
 */
export const PRE_H1_PREPARATION_CONTRACT=Object.freeze({
  caseId:'PRE-H1-CONTROLLER-01',
  missionId:'pre-h1-controller-01',
  attemptId:'pre-h1-controller-01-attempt-01',
  runnerId:'fixed-synthetic',
  approvalCapability:'pre-h1.prepare',
  approvalEffect:'execute',
  ownerSessionId:'pre-h1-desktop-owner',
  revision:1,
  expiryMs:4*60_000,
  noStage:true,
  nativeExecution:false,
} as const);
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
export const PRE_H1_PREPARATION_GOAL_SHA=sha(
  PRE_H1_PREPARATION_CONTRACT.caseId+'|PREPARE-ONLY|v1');
export const PRE_H1_PREPARATION_INPUT_SHA=sha(
  PRE_H1_PREPARATION_CONTRACT.caseId+'|NO-STAGE|INPUT|v1');
export function preH1PreparationFingerprint(workspaceId:string,workspaceGeneration:string):string{
  return sha(JSON.stringify({
    caseId:PRE_H1_PREPARATION_CONTRACT.caseId,
    missionId:PRE_H1_PREPARATION_CONTRACT.missionId,
    revision:PRE_H1_PREPARATION_CONTRACT.revision,
    workspaceId,workspaceGeneration,
    runnerId:PRE_H1_PREPARATION_CONTRACT.runnerId,
    goalDigest:PRE_H1_PREPARATION_GOAL_SHA,
    inputDigest:PRE_H1_PREPARATION_INPUT_SHA,
    policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
    stage:'NO-STAGE',nativeExecution:false,
  }));
}
export function matchesPreH1PreparationRecipe(scope:PrivateMvpMissionScope):boolean {
  return scope.missionId===PRE_H1_PREPARATION_CONTRACT.missionId
    && scope.runnerId===PRE_H1_PREPARATION_CONTRACT.runnerId
    && scope.revision===PRE_H1_PREPARATION_CONTRACT.revision
    && scope.goalDigest===PRE_H1_PREPARATION_GOAL_SHA
    && scope.inputDigest===PRE_H1_PREPARATION_INPUT_SHA
    && scope.resourcePolicyIdentity===PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    && scope.executionFingerprint===preH1PreparationFingerprint(
      scope.workspaceId,scope.workspaceGeneration)
    && /^[0-9a-f]{64}$/.test(privateMvpMissionBindingDigest(scope));
}
