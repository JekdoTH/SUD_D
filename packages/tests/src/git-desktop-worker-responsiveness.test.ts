import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

import {
  createDesktopGitWorkerController,
  resolveDesktopGitWorkerEntry,
} from '../../desktop/electron/git-worker-controller.js';

describe('Desktop Git worker responsiveness', () => {
  it('resolves the fixed worker entry beside the bundled main module', () => {
    expect(resolveDesktopGitWorkerEntry('file:///D:/Apps/SUD-D/dist-electron/main.js')).toBe(
      'D:\\Apps\\SUD-D\\dist-electron\\git-worker.js',
    );
  });

  it('keeps the main event loop responsive while a fixed Git operation is running in the worker', async () => {
    const workerScript = `
      const { parentPort } = require('node:worker_threads');
      parentPort.on('message', ({ id }) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < 120) {}
        parentPort.postMessage({
          id,
          result: { ok: false, error: { code: 'TEST_DONE', message: 'done' } },
        });
      });
    `;
    const controller = createDesktopGitWorkerController(new Worker(workerScript, { eval: true }));

    let responseResolved = false;
    const pending = controller.snapshot().then((result) => {
      responseResolved = true;
      return result;
    });
    let timerFired = false;
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve();
      }, 15);
    });

    expect(timerFired).toBe(true);
    expect(responseResolved).toBe(false);
    await expect(pending).resolves.toEqual({
      ok: false,
      error: { code: 'TEST_DONE', message: 'done' },
    });
    await controller.dispose();
  });
});
