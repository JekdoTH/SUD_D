import { describe, expect, it, vi } from 'vitest';
import {
  createF2H0GatewayOsAdapter, withF2H0Win32HandleInspection, F2H0_PINNED_LAUNCHER,
  createF2H0OneShotGateway, F2H0_FIXED_IDENTITY,
  type F2H0GatewayOsCalls,
} from '@sud-d/infrastructure';

const req = () => ({
  missionId:'mission-proof-1', revision:1, attemptId:'attempt-1',
  workspaceId:'workspace-proof-1', workspaceGeneration:'generation-1',
  ownerEpoch:'epoch-opaque-12345',
  stageFingerprint:F2H0_FIXED_IDENTITY.stageFingerprint,
  recipeFingerprint:F2H0_FIXED_IDENTITY.recipeFingerprint,
});
function mock() {
  const order:string[]=[];
  let stale=false, failed='', destroyed=true, hostStatus=0, jobReady=true;
  const calls: F2H0GatewayOsCalls = {
    binarySha256:vi.fn(async()=>F2H0_PINNED_LAUNCHER.sha256),
    createFixedPrivatePipes:vi.fn(async()=>{order.push('pipes');return {workerIn:11n,workerOut:12n,gatewayIn:13n,gatewayOut:14n};}),
    verifyFixedControlPipeRoles:vi.fn(async()=>{order.push('inspect-pipes');return true;}),
    createSuspendedPinnedLauncher:vi.fn(async()=>{order.push('create-host-suspended'); if(failed==='create') throw Error('create'); return {process:21n,thread:22n};}),
    duplicateFixedGatewayAndJob:vi.fn(async()=>{order.push('duplicate-bootstrap'); if(failed==='duplicate') throw Error('duplicate');return {gatewayProcess:23n,temporaryJob:24n};}),
    writeEpochBoundFixedFrames:vi.fn(async()=>{order.push('write-frames');return failed!=='write';}),
    resumeOnlyLaunchHost:vi.fn(async()=>{order.push('resume-host');return failed!=='resume';}),
    readFixedTransferFrame:vi.fn(async()=>{order.push('read-transfer');return {process:31n,thread:32n};}),
    restrictAndInspectTransferredHandles:vi.fn(async()=>{order.push('inspect-transfers');return stale?[]:[
      {role:'root-process' as const,objectId:'proc:1',value:41n,access:0x101001,inheritable:false,owner:'gateway' as const},
      {role:'root-thread' as const,objectId:'thread:1',value:42n,access:0x100802,inheritable:false,owner:'gateway' as const},
    ];}),
    waitForOwnedLauncherExit:vi.fn(async()=>{order.push('wait-host');return hostStatus===0;}),
    confirmPermanentGatewayJob:vi.fn(async()=>{order.push('query-job');return jobReady;}),
    terminateExactOwnedHostAndJob:vi.fn(async()=>{order.push('kill-owned');return destroyed;}),
    closeOwnedTemporaryHandles:vi.fn(async()=>{order.push('close-control');return true;}),
  };
  return {calls,order,setStale:(v:boolean)=>{stale=v;},setFailed:(v:string)=>{failed=v;},
    setDestroyed:(v:boolean)=>{destroyed=v;},setHost:(v:number)=>{hostStatus=v;},
    setJob:(v:boolean)=>{jobReady=v;}};
}
const trusted=()=>({
  authenticatedEpoch:(epoch:string)=>epoch===req().ownerEpoch,
  stageHeld:()=>true, watchdogArmed:()=>true, gatewayJobOwned:()=>true,
});
describe('F2-H0 Gateway fixed Win32 OS adapter (injected syscall mocks only)',()=>{
  it('enforces binary identity, exact control/Job ordering, host OS exit before acknowledgement and never supplies resume authority',async()=>{
    const f=mock();
    const port=createF2H0GatewayOsAdapter(f.calls,trusted());
    const result=await createF2H0OneShotGateway(req(),port).prepare(req());
    expect(result).toMatchObject({ok:true,nativeAuthorization:false});
    expect(f.order).toEqual(['pipes','inspect-pipes','create-host-suspended','duplicate-bootstrap',
      'write-frames','resume-host','read-transfer','inspect-transfers','wait-host','query-job','close-control']);
    expect(f.calls.terminateExactOwnedHostAndJob).not.toHaveBeenCalled();
    expect(f.calls.createSuspendedPinnedLauncher).toHaveBeenCalledWith(
      F2H0_PINNED_LAUNCHER.path,expect.objectContaining({workerIn:11n,workerOut:12n,gatewayIn:13n,gatewayOut:14n}));
  });
  it('refuses substituted pinned host before any process/pipe creation',async()=>{
    const f=mock(); f.calls.binarySha256=vi.fn(async()=> 'f'.repeat(64));
    const r=await createF2H0OneShotGateway(req(),createF2H0GatewayOsAdapter(f.calls,trusted())).prepare(req());
    expect(r).toMatchObject({ok:false});
    expect(f.calls.createFixedPrivatePipes).not.toHaveBeenCalled();
  });
  it('fences partial creation and handles duplicate, frame, host-exit, job, and receipt failure',async()=>{
    for (const failure of ['create','duplicate','write','resume','receipt','host','job']) {
      const f=mock();
      if (failure==='receipt') f.setStale(true);
      else if (failure==='host') f.setHost(1);
      else if (failure==='job') f.setJob(false);
      else f.setFailed(failure);
      const port=createF2H0GatewayOsAdapter(f.calls,trusted());
      const result=await createF2H0OneShotGateway(req(),port).prepare(req());
      expect(result.ok).toBe(false);
      expect(f.calls.terminateExactOwnedHostAndJob).toHaveBeenCalledOnce();
    }
  });
  it('quarantines uncertain OS cleanup and refuses new admission',async()=>{
    const f=mock();f.setFailed('duplicate');f.setDestroyed(false);
    const oneShot=createF2H0OneShotGateway(req(),createF2H0GatewayOsAdapter(f.calls,trusted()));
    expect(await oneShot.prepare(req())).toMatchObject({ok:false,reason:'cleanup-unconfirmed'});
    expect(await oneShot.prepare(req())).toMatchObject({ok:false,reason:'already-claimed'});
  });
  it('composes kernel-restricted OS duplicates instead of trusting raw launcher receipt fields',async()=>{
    const f=mock();
    const {restrictAndInspectTransferredHandles:unused,...fixedCalls}=f.calls;
    const sys={
      restrictedLocalDuplicate:vi.fn((h:bigint,mask:number)=>{
        expect(mask).toBe(h===31n?0x101001:0x100802);
        return h===31n?131n:132n;
      }),
      closeLocal:vi.fn(()=>true),
      inherited:vi.fn(()=>false),
      processId:vi.fn(()=>83),
      threadProcessId:vi.fn(()=>83),
      threadId:vi.fn(()=>71),
      processInOwnedJob:vi.fn(()=>true),
    };
    const inspected=withF2H0Win32HandleInspection(fixedCalls,sys);
    const result=await createF2H0OneShotGateway(req(),
      createF2H0GatewayOsAdapter(inspected,trusted())).prepare(req());
    expect(result).toMatchObject({ok:true,nativeAuthorization:false});
    expect(f.order).not.toContain('inspect-transfers');
    expect(sys.restrictedLocalDuplicate).toHaveBeenCalledTimes(2);
  });
  it('uses exact authenticated epoch and refuses absent stage/watchdog before creation',async()=>{
    const f=mock();const blocked={...trusted(),watchdogArmed:()=>false};
    const r=await createF2H0OneShotGateway(req(),createF2H0GatewayOsAdapter(f.calls,blocked)).prepare(req());
    expect(r).toMatchObject({ok:false,reason:'peer-or-stage-unavailable'});
    expect(f.calls.createFixedPrivatePipes).not.toHaveBeenCalled();
  });
});
