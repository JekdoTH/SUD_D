/**
 * Fixed pre-H1 Runner controller watchdog. Runs in its OWN Node worker thread:
 * it never shares the controlling pipe reader's JS event loop. It has no
 * public listener or task selection. The Runner entry is permanently gated
 * from activating it in this code-only milestone.
 */
import {isMainThread,parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import koffi from 'koffi';
export const F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED=false as const;
export const F2H1_RUNNER_WATCHDOG_PERIOD_MS=250;
export const F2H1_RUNNER_HEARTBEAT_MS=2000;
export const F2H1_RUNNER_LEASE_MS=8000;
export const F2H1_RUNNER_STOP_DEADLINE_MS=5000;
export const F2H1_RUNNER_BOOTSTRAP_DEADLINE_MS=5000;
/** Worker-thread clock, started before any pipe read. A hung bootstrap never
 * earns another lease just because the controller event loop is blocked. */
export function checkF2H1RunnerBootstrapDeadline(now:number,startedAt:number,attached:boolean):boolean {
  return !attached&&(!Number.isFinite(now)||!Number.isFinite(startedAt)
    ||now-startedAt>=F2H1_RUNNER_BOOTSTRAP_DEADLINE_MS);
}
type Observation='alive'|'exited'|'unknown';
export interface F2H1ControllerWatchdogObservation {
  readonly reason:'lease-expired'|'deadline'|'desktop-exit'|'desktop-unknown'|'stalled-io';
  readonly fence:true;
}
/** Pure deterministic decision engine, for code-only tests; NEVER returns an
 * execution grant or a certificate that the OS has actually been stopped. */
export function checkF2H1ControllerLease(input:{
  now:number;lastHeartbeat:number;startedAt:number;deadline:number;
  desktop:Observation;lastIoProgress:number;
}):F2H1ControllerWatchdogObservation|null {
  if(!Number.isFinite(input.now)||!Number.isFinite(input.lastHeartbeat)
    ||!Number.isFinite(input.deadline)||!Number.isFinite(input.lastIoProgress)
    ||input.desktop==='unknown')
    return {reason:'desktop-unknown',fence:true};
  if(input.desktop!=='alive')return {reason:'desktop-exit',fence:true};
  if(input.now>=input.deadline)return {reason:'deadline',fence:true};
  if(input.now-input.lastHeartbeat>F2H1_RUNNER_LEASE_MS)
    return {reason:'lease-expired',fence:true};
  if(input.now-input.lastIoProgress>F2H1_RUNNER_LEASE_MS)
    return {reason:'stalled-io',fence:true};
  return null;
}
export interface F2H1DesktopGuardianWatchDecision {
  readonly fence:true;
  readonly reason:'runner-exited'|'runner-unknown'|'guardian-unknown'
    |'runner-lease-expired'|'controller-deadline';
}
export function checkF2H1DesktopGuardianWatch(input:{
  now:number;lastRunnerBeat:number;deadline:number;
  runner:Observation;guardianValid:boolean;
}):F2H1DesktopGuardianWatchDecision|null {
  if(!input.guardianValid)return {reason:'guardian-unknown',fence:true};
  if(input.runner==='unknown'||!Number.isFinite(input.now)
    ||!Number.isFinite(input.lastRunnerBeat)||!Number.isFinite(input.deadline))
    return {reason:'runner-unknown',fence:true};
  if(input.runner==='exited')return {reason:'runner-exited',fence:true};
  if(input.now>=input.deadline)return {reason:'controller-deadline',fence:true};
  if(input.now-input.lastRunnerBeat>F2H1_RUNNER_LEASE_MS)
    return {reason:'runner-lease-expired',fence:true};
  return null;
}
type DesktopWatchStart={
  role:'fixed-desktop-guardian-watchdog-v1';
  runnerProcessHandle:bigint;guardianJobHandle:bigint;maxLifetimeMs:number;
};
function runDesktopGuardianWorkerThread(data:DesktopWatchStart):void {
  if(!F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED)
    throw Error('F2_H1_DESKTOP_GUARDIAN_WATCHDOG_UNAUTHORIZED');
  if(process.platform!=='win32'||!parentPort||data.maxLifetimeMs!==30_000
    ||typeof data.runnerProcessHandle!=='bigint'
    ||typeof data.guardianJobHandle!=='bigint'
    ||data.runnerProcessHandle<=0n||data.guardianJobHandle<=0n
    ||data.runnerProcessHandle===data.guardianJobHandle)
    throw Error('F2_H1_DESKTOP_GUARDIAN_WATCHDOG_HANDLES');
  const kernel=koffi.load('kernel32.dll');
  const wait=kernel.func('__stdcall','WaitForSingleObject','uint32',['void *','uint32']);
  const terminate=kernel.func('__stdcall','TerminateJobObject','bool',['void *','uint32']);
  const getInfo=kernel.func('__stdcall','GetHandleInformation','bool',
    ['void *',koffi.out(koffi.pointer('uint32'))]);
  const inJob=kernel.func('__stdcall','IsProcessInJob','bool',
    ['void *','void *',koffi.out(koffi.pointer('uint32'))]);
  const query=kernel.func('__stdcall','QueryInformationJobObject','bool',
    ['void *','uint32','void *','uint32','void *']);
  const ACCOUNT=koffi.struct('SUD_H1_DESKTOP_GUARDIAN_ACCOUNT',{
    TotalUserTime:'int64',TotalKernelTime:'int64',
    ThisPeriodTotalUserTime:'int64',ThisPeriodTotalKernelTime:'int64',
    TotalPageFaultCount:'uint32',TotalProcesses:'uint32',
    ActiveProcesses:'uint32',TotalTerminatedProcesses:'uint32',
  });
  // Prove OS handle types, live exact Runner and Guardian membership before
  // allowing Desktop to resume its creation-origin control thread.
  const flags=[0],member=[0];
  if(getInfo(data.guardianJobHandle,flags)!==true||(flags[0]&1)!==0
    ||getInfo(data.runnerProcessHandle,flags)!==true||(flags[0]&1)!==0
    ||inJob(data.runnerProcessHandle,data.guardianJobHandle,member)!==true
    ||member[0]!==1||wait(data.runnerProcessHandle,0)!==0x102)
    throw Error('F2_H1_GUARDIAN_WATCHDOG_OS_PREFLIGHT_FAILED');
  let lastBeat=performance.now(),fenced=false;
  const start=lastBeat;
  parentPort.on('message',(m:unknown)=>{
    if(!m||typeof m!=='object'||fenced)return;
    const msg=m as {event?:string};
    if(msg.event==='authenticated-runner-beat')lastBeat=performance.now();
    else if(msg.event==='fence')fenced=true;
  });
  const interval=setInterval(()=>{
    if(fenced)return;
    let runner:Observation='unknown',guardianValid=false;
    try{
      const flags=[0];
      const valid=getInfo(data.guardianJobHandle,flags)===true&&(flags[0]&1)===0;
      const accounting=koffi.alloc(ACCOUNT,1);
      try{
        guardianValid=valid&&query(data.guardianJobHandle,1,accounting,
          koffi.sizeof(ACCOUNT),null)===true;
      }finally{koffi.free(accounting);}
      const status=Number(wait(data.runnerProcessHandle,0));
      runner=status===0x102?'alive':status===0?'exited':'unknown';
    }catch{/* unknown -> fence */}
    const decision=checkF2H1DesktopGuardianWatch({
      now:performance.now(),lastRunnerBeat:lastBeat,
      deadline:start+data.maxLifetimeMs,runner,guardianValid,
    });
    if(decision){
      fenced=true;
      try{parentPort?.postMessage(decision);}catch{/* event loop may hang */}
      try{terminate(data.guardianJobHandle,0xef);}catch{/* quarantine */}
      // TerminateJobObject success is NOT zero-member or full cleanup proof;
      // the Desktop journal must retain its charge until independent review.
    }
  },F2H1_RUNNER_WATCHDOG_PERIOD_MS);
  // Timer is scheduled independently before the parent sees ARM confirmation.
  parentPort.postMessage({event:'armed'});
  interval.unref();
}
type WatchStart={
  role:'fixed-runner-watchdog-v1'; desktopProcessHandle:bigint;
  maxLifetimeMs:number;
};
function runOnlyInWorkerThread(data:WatchStart):void {
  if(!F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED)
    throw Error('F2_H1_WATCHDOG_NATIVE_EXECUTION_NOT_AUTHORIZED');
  if(process.platform!=='win32'||!parentPort
    ||data.maxLifetimeMs!==30_000
    ||data.role!=='fixed-runner-watchdog-v1'
    ||typeof data.desktopProcessHandle!=='bigint'
    ||data.desktopProcessHandle!==0n)
    throw Error('F2_H1_WATCHDOG_UNTRUSTED_DESKTOP_HANDLE');
  const k=koffi.load('kernel32.dll');
  const wait=k.func('__stdcall','WaitForSingleObject','uint32',['void *','uint32']);
  const terminate=k.func('__stdcall','TerminateProcess','bool',['void *','uint32']);
  const current=k.func('__stdcall','GetCurrentProcess','void *',[]);
  const monotonic=()=>performance.now();
  const initial=monotonic();
  let lastHeartbeat=initial,lastIoProgress=initial;
  let fenced=false,parentHandle:bigint|null=null;
  parentPort.on('message',(m:unknown)=>{
    if(!m||typeof m!=='object'||fenced)return;
    const msg=m as {event?:string};
    if(msg.event==='verified-desktop-handle'&&'desktopProcessHandle' in m
      &&typeof (m as {desktopProcessHandle:unknown}).desktopProcessHandle==='bigint'
      &&(m as {desktopProcessHandle:bigint}).desktopProcessHandle>0n
      &&parentHandle===null) {
      parentHandle=(m as {desktopProcessHandle:bigint}).desktopProcessHandle;
      lastHeartbeat=monotonic();lastIoProgress=monotonic();
    }
    else if(msg.event==='authenticated-heartbeat'&&parentHandle!==null)lastHeartbeat=monotonic();
    else if(msg.event==='verified-io-progress')lastIoProgress=monotonic();
    else if(msg.event==='fence')fenced=true;
  });
  // Independent worker-thread scheduler, not dependent on pipe reads or on
  // the Runner controller event loop. Terminate the *current* process on
  // unknown peer/lease. Desktop Guardian KILL_ON_JOB_CLOSE is the outer fence.
  const loop=setInterval(()=>{
    if(fenced)return;
    const now=monotonic();
    let desktop:Observation='unknown';
    if(parentHandle!==null)try{
      const result=Number(wait(parentHandle,0));
      if(result===0x102)desktop='alive';
      else if(result===0)desktop='exited';
    }catch{/* unknown -> quarantine/terminate */}
    const bootExpired=checkF2H1RunnerBootstrapDeadline(now,initial,parentHandle!==null);
    const decision=bootExpired?{reason:'desktop-unknown' as const,fence:true as const}
      :parentHandle===null?null:checkF2H1ControllerLease({
        now,lastHeartbeat,startedAt:initial,
        deadline:initial+data.maxLifetimeMs,desktop,lastIoProgress,
      });
    if(decision){
      fenced=true;
      try{parentPort?.postMessage(decision);}catch{/* may be wedged */}
      // A failed TerminateProcess is NOT "cleanup confirmed"; Desktop must
      // independently query exact Runner/Guardian Job and keep journal charge.
      try{terminate(current(),0xef);}catch{/* Desktop Guardian remains owner */}
    }
  },F2H1_RUNNER_WATCHDOG_PERIOD_MS);
  loop.unref();
}
if(!isMainThread && workerData?.role==='fixed-runner-watchdog-v1')
  runOnlyInWorkerThread(workerData as WatchStart);
if(!isMainThread && workerData?.role==='fixed-desktop-guardian-watchdog-v1')
  runDesktopGuardianWorkerThread(workerData as DesktopWatchStart);
