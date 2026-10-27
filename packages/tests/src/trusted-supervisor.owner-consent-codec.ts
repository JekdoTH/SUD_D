/**
 * Test-only, in-memory SDA1 version-1 canonical *inert subset*. This is NOT
 * a native wire/consent receipt, a signer, a verifier or trusted enrollment.
 * No authorization or launch can result from a correctly encoded digest.
 */
import { createHash } from 'node:crypto';
import { createInertConsentBundle, type ConsentBundleDraft, type InertBundle,
  type InertCampaign, type InertFile, type InertBudget } from './trusted-supervisor.owner-consent-model.js';
import { S1_CAMPAIGNS, S1_ZERO_CASES, type ProofRole } from './trusted-supervisor.campaign-plan.js';

const textEncoder=new TextEncoder();
const fail=(cause:string):never=>{throw Error(cause);};
const h64=(s:string):boolean=>/^[a-f0-9]{64}$/.test(s);
const h32=(s:string):boolean=>/^[a-f0-9]{32}$/.test(s);
type Failed={readonly ok:false;readonly code:'INVALID_INERT_BYTES'};
const failed:Failed=Object.freeze({ok:false,code:'INVALID_INERT_BYTES'});
type Success<T>={readonly ok:true;readonly trust:'UNVERIFIED';readonly authority:'MISSING';
  readonly launchAllowed:false}&T;
const success=<T>(data:T):Success<T>=>({ok:true,trust:'UNVERIFIED',authority:'MISSING',
  launchAllowed:false,...data});
const roles:readonly ProofRole[]=['observer','controller','supervisor','root','descendant'];
const allowedChars=(s:string):boolean=>{
  for(let i=0;i<s.length;i++){
    const code=s.charCodeAt(i);
    if(code===0||code<32||(code>=0x7f&&code<=0x9f)
      ||(code>=0x202a&&code<=0x202e)||(code>=0x2066&&code<=0x2069))return false;
    if(code>=0xd800&&code<=0xdbff){
      const next=s.charCodeAt(++i);
      if(!(next>=0xdc00&&next<=0xdfff))return false;
    }else if(code>=0xdc00&&code<=0xdfff)return false;
  }
  return true;
};
class Writer {
  readonly bytes:number[]=[];
  u8(x:number){if(!Number.isSafeInteger(x)||x<0||x>255)fail('u8');this.bytes.push(x);}
  u16(x:number){if(!Number.isSafeInteger(x)||x<0||x>65535)fail('u16');
    this.u8(x&255);this.u8(x>>>8);}
  u32(x:number){if(!Number.isSafeInteger(x)||x<0||x>0xffffffff)fail('u32');
    for(let i=0;i<4;i++)this.u8(Math.floor(x/2**(8*i))%256);}
  u64(x:number){if(!Number.isSafeInteger(x)||x<0)fail('u64');
    let n=BigInt(x);for(let i=0;i<8;i++){this.u8(Number(n&255n));n>>=8n;}}
  raw(x:Uint8Array){this.bytes.push(...x);}
  hex(x:string,len:16|32){if(!(len===16?h32(x):h64(x)))fail('hex');
    for(let i=0;i<x.length;i+=2)this.u8(parseInt(x.slice(i,i+2),16));}
  str(x:string,max:number){
    if(typeof x!=='string'||x.length>max||!allowedChars(x))fail('text');
    this.u16(x.length);
    for(let i=0;i<x.length;i++)this.u16(x.charCodeAt(i));
  }
  output(){return Uint8Array.from(this.bytes);}
}
class Reader {
  private index=0;
  constructor(private readonly bytes:Uint8Array){}
  take(n:number){if(!Number.isSafeInteger(n)||n<0||n>this.bytes.length-this.index)fail('bounds');
    const begin=this.index;this.index+=n;return this.bytes.slice(begin,begin+n);}
  u8(){return this.take(1)[0]!;}
  u16(){const b=this.take(2);return b[0]!+(b[1]!<<8);}
  u32(){const b=this.take(4);return b[0]!+b[1]!*256+b[2]!*65536+b[3]!*16777216;}
  u64(){const b=this.take(8);let v=0n;
    for(let i=7;i>=0;i--)v=(v<<8n)+BigInt(b[i]!);
    if(v>BigInt(Number.MAX_SAFE_INTEGER))fail('u64 unsafe');
    return Number(v);
  }
  hex(len:16|32){return Buffer.from(this.take(len)).toString('hex');}
  str(max:number){
    const length=this.u16();
    if(length>max)fail('text length');
    let s='';for(let i=0;i<length;i++)s+=String.fromCharCode(this.u16());
    if(!allowedChars(s))fail('text');return s;
  }
  finished(){if(this.index!==this.bytes.length)fail('trailing');}
}
function pack(kind:1|2|3,payload:Uint8Array,max:number){
  if(payload.length>max-11)fail('payload length');
  const w=new Writer();
  w.raw(Uint8Array.of(0x53,0x44,0x41,0x31));
  w.u16(1);w.u8(kind);w.u32(payload.length);w.raw(payload);
  return w.output();
}
function unpack(input:Uint8Array,kind:1|2|3,max:number):Reader{
  if(!(input instanceof Uint8Array)||input.length<11||input.length>max)fail('frame');
  const r=new Reader(input);
  if(Buffer.from(r.take(4)).toString('hex')!=='53444131'||
     r.u16()!==1||r.u8()!==kind)fail('kind');
  if(r.u32()!==input.length-11)fail('length');
  return new Reader(r.take(input.length-11));
}
function file(w:Writer,f:InertFile){
  w.str(f.path,240);w.u64(f.volume);w.hex(f.fileId,16);
  w.u64(f.size);w.hex(f.sha256,32);
}
function readFile(r:Reader):InertFile {
  return {path:r.str(240),volume:r.u64(),fileId:r.hex(16),size:r.u64(),sha256:r.hex(32)};
}
function budget(w:Writer,b:InertBudget){
  w.u16(b.observer);w.u16(b.controller);w.u16(b.supervisor);
  w.u16(b.root);w.u16(b.descendant);w.u16(b.total);w.u8(b.retries);
}
function readBudget(r:Reader):InertBudget{
  return {observer:r.u16(),controller:r.u16(),supervisor:r.u16(),root:r.u16(),
    descendant:r.u16(),total:r.u16(),retries:r.u8()};
}
const asRole=(n:number):ProofRole=>{
  const role=roles[n-1];if(!role)fail('role');return role;
};
const caseNumber=(id:string)=>id==='BOOTSTRAP'?0:Number(id);
const asCase=(n:number)=>n===0?'BOOTSTRAP':n>=1&&n<=13?String(n).padStart(2,'0'):fail('case');
function writeCampaign(w:Writer,c:InertCampaign){
  w.u8(c.ordinal);w.u8(c.ordinal); // closed id P0..P3
  budget(w,c.budget);
  w.u8(c.caseIds.length);
  for(const id of c.caseIds)w.u8(caseNumber(id));
  w.u16(c.slots.length);
  for(const s of c.slots){
    w.u16(s.index);w.u8(caseNumber(s.caseId));w.u8(roles.indexOf(s.role)+1);
    w.u16(s.recipeId);w.u64(s.generation);
  }
  w.hex(c.recipeSetDigest,32);w.hex(c.evidencePolicyDigest,32);
  w.hex(c.faultPolicyDigest,32);
}
function readCampaign(r:Reader):InertCampaign{
  const ordinal=r.u8(),index=r.u8();
  if(ordinal>3||index!==ordinal)fail('ordinal');
  const b=readBudget(r);
  const n=r.u8();if(n>13)fail('case count');
  const caseIds:string[]=[];
  for(let i=0;i<n;i++)caseIds.push(asCase(r.u8()));
  const slotsCount=r.u16();if(slotsCount>65)fail('slot count');
  const slots:InertCampaign['slots']=[];
  for(let i=0;i<slotsCount;i++)slots.push({
    index:r.u16(),caseId:asCase(r.u8()),role:asRole(r.u8()),
    recipeId:r.u16(),generation:r.u64(),
  });
  return {id:S1_CAMPAIGNS[ordinal]!.id,ordinal,caseIds,slots,budget:b,
    recipeSetDigest:r.hex(32),evidencePolicyDigest:r.hex(32),
    faultPolicyDigest:r.hex(32)};
}
function corePayload(v:ConsentBundleDraft):Uint8Array{
  const w=new Writer();
  w.hex(v.bundleId,16);w.u64(v.issuedAtMs);w.u64(v.expiresAtMs);
  const i=v.identity;
  w.hex(i.installationId,16);w.u32(i.installationRevision);
  w.hex(i.deviceKeyDigest,32);w.str(i.ownerSid,184);w.str(i.logonSid,184);
  w.u64(i.logonLuid);w.u32(i.sessionNumber);
  w.hex(i.bootEpoch,16);w.hex(i.authorityEpoch,16);
  const t=v.task;
  w.str(t.taskId,80);w.u32(t.grantVersion);w.str(t.controllerId,80);
  w.str(t.sessionId,80);w.str(t.workspaceId,80);
  w.str(t.workspaceGeneration,80);w.str(t.scopeRevision,80);
  const ws=v.workspace;
  file(w,ws.root);w.u16(ws.ancestors.length);
  for(const f of ws.ancestors)file(w,f);
  w.hex(ws.baselineDigest,32);w.hex(ws.sentinelSetDigest,32);
  w.hex(ws.scratchPolicyDigest,32);
  w.u16(v.artifacts.length);
  for(const a of v.artifacts){
    w.u8(a.role==='supervisor'?1:2);
    w.hex(a.sourceDigest,32);w.hex(a.buildReceiptDigest,32);
    file(w,a.binary);w.hex(a.dependencyClosureDigest,32);
    w.hex(a.signerPolicyDigest,32);
  }
  const trust=v.trustBinding;
  w.u8(1);w.str(trust.issuerEnrollmentId,80);w.str(trust.issuerKeyId,80);
  w.u32(trust.trustPolicyRevision);
  w.hex(trust.audienceInstallationId,16);w.u32(trust.audienceRevision);
  w.hex(trust.audienceInstance,16);
  budget(w,v.globalBudget);
  w.u8(v.campaigns.length);
  for(const c of v.campaigns)writeCampaign(w,c);
  w.u8(v.zeroCases.length);
  for(const c of v.zeroCases)w.u8(S1_ZERO_CASES.indexOf(c as typeof S1_ZERO_CASES[number])+1);
  w.hex(v.frameworkInventoryDigest,32);
  return w.output();
}
function parseCore(r:Reader):ConsentBundleDraft{
  const bundleId=r.hex(16),issuedAtMs=r.u64(),expiresAtMs=r.u64();
  const identity={
    installationId:r.hex(16),installationRevision:r.u32(),deviceKeyDigest:r.hex(32),
    ownerSid:r.str(184),logonSid:r.str(184),logonLuid:r.u64(),
    sessionNumber:r.u32(),bootEpoch:r.hex(16),authorityEpoch:r.hex(16),
  };
  const task={taskId:r.str(80),grantVersion:r.u32(),controllerId:r.str(80),
    sessionId:r.str(80),workspaceId:r.str(80),
    workspaceGeneration:r.str(80),scopeRevision:r.str(80)};
  const root=readFile(r),count=r.u16();
  if(count>32)fail('ancestors');
  const ancestors=Array.from({length:count},()=>readFile(r));
  const workspace={root,ancestors,baselineDigest:r.hex(32),
    sentinelSetDigest:r.hex(32),scratchPolicyDigest:r.hex(32)};
  const artifactCount=r.u16();if(artifactCount!==2)fail('artifacts');
  const artifacts:ConsentBundleDraft['artifacts']=[];
  for(let i=0;i<artifactCount;i++){
    const n=r.u8();if(n!==1&&n!==2)fail('artifact role');
    artifacts.push({role:n===1?'supervisor':'proof',sourceDigest:r.hex(32),
      buildReceiptDigest:r.hex(32),binary:readFile(r),
      dependencyClosureDigest:r.hex(32),signerPolicyDigest:r.hex(32)});
  }
  if(r.u8()!==1)fail('profile');
  const trustBinding:ConsentBundleDraft['trustBinding']={
    profile:'protected-control-transaction-v1',
    issuerEnrollmentId:r.str(80),issuerKeyId:r.str(80),
    trustPolicyRevision:r.u32(),audienceInstallationId:r.hex(16),
    audienceRevision:r.u32(),audienceInstance:r.hex(16),
  };
  const globalBudget=readBudget(r);
  if(r.u8()!==4)fail('campaign count');
  const campaigns=Array.from({length:4},()=>readCampaign(r));
  if(r.u8()!==4)fail('zero count');
  const zeroCases=Array.from({length:4},()=>{
    const i=r.u8();if(i<1||i>4)fail('zero case');return S1_ZERO_CASES[i-1]!;
  });
  const frameworkInventoryDigest=r.hex(32);
  r.finished();
  return {version:1,bundleId,issuedAtMs,expiresAtMs,identity,task,workspace,
    artifacts,trustBinding,globalBudget,campaigns,zeroCases,frameworkInventoryDigest};
}
const toBytes=(input:unknown):Uint8Array=>{
  if(!(input instanceof Uint8Array))fail('not bytes');
  return new Uint8Array(input as Uint8Array); // detach mutable caller-owned buffer
};
export function encodeInertCore(input:unknown):
  (Success<{bytes:Uint8Array}>|Failed) {
  try{
    const result=createInertConsentBundle(input);
    if(!result.ok)return failed;
    const data=pack(1,corePayload(result.model),65536);
    return success({bytes:data});
  }catch{return failed;}
}
export function decodeInertCore(input:unknown):
  (Success<{model:InertBundle}>|Failed) {
  try{
    const r=unpack(toBytes(input),1,65536);
    const model=createInertConsentBundle(parseCore(r));
    if(!model.ok)return failed;
    return success({model:model.model});
  }catch{return failed;}
}
/** Hash is a commitment to bytes, not authentication or authorization. */
export function sha256Domain(domain:string,bytes:Uint8Array):string {
  if(!['SUDD-A1-Core-v1','SUDD-A1-Campaign-v1','SUDD-A1-Seal-v1'].includes(domain))
    throw Error('INVALID_DOMAIN');
  return createHash('sha256').update(textEncoder.encode(domain))
    .update(bytes).digest('hex');
}
const digestBytes=(hex:string)=>Uint8Array.from(Buffer.from(hex,'hex'));
const concat=(...parts:Uint8Array[])=>Uint8Array.from(parts.flatMap(x=>[...x]));
export interface InertPacket {
  readonly campaignId:'P0'|'P1'|'P2'|'P3';readonly ordinal:number;
  readonly coreDigest:string;readonly campaignDigest:string;readonly sealDigest:string;
  readonly campaign:Readonly<InertCampaign>;
  readonly trust:'UNVERIFIED';readonly authority:'MISSING';readonly launchAllowed:false;
}
export function buildInertCommitments(input:unknown):
  (Success<{coreDigest:string;sealDigest:string;packets:readonly InertPacket[]}>|Failed){
  try{
    const model=createInertConsentBundle(input);
    if(!model.ok)return failed;
    // F-A1-03: serialize the already validated, detached immutable snapshot.
    // Never re-read the caller while constructing core/campaign/seal digests.
    const coreBytes=pack(1,corePayload(model.model),65536);
    const coreDigest=sha256Domain('SUDD-A1-Core-v1',coreBytes);
    const campaigns=model.model.campaigns.map(c=>{
      const w=new Writer();writeCampaign(w,c);
      return sha256Domain('SUDD-A1-Campaign-v1',
        concat(digestBytes(coreDigest),pack(2,w.output(),4096)));
    });
    const sealDigest=sha256Domain('SUDD-A1-Seal-v1',
      concat(digestBytes(coreDigest),...campaigns.map(digestBytes)));
    const packets=Object.freeze(campaigns.map((campaignDigest,i)=>Object.freeze({
      campaignId:S1_CAMPAIGNS[i]!.id,ordinal:i,coreDigest,campaignDigest,sealDigest,
      campaign:model.model.campaigns[i]!,
      trust:'UNVERIFIED' as const,authority:'MISSING' as const,
      launchAllowed:false as const,
    })));
    return success({coreDigest,sealDigest,packets});
  }catch{return failed;}
}
/**
 * Pure shape/commitment consistency check only. This is NOT receipt signature
 * verification; a hostile caller can recompute its own consistent digests.
 */
export function checkInertPacketConsistency(bundle:unknown,packet:unknown):
  (Success<{consistent:true}>|Failed){
  try{
    const original=buildInertCommitments(bundle);
    const validated=createInertConsentBundle(bundle);
    if(!original.ok||!validated.ok||packet===null||typeof packet!=='object'||
       Array.isArray(packet))return failed;
    const p=packet as Record<string,unknown>;
    const keys=['campaignId','ordinal','coreDigest','campaignDigest','sealDigest',
      'campaign','trust','authority','launchAllowed'];
    if(Object.getPrototypeOf(p)!==Object.prototype||
       Reflect.ownKeys(p).length!==keys.length||
       !keys.every(k=>{
         const desc=Object.getOwnPropertyDescriptor(p,k);
         return !!desc&&desc.enumerable&&Object.hasOwn(desc,'value');
       })||!Number.isInteger(p.ordinal)||(p.ordinal as number)<0||
       (p.ordinal as number)>3||p.trust!=='UNVERIFIED'||
       p.authority!=='MISSING'||p.launchAllowed!==false)return failed;
    const expected=original.packets[p.ordinal as number]!;
    if(p.campaignId!==expected.campaignId||p.coreDigest!==expected.coreDigest||
       p.campaignDigest!==expected.campaignDigest||
       p.sealDigest!==expected.sealDigest)return failed;
    const draft:Record<string,unknown>={...validated.model};
    delete draft.trust;delete draft.authority;delete draft.launchAllowed;
    draft.campaigns=validated.model.campaigns.map((c,i)=>
      i===p.ordinal?p.campaign:c);
    // Full closed nested model validation rejects hidden, added, stale or
    // same-user-invented campaign fields independently of asserted digests.
    const altered=createInertConsentBundle(draft);
    if(!altered.ok)return failed;
    const reconstructed=buildInertCommitments(draft);
    if(!reconstructed.ok||reconstructed.sealDigest!==original.sealDigest)
      return failed;
    return success({consistent:true as const});
  }catch{return failed;}
}
/** Only status LOOKUP metadata; no consent, issue, redeem or action message. */
export function encodeInertStatusRequest(input:unknown):
  (Success<{bytes:Uint8Array}>|Failed) {
  try{
    if(input===null||typeof input!=='object'||Array.isArray(input))return failed;
    const x=input as Record<string,unknown>;
    const props=Reflect.ownKeys(x);
    if(Object.getPrototypeOf(x)!==Object.prototype||props.length!==3||
       props.some(k=>!['bundleId','sealDigest','ordinal'].includes(String(k)))||
       !['bundleId','sealDigest','ordinal'].every(k=>{
         const d=Object.getOwnPropertyDescriptor(x,k);
         return !!d&&d.enumerable&&Object.hasOwn(d,'value');
       })||typeof x.bundleId!=='string'||!h32(x.bundleId)
       ||typeof x.sealDigest!=='string'||!h64(x.sealDigest)
       ||!Number.isInteger(x.ordinal)||(x.ordinal as number)<0||(x.ordinal as number)>3)
      return failed;
    const w=new Writer();w.hex(x.bundleId,16);w.hex(x.sealDigest,32);
    w.u8(x.ordinal as number);
    return success({bytes:pack(3,w.output(),4096)});
  }catch{return failed;}
}
export function decodeInertStatusRequest(input:unknown):
  (Success<{request:Readonly<{bundleId:string;sealDigest:string;ordinal:number}>}>|Failed){
  try{
    const r=unpack(toBytes(input),3,4096);
    const request=Object.freeze({bundleId:r.hex(16),sealDigest:r.hex(32),ordinal:r.u8()});
    r.finished();if(request.ordinal>3)return failed;
    return success({request});
  }catch{return failed;}
}
