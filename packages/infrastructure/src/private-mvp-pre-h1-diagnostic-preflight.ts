import {createHash} from 'node:crypto';
import type {Db} from './database.js';
import {privateMvpMissionBindingDigest,PRIVATE_MVP_RESOURCE_POLICY,
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,type PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';
import {PRE_H1_PREPARATION_CONTRACT,matchesPreH1PreparationRecipe}
  from './private-mvp-pre-h1-preparation-contract.js';

/** RC5 pure diagnostic admission proof. No native imports or HMAC key recovery. */
export const PRE_H1_RC5_PREFLIGHT=Object.freeze({
  missionId:PRE_H1_PREPARATION_CONTRACT.missionId,
  attemptId:PRE_H1_PREPARATION_CONTRACT.attemptId,
  ownerEpoch:'pre-h1-controller-01-epoch-01',
  stageSealDigest:createHash('sha256').update('PRE-H1-CONTROLLER-01|NO-STAGE|v1').digest('hex'),
} as const);
type Row=Record<string,unknown>;
type Audit={session_id:string;session_type:string;result_code:string;policy_decision:string;
  workspace_id:string|null;timestamp:string;metadata:string};
const canonicalIso=(v:unknown):v is string=>{
  if(typeof v!=='string')return false;
  const d=new Date(v);return !Number.isNaN(d.getTime())&&d.toISOString()===v;
};
function parseMetadata(v:string):Record<string,unknown>|undefined{
  try{const m:unknown=JSON.parse(v);return m && typeof m==='object'&&!Array.isArray(m)
    ?m as Record<string,unknown>:undefined;}catch{return undefined;}
}
export interface PreparedPreH1Diagnostic {
  readonly scope:PrivateMvpMissionScope;
  readonly attemptId:typeof PRE_H1_RC5_PREFLIGHT.attemptId;
  readonly ownerEpoch:typeof PRE_H1_RC5_PREFLIGHT.ownerEpoch;
  readonly stageSealDigest:string;
}
export function readApprovedPreH1Diagnostic(db:Db,now:Date):PreparedPreH1Diagnostic{
  if(!(now instanceof Date)||Number.isNaN(now.getTime()))
    throw Error('PRE_H1_DIAGNOSTIC_CLOCK_UNTRUSTED');
  const row=db.prepare(`
    SELECT m.*,a.state AS attempt_state,a.ordinal,a.launch_claimed_at,a.reserved_bytes,
      p.status AS approval_status,p.decision_source,p.binding_digest,p.capability,
      p.effect,p.policy_context,p.workspace_id AS approval_workspace,
      p.id AS original_approval_id,p.runtime_instance_id AS approval_runtime,
      p.session_id AS approval_session,p.session_type AS approval_session_type,
      p.sensitivity AS approval_sensitivity,
      p.expires_at AS approval_expires_at,p.decided_at AS approval_decided_at,
      p.consumed_at AS approval_consumed_at,
      w.is_active AS workspace_active,w.canonical_root,
      w.updated_at AS workspace_current_generation
    FROM runner_missions m
    JOIN runner_mission_attempts a ON a.mission_id=m.mission_id
    JOIN approval_requests p ON p.id=m.approval_id
    JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.mission_id=? AND a.attempt_id=?
  `).get(PRE_H1_RC5_PREFLIGHT.missionId,PRE_H1_RC5_PREFLIGHT.attemptId) as Row|undefined;
  if(!row||row.status!=='active'||row.attempt_state!=='reserved'
    ||row.launch_claimed_at!==null||row.ordinal!==1||row.attempt_count!==1
    ||row.approval_status!=='consumed'||row.decision_source!=='user'
    ||row.capability!==PRE_H1_PREPARATION_CONTRACT.approvalCapability
    ||row.effect!==PRE_H1_PREPARATION_CONTRACT.approvalEffect
    ||row.policy_context!=='workspace'||row.approval_workspace!==row.workspace_id
    ||row.approval_session!==PRE_H1_PREPARATION_CONTRACT.ownerSessionId
    ||row.approval_session_type!=='desktop'||row.approval_sensitivity!=='normal'
    ||row.workspace_active!==1||typeof row.canonical_root!=='string'||!row.canonical_root
    ||row.runner_id!==PRE_H1_PREPARATION_CONTRACT.runnerId
    ||row.resource_policy_identity!==PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    ||row.profile_revision!==PRIVATE_MVP_RESOURCE_POLICY.revision
    ||row.approval_id!==row.original_approval_id
    ||typeof row.approval_runtime!=='string'||!row.approval_runtime
    ||typeof row.binding_digest!=='string'||!/^[0-9a-f]{64}$/.test(row.binding_digest)
    ||row.reserved_bytes!==PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes
    ||row.charged_bytes!==PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes)
    throw Error('PRE_H1_DIAGNOSTIC_USER_AUTHORIZATION_MISSING_OR_CONSUMED');
  if(!canonicalIso(row.workspace_current_generation)
    ||row.workspace_current_generation!==row.workspace_generation)
    throw Error('PRE_H1_DIAGNOSTIC_WORKSPACE_GENERATION_STALE');
  const scope:PrivateMvpMissionScope={
    missionId:String(row.mission_id),revision:Number(row.revision),
    goalDigest:String(row.goal_digest),workspaceId:String(row.workspace_id),
    workspaceGeneration:String(row.workspace_generation),runnerId:String(row.runner_id),
    executionFingerprint:String(row.execution_fingerprint),inputDigest:String(row.input_digest),
    resourcePolicyIdentity:String(row.resource_policy_identity),expiresAt:String(row.expires_at),
  };
  const missionSha=privateMvpMissionBindingDigest(scope);
  if(!matchesPreH1PreparationRecipe(scope)||!canonicalIso(scope.expiresAt)
    ||scope.expiresAt<=now.toISOString()
    ||new Date(scope.expiresAt).getTime()-now.getTime()>PRE_H1_PREPARATION_CONTRACT.expiryMs
    ||!canonicalIso(row.approval_expires_at)||row.approval_expires_at<=now.toISOString()
    ||!canonicalIso(row.approval_decided_at)||!canonicalIso(row.approval_consumed_at)
    ||row.approval_consumed_at<row.approval_decided_at
    ||row.binding_digest===missionSha)
    throw Error('PRE_H1_DIAGNOSTIC_BINDING_OR_EXPIRY_STALE');
  if(db.prepare("SELECT 1 FROM runner_mission_native_attempts WHERE state != 'cleaned' LIMIT 1").get()
    ||db.prepare('SELECT 1 FROM runner_mission_native_attempts WHERE attempt_id=?')
      .get(PRE_H1_RC5_PREFLIGHT.attemptId))
    throw Error('PRE_H1_DIAGNOSTIC_NATIVE_CLAIM_ALREADY_USED');
  const enrollAudits=db.prepare(`
    SELECT session_id,session_type,result_code,policy_decision,workspace_id,timestamp,metadata
    FROM audit_events WHERE action='runner.mission.enroll'
      AND workspace_id=? AND result_code='ADMITTED'
  `).all(scope.workspaceId) as Audit[];
  const verified=enrollAudits.filter(a=>{
    const m=parseMetadata(a.metadata);
    return a.session_id==='private-mvp-controller'&&a.session_type==='desktop'
      &&a.policy_decision==='allow'&&canonicalIso(a.timestamp)
      &&a.timestamp===row.created_at
      &&m?.approvalOrigin==='trusted-pre-h1-kernel-manual-receipt-v1'
      &&m?.manualOwnerVerified===true
      &&m?.approvalRequestId===row.original_approval_id
      &&m?.approvalRuntimeId===row.approval_runtime
      &&m?.missionBindingDigest===missionSha
      &&m?.kernelHmacCommitment===createHash('sha256')
        .update(String(row.binding_digest)).digest('hex')
      &&m?.fixedAttemptId===PRE_H1_RC5_PREFLIGHT.attemptId
      &&m?.revision===scope.revision
      &&m?.profile===PRIVATE_MVP_RESOURCE_POLICY.revision;
  });
  if(verified.length!==1)
    throw Error('PRE_H1_DIAGNOSTIC_TRUSTED_F2A_RECEIPT_PROVENANCE_MISSING');
  const kernelAudits=db.prepare(`
    SELECT session_id,session_type,result_code,policy_decision,workspace_id,timestamp,metadata
    FROM audit_events WHERE action='tool_kernel.invoke'
      AND workspace_id=? AND result_code='EXECUTION_AUTHORIZED'
  `).all(scope.workspaceId) as Audit[];
  if(!kernelAudits.some(a=>{
    const m=parseMetadata(a.metadata);
    return a.session_id===PRE_H1_PREPARATION_CONTRACT.ownerSessionId
      &&a.session_type==='desktop'&&a.policy_decision==='ask'
      &&canonicalIso(a.timestamp)
      &&m?.capability===PRE_H1_PREPARATION_CONTRACT.approvalCapability
      &&m?.phase==='pre_execution'&&m?.approvalDecision==='approved'
      &&m?.approvalRequestId===row.original_approval_id;
  }))throw Error('PRE_H1_DIAGNOSTIC_KERNEL_APPROVAL_AUDIT_MISSING');
  return Object.freeze({
    scope:Object.freeze(scope),attemptId:PRE_H1_RC5_PREFLIGHT.attemptId,
    ownerEpoch:PRE_H1_RC5_PREFLIGHT.ownerEpoch,
    stageSealDigest:PRE_H1_RC5_PREFLIGHT.stageSealDigest,
  });
}
