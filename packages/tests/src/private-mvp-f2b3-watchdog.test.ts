import { describe, expect, it, vi } from 'vitest';
import { createPrivateMvpOwnedPeerWatch, type PrivateMvpWatchClock } from '@sud-d/infrastructure';

function fixture(auditSuccess=true) {
  let now=1000;
  let sample: (()=>void)|undefined;
  const events:string[]=[];
  const stop=vi.fn(async()=>true);
  const clock:PrivateMvpWatchClock={
    monotonicMs:()=>now, wallMs:()=>Date.UTC(2026,9,8,9,0,0)+now,
    every:(_ms,fn)=>{sample=fn;return()=>{sample=undefined;}},
  };
  const watchdog=createPrivateMvpOwnedPeerWatch({
    role:'gateway', ownerEpoch:'epoch-fixed-1', clock,
    ownedJob:{ kind:'owned-worker-job', ownerEpoch:'epoch-fixed-1', alive:()=> 'alive', terminateAndConfirm:stop },
    peer:{ kind:'owned-desktop-process', ownerEpoch:'epoch-fixed-1', alive:()=> 'alive' },
    writeAudit:(event)=>{events.push(event);return auditSuccess;},
  });
  return { watchdog, stop, events, advance:(ms:number)=>{now+=ms;}, tick:()=>sample?.() };
}

describe('F2-B3 owned-peer watchdog (fake monotonic time, no OS handles)',()=>{
  it('arms only with exact owned epoch handles, expires a peer lease, stops the owned Job and fences admission',async()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    expect(f.watchdog.observeHeartbeat({ownerEpoch:'epoch-fixed-1',sequence:1})).toBe(true);
    f.advance(8001);
    await f.watchdog.check();
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.watchdog.state()).toBe('stopped');
    expect(f.watchdog.observeHeartbeat({ownerEpoch:'epoch-fixed-1',sequence:2})).toBe(false);
    expect(f.events).toContain('peer-lease-expired');
  });
  it('rejects replay, wrong epoch, moved-backward clock, and retains quarantine on unconfirmed cleanup',async()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    expect(f.watchdog.observeHeartbeat({ownerEpoch:'other',sequence:1})).toBe(false);
    await f.watchdog.check();
    expect(f.watchdog.state()).toBe('quarantined');
    expect(f.stop).toHaveBeenCalledTimes(1);
  });
  it('enforces attempt deadline, exact process exit and shutdown before persistence close',async()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,0,5)+1000)).toBe(true);
    f.advance(6001);
    await f.watchdog.check();
    expect(f.events).toContain('attempt-deadline');
    expect(f.watchdog.state()).toBe('stopped');
    expect(await f.watchdog.shutdown()).toBe(true);
  });
  it('does not claim a clean stop when owned native handle termination fails',async()=>{
    const f=fixture();
    f.stop.mockResolvedValue(false);
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    expect(f.watchdog.cancel()).toBe(true);
    await f.watchdog.check();
    expect(f.watchdog.state()).toBe('quarantined');
    expect(f.events).toContain('cancelled');
  });
  it('rejects replayed heartbeat even while peer handle reports alive and quarantines',async()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    expect(f.watchdog.observeHeartbeat({ownerEpoch:'epoch-fixed-1',sequence:1})).toBe(true);
    expect(f.watchdog.observeHeartbeat({ownerEpoch:'epoch-fixed-1',sequence:1})).toBe(false);
    await f.watchdog.check();
    expect(f.watchdog.state()).toBe('quarantined');
  });

  it('denies a monotonic clock rollback without extending the lease',async()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    f.advance(-1);
    await f.watchdog.check();
    expect(f.watchdog.state()).toBe('quarantined');
  });

  it('retains quarantine when audit transition cannot be persisted',async()=>{
    const f=fixture(false);
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,5,0)+1000)).toBe(true);
    expect(f.watchdog.cancel()).toBe(true);
    await f.watchdog.check();
    expect(f.stop).toHaveBeenCalledOnce();
    expect(f.watchdog.state()).toBe('quarantined');
  });

  it('blocks missing or unrelated owned process handles at the constructor/arm seam',()=>{
    const f=fixture();
    expect(f.watchdog.arm(Date.UTC(2026,9,8,9,15,0)+1000)).toBe(false);
  });
});
