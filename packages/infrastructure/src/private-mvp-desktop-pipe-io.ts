import {Worker} from 'node:worker_threads';
import type {F2H1DesktopPipeIo} from './private-mvp-desktop-owned-session.js';

const LIMIT=4096,QUEUE_LIMIT=16;
type EventedWorker=Worker&{
  on(event:string,listener:(value:any)=>void):void;
  once(event:string,listener:(value:any)=>void):void;
  off(event:string,listener:(value:any)=>void):void;
};
type Message={event:string;id?:number;bytes?:Uint8Array;reason?:string};
function isHandle(h:bigint):boolean {
  return typeof h==='bigint'&&h>0n&&h!==0xffffffffffffffffn;
}
/**
 * The exact HANDLEs are owned by Desktop, not transferred to Node's stdio.
 * Two dedicated Worker Threads are necessary: one blocking synchronous
 * ReadFile cannot also service WriteFile on the SAME JS event loop.
 * The independent Guardian watchdog is a THIRD thread and never waits for IO.
 * This port has no public handle selection and is constructed only from the
 * creation-returned parent endpoints inside the hard-gated Win32 factory.
 */
export function createF2H1DesktopWin32PipeIo():F2H1DesktopPipeIo {
  let reader:EventedWorker|undefined,writer:EventedWorker|undefined;
  let active=false,ended=false,readPending=false;
  let outstanding=0,seq=0;
  const packets:Uint8Array[]=[];
  let awaiting:((value:Uint8Array)=>void)|undefined;
  let awaitingError:((reason:Error)=>void)|undefined;
  const pendingWrites=new Map<number,{resolve:()=>void;reject:(error:Error)=>void}>();
  function fail(reason:string):void {
    ended=true;
    const err=Error(reason);
    if(awaitingError)awaitingError(err);
    awaiting=undefined;awaitingError=undefined;readPending=false;
    for(const p of pendingWrites.values())p.reject(err);
    pendingWrites.clear();outstanding=0;
  }
  async function armed(worker:EventedWorker):Promise<void> {
    await new Promise<void>((resolve,reject)=>{
      const onMessage=(message:Message)=>{
        if(message.event==='armed') {worker.off('message',onMessage);resolve();}
        if(message.event==='failed') {worker.off('message',onMessage);reject(Error('F2_H1_PIPE_WORKER_ARM_FAILED'));}
      };
      worker.on('message',onMessage);
      worker.once('error',reject);
      worker.once('exit',()=>reject(Error('F2_H1_PIPE_WORKER_EXITED_BEFORE_ARM')));
    });
  }
  return Object.freeze({
    async arm(readHandle:bigint,writeHandle:bigint) {
      if(active||reader||writer||!isHandle(readHandle)||!isHandle(writeHandle)
        ||readHandle===writeHandle)throw Error('F2_H1_PIPE_EXACT_HANDLE_OWNERSHIP');
      reader=new Worker(new URL('./private-mvp-desktop-pipe-worker.js',import.meta.url),{
        workerData:{role:'desktop-fixed-pipe-reader-v1',handle:readHandle},
      }) as EventedWorker;
      writer=new Worker(new URL('./private-mvp-desktop-pipe-worker.js',import.meta.url),{
        workerData:{role:'desktop-fixed-pipe-writer-v1',handle:writeHandle},
      }) as EventedWorker;
      const r=reader,w=writer;
      r.on('message',(m:Message)=>{
        if(m.event==='frame'&&m.bytes instanceof Uint8Array) {
          if(packets.length>=QUEUE_LIMIT){fail('F2_H1_PIPE_RX_QUEUE_OVERFLOW');return;}
          if(awaiting){const done=awaiting;awaiting=undefined;awaitingError=undefined;
            readPending=false;done(m.bytes);}
          else packets.push(m.bytes);
          // The reader never issues the next blocking ReadFile until the
          // Desktop acknowledges this ONE frame: bounded wire backpressure.
          r.postMessage({event:'credit'});
        } else if(m.event==='eof')fail('F2_H1_PIPE_PEER_EOF');
        else if(m.event==='failed')fail('F2_H1_PIPE_READ_FAILED');
      });
      w.on('message',(m:Message)=>{
        if(m.event==='wrote'&&typeof m.id==='number'){
          const p=pendingWrites.get(m.id);
          if(p){pendingWrites.delete(m.id);outstanding--;p.resolve();}
        }else if(m.event==='failed')fail('F2_H1_PIPE_WRITE_FAILED');
      });
      r.on('error',()=>fail('F2_H1_PIPE_READ_WORKER_CRASH'));
      w.on('error',()=>fail('F2_H1_PIPE_WRITE_WORKER_CRASH'));
      r.on('exit',()=>{if(!ended)fail('F2_H1_PIPE_READ_WORKER_EXIT');});
      w.on('exit',()=>{if(!ended)fail('F2_H1_PIPE_WRITE_WORKER_EXIT');});
      await Promise.all([armed(r),armed(w)]);
      active=true;
    },
    async send(bytes:Uint8Array) {
      if(!active||ended||!writer||bytes.length<2||bytes.length>LIMIT
        ||bytes[bytes.length-1]!==10)throw Error('F2_H1_PIPE_WRITE_BOUNDS_OR_CLOSED');
      if(outstanding>=QUEUE_LIMIT)throw Error('F2_H1_PIPE_TX_QUEUE_OVERFLOW');
      const id=++seq;outstanding++;
      await new Promise<void>((resolve,reject)=>{
        pendingWrites.set(id,{resolve,reject});
        writer?.postMessage({event:'write',id,bytes:Uint8Array.from(bytes)});
      });
    },
    async nextFrame() {
      if(!active||ended)throw Error('F2_H1_PIPE_READER_CLOSED');
      if(readPending)throw Error('F2_H1_PIPE_CONCURRENT_READER');
      const packet=packets.shift();
      if(packet)return packet;
      readPending=true;
      return new Promise<Uint8Array>((resolve,reject)=>{
        awaiting=resolve;awaitingError=reject;
      });
    },
    async shutdown() {
      if(!active&&!reader&&!writer)return true;
      ended=true;
      for(const p of pendingWrites.values())p.reject(Error('F2_H1_PIPE_SHUTDOWN'));
      pendingWrites.clear();
      if(awaitingError)awaitingError(Error('F2_H1_PIPE_SHUTDOWN'));
      awaiting=undefined;awaitingError=undefined;
      // TerminateJobObject + observed exact process exit precedes shutdown.
      // A read Worker that stays blocked is NOT safe to cancel by guessing a
      // Node Worker OS thread handle. Return unknown instead of closing that
      // HANDLE while a synchronous ReadFile could still own it.
      writer?.postMessage({event:'shutdown'});
      const children=[reader,writer].filter((v):v is EventedWorker=>!!v);
      const all=await Promise.all(children.map(w=>new Promise<boolean>(resolve=>{
        if(w.threadId===-1){resolve(true);return;}
        const t=setTimeout(()=>resolve(false),1000);
        w.once('exit',()=>{clearTimeout(t);resolve(true);});
      })));
      active=false;
      return all.every(Boolean);
    },
  });
}
