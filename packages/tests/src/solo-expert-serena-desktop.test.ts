import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ok } from '@sud-d/domain';
import { openDatabase } from '../../infrastructure/src/database.js';
import { createApprovalRepository } from '../../infrastructure/src/approval-repository.js';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import { SOLO_B1_RISK } from '../../domain/src/solo-expert-serena.js';
import { createDesktopApprovalController } from '../../desktop/electron/approval-controller.js';
import { registerDesktopApprovalIpcHandlers } from '../../desktop/electron/approval-ipc.js';
// Ensure protected production handler is tested with the ACTUAL refreshed compiled Contracts runtime,
// not Vitest's default alias-to-source.
vi.mock('@sud-d/contracts', async () => import('../../contracts/dist/index.js'));
import { ApprovalRespondInputSchema as compiledSchema, IPC_CHANNELS } from '../../contracts/dist/index.js';

function reviewed() {
  const base = {
    version:'b1b-review-v1' as const,attemptId:'attempt-1',command:'echo SUD_D_B1_OK' as const,
    profileId:'harmless-short-smoke' as const,profileRevision:'b1-smoke-v1' as const,
    workspaceId:'workspace-1',canonicalRoot:'C:/trusted-test',workspaceGeneration:'3',
    sessionId:'mcp-session-1',sessionType:'mcp-stdio' as const,
    gatewayEpoch:'gateway-1',managedEpoch:'managed-1',
    deviceLabel:'observed-device',accountLabel:'observed-account',
    provenance:'unverified-observation' as const,
    riskDisclosure:SOLO_B1_RISK,privacy:'stock-local-logging' as const,
    issuedAt:new Date(Date.now()-1000).toISOString(),
    expiresAt:new Date(Date.now()+60_000).toISOString(),
    maxCalls:1 as const,maxRetries:0 as const,
  };
  return {...base,reviewDigest:createHash('sha256').update(JSON.stringify(base)).digest('hex')};
}
function fixture() {
  const review=reviewed(),id='11111111-1111-4111-8111-111111111111';
  const record={
    id,capability:'solo_expert.smoke',effect:'execute' as const,sensitivity:'sensitive' as const,
    runtimeInstanceId:'gateway-1',bindingDigest:'b'.repeat(64),
    sessionId:review.sessionId,sessionType:review.sessionType,
    policyContext:'workspace' as const,workspaceId:review.workspaceId,
    title:'Fixed smoke',status:'pending' as const,
    createdAt:review.issuedAt,expiresAt:review.expiresAt,soloExpertReview:review,
  };
  const calls: Array<{id:string;decision:string;digest?:string}>=[];
  const service={
    list:()=>ok([record]),
    respond:(rid:string,decision:'approve'|'deny',digest?:string)=>{
      calls.push({id:rid,decision,digest});
      if (digest!==review.reviewDigest) return {ok:false as const,error:{code:'APPROVAL_STATE_INVALID' as const,message:'stale'}};
      return ok({...record,status:decision==='approve'?'approved' as const:'denied' as const});
    },
  };
  const mode={get:()=>ok('standard' as const),set:()=>ok('standard' as const)};
  const controller=createDesktopApprovalController(service as never,mode as never);
  return {review,record,service,controller,calls,id};
}
describe('B1b R3 Desktop real compiled schema & unchanged IPC handler',()=>{
  it('forwards a valid human-reviewed digest through the actual protected IPC handler and controller',()=>{
    const f=fixture();
    const dto=f.controller.list({limit:5});
    expect(dto).toMatchObject({ok:true,value:[{soloExpertReview:{reviewDigest:f.review.reviewDigest,
      command:'echo SUD_D_B1_OK'}}]});
    const listeners=new Map<string,(e:{sender:unknown},raw?:unknown)=>unknown>();
    registerDesktopApprovalIpcHandlers({
      handle:(channel,fn)=>{listeners.set(channel,fn);}
    },f.controller,sender=>sender==='trusted');
    const handle=listeners.get(IPC_CHANNELS.APPROVAL_RESPOND);
    if(!handle) throw Error('IPC listener not registered');
    const good={approvalRequestId:f.id,decision:'approve' as const,reviewDigest:f.review.reviewDigest};
    expect(compiledSchema.safeParse(good).success).toBe(true);
    expect(handle({sender:'untrusted'},good)).toMatchObject({ok:false});
    expect(handle({sender:'trusted'},{...good,command:'echo MALICIOUS'})).toMatchObject({ok:false});
    expect(handle({sender:'trusted'},good)).toMatchObject({ok:true,value:{status:'approved'}});
    expect(f.calls).toEqual([{id:f.id,decision:'approve',digest:f.review.reviewDigest}]);
  });
  it('rejects missing/wrong digest, and preserves legacy two-field packet parse',()=>{
    const f=fixture();
    expect(compiledSchema.safeParse({approvalRequestId:f.id,decision:'approve'}).success).toBe(true);
    expect(f.controller.respond({approvalRequestId:f.id,decision:'approve'}).ok).toBe(false);
    expect(f.controller.respond({approvalRequestId:f.id,decision:'approve',
      reviewDigest:'a'.repeat(64)}).ok).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
  it('real Gateway HMAC + SQLite user Approval persists the EXACT digest shown through the unchanged IPC',async()=>{
    const db=openDatabase(':memory:');
    try {
      const repo=createApprovalRepository(db),review=reviewed(),clock=new Date();
      const coordinator=createApprovalCoordinator({
        repository:repo,runtimeInstanceId:'gateway-runtime-real',
        hmacKey:Buffer.alloc(32,31),now:()=>clock,mode:()=>'full_access',
        preserveOtherRuntimes:true,
      });
      const service=createApprovalService(repo,{append:()=>undefined},()=>clock);
      const controller=createDesktopApprovalController(service as never,{
        get:()=>ok('full_access' as const),set:()=>ok('standard' as const),
      } as never);
      const request={
        session:{id:review.sessionId,type:'mcp-stdio' as const},
        capability:'solo_expert.smoke',effect:'execute' as const,
        security:{sensitivity:'sensitive' as const,context:'workspace' as const,
          workspaceId:review.workspaceId},
        descriptor:{title:'One fixed reviewed command',soloExpertReview:review},
        binding:{
          attemptId:review.attemptId,reviewDigest:review.reviewDigest,
          workspaceId:review.workspaceId,generation:review.workspaceGeneration,
          sessionId:review.sessionId,sessionType:review.sessionType,
          gatewayEpoch:review.gatewayEpoch,managedEpoch:review.managedEpoch,
        },
      };
      const pending=await coordinator.authorize(request);
      expect(pending).toMatchObject({ok:true,state:'pending'});
      if(!pending.ok || pending.state!=='pending')throw Error('real manual pending required');
      const list=controller.list({limit:5});
      expect(list).toMatchObject({ok:true,value:[{soloExpertReview:review}]});
      expect(coordinator.verifyConsumedManualSolo(request,pending.requestId)).toBeUndefined();
      const handlers=new Map<string,(e:{sender:unknown},raw?:unknown)=>unknown>();
      registerDesktopApprovalIpcHandlers({handle:(key,handler)=>{handlers.set(key,handler);}},
        controller,sender=>sender==='authorized-desktop');
      const respond=handlers.get(IPC_CHANNELS.APPROVAL_RESPOND);
      if(!respond)throw Error('handler');
      const shownDigest=review.reviewDigest;
      for(const bad of [
        {approvalRequestId:pending.requestId,decision:'approve'},
        {approvalRequestId:pending.requestId,decision:'approve',reviewDigest:'a'.repeat(64)},
        {approvalRequestId:pending.requestId,decision:'approve',
          reviewDigest:shownDigest,command:'echo UNTRUSTED'},
      ]){
        expect(respond({sender:'authorized-desktop'},bad)).toMatchObject({ok:false});
        expect(repo.findById(pending.requestId)).toMatchObject({ok:true,value:{status:'pending'}});
      }
      const result=respond({sender:'authorized-desktop'},{
        approvalRequestId:pending.requestId,decision:'approve',reviewDigest:shownDigest,
      });
      expect(result).toMatchObject({ok:true,value:{status:'approved'}});
      expect(repo.findById(pending.requestId)).toMatchObject({
        ok:true,value:{status:'approved',decisionSource:'user',
          soloExpertReview:{reviewDigest:shownDigest}},
      });
      expect(await coordinator.authorize(request)).toMatchObject({ok:true,state:'approved'});
      expect(repo.findById(pending.requestId)).toMatchObject({
        ok:true,value:{status:'consumed',decisionSource:'user'},
      });
      expect(coordinator.verifyConsumedManualSolo(request,pending.requestId)).toMatch(/^[a-f0-9]{64}$/);
      expect(coordinator.verifyConsumedManualSolo({...request,binding:{...request.binding,
        gatewayEpoch:'different'}},pending.requestId)).toBeUndefined();
      expect(coordinator.verifyConsumedManualSolo({...request,descriptor:{
        ...request.descriptor,soloExpertReview:{...review,command:'echo INJECTED' as never},
      }},pending.requestId)).toBeUndefined();
    }finally{db.close();}
  });
  it('preserves Basic Approval two-field legacy decisions through compiled IPC and unchanged handler',()=>{
    const f=fixture();
    const basic={...f.record,capability:'workspace.read_text',soloExpertReview:undefined};
    const seen:Array<{id:string;decision:string;digest?:string}>=[];
    const service={
      list:()=>ok([basic]),
      respond:(id:string,decision:'approve'|'deny',digest?:string)=>{
        seen.push({id,decision,digest});
        return ok({...basic,status:decision==='approve'?'approved' as const:'denied' as const});
      },
    };
    const controller=createDesktopApprovalController(service as never,{
      get:()=>ok('standard' as const),set:()=>ok('standard' as const),
    } as never);
    const handlers=new Map<string,(e:{sender:unknown},raw?:unknown)=>unknown>();
    registerDesktopApprovalIpcHandlers({handle:(name,fn)=>{handlers.set(name,fn);}},
      controller,sender=>sender==='trusted');
    const cb=handlers.get(IPC_CHANNELS.APPROVAL_RESPOND);
    if(!cb)throw Error('registered handler');
    expect(cb({sender:'trusted'},{approvalRequestId:f.id,decision:'approve'})).toMatchObject({
      ok:true,value:{status:'approved'},
    });
    expect(seen).toEqual([{id:f.id,decision:'approve',digest:undefined}]);
  });
  it('never exposes a corrupt or expired stored Solo projection as approvable',()=>{
    const f=fixture();
    f.review.reviewDigest='f'.repeat(64);
    expect(f.controller.list({limit:5}).ok).toBe(false);
    expect(f.controller.respond({approvalRequestId:f.id,decision:'approve',
      reviewDigest:'f'.repeat(64)}).ok).toBe(false);
    expect(f.calls).toHaveLength(0);
    const fresh=fixture();
    fresh.review.expiresAt='2020-01-01T00:00:00.000Z';
    expect(fresh.controller.list({limit:5}).ok).toBe(false);
  });
  it('valid reviewed DENY includes identical displayed SHA-256, without issuing an execute grant',()=>{
    const f=fixture();
    expect(f.controller.respond({approvalRequestId:f.id,decision:'deny',
      reviewDigest:f.review.reviewDigest})).toMatchObject({ok:true,value:{status:'denied'}});
    expect(f.calls).toEqual([{id:f.id,decision:'deny',digest:f.review.reviewDigest}]);
  });
});
