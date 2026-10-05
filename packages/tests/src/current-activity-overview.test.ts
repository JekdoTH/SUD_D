import { describe, expect, it, vi } from 'vitest';

import { DesktopOverviewWorkStatusDtoSchema } from '@sud-d/contracts';
import { ok } from '@sud-d/domain';
import { createDesktopOverviewStatusController } from '../../desktop/electron/overview-status-controller.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000202';

function activeWorkspace(id = WORKSPACE_ID) {
  return {
    id,
    displayName: 'Current Activity',
    canonicalRoot: 'C:\\workspace',
    isActive: true,
    createdAt: new Date('2026-10-05T08:00:00.000Z'),
    updatedAt: new Date('2026-10-05T08:00:00.000Z'),
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    workspaceReader: { list: () => [activeWorkspace()] },
    gitReader: {
      status: () => ok({
        branch: 'master',
        detached: false,
        clean: true,
        entries: [],
        truncated: false,
      }),
    },
    workMemoryReader: {
      loadCurrent: () => ok({
        workspaceId: WORKSPACE_ID,
        goal: 'Ship Current activity',
        task: { title: 'Show Normal Mode', status: 'in_progress' as const },
        nextAction: 'Run focused verification',
        updatedAt: '2026-10-05T09:25:00.000Z',
      }),
    },
    teamReader: { status: () => ok(null) },
    approvalReader: { list: () => ok([]) },
    activityReader: {
      listForWorkspace: () => ok([{
        title: 'Project test passed',
        resultCode: 'VERIFY_PASSED',
        timestamp: '2026-10-05T09:27:00.000Z',
      }]),
    },
    ...overrides,
  };
}

describe('Current activity Overview projection', () => {
  it('projects bounded recorded Normal work without treating in_progress as live execution', () => {
    const controller = createDesktopOverviewStatusController(dependencies() as never);
    const result = controller.workStatus();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(DesktopOverviewWorkStatusDtoSchema.parse(result.value)).toEqual(result.value);
    expect(result.value).toMatchObject({
      workspaceId: WORKSPACE_ID,
      checkpoint: {
        availability: 'available',
        taskStatus: 'in_progress',
        goalSummary: 'Ship Current activity',
        taskSummary: 'Show Normal Mode',
        nextActionSummary: 'Run focused verification',
        updatedAt: '2026-10-05T09:25:00.000Z',
      },
      team: { availability: 'available', mission: null },
      approval: { availability: 'available', pendingCount: 0, pendingTeamStart: false },
      latestActivity: {
        availability: 'available',
        operationSummary: 'Project test passed',
        resultSummary: 'VERIFY_PASSED',
        observedAt: '2026-10-05T09:27:00.000Z',
      },
    });
    expect(JSON.stringify(result.value)).not.toMatch(/headSha|statusId|diff|contents|stdout|stderr|argv|cwd|env|bindingDigest|sessionId|secret/i);
  });

  it('keeps a pending Team start in Normal state until a mission actually exists', () => {
    const controller = createDesktopOverviewStatusController(dependencies({
      approvalReader: {
        list: () => ok([
          {
            workspaceId: WORKSPACE_ID,
            capability: 'team.start',
            createdAt: '2026-10-05T09:30:00.000Z',
          },
        ]),
      },
    }) as never);

    expect(controller.workStatus()).toMatchObject({
      ok: true,
      value: {
        workspaceId: WORKSPACE_ID,
        team: { availability: 'available', mission: null },
        approval: {
          availability: 'available',
          pendingCount: 1,
          pendingTeamStart: true,
          latestCreatedAt: '2026-10-05T09:30:00.000Z',
        },
      },
    });
  });

  it('projects active Team state and keeps unrelated pending approval distinct from the mission', () => {
    const controller = createDesktopOverviewStatusController(dependencies({
      teamReader: {
        status: () => ok({
          missionId: '00000000-0000-4000-8000-000000000303',
          workspaceId: WORKSPACE_ID,
          goalSummary: 'Implement Current activity',
          state: 'implementing' as const,
          currentRole: 'implementer' as const,
          nextAction: 'Task 3 validation handoff',
          taskCount: 5,
          currentTaskSequence: 3,
          updatedAt: '2026-10-05T09:35:00.000Z',
        }),
      },
      approvalReader: {
        list: () => ok([
          {
            workspaceId: WORKSPACE_ID,
            capability: 'git.commit',
            createdAt: '2026-10-05T09:36:00.000Z',
          },
        ]),
      },
    }) as never);

    expect(controller.workStatus()).toMatchObject({
      ok: true,
      value: {
        team: {
          availability: 'available',
          mission: {
            workspaceId: WORKSPACE_ID,
            state: 'implementing',
            currentRole: 'implementer',
            taskCount: 5,
            currentTaskSequence: 3,
            nextAction: 'Task 3 validation handoff',
          },
        },
        approval: {
          availability: 'available',
          pendingCount: 1,
          pendingTeamStart: false,
        },
      },
    });
  });

  it('keeps Team read failure explicit while Work Memory can fail independently', () => {
    const controller = createDesktopOverviewStatusController(dependencies({
      teamReader: {
        status: () => ({ ok: false as const, error: { code: 'INTERNAL_ERROR', message: 'Team unavailable' } }),
      },
      workMemoryReader: {
        loadCurrent: () => ({ ok: false as const, error: { code: 'WORK_MEMORY_PERSISTENCE_FAILED', message: 'Unavailable' } }),
      },
    }) as never);

    expect(controller.workStatus()).toMatchObject({
      ok: true,
      value: {
        workspaceId: WORKSPACE_ID,
        checkpoint: { availability: 'unavailable' },
        team: { availability: 'unavailable' },
        approval: { availability: 'available', pendingCount: 0, pendingTeamStart: false },
      },
    });
  });

  it('does not infer mode or touch workspace-scoped readers when no Workspace is selected', () => {
    const gitStatus = vi.fn();
    const loadCurrent = vi.fn();
    const teamStatus = vi.fn();
    const approvalList = vi.fn();
    const controller = createDesktopOverviewStatusController({
      workspaceReader: { list: () => [] },
      gitReader: { status: gitStatus },
      workMemoryReader: { loadCurrent },
      teamReader: { status: teamStatus },
      approvalReader: { list: approvalList },
      activityReader: { listForWorkspace: vi.fn() },
    } as never);

    expect(controller.workStatus()).toEqual({
      ok: true,
      value: {
        git: { availability: 'unavailable' },
        checkpoint: { availability: 'none' },
        team: { availability: 'unavailable' },
        approval: { availability: 'unavailable' },
        latestActivity: { availability: 'unavailable' },
      },
    });
    expect(gitStatus).not.toHaveBeenCalled();
    expect(loadCurrent).not.toHaveBeenCalled();
    expect(teamStatus).not.toHaveBeenCalled();
    expect(approvalList).not.toHaveBeenCalled();
  });

  it('rejects foreign Workspace state instead of projecting it into the selected Workspace', () => {
    const controller = createDesktopOverviewStatusController(dependencies({
      workMemoryReader: {
        loadCurrent: () => ok({
          workspaceId: FOREIGN_WORKSPACE_ID,
          goal: 'Foreign goal',
          task: { title: 'Foreign task', status: 'in_progress' as const },
          nextAction: 'Foreign next action',
          updatedAt: '2026-10-05T09:40:00.000Z',
        }),
      },
      teamReader: {
        status: () => ok({
          missionId: '00000000-0000-4000-8000-000000000404',
          workspaceId: FOREIGN_WORKSPACE_ID,
          goalSummary: 'Foreign Team mission',
          state: 'implementing' as const,
          currentRole: 'implementer' as const,
          nextAction: 'Foreign Team step',
          taskCount: 1,
          currentTaskSequence: 1,
          updatedAt: '2026-10-05T09:40:00.000Z',
        }),
      },
      approvalReader: {
        list: () => ok([
          {
            workspaceId: FOREIGN_WORKSPACE_ID,
            capability: 'team.start',
            createdAt: '2026-10-05T09:40:00.000Z',
          },
        ]),
      },
      activityReader: {
        listForWorkspace: () => ok([]),
      },
    }) as never);

    expect(controller.workStatus()).toMatchObject({
      ok: true,
      value: {
        workspaceId: WORKSPACE_ID,
        checkpoint: { availability: 'unavailable' },
        team: { availability: 'unavailable' },
        approval: { availability: 'available', pendingCount: 0, pendingTeamStart: false },
        latestActivity: { availability: 'none' },
      },
    });
    expect(JSON.stringify(controller.workStatus())).not.toContain('Foreign');
  });

  it.each(['blocked', 'completed'] as const)('preserves recorded %s checkpoint status without inventing broader completion', (taskStatus) => {
    const controller = createDesktopOverviewStatusController(dependencies({
      workMemoryReader: {
        loadCurrent: () => ok({
          workspaceId: WORKSPACE_ID,
          goal: 'Recorded goal',
          task: { title: 'Recorded task', status: taskStatus },
          nextAction: taskStatus === 'blocked' ? 'Resolve the blocker' : 'Wait for the next explicit task',
          updatedAt: '2026-10-05T09:45:00.000Z',
        }),
      },
    }) as never);

    expect(controller.workStatus()).toMatchObject({
      ok: true,
      value: {
        checkpoint: {
          availability: 'available',
          taskStatus,
          taskSummary: 'Recorded task',
        },
      },
    });
  });

  it('bounds projected recorded text before it reaches the renderer', () => {
    const longText = `  ${'A'.repeat(320)}   ${'B'.repeat(320)}  `;
    const controller = createDesktopOverviewStatusController(dependencies({
      workMemoryReader: {
        loadCurrent: () => ok({
          workspaceId: WORKSPACE_ID,
          goal: longText,
          task: { title: longText, status: 'pending' as const },
          nextAction: longText,
          updatedAt: '2026-10-05T09:50:00.000Z',
        }),
      },
    }) as never);

    const result = controller.workStatus();
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.checkpoint.availability !== 'available') return;
    expect(result.value.checkpoint.goalSummary.length).toBeLessThanOrEqual(240);
    expect(result.value.checkpoint.taskSummary.length).toBeLessThanOrEqual(240);
    expect(result.value.checkpoint.nextActionSummary.length).toBeLessThanOrEqual(240);
    expect(result.value.checkpoint.goalSummary).not.toMatch(/\s{2,}/u);
  });
});
