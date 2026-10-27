import {createHash,randomUUID} from 'node:crypto';
import type {Db} from './database.js';
import {createAuditRepository} from './audit-repository.js';
import {
  PRE_H1_NATIVE_CONSENT,nativeConsentSnapshot,nativeConsentBindingDigest,
  readVerifiedPreH1NativeArtifacts,
  type PreH1NativeArtifactIdentity,
} from './private-mvp-pre-h1-native-consent-contract.js';

const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const ISO=(v:unknown):v is string=>typeof v==='string'
  && !Number.isNaN(new Date(v).getTime()) && new Date(v).toISOString()===v;
type Scope=ReturnType<typeof nativeConsentSnapshot>;
type AuditRow={id:string;session_id:string;session_type:string;workspace_id:string;
  timestamp:string;policy_decision:string;result_code:string;metadata:string};
type ApprovalRow={id:string;runtime_instance_id:string;binding_digest:string;
  status:string;decision_source:string;session_id:string;session_type:string;
  capability:string;effect:string;policy_context:string;workspace_id:string;
  expires_at:string;consumed_at:string;decided_at:string};
const parse=(text:string):Record<string,unknown>=>{
  const obj:unknown=JSON.parse(text);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('PRE_H1_NATIVE_AUDIT_METADATA');
  return obj as Record<string,unknown>;
};
export interface NativeManualReceipt {
  requestId:string; invocationId:string;runtimeInstanceId:string; hmacTag:string;
  bindingDigest:string;
}
export interface NativeConsentProof {
  scope:Scope;nativeApprovalId:string;nativeRuntimeId:string;
  nativeGrantDigest:string;
}
/** Called only by a trusted Desktop Tool Kernel execution closure. Atomic
 * grant audit; no second Approval row or new schema/Production migration. */
export function recordPreH1NativeGrant(db:Db,receipt:NativeManualReceipt,
  now:Date,artifacts:PreH1NativeArtifactIdentity=readVerifiedPreH1NativeArtifacts()):boolean{
  try{
    return db.transaction(()=>{
      const scope=nativeConsentSnapshot(db,now,artifacts);
      const binding=nativeConsentBindingDigest(scope);
      const row=db.prepare('SELECT * FROM approval_requests WHERE id=?')
        .get(receipt.requestId) as ApprovalRow|undefined;
      if(!row||!(/^[0-9a-f-]{36}$/i.test(receipt.invocationId))
        ||receipt.bindingDigest!==binding
        ||row.binding_digest!==receipt.hmacTag||!receipt.hmacTag.match(/^[0-9a-f]{64}$/)
        ||receipt.hmacTag===binding||row.runtime_instance_id!==receipt.runtimeInstanceId
        ||row.capability!==PRE_H1_NATIVE_CONSENT.capability||row.effect!=='execute'
        ||row.status!=='consumed'||row.decision_source!=='user'
        ||row.session_id!==PRE_H1_NATIVE_CONSENT.sessionId||row.session_type!=='desktop'
        ||row.policy_context!=='workspace'||row.workspace_id!==scope.workspaceId
        ||!ISO(row.expires_at)||row.expires_at<=now.toISOString()
        ||!ISO(row.consumed_at)||!ISO(row.decided_at)||row.consumed_at<row.decided_at
        ||scope.missionExpiresAt<=now.toISOString())
        throw Error('PRE_H1_NATIVE_GRANT_INVALID');
      const matching=db.prepare(
        "SELECT id FROM audit_events WHERE action IN ('pre-h1.native.grant','pre-h1.native.consume') AND workspace_id=?")
        .all(scope.workspaceId);
      if(matching.length)throw Error('PRE_H1_NATIVE_ALREADY_ISSUED');
      const kernelAudit=db.prepare(
        "SELECT metadata,session_id,result_code,policy_decision FROM audit_events WHERE action='tool_kernel.invoke' AND workspace_id=?")
        .all(scope.workspaceId) as Array<Pick<AuditRow,'metadata'|'session_id'|'result_code'|'policy_decision'>>;
      if(!kernelAudit.some(a=>{
        try{const m=parse(a.metadata);return a.session_id===PRE_H1_NATIVE_CONSENT.sessionId
          &&a.result_code==='EXECUTION_AUTHORIZED'&&a.policy_decision==='ask'
          &&m.approvalRequestId===receipt.requestId
          &&m.invocationId===receipt.invocationId
          &&m.phase==='pre_execution'&&m.outcome==='authorized'
          &&m.approvalDecision==='approved'
          &&m.capability===PRE_H1_NATIVE_CONSENT.capability;}catch{return false;}
      }))throw Error('PRE_H1_NATIVE_KERNEL_AUDIT_MISSING');
      const audit=createAuditRepository(db);
      audit.append({
        timestamp:now,sessionId:PRE_H1_NATIVE_CONSENT.sessionId,sessionType:'desktop',
        action:'pre-h1.native.grant',workspaceId:scope.workspaceId,
        policyDecision:'ask',resultCode:'NATIVE_CONSENT_RECORDED',durationMs:0,
        metadata:{
          requestId:receipt.requestId,invocationId:receipt.invocationId,runtimeId:receipt.runtimeInstanceId,
          hmacTagCommitment:sha(receipt.hmacTag),bindingDigest:binding,scopeJson:JSON.stringify(scope),
          expiresAt:scope.missionExpiresAt,manualOwnerVerified:true,
        },
      });
      return true;
    }).immediate();
  }catch{return false;}
}
/**
 * AFTER trusted RC5 Mission preflight, BEFORE any Win32 bind.
 * Consumes a grant exactly once with IMMEDIATE SQLite transaction and
 * one existing Audit event; an audit failure rolls back consumption.
 * The grant is burned even if subsequent native journaling fails.
 */
export function consumePreH1NativeAuthorization(db:Db,now:Date,
  artifacts:PreH1NativeArtifactIdentity=readVerifiedPreH1NativeArtifacts()):NativeConsentProof{
  return db.transaction(()=>{
    const scope=nativeConsentSnapshot(db,now,artifacts);
    const binding=nativeConsentBindingDigest(scope);
    const audits=db.prepare(
      "SELECT * FROM audit_events WHERE action='pre-h1.native.grant' AND workspace_id=?")
      .all(scope.workspaceId) as AuditRow[];
    const consumed=db.prepare(
      "SELECT id FROM audit_events WHERE action='pre-h1.native.consume' AND workspace_id=?")
      .all(scope.workspaceId);
    if(audits.length!==1||consumed.length!==0)
      throw Error('PRE_H1_NATIVE_CONSENT_MISSING_OR_REPLAYED');
    const grant=audits[0]!;
    const metadata=parse(grant.metadata);
    const id=metadata.requestId;
    const invocationId=metadata.invocationId;
    if(typeof invocationId!=='string'||!(/^[0-9a-f-]{36}$/i.test(invocationId)))
      throw Error('PRE_H1_NATIVE_INVOCATION_MISSING');
    if(typeof id!=='string'||!id
      ||metadata.manualOwnerVerified!==true
      ||grant.session_id!==PRE_H1_NATIVE_CONSENT.sessionId
      ||grant.session_type!=='desktop'||grant.result_code!=='NATIVE_CONSENT_RECORDED'
      ||grant.policy_decision!=='ask'
      ||metadata.bindingDigest!==binding
      ||metadata.expiresAt!==scope.missionExpiresAt
      ||metadata.scopeJson!==JSON.stringify(scope)
      ||!ISO(grant.timestamp)||grant.timestamp>now.toISOString())
      throw Error('PRE_H1_NATIVE_GRANT_PROVENANCE_INVALID');
    const row=db.prepare('SELECT * FROM approval_requests WHERE id=?')
      .get(id) as ApprovalRow|undefined;
    if(!row||row.status!=='consumed'||row.decision_source!=='user'
      ||row.capability!==PRE_H1_NATIVE_CONSENT.capability||row.effect!=='execute'
      ||row.session_id!==PRE_H1_NATIVE_CONSENT.sessionId||row.session_type!=='desktop'
      ||row.policy_context!=='workspace'||row.workspace_id!==scope.workspaceId
      ||row.runtime_instance_id!==metadata.runtimeId
      ||!ISO(row.expires_at)||row.expires_at<=now.toISOString()
      ||!ISO(row.consumed_at)||!ISO(row.decided_at)||row.consumed_at<row.decided_at
      ||!(/^[0-9a-f]{64}$/.test(row.binding_digest))
      ||sha(row.binding_digest)!==metadata.hmacTagCommitment
      ||row.binding_digest===binding)
      throw Error('PRE_H1_NATIVE_MANUAL_APPROVAL_INVALID');
    const kernelAudits=db.prepare(
      "SELECT * FROM audit_events WHERE action='tool_kernel.invoke' AND workspace_id=?")
      .all(scope.workspaceId) as AuditRow[];
    if(!kernelAudits.some(a=>{
      try{const m=parse(a.metadata);return a.session_id===PRE_H1_NATIVE_CONSENT.sessionId
        &&a.session_type==='desktop'&&a.policy_decision==='ask'
        &&a.result_code==='EXECUTION_AUTHORIZED'
        &&m.approvalRequestId===id &&m.capability===PRE_H1_NATIVE_CONSENT.capability
        &&m.invocationId===invocationId&&m.phase==='pre_execution'
        &&m.outcome==='authorized'&&m.approvalDecision==='approved';
      }catch{return false;}
    }))throw Error('PRE_H1_NATIVE_KERNEL_AUDIT_MISSING');
    const outcomes=kernelAudits.filter(a=>{
      try{const m=parse(a.metadata);return a.session_id===PRE_H1_NATIVE_CONSENT.sessionId
        &&a.session_type==='desktop'&&a.policy_decision==='ask'
        &&a.result_code==='EXECUTED'
        &&m.capability===PRE_H1_NATIVE_CONSENT.capability
        &&m.approvalRequestId===id&&m.invocationId===invocationId
        &&m.phase==='outcome'&&m.outcome==='executed'
        &&m.approvalDecision==='approved'&&ISO(a.timestamp)
        &&a.timestamp>=grant.timestamp;
      }catch{return false;}
    });
    if(outcomes.length!==1)throw Error('PRE_H1_NATIVE_KERNEL_OUTCOME_AUDIT_MISSING_OR_FAILED');
    const related=kernelAudits.filter(a=>{
      try{const m=parse(a.metadata);return m.capability===PRE_H1_NATIVE_CONSENT.capability
        &&m.invocationId===invocationId&&m.phase==='outcome';}
      catch{return false;}
    });
    if(related.length!==1)throw Error('PRE_H1_NATIVE_KERNEL_OUTCOME_INCONSISTENT');
    createAuditRepository(db).append({
      timestamp:now,sessionId:'pre-h1-native-diagnostic',sessionType:'desktop',
      action:'pre-h1.native.consume',workspaceId:scope.workspaceId,
      policyDecision:'allow',resultCode:'ONE_USE_NATIVE_CONSENT_CONSUMED',
      durationMs:0,metadata:{
        requestId:id,originalPreparationApprovalId:scope.preparationApprovalId,
        missionBindingDigest:scope.missionBindingDigest,bindingDigest:binding,
        artifactHash:scope.artifacts.nativeCandidateInventorySha,
      },
    });
    return Object.freeze({scope,nativeApprovalId:id,
      nativeRuntimeId:String(metadata.runtimeId),nativeGrantDigest:binding});
  }).immediate();
}
