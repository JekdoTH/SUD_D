import {describe,it,expect,vi} from 'vitest';
import {createF2H1DesktopInertV2Control} from '../../infrastructure/src/private-mvp-desktop-owned-session.js';
import {createF2H1RunnerInertV2Control,F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED,runFixedF2H1RunnerControl}
  from '../../infrastructure/src/private-mvp-runner-control-entry.js';
import type {F2H1ControlV2Frame,F2H1H0AckExpected}
  from '../../infrastructure/src/private-mvp-h1-control-protocol.js';

const ids={ownerEpoch:'epoch-1',missionId:'mission-1',attemptId:'attempt-1',
  stageSealDigest:'a'.repeat(64),executionFingerprint:'b'.repeat(64)};
const key=Buffer.alloc(32,41),challenge=Buffer.alloc(32,71);
const prepare={missionRevision:1,workspaceGeneration:'generation-1',
  stageIdentity:'stage-1',recipeFingerprint:'c'.repeat(64),
  profileSid:'S-1-15-2-1234',deadlineMs:6000,
  creationToken:'creation-1',h0Identity:'h0-1'};
const expected:F2H1H0AckExpected={...ids,recipeFingerprint:prepare.recipeFingerprint,
  imageDigest:'d'.repeat(64),runnerCreationToken:prepare.creationToken,
  retainedRunnerObject:'runner-object-1',workerJobObject:'worker-job-1'};
const held={...ids,runnerCreationToken:prepare.creationToken,h0Identity:prepare.h0Identity,
  sourceProcessCoordinate:'123456789',state:'h0-control-suspended' as const};

function fixture(){
  let tick=1000;
  const d2r:Uint8Array[]=[],r2d:Uint8Array[]=[],events:string[]=[];
  const channel={...ids,key,challenge,now:()=>tick,
    ownerDeadlineMs:20000,missionDeadlineMs:20000,leaseDeadlineMs:9000};
  const desktopPipe={
    send:vi.fn(async(bytes:Uint8Array)=>{events.push('desktop-write');d2r.push(bytes);}),
    nextFrame:vi.fn(async()=>{
      const packet=r2d.shift();
      if(!packet)throw Error('PIPE_EOF');
      return packet;
    }),
  };
  const runnerPipe={
    send:vi.fn(async(bytes:Uint8Array)=>{events.push('runner-write');r2d.push(bytes);}),
    nextFrame:vi.fn(async()=>{
      const packet=d2r.shift();
      if(!packet)throw Error('PIPE_EOF');
      return packet;
    }),
  };
  const desktop=createF2H1DesktopInertV2Control({
    channel,prepare,expected,pipe:desktopPipe,
  });
  const runner=createF2H1RunnerInertV2Control({channel,pipe:runnerPipe});
  return {desktop,runner,desktopPipe,runnerPipe,d2r,r2d,events,
    setTime:(value:number)=>{tick=value;}};
}

describe('source-local V2 private pipe dispatch — native-unavailable',()=>{
  it('writes bounded private frames, authenticates ready and prepare once through existing role source',async()=>{
    const f=fixture();
    expect(await f.runner.sendReady()).toBe('sent');
    expect(await f.desktop.receiveNext()).toBe('ready');
    await f.desktop.sendPrepare();
    expect(f.d2r).toHaveLength(1);
    expect(f.d2r[0]!.length).toBeLessThanOrEqual(4096);
    expect(f.d2r[0]![f.d2r[0]!.length-1]).toBe(10);
    expect(await f.runner.receiveNext()).toBe('awaiting-held-creation');
    expect(f.desktop.state()).toBe('awaiting-owned');
    expect(f.runner.state()).toBe('awaiting-held-creation');
    expect(f.events).toEqual(['runner-write','desktop-write']);
    expect(f.desktop.nativeAuthorization).toBe(false);
    expect(f.runner.nativeAuthorization).toBe(false);
    expect(f.runner.readiness()).toBe(false);
    expect('resumeH0Control' in f.runner).toBe(false);
    expect(F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED).toBe(false);
    await expect(runFixedF2H1RunnerControl()).rejects.toThrow('F2_H1_RUNNER_ENTRY_EXECUTION_NOT_AUTHORIZED');
  });

  it('prevents any H0-owned and physical ACK without retained Runner OS creation/proof',async()=>{
    const f=fixture();
    await f.desktop.sendPrepare();
    expect(await f.runner.receiveNext()).toBe('awaiting-held-creation');
    await expect(f.runner.sendOwned(held)).rejects.toThrow('F2_H1_RUNNER_V2_OS_CREATION_UNAVAILABLE');
    expect(f.r2d).toHaveLength(0);
    expect(f.runner.state()).toBe('quarantined');
    expect(f.desktop.state()).toBe('awaiting-owned');
    expect(await f.desktop.receiveNext()).toBe('quarantined'); // EOF
    expect(f.d2r).toHaveLength(0); // consumed prepare; no ACK
    expect(f.desktop.readiness()).toBe(false);
    expect('resumeWorker' in f.runner).toBe(false);
    expect('cleanupVerified' in f.desktop).toBe(false);
  });

  it('fences a forged valid-looking H0-owned even if the remote sender supplies synthetic data',async()=>{
    const f=fixture();
    const scripted=createF2H1RunnerInertV2Control({
      channel:{...ids,key,challenge,now:()=>1000,
        ownerDeadlineMs:20000,missionDeadlineMs:20000,leaseDeadlineMs:9000},
      write:async(frame:F2H1ControlV2Frame)=>{
        f.r2d.push(Buffer.from(JSON.stringify(frame)+'\n'));
      },
    });
    await f.desktop.sendPrepare();
    expect(scripted.receivePrepare(f.d2r.shift())).toBe('awaiting-held-creation');
    await scripted.sendOwned(held);
    expect(await f.desktop.receiveNext()).toBe('quarantined');
    expect(f.d2r).toHaveLength(0);
    expect(f.desktop.state()).toBe('quarantined');
  });

  it('rejects V1, wrong-MAC, wrong-role and replay/sequence under exactly one reader',async()=>{
    for(const mutate of [
      (f:Record<string,unknown>)=>({...f,revision:'f2-h1-control-v1'}),
      (f:Record<string,unknown>)=>({...f,mac:'f'.repeat(64)}),
      (f:Record<string,unknown>)=>({...f,role:'runner'}),
      (f:Record<string,unknown>)=>({...f,sequence:9}),
    ]){
      const f=fixture();
      await f.desktop.sendPrepare();
      const original=JSON.parse(Buffer.from(f.d2r.shift()!).toString('utf8')) as Record<string,unknown>;
      f.d2r.push(Buffer.from(JSON.stringify(mutate(original))+'\n'));
      expect(await f.runner.receiveNext()).toBe('quarantined');
      expect(f.runner.state()).toBe('quarantined');
      expect(f.runner.readiness()).toBe(false);
    }
  });

  it('fences oversized, malformed, EOF, cancellation and late completion',async()=>{
    for(const packet of [
      Buffer.alloc(4097,33),
      Buffer.from('{not json\n'),
      undefined,
    ]){
      const f=fixture();
      if(packet)f.d2r.push(packet);
      expect(await f.runner.receiveNext()).toBe('quarantined');
    }
    const stopped=fixture();
    await stopped.desktop.sendPrepare();
    stopped.runner.fence();
    expect(await stopped.runner.receiveNext()).toBe('quarantined');
    const timed=fixture();
    timed.setTime(9000);
    await expect(timed.desktop.sendPrepare()).rejects.toThrow();
    expect(timed.desktop.state()).toBe('quarantined');

    const cancelled=fixture();
    let settle!:(value:Uint8Array)=>void;
    cancelled.runnerPipe.nextFrame.mockImplementationOnce(()=>new Promise<Uint8Array>(
      resolve=>{settle=resolve;}
    ));
    const pending=cancelled.runner.receiveNext();
    cancelled.runner.fence();
    settle!(Buffer.from('{}\n'));
    expect(await pending).toBe('quarantined');
  });

  it('serializes authenticated Runner heartbeat without interleaving Desktop ACK slot',async()=>{
    const f=fixture();
    expect(await f.runner.sendReady()).toBe('sent');
    expect(await f.desktop.receiveNext()).toBe('ready');
    await f.desktop.sendPrepare();
    expect(await f.runner.receiveNext()).toBe('awaiting-held-creation');
    expect(await f.desktop.sendControl('heartbeat')).toBe('paused');
    expect(f.d2r).toHaveLength(0);
    expect(await f.runner.sendHeartbeat()).toBe('sent');
    expect(await f.desktop.receiveNext()).toBe('heartbeat');
    expect(f.d2r).toHaveLength(0);
    expect(f.desktop.state()).toBe('awaiting-owned');
  });

  it('authenticates cancel as terminal without a cleanup claim, H0 or worker resume',async()=>{
    const f=fixture();
    await f.desktop.sendPrepare();
    expect(await f.runner.receiveNext()).toBe('awaiting-held-creation');
    expect(await f.desktop.sendControl('cancel')).toBe('quarantined');
    expect(await f.runner.receiveNext()).toBe('quarantined');
    expect(f.desktop.state()).toBe('quarantined');
    expect(f.runner.state()).toBe('quarantined');
    expect(f.r2d).toHaveLength(0);
    expect('resumeH0Control' in f.runner).toBe(false);
    expect('cleanupVerified' in f.desktop).toBe(false);
  });

  it('rejects duplicate authenticated ready frame instead of accepting a replayed heartbeat',async()=>{
    const f=fixture();
    await f.runner.sendReady();
    const ready=f.r2d[0]!;
    expect(await f.desktop.receiveNext()).toBe('ready');
    f.r2d.push(ready);
    expect(await f.desktop.receiveNext()).toBe('quarantined');
    expect(f.desktop.state()).toBe('quarantined');
  });

  it('keeps one writer, one prepare slot, no V1 downgrade and no change to native gates',async()=>{
    const f=fixture();
    await f.desktop.sendPrepare();
    await expect(f.desktop.sendPrepare()).rejects.toThrow();
    expect(f.d2r).toHaveLength(1);
    const both={...ids,key,challenge,now:()=>1000,
      ownerDeadlineMs:20000,missionDeadlineMs:20000,leaseDeadlineMs:9000};
    expect(()=>createF2H1RunnerInertV2Control({
      channel:both,pipe:f.runnerPipe,write:async()=>{},
    })).toThrow('F2_H1_RUNNER_V2_EXACTLY_ONE_WRITER');
    expect(()=>createF2H1DesktopInertV2Control({
      channel:both,prepare,expected,pipe:f.desktopPipe,write:async()=>{},
    })).toThrow('F2_H1_DESKTOP_V2_EXACTLY_ONE_WRITER');
  });
});
