import { createWin32CredentialNativePort } from './windows-credential-manager.js';

export interface CredentialStore {
  hasCredential(profileId: string): boolean;
  setCredential(profileId: string, credential: string): void;
  deleteCredential(profileId: string): void;
}

export type CredentialSetupOutcome = 'configured' | 'cancelled';

export interface ManagedCredentialStore extends CredentialStore {
  prepareCredential(profileId: string): boolean;
  setupCredential(profileId: string): CredentialSetupOutcome;
}

export function isManagedCredentialStore(store: CredentialStore): store is ManagedCredentialStore {
  return 'prepareCredential' in store && 'setupCredential' in store;
}

export interface WindowsCredentialNativePort {
  hasStoredCredential(targetName: string): boolean;
  promptAndStoreCredential(targetName: string): CredentialSetupOutcome;
  deleteStoredCredential(targetName: string): void;
  materializeStoredCredential(
    targetName: string,
    environment: NodeJS.ProcessEnv,
    environmentName: string,
  ): boolean;
}

export function createInMemoryCredentialStore(): CredentialStore {
  const credentials = new Map<string, string>();

  return {
    hasCredential(profileId: string): boolean {
      return credentials.has(profileId);
    },

    setCredential(profileId: string, credential: string): void {
      credentials.set(profileId, credential);
    },

    deleteCredential(profileId: string): void {
      credentials.delete(profileId);
    },
  };
}


export function credentialEnvVarNameForProfile(profileId: string): string {
  const suffix = profileId.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
  return `SUD_D_CONTROL_PLANE_API_KEY_${suffix}`;
}

export function windowsCredentialTargetNameForProfile(profileId: string): string {
  return `SUD_D/OpenAISecureMcpTunnel/${profileId}`;
}

export function createTunnelEnvironmentCredentialStore(
  environment: NodeJS.ProcessEnv = process.env,
): CredentialStore {
  return {
    hasCredential(profileId: string): boolean {
      const value = environment[credentialEnvVarNameForProfile(profileId)];
      return typeof value === 'string' && value.length > 0;
    },

    setCredential(profileId: string, credential: string): void {
      environment[credentialEnvVarNameForProfile(profileId)] = credential;
    },

    deleteCredential(profileId: string): void {
      delete environment[credentialEnvVarNameForProfile(profileId)];
    },
  };
}

export function createWindowsCredentialStore(
  environment: NodeJS.ProcessEnv = process.env,
): ManagedCredentialStore {
  return createWindowsCredentialStoreWithDependencies(
    environment,
    createWin32CredentialNativePort(),
  );
}

export function createWindowsCredentialStoreWithDependencies(
  environment: NodeJS.ProcessEnv,
  nativePort: WindowsCredentialNativePort,
): ManagedCredentialStore {
  const hasValue = (name: string): boolean => {
    const value = environment[name];
    return typeof value === 'string' && value.length > 0;
  };

  return {
    hasCredential(profileId: string): boolean {
      const targetName = windowsCredentialTargetNameForProfile(profileId);
      if (nativePort.hasStoredCredential(targetName)) return true;
      if (hasValue(credentialEnvVarNameForProfile(profileId))) return true;
      return hasValue('CONTROL_PLANE_API_KEY');
    },

    setCredential(profileId: string, credential: string): void {
      environment[credentialEnvVarNameForProfile(profileId)] = credential;
    },

    deleteCredential(profileId: string): void {
      nativePort.deleteStoredCredential(windowsCredentialTargetNameForProfile(profileId));
      delete environment[credentialEnvVarNameForProfile(profileId)];
    },

    setupCredential(profileId: string): CredentialSetupOutcome {
      return nativePort.promptAndStoreCredential(windowsCredentialTargetNameForProfile(profileId));
    },

    prepareCredential(profileId: string): boolean {
      const targetName = windowsCredentialTargetNameForProfile(profileId);
      const derivedEnvironmentName = credentialEnvVarNameForProfile(profileId);
      if (nativePort.hasStoredCredential(targetName)) {
        return nativePort.materializeStoredCredential(
          targetName,
          environment,
          derivedEnvironmentName,
        );
      }
      if (hasValue(derivedEnvironmentName)) return true;
      const legacyCredential = environment.CONTROL_PLANE_API_KEY;
      if (typeof legacyCredential === 'string' && legacyCredential.length > 0) {
        environment[derivedEnvironmentName] = legacyCredential;
        return true;
      }
      return false;
    },
  };
}
