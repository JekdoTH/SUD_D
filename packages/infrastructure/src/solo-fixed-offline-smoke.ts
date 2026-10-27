import {createHash} from 'node:crypto';

/**
 * Solo First Physical Smoke: NON-EXECUTABLE CODE-ONLY REVIEW SPECIFICATION.
 * This module cannot launch a child, register a Workspace, consume Approval,
 * acquire a Windows Job, claim OS cleanup, access Provider or produce media.
 *
 * Tool SHA and file metadata are observed historical/read-only facts, not
 * Authenticode trust, immutable NT file identity or actual OS launch proof.
 */
const PROFILE='solo-reviewed-host-v1' as const;
const OPERATION='solo-node-version-smoke-v1' as const;
const MODE='fixed-offline-code-only-review' as const;
const HOST_SHA='63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088' as const;
const SOURCE_SHA='cc3ea60e1a7d23a9b4d648ddf73acc206f37d0a0b750e89208318e76345bd158' as const;

const INPUT_FIELDS=Object.freeze([
  'profile','operationId','mode','binarySha256','sourceFingerprint',
  'workspaceGeneration','workspaceRevision','attemptId','approvalReceipt',
  'networkProfile','providerProfile',
] as const);
const ASSESSMENT_FIELDS=Object.freeze([
  'profile','operationId','reviewFingerprint','binarySha256','sourceFingerprint',
  'workspaceGeneration','workspaceRevision','attemptId','approvalReceipt',
] as const);

type PlainRecord=Record<string,unknown>;
function exact(value:unknown,keys:readonly string[]):value is PlainRecord{
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  if(Object.getPrototypeOf(value)!==Object.prototype)return false;
  const actual=Reflect.ownKeys(value);
  if(actual.length!==keys.length||actual.some(k=>typeof k!=='string'))return false;
  const descriptors=Object.getOwnPropertyDescriptors(value);
  return keys.every(key=>Object.hasOwn(descriptors,key)&&
    Object.hasOwn(descriptors[key],'value')&&descriptors[key].enumerable===true);
}
function invalidInput():never{throw Error('SOLO_FIXED_SMOKE_REVIEW_INVALID');}
function invalidAttempt():never{throw Error('SOLO_FIXED_SMOKE_REVIEW_NOT_BOUND');}

const FIXED_EXE=Object.freeze({
  path:'C:\\Program Files\\nodejs\\node.exe' as const,
  sha256:HOST_SHA,
  sizeBytes:91380224 as const,
  observedFileVersion:'24.14.0' as const,
  authenticode:'UNVERIFIED' as const,
});
const FIXED_ARGS=Object.freeze(['--version'] as const);

/**
 * Domain separation matters: the reviewed proposal identity is NOT the
 * digest of the executable and NOT the digest of the synthetic Workspace
 * contract. Changing any planned byte or admission policy changes the plan
 * fingerprint, but this still cannot mint an Approval/OS proof.
 */
const REVIEW_FINGERPRINT=createHash('sha256').update(
  'SUD_D_SOLO_FIXED_OFFLINE_SMOKE_CODE_ONLY_PLAN_V1\0'+JSON.stringify({
    profile:PROFILE,operationId:OPERATION,mode:MODE,
    binary:FIXED_EXE,argv:FIXED_ARGS,shell:false,stdin:'disabled',
    cwdPolicy:'NO_RUNTIME_CWD_AUTHORIZED',
    envPolicy:'NO_RUNTIME_ENV_AUTHORIZED',
    stdoutMaxBytes:4096,stderrMaxBytes:4096,deadlineMs:5000,maxAttempts:1,
    sourceFingerprint:SOURCE_SHA,
    workspaceBinding:'OWNED_STATIC_REFERENCE_ONLY_UNREGISTERED',
    workspaceGeneration:null,workspaceRevision:null,approvalReceipt:null,
    network:'none',provider:'none',spend:0,physicalAuthorized:false,
  }), 'utf8',
).digest('hex');

const REVIEW=Object.freeze({
  profile:PROFILE,
  operationId:OPERATION,
  status:'CODE_ONLY_PLAN_VALID_PHYSICAL_LAUNCH_NOT_AUTHORIZED' as const,
  reviewFingerprint:REVIEW_FINGERPRINT,
  executable:FIXED_EXE,
  argv:FIXED_ARGS,
  shell:false as const,
  stdin:'disabled' as const,
  cwdPolicy:'NO_RUNTIME_CWD_AUTHORIZED' as const,
  envPolicy:'NO_RUNTIME_ENV_AUTHORIZED' as const,
  stdoutMaxBytes:4096 as const,
  stderrMaxBytes:4096 as const,
  deadlineMs:5000 as const,
  maxAttempts:1 as const,
  sourceFingerprint:SOURCE_SHA,
  workspaceBinding:'OWNED_STATIC_REFERENCE_ONLY_UNREGISTERED' as const,
  workspaceGeneration:null,
  workspaceRevision:null,
  approvalReceipt:null,
  network:'none' as const,
  provider:'none' as const,
  spend:0 as const,
  physicalAuthorized:false as const,
  executionAvailable:false as const,
  admitted:false as const,
  realProcessStarts:0 as const,
  workspaceRegistered:false as const,
  finalMp4Verified:false as const,
});
export type SoloFixedOfflineSmokeReview=typeof REVIEW;

const BLOCKED_ASSESSMENT=Object.freeze({
  status:'PHYSICAL_LAUNCH_NOT_AUTHORIZED' as const,
  codeOnlyPlanValid:true as const,
  physicalAuthorized:false as const,
  executionAvailable:false as const,
  admitted:false as const,
  workspaceRegistered:false as const,
  realProcessStarts:0 as const,
  providerCalls:0 as const,
  mediaProduced:false as const,
  finalMp4Verified:false as const,
});
export type SoloFixedOfflineSmokeAssessment=typeof BLOCKED_ASSESSMENT;

/** Only "inspect this one fixed, incomplete plan" is accepted.
 * Caller input NEVER supplies a process path, args, cwd, env or authority.
 */
export function inspectSoloFixedOfflineSmoke(input:unknown):SoloFixedOfflineSmokeReview{
  if(!exact(input,INPUT_FIELDS))return invalidInput();
  if(input.profile!==PROFILE||input.operationId!==OPERATION||input.mode!==MODE||
    input.binarySha256!==HOST_SHA||input.sourceFingerprint!==SOURCE_SHA||
    input.workspaceGeneration!==null||input.workspaceRevision!==null||
    input.attemptId!==null||input.approvalReceipt!==null||
    input.networkProfile!=='none'||input.providerProfile!=='none')
    return invalidInput();
  return REVIEW;
}

/** The same reviewed object and a fully bound *non-attempt* metadata request
 * can be checked, but admission is ALWAYS physically blocked. The null
 * attemptId deliberately prevents issuing/colliding with actual attempts.
 */
export function assessSoloFixedOfflineSmoke(
  review:unknown,attempt:unknown,
):SoloFixedOfflineSmokeAssessment{
  if(review!==REVIEW||!exact(attempt,ASSESSMENT_FIELDS))return invalidAttempt();
  if(attempt.profile!==PROFILE||attempt.operationId!==OPERATION||
    attempt.reviewFingerprint!==REVIEW_FINGERPRINT||
    attempt.binarySha256!==HOST_SHA||attempt.sourceFingerprint!==SOURCE_SHA||
    attempt.workspaceGeneration!==null||attempt.workspaceRevision!==null||
    attempt.attemptId!==null||attempt.approvalReceipt!==null)
    return invalidAttempt();
  return BLOCKED_ASSESSMENT;
}
