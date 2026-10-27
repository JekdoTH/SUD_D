import {describe,expect,it} from 'vitest';
import {
  inspectSoloFixedOfflineSmoke,
  assessSoloFixedOfflineSmoke,
} from '../../infrastructure/src/solo-fixed-offline-smoke.js';

const BIN='63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088';
const SRC='cc3ea60e1a7d23a9b4d648ddf73acc206f37d0a0b750e89208318e76345bd158';

const request=()=>({
  profile:'solo-reviewed-host-v1',
  operationId:'solo-node-version-smoke-v1',
  mode:'fixed-offline-code-only-review',
  binarySha256:BIN,
  sourceFingerprint:SRC,
  workspaceGeneration:null,
  workspaceRevision:null,
  attemptId:null,
  approvalReceipt:null,
  networkProfile:'none',
  providerProfile:'none',
});
const check=(plan:ReturnType<typeof inspectSoloFixedOfflineSmoke>)=>({
  profile:'solo-reviewed-host-v1',
  operationId:'solo-node-version-smoke-v1',
  reviewFingerprint:plan.reviewFingerprint,
  binarySha256:BIN,
  sourceFingerprint:SRC,
  workspaceGeneration:null,
  workspaceRevision:null,
  attemptId:null,
  approvalReceipt:null,
});

describe('Solo first physical smoke — fixed OFFLINE CODE-ONLY review, NEVER LAUNCH',()=>{
  it('returns one fixed immutable, non-executable plan with distinct pinned binary/source identities',()=>{
    const p=inspectSoloFixedOfflineSmoke(request());
    expect(p).toMatchObject({
      profile:'solo-reviewed-host-v1',
      operationId:'solo-node-version-smoke-v1',
      status:'CODE_ONLY_PLAN_VALID_PHYSICAL_LAUNCH_NOT_AUTHORIZED',
      physicalAuthorized:false,
      executionAvailable:false,
      admitted:false,
      workspaceBinding:'OWNED_STATIC_REFERENCE_ONLY_UNREGISTERED',
      workspaceGeneration:null,
      workspaceRevision:null,
      approvalReceipt:null,
      network:'none',provider:'none',spend:0,
      executable:{
        path:'C:\\Program Files\\nodejs\\node.exe',
        sha256:BIN,
        sizeBytes:91380224,
        observedFileVersion:'24.14.0',
        authenticode:'UNVERIFIED',
      },
      argv:['--version'],shell:false,stdin:'disabled',
      cwdPolicy:'NO_RUNTIME_CWD_AUTHORIZED',
      envPolicy:'NO_RUNTIME_ENV_AUTHORIZED',
      stdoutMaxBytes:4096,stderrMaxBytes:4096,deadlineMs:5000,
      maxAttempts:1,sourceFingerprint:SRC,
      realProcessStarts:0,workspaceRegistered:false,finalMp4Verified:false,
    });
    expect(p.reviewFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(p.reviewFingerprint).not.toBe(BIN);
    expect(p.reviewFingerprint).not.toBe(SRC);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.executable)).toBe(true);
    expect(Object.isFrozen(p.argv)).toBe(true);
    expect(p.argv).toEqual(['--version']);
    expect(p.physicalAuthorized).toBe(false);
  });
  it('is deterministic across fresh requests and does not retain or freeze caller input',()=>{
    const a=request();
    const plan=inspectSoloFixedOfflineSmoke(a);
    const b=inspectSoloFixedOfflineSmoke(request());
    expect(plan.reviewFingerprint).toBe(b.reviewFingerprint);
    expect(plan).toBe(b);
    expect(Object.isFrozen(a)).toBe(false);
    a.binarySha256='bad';
    a.workspaceRevision='mutated' as unknown as null;
    expect(plan.executable.sha256).toBe(BIN);
    expect(plan.workspaceRevision).toBeNull();
  });
  it('assesses the exact immutable reviewed plan but always blocks physical admission',()=>{
    const p=inspectSoloFixedOfflineSmoke(request());
    const a=assessSoloFixedOfflineSmoke(p,check(p));
    expect(a).toEqual({
      status:'PHYSICAL_LAUNCH_NOT_AUTHORIZED',
      codeOnlyPlanValid:true,
      physicalAuthorized:false,executionAvailable:false,admitted:false,
      workspaceRegistered:false,realProcessStarts:0,providerCalls:0,
      mediaProduced:false,finalMp4Verified:false,
    });
    expect(Object.isFrozen(a)).toBe(true);
    expect(()=>assessSoloFixedOfflineSmoke({...p},check(p))).toThrow('SOLO_FIXED_SMOKE_REVIEW_NOT_BOUND');
    expect(()=>assessSoloFixedOfflineSmoke({...p,admitted:true},check(p))).toThrow('SOLO_FIXED_SMOKE_REVIEW_NOT_BOUND');
  });
  it('rejects alternate profile, operation, mode, stale source fingerprint and binary SHA',()=>{
    for(const patch of [
      {profile:'node-offline-v1'}, {operationId:'run-custom-script'},
      {operationId:'solo-node-version-smoke-v2'},{mode:'execute'},
      {binarySha256:'f'.repeat(64)},{sourceFingerprint:'f'.repeat(64)},
      {workspaceGeneration:'2026-10-12T00:00:00.000Z'}, {workspaceRevision:1},
      {approvalReceipt:'signed'}, {attemptId:'foo'},
      {attemptId:'foo/../bar'}, {networkProfile:'on'}, {providerProfile:'tts'},
    ])expect(()=>inspectSoloFixedOfflineSmoke({...request(),...patch}))
      .toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
  });
  it('rejects arbitrary executable, command, shell, argv, cwd, env, eval and stdin',()=>{
    for(const patch of [
      {executable:'powershell.exe'},{toolPath:'C:\\temp\\node.exe'},
      {nodePath:'C:\\other\\node.exe'}, {argv:['-e','require("fs")']},
      {args:['--eval','1+1']},{command:'node --version'},
      {shell:true},{cwd:'C:\\user\\friend'}, {env:{NODE_OPTIONS:'--require attacker'}},
      {stdin:'inherit'}, {code:'process.exit(0)'},{exec:'cmd.exe'},
      {script:'demo.js'},{entry:'arbitrary'},{plugin:'allow'},
      {interpreter:'node'},{interactive:true},
    ])expect(()=>inspectSoloFixedOfflineSmoke({...request(),...patch}))
      .toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
  });
  it('rejects symlink/reparse/third-party Workspace root and identity selectors',()=>{
    for(const patch of [
      {workspaceRoot:'C:\\friend\\video'}, {workspacePath:'../friend'},
      {workspaceId:'foreign'}, {workspaceCanonicalRoot:'\\\\host\\share'},
      {reparsePoint:'yes'}, {symlink:'../../other'},
      {root:'C:\\1.งานโด้\\SUD-D-Solo-Test-Workspace'},
      {snapshotRoot:'.sud-d'}, {workspaceOwned:true},
      {nodeFileId:'claimed-valid'}, {signatureVerified:true},
    ])expect(()=>inspectSoloFixedOfflineSmoke({...request(),...patch}))
      .toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
  });
  it('rejects attempts to mint provider, egress, spend, OS Job or Final MP4 success',()=>{
    for(const patch of [
      {providerUrl:'https://api.invalid'},{network:'allow'},
      {egress:'allow'}, {spend:100},{budget:999},
      {ownerApproval:true}, {consumedReceipt:'fake'}, {physicalAuthorized:true},
      {jobProven:true}, {cleanupProven:true}, {jobMembership:'PASS'},
      {mediaFilesProduced:1},{MP4_VERIFIED:true}, {finalMp4Verified:true},
      {runnerStart:true}, {executionAvailable:true},
    ])expect(()=>inspectSoloFixedOfflineSmoke({...request(),...patch}))
      .toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
  });
  it('rejects extra hidden or symbol keys and getter descriptors without evaluating them',()=>{
    for(const at of ['hidden','symbol','getter'] as const){
      const input=request();let calls=0;
      if(at==='hidden')Object.defineProperty(input,'secret',{value:'any',enumerable:false});
      if(at==='symbol')Object.defineProperty(input,Symbol('shell'),{value:'cmd.exe'});
      if(at==='getter')Object.defineProperty(input,'binarySha256',{enumerable:true,get(){
        calls++;throw Error('DO_NOT_EVALUATE');}});
      expect(()=>inspectSoloFixedOfflineSmoke(input)).toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
      expect(calls).toBe(0);
    }
    const proto=Object.assign(Object.create({shell:'cmd'}),request());
    expect(()=>inspectSoloFixedOfflineSmoke(proto)).toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
    expect(()=>inspectSoloFixedOfflineSmoke(null)).toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
    expect(()=>inspectSoloFixedOfflineSmoke([])).toThrow('SOLO_FIXED_SMOKE_REVIEW_INVALID');
  });
  it('rejects forged or stale assessment attempt identifiers and all extra selectors',()=>{
    const p=inspectSoloFixedOfflineSmoke(request());
    for(const patch of [
      {profile:'node-offline-v1'}, {operationId:'custom'},
      {reviewFingerprint:'b'.repeat(64)},{binarySha256:'b'.repeat(64)},
      {sourceFingerprint:'f'.repeat(64)},
      {workspaceGeneration:'generation-2'}, {workspaceRevision:1},
      {approvalReceipt:'signed'}, {attemptId:'reused'}, {attemptId:'colliding'},
      {cwd:'C:\\Windows'}, {args:['--eval','x']},{provider:'tts'},
      {jobProof:'PASS'}, {finalMp4Verified:true}, {environment:{}},
    ])expect(()=>assessSoloFixedOfflineSmoke(p,{...check(p),...patch}))
      .toThrow('SOLO_FIXED_SMOKE_REVIEW_NOT_BOUND');
    for(const mod of ['hidden','symbol','getter'] as const){
      const v=check(p);let calls=0;
      if(mod==='hidden')Object.defineProperty(v,'hiddenApproval',{value:true,enumerable:false});
      if(mod==='symbol')Object.defineProperty(v,Symbol('authority'),{value:true});
      if(mod==='getter')Object.defineProperty(v,'attemptId',{enumerable:true,get(){
        calls++;throw Error('NOT_EVALUATED');
      }});
      expect(()=>assessSoloFixedOfflineSmoke(p,v)).toThrow('SOLO_FIXED_SMOKE_REVIEW_NOT_BOUND');
      expect(calls).toBe(0);
    }
  });
  it('must not expose a method to launch or issue a real Runner action',()=>{
    const plan=inspectSoloFixedOfflineSmoke(request()) as unknown as Record<string,unknown>;
    expect(Object.keys(plan)).not.toContain('launch');
    expect(Object.keys(plan)).not.toContain('spawn');
    expect(Object.keys(plan)).not.toContain('runner.start');
    expect(Object.keys(plan)).not.toContain('start');
  });
});
