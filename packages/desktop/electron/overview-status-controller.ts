import type { DesktopOverviewWorkStatusDto } from '@sud-d/contracts';
import {
  appError,
  ok,
  type AppError,
  type Result,
  type WorkResumeContext,
  type Workspace,
} from '@sud-d/domain';

interface OverviewWorkspaceReader {
  list(): readonly Workspace[];
}

interface OverviewGitStatus {
  readonly branch?: string;
  readonly detached: boolean;
  readonly clean: boolean;
  readonly entries: readonly unknown[];
  readonly truncated: boolean;
}

interface OverviewGitReader {
  status(workspaceCanonicalRoot: string, limit?: number): Result<OverviewGitStatus, AppError>;
}

interface OverviewWorkMemoryReader {
  loadCurrent(workspaceId: string): Result<Pick<WorkResumeContext, 'task' | 'updatedAt'> | undefined, AppError>;
}

export interface DesktopOverviewStatusDependencies {
  readonly workspaceReader: OverviewWorkspaceReader;
  readonly gitReader: OverviewGitReader;
  readonly workMemoryReader: OverviewWorkMemoryReader;
}

export interface DesktopOverviewStatusController {
  workStatus(): Result<DesktopOverviewWorkStatusDto, AppError>;
}

export function createDesktopOverviewStatusController(
  dependencies: DesktopOverviewStatusDependencies,
): DesktopOverviewStatusController {
  return Object.freeze({
    workStatus(): Result<DesktopOverviewWorkStatusDto, AppError> {
      try {
        const workspace = dependencies.workspaceReader.list().find((candidate) => candidate.isActive);
        if (!workspace) {
          return ok({
            git: { availability: 'unavailable' },
            checkpoint: { availability: 'none' },
          });
        }

        const gitStatus = dependencies.gitReader.status(workspace.canonicalRoot, 500);
        const checkpoint = dependencies.workMemoryReader.loadCurrent(workspace.id);

        return ok({
          workspaceId: workspace.id,
          git: gitStatus.ok
            ? {
                availability: 'available',
                ...(gitStatus.value.branch ? { branch: gitStatus.value.branch } : {}),
                detached: gitStatus.value.detached,
                clean: gitStatus.value.clean,
                changedFiles: gitStatus.value.entries.length,
                truncated: gitStatus.value.truncated,
              }
            : { availability: 'unavailable' },
          checkpoint: checkpoint.ok
            ? checkpoint.value
              ? {
                  availability: 'available',
                  taskStatus: checkpoint.value.task.status,
                  updatedAt: checkpoint.value.updatedAt,
                }
              : { availability: 'none' }
            : { availability: 'unavailable' },
        });
      } catch {
        return {
          ok: false,
          error: appError('INTERNAL_ERROR', 'Overview work status is unavailable'),
        };
      }
    },
  });
}
