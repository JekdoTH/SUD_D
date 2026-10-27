import {isMainThread,parentPort,workerData} from 'node:worker_threads';
import koffi from 'koffi';

/** No current runtime authorization. The source is retained for the exact
 * internal Desktop-owned transaction; no production Worker is spawned. */
export const F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED=false as const;
const MAX=4096;
type Data={role:'desktop-fixed-pipe-reader-v1'|'desktop-fixed-pipe-writer-v1';handle:bigint};
function run(data:Data):void {
  if(!F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED)
    throw Error('F2_H1_DESKTOP_PIPE_NATIVE_EXECUTION_NOT_AUTHORIZED');
  if(isMainThread||process.platform!=='win32'||process.arch!=='x64'||!parentPort
    ||typeof data?.handle!=='bigint'||data.handle<=0n
    ||data.handle===0xffffffffffffffffn
    ||!['desktop-fixed-pipe-reader-v1','desktop-fixed-pipe-writer-v1'].includes(data.role))
    throw Error('F2_H1_DESKTOP_PIPE_UNTRUSTED_NATIVE_HANDLE');
  const kernel=koffi.load('kernel32.dll');
  const fn=(name:string)=>kernel.func('__stdcall',name,'bool',[
    'void *','void *','uint32',koffi.out(koffi.pointer('uint32')),'void *',
  ]);
  const read=fn('ReadFile'),write=fn('WriteFile');
  const fileType=kernel.func('__stdcall','GetFileType','uint32',['void *']);
  const flags=kernel.func('__stdcall','GetHandleInformation','bool',[
    'void *',koffi.out(koffi.pointer('uint32')),
  ]);
  const f=[0];
  if(fileType(data.handle)!==3||flags(data.handle,f)!==true||(f[0]&1)!==0)
    throw Error('F2_H1_DESKTOP_PIPE_OBJECT_NOT_PRIVATE');
  parentPort.postMessage({event:'armed'});
  if(data.role==='desktop-fixed-pipe-writer-v1') {
    let closed=false;
    parentPort.on('message',(message:unknown)=>{
      if(closed)return;
      const m=message as {event?:string;id?:number;bytes?:Uint8Array};
      if(m?.event==='shutdown'){closed=true;parentPort?.close();return;}
      if(m?.event!=='write'||!Number.isSafeInteger(m.id)||m.bytes===undefined
        ||!(m.bytes instanceof Uint8Array)||m.bytes.length<2
        ||m.bytes.length>MAX||m.bytes[m.bytes.length-1]!==10){
        closed=true;parentPort?.postMessage({event:'failed'});parentPort?.close();return;
      }
      const bytes=Buffer.from(m.bytes);
      let offset=0;
      while(offset<bytes.length){
        const n=[0],slice=bytes.subarray(offset);
        if(write(data.handle,slice,slice.length,n,null)!==true
          ||n[0]===0||n[0]>slice.length){
          closed=true;parentPort?.postMessage({event:'failed'});parentPort?.close();return;
        }
        offset+=n[0];
      }
      parentPort?.postMessage({event:'wrote',id:m.id});
    });
    return;
  }
  // ReadFile is synchronous. It runs ONLY in this dedicated worker. An
  // independent Guardian worker kills the exact Job if ReadFile gets stuck.
  // We do not use Node Worker.terminate as an OS cancellation certificate.
  void (async()=>{
    const chunk=Buffer.alloc(MAX);
    let frame:number[]=[];
    try {
      while(true){
        const n=[0];
        if(read(data.handle,chunk,MAX,n,null)!==true||n[0]===0)
          break; // EOF or ERROR_BROKEN_PIPE, never clean OS proof
        if(n[0]>MAX)throw Error('F2_H1_PIPE_READ_RANGE');
        for(let i=0;i<n[0];i++){
          if(chunk[i]===10){
            if(frame.length===0)throw Error('F2_H1_PIPE_EMPTY_FRAME');
            const ready=Uint8Array.from(frame);frame=[];
            await new Promise<void>((resolve,reject)=>{
              const receive=(message:unknown)=>{
                if((message as {event?:string})?.event==='credit')resolve();
                else reject(Error('F2_H1_PIPE_INVALID_CREDIT'));
              };
              parentPort?.once('message',receive);
              parentPort?.postMessage({event:'frame',bytes:ready});
            });
          }else{
            if(frame.length>=MAX-1)throw Error('F2_H1_PIPE_OVERSIZE');
            frame.push(chunk[i]);
          }
        }
      }
      parentPort?.postMessage({event:'eof'});
    }catch{parentPort?.postMessage({event:'failed'});}
    finally{parentPort?.close();}
  })();
}
if(!isMainThread&&workerData
  &&(workerData.role==='desktop-fixed-pipe-reader-v1'
    ||workerData.role==='desktop-fixed-pipe-writer-v1'))
  run(workerData as Data);
