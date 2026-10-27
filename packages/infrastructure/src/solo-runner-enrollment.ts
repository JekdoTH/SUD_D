import {createHash} from 'node:crypto';

/**
 * Code-only PLAN for a future SUD-D-owned Test Workspace, not enrollment
 * of any current / third-party Workspace. It cannot register or execute.
 * Business/media phases stay in the future owned Workspace, not this core.
 */
const PROFILE='solo-reviewed-host-v1' as const;
const OPERATION='review-workflow-contract' as const;
const WORKSPACE_KIND='sudd-owned-test-fixture' as const;
const MISSING_FACTS=Object.freeze([
  'REGISTERED_SUDD_OWNED_WORKSPACE',
  'REVIEWED_TOOL_AND_DEPENDENCY_CLOSURE',
  'WORKSPACE_GENERATION_AND_REVISION',
  'REAL_APPROVAL_RECEIPT',
  'PROVIDER_AND_EGRESS_APPROVAL',
  'OWNED_JOB_WATCHDOG_AND_CLEANUP_PROOF',
  'INDEPENDENT_MEDIA_QC_EVIDENCE',
] as const);
const INPUT_KEYS=[
  'profile','mode','operationId','workspace','workspaceGeneration','workspaceRevision',
  'reviewedSourceIds','reviewedDependencyDigests','networkProfile','providerProfile',
  'approvalReceipt',
] as const;
const ATTEMPT_KEYS=[
  'profile','operationId','fingerprint','workspaceGeneration','workspaceRevision',
  'approvalReceipt',
] as const;
const DRAFT_KEYS=[
  'profile','status','executionAvailable','enrolled','ownerApprovalValid',
  'workspaceBinding','missingFacts','fingerprint',
] as const;
const FINGERPRINT=createHash('sha256').update(
  'SUD_D_SOLO_REFERENCE_DESIGN_ONLY_V1\0'+JSON.stringify({
    profile:PROFILE,operationId:OPERATION,workspace:WORKSPACE_KIND,
    state:'uncreated',sources:[],dependencies:[],network:'none',provider:'none',
  }), 'utf8',
).digest('hex');

type JsonRecord=Record<string,unknown>;
function plain(value:unknown):value is JsonRecord {
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)return false;
  return Object.values(Object.getOwnPropertyDescriptors(value))
    .every(descriptor=>'value' in descriptor);
}
function exact(value:unknown,keys:readonly string[]):value is JsonRecord{
  if(!plain(value))return false;
  // Object.keys() silently omits Symbol and hidden own properties.
  // The inert binding rejects ALL extra own keys before reading values.
  const ownKeys=Reflect.ownKeys(value);
  if(ownKeys.length!==keys.length||ownKeys.some(key=>typeof key!=='string'))
    return false;
  const actual=(ownKeys as string[]).sort();
  const expected=[...keys].sort();
  return actual.every((key,i)=>key===expected[i]
    &&Object.getOwnPropertyDescriptor(value,key)?.enumerable===true);
}
function literalEmptyArray(value:unknown):boolean {
  return Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype
    &&value.length===0&&Reflect.ownKeys(value).length===1;
}
function invalidEnrollment():never {throw Error('SOLO_REFERENCE_ENROLLMENT_INVALID');}
function invalidAttempt():never {throw Error('SOLO_REFERENCE_ATTEMPT_NOT_BOUND');}

export interface SoloReferenceDraft {
  readonly profile:typeof PROFILE;
  readonly status:'BLOCKED_TEST_WORKSPACE_UNCREATED';
  readonly executionAvailable:false;
  readonly enrolled:false;
  readonly ownerApprovalValid:false;
  readonly workspaceBinding:'UNCREATED_UNREGISTERED';
  readonly missingFacts:typeof MISSING_FACTS;
  readonly fingerprint:string;
}
export interface SoloReferenceAssessment {
  readonly status:'BLOCKED_TEST_WORKSPACE_UNCREATED';
  readonly executionAvailable:false;
  readonly admitted:false;
  readonly missingFacts:typeof MISSING_FACTS;
}

/** Fixed pure data contract — no executable selector, runnable command,
 * real Workspace root, provider config, secrets or inferred enrollment. */
export function prepareSoloReferenceEnrollment(input:unknown):SoloReferenceDraft {
  if(!exact(input,INPUT_KEYS)||!exact(input.workspace,['kind','state']))
    return invalidEnrollment();
  if(input.profile!==PROFILE||input.mode!=='reference-design-only'||
    input.operationId!==OPERATION||
    input.workspace.kind!==WORKSPACE_KIND||input.workspace.state!=='uncreated'||
    input.workspaceGeneration!==null||input.workspaceRevision!==null||
    !literalEmptyArray(input.reviewedSourceIds)||
    !literalEmptyArray(input.reviewedDependencyDigests)||
    input.networkProfile!=='none'||input.providerProfile!=='none'||
    input.approvalReceipt!==null)
    return invalidEnrollment();
  // No input object is retained/frozen, and no caller data becomes executable.
  return Object.freeze({
    profile:PROFILE,status:'BLOCKED_TEST_WORKSPACE_UNCREATED' as const,
    executionAvailable:false as const,enrolled:false as const,
    ownerApprovalValid:false as const,
    workspaceBinding:'UNCREATED_UNREGISTERED' as const,
    missingFacts:MISSING_FACTS,fingerprint:FINGERPRINT,
  });
}

/** This is a code-only consistency assessment, never an admission.
 * Even a matching plan/fingerprint cannot authorize job or Provider use. */
export function assessSoloReferenceAttempt(
  draft:unknown,attempt:unknown,
):SoloReferenceAssessment {
  if(!exact(draft,DRAFT_KEYS)||!exact(attempt,ATTEMPT_KEYS)||
    draft.profile!==PROFILE||draft.status!=='BLOCKED_TEST_WORKSPACE_UNCREATED'||
    draft.executionAvailable!==false||draft.enrolled!==false||
    draft.ownerApprovalValid!==false||
    draft.workspaceBinding!=='UNCREATED_UNREGISTERED'||
    draft.fingerprint!==FINGERPRINT||
    draft.missingFacts!==MISSING_FACTS||
    attempt.profile!==PROFILE||attempt.operationId!==OPERATION||
    attempt.fingerprint!==FINGERPRINT||
    attempt.workspaceGeneration!==null||attempt.workspaceRevision!==null||
    attempt.approvalReceipt!==null)
    return invalidAttempt();
  return Object.freeze({
    status:'BLOCKED_TEST_WORKSPACE_UNCREATED' as const,
    executionAvailable:false as const,admitted:false as const,
    missingFacts:MISSING_FACTS,
  });
}
