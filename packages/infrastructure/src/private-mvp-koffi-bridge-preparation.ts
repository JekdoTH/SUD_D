import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import koffi from 'koffi';
import type { PrivateMvpPinnedNode } from './private-mvp-appcontainer-job-runtime.js';

/**
 * F2-B2 PREPARATION ONLY.
 *
 * Koffi 3.1.6 can describe Win32 x64 pointer-bearing structures. These
 * definitions are ABI/layout checks, NOT proof that suspended creation,
 * token/Job inspection, ACLs, or handle ownership are implemented.
 *
 * Deliberately does not implement PrivateMvpNativeBinding:
 * there is no CreateProcessW, ResumeThread, CreateAppContainerProfile,
 * SetInformationJobObject or Win32 call here. No worker can be launched.
 */
export const F2B2_REQUIRED_WIN32_APIS = Object.freeze({
  userenv: Object.freeze(['CreateAppContainerProfile', 'DeleteAppContainerProfile', 'DeriveAppContainerSidFromAppContainerName']),
  kernel32: Object.freeze([
    'InitializeProcThreadAttributeList', 'UpdateProcThreadAttribute', 'DeleteProcThreadAttributeList',
    'CreateProcessW', 'CreateJobObjectW', 'SetInformationJobObject', 'QueryInformationJobObject',
    'AssignProcessToJobObject', 'IsProcessInJob', 'ResumeThread',
    'TerminateJobObject', 'WaitForSingleObject', 'CloseHandle',
    'GetFileInformationByHandle',
  ]),
  advapi32: Object.freeze(['OpenProcessToken', 'GetTokenInformation', 'EqualSid', 'GetLengthSid']),
});

const securityCapabilities = koffi.struct('SUD_D_F2B2_SECURITY_CAPABILITIES', {
  AppContainerSid: 'void *',
  Capabilities: 'void *',
  CapabilityCount: 'uint32',
  Reserved: 'uint32',
});
const startupInfoW = koffi.struct('SUD_D_F2B2_STARTUPINFOW', {
  cb: 'uint32',
  lpReserved: 'void *',
  lpDesktop: 'void *',
  lpTitle: 'void *',
  dwX: 'uint32',
  dwY: 'uint32',
  dwXSize: 'uint32',
  dwYSize: 'uint32',
  dwXCountChars: 'uint32',
  dwYCountChars: 'uint32',
  dwFillAttribute: 'uint32',
  dwFlags: 'uint32',
  wShowWindow: 'uint16',
  cbReserved2: 'uint16',
  lpReserved2: 'void *',
  hStdInput: 'void *',
  hStdOutput: 'void *',
  hStdError: 'void *',
});
const startupInfoExW = koffi.struct('SUD_D_F2B2_STARTUPINFOEXW', {
  StartupInfo: startupInfoW,
  lpAttributeList: 'void *',
});
const processInformation = koffi.struct('SUD_D_F2B2_PROCESS_INFORMATION', {
  hProcess: 'void *',
  hThread: 'void *',
  dwProcessId: 'uint32',
  dwThreadId: 'uint32',
});
const basicJobLimits = koffi.struct('SUD_D_F2B2_JOBOBJECT_BASIC_LIMIT_INFORMATION', {
  PerProcessUserTimeLimit: 'int64',
  PerJobUserTimeLimit: 'int64',
  LimitFlags: 'uint32',
  MinimumWorkingSetSize: 'void *',
  MaximumWorkingSetSize: 'void *',
  ActiveProcessLimit: 'uint32',
  Affinity: 'void *',
  PriorityClass: 'uint32',
  SchedulingClass: 'uint32',
});
const ioCounters = koffi.struct('SUD_D_F2B2_IO_COUNTERS', {
  ReadOperationCount: 'uint64',
  WriteOperationCount: 'uint64',
  OtherOperationCount: 'uint64',
  ReadTransferCount: 'uint64',
  WriteTransferCount: 'uint64',
  OtherTransferCount: 'uint64',
});
const jobExtendedLimits = koffi.struct('SUD_D_F2B2_JOBOBJECT_EXTENDED_LIMIT_INFORMATION', {
  BasicLimitInformation: basicJobLimits,
  IoInfo: ioCounters,
  ProcessMemoryLimit: 'void *',
  JobMemoryLimit: 'void *',
  PeakProcessMemoryUsed: 'void *',
  PeakJobMemoryUsed: 'void *',
});

const EXPECTED_X64_LAYOUT = Object.freeze({
  securityCapabilities: 24,
  startupInfoW: 104,
  startupInfoExW: 112,
  processInformation: 24,
  basicJobLimits: 64,
  ioCounters: 48,
  jobExtendedLimits: 144,
} as const);

/** Koffi structure-layout gate. Imports installed Koffi addon, but does not load or call Win32 DLL APIs. */
export function inspectF2B2KoffiX64Layouts(): {
  readonly supported: boolean;
  readonly sizes: Readonly<Record<keyof typeof EXPECTED_X64_LAYOUT, number>>;
} {
  const sizes = Object.freeze({
    securityCapabilities: koffi.sizeof(securityCapabilities),
    startupInfoW: koffi.sizeof(startupInfoW),
    startupInfoExW: koffi.sizeof(startupInfoExW),
    processInformation: koffi.sizeof(processInformation),
    basicJobLimits: koffi.sizeof(basicJobLimits),
    ioCounters: koffi.sizeof(ioCounters),
    jobExtendedLimits: koffi.sizeof(jobExtendedLimits),
  });
  const supported = process.platform === 'win32' && process.arch === 'x64'
    && (Object.keys(EXPECTED_X64_LAYOUT) as (keyof typeof EXPECTED_X64_LAYOUT)[])
      .every((key) => sizes[key] === EXPECTED_X64_LAYOUT[key]);
  return { supported, sizes };
}

/**
 * Read-only byte pin for the exact fixed Node executable. No PATH selection,
 * launch, native DLL load, dependency probing or fallback.
 *
 * This is NOT a replacement for B2 Win32 file-handle identity + link checks
 * and holding the sealed identity through CreateProcessW (TOCTOU remains).
 */
export async function verifyF2B2PinnedNodeBytes(node: PrivateMvpPinnedNode): Promise<boolean> {
  if (!node || typeof node.path !== 'string' || typeof node.sha256 !== 'string'
    || !/^[A-Za-z]:\\/.test(node.path)
    || path.win32.normalize(node.path) !== node.path
    || path.win32.basename(node.path).toLowerCase() !== 'node.exe'
    || !/^[0-9a-f]{64}$/.test(node.sha256)
    || process.platform !== 'win32') return false;

  let handle: fs.promises.FileHandle | undefined;
  try {
    const info = await fs.promises.lstat(node.path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return false;
    const canonical = await fs.promises.realpath(node.path);
    if (path.win32.normalize(canonical).toLowerCase() !== node.path.toLowerCase()) return false;
    handle = await fs.promises.open(node.path, 'r');
    const live = await handle.stat();
    if (!live.isFile() || live.nlink !== 1 || live.size !== info.size) return false;
    const digest = createHash('sha256');
    const scratch = Buffer.alloc(64 * 1024);
    for (let offset = 0; offset < live.size;) {
      const { bytesRead } = await handle.read(scratch, 0, Math.min(scratch.length, live.size - offset), offset);
      if (!bytesRead) return false;
      digest.update(scratch.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const final = await handle.stat();
    return final.size === live.size && final.mtimeMs === live.mtimeMs
      && digest.digest('hex') === node.sha256;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
