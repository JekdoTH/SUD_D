import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { createConnectionShutdown } from '../../desktop/electron/connection-shutdown.js';

describe('Phase 1 — Desktop connection shutdown', () => {
  it('wires normal quit and Restart & Update through the same orderly shutdown path', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/electron/main.ts'),
      'utf8',
    );

    expect(source).toContain('const connectionShutdown = createConnectionShutdown({');
    expect(source).toContain('orderlyShutdown,');
    expect(source).toContain('terminateAfterFailedInstall: () => app.exit(1),');
    expect(source).toContain("app.on('before-quit', (event) => {");
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('void orderlyShutdown()');
  });

  it('shuts Connection down before Git/DB cleanup and shares duplicate requests', async () => {
    const order: string[] = [];
    let resolveGit: (() => void) | undefined;
    const gitGate = new Promise<void>((resolve) => {
      resolveGit = resolve;
    });

    const connectionService = {
      shutdown: vi.fn(() => {
        order.push('connection');
        return { ok: true as const, value: null };
      }),
    };
    const disposeGit = vi.fn(async () => {
      order.push('git');
      await gitGate;
    });
    const closeDatabase = vi.fn(() => {
      order.push('db');
    });
    const shutdown = createConnectionShutdown({
      connectionService,
      disposeGit,
      closeDatabase,
    });

    const first = shutdown.shutdown();
    const second = shutdown.shutdown();

    expect(connectionService.shutdown).toHaveBeenCalledTimes(1);
    expect(disposeGit).toHaveBeenCalledTimes(1);
    expect(closeDatabase).not.toHaveBeenCalled();
    expect(order).toEqual(['connection', 'git']);

    resolveGit?.();
    await Promise.all([first, second]);

    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['connection', 'git', 'db']);

    await shutdown.shutdown();
    expect(connectionService.shutdown).toHaveBeenCalledTimes(1);
    expect(disposeGit).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('fails closed before Git/DB cleanup when Connection shutdown is unsafe, then permits cleanup retry', async () => {
    let safe = false;
    const connectionService = {
      shutdown: vi.fn(() =>
        safe
          ? { ok: true as const, value: null }
          : {
              ok: false as const,
              error: {
                code: 'CONNECTION_RUNTIME_STOP_FAILED' as const,
                message: 'Connection runtime failed to stop',
              },
            },
      ),
    };
    const disposeGit = vi.fn(async () => undefined);
    const closeDatabase = vi.fn();
    const shutdown = createConnectionShutdown({
      connectionService,
      disposeGit,
      closeDatabase,
    });

    await expect(shutdown.shutdown()).rejects.toThrow('CONNECTION_SHUTDOWN_FAILED');
    expect(disposeGit).not.toHaveBeenCalled();
    expect(closeDatabase).not.toHaveBeenCalled();

    safe = true;
    await expect(shutdown.shutdown()).resolves.toBeUndefined();

    expect(connectionService.shutdown).toHaveBeenCalledTimes(2);
    expect(disposeGit).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it('keeps the database open when Git cleanup fails and retries the incomplete cleanup', async () => {
    const connectionService = {
      shutdown: vi.fn(() => ({ ok: true as const, value: null })),
    };
    let failGit = true;
    const disposeGit = vi.fn(async () => {
      if (failGit) throw new Error('synthetic git cleanup failure');
    });
    const closeDatabase = vi.fn();
    const shutdown = createConnectionShutdown({
      connectionService,
      disposeGit,
      closeDatabase,
    });

    await expect(shutdown.shutdown()).rejects.toThrow('synthetic git cleanup failure');
    expect(closeDatabase).not.toHaveBeenCalled();

    failGit = false;
    await expect(shutdown.shutdown()).resolves.toBeUndefined();

    expect(connectionService.shutdown).toHaveBeenCalledTimes(2);
    expect(disposeGit).toHaveBeenCalledTimes(2);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});
