import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

/**
 * Owner-authorized pure diagnostic. This file NEVER imports an SUD-D Runner,
 * Native bridge, Job, FFmpeg, TTS, HTTP/provider or production DB module.
 * Every "artifact" below is a typed, deterministic IN-MEMORY RECEIPT only.
 * It is NOT audio, video, QA, approval, a paid provider receipt, or media.
 */
const ROOT='C:\\1.งานโด้\\SUD-D-Solo-Test-Workspace';
const PINS:Readonly<Record<string,string>>=Object.freeze({
  'README.md':'619c0a5eb4075248cd3064a6742d71b542edaf2871fff7fd2efa4614277faf33',
  'workflow-contract.json':'cc3ea60e1a7d23a9b4d648ddf73acc206f37d0a0b750e89208318e76345bd158',
  'fixtures/goal.json':'16481f4f66223b01711f303ff5058c8ce56d4c530157bfe74b8e760e602d52eb',
  'fixtures/script.json':'c9285d7a573d219da7e3b7f76cef7686f575ac22de434b6e008e5f09eff95f88',
  'fixtures/scene-plan.json':'778b2d7957b3205d79a87399a716df87a2092d43e7738e8ed3bbe3e8b41bd747',
  'fixtures/subtitles.srt':'612d8d2d6138f64f18be152d389f4f29ba01f0d04955aff1179b0f0b800ddbed',
  'expected/acceptance.json':'b1aa74833c33a64aa7d3cbf0a891daf28964d5cc2f5a8db96e4420e18579cd3f',
});
const IDS=['goal','script','qa','tts','images','subtitles','render','technical-qc','semantic-qc','final'] as const;
type PhaseId=typeof IDS[number];
type Ref={ref:string;type:string};
type Phase={id:PhaseId;dependsOn:PhaseId[];inputs:Ref[];output:Ref;actual:'NOT_RUN'};
type Contract={schemaVersion:string;kind:string;sourceLabels:unknown;workspace:unknown;
  authority:unknown;fixtureRefs:{ref:string;path:string;type:string}[];
  phases:Phase[];expectedArtifactsProduced:boolean};
const FIXTURES=[
  {ref:'fixture:goal',path:'fixtures/goal.json',type:'application/json'},
  {ref:'fixture:script',path:'fixtures/script.json',type:'application/json'},
  {ref:'fixture:scene-plan',path:'fixtures/scene-plan.json',type:'application/json'},
  {ref:'fixture:subtitles',path:'fixtures/subtitles.srt',type:'text/srt'},
];
const GRAPH:Readonly<Record<PhaseId,readonly PhaseId[]>>={
  goal:[],script:['goal'],qa:['script'],tts:['qa'],images:['qa'],
  subtitles:['qa','tts'],render:['tts','images','subtitles'],
  'technical-qc':['render'],'semantic-qc':['render','technical-qc'],
  final:['technical-qc','semantic-qc'],
};
const OUTPUT:Readonly<Record<PhaseId,Ref>>={
  goal:{ref:'goal.brief',type:'application/json'},
  script:{ref:'script.segments',type:'application/json'},
  qa:{ref:'qa.approved-script',type:'application/json'},
  tts:{ref:'tts.audio',type:'audio/wav'},
  images:{ref:'images.frames',type:'application/json'},
  subtitles:{ref:'subtitles.cues',type:'text/srt'},
  render:{ref:'render.candidate',type:'video/mp4'},
  'technical-qc':{ref:'technical-qc.report',type:'application/json'},
  'semantic-qc':{ref:'semantic-qc.report',type:'application/json'},
  final:{ref:'final.identity',type:'application/json'},
};
const INPUT:Readonly<Record<PhaseId,readonly string[]>>={
  goal:['fixture:goal'],
  script:['goal.brief','fixture:script'],
  qa:['script.segments'],
  tts:['qa.approved-script'],
  images:['qa.approved-script','fixture:scene-plan'],
  subtitles:['qa.approved-script','tts.audio','fixture:subtitles'],
  render:['tts.audio','images.frames','subtitles.cues'],
  'technical-qc':['render.candidate'],
  'semantic-qc':['render.candidate','technical-qc.report'],
  final:['render.candidate','technical-qc.report','semantic-qc.report'],
};
type Identity={missionId:string;workspaceId:string;workspaceGeneration:string;attemptScope:string;sourceFingerprint:string};
const IDENTITY:Readonly<Identity>=Object.freeze({
  missionId:'synthetic-test-only-not-enrolled',
  workspaceId:'sudd-owned-static-fixture-unregistered',
  workspaceGeneration:'NOT_REGISTERED',
  attemptScope:'diagnostic-in-memory-no-real-approval',
  sourceFingerprint:PINS['workflow-contract.json'],
});
const sha=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function fail(reason:string):never{throw Error('SOLO_INPROCESS_DENIED:'+reason);}
function shape(x:unknown,fields:readonly string[]):x is Record<string,unknown>{
  if(x===null||typeof x!=='object'||Array.isArray(x))return false;
  if(Object.getPrototypeOf(x)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(x);
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'))return false;
  const descriptors=Object.getOwnPropertyDescriptors(x);
  return fields.every(k=>Object.hasOwn(descriptors,k)&&descriptors[k].enumerable&&
    Object.hasOwn(descriptors[k],'value'));
}
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
function checkedDirectories(){
  const dirs=[ROOT,join(ROOT,'fixtures'),join(ROOT,'expected')];
  for(const dir of dirs){
    const st=lstatSync(dir);if(!st.isDirectory()||st.isSymbolicLink())fail('DIR_IDENTITY');
  }
  if(!same(readdirSync(ROOT).sort(),['README.md','workflow-contract.json','fixtures','expected'].sort())||
    !same(readdirSync(join(ROOT,'fixtures')).sort(),['goal.json','script.json','scene-plan.json','subtitles.srt'].sort())||
    !same(readdirSync(join(ROOT,'expected')).sort(),['acceptance.json']))
    fail('EXTRA_OR_MISSING_FILES');
}
function readPinned(){
  checkedDirectories();
  const bytes=new Map<string,Buffer>();
  for(const [relative,digest] of Object.entries(PINS)){
    // Only hardcoded PINS are ever joined; callers cannot select file paths.
    const p=join(ROOT,...relative.split('/'));
    const st=lstatSync(p);
    if(!st.isFile()||st.isSymbolicLink())fail('FILE_IDENTITY');
    const data=readFileSync(p);
    if(sha(data)!==digest)fail('FROZEN_BYTES_CHANGED');
    bytes.set(relative,data);
  }
  const parse=(ref:string):unknown=>JSON.parse(bytes.get(ref)!.toString('utf8'));
  const contract=parse('workflow-contract.json');
  validateContract(contract);
  validateAcceptance(parse('expected/acceptance.json'));
  const goal=parse('fixtures/goal.json');
  const script=parse('fixtures/script.json');
  const scene=parse('fixtures/scene-plan.json');
  if(!shape(goal,['schemaVersion','origin','synthetic','language','topic','targetDurationMs','audience','expectedPreset','actualMediaCreated','approvalReceipt'])||
     goal.synthetic!==true||goal.origin!=='SUDD_TEST_HYPOTHESIS'||goal.targetDurationMs!==30000||
     goal.actualMediaCreated!==false||goal.approvalReceipt!==null||goal.schemaVersion!=='sudd-synthetic-goal-v1')
    fail('GOAL_NOT_SYNTHETIC');
  if(!shape(script,['schemaVersion','origin','synthetic','language','targetDurationMs','segments'])||
    !shape(scene,['schemaVersion','origin','synthetic','targetDurationMs','scenes'])||
    script.synthetic!==true||scene.synthetic!==true||
    script.schemaVersion!=='sudd-synthetic-script-v1'||scene.schemaVersion!=='sudd-synthetic-scene-plan-v1')
    fail('SYNTHETIC_SCHEMAS_CHANGED');
  return structuredClone(contract) as Contract;
}
const ACTUAL_KEYS=['workspaceRegistered','missionApproved','workflowExecuted','runnerStarted',
  'nativeJobUsed','providerUsed','spendIncurred','checkpointPersisted',
  'recoverableFailureInjected','retryResumed','auditVerified','mediaProduced',
  'technicalQcPassed','semanticQcPassed','finalMp4Verified'] as const;
function validateAcceptance(x:unknown){
  if(!shape(x,['schemaVersion','kind','sourceLabels','actual','approvalReceipt',
    'checkpointReceipt','finalArtifact','futurePreset','futureAssertions','overall']))fail('FORGED_ACCEPTANCE_SHAPE');
  if(
    x.schemaVersion!=='sudd-static-future-acceptance-v1'||
    x.kind!=='FUTURE_ACCEPTANCE_CRITERIA_ONLY'||x.overall!=='NOT_RUN'||
    x.approvalReceipt!==null||x.checkpointReceipt!==null||x.finalArtifact!==null||
    !same(x.sourceLabels,{scenario:'SOURCE_CONFIRMED',schema:'SUDD_TEST_HYPOTHESIS',friendSpecific:'UNKNOWN'})||
    !same(x.futurePreset,{durationMs:30000,width:1280,height:720,fps:30,videoCodec:'h264',audioCodec:'aac'}))
    fail('FORGED_FUTURE_ACCEPTANCE');
  if(!shape(x.actual,ACTUAL_KEYS)||Object.values(x.actual).some(v=>v!==false))
    fail('FORGED_PHYSICAL_SUCCESS');
  if(!shape(x.sourceLabels,['scenario','schema','friendSpecific'])||
    !shape(x.futurePreset,['durationMs','width','height','fps','videoCodec','audioCodec']))
    fail('UNTRUSTED_ACCEPTANCE_NESTED_KEYS');
  if(!Array.isArray(x.futureAssertions)||x.futureAssertions.length!==10||
    x.futureAssertions.some(a=>!shape(a,['id','requirement','status','passed'])||
      a.status!=='NOT_RUN'||a.passed!==false))fail('FORGED_FUTURE_PASS');
}
function validateContract(x:unknown):asserts x is Contract{
  if(!shape(x,['schemaVersion','kind','sourceLabels','workspace','authority','fixtureRefs','phases','expectedArtifactsProduced']))fail('BAD_CONTRACT_SHAPE');
  if(
    x.schemaVersion!=='sudd-owned-static-workflow-v1'||x.kind!=='STATIC_DECLARATIVE_NON_EXECUTABLE'||
    !same(x.sourceLabels,{sequence:'SOURCE_CONFIRMED',artifactShapes:'SUDD_TEST_HYPOTHESIS',friendDetails:'UNKNOWN'})||
    !same(x.workspace,{ownership:'SUDD_TEST_HYPOTHESIS',registered:false,executed:false})||
    !same(x.authority,{runner:false,provider:false,network:'none',spent:0,approvalReceipt:null})||
    x.expectedArtifactsProduced!==false||
    !Array.isArray(x.fixtureRefs)||!same(x.fixtureRefs,FIXTURES)||
    !Array.isArray(x.phases)||x.phases.length!==10)fail('CONTRACT_SHAPE_OR_AUTHORITY');
  const stages=x.phases as unknown[];
  if(!same(stages.map(s=>shape(s,['id','dependsOn','inputs','output','actual'])?s.id:null),IDS))
    fail('REORDERED_OR_MISSING_PHASE');
  if(!shape(x.sourceLabels,['sequence','artifactShapes','friendDetails'])||
    !shape(x.workspace,['ownership','registered','executed'])||
    !shape(x.authority,['runner','provider','network','spent','approvalReceipt'])||
    x.fixtureRefs.some(f=>!shape(f,['ref','path','type'])))
    fail('UNTRUSTED_NESTED_AUTHORITY');
  const byId=new Map<PhaseId,Phase>();
  for(const entry of stages){
    if(!shape(entry,['id','dependsOn','inputs','output','actual']))fail('BAD_PHASE_SHAPE');
    if(!IDS.includes(entry.id as PhaseId)||byId.has(entry.id as PhaseId)||
      entry.actual!=='NOT_RUN'||!Array.isArray(entry.dependsOn)||
      !Array.isArray(entry.inputs)||!shape(entry.output,['ref','type']))
      fail('UNKNOWN_DUPLICATE_OR_UNTRUSTED_PHASE');
    const id=entry.id as PhaseId;
    if(entry.dependsOn.some(d=>typeof d!=='string'||!IDS.includes(d as PhaseId)))
      fail('UNKNOWN_DEPENDENCY');
    if(entry.inputs.some(i=>!shape(i,['ref','type'])||
      typeof i.ref!=='string'||typeof i.type!=='string'))
      fail('UNTYPED_INPUT');
    byId.set(id,entry as Phase);
  }
  // Algorithmic finite topological traversal: cycles cannot be completed.
  const pending=new Set(byId.keys()),sorted:PhaseId[]=[];
  while(pending.size>0){
    const ready=IDS.find(id=>pending.has(id)&&byId.get(id)!.dependsOn.every(d=>sorted.includes(d)));
    if(!ready)fail('DEPENDENCY_CYCLE');
    sorted.push(ready!);pending.delete(ready!);
  }
  if(!same(sorted,IDS))fail('NONCANONICAL_ORDER');
  const known=new Map(FIXTURES.map(f=>[f.ref,f.type]));
  const producer=new Map<string,PhaseId>();
  for(const id of IDS){
    const p=byId.get(id)!;
    if(!same(p.dependsOn,GRAPH[id])||!same(p.inputs,INPUT[id].map(ref=>({ref,type:known.get(ref)})))||
      !same(p.output,OUTPUT[id]))fail('WRONG_DEPENDENCY_OR_TYPE');
    for(const item of p.inputs){
      if(!known.has(item.ref)||known.get(item.ref)!==item.type)fail('MISSING_OR_WRONG_INPUT_REF');
      const source=producer.get(item.ref);
      if(source&&!p.dependsOn.includes(source)){
        // Dependency closure, including transitive producers.
        const covered=new Set<PhaseId>();
        const walk=(s:PhaseId)=>{
          for(const d of byId.get(s)!.dependsOn)if(!covered.has(d)){covered.add(d);walk(d);}
        };
        walk(id);if(!covered.has(source))fail('UNBOUND_PRODUCER');
      }
    }
    known.set(p.output.ref,p.output.type);producer.set(p.output.ref,id);
  }
}
type Receipt=Readonly<{
  phase:PhaseId;kind:'SYNTHETIC_RECEIPT_ONLY';operationKey:string;
  digest:string;inputDigests:readonly string[];expectedMediaType:string;
  identityFingerprint:string;noRealArtifact:true;
}>;
type DiagnosticEvent=Readonly<{type:string;attempt:number;phase?:PhaseId;key?:string}>;
type Config={identity:typeof IDENTITY;faultMode:'none'|'once'|'always';
  stopBefore:null|'render';stopReason:null|'cancel'|'deadline'};
type Summary=Readonly<{
  label:'PURE_INPROCESS_DIAGNOSTIC_SIMULATED_ONLY';
  terminal:'SIMULATED_COMPLETE'|'RETRY_EXHAUSTED'|'CANCELLED'|'DEADLINE_STOP';
  simulatedPhaseCount:number;committedReceiptCount:number;
  injectedFailureCount:number;attemptCount:number;replayedCompletedCount:number;
  cancellationStops:number;realProcessStarts:0;providerCalls:0;mediaFilesProduced:0;
  actualFinalMp4Verified:false;workspaceRegistered:false;realApproval:false;
  physicalQcPassed:false;realSpend:0;
}>;
const config=(change:Partial<Config>={}):Config=>({
  identity:IDENTITY,faultMode:'none',stopBefore:null,stopReason:null,...change,
});
function runDiagnostic(input:unknown,settings:unknown){
  validateContract(input);
  if(!shape(settings,['identity','faultMode','stopBefore','stopReason'])||
    !shape(settings.identity,['missionId','workspaceId','workspaceGeneration','attemptScope','sourceFingerprint'])||
    !same(settings.identity,IDENTITY)||!['none','once','always'].includes(settings.faultMode as string)||
    ![null,'render'].includes(settings.stopBefore as string|null)||
    ![null,'cancel','deadline'].includes(settings.stopReason as string|null)||
    (settings.stopBefore===null)!==(settings.stopReason===null))
    fail('UNTRUSTED_IDENTITY_OR_RUNTIME_SELECTOR');
  const cfg=settings as Config;
  const contract=input as Contract;
  const lookup=new Map(contract.phases.map(p=>[p.id,p]));
  const receipts=new Map<PhaseId,Receipt>(); // THE entire transient checkpoint
  const logs:DiagnosticEvent[]=[];
  let injected=0,attempts=0,replayed=0,stops=0,terminal:Summary['terminal']='RETRY_EXHAUSTED';
  const totalAttempts=3; // fixed ceiling, never caller-controlled
  for(let round=1;round<=totalAttempts;round++){
    attempts=round;logs.push({type:'ATTEMPT',attempt:round});
    let retry=false,stopped=false;
    for(const id of IDS){
      if(cfg.stopBefore===id){
        stops++;terminal=cfg.stopReason==='cancel'?'CANCELLED':'DEADLINE_STOP';
        logs.push({type:terminal,attempt:round,phase:id});
        stopped=true;break;
      }
      if(receipts.has(id)){
        replayed++;logs.push({type:'REPLAY_COMMITTED_IN_MEMORY',attempt:round,phase:id});
        continue;
      }
      if(id==='subtitles' && cfg.faultMode!=='none' &&
        (cfg.faultMode==='always'||injected===0)){
        injected++;retry=true;
        logs.push({type:'SIMULATED_RECOVERABLE_FAULT_NO_SIDE_EFFECT',attempt:round,phase:id});
        break;
      }
      const phase=lookup.get(id)!;
      // All outputs are a TYPE EXPECTATION and synthetic digest, NOT bytes.
      // Every producer receipt was checked in frozen topological order.
      const digests=phase.inputs.map(item=>{
        if(item.ref.startsWith('fixture:')){
          const path=FIXTURES.find(f=>f.ref===item.ref)!.path;
          return PINS[path];
        }
        const source=receipts.get(IDS.find(x=>OUTPUT[x].ref===item.ref)!);
        if(!source)fail('UNCOMMITTED_INPUT');
        return source!.digest;
      });
      const operationKey=sha('SUDD_IN_MEMORY_IDEMPOTENCY_V1\0'+JSON.stringify({
        phase:id,scope:IDENTITY,inputDigests:digests}));
      const digest=sha('SUDD_SYNTHETIC_RECEIPT_V1\0'+JSON.stringify({
        id,operationKey,digests,type:phase.output.type,
        identity:IDENTITY,simulation:true}));
      const receipt:Object=Object.freeze({
        phase:id,kind:'SYNTHETIC_RECEIPT_ONLY',operationKey,digest,
        inputDigests:Object.freeze(digests),expectedMediaType:phase.output.type,
        identityFingerprint:IDENTITY.sourceFingerprint,noRealArtifact:true as const,
      });
      receipts.set(id,receipt as Receipt);
      logs.push({type:'SIMULATED_RECEIPT_COMMITTED',attempt:round,phase:id,key:operationKey});
    }
    if(stopped)break;
    if(!retry){terminal='SIMULATED_COMPLETE';logs.push({type:'SIMULATED_DONE_NO_MEDIA',attempt:round});break;}
  }
  const summary:Summary=Object.freeze({
    label:'PURE_INPROCESS_DIAGNOSTIC_SIMULATED_ONLY',terminal,
    simulatedPhaseCount:receipts.size,committedReceiptCount:receipts.size,
    injectedFailureCount:injected,attemptCount:attempts,replayedCompletedCount:replayed,
    cancellationStops:stops,realProcessStarts:0,providerCalls:0,
    mediaFilesProduced:0,actualFinalMp4Verified:false,
    workspaceRegistered:false,realApproval:false,physicalQcPassed:false,realSpend:0,
  });
  return {summary,receipts,events:Object.freeze(logs)};
}
describe('Solo MVP — PURE IN-PROCESS diagnostic, never a real Runner',()=>{
  it('pins the exact seven files, byte-hash contract, versions and no physical claims',()=>{
    const plan=readPinned();
    expect(plan.phases.map(p=>p.id)).toEqual(IDS);
    expect(plan.authority).toEqual({runner:false,provider:false,network:'none',spent:0,approvalReceipt:null});
  });
  it('commits all ten simulated phases exactly once in dependency order',()=>{
    const result=runDiagnostic(readPinned(),config());
    expect(result.summary).toEqual({
      label:'PURE_INPROCESS_DIAGNOSTIC_SIMULATED_ONLY',terminal:'SIMULATED_COMPLETE',
      simulatedPhaseCount:10,committedReceiptCount:10,injectedFailureCount:0,
      attemptCount:1,replayedCompletedCount:0,cancellationStops:0,
      realProcessStarts:0,providerCalls:0,mediaFilesProduced:0,actualFinalMp4Verified:false,
      workspaceRegistered:false,realApproval:false,physicalQcPassed:false,realSpend:0,
    });
    expect(result.events.filter(e=>e.type==='SIMULATED_RECEIPT_COMMITTED').map(e=>e.phase)).toEqual(IDS);
    for(const id of IDS){
      const r=result.receipts.get(id)!;
      expect(r.kind).toBe('SYNTHETIC_RECEIPT_ONLY');
      expect(r.noRealArtifact).toBe(true);
      expect(r.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(r.expectedMediaType).toBe(OUTPUT[id].type);
    }
    expect(result.receipts.get('render')?.expectedMediaType).toBe('video/mp4');
    expect(result.receipts.get('final')?.noRealArtifact).toBe(true);
    const repeat=runDiagnostic(readPinned(),config());
    expect([...result.receipts]).toEqual([...repeat.receipts]);
    expect(result.events).toEqual(repeat.events);
  });
  it('injects EXACTLY one recoverable failure after five commits, resumes and does not double-commit',()=>{
    const r=runDiagnostic(readPinned(),config({faultMode:'once'}));
    expect(r.summary).toMatchObject({
      terminal:'SIMULATED_COMPLETE',attemptCount:2,simulatedPhaseCount:10,
      committedReceiptCount:10,injectedFailureCount:1,replayedCompletedCount:5,
      providerCalls:0,mediaFilesProduced:0,realProcessStarts:0,
    });
    expect(r.events.filter(e=>e.type==='SIMULATED_RECOVERABLE_FAULT_NO_SIDE_EFFECT'))
      .toEqual([{type:'SIMULATED_RECOVERABLE_FAULT_NO_SIDE_EFFECT',attempt:1,phase:'subtitles'}]);
    const committed=r.events.filter(e=>e.type==='SIMULATED_RECEIPT_COMMITTED');
    expect(committed.length).toBe(10);
    expect(new Set(committed.map(e=>e.key)).size).toBe(10);
    expect(committed.slice(0,5).map(e=>e.phase)).toEqual(IDS.slice(0,5));
    expect(r.events.filter(e=>e.type==='REPLAY_COMMITTED_IN_MEMORY').map(e=>e.phase)).toEqual(IDS.slice(0,5));
    const normal=runDiagnostic(readPinned(),config());
    for(const id of IDS)expect(r.receipts.get(id)).toEqual(normal.receipts.get(id));
  });
  it('never exceeds three total attempts, and never commits a failed phase',()=>{
    const r=runDiagnostic(readPinned(),config({faultMode:'always'}));
    expect(r.summary).toMatchObject({
      terminal:'RETRY_EXHAUSTED',attemptCount:3,injectedFailureCount:3,
      committedReceiptCount:5,simulatedPhaseCount:5,replayedCompletedCount:10,
    });
    expect(r.receipts.has('subtitles')).toBe(false);
    expect(r.receipts.has('render')).toBe(false);
    expect(r.events.filter(e=>e.type==='SIMULATED_RECOVERABLE_FAULT_NO_SIDE_EFFECT')).toHaveLength(3);
    expect(r.events.filter(e=>e.type==='SIMULATED_RECEIPT_COMMITTED')).toHaveLength(5);
  });
  it.each(['cancel','deadline'] as const)('%s before render stops all subsequent phases',reason=>{
    const r=runDiagnostic(readPinned(),config({stopBefore:'render',stopReason:reason}));
    expect(r.summary).toMatchObject({
      terminal:reason==='cancel'?'CANCELLED':'DEADLINE_STOP',
      committedReceiptCount:6,attemptCount:1,cancellationStops:1,
      realProcessStarts:0,mediaFilesProduced:0,actualFinalMp4Verified:false,
    });
    expect(r.receipts.has('render')).toBe(false);
    expect(r.receipts.has('final')).toBe(false);
    expect(r.events.at(-1)?.type).toBe(reason==='cancel'?'CANCELLED':'DEADLINE_STOP');
  });
  it('rejects unknown/duplicate phases, missing dependency and cycles in memory',()=>{
    const base=readPinned();
    for(const mutate of [
      (c:Contract)=>{c.phases[3].id='not-known' as PhaseId;},
      (c:Contract)=>{c.phases[3].id='qa';},
      (c:Contract)=>{c.phases[2].dependsOn=[];},
      (c:Contract)=>{c.phases[0].dependsOn=['final'];},
      (c:Contract)=>{c.phases[3].dependsOn=['tts'];},
      (c:Contract)=>{c.phases.pop();},
    ]){
      const c=structuredClone(base);mutate(c);
      expect(()=>runDiagnostic(c,config())).toThrow('SOLO_INPROCESS_DENIED');
    }
  });
  it('rejects wrong typed artifact and unknown input/output references or source bytes',()=>{
    const base=readPinned();
    for(const mutate of [
      (c:Contract)=>{c.phases[3].inputs[0].type='video/mp4';},
      (c:Contract)=>{c.phases[6].inputs[0].ref='friend.audio';},
      (c:Contract)=>{c.phases[6].output.type='application/x-msdownload';},
      (c:Contract)=>{c.fixtureRefs[0].path='../other';},
      (c:Contract)=>{c.fixtureRefs[0].ref='fixture:friend';},
      (c:Contract)=>{c.phases[7].output.ref='unregistered';},
      (c:Contract)=>{c.schemaVersion='wrong-v2';},
    ]){
      const c=structuredClone(base);mutate(c);
      expect(()=>runDiagnostic(c,config())).toThrow('SOLO_INPROCESS_DENIED');
    }
    expect(()=>runDiagnostic(base,config({identity:{
      ...IDENTITY,sourceFingerprint:'f'.repeat(64),
    }}))).toThrow('SOLO_INPROCESS_DENIED');
  });
  it('rejects stale synthetic Mission identity and forged real approval',()=>{
    const plan=readPinned();
    const changes=[
      {missionId:'friend-mission'}, {workspaceId:'different'}, {workspaceGeneration:'2026-10-12'},
      {attemptScope:'real-approval-granted'}, {sourceFingerprint:'0'.repeat(64)},
    ];
    for(const change of changes)expect(()=>runDiagnostic(plan,config({
      identity:{...IDENTITY,...change},
    }))).toThrow('SOLO_INPROCESS_DENIED');
    for(const changed of [
      {...config(),approvalReceipt:'fake'},
      {...config(),providerUrl:'https://invalid.example'},
      {...config(),shell:'powershell.exe'},
      {...config(),executable:'ffmpeg.exe'},
      {...config(),argv:['-i','data']},
      {...config(),cwd:'C:\\user\\friend'},
      {...config(),network:'open'},
      {...config(),secret:'any'},
      {...config(),claimedFinalMp4Verified:true},
      {...config(),maxRetries:123},
      {...config(),stopBefore:'render',stopReason:null},
    ])expect(()=>runDiagnostic(plan,changed)).toThrow('SOLO_INPROCESS_DENIED');
  });
  it('rejects reordered stages and hidden/symbol authority or receipt metadata',()=>{
    const base=readPinned();
    const shuffled=structuredClone(base);
    [shuffled.phases[0],shuffled.phases[1]]=[shuffled.phases[1],shuffled.phases[0]];
    expect(()=>runDiagnostic(shuffled,config())).toThrow('SOLO_INPROCESS_DENIED');
    const hidden=structuredClone(base);
    Object.defineProperty(hidden.authority,'providerUrl',{value:'forbidden',enumerable:false});
    expect(()=>runDiagnostic(hidden,config())).toThrow('SOLO_INPROCESS_DENIED');
    const injected=structuredClone(base);
    Object.defineProperty(injected.phases[6].output,Symbol('execution'),{value:'ffmpeg.exe'});
    expect(()=>runDiagnostic(injected,config())).toThrow('SOLO_INPROCESS_DENIED');
    const fixture=structuredClone(base);
    Object.defineProperty(fixture.fixtureRefs[0],'shell',{value:true,enumerable:false});
    expect(()=>runDiagnostic(fixture,config())).toThrow('SOLO_INPROCESS_DENIED');
    const acceptance=JSON.parse(readFileSync(join(ROOT,'expected','acceptance.json'),'utf8')) as Record<string,unknown>;
    Object.defineProperty(acceptance.actual,Symbol('hiddenClaim'),{value:true});
    expect(()=>validateAcceptance(acceptance)).toThrow('SOLO_INPROCESS_DENIED');
  });
  it('rejects forged media, provider or approval PASS in any fixture authority',()=>{
    const plan=readPinned();
    for(const mutate of [
      (c:Contract)=>{(c.authority as Record<string,unknown>).runner=true;},
      (c:Contract)=>{(c.authority as Record<string,unknown>).provider=true;},
      (c:Contract)=>{(c.authority as Record<string,unknown>).approvalReceipt='forged';},
      (c:Contract)=>{(c.workspace as Record<string,unknown>).registered=true;},
      (c:Contract)=>{c.phases[6].actual='PASS' as 'NOT_RUN';},
      (c:Contract)=>{(c.phases[6] as unknown as Record<string,unknown>).shell=true;},
      (c:Contract)=>{(c.phases[3] as unknown as Record<string,unknown>).providerUrl='https://bad';},
    ]){
      const c=structuredClone(plan);mutate(c);
      expect(()=>runDiagnostic(c,config())).toThrow('SOLO_INPROCESS_DENIED');
    }
    const approval=JSON.parse('{"schemaVersion":"sudd-static-future-acceptance-v1","overall":"PASS"}');
    expect(()=>validateAcceptance(approval)).toThrow('SOLO_INPROCESS_DENIED');
    expect(()=>validateAcceptance({...JSON.parse(readFileSync(join(ROOT,'expected','acceptance.json'),'utf8')),
      finalArtifact:{fileName:'final.mp4',verified:true}})).toThrow('SOLO_INPROCESS_DENIED');
  });
});
