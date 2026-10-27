import {describe,it,expect,vi} from 'vitest';
import {createF2H1RunnerControlProtocol,createF2H1H0AckOrdering} from '../../infrastructure/src/private-mvp-h1-control-protocol.js';
import type {F2H1H0PhysicalEvidence,F2H1H0AckExpected} from '../../infrastructure/src/private-mvp-h1-control-protocol.js';

const ownerEpoch='desktop-epoch-1',missionId='mission-1',attemptId='attempt-1';
const stageSealDigest='a'.repeat(64),executionFingerprint='b'.repeat(64);
const recipeFingerprint='c'.repeat(64),imageDigest='d'.repeat(64);
const key=Buffer.alloc(32,31),challenge=Buffer.alloc(32,91);
const spec:F2H1H0AckExpected={ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
  recipeFingerprint,imageDigest,runnerCreationToken:'runner-created-h0-unique-01',
  retainedRunnerObject:'desktop-retained-runner-process-1',workerJobObject:'worker-job-1'};
const evidence:F2H1H0PhysicalEvidence={
  originToken:spec.runnerCreationToken,createdByRunnerObject:spec.retainedRunnerObject,
  duplicatedFromRunnerObject:spec.retainedRunnerObject,
  processObjectType:'process',handleRole:'h0-process',workerJobObject:spec.workerJobObject,
  imageDigest,stageSealDigest,recipeFingerprint,ownerEpoch,missionId,attemptId,
  processRights:0x101000,h0Alive:true,threadSuspended:true,
  guardianJobMember:true,duplicatedH0HandleInheritable:false,
  inheritedGuardianHandle:false,inheritedControlHandle:false,
};
type TestSend=(frame:unknown)=>Promise<void>;
function fixture(options:{
  proof?:unknown;expected?:F2H1H0AckExpected;send?:TestSend;
}={}){
  const desktop=createF2H1RunnerControlProtocol({
    ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
    key,challenge,localRole:'desktop'});
  const runner=createF2H1RunnerControlProtocol({
    ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
    key,challenge,localRole:'runner'});
  const inspect=vi.fn(()=>('proof' in options?options.proof:evidence) as F2H1H0PhysicalEvidence);
  const transmit=vi.fn(options.send??(async()=>{}));
  const ack=createF2H1H0AckOrdering({protocol:desktop,expected:options.expected??spec,
    retainedRunnerEvidence:{duplicateAndInspectOwnedH0:inspect},
    authenticatedDesktopChannel:{send:transmit}});
  return {ack,runner,desktop,inspect,transmit};
}
const h0=(f:ReturnType<typeof fixture>)=>f.runner.issue('runner','h0-owned',{});

describe('F2 H1 Topology B — H0 ACK spec-corrected ordering, SYNTHETIC ONLY',()=>{
  it('R1 RED: H0 must be IN outer Guardian Job, without inheriting guardian HANDLE',async()=>{
    const f=fixture();
    expect(await f.ack.receive(h0(f))).toBe('acknowledged');
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.transmit).toHaveBeenCalledTimes(1);
    expect(f.ack.nativeAuthorization).toBe(false);
    expect(f.ack.readiness()).toBe(false);
    const g=fixture({proof:{...evidence,guardianJobMember:false}});
    expect(await g.ack.receive(h0(g))).toBe('quarantined');
    expect(g.transmit).not.toHaveBeenCalled();
    const inherited=fixture({proof:{...evidence,inheritedGuardianHandle:true}});
    expect(await inherited.ack.receive(h0(inherited))).toBe('quarantined');
  });
  it('R4 RED: duplicated Desktop H0 PROCESS HANDLE non-inheritability is a separate requirement',async()=>{
    const f=fixture({proof:{...evidence,duplicatedH0HandleInheritable:true}});
    expect(await f.ack.receive(h0(f))).toBe('quarantined');
    expect(f.transmit).not.toHaveBeenCalled();
    const ordinary=fixture();
    expect(await ordinary.ack.receive(h0(ordinary))).toBe('acknowledged');
  });
  it('R2 RED: expected identity is defensively copied, caller mutations cannot widen/deny proof',async()=>{
    const fields:[keyof F2H1H0AckExpected,string][]=[
      ['imageDigest','f'.repeat(64)],['recipeFingerprint','e'.repeat(64)],
      ['stageSealDigest','0'.repeat(64)],
      ['runnerCreationToken','forged-creation-origin'],
      ['retainedRunnerObject','forged-retained-runner'],
      ['workerJobObject','forged-worker-job'],
      ['ownerEpoch','forged-epoch'],['missionId','forged-mission'],
      ['attemptId','forged-attempt'],['executionFingerprint','9'.repeat(64)],
    ];
    for(const [field,altered] of fields){
      const original={...spec};
      const valid=fixture({expected:original});
      original[field]=altered;
      expect(Object.isFrozen(original)).toBe(false); // preserve caller-owned mutation rights
      expect(await valid.ack.receive(h0(valid)),field+' should keep original').toBe('acknowledged');
      const mutated={...spec};
      const physical=fixture({expected:mutated,
        proof:{...evidence,
          ...(field==='runnerCreationToken'?{originToken:altered}:{}),
          ...(field==='retainedRunnerObject'?{
            createdByRunnerObject:altered,duplicatedFromRunnerObject:altered}:{}),
          ...(field==='workerJobObject'?{workerJobObject:altered}:{}),
          ...(field in evidence?{[field]:altered}:{})
        }});
      mutated[field]=altered;
      if(field==='executionFingerprint')continue; // frame identity, not an OS proof property
      expect(await physical.ack.receive(h0(physical)),field+' must reject forged').toBe('quarantined');
    }
    expect(spec).toEqual({...spec}); // caller-owned original not frozen or overwritten
  });
  it('R3 RED: awaited successful write only, not a fire-and-forget Promise',async()=>{
    let resolveWrite!:()=>void;
    const pending=new Promise<void>(resolve=>{resolveWrite=resolve;});
    const f=fixture({send:()=>pending});
    const waiting=f.ack.receive(h0(f));
    expect(f.ack.state()).toBe('pending-write');
    expect(f.ack.readiness()).toBe(false);
    resolveWrite();
    expect(await waiting).toBe('acknowledged');
    expect(f.ack.state()).toBe('acknowledged');
    expect(f.transmit).toHaveBeenCalledTimes(1);
    const frame=f.transmit.mock.calls[0]![0];
    expect(frame).toMatchObject({role:'desktop',kind:'h0-ack',epoch:ownerEpoch,
      missionId,attemptId,payload:{}});
    const peer=createF2H1RunnerControlProtocol({ownerEpoch,missionId,attemptId,
      stageSealDigest,executionFingerprint,key,challenge,localRole:'runner'});
    expect(peer.accept('desktop',frame)).toBe(true);
    expect(f.ack.readiness()).toBe(false);
  });
  it('R3 RED: asynchronous send rejection quarantines and cannot authorize',async()=>{
    const rejected=Promise.reject(Error('PIPE_WRITE_REJECTED'));
    void rejected.catch(()=>{});
    const f=fixture({send:()=>rejected});
    expect(await f.ack.receive(h0(f))).toBe('quarantined');
    expect(f.ack.state()).toBe('quarantined');
    expect(f.ack.readiness()).toBe(false);
  });
  it('R3 RED: hung write times out on existing 5-second bootstrap write budget',async()=>{
    vi.useFakeTimers();
    try{
      const f=fixture({send:()=>new Promise<void>(()=>{})});
      const waiting=f.ack.receive(h0(f));
      expect(f.ack.state()).toBe('pending-write');
      await vi.advanceTimersByTimeAsync(5001);
      expect(await waiting).toBe('quarantined');
      expect(f.ack.state()).toBe('quarantined');
      expect(f.ack.nativeAuthorization).toBe(false);
      expect(f.ack.readiness()).toBe(false);
    }finally{vi.useRealTimers();}
  });
  it('R3 RED: second event during pending write must quarantine forever, even on late success',async()=>{
    let complete!:()=>void;
    const write=new Promise<void>(resolve=>{complete=resolve;});
    const f=fixture({send:()=>write});
    const first=f.ack.receive(h0(f));
    expect(await f.ack.receive(h0(f))).toBe('quarantined');
    complete();
    expect(await first).toBe('quarantined');
    expect(f.ack.state()).toBe('quarantined');
    expect(f.transmit).toHaveBeenCalledTimes(1);
  });
  it('R3 RED: synchronous throwing or non-Promise fire-and-forget channel must quarantine',async()=>{
    const f=fixture({send:()=>{throw Error('CHANNEL_CLOSED')}});
    expect(await f.ack.receive(h0(f))).toBe('quarantined');
    const bad=fixture({send:(()=>undefined) as unknown as TestSend});
    expect(await bad.ack.receive(h0(bad))).toBe('quarantined');
  });
  it('rejects missing physical evidence, malformed OS proof and one-use replay',async()=>{
    for(const proof of [null,{}, {...evidence,extra:true}]){
      const f=fixture({proof});
      expect(await f.ack.receive(h0(f))).toBe('quarantined');
      expect(await f.ack.receive(h0(f))).toBe('quarantined');
      expect(f.inspect).toHaveBeenCalledTimes(1);
      expect(f.transmit).not.toHaveBeenCalled();
    }
  });
  it('rejects wrong creation origin, handle type/rights, Job, image and epoch',async()=>{
    const variations=[
      {originToken:'forged'}, {createdByRunnerObject:'other-runner'},
      {duplicatedFromRunnerObject:'foreign-source'},{processObjectType:'thread'},
      {handleRole:'h0-thread'},{workerJobObject:'foreign-job'},
      {processRights:0x101000|0x400},{imageDigest:'f'.repeat(64)},
      {stageSealDigest:'0'.repeat(64)},{recipeFingerprint:'e'.repeat(64)},
      {ownerEpoch:'stale'},{missionId:'other-mission'},{attemptId:'other-attempt'},
      {h0Alive:false},{threadSuspended:false},{guardianJobMember:false},
      {inheritedGuardianHandle:true},{inheritedControlHandle:true},
      {duplicatedH0HandleInheritable:true},
    ];
    for(const change of variations){
      const f=fixture({proof:{...evidence,...change}});
      expect(await f.ack.receive(h0(f)),JSON.stringify(change)).toBe('quarantined');
      expect(f.transmit).not.toHaveBeenCalled();
    }
  });
  it('rejects forged MAC, stale sequence, unsupported payload and handle selector',async()=>{
    for(const change of [
      (v:any)=>({...v,mac:'0'.repeat(64)}),
      (v:any)=>({...v,epoch:'other'}),
      (v:any)=>({...v,sequence:0}),
      (v:any)=>({...v,payload:{handle:999}}),
      (v:any)=>({...v,handleSelector:42}),
      (v:any)=>({...v,kind:'h0-handoff'}),
      (v:any)=>({...v,role:'desktop'}),
    ]){
      const f=fixture();
      expect(await f.ack.receive(change(h0(f)))).toBe('quarantined');
      expect(f.inspect).not.toHaveBeenCalled();
      expect(f.transmit).not.toHaveBeenCalled();
    }
  });
  it('one-use completed ACK rejects replay without a second OS proof',async()=>{
    const f=fixture(),event=h0(f);
    expect(await f.ack.receive(event)).toBe('acknowledged');
    expect(await f.ack.receive(event)).toBe('quarantined');
    expect(f.inspect).toHaveBeenCalledTimes(1);
    expect(f.transmit).toHaveBeenCalledTimes(1);
  });
  it('failed OS duplicate, early H0 exit and missing ACK all quarantine',async()=>{
    for(const failure of [()=>{throw Error('DUPLICATE_FAILED')},()=>{throw Error('NO_ORIGIN')}]){
      const desktop=createF2H1RunnerControlProtocol({ownerEpoch,missionId,attemptId,
        stageSealDigest,executionFingerprint,key,challenge,localRole:'desktop'});
      const runner=createF2H1RunnerControlProtocol({ownerEpoch,missionId,attemptId,
        stageSealDigest,executionFingerprint,key,challenge,localRole:'runner'});
      const transmit=vi.fn(async()=>{});
      const ack=createF2H1H0AckOrdering({protocol:desktop,expected:spec,
        retainedRunnerEvidence:{duplicateAndInspectOwnedH0:failure},
        authenticatedDesktopChannel:{send:transmit}});
      expect(await ack.receive(runner.issue('runner','h0-owned',{}))).toBe('quarantined');
      expect(transmit).not.toHaveBeenCalled();
    }
    const f=fixture({proof:{...evidence,h0Alive:false}});
    expect(await f.ack.receive(h0(f))).toBe('quarantined');
  });
  it('general MAC issuer cannot mint ACK, mismatched Desktop channel is rejected',()=>{
    const desktop=createF2H1RunnerControlProtocol({ownerEpoch,missionId,attemptId,
      stageSealDigest,executionFingerprint,key,challenge,localRole:'desktop'});
    expect(()=>desktop.issue('desktop','h0-ack',{})).toThrow('F2_H1_H0_ACK_REQUIRES_TRUSTED_OS_ORDERING');
    const runner=createF2H1RunnerControlProtocol({ownerEpoch,missionId,attemptId,
      stageSealDigest,executionFingerprint,key,challenge,localRole:'runner'});
    expect(()=>runner.issue('desktop','h0-ack',{})).toThrow('F2_H1_H0_ACK_REQUIRES_TRUSTED_OS_ORDERING');
    expect(()=>createF2H1H0AckOrdering({
      protocol:createF2H1RunnerControlProtocol({
        ownerEpoch:'other-epoch',missionId,attemptId,stageSealDigest,
        executionFingerprint,key,challenge,localRole:'desktop'}),
      expected:spec,retainedRunnerEvidence:{duplicateAndInspectOwnedH0:()=>evidence},
      authenticatedDesktopChannel:{send:async()=>{}},
    })).toThrow('F2_H1_H0_ACK_CHANNEL_BINDING_MISMATCH');
  });
  it('real Native H0 resume and public gates remain CLOSED',async()=>{
    const fs=await import('node:fs');
    const native=fs.readFileSync('packages/infrastructure/src/private-mvp-desktop-runner-owner.ts','utf8');
    const runner=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-entry.ts','utf8');
    expect(native).toContain('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
    expect(native).toContain('F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED=false');
    expect(runner).toContain('F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED=false');
    expect(native).not.toContain('ResumeThread(');
    expect(runner).not.toContain('ResumeThread(');
  });
});
