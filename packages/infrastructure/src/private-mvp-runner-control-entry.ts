/**
 * F2-H1 Topology B fixed-purpose Runner control entrypoint.
 * This is NOT an MCP server, shell or generic command service. Installed
 * dependencies are Node + reviewed infrastructure code only. No SQLite,
 * credential store, network API, provider or renderer-controlled arguments.
 *
 * When this entry is run in future, its only capabilities will be the exact
 * Desktop-inherited anonymous pipe pair and read-only Desktop PROCESS handle;
 * Guardian Job HANDLE is Desktop-only, Worker Job is Runner-only. The OS
 * inherited handle-list / fixed parent identity must be independently proved
 * at creation, never learned from argv/env or a JSON frame.
 */
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createF2H1RunnerControlProtocol,F2H1_FIXED_FRAME_BYTES,
  createF2H1PrivateControlV2,createF2H1V2RunnerH0AckReceipt,
} from './private-mvp-h1-control-protocol.js';
import type {F2H1ControlV2Frame} from './private-mvp-h1-control-protocol.js';
import {Worker} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import koffi from 'koffi';
export const F2H1_RUNNER_CONTROL_ENTRY_REVISION='f2-h1-runner-control-b-v1' as const;
export const F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED=false as const;

/** Bounded framed pipe parsing for the future trusted Runner; neither this
 * parser nor MAC validates OS process ownership. The parent must supply a
 * proven physical pipe identity and independently held Desktop PROCESS handle.
 */
function decodeF2H1RunnerPipeBytes(raw:Uint8Array):Record<string,unknown> {
  if(!(raw instanceof Uint8Array)||raw.length===0
    ||raw.length>F2H1_FIXED_FRAME_BYTES)
    throw Error('F2_H1_RUNNER_FRAME_BOUNDS');
  const frame=JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
  if(!frame||typeof frame!=='object'||Array.isArray(frame))
    throw Error('F2_H1_RUNNER_FRAME_SHAPE');
  return frame as Record<string,unknown>;
}
/** Same fixed bounded private-line encoder used by V1 and the inert V2 role. */
function encodeF2H1RunnerPipeFrame(frame:unknown):Uint8Array {
  const bytes=Buffer.from(JSON.stringify(frame)+'\n','utf8');
  if(bytes.length>F2H1_FIXED_FRAME_BYTES)
    throw Error('F2_H1_CONTROL_WRITE_OVERSIZE');
  return bytes;
}
export function decodeF2H1RunnerControlFrame(raw:Uint8Array):unknown {
  const o=decodeF2H1RunnerPipeBytes(raw);
  if(Object.keys(o).length!==11
    ||o.role!=='desktop'||typeof o.mac!=='string'
    ||typeof o.epoch!=='string'||typeof o.sequence!=='number')
    throw Error('F2_H1_RUNNER_FRAME_ROLE');
  return Object.freeze(o);
}

/** This is the *real* fixed anonymous-pipe STDIN/STDOUT framing source;
 * there is no listener, public IPC, shell or dynamic command registration.
 * Reading from Node's asynchronous stream does not block the JS event loop.
 * A separate Worker Thread is required for independently scheduled watchdog.
 */
async function* fixedControlFrames():AsyncGenerator<Uint8Array> {
  const limit=F2H1_FIXED_FRAME_BYTES;
  let buffered: number[]=[];
  for await(const chunk of process.stdin){
    for(const byte of Buffer.from(chunk as Uint8Array)){
      if(byte===10){
        if(buffered.length===0)throw Error('F2_H1_EMPTY_CONTROL_FRAME');
        yield Uint8Array.from(buffered);
        buffered=[];
      }else{
        if(buffered.length>=limit)throw Error('F2_H1_CONTROL_FRAME_OVERSIZE');
        buffered.push(byte);
      }
    }
  }
  throw Error('F2_H1_CONTROL_PIPE_EOF_UNCONFIRMED');
}
/** No argv/env bootstrap: only the exact pipe inherited during STARTUPINFOEX
 * is allowed to deliver key/challenge/epoch and Desktop PROCESS coordinate.
 * No profile/worker/H0 selectors are supported.
 */
export interface F2H1FixedPipeBootstrap {
  readonly kind:'desktop-private-bootstrap-v1';
  readonly ownerEpoch:string;
  readonly missionId:string;
  readonly attemptId:string;
  readonly stageSealDigest:string;
  readonly executionFingerprint:string;
  readonly challenge:string;
  readonly secret:string;
  readonly inheritedDesktopProcess:string;
}
export function parseF2H1FixedPipeBootstrap(bytes:Uint8Array):F2H1FixedPipeBootstrap {
  if(bytes.length>F2H1_FIXED_FRAME_BYTES||bytes.length===0)
    throw Error('F2_H1_PRIVATE_BOOTSTRAP_LENGTH');
  let parsed:unknown;
  try{parsed=JSON.parse(Buffer.from(bytes).toString('utf8'));}
  catch{throw Error('F2_H1_PRIVATE_BOOTSTRAP_INVALID');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw Error('F2_H1_PRIVATE_BOOTSTRAP_INVALID');
  const data=parsed as Record<string,unknown>;
  const keys=['kind','ownerEpoch','missionId','attemptId','stageSealDigest',
    'executionFingerprint','challenge','secret','inheritedDesktopProcess'];
  if(Object.keys(data).sort().join('|')!==keys.sort().join('|')
    ||data.kind!=='desktop-private-bootstrap-v1'
    ||!['ownerEpoch','missionId','attemptId'].every(k=>
      typeof data[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(data[k] as string))
    ||!['stageSealDigest','executionFingerprint','challenge','secret'].every(k=>
      typeof data[k]==='string'&&/^[0-9a-f]{64}$/.test(data[k] as string))
    ||typeof data.inheritedDesktopProcess!=='string'
    ||!/^[1-9]\d{0,19}$/.test(data.inheritedDesktopProcess))
    throw Error('F2_H1_PRIVATE_BOOTSTRAP_UNTRUSTED');
  if(BigInt(data.inheritedDesktopProcess as string)>0xffffffffffffffffn)
    throw Error('F2_H1_BOOTSTRAP_HANDLE_RANGE');
  return Object.freeze(data as unknown as F2H1FixedPipeBootstrap);
}
/** Exact inherited stdio pipe OS objects and restricted parent PROCESS HANDLE.
 * The desktop handle number comes through the *inherited* control pipe, never
 * Mission input. Native OS type/rights/provenance verification is mandatory.
 *
 * This does not independently identify the Desktop build or its origin; that
 * missing pinned image+creation-bound OS attestation is a HARD blocker.
 */
function verifyInheritedControllerOsObjects(
  desktopRef:bigint,topology:typeof import('./private-mvp-desktop-runner-owner.js').F2H1_TOPOLOGY_B,
):void {
  if(process.platform!=='win32'||process.arch!=='x64')
    throw Error('F2_H1_RUNNER_WIN32_ONLY');
  const k=koffi.load('kernel32.dll');
  const std=k.func('__stdcall','GetStdHandle','void *',['int32']);
  const kind=k.func('__stdcall','GetFileType','uint32',['void *']);
  const flags=k.func('__stdcall','GetHandleInformation','bool',
    ['void *',koffi.out(koffi.pointer('uint32'))]);
  const setFlags=k.func('__stdcall','SetHandleInformation','bool',
    ['void *','uint32','uint32']);
  const pid=k.func('__stdcall','GetProcessId','uint32',['void *']);
  const selfPid=k.func('__stdcall','GetCurrentProcessId','uint32',[]);
  const wait=k.func('__stdcall','WaitForSingleObject','uint32',['void *','uint32']);
  const stdin=BigInt(std(-10) as number|bigint);
  const stdout=BigInt(std(-11) as number|bigint);
  const stderr=BigInt(std(-12) as number|bigint);
  if(stdin<=0n||stdout<=0n||stdin===stdout||stderr!==stdout
    ||desktopRef===stdin||desktopRef===stdout
    ||kind(stdin)!==3||kind(stdout)!==3
    ||pid(desktopRef)<=0||pid(desktopRef)===selfPid()
    ||wait(desktopRef,0)!==0x102)
    throw Error('F2_H1_RUNNER_INHERITED_OBJECT_IDENTITY_FAILED');
  for(const h of [stdin,stdout,desktopRef]){
    const inherited=[0];
    if(flags(h,inherited)!==true||(inherited[0]&1)===0
      ||setFlags(h,1,0)!==true)
      throw Error('F2_H1_RUNNER_UNVERIFIED_INHERITED_FLAGS');
  }
  // OS identity is checked against a fixed signed-off Desktop *image*,
  // not a filename/parent PID supplied by the bootstrap frame.
  const queryImage=k.func('__stdcall','QueryFullProcessImageNameW','bool',
    ['void *','uint32','void *',koffi.out(koffi.pointer('uint32'))]);
  const session=k.func('__stdcall','ProcessIdToSessionId','bool',
    ['uint32',koffi.out(koffi.pointer('uint32'))]);
  const expected=topology.desktopExecutable;
  if(!fs.existsSync(expected)||!fs.statSync(expected).isFile()
    ||createHash('sha256').update(fs.readFileSync(expected)).digest('hex')
      !==topology.desktopExecutableSha256)
    throw Error('F2_H1_RUNNER_PINNED_DESKTOP_IMAGE_CHANGED');
  const wide=Buffer.alloc(65536),size=[32768];
  if(queryImage(desktopRef,0,wide,size)!==true||size[0]<1||size[0]>32767)
    throw Error('F2_H1_RUNNER_DESKTOP_OS_IMAGE_QUERY');
  const observed=wide.subarray(0,size[0]*2).toString('utf16le');
  if(fs.realpathSync.native(observed).toLowerCase()
    !==fs.realpathSync.native(expected).toLowerCase())
    throw Error('F2_H1_RUNNER_DESKTOP_IMAGE_MISMATCH');
  const parentSession=[0],ownSession=[0];
  if(session(pid(desktopRef),parentSession)!==true
    ||session(selfPid(),ownSession)!==true
    ||parentSession[0]!==ownSession[0])
    throw Error('F2_H1_RUNNER_DESKTOP_SESSION_MISMATCH');
  const adv=koffi.load('advapi32.dll');
  const openToken=adv.func('__stdcall','OpenProcessToken','bool',
    ['void *','uint32',koffi.out(koffi.pointer('void *'))]);
  const tokenInfo=adv.func('__stdcall','GetTokenInformation','bool',
    ['void *','uint32','void *','uint32',koffi.out(koffi.pointer('uint32'))]);
  const equalSid=adv.func('__stdcall','EqualSid','bool',['void *','void *']);
  const close=k.func('__stdcall','CloseHandle','bool',['void *']);
  const getCurrent=k.func('__stdcall','GetCurrentProcess','void *',[]);
  const SID_AND_ATTRIBUTES=koffi.struct('SUD_F2_H1_R_SID_ATTR',{Sid:'void *',Attributes:'uint32'});
  const TOKEN_USER=koffi.struct('SUD_F2_H1_R_TOKEN_USER',{User:SID_AND_ATTRIBUTES});
  const allocated:any[]=[];
  const tokens:unknown[]=[];
  let cleanupOK=true;
  const alloc=(type:any,n=1)=>{const buf=koffi.alloc(type,n);allocated.push(buf);return buf;};
  try {
    const inspect=(processHandle:unknown):{sid:unknown,elevation:number}=>{
      const out=[null],size=[0];
      if(openToken(processHandle,0x0008,out)!==true||!out[0])
        throw Error('F2_H1_RUNNER_PARENT_TOKEN_QUERY');
      tokens.push(out[0]);
      const elevated=alloc('uint32');
      if(tokenInfo(out[0],20,elevated,4,size)!==true)
        throw Error('F2_H1_RUNNER_ELEVATION_QUERY');
      const elevation=Number(koffi.decode(elevated,'uint32'));
      tokenInfo(out[0],1,null,0,size);
      if(size[0]<koffi.sizeof(TOKEN_USER)||size[0]>16384)
        throw Error('F2_H1_RUNNER_TOKEN_USER_LENGTH');
      const user=alloc('uint8',size[0]);
      if(tokenInfo(out[0],1,user,size[0],size)!==true)
        throw Error('F2_H1_RUNNER_TOKEN_USER_QUERY');
      const decoded=koffi.decode(user,TOKEN_USER) as {User:{Sid:unknown}};
      if(!decoded?.User?.Sid)throw Error('F2_H1_RUNNER_TOKEN_USER_SID');
      return {sid:decoded.User.Sid,elevation};
    };
    const desktop=inspect(desktopRef),runner=inspect(getCurrent());
    if(desktop.elevation!==0||runner.elevation!==0
      ||equalSid(desktop.sid,runner.sid)!==true)
      throw Error('F2_H1_RUNNER_DESKTOP_TOKEN_MISMATCH');
  }finally{
    for(const token of tokens)try{
      if(close(token)!==true)cleanupOK=false;
    }catch{cleanupOK=false;}
    for(const buf of allocated.reverse())try{koffi.free(buf);}catch{cleanupOK=false;}
    if(!cleanupOK)throw Error('F2_H1_RUNNER_TOKEN_CLEANUP_UNKNOWN');
  }
  // Required HANDLE_LIST + physical pipe type and stdio roles were verified
  // before processing the signed first frame. This predicate is *necessary*,
  // not a native proof in code-only tests: actual parent token/PIPE ABI, flags,
  // full Desktop binary origin, and WIN32 creation remain unexercised.

}
/** All IO is on the Node asynchronous stream. Once an actual OS bootstrap is
 * approved, an *independent* watchdog worker thread must be armed BEFORE
 * any heartbeat/ready exchange; it can kill the Runner without waiting on IO.
 * No worker Job, H0 or AppContainer calls are allowed in this slice.
 */
export async function runFixedF2H1RunnerControl():Promise<void> {
  if(!F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED)
    throw Error('F2_H1_RUNNER_ENTRY_EXECUTION_NOT_AUTHORIZED');
  // Native-only topology closure is intentionally loaded after the hard gate.
  // No Win32 owner/adapter import is evaluated during inert module imports.
  const {F2H1_TOPOLOGY_B:topology}=await import('./private-mvp-desktop-runner-owner.js');
  // Independent bootstrap timeout must exist BEFORE awaiting the first byte.
  // WorkerData carries NO parent HANDLE, key, identity or Mission selectors.
  const watcher=new Worker(new URL('./private-mvp-runner-control-watchdog.js',import.meta.url),{
    workerData:{
      role:'fixed-runner-watchdog-v1',
      desktopProcessHandle:0n,
      maxLifetimeMs:30_000,
    },
  });
  let closing=false;
  const subscriptions=watcher as unknown as {on:(event:'error'|'exit',listener:()=>void)=>void};
  subscriptions.on('error',()=>{
    if(!closing)process.abort(); // cannot continue without independent monitor
  });
  subscriptions.on('exit',()=>{
    if(!closing)process.abort();
  });
  try{
    const frames=fixedControlFrames();
    const first=await frames.next(); // independent worker enforces 5s bootstrap
    if(first.done)throw Error('F2_H1_PRIVATE_BOOTSTRAP_EOF');
    const boot=parseF2H1FixedPipeBootstrap(first.value);
    verifyInheritedControllerOsObjects(BigInt(boot.inheritedDesktopProcess),topology);
    watcher.postMessage({
      event:'verified-desktop-handle',
      desktopProcessHandle:BigInt(boot.inheritedDesktopProcess),
    });
    const protocol=createF2H1RunnerControlProtocol({
      ownerEpoch:boot.ownerEpoch,missionId:boot.missionId,
      attemptId:boot.attemptId,stageSealDigest:boot.stageSealDigest,
      executionFingerprint:boot.executionFingerprint,
      key:Buffer.from(boot.secret,'hex'),
      challenge:Buffer.from(boot.challenge,'hex'),localRole:'runner',
    });
    const write=async(kind:'ready'|'heartbeat'|'stopped'|'reject')=>{
      const packet=encodeF2H1RunnerPipeFrame(protocol.issue('runner',kind,{}));
      // Only one pending frame at a time. Even if a pipe write stalls,
      // the watchdog thread terminates the Runner independently.
      await new Promise<void>((resolve,reject)=>{
        process.stdout.write(packet,(err?:Error|null)=>err?reject(err):resolve());
      });
      watcher.postMessage({event:'verified-io-progress'});
    };
    await write('ready');
    for await (const bytes of frames){
      const frame=decodeF2H1RunnerControlFrame(bytes);
      if(!protocol.accept('desktop',frame))
        throw Error('F2_H1_PRIVATE_CONTROL_MAC_REPLAY_OR_ROLE');
      watcher.postMessage({event:'verified-io-progress'});
      const command=frame as {kind:string};
      if(command.kind==='heartbeat'){
        watcher.postMessage({event:'authenticated-heartbeat'});
        await write('heartbeat');
      }else if(command.kind==='cancel'){
        await write('stopped');
        return; // Desktop still must prove Guardian zero member and audit
      }else throw Error('F2_H1_CONTROLLER_COMMAND_NOT_ALLOWED');
    }
    throw Error('F2_H1_CONTROLLER_EOF');
  }finally{
    closing=true;
    // Never construe watchdog shutdown as OS Controller cleanup proof.
    watcher.postMessage({event:'fence'});
    await watcher.terminate();
  }
}


/**
 * Inert PRIVATE-V2 Runner role, colocated with the actual fixed Runner entry.
 * It accepts ONLY local Runner held-creation data plus authenticated raw
 * Desktop frames. No exported OS ResumeThread callback or permission exists.
 * Future live connection still REQUIRES the hard native execution gate,
 * trusted inherited-pipe/parent inspection, independent watchdog, pinned
 * Runner-owned worker Job/H0 and verified cleanup; none is supplied here.
 */
export function createF2H1RunnerInertV2Control(input:{
  readonly channel:Omit<Parameters<typeof createF2H1PrivateControlV2>[0],'localRole'|'send'>;
  readonly write?:(frame:F2H1ControlV2Frame)=>Promise<void>;
  /** Same fixed inherited-line transport as runFixedF2H1RunnerControl; inert. */
  readonly pipe?:{
    readonly send:(bytes:Uint8Array)=>Promise<void>;
    readonly nextFrame:()=>Promise<Uint8Array>;
  };
}) {
  const pipeMode=!!input?.pipe;
  if(pipeMode===(typeof input?.write==='function'))
    throw Error('F2_H1_RUNNER_V2_EXACTLY_ONE_WRITER');
  const write=pipeMode
    ?(frame:F2H1ControlV2Frame)=>input.pipe!.send(encodeF2H1RunnerPipeFrame(frame))
    :input.write!;
  const protocol=createF2H1PrivateControlV2({
    ...input.channel,localRole:'runner',send:write,
  });
  const receipt=createF2H1V2RunnerH0AckReceipt({protocol});
  let phase:'awaiting-prepare'|'awaiting-held-creation'|'writing-owned'|
    'awaiting-ack'|'ack-received-for-this-frozen-epoch'|'quarantined'='awaiting-prepare';
  function fence() {
    phase='quarantined';receipt.fence();protocol.fence();
    return phase;
  }
  function receivePrepare(raw:unknown) {
    if(phase!=='awaiting-prepare')return fence();
    if(receipt.receivePrepare(raw)!=='awaiting-held-creation')return fence();
    return phase='awaiting-held-creation';
  }
  async function sendOwned(held:unknown) {
    // No Runner-owned H0 OS creation or Worker Job exists in the live-pipe
    // source today. No caller-supplied synthetic record may become a write.
    if(pipeMode){
      fence();throw Error('F2_H1_RUNNER_V2_OS_CREATION_UNAVAILABLE');
    }
    if(phase!=='awaiting-held-creation'
      ||receipt.pinHeldCreation(held)!=='awaiting-ack'){
      fence();throw Error('F2_H1_RUNNER_V2_HELD_CREATION_UNAVAILABLE');
    }
    phase='writing-owned';
    try {
      await receipt.sendOwned();
      if(phase!=='writing-owned'||protocol.state()==='quarantined')
        throw Error('F2_H1_RUNNER_V2_OWNED_LATE_OR_FENCED');
      return phase='awaiting-ack';
    }catch{
      fence();throw Error('F2_H1_RUNNER_V2_OWNED_WRITE_UNCONFIRMED');
    }
  }
  function receiveAck(raw:unknown) {
    // This dispatch authenticates raw ACK *once*, inside the accepted V2
    // receipt machine. A preceding local Desktop write is NOT receipt here.
    if(phase!=='awaiting-ack')return fence();
    if(receipt.receiveAck(raw)!=='ack-received-for-this-frozen-epoch')return fence();
    return phase='ack-received-for-this-frozen-epoch';
  }
  /** Exactly one receive from the current Runner fixed private-pipe reader.
   * Routing by unauthenticated kind only chooses which EXISTING V2 receiver
   * does the ONE MAC/sequence check; never authenticate twice. */
  async function receiveNext() {
    if(!pipeMode)throw Error('F2_H1_RUNNER_V2_PIPE_NOT_BOUND');
    try{
      const raw=await input.pipe!.nextFrame();
      if(phase==='quarantined')return fence();
      const frame=decodeF2H1RunnerPipeBytes(raw);
      if(frame.kind==='cancel'){
        protocol.accept('desktop',frame);return fence();
      }
      if(phase==='awaiting-prepare')return receivePrepare(frame);
      if(phase==='awaiting-ack')return receiveAck(frame);
      // Between verified prepare and H0-held creation, no owned H0 exists.
      // Do not accept arbitrary controls to manufacture a suspended H0.
      return fence();
    }catch{return fence();}
  }
  let readySent=false;
  async function sendReady() {
    if(!pipeMode||readySent||phase!=='awaiting-prepare')
      throw Error('F2_H1_RUNNER_V2_READY_UNAVAILABLE');
    readySent=true;
    try{await protocol.send('ready',{});return 'sent' as const;}
    catch{fence();throw Error('F2_H1_RUNNER_V2_READY_WRITE_UNCONFIRMED');}
  }
  async function sendHeartbeat() {
    if(!pipeMode||phase==='quarantined')
      throw Error('F2_H1_RUNNER_V2_HEARTBEAT_UNAVAILABLE');
    try{await protocol.send('heartbeat',{});return 'sent' as const;}
    catch{fence();throw Error('F2_H1_RUNNER_V2_HEARTBEAT_WRITE_UNCONFIRMED');}
  }
  return Object.freeze({
    receivePrepare,sendOwned,receiveAck,receiveNext,sendReady,sendHeartbeat,
    fence,state:()=>phase,
    nativeAuthorization:false as const,readiness:()=>false as const,
  });
}

// Deliberately inert when imported as a library/test. If separately executed,
// refuses BEFORE accessing any inherited pipe or making an OS call.
const invoked=process.argv.length>=2
  && path.resolve(process.argv[1]||'')===path.resolve(fileURLToPath(import.meta.url));
if(invoked) {
  void runFixedF2H1RunnerControl().catch(()=>{
    process.exitCode=74; // never echo frames, handles or ephemeral secrets
  });
}
