import {
  type AuditEvent,
  type ToolKernelResult,
  type Workspace,
} from '@sud-d/domain';
import type { WorkspaceRepository } from '@sud-d/infrastructure';
import type { ToolKernel, ToolKernelAuditPort } from './tool-kernel.js';
import type { WorkMemoryService } from './work-memory-service.js';

const RESUME_GUARDED_CAPABILITIES = new Set<string>([
  'workspace.list',
  'workspace.stat',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.create_text_file',
  'workspace.write_text_file',
  'git.detect',
  'git.status',
  'git.diff',
  'git.checkpoint',
  'team.start',
  'team.status',
  'team.submit',
  'team.stop',
  'code.overview',
  'code.find_symbol',
  'code.find_references',
  'code.search',
  'code.diagnostics',
  'code.replace_symbol',
  'code.insert_before',
  'code.insert_after',
  'code.rename',
  'verify.run',
  'work.checkpoint',
]);

export interface WorkResumeGuardDependencies {
  readonly kernel: ToolKernel;
  readonly workspaceRepo: WorkspaceRepository;
  readonly workMemory: WorkMemoryService;
  readonly audit: ToolKernelAuditPort;
}

export function createWorkResumeGuardedToolKernel(
  dependencies: WorkResumeGuardDependencies,
): ToolKernel {
  const guarded: ToolKernel = {
    async invoke(request) {
      if (!RESUME_GUARDED_CAPABILITIES.has(request.capability)) {
        return dependencies.kernel.invoke(request);
      }
      const workspace = getActiveWorkspace(dependencies.workspaceRepo);
      if (!workspace) {
        return dependencies.kernel.invoke(request);
      }
      const resumed = dependencies.workMemory.requireResumed(request.session, workspace.id);
      if (resumed.ok) {
        return dependencies.kernel.invoke(request);
      }
      const startedAt = Date.now();
      const event: Omit<AuditEvent, 'id'> = {
        timestamp: new Date(),
        sessionId: request.session.id,
        sessionType: request.session.type,
        action: 'tool_kernel.invoke',
        workspaceId: workspace.id,
        resultCode: 'WORK_RESUME_REQUIRED',
        durationMs: Math.max(0, Date.now() - startedAt),
        metadata: {
          invocationId: request.invocationId,
          capability: request.capability,
          phase: 'outcome',
          outcome: 'blocked',
        },
      };
      try {
        await dependencies.audit.append(event);
      } catch {
        return {
          ok: false,
          outcome: 'blocked',
          code: 'AUDIT_PRECONDITION_FAILED',
        };
      }
      return workResumeRequired();
    },
  };
  return Object.freeze(guarded);
}

function getActiveWorkspace(workspaceRepo: WorkspaceRepository): Workspace | undefined {
  try {
    const active = workspaceRepo.list().filter((workspace) => workspace.isActive);
    return active.length === 1 ? active[0] : undefined;
  } catch {
    return undefined;
  }
}

function workResumeRequired(): ToolKernelResult {
  return {
    ok: false,
    outcome: 'blocked',
    code: 'WORK_RESUME_REQUIRED',
    causeCode: 'WORK_RESUME_REQUIRED',
    message: 'Work resume is required for the active Workspace',
  };
}
