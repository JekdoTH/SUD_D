import {
  appError,
  err,
  ok,
  type AppError,
  type ProjectRunnerStartRequest,
  type Result,
} from '@sud-d/domain';
import { defineToolCapability, type RegisteredToolCapability } from './tool-kernel.js';
import type { ProjectRunnerService } from './project-runner-service.js';

const RUNNER_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateDiscover(input: unknown): Result<Record<string, never>, AppError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.keys(input).length !== 0) {
    return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
  }
  return ok({});
}

function validateStart(input: unknown): Result<ProjectRunnerStartRequest, AppError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
  }
  const object = input as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.length !== 3 || !keys.every((key) => key === 'runnerId' || key === 'input' || key === 'attemptId')) {
    return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
  }
  if (
    typeof object.runnerId !== 'string'
    || !RUNNER_ID_RE.test(object.runnerId)
    || typeof object.attemptId !== 'string'
    || !UUID_RE.test(object.attemptId)
  ) {
    return err(appError('RUNNER_INPUT_INVALID', 'Restricted Project Runner input is invalid'));
  }
  return ok({
    runnerId: object.runnerId,
    input: object.input,
    attemptId: object.attemptId,
  });
}

export interface ProjectRunnerCapabilityDependencies {
  readonly service: ProjectRunnerService;
}

export function createProjectRunnerCapabilities(
  dependencies: ProjectRunnerCapabilityDependencies,
): readonly RegisteredToolCapability[] {
  return Object.freeze([
    defineToolCapability<Record<string, never>, unknown>({
      name: 'runner.discover',
      effect: 'read',
      validate: validateDiscover,
      resolveSecurity: () => dependencies.service.resolveSecurity(),
      execute: () => dependencies.service.discover(),
    }),
    defineToolCapability<ProjectRunnerStartRequest, unknown>({
      name: 'runner.start',
      effect: 'execute',
      validate: validateStart,
      resolveSecurity: () => dependencies.service.resolveSecurity(),
      approval: {
        describe(input) {
          const reviewed = dependencies.service.reviewStart(input);
          if (!reviewed.ok) return reviewed;
          return ok({
            title: 'Run restricted project runner',
            resourceLabel: `Runner ${reviewed.value.runnerId}`,
          });
        },
        bind(input) {
          const reviewed = dependencies.service.reviewStart(input);
          if (!reviewed.ok) return reviewed;
          return ok({
            workspaceId: reviewed.value.workspaceId,
            runnerId: reviewed.value.runnerId,
            attemptId: reviewed.value.attemptId,
            executionFingerprint: reviewed.value.executionFingerprint,
            inputDigest: reviewed.value.inputDigest,
            runtimeProfile: reviewed.value.runtimeIdentity.profile,
            sandboxProfile: reviewed.value.resourcePolicy.sandboxProfile,
            outputProfile: reviewed.value.resourcePolicy.outputProfile,
            resourcePolicyIdentity: reviewed.value.resourcePolicyIdentity,
          });
        },
      },
      async execute(input, context) {
        if (context.approvalDecision !== 'approved' || !context.approvalRequestId) {
          return err(appError('RUNNER_APPROVAL_STALE', 'Restricted Project Runner approval is stale'));
        }
        return dependencies.service.startApproved(input);
      },
    }),
  ]);
}
