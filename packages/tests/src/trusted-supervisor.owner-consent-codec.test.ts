import {describe,expect,it} from 'vitest';
import { syntacticExampleBundle } from './trusted-supervisor.owner-consent-model.js';
import { encodeInertCore, decodeInertCore, buildInertCommitments,
  encodeInertStatusRequest, decodeInertStatusRequest,
  checkInertPacketConsistency, sha256Domain } from './trusted-supervisor.owner-consent-codec.js';
const bytes=(h:string)=>Uint8Array.from(h.match(/../g)!.map(x=>parseInt(x,16)));
const hex=(b:Uint8Array)=>Buffer.from(b).toString('hex');
describe('Option A inert canonical codec — binary bytes are NEVER consent',()=>{
  it('matches independently specified fixed-status golden bytes and SHA-256 domain literal',()=>{
    const value=encodeInertStatusRequest({
      bundleId:'11'.repeat(16),sealDigest:'22'.repeat(32),ordinal:1});
    expect(value.ok).toBe(true);
    if(!value.ok)throw Error(value.code);
    const expected='5344413101000331000000'+'11'.repeat(16)+'22'.repeat(32)+'01';
    expect(hex(value.bytes)).toBe(expected);
    // Independently calculated using Python hashlib, not this encoder.
    expect(sha256Domain('SUDD-A1-Core-v1',bytes(expected)))
      .toBe('a111f6f588f849332da512679abbe5bb468fc3439964144295ea7be1abad9c6c');
    expect(decodeInertStatusRequest(value.bytes)).toMatchObject({ok:true,
      request:{bundleId:'11'.repeat(16),sealDigest:'22'.repeat(32),ordinal:1}});
  });

  it('roundtrips deterministic owned full inert core without aliasing mutable bytes',()=>{
    const source=syntacticExampleBundle();
    const first=encodeInertCore(source);
    const second=encodeInertCore(syntacticExampleBundle());
    expect(first.ok).toBe(true);
    if(!first.ok||!second.ok)throw Error('codec');
    expect(first.bytes.length).toBeLessThanOrEqual(65536);
    expect(hex(first.bytes)).toBe(hex(second.bytes));
    expect(hex(first.bytes.slice(0,11))).toMatch(/^53444131010001/);
    const decoded=decodeInertCore(first.bytes);
    expect(decoded.ok).toBe(true);
    if(!decoded.ok)throw Error(decoded.code);
    first.bytes.fill(0);
    source.task.taskId='tampered';
    expect(decoded.model.task.taskId).toBe('fake-task');
    expect(decoded.model.trust).toBe('UNVERIFIED');
    expect(decoded.model.authority).toBe('MISSING');
    expect(decoded.model.launchAllowed).toBe(false);
    expect(Object.isFrozen(decoded.model.campaigns[0]?.slots)).toBe(true);
  });

  it('rejects truncation, trailing bytes, endian confusion, header mismatch and unknown kinds',()=>{
    const r=encodeInertCore(syntacticExampleBundle());
    if(!r.ok)throw Error(r.code);
    for(const candidate of [
      new Uint8Array(),r.bytes.slice(0,3),r.bytes.slice(0,11),
      r.bytes.slice(0,-1),Uint8Array.from([...r.bytes,0]),
      Uint8Array.from(r.bytes, (b,i)=>i===0?0:b),
      Uint8Array.from(r.bytes, (b,i)=>i===4?2:b),
      Uint8Array.from(r.bytes, (b,i)=>i===6?255:b),
      Uint8Array.from(r.bytes, (b,i)=>i===7?0:b),
      Uint8Array.from(r.bytes, (b,i)=>i===8?255:b),
      Uint8Array.from(r.bytes, (b,i)=>i===9?255:b),
    ])expect(decodeInertCore(candidate)).toMatchObject({ok:false});
    expect(decodeInertCore(new Proxy(r.bytes,{get(){throw Error('hostile');}})))
      .toMatchObject({ok:false});
  });

  it('rejects malicious post-encoding UTF-16, unsafe U64, length overflow and wrong domain',()=>{
    const r=encodeInertCore(syntacticExampleBundle());
    if(!r.ok)throw Error(r.code);
    // Independently mapped SDA1 v1 fixed fields: 11-byte header + 16-byte
    // bundle ID + 2*U64 clocks + 16-byte installation ID + U32 revision
    // + 32-byte device digest = owner-SID UTF-16 length at offset 95.
    const changed=(edits:readonly [number,number][])=>{
      const copy=Uint8Array.from(r.bytes);
      for(const [pos,value] of edits)copy[pos]=value;
      return decodeInertCore(copy);
    };
    expect(changed([[95,255],[96,255]])).toMatchObject({ok:false});
    expect(changed([[97,0],[98,0]])).toMatchObject({ok:false});
    expect(changed([[97,0],[98,0xd8]])).toMatchObject({ok:false});
    expect(changed([[97,0x2e],[98,0x20]])).toMatchObject({ok:false});
    expect(changed(Array.from({length:8},(_,i)=>[27+i,255] as [number,number])))
      .toMatchObject({ok:false});
    expect(()=>sha256Domain('SHA1',r.bytes)).toThrow('INVALID_DOMAIN');
  });

  it('denies bad text, reserved paths, surrogates, control and bidi before encoding',()=>{
    for(const patch of [
      {task:{...syntacticExampleBundle().task,taskId:'bad\uD800'}},
      {task:{...syntacticExampleBundle().task,taskId:'bad\u202e'}},
      {task:{...syntacticExampleBundle().task,taskId:'bad\0'}},
      {workspace:{...syntacticExampleBundle().workspace,
        root:{...syntacticExampleBundle().workspace.root,path:'C:\\temp\\trailing.'}}},
      {artifacts:[{...syntacticExampleBundle().artifacts[0],env:{PATH:'x'}},
        syntacticExampleBundle().artifacts[1]]},
    ])expect(encodeInertCore({...syntacticExampleBundle(),...patch})).toMatchObject({ok:false});
  });

  it('commits entire global seal and all four packet identities; tampering one bytes changes every seal',()=>{
    const v=buildInertCommitments(syntacticExampleBundle());
    if(!v.ok)throw Error(v.code);
    expect(v.packets).toHaveLength(4);
    expect(v.packets.map(p=>p.ordinal)).toEqual([0,1,2,3]);
    expect(v.packets.every(p=>p.sealDigest===v.sealDigest)).toBe(true);
    expect(v.packets.every(p=>p.trust==='UNVERIFIED'&&!p.launchAllowed)).toBe(true);
    expect(v.packets.map(p=>p.campaignId)).toEqual(['P0','P1','P2','P3']);
    expect(Object.isFrozen(v.packets)).toBe(true);
    const changed=syntacticExampleBundle();
    changed.artifacts[1]!.sourceDigest='b'.repeat(64);
    const v2=buildInertCommitments(changed);
    if(!v2.ok)throw Error(v2.code);
    expect(v2.coreDigest).not.toBe(v.coreDigest);
    expect(v2.sealDigest).not.toBe(v.sealDigest);
    expect(v2.packets.every(p=>p.sealDigest===v2.sealDigest)).toBe(true);
    const altered=syntacticExampleBundle();
    altered.campaigns[2]!.recipeSetDigest='f'.repeat(64);
    const v3=buildInertCommitments(altered);
    if(!v3.ok)throw Error(v3.code);
    expect(v3.sealDigest).not.toBe(v.sealDigest);
    const rootChanged=syntacticExampleBundle();
    rootChanged.trustBinding.issuerKeyId='another-issuer';
    const v4=buildInertCommitments(rootChanged);
    if(!v4.ok)throw Error(v4.code);
    expect(v4.sealDigest).not.toBe(v.sealDigest);
  });

  it('F-A1-03: core bytes and all packet digests use one detached immutable view',()=>{
    const caller=syntacticExampleBundle();
    const encoded=encodeInertCore(caller);
    const first=buildInertCommitments(caller);
    if(!encoded.ok||!first.ok)throw Error('INVALID_INERT_BYTES');
    expect(first.coreDigest).toBe(sha256Domain('SUDD-A1-Core-v1',encoded.bytes));
    const fixed=[first.sealDigest,...first.packets.map(p=>p.campaignDigest)];
    caller.task.taskId='changed-after-call';
    caller.campaigns[0]!.slots[0]!.recipeId=7;
    caller.workspace.root.sha256='f'.repeat(64);
    expect([first.sealDigest,...first.packets.map(p=>p.campaignDigest)]).toEqual(fixed);
    expect(first.packets[0]!.campaign.slots[0]!.recipeId).toBe(1);
    expect(first.packets.every(p=>p.trust==='UNVERIFIED'&&
      p.authority==='MISSING'&&p.launchAllowed===false)).toBe(true);
    expect(buildInertCommitments(new Proxy(syntacticExampleBundle(),{
      ownKeys(){throw Error('hostile caller');}
    }))).toMatchObject({ok:false});
  });

  it('rejects packet ordinal/campaign/spec/seal substitution as consistency-only, not consent',()=>{
    const bundle=syntacticExampleBundle();
    const built=buildInertCommitments(bundle);
    if(!built.ok)throw Error(built.code);
    const original=built.packets[1]!;
    expect(original.campaign.caseIds).toEqual(['09']);
    expect(Object.isFrozen(original.campaign.slots)).toBe(true);
    expect(checkInertPacketConsistency(bundle,original)).toMatchObject({
      ok:true,consistent:true,trust:'UNVERIFIED',launchAllowed:false});
    for(const packet of [
      {...original,ordinal:0},
      {...original,campaignId:'P0'},
      {...original,sealDigest:'f'.repeat(64)},
      {...original,coreDigest:'f'.repeat(64)},
      {...original,campaignDigest:'f'.repeat(64)},
      {...original,campaign:built.packets[0]!.campaign},
      {...original,campaign:{...original.campaign,recipeSetDigest:'e'.repeat(64)}},
      {...original,approved:true},
    ])expect(checkInertPacketConsistency(bundle,packet)).toMatchObject({ok:false});
  });

  it('rejects copied status requests with wrong ordinal / digest / kind and oversize bytes',()=>{
    expect(encodeInertStatusRequest({bundleId:'X',sealDigest:'a'.repeat(64),ordinal:0})).toMatchObject({ok:false});
    expect(encodeInertStatusRequest({bundleId:'11'.repeat(32),sealDigest:'a'.repeat(64),ordinal:4})).toMatchObject({ok:false});
    const v=encodeInertStatusRequest({bundleId:'11'.repeat(16),sealDigest:'22'.repeat(32),ordinal:1});
    if(!v.ok)throw Error(v.code);
    const forged=Uint8Array.from(v.bytes);
    forged[6]=4;
    expect(decodeInertStatusRequest(forged)).toMatchObject({ok:false});
    expect(decodeInertStatusRequest(new Uint8Array(4097))).toMatchObject({ok:false});
    expect(decodeInertStatusRequest(Uint8Array.from([...v.bytes,42]))).toMatchObject({ok:false});
  });
});
