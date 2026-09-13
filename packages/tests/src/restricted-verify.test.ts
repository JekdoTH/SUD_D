import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRestrictedVerifyCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
  type RestrictedVerifyPort,
} from '@sud-d/application';
import {
  canonicalizePath,
  createRestrictedVerifyAdapter,
  createWorkspaceTextFileSystem,
  resolveRestrictedVerifyProfile,
  runRestrictedVerifyProcess,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import {
  RESTRICTED_VERIFY_ACTIONS,
  RestrictedVerifyFailure,
  type RestrictedVerifyRequest,
  type RestrictedVerifyResult,
  type Workspace,
} from '@sud-d/domain';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function testNodeExecutable(): string {
  if (path.basename(process.execPath).toLowerCase() === 'node.exe') return process.execPath;
  if (process.platform === 'win32') {
    const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
    const output = execFileSync(path.join(systemRoot, 'System32', 'where.exe'), ['node'], { encoding: 'utf8', windowsHide: true });
    const candidate = output.split(/\r?\n/).map((value) => value.trim()).find((value) => path.basename(value).toLowerCase() === 'node.exe' && fs.existsSync(value));
    if (candidate) return candidate;
  }
  throw new Error('Node executable unavailable for Restricted Verify test');
}

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitForPidExit(pid: number, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Restricted Verify process ${pid} is still alive`);
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error('canonicalize failed');
  return result.value;
}

function makeWorkspace(root: string): Workspace {
  return {
    id: 'verify-ws',
    displayName: 'Verify Workspace',
    canonicalRoot: canonical(root),
    isActive: true,
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

describe('Restricted Verify Personal Alpha contract', () => {
  it('exposes exactly the six approved verification actions', () => {
    expect(RESTRICTED_VERIFY_ACTIONS).toEqual(['test', 'lint', 'typecheck', 'build', 'diff_check', 'secret_scan']);
  });
});

describe('Restricted Verify Tool Kernel capability', () => {
  it('routes test through execute policy, exact approval binding, and the active Workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-restricted-verify-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}\n', 'utf8');
    const workspaceRepo = fakeWorkspaceRepo(makeWorkspace(workspaceRoot));
    const calls: Array<{ context: unknown; request: RestrictedVerifyRequest }> = [];
    const verifySummaries: unknown[] = [];
    const restrictedVerify: RestrictedVerifyPort = {
      async run(context, request): Promise<RestrictedVerifyResult> {
        calls.push({ context, request });
        return { action: request.action, passed: true, exitCode: 0, output: 'TOKEN=RAW_SUMMARY_SECRET_SENTINEL', truncated: false, durationMs: 5 };
      },
    };
    const capabilities = createRestrictedVerifyCapabilities({
      workspaceRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      restrictedVerify,
      summaryAudit: { append: (event) => { verifySummaries.push(event); } },
    });
    const registry = createToolCapabilityRegistry(capabilities);
    if (!registry.ok) throw new Error('registry failed');
    let approvalRequest: { binding: unknown } | undefined;
    const kernel = createToolKernel({
      registry: registry.value,
      audit: { append: () => undefined },
      approval: {
        authorize(request) {
          approvalRequest = request;
          return { ok: true, state: 'approved', requestId: 'verify-approval-1' };
        },
      },
    });

    const result = await kernel.invoke({
      invocationId: 'verify-invocation-1',
      session: { id: 'verify-session', type: 'mcp-stdio' },
      capability: 'verify.run',
      input: { action: 'test' },
    });

    expect(result).toMatchObject({
      ok: true,
      code: 'EXECUTED',
      policyDecision: 'ask',
      approvalDecision: 'approved',
      approvalRequestId: 'verify-approval-1',
    });
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]).toMatchObject({ name: 'verify.run', effect: 'execute' });
    expect(approvalRequest?.binding).toEqual({ action: 'test' });
    expect(calls).toEqual([{
      context: { workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) },
      request: { action: 'test' },
    }]);
    expect(verifySummaries).toHaveLength(1);
    expect(verifySummaries[0]).toMatchObject({
      action: 'restricted_verify.run',
      workspaceId: 'verify-ws',
      resultCode: 'VERIFY_PASSED',
      metadata: { action: 'test', passed: true, exitCode: 0, truncated: false },
    });
    expect(JSON.stringify(verifySummaries)).not.toContain('RAW_SUMMARY_SECRET_SENTINEL');
  });
});

describe('Restricted Verify profile resolver', () => {
  it('resolves a declared pnpm script to node.exe plus fixed argv and a bounded safe environment', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-profile-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const appData = path.join(root, 'appdata');
    const nodeExecutable = path.join(root, 'node.exe');
    const pnpmCli = path.join(appData, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    fs.mkdirSync(path.dirname(pnpmCli), { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(nodeExecutable, 'fake node', 'utf8');
    fs.writeFileSync(pnpmCli, 'fake pnpm', 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5',
      scripts: { test: 'vitest run' },
    }), 'utf8');

    const plan = resolveRestrictedVerifyProfile({
      workspaceRoot: canonical(workspaceRoot),
      action: 'test',
      nodeExecutable,
      hostEnvironment: {
        APPDATA: appData,
        SystemRoot: 'C:\\Windows',
        Path: 'C:\\Program Files\\nodejs',
        TEMP: path.join(root, 'temp'),
        SUD_D_RUNTIME_API_KEY: 'RAW_SECRET_MUST_NOT_REACH_VERIFY',
      },
    });

    expect(plan).toMatchObject({
      executablePath: nodeExecutable,
      args: [pnpmCli, 'run', 'test'],
      workingDirectory: canonical(workspaceRoot),
      shell: false,
    });
    expect(plan.environment).toMatchObject({
      APPDATA: appData,
      SystemRoot: 'C:\\Windows',
      Path: 'C:\\Program Files\\nodejs',
      TEMP: path.join(root, 'temp'),
    });
    expect(plan.environment).not.toHaveProperty('SUD_D_RUNTIME_API_KEY');
    expect(JSON.stringify(plan)).not.toMatch(/cmd\.exe|powershell|execute_shell_command/i);
  });
});
describe('Restricted Verify profile failures', () => {
  it('fails closed with a stable code for unsupported or missing project profiles', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-profile-deny-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const nodeExecutable = path.join(root, 'node.exe');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(nodeExecutable, 'fake node', 'utf8');

    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      packageManager: 'yarn@4.0.0', scripts: { test: 'vitest run' },
    }), 'utf8');
    expect(() => resolveRestrictedVerifyProfile({
      workspaceRoot: canonical(workspaceRoot), action: 'test', nodeExecutable, hostEnvironment: {},
    })).toThrow(expect.objectContaining({ code: 'VERIFY_PROFILE_UNAVAILABLE' }));

    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5', scripts: {},
    }), 'utf8');
    expect(() => resolveRestrictedVerifyProfile({
      workspaceRoot: canonical(workspaceRoot), action: 'build', nodeExecutable,
      hostEnvironment: { APPDATA: path.join(root, 'appdata') },
    })).toThrow(expect.objectContaining({ code: 'VERIFY_PROFILE_UNAVAILABLE' }));
  });
});
describe('Restricted Verify bounded process runner', () => {
  it('captures bounded useful output while redacting secret-shaped lines', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-process-'));
    tempDirs.push(root);
    const plan = {
      executablePath: process.execPath,
      args: ['-e', "console.log('verification ok'); console.error('TOKEN=RAW_VERIFY_SECRET_SENTINEL'); console.log('x'.repeat(5000));"],
      workingDirectory: root,
      environment: { ...process.env, NO_COLOR: '1' },
      shell: false as const,
    };

    const result = await runRestrictedVerifyProcess(plan, { maxOutputBytes: 1024, timeoutMs: 5_000 });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('verification ok');
    expect(result.output).toContain('[REDACTED]');
    expect(result.output).not.toContain('RAW_VERIFY_SECRET_SENTINEL');
    expect(Buffer.byteLength(result.output, 'utf8')).toBeLessThanOrEqual(1024);
    expect(result.truncated).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
describe('Restricted Verify process failures', () => {
  it('maps spawn and timeout failures to stable Restricted Verify codes', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-process-failure-'));
    tempDirs.push(root);
    const basePlan = {
      workingDirectory: root,
      environment: { ...process.env, NO_COLOR: '1' },
      shell: false as const,
    };

    const spawnFailure = runRestrictedVerifyProcess({
      ...basePlan,
      executablePath: path.join(root, 'RAW_HOST_PATH_SENTINEL.exe'),
      args: [],
    }, { maxOutputBytes: 1024, timeoutMs: 1_000 });
    await expect(spawnFailure).rejects.toMatchObject({ code: 'VERIFY_PROCESS_START_FAILED' });
    await spawnFailure.catch((error: unknown) => {
      expect(JSON.stringify(error)).not.toContain('RAW_HOST_PATH_SENTINEL');
    });

    const timeoutScript = path.join(root, 'timeout-tree.cjs');
    const pidFile = path.join(root, 'timeout-pids.json');
    fs.writeFileSync(timeoutScript, [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync('timeout-pids.json', JSON.stringify([process.pid, child.pid]));",
      "setInterval(() => {}, 1000);",
    ].join('\n'), 'utf8');
    await expect(runRestrictedVerifyProcess({
      ...basePlan,
      executablePath: testNodeExecutable(),
      args: [timeoutScript],
    }, { maxOutputBytes: 1024, timeoutMs: 2_000 })).rejects.toMatchObject({ code: 'VERIFY_TIMEOUT' });
    const pids = JSON.parse(fs.readFileSync(pidFile, 'utf8')) as number[];
    expect(pids).toHaveLength(2);
    for (const pid of pids) await waitForPidExit(pid);
  });
});
describe('Restricted Verify infrastructure adapter', () => {
  it('composes the fixed profile and bounded runner without exposing process controls', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-adapter-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    const appData = path.join(root, 'appdata');
    const pnpmCli = path.join(appData, 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs');
    fs.mkdirSync(path.dirname(pnpmCli), { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(pnpmCli, "console.log('fixed verify adapter ok');", 'utf8');
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({
      packageManager: 'pnpm@10.34.5', scripts: { test: 'unused-by-fake-cli' },
    }), 'utf8');
    const adapter = createRestrictedVerifyAdapter({
      nodeExecutable: testNodeExecutable(),
      hostEnvironment: { APPDATA: appData, SystemRoot: process.env['SystemRoot'], Path: process.env['Path'] },
      limits: { maxOutputBytes: 2048, timeoutMs: 5_000 },
    });

    const result = await adapter.run({ workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) }, { action: 'test' });

    expect(result).toMatchObject({ action: 'test', passed: true, exitCode: 0, truncated: false });
    expect(result.output).toContain('fixed verify adapter ok');
    expect(Object.keys(adapter)).toEqual(['run']);
  });

  it('runs fixed diff_check against the active Git worktree without requiring a package script', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-diff-check-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ packageManager: 'pnpm@10.34.5', scripts: {} }), 'utf8');
    execFileSync('git', ['init', '-q'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Fixture User'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), 'base\n', 'utf8');
    execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), 'trailing whitespace   \n', 'utf8');

    const adapter = createRestrictedVerifyAdapter();
    const result = await adapter.run(
      { workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) },
      { action: 'diff_check' },
    );

    expect(result).toMatchObject({ action: 'diff_check', passed: false, exitCode: 1, truncated: false });
    expect(result.output).toBe('git diff --check found whitespace errors');
    expect(JSON.stringify(result)).not.toContain('trailing whitespace');
  });

  it('treats Windows CRLF normalization as clean in fixed diff_check', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-crlf-check-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Fixture User'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), 'base\n', 'utf8');
    execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), 'base\r\n', 'utf8');

    const result = await createRestrictedVerifyAdapter().run(
      { workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) },
      { action: 'diff_check' },
    );

    expect(result).toMatchObject({ action: 'diff_check', passed: true, exitCode: 0, truncated: false });
  });

  it('ignores pre-existing secret signatures when the changed lines are safe', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-secret-existing-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Fixture User'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: workspaceRoot, windowsHide: true });
    const secretSentinel = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), `${secretSentinel}\nbefore\n`, 'utf8');
    execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), `${secretSentinel}\nbefore\nafter safe edit\n`, 'utf8');

    const adapter = createRestrictedVerifyAdapter();
    const result = await adapter.run(
      { workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) },
      { action: 'secret_scan' },
    );

    expect(result).toMatchObject({ action: 'secret_scan', passed: true, exitCode: 0, truncated: false });
    expect(result.output).toBe('secret signature scan passed');
  });

  it('runs a bounded changed-content secret signature scan without returning matched secret text', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-secret-scan-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.name', 'Fixture User'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: workspaceRoot, windowsHide: true });
    fs.writeFileSync(path.join(workspaceRoot, 'tracked.txt'), 'base\n', 'utf8');
    execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: workspaceRoot, windowsHide: true });
    execFileSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: workspaceRoot, windowsHide: true });
    const secretSentinel = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    fs.writeFileSync(path.join(workspaceRoot, 'notes.txt'), `safe preface\n${secretSentinel}\n`, 'utf8');

    const adapter = createRestrictedVerifyAdapter();
    const result = await adapter.run(
      { workspaceId: 'verify-ws', canonicalRoot: canonical(workspaceRoot) },
      { action: 'secret_scan' },
    );

    expect(result).toMatchObject({ action: 'secret_scan', passed: false, exitCode: 1, truncated: false });
    expect(result.output).toBe('secret signature scan found 1 suspect file');
    expect(JSON.stringify(result)).not.toContain(secretSentinel);
  });
});
describe('Restricted Verify capability failures', () => {
  it('maps verifier infrastructure failure to its stable app error code', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-cap-failure-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}', 'utf8');
    const workspaceRepo = fakeWorkspaceRepo(makeWorkspace(workspaceRoot));
    const capabilities = createRestrictedVerifyCapabilities({
      workspaceRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      restrictedVerify: {
        async run() { throw new RestrictedVerifyFailure('VERIFY_PROFILE_UNAVAILABLE'); },
      },
    });
    const registry = createToolCapabilityRegistry(capabilities);
    if (!registry.ok) throw new Error('registry failed');
    const kernel = createToolKernel({
      registry: registry.value,
      audit: { append: () => undefined },
      approval: { authorize: () => ({ ok: true, state: 'approved', requestId: 'verify-failure-approval' }) },
    });

    const result = await kernel.invoke({
      invocationId: 'verify-failure-invocation',
      session: { id: 'verify-session', type: 'mcp-stdio' },
      capability: 'verify.run',
      input: { action: 'build' },
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'EXECUTION_FAILED',
      policyDecision: 'ask',
      causeCode: 'VERIFY_PROFILE_UNAVAILABLE',
    });
  });
});
describe('Restricted Verify failure summaries', () => {
  it('persists only stable sanitized failure classification without raw verifier errors or output', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-failure-summary-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}', 'utf8');
    const workspaceRepo = fakeWorkspaceRepo(makeWorkspace(workspaceRoot));
    const summaries: unknown[] = [];
    let attempt = 0;
    const capabilities = createRestrictedVerifyCapabilities({
      workspaceRepo,
      internalRoots: [],
      fileSystem: createWorkspaceTextFileSystem(),
      restrictedVerify: {
        async run() {
          attempt += 1;
          if (attempt === 1) throw new RestrictedVerifyFailure('VERIFY_TIMEOUT');
          throw new Error('RAW_VERIFY_SECRET_SENTINEL TOKEN=secret stdout=raw stderr=raw');
        },
      },
      summaryAudit: { append: (event) => { summaries.push(event); } },
    });
    const registry = createToolCapabilityRegistry(capabilities);
    if (!registry.ok) throw new Error('registry failed');
    const kernel = createToolKernel({
      registry: registry.value,
      audit: { append: () => undefined },
      approval: { authorize: () => ({ ok: true, state: 'approved', requestId: `verify-failure-summary-${attempt}` }) },
    });
    const invoke = (action: 'test' | 'build') => kernel.invoke({
      invocationId: `verify-failure-summary-${action}`,
      session: { id: 'verify-session', type: 'mcp-stdio' },
      capability: 'verify.run',
      input: { action },
    });
    await expect(invoke('build')).resolves.toMatchObject({
      ok: false,
      code: 'EXECUTION_FAILED',
      causeCode: 'VERIFY_TIMEOUT',
      policyDecision: 'ask',
    });
    await expect(invoke('test')).resolves.toMatchObject({
      ok: false,
      code: 'EXECUTION_FAILED',
      causeCode: 'INTERNAL_ERROR',
      policyDecision: 'ask',
    });
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toMatchObject({
      action: 'restricted_verify.run',
      workspaceId: 'verify-ws',
      resultCode: 'VERIFY_TIMEOUT',
      metadata: { action: 'build', passed: false },
    });
    expect(summaries[1]).toMatchObject({
      action: 'restricted_verify.run',
      workspaceId: 'verify-ws',
      resultCode: 'INTERNAL_ERROR',
      metadata: { action: 'test', passed: false },
    });
    expect(JSON.stringify(summaries)).not.toMatch(/RAW_VERIFY_SECRET_SENTINEL|TOKEN=secret|stdout=raw|stderr=raw|output/i);
  });
});

describe('Restricted Verify surface hardening', () => {
  it('contains no hidden generic shell or raw upstream selector fallback', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'packages/infrastructure/src/restricted-verify-adapter.ts'), 'utf8');
    expect(source).not.toMatch(/shell:\s*true|cmd\.exe|powershell\.exe|execute_shell_command|write_memory|safe_delete_symbol|replace_symbol_body|callTool/i);
    expect(source).not.toMatch(/\bexec(?:Sync)?\s*\(/);
  });
});

describe('Restricted Verify Workspace security', () => {
  it('fails closed for InternalRoot and active-Workspace swap before verifier dispatch', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-verify-workspace-security-'));
    tempDirs.push(root);
    const workspaceRoot = path.join(root, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{}', 'utf8');

    let dispatches = 0;
    const restrictedVerify: RestrictedVerifyPort = {
      async run(_context, request) {
        dispatches += 1;
        return { action: request.action, passed: true, exitCode: 0, output: '', truncated: false, durationMs: 1 };
      },
    };

    const internalRepo = fakeWorkspaceRepo(makeWorkspace(workspaceRoot));
    const internalCapabilities = createRestrictedVerifyCapabilities({
      workspaceRepo: internalRepo,
      internalRoots: [{ canonicalPath: canonical(workspaceRoot), label: 'test internal root' }],
      fileSystem: createWorkspaceTextFileSystem(),
      restrictedVerify,
    });
    const internalRegistry = createToolCapabilityRegistry(internalCapabilities);
    if (!internalRegistry.ok) throw new Error('registry failed');
    const internalKernel = createToolKernel({
      registry: internalRegistry.value,
      audit: { append: () => undefined },
      approval: { authorize: () => ({ ok: true, state: 'approved', requestId: 'never-used' }) },
    });
    const internal = await internalKernel.invoke({
      invocationId: 'verify-internal', session: { id: 'verify-session', type: 'mcp-stdio' },
      capability: 'verify.run', input: { action: 'test' },
    });
    expect(internal).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });

    const swapRepo = fakeWorkspaceRepo(makeWorkspace(workspaceRoot));
    const swapCapabilities = createRestrictedVerifyCapabilities({
      workspaceRepo: swapRepo, internalRoots: [], fileSystem: createWorkspaceTextFileSystem(), restrictedVerify,
    });
    const swapRegistry = createToolCapabilityRegistry(swapCapabilities);
    if (!swapRegistry.ok) throw new Error('registry failed');
    const swapKernel = createToolKernel({
      registry: swapRegistry.value,
      audit: {
        append(event) {
          if (event.resultCode === 'EXECUTION_AUTHORIZED') swapRepo.current = { ...swapRepo.current, id: 'verify-ws-swapped' };
        },
      },
      approval: { authorize: () => ({ ok: true, state: 'approved', requestId: 'verify-swap-approval' }) },
    });
    const swapped = await swapKernel.invoke({
      invocationId: 'verify-swap', session: { id: 'verify-session', type: 'mcp-stdio' },
      capability: 'verify.run', input: { action: 'lint' },
    });
    expect(swapped).toMatchObject({ ok: false, code: 'EXECUTION_FAILED', causeCode: 'WORKSPACE_NOT_FOUND' });
    expect(dispatches).toBe(0);
  });
});