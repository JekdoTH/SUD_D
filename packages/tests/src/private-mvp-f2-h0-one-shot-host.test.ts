import { describe, expect, it, vi } from 'vitest';
import {
  createF2H0OneShotGateway,
  F2H0_FIXED_IDENTITY,
  type F2H0HandleReceipt,
  type F2H0GatewayPort,
} from '@sud-d/infrastructure';

const admission = () => ({
  missionId: 'mission-proof-1',
  revision: 1,
  attemptId: 'attempt-1',
  ownerEpoch: 'epoch-opaque-12345',
  workspaceId: 'workspace-proof-1',
  workspaceGeneration: 'generation-1',
  stageFingerprint: F2H0_FIXED_IDENTITY.stageFingerprint,
  recipeFingerprint: F2H0_FIXED_IDENTITY.recipeFingerprint,
});
const receipts = (): readonly F2H0HandleReceipt[] => [
  { role: 'root-process', objectId: 'proc:one', value: 101n, access: 0x101001, inheritable: false, owner: 'gateway' },
  { role: 'root-thread', objectId: 'thread:one', value: 102n, access: 0x100802, inheritable: false, owner: 'gateway' },
];
function fake() {
  const events: string[] = [];
  let stopped = true;
  let handles = receipts();
  let exited = true;
  let stage = true;
  let watchdog = true;
  let authenticated = true;
  let crashed = false;
  const port: F2H0GatewayPort = {
    available: () => true,
    authenticatedEpoch: (epoch) => authenticated && epoch === admission().ownerEpoch,
    stageHeld: () => stage,
    watchdogArmed: () => watchdog,
    gatewayJobOwned: () => true,
    launchOnce: vi.fn(async () => { events.push('launch'); if (crashed) throw Error('creator-death'); return { hostIdentity: 'owned-one-shot-host' as const }; }),
    inspectGatewayTransfers: vi.fn(async () => { events.push('inspect-transfers'); return handles; }),
    waitOwnedHostExit: vi.fn(async () => { events.push('wait-handle-exit'); return exited; }),
    confirmGatewayJob: vi.fn(async () => { events.push('job'); return true; }),
    terminateAndConfirm: vi.fn(async () => { events.push('terminate'); return stopped; }),
  };
  return {port,events,setHandles:(v: readonly F2H0HandleReceipt[])=>{handles=v;},
    setExited:(v:boolean)=>{exited=v;},setStage:(v:boolean)=>{stage=v;},
    setWatchdog:(v:boolean)=>{watchdog=v;},setStopped:(v:boolean)=>{stopped=v;},
    setAuthenticated:(v:boolean)=>{authenticated=v;},setCrashed:(v:boolean)=>{crashed=v;}};
}
describe('F2-H0 one-shot Gateway ownership protocol (fake OS handles; no launch)', () => {
  it('checks exact request, transfer, host OS exit, owned Job and peer; yields NO resume authority', async () => {
    const f = fake(); const host = createF2H0OneShotGateway(admission(), f.port);
    const result = await host.prepare(admission());
    expect(result).toMatchObject({ok:true, nativeAuthorization:false});
    expect(f.events).toEqual(['launch','inspect-transfers','wait-handle-exit','job']);
    expect(f.port.terminateAndConfirm).not.toHaveBeenCalled();
    expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'already-claimed'});
  });
  it('never launches for stale epoch, Mission/revision, changed stage/recipe, or unexpected selectors',async()=>{
    for (const bad of [
      {...admission(),ownerEpoch:'epoch-other'},
      {...admission(),missionId:'other'},
      {...admission(),revision:2},
      {...admission(),stageFingerprint:'f'.repeat(64)},
      {...admission(),recipeFingerprint:'f'.repeat(64)},
      {...admission(),executable:'C:\\Windows\\System32\\cmd.exe'},
      {...admission(),args:['--evil']},
      {...admission(),rawJobHandle:'0xaaa'},
    ]) {
      const f = fake();
      const host = createF2H0OneShotGateway(admission(), f.port);
      expect(await host.prepare(bad)).toMatchObject({ok:false,reason:'stale-or-unknown-request'});
      expect(f.port.launchOnce).not.toHaveBeenCalled();
    }
  });
  it('quarantines wrong/missing/extra/inheritable/wrong-rights/duplicate handle receipts',async()=>{
    const base=receipts();
    for(const invalid of [
      base.slice(0,1),
      [...base,{...base[1]!,role:'control' as 'root-thread',value:900n}],
      [{...base[0]!,inheritable:true},base[1]!],
      [{...base[0]!,access:0x1fffff},base[1]!],
      [base[0]!,{...base[1]!,value:base[0]!.value}],
      [base[0]!,{...base[1]!,owner:'launcher' as 'gateway'}],
      [base[1]!,base[0]!],
    ]) {
      const f=fake(); f.setHandles(invalid);
      const host=createF2H0OneShotGateway(admission(),f.port);
      expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'transfer-unconfirmed'});
      expect(f.port.terminateAndConfirm).toHaveBeenCalledOnce();
    }
  });
  it('does not trust a transfer acknowledgment without observing the host process-handle exit',async()=>{
    const f=fake();f.setExited(false);
    const host=createF2H0OneShotGateway(admission(),f.port);
    expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'host-exit-unconfirmed'});
    expect(f.events).toEqual(['launch','inspect-transfers','wait-handle-exit','terminate']);
  });
  it('quarantines cleanup failure and never retries a partial transfer',async()=>{
    const f=fake(); f.setHandles([]); f.setStopped(false);
    const host=createF2H0OneShotGateway(admission(),f.port);
    expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'cleanup-unconfirmed'});
    expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'already-claimed'});
  });
  it('rejects a lost private channel epoch before launch and cleans unexpected creator death',async()=>{
    const denied=fake(); denied.setAuthenticated(false);
    const gate=createF2H0OneShotGateway(admission(),denied.port);
    expect(await gate.prepare(admission())).toMatchObject({ok:false,reason:'peer-or-stage-unavailable'});
    expect(denied.port.launchOnce).not.toHaveBeenCalled();

    const crashed=fake();crashed.setCrashed(true);
    const once=createF2H0OneShotGateway(admission(),crashed.port);
    expect(await once.prepare(admission())).toMatchObject({ok:false,reason:'transfer-unconfirmed'});
    expect(crashed.port.terminateAndConfirm).toHaveBeenCalledOnce();
    expect(await once.prepare(admission())).toMatchObject({ok:false,reason:'already-claimed'});
  });
  it('blocks missing stage and watchdog before creation, and after transfer without success',async()=>{
    const f=fake();f.setWatchdog(false);
    const host=createF2H0OneShotGateway(admission(),f.port);
    expect(await host.prepare(admission())).toMatchObject({ok:false,reason:'peer-or-stage-unavailable'});
    expect(f.port.launchOnce).not.toHaveBeenCalled();
    const f2=fake(); const result=createF2H0OneShotGateway(admission(),f2.port);
    f2.port.inspectGatewayTransfers=vi.fn(async()=>{ f2.setStage(false); return receipts(); });
    expect(await result.prepare(admission())).toMatchObject({ok:false,reason:'peer-or-stage-unavailable'});
    expect(f2.port.terminateAndConfirm).toHaveBeenCalledOnce();
  });
});
