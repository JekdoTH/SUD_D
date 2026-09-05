import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCodingSemanticReadCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
} from '@sud-d/application';
import {
  canonicalizePath,
  createWorkspaceTextFileSystem,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import {
  CODING_SEMANTIC_READ_CAPABILITY_NAMES,
  codingEngineRuntimeFailureAppError,
  type AuditEvent,
  type CodingEngineWorkspaceContext,
  type CodingSemanticReadRequest,
  type InternalRoot,
  type Workspace,
} from '@sud-d/domain';

const tempDirs: string[] = [];
let invocationCounter = 0;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-semantic-read-'));
  tempDirs.push(dir);
  return dir;
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error(`failed to canonicalize ${value}`);
  return result.value;
}

function workspace(id: string, root: string, isActive = true): Workspace {
  return {
    id,
    displayName: id,
    canonicalRoot: canonical(root),
    isActive,
    createdAt: new Date('2026-09-04T00:00:00.000Z'),
    updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  };
}

function fakeWorkspaceRepo(initial: Workspace): WorkspaceRepository & { current: Workspace } {
  const repo: WorkspaceRepository & { current: Workspace } = {
    current: initial,
    list: () => [repo.current],
    findById: (id) => (repo.current.id === id ? repo.current : undefined),
    findByCanonicalRoot: (root) => (repo.current.canonicalRoot === root ? repo.current : undefined),
    save: () => repo.current,
    setActive: () => undefined,
    remove: () => undefined,
  };
  return repo;
}

function makeSemanticHarness(options: {
  internalRoots?: readonly InternalRoot[];
  internalRootRelativePath?: string;
  failure?: unknown;
  onAudit?: (event: Omit<AuditEvent, 'id'>, repo: WorkspaceRepository & { current: Workspace }) => void;
} = {}) {
  const root = tempDir();
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
  const repo = fakeWorkspaceRepo(workspace('ws-1', workspaceRoot));
  const calls: Array<{ context: CodingEngineWorkspaceContext; request: CodingSemanticReadRequest }> = [];
  const semanticRead = {
    async read(context: CodingEngineWorkspaceContext, request: CodingSemanticReadRequest): Promise<unknown> {
      calls.push({ context, request });
      if (options.failure) throw options.failure;
      return { content: [{ type: 'text', text: 'semantic-result' }] };
    },
  };
  if (options.internalRootRelativePath) {
    const internalRoot = path.join(workspaceRoot, options.internalRootRelativePath);
    fs.mkdirSync(internalRoot, { recursive: true });
    fs.writeFileSync(path.join(internalRoot, 'secret.ts'), 'export const secret = 1;\n', 'utf8');
  }
  const internalRoots = [
    ...(options.internalRoots ?? []),
    ...(options.internalRootRelativePath
      ? [{ canonicalPath: canonical(path.join(workspaceRoot, options.internalRootRelativePath)), label: 'test internal root' }]
      : []),
  ];
  const capabilities = createCodingSemanticReadCapabilities({
    workspaceRepo: repo,
    internalRoots,
    fileSystem: createWorkspaceTextFileSystem(),
    semanticRead,
  });
  const registry = createToolCapabilityRegistry(capabilities);
  if (!registry.ok) throw new Error(`registry failed: ${registry.error.code}`);
  const audit: Array<Omit<AuditEvent, 'id'>> = [];
  const kernel = createToolKernel({
    registry: registry.value,
    audit: {
      append(event) {
        audit.push(event);
        options.onAudit?.(event, repo);
      },
    },
  });
  const invoke = (capability: string, input: unknown) => kernel.invoke({
    invocationId: `semantic-read-${++invocationCounter}`,
    session: { id: 'semantic-read-test', type: 'mcp-stdio' },
    capability,
    input,
  });
  return { root, workspaceRoot, repo, calls, audit, capabilities, invoke };
}

describe('Milestone C semantic-read contract', () => {
  it('defines exactly the five approved public semantic-read capability names', () => {
    expect(CODING_SEMANTIC_READ_CAPABILITY_NAMES).toEqual([
      'code.overview',
      'code.find_symbol',
      'code.find_references',
      'code.search',
      'code.diagnostics',
    ]);
  });

  it('uses a stable safe coding-engine-unavailable failure', () => {
    expect(codingEngineRuntimeFailureAppError('CODING_ENGINE_UNAVAILABLE')).toEqual({
      code: 'CODING_ENGINE_UNAVAILABLE',
      message: 'Coding Engine is unavailable',
    });
  });
});

describe('Milestone C Tool Kernel semantic reads', () => {
  it('routes code.overview through read policy, audit, and the fixed semantic port', async () => {
    const h = makeSemanticHarness();

    const result = await h.invoke('code.overview', { relativePath: 'src/index.ts' });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(h.calls).toEqual([{
      context: {
        workspaceId: 'ws-1',
        canonicalRoot: canonical(h.workspaceRoot),
        projectName: 'workspace',
      },
      request: { capability: 'code.overview', input: { relativePath: 'src/index.ts' } },
    }]);
    expect(h.audit.some((event) => event.action === 'tool_kernel.invoke'
      && event.metadata?.capability === 'code.overview')).toBe(true);
  });

  it('routes code.find_symbol with only the approved SUD-D input fields', async () => {
    const h = makeSemanticHarness();

    const result = await h.invoke('code.find_symbol', {
      namePathPattern: 'value',
      relativePath: 'src/index.ts',
      depth: 1,
      includeBody: true,
      substringMatching: false,
      maxMatches: 4,
    });

    expect(result).toMatchObject({ ok: true, policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.find_symbol',
      input: {
        namePathPattern: 'value',
        relativePath: 'src/index.ts',
        depth: 1,
        includeBody: true,
        substringMatching: false,
        maxMatches: 4,
      },
    });
  });

  it('routes code.find_references through the approved symbol/file request', async () => {
    const h = makeSemanticHarness();

    const result = await h.invoke('code.find_references', {
      namePath: 'value',
      relativePath: 'src/index.ts',
    });

    expect(result).toMatchObject({ ok: true, policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.find_references',
      input: { namePath: 'value', relativePath: 'src/index.ts' },
    });
  });

  it('routes code.search with only bounded pattern/path/code-only fields', async () => {
    const h = makeSemanticHarness();

    const result = await h.invoke('code.search', {
      pattern: 'value',
      relativePath: 'src',
      codeOnly: true,
    });

    expect(result).toMatchObject({ ok: true, policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.search',
      input: { pattern: 'value', relativePath: 'src', codeOnly: true },
    });
  });

  it('routes code.diagnostics through bounded file/line/severity fields', async () => {
    const h = makeSemanticHarness();

    const result = await h.invoke('code.diagnostics', {
      relativePath: 'src/index.ts',
      startLine: 0,
      endLine: 20,
      minSeverity: 2,
    });

    expect(result).toMatchObject({ ok: true, policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.diagnostics',
      input: { relativePath: 'src/index.ts', startLine: 0, endLine: 20, minSeverity: 2 },
    });
  });

  it('defines all five semantic capabilities as read-only', () => {
    const h = makeSemanticHarness();
    expect(h.capabilities.map((capability) => ({ name: capability.name, effect: capability.effect }))).toEqual(
      CODING_SEMANTIC_READ_CAPABILITY_NAMES.map((name) => ({ name, effect: 'read' })),
    );
  });

  it('denies traversal, absolute, git-internal, and InternalRoot paths before semantic dispatch', async () => {
    const h = makeSemanticHarness({ internalRootRelativePath: 'internal' });
    const denied = [
      ['code.overview', { relativePath: '../outside.ts' }],
      ['code.overview', { relativePath: 'C:\\Windows\\System32' }],
      ['code.overview', { relativePath: '.git/config' }],
      ['code.overview', { relativePath: 'internal/secret.ts' }],
    ] as const;

    for (const [capability, input] of denied) {
      const result = await h.invoke(capability, input);
      expect(result.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });

  it('fails closed when the active Workspace changes after authorization', async () => {
    const h = makeSemanticHarness({
      onAudit(event, repo) {
        if (event.metadata?.phase === 'pre_execution') {
          repo.current = { ...repo.current, id: 'ws-2' };
        }
      },
    });

    const result = await h.invoke('code.overview', { relativePath: 'src/index.ts' });

    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'WORKSPACE_NOT_FOUND' });
    expect(h.calls).toHaveLength(0);
  });

  it('maps semantic adapter failures to stable unavailable without persisting raw error text', async () => {
    const marker = 'RAW_SERENA_SECRET_MARKER';
    const h = makeSemanticHarness({ failure: new Error(marker) });

    const result = await h.invoke('code.overview', { relativePath: 'src/index.ts' });

    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'CODING_ENGINE_UNAVAILABLE' });
    expect(JSON.stringify({ result, audit: h.audit })).not.toContain(marker);
  });
});
