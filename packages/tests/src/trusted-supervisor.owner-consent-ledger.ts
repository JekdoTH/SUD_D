/**
 * A1 Option A hypothetical immutable in-memory journal. All events, "review",
 * charges and successful observations are SYNTHETIC and USER-FORGEABLE.
 * They can NEVER be redeemed at an OS/native/Product approval interface.
 * No filesystem, issuer, secret, signing, launched process or protected store.
 */
import {createHash} from 'node:crypto';
import {createInertConsentBundle} from './trusted-supervisor.owner-consent-model.js';
import {buildInertCommitments} from './trusted-supervisor.owner-consent-codec.js';
import {S1_REQUEST_SLOTS,S1_CAMPAIGNS,S1_ZERO_CASES,
  type CampaignId,type ProofRole} from './trusted-supervisor.campaign-plan.js';
type Zero=typeof S1_ZERO_CASES[number];
export type LedgerStage='RESERVED'|'REQUEST_INTENT'|'CREATE_FAILED'|'CREATED_HELD'
  |'RELEASE_INTENT'|'RELEASED'|'STOP_REQUIRED'|'OBSERVATION'
  |'AUDIT_RECORDED'|'TERMINAL'|'UNKNOWN'
  |'FAULT_OUTPUT_FLOOD'|'FAULT_FIXTURE_AUDIT_LOSS'|'FAULT_SUPERVISOR_DEATH'
  |'ROOT_EXIT_OBSERVED'|'JOB_ZERO_OBSERVED'|'READERS_JOINED'|'HANDLES_CLOSED';
export interface LedgerSlot {
  readonly campaignId:CampaignId;readonly slot:number;readonly caseId:string;
  readonly role:ProofRole;readonly requestId:string;readonly requestDigest:string;
  readonly stage:LedgerStage;readonly provenance:readonly LedgerStage[];
  readonly atMs:number;
}
type CampaignDisposition='CONCLUSIVE'|'EXPECTED_UNKNOWN';
export interface InertLedger {
  readonly trust:'UNVERIFIED';readonly authority:'MISSING';readonly launchAllowed:false;
  readonly bundleId:string;readonly sealDigest:string;readonly epoch:string;
  readonly sequence:number;readonly headDigest:string;readonly generation:number;
  readonly globalRequestBudget:65;readonly allocations:Readonly<Record<CampaignId,number>>;
  readonly unallocatedCapacity:number;readonly requested:number;
  readonly reviewMarkers:readonly CampaignId[];
  readonly redeemed:Readonly<Partial<Record<CampaignId,string>>>;
  readonly slots:readonly LedgerSlot[];
  readonly zeroCases:readonly Zero[];
  readonly results:Readonly<Partial<Record<CampaignId,CampaignDisposition>>>;
  readonly quarantinedCampaigns:readonly CampaignId[];
  readonly activeCampaign:CampaignId|null;
  readonly globallyBlocked:boolean;
  readonly revoked:boolean;
}
type Denial='INVALID_SYNTHETIC_INPUT'|'STALE_HEAD'|'ZERO_REQUIRED'
  |'OUT_OF_ORDER'|'REVIEW_REQUIRED'|'REPLAY_CONFLICT'|'ALREADY_REDEEMED'
  |'CAMPAIGN_NOT_ACTIVE'|'QUARANTINED'|'EXPIRED'|'BUDGET_EXHAUSTED'
  |'UNKNOWN_REQUEST'|'INVALID_DISPOSITION'|'EVIDENCE_INCOMPLETE'|'RECOVERY_INELIGIBLE';
type Fail={readonly ok:false;readonly code:Denial};
type Good={readonly ok:true;readonly ledger:InertLedger;readonly replayed?:true};
const fail=(code:Denial):Fail=>({ok:false,code});
// A process-local identity check for *synthetic* snapshots, NOT a trust anchor.
// It prevents edited cloned inputs being mistaken for a reducer-produced state.
const modeledSnapshots=new WeakSet<InertLedger>();
const ids:readonly CampaignId[]=['P0','P1','P2','P3'];
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>=1&&x.length<=80
  &&/^[A-Za-z0-9_-]+$/.test(x);
const time=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const isCampaign=(x:unknown):x is CampaignId=>ids.includes(x as CampaignId);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>{
  if(v===null||typeof v!=='object'||Array.isArray(v))return false;
  if(Object.getPrototypeOf(v)!==Object.prototype)return false;
  const props=Reflect.ownKeys(v);
  return props.length===keys.length
    &&props.every(p=>typeof p==='string'&&keys.includes(p))
    &&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);
      return !!d&&d.enumerable&&Object.hasOwn(d,'value');});
};
function freeze<T>(input:T):T {
  if(input&&typeof input==='object'){
    for(const v of Object.values(input))freeze(v);
    Object.freeze(input);
  }
  return input;
}
function next(old:InertLedger,event:string,update:Partial<InertLedger>):InertLedger{
  const sequence=old.sequence+1;
  if(!Number.isSafeInteger(sequence))throw Error('SEQUENCE_OVERFLOW');
  const headDigest=createHash('sha256').update('SUDD-A1-SYNTHETIC-NOT-PROTECTED-v1')
    .update(old.headDigest).update(String(sequence)).update(event).digest('hex');
  const snapshot=freeze({...old,...update,sequence,headDigest});
  modeledSnapshots.add(snapshot);
  return snapshot;
}
export function createInertLedger(input:unknown):
  {readonly ok:true;readonly ledger:InertLedger}|Fail{
  try{
    const value=createInertConsentBundle(input);
    if(!value.ok)return fail('INVALID_SYNTHETIC_INPUT');
    // One detached validated snapshot is the source for both identity and seal;
    // a hostile original caller must not be reread between those decisions.
    const draft:Record<string,unknown>={...value.model};
    delete draft.trust;delete draft.authority;delete draft.launchAllowed;
    const commitments=buildInertCommitments(draft);
    if(!commitments.ok)return fail('INVALID_SYNTHETIC_INPUT');
    const ledger:InertLedger=freeze({
      trust:'UNVERIFIED',authority:'MISSING',launchAllowed:false,
      bundleId:value.model.bundleId,sealDigest:commitments.sealDigest,
      epoch:value.model.identity.authorityEpoch,
      sequence:0,headDigest:'0'.repeat(64),generation:1,
      globalRequestBudget:65,allocations:{P0:0,P1:0,P2:0,P3:0},
      unallocatedCapacity:65,requested:0,reviewMarkers:[] as CampaignId[],
      redeemed:{} as Partial<Record<CampaignId,string>>,slots:[] as LedgerSlot[],
      zeroCases:[] as Zero[],results:{} as Partial<Record<CampaignId,CampaignDisposition>>,
      quarantinedCampaigns:[] as CampaignId[],activeCampaign:null as CampaignId|null,
      globallyBlocked:false,revoked:false,
    });
    modeledSnapshots.add(ledger);
    return {ok:true,ledger};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
function ready(plan:InertLedger){return !plan.revoked&&!plan.globallyBlocked;}
const guard=(input:Record<string,unknown>,expected:readonly string[])=>exact(input,expected);
export function recordSyntheticZero(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,['id','assertion','expectedSequence']))
      return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {id:Zero;assertion:string;expectedSequence:number};
    if(!S1_ZERO_CASES.includes(v.id)||v.assertion!=='SATISFIED'||!time(v.expectedSequence))
      return fail('INVALID_SYNTHETIC_INPUT');
    if(!ready(plan))return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    if(v.id!==S1_ZERO_CASES[plan.zeroCases.length])return fail('OUT_OF_ORDER');
    if((v.id==='Z1'||v.id==='Z2')&&plan.slots.length>0)return fail('OUT_OF_ORDER');
    if(v.id==='Z3'&&plan.slots.filter(s=>s.campaignId==='P0').length!==47)
      return fail('OUT_OF_ORDER');
    if(v.id==='Z4'&&plan.results.P0!=='CONCLUSIVE')return fail('OUT_OF_ORDER');
    return {ok:true,ledger:next(plan,'ZERO:'+v.id,{zeroCases:[...plan.zeroCases,v.id]})};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function recordSyntheticReview(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,
      ['campaignId','kind','expectedSequence','atMs']))return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {campaignId:CampaignId;kind:string;expectedSequence:number;atMs:number};
    if(!isCampaign(v.campaignId)||v.kind!=='SYNTHETIC_REVIEW_ONLY'||
       !time(v.expectedSequence)||!time(v.atMs))return fail('INVALID_SYNTHETIC_INPUT');
    if(!ready(plan)||plan.quarantinedCampaigns.includes(v.campaignId))
      return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    if(plan.reviewMarkers.includes(v.campaignId))return fail('REPLAY_CONFLICT');
    if(v.campaignId!=='P0'){
      const previous=ids[ids.indexOf(v.campaignId)-1]!;
      if(!plan.results[previous]||(previous==='P0'&&
        (!plan.zeroCases.includes('Z4')||plan.results.P0!=='CONCLUSIVE')))
        return fail('REVIEW_REQUIRED');
    }
    return {ok:true,ledger:next(plan,'SYNTHETIC_REVIEW:'+v.campaignId,
      {reviewMarkers:[...plan.reviewMarkers,v.campaignId]})};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function redeemSyntheticCampaign(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,
      ['campaignId','receiptId','sealDigest','expectedSequence','atMs']))
      return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {campaignId:CampaignId;receiptId:string;sealDigest:string;
      expectedSequence:number;atMs:number};
    if(!isCampaign(v.campaignId)||!id(v.receiptId)||!hash(v.sealDigest)
      ||!time(v.expectedSequence)||!time(v.atMs))return fail('INVALID_SYNTHETIC_INPUT');
    if(v.sealDigest!==plan.sealDigest)return fail('REPLAY_CONFLICT');
    // Replay is lookup only; even a matching fake receipt cannot mint a ticket.
    const previous=plan.redeemed[v.campaignId];
    if(previous)return previous===v.receiptId?{ok:true,ledger:plan,replayed:true}
      :fail('ALREADY_REDEEMED');
    if(!ready(plan)||plan.quarantinedCampaigns.includes(v.campaignId))
      return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    if(v.campaignId==='P0'&&
      (!plan.zeroCases.includes('Z1')||!plan.zeroCases.includes('Z2')))
      return fail('ZERO_REQUIRED');
    if(!plan.reviewMarkers.includes(v.campaignId))return fail('REVIEW_REQUIRED');
    if(plan.activeCampaign!==null)return fail('OUT_OF_ORDER');
    const index=ids.indexOf(v.campaignId);
    if(index>0){
      const last=ids[index-1]!;
      if(!plan.results[last]||!plan.quarantinedCampaigns.includes(last)&&last!=='P0'
        ||(last==='P0'&&(!plan.zeroCases.includes('Z4')
          ||plan.results.P0!=='CONCLUSIVE')))return fail('REVIEW_REQUIRED');
    }
    const needed=S1_CAMPAIGNS[index]!.total;
    if(needed>plan.unallocatedCapacity)return fail('BUDGET_EXHAUSTED');
    return {ok:true,ledger:next(plan,'SYNTHETIC_ALLOCATION:'+v.campaignId,{
      allocations:{...plan.allocations,[v.campaignId]:needed},
      unallocatedCapacity:plan.unallocatedCapacity-needed,
      activeCampaign:v.campaignId,
      redeemed:{...plan.redeemed,[v.campaignId]:v.receiptId},
    })};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function chargeSyntheticSlot(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,
      ['campaignId','slot','caseId','role','requestId','requestDigest','expectedSequence','atMs']))
      return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {campaignId:CampaignId;slot:number;caseId:string;role:ProofRole;
      requestId:string;requestDigest:string;expectedSequence:number;atMs:number};
    if(!isCampaign(v.campaignId)||!time(v.slot)||!id(v.requestId)
       ||!hash(v.requestDigest)||!time(v.expectedSequence)||!time(v.atMs))
      return fail('INVALID_SYNTHETIC_INPUT');
    const previous=plan.slots.find(s=>s.requestId===v.requestId);
    if(previous)return previous.campaignId===v.campaignId&&previous.slot===v.slot
      &&previous.role===v.role&&previous.caseId===v.caseId
      &&previous.requestDigest===v.requestDigest
      ?{ok:true,ledger:plan,replayed:true}:fail('REPLAY_CONFLICT');
    if(!ready(plan)||plan.quarantinedCampaigns.includes(v.campaignId))
      return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    if(plan.activeCampaign!==v.campaignId)return fail('CAMPAIGN_NOT_ACTIVE');
    const own=plan.slots.filter(s=>s.campaignId===v.campaignId);
    const expected=S1_REQUEST_SLOTS[v.campaignId][own.length];
    if(!expected||v.slot!==own.length+1||v.role!==expected.role
      ||v.caseId!==expected.caseId)return fail('OUT_OF_ORDER');
    if(plan.requested>=65||own.length>=plan.allocations[v.campaignId])
      return fail('BUDGET_EXHAUSTED');
    return {ok:true,ledger:next(plan,'CHARGED:'+v.requestId,{
      requested:plan.requested+1,
      slots:[...plan.slots,{campaignId:v.campaignId,slot:v.slot,caseId:v.caseId,
        role:v.role,requestId:v.requestId,requestDigest:v.requestDigest,
        stage:'RESERVED',provenance:['RESERVED'],atMs:v.atMs}],
    })};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
// Fixed synthetic case semantics, not an OS-derived receipt or sign-off.
// Case 03's root cannot be created; the FIRST case-11 descendant request is
// the intentionally denied breakaway attempt, the second is an ordinary child.
const denialSlot11=S1_REQUEST_SLOTS.P0.findIndex(s=>
  s.caseId==='11'&&s.role==='descendant')+1;
function intentionalDenial(slot:LedgerSlot):boolean{
  return slot.campaignId==='P0'&&(
    (slot.caseId==='03'&&slot.role==='root')||
    (slot.caseId==='11'&&slot.role==='descendant'&&slot.slot===denialSlot11));
}
const normalTerminal:readonly LedgerStage[]=[
  'RESERVED','REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT',
  'RELEASED','OBSERVATION','AUDIT_RECORDED','TERMINAL',
];
const rootTerminal:readonly LedgerStage[]=[
  'RESERVED','REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT',
  'RELEASED','OBSERVATION','ROOT_EXIT_OBSERVED','JOB_ZERO_OBSERVED',
  'READERS_JOINED','HANDLES_CLOSED','AUDIT_RECORDED','TERMINAL',
];
const deniedTerminal:readonly LedgerStage[]=[
  'RESERVED','REQUEST_INTENT','CREATE_FAILED','OBSERVATION',
  'AUDIT_RECORDED','TERMINAL',
];
function exactTrail(actual:readonly LedgerStage[],expected:readonly LedgerStage[]):boolean{
  return actual.length===expected.length&&
    expected.every((kind,index)=>actual[index]===kind);
}
function p0TerminalEvidence(plan:InertLedger):boolean{
  const actual=plan.slots.filter(s=>s.campaignId==='P0');
  const expected=S1_REQUEST_SLOTS.P0;
  return plan.allocations.P0===47&&actual.length===47&&
    actual.every((s,i)=>{
      const slot=expected[i]!;
      return s.slot===i+1&&s.caseId===slot.caseId&&s.role===slot.role&&
        s.stage==='TERMINAL'&&
        exactTrail(s.provenance,intentionalDenial(s)?deniedTerminal:
          s.role==='root'?rootTerminal:normalTerminal);
    });
}
const faultKinds={
  P1:'FAULT_OUTPUT_FLOOD',
  P2:'FAULT_FIXTURE_AUDIT_LOSS',
  P3:'FAULT_SUPERVISOR_DEATH',
} as const;
function faultActor(slot:LedgerSlot,kind:LedgerStage):boolean{
  if(slot.campaignId==='P0')return false;
  return kind===faultKinds[slot.campaignId]&&
    slot.caseId===({P1:'09',P2:'10',P3:'13'} as const)[slot.campaignId]&&
    slot.role===(slot.campaignId==='P3'?'supervisor':'root');
}
function expectedUnknownEvidence(plan:InertLedger,campaign:Exclude<CampaignId,'P0'>):boolean{
  const rows=plan.slots.filter(s=>s.campaignId===campaign);
  const catalog=S1_REQUEST_SLOTS[campaign],fault=faultKinds[campaign];
  if(rows.length!==catalog.length||plan.allocations[campaign]!==catalog.length)return false;
  const hits=rows.filter(s=>s.provenance.includes(fault));
  return hits.length===1&&hits[0]!.stage==='STOP_REQUIRED'&&
    faultActor(hits[0]!,fault)&&
    exactTrail(hits[0]!.provenance,[
      'RESERVED','REQUEST_INTENT','CREATED_HELD','RELEASE_INTENT',
      'RELEASED',fault,'STOP_REQUIRED'])&&
    rows.every((s,i)=>s.slot===i+1&&s.caseId===catalog[i]!.caseId&&
      s.role===catalog[i]!.role&&s.provenance[0]==='RESERVED'&&
      s.provenance.includes('REQUEST_INTENT')&&
      !s.provenance.includes('CREATE_FAILED')&&
      !s.provenance.includes('UNKNOWN')&&
      (s===hits[0]||!s.provenance.some(k=>k.startsWith('FAULT_'))));
}

const transitions:Readonly<Record<LedgerStage,readonly LedgerStage[]>>={
  RESERVED:['REQUEST_INTENT','STOP_REQUIRED','UNKNOWN'],
  REQUEST_INTENT:['CREATE_FAILED','CREATED_HELD','UNKNOWN','STOP_REQUIRED'],
  CREATE_FAILED:['OBSERVATION'],CREATED_HELD:['RELEASE_INTENT','STOP_REQUIRED','UNKNOWN'],
  RELEASE_INTENT:['RELEASED','STOP_REQUIRED','UNKNOWN'],
  RELEASED:['OBSERVATION','STOP_REQUIRED','UNKNOWN',
    'FAULT_OUTPUT_FLOOD','FAULT_FIXTURE_AUDIT_LOSS','FAULT_SUPERVISOR_DEATH'],
  FAULT_OUTPUT_FLOOD:['STOP_REQUIRED'],
  FAULT_FIXTURE_AUDIT_LOSS:['STOP_REQUIRED'],
  FAULT_SUPERVISOR_DEATH:['STOP_REQUIRED'],
  STOP_REQUIRED:['OBSERVATION','UNKNOWN'],
  OBSERVATION:['ROOT_EXIT_OBSERVED','AUDIT_RECORDED','UNKNOWN'],
  ROOT_EXIT_OBSERVED:['JOB_ZERO_OBSERVED'],
  JOB_ZERO_OBSERVED:['READERS_JOINED'],
  READERS_JOINED:['HANDLES_CLOSED'],
  HANDLES_CLOSED:['AUDIT_RECORDED'],
  AUDIT_RECORDED:['TERMINAL','UNKNOWN'],TERMINAL:[],UNKNOWN:[],
};
export function recordSyntheticStage(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,
      ['requestId','kind','expectedSequence','atMs']))return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {requestId:string;kind:LedgerStage;expectedSequence:number;atMs:number};
    if(!id(v.requestId)||!time(v.expectedSequence)||!time(v.atMs)||
       !Object.hasOwn(transitions,v.kind))return fail('INVALID_SYNTHETIC_INPUT');
    if(!ready(plan))return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    const prior=plan.slots.find(s=>s.requestId===v.requestId);
    if(!prior)return fail('UNKNOWN_REQUEST');
    if(!transitions[prior.stage].includes(v.kind))return fail('OUT_OF_ORDER');
    if(prior.stage==='CREATE_FAILED'&&v.kind==='OBSERVATION'&&
      !intentionalDenial(prior))return fail('OUT_OF_ORDER');
    // Synthetic cleanup is four distinct ordered assertions for created roots;
    // no single OBSERVATION can shortcut job/readers/handles into an audit.
    if(prior.stage==='OBSERVATION'&&prior.role==='root'&&
      !intentionalDenial(prior)&&v.kind==='AUDIT_RECORDED')
      return fail('OUT_OF_ORDER');
    if(v.kind==='ROOT_EXIT_OBSERVED'&&
      (prior.role!=='root'||intentionalDenial(prior)))return fail('OUT_OF_ORDER');
    if(v.kind.startsWith('FAULT_')&&!faultActor(prior,v.kind))
      return fail('OUT_OF_ORDER');
    const quarantine=v.kind==='UNKNOWN';
    return {ok:true,ledger:next(plan,'SYNTHETIC_STAGE:'+v.kind+':'+v.requestId,{
      slots:plan.slots.map(s=>s===prior?{
        ...s,stage:v.kind,provenance:[...s.provenance,v.kind],
      }:s),
      globallyBlocked:plan.globallyBlocked||quarantine,
      quarantinedCampaigns:quarantine?
        [...plan.quarantinedCampaigns,prior.campaignId]:plan.quarantinedCampaigns,
    })};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function completeSyntheticCampaign(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,
      ['campaignId','disposition','cleanup','assertion','expectedSequence']))
      return fail('INVALID_SYNTHETIC_INPUT');
    const v=input as {campaignId:CampaignId;disposition:CampaignDisposition;
      cleanup:string;assertion:string;expectedSequence:number};
    if(!isCampaign(v.campaignId)||!time(v.expectedSequence)||
       !['CONCLUSIVE','EXPECTED_UNKNOWN'].includes(v.disposition)
       ||!['SYNTHETIC_COMPLETE','UNVERIFIED'].includes(v.cleanup)
       ||v.assertion!=='SATISFIED')return fail('INVALID_SYNTHETIC_INPUT');
    if(!modeledSnapshots.has(plan))return fail('INVALID_SYNTHETIC_INPUT');
    if(!ready(plan))return fail('QUARANTINED');
    if(v.expectedSequence!==plan.sequence)return fail('STALE_HEAD');
    if(plan.activeCampaign!==v.campaignId)return fail('CAMPAIGN_NOT_ACTIVE');
    if(plan.slots.filter(s=>s.campaignId===v.campaignId).length!==plan.allocations[v.campaignId])
      return fail('OUT_OF_ORDER');
    if(v.campaignId==='P0'){
      if(!plan.zeroCases.includes('Z3'))return fail('ZERO_REQUIRED');
      if(v.disposition!=='CONCLUSIVE'||v.cleanup!=='SYNTHETIC_COMPLETE')
        return fail('INVALID_DISPOSITION');
      if(!p0TerminalEvidence(plan))return fail('EVIDENCE_INCOMPLETE');
    } else {
      if(v.disposition!=='EXPECTED_UNKNOWN'||v.cleanup!=='UNVERIFIED')
        return fail('INVALID_DISPOSITION');
      if(!expectedUnknownEvidence(plan,v.campaignId))return fail('EVIDENCE_INCOMPLETE');
    }
    return {ok:true,ledger:next(plan,'CAMPAIGN_TERMINAL:'+v.campaignId,{
      activeCampaign:null,
      results:{...plan.results,[v.campaignId]:v.disposition},
      quarantinedCampaigns:v.disposition==='EXPECTED_UNKNOWN'
        ?[...plan.quarantinedCampaigns,v.campaignId]:plan.quarantinedCampaigns,
    })};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function detachedZ4Recovery(plan:InertLedger) {
  // This does not reconstruct real evidence: only a previously produced,
  // immutable, fully closed synthetic P0 state with a recorded Z4 is eligible.
  // WeakSet identity is a local shape/provenance guard, NEVER Owner consent.
  try {
    if(!plan||!modeledSnapshots.has(plan)||plan.globallyBlocked||plan.revoked||
      plan.activeCampaign!==null||plan.results.P0!=='CONCLUSIVE'||
      !p0TerminalEvidence(plan)||plan.zeroCases.length!==4||
      !S1_ZERO_CASES.every((z,i)=>plan.zeroCases[i]===z)||
      plan.quarantinedCampaigns.length!==0||plan.redeemed.P0===undefined)
      return fail('RECOVERY_INELIGIBLE');
    return Object.freeze({source:'Z4_DETACHED_COPY' as const,disposition:'UNKNOWN' as const,
      trust:'UNVERIFIED' as const,authority:'MISSING' as const,launchAllowed:false as const});
  } catch {return fail('RECOVERY_INELIGIBLE');}
}
export function revokeSyntheticLedger(plan:InertLedger,input:unknown):Good|Fail{
  try{
    if(!guard(input as Record<string,unknown>,['reason','expectedSequence'])
      ||(input as {reason:unknown}).reason!=='SYNTHETIC_REVOCATION'
      ||(input as {expectedSequence:unknown}).expectedSequence!==plan.sequence)
      return fail('INVALID_SYNTHETIC_INPUT');
    if(!ready(plan))return fail('QUARANTINED');
    return {ok:true,ledger:next(plan,'SYNTHETIC_REVOKE',{
      globallyBlocked:true,revoked:true,activeCampaign:null,
    })};
  }catch{return fail('INVALID_SYNTHETIC_INPUT');}
}
export function simulateSyntheticRestart(plan:InertLedger,observed:unknown):{
  readonly ledger:InertLedger;readonly quarantined:boolean;
}{
  // No file/OS IO: an in-memory snapshot cannot prove protected durability.
  // Every live reservation after restart becomes UNKNOWN and cannot relaunch.
  let invalid=true;
  try{
    if(exact(observed,['priorSequence','priorHead','priorEpoch','mode'])){
      const v=observed as {priorSequence:unknown;priorHead:unknown;priorEpoch:unknown;mode:unknown};
      invalid=!time(v.priorSequence)||v.priorSequence!==plan.sequence
        ||v.priorHead!==plan.headDigest||v.priorEpoch!==plan.epoch
        ||v.mode!=='CLEAN'||plan.activeCampaign!==null
        ||plan.slots.some(s=>s.stage!=='TERMINAL'&&s.stage!=='CREATE_FAILED');
    }
  }catch{invalid=true;}
  // Inert replay validation cannot establish a protected anti-rollback head.
  // Even a syntactically clean previous epoch is permanently quarantined.
  const copy=next(plan,'SYNTHETIC_RESTART_QUARANTINE',{
    globallyBlocked:true,
    quarantinedCampaigns:invalid&&plan.activeCampaign?
      [...new Set([...plan.quarantinedCampaigns,plan.activeCampaign])]:
      plan.quarantinedCampaigns,
    activeCampaign:null,
    epoch:'0'.repeat(32),generation:plan.generation+1,
  });
  // Even a fully closed in-memory state never confers launch rights.
  return Object.freeze({ledger:copy,quarantined:copy.globallyBlocked});
}
