import { afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  canonicalizePath,
  createApprovalRepository,
  createAuditRepository,
  createGitSafetyAdapter,
  createWorkspaceRepository,
  openDatabase,
  type Db,
  type GitCheckpointResult,
} from '@sud-d/infrastructure';
import {
  createApprovalCoordinator,
  createGitSafetyCapabilities,
  createToolCapabilityRegistry,
  createToolKernel,
} from '@sud-d/application';
import type { ToolKernelResult } from '@sud-d/domain';

export const GIT_TOOLS = ['git.detect', 'git.status', 'git.diff', 'git.checkpoint'] as const;
export const WORKSPACE_TOOLS = [
  'workspace.list',
  'workspace.stat',
  'workspace.read_text',
  'workspace.search_text',
  'workspace.create_text_file',
  'workspace.write_text_file',
] as const;
export const TEAM_TOOLS = ['team.start', 'team.status', 'team.submit', 'team.stop'] as const;
export const CODE_READ_TOOLS = ['code.overview', 'code.find_symbol', 'code.find_references', 'code.search', 'code.diagnostics'] as const;
export const CODE_WRITE_TOOLS = ['code.replace_symbol', 'code.insert_before', 'code.insert_after', 'code.rename'] as const;
export const VERIFY_TOOLS = ['verify.run'] as const;
export const APPROVED_TOOLS = [...WORKSPACE_TOOLS, ...GIT_TOOLS, ...TEAM_TOOLS, ...CODE_READ_TOOLS, ...CODE_WRITE_TOOLS, ...VERIFY_TOOLS].sort();
export const LEGACY_PROTOCOL_VERSION = '2025-06-18';

const tempDirs: string[] = [];
const openDbs: Db[] = [];
let invocationCounter = 0;

export interface RpcMessage {
  readonly id?: number;
  readonly result?: {
    readonly tools?: Array<{ readonly name?: string }>;
    readonly content?: Array<{ readonly type?: string; readonly text?: string }>;
  };
  readonly error?: unknown;
}

export function tempDir(prefix = 'sudd-git-safety-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function git(cwd: string, args: readonly string[], input?: string): string {
  return execFileSync('git', [...args], {
    cwd,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function gitCode(cwd: string, args: readonly string[], input?: string): number {
  const result = spawnSync('git', [...args], {
    cwd,
    input,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status ?? 1;
}

export function initRepo(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Fixture User']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'base\n', 'utf8');
  git(root, ['add', '--', 'tracked.txt']);
  git(root, ['commit', '-q', '-m', 'fixture']);
}

function canonical(value: string): string {
  const result = canonicalizePath(value);
  if (!result.ok) throw new Error(`canonicalize failed: ${value}`);
  return result.value;
}

function openTrackedDb(filePath: string): Db {
  const db = openDatabase(filePath);
  openDbs.push(db);
  return db;
}

export function kernelValue<T>(result: ToolKernelResult): T {
  if (!result.ok) throw new Error(`expected executed result, got ${result.code}/${result.causeCode ?? ''}`);
  return result.value as T;
}

export type CreatedGitCheckpoint = GitCheckpointResult & {
  readonly created: true;
  readonly checkpointRef: string;
  readonly commitSha: string;
  readonly parentHead: string;
  readonly capturedPathCount: number;
};

export function requireCreatedCheckpoint(result: GitCheckpointResult): CreatedGitCheckpoint {
  if (
    result.created !== true
    || !result.checkpointRef
    || !result.commitSha
    || !result.parentHead
    || result.capturedPathCount === undefined
  ) {
    throw new Error('expected created Git checkpoint result');
  }
  return result as CreatedGitCheckpoint;
}

afterEach(() => {
  for (const db of openDbs.splice(0)) {
    try { db.close(); } catch { /* best effort */ }
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

export async function makeHarness(options: { repo?: boolean; active?: boolean; workspaceRoot?: string } = {}) {
  const base = tempDir();
  const workspaceRoot = options.workspaceRoot ?? path.join(base, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  if (options.repo !== false) initRepo(workspaceRoot);

  const db = openTrackedDb(path.join(base, 'state', 'sud-d.db'));
  const workspaceRepo = createWorkspaceRepository(db);
  const auditRepo = createAuditRepository(db);
  const workspace = workspaceRepo.save('Git Safety', canonical(workspaceRoot));
  if (options.active !== false) workspaceRepo.setActive(workspace.id);
  const gitSafety = createGitSafetyAdapter();
  const capabilities = createGitSafetyCapabilities({ workspaceRepo, gitSafety });
  const registry = createToolCapabilityRegistry(capabilities);
  if (!registry.ok) throw new Error(`registry failure: ${registry.error.code}`);
  const approval = createApprovalCoordinator({ repository: createApprovalRepository(db) });
  const kernel = createToolKernel({ registry: registry.value, audit: auditRepo, approval });
  const invoke = (capability: string, input: unknown) => kernel.invoke({
    invocationId: `git-safety-${++invocationCounter}`,
    session: { id: 'git-safety-test', type: 'mcp-stdio' },
    capability,
    input,
  });
  return { base, workspaceRoot, db, workspaceRepo, auditRepo, workspace, gitSafety, capabilities, kernel, invoke };
}

export function createJsonLineReader(stream: NodeJS.ReadableStream) {
  let buffer = '';
  const queue: RpcMessage[] = [];
  const waiters: Array<(message: RpcMessage) => void> = [];
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line) as RpcMessage;
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else queue.push(message);
    }
  });
  return {
    next(timeoutMs = 3000): Promise<RpcMessage> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP timeout')), timeoutMs);
        waiters.push((message) => { clearTimeout(timer); resolve(message); });
      });
    },
  };
}

export function indexBytes(root: string): Buffer {
  return fs.readFileSync(path.join(root, '.git', 'index'));
}

export function checkpointRefs(root: string): string[] {
  const output = git(root, ['for-each-ref', '--format=%(refname)', 'refs/sud-d/checkpoints']);
  return output ? output.split(/\r?\n/).filter(Boolean).sort() : [];
}

export function treePaths(root: string, ref: string): string[] {
  const output = git(root, ['ls-tree', '-r', '--name-only', ref]);
  return output ? output.split(/\r?\n/).filter(Boolean).sort() : [];
}

export function blobExists(root: string, oid: string): boolean {
  return gitCode(root, ['cat-file', '-e', oid]) === 0;
}
