export interface ConnectionShutdownDependencies {
  readonly connectionService: {
    shutdown(): { readonly ok: boolean };
  };
  readonly disposeGit: () => Promise<void>;
  readonly closeDatabase: () => void;
}

export interface ConnectionShutdown {
  shutdown(): Promise<void>;
}

export function createConnectionShutdown(
  dependencies: ConnectionShutdownDependencies,
): ConnectionShutdown {
  let completed = false;
  let inFlight: Promise<void> | null = null;

  const run = async (): Promise<void> => {
    const connection = dependencies.connectionService.shutdown();
    if (!connection.ok) {
      throw new Error('CONNECTION_SHUTDOWN_FAILED');
    }

    await dependencies.disposeGit();
    dependencies.closeDatabase();
    completed = true;
  };

  return {
    shutdown(): Promise<void> {
      if (completed) return Promise.resolve();
      if (inFlight) return inFlight;

      const operation = run().finally(() => {
        if (!completed) inFlight = null;
      });
      inFlight = operation;
      return operation;
    },
  };
}
