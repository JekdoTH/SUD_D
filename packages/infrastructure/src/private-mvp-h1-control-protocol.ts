import {createHmac,timingSafeEqual} from 'node:crypto';

export const F2H1_FIXED_FRAME_BYTES=4096;
type Role='desktop'|'runner';
type Kind='ready'|'heartbeat'|'cancel'|'prepare'|'h0-owned'|'h0-ack'|'h0-handoff'|'stopped'|'reject';
const identifier=/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/;
const digest=/^[0-9a-f]{64}$/;
export interface F2H1RunnerControlFrame {
  readonly role:Role;readonly kind:Kind;readonly epoch:string;
  readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly challenge:string;readonly sequence:number;
  readonly payload:Readonly<Record<string,never>>;
  readonly mac:string;
}
/** Module-private issuance privilege. Normal MAC issuers cannot forge an H0 ACK. */
const verifiedH0AckIssuers=new WeakMap<object,{
  readonly issue:()=>F2H1RunnerControlFrame;
  readonly role:Role;readonly ownerEpoch:string;readonly missionId:string;
  readonly attemptId:string;readonly stageSealDigest:string;
  readonly executionFingerprint:string;
}>();
/** Privately recognize a real Runner-role protocol, never a caller fake accept(). */
const verifiedH0AckReceivers=new WeakMap<object,{
  readonly role:Role;readonly ownerEpoch:string;readonly missionId:string;
  readonly attemptId:string;readonly stageSealDigest:string;
  readonly executionFingerprint:string;
}>();
export function createF2H1RunnerControlProtocol(input:{
  readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly key:Uint8Array;readonly challenge:Uint8Array;
  readonly localRole?:Role;
}) {
  if(!identifier.test(input?.ownerEpoch)||!identifier.test(input?.missionId)
    ||!identifier.test(input?.attemptId)||!digest.test(input?.stageSealDigest)
    ||!digest.test(input?.executionFingerprint)
    ||input?.key?.length!==32||input?.challenge?.length!==32
    ||input.challenge.every(b=>b===0))
    throw Error('F2_H1_PRIVATE_CHANNEL_UNTRUSTED_PARAMETERS');
  const key=Buffer.from(input.key),challenge=Buffer.from(input.challenge).toString('hex');
  let desktopOut=0,runnerOut=0,lastRunnerIn=0,lastDesktopIn=0;
  const localRole=input.localRole??'desktop';
  const serialize=(frame:Omit<F2H1RunnerControlFrame,'mac'>)=>JSON.stringify(frame);
  const mac=(frame:Omit<F2H1RunnerControlFrame,'mac'>)=>
    createHmac('sha256',key).update('SUD-H1-RUNNER-B-V1|'+serialize(frame)).digest('hex');
  function issueInternal(role:Role,kind:Kind,payload:Record<string,never>,internalH0Ack=false):F2H1RunnerControlFrame {
    if(kind==='h0-ack'&&(!internalH0Ack||role!=='desktop'||localRole!=='desktop'))
      throw Error('F2_H1_H0_ACK_REQUIRES_TRUSTED_OS_ORDERING');
    if(!['ready','heartbeat','cancel','prepare','h0-owned','h0-ack','h0-handoff','stopped','reject'].includes(kind)
      ||!payload||Object.keys(payload).length!==0)throw Error('F2_H1_UNREVIEWED_CONTROL_COMMAND');
    const sequence=role==='desktop'?++desktopOut:++runnerOut;
    const body=Object.freeze({
      role,kind,epoch:input.ownerEpoch,missionId:input.missionId,attemptId:input.attemptId,
      stageSealDigest:input.stageSealDigest,executionFingerprint:input.executionFingerprint,
      challenge,sequence,payload:Object.freeze({}),
    });
    const frame=Object.freeze({...body,mac:mac(body)});
    if(Buffer.byteLength(JSON.stringify(frame))>F2H1_FIXED_FRAME_BYTES)
      throw Error('F2_H1_FRAME_OVERSIZE');
    return frame;
  }
  function issue(role:Role,kind:Kind,payload:Record<string,never>):F2H1RunnerControlFrame {
    return issueInternal(role,kind,payload,false);
  }
  function accept(expectedRemoteRole:Role,value:unknown):boolean {
    if(expectedRemoteRole===localRole||!value||typeof value!=='object')return false;
    const f=value as Record<string,unknown>;
    const names=['attemptId','challenge','epoch','executionFingerprint','kind',
      'mac','missionId','payload','role','sequence','stageSealDigest'];
    if(Object.keys(f).sort().join('|')!==names.sort().join('|')
      ||Buffer.byteLength(JSON.stringify(f))>F2H1_FIXED_FRAME_BYTES
      ||f.role!==expectedRemoteRole||f.epoch!==input.ownerEpoch
      ||f.missionId!==input.missionId||f.attemptId!==input.attemptId
      ||f.stageSealDigest!==input.stageSealDigest
      ||f.executionFingerprint!==input.executionFingerprint
      ||f.challenge!==challenge||!identifier.test(f.kind as string)
      ||!(expectedRemoteRole==='runner'
        ?['ready','heartbeat','h0-owned','h0-handoff','stopped','reject']
        :['heartbeat','cancel','prepare','h0-ack','reject']).includes(f.kind as string)
      ||!f.payload||typeof f.payload!=='object'||Array.isArray(f.payload)
      ||Object.keys(f.payload).length!==0
      ||!Number.isSafeInteger(f.sequence)||Number(f.sequence)
        <=(expectedRemoteRole==='runner'?lastRunnerIn:lastDesktopIn)
      ||typeof f.mac!=='string'||!digest.test(f.mac))return false;
    const {mac:_,...body}=f;
    const expected=Buffer.from(mac(body as Omit<F2H1RunnerControlFrame,'mac'>),'hex');
    const actual=Buffer.from(f.mac,'hex');
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;
    if(expectedRemoteRole==='runner')lastRunnerIn=Number(f.sequence);
    else lastDesktopIn=Number(f.sequence);
    return true;
  }
  const protocol=Object.freeze({issue,accept});
  if(localRole==='desktop')verifiedH0AckIssuers.set(protocol,{
    issue:()=>issueInternal('desktop','h0-ack',{},true),
    role:localRole,ownerEpoch:input.ownerEpoch,missionId:input.missionId,
    attemptId:input.attemptId,stageSealDigest:input.stageSealDigest,
    executionFingerprint:input.executionFingerprint,
  });
  if(localRole==='runner')verifiedH0AckReceivers.set(protocol,{
    role:localRole,ownerEpoch:input.ownerEpoch,missionId:input.missionId,
    attemptId:input.attemptId,stageSealDigest:input.stageSealDigest,
    executionFingerprint:input.executionFingerprint,
  });
  return protocol;
}

/** F2-H1 Topology B, CODE-ONLY H0 ordering seam, NOT an OS attestation.
 * Its evidence port MUST eventually be implemented by Desktop-owned native code
 * using the retained Runner PROCESS HANDLE. No caller-supplied PID, handle,
 * handle selector, OS-verification boolean, or public command is supported.
 * This is deliberately NOT wired into pullExactH0FromOwnedRunner or a Runner.
 */
export interface F2H1H0PhysicalEvidence {
  readonly originToken:string;
  readonly createdByRunnerObject:string;
  readonly duplicatedFromRunnerObject:string;
  readonly processObjectType:'process';
  readonly handleRole:'h0-process';
  readonly workerJobObject:string;
  readonly imageDigest:string;
  readonly stageSealDigest:string;
  readonly recipeFingerprint:string;
  readonly ownerEpoch:string;
  readonly missionId:string;
  readonly attemptId:string;
  readonly processRights:number;
  readonly h0Alive:boolean;
  readonly threadSuspended:boolean;
  /** H0 PROCESS must be a member of the Desktop-owned outer Guardian Job. */
  readonly guardianJobMember:boolean;
  /** Desktop's duplicated H0 PROCESS HANDLE must have inheritance OFF. */
  readonly duplicatedH0HandleInheritable:boolean;
  /** H0/Runner must NOT possess the Guardian Job HANDLE. */
  readonly inheritedGuardianHandle:boolean;
  readonly inheritedControlHandle:boolean;
}
export interface F2H1H0AckExpected {
  readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly recipeFingerprint:string;readonly imageDigest:string;
  readonly runnerCreationToken:string;readonly retainedRunnerObject:string;
  readonly workerJobObject:string;
}
/** A MAC-valid 'h0-owned' is ONLY a request to examine OS evidence, never
 * proof of physical creation. The authenticated desktop 'h0-ack' is emitted
 * only after the trusted evidence port verifies the duplicate and identity.
 * No output from this pure module authorizes ResumeThread or Native execution.
 */
/** Shared exact R1–R4 synthetic evidence predicate; never OS attestation. */
function inspectF2H1H0PhysicalProof(expected:F2H1H0AckExpected,value:unknown):
  value is F2H1H0PhysicalEvidence {
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  const e=value as Record<string,unknown>;
  const keys=[
    'attemptId','createdByRunnerObject','duplicatedFromRunnerObject',
    'duplicatedH0HandleInheritable','guardianJobMember','h0Alive',
    'handleRole','imageDigest','inheritedControlHandle','inheritedGuardianHandle',
    'missionId','originToken','ownerEpoch','processObjectType','processRights',
    'recipeFingerprint','stageSealDigest','threadSuspended','workerJobObject',
  ].sort().join('|');
  return Object.keys(e).sort().join('|')===keys
    &&e.originToken===expected.runnerCreationToken
    &&e.createdByRunnerObject===expected.retainedRunnerObject
    &&e.duplicatedFromRunnerObject===expected.retainedRunnerObject
    &&e.processObjectType==='process'&&e.handleRole==='h0-process'
    &&e.workerJobObject===expected.workerJobObject
    &&e.imageDigest===expected.imageDigest
    &&e.stageSealDigest===expected.stageSealDigest
    &&e.recipeFingerprint===expected.recipeFingerprint
    &&e.ownerEpoch===expected.ownerEpoch
    &&e.missionId===expected.missionId&&e.attemptId===expected.attemptId
    &&e.processRights===0x101000
    &&e.h0Alive===true&&e.threadSuspended===true
    &&e.guardianJobMember===true&&e.duplicatedH0HandleInheritable===false
    &&e.inheritedGuardianHandle===false&&e.inheritedControlHandle===false;
}

export function createF2H1H0AckOrdering(input:{
  readonly protocol:Pick<ReturnType<typeof createF2H1RunnerControlProtocol>,'accept'|'issue'>;
  readonly expected:F2H1H0AckExpected;
  readonly retainedRunnerEvidence:{readonly duplicateAndInspectOwnedH0:()=>F2H1H0PhysicalEvidence};
  /** Promise resolves when the existing private pipe WRITE is confirmed locally.
   * This is NOT proof the remote Runner processed the frame. */
  readonly authenticatedDesktopChannel:{readonly send:(frame:F2H1RunnerControlFrame)=>Promise<void>};
}) {
  // Own immutable snapshot: TypeScript readonly does NOT prevent a caller from
  // mutating its original expected object between construction and receive.
  const supplied=input.expected;
  const expected=Object.freeze({
    ownerEpoch:supplied?.ownerEpoch,missionId:supplied?.missionId,
    attemptId:supplied?.attemptId,stageSealDigest:supplied?.stageSealDigest,
    executionFingerprint:supplied?.executionFingerprint,
    recipeFingerprint:supplied?.recipeFingerprint,imageDigest:supplied?.imageDigest,
    runnerCreationToken:supplied?.runnerCreationToken,
    retainedRunnerObject:supplied?.retainedRunnerObject,
    workerJobObject:supplied?.workerJobObject,
  });
  const privileged=verifiedH0AckIssuers.get(input.protocol);
  if(!privileged||privileged.role!=='desktop'
    ||privileged.ownerEpoch!==expected?.ownerEpoch
    ||privileged.missionId!==expected?.missionId
    ||privileged.attemptId!==expected?.attemptId
    ||privileged.stageSealDigest!==expected?.stageSealDigest
    ||privileged.executionFingerprint!==expected?.executionFingerprint)
    throw Error('F2_H1_H0_ACK_CHANNEL_BINDING_MISMATCH');
  if(!expected||!identifier.test(expected.ownerEpoch)||!identifier.test(expected.missionId)
    ||!identifier.test(expected.attemptId)||!digest.test(expected.stageSealDigest)
    ||!digest.test(expected.executionFingerprint)||!digest.test(expected.recipeFingerprint)
    ||!digest.test(expected.imageDigest)
    ||!identifier.test(expected.runnerCreationToken)
    ||!identifier.test(expected.retainedRunnerObject)
    ||!identifier.test(expected.workerJobObject)
    ||typeof input.protocol?.accept!=='function'
    ||typeof input.protocol?.issue!=='function'
    ||typeof input.retainedRunnerEvidence?.duplicateAndInspectOwnedH0!=='function'
    ||typeof input.authenticatedDesktopChannel?.send!=='function')
    throw Error('F2_H1_H0_ACK_PRIVATE_BINDING_INVALID');
  const issueTrustedAck=privileged.issue;
  let state:'awaiting-os-evidence'|'pending-write'|'acknowledged'|'quarantined'='awaiting-os-evidence';
  const inspectProof=(value:unknown)=>inspectF2H1H0PhysicalProof(expected,value);
  async function receive(value:unknown):Promise<'acknowledged'|'quarantined'> {
    // Replays, including during an in-flight write, permanently quarantine.
    if(state!=='awaiting-os-evidence')return state='quarantined';
    state='quarantined';
    try {
      const frame=value as F2H1RunnerControlFrame|undefined;
      // A valid MAC authenticates a frame, never a physical H0 OS owner.
      if(!input.protocol.accept('runner',value)||frame?.kind!=='h0-owned')return state;
      const proof=input.retainedRunnerEvidence.duplicateAndInspectOwnedH0();
      if(!inspectProof(proof))return state;
      const ack=issueTrustedAck();
      state='pending-write';
      // Reuse the existing finite Desktop bootstrap/write deadline (5000ms).
      // A Promise resolved by the pipe writer means locally completed WRITE,
      // not an end-to-end receipt or authority to resume any native process.
      const sent=input.authenticatedDesktopChannel.send(ack);
      if(!sent||typeof sent.then!=='function')return state='quarantined';
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        await Promise.race([
          sent,
          new Promise<never>((_,reject)=>{
            timer=setTimeout(()=>reject(Error('F2_H1_H0_ACK_PIPE_WRITE_TIMEOUT')),5000);
          }),
        ]);
      }finally {
        if(timer!==undefined)clearTimeout(timer);
      }
      // A concurrent replay may already have quarantined this attempt.
      if(state!=='pending-write')return state='quarantined';
      return state='acknowledged';
    }catch{return state='quarantined';}
  }
  return Object.freeze({receive,state:()=>state,
    nativeAuthorization:false as const,readiness:()=>false as const});
}

/** Private Runner-local, synthetic H0 creation/ACK receipt fence (Topology B).
 * A verified Desktop pipe WRITE is not receipt. pinHeldCreation represents
 * only a local event in a future trusted Runner, NOT OS provenance. This pure
 * module is deliberately not connected to Runner entry or Native ResumeThread.
 */
export interface F2H1RunnerH0AckExpected {
  readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  /** Opaque locally minted identifiers, never a PID, handle or selector. */
  readonly runnerCreationToken:string;readonly h0Identity:string;
  /** Next exact Desktop frame sequence from the locally frozen control order. */
  readonly expectedAckSequence:number;
}
export interface F2H1RunnerHeldH0Creation {
  readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly runnerCreationToken:string;readonly h0Identity:string;
  readonly state:'h0-control-suspended';
}
type F2H1RunnerH0AckState='awaiting-held-creation'|'awaiting-ack'|
  'ack-received-for-this-frozen-epoch'|'quarantined';

/** No OS verification boolean or resume permit; failures are irreversible.
 * The future native owner MUST independently prove creation, thread suspension,
 * process identity, ownership, lease and IO before wiring any local event.
 */
export function createF2H1RunnerH0AckReceipt(input:{
  readonly protocol:Pick<ReturnType<typeof createF2H1RunnerControlProtocol>,'accept'>;
  readonly expected:F2H1RunnerH0AckExpected;
}) {
  const supplied=input?.expected;
  const expected=Object.freeze({
    ownerEpoch:supplied?.ownerEpoch,missionId:supplied?.missionId,
    attemptId:supplied?.attemptId,stageSealDigest:supplied?.stageSealDigest,
    executionFingerprint:supplied?.executionFingerprint,
    runnerCreationToken:supplied?.runnerCreationToken,h0Identity:supplied?.h0Identity,
    expectedAckSequence:supplied?.expectedAckSequence,
  });
  const peer=verifiedH0AckReceivers.get(input?.protocol);
  if(!peer||peer.role!=='runner'
    ||peer.ownerEpoch!==expected.ownerEpoch||peer.missionId!==expected.missionId
    ||peer.attemptId!==expected.attemptId
    ||peer.stageSealDigest!==expected.stageSealDigest
    ||peer.executionFingerprint!==expected.executionFingerprint
    ||typeof input.protocol.accept!=='function')
    throw Error('F2_H1_RUNNER_ACK_CHANNEL_BINDING_MISMATCH');
  if(!identifier.test(expected.ownerEpoch)||!identifier.test(expected.missionId)
    ||!identifier.test(expected.attemptId)||!digest.test(expected.stageSealDigest)
    ||!digest.test(expected.executionFingerprint)
    ||!identifier.test(expected.runnerCreationToken)
    ||!identifier.test(expected.h0Identity)
    ||!Number.isSafeInteger(expected.expectedAckSequence)
    ||expected.expectedAckSequence<1)
    throw Error('F2_H1_RUNNER_ACK_EXPECTED_INVALID');

  let state:F2H1RunnerH0AckState='awaiting-held-creation';
  const heldKeys=[
    'attemptId','executionFingerprint','h0Identity','missionId','ownerEpoch',
    'runnerCreationToken','stageSealDigest','state',
  ].join('|');
  function pinHeldCreation(value:unknown):F2H1RunnerH0AckState {
    if(state!=='awaiting-held-creation')return state='quarantined';
    state='quarantined'; // fail closed before inspecting caller-supplied data
    if(!value||typeof value!=='object'||Array.isArray(value))return state;
    const h=value as Record<string,unknown>;
    if(Object.keys(h).sort().join('|')!==heldKeys
      ||h.ownerEpoch!==expected.ownerEpoch||h.missionId!==expected.missionId
      ||h.attemptId!==expected.attemptId
      ||h.stageSealDigest!==expected.stageSealDigest
      ||h.executionFingerprint!==expected.executionFingerprint
      ||h.runnerCreationToken!==expected.runnerCreationToken
      ||h.h0Identity!==expected.h0Identity
      ||h.state!=='h0-control-suspended')return state;
    return state='awaiting-ack';
  }
  function receive(value:unknown):F2H1RunnerH0AckState {
    if(state!=='awaiting-ack')return state='quarantined';
    state='quarantined';
    try {
      const frame=value as F2H1RunnerControlFrame|undefined;
      if(!input.protocol.accept('desktop',value)||frame?.kind!=='h0-ack'
        ||frame.sequence!==expected.expectedAckSequence)return state;
      return state='ack-received-for-this-frozen-epoch';
    }catch{return state;}
  }
  /** H0 exit, owner/lease loss, cancelled IO or invalid terminal state
   * permanently fence this one attempt, including after a valid ACK. */
  function fence(_reason:'h0-exited'|'owner-lost'|'lease-expired'|'io-cancelled'):
    F2H1RunnerH0AckState {
    return state='quarantined';
  }
  return Object.freeze({pinHeldCreation,receive,fence,state:()=>state,
    nativeAuthorization:false as const,readiness:()=>false as const});
}

/** The Desktop↔Runner *control* V2 is independent of the Runner↔H0 binary ABI V2.
 * Pure, test-only construction; nothing imports this into the real entrypoints.
 */
export const F2H1_PRIVATE_CONTROL_V2_REVISION='f2-h1-control-v2' as const;
const v2Coordinate=/^[1-9][0-9]{0,19}$/;
function validV2Coordinate(value:unknown):value is string {
  if(typeof value!=='string'||!v2Coordinate.test(value))return false;
  const n=BigInt(value);
  // Reject signed-negative Win32 pseudo-handle bit patterns (-1, -2, -4, etc.).
  return n>0n&&n<=0x7fffffffffffffffn;
}
/** Preserve exact enrolled Workspace generation: legacy V2 identifier OR
 * F2-A canonical UTC ISO (Date#toISOString) with no coercion or rewriting.
 * Accept the standard 24-char and extended-year 27-char ISO forms only. */
function validV2WorkspaceGeneration(value:unknown):value is string {
  if(typeof value!=='string'||value.length>63)return false;
  if(identifier.test(value))return true;
  if((value.length!==24&&value.length!==27)
    ||!/^(?:[0-9]{4}|[+-][0-9]{6})-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value))
    return false;
  const parsed=new Date(value);
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString()===value;
}
export interface F2H1ControlV2Prepare {
  readonly missionRevision:number;
  readonly workspaceGeneration:string;
  readonly stageIdentity:string;
  readonly recipeFingerprint:string;
  readonly profileSid:string;
  readonly deadlineMs:number;
  readonly creationToken:string;
  readonly h0Identity:string;
}
export type F2H1ControlV2Payload =
  |Readonly<Record<string,never>>
  |Readonly<F2H1ControlV2Prepare>
  |Readonly<{creationToken:string;h0Identity:string;sourceProcessCoordinate:string}>
  |Readonly<{creationToken:string;h0Identity:string}>;
export interface F2H1ControlV2Frame {
  readonly revision:typeof F2H1_PRIVATE_CONTROL_V2_REVISION;
  readonly role:Role;readonly kind:Kind;
  readonly epoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly challenge:string;readonly sequence:number;
  readonly payload:F2H1ControlV2Payload;readonly mac:string;
}
type V2Fence='cancelled'|'eof'|'lease-expired'|'owner-lost'|'io-cancelled'|'h0-exited';
function v2PayloadValid(role:Role,kind:Kind,payload:unknown):payload is F2H1ControlV2Payload {
  if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
  const p=payload as Record<string,unknown>;
  const keys=Object.keys(p).sort().join('|');
  if(kind==='prepare'&&role==='desktop')
    return keys==='creationToken|deadlineMs|h0Identity|missionRevision|profileSid|recipeFingerprint|stageIdentity|workspaceGeneration'
      &&identifier.test(p.creationToken as string)&&identifier.test(p.h0Identity as string)
      &&identifier.test(p.stageIdentity as string)&&validV2WorkspaceGeneration(p.workspaceGeneration)
      &&digest.test(p.recipeFingerprint as string)
      &&typeof p.profileSid==='string'&&/^S-1-15-2-(?:[0-9]{1,10})(?:-[0-9]{1,10}){0,11}$/.test(p.profileSid)
      &&Number.isSafeInteger(p.missionRevision)&&Number(p.missionRevision)>0
      &&Number.isSafeInteger(p.deadlineMs)&&Number(p.deadlineMs)>0;
  if(kind==='h0-owned'&&role==='runner')
    return keys==='creationToken|h0Identity|sourceProcessCoordinate'
      &&identifier.test(p.creationToken as string)&&identifier.test(p.h0Identity as string)
      &&validV2Coordinate(p.sourceProcessCoordinate);
  if((kind==='h0-ack'&&role==='desktop')||(kind==='h0-handoff'&&role==='runner'))
    return keys==='creationToken|h0Identity'
      &&identifier.test(p.creationToken as string)&&identifier.test(p.h0Identity as string);
  return (role==='desktop'
    ?['heartbeat','cancel','reject'].includes(kind)
    :['ready','heartbeat','stopped','reject'].includes(kind))&&keys==='';
}
const v2Privileged=new WeakMap<object,{
  readonly role:Role;
  readonly sendAck:(payload:{creationToken:string;h0Identity:string})=>Promise<F2H1ControlV2Frame>;
  readonly sendOwned:(payload:{creationToken:string;h0Identity:string;sourceProcessCoordinate:string})=>Promise<F2H1ControlV2Frame>;
  readonly id:Readonly<{ownerEpoch:string;missionId:string;attemptId:string;
    stageSealDigest:string;executionFingerprint:string}>;
  readonly reserveIncomingAck:(deadlineMs:number)=>boolean;
}>();

/** One role-local serialized writer, one strict next-sequence reader.
 * A write Promise settles only *local* delivery, not remote receipt.
 * Caller can inject a fake pipe and monotonic time; no native IO is created.
 */
export function createF2H1PrivateControlV2(input:{
  readonly localRole:Role;
  readonly ownerEpoch:string;readonly missionId:string;readonly attemptId:string;
  readonly stageSealDigest:string;readonly executionFingerprint:string;
  readonly key:Uint8Array;readonly challenge:Uint8Array;
  readonly send:(frame:F2H1ControlV2Frame)=>Promise<void>;
  readonly now:()=>number;
  readonly ownerDeadlineMs:number;readonly missionDeadlineMs:number;
  readonly leaseDeadlineMs:number;
}) {
  if(!['desktop','runner'].includes(input?.localRole)
    ||!identifier.test(input?.ownerEpoch)||!identifier.test(input?.missionId)
    ||!identifier.test(input?.attemptId)||!digest.test(input?.stageSealDigest)
    ||!digest.test(input?.executionFingerprint)||input?.key?.length!==32
    ||input?.challenge?.length!==32||input.challenge.every(b=>b===0)
    ||typeof input.send!=='function'||typeof input.now!=='function'
    ||![input.ownerDeadlineMs,input.missionDeadlineMs,input.leaseDeadlineMs]
      .every(n=>Number.isSafeInteger(n)&&n>0))
    throw Error('F2_H1_V2_UNTRUSTED_BOOTSTRAP');
  const secret=Buffer.from(input.key),challenge=Buffer.from(input.challenge).toString('hex');
  const id=Object.freeze({ownerEpoch:input.ownerEpoch,missionId:input.missionId,
    attemptId:input.attemptId,stageSealDigest:input.stageSealDigest,
    executionFingerprint:input.executionFingerprint});
  let outgoing=0,incoming=0,pending=false,terminal=false;
  let rendezvous:'idle'|'preparing'|'reserved'|'sending-ack'|'finished'='idle';
  let ackDeadline=0;
  const localDeadline=Math.min(input.ownerDeadlineMs,input.missionDeadlineMs,input.leaseDeadlineMs);
  const mac=(body:Omit<F2H1ControlV2Frame,'mac'>)=>
    createHmac('sha256',secret).update('SUD-H1-RUNNER-B-V2|'+JSON.stringify(body)).digest('hex');
  const validTime=()=>Number.isFinite(input.now())&&input.now()<localDeadline
    &&(rendezvous==='idle'||rendezvous==='finished'||input.now()<ackDeadline);
  function fence(_reason:V2Fence='io-cancelled') {
    terminal=true;
    return 'quarantined' as const;
  }
  async function write(kind:Kind,payload:F2H1ControlV2Payload,privileged=false):
    Promise<F2H1ControlV2Frame> {
    if(terminal||pending||!validTime()||!v2PayloadValid(input.localRole,kind,payload)
      ||(!privileged&&['h0-ack','h0-owned','h0-handoff'].includes(kind))
      ||(rendezvous!=='idle'&&input.localRole==='desktop'
        &&!(privileged&&kind==='h0-ack'&&rendezvous==='reserved')
        &&kind!=='cancel'))
      throw Error(fence());
    if(kind==='prepare'){
      if(input.localRole!=='desktop'||rendezvous!=='idle')throw Error(fence());
      // Drain is mandatory: an outstanding writer is refused, not overtaken.
      const absolute=Math.min(localDeadline, (payload as F2H1ControlV2Prepare).deadlineMs,
        input.now()+5000);
      if(absolute<=input.now())throw Error(fence());
      ackDeadline=absolute;
      rendezvous='preparing';
    }
    if(kind==='h0-ack'){
      if(input.localRole!=='desktop'||rendezvous!=='reserved')throw Error(fence());
      rendezvous='sending-ack';
    }
    pending=true;
    const body=Object.freeze({
      revision:F2H1_PRIVATE_CONTROL_V2_REVISION,role:input.localRole,kind,
      epoch:id.ownerEpoch,missionId:id.missionId,attemptId:id.attemptId,
      stageSealDigest:id.stageSealDigest,executionFingerprint:id.executionFingerprint,
      challenge,sequence:++outgoing,payload:Object.freeze({...payload}),
    });
    const frame=Object.freeze({...body,mac:mac(body)});
    if(Buffer.byteLength(JSON.stringify(frame))>F2H1_FIXED_FRAME_BYTES)
      throw Error(fence());
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const timeout=Math.max(0,Math.min(localDeadline,
        rendezvous==='idle'?localDeadline:ackDeadline)-input.now());
      const sent=input.send(frame);
      if(!sent||typeof sent.then!=='function')throw Error('NON_PROMISE_WRITE');
      await Promise.race([sent,new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(Error('WRITE_DEADLINE')),timeout);
      })]);
      if(terminal||!validTime())throw Error('FENCED_OR_LATE_WRITE');
      if(kind==='prepare')rendezvous='reserved';
      if(kind==='h0-ack')rendezvous='finished';
      return frame;
    }catch {
      throw Error(fence());
    }finally{pending=false;if(timer!==undefined)clearTimeout(timer);}
  }
  function accept(remote:Role,raw:unknown):F2H1ControlV2Frame|null {
    if(terminal||remote===input.localRole||!validTime()) {fence();return null;}
    try {
      const value=raw instanceof Uint8Array
        ?JSON.parse(Buffer.from(raw).toString('utf8')) as unknown:raw;
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error();
      const f=value as Record<string,unknown>;
      const names=['revision','role','kind','epoch','missionId','attemptId',
        'stageSealDigest','executionFingerprint','challenge','sequence','payload','mac'];
      if(Object.keys(f).sort().join('|')!==names.sort().join('|')
        ||Buffer.byteLength(JSON.stringify(f))>F2H1_FIXED_FRAME_BYTES
        ||f.revision!==F2H1_PRIVATE_CONTROL_V2_REVISION||f.role!==remote
        ||f.epoch!==id.ownerEpoch||f.missionId!==id.missionId
        ||f.attemptId!==id.attemptId||f.stageSealDigest!==id.stageSealDigest
        ||f.executionFingerprint!==id.executionFingerprint||f.challenge!==challenge
        ||!Number.isSafeInteger(f.sequence)||f.sequence!==incoming+1
        ||typeof f.kind!=='string'||!v2PayloadValid(remote,f.kind as Kind,f.payload)
        ||typeof f.mac!=='string'||!digest.test(f.mac))throw Error();
      const {mac:tag,...body}=f;
      const real=Buffer.from(tag as string,'hex');
      const reference=Buffer.from(mac(body as Omit<F2H1ControlV2Frame,'mac'>),'hex');
      if(real.length!==reference.length||!timingSafeEqual(real,reference))throw Error();
      incoming++;
      return f as unknown as F2H1ControlV2Frame;
    }catch{fence();return null;}
  }
  const protocol=Object.freeze({
    revision:F2H1_PRIVATE_CONTROL_V2_REVISION,
    role:input.localRole,send:(kind:Kind,payload:F2H1ControlV2Payload)=>write(kind,payload),
    accept,fence,state:()=>terminal?'quarantined':rendezvous,
    nativeAuthorization:false as const,readiness:()=>false as const,
  });
  v2Privileged.set(protocol,{
    role:input.localRole,id,
    sendAck:payload=>write('h0-ack',payload,true),
    sendOwned:payload=>write('h0-owned',payload,true),
    reserveIncomingAck:deadlineMs=>{
      if(terminal||input.localRole!=='runner'||rendezvous!=='idle'
        ||!Number.isSafeInteger(deadlineMs)||deadlineMs<=input.now()){
        fence();return false;
      }
      ackDeadline=Math.min(localDeadline,deadlineMs,input.now()+5000);
      if(ackDeadline<=input.now()){fence();return false;}
      rendezvous='reserved';return true;
    },
  });
  return protocol;
}

/** V2 Desktop uses the SAME exact R1–R4 pure synthetic evidence predicate
 * as V1. The coordinate is authenticated *data*, never a caller handle selector.
 * The injected evidence port is NOT wired to a physical Desktop owner.
 */
export function createF2H1V2DesktopH0AckOrdering(input:{
  readonly protocol:ReturnType<typeof createF2H1PrivateControlV2>;
  readonly expected:F2H1H0AckExpected;
  readonly prepare:F2H1ControlV2Prepare;
  readonly retainedRunnerEvidence:{
    readonly duplicateAndInspectOwnedH0:(sourceProcessCoordinate:string)=>{
      readonly sourceProcessCoordinate:string;readonly proof:F2H1H0PhysicalEvidence;
    };
  };
}) {
  const privilege=v2Privileged.get(input.protocol);
  const e=input.expected;
  const expected=Object.freeze({
    ownerEpoch:e?.ownerEpoch,missionId:e?.missionId,attemptId:e?.attemptId,
    stageSealDigest:e?.stageSealDigest,executionFingerprint:e?.executionFingerprint,
    recipeFingerprint:e?.recipeFingerprint,imageDigest:e?.imageDigest,
    runnerCreationToken:e?.runnerCreationToken,retainedRunnerObject:e?.retainedRunnerObject,
    workerJobObject:e?.workerJobObject,
  });
  const p=input.prepare;
  const prepared=Object.freeze({...p});
  if(!privilege||privilege.role!=='desktop'
    ||privilege.id.ownerEpoch!==expected.ownerEpoch
    ||privilege.id.missionId!==expected.missionId
    ||privilege.id.attemptId!==expected.attemptId
    ||privilege.id.stageSealDigest!==expected.stageSealDigest
    ||privilege.id.executionFingerprint!==expected.executionFingerprint
    ||!v2PayloadValid('desktop','prepare',prepared)
    ||!digest.test(expected.imageDigest)||!digest.test(expected.recipeFingerprint)
    ||!identifier.test(expected.runnerCreationToken)
    ||!identifier.test(expected.retainedRunnerObject)
    ||!identifier.test(expected.workerJobObject)
    ||expected.recipeFingerprint!==prepared.recipeFingerprint
    ||expected.runnerCreationToken!==prepared.creationToken
    ||typeof input.retainedRunnerEvidence?.duplicateAndInspectOwnedH0!=='function')
    throw Error('F2_H1_V2_DESKTOP_ORDERING_BINDING_INVALID');
  let state:'awaiting-owned'|'pending-write'|'acknowledged'|'quarantined'='awaiting-owned';
  function fence() {state='quarantined';input.protocol.fence();return state;}
  async function receiveOwned(raw:unknown):Promise<'acknowledged'|'quarantined'> {
    if(state!=='awaiting-owned'||input.protocol.state()!=='reserved')return fence();
    state='quarantined';
    try {
      const frame=input.protocol.accept('runner',raw);
      if(!frame||frame.kind!=='h0-owned')return fence();
      const owned=frame.payload as {creationToken:string;h0Identity:string;
        sourceProcessCoordinate:string};
      if(owned.creationToken!==prepared.creationToken
        ||owned.h0Identity!==prepared.h0Identity
        ||!validV2Coordinate(owned.sourceProcessCoordinate))return fence();
      const observation=input.retainedRunnerEvidence
        .duplicateAndInspectOwnedH0(owned.sourceProcessCoordinate);
      if(!observation||Object.keys(observation).sort().join('|')!=='proof|sourceProcessCoordinate'
        ||observation.sourceProcessCoordinate!==owned.sourceProcessCoordinate
        ||!inspectF2H1H0PhysicalProof(expected,observation.proof))return fence();
      state='pending-write';
      await privilege!.sendAck({creationToken:prepared.creationToken,h0Identity:prepared.h0Identity});
      if(state!=='pending-write')return fence();
      return state='acknowledged'; // Desktop local write only
    }catch{return fence();}
  }
  return Object.freeze({receiveOwned,fence,state:()=>state,
    nativeAuthorization:false as const,readiness:()=>false as const});
}

/** Pure Runner: prepare is authenticated ONCE, and the expected ACK sequence
 * is derived from its actual receipt, never from a caller permission boolean.
 * The locally injected held-creation record is synthetic, NOT OS provenance.
 */
export function createF2H1V2RunnerH0AckReceipt(input:{
  readonly protocol:ReturnType<typeof createF2H1PrivateControlV2>;
}) {
  const privilege=v2Privileged.get(input?.protocol);
  if(!privilege||privilege.role!=='runner')
    throw Error('F2_H1_V2_RUNNER_RECEIVER_BINDING_INVALID');
  let state:'awaiting-prepare'|'awaiting-held-creation'|'awaiting-ack'|
    'ack-received-for-this-frozen-epoch'|'quarantined'='awaiting-prepare';
  let binding:Readonly<{ownerEpoch:string;missionId:string;attemptId:string;
    stageSealDigest:string;executionFingerprint:string;
    creationToken:string;h0Identity:string;expectedAckSequence:number}>|undefined;
  let coordinate:string|undefined;
  let ownedSent=false;
  function fence(_reason:V2Fence='io-cancelled') {
    state='quarantined';input.protocol.fence(_reason);return state;
  }
  function receivePrepare(raw:unknown) {
    if(state!=='awaiting-prepare')return fence();
    const frame=input.protocol.accept('desktop',raw);
    if(!frame||frame.kind!=='prepare')return fence();
    const p=frame.payload as F2H1ControlV2Prepare;
    if(!privilege!.reserveIncomingAck(p.deadlineMs))return fence();
    binding=Object.freeze({
      ownerEpoch:frame.epoch,missionId:frame.missionId,attemptId:frame.attemptId,
      stageSealDigest:frame.stageSealDigest,executionFingerprint:frame.executionFingerprint,
      creationToken:p.creationToken,h0Identity:p.h0Identity,
      expectedAckSequence:frame.sequence+1,
    });
    return state='awaiting-held-creation';
  }
  function pinHeldCreation(value:unknown) {
    if(state!=='awaiting-held-creation'||!binding)return fence();
    if(!value||typeof value!=='object'||Array.isArray(value))return fence();
    const h=value as Record<string,unknown>;
    const keys=['attemptId','executionFingerprint','h0Identity','missionId','ownerEpoch',
      'runnerCreationToken','sourceProcessCoordinate','stageSealDigest','state'].join('|');
    if(Object.keys(h).sort().join('|')!==keys
      ||h.ownerEpoch!==binding.ownerEpoch||h.missionId!==binding.missionId
      ||h.attemptId!==binding.attemptId||h.stageSealDigest!==binding.stageSealDigest
      ||h.executionFingerprint!==binding.executionFingerprint
      ||h.runnerCreationToken!==binding.creationToken
      ||h.h0Identity!==binding.h0Identity||h.state!=='h0-control-suspended'
      ||!validV2Coordinate(h.sourceProcessCoordinate))return fence();
    coordinate=h.sourceProcessCoordinate;
    return state='awaiting-ack';
  }
  async function sendOwned() {
    if(state!=='awaiting-ack'||!binding||!coordinate||ownedSent){
      fence();throw Error('F2_H1_V2_OWNED_FENCED');
    }
    ownedSent=true;
    try {
      return await privilege!.sendOwned({
        creationToken:binding.creationToken,h0Identity:binding.h0Identity,
        sourceProcessCoordinate:coordinate,
      });
    }catch{fence();throw Error('F2_H1_V2_OWNED_WRITE_FAILED');}
  }
  function receiveAck(raw:unknown) {
    if(state!=='awaiting-ack'||!binding||!ownedSent)return fence();
    state='quarantined';
    const frame=input.protocol.accept('desktop',raw);
    if(!frame||frame.kind!=='h0-ack'||frame.sequence!==binding.expectedAckSequence)
      return fence();
    const ack=frame.payload as {creationToken:string;h0Identity:string};
    if(ack.creationToken!==binding.creationToken||ack.h0Identity!==binding.h0Identity)
      return fence();
    return state='ack-received-for-this-frozen-epoch';
  }
  return Object.freeze({receivePrepare,pinHeldCreation,sendOwned,receiveAck,fence,
    state:()=>state,nativeAuthorization:false as const,readiness:()=>false as const});
}

/** Pure newline-framed fake-pipe input credit. Max 16 buffered frames, each
 * <=4096 bytes; EOF with a partial frame is terminal. No actual OS pipe.
 */
export function createF2H1V2LineFramer() {
  let pending:number[]=[];
  const frames:Uint8Array[]=[];
  let terminal=false;
  function quarantine():never {
    terminal=true;pending=[];frames.length=0;
    throw Error('F2_H1_V2_FRAME_QUEUE_QUARANTINED');
  }
  function push(chunk:Uint8Array):number {
    if(terminal||!(chunk instanceof Uint8Array)||chunk.length===0)quarantine();
    for(const byte of chunk){
      if(byte===10){
        if(pending.length===0||frames.length>=16)quarantine();
        frames.push(Uint8Array.from(pending));pending=[];
      }else {
        if(pending.length>=F2H1_FIXED_FRAME_BYTES)quarantine();
        pending.push(byte);
      }
    }
    return frames.length;
  }
  function take():Uint8Array|undefined {
    if(terminal)quarantine();
    return frames.shift();
  }
  function eof() {
    terminal=true;
    if(pending.length!==0||frames.length!==0){
      pending=[];frames.length=0;
      return 'quarantined' as const;
    }
    return 'closed' as const;
  }
  return Object.freeze({push,take,eof,length:()=>frames.length,
    state:()=>terminal?'quarantined':'open'});
}
