import { describe, expect, it, vi } from 'vitest';

import {
  DesktopOverviewWorkStatusDtoSchema,
  IPC_CHANNELS,
} from '@sud-d/contracts';
import { ok } from '@sud-d/domain';
import { createDesktopOverviewStatusController } from '../../desktop/electron/overview-status-controller.js';
import { registerDesktopOverviewStatusIpcHandlers } from '../../desktop/electron/overview-status-ipc.js';

describe('Post-stabilization Overview trusted status seam', () => {
  it('returns only bounded active-workspace Git and checkpoint status', () => {
    const controller = createDesktopOverviewStatusController({
      workspaceReader: {
        list: () => [{
          id: '00000000-0000-4000-8000-000000000001',
          displayName: 'UI Closure',
          canonicalRoot: 'C:\\workspace',
          isActive: true,
          createdAt: new Date('2026-09-13T12:00:00.000Z'),
          updatedAt: new Date('2026-09-13T12:00:00.000Z'),
        }],
      },
      gitReader: {
        status: () => ok({
          branch: 'fix/post-stabilization-ui-closure',
          detached: false,
          clean: false,
          entries: [{ path: 'packages/desktop/src/pages/HomePage.tsx' }, { path: 'packages/desktop/src/index.css' }],
          truncated: false,
        }),
      },
      workMemoryReader: {
        loadCurrent: () => ok({
          task: { title: 'Close stabilization UI', status: 'in_progress' as const },
          updatedAt: '2026-09-13T15:00:00.000Z',
        }),
      },
    });

    const result = controller.workStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DesktopOverviewWorkStatusDtoSchema.parse(result.value)).toEqual(result.value);
    expect(result.value).toEqual({
      workspaceId: '00000000-0000-4000-8000-000000000001',
      git: {
        availability: 'available',
        branch: 'fix/post-stabilization-ui-closure',
        detached: false,
        clean: false,
        changedFiles: 2,
        truncated: false,
      },
      checkpoint: {
        availability: 'available',
        taskStatus: 'in_progress',
        updatedAt: '2026-09-13T15:00:00.000Z',
      },
    });
    expect(JSON.stringify(result.value)).not.toMatch(/headSha|statusId|diff|contents|stdout|stderr|argv|cwd|env|secret/i);
  });

  it('fails individual optional sources closed to unavailable without inventing state', () => {
    const controller = createDesktopOverviewStatusController({
      workspaceReader: {
        list: () => [{
          id: '00000000-0000-4000-8000-000000000002',
          displayName: 'UI Closure',
          canonicalRoot: 'C:\\workspace',
          isActive: true,
          createdAt: new Date('2026-09-13T12:00:00.000Z'),
          updatedAt: new Date('2026-09-13T12:00:00.000Z'),
        }],
      },
      gitReader: {
        status: () => ({ ok: false as const, error: { code: 'INTERNAL_ERROR', message: 'Git unavailable' } }),
      },
      workMemoryReader: {
        loadCurrent: () => ({ ok: false as const, error: { code: 'WORK_MEMORY_PERSISTENCE_FAILED', message: 'Unavailable' } }),
      },
    });

    expect(controller.workStatus()).toEqual({
      ok: true,
      value: {
        workspaceId: '00000000-0000-4000-8000-000000000002',
        git: { availability: 'unavailable' },
        checkpoint: { availability: 'unavailable' },
      },
    });
  });

  it('exposes a trusted zero-input IPC action and rejects renderer-shaped host authority', async () => {
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const workStatus = vi.fn(() => ({
      ok: true as const,
      value: {
        git: { availability: 'unavailable' as const },
        checkpoint: { availability: 'none' as const },
      },
    }));

    registerDesktopOverviewStatusIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { workStatus },
      (sender) => sender === 'trusted-renderer',
    );

    expect(IPC_CHANNELS.OVERVIEW_WORK_STATUS).toBe('overview:workStatus');
    const handler = handlers.get(IPC_CHANNELS.OVERVIEW_WORK_STATUS);
    expect(handler).toBeDefined();
    expect(await handler?.({ sender: 'untrusted-renderer' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(await handler?.({ sender: 'trusted-renderer' }, { cwd: 'C:\\', executable: 'cmd.exe' })).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(workStatus).not.toHaveBeenCalled();
    expect(await handler?.({ sender: 'trusted-renderer' })).toMatchObject({ ok: true });
    expect(workStatus).toHaveBeenCalledTimes(1);
  });
});
