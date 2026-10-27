import {randomUUID} from 'node:crypto';
import type {Db} from '../../infrastructure/src/database.js';
import type {ApprovalRepository} from '../../infrastructure/src/approval-repository.js';
import type {ToolKernelAuditPort} from '../../application/src/tool-kernel.js';
import {createApprovalCoordinator} from '../../application/src/approval-service.js';
import {createToolCapabilityRegistry,createToolKernel,defineToolCapability} from '../../application/src/tool-kernel.js';
import {appError,err,ok,type ApprovalMode,type ToolKernelResult} from '@sud-d/domain';
import {
  PRE_H1_NATIVE_CONSENT,nativeConsentSnapshot,nativeConsentBindingDigest,
  readVerifiedPreH1NativeArtifacts,type PreH1NativeArtifactIdentity,
} from '../../infrastructure/src/private-mvp-pre-h1-native-consent-contract.js';
import {recordPreH1NativeGrant} from '../../infrastructure/src/private-mvp-pre-h1-native-consent.js';

const SESSION=Object.freeze({id:PRE_H1_NATIVE_CONSENT.sessionId,type:'desktop' as const});
type Review=ReturnType<typeof nativeConsentSnapshot>;

/** No renderer-supplied Mission, path, digest, token, epoch, or command.
 * A separate manual Desktop Owner decision; NO native execution here. */
export function createPreH1NativeConsentBridge(deps:{
  db:Db;approvals:ApprovalRepository;audit:ToolKernelAuditPort;
  mode:()=>ApprovalMode;now?:()=>Date;
  /** Test-only immutable snapshot of verified artifact inputs. */
  artifactReader?:()=>PreH1NativeArtifactIdentity;
}) {
  const now=deps.now??(()=>new Date());
  const readArtifacts=deps.artifactReader??readVerifiedPreH1NativeArtifacts;
  const coordinator=createApprovalCoordinator({
    repository:deps.approvals,mode:deps.mode,now,preserveOtherRuntimes:true,
  });
  let frozen:Review|undefined;
  let pendingRequestId:string|undefined;
  let terminal=false;
  function inspect():Review {
    if(terminal)throw Error('PRE_H1_NATIVE_CONSENT_TERMINAL');
    const current=nativeConsentSnapshot(deps.db,now(),readArtifacts());
    if(frozen && nativeConsentBindingDigest(frozen)!==nativeConsentBindingDigest(current))
      throw Error('PRE_H1_NATIVE_SCOPE_CHANGED');
    return frozen??(frozen=current);
  }
  function authorization(review:Review){
    return {
      session:SESSION,capability:PRE_H1_NATIVE_CONSENT.capability,effect:'execute' as const,
      security:{sensitivity:'normal' as const,context:'workspace' as const,
        workspaceId:review.workspaceId},
      descriptor:{title:'PRE-H1 NATIVE: authorize ONE synthetic Controller, NOT preparation',
        resourceLabel:review.missionId+' / '+review.missionBindingDigest},
      binding:{...review,artifacts:{...review.artifacts},
        action:'ONE_SYNTHETIC_NATIVE_30S_ZERO_RETRIES_NO_NETWORK'},
    };
  }
  const capability=defineToolCapability<Record<string,never>,{recorded:true}>({
    name:PRE_H1_NATIVE_CONSENT.capability,effect:'execute',
    validate(input){return input!==null && typeof input==='object' && !Array.isArray(input)
      && Object.keys(input).length===0 ?ok({}):err(appError('VALIDATION_FAILED','No native arguments'));},
    resolveSecurity(){try{return ok(authorization(inspect()).security);}
      catch{return err(appError('RUNNER_APPROVAL_STALE','Native scope unavailable'));}},
    approval:{
      describe(){try{return ok(authorization(inspect()).descriptor);}
        catch{return err(appError('RUNNER_APPROVAL_STALE','Native review unavailable'));}},
      bind(){try{return ok(authorization(inspect()).binding);}
        catch{return err(appError('RUNNER_APPROVAL_STALE','Native binding unavailable'));}},
    },
    execute(_input,ctx) {
      if(!frozen||terminal||ctx.approvalDecision!=='approved'
        ||ctx.approvalRequestId!==pendingRequestId)
        return err(appError('RUNNER_APPROVAL_STALE','Native Owner approval missing'));
      try{
        const scope=inspect();
        const auth=authorization(scope);
        const hmacTag=coordinator.verifyConsumedManualPreH1Native(auth,ctx.approvalRequestId!);
        if(!hmacTag)throw Error('PRE_H1_NATIVE_OWNER_HMAC_UNVERIFIED');
        terminal=true; // no retry after consuming Approval, even if Audit fails
        const accepted=recordPreH1NativeGrant(deps.db,{
          requestId:ctx.approvalRequestId!,invocationId:ctx.invocationId,
          runtimeInstanceId:coordinator.runtimeInstanceId,
          hmacTag,bindingDigest:nativeConsentBindingDigest(scope),
        },now(),readArtifacts());
        if(!accepted)throw Error('PRE_H1_NATIVE_DURABLE_GRANT_REJECTED');
        return ok({recorded:true as const});
      }catch{
        terminal=true;
        return err(appError('RUNNER_APPROVAL_STALE','Native consent not recorded'));
      }
    },
  });
  const registry=createToolCapabilityRegistry([capability]);
  if(!registry.ok)throw Error('PRE_H1_NATIVE_KERNEL_INVALID');
  const kernel=createToolKernel({registry:registry.value,audit:deps.audit,approval:coordinator});
  return Object.freeze({
    inspect,
    async request():Promise<ToolKernelResult>{
      if(terminal)throw Error('PRE_H1_NATIVE_CONSENT_TERMINAL');
      const result=await kernel.invoke({
        invocationId:randomUUID(),session:SESSION,
        capability:PRE_H1_NATIVE_CONSENT.capability,input:{},
      });
      if(!result.ok && result.code==='APPROVAL_REQUIRED'&&result.approvalRequestId)
        pendingRequestId=result.approvalRequestId;
      return result;
    },
    reviewForPendingApproval(id:string):Review|undefined{
      if(terminal||!pendingRequestId||pendingRequestId!==id)return undefined;
      try{return inspect();}catch{return undefined;}
    },
  });
}
