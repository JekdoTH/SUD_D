import type {
  AppError,
  ConnectionCredentialStatus,
  ConnectionProfile,
  ConnectionProfileUpdate,
  NewConnectionProfile,
  Result,
} from '@sud-d/domain';
import { appError, err, ok } from '@sud-d/domain';
import type {
  AuditRepository,
  ConnectionProfileRepository,
  CredentialSetupOutcome,
  CredentialStore,
} from '@sud-d/infrastructure';
import { isManagedCredentialStore } from '@sud-d/infrastructure';

const DESKTOP_SESSION = { id: 'desktop', type: 'desktop' as const };

export interface ConnectionConfigService {
  listProfiles(): Result<ConnectionProfile[], AppError>;
  createProfile(input: NewConnectionProfile): Result<ConnectionProfile, AppError>;
  getProfile(profileId: string): Result<ConnectionProfile, AppError>;
  updateProfile(
    profileId: string,
    update: ConnectionProfileUpdate,
  ): Result<ConnectionProfile, AppError>;
  getCredentialStatus(profileId: string): Result<ConnectionCredentialStatus, AppError>;
  setCredential(profileId: string, credential: string): Result<void, AppError>;
  setupCredential(profileId: string): Result<CredentialSetupOutcome, AppError>;
  deleteCredential(profileId: string): Result<void, AppError>;
}

function profileNotFound(profileId: string): AppError {
  return appError('CONNECTION_PROFILE_NOT_FOUND', `Connection profile ${profileId} not found`);
}

export function createConnectionConfigService(
  profileRepo: ConnectionProfileRepository,
  credentialStore: CredentialStore,
  auditRepo: AuditRepository,
): ConnectionConfigService {
  const audit = (
    action: string,
    resultCode: string,
    metadata: Record<string, string | number | boolean>,
    start: number,
  ): void => {
    auditRepo.append({
      timestamp: new Date(),
      sessionId: DESKTOP_SESSION.id,
      sessionType: DESKTOP_SESSION.type,
      action,
      resultCode,
      durationMs: Date.now() - start,
      metadata,
    });
  };

  const requireProfile = (profileId: string): Result<ConnectionProfile, AppError> => {
    const profile = profileRepo.findById(profileId);
    return profile ? ok(profile) : err(profileNotFound(profileId));
  };

  return {
    listProfiles(): Result<ConnectionProfile[], AppError> {
      const start = Date.now();
      try {
        const profiles = profileRepo.list();
        audit('connection-profile:list', 'OK', { count: profiles.length }, start);
        return ok(profiles);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to list connection profiles'));
      }
    },

    createProfile(input: NewConnectionProfile): Result<ConnectionProfile, AppError> {
      const start = Date.now();
      try {
        const profile = profileRepo.save(input);
        audit(
          'connection-profile:create',
          'OK',
          {
            profileId: profile.profileId,
            provider: profile.provider,
            transport: profile.transport,
            deviceName: profile.deviceName,
            autoStart: profile.autoStart,
            autoRestart: profile.autoRestart,
          },
          start,
        );
        return ok(profile);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to create connection profile'));
      }
    },

    getProfile(profileId: string): Result<ConnectionProfile, AppError> {
      const start = Date.now();
      try {
        const result = requireProfile(profileId);
        audit(
          'connection-profile:read',
          result.ok ? 'OK' : result.error.code,
          { profileId },
          start,
        );
        return result;
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to read connection profile'));
      }
    },

    updateProfile(
      profileId: string,
      update: ConnectionProfileUpdate,
    ): Result<ConnectionProfile, AppError> {
      const start = Date.now();
      try {
        const existing = requireProfile(profileId);
        if (!existing.ok) {
          audit('connection-profile:update', existing.error.code, { profileId }, start);
          return existing;
        }

        const updated = profileRepo.update(profileId, update);
        if (!updated) {
          const missing = profileNotFound(profileId);
          audit('connection-profile:update', missing.code, { profileId }, start);
          return err(missing);
        }

        audit(
          'connection-profile:update',
          'OK',
          {
            profileId,
            autoStart: updated.autoStart,
            autoRestart: updated.autoRestart,
          },
          start,
        );
        return ok(updated);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to update connection profile'));
      }
    },

    getCredentialStatus(profileId: string): Result<ConnectionCredentialStatus, AppError> {
      const start = Date.now();
      try {
        const existing = requireProfile(profileId);
        if (!existing.ok) {
          audit('credential:status', existing.error.code, { profileId }, start);
          return err(existing.error);
        }

        const status: ConnectionCredentialStatus = credentialStore.hasCredential(profileId)
          ? 'configured'
          : 'missing';
        audit('credential:status', 'OK', { profileId, status }, start);
        return ok(status);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to read credential status'));
      }
    },

    setCredential(profileId: string, credential: string): Result<void, AppError> {
      const start = Date.now();
      try {
        const existing = requireProfile(profileId);
        if (!existing.ok) {
          audit('credential:set', existing.error.code, { profileId }, start);
          return err(existing.error);
        }
        if (credential.length === 0) {
          audit('credential:set', 'VALIDATION_FAILED', { profileId }, start);
          return err(appError('VALIDATION_FAILED', 'Credential must not be empty'));
        }

        credentialStore.setCredential(profileId, credential);
        audit('credential:set', 'OK', { profileId, status: 'configured' }, start);
        return ok(undefined);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to store credential'));
      }
    },

    setupCredential(profileId: string): Result<CredentialSetupOutcome, AppError> {
      const start = Date.now();
      try {
        const existing = requireProfile(profileId);
        if (!existing.ok) {
          audit('credential:setup', existing.error.code, { profileId }, start);
          return err(existing.error);
        }
        if (!isManagedCredentialStore(credentialStore)) {
          audit('credential:setup', 'INTERNAL_ERROR', { profileId }, start);
          return err(appError('INTERNAL_ERROR', 'Runtime API Key setup is unavailable'));
        }

        const outcome = credentialStore.setupCredential(profileId);
        audit(
          'credential:setup',
          outcome === 'configured' ? 'OK' : 'CANCELLED',
          outcome === 'configured' ? { profileId, status: 'configured' } : { profileId },
          start,
        );
        return ok(outcome);
      } catch {
        audit('credential:setup', 'INTERNAL_ERROR', { profileId }, start);
        return err(appError('INTERNAL_ERROR', 'Runtime API Key setup failed'));
      }
    },

    deleteCredential(profileId: string): Result<void, AppError> {
      const start = Date.now();
      try {
        const existing = requireProfile(profileId);
        if (!existing.ok) {
          audit('credential:delete', existing.error.code, { profileId }, start);
          return err(existing.error);
        }

        credentialStore.deleteCredential(profileId);
        audit('credential:delete', 'OK', { profileId }, start);
        return ok(undefined);
      } catch {
        return err(appError('INTERNAL_ERROR', 'Failed to delete credential'));
      }
    },
  };
}
