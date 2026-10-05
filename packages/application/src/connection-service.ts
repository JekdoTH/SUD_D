import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  AppError,
  ConnectionProfile,
  ConnectionServiceStatus,
  ConnectionSessionContext,
  ConnectionState,
  Result,
  Workspace,
} from '@sud-d/domain';
import {
  appError,
  ConnectionRuntimeFailure,
  connectionRuntimeFailureAppError,
  err,
  ok,
  transitionConnectionState,
} from '@sud-d/domain';
import type {
  AuditRepository,
  ConnectionProfileRepository,
  CredentialStore,
  WorkspaceRepository,
} from '@sud-d/infrastructure';
import { isManagedCredentialStore, validateWorkspaceRoot } from '@sud-d/infrastructure';
import type {
  ConnectionRuntimeEvent,
  ConnectionRuntimePort,
} from './connection-runtime-port.js';

const DESKTOP_SESSION = { id: 'desktop', type: 'desktop' as const };

export interface ConnectionServiceOptions {
  readonly now?: () => Date;
  readonly createSessionId?: () => string;
  readonly scheduleTimeout?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  readonly cancelTimeout?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface ConnectionService {
  getStatus(): ConnectionServiceStatus;
  start(profileId: string): Result<ConnectionServiceStatus, AppError>;
  stop(): Result<ConnectionServiceStatus, AppError>;
  restart(profileId: string): Result<ConnectionServiceStatus, AppError>;
  shutdown(): Result<ConnectionServiceStatus, AppError>;
  setAutoRecoveryEnabled(enabled: boolean): void;
}

export function createConnectionService(
  profileRepo: ConnectionProfileRepository,
  workspaceRepo: WorkspaceRepository,
  credentialStore: CredentialStore,
  auditRepo: AuditRepository,
  runtime: ConnectionRuntimePort,
  options: ConnectionServiceOptions = {},
): ConnectionService {
  const RETRY_DELAYS_MS = [1_000, 3_000, 10_000] as const;
  const STABILITY_WINDOW_MS = 60_000;
  const now = options.now ?? (() => new Date());
  const createSessionId = options.createSessionId ?? randomUUID;
  const scheduleTimeout = options.scheduleTimeout ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancelTimeout = options.cancelTimeout ?? ((handle) => clearTimeout(handle));

  let state: ConnectionState = 'stopped';
  let session: ConnectionSessionContext | null = null;
  let lastError: AppError | null = null;
  let lifecycleBusy = false;
  let shutdownLatched = false;
  let connectionIntent = false;
  let autoRecoveryEnabled = false;
  let consumedRecoveryAttempts: 0 | 1 | 2 | 3 = 0;
  let recovery: ConnectionServiceStatus['recovery'] = { phase: 'idle', attempt: 0 };
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let stabilityTimer: ReturnType<typeof setTimeout> | undefined;
  let lifecycleEpoch = 0;
  let currentLaunchId: string | null = null;
  let candidateLaunchId: string | null = null;
  let queuedRuntimeEvents: ConnectionRuntimeEvent[] = [];
  let unsubscribeRuntime: (() => void) | null = null;
  let boundContext: {
    readonly profileId: string;
    readonly workspaceId: string;
    readonly workspaceCanonicalRoot: string;
    readonly provider: ConnectionProfile['provider'];
    readonly transport: ConnectionProfile['transport'];
    readonly deviceName: string;
    readonly credentialRevision: number;
    readonly tunnelReference?: string;
  } | null = null;

  const status = (): ConnectionServiceStatus =>
    Object.freeze({
      state,
      session,
      error: lastError,
      recovery: Object.freeze({ ...recovery }),
    });

  const audit = (
    action: string,
    resultCode: string,
    metadata: Record<string, string | number | boolean> = {},
  ): void => {
    auditRepo.append({
      timestamp: now(),
      sessionId: DESKTOP_SESSION.id,
      sessionType: DESKTOP_SESSION.type,
      action,
      resultCode,
      durationMs: 0,
      metadata,
    });
  };

  const fail = (error: AppError): Result<ConnectionServiceStatus, AppError> => {
    lastError = error;
    return err(error);
  };

  const busyError = (): AppError =>
    appError('CONNECTION_LIFECYCLE_BUSY', 'Another connection lifecycle operation is in progress');

  const transitionError = (from: ConnectionState, to: ConnectionState): AppError =>
    appError(
      'INVALID_CONNECTION_STATE_TRANSITION',
      `Invalid connection state transition: ${from} → ${to}`,
      { from, to },
    );

  const transitionTo = (to: ConnectionState): Result<void, AppError> => {
    const from = state;
    const result = transitionConnectionState(from, to);
    if (!result.ok) {
      return err(transitionError(from, to));
    }
    state = result.state;
    return ok(undefined);
  };

  const clearRetryTimer = (): void => {
    if (retryTimer !== undefined) {
      cancelTimeout(retryTimer);
      retryTimer = undefined;
    }
  };

  const clearStabilityTimer = (): void => {
    if (stabilityTimer !== undefined) {
      cancelTimeout(stabilityTimer);
      stabilityTimer = undefined;
    }
  };

  const invalidateLaunch = (): void => {
    currentLaunchId = null;
    candidateLaunchId = null;
    queuedRuntimeEvents = [];
    lifecycleEpoch += 1;
  };

  const revokeIntent = (resetRecovery = true): void => {
    connectionIntent = false;
    autoRecoveryEnabled = false;
    boundContext = null;
    clearRetryTimer();
    clearStabilityTimer();
    invalidateLaunch();
    if (resetRecovery) {
      consumedRecoveryAttempts = 0;
      recovery = { phase: 'idle', attempt: 0 };
    }
  };

  const getActiveWorkspace = (): Workspace | undefined =>
    workspaceRepo.list().find((workspace) => workspace.isActive);

  const validateProfile = (profileId: string): Result<ConnectionProfile, AppError> => {
    const profile = profileRepo.findById(profileId);
    if (!profile) {
      return err(
        appError('CONNECTION_PROFILE_NOT_FOUND', `Connection profile ${profileId} not found`),
      );
    }
    if (
      profile.provider !== 'openai_secure_mcp_tunnel' ||
      profile.transport !== 'stdio'
    ) {
      return err(appError('VALIDATION_FAILED', 'Connection profile provider or transport is invalid'));
    }
    return ok(profile);
  };

  const validateCredential = (profileId: string): Result<void, AppError> => {
    let credentialReady: boolean;
    try {
      credentialReady = isManagedCredentialStore(credentialStore)
        ? credentialStore.prepareCredential(profileId)
        : credentialStore.hasCredential(profileId);
    } catch {
      return err(appError('INTERNAL_ERROR', 'Runtime API Key is unavailable'));
    }

    if (!credentialReady) {
      return err(
        appError('CONNECTION_CREDENTIAL_MISSING', 'Connection credential is not configured'),
      );
    }
    return ok(undefined);
  };

  const validateActiveWorkspace = (): Result<Workspace, AppError> => {
    const workspace = getActiveWorkspace();
    if (!workspace) {
      return err(
        appError('CONNECTION_WORKSPACE_NOT_SELECTED', 'No active workspace is selected'),
      );
    }

    const rootValidation = validateWorkspaceRoot(workspace.canonicalRoot);
    if (!rootValidation.ok) {
      return err(appError('WORKSPACE_INVALID', 'Active workspace root is invalid'));
    }

    try {
      const stat = fs.statSync(workspace.canonicalRoot);
      if (!stat.isDirectory()) {
        return err(appError('WORKSPACE_INVALID', 'Active workspace root must be a directory'));
      }
    } catch {
      return err(appError('WORKSPACE_INVALID', 'Active workspace root does not exist'));
    }

    return ok(workspace);
  };

  const captureBoundContext = (profile: ConnectionProfile, workspace: Workspace) =>
    Object.freeze({
      profileId: profile.profileId,
      workspaceId: workspace.id,
      workspaceCanonicalRoot: workspace.canonicalRoot,
      provider: profile.provider,
      transport: profile.transport,
      deviceName: profile.deviceName,
      credentialRevision: credentialStore.getRevision(profile.profileId),
      ...(profile.tunnelReference ? { tunnelReference: profile.tunnelReference } : {}),
    });

  const matchesBoundContext = (
    profile: ConnectionProfile,
    workspace: Workspace,
  ): boolean => {
    if (!boundContext) return false;
    return (
      profile.profileId === boundContext.profileId &&
      workspace.id === boundContext.workspaceId &&
      workspace.canonicalRoot === boundContext.workspaceCanonicalRoot &&
      profile.provider === boundContext.provider &&
      profile.transport === boundContext.transport &&
      profile.deviceName === boundContext.deviceName &&
      credentialStore.getRevision(profile.profileId) === boundContext.credentialRevision &&
      profile.tunnelReference === boundContext.tunnelReference
    );
  };

  const buildSession = (
    profile: ConnectionProfile,
    workspace: Workspace,
  ): ConnectionSessionContext =>
    Object.freeze({
      connectionSessionId: createSessionId(),
      profileId: profile.profileId,
      workspaceId: workspace.id,
      workspaceCanonicalRoot: workspace.canonicalRoot,
      startedAt: now(),
      provider: profile.provider,
      transport: profile.transport,
      deviceName: profile.deviceName,
      ...(profile.tunnelReference ? { tunnelReference: profile.tunnelReference } : {}),
    });

  const moveToError = (error: AppError): void => {
    if (state === 'error') {
      lastError = error;
      return;
    }
    if (state === 'stopped') {
      const starting = transitionTo('starting');
      if (!starting.ok) {
        lastError = starting.error;
        return;
      }
    }
    const errored = transitionTo('error');
    lastError = errored.ok ? error : errored.error;
  };

  const terminalFailure = (
    error: AppError,
    phase: 'blocked' | 'exhausted',
  ): void => {
    const attempt = consumedRecoveryAttempts;
    clearRetryTimer();
    clearStabilityTimer();
    connectionIntent = false;
    autoRecoveryEnabled = false;
    boundContext = null;
    invalidateLaunch();
    recovery = { phase, attempt };
    moveToError(error);
  };

  const failStart = (
    error: AppError,
    profileId: string,
    workspaceId?: string,
  ): Result<ConnectionServiceStatus, AppError> => {
    moveToError(error);
    audit('connection.failed', error.code, {
      operation: 'start',
      profileId,
      ...(workspaceId ? { workspaceId } : {}),
    });
    return err(error);
  };

  const beginStabilization = (connectionSessionId: string): void => {
    clearStabilityTimer();
    if (
      consumedRecoveryAttempts === 0 ||
      !connectionIntent ||
      !autoRecoveryEnabled ||
      currentLaunchId !== connectionSessionId
    ) {
      if (consumedRecoveryAttempts === 0) recovery = { phase: 'idle', attempt: 0 };
      return;
    }

    recovery = { phase: 'stabilizing', attempt: consumedRecoveryAttempts };
    const epoch = lifecycleEpoch;
    stabilityTimer = scheduleTimeout(() => {
      stabilityTimer = undefined;
      if (
        epoch !== lifecycleEpoch ||
        !connectionIntent ||
        !autoRecoveryEnabled ||
        currentLaunchId !== connectionSessionId ||
        recovery.phase !== 'stabilizing'
      ) {
        return;
      }
      consumedRecoveryAttempts = 0;
      recovery = { phase: 'idle', attempt: 0 };
    }, STABILITY_WINDOW_MS);
  };

  function handleRuntimeEvent(event: ConnectionRuntimeEvent): void {
    if (
      candidateLaunchId !== null &&
      event.connectionSessionId === candidateLaunchId
    ) {
      queuedRuntimeEvents.push(event);
      return;
    }
    if (event.connectionSessionId !== currentLaunchId) return;

    if (event.type === 'tunnel_ready') {
      if (state !== 'waiting_for_tunnel') return;
      const moved = transitionTo('waiting_for_client');
      if (!moved.ok) {
        lastError = moved.error;
        return;
      }
      lastError = null;
      audit('tunnel.ready', 'OK', {
        ...(session ? {
          profileId: session.profileId,
          workspaceId: session.workspaceId,
          connectionSessionId: session.connectionSessionId,
        } : {}),
      });
      beginStabilization(event.connectionSessionId);
      return;
    }

    if (event.type === 'client_connected') {
      if (state !== 'waiting_for_client' && state !== 'degraded') return;
      const moved = transitionTo('connected');
      if (!moved.ok) {
        lastError = moved.error;
        return;
      }
      lastError = null;
      return;
    }

    if (event.type === 'client_disconnected') {
      if (state !== 'connected') return;
      const moved = transitionTo('degraded');
      if (!moved.ok) {
        lastError = moved.error;
      }
      return;
    }

    if (event.type === 'runtime_failed') {
      if (state === 'stopped' || state === 'stopping') return;
      if (recovery.phase === 'scheduled') return;
      if (recovery.phase === 'blocked' || recovery.phase === 'exhausted') return;

      clearStabilityTimer();
      lifecycleEpoch += 1;
      const failure = connectionRuntimeFailureAppError(event.code);
      moveToError(failure);
      audit('tunnel.failed', failure.code, {
        ...(session ? {
          profileId: session.profileId,
          workspaceId: session.workspaceId,
          connectionSessionId: session.connectionSessionId,
        } : {}),
      });

      const retryable =
        event.code === 'TUNNEL_EXITED_UNEXPECTEDLY' ||
        event.code === 'TUNNEL_HEALTH_FAILED';

      if (
        !retryable ||
        !connectionIntent ||
        !autoRecoveryEnabled ||
        shutdownLatched
      ) {
        terminalFailure(failure, 'blocked');
        return;
      }

      const consumedAttempts = consumedRecoveryAttempts;
      if (consumedAttempts === 3) {
        terminalFailure(failure, 'exhausted');
        return;
      }

      recovery = { phase: 'scheduled', attempt: consumedAttempts };
      const delayMs =
        consumedAttempts === 0
          ? RETRY_DELAYS_MS[0]
          : consumedAttempts === 1
            ? RETRY_DELAYS_MS[1]
            : RETRY_DELAYS_MS[2];
      const epoch = lifecycleEpoch;
      retryTimer = scheduleTimeout(() => {
        retryTimer = undefined;
        if (
          epoch !== lifecycleEpoch ||
          recovery.phase !== 'scheduled' ||
          !connectionIntent ||
          !autoRecoveryEnabled ||
          shutdownLatched
        ) {
          return;
        }
        void executeRecoveryAttempt();
      }, delayMs);
    }
  }

  const processQueuedRuntimeEvents = (): void => {
    const queued = queuedRuntimeEvents;
    queuedRuntimeEvents = [];
    for (const event of queued) handleRuntimeEvent(event);
  };

  const startInternal = (
    profileId: string,
    mode: 'manual' | 'automatic',
  ): Result<ConnectionServiceStatus, AppError> => {
    if (shutdownLatched) {
      return fail(appError('VALIDATION_FAILED', 'Connection is shutting down'));
    }
    if (state !== 'stopped') {
      const activeWorkspace = getActiveWorkspace();
      if (
        session &&
        activeWorkspace &&
        activeWorkspace.id !== session.workspaceId
      ) {
        const rebindError = appError(
          'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART',
          'Active workspace changed; restart is required to bind a new workspace',
        );
        audit('connection.failed', rebindError.code, {
          operation: 'start',
          profileId,
          workspaceId: activeWorkspace.id,
        });
        return fail(rebindError);
      }

      const invalid = transitionError(state, 'starting');
      audit('connection.failed', invalid.code, { operation: 'start', profileId });
      return fail(invalid);
    }

    audit('connection.start.requested', 'OK', {
      profileId,
      automaticRecovery: mode === 'automatic',
    });

    const profileResult = validateProfile(profileId);
    if (!profileResult.ok) {
      audit('connection.failed', profileResult.error.code, { operation: 'start', profileId });
      return fail(profileResult.error);
    }
    const profile = profileResult.value;

    const credentialResult = validateCredential(profileId);
    if (!credentialResult.ok) {
      audit('connection.failed', credentialResult.error.code, { operation: 'start', profileId });
      return fail(credentialResult.error);
    }

    const workspaceResult = validateActiveWorkspace();
    if (!workspaceResult.ok) {
      audit('connection.failed', workspaceResult.error.code, { operation: 'start', profileId });
      return fail(workspaceResult.error);
    }
    const workspace = workspaceResult.value;

    if (mode === 'automatic') {
      if (!matchesBoundContext(profile, workspace)) {
        return fail(
          appError(
            'CONNECTION_WORKSPACE_REBIND_REQUIRES_RESTART',
            'Connection setup changed; reconnect manually to bind the current configuration',
          ),
        );
      }
      if (!profile.autoRestart) {
        autoRecoveryEnabled = false;
        return fail(appError('VALIDATION_FAILED', 'Auto Recovery is disabled'));
      }
    }

    const starting = transitionTo('starting');
    if (!starting.ok) return fail(starting.error);
    const waitingForTunnel = transitionTo('waiting_for_tunnel');
    if (!waitingForTunnel.ok) return fail(waitingForTunnel.error);

    const candidateSession = buildSession(profile, workspace);
    candidateLaunchId = candidateSession.connectionSessionId;
    queuedRuntimeEvents = [];

    let readiness;
    try {
      readiness = runtime.start(candidateSession);
    } catch (error) {
      candidateLaunchId = null;
      queuedRuntimeEvents = [];
      const mapped = error instanceof ConnectionRuntimeFailure
        ? connectionRuntimeFailureAppError(error.code)
        : appError('CONNECTION_RUNTIME_START_FAILED', 'Connection runtime failed to start');
      if (mode === 'manual') {
        connectionIntent = false;
        autoRecoveryEnabled = false;
        boundContext = null;
      }
      return failStart(mapped, profileId, workspace.id);
    }

    if (readiness.clientConnected && !readiness.tunnelReady) {
      candidateLaunchId = null;
      queuedRuntimeEvents = [];
      if (mode === 'manual') {
        connectionIntent = false;
        autoRecoveryEnabled = false;
        boundContext = null;
      }
      return failStart(
        transitionError(state, 'connected'),
        profileId,
        workspace.id,
      );
    }

    session = candidateSession;
    currentLaunchId = candidateSession.connectionSessionId;
    candidateLaunchId = null;
    lastError = null;
    lifecycleEpoch += 1;

    if (mode === 'manual') {
      connectionIntent = true;
      autoRecoveryEnabled = profile.autoRestart;
      boundContext = captureBoundContext(profile, workspace);
      consumedRecoveryAttempts = 0;
      recovery = { phase: 'idle', attempt: 0 };
    }

    if (readiness.tunnelReady) {
      const waitingForClient = transitionTo('waiting_for_client');
      if (!waitingForClient.ok) return failStart(waitingForClient.error, profileId, workspace.id);
      if (readiness.clientConnected) {
        const connected = transitionTo('connected');
        if (!connected.ok) return failStart(connected.error, profileId, workspace.id);
      }
      beginStabilization(candidateSession.connectionSessionId);
    }

    audit('connection.started', 'OK', {
      profileId,
      workspaceId: workspace.id,
      connectionSessionId: candidateSession.connectionSessionId,
      state,
      automaticRecovery: mode === 'automatic',
    });

    processQueuedRuntimeEvents();
    return ok(status());
  };

  const stopInternal = (
    revoke: boolean,
  ): Result<ConnectionServiceStatus, AppError> => {
    if (revoke) revokeIntent(true);

    if (state === 'stopped' || state === 'stopping') {
      if (state === 'stopped') {
        session = null;
        lastError = null;
      }
      return ok(status());
    }

    audit('connection.stop.requested', 'OK', {
      ...(session ? {
        profileId: session.profileId,
        workspaceId: session.workspaceId,
        connectionSessionId: session.connectionSessionId,
      } : {}),
    });

    invalidateLaunch();

    const stopping = transitionTo('stopping');
    if (!stopping.ok) return fail(stopping.error);

    try {
      runtime.stop();
    } catch (error) {
      const stopError = error instanceof ConnectionRuntimeFailure
        ? connectionRuntimeFailureAppError(error.code)
        : appError(
            'CONNECTION_RUNTIME_STOP_FAILED',
            'Connection runtime failed to stop',
          );
      const errored = transitionTo('error');
      if (!errored.ok) return fail(errored.error);
      lastError = stopError;
      audit('connection.failed', stopError.code, {
        operation: 'stop',
        ...(session ? {
          profileId: session.profileId,
          workspaceId: session.workspaceId,
          connectionSessionId: session.connectionSessionId,
        } : {}),
      });
      return err(stopError);
    }

    const stopped = transitionTo('stopped');
    if (!stopped.ok) return fail(stopped.error);

    const stoppedSession = session;
    session = null;
    lastError = null;
    audit('connection.stopped', 'OK', {
      ...(stoppedSession ? {
        profileId: stoppedSession.profileId,
        workspaceId: stoppedSession.workspaceId,
        connectionSessionId: stoppedSession.connectionSessionId,
      } : {}),
    });
    return ok(status());
  };

  function executeRecoveryAttempt(): Result<ConnectionServiceStatus, AppError> {
    if (lifecycleBusy) {
      const error = busyError();
      terminalFailure(error, 'blocked');
      return err(error);
    }
    if (!connectionIntent || !autoRecoveryEnabled || shutdownLatched || !boundContext) {
      const error = lastError ?? appError('INTERNAL_ERROR', 'Connection recovery is unavailable');
      terminalFailure(error, 'blocked');
      return err(error);
    }

    const nextAttempt = (consumedRecoveryAttempts + 1) as 1 | 2 | 3;
    consumedRecoveryAttempts = nextAttempt;
    recovery = { phase: 'restarting', attempt: nextAttempt };
    const profileId = boundContext.profileId;

    lifecycleBusy = true;
    try {
      clearRetryTimer();
      clearStabilityTimer();
      invalidateLaunch();

      const stopped = stopInternal(false);
      if (!stopped.ok) {
        terminalFailure(stopped.error, 'blocked');
        return stopped;
      }

      const restarted = startInternal(profileId, 'automatic');
      if (!restarted.ok) {
        terminalFailure(restarted.error, 'blocked');
        return restarted;
      }
      return restarted;
    } finally {
      lifecycleBusy = false;
    }
  }

  const withLifecycleGuard = (
    operation: () => Result<ConnectionServiceStatus, AppError>,
  ): Result<ConnectionServiceStatus, AppError> => {
    if (lifecycleBusy) {
      return fail(busyError());
    }
    lifecycleBusy = true;
    try {
      return operation();
    } catch {
      return fail(appError('INTERNAL_ERROR', 'Unexpected connection lifecycle failure'));
    } finally {
      lifecycleBusy = false;
    }
  };

  const reconcileTrustedMcpActivity = (): void => {
    if (state !== 'waiting_for_client' || !session) return;
    let hasActivity = false;
    try {
      hasActivity = auditRepo.hasSessionActivitySince('mcp-stdio', session.startedAt);
    } catch {
      return;
    }
    if (!hasActivity) return;
    const moved = transitionTo('connected');
    if (!moved.ok) {
      lastError = moved.error;
      return;
    }
    lastError = null;
  };

  unsubscribeRuntime = runtime.subscribe(handleRuntimeEvent);

  return {
    getStatus(): ConnectionServiceStatus {
      reconcileTrustedMcpActivity();
      return status();
    },

    start(profileId: string): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(() => startInternal(profileId, 'manual'));
    },

    stop(): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(() => stopInternal(true));
    },

    restart(profileId: string): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(() => {
        if (shutdownLatched) {
          return fail(appError('VALIDATION_FAILED', 'Connection is shutting down'));
        }
        if (state === 'stopped') {
          return fail(transitionError(state, 'stopping'));
        }
        if (
          recovery.phase === 'scheduled' ||
          recovery.phase === 'restarting' ||
          recovery.phase === 'stabilizing'
        ) {
          return fail(busyError());
        }
        if (
          state === 'starting' ||
          state === 'waiting_for_tunnel' ||
          state === 'waiting_for_client' ||
          state === 'stopping'
        ) {
          return fail(transitionError(state, 'stopping'));
        }

        const stopped = stopInternal(true);
        if (!stopped.ok) return stopped;
        return startInternal(profileId, 'manual');
      });
    },

    shutdown(): Result<ConnectionServiceStatus, AppError> {
      shutdownLatched = true;
      revokeIntent(true);
      if (unsubscribeRuntime) {
        unsubscribeRuntime();
        unsubscribeRuntime = null;
      }
      return withLifecycleGuard(() => stopInternal(false));
    },

    setAutoRecoveryEnabled(enabled: boolean): void {
      autoRecoveryEnabled = enabled && connectionIntent && !shutdownLatched;

      if (enabled) {
        if (
          autoRecoveryEnabled &&
          consumedRecoveryAttempts > 0 &&
          recovery.phase === 'idle' &&
          currentLaunchId !== null &&
          (state === 'waiting_for_client' || state === 'connected' || state === 'degraded')
        ) {
          beginStabilization(currentLaunchId);
        }
        return;
      }

      if (recovery.phase === 'scheduled') {
        const failure = lastError ?? appError('INTERNAL_ERROR', 'Connection recovery was cancelled');
        terminalFailure(failure, 'blocked');
        return;
      }

      if (recovery.phase === 'restarting' || recovery.phase === 'stabilizing') {
        clearRetryTimer();
        clearStabilityTimer();
        lifecycleEpoch += 1;
        recovery = { phase: 'idle', attempt: 0 };
      }
    },
  };
}
