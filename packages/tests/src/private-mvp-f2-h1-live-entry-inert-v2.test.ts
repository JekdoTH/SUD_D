import {describe,it,expect,vi} from 'vitest';
import {createF2H1DesktopInertV2Control} from '../../infrastructure/src/private-mvp-desktop-owned-session.js';
import {createF2H1RunnerInertV2Control,runFixedF2H1RunnerControl,F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED} from '../../infrastructure/src/private-mvp-runner-control-entry.js';
import type {F2H1ControlV2Frame,F2H1H0AckExpected,F2H1H0PhysicalEvidence}
  from '../../infrastructure/src/private-mvp-h1-control-protocol.js';

const ids={ownerEpoch:'epoch-1',missionId:'mission-1',attemptId:'attempt-1',
  stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64)};
const key=Buffer.alloc(32,41),challenge=Buffer.alloc(32,71);
const prepare={missionRevision:1,workspaceGeneration:'generation-1',stageIdentity:'stage-1',
  recipeFingerprint:'c'.repeat(64),profileSid:'S-1-15-2-1234',deadlineMs:9000,
  creationToken:'creation-1',h0Identity:'h0-1'};
const held={...ids,runnerCreationToken:prepare.creationToken,h0Identity:prepare.h0Identity,
  sourceProcessCoordinate:'123456789',state:'h0-control-suspended' as const};
const expected:F2H1H0AckExpected={...ids,recipeFingerprint:prepare.recipeFingerprint,
  imageDigest:'d'.repeat(64),runnerCreationToken:prepare.creationToken,
  retainedRunnerObject:'runner-object-1',workerJobObject:'worker-job-1'};
const proof:F2H1H0PhysicalEvidence={originToken:prepare.creationToken,
  createdByRunnerObject:expected.retainedRunnerObject,
  duplicatedFromRunnerObject:expected.retainedRunnerObject,processObjectType:'process',
  handleRole:'h0-process',workerJobObject:expected.workerJobObject,
  imageDigest:expected.imageDigest,stageSealDigest:ids.stageSealDigest,
  recipeFingerprint:prepare.recipeFingerprint,ownerEpoch:ids.ownerEpoch,
  missionId:ids.missionId,attemptId:ids.attemptId,processRights:0x101000,
  h0Alive:true,threadSuspended:true,guardianJobMember:true,
  duplicatedH0HandleInheritable:false,inheritedGuardianHandle:false,inheritedControlHandle:false};

function rig(options:{badProof?:boolean}={}){
  const events:string[]=[],d2r:Uint8Array[]=[],r2d:Uint8Array[]=[];
  const common={...ids,key,challenge,now:()=>0,ownerDeadlineMs:12000,
    missionDeadlineMs:12000,leaseDeadlineMs:10000};
  const duplicate=vi.fn((coordinate:string)=>{
    events.push('desktop-duplicate');return {sourceProcessCoordinate:coordinate,
      proof:{...proof,guardianJobMember:!options.badProof}};
  });
  const desktop=createF2H1DesktopInertV2Control({channel:common,prepare,expected,
    write:async(frame:F2H1ControlV2Frame)=>{
      events.push('desktop-write-'+frame.kind);
      d2r.push(Buffer.from(JSON.stringify(frame)));
    },duplicateAndInspectOwnedH0:duplicate});
  const runner=createF2H1RunnerInertV2Control({channel:common,
    write:async(frame:F2H1ControlV2Frame)=>{
      events.push('runner-write-'+frame.kind);
      r2d.push(Buffer.from(JSON.stringify(frame)));
    }});
  return {desktop,runner,d2r,r2d,events,duplicate};
}

describe('real Desktop/Runner source-bound PRIVATE V2 role dispatch (inert)',()=>{
  it('has separate per-owner state: authenticated prepare, held H0, data-only coordinate, local ACK write, actual Runner ACK read',async()=>{
    const f=rig();
    expect(f.desktop.state()).toBe('awaiting-prepare');
    expect(f.runner.state()).toBe('awaiting-prepare');
    await f.desktop.sendPrepare();
    expect(f.runner.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    expect(f.desktop.state()).toBe('awaiting-owned');
    expect(await f.runner.sendOwned(held)).toBe('awaiting-ack');
    expect(f.runner.state()).toBe('awaiting-ack');
    expect(await f.desktop.receiveOwned(f.r2d.shift())).toBe('acknowledged');
    expect(f.desktop.state()).toBe('acknowledged');
    // Desktop's completed local write MUST NOT be interpreted as Runner receipt.
    expect(f.runner.state()).toBe('awaiting-ack');
    expect(f.d2r).toHaveLength(1);
    expect(f.runner.receiveAck(f.d2r.shift())).toBe('ack-received-for-this-frozen-epoch');
    expect(f.runner.state()).toBe('ack-received-for-this-frozen-epoch');
    expect(f.events).toEqual(['desktop-write-prepare','runner-write-h0-owned',
      'desktop-duplicate','desktop-write-h0-ack']);
    expect(f.duplicate).toHaveBeenCalledExactlyOnceWith(held.sourceProcessCoordinate);
    expect(f.desktop.nativeAuthorization).toBe(false);
    expect(f.runner.nativeAuthorization).toBe(false);
    expect(f.runner.readiness()).toBe(false);
    expect(f.desktop.readiness()).toBe(false);
    expect('resumeH0Control' in f.runner).toBe(false);
    expect('resumeWorker' in f.runner).toBe(false);
  });

  it('fails closed without an exact Desktop duplicate port; never creates native authority',async()=>{
    const common={...ids,key,challenge,now:()=>0,ownerDeadlineMs:12000,
      missionDeadlineMs:12000,leaseDeadlineMs:10000};
    expect(()=>createF2H1DesktopInertV2Control({
      channel:common,prepare,expected,
      write:async()=>{},
    })).toThrow('F2_H1_DESKTOP_V2_EXACT_H0_DUPLICATE_UNAVAILABLE');
    expect(F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED).toBe(false);
    await expect(runFixedF2H1RunnerControl())
      .rejects.toThrow('F2_H1_RUNNER_ENTRY_EXECUTION_NOT_AUTHORIZED');
  });

  it('fences a bad physical observation after authenticated Runner-owned, with no local ACK',async()=>{
    const f=rig({badProof:true});
    await f.desktop.sendPrepare();
    expect(f.runner.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    await f.runner.sendOwned(held);
    expect(await f.desktop.receiveOwned(f.r2d.shift())).toBe('quarantined');
    expect(f.desktop.state()).toBe('quarantined');
    expect(f.events).not.toContain('desktop-write-h0-ack');
    expect(f.runner.state()).toBe('awaiting-ack');
    expect(f.runner.receiveAck(undefined)).toBe('quarantined');
    expect(f.runner.readiness()).toBe(false);
  });

  it('rejects early, duplicate, wrong-domain or skipped V2 ACK once and never resumes anything',async()=>{
    const early=rig();
    expect(early.runner.receiveAck(undefined)).toBe('quarantined');
    const f=rig();
    await f.desktop.sendPrepare();
    expect(f.runner.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    await f.runner.sendOwned(held);
    expect(await f.desktop.receiveOwned(f.r2d.shift())).toBe('acknowledged');
    const ack=f.d2r.shift()!;
    expect(f.runner.receiveAck(ack)).toBe('ack-received-for-this-frozen-epoch');
    expect(f.runner.receiveAck(ack)).toBe('quarantined'); // never double-authenticate
    expect(f.runner.state()).toBe('quarantined');

    for(const mutate of [
      (p:Record<string,unknown>)=>({...p,revision:'f2-h1-control-v1'}),
      (p:Record<string,unknown>)=>({...p,mac:'f'.repeat(64)}),
      (p:Record<string,unknown>)=>({...p,sequence:4}),
      (p:Record<string,unknown>)=>({...p,attemptId:'stale'}),
    ]){
      const attempt=rig();
      await attempt.desktop.sendPrepare();
      expect(attempt.runner.receivePrepare(attempt.d2r.shift())).toBe('awaiting-held-creation');
      await attempt.runner.sendOwned(held);
      await attempt.desktop.receiveOwned(attempt.r2d.shift());
      const bad=mutate(JSON.parse(Buffer.from(attempt.d2r.shift()!).toString()) as Record<string,unknown>);
      expect(attempt.runner.receiveAck(bad)).toBe('quarantined');
      expect(attempt.runner.readiness()).toBe(false);
    }
  });

  it('fences an unauthenticated prepare or lost writer and never advances local H0 state',async()=>{
    const missing=rig();
    expect(missing.runner.receivePrepare({kind:'prepare'})).toBe('quarantined');
    await expect(missing.runner.sendOwned(held)).rejects.toThrow();

    const f=rig();
    await f.desktop.sendPrepare();
    const packet=JSON.parse(Buffer.from(f.d2r.shift()!).toString()) as Record<string,unknown>;
    expect(f.runner.receivePrepare({...packet,role:'runner'})).toBe('quarantined');
    expect(f.runner.readiness()).toBe(false);

    const bad=rig();
    expect(await bad.runner.sendOwned(held).catch(()=> 'blocked')).toBe('blocked');
    expect(bad.runner.state()).toBe('quarantined');
  });

  it('imports real entry code without starting Native Runner, preserving all four gates',async()=>{
    const fs=await import('node:fs');
    const runnerSource=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-entry.ts','utf8');
    const desktopSource=fs.readFileSync('packages/infrastructure/src/private-mvp-desktop-owned-session.ts','utf8');
    const ownerSource=fs.readFileSync('packages/infrastructure/src/private-mvp-desktop-runner-owner.ts','utf8');
    const watcherSource=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-watchdog.ts','utf8');
    const consentSource=fs.readFileSync('packages/infrastructure/src/private-mvp-pre-h1-diagnostic-activation.ts','utf8');
    const gatewaySource=fs.readFileSync('packages/mcp-gateway/src/workspace-file-server.ts','utf8');
    expect(runnerSource).toContain('F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED=false');
    expect(runnerSource).toContain('createF2H1RunnerInertV2Control');
    expect(desktopSource).toContain('createF2H1DesktopInertV2Control');
    expect(ownerSource).toContain('F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED=false');
    expect(ownerSource).toContain('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
    expect(watcherSource).toContain('F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED=false');
    expect(consentSource).toContain('PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED=false');
    expect(gatewaySource).not.toContain("'runner.start'");
    expect(F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED).toBe(false);
  });
});
