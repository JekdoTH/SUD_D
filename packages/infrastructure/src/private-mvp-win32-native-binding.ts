import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import koffi from 'koffi';
import {
  PRIVATE_MVP_FIXED_WINDOWS_JOB,
  type PrivateMvpFixedNativePlan, type PrivateMvpNativeBinding,
  type PrivateMvpNativeInspection, type PrivateMvpPinnedNode,
  type PrivateMvpSuspendedWorker,
} from './private-mvp-appcontainer-job-runtime.js';
import { inspectF2B2KoffiX64Layouts, verifyF2B2PinnedNodeBytes } from './private-mvp-koffi-bridge-preparation.js';
import {
  F2_HANDLE_ALLOWLIST_CONTRACT, F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE,
  reviewF2HandleCreationBoundary,
} from './private-mvp-handle-isolation.js';

/**
 * F2-B2 CODE-ONLY / UNREGISTERED. Importing this module never opens a DLL or
 * starts a process. createWin32PrivateMvpNativeBinding() only binds Win32
 * functions; prepareSuspended() is the FIRST mutating operation and is NOT
 * authorized until a separate Owner native-proof decision.
 *
 * This is the fixed synthetic-proof profile, not a general process launcher.
 * The staged code / per-user ACL provenance and independent watchdog remain
 * separate production blockers. Mocked tests are NOT native proof.
 */
export const F2B2_FIXED_PROOF = Object.freeze({
  profile: 'SUD_D_F2B2_20261008_01',
  executablePath: 'C:\\Program Files\\nodejs\\node.exe',
  executableSha256: '63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088',
  root: 'C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2b2-native-proof\\f2b2-20261008-01',
  entrySha256: '44683c9eabb0ece9dcc79a97b1790105b84da9f0273d91ffb60972f6597bc9a7',
  inputSha256: '5e42140d52969389339029523fdc66dc5e44b58c1f616ee2bf0ca69a50a9aeca',
  mode: 'positive',
});

const FLAGS = Object.freeze({
  CREATE_SUSPENDED: 0x4, CREATE_UNICODE_ENVIRONMENT: 0x400,
  EXTENDED_STARTUPINFO_PRESENT: 0x80000, CREATE_NO_WINDOW: 0x8000000,
  STARTF_USESTDHANDLES: 0x100,
  JOB_TIME: 0x4, ACTIVE_PROCESS: 0x8, JOB_MEMORY: 0x200,
  KILL_ON_CLOSE: 0x2000,
  ATTR_HANDLE_LIST: 0x20002, ATTR_SECURITY_CAPABILITIES: 0x20009,
  TOKEN_QUERY: 0x8, TOKEN_IS_APPCONTAINER: 29, TOKEN_CAPABILITIES: 30,
  TOKEN_APPCONTAINER_SID: 31,
  JOB_BASIC_ACCOUNTING: 1, JOB_EXTENDED_LIMITS: 9,
  GENERIC_READ: 0x80000000, GENERIC_WRITE: 0x40000000,
  FILE_SHARE_READ: 1, FILE_SHARE_WRITE: 2,
  OPEN_EXISTING: 3, FILE_ATTRIBUTE_NORMAL: 0x80,
  HANDLE_FLAG_INHERIT: 1, WAIT_OBJECT_0: 0,
  STILL_ACTIVE: 259,
});
export const F2B3_INHERITED_HANDLES_OS_PROOF_AVAILABLE = false as const;
const JOB_FLAGS = FLAGS.JOB_TIME | FLAGS.ACTIVE_PROCESS | FLAGS.JOB_MEMORY | FLAGS.KILL_ON_CLOSE;
const CREATION_FLAGS = FLAGS.CREATE_SUSPENDED | FLAGS.CREATE_UNICODE_ENVIRONMENT
  | FLAGS.EXTENDED_STARTUPINFO_PRESENT | FLAGS.CREATE_NO_WINDOW;
const SHA256 = /^[a-f0-9]{64}$/;
type Ptr = bigint;
type NativeFn = (...args: any[]) => any;

export class F2B2NativeCleanupUnconfirmed extends Error {
  constructor() { super('F2-B2 native cleanup unconfirmed'); this.name = 'F2B2NativeCleanupUnconfirmed'; }
}
export class F2B2NativeRejected extends Error {
  constructor() { super('F2-B2 fixed native bridge rejected an unverified operation'); this.name = 'F2B2NativeRejected'; }
}

const SC = koffi.struct('SUD_D_F2B2_BRIDGE_SC', {
  AppContainerSid: 'void *', Capabilities: 'void *', CapabilityCount: 'uint32', Reserved: 'uint32',
});
const SA = koffi.struct('SUD_D_F2B2_BRIDGE_SA', {
  nLength: 'uint32', lpSecurityDescriptor: 'void *', bInheritHandle: 'uint32',
});
const STARTUP = koffi.struct('SUD_D_F2B2_BRIDGE_STARTUP', {
  cb: 'uint32', lpReserved: 'void *', lpDesktop: 'void *', lpTitle: 'void *',
  dwX: 'uint32', dwY: 'uint32', dwXSize: 'uint32', dwYSize: 'uint32',
  dwXCountChars: 'uint32', dwYCountChars: 'uint32', dwFillAttribute: 'uint32',
  dwFlags: 'uint32', wShowWindow: 'uint16', cbReserved2: 'uint16',
  lpReserved2: 'void *', hStdInput: 'void *', hStdOutput: 'void *', hStdError: 'void *',
});
const STARTUP_EX = koffi.struct('SUD_D_F2B2_BRIDGE_STARTUP_EX', {
  StartupInfo: STARTUP, lpAttributeList: 'void *',
});
const PROCESS_INFO = koffi.struct('SUD_D_F2B2_BRIDGE_PROCESS_INFO', {
  hProcess: 'void *', hThread: 'void *', dwProcessId: 'uint32', dwThreadId: 'uint32',
});
const BASIC_LIMIT = koffi.struct('SUD_D_F2B2_BRIDGE_BASIC_LIMIT', {
  PerProcessUserTimeLimit: 'int64', PerJobUserTimeLimit: 'int64',
  LimitFlags: 'uint32', MinimumWorkingSetSize: 'void *', MaximumWorkingSetSize: 'void *',
  ActiveProcessLimit: 'uint32', Affinity: 'void *', PriorityClass: 'uint32', SchedulingClass: 'uint32',
});
const IO_COUNTERS = koffi.struct('SUD_D_F2B2_BRIDGE_IO_COUNTERS', {
  ReadOperationCount: 'uint64', WriteOperationCount: 'uint64', OtherOperationCount: 'uint64',
  ReadTransferCount: 'uint64', WriteTransferCount: 'uint64', OtherTransferCount: 'uint64',
});
const JOB_LIMIT = koffi.struct('SUD_D_F2B2_BRIDGE_JOB_LIMIT', {
  BasicLimitInformation: BASIC_LIMIT, IoInfo: IO_COUNTERS,
  ProcessMemoryLimit: 'void *', JobMemoryLimit: 'void *',
  PeakProcessMemoryUsed: 'void *', PeakJobMemoryUsed: 'void *',
});
const JOB_ACCOUNTING = koffi.struct('SUD_D_F2B2_BRIDGE_JOB_ACCOUNTING', {
  TotalUserTime: 'int64', TotalKernelTime: 'int64',
  ThisPeriodTotalUserTime: 'int64', ThisPeriodTotalKernelTime: 'int64',
  TotalPageFaultCount: 'uint32', TotalProcesses: 'uint32',
  ActiveProcesses: 'uint32', TotalTerminatedProcesses: 'uint32',
});

const samePtr = (a: unknown, b: unknown): boolean => a !== null && b !== null
  && BigInt(a as number | bigint) === BigInt(b as number | bigint);
const nonzero = (ptr: unknown): ptr is Ptr => {
  try {
    const n = BigInt(ptr as number | bigint);
    return n !== 0n && n !== -1n && n !== 0xffffffffffffffffn;
  } catch { return false; }
};
const count = (v: unknown): bigint => typeof v === 'bigint' ? v : BigInt(v as number);

interface Win32 {
  createProfile: NativeFn; deleteProfile: NativeFn; deriveSid: NativeFn;
  freeSid: NativeFn; equalSid: NativeFn; openToken: NativeFn; tokenInfo: NativeFn;
  createJob: NativeFn; setJob: NativeFn; queryJob: NativeFn; assignJob: NativeFn; inJob: NativeFn;
  createFile: NativeFn; initAttrs: NativeFn; updateAttrs: NativeFn; deleteAttrs: NativeFn;
  createProcess: NativeFn; resumeThread: NativeFn; terminateJob: NativeFn; terminateProcess: NativeFn;
  wait: NativeFn; getExitCode: NativeFn; getHandleInfo: NativeFn; close: NativeFn;
}

/** Lazy Win32 linking. Do not call this from tests or during module import. */
function bindWin32(): Win32 {
  if (!inspectF2B2KoffiX64Layouts().supported) throw new F2B2NativeRejected();
  const userenv = koffi.load('userenv.dll');
  const advapi = koffi.load('advapi32.dll');
  const kernel = koffi.load('kernel32.dll');
  const fn = (lib: typeof kernel, name: string, result: string, args: any[]): NativeFn =>
    lib.func('__stdcall', name, result, args);
  return {
    createProfile: fn(userenv, 'CreateAppContainerProfile', 'int32', ['str16','str16','str16','void *','uint32',koffi.out(koffi.pointer('void *'))]),
    deleteProfile: fn(userenv, 'DeleteAppContainerProfile', 'int32', ['str16']),
    deriveSid: fn(userenv, 'DeriveAppContainerSidFromAppContainerName', 'int32', ['str16',koffi.out(koffi.pointer('void *'))]),
    freeSid: fn(advapi, 'FreeSid', 'void *', ['void *']),
    equalSid: fn(advapi, 'EqualSid', 'bool', ['void *','void *']),
    openToken: fn(advapi, 'OpenProcessToken', 'bool', ['void *','uint32',koffi.out(koffi.pointer('void *'))]),
    tokenInfo: fn(advapi, 'GetTokenInformation', 'bool', ['void *','int32','void *','uint32',koffi.out(koffi.pointer('uint32'))]),
    createJob: fn(kernel, 'CreateJobObjectW', 'void *', ['void *','str16']),
    setJob: fn(kernel, 'SetInformationJobObject', 'bool', ['void *','int32','void *','uint32']),
    queryJob: fn(kernel, 'QueryInformationJobObject', 'bool', ['void *','int32','void *','uint32','void *']),
    assignJob: fn(kernel, 'AssignProcessToJobObject', 'bool', ['void *','void *']),
    inJob: fn(kernel, 'IsProcessInJob', 'bool', ['void *','void *',koffi.out(koffi.pointer('uint32'))]),
    createFile: fn(kernel, 'CreateFileW', 'void *', ['str16','uint32','uint32','void *','uint32','uint32','void *']),
    initAttrs: fn(kernel, 'InitializeProcThreadAttributeList', 'bool', ['void *','uint32','uint32','void *']),
    updateAttrs: fn(kernel, 'UpdateProcThreadAttribute', 'bool', ['void *','uint32','size_t','void *','size_t','void *','void *']),
    deleteAttrs: fn(kernel, 'DeleteProcThreadAttributeList', 'void', ['void *']),
    createProcess: fn(kernel, 'CreateProcessW', 'bool', ['str16','void *','void *','void *','bool','uint32','void *','str16','void *','void *']),
    resumeThread: fn(kernel, 'ResumeThread', 'uint32', ['void *']),
    terminateJob: fn(kernel, 'TerminateJobObject', 'bool', ['void *','uint32']),
    terminateProcess: fn(kernel, 'TerminateProcess', 'bool', ['void *','uint32']),
    wait: fn(kernel, 'WaitForSingleObject', 'uint32', ['void *','uint32']),
    getExitCode: fn(kernel, 'GetExitCodeProcess', 'bool', ['void *',koffi.out(koffi.pointer('uint32'))]),
    getHandleInfo: fn(kernel, 'GetHandleInformation', 'bool', ['void *',koffi.out(koffi.pointer('uint32'))]),
    close: fn(kernel, 'CloseHandle', 'bool', ['void *']),
  };
}
function required(result: unknown): void {
  if (result !== true && result !== 1) throw new F2B2NativeRejected();
}
function checkedBufferSha(filename: string, sha256: string): boolean {
  try {
    const info = fs.lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 64 * 1024) return false;
    return createHash('sha256').update(fs.readFileSync(filename)).digest('hex') === sha256;
  } catch { return false; }
}
const normalize = (s: string) => path.win32.normalize(s).toLowerCase();
const expected = {
  stage: path.win32.join(F2B2_FIXED_PROOF.root, 'stage'),
  output: path.win32.join(F2B2_FIXED_PROOF.root, 'output'),
  scratch: path.win32.join(F2B2_FIXED_PROOF.root, 'scratch'),
};
export function validateF2B2FixedNativePlan(plan: PrivateMvpFixedNativePlan): boolean {
  return !!plan && plan.profileRevision === 'private-mvp-reviewed-v1'
    && plan.executablePath === F2B2_FIXED_PROOF.executablePath
    && plan.executableSha256 === F2B2_FIXED_PROOF.executableSha256
    && normalize(plan.stageRoot) === normalize(expected.stage)
    && normalize(plan.outputRoot) === normalize(expected.output)
    && normalize(plan.scratchRoot) === normalize(expected.scratch)
    && normalize(plan.entryPath) === normalize(path.win32.join(expected.stage,'fixture.mjs'))
    && normalize(plan.inputPath) === normalize(path.win32.join(expected.stage,'input.json'))
    && JSON.stringify(plan.limits) === JSON.stringify(PRIVATE_MVP_FIXED_WINDOWS_JOB);
}

/** Code-only preflight; never creates a stage or ACL. Real Win32 link/ACL proof is still a blocker. */
function stagePreflight(plan: PrivateMvpFixedNativePlan): boolean {
  if (!validateF2B2FixedNativePlan(plan)) return false;
  const paths = [F2B2_FIXED_PROOF.root, expected.stage, expected.output, expected.scratch];
  try {
    for (const dir of paths) {
      const item = fs.lstatSync(dir);
      if (!item.isDirectory() || item.isSymbolicLink() || item.nlink < 1) return false;
      if (normalize(fs.realpathSync.native(dir)) !== normalize(dir)) return false;
    }
    return checkedBufferSha(plan.entryPath,F2B2_FIXED_PROOF.entrySha256)
      && checkedBufferSha(plan.inputPath,F2B2_FIXED_PROOF.inputSha256);
  } catch { return false; }
}
function structAlloc(type: any, value: Record<string, unknown>): Ptr {
  const ptr = koffi.alloc(type, 1);
  koffi.encode(ptr, type, value);
  return ptr;
}
function freeAll(pointers: Ptr[]): void {
  for (const ptr of pointers.reverse()) koffi.free(ptr);
}
function jobSettings() {
  const zeros = {
    ReadOperationCount: 0n, WriteOperationCount: 0n, OtherOperationCount: 0n,
    ReadTransferCount: 0n, WriteTransferCount: 0n, OtherTransferCount: 0n,
  };
  return {
    BasicLimitInformation: {
      PerProcessUserTimeLimit: 0n,
      PerJobUserTimeLimit: BigInt(PRIVATE_MVP_FIXED_WINDOWS_JOB.jobUserTimeMs) * 10000n,
      LimitFlags: JOB_FLAGS,
      MinimumWorkingSetSize: 0n, MaximumWorkingSetSize: 0n,
      ActiveProcessLimit: PRIVATE_MVP_FIXED_WINDOWS_JOB.activeProcessLimit,
      Affinity: 0n, PriorityClass: 0, SchedulingClass: 0,
    },
    IoInfo: zeros,
    ProcessMemoryLimit: 0n,
    JobMemoryLimit: BigInt(PRIVATE_MVP_FIXED_WINDOWS_JOB.jobCommittedMemoryBytes),
    PeakProcessMemoryUsed: 0n,
    PeakJobMemoryUsed: 0n,
  };
}

interface Owned {
  sid: Ptr;
  job: Ptr;
  process: Ptr;
  thread: Ptr;
  stdIn: Ptr;
  stdOut: Ptr;
  suspended: boolean;
  assigned: boolean;
  terminal: boolean;
  closed: boolean;
  profileCreated: boolean;
  attributeSet: boolean;
}
function cleanNative(n: Win32, o: Owned): boolean {
  let clean = true;
  if (nonzero(o.process) && !o.terminal) {
    try {
      const forced = o.assigned && nonzero(o.job)
        ? n.terminateJob(o.job, 0xee) : n.terminateProcess(o.process, 0xee);
      if (!forced || n.wait(o.process, 5000) !== FLAGS.WAIT_OBJECT_0) clean = false;
      else if (o.assigned && nonzero(o.job)) {
        const mem = koffi.alloc(JOB_ACCOUNTING, 1);
        try {
          if (!n.queryJob(o.job, FLAGS.JOB_BASIC_ACCOUNTING,mem,koffi.sizeof(JOB_ACCOUNTING),null)
              || koffi.decode(mem,JOB_ACCOUNTING).ActiveProcesses !== 0) clean = false;
        } finally { koffi.free(mem); }
      }
      if (clean) o.terminal = true;
    } catch { clean = false; }
  }
  // Unknown descendant termination means refuse handle/profile teardown.
  if (!clean) return false;
  for (const key of ['thread','process','stdIn','stdOut','job'] as const) {
    const handle = o[key];
    if (nonzero(handle)) {
      try {
        if (!n.close(handle)) clean = false;
        else o[key] = 0n;
      } catch { clean = false; }
    }
  }
  if (nonzero(o.sid)) {
    try { if (nonzero(n.freeSid(o.sid))) clean = false; else o.sid = 0n; }
    catch { clean = false; }
  }
  if (o.profileCreated) {
    try {
      if (n.deleteProfile(F2B2_FIXED_PROOF.profile) !== 0) clean = false;
      else o.profileCreated = false;
    } catch { clean = false; }
  }
  o.closed = clean;
  return clean;
}

/**
 * Real Win32/Koffi implementation (NOT mocked) with no production registration.
 * The separately authorized Owner proof is required before calling this.
 * Unsupported ABI/return code never falls back to a host-token process.
 */
export function createWin32PrivateMvpNativeBinding(): PrivateMvpNativeBinding {
  const native = bindWin32(); // imports never load Win32; only explicit factory does
  const known = new WeakMap<PrivateMvpSuspendedWorker, Owned>();
  return Object.freeze<PrivateMvpNativeBinding>({
    nativeContract: 'fixed-appcontainer-job-v1',
    async verifyPinnedNode(node: PrivateMvpPinnedNode) {
      return node.path === F2B2_FIXED_PROOF.executablePath
        && node.sha256 === F2B2_FIXED_PROOF.executableSha256
        && await verifyF2B2PinnedNodeBytes(node);
    },
    async prepareSuspended(plan: PrivateMvpFixedNativePlan) {
      // HARD STOP: this Koffi factory currently lives inside a shared Node
      // process. A JS lock or mocked 'dedicated' label cannot guarantee
      // exclusive Windows handle inheritance across native threads. Until a
      // separately reviewed dedicated creator and negative native proof
      // exist, do NOT even create an AppContainer profile or a Job.
      if (!F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE) throw new F2B2NativeRejected();
      if (!stagePreflight(plan)
          || !await verifyF2B2PinnedNodeBytes({
            path: F2B2_FIXED_PROOF.executablePath, sha256: F2B2_FIXED_PROOF.executableSha256,
          })) throw new F2B2NativeRejected();
      const o: Owned = {
        sid: 0n, job: 0n, process: 0n, thread: 0n, stdIn: 0n, stdOut: 0n,
        suspended: true, assigned: false, terminal: false, closed: false, profileCreated: false, attributeSet: false,
      };
      const temps: Ptr[] = [];
      let attrs: Ptr = 0n;
      let attrsInitialized = false;
      let processCreated = false;
      let processInfoPtr: Ptr = 0n;
      try {
        const sidOut = [null];
        const createHr = native.createProfile(F2B2_FIXED_PROOF.profile,F2B2_FIXED_PROOF.profile,
          'SUD-D isolated offline proof',null,0,sidOut);
        // Never adopt or delete pre-existing profiles on an already-exists HRESULT.
        if (createHr !== 0) throw new F2B2NativeRejected();
        o.profileCreated = true;
        if (!nonzero(sidOut[0])) throw new F2B2NativeRejected();
        o.sid = sidOut[0] as unknown as Ptr;
        const derived = [null];
        required(native.deriveSid(F2B2_FIXED_PROOF.profile,derived) === 0 && nonzero(derived[0]));
        try { required(native.equalSid(o.sid,derived[0])); }
        finally { if (nonzero(derived[0])) required(!nonzero(native.freeSid(derived[0]))); }

        o.job = native.createJob(null,null) as Ptr;
        if (!nonzero(o.job)) throw new F2B2NativeRejected();
        const data = structAlloc(JOB_LIMIT,jobSettings()); temps.push(data);
        required(native.setJob(o.job,FLAGS.JOB_EXTENDED_LIMITS,data,koffi.sizeof(JOB_LIMIT)));
        // Inherited Job control would invalidate kill-on-close.
        const hf = [0];
        required(native.getHandleInfo(o.job,hf));
        if ((hf[0] & FLAGS.HANDLE_FLAG_INHERIT) !== 0) throw new F2B2NativeRejected();

        const sa = structAlloc(SA,{nLength:koffi.sizeof(SA),lpSecurityDescriptor:0n,bInheritHandle:1});
        temps.push(sa);
        o.stdIn = native.createFile('NUL',FLAGS.GENERIC_READ,FLAGS.FILE_SHARE_READ|FLAGS.FILE_SHARE_WRITE,
          sa,FLAGS.OPEN_EXISTING,FLAGS.FILE_ATTRIBUTE_NORMAL,null) as Ptr;
        o.stdOut = native.createFile('NUL',FLAGS.GENERIC_WRITE,FLAGS.FILE_SHARE_READ|FLAGS.FILE_SHARE_WRITE,
          sa,FLAGS.OPEN_EXISTING,FLAGS.FILE_ATTRIBUTE_NORMAL,null) as Ptr;
        if (!nonzero(o.stdIn) || !nonzero(o.stdOut)) throw new F2B2NativeRejected();
        // Controller-side OS GetHandleInformation checks: stdio MUST be
        // inheritable; the held Job MUST NOT. These flags, alone, do not
        // prove an isolated host or child-side inheritance.
        const readFlags = (handle: Ptr): number => {
          const result = [0];
          required(native.getHandleInfo(handle, result));
          if (!Number.isSafeInteger(result[0])) throw new F2B2NativeRejected();
          return result[0];
        };
        const stdInFlags = readFlags(o.stdIn);
        const stdOutFlags = readFlags(o.stdOut);
        const jobFlags = readFlags(o.job);
        if ((stdInFlags & FLAGS.HANDLE_FLAG_INHERIT) !== 1
          || (stdOutFlags & FLAGS.HANDLE_FLAG_INHERIT) !== 1
          || (jobFlags & FLAGS.HANDLE_FLAG_INHERIT) !== 0) throw new F2B2NativeRejected();
        const handleReview = reviewF2HandleCreationBoundary({
          // This is the fixed creator's intended code path, not independent
          // evidence it actually runs in a dedicated process.
          creator: F2_HANDLE_ALLOWLIST_CONTRACT.creator,
          handles: {
            input: { value: o.stdIn, kind: 'nul-read', inheritable: true },
            output: { value: o.stdOut, kind: 'nul-write', inheritable: true },
            error: { value: o.stdOut, kind: 'nul-write', inheritable: true },
            job: { value: o.job, kind: 'owned-job', inheritable: false },
          },
          attributeHandleList: [o.stdIn, o.stdOut],
          attributeKinds: F2_HANDLE_ALLOWLIST_CONTRACT.attributeKinds,
          startupUsesStdHandles: true,
          inheritHandles: true,
          creationFlags: CREATION_FLAGS,
        });
        if (!handleReview) throw new F2B2NativeRejected();

        const attrBytes = koffi.alloc('size_t',1); temps.push(attrBytes);
        koffi.encode(attrBytes,'size_t',0);
        native.initAttrs(null,2,0,attrBytes);
        const length = Number(koffi.decode(attrBytes,'size_t'));
        if (!Number.isSafeInteger(length) || length < 32 || length > 64 * 1024) throw new F2B2NativeRejected();
        attrs = koffi.alloc('uint8',length);
        required(native.initAttrs(attrs,2,0,attrBytes));
        attrsInitialized = true;
        const security = structAlloc(SC,{AppContainerSid:o.sid,Capabilities:0n,CapabilityCount:0,Reserved:0});
        temps.push(security);
        required(native.updateAttrs(attrs,0,FLAGS.ATTR_SECURITY_CAPABILITIES,
          security,koffi.sizeof(SC),null,null));
        const handleType = koffi.array('void *',2);
        const handleList = koffi.alloc(handleType,1); temps.push(handleList);
        koffi.encode(handleList,handleType,[o.stdIn,o.stdOut]);
        required(native.updateAttrs(attrs,0,FLAGS.ATTR_HANDLE_LIST,
          handleList,16,null,null));
        o.attributeSet = true;

        const startup = structAlloc(STARTUP_EX,{
          StartupInfo: {
            cb:koffi.sizeof(STARTUP_EX), lpReserved:0n, lpDesktop:0n, lpTitle:0n,
            dwX:0,dwY:0,dwXSize:0,dwYSize:0,dwXCountChars:0,dwYCountChars:0,
            dwFillAttribute:0,dwFlags:FLAGS.STARTF_USESTDHANDLES,
            wShowWindow:0,cbReserved2:0,lpReserved2:0n,
            hStdInput:o.stdIn,hStdOutput:o.stdOut,hStdError:o.stdOut,
          },lpAttributeList:attrs,
        });
        temps.push(startup);
        const proc = koffi.alloc(PROCESS_INFO,1); temps.push(proc);
        processInfoPtr = proc;
        const cmd = Buffer.from(
          '"' + F2B2_FIXED_PROOF.executablePath + '" "' + plan.entryPath + '" ' + F2B2_FIXED_PROOF.mode + '\0',
          'utf16le',
        );
        const env = Buffer.from(
          'SystemRoot=C:\\Windows\0TEMP=' + plan.scratchRoot + '\0TMP=' + plan.scratchRoot + '\0\0',
          'utf16le',
        );
        // CreateProcessW may MODIFY lpCommandLine; writable pinned Buffer
        // is valid only for this synchronous call. Attribute list/data remain
        // stable koffi.alloc memory until CreateProcessW returns.
        required(native.createProcess(F2B2_FIXED_PROOF.executablePath,cmd,null,null,true,
          CREATION_FLAGS,env,plan.stageRoot,startup,proc));
        processCreated = true;
        const pi = koffi.decode(proc,PROCESS_INFO);
        o.process = pi.hProcess as Ptr;
        o.thread = pi.hThread as Ptr;
        if (!nonzero(o.process) || !nonzero(o.thread)) throw new F2B2NativeRejected();
        required(native.assignJob(o.job,o.process));
        o.assigned = true;
        const member = [0]; required(native.inJob(o.process,o.job,member));
        if (member[0] !== 1) throw new F2B2NativeRejected();

        const worker: PrivateMvpSuspendedWorker = {
          async resume() {
            if (!o.suspended || o.terminal || o.closed) return false;
            const attested = inspectNative(native,o);
            if (!Object.values(attested).every(v=>v===true)) return false;
            const countBefore = native.resumeThread(o.thread);
            if (countBefore !== 1) return false;
            o.suspended = false;
            return true;
          },
          async terminateAndConfirm() {
            if (o.closed) return false;
            if (o.terminal) return true;
            try {
              required(native.terminateJob(o.job,0xef));
              if (native.wait(o.process,5000) !== FLAGS.WAIT_OBJECT_0) return false;
              const acc = koffi.alloc(JOB_ACCOUNTING,1);
              try {
                required(native.queryJob(o.job,FLAGS.JOB_BASIC_ACCOUNTING,acc,koffi.sizeof(JOB_ACCOUNTING),null));
                if (koffi.decode(acc,JOB_ACCOUNTING).ActiveProcesses !== 0) return false;
              } finally { koffi.free(acc); }
              o.terminal = true;
              return true;
            } catch { return false; }
          },
          async closeOwnedHandles() {
            if (!o.terminal || o.closed) return false;
            return cleanNative(native,o);
          },
        };
        known.set(worker,o);
        return worker;
      } catch (error) {
        // CreateProcessW may have succeeded even if Koffi failed to decode
        // PROCESS_INFORMATION. Recover controller-held handles before cleanup;
        // if identity cannot be recovered, NEVER claim successful cleanup.
        if (processCreated && !nonzero(o.process)) {
          try {
            const recovered = koffi.decode(processInfoPtr,PROCESS_INFO);
            o.process = recovered.hProcess as Ptr;
            o.thread = recovered.hThread as Ptr;
          } catch { /* retained as unknown */ }
          if (!nonzero(o.process)) throw new F2B2NativeCleanupUnconfirmed();
        }
        if (!cleanNative(native,o)) throw new F2B2NativeCleanupUnconfirmed();
        throw error instanceof F2B2NativeRejected ? error : new F2B2NativeRejected();
      } finally {
        if (attrsInitialized) native.deleteAttrs(attrs);
        if (nonzero(attrs)) koffi.free(attrs);
        freeAll(temps);
      }
    },
    async inspectSuspended(worker,plan) {
      const o = known.get(worker);
      if (!o || !validateF2B2FixedNativePlan(plan)) throw new F2B2NativeRejected();
      return inspectNative(native,o);
    },
  });
}

function inspectNative(n: Win32,o: Owned): PrivateMvpNativeInspection {
  let token: Ptr = 0n;
  let tokenClosed = true;
  let exactAppContainerSid = false;
  let zeroCapabilities = false;
  let jobMember = false;
  let exactJobLimits = false;
  let controllerOwnsNonInheritedJobHandle = false;
  const toFree: Ptr[] = [];
  try {
    if (!o.suspended || o.terminal || o.closed || !nonzero(o.process)
      || !nonzero(o.job) || !o.attributeSet) throw new F2B2NativeRejected();
    const exit = [0];
    required(n.getExitCode(o.process,exit));
    if (exit[0] !== FLAGS.STILL_ACTIVE) throw new F2B2NativeRejected();
    const handleFlags = [0]; required(n.getHandleInfo(o.job,handleFlags));
    controllerOwnsNonInheritedJobHandle = (handleFlags[0] & FLAGS.HANDLE_FLAG_INHERIT) === 0;
    const belongs = [0]; required(n.inJob(o.process,o.job,belongs));
    jobMember = belongs[0] === 1;

    const limits = koffi.alloc(JOB_LIMIT,1); toFree.push(limits);
    required(n.queryJob(o.job,FLAGS.JOB_EXTENDED_LIMITS,limits,koffi.sizeof(JOB_LIMIT),null));
    const job = koffi.decode(limits,JOB_LIMIT);
    exactJobLimits = job.BasicLimitInformation.LimitFlags === JOB_FLAGS
      && job.BasicLimitInformation.ActiveProcessLimit === PRIVATE_MVP_FIXED_WINDOWS_JOB.activeProcessLimit
      && count(job.BasicLimitInformation.PerJobUserTimeLimit) === 6000000000n
      && count(job.JobMemoryLimit) === BigInt(PRIVATE_MVP_FIXED_WINDOWS_JOB.jobCommittedMemoryBytes);

    const tokenOut: unknown[] = [null]; required(n.openToken(o.process,FLAGS.TOKEN_QUERY,tokenOut));
    token = tokenOut[0] as Ptr;
    if (!nonzero(token)) throw new F2B2NativeRejected();
    const isApp = Buffer.alloc(4), ret = [0];
    required(n.tokenInfo(token,FLAGS.TOKEN_IS_APPCONTAINER,isApp,4,ret));
    if (ret[0] !== 4 || isApp.readUInt32LE(0) !== 1) throw new F2B2NativeRejected();
    const sidInfo = Buffer.alloc(256);
    required(n.tokenInfo(token,FLAGS.TOKEN_APPCONTAINER_SID,sidInfo,sidInfo.length,ret));
    if (ret[0] < 8 || ret[0] > sidInfo.length) throw new F2B2NativeRejected();
    const sid = koffi.decode(sidInfo,'void *');
    exactAppContainerSid = nonzero(sid) && Boolean(n.equalSid(sid,o.sid));
    // TOKEN_GROUPS.GroupCount must be zero. Never trust the child to claim
    // it has no capabilities (no network client/server capability SID).
    const caps = Buffer.alloc(2048);
    required(n.tokenInfo(token,FLAGS.TOKEN_CAPABILITIES,caps,caps.length,ret));
    zeroCapabilities = ret[0] >= 4 && ret[0] <= caps.length && caps.readUInt32LE(0) === 0;
  } catch {
    // Unknown token / Job state always denies ResumeThread.
  } finally {
    if (nonzero(token)) {
      try { if (!n.close(token)) tokenClosed = false; }
      catch { tokenClosed = false; }
    }
    freeAll(toFree);
  }
  return {
    suspended:o.suspended && !o.terminal && !o.closed,
    exactAppContainerSid: exactAppContainerSid && tokenClosed,
    zeroCapabilities: zeroCapabilities && tokenClosed, jobMember, exactJobLimits,
    // Current Koffi host is not the reviewed one-shot OS creator; no H1/H2
    // receipts. The obsolete exhaustive-table flag is NOT promoted.
    handleIsolation: null,
    noBreakaway:exactJobLimits, controllerOwnsNonInheritedJobHandle,
  };
}
