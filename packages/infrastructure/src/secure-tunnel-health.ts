import fs from 'node:fs';

export interface TunnelHealthWatch {
  stop(): void;
}

export interface TunnelHealthProbeInput {
  readonly healthUrlFile: string;
  readonly pid: number;
  readonly onReady: () => void;
  readonly onFailure: () => void;
}

export interface TunnelHealthProbe {
  watch(input: TunnelHealthProbeInput): TunnelHealthWatch;
}

export interface LoopbackTunnelHealthProbeOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly requestTimeoutMs?: number;
}

function safeLoopbackBaseUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export function createLoopbackTunnelHealthProbe(
  options: LoopbackTunnelHealthProbeOptions = {},
): TunnelHealthProbe {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const requestTimeoutMs = options.requestTimeoutMs ?? 1_000;

  return {
    watch(input: TunnelHealthProbeInput): TunnelHealthWatch {
      let stopped = false;
      let timer: NodeJS.Timeout | undefined;
      const deadline = Date.now() + timeoutMs;

      const finish = (callback: () => void): void => {
        if (stopped) return;
        stopped = true;
        if (timer) clearTimeout(timer);
        callback();
      };

      const schedule = (): void => {
        if (stopped) return;
        timer = setTimeout(() => void probe(), pollIntervalMs);
      };

      const probe = async (): Promise<void> => {
        if (stopped) return;
        if (Date.now() >= deadline) {
          finish(input.onFailure);
          return;
        }

        try {
          if (!fs.existsSync(input.healthUrlFile)) {
            schedule();
            return;
          }
          const raw = fs.readFileSync(input.healthUrlFile, 'utf8');
          const baseUrl = safeLoopbackBaseUrl(raw);
          if (!baseUrl) {
            finish(input.onFailure);
            return;
          }
          const readyUrl = new URL('/readyz', baseUrl);
          const response = await fetch(readyUrl, {
            signal: AbortSignal.timeout(requestTimeoutMs),
          });
          const body = await response.text();
          if (response.ok && body.trim().toLowerCase() === 'ready') {
            finish(input.onReady);
            return;
          }
        } catch {
          // Startup races and transient loopback failures are retried until the fixed timeout.
        }

        schedule();
      };

      void probe();

      return {
        stop(): void {
          stopped = true;
          if (timer) clearTimeout(timer);
        },
      };
    },
  };
}
