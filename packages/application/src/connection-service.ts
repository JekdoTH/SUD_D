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
import { validateWorkspaceRoot } from '@sud-d/infrastructure';
import type {
  ConnectionRuntimeEvent,
  ConnectionRuntimePort,
} from './connection-runtime-port.js';

const DESKTOP_SESSION = { id: 'desktop', type: 'desktop' as const };

export interface ConnectionServiceOptions {
  readonly now?: () => Date;
  readonly createSessionId?: () => string;
}

export interface ConnectionService {
  getStatus(): ConnectionServiceStatus;
  start(profileId: string): Result<ConnectionServiceStatus, AppError>;
  stop(): Result<ConnectionServiceStatus, AppError>;
  restart(profileId: string): Result<ConnectionServiceStatus, AppError>;
}

export function createConnectionService(
  profileRepo: ConnectionProfileRepository,
  workspaceRepo: WorkspaceRepository,
  credentialStore: CredentialStore,
  auditRepo: AuditRepository,
  runtime: ConnectionRuntimePort,
  options: ConnectionServiceOptions = {},
): ConnectionService {
  const now = options.now ?? (() => new Date());
  const createSessionId = options.createSessionId ?? randomUUID;

  let state: ConnectionState = 'stopped';
  let session: ConnectionSessionContext | null = null;
  let lastError: AppError | null = null;
  let lifecycleBusy = false;

  const status = (): ConnectionServiceStatus =>
    Object.freeze({
      state,
      session,
      error: lastError,
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

  const failStart = (
    error: AppError,
    profileId: string,
    workspaceId?: string,
  ): Result<ConnectionServiceStatus, AppError> => {
    if (state !== 'error') {
      const moved = transitionTo('error');
      if (!moved.ok) {
        lastError = moved.error;
        audit('connection.failed', moved.error.code, {
          operation: 'start',
          profileId,
          ...(workspaceId ? { workspaceId } : {}),
        });
        return err(moved.error);
      }
    }
    lastError = error;
    audit('connection.failed', error.code, {
      operation: 'start',
      profileId,
      ...(workspaceId ? { workspaceId } : {}),
    });
    return err(error);
  };

  const startInternal = (profileId: string): Result<ConnectionServiceStatus, AppError> => {
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

    audit('connection.start.requested', 'OK', { profileId });

    const profileResult = validateProfile(profileId);
    if (!profileResult.ok) {
      audit('connection.failed', profileResult.error.code, { operation: 'start', profileId });
      return fail(profileResult.error);
    }
    const profile = profileResult.value;

    if (!credentialStore.hasCredential(profileId)) {
      const missingCredential = appError(
        'CONNECTION_CREDENTIAL_MISSING',
        'Connection credential is not configured',
      );
      audit('connection.failed', missingCredential.code, { operation: 'start', profileId });
      return fail(missingCredential);
    }

    const workspaceResult = validateActiveWorkspace();
    if (!workspaceResult.ok) {
      audit('connection.failed', workspaceResult.error.code, { operation: 'start', profileId });
      return fail(workspaceResult.error);
    }
    const workspace = workspaceResult.value;

    const starting = transitionTo('starting');
    if (!starting.ok) return fail(starting.error);
    const waitingForTunnel = transitionTo('waiting_for_tunnel');
    if (!waitingForTunnel.ok) return fail(waitingForTunnel.error);

    const candidateSession = buildSession(profile, workspace);

    let readiness;
    try {
      readiness = runtime.start(candidateSession);
    } catch (error) {
      const mapped = error instanceof ConnectionRuntimeFailure
        ? connectionRuntimeFailureAppError(error.code)
        : appError('CONNECTION_RUNTIME_START_FAILED', 'Connection runtime failed to start');
      return failStart(mapped, profileId, workspace.id);
    }

    if (readiness.clientConnected && !readiness.tunnelReady) {
      return failStart(
        transitionError(state, 'connected'),
        profileId,
        workspace.id,
      );
    }

    session = candidateSession;
    lastError = null;

    if (readiness.tunnelReady) {
      const waitingForClient = transitionTo('waiting_for_client');
      if (!waitingForClient.ok) return failStart(waitingForClient.error, profileId, workspace.id);
      if (readiness.clientConnected) {
        const connected = transitionTo('connected');
        if (!connected.ok) return failStart(connected.error, profileId, workspace.id);
      }
    }

    audit('connection.started', 'OK', {
      profileId,
      workspaceId: workspace.id,
      connectionSessionId: candidateSession.connectionSessionId,
      state,
    });
    return ok(status());
  };

  const stopInternal = (): Result<ConnectionServiceStatus, AppError> => {
    if (state === 'stopped' || state === 'stopping') {
      return ok(status());
    }

    audit('connection.stop.requested', 'OK', {
      ...(session ? {
        profileId: session.profileId,
        workspaceId: session.workspaceId,
        connectionSessionId: session.connectionSessionId,
      } : {}),
    });

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

  const handleRuntimeEvent = (event: ConnectionRuntimeEvent): void => {
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
      const failure = connectionRuntimeFailureAppError(event.code);
      if (state !== 'error') {
        const moved = transitionTo('error');
        if (!moved.ok) {
          lastError = moved.error;
          return;
        }
      }
      lastError = failure;
      audit('tunnel.failed', failure.code, {
        ...(session ? {
          profileId: session.profileId,
          workspaceId: session.workspaceId,
          connectionSessionId: session.connectionSessionId,
        } : {}),
      });
    }
  };

  runtime.subscribe(handleRuntimeEvent);

  return {
    getStatus(): ConnectionServiceStatus {
      return status();
    },

    start(profileId: string): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(() => startInternal(profileId));
    },

    stop(): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(stopInternal);
    },

    restart(profileId: string): Result<ConnectionServiceStatus, AppError> {
      return withLifecycleGuard(() => {
        if (
          state === 'starting' ||
          state === 'waiting_for_tunnel' ||
          state === 'waiting_for_client' ||
          state === 'stopping'
        ) {
          return fail(transitionError(state, 'stopping'));
        }

        if (state !== 'stopped') {
          const stopped = stopInternal();
          if (!stopped.ok) return stopped;
        }
        return startInternal(profileId);
      });
    },
  };
}
