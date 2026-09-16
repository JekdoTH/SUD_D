import { describe, expect, it } from 'vitest';

import {
  createToolCapabilityRegistry,
  createToolKernel,
  defineToolCapability,
  type ToolKernelAuditPort,
} from '@sud-d/application';
import {
  appError,
  err,
  ok,
  type AuditEvent,
} from '@sud-d/domain';
import { createDesktopDiagnosticsController } from '../../desktop/electron/diagnostics-controller.js';

const SECRET = 'raw_git_failure_secret_must_not_leak_9182';

class RecordingAudit implements ToolKernelAuditPort {
  readonly events: Array<Omit<AuditEvent, 'id'>> = [];

  append(event: Omit<AuditEvent, 'id'>): void {
    this.events.push(event);
  }
}

function registryOrThrow(definition: ReturnType<typeof defineToolCapability>) {
  const registry = createToolCapabilityRegistry([definition]);
  if (!registry.ok) throw new Error('registry setup failed');
  return registry.value;
}

describe('Git execution failure diagnostics', () => {
  it('audits the typed executor cause code without raw error leakage', async () => {
    const audit = new RecordingAudit();
    const capability = defineToolCapability({
      name: 'test.git_failure',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({ sensitivity: 'normal' as const, context: 'workspace' as const, workspaceId: 'workspace-1' }),
      execute: () => err(appError('GIT_STATUS_STALE', `raw failure ${SECRET}`)),
    });
    const kernel = createToolKernel({ registry: registryOrThrow(capability), audit });

    const result = await kernel.invoke({
      invocationId: 'git-diagnostic-failure',
      session: { id: 'desktop-git', type: 'desktop' },
      capability: 'test.git_failure',
      input: {},
    });

    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'GIT_STATUS_STALE' });
    expect(audit.events).toHaveLength(2);
    expect(audit.events[1]).toMatchObject({
      resultCode: 'EXECUTION_FAILED',
      metadata: {
        capability: 'test.git_failure',
        phase: 'outcome',
        outcome: 'executed',
        causeCode: 'GIT_STATUS_STALE',
      },
    });
    expect(JSON.stringify(audit.events)).not.toContain(SECRET);
  });

  it('projects only a safe typed cause code into Activity details', () => {
    const event: AuditEvent = {
      id: 'audit-git-failure',
      timestamp: new Date('2026-09-17T00:46:28.000Z'),
      sessionId: 'desktop-git',
      sessionType: 'desktop',
      action: 'tool_kernel.invoke',
      workspaceId: 'workspace-1',
      policyDecision: 'ask',
      resultCode: 'EXECUTION_FAILED',
      durationMs: 4,
      metadata: {
        capability: 'git.sync',
        phase: 'outcome',
        outcome: 'executed',
        causeCode: 'GIT_STATUS_STALE',
        raw: SECRET,
      },
    };
    const controller = createDesktopDiagnosticsController({
      dataDirectoryWritable: () => true,
      sqliteHealthy: () => true,
      listWorkspaces: () => [],
      workspaceRootStatus: () => ({ rootExists: true, rootIsDirectory: true }),
      listProfiles: () => [],
      hasCredential: () => false,
      mcpGatewayAvailable: () => true,
      tunnelClientAvailable: () => true,
      connectionStatus: () => ({ state: 'stopped' }),
      tunnelRuntimeStatus: () => ({ state: 'stopped' }),
      listAuditEvents: () => [event],
    });

    const result = controller.listActivity({ limit: 10 });

    expect(result).toMatchObject({
      ok: true,
      value: [{ resultCode: 'EXECUTION_FAILED', details: [{ label: 'Cause', value: 'GIT_STATUS_STALE' }] }],
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });
});
