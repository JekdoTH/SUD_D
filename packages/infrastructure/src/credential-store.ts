export interface CredentialStore {
  hasCredential(profileId: string): boolean;
  setCredential(profileId: string, credential: string): void;
  deleteCredential(profileId: string): void;
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
