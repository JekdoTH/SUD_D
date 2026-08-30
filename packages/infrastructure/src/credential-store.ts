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
