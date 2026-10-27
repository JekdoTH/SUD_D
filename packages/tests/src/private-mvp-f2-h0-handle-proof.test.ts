import {describe,expect,it,vi} from 'vitest';
import { inspectAndRestrictF2H0GatewayTransfer, type F2H0GatewayHandleSyscalls } from '@sud-d/infrastructure';
function fake() {
  const closed:bigint[]=[];
  let parent=83, threadParent=83, inherit=false, failed=false;
  const os:F2H0GatewayHandleSyscalls = {
    restrictedLocalDuplicate:vi.fn((h,mask)=>{
      if(failed) throw Error('DuplicateHandle denied');
      expect(mask).toBe(h===31n?0x101001:0x100802);
      return h===31n?131n:132n;
    }),
    closeLocal:vi.fn((h)=>{closed.push(h);return true;}),
    inherited:vi.fn(()=>inherit),
    processId:vi.fn(()=>parent),
    threadProcessId:vi.fn(()=>threadParent),
    threadId:vi.fn(()=>71),
    processInOwnedJob:vi.fn(()=>true),
  };
  return {os,closed,setParent:(v:number)=>{parent=v;},
    setThreadParent:(v:number)=>{threadParent=v;},
    setInherit:(v:boolean)=>{inherit=v;}, setFailed:(v:boolean)=>{failed=v;}};
}
describe('F2-H0 OS handle proof: Win32 syscall-mocked only',()=>{
  it('accepts only restricted non-inheritable Gateway-local process/thread handles in the same Job',()=>{
    const f=fake();
    const result=inspectAndRestrictF2H0GatewayTransfer(f.os,{process:31n,thread:32n});
    expect(result).toEqual([
      {role:'root-process',objectId:'proc:83',value:131n,access:0x101001,inheritable:false,owner:'gateway'},
      {role:'root-thread',objectId:'thread:83:71',value:132n,access:0x100802,inheritable:false,owner:'gateway'},
    ]);
    expect(f.closed).toEqual([31n,32n]);
  });
  it('refuses untrusted receipt null/pseudo/colliding handles before any OS duplicate',()=>{
    for(const receipt of [
      {process:0n,thread:32n},{process:-1n,thread:32n},
      {process:31n,thread:31n},
      {process:0xffffffffffffffffn,thread:32n},
    ]) {
      const f=fake();
      expect(()=>inspectAndRestrictF2H0GatewayTransfer(f.os,receipt)).toThrow();
      expect(f.os.restrictedLocalDuplicate).not.toHaveBeenCalled();
    }
  });
  it('rejects OS child/thread identity disagreement and inheritable transferred handles',()=>{
    for(const fault of ['pid','inherit','job'] ) {
      const f=fake();
      if(fault==='pid')f.setThreadParent(84);
      if(fault==='inherit')f.setInherit(true);
      if(fault==='job')f.os.processInOwnedJob=vi.fn(()=>false);
      expect(()=>inspectAndRestrictF2H0GatewayTransfer(f.os,{process:31n,thread:32n})).toThrow();
      expect(f.closed).toContain(131n);
      expect(f.closed).toContain(132n);
    }
  });
  it('rejects failed duplication and closes safely acquired partial handles',()=>{
    const f=fake();
    f.os.restrictedLocalDuplicate=vi.fn((h)=> {
      if(h===32n)throw Error('dup thread failed');
      return 131n;
    });
    expect(()=>inspectAndRestrictF2H0GatewayTransfer(f.os,{process:31n,thread:32n})).toThrow();
    expect(f.closed).toContain(131n);
  });
});
