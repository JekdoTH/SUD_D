import path from 'node:path';
import {createHash} from 'node:crypto';
import koffi from 'koffi';
import {F2B2_FIXED_PROOF} from './private-mvp-win32-native-binding.js';
import type {PrivateMvpSyntheticStageAttestor} from './private-mvp-trusted-synthetic-stage.js';

/** H1 fixed file and ancestor closure: reviewed stage files only; never
 * discover executable code from caller-controlled imports. */
export const F2H1_FROZEN_STAGE_FILES=Object.freeze([
  {name:'fixture.mjs',sha256:F2B2_FIXED_PROOF.entrySha256},
  {name:'fixture-child.mjs',sha256:'f8d9974970ca9b4f9ff2cebbb5831505e14575634ce84906ce67b1ead79380bc'},
  {name:'fixture-grandchild.mjs',sha256:'269d70fb7334cbc1c8c75a93d04a0a55c274031a27cd132bdccc4f79209d80b4'},
  {name:'input.json',sha256:F2B2_FIXED_PROOF.inputSha256},
].map(f=>Object.freeze({...f,path:path.win32.join(F2B2_FIXED_PROOF.root,'stage',f.name)})));
const root=F2B2_FIXED_PROOF.root;
const ancestors:string[]=[];
for(let cursor=path.win32.dirname(root);;cursor=path.win32.dirname(cursor)){
  ancestors.unshift(cursor);
  if(path.win32.dirname(cursor)===cursor)break;
}
export const F2H1_FIXED_STAGE_DIRECTORIES=Object.freeze([
  ...ancestors,root,
  path.win32.join(root,'stage'),
  path.win32.join(root,'output'),
  path.win32.join(root,'scratch'),
]);
const directories=F2H1_FIXED_STAGE_DIRECTORIES;
const norm=(s:string)=>path.win32.normalize(s).toLowerCase();
/** Exact reviewer pin MUST be frozen inside trusted installation, not passed
 * from renderer, worker, Mission, JSON or a mock. None is approved today. */
const APPROVED_H1_STAGE_ACL_ENROLLMENT:null=null;
export const F2H1_NATIVE_STAGE_AUTHORIZED=false as const;
export interface F2H1HeldKernelStageObject {
  readonly path:string;
  readonly directory:boolean;
  readonly volumeId:string;
  readonly fileId:string;
  readonly hardlinks:number;
  readonly reparse:boolean;
  readonly ownerSid:string;
  readonly ownerDaclSddl:string;
  readonly canonical:boolean;
  isHeld():boolean;
  readPinnedBytes():Uint8Array;
  close():boolean;
}
export interface F2H1HeldKernelStageReader {
  openExact(path:string,directory:boolean):F2H1HeldKernelStageObject;
}
export interface F2H1FrozenStageAcl {
  readonly volumeId:string;
  /** Keys use canonical, case-normalized FIXED paths; includes 4 directories */
  readonly objects:Readonly<Record<string,{
    readonly fileId:string;readonly ownerSid:string;readonly ownerDaclSddl:string;
  }>>;
  readonly importedPaths:readonly string[];
}
/**
 * Two-phase fixed stage enrollment for future Owner provisioned artifacts.
 *
 * Phase A is a trusted, IMMUTABLE owner/ACE policy template, reviewed before
 * any OS file exists. Phase B observes OS-generated FILE_ID_128/volume and the
 * generated AppContainer SID only AFTER separately authorized provisioning.
 * No method copies the observed ACL into the policy; both must match exactly.
 * This is CODE-REVIEW material, NEVER an executable native authorization.
 */
export const F2H1_STAGE_POLICY_REVISION='fixed-synthetic-stage-acl-v1' as const;
export const F2H1_PROVISIONING_AUTHORIZED=false as const;
/** Fixed TCB-owned DRAFT ACE role template for separate Owner review.
 * This is not an ACL string, does not contain OS-generated SIDs or FileIDs,
 * and does not authorize applying permissions. Ancestors are attest-only.
 */
export const F2H1_STAGE_ACL_ROLE_TEMPLATE_DRAFT=Object.freeze({
  revision:F2H1_STAGE_POLICY_REVISION,
  profile:F2B2_FIXED_PROOF.profile,
  stageFiles:Object.freeze({owner:'owner-full',appContainer:'read-only',inherited:false}),
  stageDirectory:Object.freeze({owner:'owner-full',appContainer:'read-traverse',inherited:false}),
  scratchAndOutput:Object.freeze({owner:'owner-full',appContainer:'read-write-no-execute',inherited:false}),
  ancestors:Object.freeze({operation:'inspect-only-no-ACL-mutation'}),
  forbiddenGrantRoles:Object.freeze(['everyone-write','authenticated-users-write','other-workspace-read-write']),
  capabilities:Object.freeze([]),network:'deny',
  approval:'not-enrolled',
});
export const F2H1_STAGE_ROLE_TEMPLATE_SHA256=createHash('sha256')
  .update(JSON.stringify(F2H1_STAGE_ACL_ROLE_TEMPLATE_DRAFT)).digest('hex');
export interface F2H1ReviewedStagePolicy {
  readonly revision:typeof F2H1_STAGE_POLICY_REVISION;
  readonly roleTemplateDigest:string;
  readonly profileName:typeof F2B2_FIXED_PROOF.profile;
  /** TCB-reviewed CURRENT USER SID resolved through a trusted OS token, not
   * adopted from the observed fixture object's DACL/owner. */
  readonly expectedOwnerSid:string;
  /** Exact canonical file/directory ACL SDDL for every approved path,
   * resolved from independently reviewed ACE role template. */
  readonly aclSddlByPath:Readonly<Record<string,string>>;
  /** Exact post-provisioning SDDL, derived from fixed ACE policy and
   * independently verified AppContainer SID (never copied from observation). */
  readonly profileAclSddl:string;
}
export interface F2H1ProvisionedIdentityObservation {
  readonly volumeId:string;
  /** SID generated by actual AppContainer provisioning; never user input. */
  readonly profileSid:string;
  readonly profileAclSddl:string;
  readonly objects:Readonly<Record<string,{
    readonly fileId:string;readonly ownerSid:string;readonly ownerDaclSddl:string;
    readonly volumeId:string;readonly hardlinks:number;readonly reparse:boolean;
  }>>;
  readonly importedPaths:readonly string[];
}
export type F2H1EnrollmentPreview =
  |{readonly acceptedForCodeReview:true;readonly nativeAuthorization:false;
    readonly sealDigest:string;readonly pin:Readonly<F2H1FrozenStageAcl>}
  |{readonly acceptedForCodeReview:false;readonly nativeAuthorization:false;
    readonly reason:'policy-not-reviewed'|'OS-identity-incomplete-or-mismatched'};
/** Only TCB-embedded reviewed policy can authorize real sealing; no policy
 * enrollment was approved in this milestone. The argument supports offline
 * failure tests, not production enrollment or a privileged caller surface.
 */
export function sealF2H1StageEnrollmentForReview(
  policy:F2H1ReviewedStagePolicy|null,
  observed:F2H1ProvisionedIdentityObservation|null,
):F2H1EnrollmentPreview {
  const blocked=(reason:'policy-not-reviewed'|'OS-identity-incomplete-or-mismatched'):
    F2H1EnrollmentPreview=>Object.freeze({
      acceptedForCodeReview:false as const,nativeAuthorization:false as const,reason,
    });
  if(!policy||policy.revision!==F2H1_STAGE_POLICY_REVISION
    ||policy.roleTemplateDigest!==F2H1_STAGE_ROLE_TEMPLATE_SHA256
    ||policy.profileName!==F2B2_FIXED_PROOF.profile
    ||!/^S-\d+(?:-\d+){1,14}$/.test(policy.expectedOwnerSid)
    ||!policy.profileAclSddl||!policy.aclSddlByPath)
    return blocked('policy-not-reviewed');
  const files=F2H1_FROZEN_STAGE_FILES.map(f=>f.path);
  const paths=[...directories,...files];
  if(!observed||!/^[0-9a-f]{1,32}$/.test(observed.volumeId)
    ||!/^S-\d+(?:-\d+){1,14}$/.test(observed.profileSid)
    ||observed.profileAclSddl!==policy.profileAclSddl
    ||Object.keys(observed.objects??{}).length!==paths.length
    ||Object.keys(policy.aclSddlByPath).length!==paths.length
    ||!Array.isArray(observed.importedPaths)
    ||observed.importedPaths.length!==files.length
    ||new Set(observed.importedPaths.map(norm)).size!==files.length
    ||files.some(p=>!observed.importedPaths.some(f=>norm(f)===norm(p))))
    return blocked('OS-identity-incomplete-or-mismatched');
  const seen=new Set<string>();
  const pinObjects:Record<string,{fileId:string;ownerSid:string;ownerDaclSddl:string}>={};
  for(const pathName of paths){
    const key=norm(pathName);
    const got=observed.objects[key];
    const expectedAcl=policy.aclSddlByPath[key];
    if(!got||!expectedAcl||!/^([0-9a-f]{32})$/.test(got.fileId)
      ||got.ownerSid!==policy.expectedOwnerSid
      ||got.ownerDaclSddl!==expectedAcl
      ||got.volumeId!==observed.volumeId
      ||got.hardlinks!==1||got.reparse!==false
      ||seen.has(got.fileId))return blocked('OS-identity-incomplete-or-mismatched');
    seen.add(got.fileId);
    pinObjects[key]=Object.freeze({
      fileId:got.fileId,ownerSid:policy.expectedOwnerSid,ownerDaclSddl:expectedAcl,
    });
  }
  const pin=Object.freeze<F2H1FrozenStageAcl>({
    volumeId:observed.volumeId,
    objects:Object.freeze(pinObjects),
    importedPaths:Object.freeze([...files]),
  });
  const sealDigest=createHash('sha256').update(JSON.stringify({
    revision:policy.revision,roleTemplateDigest:policy.roleTemplateDigest,
    profile:policy.profileName,expectedOwnerSid:policy.expectedOwnerSid,
    profileSid:observed.profileSid,profileAclSddl:policy.profileAclSddl,
    pin,sourceHashes:F2H1_FROZEN_STAGE_FILES.map(f=>f.sha256),
  })).digest('hex');
  return Object.freeze({
    acceptedForCodeReview:true as const,nativeAuthorization:false as const,
    sealDigest,pin,
  });
}

/** This immutable enrollment is deliberately ABSENT until reviewed OS-identity
 * and ACL evidence is produced by a separately authorized provisioner. */
export const F2H1_TRUSTED_SEALED_ENROLLMENT:null=null;

export interface F2H1HeldReview {
  readonly acceptedForCodeReview:boolean;
  readonly nativeAuthorization:false;
  /** Re-query every held native FileID immediately before and after creation. */
  stillHeld():boolean;
  /** Must be called after the owned suspended CREATE + transfer, or on fail. */
  release():boolean;
}
/** Pure orchestration over a Win32 reader. A mock can only pass the code-review
 * check; cannot create trusted native evidence or start a worker.
 * Every opened OS file object remains held until caller closes this review.
 */
export function reviewF2H1HeldStage(
  reader:F2H1HeldKernelStageReader, pin:F2H1FrozenStageAcl|null,
):F2H1HeldReview {
  const opened:F2H1HeldKernelStageObject[]=[];
  let done=false;
  function release():boolean {
    if(done)return false;
    done=true;
    let ok=true;
    for(const object of opened.reverse()){
      try{if(object.close()!==true)ok=false;}catch{ok=false;}
    }
    return ok;
  }
  try {
    const paths=F2H1_FROZEN_STAGE_FILES.map(x=>x.path);
    if(!pin||!pin.volumeId||!pin.objects
      ||pin.importedPaths.length!==paths.length
      ||paths.some(p=>!pin.importedPaths.some(n=>norm(n)===norm(p)))
      ||new Set(pin.importedPaths.map(norm)).size!==paths.length)
      throw Error('F2_H1_IMPORT_CLOSURE_UNAPPROVED');
    const objects=[
      ...directories.map(p=>({p,directory:true})),
      ...paths.map(p=>({p,directory:false})),
    ];
    if(Object.keys(pin.objects).length!==objects.length
      ||objects.some(({p})=>!pin.objects[norm(p)]))
      throw Error('F2_H1_ACL_PIN_INCOMPLETE');
    const seen=new Set<string>();
    for(const {p,directory} of objects){
      const obj=reader.openExact(p,directory);
      opened.push(obj);
      const frozen=pin.objects[norm(p)]!;
      if(norm(obj.path)!==norm(p)||obj.directory!==directory
        ||!obj.canonical||!obj.isHeld()
        ||obj.volumeId!==pin.volumeId||obj.fileId!==frozen.fileId
        ||obj.ownerSid!==frozen.ownerSid
        ||obj.ownerDaclSddl!==frozen.ownerDaclSddl
        ||!obj.ownerSid||!obj.ownerDaclSddl||obj.hardlinks!==1
        ||obj.reparse)throw Error('F2_H1_STAGE_IDENTITY_ACL_MISMATCH');
      const identity=obj.volumeId+':'+obj.fileId;
      if(seen.has(identity))throw Error('F2_H1_HARDLINK_ALIAS');
      seen.add(identity);
      if(!directory){
        const frozenFile=F2H1_FROZEN_STAGE_FILES.find(f=>f.path===p)!;
        const bytes=obj.readPinnedBytes();
        if(bytes.length>64*1024
           ||createHash('sha256').update(bytes).digest('hex')!==frozenFile.sha256)
          throw Error('F2_H1_HELD_FILE_BYTES_CHANGED');
      }
    }
    if(opened.some(o=>!o.isHeld()))throw Error('F2_H1_HELD_OBJECT_LOST');
    return Object.freeze({acceptedForCodeReview:true,nativeAuthorization:false as const,
      stillHeld:()=>!done&&opened.length>0&&opened.every(o=>o.isHeld()),release});
  }catch{
    if(!release())throw Error('F2_H1_STAGE_CLEANUP_UNCONFIRMED_QUARANTINE');
    return Object.freeze({acceptedForCodeReview:false,nativeAuthorization:false as const,
      stillHeld:()=>false,release:()=>false});
  }
}

/** Factory cannot silently enroll the observed owner/DACL as its own pin. */
export function createF2H1WindowsHeldStageAttestor():PrivateMvpSyntheticStageAttestor {
  return Object.freeze({
    async attest(){
      if(!APPROVED_H1_STAGE_ACL_ENROLLMENT||!F2H1_NATIVE_STAGE_AUTHORIZED)
        throw Error('F2_H1_OWNER_ACL_ENROLLMENT_MISSING');
      throw Error('F2_H1_NATIVE_STAGE_PROOF_UNAVAILABLE');
    },
  });
}

/** Lazy Windows read-only handle adapter. Binding alone does not open files.
 * GetFileInformationByHandleEx, GetSecurityInfo, and SDDL are direct OS calls;
 * no ACL creation/mutation, and nothing executes at import/test time.
 * Actual ABI correctness has NOT been demonstrated by native tests.
 */
export function bindF2H1WindowsHeldStageReader():F2H1HeldKernelStageReader {
  if(process.platform!=='win32'||process.arch!=='x64')
    throw Error('F2_H1_WIN32_X64_REQUIRED');
  const k=koffi.load('kernel32.dll'),a=koffi.load('advapi32.dll');
  const fn=(lib:typeof k,n:string,r:string,args:any[])=>
    lib.func('__stdcall',n,r,args);
  const open=fn(k,'CreateFileW','void *',['str16','uint32','uint32','void *','uint32','uint32','void *']);
  const close=fn(k,'CloseHandle','bool',['void *']);
  const info=fn(k,'GetFileInformationByHandleEx','bool',['void *','uint32','void *','uint32']);
  const finalPath=fn(k,'GetFinalPathNameByHandleW','uint32',['void *','void *','uint32','uint32']);
  const read=fn(k,'ReadFile','bool',['void *','void *','uint32',
    koffi.out(koffi.pointer('uint32')),'void *']);
  const getSecurity=fn(a,'GetSecurityInfo','uint32',['void *','uint32','uint32',
    koffi.out(koffi.pointer('void *')),'void *',koffi.out(koffi.pointer('void *')),
    'void *',koffi.out(koffi.pointer('void *'))]);
  const getSid=fn(a,'ConvertSidToStringSidW','bool',
    ['void *',koffi.out(koffi.pointer('void *'))]);
  const getSddl=fn(a,'ConvertSecurityDescriptorToStringSecurityDescriptorW','bool',
    ['void *','uint32','uint32',koffi.out(koffi.pointer('void *')),
      koffi.out(koffi.pointer('uint32'))]);
  const free=fn(k,'LocalFree','void *',['void *']);
  const FILE_ID=koffi.struct('SUD_H1_FILE_ID',{
    VolumeSerialNumber:'uint64',FileId:koffi.array('uint8',16)});
  const STANDARD=koffi.struct('SUD_H1_FILE_STANDARD',{
    AllocationSize:'int64',EndOfFile:'int64',NumberOfLinks:'uint32',
    DeletePending:'uint8',Directory:'uint8'});
  const TAG=koffi.struct('SUD_H1_FILE_TAG',{FileAttributes:'uint32',ReparseTag:'uint32'});
  function query(handle:bigint,klass:number,type:any):any{
    const out=koffi.alloc(type,1);
    try{if(info(handle,klass,out,koffi.sizeof(type))!==true)
        throw Error('F2_H1_FILE_INFO_UNAVAILABLE');
      return koffi.decode(out,type);
    }finally{koffi.free(out);}
  }
  return Object.freeze({
    openExact(p:string,directory:boolean):F2H1HeldKernelStageObject {
      if(![...directories,...F2H1_FROZEN_STAGE_FILES.map(f=>f.path)].includes(p))
        throw Error('F2_H1_UNPINNED_FILE');
      // READ_CONTROL, FILE_READ_DATA, FILE_READ_ATTRIBUTES, SYNCHRONIZE;
      // no sharing write or delete; open REPARSE_POINT itself, never follow.
      const raw=open(p,0x120081,1,null,3,0x00200000|0x02000000,null);
      const handle=BigInt(raw as number|bigint);
      if(handle===0n||handle===0xffffffffffffffffn)
        throw Error('F2_H1_NATIVE_OPEN_FAILED');
      let live=true;
      try {
        const file=query(handle,18,FILE_ID);
        const standard=query(handle,5,STANDARD);
        const tag=query(handle,9,TAG);
        const buf=Buffer.alloc(32768*2);
        const len=Number(finalPath(handle,buf,32768,0));
        if(len<4||len>=32768)throw Error('F2_H1_UNRESOLVED_OBJECT_PATH');
        const actual=buf.subarray(0,len*2).toString('utf16le').replace(/^\\\\\?\\/,'');
        const sid=[null],dacl=[null],sd=[null];
        if(getSecurity(handle,1,5,sid,null,dacl,null,sd)!==0
          ||!sid[0]||!dacl[0]||!sd[0])throw Error('F2_H1_ACL_UNAVAILABLE');
        let ownerSid='',ownerDaclSddl='';
        try {
          const sidText=[null],sdText=[null],n=[0];
          if(!getSid(sid[0],sidText)||!sidText[0])throw Error('F2_H1_BAD_SID');
          try{ownerSid=koffi.decode(sidText[0],'str16');}finally{free(sidText[0]);}
          if(!getSddl(sd[0],1,5,sdText,n)||!sdText[0])throw Error('F2_H1_BAD_SDDL');
          try{ownerDaclSddl=koffi.decode(sdText[0],'str16');}finally{free(sdText[0]);}
        }finally{free(sd[0]);}
        const identity=Buffer.from(file.FileId).toString('hex');
        return Object.freeze<F2H1HeldKernelStageObject>({
          path:p,directory,volumeId:BigInt(file.VolumeSerialNumber).toString(16),
          fileId:identity,hardlinks:Number(standard.NumberOfLinks),
          reparse:(Number(tag.FileAttributes)&0x400)!==0,
          ownerSid,ownerDaclSddl,
          canonical:norm(actual)===norm(p),
          isHeld(){
            if(!live)return false;
            try {
              const fresh=query(handle,18,FILE_ID);
              return BigInt(fresh.VolumeSerialNumber)===BigInt(file.VolumeSerialNumber)
                && Buffer.from(fresh.FileId).toString('hex')===identity;
            }catch{return false;}
          },
          readPinnedBytes(){
            if(!live||directory)throw Error('F2_H1_FILE_NOT_READABLE');
            const buffer=Buffer.alloc(65537),got=[0];
            if(read(handle,buffer,buffer.length,got,null)!==true)
              throw Error('F2_H1_FILE_READ_FAILED');
            return buffer.subarray(0,got[0]);
          },
          close(){
            if(!live)return false;
            if(close(handle)!==true)return false;
            live=false;return true;
          },
        });
      }catch{
        if(live&&close(handle)!==true)
          throw Error('F2_H1_FILE_CLOSE_UNCONFIRMED_QUARANTINE');
        throw Error('F2_H1_STAGE_NATIVE_ATTEST_FAILED');
      }
    },
  });
}
