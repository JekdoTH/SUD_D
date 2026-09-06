import { appError, err, ok, type AppError, type Result } from '@sud-d/domain';
import type { TeamRepository } from '@sud-d/infrastructure';

export interface TeamLegacyReconcilerDependencies {
  readonly teamRepo: TeamRepository;
}

export interface TeamLegacyReconciler {
  reconcile(): Result<void, AppError>;
}

export function createTeamLegacyReconciler(
  dependencies: TeamLegacyReconcilerDependencies,
): TeamLegacyReconciler {
  return Object.freeze({
    reconcile() {
      const pending = dependencies.teamRepo.hasPendingLegacyReconciliation();
      if (!pending.ok) return pending;
      return pending.value
        ? err(appError('INTERNAL_ERROR', 'Legacy Team reconciliation is incomplete'))
        : ok(undefined);
    },
  });
}
