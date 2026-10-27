import {describe,expect,it,vi} from 'vitest';
import {
  reviewF2H1HeldStage,F2H1_FROZEN_STAGE_FILES,F2H1_FIXED_STAGE_DIRECTORIES,
  sealF2H1StageEnrollmentForReview,F2H1_STAGE_POLICY_REVISION,
  F2H1_NATIVE_STAGE_AUTHORIZED,createF2H1WindowsHeldStageAttestor,
  F2B2_FIXED_PROOF,
} from '@sud-d/infrastructure';
import path from 'node:path';

const root=F2B2_FIXED_PROOF.root;
const dirs=[...F2H1_FIXED_STAGE_DIRECTORIES];
const files=F2H1_FROZEN_STAGE_FILES.map(f=>f.path);
const norm=(p:string)=>path.win32.normalize(p).toLowerCase();
function prepare() {
  const entries=[...dirs,...files];
  const objects=Object.fromEntries(entries.map((p,i)=>[norm(p),{
    fileId:'id-'+i,ownerSid:'S-1-5-21-123',ownerDaclSddl:'O:SYD:P(A;;FR;;;SY)',
  }]));
  const pin={volumeId:'ab',objects,importedPaths:files};
  const closed:string[]=[];
  const objectsOpened:string[]=[];
  let failPath='',failClose=false,corruptAcl=false,dropHold=false;
  const reader={openExact:vi.fn((p:string,directory:boolean)=>{
    objectsOpened.push(p);
    if(failPath===p)throw Error('native-open');
    const f=objects[norm(p)]!;
    let open=true;
    return {
      path:p,directory,volumeId:'ab',fileId:f.fileId,hardlinks:1,reparse:false,
      ownerSid:f.ownerSid,
      ownerDaclSddl:corruptAcl?'O:BAD':f.ownerDaclSddl,
      canonical:true,isHeld:()=>open&&!dropHold,
      readPinnedBytes:()=>new Uint8Array(0),
      close:()=>{closed.push(p);if(failClose)return false;open=false;return true;},
    };
  })};
  return {pin,reader,closed,objectsOpened,setMissing:(x:string)=>{failPath=x;},
    badAcl:()=>{corruptAcl=true;},badLease:()=>{dropHold=true;},
    badClose:()=>{failClose=true;}};
}
describe('H1 Windows fixed held-stage identity review (native calls mocked; not proof)',()=>{
  it('refuses to open any native file without owner-frozen file/ACL enrollment',()=>{
    const f=prepare();
    expect(reviewF2H1HeldStage(f.reader,null)).toMatchObject({
      acceptedForCodeReview:false,nativeAuthorization:false});
    expect(f.reader.openExact).not.toHaveBeenCalled();
    expect(F2H1_NATIVE_STAGE_AUTHORIZED).toBe(false);
  });
  it('refuses partial dependency closure, missing ACE pin and alias before native opens',()=>{
    for(const patch of [
      (f:ReturnType<typeof prepare>)=>f.pin.importedPaths=[],
      (f:ReturnType<typeof prepare>)=>delete f.pin.objects[norm(files[1]!)],
      (f:ReturnType<typeof prepare>)=>f.pin.importedPaths=[files[0]!,files[0]!,files[2]!,files[3]!],
    ]) {
      const f=prepare();patch(f);
      const result=reviewF2H1HeldStage(f.reader,f.pin);
      expect(result.acceptedForCodeReview).toBe(false);
      expect(result.nativeAuthorization).toBe(false);
      expect(f.reader.openExact).not.toHaveBeenCalled();
    }
  });
  it('rejects kernel-observed ACL difference and releases every opened handle',()=>{
    const f=prepare();f.badAcl();
    expect(reviewF2H1HeldStage(f.reader,f.pin).acceptedForCodeReview).toBe(false);
    expect(f.closed).toEqual([dirs[0]]);
  });
  it('closes handles in reverse order when a required file cannot open',()=>{
    const f=prepare();f.setMissing(files[0]!);
    expect(reviewF2H1HeldStage(f.reader,f.pin).acceptedForCodeReview).toBe(false);
    expect(f.closed).toEqual([...dirs].reverse());
  });
  it('quarantines on any unconfirmed CloseHandle (never releases accounting)',()=>{
    const f=prepare();f.badAcl();f.badClose();
    expect(()=>reviewF2H1HeldStage(f.reader,f.pin))
      .toThrow('F2_H1_STAGE_CLEANUP_UNCONFIRMED_QUARANTINE');
  });
  it('requires live held FileID; no mock creates a native proof',()=>{
    const f=prepare();f.badLease();
    expect(reviewF2H1HeldStage(f.reader,f.pin).nativeAuthorization).toBe(false);
  });
  it('attestor remains un-enrolled, never accepts a caller-provided mock as H1 authorization',async()=>{
    const attestor=createF2H1WindowsHeldStageAttestor();
    await expect(attestor.attest()).rejects.toThrow('F2_H1_OWNER_ACL_ENROLLMENT_MISSING');
  });
});
