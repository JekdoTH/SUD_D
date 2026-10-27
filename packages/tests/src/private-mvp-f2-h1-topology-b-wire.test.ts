import {describe,expect,it} from 'vitest';
import {encodeF2H1RunnerPrivateFrames,decodeF2H1RunnerTransferReceipt,F2H1_RUNNER_WIRE_LAYOUT,F2H1_TOPOLOGY_B} from '@sud-d/infrastructure';
const request=()=>({missionId:'mission-1',revision:1,attemptId:'attempt-1',ownerEpoch:'desktop-epoch-1',workspaceId:'workspace-1',workspaceGeneration:'gen-1',stageFingerprint:F2H1_TOPOLOGY_B.stageFingerprint,recipeFingerprint:F2H1_TOPOLOGY_B.recipeFingerprint});
const bootstrap=()=>({runnerProcess:11n,temporaryWorkerJob:12n,heldEntry:13n,stageVolume:123n,stageFileId:Buffer.alloc(16,7),profileSid:Buffer.from([1,2,0,0,0,0,0,0,0])});
describe('Topology B H0 V2 private ABI static bytes; never native',()=>{
  it('matches C++ packed request/bootstrap and seals a nonzero profile SID',()=>{
    expect(F2H1_RUNNER_WIRE_LAYOUT).toMatchObject({requestBytes:814,bootstrapBytes:288,receiptBytes:24,version:2});
    const b=encodeF2H1RunnerPrivateFrames(request(),bootstrap(),Buffer.alloc(32,1));
    expect(b.length).toBe(1102);
    expect(b.readUInt32LE(4)).toBe(2);
    expect(b.readUInt32LE(814+4)).toBe(2);
    expect(b.readBigUInt64LE(814+168)).toBe(11n);
    expect(b.readUInt32LE(814+216)).toBe(9);
    expect(b.subarray(814+220,814+229)).toEqual(bootstrap().profileSid);
    expect(b.toString('ascii',652,716)).toBe(F2H1_TOPOLOGY_B.stageFingerprint);
  });
  it('refuses v1/stale/unknown profile and forged handle alias, never grants native permit',()=>{
    expect(()=>encodeF2H1RunnerPrivateFrames({...request(),stageFingerprint:'f'.repeat(64)},bootstrap(),Buffer.alloc(32,1))).toThrow();
    expect(()=>encodeF2H1RunnerPrivateFrames(request(),{...bootstrap(),profileSid:Buffer.alloc(0)},Buffer.alloc(32,1))).toThrow();
    expect(()=>encodeF2H1RunnerPrivateFrames(request(),{...bootstrap(),temporaryWorkerJob:11n},Buffer.alloc(32,1))).toThrow();
    expect(()=>encodeF2H1RunnerPrivateFrames(request(),bootstrap(),Buffer.alloc(32))).toThrow();
    const receipt=Buffer.alloc(24);
    receipt.writeUInt32LE(0x30483246,0);receipt.writeUInt32LE(2,4);
    receipt.writeBigUInt64LE(111n,8);receipt.writeBigUInt64LE(112n,16);
    expect(decodeF2H1RunnerTransferReceipt(receipt)).toEqual({process:111n,thread:112n});
    receipt.writeUInt32LE(1,4);
    expect(()=>decodeF2H1RunnerTransferReceipt(receipt)).toThrow();
  });
});
