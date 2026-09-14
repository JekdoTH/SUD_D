import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkMemoryRepository,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  openDatabase,
  type Db,
  type GitSafetyAdapter,
} from '@sud-d/infrastructure';
import { ok } from '@sud-d/domain';
import { createApprovalCoordinator, createApprovalService } from '@sud-d/application';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';

const acceptanceEnabled = process.env.SUD_D_WORK_MEMORY_ACCEPTANCE === '1';
const live = acceptanceEnabled ? it : it.skip;
const roots: string[] = [];
const dbs: Db[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) { try { db.close(); } catch { /* best effort */ } }
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});
function canonical(value: string): string { const result = canonicalizePath(value); if (!result.ok) throw new Error('canonicalize'); return result.value; }
const gitSafety: GitSafetyAdapter = {
  inspectWorkspaceGit: () => { throw new Error('unexpected git workflow'); },
  initialize: () => { throw new Error('unexpected git workflow'); },
  configureRemote: () => { throw new Error('unexpected git workflow'); },
  resolveDefaultBranch: () => { throw new Error('unexpected git workflow'); },
  relation: () => { throw new Error('unexpected git workflow'); },
  createBranch: () => { throw new Error('unexpected git workflow'); },
  switchBranch: () => { throw new Error('unexpected git workflow'); },
  mergeBranch: () => { throw new Error('unexpected git workflow'); },
  deleteBranch: () => { throw new Error('unexpected git workflow'); },
  detect: () => ok({ isRepository: true, isSupported: true, headSha: 'a'.repeat(40), branch: 'master', detached: false, state: 'normal' }),
  status: () => ok({ headSha: 'a'.repeat(40), branch: 'master', detached: false, clean: true, entries: [], truncated: false, state: 'normal', statusId: 'b'.repeat(64) }),
  diff: () => ok({ patch: '', bytes: 0, truncated: false, omittedSensitivePaths: [] }),
  diffApprovedSensitive: () => ok({ patch: '', bytes: 0, truncated: false, omittedSensitivePaths: [] }),
  checkpoint: () => ok({ created: false, reason: 'NO_CHANGES' }),
  checkpointApprovedSensitive: () => ok({ created: false, reason: 'NO_CHANGES' }),
  commit: () => { throw new Error('unexpected commit'); },
  commitApprovedSensitive: () => { throw new Error('unexpected commit'); },
  diffCheck: () => ok({ passed: true, findingCount: 0, output: 'git diff --check passed' }),
  secretScan: () => ok({ passed: true, findingCount: 0, output: 'secret signature scan passed' }),
};
interface RpcMessage { readonly result?: { readonly instructions?: string; readonly tools?: Array<{ readonly name?: string }>; readonly content?: Array<{ readonly type?: string; readonly text?: string }>; readonly isError?: boolean }; }
function reader(output: PassThrough) {
  let buffer = ''; const queue: RpcMessage[] = []; const waiters: Array<(m: RpcMessage) => void> = [];
  output.setEncoding('utf8'); output.on('data', (chunk: string) => { buffer += chunk; for (;;) { const i=buffer.indexOf('\n'); if(i<0) break; const line=buffer.slice(0,i).trim(); buffer=buffer.slice(i+1); if(!line) continue; const msg=JSON.parse(line) as RpcMessage; const w=waiters.shift(); if(w) w(msg); else queue.push(msg); } });
  return { next: () => { const q=queue.shift(); return q ? Promise.resolve(q) : new Promise<RpcMessage>((resolve)=>waiters.push(resolve)); } };
}
function payload(message: RpcMessage): Record<string, unknown> { const text=message.result?.content?.find((item)=>item.type==='text')?.text; return text ? JSON.parse(text) as Record<string, unknown> : {}; }
async function connect(server: ReturnType<typeof createProductionMcpServer>) {
  const input=new PassThrough(); const output=new PassThrough(); const r=reader(output); await server.connect(createStdioGatewayTransport(input,output)); let id=0;
  const send=(m:unknown)=>input.write(`${JSON.stringify(m)}\n`);
  send({jsonrpc:'2.0',id:++id,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'work-memory-test',version:'1'}}}); const initialized=await r.next(); send({jsonrpc:'2.0',method:'notifications/initialized',params:{}});
  const call=async(name:string,args:Record<string,unknown>)=>{send({jsonrpc:'2.0',id:++id,method:'tools/call',params:{name,arguments:args}}); return r.next();};
  const list=async()=>{send({jsonrpc:'2.0',id:++id,method:'tools/list',params:{}}); return r.next();};
  return { initialized, call, list };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}
function initGit(root: string): void {
  git(root, 'init'); git(root, 'config', 'user.email', 'work-memory@example.invalid'); git(root, 'config', 'user.name', 'Work Memory Acceptance');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n', 'utf8');
  fs.writeFileSync(path.join(root, 'tool.txt'), 'RAW_TOOL_OUTPUT_SENTINEL\n', 'utf8');
  git(root, 'add', 'README.md', 'tool.txt'); git(root, 'commit', '-m', 'fixture');
}
function approvalId(value: Record<string, unknown>): string {
  const id=value['approvalRequestId']; if(typeof id!=='string') throw new Error('approval id missing'); return id;
}

describe('Work Memory production MCP bootstrap', () => {
  it('exposes 27 tools and resets bootstrap for a new server while persisted Resume Context survives', async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'sud-d-work-prod-')); roots.push(root); const wsRoot=path.join(root,'workspace'); fs.mkdirSync(wsRoot);
    const db=openDatabase(path.join(root,'state.db')); dbs.push(db); const workspaceRepo=createWorkspaceRepository(db); const ws=workspaceRepo.save('A',canonical(wsRoot)); workspaceRepo.setActive(ws.id); const auditRepo=createAuditRepository(db); const workMemoryRepo=createWorkMemoryRepository(db);
    const make=()=>createProductionMcpServer({ workspaceRepo,auditRepo,internalRoots:[],fileSystem:createWorkspaceTextFileSystem(),gitSafety,teamRepo:createTeamRepository(db),teamTransitionUow:createTeamTransitionUnitOfWork(db),semanticRead:{read:async()=>({content:[]})},semanticWrite:{write:async()=>({content:[]})},restrictedVerify:{run:async(_c,r)=>({action:r.action,passed:true,exitCode:0,output:'',truncated:false,durationMs:1})},workMemoryRepo });

    const serverA=make(); const a=await connect(serverA);
    expect(a.initialized.result?.instructions).toContain('work.resume');
    const listed=await a.list(); const names=(listed.result?.tools??[]).map((t)=>t.name).filter((v):v is string=>typeof v==='string').sort(); expect(names).toHaveLength(27); expect(names).toContain('work.resume'); expect(names).toContain('work.checkpoint');
    expect(payload(await a.call('git.status',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    expect(payload(await a.call('work.resume',{}))).toMatchObject({ok:true,code:'EXECUTED',value:{workspaceId:ws.id}});
    expect(payload(await a.call('git.status',{}))).toMatchObject({ok:true,code:'EXECUTED'});
    const checkpoint={goal:'Ship Work Memory',task:{title:'Production bootstrap',status:'in_progress'},completed:['domain'],decisions:['bounded'],blockers:[],nextAction:'Restart server',artifacts:[],verification:['focused']};
    expect(payload(await a.call('work.checkpoint',checkpoint))).toMatchObject({ok:true,code:'EXECUTED',value:{context:{goal:'Ship Work Memory'}}});
    await serverA.close();

    const serverB=make(); const b=await connect(serverB);
    expect(payload(await b.call('git.status',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    expect(payload(await b.call('work.resume',{}))).toMatchObject({ok:true,value:{context:{goal:'Ship Work Memory',nextAction:'Restart server'}}});
    expect(payload(await b.call('git.status',{}))).toMatchObject({ok:true,code:'EXECUTED'});
    await serverB.close();
  });

  live('proves restart continuity, Workspace isolation, Git drift, unchanged Approval, and safe persistence on Home-PC', async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'sud-d-work-accept-')); roots.push(root);
    const aRoot=path.join(root,'workspace-a'); const bRoot=path.join(root,'workspace-b'); fs.mkdirSync(aRoot); fs.mkdirSync(bRoot); initGit(aRoot); initGit(bRoot);
    fs.mkdirSync(path.join(aRoot,'.serena')); fs.writeFileSync(path.join(aRoot,'.serena','local.txt'),'LOCAL_ONLY_SENTINEL','utf8');
    const db=openDatabase(path.join(root,'state.db')); dbs.push(db); const workspaceRepo=createWorkspaceRepository(db);
    const wsA=workspaceRepo.save('A',canonical(aRoot)); const wsB=workspaceRepo.save('B',canonical(bRoot)); workspaceRepo.setActive(wsA.id);
    const auditRepo=createAuditRepository(db); const workMemoryRepo=createWorkMemoryRepository(db); const approvalRepo=createApprovalRepository(db);
    const approval=createApprovalCoordinator({ repository: approvalRepo, runtimeInstanceId:'work-memory-acceptance', hmacKey:Buffer.alloc(32,61) });
    const approvalService=createApprovalService(approvalRepo,auditRepo); const verifyCalls:string[]=[];
    const make=(gitSafetyOverride: GitSafetyAdapter=createGitSafetyAdapter())=>createProductionMcpServer({ workspaceRepo,auditRepo,internalRoots:[],fileSystem:createWorkspaceTextFileSystem(),gitSafety:gitSafetyOverride,teamRepo:createTeamRepository(db),teamTransitionUow:createTeamTransitionUnitOfWork(db),
      semanticRead:{read:async()=>({content:[{type:'text',text:'RAW_SERENA_OUTPUT_SENTINEL'}]})}, semanticWrite:{write:async()=>({content:[]})},
      restrictedVerify:{run:async(_c,r)=>{verifyCalls.push(r.action); return {action:r.action,passed:true,exitCode:0,output:'RAW_VERIFY_OUTPUT_SENTINEL',truncated:false,durationMs:1};}}, workMemoryRepo, approval });
    const checkpoint={goal:'Ship Work Memory',task:{title:'Resume safely',status:'in_progress'},completed:['domain','repository'],decisions:['bounded local state'],blockers:['none'],nextAction:'Restart session',artifacts:['README.md'],verification:['focused passes']};

    const serverA=make(); const a=await connect(serverA);
    expect(payload(await a.call('git.status',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    expect(payload(await a.call('work.resume',{}))).toMatchObject({ok:true,code:'EXECUTED',value:{workspaceId:wsA.id}});
    expect((await a.call('work.checkpoint',{...checkpoint,transcript:'RAW_CHAT_SENTINEL'})).result?.isError).toBe(true);
    expect((await a.call('work.checkpoint',{...checkpoint,verifyOutput:'RAW_VERIFY_FIELD_SENTINEL'})).result?.isError).toBe(true);
    expect(payload(await a.call('work.checkpoint',{...checkpoint,decisions:['TOKEN=RAW_WORK_MEMORY_SECRET_SENTINEL']}))).toMatchObject({ok:false,code:'INVALID_INPUT'});
    expect(payload(await a.call('work.checkpoint',checkpoint))).toMatchObject({ok:true,code:'EXECUTED',value:{context:{goal:'Ship Work Memory',nextAction:'Restart session'}}});
    expect(payload(await a.call('workspace.read_text',{relativePath:'tool.txt'}))).toMatchObject({ok:true,code:'EXECUTED'});
    expect(payload(await a.call('code.overview',{relativePath:'README.md'}))).toMatchObject({ok:true,code:'EXECUTED'});
    const verifyBefore=payload(await a.call('verify.run',{action:'test'})); expect(verifyBefore).toMatchObject({ok:false,code:'APPROVAL_REQUIRED',policyDecision:'ask'}); expect(verifyCalls).toHaveLength(0);
    const requestId=approvalId(verifyBefore); expect(approvalService.respond(requestId,'approve')).toMatchObject({ok:true,value:{status:'approved'}});
    expect(payload(await a.call('verify.run',{action:'test'}))).toMatchObject({ok:true,code:'EXECUTED',policyDecision:'ask',approvalDecision:'approved'}); expect(verifyCalls).toEqual(['test']);
    await serverA.close();

    const serverB=make(); const b=await connect(serverB);
    expect(payload(await b.call('git.status',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    const resumed=payload(await b.call('work.resume',{})); expect(resumed).toMatchObject({ok:true,value:{context:{goal:'Ship Work Memory',task:{title:'Resume safely'},nextAction:'Restart session'},git:{supported:true,drifted:false}}});
    const headBefore=git(aRoot,'rev-parse','HEAD'); fs.writeFileSync(path.join(aRoot,'README.md'),'changed\n','utf8'); const statusBefore=git(aRoot,'status','--porcelain=v1');
    const drifted=payload(await b.call('work.resume',{})); expect(drifted).toMatchObject({ok:true,value:{git:{supported:true,drifted:true,headChanged:false,statusChanged:true}}});
    expect(git(aRoot,'rev-parse','HEAD')).toBe(headBefore); expect(git(aRoot,'status','--porcelain=v1')).toBe(statusBefore);
    await serverB.close();

    const longPath=`${'x'.repeat(1_025)}.ts`;
    const pathologicalPaths=[longPath,...Array.from({length:49},(_,index)=>`src/${String(index).padStart(2,'0')}-${'p'.repeat(700)}.ts`)];
    const pathologicalGit: GitSafetyAdapter={...gitSafety,status:()=>ok({headSha:'a'.repeat(40),branch:'master',detached:false,clean:false,state:'normal',statusId:'c'.repeat(64),truncated:false,entries:pathologicalPaths.map((relativePath)=>({path:relativePath,kind:'modified' as const,staged:false,unstaged:true,untracked:false,sensitive:false,gitlink:false}))})};
    const largeCheckpoint={goal:'g'.repeat(2_000),task:{title:'t'.repeat(1_000),status:'in_progress'},completed:Array(20).fill('c'.repeat(500)),decisions:Array(20).fill('d'.repeat(500)),blockers:Array(10).fill('b'.repeat(500)),nextAction:'n'.repeat(1_000),artifacts:[],verification:Array(20).fill('v'.repeat(500))};
    const serverC=make(pathologicalGit); const c=await connect(serverC); expect(payload(await c.call('work.resume',{}))).toMatchObject({ok:true,value:{workspaceId:wsA.id}});
    const bounded=payload(await c.call('work.checkpoint',largeCheckpoint)); expect(bounded).toMatchObject({ok:true,code:'EXECUTED'});
    const boundedContext=(bounded['value'] as {context:Record<string,unknown>}).context; const boundedArtifacts=boundedContext['artifacts'] as string[];
    expect(boundedArtifacts.length).toBeGreaterThan(0); expect(boundedArtifacts.every((value)=>value.length<=1_024)).toBe(true); expect(boundedArtifacts).not.toContain(longPath);
    const semantic={goal:boundedContext['goal'],task:boundedContext['task'],completed:boundedContext['completed'],decisions:boundedContext['decisions'],blockers:boundedContext['blockers'],nextAction:boundedContext['nextAction'],artifacts:boundedArtifacts,verification:boundedContext['verification']};
    expect(Buffer.byteLength(JSON.stringify(semantic),'utf8')).toBeLessThanOrEqual(64*1024); await serverC.close();

    const serverD=make(pathologicalGit); const d=await connect(serverD); const restartedBounded=payload(await d.call('work.resume',{})); expect(restartedBounded).toMatchObject({ok:true,value:{context:{goal:'g'.repeat(2_000)}}});
    workspaceRepo.setActive(wsB.id);
    expect(payload(await d.call('git.status',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
    const resumeB=payload(await d.call('work.resume',{})); expect(resumeB).toMatchObject({ok:true,value:{workspaceId:wsB.id}}); expect(JSON.stringify(resumeB)).not.toContain('Ship Work Memory');
    const aStored=workMemoryRepo.loadCurrent(wsA.id); const bStored=workMemoryRepo.loadCurrent(wsB.id); expect(aStored.ok&&aStored.value?.goal).toBe('g'.repeat(2_000)); expect(bStored).toEqual({ok:true,value:undefined});
    const persisted=JSON.stringify({
      work: db.prepare('SELECT * FROM work_memory_checkpoints').all(),
      audit: db.prepare('SELECT * FROM audit_events').all(),
    });
    expect(persisted).not.toMatch(/RAW_CHAT_SENTINEL|RAW_VERIFY_FIELD_SENTINEL|RAW_WORK_MEMORY_SECRET_SENTINEL|RAW_VERIFY_OUTPUT_SENTINEL|RAW_SERENA_OUTPUT_SENTINEL|RAW_TOOL_OUTPUT_SENTINEL/);
    expect(fs.readFileSync(path.join(aRoot,'.serena','local.txt'),'utf8')).toBe('LOCAL_ONLY_SENTINEL');
    await serverD.close();
  }, 30_000);
});
