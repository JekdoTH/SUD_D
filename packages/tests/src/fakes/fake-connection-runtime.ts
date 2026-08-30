import type {
  ConnectionRuntimeEvent,
  ConnectionRuntimePort,
  RuntimeReadiness,
} from '@sud-d/application';
import type { ConnectionSessionContext } from '@sud-d/domain';

export class FakeConnectionRuntime implements ConnectionRuntimePort {
  startCalls = 0;
  stopCalls = 0;
  readonly startContexts: ConnectionSessionContext[] = [];
  readiness: RuntimeReadiness = { tunnelReady: true, clientConnected: true };
  startError: Error | null = null;
  stopError: Error | null = null;
  onStart: (() => void) | null = null;
  private readonly listeners = new Set<(event: ConnectionRuntimeEvent) => void>();

  start(context: ConnectionSessionContext): RuntimeReadiness {
    this.startCalls += 1;
    this.startContexts.push(context);
    this.onStart?.();
    if (this.startError) throw this.startError;
    return this.readiness;
  }

  stop(): void {
    this.stopCalls += 1;
    if (this.stopError) throw this.stopError;
  }

  subscribe(listener: (event: ConnectionRuntimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: ConnectionRuntimeEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}
