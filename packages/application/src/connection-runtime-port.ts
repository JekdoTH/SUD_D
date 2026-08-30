import type { ConnectionSessionContext } from '@sud-d/domain';

export interface RuntimeReadiness {
  readonly tunnelReady: boolean;
  readonly clientConnected: boolean;
}

export interface ConnectionRuntimePort {
  start(context: ConnectionSessionContext): RuntimeReadiness;
  stop(): void;
}
