import type {
  F2H0FixedRequest, F2H0GatewayPort, F2H0HandleReceipt,
} from './private-mvp-h0-one-shot-gateway.js';
import {
  inspectAndRestrictF2H0GatewayTransfer,
  type F2H0GatewayHandleSyscalls,
} from './private-mvp-h0-win32-handle-proof.js';

/**
 * F2-H0 unregistered Gateway Win32 ownership adapter SOURCE seam.
 * This consumes only OS-originated handles through F2H0GatewayOsCalls.
 * The native syscall binding and independent owner/watchdog are NOT wired.
 *
 * Invoking this module or factory has NO Win32 side effects; native launch
 * occurs ONLY if the privileged owner calls launchOnce with a reviewed native
 * syscall implementation. Mock successes NEVER grant worker resume authority.
 */
export const F2H0_PINNED_LAUNCHER = Object.freeze({
  path: 'C:\\1.งานโด้\\SUD-D\\.serena\\runner-f2-h1-candidate-20261008\\sud-d-f2-h0.exe',
  sha256: '34e1034a27441d83dfaf11dff611cd98ed35743e9b26d5b32e964b8972046122',
  recipe: 'reviewed-nul-stdio-v1',
  binaryProvenance: 'msvc-14.44.35207-sdk-10.0.26100.0-h0-code-only',
  nativeAuthorized: false,
} as const);

/** All handle values are OS-handle-table local to the Gateway. The underlying
 * Win32 adapter must preserve these exact roles; never accept handles from
 * any Mission, renderer, worker output, IPC text or generic caller selector.
 */
export interface F2H0PrivateControlPipes {
  /** Launcher-inherited read and write endpoints (not ambient std handles). */
  readonly workerIn: bigint;
  readonly workerOut: bigint;
  /** Gateway-owned complementary write and read endpoints, non-inheritable. */
  readonly gatewayIn: bigint;
  readonly gatewayOut: bigint;
}
export interface F2H0OwnedLauncherHandles {
  readonly process: bigint;
  readonly thread: bigint;
}
export interface F2H0LauncherBootstrapCopies {
  readonly gatewayProcess: bigint;
  readonly temporaryJob: bigint;
}
export interface F2H0RawTransferReceipt {
  readonly process: bigint;
  readonly thread: bigint;
}
export interface F2H0OsTrustedPeer {
  /** An authenticated OS peer/channel binding, never string equality alone. */
  authenticatedEpoch(epoch: string): boolean;
  stageHeld(): boolean;
  watchdogArmed(): boolean;
  gatewayJobOwned(): boolean;
}

/**
 * EXACT fixed-use Win32 operations. This is an unregistered NATIVE CALL seam
 * for a reviewed owner; it is not a general Spawn or DuplicateHandle API.
 * Its future concrete OS implementation must verify real local HANDLE types,
 * GrantedAccess/restricted duplication, object provenance, Job membership,
 * and exact process exit independently of the launcher receipt.
 *
 * Each method's implementation is a SECURITY PREREQUISITE and must not be
 * replaced with caller booleans/worker stdout. The current tests only inject
 * fake calls to verify orchestrator behavior.
 */
export interface F2H0GatewayOsCalls {
  /** SHA from exact held canonical binary file; fail on reparse/race. */
  binarySha256(): Promise<string>;
  /** Create only two private anonymous pipes; four local fixed handle roles. */
  createFixedPrivatePipes(): Promise<F2H0PrivateControlPipes>;
  /** Query OS handle types/direction/inheritance; reject ambient handles. */
  verifyFixedControlPipeRoles(pipes: F2H0PrivateControlPipes): Promise<boolean>;
  /** Fixed pinned executable, no argv/options/cwd/env selectors from caller.
   * Create only CREATE_SUSPENDED+EXTENDED_STARTUPINFO with exact control list.
   */
  createSuspendedPinnedLauncher(
    absolutePinnedExecutable: typeof F2H0_PINNED_LAUNCHER.path,
    pipes: F2H0PrivateControlPipes,
  ): Promise<F2H0OwnedLauncherHandles>;
  /** Duplicate ONLY Gateway PROCESS + already-owned noninherited Job handles
   * into the exact suspended launcher process. No arbitrary handle roles.
   */
  duplicateFixedGatewayAndJob(host: F2H0OwnedLauncherHandles): Promise<F2H0LauncherBootstrapCopies>;
  /** Send bounded private fixed Mission/attempt/epoch + fresh nonce, and
   * the local bootstrap HANDLE values on the authenticated private pipe.
   */
  writeEpochBoundFixedFrames(
    pipes: F2H0PrivateControlPipes, request: Readonly<F2H0FixedRequest>,
    bootstrap: F2H0LauncherBootstrapCopies,
  ): Promise<boolean>;
  /** This resumes ONLY the exact H0 launcher control thread, NEVER worker.
   * It is not a real H1/H2 worker resume gate.
   */
  resumeOnlyLaunchHost(host: F2H0OwnedLauncherHandles): Promise<boolean>;
  /** Read bounded 24-byte control receipt: UNTRUSTED until OS inspection. */
  readFixedTransferFrame(pipes: F2H0PrivateControlPipes): Promise<F2H0RawTransferReceipt | null>;
  /** Independently restrict/verify Gateway HANDLE entries, noninherited
   * exact access mask 0x101001 / 0x100802, PROCESS/THREAD same root object,
   * runtime path, suspended status and owning Job; return OS-derived facts.
   */
  restrictAndInspectTransferredHandles(receipt: F2H0RawTransferReceipt): Promise<readonly F2H0HandleReceipt[]>;
  /** Wait on exact owned launcher process HANDLE (no PID lookup or ACK);
   * require observed exit code zero and closed temporary Job duplicate.
   */
  waitForOwnedLauncherExit(host: F2H0OwnedLauncherHandles): Promise<boolean>;
  /** Re-query the actual permanent Gateway Job handle + live suspended root. */
  confirmPermanentGatewayJob(receipts: readonly F2H0HandleReceipt[]): Promise<boolean>;
  /** Terminate owned Job + launcher and confirm zero process descendants;
   * unknown is false and quarantines. Must tolerate creation partial failure.
   */
  terminateExactOwnedHostAndJob(): Promise<boolean>;
  /** Close only inspected owned temporary Gateway pipes/host THREAD; keep
   * permanent Job and root handles for the independent watchdog.
   */
  closeOwnedTemporaryHandles(): Promise<boolean>;
}


/**
 * Compose the exact Win32 PROCESS/THREAD object checks into a fixed owner
 * transaction. This is NOT native authorization: the remaining process/pipe
 * creation and Job/host-lifetime operations need concrete trusted Win32 ports,
 * and all H1/H2 acceptance remains blocked.
 */
export function withF2H0Win32HandleInspection(
  calls: Omit<F2H0GatewayOsCalls, 'restrictAndInspectTransferredHandles'>,
  sys: F2H0GatewayHandleSyscalls,
): F2H0GatewayOsCalls {
  return Object.freeze({
    ...calls,
    async restrictAndInspectTransferredHandles(receipt: F2H0RawTransferReceipt) {
      return inspectAndRestrictF2H0GatewayTransfer(sys,receipt);
    },
  });
}

/**
 * A single-use OS-host transaction, with no exposed process/handle selector.
 * Native status is NEVER inferred from the transfer frame. The port itself
 * is not registered, and returning a successful fake transaction is not a
 * worker launch permit (the Gateway state machine returns false authority).
 */
export function createF2H0GatewayOsAdapter(
  native: F2H0GatewayOsCalls,
  trusted: F2H0OsTrustedPeer,
): F2H0GatewayPort {
  let claimed = false;
  let pipes: F2H0PrivateControlPipes | null = null;
  let host: F2H0OwnedLauncherHandles | null = null;
  let transfer: readonly F2H0HandleReceipt[] | null = null;
  let exitConfirmed = false;
  let cleaned = false;
  const check = () => trusted.authenticatedEpoch !== undefined
    && trusted.stageHeld() === true && trusted.watchdogArmed() === true
    && trusted.gatewayJobOwned() === true;
  return Object.freeze({
    // Availability means the owned peer/Job is still alive, including AFTER
    // this attempt has claimed the one-shot transaction. launchOnce itself
    // alone enforces the single-creation fence.
    available: () => F2H0_PINNED_LAUNCHER.nativeAuthorized === false && check(),
    authenticatedEpoch: (epoch: string) => trusted.authenticatedEpoch(epoch) === true,
    stageHeld: () => trusted.stageHeld(),
    watchdogArmed: () => trusted.watchdogArmed(),
    gatewayJobOwned: () => trusted.gatewayJobOwned(),
    async launchOnce(request: Readonly<F2H0FixedRequest>) {
      if (claimed || !check() || !trusted.authenticatedEpoch(request.ownerEpoch)) {
        throw new Error('F2_H0_OS_OWNER_UNAVAILABLE');
      }
      claimed = true; // before any await, no second host creation
      if (await native.binarySha256() !== F2H0_PINNED_LAUNCHER.sha256) {
        throw new Error('F2_H0_PINNED_EXE_MISMATCH');
      }
      pipes = await native.createFixedPrivatePipes();
      if (!await native.verifyFixedControlPipeRoles(pipes)) {
        throw new Error('F2_H0_INVALID_CONTROL_PIPE_HANDLES');
      }
      host = await native.createSuspendedPinnedLauncher(F2H0_PINNED_LAUNCHER.path, pipes);
      const copies = await native.duplicateFixedGatewayAndJob(host);
      if (!await native.writeEpochBoundFixedFrames(pipes, request, copies)) {
        throw new Error('F2_H0_FIXED_FRAME_FAILED');
      }
      if (!await native.resumeOnlyLaunchHost(host)) {
        throw new Error('F2_H0_HOST_THREAD_UNCONFIRMED');
      }
      // Host identity here is only an internal type marker; the OS-created
      // and stored process handle is used later for wait/exit proof.
      return {hostIdentity:'owned-one-shot-host' as const};
    },
    async inspectGatewayTransfers() {
      if (!host || !pipes || cleaned) return [];
      const raw = await native.readFixedTransferFrame(pipes);
      if (!raw) return [];
      const result = await native.restrictAndInspectTransferredHandles(raw);
      transfer = result;
      return result;
    },
    async waitOwnedHostExit() {
      if (!host || !transfer || cleaned) return false;
      exitConfirmed = await native.waitForOwnedLauncherExit(host);
      return exitConfirmed;
    },
    async confirmGatewayJob() {
      if (!host || !transfer || !exitConfirmed || cleaned) return false;
      if (!check() || !await native.confirmPermanentGatewayJob(transfer)) return false;
      if (!await native.closeOwnedTemporaryHandles()) return false;
      cleaned = true;
      return true;
    },
    async terminateAndConfirm() {
      try {
        const stopped = await native.terminateExactOwnedHostAndJob();
        const closed = await native.closeOwnedTemporaryHandles();
        cleaned = stopped && closed;
        return cleaned;
      } catch {
        return false;
      }
    },
  });
}
