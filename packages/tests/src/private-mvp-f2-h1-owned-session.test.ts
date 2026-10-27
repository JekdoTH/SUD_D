import {afterEach,describe,expect,it,vi} from 'vitest';
import {createF2H1DesktopOwnedSession} from '../../infrastructure/src/private-mvp-desktop-owned-session.js';
import type {F2H1DesktopOwnedSessionInput} from '../../infrastructure/src/private-mvp-desktop-owned-session.js';
import {createF2H1RunnerControlProtocol} from '@sud-d/infrastructure';

const scope={
  missionId:'mission-fixed-01',revision:1,goalDigest:'a'.repeat(64),
  workspaceId:'workspace-fixed-01',workspaceGeneration:'generation-01',
  runnerId:'runner-fixed',executionFingerprint:'b'.repeat(64),
  inputDigest:'c'.repeat(64),resourcePolicyIdentity:'d'.repeat(64),
  expiresAt:'2026-10-09T23:59:59.000Z',
};
const input={scope,attemptId:'attempt-fixed-01',ownerEpoch:'epoch-fixed-01',
  stageSealDigest:'e'.repeat(64)};
const ok=()=>({ok:true as const});
function rig(options:{
  failCreate?:boolean;failWatchdog?:boolean;failClaim?:boolean;
  stopInsideCreate?:boolean;
  ready?:'valid'|'forged'|'missing';stallWrite?:boolean;stallRead?:boolean;
  zeroMembers?:boolean;closeHandles?:boolean;terminate?:boolean;
  journalTerminated?:boolean;cleanJournal?:boolean;
  sessionInput?:F2H1DesktopOwnedSessionInput;onCreate?:()=>void;
}={}) {
  const order:string[]=[];
  let resolveRead:((value:Uint8Array)=>void)|undefined;
  const buffered:Uint8Array[]=[];
  const os={
    guardian:101n,runner:102n,thread:103n,desktopReference:104n,
    desktopReads:105n,desktopWrites:106n,
    resumeControlThread:vi.fn(()=>{order.push('resume');}),
    terminateGuardian:vi.fn(()=>{order.push('kill');return options.terminate!==false;}),
    waitExactRunnerExit:vi.fn((ms:number)=>{order.push('wait:'+ms);return true;}),
    queryGuardianZeroMembers:vi.fn(()=>{order.push('zero');return options.zeroMembers!==false;}),
    closeAllOwnedHandles:vi.fn(()=>{order.push('close');return options.closeHandles!==false;}),
  };
  const admission={
    claimNativePreparation:vi.fn(()=>{order.push('claim');return options.failClaim?{ok:false}:ok();}),
    markNativeOwned:vi.fn(()=>{order.push('owned');return ok();}),
    markNativeTerminated:vi.fn(()=>{order.push('terminated');
      return options.journalTerminated===false?{ok:false}:ok();}),
    markNativeCleanupUnknown:vi.fn(()=>{order.push('unknown');return ok();}),
    confirmNativeCleanupFromOwnedOs:vi.fn(()=>{order.push('clean');
      return options.cleanJournal===false?{ok:false}:ok();}),
  };
  const pipe={
    arm:vi.fn(async (read:bigint,write:bigint)=>{
      order.push('pipe-arm:'+read+':'+write);
    }),
    send:vi.fn(async(bytes:Uint8Array)=>{
      const value=JSON.parse(Buffer.from(bytes).toString('utf8'));
      order.push('send:'+value.kind);
      if(options.stallWrite&&value.kind==='desktop-private-bootstrap-v1')
        await new Promise<void>(()=>{});
      if(value.kind==='desktop-private-bootstrap-v1'&&!options.stallRead
        &&options.ready!=='missing'){
        const runner=createF2H1RunnerControlProtocol({
          ownerEpoch:value.ownerEpoch,missionId:value.missionId,
          attemptId:value.attemptId,stageSealDigest:value.stageSealDigest,
          executionFingerprint:value.executionFingerprint,
          key:Buffer.from(value.secret,'hex'),
          challenge:Buffer.from(value.challenge,'hex'),
          localRole:'runner',
        });
        const ready=runner.issue('runner','ready',{});
        const frame=options.ready==='forged'?{...ready,mac:'0'.repeat(64)}:ready;
        const bytes=Buffer.from(JSON.stringify(frame));
        if(resolveRead){const done=resolveRead;resolveRead=undefined;done(bytes);}
        else buffered.push(bytes);
      }
    }),
    nextFrame:vi.fn(async()=>{
      const queued=buffered.shift();
      if(queued)return queued;
      return new Promise<Uint8Array>(resolve=>{resolveRead=resolve;});
    }),
    shutdown:vi.fn(async()=>{order.push('pipe-stop');return true;}),
  };
  const watchdog={
    arm:vi.fn(async()=>{order.push('watch-arm');
      if(options.failWatchdog)throw Error('watchdog-failed');}),
    authenticatedHeartbeat:vi.fn(()=>{order.push('beat');}),
    shutdown:vi.fn(async()=>{order.push('watch-stop');return true;}),
  };
  const ctrl=createF2H1DesktopOwnedSession(options.sessionInput??input,{
    // Injected fixture uses Result-shaped stubs; no live admission/DB is called.
    admission:admission as unknown as Parameters<typeof createF2H1DesktopOwnedSession>[1]['admission'],
    pipe,watchdog,
    createSuspended:()=>{
      order.push('create');
      options.onCreate?.();
      if(options.failCreate)throw Error('partial-creation');
      if(options.stopInsideCreate)void ctrl.stop('reentrant-cancel');
      return os;
    },
  });
  return {ctrl,order,os,pipe,watchdog,admission};
}
afterEach(()=>vi.useRealTimers());
describe('PRE-H1 one owned Win32 transaction (injected OS/IO; no Native calls)',()=>{
  it('claims pending before OS creation; watchdog + exact pipe arms before resume, authenticates READY, then verifies stop',async()=>{
    const r=rig();
    await r.ctrl.start();
    expect(r.ctrl.state()).toBe('active');
    expect(r.order.slice(0,6)).toEqual([
      'claim','create','owned','watch-arm','pipe-arm:105:106','resume',
    ]);
    expect(r.order).toContain('send:desktop-private-bootstrap-v1');
    const evidence=await r.ctrl.stop('cancel');
    expect(evidence).toEqual({disposition:'verified-cleaned',osStopProven:true});
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
    expect(r.os.waitExactRunnerExit).toHaveBeenCalledWith(5000);
    expect(r.order.indexOf('kill')).toBeLessThan(r.order.indexOf('zero'));
    expect(r.order.indexOf('zero')).toBeLessThan(r.order.indexOf('close'));
    expect(r.order.indexOf('close')).toBeLessThan(r.order.indexOf('clean'));
    expect(r.admission.markNativeCleanupUnknown).not.toHaveBeenCalled();
    expect(await r.ctrl.shutdown()).toEqual(evidence);
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
  });
  it('stop-before-start is terminal and never claims or creates',async()=>{
    const r=rig();
    expect(await r.ctrl.stop()).toEqual({disposition:'not-started',osStopProven:false});
    await expect(r.ctrl.start()).rejects.toThrow();
    expect(r.order).toEqual([]);
    expect(await r.ctrl.stop()).toEqual({disposition:'not-started',osStopProven:false});
  });
  it('only first simultaneous start owns the claim and OS transaction',async()=>{
    const r=rig();
    const first=r.ctrl.start();
    await expect(r.ctrl.start()).rejects.toThrow('F2_H1_CONTROLLER_ALREADY_CLAIMED');
    await first;
    expect(r.admission.claimNativePreparation).toHaveBeenCalledTimes(1);
    expect(r.order.filter(v=>v==='create')).toHaveLength(1);
    await r.ctrl.stop();
  });
  it('stop during pending watchdog arm forbids resume and late arming, then safely stops workers',async()=>{
    const r=rig();
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    r.watchdog.arm.mockImplementation(async()=>{r.order.push('watch-pending');await hold;r.order.push('watch-late');});
    const started=r.ctrl.start();
    await Promise.resolve();
    const stopped=r.ctrl.stop();
    release();
    expect(await stopped).toEqual({disposition:'verified-cleaned',osStopProven:true});
    await expect(started).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.os.resumeControlThread).not.toHaveBeenCalled();
    expect(r.pipe.arm).not.toHaveBeenCalled();
    expect(r.order.indexOf('watch-late')).toBeLessThan(r.order.indexOf('watch-stop'));
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
  });
  it('stop during pending pipe arm fences resume and waits for late worker arming',async()=>{
    const r=rig();
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    r.pipe.arm.mockImplementation(async()=>{r.order.push('pipe-pending');await hold;r.order.push('pipe-late');});
    const started=r.ctrl.start();
    await vi.waitFor(()=>expect(r.order).toContain('pipe-pending'));
    const stopped=r.ctrl.stop();
    release();
    await stopped;
    await expect(started).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.os.resumeControlThread).not.toHaveBeenCalled();
    expect(r.order.indexOf('pipe-late')).toBeLessThan(r.order.indexOf('pipe-stop'));
  });
  it('stop during blocked bootstrap write never begins READY or monitoring after late completion',async()=>{
    const r=rig();
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    r.pipe.send.mockImplementation(async(bytes:Uint8Array)=>{
      const body=JSON.parse(Buffer.from(bytes).toString('utf8'));
      r.order.push('send:'+body.kind);
      if(body.kind==='desktop-private-bootstrap-v1')await hold;
    });
    const started=r.ctrl.start();
    await vi.waitFor(()=>expect(r.order).toContain('send:desktop-private-bootstrap-v1'));
    const stopped=r.ctrl.stop();
    release();
    await stopped;
    await expect(started).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.ctrl.state()).toBe('cleaned');
    expect(r.pipe.nextFrame).not.toHaveBeenCalled();
    expect(r.watchdog.authenticatedHeartbeat).not.toHaveBeenCalled();
  });
  it('stop during missing READY rejects startup promptly even when read never resolves',async()=>{
    const r=rig({ready:'missing'});
    const started=r.ctrl.start();
    await vi.waitFor(()=>expect(r.pipe.nextFrame).toHaveBeenCalledTimes(1));
    const stopped=r.ctrl.stop();
    expect(await stopped).toMatchObject({disposition:'verified-cleaned'});
    await expect(started).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.ctrl.state()).toBe('cleaned');
  });
  it('reentrant stop during synchronous create waits for the returned exact OS handles',async()=>{
    const r=rig({stopInsideCreate:true});
    await expect(r.ctrl.start()).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.os.resumeControlThread).not.toHaveBeenCalled();
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
    expect(r.ctrl.shutdownEvidence().disposition).toBe('verified-cleaned');
    expect(await r.ctrl.stop()).toEqual(r.ctrl.shutdownEvidence());
  });
  it('stop during unresolved watchdog arm never closes live handles or claims CLEANED',async()=>{
    vi.useFakeTimers();
    const r=rig();
    r.watchdog.arm.mockImplementation(async()=>new Promise<void>(()=>{}));
    const started=r.ctrl.start();
    const rejected=expect(started).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    await vi.advanceTimersByTimeAsync(1);
    const stopped=r.ctrl.stop();
    await vi.advanceTimersByTimeAsync(1101);
    expect(await stopped).toEqual({disposition:'cleanup-unconfirmed',osStopProven:false});
    await rejected;
    expect(r.os.closeAllOwnedHandles).not.toHaveBeenCalled();
    expect(r.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
  });
  it('duplicate stop while IO shutdown is pending shares one terminal cleanup',async()=>{
    const r=rig();
    await r.ctrl.start();
    let release!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;});
    r.pipe.shutdown.mockImplementation(async()=>{r.order.push('shutdown-pending');await hold;return true;});
    const first=r.ctrl.stop();
    const second=r.ctrl.shutdown();
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
    expect(r.ctrl.state()).toBe('fenced');
    release();
    expect(await first).toEqual({disposition:'verified-cleaned',osStopProven:true});
    expect(await second).toEqual(await r.ctrl.stop());
    expect(r.pipe.shutdown).toHaveBeenCalledTimes(1);
  });
  it('partial native creation is never reclaimed by PID; pending attempt is quarantined',async()=>{
    const r=rig({failCreate:true});
    await expect(r.ctrl.start()).rejects.toThrow('partial-creation');
    expect(r.order).toEqual(['claim','create','unknown']);
    expect(r.admission.confirmNativeCleanupFromOwnedOs).not.toHaveBeenCalled();
  });
  it('uncommitted pending claim never creates any Job',async()=>{
    const r=rig({failClaim:true});
    await expect(r.ctrl.start()).rejects.toThrow('F2_H1_JOURNAL_CLAIM_UNCONFIRMED');
    expect(r.order).toEqual(['claim']);
  });
  it('watchdog startup failure never resumes; failed arm is quarantined',async()=>{
    const r=rig({failWatchdog:true});
    await expect(r.ctrl.start()).rejects.toThrow('watchdog-failed');
    expect(r.os.resumeControlThread).not.toHaveBeenCalled();
    expect(r.order).toContain('kill');
    expect(r.ctrl.shutdownEvidence().disposition).toBe('cleanup-unconfirmed');
  });
  it('forged READY must fence/kill and may only write CLEANED after OS confirmation',async()=>{
    const r=rig({ready:'forged'});
    await expect(r.ctrl.start()).rejects.toThrow('F2_H1_CONTROLLER_UNAUTHENTICATED_PEER');
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
    expect(r.ctrl.state()).toBe('cleaned');
  });
  it('missing READY and stalled read are bounded at 5s; no implicit authorization',async()=>{
    vi.useFakeTimers();
    const r=rig({ready:'missing'});
    const started=r.ctrl.start();
    const rejected=expect(started).rejects.toThrow('F2_H1_CONTROLLER_READY_TIMEOUT');
    await vi.advanceTimersByTimeAsync(5001);
    await rejected;
    expect(r.ctrl.shutdownEvidence().osStopProven).toBe(true);
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
  });
  it('stalled write is bounded at bootstrap deadline and cannot stall exact Job kill',async()=>{
    vi.useFakeTimers();
    const r=rig({stallWrite:true});
    const rejected=expect(r.ctrl.start()).rejects.toThrow('F2_H1_CONTROLLER_BOOTSTRAP_WRITE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(5001);
    await rejected;
    expect(r.order).toContain('kill');
  });
  it('8s heartbeat loss trips the independent OS cleanup path; not a stopped-frame proof',async()=>{
    vi.useFakeTimers();
    const r=rig();
    await r.ctrl.start();
    await vi.advanceTimersByTimeAsync(10000);
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
    expect(r.ctrl.state()).toBe('cleaned');
  });
  it.each([
    ['Guardian job query nonzero',{zeroMembers:false}],
    ['CloseHandle failure',{closeHandles:false}],
    ['TerminateJobObject failure',{terminate:false}],
    ['audit rollback',{journalTerminated:false}],
    ['clean audit rollback',{cleanJournal:false}],
  ] as const)('%s leaves cleanup_unknown with charge retained',async(_name,options)=>{
    const r=rig(options);
    await r.ctrl.start();
    expect(await r.ctrl.stop()).toEqual({
      disposition:'cleanup-unconfirmed',osStopProven:false,
    });
    expect(r.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
    expect(await r.ctrl.stop()).toEqual(r.ctrl.shutdownEvidence());
    expect(r.os.terminateGuardian).toHaveBeenCalledTimes(1);
  });
  it('snapshots every one of the ten scope scalars plus attempt/epoch/seal before start, without freezing caller input',async()=>{
    const caller={scope:{...scope},attemptId:'attempt-fixed-01',ownerEpoch:'epoch-fixed-01',
      stageSealDigest:'e'.repeat(64)};
    const original={scope:{...caller.scope},attemptId:caller.attemptId,
      ownerEpoch:caller.ownerEpoch,stageSealDigest:caller.stageSealDigest};
    const r=rig({sessionInput:caller});
    Object.assign(caller.scope,{
      missionId:'mission-changed',revision:2,goalDigest:'1'.repeat(64),
      workspaceId:'workspace-changed',workspaceGeneration:'generation-changed',
      runnerId:'runner-changed',executionFingerprint:'2'.repeat(64),
      inputDigest:'3'.repeat(64),resourcePolicyIdentity:'4'.repeat(64),
      expiresAt:'2026-10-10T23:59:59.000Z',
    });
    caller.attemptId='attempt-changed';
    caller.ownerEpoch='epoch-changed';
    caller.stageSealDigest='5'.repeat(64);
    expect(Object.isFrozen(caller)).toBe(false);
    expect(Object.isFrozen(caller.scope)).toBe(false);
    await r.ctrl.start(); // A valid authenticated READY proves protocol kept the original identity.
    expect(r.ctrl.state()).toBe('active');
    expect(r.admission.claimNativePreparation).toHaveBeenCalledWith(
      original.scope,original.attemptId,original.ownerEpoch,original.stageSealDigest);
    const receivedScope=(r.admission.claimNativePreparation.mock.calls[0] as unknown as readonly unknown[])[0];
    expect(receivedScope).not.toBe(caller.scope);
    expect(Object.isFrozen(receivedScope)).toBe(true);
    expect(r.admission.markNativeOwned).toHaveBeenCalledWith(
      original.scope,original.attemptId,original.ownerEpoch,original.stageSealDigest);
    const bootstrapCall=r.pipe.send.mock.calls.find(([value])=>{
      const frame=JSON.parse(Buffer.from(value).toString('utf8')) as {kind:string};
      return frame.kind==='desktop-private-bootstrap-v1';
    });
    expect(bootstrapCall).toBeDefined();
    const bootstrap=JSON.parse(Buffer.from(bootstrapCall![0]).toString('utf8')) as Record<string,unknown>;
    expect(bootstrap).toMatchObject({ownerEpoch:original.ownerEpoch,
      missionId:original.scope.missionId,attemptId:original.attemptId,
      stageSealDigest:original.stageSealDigest,
      executionFingerprint:original.scope.executionFingerprint});
    await r.ctrl.stop();
    expect(r.admission.markNativeTerminated).toHaveBeenCalledWith(
      original.scope,original.attemptId,original.ownerEpoch);
    expect(r.admission.confirmNativeCleanupFromOwnedOs).toHaveBeenCalledWith(
      original.scope,original.attemptId,original.ownerEpoch,original.stageSealDigest,
      expect.any(Object));
  });

  it('holds the original scope across async watchdog arming and CLEANUP_UNKNOWN after caller mutation',async()=>{
    const caller={scope:{...scope},attemptId:'attempt-fixed-01',ownerEpoch:'epoch-fixed-01',
      stageSealDigest:'e'.repeat(64)};
    const originalScope={...caller.scope};
    const r=rig({sessionInput:caller,zeroMembers:false});
    let release!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;});
    r.watchdog.arm.mockImplementation(async()=>{r.order.push('watch-held');await held;});
    const started=r.ctrl.start();
    await vi.waitFor(()=>expect(r.order).toContain('watch-held'));
    Object.assign(caller.scope,{missionId:'mission-late',executionFingerprint:'7'.repeat(64)});
    caller.attemptId='attempt-late';caller.ownerEpoch='epoch-late';caller.stageSealDigest='8'.repeat(64);
    release();
    await started;
    expect(await r.ctrl.stop()).toEqual({disposition:'cleanup-unconfirmed',osStopProven:false});
    expect(r.admission.markNativeCleanupUnknown).toHaveBeenCalledWith(
      originalScope,'attempt-fixed-01','epoch-fixed-01');
    expect(r.admission.claimNativePreparation).toHaveBeenCalledWith(
      originalScope,'attempt-fixed-01','epoch-fixed-01','e'.repeat(64));
    expect(r.admission.markNativeOwned).toHaveBeenCalledWith(
      originalScope,'attempt-fixed-01','epoch-fixed-01','e'.repeat(64));
    expect(r.admission.confirmNativeCleanupFromOwnedOs).not.toHaveBeenCalled();
  });

  it('retains original immutable admission identity during reentrant creation stop and verified synthetic cleanup',async()=>{
    const caller={scope:{...scope},attemptId:'attempt-fixed-01',ownerEpoch:'epoch-fixed-01',
      stageSealDigest:'e'.repeat(64)};
    const originalScope={...caller.scope};
    const r=rig({sessionInput:caller,stopInsideCreate:true,onCreate:()=>{
      caller.scope.goalDigest='9'.repeat(64);
      caller.scope.missionId='mission-reentrant';
      caller.attemptId='attempt-reentrant';
      caller.ownerEpoch='epoch-reentrant';caller.stageSealDigest='f'.repeat(64);
    }});
    await expect(r.ctrl.start()).rejects.toThrow('F2_H1_CONTROLLER_STOPPED');
    expect(r.os.resumeControlThread).not.toHaveBeenCalled();
    expect(r.admission.markNativeTerminated).toHaveBeenCalledWith(
      originalScope,'attempt-fixed-01','epoch-fixed-01');
    expect(r.admission.confirmNativeCleanupFromOwnedOs).toHaveBeenCalledWith(
      originalScope,'attempt-fixed-01','epoch-fixed-01','e'.repeat(64),expect.any(Object));
    expect(await r.ctrl.stop()).toEqual({disposition:'verified-cleaned',osStopProven:true});
  });

  it('rejects unknown keys, absent fields and wrong scalar types BEFORE copying a malformed scope',()=>{
    const r=rig();
    const create=vi.fn(()=>r.os);
    const ports={admission:r.admission,watchdog:r.watchdog,pipe:r.pipe,
      createSuspended:create};
    const {runnerId:discarded,...missing}=scope;
    void discarded;
    const malformed=[
      {...scope,extraAuthority:'unreviewed'},
      missing,
      {...scope,revision:'1'},
      {...scope,workspaceGeneration:{value:'generation-01'}},
      {...scope,missionId:null},
      [] as unknown,
    ];
    for(const bad of malformed) {
      expect(()=>createF2H1DesktopOwnedSession({
        ...input,scope:bad as F2H1DesktopOwnedSessionInput['scope'],
      },ports as unknown as Parameters<typeof createF2H1DesktopOwnedSession>[1]))
        .toThrow('F2_H1_UNTRUSTED_OWNED_SESSION_BINDING');
    }
    expect(r.admission.claimNativePreparation).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

});
