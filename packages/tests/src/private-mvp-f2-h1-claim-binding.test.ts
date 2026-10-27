import {describe,expect,it,vi} from 'vitest';
import {createF2H1ClaimBoundPreparation,F2H0_FIXED_IDENTITY,PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,F2B2_FIXED_PROOF} from '@sud-d/infrastructure';
const input=()=>({
 mission:{missionId:'m1',revision:1,goalDigest:'a'.repeat(64),workspaceId:'w1',workspaceGeneration:'g1',runnerId:'report',
 executionFingerprint:'e'.repeat(64),inputDigest:F2B2_FIXED_PROOF.inputSha256,resourcePolicyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,expiresAt:'2030-10-08T20:00:00.000Z'},
 attemptId:'a1',ownerEpoch:'owner-epoch-one',
 stageFingerprint:F2H0_FIXED_IDENTITY.stageFingerprint,
 recipeFingerprint:F2H0_FIXED_IDENTITY.recipeFingerprint,
});
const rig=()=>{
 const calls:string[]=[];
 const claim={claimLaunch:vi.fn(()=>{calls.push('db-claim');return {ok:true,value:undefined} as const;})};
 const persist={pending:vi.fn(async()=>{calls.push('pending');return true;}),
  quarantine:vi.fn(async()=>{calls.push('quarantine');return true;})};
 const prepare=vi.fn(async()=>{calls.push('gateway');return {ok:true as const,nativeAuthorization:false as const};});
 return {claim,persist,prepare,calls};
};
describe('H1 durable launch claim and pending OS evidence fence (mock-only)',()=>{
 it('claims once before any Gateway creation, persists pending evidence but never makes it native proof',async()=>{
   const f=rig();
   const bound=createF2H1ClaimBoundPreparation(f.claim,f.persist,f.prepare);
   expect(await bound(input())).toEqual({ok:true,nativeAuthorization:false,evidence:'pending'});
   expect(f.calls).toEqual(['db-claim','gateway','pending']);
   expect(await bound(input())).toEqual({ok:false,reason:'already-claimed'});
 });
 it('refuses missing/stale identity before claim or creation',async()=>{
   const f=rig();
   const bound=createF2H1ClaimBoundPreparation(f.claim,f.persist,f.prepare);
   expect(await bound({...input(),recipeFingerprint:'f'.repeat(64)})).toMatchObject({ok:false});
   expect(f.claim.claimLaunch).not.toHaveBeenCalled();
   expect(f.prepare).not.toHaveBeenCalled();
 });
 it('if gateway transfer succeeds but persistence fails, quarantines and never permits resume',async()=>{
   const f=rig();f.persist.pending.mockResolvedValue(false);
   expect(await createF2H1ClaimBoundPreparation(f.claim,f.persist,f.prepare)(input()))
     .toEqual({ok:false,reason:'pending-evidence-unconfirmed'});
   expect(f.persist.quarantine).toHaveBeenCalledOnce();
 });
 it('denied durable launch claim prevents OS adapter creation; reentry cannot retry',async()=>{
   const f=rig();f.claim.claimLaunch.mockReturnValue({ok:false,error:{code:'RUNNER_APPROVAL_STALE'}} as any);
   const bound=createF2H1ClaimBoundPreparation(f.claim,f.persist,f.prepare);
   expect(await bound(input())).toEqual({ok:false,reason:'launch-claim-rejected'});
   expect(f.prepare).not.toHaveBeenCalled();
   expect(await bound(input())).toEqual({ok:false,reason:'already-claimed'});
 });
});
