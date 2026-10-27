import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../infrastructure/src/database.js';
import { createApprovalRepository } from '../../infrastructure/src/approval-repository.js';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import { SOLO_B1_RISK } from '../../domain/src/solo-expert-serena.js';

const clock = new Date('2026-10-14T11:00:00.000Z');
function fixture(mode: 'standard'|'approve_for_me'|'full_access'='standard') {
  const db=openDatabase(':memory:');
  const repo=createApprovalRepository(db);
  const coordinator=createApprovalCoordinator({
    repository:repo,runtimeInstanceId:'b1b-review-gateway',
    hmacKey:Buffer.alloc(32, 12),now:()=>clock,mode:()=>mode,preserveOtherRuntimes:true,
  });
  const service=createApprovalService(repo,{append:()=>undefined},()=>clock);
  const base = {
    version:'b1b-review-v1' as const,
    attemptId:'sample-attempt',
    command:'echo SUD_D_B1_OK' as const,
    profileId:'harmless-short-smoke' as const,
    profileRevision:'b1-smoke-v1' as const,
    workspaceId:'workspace-1',
    canonicalRoot:'C:/trusted-root',
    workspaceGeneration:'6',
    sessionId:'gateway-session',
    sessionType:'mcp-stdio',
    gatewayEpoch:'gateway-v1',
    managedEpoch:'managed-v1',
    deviceLabel:'synthetic-device',
    accountLabel:'synthetic-account',
    provenance:'unverified-observation' as const,
    riskDisclosure:SOLO_B1_RISK,
    privacy:'stock-local-logging' as const,
    issuedAt:clock.toISOString(),
    expiresAt:'2026-10-14T11:01:30.000Z',
    maxCalls:1 as const,maxRetries:0 as const,
  };
  const review={...base,reviewDigest:createHash('sha256').update(JSON.stringify(base)).digest('hex')};
  const request={
    session:{id:base.sessionId,type:'mcp-stdio' as const},
    capability:'solo_expert.smoke',effect:'execute' as const,
    security:{sensitivity:'sensitive' as const,context:'workspace' as const,workspaceId:base.workspaceId},
    descriptor:{title:'Solo reviewed command',soloExpertReview:review},
    binding:{
      attemptId:base.attemptId,reviewDigest:review.reviewDigest,workspaceId:base.workspaceId,
      generation:base.workspaceGeneration,sessionId:base.sessionId,sessionType:base.sessionType,
      gatewayEpoch:base.gatewayEpoch,managedEpoch:base.managedEpoch,
    },
  };
  return {db,repo,coordinator,service,request,review};
}

describe('B1b real SQLite and Gateway HMAC user-only approval',()=>{
  it.each(['standard','approve_for_me','full_access'] as const)('%s must not auto-approve',async mode=>{
    const h=fixture(mode);
    try {
      const pending=await h.coordinator.authorize(h.request);
      expect(pending).toMatchObject({ok:true,state:'pending'});
      if (!pending.ok || pending.state!=='pending') throw Error('pending expected');
      expect(h.repo.findById(pending.requestId)).toMatchObject({
        ok:true,value:{status:'pending',soloExpertReview:{command:'echo SUD_D_B1_OK',
          reviewDigest:h.review.reviewDigest}},
      });
      expect(h.coordinator.verifyConsumedManualSolo(h.request,pending.requestId)).toBeUndefined();
      expect(h.service.respond(pending.requestId,'approve').ok).toBe(false);
      expect(h.service.respond(pending.requestId,'approve','f'.repeat(64)).ok).toBe(false);
      expect(h.repo.findById(pending.requestId)).toMatchObject({ok:true,value:{status:'pending'}});
      const stored = h.repo.findById(pending.requestId);
      if (!stored.ok || !stored.value?.soloExpertReview) throw Error('review must be persisted');
      expect(h.service.respond(pending.requestId,'approve',
        stored.value.soloExpertReview.reviewDigest).ok).toBe(true);
      expect(await h.coordinator.authorize(h.request)).toMatchObject({ok:true,state:'approved'});
      expect(h.coordinator.verifyConsumedManualSolo(h.request,pending.requestId)).toMatch(/^[a-f0-9]{64}$/);
      expect(h.coordinator.verifyConsumedManualSolo({...h.request,binding:{
        ...h.request.binding,reviewDigest:'f'.repeat(64),
      }},pending.requestId)).toBeUndefined();
      expect(h.repo.cleanupTerminal('2030-01-01T00:00:00.000Z').ok).toBe(true);
      expect(h.repo.findById(pending.requestId)).toMatchObject({ok:true,value:{status:'consumed'}});
    }finally {h.db.close();}
  });
  it('rejects arbitrary/different command, root, expiry, review digest, and invisible scope',async()=>{
    const h=fixture();
    try {
      const original=h.request;
      for (const override of [
        {...h.review,command:'echo injected'},
        {...h.review,canonicalRoot:'C:/other'},
        {...h.review,riskDisclosure:'hidden'},
        {...h.review,reviewDigest:'f'.repeat(64)},
        {...h.review,expiresAt:'2020-01-01T00:00:00.000Z'},
      ]) {
        const response=await h.coordinator.authorize({...original,descriptor:{
          ...original.descriptor,soloExpertReview:override as typeof h.review,
        }});
        expect(response).toMatchObject({ok:false});
      }
    }finally{h.db.close();}
  });
  it('refuses mode-sourced consumed grant independently of its hash format',()=>{
    const h=fixture();
    try {
      expect(h.repo.recordModeApproval({
        runtimeInstanceId:'b1b-review-gateway',bindingDigest:'a'.repeat(64),
        sessionId:'gateway-session',sessionType:'mcp-stdio',
        capability:'solo_expert.smoke',effect:'execute',sensitivity:'sensitive',
        policyContext:'workspace',workspaceId:'workspace-1',title:'bad',
        createdAt:clock.toISOString(),expiresAt:'2026-10-14T11:01:30.000Z',
      },clock.toISOString()).ok).toBe(false);
    }finally {h.db.close();}
  });
});
