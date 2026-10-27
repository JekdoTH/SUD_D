import { PRIVATE_MVP_RESOURCE_POLICY } from './private-mvp-mission-admission.js';

/**
 * F2-B3 CODE FOUNDATION — two independent instances MUST be hosted in separate
 * Desktop and Gateway OS processes. This module NEVER opens/adopts PIDs or
 * creates native handles. Its caller MUST supply already-owned exact handles,
 * authenticated epoch-bound IPC, and independent monotonic schedulers.
 * Not wired to production (native proof and independent peer handles BLOCKED).
 */
export interface PrivateMvpWatchClock {
  monotonicMs(): number;
  wallMs(): number;
  every(periodMs: number, callback: () => void): () => void;
}
export interface PrivateMvpWatchOwnedJob {
  readonly kind: 'owned-worker-job';
  readonly ownerEpoch: string;
  /** OS HANDLE inspection, not caller-provided PID */
  alive(): 'alive' | 'exited' | 'unknown';
  /** Must terminate and confirm the ENTIRE Job tree, not just a root PID. */
  terminateAndConfirm(): Promise<boolean>;
}
export interface PrivateMvpWatchExactPeer {
  readonly kind: 'owned-desktop-process' | 'owned-gateway-process';
  readonly ownerEpoch: string;
  /** Query the independently owned process handle. */
  alive(): 'alive' | 'exited' | 'unknown';
}
export interface PrivateMvpWatchExactHost {
  readonly kind: 'owned-one-shot-host-process';
  readonly ownerEpoch: string;
  /** Exact held OS PROCESS handle, never PID adoption or a receipt label. */
  alive(): 'alive' | 'exited' | 'unknown';
}
export interface PrivateMvpPeerHeartbeat {
  readonly ownerEpoch: string;
  readonly sequence: number;
}
export type PrivateMvpWatchState = 'idle' | 'armed' | 'stopping' | 'stopped' | 'quarantined';

export interface PrivateMvpOwnedPeerWatch {
  /** deadline expressed in trusted wall-clock time, converted to monotonic ONCE */
  arm(deadlineWallMs: number): boolean;
  /** Transport MUST authenticate peer handle + epoch before invoking this. */
  observeHeartbeat(message: PrivateMvpPeerHeartbeat): boolean;
  /** Called by local independent scheduler, never by worker progress messages. */
  check(): Promise<void>;
  cancel(): boolean;
  /** A clean result is required BEFORE stopping connection/closing SQLite. */
  shutdown(): Promise<boolean>;
  state(): PrivateMvpWatchState;
}

export function createPrivateMvpOwnedPeerWatch(deps: {
  readonly role: 'desktop' | 'gateway';
  readonly ownerEpoch: string;
  readonly clock: PrivateMvpWatchClock;
  readonly ownedJob: PrivateMvpWatchOwnedJob;
  readonly peer: PrivateMvpWatchExactPeer;
  /** Optional for legacy F2-B3 tests; MANDATORY for future H1 proof owner. */
  readonly host?: PrivateMvpWatchExactHost;
  /** Only the Gateway's inspected transfer AND exact host exit may permit it. */
  readonly exactHostHandoffConfirmed?: () => boolean;
  /** Future H1 authenticated Desktop/Gateway private channel verifier. */
  readonly authenticateHeartbeat?: (beat: PrivateMvpPeerHeartbeat) => boolean;
  /** H1: confirm exact one-shot host PROCESS terminated (not a PID). */
  readonly stopOwnedHostAndConfirm?: () => Promise<boolean>;
  /** H1: release held file objects ONLY when OS tree and host are confirmed gone. */
  readonly releaseHeldStageAfterStop?: () => Promise<boolean>;
  /** H1: delete only the exact created profile after OS tree is gone. */
  readonly cleanupOwnedProfileAfterStop?: () => Promise<boolean>;
  readonly writeAudit: (reason: string) => boolean;
}): PrivateMvpOwnedPeerWatch {
  let state: PrivateMvpWatchState = 'idle';
  let lastBeatMs = NaN;
  let lastSequence = 0;
  let lastClockMs = NaN;
  let deadlineMs = NaN;
  let pendingReason: string | undefined;
  let untrustedProtocol = false;
  let stopTimer: (() => void) | undefined;
  let inFlight: Promise<void> | undefined;

  const validEpoch = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(deps.ownerEpoch)
    && deps.ownedJob?.kind === 'owned-worker-job'
    && deps.ownedJob.ownerEpoch === deps.ownerEpoch
    && deps.peer?.ownerEpoch === deps.ownerEpoch
    && deps.peer.kind === (deps.role === 'gateway' ? 'owned-desktop-process' : 'owned-gateway-process')
    && (!deps.host || (deps.host.kind === 'owned-one-shot-host-process'
      && deps.host.ownerEpoch === deps.ownerEpoch
      && typeof deps.exactHostHandoffConfirmed === 'function'
      && typeof deps.authenticateHeartbeat === 'function'
      && typeof deps.stopOwnedHostAndConfirm === 'function'
      && typeof deps.releaseHeldStageAfterStop === 'function'
      && typeof deps.cleanupOwnedProfileAfterStop === 'function'));

  function monotonic(): number {
    const now = deps.clock.monotonicMs();
    if (!Number.isFinite(now) || now < 0 || (Number.isFinite(lastClockMs) && now < lastClockMs)) {
      pendingReason = 'monotonic-clock-unavailable';
      untrustedProtocol = true;
      return NaN;
    }
    lastClockMs = now;
    return now;
  }
  function fence(reason: string, violation = false): void {
    if (state !== 'armed') return;
    pendingReason ??= reason;
    if (violation) untrustedProtocol = true;
    state = 'stopping'; // admission fenced synchronously, before await
    stopTimer?.();
    stopTimer = undefined;
  }
  async function finish(): Promise<void> {
    if (state !== 'stopping' || inFlight) return inFlight;
    const reason = pendingReason ?? 'unknown-lifecycle-failure';
    inFlight = (async () => {
      let audited = false;
      let stopped = false;
      let hostStopped = !deps.host;
      let stageClosed = !deps.host;
      let profileClosed = !deps.host;
      try { audited = deps.writeAudit(reason) === true; } catch { audited = false; }
      try { stopped = await deps.ownedJob.terminateAndConfirm() === true; }
      catch { stopped = false; }
      if (deps.host) {
        try { hostStopped = await deps.stopOwnedHostAndConfirm?.() === true; }
        catch { hostStopped = false; }
        // A lost Job or host prevents release of the held stage / profile.
        if (stopped && hostStopped) {
          try { stageClosed = await deps.releaseHeldStageAfterStop?.() === true; }
          catch { stageClosed = false; }
          if (stageClosed) {
            try { profileClosed = await deps.cleanupOwnedProfileAfterStop?.() === true; }
            catch { profileClosed = false; }
          }
        }
      }
      // Audit failure or uncertain OS cleanup quarantines the attempt;
      // this module never releases F2-A charges or durable launch claims.
      state = stopped && hostStopped && stageClosed && profileClosed
        && audited && !untrustedProtocol ? 'stopped' : 'quarantined';
    })();
    await inFlight;
  }

  return Object.freeze<PrivateMvpOwnedPeerWatch>({
    arm(deadlineWallMs) {
      if (state !== 'idle' || !validEpoch || typeof deps.clock.every !== 'function') return false;
      let peerAlive: string;
      let ownedAlive: string;
      try {
        peerAlive = deps.peer.alive();
        ownedAlive = deps.ownedJob.alive();
      } catch { return false; }
      if (peerAlive !== 'alive' || ownedAlive !== 'alive') return false;
      if (deps.host) {
        try { if (deps.host.alive() !== 'alive') return false; }
        catch { return false; }
      }
      const now = monotonic();
      const wall = deps.clock.wallMs();
      const remaining = deadlineWallMs - wall;
      if (!Number.isFinite(now) || !Number.isFinite(wall) || !Number.isFinite(remaining)
        || remaining <= 0 || remaining > PRIVATE_MVP_RESOURCE_POLICY.maxAttemptMs) return false;
      lastBeatMs = now;
      deadlineMs = now + remaining;
      state = 'armed';
      try {
        stopTimer = deps.clock.every(PRIVATE_MVP_RESOURCE_POLICY.heartbeatMs,
          () => { void this.check(); });
      } catch {
        state = 'idle';
        return false;
      }
      return true;
    },
    observeHeartbeat(message) {
      if (state !== 'armed') return false;
      const now = monotonic();
      if (!Number.isFinite(now) || !message
        || message.ownerEpoch !== deps.ownerEpoch
        || (deps.authenticateHeartbeat && deps.authenticateHeartbeat(message) !== true)
        || !Number.isSafeInteger(message.sequence) || message.sequence <= lastSequence
        || now - lastBeatMs >= PRIVATE_MVP_RESOURCE_POLICY.leaseMs) {
        fence('invalid-peer-heartbeat', true);
        return false;
      }
      lastSequence = message.sequence;
      lastBeatMs = now;
      return true;
    },
    async check() {
      if (state === 'stopping') { await finish(); return; }
      if (state !== 'armed') return;
      const now = monotonic();
      if (!Number.isFinite(now)) fence('monotonic-clock-unavailable', true);
      else if (now >= deadlineMs) fence('attempt-deadline');
      else if (now - lastBeatMs > PRIVATE_MVP_RESOURCE_POLICY.leaseMs) fence('peer-lease-expired');
      else {
        try {
          if (deps.peer.alive() !== 'alive' || deps.ownedJob.alive() !== 'alive') {
            fence('peer-or-job-handle-unavailable');
          } else if (deps.host) {
            const host = deps.host.alive();
            if (host === 'unknown' || (host === 'exited'
               && deps.exactHostHandoffConfirmed?.() !== true)) {
              fence('launch-host-unexpected-exit-or-unknown');
            }
          }
        } catch { fence('peer-or-job-handle-unavailable'); }
      }
      await finish(); // gated inside finish; avoid a stale state narrow
    },
    cancel() {
      if (state !== 'armed') return false;
      fence('cancelled');
      return true;
    },
    async shutdown() {
      if (state === 'armed') fence('owner-shutdown');
      if (state === 'stopping') await finish();
      return state === 'stopped';
    },
    state() { return state; },
  });
}
