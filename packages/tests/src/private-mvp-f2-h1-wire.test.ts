import {describe,expect,it} from 'vitest';
import {encodeF2H1PrivateFrames, decodeF2H1TransferReceipt, F2H0_FIXED_IDENTITY} from '@sud-d/infrastructure';
const m={
  missionId:'mission-one',revision:1,attemptId:'attempt-1',
  workspaceId:'workspace-one',workspaceGeneration:'gen-one',ownerEpoch:'epoch-one',
  stageFingerprint:F2H0_FIXED_IDENTITY.stageFingerprint,
  recipeFingerprint:F2H0_FIXED_IDENTITY.recipeFingerprint
};
const b={gatewayProcess:23n,temporaryJob:24n,heldEntry:25n,stageVolume:26n,stageFileId:Buffer.from('00112233445566778899aabbccddeeff','hex')};
describe('H1 private fixed ABI encoding (pure buffer tests; no native process)',()=>{
 it('packs exactly 814+216 bytes matching C++ packed WCHAR, SHA, nonce and owned handles',()=>{
   const nonce=Buffer.alloc(32,0xa5);
   const frames=encodeF2H1PrivateFrames(m,b,nonce);
   expect(frames.length).toBe(1030);
   expect(frames.readUInt32LE(0)).toBe(0x30483246);
   expect(frames.readUInt32LE(4)).toBe(1);
   expect(frames.subarray(8,8+22).toString('utf16le')).toBe('mission-one');
   expect(frames.readUInt32LE(136)).toBe(1);
   expect(frames.subarray(652,716).toString()).toBe(m.stageFingerprint);
   expect(frames.subarray(782,814)).toEqual(nonce);
   expect(frames.readUInt32LE(814)).toBe(0x30483246);
   expect(frames.subarray(814+136,814+168)).toEqual(nonce);
   expect(frames.readBigUInt64LE(814+168)).toBe(23n);
   expect(frames.readBigUInt64LE(814+176)).toBe(24n);
   expect(frames.readBigUInt64LE(814+184)).toBe(25n);
   expect(frames.readBigUInt64LE(814+192)).toBe(26n);
   expect(frames.subarray(814+200)).toEqual(b.stageFileId);
 });
 it('rejects malformed tokens, raw selectors, wrong digest/epoch, pseudo OS handles and reused nonce',()=>{
   const n=Buffer.alloc(32,8);
   for(const bad of [
     {...m,ownerEpoch:'x'.repeat(64)},
     {...m,attemptId:'../bad'},
     {...m,additionalArg:'evil'},
     {...m,stageFingerprint:'f'.repeat(64)},
   ])expect(()=>encodeF2H1PrivateFrames(bad,b,n)).toThrow();
   expect(()=>encodeF2H1PrivateFrames(m,{...b,temporaryJob:23n},n)).toThrow();
   expect(()=>encodeF2H1PrivateFrames(m,{...b,heldEntry:-1n},n)).toThrow();
   expect(()=>encodeF2H1PrivateFrames(m,b,Buffer.alloc(31))).toThrow();
   expect(()=>encodeF2H1PrivateFrames(m,b,Buffer.alloc(32))).toThrow();
 });
 it('rejects arbitrary or truncated receipt frames and parses only two candidate handles',()=>{
   const raw=Buffer.alloc(24);
   raw.writeUInt32LE(0x30483246,0);
   raw.writeUInt32LE(1,4);
   raw.writeBigUInt64LE(91n,8);
   raw.writeBigUInt64LE(92n,16);
   expect(decodeF2H1TransferReceipt(raw)).toEqual({process:91n,thread:92n});
   expect(()=>decodeF2H1TransferReceipt(raw.subarray(0,23))).toThrow();
   const colliding=Buffer.from(raw);colliding.writeBigUInt64LE(91n,16);
   expect(()=>decodeF2H1TransferReceipt(colliding)).toThrow();
   const badVersion=Buffer.from(raw);badVersion.writeUInt32LE(2,4);
   expect(()=>decodeF2H1TransferReceipt(badVersion)).toThrow();
 });
});
