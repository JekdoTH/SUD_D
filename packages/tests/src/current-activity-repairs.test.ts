import { describe, expect, it } from 'vitest';

import type { AuditEvent } from '@sud-d/domain';
import { ok } from '@sud-d/domain';
import { createDesktopDiagnosticsController } from '../../desktop/electron/diagnostics-controller.js';
import { createDesktopOverviewStatusController } from '../../desktop/electron/overview-status-controller.js';
import { presentCurrentActivityStatus } from '../../desktop/src/current-activity-ui-model.js';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000501';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000000502';

describe('Current activity repair regressions', () => {
  it.each([
    {
      name: 'generic pending action with no checkpoint',
      checkpointState: 'none' as const,
      pendingTeamStart: false,
      expectedState: 'Awaiting approval',
    },
    {
      name: 'generic pending action with completed checkpoint',
      checkpointState: 'completed' as const,
      pendingTeamStart: false,
      expectedState: 'Awaiting approval',
    },
    {
      name: 'pending Team start',
      checkpointState: 'in_progress' as const,
      pendingTeamStart: true,
      expectedState: 'Awaiting approval',
    },
  ])('keeps $name in Normal Mode while surfacing the pending Approval', ({ checkpointState, pendingTeamStart, expectedState }) => {
    const presentation = presentCurrentActivityStatus({
      hasActiveWorkspace: true,
      workStatusAvailable: true,
      workStatusChecking: false,
      teamStatusAvailable: true,
      teamState: null,
      pendingApprovalCount: 1,
      pendingTeamStart,
      checkpointState,
    });

    expect(presentation.modeLabel).toBe('Normal Mode');
    expect(presentation.stateLabel).toBe(expectedState);
  });

  it('keeps an existing Team mission in Team Mode when an unrelated Approval is pending', () => {
    const presentation = presentCurrentActivityStatus({
      hasActiveWorkspace: true,
      workStatusAvailable: true,
      workStatusChecking: false,
      teamStatusAvailable: true,
      teamState: 'implementing',
      pendingApprovalCount: 1,
      pendingTeamStart: false,
      checkpointState: 'completed',
    });

    expect(presentation.modeLabel).toBe('Team Mode');
    expect(presentation.stateLabel).toBe('Awaiting approval');
  });

  it('uses the existing safe Activity filter/presentation for the latest same-Workspace observation', () => {
    const event = (overrides: Partial<AuditEvent>): AuditEvent => ({
      id: '00000000-0000-4000-8000-000000000601',
      timestamp: new Date('2026-10-05T09:30:00.000Z'),
      sessionId: 'current-activity-repair',
      sessionType: 'mcp-stdio',
      action: 'tool_kernel.invoke',
      workspaceId: WORKSPACE_ID,
      resultCode: 'EXECUTED',
      durationMs: 1,
      metadata: {},
      ...overrides,
    });

    const events: AuditEvent[] = [
      event({
        id: '00000000-0000-4000-8000-000000000610',
        timestamp: new Date('2026-10-05T09:35:00.000Z'),
        workspaceId: FOREIGN_WORKSPACE_ID,
        action: 'restricted_verify.run',
        resultCode: 'VERIFY_PASSED',
        metadata: { action: 'build', passed: true },
      }),
      event({
        id: '00000000-0000-4000-8000-000000000611',
        timestamp: new Date('2026-10-05T09:34:00.000Z'),
        metadata: { capability: 'team.status', phase: 'outcome', outcome: 'executed' },
      }),
      event({
        id: '00000000-0000-4000-8000-000000000612',
        timestamp: new Date('2026-10-05T09:33:00.000Z'),
        resultCode: 'EXECUTION_AUTHORIZED',
        metadata: { capability: 'work.resume', phase: 'pre_execution', outcome: 'authorized' },
      }),
      event({
        id: '00000000-0000-4000-8000-000000000613',
        timestamp: new Date('2026-10-05T09:32:00.000Z'),
        resultCode: 'EXECUTION_AUTHORIZED',
        metadata: { capability: 'code.insert_before', phase: 'pre_execution', outcome: 'authorized' },
      }),
      event({
        id: '00000000-0000-4000-8000-000000000614',
        timestamp: new Date('2026-10-05T09:31:00.000Z'),
        action: 'restricted_verify.run',
        resultCode: 'VERIFY_PASSED',
        metadata: { action: 'test', passed: true, rawOutput: 'RAW_VERIFY_OUTPUT_SENTINEL' },
      }),
    ];

    const diagnostics = createDesktopDiagnosticsController({
      dataDirectoryWritable: () => true,
      sqliteHealthy: () => true,
      listWorkspaces: () => [],
      workspaceRootStatus: () => ({ rootExists: true, rootIsDirectory: true }),
      listProfiles: () => [],
      hasCredential: () => false,
      mcpGatewayAvailable: () => true,
      tunnelClientAvailable: () => true,
      connectionStatus: () => ({ state: 'stopped', session: null, error: null }),
      tunnelRuntimeStatus: () => ({ state: 'stopped' }),
      listAuditEvents: () => events,
    });

    const overview = createDesktopOverviewStatusController({
      workspaceReader: {
        list: () => [{
          id: WORKSPACE_ID,
          displayName: 'Repair',
          canonicalRoot: 'C:\\workspace',
          isActive: true,
          createdAt: new Date('2026-10-05T08:00:00.000Z'),
          updatedAt: new Date('2026-10-05T08:00:00.000Z'),
        }],
      },
      gitReader: {
        status: () => ok({
          branch: 'master',
          detached: false,
          clean: true,
          entries: [],
          truncated: false,
        }),
      },
      workMemoryReader: { loadCurrent: () => ok(undefined) },
      teamReader: { status: () => ok(null) },
      approvalReader: { list: () => ok([]) },
      activityReader: {
        listForWorkspace: (workspaceId: string, limit: number) => diagnostics.listActivityForWorkspace(workspaceId, limit),
      },
    } as never);

    const result = overview.workStatus();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.latestActivity).toEqual({
      availability: 'available',
      operationSummary: 'Project test passed',
      resultSummary: 'VERIFY_PASSED',
      observedAt: '2026-10-05T09:31:00.000Z',
    });
    expect(JSON.stringify(result.value.latestActivity)).not.toMatch(/RAW_VERIFY_OUTPUT_SENTINEL|rawOutput|team\.status|work\.resume|code\.insert_before|FOREIGN/i);
  });
});
