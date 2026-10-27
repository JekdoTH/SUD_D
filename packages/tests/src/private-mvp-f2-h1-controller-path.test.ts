import {describe,expect,it,vi} from 'vitest';
import {createConnectionShutdown} from '../../desktop/electron/connection-shutdown.js';
import {
  createF2H1DesktopRunnerOwner,
  createF2H1RunnerControlProtocol,
  parseF2H1FixedPipeBootstrap,
  checkF2H1ControllerLease,
  checkF2H1RunnerBootstrapDeadline,
  checkF2H1DesktopGuardianWatch,
  F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED,
  F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED,
  F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED,
  F2H1_RUNNER_LEASE_MS,
  F2H1_RUNNER_HEARTBEAT_MS,
  bindF2H1DesktopRunnerWin32,
  runFixedF2H1RunnerControl,
} from '@sud-d/infrastructure';
const valid={
  kind:'desktop-private-bootstrap-v1',
  ownerEpoch:'test-epoch-1',missionId:'mission-1',attemptId:'attempt-1',
  stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64),
  challenge:'c'.repeat(64),secret:'d'.repeat(64),
  inheritedDesktopProcess:'123456789',
};
const bytes=(o:unknown)=>Buffer.from(JSON.stringify(o));
const lease=(changes:Record<string,unknown>={})=>({
  now:9000,lastHeartbeat:1000,startedAt:0,deadline:30000,
  lastIoProgress:1000,desktop:'alive' as const,...changes,
});
describe('Pre-H1 fixed inherited Controller bootstrap: code-only FAIL-CLOSED tests',()=>{
  it('accepts ONLY fixed bootstrap schema, never argv/env/executable selectors',()=>{
    expect(parseF2H1FixedPipeBootstrap(bytes(valid))).toEqual(valid);
    for(const wrong of [
      {...valid,executable:'cmd.exe'},
      {...valid,secret:'0'},
      {...valid,challenge:'unknown'},
      {...valid,ownerEpoch:'./unexpected'},
      {...valid,inheritedDesktopProcess:'0'},
      {...valid,inheritedDesktopProcess:'18446744073709551616'},
      {...valid,kind:'worker-start'},
    ])expect(()=>parseF2H1FixedPipeBootstrap(bytes(wrong))).toThrow();
    expect(()=>parseF2H1FixedPipeBootstrap(Buffer.alloc(4097,0x61))).toThrow();
  });
  it('rejects forged MAC, stale/replayed epochs and unsupported control commands',()=>{
    const secret=Buffer.from(valid.secret,'hex');
    const challenge=Buffer.from(valid.challenge,'hex');
    const desktop=createF2H1RunnerControlProtocol({
      ownerEpoch:valid.ownerEpoch,missionId:valid.missionId,
      attemptId:valid.attemptId,stageSealDigest:valid.stageSealDigest,
      executionFingerprint:valid.executionFingerprint,
      key:secret,challenge,localRole:'desktop',
    });
    const runner=createF2H1RunnerControlProtocol({
      ownerEpoch:valid.ownerEpoch,missionId:valid.missionId,
      attemptId:valid.attemptId,stageSealDigest:valid.stageSealDigest,
      executionFingerprint:valid.executionFingerprint,
      key:secret,challenge,localRole:'runner',
    });
    const ready=runner.issue('runner','ready',{});
    expect(desktop.accept('runner',ready)).toBe(true);
    expect(desktop.accept('runner',ready)).toBe(false);
    expect(desktop.accept('runner',{...ready,sequence:2,mac:'0'.repeat(64)})).toBe(false);
    expect(desktop.accept('runner',{...ready,epoch:'stale-epoch',sequence:2})).toBe(false);
    expect(()=>runner.issue('runner','run-shell' as never,{})).toThrow();
    expect(runner.accept('desktop',desktop.issue('desktop','cancel',{}))).toBe(true);
  });
  it('fences Desktop exit, unknown process, stalled IO, 8-second lease and deadline',()=>{
    expect(F2H1_RUNNER_HEARTBEAT_MS).toBe(2000);
    expect(F2H1_RUNNER_LEASE_MS).toBe(8000);
    expect(checkF2H1ControllerLease(lease({now:9001})))
      .toMatchObject({reason:'lease-expired',fence:true});
    expect(checkF2H1ControllerLease(lease({now:30000})))
      .toMatchObject({reason:'deadline',fence:true});
    expect(checkF2H1ControllerLease(lease({desktop:'exited'})))
      .toMatchObject({reason:'desktop-exit',fence:true});
    expect(checkF2H1ControllerLease(lease({desktop:'unknown'})))
      .toMatchObject({reason:'desktop-unknown',fence:true});
    expect(checkF2H1ControllerLease(lease({lastHeartbeat:9000,lastIoProgress:0})))
      .toMatchObject({reason:'stalled-io',fence:true});
    expect(checkF2H1ControllerLease(lease({lastHeartbeat:9000,lastIoProgress:9000}))).toBeNull();
  });
  it('Desktop independent guardian observer fences Runner crash, unknown Guardian, heartbeat stall and deadline',()=>{
    const input={now:1000,lastRunnerBeat:900,deadline:30000,
      runner:'alive' as const,guardianValid:true};
    expect(checkF2H1DesktopGuardianWatch(input)).toBeNull();
    expect(checkF2H1DesktopGuardianWatch({...input,runner:'exited'}))
      .toMatchObject({reason:'runner-exited',fence:true});
    expect(checkF2H1DesktopGuardianWatch({...input,guardianValid:false}))
      .toMatchObject({reason:'guardian-unknown',fence:true});
    expect(checkF2H1DesktopGuardianWatch({...input,now:10000,lastRunnerBeat:1000}))
      .toMatchObject({reason:'runner-lease-expired',fence:true});
    expect(checkF2H1DesktopGuardianWatch({...input,now:30000}))
      .toMatchObject({reason:'controller-deadline',fence:true});
  });
  it('fails closed on missing OS shutdown evidence and detects pre-bootstrap IO hang',async()=>{
    expect(checkF2H1RunnerBootstrapDeadline(4999,0,false)).toBe(false);
    expect(checkF2H1RunnerBootstrapDeadline(5000,0,false)).toBe(true);
    expect(checkF2H1RunnerBootstrapDeadline(7000,0,true)).toBe(false);
    const down=vi.fn();
    const shutdown=createConnectionShutdown({
      runnerLifecycle:{shutdown:async()=>true},
      connectionService:{shutdown:down},disposeGit:async()=>{},
      closeDatabase:()=>{},
    });
    await expect(shutdown.shutdown()).rejects.toThrow('RUNNER_OS_CLEANUP_UNCONFIRMED');
    expect(down).not.toHaveBeenCalled();
  });
  it('blocks Connection/Git/SQLite teardown if Runner OS cleanup is uncertain even when shutdown returns true',async()=>{
    const closeDatabase=vi.fn();
    const disposeGit=vi.fn(async()=>{});
    const connectionService={shutdown:vi.fn(()=>({ok:true}))};
    const failed=createConnectionShutdown({
      runnerLifecycle:{
        shutdown:async()=>true,
        shutdownEvidence:()=>({disposition:'cleanup-unconfirmed' as const,osStopProven:false}),
      },connectionService,disposeGit,closeDatabase,
    });
    await expect(failed.shutdown()).rejects.toThrow('RUNNER_OS_CLEANUP_UNCONFIRMED');
    expect(connectionService.shutdown).not.toHaveBeenCalled();
    expect(disposeGit).not.toHaveBeenCalled();
    expect(closeDatabase).not.toHaveBeenCalled();
    const empty=createConnectionShutdown({
      runnerLifecycle:createF2H1DesktopRunnerOwner(),
      connectionService,disposeGit,closeDatabase,
    });
    await expect(empty.shutdown()).resolves.toBeUndefined();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    await expect(empty.shutdown()).resolves.toBeUndefined();
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
  it('separates never-started cleanup from OS-verified stop, keeps three native gates closed',async()=>{
    const owner=createF2H1DesktopRunnerOwner();
    expect(owner.shutdownEvidence()).toEqual({disposition:'not-started',osStopProven:false});
    expect(await owner.shutdown()).toBe(true);
    expect(owner.shutdownEvidence()).toEqual({disposition:'not-started',osStopProven:false});
    expect(F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED).toBe(false);
    expect(F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED).toBe(false);
    expect(F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED).toBe(false);
    await expect(runFixedF2H1RunnerControl()).rejects.toThrow('F2_H1_RUNNER_ENTRY_EXECUTION_NOT_AUTHORIZED');
    expect(()=>bindF2H1DesktopRunnerWin32()).toThrow('F2_H1_TOPOLOGY_B_NATIVE_CREATION_NOT_AUTHORIZED');
  });
});
