import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {
  prepareSoloReferenceEnrollment,
  assessSoloReferenceAttempt,
} from '../../infrastructure/src/solo-runner-enrollment.js';

const valid=()=>({
  profile:'solo-reviewed-host-v1',
  mode:'reference-design-only',
  operationId:'review-workflow-contract',
  workspace:{kind:'sudd-owned-test-fixture',state:'uncreated'},
  workspaceGeneration:null,
  workspaceRevision:null,
  reviewedSourceIds:[] as string[],
  reviewedDependencyDigests:[] as string[],
  networkProfile:'none',
  providerProfile:'none',
  approvalReceipt:null,
});
const draft=()=>prepareSoloReferenceEnrollment(valid());
const request=(fingerprint:string)=>({
  profile:'solo-reviewed-host-v1',
  operationId:'review-workflow-contract',
  fingerprint,
  workspaceGeneration:null,
  workspaceRevision:null,
  approvalReceipt:null,
});

describe('Solo reviewed-host v1 — reference-only inert enrollment',()=>{
  it('accepts only the uncreated SUD-D-owned design fixture and cannot issue execution authority',()=>{
    const result=draft();
    expect(result.profile).toBe('solo-reviewed-host-v1');
    expect(result.status).toBe('BLOCKED_TEST_WORKSPACE_UNCREATED');
    expect(result.executionAvailable).toBe(false);
    expect(result.enrolled).toBe(false);
    expect(result.ownerApprovalValid).toBe(false);
    expect(result.workspaceBinding).toBe('UNCREATED_UNREGISTERED');
    expect(result.missingFacts).toContain('REGISTERED_SUDD_OWNED_WORKSPACE');
    expect(result.missingFacts).toContain('REVIEWED_TOOL_AND_DEPENDENCY_CLOSURE');
    expect(result.missingFacts).toContain('PROVIDER_AND_EGRESS_APPROVAL');
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.missingFacts)).toBe(true);
    expect(assessSoloReferenceAttempt(result,request(result.fingerprint)))
      .toMatchObject({executionAvailable:false,admitted:false,status:'BLOCKED_TEST_WORKSPACE_UNCREATED'});
  });

  it('never mutates or freezes caller values, and a detached fingerprint cannot be forged by later mutation',()=>{
    const source=valid();
    const prepared=prepareSoloReferenceEnrollment(source);
    const prior=prepared.fingerprint;
    source.profile='modified';
    source.workspace.state='changed';
    source.reviewedSourceIds.push('injected');
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(source.workspace)).toBe(false);
    expect(prepared.fingerprint).toBe(prior);
    expect(assessSoloReferenceAttempt(prepared,request(prior)).admitted).toBe(false);
  });

  it('fingerprint is deterministic and domain-separated from unbound/missing real artifacts',()=>{
    const left=draft(),right=draft();
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.fingerprint).not.toBe(createHash('sha256').update('{}').digest('hex'));
    expect(left.profile).not.toBe('node-offline-v1');
    expect(left.status).not.toBe('READY');
  });

  it('rejects wrong version, op, mode and unknown flags including shell/executable and code selectors',()=>{
    for(const mutation of [
      {profile:'node-offline-v1'}, {profile:'solo-reviewed-host-v2'},
      {mode:'runtime'}, {operationId:'render-mp4'}, {operationId:'review-workflow-contract;rm -rf'},
      {shell:true}, {command:'powershell.exe'}, {entry:'render.js'}, {script:'echo hi'},
      {executable:'ffmpeg.exe'}, {argv:['-i','anything']}, {cwd:'C:\\'},
      {env:{PATH:'any'}}, {code:'unreviewed source'}, {handler:'dynamic'},
      {runnerStart:true}, {authorization:true},
      {resumeCursor:'render'}, {checkpoint:'persisted'}, {retry:1},
      {finalMp4Sha256:'a'.repeat(64)}, {finalMp4Verified:true},
      {toolArgs:['-i','input']}, {phaseGraph:['tts','render']},
      {spendLimit:20}, {egress:'allow'}, {approvedJobId:'fake'},
    ]){
      expect(()=>prepareSoloReferenceEnrollment({...valid(),...mutation}))
        .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    }
  });

  it('rejects a reference to any real/friend workspace or fake SUD-D enrollment',()=>{
    for(const mutation of [
      {workspace:{kind:'friend-workspace',state:'existing'}},
      {workspace:{kind:'sudd-owned-test-fixture',state:'registered'}},
      {workspace:{kind:'sudd-owned-test-fixture',state:'uncreated',canonicalRoot:'C:\\video'}},
      {workspace:{kind:'sudd-owned-test-fixture',state:'uncreated',workspaceId:'friend-1'}},
      {workspace:{kind:'sudd-owned-test-fixture',state:'uncreated',link:'../other'}},
      {workspaceGeneration:'2026-10-11T09:06:07.123Z'},
      {workspaceRevision:1},
      {workspaceRoot:'C:\\users\\friend'},
      {workspacePath:'../third-party'}, {internalRoot:'.sud-d'},
      {symlink:'link'}, {snapshotPaths:['../other']},
    ]){
      expect(()=>prepareSoloReferenceEnrollment({...valid(),...mutation}))
        .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    }
  });

  it('rejects model-selected providers, network, secrets and forged source/dependency review',()=>{
    for(const mutation of [
      {networkProfile:'on'}, {providerProfile:'tts'}, {providerProfile:'http'},
      {providerUrl:'https://example.net/api'}, {secretProfile:'env'},
      {secret:'token'}, {apiKey:'testsecret'}, {approvalReceipt:'signed'},
      {reviewedSourceIds:['friend-source']},
      {reviewedDependencyDigests:['f'.repeat(64)]},
      {reviewedSourceIds:['duplicate','duplicate']},
      {reviewedDependencyDigests:['not-a-hash']},
      {reviewedCode:true},
    ]){
      expect(()=>prepareSoloReferenceEnrollment({...valid(),...mutation}))
        .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    }
  });

  it('rejects stale or altered attempt binding rather than fallback to old profile',()=>{
    const enrolled=draft();
    const matching=request(enrolled.fingerprint);
    for(const mutation of [
      {profile:'node-offline-v1'},{profile:'solo-reviewed-host-v2'},
      {operationId:'render'},{operationId:'review-workflow-contract && whoami'},
      {fingerprint:'a'.repeat(64)},
      {workspaceGeneration:'generation-1'},{workspaceRevision:1},
      {approvalReceipt:'available'}, {attemptId:'a'},
      {toolPath:'C:\\run.exe'},{provider:'tts'},
    ]){
      expect(()=>assessSoloReferenceAttempt(enrolled,{...matching,...mutation}))
        .toThrow('SOLO_REFERENCE_ATTEMPT_NOT_BOUND');
    }
  });

  it('S1-SHAPE-01 rejects extra Symbol and hidden own keys on input and nested workspace',()=>{
    for(const at of ['input','workspace'] as const){
      for(const kind of ['symbol','hidden'] as const){
        const input=valid();
        const obj=at==='input'?input:input.workspace;
        if(kind==='symbol')Object.defineProperty(obj,Symbol('unauthorized'),{value:'unreviewed'});
        else Object.defineProperty(obj,'hiddenExecutionAuthority',{value:'on',enumerable:false});
        expect(()=>prepareSoloReferenceEnrollment(input))
          .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
      }
    }
  });

  it('S1-SHAPE-01 rejects extra Symbol and hidden own keys on frozen draft and attempt',()=>{
    for(const at of ['draft','attempt'] as const){
      for(const kind of ['symbol','hidden'] as const){
        const original=draft();
        const plan={...original};
        const req=request(original.fingerprint);
        const obj=at==='draft'?plan:req;
        if(kind==='symbol')Object.defineProperty(obj,Symbol('authority'),{value:true});
        else Object.defineProperty(obj,'hiddenOperation',{value:'start',enumerable:false});
        expect(()=>assessSoloReferenceAttempt(plan,req))
          .toThrow('SOLO_REFERENCE_ATTEMPT_NOT_BOUND');
      }
    }
  });

  it('S1-SHAPE-01 rejects inherited accessors and own getters without evaluating them',()=>{
    const inherited=Object.create({hidden:'untrusted'}) as ReturnType<typeof valid>;
    Object.assign(inherited,valid());
    expect(()=>prepareSoloReferenceEnrollment(inherited))
      .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    const nested=valid();
    Object.setPrototypeOf(nested.workspace,{extra:'authority'});
    expect(()=>prepareSoloReferenceEnrollment(nested))
      .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    const input=valid();
    let getterCalls=0;
    Object.defineProperty(input,'profile',{enumerable:true,get(){
      getterCalls++;throw Error('MUST_NOT_EVALUATE');
    }});
    expect(()=>prepareSoloReferenceEnrollment(input))
      .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    expect(getterCalls).toBe(0);
    const plan={...draft()};
    Object.defineProperty(plan,'fingerprint',{enumerable:true,get(){
      getterCalls++;throw Error('MUST_NOT_EVALUATE');
    }});
    expect(()=>assessSoloReferenceAttempt(plan,request(draft().fingerprint)))
      .toThrow('SOLO_REFERENCE_ATTEMPT_NOT_BOUND');
    expect(getterCalls).toBe(0);
    expect(assessSoloReferenceAttempt(draft(),request(draft().fingerprint)))
      .toMatchObject({executionAvailable:false,admitted:false});
  });

  it('forbids forged enrolled/ready plans, missing keys, array shapes and duplicate JSON keys as authority',()=>{
    const result=draft();
    for(const plan of [
      {...result,executionAvailable:true}, {...result,enrolled:true},
      {...result,status:'READY'}, {...result,profile:'node-offline-v1'},
      {...result,missingFacts:[]}, {...result,fingerprint:'f'.repeat(64)},
      {}, null, [],
    ]){
      expect(()=>assessSoloReferenceAttempt(plan,request(result.fingerprint)))
        .toThrow('SOLO_REFERENCE_ATTEMPT_NOT_BOUND');
    }
    for(const invalid of [null,[],{},'{}',{...valid(),workspace:null},{...valid(),mode:undefined}]){
      expect(()=>prepareSoloReferenceEnrollment(invalid))
        .toThrow('SOLO_REFERENCE_ENROLLMENT_INVALID');
    }
  });
});
