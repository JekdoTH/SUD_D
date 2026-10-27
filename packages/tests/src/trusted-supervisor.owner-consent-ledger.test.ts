import {describe,expect,it} from 'vitest';
import {syntacticExampleBundle} from './trusted-supervisor.owner-consent-model.js';
import {S1_REQUEST_SLOTS} from './trusted-supervisor.campaign-plan.js';
import {createInertLedger,recordSyntheticReview,recordSyntheticZero,
  redeemSyntheticCampaign,chargeSyntheticSlot,recordSyntheticStage,
  completeSyntheticCampaign,simulateSyntheticRestart,detachedZ4Recovery,
  revokeSyntheticLedger,type InertLedger,type LedgerStage} from './trusted-supervisor.owner-consent-ledger.js';
const H='a'.repeat(64),T='b'.repeat(64);
function init(){
  const result=createInertLedger(syntacticExampleBundle());
  if(!result.ok)throw Error(result.code);
  return result.ledger;
}
function must<T extends InertLedger>(r:{ok:true;ledger:T}|{ok:false;code:string}):T{
  if(!r.ok)throw Error(r.code);
  return r.ledger;
}
function checkedZero(ledger:InertLedger,id:'Z1'|'Z2'|'Z3'|'Z4'){
  return must(recordSyntheticZero(ledger,{id,assertion:'SATISFIED',expectedSequence:ledger.sequence}));
}
function reviewed(ledger:InertLedger,campaignId:'P0'|'P1'|'P2'|'P3'){
  return must(recordSyntheticReview(ledger,{campaignId,kind:'SYNTHETIC_REVIEW_ONLY',
    expectedSequence:ledger.sequence,atMs:250}));
}
function redeem(ledger:InertLedger,campaignId:'P0'|'P1'|'P2'|'P3',key=campaignId+'-receipt'){
  return redeemSyntheticCampaign(ledger,{campaignId,receiptId:key,sealDigest:ledger.sealDigest,
    expectedSequence:ledger.sequence,atMs:300});
}
function slot(ledger:InertLedger,id:'P0'|'P1'|'P2'|'P3',slotNo:number,
              key=id+'-request-'+slotNo){
  const s=S1_REQUEST_SLOTS[id][slotNo-1]!;
  return chargeSyntheticSlot(ledger,{campaignId:id,slot:slotNo,caseId:s.caseId,role:s.role,
    requestId:key,requestDigest:H,expectedSequence:ledger.sequence,atMs:400+slotNo});
}
function stage(ledger:InertLedger,id:string,kind:LedgerStage){
  return recordSyntheticStage(ledger,{requestId:id,kind,expectedSequence:ledger.sequence,atMs:500});
}
function allocateAll(ledger:InertLedger,id:'P0'|'P1'|'P2'|'P3'){
  for(let i=1;i<=S1_REQUEST_SLOTS[id].length;i++)ledger=must(slot(ledger,id,i));
  return ledger;
}
function completeP0Slot(ledger:InertLedger,n:number):InertLedger {
  const ref=S1_REQUEST_SLOTS.P0[n-1]!;
  const denial=(ref.caseId==='03'&&ref.role==='root')||
    (ref.caseId==='11'&&ref.role==='descendant'&&
      n===S1_REQUEST_SLOTS.P0.findIndex(s=>s.caseId==='11'&&s.role==='descendant')+1);
  const kinds:LedgerStage[]=denial
    ?['REQUEST_INTENT','CREATE_FAILED','OBSERVATION','AUDIT_RECORDED','TERMINAL']
    :ref.role==='root'
      ?['REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT','RELEASED',
        'OBSERVATION','ROOT_EXIT_OBSERVED','JOB_ZERO_OBSERVED',
        'READERS_JOINED','HANDLES_CLOSED','AUDIT_RECORDED','TERMINAL']
      :['REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT','RELEASED',
        'OBSERVATION','AUDIT_RECORDED','TERMINAL'];
  for(const kind of kinds)ledger=must(stage(ledger,'P0-request-'+n,kind));
  return ledger;
}
function finishP0Evidence(ledger:InertLedger) {
  for(let n=1;n<=S1_REQUEST_SLOTS.P0.length;n++)ledger=completeP0Slot(ledger,n);
  return ledger;
}
function faulted(ledger:InertLedger, campaign:'P1'|'P2'|'P3'){
  const targetRole=campaign==='P3'?'supervisor':'root';
  const roleIndex=S1_REQUEST_SLOTS[campaign].findIndex(s=>s.role===targetRole)+1;
  for(let n=1;n<=S1_REQUEST_SLOTS[campaign].length;n++)
    ledger=must(stage(ledger,campaign+'-request-'+n,'REQUEST_INTENT'));
  for(const kind of ['CREATED_HELD','RELEASE_INTENT','RELEASED'] as const)
    ledger=must(stage(ledger,campaign+'-request-'+roleIndex,kind));
  const event=campaign==='P1'?'FAULT_OUTPUT_FLOOD':
    campaign==='P2'?'FAULT_FIXTURE_AUDIT_LOSS':'FAULT_SUPERVISOR_DEATH';
  ledger=must(stage(ledger,campaign+'-request-'+roleIndex,event));
  return must(stage(ledger,campaign+'-request-'+roleIndex,'STOP_REQUIRED'));
}
function p0(){
  let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
  ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
  ledger=allocateAll(ledger,'P0');
  ledger=checkedZero(ledger,'Z3');
  ledger=finishP0Evidence(ledger);
  ledger=must(completeSyntheticCampaign(ledger,{campaignId:'P0',disposition:'CONCLUSIVE',
    cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',
    expectedSequence:ledger.sequence}));
  return checkedZero(ledger,'Z4');
}
describe('Option A in-memory ledger — NEVER native authority',()=>{
  it('F-A1-01 RED: 47 merely RESERVED slots never imply terminal evidence or real authority',()=>{
    let plan=checkedZero(checkedZero(init(),'Z1'),'Z2');
    plan=must(redeem(reviewed(plan,'P0'),'P0'));
    plan=allocateAll(plan,'P0');
    plan=checkedZero(plan,'Z3');
    const original=plan;
    expect(completeSyntheticCampaign(plan,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',
      expectedSequence:plan.sequence})).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
    expect(plan).toBe(original);
    expect(plan.slots.every(s=>s.stage==='RESERVED')).toBe(true);
    expect(plan.launchAllowed).toBe(false);
    expect(plan.trust).toBe('UNVERIFIED');
    expect(plan.authority).toBe('MISSING');
  });

  it('F-A1-01 RED: partial, unaudited and arbitrarily claimed negative completion deny',()=>{
    let plan=checkedZero(checkedZero(init(),'Z1'),'Z2');
    plan=must(redeem(reviewed(plan,'P0'),'P0'));
    plan=allocateAll(plan,'P0');
    plan=checkedZero(plan,'Z3');
    const claim=()=>completeSyntheticCampaign(plan,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',
      expectedSequence:plan.sequence});
    for(const kind of ['REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT',
      'RELEASED','OBSERVATION','AUDIT_RECORDED'] as const){
      plan=must(stage(plan,'P0-request-1',kind));
      expect(claim()).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
    }
    expect(plan.slots[1]?.stage).toBe('RESERVED');
    expect(plan.launchAllowed).toBe(false);
  });

  it('F-A1-02 RED: missing Z4 or P0 proof cannot issue recovery-copy assertion',()=>{
    const base=init();
    const z1=checkedZero(base,'Z1');
    const z2=checkedZero(z1,'Z2');
    let active=must(redeem(reviewed(z2,'P0'),'P0'));
    active=allocateAll(active,'P0');
    const z3=checkedZero(active,'Z3');
    for(const incomplete of [base,z1,z2,active,z3]){
      expect(detachedZ4Recovery(incomplete)).toMatchObject({ok:false});
      expect(incomplete.launchAllowed).toBe(false);
    }
    expect(detachedZ4Recovery(null as never)).toMatchObject({ok:false});
    expect(detachedZ4Recovery({...z3,zeroCases:['Z1','Z2','Z3','Z4']} as never))
      .toMatchObject({ok:false});
  });

  it('F-A1-01: only a complete audited synthetic P0 terminal trail can close',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=allocateAll(ledger,'P0');
    ledger=checkedZero(ledger,'Z3');
    ledger=finishP0Evidence(ledger);
    expect(ledger.slots.every(s=>s.stage==='TERMINAL')).toBe(true);
    expect(ledger.slots.filter(s=>s.provenance.includes('CREATE_FAILED'))).toHaveLength(2);
    const result=completeSyntheticCampaign(ledger,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',expectedSequence:ledger.sequence});
    expect(result).toMatchObject({ok:true,ledger:{trust:'UNVERIFIED',authority:'MISSING',
      launchAllowed:false,results:{P0:'CONCLUSIVE'}}});
  });

  it('F-A1-01: synthetic root cleanup needs separate exit, Job-zero, I/O join and handle-close markers',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=allocateAll(ledger,'P0');
    const rootIndex=S1_REQUEST_SLOTS.P0.findIndex(s=>s.caseId==='01'&&s.role==='root')+1;
    const requestId='P0-request-'+rootIndex;
    for(const kind of ['REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT',
      'RELEASED','OBSERVATION'] as const) ledger=must(stage(ledger,requestId,kind));
    expect(stage(ledger,requestId,'AUDIT_RECORDED')).toMatchObject({
      ok:false,code:'OUT_OF_ORDER'});
    for(const kind of ['ROOT_EXIT_OBSERVED','JOB_ZERO_OBSERVED',
      'READERS_JOINED','HANDLES_CLOSED','AUDIT_RECORDED','TERMINAL'] as const)
      ledger=must(stage(ledger,requestId,kind));
    expect(ledger.slots[rootIndex-1]?.stage).toBe('TERMINAL');
    expect(ledger.launchAllowed).toBe(false);
  });

  it('F-A1-01: unplanned failed create, missing audit, wrong case/role and forged terminal are denied',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=allocateAll(ledger,'P0');
    ledger=checkedZero(ledger,'Z3');
    ledger=must(stage(ledger,'P0-request-1','REQUEST_INTENT'));
    ledger=must(stage(ledger,'P0-request-1','CREATE_FAILED'));
    expect(stage(ledger,'P0-request-1','OBSERVATION')).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    expect(completeSyntheticCampaign(ledger,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',
      expectedSequence:ledger.sequence})).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
    const forged=structuredClone(ledger);
    (forged.slots[0]! as {stage:LedgerStage}).stage='TERMINAL';
    expect(completeSyntheticCampaign(forged,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',
      expectedSequence:ledger.sequence})).toMatchObject({ok:false});
    expect(recordSyntheticStage(ledger,{requestId:'P0-request-1',kind:'TERMINAL',
      expectedSequence:ledger.sequence,atMs:500,observation:{nativeVerified:true}}))
      .toMatchObject({ok:false});
  });

  it('F-A1-01: missing negative fault, wrong fault actor or unaudited intent cannot close P1',()=>{
    let ledger=p0();
    ledger=must(redeem(reviewed(ledger,'P1'),'P1'));
    ledger=allocateAll(ledger,'P1');
    const claims=()=>completeSyntheticCampaign(ledger,{campaignId:'P1',
      disposition:'EXPECTED_UNKNOWN',cleanup:'UNVERIFIED',assertion:'SATISFIED',
      expectedSequence:ledger.sequence});
    expect(claims()).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
    const wrong='P1-request-1'; // observer, not case 09 output actor
    ledger=must(stage(ledger,wrong,'REQUEST_INTENT'));
    ledger=must(stage(ledger,wrong,'CREATED_HELD'));
    ledger=must(stage(ledger,wrong,'RELEASE_INTENT'));
    ledger=must(stage(ledger,wrong,'RELEASED'));
    expect(stage(ledger,wrong,'FAULT_OUTPUT_FLOOD')).toMatchObject({
      ok:false,code:'OUT_OF_ORDER'});
    expect(claims()).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
  });

  it('F-A1-01: intended typed faults only, still UNKNOWN/quarantined with no native claims',()=>{
    let ledger=p0();
    for(const campaignId of ['P1','P2','P3'] as const){
      ledger=must(redeem(reviewed(ledger,campaignId),campaignId));
      ledger=allocateAll(ledger,campaignId);
      ledger=faulted(ledger,campaignId);
      const result=completeSyntheticCampaign(ledger,{campaignId,
        disposition:'EXPECTED_UNKNOWN',cleanup:'UNVERIFIED',assertion:'SATISFIED',
        expectedSequence:ledger.sequence});
      ledger=must(result);
      expect(ledger.quarantinedCampaigns).toContain(campaignId);
      expect(ledger.launchAllowed).toBe(false);
      expect(ledger.authority).toBe('MISSING');
    }
    expect(ledger.requested).toBe(65);
    expect(ledger.slots.filter(s=>s.role==='root')).toHaveLength(13);
    expect(ledger.slots.filter(s=>s.role==='descendant')).toHaveLength(22);
  });

  it('starts MISSING, does not recognize forged approval, token or arbitrary admission',()=>{
    const ledger=init();
    expect(ledger).toMatchObject({trust:'UNVERIFIED',authority:'MISSING',
      launchAllowed:false,globalRequestBudget:65,unallocatedCapacity:65,
      sequence:0,quarantinedCampaigns:[]});
    expect(Object.isFrozen(ledger)).toBe(true);
    expect('redeemNative' in ledger).toBe(false);
    expect(recordSyntheticReview(ledger,{campaignId:'P0',kind:'APPROVED',
      expectedSequence:0,atMs:250})).toMatchObject({ok:false});
    expect(recordSyntheticReview(ledger,{campaignId:'P0',kind:'SYNTHETIC_REVIEW_ONLY',
      expectedSequence:0,atMs:250,approved:true})).toMatchObject({ok:false});
    expect(redeem(ledger,'P0')).toMatchObject({ok:false});
    expect(redeemSyntheticCampaign(ledger,{campaignId:'P0',receiptId:'forged',
      sealDigest:ledger.sealDigest,expectedSequence:0,atMs:300,nativeReceipt:{signed:true}}))
      .toMatchObject({ok:false});
  });

  it('requires Z1/Z2 then model-only review and allocates P0 exactly once with optimistic head',()=>{
    const ledger=init();
    expect(redeem(reviewed(ledger,'P0'),'P0')).toMatchObject({ok:false,code:'ZERO_REQUIRED'});
    const zeros=checkedZero(checkedZero(ledger,'Z1'),'Z2');
    const candidate=reviewed(zeros,'P0');
    const oldHead=candidate.sequence;
    const first=must(redeem(candidate,'P0'));
    expect(first.unallocatedCapacity).toBe(18);
    expect(first.allocations.P0).toBe(47);
    expect(first.requested).toBe(0);
    expect(redeemSyntheticCampaign(first,{campaignId:'P0',receiptId:'another',
      sealDigest:first.sealDigest,expectedSequence:oldHead,atMs:300}))
      .toMatchObject({ok:false,code:'ALREADY_REDEEMED'});
    expect(redeem(first,'P0')).toMatchObject({ok:true,replayed:true});
    expect(redeem(first,'P0','conflict')).toMatchObject({ok:false,code:'ALREADY_REDEEMED'});
    expect(ledger.unallocatedCapacity).toBe(65);
  });

  it('burns request intent and failed creation, refuses second creation or conflicting key',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=must(slot(ledger,'P0',1,'myrequest'));
    expect(ledger.requested).toBe(1);
    expect(ledger.slots[0]).toMatchObject({stage:'RESERVED',requestId:'myrequest'});
    ledger=must(stage(ledger,'myrequest','REQUEST_INTENT'));
    ledger=must(stage(ledger,'myrequest','CREATE_FAILED'));
    expect(ledger.requested).toBe(1);
    expect(slot(ledger,'P0',1,'different')).toMatchObject({ok:false});
    expect(slot(ledger,'P0',1,'myrequest')).toMatchObject({ok:true,replayed:true});
    expect(chargeSyntheticSlot(ledger,{campaignId:'P1',slot:1,caseId:'BOOTSTRAP',
      role:'observer',requestId:'myrequest',requestDigest:T,expectedSequence:ledger.sequence,atMs:450}))
      .toMatchObject({ok:false,code:'REPLAY_CONFLICT'});
    expect(stage(ledger,'myrequest','CREATED_HELD')).toMatchObject({ok:false});
  });

  it('only accepts ordered held, release and audit stages; synthetic receipt never proves cleanup',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=must(slot(ledger,'P0',1));
    const requestId='P0-request-1';
    expect(stage(ledger,requestId,'RELEASED')).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    for(const kind of ['REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT','RELEASED',
      'OBSERVATION','AUDIT_RECORDED','TERMINAL'] as const)
      ledger=must(stage(ledger,requestId,kind));
    expect(ledger.slots[0]).toMatchObject({stage:'TERMINAL'});
    expect(ledger.launchAllowed).toBe(false);
    expect(recordSyntheticStage(ledger,{requestId,kind:'TERMINAL',
      expectedSequence:ledger.sequence,atMs:500,nativeProof:true})).toMatchObject({ok:false});
  });

  it('models all 65 global requests, four nontransferable packet allocations, P3 last',()=>{
    let ledger=p0();
    for(const campaignId of ['P1','P2','P3'] as const){
      ledger=must(redeem(reviewed(ledger,campaignId),campaignId));
      ledger=allocateAll(ledger,campaignId);
      ledger=faulted(ledger,campaignId);
      ledger=must(completeSyntheticCampaign(ledger,{campaignId,disposition:'EXPECTED_UNKNOWN',
        cleanup:'UNVERIFIED',assertion:'SATISFIED',expectedSequence:ledger.sequence}));
      expect(ledger.quarantinedCampaigns).toContain(campaignId);
    }
    expect(ledger.allocations).toEqual({P0:47,P1:6,P2:6,P3:6});
    expect(ledger.unallocatedCapacity).toBe(0);
    expect(ledger.requested).toBe(65);
    expect(ledger.slots.filter(s=>s.role==='root')).toHaveLength(13);
    expect(ledger.slots.filter(s=>s.role==='descendant')).toHaveLength(22);
    expect(ledger.launchAllowed).toBe(false);
    expect(redeem(ledger,'P3')).toMatchObject({ok:true,replayed:true});
  });

  it('demands P0 conclusive before later campaigns, Z4 detached copy cannot alter state',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    ledger=allocateAll(ledger,'P0');
    expect(redeem(ledger,'P1')).toMatchObject({ok:false});
    ledger=checkedZero(ledger,'Z3');
    const missing=completeSyntheticCampaign(ledger,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',expectedSequence:ledger.sequence});
    expect(missing).toMatchObject({ok:false,code:'EVIDENCE_INCOMPLETE'});
    ledger=finishP0Evidence(ledger);
    ledger=must(completeSyntheticCampaign(ledger,{campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',assertion:'SATISFIED',expectedSequence:ledger.sequence}));
    expect(redeem(ledger,'P1')).toMatchObject({ok:false});
    expect(detachedZ4Recovery(ledger)).toMatchObject({ok:false,code:'RECOVERY_INELIGIBLE'});
    ledger=checkedZero(ledger,'Z4');
    const before=ledger;
    const copy=detachedZ4Recovery(ledger);
    expect(copy).toEqual({source:'Z4_DETACHED_COPY',disposition:'UNKNOWN',
      trust:'UNVERIFIED',launchAllowed:false,authority:'MISSING'});
    expect(ledger).toBe(before);
    expect(ledger.quarantinedCampaigns).toEqual([]);
    expect(redeem(ledger,'P1')).toMatchObject({ok:false});
    expect(redeem(reviewed(ledger,'P1'),'P1')).toMatchObject({ok:true});
  });

  it('all crash prefixes, mismatched head/epoch, torn ledger and rollback quarantine permanently',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    const input=must(slot(ledger,'P0',1));
    const held=must(stage(must(stage(input,'P0-request-1','REQUEST_INTENT')),
      'P0-request-1','CREATED_HELD'));
    const released=must(stage(must(stage(held,'P0-request-1','RELEASE_INTENT')),
      'P0-request-1','RELEASED'));
    for(const state of [ledger,input,must(stage(input,'P0-request-1','REQUEST_INTENT')),
      held,released,must(stage(released,'P0-request-1','OBSERVATION'))]){
      const crash=simulateSyntheticRestart(state,{priorSequence:state.sequence,
        priorHead:state.headDigest,priorEpoch:state.epoch,mode:'CLEAN'});
      expect(crash.quarantined).toBe(true);
      expect(crash.ledger.globallyBlocked).toBe(true);
      expect(crash.ledger.launchAllowed).toBe(false);
      expect(slot(crash.ledger,'P0',2)).toMatchObject({ok:false,code:'QUARANTINED'});
    }
    for(const patch of [
      {priorHead:'f'.repeat(64)}, {priorSequence:ledger.sequence-1},
      {priorEpoch:'0'.repeat(32)}, {mode:'TORN'}, {mode:'ROLLBACK'},
    ]){
      const crash=simulateSyntheticRestart(ledger,{priorSequence:ledger.sequence,
        priorHead:ledger.headDigest,priorEpoch:ledger.epoch,mode:'CLEAN',...patch} as never);
      expect(crash.quarantined).toBe(true);
    }
  });

  it('revocation, fake native evidence, stale head, wrong campaign and hostile object deny',()=>{
    let ledger=checkedZero(checkedZero(init(),'Z1'),'Z2');
    ledger=must(redeem(reviewed(ledger,'P0'),'P0'));
    expect(slot(ledger,'P1',1)).toMatchObject({ok:false});
    expect(chargeSyntheticSlot(ledger,new Proxy({
      campaignId:'P0',slot:1,caseId:'BOOTSTRAP',role:'observer',
      requestId:'request',requestDigest:H,expectedSequence:ledger.sequence,atMs:401,
    },{ownKeys(){throw Error('trap');}}))).toMatchObject({ok:false});
    expect(chargeSyntheticSlot(ledger,{campaignId:'P0',slot:1,caseId:'BOOTSTRAP',
      role:'observer',requestId:'request',requestDigest:H,
      expectedSequence:ledger.sequence-1,atMs:401})).toMatchObject({ok:false,code:'STALE_HEAD'});
    ledger=must(revokeSyntheticLedger(ledger,{reason:'SYNTHETIC_REVOCATION',
      expectedSequence:ledger.sequence}));
    expect(ledger.globallyBlocked).toBe(true);
    expect(slot(ledger,'P0',1)).toMatchObject({ok:false,code:'QUARANTINED'});
    expect(ledger.launchAllowed).toBe(false);
  });
});
