import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../infrastructure/src/database.js';
import { createWorkspaceRepository } from '../../infrastructure/src/workspace-repository.js';
import { createWorkMemoryRepository } from '../../infrastructure/src/work-memory-repository.js';
import { createWorkMemoryService } from '../../application/src/work-memory-service.js';
import { createWorkResumeGuardedToolKernel } from '../../application/src/work-resume-guard.js';
import { ok, type AuditEvent } from '../../domain/src/index.js';
import type { ToolKernel } from '../../application/src/tool-kernel.js';
import type { WorkspaceRepository } from '../../infrastructure/src/workspace-repository.js';

const clock = new Date('2026-10-15T01:00:00.000Z');
const gitSafety = {
  detect: () => ok({isRepository:false,isSupported:false,headSha:undefined,branch:undefined,detached:false,state:'normal'}),
} as never;
function fixture() {
  const db = openDatabase(':memory:');
  const workspaceRepo=createWorkspaceRepository(db);
  const first=workspaceRepo.save('A','C:/sud-d-g2a-A');
  const second=workspaceRepo.save('B','C:/sud-d-g2a-B');
  workspaceRepo.setActive(first.id);
  const memory=createWorkMemoryRepository(db);
  const events:Array<Omit<AuditEvent,'id'>>=[];
  let invocations=0;
  const kernel: ToolKernel = {invoke:async()=>{
    invocations++;
    return {ok:false,outcome:'blocked',code:'UNKNOWN_CAPABILITY'};
  }};
  function make(repo:WorkspaceRepository=workspaceRepo,withReader=true,failAudit=false) {
    const workMemory=createWorkMemoryService({
      repository:memory,gitSafety,
      clock:()=>clock,
      ...(withReader?{getWorkspaceGeneration:(id:string)=>repo.getGeneration(id)}:{}),
    });
    const guard=createWorkResumeGuardedToolKernel({kernel,workspaceRepo:repo,workMemory,
      audit:{append:(event)=>{
        if(failAudit)throw Error('SYNTHETIC_AUDIT_DENY');
        events.push(event);
      }}});
    return {workMemory,guard};
  }
  const session={id:'g2a-session',type:'mcp-stdio' as const};
  const invoke=(guard:ToolKernel,sessionId=session.id)=>
    guard.invoke({invocationId:'solo-test-invoke',session:{id:sessionId,type:'mcp-stdio'},
      capability:'solo_expert.smoke',input:{}});
  return {db,workspaceRepo,first,second,events,make,session,invoke,get invocations(){return invocations;}};
}

describe('G2a Solo resume: real SQLite Workspace generation and fail-closed admission',()=>{
  it('requires real Resume and DB reader and audits denial before invoking Kernel',async()=>{
    const f=fixture();
    try {
      const gate=f.make();
      expect(await f.invoke(gate.guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      expect(f.invocations).toBe(0);
      expect(f.events).toMatchObject([{resultCode:'WORK_RESUME_REQUIRED',sessionId:f.session.id}]);
      expect(gate.workMemory.resume(f.session,f.first).ok).toBe(true);
      expect((await f.invoke(gate.guard)).code).toBe('UNKNOWN_CAPABILITY');
      expect(f.invocations).toBe(1);
      const missing=f.make(f.workspaceRepo,false);
      expect(missing.workMemory.resume(f.session,f.first).ok).toBe(true);
      expect(await f.invoke(missing.guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      expect(f.invocations).toBe(1);
    } finally {f.db.close();}
  });
  it('same-clock A → B → A increments generation and requires a new Resume',async()=>{
    const f=fixture();
    try {
      const gate=f.make();
      expect(gate.workMemory.resume(f.session,f.first).ok).toBe(true);
      expect((await f.invoke(gate.guard)).code).toBe('UNKNOWN_CAPABILITY');
      const g=f.workspaceRepo.getGeneration(f.first.id);
      f.workspaceRepo.setActive(f.second.id);
      expect(await f.invoke(gate.guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      f.workspaceRepo.setActive(f.first.id);
      expect(Number(f.workspaceRepo.getGeneration(f.first.id))).toBeGreaterThan(Number(g));
      expect(await f.invoke(gate.guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      expect(gate.workMemory.resume(f.session,f.first).ok).toBe(true);
      expect((await f.invoke(gate.guard)).code).toBe('UNKNOWN_CAPABILITY');
      expect(await f.invoke(gate.guard,'new-session')).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      const restart=f.make();
      expect(await f.invoke(restart.guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    } finally {f.db.close();}
  });
  it('fails closed on zero/multiple active Workspaces, database exceptions and audit exceptions',async()=>{
    const f=fixture();
    try{
      const gate=f.make();
      expect(gate.workMemory.resume(f.session,f.first).ok).toBe(true);
      const noActive={...f.workspaceRepo,list:()=>[]} as WorkspaceRepository;
      const multiple={...f.workspaceRepo,list:()=>[{...f.first,isActive:true},{...f.second,isActive:true}]} as WorkspaceRepository;
      const failingList={...f.workspaceRepo,list:():never=>{throw Error('synthetic DB read');}} as WorkspaceRepository;
      const failingGeneration={...f.workspaceRepo,getGeneration:():never=>{throw Error('synthetic DB generation');}} as WorkspaceRepository;
      for(const bad of [noActive,multiple,failingList,failingGeneration]) {
        expect(await f.invoke(f.make(bad).guard)).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      }
      expect(f.invocations).toBe(0);
      expect(await f.invoke(f.make(f.workspaceRepo,true,true).guard)).toMatchObject({ok:false,code:'AUDIT_PRECONDITION_FAILED'});
      expect(f.invocations).toBe(0);
    }finally{f.db.close();}
  });
});
