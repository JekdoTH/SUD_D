import type { Effect, Sensitivity, PolicyDecision } from './types.js';

// ---------------------------------------------------------------------------
// Baseline policy service (pure domain logic — no adapters)
// ---------------------------------------------------------------------------

export type PolicyContext =
  | 'workspace'
  | 'outside_workspace'
  | 'internal_root'
  | 'network'
  | 'github_network';

export interface PolicyRequest {
  readonly effect: Effect;
  readonly sensitivity: Sensitivity;
  readonly context: PolicyContext;
}

/**
 * Returns a PolicyDecision based on the baseline policy table.
 * No unrestricted/full-access mode exists.
 */
export function evaluatePolicy(req: PolicyRequest): PolicyDecision {
  // InternalRoot is always denied before workspace containment
  if (req.context === 'internal_root') {
    return { decision: 'deny', reason: 'Path is under an InternalRoot' };
  }

  // Outside workspace always denied
  if (req.context === 'outside_workspace') {
    return { decision: 'deny', reason: 'Path is outside any registered Workspace' };
  }

  // Generic network remains denied.
  if (req.context === 'network') {
    return { decision: 'deny', reason: 'Network access is not permitted' };
  }

  // Reviewed fixed-purpose GitHub network operations require Approval.
  if (req.context === 'github_network') {
    return { decision: 'ask', reason: 'Reviewed GitHub network operation requires Approval' };
  }

  // Delete always ask regardless of sensitivity
  if (req.effect === 'delete') {
    return { decision: 'ask', reason: 'Delete requires explicit approval' };
  }

  // Credential: read/create/modify → ask
  if (
    req.sensitivity === 'credential' &&
    (req.effect === 'read' || req.effect === 'create' || req.effect === 'modify')
  ) {
    return { decision: 'ask', reason: 'Credential resource requires explicit approval' };
  }

  // Execute → ask (capability conceptually absent but policy still expressed)
  if (req.effect === 'execute') {
    return { decision: 'ask', reason: 'Process execution requires explicit approval' };
  }

  // Normal workspace read/search/create/modify → allow
  return { decision: 'allow', reason: 'Permitted by baseline policy' };
}
