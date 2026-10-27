import {describe,it,expect} from 'vitest';
import {createF2H1RunnerControlProtocol,createF2H1H0AckOrdering,
  createF2H1RunnerH0AckReceipt} from '../../infrastructure/src/private-mvp-h1-control-protocol.js';
import type {F2H1H0PhysicalEvidence,F2H1H0AckExpected} from '../../infrastructure/src/private-mvp-h1-control-protocol.js';

const ownerEpoch='desktop-epoch-1',missionId='mission-1',attemptId='attempt-1';
const stageSealDigest='a'.repeat(64),executionFingerprint='b'.repeat(64);
const recipeFingerprint='c'.repeat(64),imageDigest='d'.repeat(64);
const key=Buffer.alloc(32,31),challenge=Buffer.alloc(32,91);
const expected:F2H1H0AckExpected={ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
  recipeFingerprint,imageDigest,runnerCreationToken:'runner-created-h0-unique-01',
  retainedRunnerObject:'desktop-retained-runner-process-1',workerJobObject:'worker-job-1'};
const proof:F2H1H0PhysicalEvidence={
  originToken:expected.runnerCreationToken,createdByRunnerObject:expected.retainedRunnerObject,
  duplicatedFromRunnerObject:expected.retainedRunnerObject,processObjectType:'process',
  handleRole:'h0-process',workerJobObject:expected.workerJobObject,imageDigest,
  stageSealDigest,recipeFingerprint,ownerEpoch,missionId,attemptId,
  processRights:0x101000,h0Alive:true,threadSuspended:true,
  guardianJobMember:true,duplicatedH0HandleInheritable:false,
  inheritedGuardianHandle:false,inheritedControlHandle:false,
};
const pinned={ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
  runnerCreationToken:expected.runnerCreationToken,h0Identity:'runner-local-h0-identity-1',
  expectedAckSequence:1};
const held={ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,
  runnerCreationToken:pinned.runnerCreationToken,h0Identity:pinned.h0Identity,
  state:'h0-control-suspended' as const};
function fixture(options:{pinned?:typeof pinned;challenge?:Buffer}={}) {
  const secretChallenge=options.challenge??challenge;
  const desktop=createF2H1RunnerControlProtocol({
    ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,key,challenge:secretChallenge,localRole:'desktop'});
  const runner=createF2H1RunnerControlProtocol({
    ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,key,challenge:secretChallenge,localRole:'runner'});
  let sent:unknown;
  const issuer=createF2H1H0AckOrdering({
    protocol:desktop,expected,retainedRunnerEvidence:{duplicateAndInspectOwnedH0:()=>proof},
    authenticatedDesktopChannel:{send:async frame=>{sent=frame;}},
  });
  const receipt=createF2H1RunnerH0AckReceipt({protocol:runner,expected:options.pinned??pinned});
  return {desktop,runner,issuer,receipt,ack:async()=>{
    expect(await issuer.receive(runner.issue('runner','h0-owned',{}))).toBe('acknowledged');
    return sent;
  }};
}

describe('F2 H1 Runner H0 ACK receipt — pure code-only, never Native',()=>{
  it('rejects ACK before local held creation exists; send completion never implies receipt',async()=>{
    const f=fixture();
    const ack=await f.ack();
    expect(f.issuer.state()).toBe('acknowledged'); // local Desktop write only
    expect(f.receipt.state()).toBe('awaiting-held-creation');
    expect(f.receipt.readiness()).toBe(false);
    expect(f.receipt.receive(ack)).toBe('quarantined');
    expect(f.receipt.state()).toBe('quarantined');
    const correct=fixture();
    const frame=await correct.ack();
    expect(correct.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(correct.receipt.receive(frame)).toBe('ack-received-for-this-frozen-epoch');
    expect(correct.receipt.state()).toBe('ack-received-for-this-frozen-epoch');
    expect(correct.receipt.nativeAuthorization).toBe(false);
    expect(correct.receipt.readiness()).toBe(false);
  });

  it('rejects duplicate/replayed ACK even after a valid receive, and never resumes H0',async()=>{
    const f=fixture();
    const frame=await f.ack();
    expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(f.receipt.receive(frame)).toBe('ack-received-for-this-frozen-epoch');
    expect(f.receipt.receive(frame)).toBe('quarantined');
    expect(f.receipt.pinHeldCreation(held)).toBe('quarantined');
    expect(f.receipt.nativeAuthorization).toBe(false);
    expect(f.receipt.readiness()).toBe(false);
  });
  it('rejects authenticated wrong kind and non-exact Desktop sequence',async()=>{
    const wrongKind=fixture();
    expect(wrongKind.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(wrongKind.receipt.receive(wrongKind.desktop.issue('desktop','prepare',{})))
      .toBe('quarantined'); // valid MAC, wrong command
    const outOfOrder=fixture();
    expect(outOfOrder.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    outOfOrder.desktop.issue('desktop','prepare',{}); // ACK will be sequence 2, not expected 1
    expect(outOfOrder.receipt.receive(await outOfOrder.ack())).toBe('quarantined');
    const stale=fixture({pinned:{...pinned,expectedAckSequence:2}});
    expect(stale.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(stale.receipt.receive(await stale.ack())).toBe('quarantined');
  });
  it('rejects forged MAC, wrong role, stale epoch/attempt, payload, extra selectors and malformed frames',async()=>{
    const changes:Array<(frame:Record<string,unknown>)=>unknown>=[
      f=>({...f,mac:'0'.repeat(64)}),
      f=>({...f,role:'runner'}),
      f=>({...f,kind:'h0-owned'}),
      f=>({...f,epoch:'stale-epoch'}),
      f=>({...f,missionId:'other-mission'}),
      f=>({...f,attemptId:'other-attempt'}),
      f=>({...f,stageSealDigest:'0'.repeat(64)}),
      f=>({...f,executionFingerprint:'1'.repeat(64)}),
      f=>({...f,challenge:'2'.repeat(64)}),
      f=>({...f,sequence:0}),
      f=>({...f,payload:{pid:1234}}),
      f=>({...f,payload:{handle:456}}),
      f=>({...f,argv:['cmd']}),
      f=>({...f,osVerified:true}),
      f=>({...f,mac:null}),
      f=>({...f,payload:null}),
      f=>({...f,extra:'x'.repeat(4096)}),
      _=>null,
    ];
    for(const [i,alter] of changes.entries()){
      const f=fixture();
      const ack=await f.ack();
      expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
      expect(f.receipt.receive(alter(ack as Record<string,unknown>)),String(i))
        .toBe('quarantined');
      expect(f.receipt.readiness()).toBe(false);
    }
  });
  it('rejects wrong local H0 creation, identity, epoch, stage, and invented OS proof flags',()=>{
    const wrong:Array<unknown>=[
      null,{}, {...held,runnerCreationToken:'other-creation'},
      {...held,h0Identity:'other-h0'},
      {...held,ownerEpoch:'stale-epoch'},
      {...held,missionId:'stale-mission'},
      {...held,attemptId:'stale-attempt'},
      {...held,stageSealDigest:'0'.repeat(64)},
      {...held,executionFingerprint:'1'.repeat(64)},
      {...held,state:'h0-already-running'},
      {...held,osVerified:true},
      {...held,resumePermitted:true},
      {...held,handle:300}, // never accept a caller handle
      {...held,argv:[]},
    ];
    for(const [i,creation] of wrong.entries()){
      const f=fixture();
      expect(f.receipt.pinHeldCreation(creation),String(i)).toBe('quarantined');
      expect(f.receipt.pinHeldCreation(held)).toBe('quarantined');
      expect(f.receipt.nativeAuthorization).toBe(false);
    }
  });
  it('terminal-fences H0 exit, owner loss, lease expiry and IO cancellation, including after ACK',async()=>{
    for(const reason of ['h0-exited','owner-lost','lease-expired','io-cancelled'] as const){
      const pre=fixture();
      expect(pre.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
      expect(pre.receipt.fence(reason)).toBe('quarantined');
      expect(pre.receipt.receive(await pre.ack())).toBe('quarantined');
      const post=fixture();
      const ack=await post.ack();
      expect(post.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
      expect(post.receipt.receive(ack)).toBe('ack-received-for-this-frozen-epoch');
      expect(post.receipt.fence(reason)).toBe('quarantined');
      expect(post.receipt.receive(ack)).toBe('quarantined');
      expect(post.receipt.readiness()).toBe(false);
    }
  });
  it('copies its expected identity; caller mutations cannot alter the locally frozen epoch/creation/sequence',async()=>{
    const mutable={...pinned};
    const f=fixture({pinned:mutable});
    mutable.runnerCreationToken='forged';
    mutable.h0Identity='forged';
    mutable.ownerEpoch='forged';
    mutable.expectedAckSequence=999;
    expect(f.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(f.receipt.receive(await f.ack())).toBe('ack-received-for-this-frozen-epoch');
  });
  it('rejects foreign nonce replay, mismatched Runner channel and fake accept() implementations',async()=>{
    const local=fixture();
    const remote=fixture({challenge:Buffer.alloc(32,17)});
    expect(local.receipt.pinHeldCreation(held)).toBe('awaiting-ack');
    expect(local.receipt.receive(await remote.ack())).toBe('quarantined');
    const runner=createF2H1RunnerControlProtocol({
      ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,key,challenge,localRole:'runner'});
    expect(()=>createF2H1RunnerH0AckReceipt({
      protocol:runner,expected:{...pinned,missionId:'foreign-mission'},
    })).toThrow('F2_H1_RUNNER_ACK_CHANNEL_BINDING_MISMATCH');
    const desktop=createF2H1RunnerControlProtocol({
      ownerEpoch,missionId,attemptId,stageSealDigest,executionFingerprint,key,challenge,localRole:'desktop'});
    expect(()=>createF2H1RunnerH0AckReceipt({protocol:desktop,expected:pinned}))
      .toThrow('F2_H1_RUNNER_ACK_CHANNEL_BINDING_MISMATCH');
    expect(()=>createF2H1RunnerH0AckReceipt({
      protocol:{accept:()=>true},expected:pinned,
    })).toThrow('F2_H1_RUNNER_ACK_CHANNEL_BINDING_MISMATCH');
    expect(()=>createF2H1RunnerH0AckReceipt({
      protocol:runner,expected:{...pinned,expectedAckSequence:0},
    })).toThrow('F2_H1_RUNNER_ACK_EXPECTED_INVALID');
  });
});
