import type {
  ConnectionRuntimeEvent,
  ConnectionSessionContext,
  RuntimeReadiness,
} from '@sud-d/domain';

export type { ConnectionRuntimeEvent, RuntimeReadiness } from '@sud-d/domain';

export interface ConnectionRuntimePort {
  start(context: ConnectionSessionContext): RuntimeReadiness;
  stop(): void;
  subscribe(listener: (event: ConnectionRuntimeEvent) => void): () => void;
}
