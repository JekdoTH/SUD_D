import { describe, expect, it } from 'vitest';
import {
  S1_CAMPAIGNS, S1_LIMITS, S1_ZERO_CASES, S1_REQUEST_SLOTS,
  validateSyntheticBundleManifest, createSyntheticBundlePlan,
  reserveSyntheticRequest, recordSyntheticCreationFailure,
  recordSyntheticZeroCheck, completeSyntheticCampaign, syntheticRecoveryCopy,
  nextSyntheticCampaign, type SyntheticBundleManifest, type SyntheticBundlePlan,
  type SyntheticReservationInput,
} from './trusted-supervisor.campaign-plan.js';

const hash = 'a'.repeat(64);
const manifest: SyntheticBundleManifest = {
  version: 1, bundleId: 'bundle-test', bundleDigest: hash,
  issuedAtMs: 100, expiresAtMs: 10_000, rootBudget: 13,
  creationRequestBudget: 65, zeroCaseIds: ['Z1', 'Z2', 'Z3', 'Z4'],
  campaigns: [
    { id: 'P0', caseIds: ['01','02','03','04','05','06','07','08','11','12'],
      observer: 1, controller: 10, supervisor: 10, root: 10, descendant: 16, total: 47 },
    { id: 'P1', caseIds: ['09'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6 },
    { id: 'P2', caseIds: ['10'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6 },
    { id: 'P3', caseIds: ['13'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6 },
  ],
};

type Reservation = Parameters<typeof reserveSyntheticRequest>[1];
function reserve(plan: SyntheticBundlePlan, campaignId: 'P0'|'P1'|'P2'|'P3', slot: number, key = campaignId+'-'+slot) {
  const expected = S1_REQUEST_SLOTS[campaignId][slot - 1]!;
  return reserveSyntheticRequest(plan, {
    campaignId, slot, caseId: expected.caseId, role: expected.role,
    requestId: key, requestDigest: hash, atMs: 200 + slot,
  });
}
function allocateCampaign(plan: SyntheticBundlePlan, campaignId: 'P0'|'P1'|'P2'|'P3'): SyntheticBundlePlan {
  for (let slot = 1; slot <= S1_REQUEST_SLOTS[campaignId].length; slot++) {
    const result = reserve(plan, campaignId, slot);
    if (!result.ok) throw Error(result.code);
    plan = result.plan;
  }
  return plan;
}
function zero(plan: SyntheticBundlePlan, caseId: 'Z1'|'Z2'|'Z3'|'Z4') {
  const result = recordSyntheticZeroCheck(plan, { caseId, assertion: 'SATISFIED' });
  if (!result.ok) throw Error(result.code);
  return result.plan;
}
function complete(plan: SyntheticBundlePlan, campaignId: 'P0'|'P1'|'P2'|'P3',
                  disposition: 'CONCLUSIVE'|'EXPECTED_UNKNOWN'|'UNEXPECTED_UNKNOWN',
                  cleanup: 'SYNTHETIC_COMPLETE'|'UNVERIFIED' = 'UNVERIFIED',
                  assertion: 'SATISFIED'|'FAILED' = 'SATISFIED') {
  const result = completeSyntheticCampaign(plan, {
    campaignId, disposition, cleanup, negativeAssertion: assertion,
  });
  if (!result.ok) throw Error(result.code);
  return result.plan;
}
function p0() {
  let plan = createSyntheticBundlePlan(manifest);
  plan = zero(zero(plan, 'Z1'), 'Z2');
  plan = allocateCampaign(plan, 'P0');
  plan = zero(plan, 'Z3');
  return complete(plan, 'P0', 'CONCLUSIVE', 'SYNTHETIC_COMPLETE');
}
function afterP0() { return zero(p0(), 'Z4'); }
function afterP1() {
  const plan = allocateCampaign(afterP0(), 'P1');
  return complete(plan, 'P1', 'EXPECTED_UNKNOWN');
}
function afterP2() {
  const plan = allocateCampaign(afterP1(), 'P2');
  return complete(plan, 'P2', 'EXPECTED_UNKNOWN');
}

describe('Slice 2B S1 — pure synthetic campaign bundle (no authority)', () => {
  it('pins 17 scenarios, four immutable campaigns, correct role counts and zero checks', () => {
    expect(S1_ZERO_CASES).toEqual(['Z1','Z2','Z3','Z4']);
    expect(S1_CAMPAIGNS.map(c => [c.id,c.total,c.root])).toEqual([
      ['P0',47,10],['P1',6,1],['P2',6,1],['P3',6,1],
    ]);
    expect(S1_LIMITS).toEqual({
      observer: 4, controller: 13, supervisor: 13, root: 13, descendant: 22, total: 65,
    });
    expect(S1_REQUEST_SLOTS.P0).toHaveLength(47);
    expect(S1_REQUEST_SLOTS.P0[0]).toEqual({ caseId:'BOOTSTRAP',role:'observer' });
    expect(S1_REQUEST_SLOTS.P0.find(s => s.caseId === '03' && s.role === 'descendant')).toBeUndefined();
    expect(S1_REQUEST_SLOTS.P3.at(-1)).toEqual({caseId:'13',role:'descendant'});
    const cases = [...S1_CAMPAIGNS.flatMap(c => c.caseIds), ...S1_ZERO_CASES].sort();
    expect(cases).toEqual(['01','02','03','04','05','06','07','08','09','10','11','12','13','Z1','Z2','Z3','Z4']);
    expect(Object.isFrozen(S1_CAMPAIGNS)).toBe(true);
    expect(Object.isFrozen(S1_REQUEST_SLOTS.P0)).toBe(true);
  });

  it('validates a versioned, exact inert catalog without importing the legacy 13/62 plan', () => {
    expect(validateSyntheticBundleManifest(manifest)).toEqual({ok:true});
    expect(manifest.creationRequestBudget).toBe(65);
    expect('launch' in createSyntheticBundlePlan(manifest)).toBe(false);
    expect('authorize' in createSyntheticBundlePlan(manifest)).toBe(false);
    expect(createSyntheticBundlePlan(manifest).authority).toEqual({
      status:'MISSING',canLaunch:false,externalReviewRequired:true,
    });
    for (const changed of [
      {creationRequestBudget:62},{creationRequestBudget:64},{creationRequestBudget:66},
      {rootBudget:12},{version:2},{bundleDigest:'invalid'},{issuedAtMs:NaN},
      {expiresAtMs:Infinity},{issuedAtMs:Number.MAX_SAFE_INTEGER+1},
      {bundleId:'../../escape'},{approved:true},{cwd:'C:\\Temp'},
      {executable:'cmd.exe'},{argv:['/c','echo']},{env:{}},{token:'x'},{handles:[1]},
      {zeroCaseIds:['Z1','Z2','Z3','Z4','Z5']},
      {zeroCaseIds:['Z1','Z2','Z2','Z4']},
      {campaigns:[...manifest.campaigns].reverse()},
      {campaigns:manifest.campaigns.map((c,i)=>i===0?{...c,total:46}:c)},
      {campaigns:manifest.campaigns.map((c,i)=>i===0?{...c,caseIds:[...c.caseIds].reverse()}:c)},
      {campaigns:manifest.campaigns.map((c,i)=>i===0?{...c,caseIds:['13',...c.caseIds.slice(1)]}:c)},
    ]) expect(validateSyntheticBundleManifest({...manifest,...changed})).toEqual({ok:false,code:'INVALID_MANIFEST'});
  });

  it('rejects hostile object shapes, accessors, inherited fields and malformed request roles', () => {
    const bad = Object.defineProperty({...manifest},'secret',{value:'x',enumerable:false});
    expect(validateSyntheticBundleManifest(bad).ok).toBe(false);
    expect(validateSyntheticBundleManifest(Object.assign({...manifest},{[Symbol('x')]:'v'})).ok).toBe(false);
    expect(validateSyntheticBundleManifest(Object.create({...manifest})).ok).toBe(false);
    expect(validateSyntheticBundleManifest(Object.defineProperty({...manifest},'bundleId',{get(){throw Error('getter');}})).ok).toBe(false);
    expect(validateSyntheticBundleManifest(null).ok).toBe(false);
    expect(validateSyntheticBundleManifest([]).ok).toBe(false);
    expect(validateSyntheticBundleManifest({...manifest,campaigns:[Object.assign({...manifest.campaigns[0]}, {env:{}}),...manifest.campaigns.slice(1)]}).ok).toBe(false);
    const plan=createSyntheticBundlePlan(manifest);
    for (const hostile of [{role:'root'}, {caseId:'01'}, {slot:2},
      {requestDigest:'a'}, {atMs:Infinity}, {approved:true},{executable:'C:\\cmd.exe'}]) {
      const base:Reservation={campaignId:'P0',caseId:'BOOTSTRAP',role:'observer',
        slot:1,requestId:'key',requestDigest:hash,atMs:201};
      expect(reserveSyntheticRequest(plan,{...base,...hostile} as SyntheticReservationInput)).toMatchObject({ok:false});
    }
  });

  it('reserves precisely ordered P0 requests and burns failed creation without retry', () => {
    const original=createSyntheticBundlePlan(manifest);
    expect(reserve(original,'P0',2)).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    const first=reserve(zero(zero(original,'Z1'),'Z2'),'P0',1);
    if (!first.ok) throw Error(first.code);
    expect(first.plan.allocations).toHaveLength(1);
    expect(first.plan.remainingProofBudget).toBe(64);
    expect(Object.isFrozen(first.plan.allocations[0])).toBe(true);
    expect(reserve(first.plan,'P0',1)).toMatchObject({ok:true,replayed:true});
    expect(reserve(first.plan,'P0',1,'new-key')).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    expect(reserveSyntheticRequest(first.plan,{
      campaignId:'P0',caseId:'BOOTSTRAP',role:'observer',slot:1,
      requestId:'P0-1',requestDigest:'b'.repeat(64),atMs:201,
    })).toMatchObject({ok:false,code:'REPLAY_CONFLICT'});
    const failed=recordSyntheticCreationFailure(first.plan,'P0-1');
    if (!failed.ok) throw Error(failed.code);
    expect(failed.plan.allocations[0]?.creation).toBe('FAILED_CREATION');
    expect(failed.plan.remainingProofBudget).toBe(64);
    expect(recordSyntheticCreationFailure(failed.plan,'P0-1')).toMatchObject({ok:false,code:'ALREADY_CHARGED'});
    expect(reserve(failed.plan,'P0',2)).toMatchObject({ok:true});
    expect(original.allocations).toHaveLength(0);
  });

  it('protects zero-root Z1/Z2/Z3/Z4 order and detached immutable recovery check', () => {
    const plan=createSyntheticBundlePlan(manifest);
    expect(recordSyntheticZeroCheck(plan,{caseId:'Z4',assertion:'SATISFIED'})).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    expect(recordSyntheticZeroCheck(plan,{caseId:'Z2',assertion:'SATISFIED'})).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    expect(reserve(plan,'P0',1)).toMatchObject({ok:false,code:'ZERO_CHECK_REQUIRED'});
    const done=afterP0();
    expect(done.zeroChecks).toEqual(['Z1','Z2','Z3','Z4']);
    expect(recordSyntheticZeroCheck(done,{caseId:'Z4',assertion:'SATISFIED'})).toMatchObject({ok:false,code:'REPLAY_CONFLICT'});
    const copy=syntheticRecoveryCopy(done);
    expect(copy).toEqual({source:'P0',caseId:'Z4',syntheticOutcome:'UNKNOWN',canRelaunch:false,authority:'MISSING'});
    const clone=structuredClone(done);
    (clone.allocations[0]! as {requestId:string}).requestId='tampered-copy';
    expect(done.allocations[0]!.requestId).toBe('P0-1');
    expect(Object.isFrozen(done.zeroChecks)).toBe(true);
  });

  it('requires complete P0 synthetic evidence and Z4 before any P1 reservation', () => {
    const base=createSyntheticBundlePlan(manifest);
    expect(reserve(base,'P1',1)).toMatchObject({ok:false,code:'PRIOR_REVIEW_REQUIRED'});
    let incomplete=zero(zero(base,'Z1'),'Z2');
    incomplete=allocateCampaign(incomplete,'P0');
    expect(completeSyntheticCampaign(incomplete,{campaignId:'P0',disposition:'CONCLUSIVE',cleanup:'SYNTHETIC_COMPLETE',
      negativeAssertion:'SATISFIED'})).toMatchObject({ok:false,code:'ZERO_CHECK_REQUIRED'});
    expect(reserve(p0(),'P1',1)).toMatchObject({ok:false,code:'PRIOR_REVIEW_REQUIRED'});
    const next=nextSyntheticCampaign(afterP0());
    expect(next).toEqual({candidate:'P1',launchAllowed:false,requires:['FRESH_OWNER_ADMISSION','EXTERNAL_EVIDENCE_REVIEW']});
    expect(reserve(afterP0(),'P1',1)).toMatchObject({ok:true});
  });

  it('retains permanent UNKNOWN quarantine for P1/P2 and refuses global progression on unexpected evidence', () => {
    let state=afterP1();
    expect(state.campaignResults.P1).toEqual({
      disposition:'EXPECTED_UNKNOWN',cleanup:'UNVERIFIED',negativeAssertion:'SATISFIED',quarantined:true,
    });
    expect(reserve(state,'P1',1,'again')).toMatchObject({ok:false,code:'QUARANTINED'});
    expect(nextSyntheticCampaign(state)).toEqual({
      candidate:'P2',launchAllowed:false,requires:['FRESH_OWNER_ADMISSION','EXTERNAL_EVIDENCE_REVIEW'],
    });
    state=afterP2();
    expect(nextSyntheticCampaign(state).candidate).toBe('P3');
    state=allocateCampaign(state,'P3');
    state=complete(state,'P3','EXPECTED_UNKNOWN');
    expect(nextSyntheticCampaign(state).candidate).toBeNull();
    expect(state.campaignResults.P3?.quarantined).toBe(true);
    let failed=afterP0();
    failed=allocateCampaign(failed,'P1');
    failed=complete(failed,'P1','UNEXPECTED_UNKNOWN','UNVERIFIED','FAILED');
    expect(failed.globallyBlocked).toBe(true);
    expect(reserve(failed,'P2',1)).toMatchObject({ok:false,code:'QUARANTINED'});
  });

  it('will not turn expected UNKNOWN negative assertion into execution success or confirmed cleanup', () => {
    let plan=allocateCampaign(afterP0(),'P1');
    expect(completeSyntheticCampaign(plan,{campaignId:'P1',disposition:'CONCLUSIVE',
      cleanup:'SYNTHETIC_COMPLETE',negativeAssertion:'SATISFIED'})).toMatchObject({ok:false,code:'INVALID_OUTCOME'});
    plan=complete(plan,'P1','EXPECTED_UNKNOWN','UNVERIFIED');
    expect(plan.campaignResults.P1?.disposition).toBe('EXPECTED_UNKNOWN');
    expect(plan.campaignResults.P1?.cleanup).toBe('UNVERIFIED');
    expect(plan.authority.canLaunch).toBe(false);
    expect('nativeReceipt' in plan).toBe(false);
  });

  it('prevents missing, expired, replay-conflicting, or changed global request identity', () => {
    const plan=createSyntheticBundlePlan(manifest);
    const req:Reservation={campaignId:'P0',caseId:'BOOTSTRAP',role:'observer',
      slot:1,requestId:'unique',requestDigest:hash,atMs:150};
    expect(reserveSyntheticRequest(plan,{...req,atMs:10000})).toMatchObject({ok:false,code:'EXPIRED'});
    const one=reserveSyntheticRequest(zero(zero(plan,'Z1'),'Z2'),req);
    if (!one.ok) throw Error(one.code);
    expect(reserveSyntheticRequest(one.plan,{...req,campaignId:'P1'})).toMatchObject({ok:false,code:'REPLAY_CONFLICT'});
    expect(reserveSyntheticRequest(one.plan,{...req,requestId:'other',slot:1})).toMatchObject({ok:false,code:'OUT_OF_ORDER'});
    expect(one.plan.remainingProofBudget).toBe(64);
  });

  it('consumes the exact 65-slot bundle across four independent simulated campaigns', () => {
    let plan=afterP2();
    plan=allocateCampaign(plan,'P3');
    plan=complete(plan,'P3','EXPECTED_UNKNOWN');
    expect(plan.allocations).toHaveLength(65);
    expect(plan.remainingProofBudget).toBe(0);
    const roles=plan.allocations.reduce<Record<string,number>>((acc,row)=>{
      acc[row.role]=(acc[row.role]??0)+1; return acc;
    },{});
    expect(roles).toEqual({observer:4,controller:13,supervisor:13,root:13,descendant:22});
    expect(plan.allocations.filter(a=>a.campaignId==='P0')).toHaveLength(47);
    expect(plan.allocations.filter(a=>a.campaignId==='P1')).toHaveLength(6);
    expect(plan.allocations.filter(a=>a.campaignId==='P2')).toHaveLength(6);
    expect(plan.allocations.filter(a=>a.campaignId==='P3')).toHaveLength(6);
    expect(reserveSyntheticRequest(plan,{campaignId:'P3',slot:7,caseId:'13',role:'root',
      requestId:'P3-extra',requestDigest:hash,atMs:207}))
      .toMatchObject({ok:false,code:'QUARANTINED'});
    expect(plan.authority.canLaunch).toBe(false);
    expect(Object.isFrozen(plan.campaignResults.P3)).toBe(true);
  });

  it('stops on an unexpected P0 UNKNOWN and never treats missing cleanup as conclusive', () => {
    let plan=createSyntheticBundlePlan(manifest);
    plan=zero(zero(plan,'Z1'),'Z2');
    plan=allocateCampaign(plan,'P0');
    plan=zero(plan,'Z3');
    expect(completeSyntheticCampaign(plan,{
      campaignId:'P0',disposition:'CONCLUSIVE',
      cleanup:'UNVERIFIED',negativeAssertion:'SATISFIED',
    })).toMatchObject({ok:false,code:'INVALID_OUTCOME'});
    plan=complete(plan,'P0','UNEXPECTED_UNKNOWN','UNVERIFIED','FAILED');
    expect(plan.globallyBlocked).toBe(true);
    expect(recordSyntheticZeroCheck(plan,{caseId:'Z4',assertion:'SATISFIED'}))
      .toMatchObject({ok:false,code:'QUARANTINED'});
    expect(nextSyntheticCampaign(plan).candidate).toBeNull();
    expect(reserve(plan,'P1',1)).toMatchObject({ok:false,code:'QUARANTINED'});
  });

  it('charges case 03 invalid-executable root request and does not replenish budget', () => {
    let plan=createSyntheticBundlePlan(manifest);
    plan=zero(zero(plan,'Z1'),'Z2');
    const slots=S1_REQUEST_SLOTS.P0;
    const failedIndex=slots.findIndex(x=>x.caseId==='03' && x.role==='root');
    expect(failedIndex).toBeGreaterThan(0);
    for(let slot=1;slot<=failedIndex+1;slot++){
      const r=reserve(plan,'P0',slot);
      if(!r.ok)throw Error(r.code);
      plan=r.plan;
    }
    const id='P0-'+(failedIndex+1);
    const charged=recordSyntheticCreationFailure(plan,id);
    if(!charged.ok)throw Error(charged.code);
    expect(charged.plan.allocations[failedIndex]).toMatchObject({
      requestId:id,caseId:'03',role:'root',creation:'FAILED_CREATION',
    });
    expect(charged.plan.remainingProofBudget).toBe(65-(failedIndex+1));
    expect(reserve(charged.plan,'P0',failedIndex+1,'retry-create'))
      .toMatchObject({ok:false,code:'OUT_OF_ORDER'});
  });

  it('has no issuer, launcher, filesystem, network or process access by construction', async () => {
    const mod=await import('./trusted-supervisor.campaign-plan.js');
    expect(Object.keys(mod).some(k => /launch|createProcess|issueConsent|approve|redeem|startNative/i.test(k))).toBe(false);
    expect(createSyntheticBundlePlan(manifest).authority).toMatchObject({status:'MISSING',canLaunch:false});
    expect(Object.getOwnPropertyNames(globalThis)).not.toContain('S1_NATIVE_RUNNER');
  });
});
