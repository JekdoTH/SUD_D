import type {
  ConnectionConfigService,
  ConnectionService,
} from '@sud-d/application';
import {
  appError,
  err,
  ok,
  type AppError,
  type ConnectionProfile,
  type ConnectionServiceStatus,
  type Result,
} from '@sud-d/domain';
import { ConnectionServiceErrorCodeSchema } from '@sud-d/contracts';
import type {
  ConnectionRestartInput,
  ConnectionStartInput,
  ConnectionStopInput,
  DesktopConnectionPreferencesUpdateInput,
  DesktopConnectionRuntimeStatusDto,
  DesktopConnectionSnapshotDto,
  DesktopConnectionTunnelSetupInput,
} from '@sud-d/contracts';

export interface DesktopConnectionControllerOptions {
  readonly configService: ConnectionConfigService;
  readonly connectionService: ConnectionService;
  readonly deviceName: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export interface DesktopConnectionController {
  getSnapshot(): Result<DesktopConnectionSnapshotDto, AppError>;
  start(input: ConnectionStartInput): Result<DesktopConnectionSnapshotDto, AppError>;
  stop(input: ConnectionStopInput): Result<DesktopConnectionSnapshotDto, AppError>;
  restart(input: ConnectionRestartInput): Result<DesktopConnectionSnapshotDto, AppError>;
  configureTunnel(input: DesktopConnectionTunnelSetupInput): Result<DesktopConnectionSnapshotDto, AppError>;
  updatePreferences(input: DesktopConnectionPreferencesUpdateInput): Result<DesktopConnectionSnapshotDto, AppError>;
}

function nonEmptyEnvironmentValue(environment: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = environment[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toDesktopRuntimeStatus(status: ConnectionServiceStatus): DesktopConnectionRuntimeStatusDto {
  return {
    state: status.state,
    session: status.session
      ? {
          connectionSessionId: status.session.connectionSessionId,
          profileId: status.session.profileId,
          workspaceId: status.session.workspaceId,
          startedAt: status.session.startedAt.toISOString(),
          provider: status.session.provider,
          transport: status.session.transport,
          deviceName: status.session.deviceName,
        }
      : null,
    error: status.error
      ? (() => {
          const code = ConnectionServiceErrorCodeSchema.safeParse(status.error.code);
          return code.success
            ? { code: code.data, message: status.error.message }
            : { code: 'INTERNAL_ERROR' as const, message: 'Connection runtime failed' };
        })()
      : null,
  };
}

function toDesktopProfile(profile: ConnectionProfile): NonNullable<DesktopConnectionSnapshotDto['profile']> {
  return {
    profileId: profile.profileId,
    displayName: profile.displayName,
    provider: profile.provider,
    transport: profile.transport,
    deviceName: profile.deviceName,
    autoStart: profile.autoStart,
    autoRestart: profile.autoRestart,
    tunnelConfigured: typeof profile.tunnelReference === 'string' && profile.tunnelReference.length > 0,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function createDesktopConnectionController(
  options: DesktopConnectionControllerOptions,
): DesktopConnectionController {
  const environment = options.environment ?? process.env;
  let cachedProfile: ConnectionProfile | null = null;
  let cachedCredentialStatus: DesktopConnectionSnapshotDto['credentialStatus'] = null;

  const ensureProfile = (): Result<ConnectionProfile, AppError> => {
    if (cachedProfile) return ok(cachedProfile);

    const listed = options.configService.listProfiles();
    if (!listed.ok) return listed;

    let profile = listed.value[0];
    const environmentTunnelReference = nonEmptyEnvironmentValue(environment, 'CONTROL_PLANE_TUNNEL_ID');

    if (!profile) {
      const created = options.configService.createProfile({
        displayName: 'OpenAI Secure Tunnel',
        provider: 'openai_secure_mcp_tunnel',
        transport: 'stdio',
        deviceName: options.deviceName,
        autoStart: false,
        autoRestart: false,
        ...(environmentTunnelReference ? { tunnelReference: environmentTunnelReference } : {}),
      });
      if (!created.ok) return created;
      profile = created.value;
    } else if (!profile.tunnelReference && environmentTunnelReference) {
      const updated = options.configService.updateProfile(profile.profileId, {
        tunnelReference: environmentTunnelReference,
      });
      if (!updated.ok) return updated;
      profile = updated.value;
    }

    const credentialStatus = options.configService.getCredentialStatus(profile.profileId);
    if (!credentialStatus.ok) return err(credentialStatus.error);
    let effectiveCredentialStatus = credentialStatus.value;
    if (credentialStatus.value === 'missing') {
      const environmentCredential = nonEmptyEnvironmentValue(environment, 'CONTROL_PLANE_API_KEY');
      if (environmentCredential) {
        const stored = options.configService.setCredential(profile.profileId, environmentCredential);
        if (!stored.ok) return err(stored.error);
        effectiveCredentialStatus = 'configured';
      }
    }

    cachedProfile = profile;
    cachedCredentialStatus = effectiveCredentialStatus;
    return ok(profile);
  };

  const getSnapshot = (): Result<DesktopConnectionSnapshotDto, AppError> => {
    const profileResult = ensureProfile();
    if (!profileResult.ok) return err(profileResult.error);
    const profile = profileResult.value;

    if (cachedCredentialStatus === null) {
      const credentialStatus = options.configService.getCredentialStatus(profile.profileId);
      if (!credentialStatus.ok) return err(credentialStatus.error);
      cachedCredentialStatus = credentialStatus.value;
    }

    return ok({
      profile: toDesktopProfile(profile),
      credentialStatus: cachedCredentialStatus,
      runtime: toDesktopRuntimeStatus(options.connectionService.getStatus()),
    });
  };

  return {
    getSnapshot,

    start(input: ConnectionStartInput): Result<DesktopConnectionSnapshotDto, AppError> {
      const profile = ensureProfile();
      if (!profile.ok) return err(profile.error);
      if (profile.value.profileId !== input.profileId) {
        return err({ code: 'CONNECTION_PROFILE_NOT_FOUND', message: 'Connection profile not found' });
      }

      const started = options.connectionService.start(input.profileId);
      if (!started.ok) return err(started.error);
      return getSnapshot();
    },

    stop(_input: ConnectionStopInput): Result<DesktopConnectionSnapshotDto, AppError> {
      const stopped = options.connectionService.stop();
      if (!stopped.ok) return err(stopped.error);
      return getSnapshot();
    },

    restart(input: ConnectionRestartInput): Result<DesktopConnectionSnapshotDto, AppError> {
      const profile = ensureProfile();
      if (!profile.ok) return err(profile.error);
      if (profile.value.profileId !== input.profileId) {
        return err({ code: 'CONNECTION_PROFILE_NOT_FOUND', message: 'Connection profile not found' });
      }

      const restarted = options.connectionService.restart(input.profileId);
      if (!restarted.ok) return err(restarted.error);
      return getSnapshot();
    },

    configureTunnel(input: DesktopConnectionTunnelSetupInput): Result<DesktopConnectionSnapshotDto, AppError> {
      const profile = ensureProfile();
      if (!profile.ok) return err(profile.error);
      if (profile.value.profileId !== input.profileId) {
        return err({ code: 'CONNECTION_PROFILE_NOT_FOUND', message: 'Connection profile not found' });
      }

      const tunnelReference = nonEmptyEnvironmentValue(environment, 'CONTROL_PLANE_TUNNEL_ID');
      if (!tunnelReference) {
        return err(appError('VALIDATION_FAILED', 'Restart SUD-D to load the tunnel configuration.'));
      }

      const updated = options.configService.updateProfile(input.profileId, { tunnelReference });
      if (!updated.ok) return err(updated.error);
      cachedProfile = updated.value;
      return getSnapshot();
    },

    updatePreferences(input: DesktopConnectionPreferencesUpdateInput): Result<DesktopConnectionSnapshotDto, AppError> {
      const profile = ensureProfile();
      if (!profile.ok) return err(profile.error);
      if (profile.value.profileId !== input.profileId) {
        return err({ code: 'CONNECTION_PROFILE_NOT_FOUND', message: 'Connection profile not found' });
      }

      const updated = options.configService.updateProfile(input.profileId, {
        autoStart: input.autoStart,
        autoRestart: input.autoRestart,
      });
      if (!updated.ok) return err(updated.error);
      cachedProfile = updated.value;
      return getSnapshot();
    },
  };
}
