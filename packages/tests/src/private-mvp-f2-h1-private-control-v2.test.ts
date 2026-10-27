import {describe,it,expect,vi} from 'vitest';
import {createF2H1PrivateControlV2,createF2H1V2LineFramer,createF2H1V2DesktopH0AckOrdering,
  createF2H1V2RunnerH0AckReceipt,createF2H1RunnerControlProtocol}
  from '../../infrastructure/src/private-mvp-h1-control-protocol.js';
import type {F2H1H0PhysicalEvidence,F2H1H0AckExpected,F2H1ControlV2Frame}
  from '../../infrastructure/src/private-mvp-h1-control-protocol.js';

const ids={ownerEpoch:'epoch-1',missionId:'mission-1',attemptId:'attempt-1',
  stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64)};
const key=Buffer.alloc(32,41),challenge=Buffer.alloc(32,71);
const recipeFingerprint='c'.repeat(64),imageDigest='d'.repeat(64);
const prepare={missionRevision:1,workspaceGeneration:'generation-1',
  stageIdentity:'sealed-stage-1',recipeFingerprint,profileSid:'S-1-15-2-1234',
  deadlineMs:9000,creationToken:'create-1',h0Identity:'h0-1'};
const held={...ids,runnerCreationToken:prepare.creationToken,h0Identity:prepare.h0Identity,
  sourceProcessCoordinate:'123456789',state:'h0-control-suspended' as const};
const expected:F2H1H0AckExpected={...ids,recipeFingerprint,imageDigest,
  runnerCreationToken:prepare.creationToken,retainedRunnerObject:'runner-object-1',
  workerJobObject:'worker-job-1'};
const os:F2H1H0PhysicalEvidence={originToken:prepare.creationToken,
  createdByRunnerObject:expected.retainedRunnerObject,
  duplicatedFromRunnerObject:expected.retainedRunnerObject,
  processObjectType:'process',handleRole:'h0-process',workerJobObject:expected.workerJobObject,
  imageDigest,stageSealDigest:ids.stageSealDigest,recipeFingerprint,
  ownerEpoch:ids.ownerEpoch,missionId:ids.missionId,attemptId:ids.attemptId,
  processRights:0x101000,h0Alive:true,threadSuspended:true,guardianJobMember:true,
  duplicatedH0HandleInheritable:false,inheritedGuardianHandle:false,
  inheritedControlHandle:false};
function rig(options:{proof?:F2H1H0PhysicalEvidence;sendDesktop?:(frame:F2H1ControlV2Frame)=>Promise<void>;
  now?:()=>number;expectedCoordinate?:string}={}){
  const d2r:Uint8Array[]=[],r2d:Uint8Array[]=[];
  const now=options.now??(()=>0);
  const base={...ids,key,challenge,now,ownerDeadlineMs:12000,missionDeadlineMs:12000,
    leaseDeadlineMs:10000};
  const desktop=createF2H1PrivateControlV2({...base,localRole:'desktop',
    send:options.sendDesktop??(async frame=>{d2r.push(Buffer.from(JSON.stringify(frame)));})});
  const runner=createF2H1PrivateControlV2({...base,localRole:'runner',
    send:async frame=>{r2d.push(Buffer.from(JSON.stringify(frame)));}});
  const receipt=createF2H1V2RunnerH0AckReceipt({protocol:runner});
  const inspect=vi.fn((_coordinate:string)=>({
    sourceProcessCoordinate:options.expectedCoordinate??held.sourceProcessCoordinate,
    proof:options.proof??os,
  }));
  const sender=createF2H1V2DesktopH0AckOrdering({protocol:desktop,expected,
    prepare,retainedRunnerEvidence:{duplicateAndInspectOwnedH0:inspect}});
  return {desktop,runner,receipt,sender,inspect,d2r,r2d};
}
async function owned(f:ReturnType<typeof rig>){
  await f.desktop.send('prepare',prepare);
  expect(f.receipt.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
  expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
  await f.receipt.sendOwned();
  return f.r2d.shift();
}

describe('F2-H1 V2 two-owner fake-pipe, CODE ONLY',()=>{
  it('accepts exact F2-A canonical UTC ISO workspace generation in the signed V2 prepare',async()=>{
    const generation=new Date('2026-10-11T09:06:07.123Z').toISOString();
    const f=rig();
    await f.desktop.send('prepare',{...prepare,workspaceGeneration:generation});
    const raw=f.d2r.shift()!;
    const wire=JSON.parse(Buffer.from(raw).toString('utf8')) as F2H1ControlV2Frame;
    expect(wire.payload).toMatchObject({workspaceGeneration:generation});
    expect(wire.kind).toBe('prepare');
    expect(wire.sequence).toBe(1);
    expect(wire.mac).toMatch(/^[a-f0-9]{64}$/);
    expect(f.receipt.receivePrepare(raw)).toBe('awaiting-held-creation');
    expect(f.receipt.state()).toBe('awaiting-held-creation');
    expect(f.desktop.state()).toBe('reserved');
  });

  it('keeps original legacy identifier behavior and exact extended-year canonical ISO without rewriting',async()=>{
    for(const generation of [
      'generation-1','legacy_workspace-2',
      new Date(Date.UTC(10000,0,1)).toISOString(),
    ]){
      const f=rig();
      await f.desktop.send('prepare',{...prepare,workspaceGeneration:generation});
      const bytes=f.d2r.shift()!;
      const frame=JSON.parse(Buffer.from(bytes).toString('utf8')) as F2H1ControlV2Frame;
      expect(frame.payload).toMatchObject({workspaceGeneration:generation});
      expect(frame.sequence).toBe(1);
      expect(f.receipt.receivePrepare(bytes)).toBe('awaiting-held-creation');
    }
  });

  it('fences invalid/noncanonical ISO and unsafe generation types before V2 prepare is written',async()=>{
    const invalid:unknown[]=[
      '2026-10-11T09:06:07Z',                    // missing milliseconds
      '2026-10-11T09:06:07.123+00:00',         // offset, even when UTC-equivalent
      '2026-10-11T16:06:07.123+07:00',
      '2026-10-11T09:06:07.123z',              // lowercase timezone
      '2026-10-11T09:06:07.123Z ',             // trailing whitespace
      '\t2026-10-11T09:06:07.123Z',           // leading whitespace
      '2026-10-11T09:06:07.12Z',              // wrong precision
      '2026-02-30T00:00:00.000Z',              // invalid calendar day
      '2026-13-11T09:06:07.123Z',              // invalid month
      '2026-10-11T25:06:07.123Z',              // invalid hour
      '2026-10-11T09:06:07.123Z\n',           // embedded line separator
      '2026-10-11T09:06:07.123Z💥',            // extra Unicode
      '2026-10-11T09:06:07.123Z'.repeat(300), // maliciously overlong
      'a'.repeat(64),                          // beyond old V2 legacy identifier cap
      '2026-10-11T09:06:07.123',               // missing Z
      undefined,null,123,{},['generation-1'],new Date('2026-10-11T09:06:07.123Z'),
    ];
    for(const generation of invalid){
      const f=rig();
      await expect(f.desktop.send('prepare',{
        ...prepare,workspaceGeneration:generation as string,
      })).rejects.toThrow();
      expect(f.desktop.state()).toBe('quarantined');
      expect(f.d2r).toHaveLength(0);
      expect(f.receipt.state()).toBe('awaiting-prepare');
    }
  });

  it('rejects a signed canonical generation edited in-flight or replayed in a second receive',async()=>{
    const first='2026-10-11T09:06:07.123Z';
    const second='2026-10-11T09:06:07.124Z';
    const f=rig();
    await f.desktop.send('prepare',{...prepare,workspaceGeneration:first});
    const original=f.d2r.shift()!;
    const frame=JSON.parse(Buffer.from(original).toString('utf8')) as Record<string,unknown>;
    const modified={...frame,payload:{...(frame.payload as Record<string,unknown>),
      workspaceGeneration:second}};
    expect(f.receipt.receivePrepare(modified)).toBe('quarantined');
    expect(f.receipt.state()).toBe('quarantined');
    const replay=rig();
    await replay.desktop.send('prepare',{...prepare,workspaceGeneration:first});
    const bytes=replay.d2r.shift()!;
    expect(replay.receipt.receivePrepare(bytes)).toBe('awaiting-held-creation');
    expect(replay.receipt.receivePrepare(bytes)).toBe('quarantined');
    expect(replay.receipt.state()).toBe('quarantined');
  });

  it('requires Runner to READ the authenticated V2 ACK, never treats Desktop write as receipt',async()=>{
    const f=rig();
    const frame=await owned(f);
    expect(await f.sender.receiveOwned(frame)).toBe('acknowledged');
    expect(f.receipt.state()).toBe('awaiting-ack');
    expect(f.receipt.readiness()).toBe(false);
    expect(f.d2r.length).toBe(1);
    expect(f.receipt.receiveAck(f.d2r.shift())).toBe('ack-received-for-this-frozen-epoch');
    expect(f.receipt.nativeAuthorization).toBe(false);
    expect(f.sender.nativeAuthorization).toBe(false);
    expect(f.receipt.readiness()).toBe(false);
    expect(f.sender.readiness()).toBe(false);
  });

  it('rejects V1 downgrade, cross-domain replay, unknown revision and forged authenticated fields',async()=>{
    const v1=createF2H1RunnerControlProtocol({...ids,key,challenge,localRole:'runner'});
    const f=rig();
    expect(f.desktop.accept('runner',v1.issue('runner','heartbeat',{}))).toBeNull();
    expect(f.desktop.state()).toBe('quarantined');
    for(const mutate of [
      (v:Record<string,unknown>)=>({...v,revision:'f2-h1-control-v1'}),
      (v:Record<string,unknown>)=>({...v,revision:'f2-h1-control-v3'}),
      (v:Record<string,unknown>)=>({...v,mac:'0'.repeat(64)}),
      (v:Record<string,unknown>)=>({...v,missionId:'foreign'}),
      (v:Record<string,unknown>)=>({...v,epoch:'stale'}),
      (v:Record<string,unknown>)=>({...v,attemptId:'other'}),
      (v:Record<string,unknown>)=>({...v,payload:{pid:123}}),
      (v:Record<string,unknown>)=>({...v,argv:['powershell']}),
      (v:Record<string,unknown>)=>({...v,extra:'x'.repeat(4096)}),
    ]){
      const p=rig();
      await p.runner.send('ready',{});
      const wire=JSON.parse(Buffer.from(p.r2d.shift()!).toString()) as Record<string,unknown>;
      expect(p.desktop.accept('runner',mutate(wire))).toBeNull();
      expect(p.desktop.state()).toBe('quarantined');
    }
    const v2=rig();
    await v2.desktop.send('prepare',prepare);
    expect(v1.accept('desktop',v2.d2r.shift())).toBe(false);
  });
  it('rejects exact sequence skip, duplicate and double authentication on same frame',async()=>{
    const f=rig();
    await f.runner.send('ready',{});
    await f.runner.send('heartbeat',{});
    expect(f.desktop.accept('runner',f.r2d[1])).toBeNull(); // missing ready seq 1
    const g=rig();
    await g.runner.send('ready',{});
    expect(g.desktop.accept('runner',g.r2d[0])).toMatchObject({kind:'ready',sequence:1});
    expect(g.desktop.accept('runner',g.r2d[0])).toBeNull();
    expect(g.desktop.state()).toBe('quarantined');
  });
  it('rejects a forged or noncanonical source coordinate, unknown held identity and mismatched OS duplicate',async()=>{
    for(const src of ['0','-1','00012','9223372036854775808','18446744073709551614','18446744073709551615','18446744073709551616']){
      const f=rig();
      await f.desktop.send('prepare',prepare);
      expect(f.receipt.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
      expect(f.receipt.pinHeldCreation({...held,sourceProcessCoordinate:src})).toBe('quarantined');
      expect(f.receipt.nativeAuthorization).toBe(false);
    }
    for(const change of [
      {runnerCreationToken:'other-creation'}, {h0Identity:'other-h0'},
      {stageSealDigest:'0'.repeat(64)},{attemptId:'other'},
      {state:'running'}, {handle:999}, {osVerified:true},
    ]){
      const f=rig();
      await f.desktop.send('prepare',prepare);
      expect(f.receipt.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
      expect(f.receipt.pinHeldCreation({...held,...change})).toBe('quarantined');
    }
    const mismatch=rig({expectedCoordinate:'987'});
    expect(await mismatch.sender.receiveOwned(await owned(mismatch))).toBe('quarantined');
    expect(mismatch.inspect).toHaveBeenCalledWith(held.sourceProcessCoordinate);
    for(const change of [
      {processObjectType:'thread'},{processRights:0x101400},
      {duplicatedH0HandleInheritable:true},{guardianJobMember:false},
      {inheritedGuardianHandle:true},{threadSuspended:false},
      {h0Alive:false},{imageDigest:'f'.repeat(64)},
      {stageSealDigest:'e'.repeat(64)},{recipeFingerprint:'0'.repeat(64)},
      {createdByRunnerObject:'wrong-runner'},
    ]){
      const f=rig({proof:{...os,...change} as F2H1H0PhysicalEvidence});
      expect(await f.sender.receiveOwned(await owned(f))).toBe('quarantined');
      expect(f.d2r.length).toBe(0); // no ACK ever sent
    }
  });
  it('refuses early ACK, invalid prepare fields, and Desktop heartbeat stealing the reserved ACK slot',async()=>{
    const f=rig();
    await expect(f.desktop.send('h0-ack',{creationToken:'create-1',h0Identity:'h0-1'}))
      .rejects.toThrow();
    expect(f.desktop.state()).toBe('quarantined');
    for(const bad of [
      {...prepare,argv:['evil']},{...prepare,profileSid:'C:\\evil'},
      {...prepare,deadlineMs:0},{...prepare,missionRevision:-1},
      {...prepare,sourceProcessCoordinate:'99'},
    ]){
      const p=rig();
      await expect(p.desktop.send('prepare',bad as typeof prepare)).rejects.toThrow();
      expect(p.desktop.state()).toBe('quarantined');
    }
    const g=rig();
    await g.desktop.send('prepare',prepare);
    await expect(g.desktop.send('heartbeat',{})).rejects.toThrow(); // strict reservation
    expect(g.desktop.state()).toBe('quarantined');
  });
  it('does not overtake an in-flight Desktop heartbeat with prepare or reserve a false ACK slot',async()=>{
    let complete!:()=>void;
    const write=new Promise<void>(resolve=>{complete=resolve;});
    const f=rig({sendDesktop:async()=>write});
    const beat=f.desktop.send('heartbeat',{});
    const observed=expect(beat).rejects.toThrow();
    await expect(f.desktop.send('prepare',prepare)).rejects.toThrow();
    complete(); // late local heartbeat completion cannot clear the failed transaction
    await observed;
    expect(f.desktop.state()).toBe('quarantined');
    expect(f.receipt.state()).toBe('awaiting-prepare');
    expect(f.d2r.length).toBe(0);
  });
  it('allows independent incoming Runner heartbeat while Desktop ACK is reserved',async()=>{
    const f=rig();
    await f.desktop.send('prepare',prepare);
    expect(f.receipt.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    await f.runner.send('heartbeat',{});
    expect(f.desktop.accept('runner',f.r2d.shift())).toMatchObject({kind:'heartbeat',sequence:1});
    expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    await f.receipt.sendOwned();
    expect(await f.sender.receiveOwned(f.r2d.shift())).toBe('acknowledged');
    expect(f.receipt.receiveAck(f.d2r.shift())).toBe('ack-received-for-this-frozen-epoch');
  });
  it('rejects missing/early/duplicate ACK and permanently fences on cancellation/EOF/lease/H0 exit',async()=>{
    const early=rig();
    await early.desktop.send('prepare',prepare);
    expect(early.receipt.receivePrepare(early.d2r.shift())).toBe('awaiting-held-creation');
    expect(early.receipt.receiveAck(null)).toBe('quarantined');
    const duplicate=rig();
    expect(await duplicate.sender.receiveOwned(await owned(duplicate))).toBe('acknowledged');
    const frame=duplicate.d2r.shift();
    expect(duplicate.receipt.receiveAck(frame)).toBe('ack-received-for-this-frozen-epoch');
    expect(duplicate.receipt.receiveAck(frame)).toBe('quarantined');
    for(const reason of ['cancelled','eof','lease-expired','owner-lost','io-cancelled','h0-exited'] as const){
      const f=rig();
      const incoming=await owned(f);
      expect(f.receipt.fence(reason)).toBe('quarantined');
      expect(await f.sender.receiveOwned(incoming)).toBe('acknowledged'); // other peer may already write
      expect(f.receipt.receiveAck(f.d2r.shift())).toBe('quarantined');
      expect(f.receipt.readiness()).toBe(false);
    }
  });
  it('quarantines pending, rejected and late writes; enforces absolute 5s timeout without fake receipt',async()=>{
    vi.useFakeTimers();
    try {
      const f=rig({sendDesktop:async()=>new Promise<void>(()=>{})});
      const pending=f.desktop.send('prepare',prepare);
      const failed=expect(pending).rejects.toThrow();
      await vi.advanceTimersByTimeAsync(5001);
      await failed;
      expect(f.desktop.state()).toBe('quarantined');
      let resolveAck!:()=>void;
      const ackWrite=new Promise<void>(r=>{resolveAck=r;});
      const p=rig({sendDesktop:async frame=>{
        if(frame.kind==='h0-ack')return ackWrite;
        p.d2r.push(Buffer.from(JSON.stringify(frame)));
      }});
      const arriving=await owned(p);
      const waiting=p.sender.receiveOwned(arriving);
      expect(p.sender.state()).toBe('pending-write');
      expect(p.receipt.state()).toBe('awaiting-ack');
      p.sender.fence();
      resolveAck();
      expect(await waiting).toBe('quarantined');
      expect(p.d2r.length).toBe(0);
      const rejected=rig({sendDesktop:async()=>{throw Error('PIPE_REJECTED');}});
      await expect(rejected.desktop.send('prepare',prepare)).rejects.toThrow();
      expect(rejected.desktop.state()).toBe('quarantined');
    }finally {vi.useRealTimers();}
  });
  it('frames partial/coalesced fake-pipe bytes with strict 4096-byte/16-frame bounds',async()=>{
    const f=rig(),framer=createF2H1V2LineFramer();
    await f.runner.send('ready',{});
    await f.runner.send('heartbeat',{});
    const lines=Buffer.concat(f.r2d.map(v=>Buffer.concat([v,Buffer.from('\n')])));
    framer.push(lines.subarray(0,17));
    expect(framer.length()).toBe(0);
    framer.push(lines.subarray(17));
    expect(framer.length()).toBe(2);
    expect(f.desktop.accept('runner',framer.take())).toMatchObject({kind:'ready',sequence:1});
    expect(f.desktop.accept('runner',framer.take())).toMatchObject({kind:'heartbeat',sequence:2});
    expect(framer.length()).toBe(0);
    const overflow=createF2H1V2LineFramer();
    expect(()=>overflow.push(Buffer.alloc(4097,65))).toThrow();
    expect(overflow.state()).toBe('quarantined');
    const crowded=createF2H1V2LineFramer();
    expect(()=>crowded.push(Buffer.from('x\n'.repeat(17)))).toThrow();
    expect(crowded.state()).toBe('quarantined');
    const partial=createF2H1V2LineFramer();
    partial.push(Buffer.from('partial'));
    expect(partial.eof()).toBe('quarantined');
  });
  it('honors Mission/owner/lease/prepare deadline and preserves original V1 and Native gates',async()=>{
    let now=0;
    const f=rig({now:()=>now});
    await f.desktop.send('prepare',prepare);
    expect(f.receipt.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    now=9001; // prepare deadline, earlier than local lease deadline
    await expect(f.receipt.sendOwned()).rejects.toThrow();
    expect(f.receipt.state()).toBe('quarantined');
    const fs=await import('node:fs');
    const owner=fs.readFileSync('packages/infrastructure/src/private-mvp-desktop-runner-owner.ts','utf8');
    const entry=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-entry.ts','utf8');
    const watchdog=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-watchdog.ts','utf8');
    const consent=fs.readFileSync('packages/infrastructure/src/private-mvp-pre-h1-diagnostic-activation.ts','utf8');
    const gateway=fs.readFileSync('packages/mcp-gateway/src/workspace-file-server.ts','utf8');
    expect(owner).toContain('F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED=false');
    expect(owner).toContain('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
    expect(entry).toContain('F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED=false');
    expect(watchdog).toContain('F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED=false');
    expect(consent).toContain('PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED=false');
    expect(gateway).not.toContain("registerTool(\n    'runner.start'");
  });
});
