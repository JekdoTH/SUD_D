export interface ConnectionShutdownDependencies {
  /** F2-B3 optional Runner-only stop port; NOT wired without trusted native handles.
   * On a live Runner this MUST finish before Connection/Git/SQLite teardown. */
  readonly runnerLifecycle?: {
    shutdown(): Promise<boolean>;
    shutdownEvidence?(): { readonly disposition:'not-started'|'owned-process-stopped'|'cleanup-unconfirmed';readonly osStopProven:boolean };
  };
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
    if (dependencies.runnerLifecycle) {
      const stopped = await dependencies.runnerLifecycle.shutdown();
      if (stopped !== true) throw new Error('RUNNER_SHUTDOWN_UNCONFIRMED');
      const evidence = dependencies.runnerLifecycle.shutdownEvidence?.();
      if(!evidence || (evidence.disposition !== 'not-started'
        && (evidence.disposition !== 'owned-process-stopped'||evidence.osStopProven!==true)))
        throw new Error('RUNNER_OS_CLEANUP_UNCONFIRMED');
      // A live owner must never be treated as stopped solely because it
      // returned a boolean; the application-owned source must supply OS proof.
    }
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
