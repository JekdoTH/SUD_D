import {createHash} from 'node:crypto';
import {readApprovedPreH1Diagnostic} from './private-mvp-pre-h1-diagnostic-preflight.js';
export {readApprovedPreH1Diagnostic} from './private-mvp-pre-h1-diagnostic-preflight.js';
import type {Db} from './database.js';
import {
  createPrivateMvpMissionAdmissionRepository,
  privateMvpMissionBindingDigest,PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,
  type PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';
import {bindF2H1DesktopRunnerWin32} from './private-mvp-desktop-runner-owner.js';
import type {F2H1CleanupEvidence} from './private-mvp-desktop-owned-session.js';

/** RC5 code-only. Preparation approval NEVER grants native execution;
 * a separately reviewed Owner-approved native authorization is absent. */
export const PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED=false as const;

/**
 * THIS SOURCE IS NOT EXPORTED BY THE INFRASTRUCTURE PACKAGE INDEX.
 * It only enters the separately compiled PRE-H1 diagnostic Desktop main.
 * No public API, renderer/MCP route, argument, launch option or environment
 * switch can provide a Mission, epoch, PID, executable or OS handle.
 * The code runs within the actual Electron Desktop main process/DB lifetime.
 */
export const PRE_H1_FIXED_DIAGNOSTIC=Object.freeze({
  caseId:'PRE-H1-CONTROLLER-01',
  missionId:'pre-h1-controller-01',
  attemptId:'pre-h1-controller-01-attempt-01',
  ownerEpoch:'pre-h1-controller-01-epoch-01',
  runnerId:'fixed-synthetic',
  stageSealDigest:createHash('sha256').update('PRE-H1-CONTROLLER-01|NO-STAGE|v1').digest('hex'),
  maxActiveMs:30_000,
  maxRetries:0,
  maxGuardianJobs:1,maxRunnerProcesses:1,maxH0:0,maxWorkerJobs:0,
} as const);

/** One state machine is owned by the real Desktop main lifecycle. Instantiated
 * after recovery, called once on app.whenReady ONLY in the diagnostic bundle.
 * Construction and missing approval perform no Win32/Worker calls.
 */
export function createPreH1DiagnosticDesktopLifecycle(db:Db) {
  const admission=createPrivateMvpMissionAdmissionRepository(db);
  let attempted=false;
  let session:ReturnType<ReturnType<typeof bindF2H1DesktopRunnerWin32>['createFixedDesktopSession']>|undefined;
  let terminal:Promise<boolean>|undefined;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const stop=async():Promise<boolean>=>{
    if(terminal)return terminal;
    if(timeout){clearTimeout(timeout);timeout=undefined;}
    terminal=(async()=>{
      if(!session)return true; // no OS objects were created
      const result=await session.stop('diagnostic-stop');
      return result.disposition==='verified-cleaned'&&result.osStopProven;
    })();
    return terminal;
  };
  return Object.freeze({
    async startOnce():Promise<void> {
      if(attempted||terminal)throw Error('PRE_H1_DIAGNOSTIC_ALREADY_ATTEMPTED');
      attempted=true; // permanently fenced before any async boundary
      const binding=readApprovedPreH1Diagnostic(db,new Date());
      // A PREPARATION consent is not RC5 NATIVE consent. This closed gate
      // precedes Koffi binding, Guardian/Runner creation and native journaling.
      if(!PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED)
        throw Error('PRE_H1_RC5_SEPARATE_NATIVE_OWNER_CONSENT_REQUIRED');
      // No Koffi load or Job/PROCESS create before exact F2-A authorization.
      // The session atomically claims PENDING+audit before createSuspended().
      session=bindF2H1DesktopRunnerWin32().createFixedDesktopSession(binding,admission);
      try{
        await session.start();
        timeout=setTimeout(()=>{void stop();},PRE_H1_FIXED_DIAGNOSTIC.maxActiveMs);
        timeout.unref?.();
      }catch(e){
        await stop(); // uncertain cleanup retains the charged Mission
        throw e;
      }
    },
    shutdown:stop,
    shutdownEvidence():{
      disposition:'not-started'|'owned-process-stopped'|'cleanup-unconfirmed';
      osStopProven:boolean
    }{
      const e:F2H1CleanupEvidence|undefined=session?.shutdownEvidence();
      if(!e||e.disposition==='not-started')
        return{disposition:'not-started',osStopProven:false};
      if(e.disposition==='verified-cleaned')
        return{disposition:'owned-process-stopped',osStopProven:true};
      return{disposition:'cleanup-unconfirmed',osStopProven:false};
    },
  });
}
