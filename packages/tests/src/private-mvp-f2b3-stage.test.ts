import { describe,expect,it,vi } from 'vitest';
import {
 F2B2_FIXED_PROOF, PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
 createPrivateMvpReviewedSyntheticStage, privateMvpSyntheticExecutionFingerprint, type PrivateMvpHeldFileEvidence,
 type PrivateMvpMissionScope,
} from '@sud-d/infrastructure';
import path from 'node:path';
const sha=(c:string)=>c.repeat(64);
const mission:PrivateMvpMissionScope={
 missionId:'mission-a', revision:1,goalDigest:sha('a'),workspaceId:'workspace-a',
 workspaceGeneration:'generation-a',runnerId:'report',executionFingerprint:privateMvpSyntheticExecutionFingerprint({workspaceId:'workspace-a',workspaceGeneration:'generation-a',runnerId:'report',inputDigest:F2B2_FIXED_PROOF.inputSha256,policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY}),
 inputDigest:F2B2_FIXED_PROOF.inputSha256,resourcePolicyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
 expiresAt:'2026-10-08T09:25:00.000Z'
};
const entry=path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture.mjs');
const child=path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture-child.mjs');
const grand=path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture-grandchild.mjs');
const input=path.win32.join(F2B2_FIXED_PROOF.root,'stage','input.json');
const evidence=(filepath:string, sha256:string): PrivateMvpHeldFileEvidence=>({
 path:filepath, sha256, volumeId:'volume-1',fileId:filepath, hardlinks:1,
 reparse:false,heldOpen:true,readOnly:true,ownerAclExact:true,noOtherWorkspaceAccess:true,
});
const files=[evidence(entry,F2B2_FIXED_PROOF.entrySha256),
 evidence(child,'f8d9974970ca9b4f9ff2cebbb5831505e14575634ce84906ce67b1ead79380bc'),
 evidence(grand,'269d70fb7334cbc1c8c75a93d04a0a55c274031a27cd132bdccc4f79209d80b4'),
 evidence(input,F2B2_FIXED_PROOF.inputSha256)];
describe('F2-B3 trusted synthetic reviewed-v1 stage admission (mocked OS attestations only)',()=>{
 it('accepts exact review with owned held handles only and remains unregistered',async()=>{
  const release=vi.fn(async()=>true);
  const attestor={ attest:vi.fn(async()=>({
    files, stageRootSafe:true,outputScratchOwned:true,profileAclExact:true,
    noReparseAncestors:true,dependenciesClosed:true,release,
  }))};
  const result=await createPrivateMvpReviewedSyntheticStage({
    mission,now:()=>new Date('2026-10-08T09:00:00Z'),attemptId:'attempt-1',runtimeSha256:F2B2_FIXED_PROOF.executableSha256,
    executionFingerprint:mission.executionFingerprint,inputDigest:mission.inputDigest,
    policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,attestor,
  });
  expect(result?.stage.profileRevision).toBe('private-mvp-reviewed-v1');
  expect(result?.stage.entryPath).toBe(entry);
  expect(result?.launchAuthority).toBe(false);
  expect(await result?.release()).toBe(true);
  expect(release).toHaveBeenCalledOnce();
 });
 it('fails closed on changed hash, hardlink, reparse, ACL or missing ownership attestation',async()=>{
  for(const changed of [
    {...files[0]!,sha256:sha('f')},
    {...files[0]!,hardlinks:2},
    {...files[0]!,reparse:true},
    {...files[0]!,ownerAclExact:false},
    {...files[0]!,heldOpen:false},
  ]){
   const attestor={attest:async()=>({
     files:[changed,...files.slice(1)],stageRootSafe:true,outputScratchOwned:true,
     profileAclExact:true,noReparseAncestors:true,dependenciesClosed:true,
     release:async()=>true,
   })};
   expect(await createPrivateMvpReviewedSyntheticStage({
     mission,now:()=>new Date('2026-10-08T09:00:00Z'),attemptId:'attempt-1',runtimeSha256:F2B2_FIXED_PROOF.executableSha256,
     executionFingerprint:mission.executionFingerprint,inputDigest:mission.inputDigest,
     policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,attestor,
   })).toBeNull();
  }
 });
 it('rejects expired consent and duplicated held file identity, releasing rejected evidence',async()=>{
  const release=vi.fn(async()=>true);
  const attestor={attest:async()=>({
    files:[files[0],{...files[1]!,fileId:files[0]!.fileId},...files.slice(2)],
    stageRootSafe:true,outputScratchOwned:true,profileAclExact:true,
    noReparseAncestors:true,dependenciesClosed:true,release,
  })};
  expect(await createPrivateMvpReviewedSyntheticStage({
    mission,now:()=>new Date('2026-10-08T09:00:00Z'),attemptId:'attempt-1',
    runtimeSha256:F2B2_FIXED_PROOF.executableSha256,executionFingerprint:mission.executionFingerprint,
    inputDigest:mission.inputDigest,policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,attestor,
  })).toBeNull();
  expect(release).toHaveBeenCalledOnce();
  expect(await createPrivateMvpReviewedSyntheticStage({
    mission,now:()=>new Date('2026-10-08T09:25:00Z'),attemptId:'attempt-1',
    runtimeSha256:F2B2_FIXED_PROOF.executableSha256,executionFingerprint:mission.executionFingerprint,
    inputDigest:mission.inputDigest,policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,attestor,
  })).toBeNull();
  expect(release).toHaveBeenCalledOnce();
 });
 it('rejects forged input fingerprint, policy, missing OS attestor and never promotes legacy snapshot',async()=>{
  const attestor={attest:async()=>({
    files,stageRootSafe:true,outputScratchOwned:true,profileAclExact:true,
    noReparseAncestors:true,dependenciesClosed:true,release:async()=>true,
  })};
  expect(await createPrivateMvpReviewedSyntheticStage({
    mission,now:()=>new Date('2026-10-08T09:00:00Z'),attemptId:'attempt-1',runtimeSha256:F2B2_FIXED_PROOF.executableSha256,
    executionFingerprint:sha('f'),inputDigest:mission.inputDigest,
    policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,attestor,
  })).toBeNull();
  expect(await createPrivateMvpReviewedSyntheticStage({
    mission,now:()=>new Date('2026-10-08T09:00:00Z'),attemptId:'attempt-1',runtimeSha256:F2B2_FIXED_PROOF.executableSha256,
    executionFingerprint:mission.executionFingerprint,inputDigest:mission.inputDigest,
    policyIdentity:sha('e'),attestor,
  })).toBeNull();
 });
});
