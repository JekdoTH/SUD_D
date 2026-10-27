/**
 * S1 offline, synthetic bundle catalog and accounting seam.
 * ZERO native authority: none of these functions can grant an approval,
 * redeem consent, launch a process, inspect the filesystem or attest OS proof.
 * The existing 13/62 single-campaign pure model remains separate and unchanged.
 */
export const S1_ZERO_CASES = Object.freeze(['Z1', 'Z2', 'Z3', 'Z4'] as const);
export type ZeroCase = typeof S1_ZERO_CASES[number];
export type CampaignId = 'P0' | 'P1' | 'P2' | 'P3';
export type ProofRole = 'observer' | 'controller' | 'supervisor' | 'root' | 'descendant';
export type BundleCase = '01'|'02'|'03'|'04'|'05'|'06'|'07'|'08'|'09'|'10'|'11'|'12'|'13';

const rows = [
  {id: 'P0', caseIds: ['01','02','03','04','05','06','07','08','11','12'],
    observer: 1, controller: 10, supervisor: 10, root: 10, descendant: 16, total: 47},
  {id: 'P1', caseIds: ['09'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6},
  {id: 'P2', caseIds: ['10'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6},
  {id: 'P3', caseIds: ['13'], observer: 1, controller: 1, supervisor: 1, root: 1, descendant: 2, total: 6},
] as const;
export const S1_CAMPAIGNS = Object.freeze(rows.map(row =>
  Object.freeze({...row, caseIds: Object.freeze([...row.caseIds])})));
export const S1_LIMITS = Object.freeze({
  observer: 4, controller: 13, supervisor: 13,
  root: 13, descendant: 22, total: 65,
});

export interface SyntheticCampaignManifest {
  readonly id: CampaignId;
  readonly caseIds: readonly string[];
  readonly observer: number;
  readonly controller: number;
  readonly supervisor: number;
  readonly root: number;
  readonly descendant: number;
  readonly total: number;
}
export interface SyntheticBundleManifest {
  readonly version: 1;
  readonly bundleId: string;
  readonly bundleDigest: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly rootBudget: 13;
  readonly creationRequestBudget: 65;
  readonly zeroCaseIds: readonly ZeroCase[];
  readonly campaigns: readonly SyntheticCampaignManifest[];
}
interface RequestSlot {readonly caseId: BundleCase | 'BOOTSTRAP';readonly role: ProofRole;}
function slotsFor(row: typeof S1_CAMPAIGNS[number]): readonly RequestSlot[] {
  const slots: RequestSlot[] = [{caseId:'BOOTSTRAP',role:'observer'}];
  for (const c of row.caseIds) {
    const caseId = c as BundleCase;
    slots.push({caseId,role:'controller'},{caseId,role:'supervisor'}, {caseId,role:'root'});
    if (caseId !== '03' && caseId !== '07') {
      slots.push({caseId,role:'descendant'},{caseId,role:'descendant'});
    }
  }
  return Object.freeze(slots.map(slot => Object.freeze(slot)));
}
export const S1_REQUEST_SLOTS: Readonly<Record<CampaignId, readonly RequestSlot[]>> =
  Object.freeze({
    P0: slotsFor(S1_CAMPAIGNS[0]!),
    P1: slotsFor(S1_CAMPAIGNS[1]!),
    P2: slotsFor(S1_CAMPAIGNS[2]!),
    P3: slotsFor(S1_CAMPAIGNS[3]!),
  });

const manifestKeys = ['version','bundleId','bundleDigest','issuedAtMs','expiresAtMs',
  'rootBudget','creationRequestBudget','zeroCaseIds','campaigns'] as const;
const campaignKeys = ['id','caseIds','observer','controller','supervisor','root','descendant','total'] as const;
const requestKeys = ['campaignId','caseId','role','slot','requestId','requestDigest','atMs'] as const;
const completionKeys = ['campaignId','disposition','cleanup','negativeAssertion'] as const;
const zeroKeys = ['caseId','assertion'] as const;
const validId = (v: unknown): v is string => typeof v === 'string'
  && v.length >= 1 && v.length <= 80 && /^[A-Za-z0-9_-]+$/.test(v);
const validDigest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const validClock = (v: unknown): v is number => typeof v === 'number'
  && Number.isSafeInteger(v) && v >= 0;
function exactObject(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  if (p !== Object.prototype && p !== null) return false;
  const own = Reflect.ownKeys(v);
  return own.length === keys.length && own.every(x => typeof x === 'string' && keys.includes(x))
    && keys.every(k => {
      const d = Object.getOwnPropertyDescriptor(v,k);
      return d !== undefined && d.enumerable && Object.hasOwn(d,'value');
    });
}
function exactArray(v: unknown, length: number): v is unknown[] {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype
    || v.length !== length || Reflect.ownKeys(v).length !== length + 1) return false;
  return Array.from({length},(_,i) => i).every(i => {
    const d = Object.getOwnPropertyDescriptor(v,String(i));
    return !!d && d.enumerable && Object.hasOwn(d,'value');
  });
}
export type BundleDenial = 'INVALID_MANIFEST'|'INVALID_INPUT'|'OUT_OF_ORDER'
  |'ZERO_CHECK_REQUIRED'|'PRIOR_REVIEW_REQUIRED'|'QUARANTINED'|'EXPIRED'
  |'REPLAY_CONFLICT'|'BUDGET_EXHAUSTED'|'ALREADY_CHARGED'|'INVALID_OUTCOME'
  |'UNKNOWN_REQUEST';
type Result<T> = {readonly ok:true;readonly plan:T;readonly replayed?:true}
  | {readonly ok:false;readonly code:BundleDenial};
const denied = (code:BundleDenial): {readonly ok:false;readonly code:BundleDenial} => ({ok:false,code});
export function validateSyntheticBundleManifest(v: unknown):
 {readonly ok:true}|{readonly ok:false;readonly code:'INVALID_MANIFEST'} {
  const invalid = {ok:false,code:'INVALID_MANIFEST'} as const;
  if (!exactObject(v,manifestKeys) || v.version !== 1 || !validId(v.bundleId)
    || !validDigest(v.bundleDigest) || !validClock(v.issuedAtMs)
    || !validClock(v.expiresAtMs) || v.expiresAtMs <= v.issuedAtMs
    || v.rootBudget !== 13 || v.creationRequestBudget !== 65
    || !exactArray(v.zeroCaseIds,4)
    || !S1_ZERO_CASES.every((z,i) => (v.zeroCaseIds as unknown[])[i] === z)
    || !exactArray(v.campaigns,4)) return invalid;
  for (const [index,row] of S1_CAMPAIGNS.entries()) {
    const candidate = v.campaigns[index];
    if (!exactObject(candidate,campaignKeys) || candidate.id !== row.id
      || !exactArray(candidate.caseIds,row.caseIds.length)
      || !row.caseIds.every((c,i) => (candidate.caseIds as unknown[])[i] === c)
      || !(['observer','controller','supervisor','root','descendant','total'] as const)
          .every(k => candidate[k] === row[k])) return invalid;
  }
  return {ok:true};
}
export interface SyntheticAllocation {
  readonly campaignId: CampaignId;
  readonly caseId: BundleCase | 'BOOTSTRAP';
  readonly role: ProofRole;
  readonly slot: number;
  readonly requestId: string;
  readonly requestDigest: string;
  readonly atMs: number;
  readonly creation: 'RESERVED'|'FAILED_CREATION';
}
export type SyntheticDisposition = 'CONCLUSIVE'|'EXPECTED_UNKNOWN'|'UNEXPECTED_UNKNOWN';
export interface SyntheticResult {
  readonly disposition: SyntheticDisposition;
  readonly cleanup: 'SYNTHETIC_COMPLETE'|'UNVERIFIED';
  readonly negativeAssertion: 'SATISFIED'|'FAILED';
  readonly quarantined: boolean;
}
export interface SyntheticBundlePlan {
  readonly manifest: SyntheticBundleManifest;
  readonly allocations: readonly SyntheticAllocation[];
  readonly remainingProofBudget: number;
  readonly zeroChecks: readonly ZeroCase[];
  readonly campaignResults: Readonly<Partial<Record<CampaignId,SyntheticResult>>>;
  readonly globallyBlocked: boolean;
  readonly authority: Readonly<{
    status:'MISSING';canLaunch:false;externalReviewRequired:true;
  }>;
}
function freezePlan(manifest:SyntheticBundleManifest,
                    allocations:readonly SyntheticAllocation[],zeros:readonly ZeroCase[],
                    results:Partial<Record<CampaignId,SyntheticResult>>,globallyBlocked:boolean):SyntheticBundlePlan {
  const canonicalManifest:SyntheticBundleManifest = Object.freeze({
    ...manifest,
    zeroCaseIds:Object.freeze([...manifest.zeroCaseIds]),
    campaigns:Object.freeze(manifest.campaigns.map(c=>Object.freeze({
      ...c,caseIds:Object.freeze([...c.caseIds]),
    }))),
  });
  return Object.freeze({
    manifest:canonicalManifest,
    allocations:Object.freeze(allocations.map(a=>Object.freeze({...a}))),
    remainingProofBudget:65-allocations.length,
    zeroChecks:Object.freeze([...zeros]),
    campaignResults:Object.freeze(Object.fromEntries(Object.entries(results).map(([k,v]) =>
      [k,Object.freeze({...v})])) as Partial<Record<CampaignId,SyntheticResult>>),
    globallyBlocked,
    authority:Object.freeze({status:'MISSING' as const,canLaunch:false as const,externalReviewRequired:true as const}),
  });
}
export function createSyntheticBundlePlan(m:SyntheticBundleManifest):SyntheticBundlePlan {
  if (!validateSyntheticBundleManifest(m).ok) throw Error('INVALID_SYNTHETIC_BUNDLE');
  return freezePlan(m,[],[],{},false);
}
const ids: readonly CampaignId[] = ['P0','P1','P2','P3'];
function isCampaign(v:unknown):v is CampaignId {
  return typeof v === 'string' && ids.some(x=>x===v);
}
function priorComplete(plan:SyntheticBundlePlan,id:CampaignId):boolean {
  if (id==='P0') return true;
  if (!plan.campaignResults.P0 || plan.campaignResults.P0.disposition!=='CONCLUSIVE'
      || !plan.zeroChecks.includes('Z4')) return false;
  if (id==='P1') return true;
  if (plan.campaignResults.P1?.disposition!=='EXPECTED_UNKNOWN'
      || plan.campaignResults.P1.negativeAssertion!=='SATISFIED') return false;
  if (id==='P2') return true;
  return plan.campaignResults.P2?.disposition==='EXPECTED_UNKNOWN'
      && plan.campaignResults.P2.negativeAssertion==='SATISFIED';
}
export interface SyntheticReservationInput {
  readonly campaignId:CampaignId;readonly caseId:BundleCase|'BOOTSTRAP';
  readonly role:ProofRole;readonly slot:number;
  readonly requestId:string;readonly requestDigest:string;readonly atMs:number;
}
export function reserveSyntheticRequest(
  plan:SyntheticBundlePlan,request:SyntheticReservationInput,
):Result<SyntheticBundlePlan> {
  if (!exactObject(request,requestKeys) || !validId(request.requestId)
    || !validDigest(request.requestDigest) || !validClock(request.atMs)
    || !isCampaign(request.campaignId) || !Number.isSafeInteger(request.slot)
    || request.slot<1) return denied('INVALID_INPUT');
  const previous = plan.allocations.find(a=>a.requestId===request.requestId);
  if (previous) return previous.campaignId===request.campaignId &&
    previous.caseId===request.caseId && previous.role===request.role &&
    previous.slot===request.slot && previous.requestDigest===request.requestDigest
    ? {ok:true,plan,replayed:true} : denied('REPLAY_CONFLICT');
  if (plan.globallyBlocked || plan.campaignResults[request.campaignId]?.quarantined)
    return denied('QUARANTINED');
  const own=plan.allocations.filter(a=>a.campaignId===request.campaignId);
  const expected = S1_REQUEST_SLOTS[request.campaignId][request.slot-1];
  if (!expected || request.slot!==own.length+1
    || request.role!==expected.role || request.caseId!==expected.caseId)
    return denied('OUT_OF_ORDER');
  if (request.atMs<plan.manifest.issuedAtMs || request.atMs>=plan.manifest.expiresAtMs)
    return denied('EXPIRED');
  if (request.campaignId==='P0' && (!plan.zeroChecks.includes('Z1') || !plan.zeroChecks.includes('Z2')))
    return denied('ZERO_CHECK_REQUIRED');
  if (!priorComplete(plan,request.campaignId)) return denied('PRIOR_REVIEW_REQUIRED');
  if (plan.remainingProofBudget<=0) return denied('BUDGET_EXHAUSTED');
  // Pure ledger charge, never a process-creation ticket or real reservation.
  return {ok:true,plan:freezePlan(plan.manifest,[...plan.allocations,{
    campaignId:request.campaignId,caseId:request.caseId,role:request.role,
    slot:request.slot,requestId:request.requestId,requestDigest:request.requestDigest,
    atMs:request.atMs,creation:'RESERVED',
  }],plan.zeroChecks,{...plan.campaignResults},plan.globallyBlocked)};
}
export function recordSyntheticCreationFailure(
  plan:SyntheticBundlePlan,requestId:string,
):Result<SyntheticBundlePlan> {
  if (!validId(requestId)) return denied('INVALID_INPUT');
  const index=plan.allocations.findIndex(a=>a.requestId===requestId);
  if (index<0) return denied('UNKNOWN_REQUEST');
  if (plan.allocations[index]!.creation==='FAILED_CREATION') return denied('ALREADY_CHARGED');
  return {ok:true,plan:freezePlan(plan.manifest,plan.allocations.map((a,i)=>
    i===index?{...a,creation:'FAILED_CREATION'}:a),
    plan.zeroChecks,{...plan.campaignResults},plan.globallyBlocked)};
}
export function recordSyntheticZeroCheck(
  plan:SyntheticBundlePlan,check:{readonly caseId:ZeroCase;readonly assertion:'SATISFIED'|'FAILED'},
):Result<SyntheticBundlePlan> {
  if (!exactObject(check,zeroKeys) ||
      !S1_ZERO_CASES.includes(check.caseId as ZeroCase) ||
      (check.assertion!=='SATISFIED' && check.assertion!=='FAILED'))
    return denied('INVALID_INPUT');
  if (plan.zeroChecks.includes(check.caseId)) return denied('REPLAY_CONFLICT');
  if (plan.globallyBlocked) return denied('QUARANTINED');
  const expected=S1_ZERO_CASES[plan.zeroChecks.length];
  if (check.caseId!==expected) return denied('OUT_OF_ORDER');
  if ((check.caseId==='Z1'||check.caseId==='Z2') && plan.allocations.length>0)
    return denied('OUT_OF_ORDER');
  if (check.caseId==='Z3' && plan.allocations.filter(a=>a.campaignId==='P0').length!==47)
    return denied('OUT_OF_ORDER');
  if (check.caseId==='Z4' && plan.campaignResults.P0?.disposition!=='CONCLUSIVE')
    return denied('OUT_OF_ORDER');
  return {ok:true,plan:freezePlan(plan.manifest,plan.allocations,
    [...plan.zeroChecks,check.caseId],{...plan.campaignResults},
    check.assertion==='FAILED')};
}
export function completeSyntheticCampaign(
  plan:SyntheticBundlePlan,
  result:{readonly campaignId:CampaignId;readonly disposition:SyntheticDisposition;
    readonly cleanup:'SYNTHETIC_COMPLETE'|'UNVERIFIED';
    readonly negativeAssertion:'SATISFIED'|'FAILED'},
):Result<SyntheticBundlePlan> {
  if (!exactObject(result,completionKeys) || !isCampaign(result.campaignId)
      || !(['CONCLUSIVE','EXPECTED_UNKNOWN','UNEXPECTED_UNKNOWN'] as const).includes(result.disposition)
      || !(['SYNTHETIC_COMPLETE','UNVERIFIED'] as const).includes(result.cleanup)
      || !(['SATISFIED','FAILED'] as const).includes(result.negativeAssertion))
    return denied('INVALID_INPUT');
  if (plan.globallyBlocked || plan.campaignResults[result.campaignId]) return denied('QUARANTINED');
  if (!priorComplete(plan,result.campaignId)) return denied('PRIOR_REVIEW_REQUIRED');
  if (plan.allocations.filter(a=>a.campaignId===result.campaignId).length !==
      S1_REQUEST_SLOTS[result.campaignId].length) return denied('OUT_OF_ORDER');
  if (result.campaignId==='P0' && !plan.zeroChecks.includes('Z3')) return denied('ZERO_CHECK_REQUIRED');
  const acceptable=(result.campaignId==='P0'
    ? result.disposition==='CONCLUSIVE' && result.cleanup==='SYNTHETIC_COMPLETE'
      : result.disposition==='EXPECTED_UNKNOWN' && result.cleanup==='UNVERIFIED');
  if (!acceptable && result.disposition!=='UNEXPECTED_UNKNOWN') return denied('INVALID_OUTCOME');
  return {ok:true,plan:freezePlan(plan.manifest,plan.allocations,plan.zeroChecks,
    {...plan.campaignResults,[result.campaignId]:{
      disposition:result.disposition,cleanup:result.cleanup,
      negativeAssertion:result.negativeAssertion,quarantined:result.disposition!=='CONCLUSIVE',
    }},plan.globallyBlocked || result.negativeAssertion==='FAILED'
       || result.disposition==='UNEXPECTED_UNKNOWN')};
}
export function syntheticRecoveryCopy(plan:SyntheticBundlePlan):
  Readonly<{source:'P0';caseId:'Z4';syntheticOutcome:'UNKNOWN';canRelaunch:false;authority:'MISSING'}> {
  // This is a detached in-memory assertion about a hypothetical missing receipt.
  // The source bundle is frozen; no mutation or recovery adapter is possible.
  if (!plan.zeroChecks.includes('Z4')) throw Error('Z4_NOT_OBSERVED');
  return Object.freeze({source:'P0',caseId:'Z4',syntheticOutcome:'UNKNOWN',
    canRelaunch:false,authority:'MISSING'});
}
export function nextSyntheticCampaign(plan:SyntheticBundlePlan):
  Readonly<{candidate:CampaignId|null;launchAllowed:false;requires:readonly string[]}> {
  const required=Object.freeze(['FRESH_OWNER_ADMISSION','EXTERNAL_EVIDENCE_REVIEW']);
  if (plan.globallyBlocked) return Object.freeze({candidate:null,launchAllowed:false,requires:required});
  const next=ids.find(id=>!plan.campaignResults[id] && priorComplete(plan,id))??null;
  return Object.freeze({candidate:next,launchAllowed:false,requires:required});
}
