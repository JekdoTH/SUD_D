/**
 * F2 HANDLE-ISOLATION STRATEGY — code-only, no Win32 mutation.
 *
 * The reviewed strategy is a FIXED-purpose, dedicated creation host + two
 * allowlisted inheritable NUL handles, not unrestricted/ambient inheritance.
 * The attestation below checks controller-created OS handle *observations*
 * and exact CreateProcessW arguments. It does NOT prove the process is
 * dedicated, cannot be forged across IPC, or authorize native ResumeThread.
 *
 * Native negative tests and Owner authorization are required before promoting
 * a real creator. This module never supplies a native permit.
 */
export const F2_HANDLE_ALLOWLIST_CONTRACT = Object.freeze({
  revision: 'private-mvp-handle-isolation-v1',
  creator: 'dedicated-fixed-purpose-creator-v1',
  standardRoles: Object.freeze(['stdin', 'stdout', 'stderr'] as const),
  stdioTarget: 'NUL',
  uniqueInheritedHandleCount: 2,
  noInheritedJobControl: true,
  suspendedOnly: true,
  inheritHandles: true,
  // CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT |
  // EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW.
  creationFlags: 0x08080404,
  // SecurityCapabilities, followed by explicit HandleList.
  attributeKinds: Object.freeze([0x20009, 0x20002] as const),
  useStdHandles: true,
} as const);

/** This cannot be changed by a caller-supplied mock success or child IPC. */
export const F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE = false as const;

/**
 * Separate, independently authorized REAL Windows negative tests. Execute
 * only in the fixed disposable proof root on explicit Owner consent.
 */
export const F2_HANDLE_NATIVE_NEGATIVE_CASES = Object.freeze([
  'unlisted-inheritable-canary',
  'job-control-canary',
  'secret-handle-canary',
  'concurrent-createprocess-true',
  'handle-list-omitted',
  'handle-list-extra',
  'wrong-stdio-alias',
  'creator-crash-before-resume',
] as const);

/** Only the trusted fixed-purpose native creator may construct these facts
 * from its own GetHandleInformation/CreateFileW call results. There is no IPC
 * or worker-reporting form of this interface. Passing it as fake data is
 * useful ONLY in static/mock tests.
 */
export interface F2HandleObservation {
  readonly value: bigint;
  readonly kind: 'nul-read' | 'nul-write' | 'owned-job';
  readonly inheritable: boolean;
}
export interface F2HandleCreationObservation {
  readonly creator: 'dedicated-fixed-purpose-creator-v1';
  readonly handles: {
    readonly input: F2HandleObservation;
    readonly output: F2HandleObservation;
    readonly error: F2HandleObservation;
    readonly job: F2HandleObservation;
  };
  readonly attributeHandleList: readonly bigint[];
  readonly attributeKinds: readonly number[];
  readonly startupUsesStdHandles: boolean;
  readonly inheritHandles: boolean;
  readonly creationFlags: number;
}

function validValue(value: unknown): value is bigint {
  return typeof value === 'bigint' && value > 0n && value < 0xffffffffffffffffn;
}

/**
 * Pure pre-CreateProcessW allowlist review. It proves that the nominated
 * command/handles have an *exact code-level match*; the source of their
 * observations and isolation MUST be independently native-proven.
 *
 * Never equate this return value with inheritedHandlesExact or a launch
 * permit. An untrusted same-user caller can fabricate every field.
 */
export function reviewF2HandleCreationBoundary(input: F2HandleCreationObservation): boolean {
  if (!input || input.creator !== F2_HANDLE_ALLOWLIST_CONTRACT.creator
    || input.startupUsesStdHandles !== true
    || input.inheritHandles !== true
    || input.creationFlags !== F2_HANDLE_ALLOWLIST_CONTRACT.creationFlags
    || !Array.isArray(input.attributeKinds)
    || input.attributeKinds.length !== 2
    || input.attributeKinds[0] !== 0x20009 || input.attributeKinds[1] !== 0x20002
    || !Array.isArray(input.attributeHandleList)
    || input.attributeHandleList.length !== 2
    || !input.handles || typeof input.handles !== 'object'
    || Object.keys(input.handles).sort().join(',') !== 'error,input,job,output'
  ) return false;

  const { input: stdin, output: stdout, error: stderr, job } = input.handles;
  if (!stdin || !stdout || !stderr || !job) return false;
  if (![stdin,stdout,stderr,job].every(h => validValue(h.value))
    || stdin.kind !== 'nul-read' || stdin.inheritable !== true
    || stdout.kind !== 'nul-write' || stdout.inheritable !== true
    || stderr.kind !== 'nul-write' || stderr.inheritable !== true
    || job.kind !== 'owned-job' || job.inheritable !== false) return false;

  // Deliberate hStdError alias: two UNIQUE OS objects implement three stdio
  // roles. No process, thread, token, Job or other ambient handle may appear
  // in the explicit inherited list.
  return stdin.value !== stdout.value
    && stdin.value !== job.value && stdout.value !== job.value
    && stderr.value === stdout.value
    && input.attributeHandleList[0] === stdin.value
    && input.attributeHandleList[1] === stdout.value;
}
