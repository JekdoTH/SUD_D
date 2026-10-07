import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createApprovalCoordinator,
  createProjectRunnerCapabilities,
  createProjectRunnerService,
  createToolCapabilityRegistry,
  createToolKernel,
  type ProjectRunnerRuntimePort,
} from '@sud-d/application';
import { ok, type Workspace } from '@sud-d/domain';
import {
  discoverProjectRunners,
  isProjectRunnerSnapshotFresh,
  prepareProjectRunnerSnapshot,
  verifyProjectRunnerSnapshot,
  type ApprovalRepository,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 20 });
  }
});

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-project-runner-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, '.sud-d'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'report.mjs'), 'process.exit(0);\n', 'utf8');
  return fs.realpathSync(root);
}

function runnerWorkspace(root: string): Workspace {
  return {
    id: 'ws-1',
    displayName: 'Runner Workspace',
    canonicalRoot: root,
    isActive: true,
    createdAt: new Date('2026-10-07T00:00:00.000Z'),
    updatedAt: new Date('2026-10-07T00:00:00.000Z'),
  };
}

function fakeWorkspaceRepo(initial: Workspace): WorkspaceRepository & { current: Workspace } {
  const repo: WorkspaceRepository & { current: Workspace } = {
    current: initial,
    list: () => [repo.current],
    findById: (id) => repo.current.id === id ? repo.current : undefined,
    findByCanonicalRoot: (root) => repo.current.canonicalRoot === root ? repo.current : undefined,
    save: () => repo.current,
    setActive: () => undefined,
    remove: () => undefined,
  };
  return repo;
}

function fakeApprovalRepository(): ApprovalRepository {
  return {
    findById: () => ok(undefined),
    findLatest: () => ok(undefined),
    createPending(request) {
      return ok({
        id: 'pending-runner-approval',
        runtimeInstanceId: request.runtimeInstanceId,
        bindingDigest: request.bindingDigest,
        sessionId: request.sessionId,
        sessionType: request.sessionType,
        capability: request.capability,
        effect: request.effect,
        sensitivity: request.sensitivity,
        policyContext: request.policyContext,
        ...(request.workspaceId ? { workspaceId: request.workspaceId } : {}),
        title: request.title,
        ...(request.resourceLabel ? { resourceLabel: request.resourceLabel } : {}),
        status: 'pending',
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
      });
    },
    recordModeApproval: () => {
      throw new Error('runner.start must never use mode approval');
    },
    countActive: () => ok(0),
    listPending: () => ok([]),
    respond: () => {
      throw new Error('not used');
    },
    consumeApproved: () => ok(undefined),
    expireStale: () => ok(0),
    expireOtherRuntimes: () => ok(0),
    cleanupTerminal: () => ok(0),
  };
}

function fakeRuntimeExecutable(stagingRoot: string): string {
  const runtime = path.join(stagingRoot, 'trusted-node.exe');
  fs.writeFileSync(runtime, 'SUD-D trusted runtime fixture\n', 'utf8');
  return runtime;
}

function writeReportRunnerManifest(root: string): void {
  fs.writeFileSync(path.join(root, '.sud-d', 'runners.json'), JSON.stringify({
    version: 1,
    runners: [{
      id: 'report',
      label: 'Create local report',
      runtime: 'node-offline-v1',
      entry: 'tools/report.mjs',
      snapshotPaths: ['tools'],
      inputSchema: {
        type: 'object',
        properties: { preset: { type: 'string', enum: ['short', 'full'] } },
        required: ['preset'],
        additionalProperties: false,
      },
      artifacts: [{ id: 'report', path: 'report.json', type: 'application/json', required: true }],
      limits: { timeoutMs: 30_000, maxArtifactBytes: 1_048_576 },
      networkProfile: 'none',
      secretProfile: 'none',
    }],
  }), 'utf8');
}

describe('Restricted Project Runner manifest discovery', () => {
  it('discovers only the fixed strict manifest and returns a deterministic definition digest', () => {
    const root = workspace();
    fs.writeFileSync(path.join(root, '.sud-d', 'runners.json'), JSON.stringify({
      version: 1,
      runners: [{
        id: 'report',
        label: 'Create local report',
        runtime: 'node-offline-v1',
        entry: 'tools/report.mjs',
        snapshotPaths: ['tools'],
        inputSchema: {
          type: 'object',
          properties: { preset: { type: 'string', enum: ['short', 'full'] } },
          required: ['preset'],
          additionalProperties: false,
        },
        artifacts: [{
          id: 'report',
          path: 'report.json',
          type: 'application/json',
          required: true,
        }],
        limits: { timeoutMs: 30_000, maxArtifactBytes: 1_048_576 },
        networkProfile: 'none',
        secretProfile: 'none',
      }],
    }), 'utf8');

    const result = discoverProjectRunners({
      workspaceCanonicalRoot: root,
      internalRoots: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([expect.objectContaining({
      id: 'report',
      label: 'Create local report',
      runtime: 'node-offline-v1',
      definitionDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      supported: true,
    })]);

    const again = discoverProjectRunners({
      workspaceCanonicalRoot: root,
      internalRoots: [],
    });
    expect(again).toEqual(result);
  });
});

describe('Restricted Project Runner manifest fail-closed rules', () => {
  it('rejects duplicate and unknown authority-bearing fields', () => {
    const root = workspace();
    const manifestPath = path.join(root, '.sud-d', 'runners.json');

    fs.writeFileSync(manifestPath, '{"version":1,"version":1,"runners":[]}', 'utf8');
    expect(discoverProjectRunners({ workspaceCanonicalRoot: root, internalRoots: [] }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_MANIFEST_INVALID' } });

    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      runners: [{
        id: 'report',
        label: 'Report',
        runtime: 'node-offline-v1',
        entry: 'tools/report.mjs',
        snapshotPaths: ['tools'],
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        artifacts: [],
        limits: { timeoutMs: 30_000, maxArtifactBytes: 1024 },
        networkProfile: 'none',
        secretProfile: 'none',
        executable: 'cmd.exe',
      }],
    }), 'utf8');
    expect(discoverProjectRunners({ workspaceCanonicalRoot: root, internalRoots: [] }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_MANIFEST_INVALID' } });
  });

  it('rejects traversal/authority paths and never discovers package scripts or a parent manifest', () => {
    const root = workspace();
    const manifestPath = path.join(root, '.sud-d', 'runners.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      version: 1,
      runners: [{
        id: 'escape',
        label: 'Escape',
        runtime: 'node-offline-v1',
        entry: '../outside.mjs',
        snapshotPaths: ['tools'],
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        artifacts: [],
        limits: { timeoutMs: 30_000, maxArtifactBytes: 1024 },
        networkProfile: 'none',
        secretProfile: 'none',
      }],
    }), 'utf8');
    expect(discoverProjectRunners({ workspaceCanonicalRoot: root, internalRoots: [] }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_MANIFEST_INVALID' } });

    fs.rmSync(manifestPath);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: { report: 'node tools/report.mjs' },
    }), 'utf8');
    expect(discoverProjectRunners({ workspaceCanonicalRoot: root, internalRoots: [] }))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_MANIFEST_INVALID' } });

    const child = path.join(root, 'child');
    fs.mkdirSync(child);
    expect(discoverProjectRunners({
      workspaceCanonicalRoot: fs.realpathSync(child),
      internalRoots: [],
    })).toMatchObject({ ok: false, error: { code: 'RUNNER_MANIFEST_INVALID' } });
  });
});

describe('Restricted Project Runner snapshot and execution identity', () => {
  it('binds typed input, exact staged bytes, runtime identity and resource policy into the execution fingerprint', () => {
    const root = workspace();
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-stage-'));
    roots.push(stagingRoot);
    fs.writeFileSync(path.join(root, '.sud-d', 'runners.json'), JSON.stringify({
      version: 1,
      runners: [{
        id: 'report',
        label: 'Create local report',
        runtime: 'node-offline-v1',
        entry: 'tools/report.mjs',
        snapshotPaths: ['tools'],
        inputSchema: {
          type: 'object',
          properties: { preset: { type: 'string', enum: ['short', 'full'] } },
          required: ['preset'],
          additionalProperties: false,
        },
        artifacts: [{ id: 'report', path: 'report.json', type: 'application/json', required: true }],
        limits: { timeoutMs: 30_000, maxArtifactBytes: 1_048_576 },
        networkProfile: 'none',
        secretProfile: 'none',
      }],
    }), 'utf8');

    const prepared = prepareProjectRunnerSnapshot({
      workspaceId: 'ws-1',
      workspaceGeneration: 'generation-1',
      workspaceCanonicalRoot: root,
      internalRoots: [],
      runnerId: 'report',
      input: { preset: 'short' },
      attemptId: '11111111-1111-4111-8111-111111111111',
      stagingRoot,
      runtimeExecutable: fakeRuntimeExecutable(stagingRoot),
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.value).toMatchObject({
      workspaceId: 'ws-1',
      runnerId: 'report',
      attemptId: '11111111-1111-4111-8111-111111111111',
      executionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runtimeIdentity: expect.objectContaining({
        profile: 'node-offline-v1',
        executableDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      resourcePolicy: expect.objectContaining({
        aggregateOutputBytes: 64 * 1024 * 1024,
        activeProcessLimit: 32,
        jobMemoryBytes: 512 * 1024 * 1024,
      }),
    });
    expect(path.relative(root, prepared.value.stageRoot).startsWith('..')).toBe(true);
    expect(prepared.value.inventory.map((item) => item.relativePath)).toContain('tools/report.mjs');
    expect(verifyProjectRunnerSnapshot(prepared.value)).toEqual({ ok: true, value: undefined });
    expect(isProjectRunnerSnapshotFresh(prepared.value)).toEqual({ ok: true, value: undefined });

    fs.writeFileSync(path.join(root, 'tools', 'report.mjs'), 'process.exit(7);\n', 'utf8');
    expect(isProjectRunnerSnapshotFresh(prepared.value))
      .toMatchObject({ ok: false, error: { code: 'RUNNER_APPROVAL_STALE' } });
    expect(verifyProjectRunnerSnapshot(prepared.value)).toEqual({ ok: true, value: undefined });
  });

  it('rejects unknown typed input and staged hardlink sources before approval', () => {
    const root = workspace();
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-stage-'));
    roots.push(stagingRoot);
    fs.writeFileSync(path.join(root, '.sud-d', 'runners.json'), JSON.stringify({
      version: 1,
      runners: [{
        id: 'report',
        label: 'Create local report',
        runtime: 'node-offline-v1',
        entry: 'tools/report.mjs',
        snapshotPaths: ['tools'],
        inputSchema: {
          type: 'object',
          properties: { preset: { type: 'string', enum: ['short', 'full'] } },
          required: ['preset'],
          additionalProperties: false,
        },
        artifacts: [],
        limits: { timeoutMs: 30_000, maxArtifactBytes: 1_048_576 },
        networkProfile: 'none',
        secretProfile: 'none',
      }],
    }), 'utf8');

    const invalidInput = prepareProjectRunnerSnapshot({
      workspaceId: 'ws-1',
      workspaceGeneration: 'generation-1',
      workspaceCanonicalRoot: root,
      internalRoots: [],
      runnerId: 'report',
      input: { preset: 'short', executable: 'cmd.exe' },
      attemptId: '22222222-2222-4222-8222-222222222222',
      stagingRoot,
      runtimeExecutable: fakeRuntimeExecutable(stagingRoot),
    });
    expect(invalidInput).toMatchObject({ ok: false, error: { code: 'RUNNER_INPUT_INVALID' } });

    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-outside-'));
    roots.push(outsideRoot);
    const outsideFile = path.join(outsideRoot, 'outside.txt');
    fs.writeFileSync(outsideFile, 'outside', 'utf8');
    fs.linkSync(outsideFile, path.join(root, 'tools', 'linked.txt'));

    const hardlink = prepareProjectRunnerSnapshot({
      workspaceId: 'ws-1',
      workspaceGeneration: 'generation-1',
      workspaceCanonicalRoot: root,
      internalRoots: [],
      runnerId: 'report',
      input: { preset: 'short' },
      attemptId: '33333333-3333-4333-8333-333333333333',
      stagingRoot,
      runtimeExecutable: fakeRuntimeExecutable(stagingRoot),
    });
    expect(hardlink).toMatchObject({ ok: false, error: { code: 'RUNNER_SNAPSHOT_INVALID' } });
  });
});

describe('Restricted Project Runner exact approval binding', () => {
  it('binds safe exact execution identity and keeps duplicate approved retry idempotent', async () => {
    const root = workspace();
    writeReportRunnerManifest(root);
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-stage-'));
    roots.push(stagingRoot);
    const workspaceRepo = fakeWorkspaceRepo(runnerWorkspace(root));
    let starts = 0;
    const runtime: ProjectRunnerRuntimePort = {
      async start(snapshot) {
        starts += 1;
        return ok({
          jobId: 'job-1',
          attemptId: snapshot.attemptId,
          runnerId: snapshot.runnerId,
          state: 'running',
          executionFingerprint: snapshot.executionFingerprint,
        });
      },
    };
    const service = createProjectRunnerService({
      workspaceRepo,
      internalRoots: [],
      stagingRoot,
      runtimeExecutable: fakeRuntimeExecutable(stagingRoot),
      runtime,
    });
    const capabilities = createProjectRunnerCapabilities({ service });
    const registry = createToolCapabilityRegistry(capabilities);
    if (!registry.ok) throw new Error('registry failed');

    let capturedBinding: unknown;
    const kernel = createToolKernel({
      registry: registry.value,
      audit: { append: () => undefined },
      approval: {
        authorize(request) {
          capturedBinding = request.binding;
          return { ok: true, state: 'approved', requestId: 'runner-approval-1' };
        },
      },
    });
    const request = {
      invocationId: 'runner-invoke-1',
      session: { id: 'runner-session', type: 'mcp-stdio' as const },
      capability: 'runner.start',
      input: {
        runnerId: 'report',
        input: { preset: 'short' },
        attemptId: '44444444-4444-4444-8444-444444444444',
      },
    };

    const first = await kernel.invoke(request);
    const second = await kernel.invoke({ ...request, invocationId: 'runner-invoke-2' });

    expect(first).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      approvalDecision: 'approved',
      value: { jobId: 'job-1', state: 'running' },
    });
    expect(second).toMatchObject({ ok: true, value: { jobId: 'job-1' } });
    expect(starts).toBe(1);
    expect(capturedBinding).toMatchObject({
      workspaceId: 'ws-1',
      runnerId: 'report',
      attemptId: '44444444-4444-4444-8444-444444444444',
      executionFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      inputDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      runtimeProfile: 'node-offline-v1',
      sandboxProfile: 'appcontainer-zero-v1',
      outputProfile: 'brokered-output-v1',
      resourcePolicyIdentity: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(capturedBinding)).not.toContain('short');
    expect(JSON.stringify(capturedBinding)).not.toMatch(/executable|argv|cwd|environment/i);
  });

  it('makes a pending approval stale when source bytes change and never reaches runtime', async () => {
    const root = workspace();
    writeReportRunnerManifest(root);
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-runner-stage-'));
    roots.push(stagingRoot);
    const workspaceRepo = fakeWorkspaceRepo(runnerWorkspace(root));
    let starts = 0;
    const runtime: ProjectRunnerRuntimePort = {
      async start(snapshot) {
        starts += 1;
        return ok({
          jobId: 'job-stale',
          attemptId: snapshot.attemptId,
          runnerId: snapshot.runnerId,
          state: 'running',
          executionFingerprint: snapshot.executionFingerprint,
        });
      },
    };
    const service = createProjectRunnerService({
      workspaceRepo,
      internalRoots: [],
      stagingRoot,
      runtimeExecutable: fakeRuntimeExecutable(stagingRoot),
      runtime,
    });
    const registry = createToolCapabilityRegistry(createProjectRunnerCapabilities({ service }));
    if (!registry.ok) throw new Error('registry failed');
    let approvals = 0;
    const kernel = createToolKernel({
      registry: registry.value,
      audit: { append: () => undefined },
      approval: {
        authorize() {
          approvals += 1;
          return approvals === 1
            ? { ok: true, state: 'pending', requestId: 'runner-pending', expiresAt: '2099-01-01T00:00:00.000Z' }
            : { ok: true, state: 'approved', requestId: 'runner-approved' };
        },
      },
    });
    const input = {
      runnerId: 'report',
      input: { preset: 'short' },
      attemptId: '55555555-5555-4555-8555-555555555555',
    };
    const pending = await kernel.invoke({
      invocationId: 'runner-pending-1',
      session: { id: 'runner-session', type: 'mcp-stdio' },
      capability: 'runner.start',
      input,
    });
    expect(pending).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });

    fs.writeFileSync(path.join(root, 'tools', 'report.mjs'), 'process.exit(9);\n', 'utf8');
    const staleResult = await kernel.invoke({
      invocationId: 'runner-pending-2',
      session: { id: 'runner-session', type: 'mcp-stdio' },
      capability: 'runner.start',
      input,
    });
    expect(staleResult).toMatchObject({
      ok: false,
      code: 'APPROVAL_CONTEXT_FAILED',
      causeCode: 'RUNNER_APPROVAL_STALE',
    });
    expect(approvals).toBe(1);
    expect(starts).toBe(0);
  });

  it('never mode-approves runner.start, including Full Access', () => {
    const coordinator = createApprovalCoordinator({
      repository: fakeApprovalRepository(),
      runtimeInstanceId: 'runner-full-access',
      hmacKey: Buffer.alloc(32, 77),
      mode: () => 'full_access',
    });
    const result = coordinator.authorize({
      session: { id: 'runner-full', type: 'mcp-stdio' },
      capability: 'runner.start',
      effect: 'execute',
      security: { sensitivity: 'normal', context: 'workspace', workspaceId: 'ws-1' },
      descriptor: { title: 'Run report', resourceLabel: 'Runner report' },
      binding: {
        workspaceId: 'ws-1',
        runnerId: 'report',
        executionFingerprint: 'a'.repeat(64),
        inputDigest: 'b'.repeat(64),
        resourcePolicyIdentity: 'c'.repeat(64),
      },
    });
    expect(result).toMatchObject({ ok: true, state: 'pending' });
  });
});
