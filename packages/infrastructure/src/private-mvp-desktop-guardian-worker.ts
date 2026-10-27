import {Worker} from 'node:worker_threads';
import type {F2H1IndependentGuardian} from './private-mvp-desktop-owned-session.js';

type EventedWorker=Worker&{
  on(event:string,listener:(value:any)=>void):void;
  once(event:string,listener:(value:any)=>void):void;
  off(event:string,listener:(value:any)=>void):void;
};
export function createF2H1DesktopGuardianWorker():F2H1IndependentGuardian {
  let worker:EventedWorker|undefined,armed=false,failed=false;
  return Object.freeze({
    async arm(guardian:bigint,runner:bigint) {
      if(worker||guardian<=0n||runner<=0n||guardian===runner)
        throw Error('F2_H1_GUARDIAN_WATCH_OWNER_CONFLICT');
      worker=new Worker(new URL('./private-mvp-runner-control-watchdog.js',import.meta.url),{
        workerData:{role:'fixed-desktop-guardian-watchdog-v1',
          guardianJobHandle:guardian,runnerProcessHandle:runner,maxLifetimeMs:30_000},
      }) as EventedWorker;
      const w=worker;
      w.on('error',()=>{failed=true;});
      w.on('exit',()=>{failed=true;});
      await new Promise<void>((resolve,reject)=>{
        const onMessage=(message:unknown)=>{
          const event=(message as {event?:string})?.event;
          if(event==='armed'){
            w.off('message',onMessage);
            armed=true;resolve();
          }else if((message as {fence?:boolean})?.fence===true){
            failed=true;w.off('message',onMessage);
            reject(Error('F2_H1_GUARDIAN_WATCH_PREMATURE_FENCE'));
          }
        };
        w.on('message',onMessage);
        w.once('error',()=>reject(Error('F2_H1_GUARDIAN_WATCH_START_FAILED')));
        w.once('exit',()=>reject(Error('F2_H1_GUARDIAN_WATCH_EXIT_BEFORE_ARM')));
      });
    },
    authenticatedHeartbeat() {
      if(!armed||failed||!worker)throw Error('F2_H1_GUARDIAN_WATCH_LOST');
      worker.postMessage({event:'authenticated-runner-beat'});
    },
    async shutdown() {
      if(!worker)return true;
      // Only called AFTER a bounded exact OS termination/zero-member check.
      worker.postMessage({event:'fence'});
      const w=worker;
      const ended=await Promise.race([
        w.terminate().then(()=>true,()=>false),
        new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),1000)),
      ]);
      armed=false;
      return ended;
    },
  });
}
