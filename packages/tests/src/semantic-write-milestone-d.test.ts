import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCodingSemanticWriteCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
} from '@sud-d/application';
import {
  WORKSPACE_TEXT_FILE_LIMITS,
  canonicalizePath,
  createWorkspaceTextFileSystem,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import {
  CODING_SEMANTIC_WRITE_CAPABILITY_NAMES,
  type AuditEvent,
  type CodingEngineWorkspaceContext,
  type CodingSemanticWriteRequest,
  type InternalRoot,
  type Workspace,
} from '@sud-d/domain';

const tempDirs: string[] = [];
let invocationCounter = 0;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-semantic-write-'));
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
    createdAt: new Date('2026-09-05T00:00:00.000Z'),
    updatedAt: new Date('2026-09-05T00:00:00.000Z'),
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

function makeSemanticWriteHarness(options: {
  internalRoots?: readonly InternalRoot[];
  internalRootRelativePath?: string;
  failure?: unknown;
  onWrite?: (context: CodingEngineWorkspaceContext, request: CodingSemanticWriteRequest) => unknown | Promise<unknown>;
  onAudit?: (event: Omit<AuditEvent, 'id'>, repo: WorkspaceRepository & { current: Workspace }) => void;
} = {}) {
  const root = tempDir();
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
  const repo = fakeWorkspaceRepo(workspace('ws-1', workspaceRoot));
  const calls: Array<{ context: CodingEngineWorkspaceContext; request: CodingSemanticWriteRequest }> = [];
  const semanticWrite = {
    async write(context: CodingEngineWorkspaceContext, request: CodingSemanticWriteRequest): Promise<unknown> {
      calls.push({ context, request });
      if (options.failure) throw options.failure;
      if (options.onWrite) return options.onWrite(context, request);
      return { content: [{ type: 'text', text: 'write-result' }] };
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
  const capabilities = createCodingSemanticWriteCapabilities({
    workspaceRepo: repo,
    internalRoots,
    fileSystem: createWorkspaceTextFileSystem(),
    semanticWrite,
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
    invocationId: `semantic-write-${++invocationCounter}`,
    session: { id: 'semantic-write-test', type: 'mcp-stdio' },
    capability,
    input,
  });
  return { root, workspaceRoot, repo, calls, audit, capabilities, invoke };
}

describe('Milestone D semantic-write contract', () => {
  it('defines exactly the four approved public semantic-write capability names', () => {
    expect(CODING_SEMANTIC_WRITE_CAPABILITY_NAMES).toEqual([
      'code.replace_symbol',
      'code.insert_before',
      'code.insert_after',
      'code.rename',
    ]);
  });
});

describe('Milestone D Tool Kernel semantic writes', () => {
  it('routes code.replace_symbol through modify policy, audit, and the fixed semantic port', async () => {
    const h = makeSemanticWriteHarness();
    const body = 'export const value = 2;';

    const result = await h.invoke('code.replace_symbol', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body,
    });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(h.capabilities.find((capability) => capability.name === 'code.replace_symbol')?.effect).toBe('modify');
    expect(h.calls).toEqual([{
      context: {
        workspaceId: 'ws-1',
        canonicalRoot: canonical(h.workspaceRoot),
        projectName: 'workspace',
      },
      request: {
        capability: 'code.replace_symbol',
        input: { namePath: 'value', relativePath: 'src/index.ts', body },
      },
    }]);
    expect(h.audit.some((event) => event.action === 'tool_kernel.invoke'
      && event.metadata?.capability === 'code.replace_symbol')).toBe(true);
    expect(JSON.stringify(h.audit)).not.toContain(body);
  });

  it('routes code.insert_before through the fixed semantic port', async () => {
    const h = makeSemanticWriteHarness();
    const body = 'export const beforeValue = 0;';

    const result = await h.invoke('code.insert_before', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body,
    });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.insert_before',
      input: { namePath: 'value', relativePath: 'src/index.ts', body },
    });
  });

  it('routes code.insert_after through the fixed semantic port', async () => {
    const h = makeSemanticWriteHarness();
    const body = 'export const afterValue = 3;';

    const result = await h.invoke('code.insert_after', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body,
    });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.insert_after',
      input: { namePath: 'value', relativePath: 'src/index.ts', body },
    });
  });

  it('routes code.rename through the fixed semantic port', async () => {
    const h = makeSemanticWriteHarness();

    const result = await h.invoke('code.rename', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      newName: 'renamedValue',
    });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(h.calls[0]?.request).toEqual({
      capability: 'code.rename',
      input: { namePath: 'value', relativePath: 'src/index.ts', newName: 'renamedValue' },
    });
  });

  it('defines all four semantic writes as modify effects with sensitive-resource approval context', () => {
    const h = makeSemanticWriteHarness();
    expect(h.capabilities.map((capability) => ({
      name: capability.name,
      effect: capability.effect,
      hasApproval: capability.approval !== undefined,
    }))).toEqual(CODING_SEMANTIC_WRITE_CAPABILITY_NAMES.map((name) => ({
      name,
      effect: 'modify',
      hasApproval: true,
    })));
  });

  it('denies traversal, absolute, git-internal, and InternalRoot paths before semantic dispatch', async () => {
    const h = makeSemanticWriteHarness({ internalRootRelativePath: 'internal' });
    fs.mkdirSync(path.join(h.workspaceRoot, '.git'), { recursive: true });
    fs.writeFileSync(path.join(h.workspaceRoot, '.git', 'config'), '[core]\n', 'utf8');
    const denied = [
      ['code.replace_symbol', { namePath: 'value', relativePath: '../outside.ts', body: 'export const value = 2;' }],
      ['code.insert_before', { namePath: 'value', relativePath: 'C:\\Windows\\System32\\x.ts', body: 'const x = 1;' }],
      ['code.insert_after', { namePath: 'value', relativePath: '.git/config', body: 'const x = 1;' }],
      ['code.rename', { namePath: 'secret', relativePath: 'internal/secret.ts', newName: 'otherSecret' }],
    ] as const;

    for (const [capability, input] of denied) {
      const result = await h.invoke(capability, input);
      expect(result.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });

  it('fails closed when the active Workspace changes after authorization', async () => {
    const h = makeSemanticWriteHarness({
      onAudit(event, repo) {
        if (event.metadata?.phase === 'pre_execution') repo.current = { ...repo.current, id: 'ws-2' };
      },
    });

    const result = await h.invoke('code.replace_symbol', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body: 'export const value = 2;',
    });

    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'WORKSPACE_NOT_FOUND' });
    expect(h.calls).toHaveLength(0);
  });

  it('rejects malformed and oversized write inputs before semantic dispatch', async () => {
    const h = makeSemanticWriteHarness();
    const invalid = [
      ['code.replace_symbol', { namePath: '', relativePath: 'src/index.ts', body: 'export const value = 2;' }],
      ['code.replace_symbol', { namePath: 'value', relativePath: 'src/index.ts', body: '' }],
      ['code.insert_before', { namePath: 'value', relativePath: 'src/index.ts', body: 'x'.repeat(WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes + 1) }],
      ['code.rename', { namePath: 'value', relativePath: 'src/index.ts', newName: '' }],
      ['code.rename', { namePath: 'value', relativePath: 'src/index.ts', newName: 'x'.repeat(2_049) }],
      ['code.rename', { namePath: 'value', relativePath: 'src/index.ts', newName: 'renamedValue', toolName: 'write_memory' }],
    ] as const;

    for (const [capability, input] of invalid) {
      const result = await h.invoke(capability, input);
      expect(result.ok).toBe(false);
    }
    expect(h.calls).toHaveLength(0);
  });

  it('keeps semantic-write file changes visible through normal Git status and diff', async () => {
    const h = makeSemanticWriteHarness({
      onWrite(_context, request) {
        if (request.capability !== 'code.replace_symbol') throw new Error('unexpected write');
        fs.writeFileSync(path.join(h.workspaceRoot, request.input.relativePath), `${request.input.body}\n`, 'utf8');
        return { content: [{ type: 'text', text: 'ok' }] };
      },
    });
    execFileSync('git', ['init'], { cwd: h.workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'SUD-D Test'], { cwd: h.workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'sud-d-test@example.invalid'], { cwd: h.workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['add', 'src/index.ts'], { cwd: h.workspaceRoot, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'baseline'], { cwd: h.workspaceRoot, stdio: 'ignore' });

    const body = 'export const value = 2;';
    const result = await h.invoke('code.replace_symbol', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body,
    });

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(execFileSync('git', ['status', '--short'], { cwd: h.workspaceRoot, encoding: 'utf8' }).trim()).toBe('M src/index.ts');
    const diff = execFileSync('git', ['diff', '--', 'src/index.ts'], { cwd: h.workspaceRoot, encoding: 'utf8' });
    expect(diff).toContain('-export const value = 1;');
    expect(diff).toContain('+export const value = 2;');
    expect(diff).not.toContain('RAW_SERENA');
  });

  it('maps raw semantic-write failures to stable unavailable without persisting raw errors or submitted body', async () => {
    const marker = 'RAW_SERENA_WRITE_SECRET_SENTINEL';
    const body = 'export const privateValue = "BODY_SECRET_SENTINEL";';
    const h = makeSemanticWriteHarness({ failure: new Error(marker) });

    const result = await h.invoke('code.replace_symbol', {
      namePath: 'value',
      relativePath: 'src/index.ts',
      body,
    });

    expect(result).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'CODING_ENGINE_UNAVAILABLE' });
    expect(JSON.stringify({ result, audit: h.audit })).not.toContain(marker);
    expect(JSON.stringify(h.audit)).not.toContain(body);
  });
});
