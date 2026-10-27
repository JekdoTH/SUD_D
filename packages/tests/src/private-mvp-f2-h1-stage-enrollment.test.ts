import {describe,expect,it} from 'vitest';
import path from 'node:path';
import {sealF2H1StageEnrollmentForReview,F2H1_STAGE_POLICY_REVISION,F2H1_STAGE_ROLE_TEMPLATE_SHA256,F2H1_FIXED_STAGE_DIRECTORIES,F2H1_FROZEN_STAGE_FILES,F2B2_FIXED_PROOF} from '@sud-d/infrastructure';
const dirs=[...F2H1_FIXED_STAGE_DIRECTORIES];
const files=F2H1_FROZEN_STAGE_FILES.map(f=>f.path);
const norm=(p:string)=>path.win32.normalize(p).toLowerCase();

describe('H1 two-phase immutable ACL template vs OS-generated FileIDs — code review only',()=>{
  function values(){
    const paths=[...dirs,...files];
    const ownerSid='S-1-5-21-123';
    const acl='O:SYD:P(A;;FR;;;SY)';
    const template={
      revision:F2H1_STAGE_POLICY_REVISION,
      roleTemplateDigest:F2H1_STAGE_ROLE_TEMPLATE_SHA256,
      profileName:F2B2_FIXED_PROOF.profile,
      expectedOwnerSid:ownerSid,
      aclSddlByPath:Object.fromEntries(paths.map(p=>[norm(p),acl])),
      profileAclSddl:'O:SYD:P(A;;FR;;;SY)(A;;FR;;;AC)',
    };
    const observed={
      volumeId:'ab',
      profileSid:'S-1-15-2-123',
      profileAclSddl:template.profileAclSddl,
      importedPaths:[...files],
      objects:Object.fromEntries(paths.map((p,i)=>[norm(p),{
        volumeId:'ab',fileId:i.toString(16).padStart(32,'0'),
        ownerSid,ownerDaclSddl:acl,hardlinks:1,reparse:false,
      }])),
    };
    return {template,observed};
  }
  it('cannot enroll observed ACL as a template or operate with missing policy',()=>{
    const v=values();
    expect(sealF2H1StageEnrollmentForReview(null,v.observed))
      .toMatchObject({acceptedForCodeReview:false,nativeAuthorization:false,reason:'policy-not-reviewed'});
  });
  it('separates fixed reviewed ACL policy from OS FILE_ID and AppContainer SID facts',()=>{
    const v=values();
    const result=sealF2H1StageEnrollmentForReview(v.template,v.observed);
    expect(result).toMatchObject({acceptedForCodeReview:true,nativeAuthorization:false});
    if(!result.acceptedForCodeReview)throw Error('fixture');
    expect(result.sealDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.pin.objects[norm(dirs[0]!)]?.ownerDaclSddl)
      .toBe(v.template.aclSddlByPath[norm(dirs[0]!)]);
    expect(result.pin.objects[norm(files[0]!)]?.fileId)
      .toBe(v.observed.objects[norm(files[0]!)]?.fileId);
    expect(result.nativeAuthorization).toBe(false);
  });
  it('rejects substituted ACL, missing ancestor, new import, and reused FILE_ID',()=>{
    for(const fault of ['acl','ancestor','import','alias','sid','policy']){
      const v=values();
      if(fault==='acl')v.observed.objects[norm(files[0]!)]!.ownerDaclSddl='O:UNREVIEWED';
      if(fault==='ancestor')delete v.observed.objects[norm(dirs[0]!)];
      if(fault==='import')v.observed.importedPaths.push('C:\\unreviewed-module.js');
      if(fault==='alias')v.observed.objects[norm(files[1]!)]!.fileId=v.observed.objects[norm(files[0]!)]!.fileId;
      if(fault==='sid')v.observed.profileSid='unknown';
      if(fault==='policy')v.template.roleTemplateDigest='f'.repeat(64);
      expect(sealF2H1StageEnrollmentForReview(v.template,v.observed))
        .toMatchObject({acceptedForCodeReview:false,nativeAuthorization:false});
    }
  });
});
