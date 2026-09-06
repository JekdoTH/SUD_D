import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import {
  createTeamRepository,
  createTeamTransitionUnitOfWork,
  createWorkspaceTextFileSystem,
  createWorkMemoryRepository,
  type GitDetectResult,
  type GitDiffResult,
  type GitStatusResult,
} from '@sud-d/infrastructure';
import {
  createProductionMcpServer,
  createStdioGatewayTransport,
} from '@sud-d/mcp-gateway';
import {
  APPROVED_TOOLS,
  LEGACY_PROTOCOL_VERSION,
  createJsonLineReader,
  git,
  initRepo,
  kernelValue,
  makeHarness,
  tempDir,
} from './git-safety-test-harness.js';

describe('Git Safety - trusted composition and detection', () => {
  it('registers exactly four approved Git capabilities with fixed effects', async () => {
    const h = await makeHarness();
    expect(h.capabilities.map((capability) => [capability.name, capability.effect])).toEqual([
      ['git.detect', 'read'],
      ['git.status', 'read'],
      ['git.diff', 'read'],
      ['git.checkpoint', 'create'],
    ]);
  });

  it('detects a normal non-bare repository exactly at active Workspace root', async () => {
    const h = await makeHarness();
    const value = kernelValue<GitDetectResult>(await h.invoke('git.detect', {}));
    expect(value).toMatchObject({ isRepository: true, isSupported: true, state: 'normal' });
    expect(value.headSha).toMatch(/^[0-9a-f]{40,64}$/);
    expect(JSON.stringify(value)).not.toContain(h.workspaceRoot);
  });

  it('fails closed when there is no active Workspace', async () => {
    const h = await makeHarness({ active: false });
    const result = await h.invoke('git.detect', {});
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'WORKSPACE_NOT_FOUND' });
  });

  it('returns a safe not-a-repository result without walking to a parent repo', async () => {
    const h = await makeHarness({ repo: false });
    const value = kernelValue<GitDetectResult>(await h.invoke('git.detect', {}));
    expect(value).toMatchObject({ isRepository: false, isSupported: false, reason: 'NOT_REPOSITORY' });
    expect(JSON.stringify(value)).not.toContain(h.workspaceRoot);
  });

  it('rejects a nested Workspace inside a parent repository', async () => {
    const base = tempDir();
    initRepo(base);
    const nested = path.join(base, 'nested');
    fs.mkdirSync(nested);
    const h = await makeHarness({ repo: false, workspaceRoot: nested });
    const value = kernelValue<GitDetectResult>(await h.invoke('git.detect', {}));
    expect(value).toMatchObject({ isRepository: false, isSupported: false, reason: 'NOT_REPOSITORY' });
  });

  it('reports a bare repository as unsupported', async () => {
    const base = tempDir();
    const bare = path.join(base, 'bare.git');
    fs.mkdirSync(bare);
    git(bare, ['init', '--bare', '-q']);
    const h = await makeHarness({ repo: false, workspaceRoot: bare });
    const value = kernelValue<GitDetectResult>(await h.invoke('git.detect', {}));
    expect(value).toMatchObject({ isRepository: true, isSupported: false, reason: 'BARE_REPOSITORY' });
  });
});

describe('Git Safety - status and production MCP surface', () => {
  it('returns clean structured status for a clean repository', async () => {
    const h = await makeHarness();
    const value = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(value.clean).toBe(true);
    expect(value.entries).toEqual([]);
    expect(value.statusId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parses staged, unstaged, untracked, and deleted state without file contents', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'delete.txt'), 'delete\n');
    git(h.workspaceRoot, ['add', '--', 'delete.txt']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'add delete fixture']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'working\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'staged.txt'), 'staged\n');
    git(h.workspaceRoot, ['add', '--', 'staged.txt']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'untracked.txt'), 'untracked\n');
    fs.unlinkSync(path.join(h.workspaceRoot, 'delete.txt'));

    const value = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const byPath = new Map(value.entries.map((entry) => [entry.path, entry]));
    expect(byPath.get('tracked.txt')).toMatchObject({ unstaged: true });
    expect(byPath.get('staged.txt')).toMatchObject({ staged: true });
    expect(byPath.get('untracked.txt')).toMatchObject({ untracked: true });
    expect(byPath.get('delete.txt')).toMatchObject({ unstaged: true, kind: 'deleted' });
    expect(JSON.stringify(value)).not.toContain('working');
  });

  it('produces deterministic entry ordering and changes statusId when safe file content changes', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'z.txt'), 'z1\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'a.txt'), 'a1\n');
    const first = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(first.entries.map((entry) => entry.path)).toEqual(['a.txt', 'z.txt']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'a.txt'), 'a2\n');
    const second = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(second.statusId).not.toBe(first.statusId);
  });

  it('production tools/list exposes exactly six Workspace, four Git, four Team, five semantic reads, four semantic writes, Restricted Verify, and two Work Memory tools', async () => {
    const h = await makeHarness();
    const server = createProductionMcpServer({
      workspaceRepo: h.workspaceRepo,
      auditRepo: h.auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      gitSafety: h.gitSafety,
      teamRepo: createTeamRepository(h.db),
      teamTransitionUow: createTeamTransitionUnitOfWork(h.db),
      semanticRead: { read: async () => ({ content: [] }) },
    semanticWrite: { write: async () => ({ content: [] }) },
      restrictedVerify: { run: async (_context, request) => ({ action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 1 }) },
      workMemoryRepo: createWorkMemoryRepository(h.db),
    });
    const input = new PassThrough();
    const output = new PassThrough();
    const reader = createJsonLineReader(output);
    await server.connect(createStdioGatewayTransport(input, output));
    const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'git-safety-test', version: '1.0.0' } } });
    await reader.next();
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const listed = await reader.next();
    expect((listed.result?.tools ?? []).map((tool) => tool.name).filter(Boolean).sort()).toEqual(APPROVED_TOOLS);
    await server.close();
  });

  it('malformed Git MCP input with privileged override fields fails closed', async () => {
    const h = await makeHarness();
    const server = createProductionMcpServer({
      workspaceRepo: h.workspaceRepo,
      auditRepo: h.auditRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      gitSafety: h.gitSafety,
      teamRepo: createTeamRepository(h.db),
      teamTransitionUow: createTeamTransitionUnitOfWork(h.db),
      semanticRead: { read: async () => ({ content: [] }) },
    semanticWrite: { write: async () => ({ content: [] }) },
      restrictedVerify: { run: async (_context, request) => ({ action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 1 }) },
      workMemoryRepo: createWorkMemoryRepository(h.db),
    });
    const input = new PassThrough();
    const output = new PassThrough();
    const reader = createJsonLineReader(output);
    await server.connect(createStdioGatewayTransport(input, output));
    const send = (message: unknown) => input.write(`${JSON.stringify(message)}\n`);
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'git-safety-test', version: '1.0.0' } } });
    await reader.next();
    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'work.resume', arguments: {} } });
    await reader.next();
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'git.status', arguments: { executable: 'cmd.exe', argv: ['/c', 'whoami'], cwd: 'C:\\', env: { X: '1' }, ref: 'refs/heads/main', effect: 'execute' } } });
    const response = await reader.next();
    expect(response.error ?? response.result).toBeTruthy();
    expect(JSON.stringify(response)).not.toMatch(/whoami|cmd\.exe|node_modules|stack/i);
    await server.close();
  });
});


describe('Git Safety - bounded credential-safe diff', () => {
  it('returns the tracked working-tree diff relative to HEAD', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'changed\n', 'utf8');
    const value = kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(value.patch).toContain('-base');
    expect(value.patch).toContain('+changed');
    expect(value.truncated).toBe(false);
  });

  it('represents staged plus unstaged tracked state using final working-tree content', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'staged-version\n', 'utf8');
    git(h.workspaceRoot, ['add', '--', 'tracked.txt']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'working-version\n', 'utf8');
    const value = kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(value.patch).toContain('+working-version');
    expect(value.patch).not.toContain('+staged-version');
  });

  it('rejects traversal, absolute, UNC, device, and ADS path filters', async () => {
    const h = await makeHarness();
    for (const relativePath of ['../secret', 'C:\\secret', '\\\\server\\share', '\\\\?\\C:\\secret', 'file.txt:ads']) {
      const result = await h.invoke('git.diff', { relativePath });
      expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
  });

  it('direct credential-targeted diff returns approval-required before content exposure', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'BASE=value\n');
    git(h.workspaceRoot, ['add', '--', '.env']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'credential fixture']);
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'SECRET_MARKER=never-expose\n');
    const result = await h.invoke('git.diff', { relativePath: '.env' });
    expect(result).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(JSON.stringify(result)).not.toContain('never-expose');
  });

  it('broad diff omits credential-like content and reports omitted paths', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'BASE=value\n');
    git(h.workspaceRoot, ['add', '--', '.env']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'credential fixture']);
    fs.writeFileSync(path.join(h.workspaceRoot, '.env'), 'SECRET_MARKER=never-expose\n');
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'safe-change\n');
    const value = kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(value.patch).toContain('+safe-change');
    expect(value.patch).not.toContain('never-expose');
    expect(value.omittedSensitivePaths).toContain('.env');
  });

  it('disables configured external diff execution', async () => {
    const h = await makeHarness();
    const marker = path.join(h.workspaceRoot, 'external-diff.marker');
    const script = path.join(h.workspaceRoot, 'external-diff.cmd');
    fs.writeFileSync(script, `@echo off\r\necho ran>"${marker}"\r\n`, 'utf8');
    git(h.workspaceRoot, ['config', 'diff.external', script]);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'changed\n');
    kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('disables configured textconv execution', async () => {
    const h = await makeHarness();
    const marker = path.join(h.workspaceRoot, 'textconv.marker');
    const script = path.join(h.workspaceRoot, 'textconv.cmd');
    fs.writeFileSync(script, `@echo off\r\necho ran>"${marker}"\r\ntype %1\r\n`, 'utf8');
    fs.writeFileSync(path.join(h.workspaceRoot, '.gitattributes'), 'tracked.txt diff=evil\n');
    git(h.workspaceRoot, ['add', '--', '.gitattributes']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'attributes fixture']);
    git(h.workspaceRoot, ['config', 'diff.evil.textconv', script]);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'changed\n');
    kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('does not launch a configured pager', async () => {
    const h = await makeHarness();
    const marker = path.join(h.workspaceRoot, 'pager.marker');
    const script = path.join(h.workspaceRoot, 'pager.cmd');
    fs.writeFileSync(script, `@echo off\r\necho ran>"${marker}"\r\n`, 'utf8');
    git(h.workspaceRoot, ['config', 'core.pager', script]);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'changed\n');
    kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('returns binary changes without raw binary content', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'binary.dat'), Buffer.from([0, 1, 2, 3]));
    git(h.workspaceRoot, ['add', '--', 'binary.dat']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'binary fixture']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'binary.dat'), Buffer.from([0, 9, 8, 7]));
    const value = kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(value.patch).toMatch(/Binary files|GIT binary patch|binary/i);
    expect(value.patch).not.toContain('\u0000');
  });

  it('hard-bounds diff output and caller can only lower the cap', async () => {
    const h = await makeHarness();
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), `${'line-change\n'.repeat(5000)}`);
    const value = kernelValue<GitDiffResult>(await h.invoke('git.diff', { maxBytes: 128 }));
    expect(value.bytes).toBeLessThanOrEqual(128);
    expect(value.truncated).toBe(true);
    const raised = await h.invoke('git.diff', { maxBytes: 999_999 });
    expect(raised).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
  });

  it('sanitizes unsupported-repository diff failure without absolute host paths', async () => {
    const h = await makeHarness({ repo: false });
    const result = await h.invoke('git.diff', {});
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(h.workspaceRoot);
  });
});
