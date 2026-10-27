import koffi from 'koffi';
import type { F2H0HandleReceipt } from './private-mvp-h0-one-shot-gateway.js';
import type { F2H0RawTransferReceipt } from './private-mvp-h0-win32-gateway-adapter.js';

/**
 * F2-H0 Windows x64 handle-proof SOURCE adapter (not registered).
 * These APIs are NEVER called by module import or tests; the optional binder
 * loads Win32 only on explicit authorized construction in a later H1 slice.
 *
 * The untrusted launcher control receipt supplies only candidate numeric
 * handles. We immediately request RIGHTS-REDUCED noninherited local copies,
 * then query kernel process/thread/Job relationships. A child string/PID or
 * local HANDLE_LIST attribute is NEVER accepted as independent evidence.
 *
 * The source still needs a real Gateway-owned Job getter + stage/peer native
 * adapter and ABI validation. This function never grants ResumeThread.
 */
export const F2H0_PROCESS_RIGHTS = 0x101001 as const;
export const F2H0_THREAD_RIGHTS = 0x100802 as const;
export interface F2H0GatewayHandleSyscalls {
  restrictedLocalDuplicate(raw: bigint, access: typeof F2H0_PROCESS_RIGHTS | typeof F2H0_THREAD_RIGHTS): bigint;
  closeLocal(h: bigint): boolean;
  inherited(h: bigint): boolean;
  processId(process: bigint): number;
  threadProcessId(thread: bigint): number;
  threadId(thread: bigint): number;
  processInOwnedJob(process: bigint): boolean;
}

function safeHandle(h: unknown): h is bigint {
  return typeof h === 'bigint' && h > 0n && h !== 0xffffffffffffffffn;
}
function mustClose(sys: F2H0GatewayHandleSyscalls, handle: bigint): void {
  if (!sys.closeLocal(handle)) throw new Error('F2_H0_HANDLE_CLOSE_UNCONFIRMED');
}

/** This is NOT independent exhaustive child-handle enumeration.
 * OS-derived PID/TID pairs are diagnostic identity only; H1 must still pin
 * exact newly-created native handle objects and validate Job membership.
 */
export function inspectAndRestrictF2H0GatewayTransfer(
  sys: F2H0GatewayHandleSyscalls,
  receipt: F2H0RawTransferReceipt,
): readonly F2H0HandleReceipt[] {
  if (!receipt || !safeHandle(receipt.process) || !safeHandle(receipt.thread)
      || receipt.process === receipt.thread) throw new Error('F2_H0_INVALID_TRANSFER');
  let p: bigint | null = null;
  let t: bigint | null = null;
  try {
    p = sys.restrictedLocalDuplicate(receipt.process, F2H0_PROCESS_RIGHTS);
    if (!safeHandle(p) || p === receipt.process || p === receipt.thread)
      throw new Error('F2_H0_DUPLICATE_PROCESS_INVALID');
    mustClose(sys, receipt.process); // eliminate untrusted broad original
    t = sys.restrictedLocalDuplicate(receipt.thread, F2H0_THREAD_RIGHTS);
    if (!safeHandle(t) || t === p || t === receipt.process || t === receipt.thread)
      throw new Error('F2_H0_DUPLICATE_THREAD_INVALID');
    mustClose(sys, receipt.thread);
    if (sys.inherited(p) || sys.inherited(t))
      throw new Error('F2_H0_TRANSFER_INHERITABLE');
    const pid = sys.processId(p);
    const threadPid = sys.threadProcessId(t);
    const tid = sys.threadId(t);
    if (!Number.isSafeInteger(pid) || pid <= 0
        || pid !== threadPid || !Number.isSafeInteger(tid) || tid <= 0
        || !sys.processInOwnedJob(p)) throw new Error('F2_H0_TRANSFER_NOT_OWNED');
    return Object.freeze([
      Object.freeze({role:'root-process' as const,objectId:'proc:'+pid,value:p,
        access:F2H0_PROCESS_RIGHTS,inheritable:false as const,owner:'gateway' as const}),
      Object.freeze({role:'root-thread' as const,objectId:'thread:'+pid+':'+tid,value:t,
        access:F2H0_THREAD_RIGHTS,inheritable:false as const,owner:'gateway' as const}),
    ]);
  } catch (error) {
    // Failed to clean a duplicate => caller MUST quarantine the entire Job.
    let clean = true;
    if (safeHandle(t)) try { clean = sys.closeLocal(t) && clean; } catch { clean = false; }
    if (safeHandle(p)) try { clean = sys.closeLocal(p) && clean; } catch { clean = false; }
    if (!clean) throw new Error('F2_H0_CLEANUP_UNCONFIRMED');
    throw error;
  }
}

/**
 * Deliberately lazy real kernel32 binding. Must not be constructed from
 * tests or production registration. Query requires a Job HANDLE provided by
 * the existing trusted Gateway owner (NOT a caller/Mission/worker/PID).
 * No process/job is created and no launcher is run by constructing this.
 */
export function bindF2H0GatewayHandleSyscallsFromWin32(
  exactGatewayOwnedJob: bigint,
): F2H0GatewayHandleSyscalls {
  if (!safeHandle(exactGatewayOwnedJob)) throw new Error('F2_H0_JOB_HANDLE_REQUIRED');
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('F2_H0_X64_REQUIRED');
  const kernel = koffi.load('kernel32.dll');
  const fn = (name: string, result: string, args: any[]) => kernel.func('__stdcall',name,result,args);
  const dup = fn('DuplicateHandle','bool',
    ['void *','void *','void *',koffi.out(koffi.pointer('void *')),'uint32','bool','uint32']);
  const current = fn('GetCurrentProcess','void *',[]);
  const close = fn('CloseHandle','bool',['void *']);
  const flags = fn('GetHandleInformation','bool',['void *',koffi.out(koffi.pointer('uint32'))]);
  const pid = fn('GetProcessId','uint32',['void *']);
  const tid = fn('GetThreadId','uint32',['void *']);
  const threadPid = fn('GetProcessIdOfThread','uint32',['void *']);
  const inJob = fn('IsProcessInJob','bool',
    ['void *','void *',koffi.out(koffi.pointer('uint32'))]);
  const checked = (res: unknown) => {
    if (res !== true && res !== 1) throw new Error('F2_H0_OS_CALL_UNCONFIRMED');
  };
  // Native binder stores only kernel-derived OS facts; no launcher DTO fields.
  return Object.freeze({
    restrictedLocalDuplicate(raw: bigint, access: number): bigint {
      if (!safeHandle(raw)) throw new Error('F2_H0_INVALID_SOURCE_HANDLE');
      const out: unknown[] = [null];
      checked(dup(current(),raw,current(),out,access,false,0));
      const next = BigInt(out[0] as number | bigint);
      if (!safeHandle(next)) throw new Error('F2_H0_INVALID_DUPLICATE');
      return next;
    },
    closeLocal(h: bigint) { return close(h) === true; },
    inherited(h: bigint) {
      const out = [0];
      checked(flags(h,out));
      return (out[0] & 1) !== 0;
    },
    processId(h: bigint) {return pid(h) as number;},
    threadProcessId(h: bigint) {return threadPid(h) as number;},
    threadId(h: bigint) {return tid(h) as number;},
    processInOwnedJob(h: bigint) {
      const answer = [0];
      checked(inJob(h,exactGatewayOwnedJob,answer));
      return answer[0] === 1;
    },
  });
}
