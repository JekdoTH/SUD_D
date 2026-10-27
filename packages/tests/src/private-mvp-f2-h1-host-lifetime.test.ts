import {describe,expect,it,vi} from 'vitest';
import {createPrivateMvpOwnedPeerWatch,PRIVATE_MVP_RESOURCE_POLICY} from '@sud-d/infrastructure';

function rig() {
  let m=1000,host:'alive'|'exited'|'unknown'='alive',peer:'alive'|'exited'|'unknown'='alive';
  let transferred=false,authenticated=true,okAudit=true,okStop=true;
  let interval=0;
  const events:string[]=[];
  const terminated=vi.fn(async()=>okStop);
  const stopHost=vi.fn(async()=>okStop);
  const releaseStage=vi.fn(async()=>okStop);
  const cleanupProfile=vi.fn(async()=>okStop);
  const epoch='epoch-host-01';
  const watch=createPrivateMvpOwnedPeerWatch({
    role:'gateway',ownerEpoch:epoch,
    clock:{
      monotonicMs:()=>m,wallMs:()=>Date.UTC(2026,9,8,0,0,0)+m,
      every:(period:number)=>{interval=period;return ()=>{}},
    },
    ownedJob:{kind:'owned-worker-job',ownerEpoch:epoch,alive:()=> 'alive',terminateAndConfirm:terminated},
    peer:{kind:'owned-desktop-process',ownerEpoch:epoch,alive:()=>peer},
    host:{kind:'owned-one-shot-host-process',ownerEpoch:epoch,alive:()=>host},
    exactHostHandoffConfirmed:()=>transferred,
    authenticateHeartbeat:()=>authenticated,
    stopOwnedHostAndConfirm:stopHost,
    releaseHeldStageAfterStop:releaseStage,
    cleanupOwnedProfileAfterStop:cleanupProfile,
    writeAudit:reason=>{events.push(reason);return okAudit;},
  });
  return{watch,events,terminated,stopHost,releaseStage,cleanupProfile,arm:()=>watch.arm(Date.UTC(2026,9,8,0,5,0)+1000),
    step:(ms:number)=>{m+=ms},setHost:(v:typeof host)=>{host=v},
    setPeer:(v:typeof peer)=>{peer=v},handoff:()=>{transferred=true},
    auth:(v:boolean)=>{authenticated=v},audit:(v:boolean)=>{okAudit=v},
    stop:(v:boolean)=>{okStop=v},interval:()=>interval};
}
describe('F2-H1 exact launch-host lifetime extension (fake OS handles only)',()=>{
  it('2-second heartbeat, 8-second lease and owned pending host',async()=>{
    const f=rig();expect(f.arm()).toBe(true);
    expect(f.interval()).toBe(PRIVATE_MVP_RESOURCE_POLICY.heartbeatMs);
    expect(PRIVATE_MVP_RESOURCE_POLICY.heartbeatMs).toBe(2000);
    expect(PRIVATE_MVP_RESOURCE_POLICY.leaseMs).toBe(8000);
    f.step(8001);await f.watch.check();
    expect(f.watch.state()).toBe('stopped');
    expect(f.terminated).toHaveBeenCalledOnce();
    expect(f.events).toContain('peer-lease-expired');
  });
  it('unexpected host exit BEFORE confirmed transfer terminates Job and fences',async()=>{
    const f=rig();expect(f.arm()).toBe(true);
    f.setHost('exited');await f.watch.check();
    expect(f.events).toContain('launch-host-unexpected-exit-or-unknown');
    expect(f.terminated).toHaveBeenCalledOnce();
  });
  it('after locally certified transfer an expected exact host exit is permitted',async()=>{
    const f=rig();expect(f.arm()).toBe(true);
    f.handoff();f.setHost('exited');await f.watch.check();
    expect(f.watch.state()).toBe('armed');
    expect(f.terminated).not.toHaveBeenCalled();
  });
  it('unknown host handle and independent Desktop death terminate Job',async()=>{
    for(const kind of ['unknown-host','desktop-dead']){
      const f=rig();expect(f.arm()).toBe(true);
      if(kind==='unknown-host')f.setHost('unknown');else f.setPeer('exited');
      await f.watch.check();expect(f.terminated).toHaveBeenCalledOnce();
      expect(f.watch.state()).toBe('stopped');
    }
  });
  it('closes owned host before releasing staged file handles and profile; unknown cleanup quarantines',async()=>{
    const f=rig();expect(f.arm()).toBe(true);f.setHost('unknown');
    await f.watch.check();
    expect(f.stopHost).toHaveBeenCalledOnce();
    expect(f.releaseStage).toHaveBeenCalledOnce();
    expect(f.cleanupProfile).toHaveBeenCalledOnce();
    expect(f.watch.state()).toBe('stopped');
    const g=rig();g.stop(false);expect(g.arm()).toBe(true);g.setHost('unknown');
    await g.watch.check();
    expect(g.watch.state()).toBe('quarantined');
    expect(g.releaseStage).not.toHaveBeenCalled();
    expect(g.cleanupProfile).not.toHaveBeenCalled();
  });
  it('rejects forged heartbeat and retains quarantine on audit or Job cleanup failure',async()=>{
    for(const fault of ['mac','audit','job']){
      const f=rig();expect(f.arm()).toBe(true);
      if(fault==='mac')f.auth(false);
      if(fault==='audit')f.audit(false);
      if(fault==='job')f.stop(false);
      expect(f.watch.observeHeartbeat({ownerEpoch:'epoch-host-01',sequence:1}))
        .toBe(fault!=='mac');
      if(fault!=='mac')f.setHost('unknown');
      await f.watch.check();
      expect(f.watch.state()).toBe('quarantined');
    }
  });
});
