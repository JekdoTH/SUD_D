import {describe,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {
  createF2H1EpochHeartbeatVerifier,
  F2H1_OS_OWNERSHIP_PROOF_AVAILABLE,
  F2H1_NATIVE_CREATION_GATE_OPEN,createF2H1Win32HostCalls,
} from '@sud-d/infrastructure';

const epoch='owner-epoch-test1',challenge='a'.repeat(64),secret=Buffer.alloc(32,13);
const role='desktop' as const;
const sign=(sequence:number,changes:Record<string,unknown>={})=>{
  const content=['F2H1-PEER-HEARTBEAT-V1',epoch,role,challenge,String(sequence)].join('|');
  return {...{ownerEpoch:epoch,role,challenge,sequence,
    mac:createHmac('sha256',secret).update(content).digest('hex')},...changes};
};
describe('H1 peer authenticated epoch wire (pure code; NOT independent OS proof)',()=>{
  it('accepts exact HMAC epoch, nonce, peer role and strictly increasing sequence',()=>{
    const verify=createF2H1EpochHeartbeatVerifier({
      ownerEpoch:epoch,peerRole:role,challenge,secret,
    });
    expect(verify(sign(1))).toBe(true);
    expect(verify(sign(2))).toBe(true);
    expect(verify(sign(2))).toBe(false);
    expect(verify(sign(1))).toBe(false);
  });
  it('denies forged, stale and cross-epoch or cross-role heartbeats',()=>{
    const verify=createF2H1EpochHeartbeatVerifier({ownerEpoch:epoch,peerRole:role,challenge,secret});
    for(const beat of [
      sign(1,{ownerEpoch:'wrong'}),
      sign(1,{role:'gateway'}),
      sign(1,{challenge:'b'.repeat(64)}),
      sign(1,{mac:'0'.repeat(64)}),
      sign(1,{mac:'ff'}),
      sign(1,{sequence:0}),
    ])expect(verify(beat as ReturnType<typeof sign>)).toBe(false);
    expect(verify(sign(1))).toBe(true);
  });
  it('fails before binding Win32 for missing secret, nonce or suspicious config',()=>{
    expect(()=>createF2H1EpochHeartbeatVerifier({
      ownerEpoch:epoch,peerRole:role,challenge:'0',secret,
    })).toThrow();
    expect(()=>createF2H1EpochHeartbeatVerifier({
      ownerEpoch:epoch,peerRole:role,challenge,secret:Buffer.alloc(8),
    })).toThrow();
  });
  it('mocked or caller-forged readiness flags cannot invoke the native-call factory',()=>{
    const callerProvided={
      gatewayJob:71n,admittedAttempt:{} as any,
      stageLeaseHeld:()=>true,ownerPeersArmed:()=>true,
    };
    expect(F2H1_NATIVE_CREATION_GATE_OPEN).toBe(false);
    expect(F2H1_OS_OWNERSHIP_PROOF_AVAILABLE).toBe(false);
    expect(()=>createF2H1Win32HostCalls(callerProvided))
      .toThrow('F2_H1_MISSING_NATIVE_STAGE_AND_INDEPENDENT_OWNER_PROOF');
  });
});
