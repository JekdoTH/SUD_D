import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import type {Db} from '../../infrastructure/src/database.js';
import {
  createPrivateMvpMissionAdmissionRepository,
  privateMvpMissionBindingDigest,
  PRIVATE_MVP_RESOURCE_POLICY,
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  type PreH1KernelApprovalReceipt,
  type PrivateMvpMissionScope,
} from '../../infrastructure/src/private-mvp-mission-admission.js';
import type {ApprovalRepository} from '../../infrastructure/src/approval-repository.js';
import {
  PRE_H1_PREPARATION_CONTRACT,PRE_H1_PREPARATION_GOAL_SHA,PRE_H1_PREPARATION_INPUT_SHA,
  preH1PreparationFingerprint,
} from '../../infrastructure/src/private-mvp-pre-h1-preparation-contract.js';
import type {WorkspaceRepository} from '../../infrastructure/src/workspace-repository.js';
import {createApprovalCoordinator,type ApprovalCoordinator}
  from '../../application/src/approval-service.js';
import {createToolCapabilityRegistry,createToolKernel,defineToolCapability,
  type ToolKernelAuditPort} from '../../application/src/tool-kernel.js';
import {appError,err,ok,type AppError,type Result,
  type ResolvedToolSecurityContext,type ToolKernelResult,type ApprovalMode} from '@sud-d/domain';

/**
 * Private, fixed-purpose Desktop preparation ONLY. Never import the diagnostic
 * activation, native Desktop runner owner, or an executable control program.
 * This module does not expose a Mission selector, env switch or Gateway tool.
 */
const MISSION=PRE_H1_PREPARATION_CONTRACT.missionId;
const ATTEMPT=PRE_H1_PREPARATION_CONTRACT.attemptId;
const RUNNER=PRE_H1_PREPARATION_CONTRACT.runnerId;
const CAPABILITY=PRE_H1_PREPARATION_CONTRACT.approvalCapability;
const GOAL_SHA=PRE_H1_PREPARATION_GOAL_SHA;
const INPUT_SHA=PRE_H1_PREPARATION_INPUT_SHA;
const fingerprint=preH1PreparationFingerprint;
const EXPIRY_MS=PRE_H1_PREPARATION_CONTRACT.expiryMs;
const SESSION = Object.freeze({ id:'pre-h1-desktop-owner', type:'desktop' as const });
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/;
const validIso = (value:string) => {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString()===value;
};

export interface PreH1PreparationReview {
  readonly mission:PrivateMvpMissionScope & {
    readonly missionId:typeof MISSION;
    readonly runnerId:typeof RUNNER;
  };
  readonly attemptId:typeof ATTEMPT;
  readonly missionBindingDigest:string;
  readonly warning:'PREPARATION_ONLY_NO_NATIVE_EXECUTION';
}
export interface PreH1PreparationDependencies {
  readonly db: Db;
  readonly approvals: ApprovalRepository;
  readonly workspaces: WorkspaceRepository;
  readonly audit: ToolKernelAuditPort;
  readonly mode: () => ApprovalMode;
  readonly now?: () => Date;
  /** Trusted real disk/retained-charge observation; tests provide a temp volume. */
  readonly observeBudget: (workspaceRoot:string) => {observedFreeBytes:number;observedOwnedBytes:number};
}
export function observePreH1MissionBudget(db:Db, root:string) {
  const stats=fs.statfsSync(root);
  const free=Number(stats.bavail)*Number(stats.bsize);
  const retained=(db.prepare('SELECT COALESCE(SUM(charged_bytes),0) AS bytes FROM runner_missions')
    .get() as {bytes:number}).bytes;
  if (!Number.isSafeInteger(free) || !Number.isSafeInteger(retained) || retained<0)
    throw Error('PRE_H1_BUDGET_UNVERIFIED');
  // Existing retained charge is conservatively treated as owned footprint;
  // no synthetic disk-free value or uncontrolled scan is used.
  return {observedFreeBytes:free,observedOwnedBytes:retained};
}

export function createPreH1MissionPreparationBridge(deps:PreH1PreparationDependencies) {
  const now=deps.now ?? (()=>new Date());
  const coordinator:ApprovalCoordinator=createApprovalCoordinator({
    repository:deps.approvals,now,mode:deps.mode,preserveOtherRuntimes:true,
  });
  const admission=createPrivateMvpMissionAdmissionRepository(deps.db,{
    now,
    verifyPreH1KernelReceipt:(receipt,scope)=>
      !!frozen && receipt.missionBindingDigest===privateMvpMissionBindingDigest(scope)
      && receipt.runtimeInstanceId===coordinator.runtimeInstanceId
      && receipt.requestId===kernelConsumedRequestId
      && receipt.kernelBindingDigest===coordinator.verifyConsumedManualPreH1(
        authorizationFor(frozen),receipt.requestId),
  });
  let frozen:PreH1PreparationReview|undefined;
  let kernelConsumedRequestId:string|undefined;
  let pendingRequestId:string|undefined;
  let terminal=false;

  function active() {
    const list=deps.workspaces.list().filter(w=>w.isActive);
    if (list.length!==1 || !IDENTIFIER.test(list[0]!.id)) throw Error('PRE_H1_WORKSPACE_NOT_EXACT');
    const workspace=list[0]!;
    const generation=workspace.updatedAt.toISOString();
    if (!validIso(generation)) throw Error('PRE_H1_WORKSPACE_GENERATION_INVALID');
    return {workspace,generation};
  }
  function fresh(review:PreH1PreparationReview) {
    const {workspace,generation}=active();
    if (workspace.id!==review.mission.workspaceId
      || generation!==review.mission.workspaceGeneration
      || now().toISOString()>=review.mission.expiresAt)
      throw Error('PRE_H1_SCOPE_STALE');
    // Be certain that the live DB row (not only a repository cache) is active.
    const dbRow=deps.db.prepare('SELECT updated_at,is_active FROM workspaces WHERE id=?')
      .get(workspace.id) as {updated_at:string;is_active:number}|undefined;
    if (!dbRow || dbRow.is_active!==1 || dbRow.updated_at!==generation)
      throw Error('PRE_H1_SCOPE_STALE');
    return workspace;
  }
  function authorizationFor(review:PreH1PreparationReview) {
    return {
      session:SESSION,capability:CAPABILITY,effect:'execute' as const,
      security:{sensitivity:'normal' as const,context:'workspace' as const,
        workspaceId:review.mission.workspaceId},
      descriptor:{title:'Approve PRE-H1 Mission preparation only - NO Native execution',
        resourceLabel:MISSION+' / '+review.missionBindingDigest},
      binding:{...review.mission,missionBindingDigest:review.missionBindingDigest,
        attemptId:ATTEMPT,action:'PREPARE_ONLY_NO_NATIVE_EXECUTION'},
    };
  }
  function inspect():PreH1PreparationReview {
    if (!frozen) {
      if (terminal) throw Error('PRE_H1_PREPARATION_TERMINAL');
      const {workspace,generation}=active();
      const expiry=new Date(now().getTime()+EXPIRY_MS).toISOString();
      const inputDigest=INPUT_SHA;
      const mission:PreH1PreparationReview['mission']=Object.freeze({
        missionId:MISSION,revision:1,goalDigest:GOAL_SHA,
        workspaceId:workspace.id,workspaceGeneration:generation,runnerId:RUNNER,
        executionFingerprint:fingerprint(workspace.id,generation),
        inputDigest,resourcePolicyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
        expiresAt:expiry,
      });
      frozen=Object.freeze({mission,attemptId:ATTEMPT,
        missionBindingDigest:privateMvpMissionBindingDigest(mission),
        warning:'PREPARATION_ONLY_NO_NATIVE_EXECUTION' as const});
    }
    fresh(frozen);
    return frozen;
  }

  const capability=defineToolCapability<Record<string,never>,{reserved:true}>({
    name:CAPABILITY,effect:'execute',
    validate(input) {return !!input && typeof input==='object' && !Array.isArray(input)
      && Object.keys(input).length===0 ? ok({}) :
      err(appError('VALIDATION_FAILED','Fixed PRE-H1 preparation takes no arguments'));},
    resolveSecurity():Result<ResolvedToolSecurityContext,AppError> {
      try {return ok(authorizationFor(inspect()).security);}
      catch {return err(appError('RUNNER_APPROVAL_STALE','PRE-H1 Workspace or proposal stale'));}
    },
    approval:{
      describe() {try{return ok(authorizationFor(inspect()).descriptor);}
        catch{return err(appError('RUNNER_APPROVAL_STALE','PRE-H1 review stale'));}},
      bind() {try{return ok(authorizationFor(inspect()).binding);}
        catch{return err(appError('RUNNER_APPROVAL_STALE','PRE-H1 binding stale'));}},
    },
    execute(_input,context) {
      if (!frozen || terminal || context.approvalDecision!=='approved'
        || !context.approvalRequestId || pendingRequestId!==context.approvalRequestId)
        return err(appError('RUNNER_APPROVAL_STALE','PRE-H1 manual approval missing or replayed'));
      try {
        const workspace=fresh(frozen);
        const authorization=authorizationFor(frozen);
        const authenticatedHmac=coordinator.verifyConsumedManualPreH1(
          authorization,context.approvalRequestId);
        if (!authenticatedHmac) throw Error('PRE_H1_MANUAL_HMAC_NOT_VERIFIED');
        // All checks and verified physical free-space measurement occur before
        // enrolling the one-use Mission; insufficient budget never consumes F2-A.
        const budget=deps.observeBudget(workspace.canonicalRoot);
        const reserve=PRIVATE_MVP_RESOURCE_POLICY.perAttemptReservationBytes;
        if (!Number.isSafeInteger(budget.observedFreeBytes)
          || !Number.isSafeInteger(budget.observedOwnedBytes)
          || budget.observedOwnedBytes<0
          || budget.observedFreeBytes-reserve<PRIVATE_MVP_RESOURCE_POLICY.minFreeSpaceBytes
          || budget.observedOwnedBytes+reserve>PRIVATE_MVP_RESOURCE_POLICY.maxRetainedFootprintBytes)
          throw Error('PRE_H1_BUDGET_UNVERIFIED');
        const receipt:PreH1KernelApprovalReceipt=Object.freeze({
          requestId:context.approvalRequestId,
          runtimeInstanceId:coordinator.runtimeInstanceId,
          kernelBindingDigest:authenticatedHmac,
          missionBindingDigest:frozen.missionBindingDigest,
          workspaceGeneration:frozen.mission.workspaceGeneration,
          revision:frozen.mission.revision,
          policyIdentity:frozen.mission.resourcePolicyIdentity,
          expiresAt:frozen.mission.expiresAt,
        });
        kernelConsumedRequestId=context.approvalRequestId;
        terminal=true; // one use, even on any subsequent failure
        const enrolled=admission.enrollApproved(frozen.mission,coordinator.runtimeInstanceId,receipt);
        if (!enrolled.ok) return enrolled;
        const reserved=admission.reserveAttempt(frozen.mission,ATTEMPT,budget);
        if (!reserved.ok || !reserved.value.created || reserved.value.ordinal!==1) {
          // No native claim was made by this bridge. Retain durable fenced
          // state and charge on failed reservation; never reissue approval.
          admission.revoke(frozen.mission);
          return err(appError('RUNNER_BUSY','PRE-H1 reservation failed; manual review required'));
        }
        return ok({reserved:true as const});
      } catch {
        terminal=true;
        return err(appError('RUNNER_APPROVAL_STALE','PRE-H1 Mission preparation refused'));
      }
    },
  });
  const registry=createToolCapabilityRegistry([capability]);
  if (!registry.ok) throw Error('PRE_H1_KERNEL_REGISTRY_INVALID');
  const kernel=createToolKernel({registry:registry.value,audit:deps.audit,approval:coordinator});

  return Object.freeze({
    inspect,
    async request():Promise<ToolKernelResult> {
      if (terminal) throw Error('PRE_H1_PREPARATION_TERMINAL');
      const result=await kernel.invoke({
        invocationId:randomUUID(),session:SESSION,capability:CAPABILITY,input:{},
      });
      if (!result.ok && result.code==='APPROVAL_REQUIRED'
        && result.approvalRequestId) pendingRequestId=result.approvalRequestId;
      return result;
    },
    reviewForPendingApproval(id:string):PreH1PreparationReview|undefined {
      if (!frozen || !pendingRequestId || pendingRequestId!==id || terminal) return undefined;
      try {return inspect();} catch {return undefined;}
    },
    cancelUnused():Result<void,AppError> {
      if (!frozen || !terminal) return err(appError('RUNNER_APPROVAL_STALE','No prepared PRE-H1 Mission'));
      const scope=frozen.mission;
      const row=deps.db.prepare(
        'SELECT state,launch_claimed_at FROM runner_mission_attempts WHERE attempt_id=? AND mission_id=?')
        .get(ATTEMPT,MISSION) as {state:string;launch_claimed_at:string|null}|undefined;
      if (!row || row.state!=='reserved' || row.launch_claimed_at!==null
        || deps.db.prepare('SELECT 1 FROM runner_mission_native_attempts WHERE attempt_id=?')
          .get(ATTEMPT))
        return err(appError('RUNNER_BUSY','Native claim/cleanup fence prevents PRE-H1 cancellation'));
      const settled=admission.settleAttempt(scope,ATTEMPT,true,true);
      if (!settled.ok) return settled;
      return admission.closeMission(scope);
    },
  });
}
