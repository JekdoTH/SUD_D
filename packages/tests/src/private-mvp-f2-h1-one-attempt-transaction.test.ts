import {describe,it,expect,vi} from 'vitest';
import {createF2H1OneAttemptTransaction} from '../../infrastructure/src/private-mvp-f2-h1-one-attempt-transaction.js';
import type {F2H1ControlV2Frame,F2H1H0PhysicalEvidence,F2H1H0AckExpected}
  from '../../infrastructure/src/private-mvp-h1-control-protocol.js';
import type {PrivateMvpMissionScope} from '../../infrastructure/src/private-mvp-mission-admission.js';

const scope:PrivateMvpMissionScope={
  missionId:'mission-1',revision:1,goalDigest:'c'.repeat(64),
  workspaceId:'workspace-1',workspaceGeneration:'generation-1',runnerId:'runner-1',
  executionFingerprint:'b'.repeat(64),inputDigest:'d'.repeat(64),
  resourcePolicyIdentity:'e'.repeat(64),expiresAt:'2027-01-01T00:00:00.000Z',
};
const ownerEpoch='epoch-1',attemptId='attempt-1',stageSealDigest='a'.repeat(64);
const key=Buffer.alloc(32,41),challenge=Buffer.alloc(32,71);
const recipeFingerprint='f'.repeat(64),imageDigest='9'.repeat(64);
const prepare={missionRevision:1,workspaceGeneration:scope.workspaceGeneration,
  stageIdentity:'stage-1',recipeFingerprint,profileSid:'S-1-15-2-1234',
  deadlineMs:9000,creationToken:'creation-1',h0Identity:'h0-1'};
const expected:F2H1H0AckExpected={ownerEpoch,missionId:scope.missionId,attemptId,stageSealDigest,
  executionFingerprint:scope.executionFingerprint,recipeFingerprint,imageDigest,
  runnerCreationToken:prepare.creationToken,retainedRunnerObject:'runner-owned-1',
  workerJobObject:'worker-job-1'};
const held={ownerEpoch,missionId:scope.missionId,attemptId,stageSealDigest,
  executionFingerprint:scope.executionFingerprint,runnerCreationToken:prepare.creationToken,
  h0Identity:prepare.h0Identity,sourceProcessCoordinate:'123456789',
  state:'h0-control-suspended' as const};
const proof:F2H1H0PhysicalEvidence={
  originToken:prepare.creationToken,createdByRunnerObject:expected.retainedRunnerObject,
  duplicatedFromRunnerObject:expected.retainedRunnerObject,processObjectType:'process',
  handleRole:'h0-process',workerJobObject:expected.workerJobObject,
  imageDigest,stageSealDigest,recipeFingerprint,ownerEpoch,missionId:scope.missionId,attemptId,
  processRights:0x101000,h0Alive:true,threadSuspended:true,guardianJobMember:true,
  duplicatedH0HandleInheritable:false,inheritedGuardianHandle:false,inheritedControlHandle:false,
};
function fixture(options:{
  readonly onEvent?:(event:string,tx:ReturnType<typeof createF2H1OneAttemptTransaction>)=>void;
  readonly claimOk?:boolean;
  readonly mutateWire?:(role:'desktop'|'runner',frame:F2H1ControlV2Frame)=>unknown;
  readonly stallRunnerAck?:boolean;
}={}){
  const events:string[]=[];const d2r:Uint8Array[]=[],r2d:Uint8Array[]=[];
  let tx:ReturnType<typeof createF2H1OneAttemptTransaction>|undefined;
  const emit=(event:string)=>{events.push(event);if(tx)options.onEvent?.(event,tx);};
  const ports={
    admission:{
      claimNativePreparation:vi.fn((_scope:PrivateMvpMissionScope,_attempt:string,_epoch:string,_stage:string)=>{
        emit('claim+PENDING+audit');return options.claimOk===false?{ok:false as const,error:undefined as never}:{ok:true as const,value:undefined};
      }),
      markNativeCleanupUnknown:vi.fn(()=>{emit('cleanup-unknown+charge-retained');return {ok:true as const,value:undefined};}),
    },
    os:{
      createSuspendedRunner:vi.fn(async()=>{emit('guardian+Runner-created-suspended');}),
      armGuardian:vi.fn(async()=>{emit('guardian-watchdog-armed');}),
      armIo:vi.fn(async()=>{emit('pipe-io-armed');}),
      resumeRunnerControl:vi.fn(async()=>{emit('Runner-control-resumed');}),
      createHeldH0:vi.fn(async()=>{emit('H0-created-suspended');return held;}),
      duplicateAndInspectOwnedH0:vi.fn((coordinate:string)=>{
        emit('Desktop-duplicate-inspected');return {sourceProcessCoordinate:coordinate,proof};
      }),
      resumeH0Control:vi.fn(()=>{emit('H0-control-resumed');}),
      stopExactAttempt:vi.fn(async()=>{emit('exact-stop-requested');}),
    },
    pipe:{
      writeDesktop:vi.fn(async(frame:F2H1ControlV2Frame)=>{
        emit('Desktop-wrote-'+frame.kind);d2r.push(Buffer.from(JSON.stringify(options.mutateWire?.('desktop',frame)??frame)));
      }),
      writeRunner:vi.fn(async(frame:F2H1ControlV2Frame)=>{
        emit('Runner-wrote-'+frame.kind);r2d.push(Buffer.from(JSON.stringify(options.mutateWire?.('runner',frame)??frame)));
      }),
      readRunner:vi.fn(async()=>{
        emit('Runner-read');if(options.stallRunnerAck&&d2r.length&&JSON.parse(Buffer.from(d2r[0]!).toString()).kind==='h0-ack')return new Promise<never>(()=>{});return d2r.shift();
      }),
      readDesktop:vi.fn(async()=>{emit('Desktop-read');return r2d.shift();}),
    },
    now:()=>0,
  };
  const transaction=createF2H1OneAttemptTransaction({scope,attemptId,ownerEpoch,stageSealDigest,
    expected,prepare,key,challenge,ownerDeadlineMs:12000,missionDeadlineMs:12000,
    leaseDeadlineMs:10000},ports);
  tx=transaction;
  return {transaction,ports,events,d2r,r2d};
}
describe('One H1 attempt — injected effects ONLY, no OS/Native launch',()=>{
  it('orders claimed one-attempt V2 handshake before one simulated H0 CONTROL resume, then retains cleanup charge',async()=>{
    const f=fixture();
    const outcome=await f.transaction.run();
    expect(outcome).toMatchObject({disposition:'CLEANUP_UNKNOWN',chargeRetained:true,
      h0ControlResumed:true,workerResumed:false});
    expect(f.events).toEqual([
      'claim+PENDING+audit','guardian+Runner-created-suspended','guardian-watchdog-armed',
      'pipe-io-armed','Runner-control-resumed','Desktop-wrote-prepare','Runner-read',
      'H0-created-suspended','Runner-wrote-h0-owned','Desktop-read','Desktop-duplicate-inspected',
      'Desktop-wrote-h0-ack','Runner-read','H0-control-resumed','exact-stop-requested',
      'cleanup-unknown+charge-retained',
    ]);
    expect(f.ports.os.resumeH0Control).toHaveBeenCalledTimes(1);
    expect(f.ports.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
  });

  it('refuses admission/audit failure before ANY simulated OS creation and remains one use',async()=>{
    const f=fixture({claimOk:false});
    const result=await f.transaction.run();
    expect(result).toMatchObject({disposition:'CLEANUP_UNKNOWN',chargeRetained:true,
      h0ControlResumed:false,workerResumed:false});
    expect(f.ports.os.createSuspendedRunner).not.toHaveBeenCalled();
    expect(f.ports.os.armGuardian).not.toHaveBeenCalled();
    expect(f.ports.os.stopExactAttempt).not.toHaveBeenCalled();
    expect(f.ports.os.resumeH0Control).not.toHaveBeenCalled();
    await expect(f.transaction.run()).rejects.toThrow('F2_H1_ONE_ATTEMPT_ONE_USE');
  });
  it('interrupts at every pre-resume stage and fences out a delayed ACK or resumed H0',async()=>{
    const stages=[
      'claim+PENDING+audit','guardian+Runner-created-suspended',
      'guardian-watchdog-armed','pipe-io-armed','Runner-control-resumed',
      'Desktop-wrote-prepare','Runner-read','H0-created-suspended',
      'Runner-wrote-h0-owned','Desktop-read','Desktop-duplicate-inspected',
      'Desktop-wrote-h0-ack',
    ];
    for(const stage of stages){
      let interrupted=false;
      const f=fixture({onEvent:(event,tx)=>{
        if(event===stage&&!interrupted){interrupted=true;tx.stop('owner-lost');}
      }});
      const result=await f.transaction.run();
      expect(result.disposition,stage).toBe('CLEANUP_UNKNOWN');
      expect(result.chargeRetained,stage).toBe(true);
      expect(f.ports.os.resumeH0Control,stage).not.toHaveBeenCalled();
      expect(f.ports.admission.markNativeCleanupUnknown,stage).toHaveBeenCalledTimes(1);
      if(stage!=='claim+PENDING+audit')
        expect(f.ports.os.stopExactAttempt,stage).toHaveBeenCalledTimes(1);
    }
  });
  it('Desktop local ACK write without Runner read never resumes, then stop fences late completion',async()=>{
    let ackWritten!:()=>void;
    const signal=new Promise<void>(resolve=>{ackWritten=resolve;});
    const f=fixture({stallRunnerAck:true,onEvent:event=>{
      if(event==='Desktop-wrote-h0-ack')ackWritten();
    }});
    const running=f.transaction.run();
    await signal;
    expect(f.events).toContain('Desktop-wrote-h0-ack');
    expect(f.ports.os.resumeH0Control).not.toHaveBeenCalled();
    f.transaction.stop('io-cancelled');
    const result=await running;
    expect(result).toMatchObject({disposition:'CLEANUP_UNKNOWN',
      chargeRetained:true,h0ControlResumed:false,workerResumed:false});
    expect(f.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
  });
  it('rejects forged ACK, V1 frame and skipped V2 sequence without a simulated control resume',async()=>{
    for(const change of [
      (frame:F2H1ControlV2Frame)=>({...frame,mac:'0'.repeat(64)}),
      (frame:F2H1ControlV2Frame)=>({...frame,revision:'f2-h1-control-v1'}),
      (frame:F2H1ControlV2Frame)=>({...frame,sequence:frame.sequence+1}),
      (frame:F2H1ControlV2Frame)=>({...frame,attemptId:'attempt-stale'}),
      (frame:F2H1ControlV2Frame)=>({...frame,payload:{creationToken:'other',h0Identity:'h0-1'}}),
    ]){
      const f=fixture({mutateWire:(role,frame)=>
        role==='desktop'&&frame.kind==='h0-ack'?change(frame):frame});
      const result=await f.transaction.run();
      expect(result.h0ControlResumed).toBe(false);
      expect(result.chargeRetained).toBe(true);
      expect(f.ports.os.resumeH0Control).not.toHaveBeenCalled();
    }
  });
  it('halts for absent H0 creation/invalid synthetic source, missing duplicate or failed journal',async()=>{
    const lost=fixture();
    lost.ports.os.createHeldH0.mockResolvedValue({...held,sourceProcessCoordinate:'0'});
    expect((await lost.transaction.run()).h0ControlResumed).toBe(false);
    const badProof=fixture();
    badProof.ports.os.duplicateAndInspectOwnedH0.mockReturnValue({
      sourceProcessCoordinate:held.sourceProcessCoordinate,
      proof:{...proof,guardianJobMember:false},
    });
    expect((await badProof.transaction.run()).h0ControlResumed).toBe(false);
    const throwProof=fixture();
    throwProof.ports.os.duplicateAndInspectOwnedH0.mockImplementation(()=>{throw Error('DUPLICATE_FAILED');});
    expect((await throwProof.transaction.run()).chargeRetained).toBe(true);
    expect(throwProof.ports.os.resumeH0Control).not.toHaveBeenCalled();
    const failedMark=fixture();
    failedMark.ports.admission.markNativeCleanupUnknown.mockImplementation(()=>{throw Error('AUDIT_UNAVAILABLE');});
    const result=await failedMark.transaction.run();
    expect(result).toMatchObject({disposition:'CLEANUP_UNKNOWN',chargeRetained:true,
      fullH1Cleaned:false,h0ControlResumed:true});
    expect(failedMark.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
  });

  it('times out a stuck fake IO read at one absolute 5s transaction deadline',async()=>{
    vi.useFakeTimers();
    try{
      const f=fixture();
      f.ports.pipe.readRunner.mockImplementation(()=>new Promise<never>(()=>{}));
      const resultPromise=f.transaction.run();
      const asserted=expect(resultPromise).resolves.toMatchObject({
        disposition:'CLEANUP_UNKNOWN',chargeRetained:true,
        h0ControlResumed:false,workerResumed:false,
      });
      await vi.advanceTimersByTimeAsync(5001);
      await asserted;
      expect(f.ports.os.resumeH0Control).not.toHaveBeenCalled();
      expect(f.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
      expect(f.ports.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
    }finally{vi.useRealTimers();}
  });
  it('late held-H0 creation completion after owner loss stays fenced and cannot retry',async()=>{
    let release!: (value:typeof held)=>void;
    let entered!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});
    const completion=new Promise<typeof held>(resolve=>{release=resolve;});
    const f=fixture();
    f.ports.os.createHeldH0.mockImplementation(async()=>{
      entered();return completion;
    });
    const running=f.transaction.run();
    await started;
    f.transaction.stop('owner-lost');
    release(held); // late completion cannot lead to a pending ACK or control resume
    const result=await running;
    expect(result.h0ControlResumed).toBe(false);
    expect(result.chargeRetained).toBe(true);
    expect(f.ports.os.resumeH0Control).not.toHaveBeenCalled();
    expect(f.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
    await expect(f.transaction.run()).rejects.toThrow('F2_H1_ONE_ATTEMPT_ONE_USE');
  });
  it('rejects a stale Mission/attempt binding before claim, and defensive snapshots deny post-construction mutation',async()=>{
    const ports=fixture().ports;
    expect(()=>createF2H1OneAttemptTransaction({
      scope:{...scope,workspaceGeneration:'generation-other'},attemptId,ownerEpoch,
      stageSealDigest,expected,prepare,key,challenge,
      ownerDeadlineMs:12000,missionDeadlineMs:12000,leaseDeadlineMs:10000,
    },ports)).toThrow('F2_H1_ONE_ATTEMPT_BINDING_INVALID');
    expect(ports.admission.claimNativePreparation).not.toHaveBeenCalled();
    const mutable={...scope};
    const runner=fixture();
    // The previous acceptance confirms that immutable V2 expected/prepare
    // are separate; the transaction also owns a copied admission scope.
    const input={scope:mutable,attemptId,ownerEpoch,stageSealDigest,
      expected:{...expected},prepare:{...prepare},key,challenge,
      ownerDeadlineMs:12000,missionDeadlineMs:12000,leaseDeadlineMs:10000};
    const candidate=createF2H1OneAttemptTransaction(input,runner.ports);
    mutable.missionId='forged-mission';
    input.expected.runnerCreationToken='forged-creation';
    input.prepare.creationToken='forged-creation';
    const result=await candidate.run();
    expect(result.h0ControlResumed).toBe(true);
    expect(runner.ports.admission.claimNativePreparation.mock.calls.at(-1)?.[0].missionId).toBe('mission-1');
  });
  it('R1 RED: thrown synthetic resume callback cannot be reported as confirmed H0 control resume',async()=>{
    const f=fixture();
    f.ports.os.resumeH0Control.mockImplementation(()=>{
      throw Error('SIMULATED_RESUME_OUTCOME_UNCERTAIN');
    });
    const result=await f.transaction.run();
    // A thrown effect may have partly executed; false means NOT CONFIRMED,
    // not that any physical OS control resume has been ruled out.
    expect(result).toMatchObject({
      disposition:'CLEANUP_UNKNOWN',
      chargeRetained:true,
      fullH1Cleaned:false,
      h0ControlResumed:false,
      workerResumed:false,
      reason:'SIMULATED_RESUME_OUTCOME_UNCERTAIN',
    });
    expect(f.ports.os.resumeH0Control).toHaveBeenCalledTimes(1);
    expect(f.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
    expect(f.ports.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
    expect(f.transaction.state()).toBe('quarantined');
    await expect(f.transaction.run()).rejects.toThrow('F2_H1_ONE_ATTEMPT_ONE_USE');
  });
  it('R1: synchronous owner-loss during an otherwise returning resume callback stays unconfirmed',async()=>{
    const f=fixture();
    f.ports.os.resumeH0Control.mockImplementation(()=>{
      // This local test-only callback may have touched something before
      // cancellation. Normal return after a synchronous fence is NOT success.
      f.transaction.stop('owner-lost');
    });
    const result=await f.transaction.run();
    expect(result).toMatchObject({
      disposition:'CLEANUP_UNKNOWN',
      chargeRetained:true,
      fullH1Cleaned:false,
      h0ControlResumed:false,
      workerResumed:false,
      reason:'owner-lost',
    });
    expect(f.ports.os.resumeH0Control).toHaveBeenCalledTimes(1);
    expect(f.ports.os.stopExactAttempt).toHaveBeenCalledTimes(1);
    expect(f.ports.admission.markNativeCleanupUnknown).toHaveBeenCalledTimes(1);
    expect(f.transaction.state()).toBe('quarantined');
    await expect(f.transaction.run()).rejects.toThrow('F2_H1_ONE_ATTEMPT_ONE_USE');
  });
  it('never exposes worker resume, native authorization, public runner.start or cleanup evidence',async()=>{
    const f=fixture();
    expect(f.transaction.nativeAuthorization).toBe(false);
    expect(f.transaction.readiness()).toBe(false);
    expect((await f.transaction.run()).fullH1Cleaned).toBe(false);
    expect('resumeWorker' in f.ports.os).toBe(false);
    expect('finishNativeCleanup' in f.ports.admission).toBe(false);
    const fs=await import('node:fs');
    const owner=fs.readFileSync('packages/infrastructure/src/private-mvp-desktop-runner-owner.ts','utf8');
    const runner=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-entry.ts','utf8');
    const watch=fs.readFileSync('packages/infrastructure/src/private-mvp-runner-control-watchdog.ts','utf8');
    const consent=fs.readFileSync('packages/infrastructure/src/private-mvp-pre-h1-diagnostic-activation.ts','utf8');
    const gateway=fs.readFileSync('packages/mcp-gateway/src/workspace-file-server.ts','utf8');
    expect(owner).toContain('F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED=false');
    expect(owner).toContain('F2_H1_B_H0_ACK_AND_LIVE_OWNER_NOT_INTEGRATED');
    expect(runner).toContain('F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED=false');
    expect(watch).toContain('F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED=false');
    expect(consent).toContain('PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED=false');
    expect(gateway).not.toContain("'runner.start'");
  });
});
