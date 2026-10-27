import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import type { ApprovalMode } from '../../domain/src/index.js';
import { createProductionMcpServer, createStdioGatewayTransport } from '../../mcp-gateway/src/index.js';
import { createAuditRepository } from '../../infrastructure/src/audit-repository.js';
import { createWorkspaceRepository } from '../../infrastructure/src/workspace-repository.js';
import { createWorkspaceGitSettingsRepository } from '../../infrastructure/src/workspace-git-settings-repository.js';
import { createWorkspaceTextFileSystem, type WorkspacePathOptions } from '../../infrastructure/src/workspace-text-file-system.js';
import { createTeamRepository } from '../../infrastructure/src/team-repository.js';
import { createTeamTransitionUnitOfWork } from '../../infrastructure/src/team-transition-unit-of-work.js';
import { createWorkMemoryRepository } from '../../infrastructure/src/work-memory-repository.js';
import { ok } from '../../domain/src/index.js';
import { type AuditEvent } from '@sud-d/domain';
import { openDatabase } from '../../infrastructure/src/database.js';
import { createApprovalRepository } from '../../infrastructure/src/approval-repository.js';
import { createSoloExpertAttemptRepository } from '../../infrastructure/src/solo-expert-serena-attempt-repository.js';
import { createApprovalCoordinator, createApprovalService } from '../../application/src/approval-service.js';
import { createToolKernel, createToolCapabilityRegistry } from '../../application/src/tool-kernel.js';
import {
  createSoloExpertB1aIntegration,soloB1ReviewProjection,
} from '../../application/src/solo-expert-serena-integration.js';
import type { SoloExpertReview } from '../../domain/src/solo-expert-serena.js';

/** Gate 2 source-fake proof: the ACTUAL SQLite, Approval coordinator, Policy Kernel and audit
 * with a synthetic, non-production tool port. No Gateway server, process or MCP transport starts.
 */
function fixture() {
  const db=openDatabase(':memory:');
  const repo=createApprovalRepository(db);
  const ledger=createSoloExpertAttemptRepository(db);
  const now=Date.now();
  const time=()=>new Date(now);
  const coordinator=createApprovalCoordinator({
    repository:repo,runtimeInstanceId:'b1b-r3-gateway-fake',
    hmacKey:Buffer.alloc(32,29),mode:()=>'full_access',
    now:time,preserveOtherRuntimes:true,
  });
  const decision=createApprovalService(repo,{append:()=>undefined},time);
  const state={
    workspaceId:'fake-ws-1',canonicalRoot:'C:/fake-trusted-root',
    workspaceGeneration:'13',session:{id:'fake-gateway-session',type:'mcp-stdio' as const},
    resumed:true,revoked:false,policyContext:'workspace' as const,
    gatewayEpoch:'gateway-epoch-1',managedEpoch:'managed-epoch-1',
    deviceLabel:'unverified-device',deviceProvenance:'unverified-observation' as const,
    accountLabel:'unverified-account',accountProvenance:'unverified-observation' as const,
    manifestDigest:'a'.repeat(64),artifactDigest:'b'.repeat(64),
    configDigest:'c'.repeat(64),schemaDigest:'d'.repeat(64),
    integrity:'synthetic-fixture' as const,
  };
  const ready={
    workspaceId:state.workspaceId,canonicalRoot:state.canonicalRoot,
    workspaceGeneration:state.workspaceGeneration,managedEpoch:state.managedEpoch,
    manifestDigest:state.manifestDigest,artifactDigest:state.artifactDigest,
    configDigest:state.configDigest,schemaDigest:state.schemaDigest,
    integrity:state.integrity,
  };
  const events:Array<Omit<AuditEvent,'id'>>=[];
  const calls:SoloExpertReview[]=[];
  let simulatedStatus:'simulated-success'|'unknown'='simulated-success';
  let failOutcome=false;
  const integration=createSoloExpertB1aIntegration({
    identity:()=>({...state,session:{...state.session}}),
    ready:{
      inspect:()=>({...ready}),
      invoke:async review=>{
        calls.push(review);
        return simulatedStatus==='simulated-success'
          ? {executionKind:'mock' as const,status:'simulated-success' as const,reason:'OK' as const,exitCode:0}
          : {executionKind:'mock' as const,status:'unknown' as const,reason:'TRANSPORT_UNKNOWN' as const};
      },
    },
    ledger:{
      prepare:r=>ledger.prepare({
        attemptId:r.attemptId,workspaceId:r.workspaceId,workspaceGeneration:r.workspaceGeneration,
        reviewDigest:soloB1ReviewProjection(r).reviewDigest,
        createdAt:new Date(r.issuedAtMs).toISOString(),
        expiresAt:new Date(r.expiresAtMs).toISOString(),
      }),
      claim:(id,approvalId)=>ledger.claim(id,approvalId,time().toISOString()),
      close:id=>ledger.close(id),
      markUnknown:id=>ledger.markUnknown(id),
      state:id=>ledger.state(id),
    },
    approvals:{findById:id=>repo.findById(id)},
    verifyConsumedManual:async ({request,approvalRequestId})=>
      coordinator.verifyConsumedManualSolo(request,approvalRequestId)!==undefined,
    coordinatorRuntimeId:coordinator.runtimeInstanceId,
    now:()=>now,
  });
  const registry=createToolCapabilityRegistry([integration.capability]);
  if(!registry.ok)throw Error('registry');
  const audit={append:(e:Omit<AuditEvent,'id'>)=>{
    if(e.metadata.phase==='outcome' && failOutcome)throw Error('SYNTHETIC_AUDIT_FAILURE');
    events.push(e);
  }};
  const kernel=createToolKernel({registry:registry.value,audit,approval:coordinator});
  return {db,repo,ledger,decision,coordinator,integration,kernel,events,calls,state,
    failOutcome:()=>{failOutcome=true;},status:(next:'simulated-success'|'unknown')=>{simulatedStatus=next;}};
}
describe('R3 Gate 2 same-coordinator fake-only Kernel+SQLite admission',()=>{
  it('manual displayed digest → consumed Gateway HMAC → atomic SQLite claim → fake success → audit → closed',async()=>{
    const f=fixture();
    try {
      const prep=await f.integration.prepare({});
      expect(prep.ok).toBe(true);
      if(!prep.ok)throw Error('prepared');
      const review=prep.value;
      expect(await f.ledger.state(review.attemptId)).toBe('prepared');
      const pending=await f.integration.invokeThroughKernel(f.kernel,review);
      expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
      expect(f.calls).toHaveLength(0);
      if(pending.ok || !pending.approvalRequestId)throw Error('pending id');
      const r=f.repo.findById(pending.approvalRequestId);
      if(!r.ok || !r.value?.soloExpertReview)throw Error('persisted review missing');
      expect(f.decision.respond(r.value.id,'approve').ok).toBe(false);
      expect(f.decision.respond(r.value.id,'approve','a'.repeat(64)).ok).toBe(false);
      expect(f.decision.respond(r.value.id,'approve',r.value.soloExpertReview.reviewDigest).ok).toBe(true);
      const result=await f.integration.invokeThroughKernel(f.kernel,review);
      expect(result).toMatchObject({ok:true,code:'EXECUTED',value:{
        executionKind:'mock',status:'simulated-success',
      }});
      expect(await f.ledger.state(review.attemptId)).toBe('closed');
      expect(f.calls).toHaveLength(1);
      expect(f.events.some(e=>e.metadata.phase==='outcome')).toBe(true);
      expect((await f.integration.invokeThroughKernel(f.kernel,review)).ok).toBe(false);
      expect(f.calls).toHaveLength(1);
    }finally{f.db.close();}
  });
  it('ambiguous fake result quarantines UNKNOWN and blocks all new attempts, including other repository instances',async()=>{
    const f=fixture();
    try{
      f.status('unknown');
      const prep=await f.integration.prepare({});
      if(!prep.ok)throw Error('prepared');
      const pending=await f.integration.invokeThroughKernel(f.kernel,prep.value);
      if(pending.ok || !pending.approvalRequestId)throw Error('pending');
      const r=f.repo.findById(pending.approvalRequestId);
      if(!r.ok || !r.value?.soloExpertReview)throw Error('review');
      expect(f.decision.respond(r.value.id,'approve',r.value.soloExpertReview.reviewDigest).ok).toBe(true);
      expect((await f.integration.invokeThroughKernel(f.kernel,prep.value)).ok).toBe(false);
      expect(await f.ledger.state(prep.value.attemptId)).toBe('unknown');
      const again=await f.integration.prepare({});
      expect(again.ok).toBe(false);
      expect(await f.ledger.hasUnresolved()).toBe(true);
    }finally{f.db.close();}
  });
});

interface MemoryMcpMessage { readonly jsonrpc?: string; readonly id?: number; readonly result?: {
  readonly tools?: Array<{ readonly name: string }>;
  readonly content?: Array<{ readonly type: string; readonly text: string }>;
  readonly isError?: boolean;
}; readonly error?: unknown; }
async function connectMemoryMcp(server: ReturnType<typeof createProductionMcpServer>) {
  const input = new PassThrough(); const output = new PassThrough();
  const pending = new Map<number, {resolve:(message:MemoryMcpMessage)=>void;reject:(reason:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let buf = ''; let fault:Error|undefined; let lastId=0; let closed=false;
  const rejectAll = (reason: Error) => {
    fault=reason;
    for(const [id,item] of pending) {clearTimeout(item.timer);item.reject(reason);pending.delete(id);}
  };
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    buf += chunk;
    for (;;) {
      const end=buf.indexOf('\n');if(end<0)break;
      const line=buf.slice(0,end).trim();buf=buf.slice(end+1);
      if(!line)continue;
      let message:MemoryMcpMessage;
      try{message=JSON.parse(line) as MemoryMcpMessage;}catch{rejectAll(new Error('Invalid MCP JSON response'));return;}
      if(message.id===undefined)continue; // notifications have no response ID
      const item=pending.get(message.id);
      if(!item) {rejectAll(new Error('Unmatched or duplicate MCP response'));return;}
      clearTimeout(item.timer);pending.delete(message.id);item.resolve(message);
    }
  });
  await server.connect(createStdioGatewayTransport(input,output));
  const send=(method:string,params:object):Promise<MemoryMcpMessage>=>{
    if(closed||fault)return Promise.reject(fault??new Error('MCP client closed'));
    const id=++lastId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);rejectAll(new Error('MCP response timeout'));reject(new Error('MCP response timeout'));},6000);
      pending.set(id,{resolve,reject,timer});
      input.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
  };
  await send('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'g2a-synthetic',version:'1'}});
  input.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized',params:{}})+'\n');
  return {list:()=>send('tools/list',{}),
    call:(name:string,args:Record<string,unknown>)=>send('tools/call',{name,arguments:args}),
    injectUntrustedResponse:(id:number)=>output.write(JSON.stringify({jsonrpc:'2.0',id,result:{}})+'\n'),
    close:async()=>{closed=true;rejectAll(new Error('MCP test closing'));await server.close();input.destroy();output.destroy();}};
}
function mcpPayload(message: MemoryMcpMessage): Record<string,unknown> {
  const text=message.result?.content?.find(v=>v.type==='text')?.text;
  return text ? JSON.parse(text) as Record<string,unknown> : {};
}
function factoryFixture(enabled: boolean, options: {
  file?: string; mode?: ApprovalMode; failAudit?: 'pre_execution'|'outcome'; status?: 'simulated-success'|'unknown'|'throw'|'poison';
} = {}) {
  const db=openDatabase(options.file??':memory:');
  const workspaceRepo=createWorkspaceRepository(db);
  const ws=workspaceRepo.save('Synthetic','C:/sud-d-g2a-fixture');
  workspaceRepo.setActive(ws.id);
  const approvalRepo=createApprovalRepository(db);
  let now=Date.now(); const clock=()=>new Date(now);
  let mode=options.mode??'full_access';
  const coordinator=createApprovalCoordinator({repository:approvalRepo,runtimeInstanceId:'g2a-synthetic-gateway',
    hmacKey:Buffer.alloc(32,29),mode:()=>mode,now:clock,preserveOtherRuntimes:true});
  const ledger=createSoloExpertAttemptRepository(db);
  const readyReceipt={
    workspaceId:ws.id,canonicalRoot:ws.canonicalRoot,workspaceGeneration:workspaceRepo.getGeneration(ws.id)!,
    managedEpoch:'test-managed-epoch',manifestDigest:'a'.repeat(64),artifactDigest:'b'.repeat(64),
    configDigest:'c'.repeat(64),schemaDigest:'d'.repeat(64),integrity:'synthetic-fixture' as const,
  };
  const fakeCalls: SoloExpertReview[]=[];
  let readyAvailable=true;
  const forbidden={semanticRead:0,semanticWrite:0,verify:0};
  let fakeStatus=options.status??'simulated-success';
  const fake={inspect:()=>readyAvailable?({...readyReceipt}):undefined,invoke:async(review:SoloExpertReview)=>{
    fakeCalls.push(review);
    if(fakeStatus==='throw')throw Error('SYNTHETIC_POISON');
    if(fakeStatus==='poison')return {executionKind:'mock' as const,status:'unknown' as const,reason:'TRANSPORT_UNKNOWN' as const};
    return fakeStatus==='unknown'
      ? {executionKind:'mock' as const,status:'unknown' as const,reason:'TRANSPORT_UNKNOWN' as const}
      : {executionKind:'mock' as const,status:'simulated-success' as const,reason:'OK' as const,exitCode:0};
  }};
  let failAudit: 'pre_execution'|'outcome'|undefined;
  const auditEvents:Array<Omit<AuditEvent,'id'>>=[];
  const persistedAudit=createAuditRepository(db);
  const auditRepo={...persistedAudit,append:(event:Omit<AuditEvent,'id'>)=>{
    auditEvents.push(event);
    if(event.metadata?.phase===failAudit)throw Error('SYNTHETIC_AUDIT_FAILURE');
    return persistedAudit.append(event);
  }};
  const dependencies={
    workspaceRepo,auditRepo,internalRoots:[],
    fileSystem:{...createWorkspaceTextFileSystem(),
      resolveExisting:(options:WorkspacePathOptions)=>ok({canonical:options.workspaceCanonicalRoot,relative:options.relativePath})},
    gitSafety:{detect:()=>ok({isRepository:false,isSupported:false,headSha:undefined,branch:undefined,detached:false,state:'normal'})} as never,
    gitSettingsRepo:createWorkspaceGitSettingsRepository(db),
    teamRepo:createTeamRepository(db),teamTransitionUow:createTeamTransitionUnitOfWork(db),
    semanticRead:{read:async()=>{forbidden.semanticRead++;throw Error('FORBIDDEN_SEMANTIC_READ');}},
    semanticWrite:{write:async()=>{forbidden.semanticWrite++;throw Error('FORBIDDEN_SEMANTIC_WRITE');}},
    restrictedVerify:{run:async()=>{forbidden.verify++;throw Error('FORBIDDEN_VERIFY');}},
    workMemoryRepo:createWorkMemoryRepository(db),approval:coordinator,
    ...(enabled?{soloExpertFake:{coordinator,ledger,approvalRepo,ready:fake,now:()=>now}}:{}),
  };
  const server=createProductionMcpServer(dependencies);
  const decision=createApprovalService(approvalRepo,{append:()=>undefined},clock);
  return {db,server,workspaceRepo,ws,approvalRepo,coordinator,ledger,fakeCalls,clock,decision,
    readyReceipt,auditEvents,forbidden,
    restartServer:()=>createProductionMcpServer(dependencies),
    setReadyAvailable:(value:boolean)=>{readyAvailable=value;},
    setNow:(time:number)=>{now=time;},setMode:(next:ApprovalMode)=>{mode=next;},
    setFailAudit:(phase:'pre_execution'|'outcome'|undefined)=>{failAudit=phase;},
    setStatus:(next:typeof fakeStatus)=>{fakeStatus=next;}};
}
describe('G2a actual production MCP source factory — inert default and synthetic opt-in',()=>{
  it('defaults OFF; unknown MCP call never reaches fake and cannot enable Solo',async()=>{
    const f=factoryFixture(false);
    const c=await connectMemoryMcp(f.server);
    try{
      expect((await c.list()).result?.tools?.some(t=>t.name==='solo_expert.smoke')).toBe(false);
      const unknown=await c.call('solo_expert.smoke',{});
      expect(unknown.error ?? unknown.result?.isError).toBeTruthy();
      expect(f.fakeCalls).toHaveLength(0);
    }finally{await c.close();f.db.close();}
  });
  it('test-only opt-in rejects inputs, requires Resume and original human consent',async()=>{
    const f=factoryFixture(true);
    const c=await connectMemoryMcp(f.server);
    try{
      expect((await c.list()).result?.tools?.filter(t=>t.name==='solo_expert.smoke')).toHaveLength(1);
      expect(mcpPayload(await c.call('solo_expert.smoke',{}))).toMatchObject({ok:false,code:'WORK_RESUME_REQUIRED'});
      expect(f.fakeCalls).toHaveLength(0);
      expect(mcpPayload(await c.call('work.resume',{}))).toMatchObject({ok:true});
      const invalid=await c.call('solo_expert.smoke',{command:'echo OTHER',approved:true});
      expect(invalid.error ?? invalid.result?.isError).toBeTruthy();
      const pending=mcpPayload(await c.call('solo_expert.smoke',{}));
      expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
      expect(f.fakeCalls).toHaveLength(0);
      const attemptId=pending['attemptId'];
      expect(typeof attemptId).toBe('string');
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId}))).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
      const approvalId=pending['approvalRequestId'];
      expect(typeof approvalId).toBe('string');
      const stored=f.approvalRepo.findById(approvalId as string);
      if(!stored.ok || !stored.value?.soloExpertReview)throw Error('missing immutable persisted review');
      const decision=createApprovalService(f.approvalRepo,{append:()=>undefined},f.clock);
      expect(decision.respond(approvalId as string,'approve',stored.value.soloExpertReview.reviewDigest).ok).toBe(true);
      const admitted=mcpPayload(await c.call('solo_expert.smoke',{attemptId}));
      expect(admitted).toMatchObject({ok:true,code:'EXECUTED',value:{executionKind:'mock',status:'simulated-success'}});
      expect(f.fakeCalls).toHaveLength(1);
      expect(await f.ledger.state(attemptId as string)).toBe('closed');
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).ok).toBe(false);
      expect(f.fakeCalls).toHaveLength(1);
    }finally{await c.close();f.db.close();}
  });
});

async function reviewedMcp(f: ReturnType<typeof factoryFixture>, c: Awaited<ReturnType<typeof connectMemoryMcp>>) {
  expect(mcpPayload(await c.call('work.resume',{}))).toMatchObject({ok:true});
  const pending=mcpPayload(await c.call('solo_expert.smoke',{}));
  expect(pending).toMatchObject({ok:false,code:'APPROVAL_REQUIRED'});
  const attemptId=pending['attemptId'];
  const approvalId=pending['approvalRequestId'];
  if(typeof attemptId!=='string'||typeof approvalId!=='string')throw Error('safe IDs missing');
  const record=f.approvalRepo.findById(approvalId);
  if(!record.ok||!record.value?.soloExpertReview)throw Error('review missing');
  expect(record.value.soloExpertReview.expiresAt).toBeTruthy();
  return {attemptId,approvalId,digest:record.value.soloExpertReview.reviewDigest};
}
describe('G2 continuation C1 — actual MCP negative/one-use security matrix',()=>{
  it('strict payloads and orphan/missing attempt cannot reach original frozen review or fake',async()=>{
    const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
    try{
      await c.call('work.resume',{});
      const invalid=[
        {command:'echo SUD_D_B1_OK'},{cwd:'C:/other'},{argv:[]},{env:{}},
        {workspaceId:f.ws.id},{root:'C:/sud-d-g2a-fixture'},{workspaceGeneration:'1'},
        {sessionId:'spoofed'},{deviceLabel:'other'},{accountLabel:'other'},
        {gatewayEpoch:'x'},{managedEpoch:'x'},{approved:true},{resumed:true},
        {attemptId:'not-a-uuid'},{attemptId:'00000000-0000-4000-8000-000000000000',approved:true},
      ];
      for(const args of invalid){
        const response=await c.call('solo_expert.smoke',args);
        expect(response.error??response.result?.isError).toBeTruthy();
      }
      const before=f.auditEvents.length;
      const missing=mcpPayload(await c.call('solo_expert.smoke',{attemptId:'00000000-0000-4000-8000-000000000000'}));
      expect(missing).toMatchObject({ok:false,code:'INVALID_INPUT'});
      expect(f.auditEvents.length).toBeGreaterThan(before);
      expect(f.fakeCalls).toHaveLength(0);
      expect(await f.ledger.hasUnresolved()).toBe(false);
      const first=mcpPayload(await c.call('solo_expert.smoke',{}));
      expect(first.code).toBe('APPROVAL_REQUIRED');
      const failedPrepare=mcpPayload(await c.call('solo_expert.smoke',{}));
      expect(failedPrepare).toMatchObject({ok:false,code:'INVALID_INPUT'});
      expect(f.fakeCalls).toHaveLength(0);
      expect(await f.ledger.state(first.attemptId as string)).toBe('prepared');
      expect(f.forbidden).toEqual({semanticRead:0,semanticWrite:0,verify:0});
    }finally{await c.close();f.db.close();}
  });
  it.each(['standard','approve_for_me','full_access'] as ApprovalMode[])('%s mode preserves manual-only approval and exact digest',async(mode)=>{
    const f=factoryFixture(true,{mode});const c=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
      expect(f.fakeCalls).toHaveLength(0);
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).code).toBe('APPROVAL_REQUIRED');
      expect(f.decision.respond(approvalId,'approve').ok).toBe(false);
      expect(f.decision.respond(approvalId,'approve','a'.repeat(64)).ok).toBe(false);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      const result=mcpPayload(await c.call('solo_expert.smoke',{attemptId}));
      expect(result).toMatchObject({ok:true,code:'EXECUTED',value:{executionKind:'mock'}});
      const consumed=f.approvalRepo.findById(approvalId);
      expect(consumed.ok&&consumed.value?.status).toBe('consumed');
      if(consumed.ok)expect(consumed.value?.decisionSource).toBe('user');
      expect(f.fakeCalls).toHaveLength(1);
      expect(await f.ledger.state(attemptId)).toBe('closed');
    }finally{await c.close();f.db.close();}
  });
  it('explicit reviewed denial, expired consent, and approval-digest corruption fail closed',async()=>{
    for(const failure of ['denied','expired','digest'] as const){
      const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
      try{
        const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
        if(failure==='denied')expect(f.decision.respond(approvalId,'deny',digest).ok).toBe(true);
        else if(failure==='expired')f.setNow(f.clock().getTime()+90_001);
        else{
          expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
          f.db.prepare('UPDATE approval_requests SET binding_digest=? WHERE id=?').run('0'.repeat(64),approvalId);
        }
        const refused=mcpPayload(await c.call('solo_expert.smoke',{attemptId}));
        expect(refused.ok).toBe(false);
        expect(f.fakeCalls).toHaveLength(0);
        expect(await f.ledger.state(attemptId)).toBe('prepared');
      }finally{await c.close();f.db.close();}
    }
  });
  it('workspace generation A→B→A and managed fixture epoch drift reject old review',async()=>{
    for(const failure of ['generation','epoch','root','manifest'] as const){
      const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
      try{
        const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
        expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
        if(failure==='generation'){
          const b=f.workspaceRepo.save('B','C:/sud-d-g2a-fixture-b');
          f.workspaceRepo.setActive(b.id);f.workspaceRepo.setActive(f.ws.id);
        } else if(failure==='epoch')f.readyReceipt.managedEpoch='different-epoch';
        else if(failure==='root')f.readyReceipt.canonicalRoot='C:/mismatch';
        else f.readyReceipt.manifestDigest='f'.repeat(64);
        const refused=mcpPayload(await c.call('solo_expert.smoke',{attemptId}));
        expect(refused.ok).toBe(false);
        expect(f.fakeCalls).toHaveLength(0);
        expect(await f.ledger.state(attemptId)).toBe('prepared');
      }finally{await c.close();f.db.close();}
    }
  });
  it('two simultaneous JSON-RPC retries correlate by id, only one claim and one fake dispatch',async()=>{
    const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      const [a,b]=await Promise.all([
        c.call('solo_expert.smoke',{attemptId}),c.call('solo_expert.smoke',{attemptId}),
      ]);
      const outcomes=[mcpPayload(a),mcpPayload(b)];
      expect(outcomes.filter(o=>o.ok===true)).toHaveLength(1);
      expect(outcomes.filter(o=>o.ok===false)).toHaveLength(1);
      expect(f.fakeCalls).toHaveLength(1);
      expect(await f.ledger.state(attemptId)).toBe('closed');
      expect(f.forbidden).toEqual({semanticRead:0,semanticWrite:0,verify:0});
    }finally{await c.close();f.db.close();}
  });
  it.each(['pre_execution','outcome'] as const)('%s audit failure fences execution',async(phase)=>{
    const f=factoryFixture(true,{failAudit:phase});const c=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      f.setFailAudit(phase);
      const refused=mcpPayload(await c.call('solo_expert.smoke',{attemptId}));
      expect(refused.ok).toBe(false);
      if(phase==='pre_execution'){
        expect(f.fakeCalls).toHaveLength(0);
        expect(await f.ledger.state(attemptId)).toBe('prepared');
      }else{
        expect(f.fakeCalls).toHaveLength(1);
        expect(await f.ledger.state(attemptId)).toBe('unknown');
      }
    }finally{await c.close();f.db.close();}
  });
  it.each(['unknown','throw','poison'] as const)('fake %s cannot deliver unreviewed or duplicate dispatch',async(status)=>{
    const f=factoryFixture(true,{status});const c=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).ok).toBe(false);
      expect(await f.ledger.state(attemptId)).toBe('unknown');
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).ok).toBe(false);
      expect(f.fakeCalls).toHaveLength(1);
    }finally{await c.close();f.db.close();}
  });
});

describe('G2 continuation C1 — response correlation and persisted authority drift',()=>{
  it('rejects unsolicited and duplicate JSON-RPC response IDs without accepting another request',async()=>{
    const f=factoryFixture(false);const c=await connectMemoryMcp(f.server);
    try{
      expect((await c.list()).result?.tools).toBeDefined();
      c.injectUntrustedResponse(999999);
      await expect(c.list()).rejects.toThrow('Unmatched or duplicate MCP response');
      expect(f.fakeCalls).toHaveLength(0);
    }finally{await c.close();f.db.close();}
  });
  it.each(['runtime','session','key','review','approvalSource'] as const)(
    'stale persisted %s cannot authorize claimed fake execution',async(drift)=>{
      const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
      try{
        const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
        expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
        if(drift==='runtime')f.db.prepare('UPDATE approval_requests SET runtime_instance_id=? WHERE id=?').run('other-runtime',approvalId);
        if(drift==='session')f.db.prepare('UPDATE approval_requests SET session_id=? WHERE id=?').run('other-session',approvalId);
        if(drift==='key')f.db.prepare('UPDATE approval_requests SET binding_digest=? WHERE id=?').run('f'.repeat(64),approvalId);
        if(drift==='review'){
          expect(()=>f.db.prepare('UPDATE approval_requests SET solo_review_digest=? WHERE id=?').run('f'.repeat(64),approvalId))
            .toThrow('immutable B1b review');
          expect(f.fakeCalls).toHaveLength(0);
          return; // immutable SQLite trigger refuses alteration before any dispatch
        }
        if(drift==='approvalSource')f.db.prepare('UPDATE approval_requests SET decision_source=? WHERE id=?').run('mode',approvalId);
        expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).ok).toBe(false);
        expect(f.fakeCalls).toHaveLength(0);
        expect(await f.ledger.state(attemptId)).toBe('prepared');
      }finally{await c.close();f.db.close();}
    });
});

describe('G2 continuation C1 — factory epoch/revoked synthetic receipt',()=>{
  it('restarted MCP factory has new session/gateway epoch and cannot rehydrate old consumed review',async()=>{
    const f=factoryFixture(true);
    const a=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,a);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      const b=await connectMemoryMcp(f.restartServer());
      try{
        expect(mcpPayload(await b.call('work.resume',{}))).toMatchObject({ok:true});
        const stale=mcpPayload(await b.call('solo_expert.smoke',{attemptId}));
        expect(stale).toMatchObject({ok:false,code:'INVALID_INPUT'});
        expect(f.fakeCalls).toHaveLength(0);
        expect(await f.ledger.state(attemptId)).toBe('prepared');
      }finally{await b.close();}
    }finally{await a.close();f.db.close();}
  });
  it('revoked test-only ready receipt after pending cannot dispatch',async()=>{
    const f=factoryFixture(true);const c=await connectMemoryMcp(f.server);
    try{
      const {attemptId,approvalId,digest}=await reviewedMcp(f,c);
      expect(f.decision.respond(approvalId,'approve',digest).ok).toBe(true);
      f.setReadyAvailable(false);
      expect(mcpPayload(await c.call('solo_expert.smoke',{attemptId})).ok).toBe(false);
      expect(f.fakeCalls).toHaveLength(0);
      expect(await f.ledger.state(attemptId)).toBe('prepared');
    }finally{await c.close();f.db.close();}
  });
});
