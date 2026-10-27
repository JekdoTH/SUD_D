/**
 * Inert A1 Option A DATA ONLY. No verifier, presenter, issuer, key, approval,
 * process, file, OS, native capability or launch right exists in this module.
 * The sample is synthetic and is NOT an Owner-issued campaign.
 */
import { S1_CAMPAIGNS, S1_LIMITS, S1_REQUEST_SLOTS, S1_ZERO_CASES,
  type CampaignId, type ProofRole } from './trusted-supervisor.campaign-plan.js';

export type InertTrust = 'UNVERIFIED';
export type MissingAuthority = 'MISSING';
export interface InertFile {
  path:string; volume:number; fileId:string; size:number; sha256:string;
}
export interface InertBudget {
  observer:number; controller:number; supervisor:number; root:number;
  descendant:number; total:number; retries:number;
}
export interface InertSlot {
  index:number;caseId:string;role:ProofRole;recipeId:number;generation:number;
}
export interface InertCampaign {
  id:CampaignId;ordinal:number;caseIds:string[];slots:InertSlot[];
  budget:InertBudget;recipeSetDigest:string;evidencePolicyDigest:string;
  faultPolicyDigest:string;
}
export interface ConsentBundleDraft {
  version:1;bundleId:string;issuedAtMs:number;expiresAtMs:number;
  identity:{
    installationId:string;installationRevision:number;deviceKeyDigest:string;
    ownerSid:string;logonSid:string;logonLuid:number;sessionNumber:number;
    bootEpoch:string;authorityEpoch:string;
  };
  task:{taskId:string;grantVersion:number;controllerId:string;sessionId:string;
    workspaceId:string;workspaceGeneration:string;scopeRevision:string};
  workspace:{root:InertFile;ancestors:InertFile[];baselineDigest:string;
    sentinelSetDigest:string;scratchPolicyDigest:string};
  artifacts:{role:'supervisor'|'proof';sourceDigest:string;
    buildReceiptDigest:string;binary:InertFile;dependencyClosureDigest:string;
    signerPolicyDigest:string}[];
  trustBinding:{profile:'protected-control-transaction-v1';issuerEnrollmentId:string;
    issuerKeyId:string;trustPolicyRevision:number;audienceInstallationId:string;
    audienceRevision:number;audienceInstance:string};
  globalBudget:InertBudget;campaigns:InertCampaign[];zeroCases:string[];
  frameworkInventoryDigest:string;
}
export type InertBundle = Readonly<ConsentBundleDraft> & {
  readonly trust:InertTrust;readonly authority:MissingAuthority;
  readonly launchAllowed:false;
};
type Invalid = {readonly ok:false;readonly code:'INVALID_CONSENT_MODEL'};
type Valid = {readonly ok:true;readonly model:InertBundle};
const invalid:Invalid=Object.freeze({ok:false,code:'INVALID_CONSENT_MODEL'});
const hash=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const hex16=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const id=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&x.length<=80
  &&/^[A-Za-z0-9_-]+$/.test(x);
const unsigned=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const positive=(v:unknown)=>unsigned(v)&&(v as number)>0;
const closed=(x:unknown, keys:readonly string[]):x is Record<string,unknown>=>{
  if(x===null||typeof x!=='object'||Array.isArray(x))return false;
  const p=Object.getPrototypeOf(x);
  if(p!==Object.prototype&&p!==null)return false;
  const k=Reflect.ownKeys(x);
  if(k.length!==keys.length||!k.every(y=>typeof y==='string'&&keys.includes(y)))return false;
  return keys.every(y=>{
    const desc=Object.getOwnPropertyDescriptor(x,y);
    return !!desc&&desc.enumerable&&Object.hasOwn(desc,'value');
  });
};
const exactArray=(x:unknown,length:number):x is unknown[]=>{
  if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype
    ||x.length!==length||Reflect.ownKeys(x).length!==length+1)return false;
  return Array.from({length},(_,i)=>Object.getOwnPropertyDescriptor(x,String(i)))
    .every(d=>!!d&&d.enumerable&&Object.hasOwn(d,'value'));
};
const safePath=(x:unknown):x is string=>{
  if(typeof x!=='string'||x.length<4||x.length>240||
      !/^[A-Za-z]:\\/.test(x)||/[<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(x.slice(2))
      ||[...x].some(ch=>ch.charCodeAt(0)<32))return false;
  const parts=x.slice(3).split('\\');
  return parts.length>0&&parts.every(s=>s.length>0&&s!=='.'&&s!=='..'
    &&!/\s$|\.$/.test(s)&&!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(s));
};
const fileKeys=['path','volume','fileId','size','sha256'];
const budgetKeys=['observer','controller','supervisor','root','descendant','total','retries'];
const idKeys=['installationId','installationRevision','deviceKeyDigest','ownerSid',
  'logonSid','logonLuid','sessionNumber','bootEpoch','authorityEpoch'];
const taskKeys=['taskId','grantVersion','controllerId','sessionId','workspaceId',
  'workspaceGeneration','scopeRevision'];
const workspaceKeys=['root','ancestors','baselineDigest','sentinelSetDigest','scratchPolicyDigest'];
const artifactKeys=['role','sourceDigest','buildReceiptDigest','binary',
  'dependencyClosureDigest','signerPolicyDigest'];
const trustKeys=['profile','issuerEnrollmentId','issuerKeyId','trustPolicyRevision',
  'audienceInstallationId','audienceRevision','audienceInstance'];
const campaignKeys=['id','ordinal','caseIds','slots','budget','recipeSetDigest',
  'evidencePolicyDigest','faultPolicyDigest'];
const slotKeys=['index','caseId','role','recipeId','generation'];
const topKeys=['version','bundleId','issuedAtMs','expiresAtMs','identity','task',
  'workspace','artifacts','trustBinding','globalBudget','campaigns',
  'zeroCases','frameworkInventoryDigest'];
function file(x:unknown):x is InertFile {
  return closed(x,fileKeys)&&safePath(x.path)&&unsigned(x.volume)&&hex16(x.fileId)
    &&unsigned(x.size)&&hash(x.sha256);
}
function budget(x:unknown,expected:InertBudget):x is InertBudget {
  return closed(x,budgetKeys)&&budgetKeys.every(k=>x[k]===expected[k as keyof InertBudget]);
}
function valid(x:unknown):x is ConsentBundleDraft {
  if(!closed(x,topKeys)||x.version!==1||!hex16(x.bundleId)
    ||!unsigned(x.issuedAtMs)||!unsigned(x.expiresAtMs)
    ||(x.expiresAtMs as number)<=(x.issuedAtMs as number)
    ||!hash(x.frameworkInventoryDigest))return false;
  const identity=x.identity;
  if(!closed(identity,idKeys)||!hex16(identity.installationId)
    ||!positive(identity.installationRevision)||!hash(identity.deviceKeyDigest)
    ||!hex16(identity.bootEpoch)||!hex16(identity.authorityEpoch)
    ||!positive(identity.logonLuid)||!unsigned(identity.sessionNumber)
    ||!/^S-1-(?:[0-9]{1,10}-){2,14}[0-9]{1,10}$/.test(String(identity.ownerSid))
    ||!/^S-1-(?:[0-9]{1,10}-){2,14}[0-9]{1,10}$/.test(String(identity.logonSid)))return false;
  const task=x.task;
  if(!closed(task,taskKeys)||!taskKeys.filter(k=>k!=='grantVersion')
    .every(k=>id(task[k]))||!positive(task.grantVersion))return false;
  const w=x.workspace;
  if(!closed(w,workspaceKeys)||!file(w.root)||!hash(w.baselineDigest)
    ||!hash(w.sentinelSetDigest)||!hash(w.scratchPolicyDigest)
    ||!Array.isArray(w.ancestors)||w.ancestors.length>32||
    !exactArray(w.ancestors,w.ancestors.length)||!w.ancestors.every(file))return false;
  const seen=new Set<string>([w.root.path.toLowerCase()]);
  for(const a of w.ancestors){const k=a.path.toLowerCase();if(seen.has(k))return false;seen.add(k);}
  const trust=x.trustBinding;
  if(!closed(trust,trustKeys)||trust.profile!=='protected-control-transaction-v1'
    ||!id(trust.issuerEnrollmentId)||!id(trust.issuerKeyId)
    ||!positive(trust.trustPolicyRevision)||!hex16(trust.audienceInstallationId)
    ||!positive(trust.audienceRevision)||!hex16(trust.audienceInstance))return false;
  const expected={...S1_LIMITS,retries:0};
  const zeroCases=x.zeroCases;
  if(!budget(x.globalBudget,expected)||!exactArray(zeroCases,4)
    ||!S1_ZERO_CASES.every((z,i)=>zeroCases[i]===z)
    ||!exactArray(x.artifacts,2))return false;
  const seenArtifact=new Set<string>();
  for(const a of x.artifacts){
    if(!closed(a,artifactKeys)||(a.role!=='supervisor'&&a.role!=='proof')
      ||!hash(a.sourceDigest)||!hash(a.buildReceiptDigest)||!file(a.binary)
      ||!hash(a.dependencyClosureDigest)||!hash(a.signerPolicyDigest))return false;
    const k=a.role+':'+a.binary.path.toLowerCase();
    if(seenArtifact.has(k))return false;seenArtifact.add(k);
  }
  if((x.artifacts[0] as Record<string,unknown>).role!=='supervisor'
    ||(x.artifacts[1] as Record<string,unknown>).role!=='proof')return false;
  if(!exactArray(x.campaigns,4))return false;
  for(let i=0;i<4;i++){
    const c=x.campaigns[i];
    const expectedRow=S1_CAMPAIGNS[i]!;
    const caseIds=closed(c,campaignKeys)?c.caseIds:null;
    if(!closed(c,campaignKeys)||c.id!==expectedRow.id||c.ordinal!==i
      ||!hash(c.recipeSetDigest)||!hash(c.evidencePolicyDigest)
      ||!hash(c.faultPolicyDigest)||!exactArray(caseIds,expectedRow.caseIds.length)
      ||!expectedRow.caseIds.every((id,j)=>caseIds[j]===id)
      ||!budget(c.budget,{observer:expectedRow.observer,controller:expectedRow.controller,
        supervisor:expectedRow.supervisor,root:expectedRow.root,descendant:expectedRow.descendant,
        total:expectedRow.total,retries:0}))return false;
    const expectedSlots=S1_REQUEST_SLOTS[expectedRow.id];
    if(!exactArray(c.slots,expectedSlots.length))return false;
    for(let j=0;j<expectedSlots.length;j++){
      const slot=c.slots[j],known=expectedSlots[j]!;
      if(!closed(slot,slotKeys)||slot.index!==j+1||slot.caseId!==known.caseId
        ||slot.role!==known.role||!positive(slot.recipeId)||!positive(slot.generation)
        ||slot.generation!==1)return false;
    }
  }
  return true;
}
function deepFreeze<T>(x:T):T {
  if(x&&typeof x==='object'){
    for(const v of Object.values(x))deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}
export function createInertConsentBundle(input:unknown):Valid|Invalid{
  try {
    if(!valid(input))return invalid;
    // Deeply detach once and revalidate: no Proxy/reference or accessor is
    // allowed to survive into state. Reflection traps and drift fail closed.
    const copy=structuredClone(input) as ConsentBundleDraft;
    if(!valid(copy))return invalid;
    return {ok:true,model:deepFreeze({
      ...copy,trust:'UNVERIFIED' as const,authority:'MISSING' as const,
      launchAllowed:false as const,
    })};
  } catch {return invalid;}
}
/** Readable EXPLICIT FAKE in-memory test fixture, never credential/consent. */
export function syntacticExampleBundle():ConsentBundleDraft{
  const h=(c:string)=>c.repeat(64);
  const i=(c:string)=>c.repeat(32);
  const file=(path:string):InertFile=>({path,volume:1,fileId:i('1'),size:128,sha256:h('a')});
  return {
    version:1,bundleId:i('1'),issuedAtMs:100,expiresAtMs:10000,
    identity:{installationId:i('2'),installationRevision:1,deviceKeyDigest:h('b'),
      ownerSid:'S-1-5-21-1-2-3-1000',logonSid:'S-1-5-5-1-2',
      logonLuid:1,sessionNumber:1,bootEpoch:i('3'),authorityEpoch:i('4')},
    task:{taskId:'fake-task',grantVersion:1,controllerId:'fake-controller',
      sessionId:'fake-session',workspaceId:'fake-ws',
      workspaceGeneration:'fake-gen',scopeRevision:'fake-scope'},
    workspace:{root:file('C:\\FAKE_ONLY\\workspace'),ancestors:[],
      baselineDigest:h('c'),sentinelSetDigest:h('d'),scratchPolicyDigest:h('e')},
    artifacts:[
      {role:'supervisor',sourceDigest:h('f'),buildReceiptDigest:h('1'),
        binary:file('C:\\FAKE_ONLY\\supervisor.exe'),dependencyClosureDigest:h('2'),signerPolicyDigest:h('3')},
      {role:'proof',sourceDigest:h('4'),buildReceiptDigest:h('5'),
        binary:file('C:\\FAKE_ONLY\\fixture.exe'),dependencyClosureDigest:h('6'),signerPolicyDigest:h('7')},
    ],
    trustBinding:{profile:'protected-control-transaction-v1',issuerEnrollmentId:'not-enrolled',
      issuerKeyId:'not-provisioned',trustPolicyRevision:1,audienceInstallationId:i('2'),
      audienceRevision:1,audienceInstance:i('6')},
    globalBudget:{...S1_LIMITS,retries:0},
    campaigns:S1_CAMPAIGNS.map((row,index)=>({
      id:row.id,ordinal:index,caseIds:[...row.caseIds],
      slots:S1_REQUEST_SLOTS[row.id].map((s,j)=>({
        index:j+1,caseId:s.caseId,role:s.role,recipeId:j+1,generation:1,
      })),
      budget:{observer:row.observer,controller:row.controller,supervisor:row.supervisor,
        root:row.root,descendant:row.descendant,total:row.total,retries:0},
      recipeSetDigest:h('8'),evidencePolicyDigest:h('9'),faultPolicyDigest:h('0'),
    })),
    zeroCases:[...S1_ZERO_CASES],frameworkInventoryDigest:h('a'),
  };
}
