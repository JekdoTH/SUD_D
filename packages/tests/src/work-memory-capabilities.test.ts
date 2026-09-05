import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createToolCapabilityRegistry,
  createToolKernel,
  createWorkMemoryCapabilities,
  type WorkMemoryService,
} from '@sud-d/application';
import {
  canonicalizePath,
  createWorkspaceTextFileSystem,
  type WorkspaceRepository,
} from '@sud-d/infrastructure';
import { ok, type WorkResumeContext, type Workspace } from '@sud-d/domain';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); });
function canonical(value: string): string { const result = canonicalizePath(value); if (!result.ok) throw new Error('canonicalize'); return result.value; }
function workspace(root: string): Workspace { return { id: 'ws-a', displayName: 'A', canonicalRoot: canonical(root), isActive: true, createdAt: new Date(), updatedAt: new Date() }; }
function repo(ws: Workspace): WorkspaceRepository {
  return { list: () => [ws], findById: (id) => id === ws.id ? ws : undefined, findByCanonicalRoot: () => ws, save: () => ws, setActive: () => undefined, remove: () => undefined };
}
function context(workspaceId: string): WorkResumeContext {
  return { checkpointId: 'cp-1', workspaceId, goal: 'Goal', task: { title: 'Task', status: 'in_progress' }, completed: [], decisions: [], blockers: [], nextAction: 'Next', artifacts: [], verification: [], updatedAt: '2026-09-05T00:00:00.000Z' };
}
function makeService(calls: string[]): WorkMemoryService {
  return {
    resume(_session, ws) { calls.push('resume'); return ok({ workspaceId: ws.id, git: { supported: false, drifted: false, headChanged: false, statusChanged: false } }); },
    checkpoint(_session, ws) { calls.push('checkpoint'); return ok({ context: context(ws.id) }); },
    requireResumed() { return ok(undefined); },
  };
}
async function invoke(capabilities: ReturnType<typeof createWorkMemoryCapabilities>, capability: string, input: unknown) {
  const registry = createToolCapabilityRegistry(capabilities); if (!registry.ok) throw new Error('registry');
  const kernel = createToolKernel({ registry: registry.value, audit: { append: () => undefined } });
  return kernel.invoke({ invocationId: `inv-${capability}`, session: { id: 'session-a', type: 'mcp-stdio' }, capability, input });
}

describe('Work Memory Tool Kernel capabilities', () => {
  it('exposes exactly work.resume and work.checkpoint through normal Workspace policy', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-work-cap-')); roots.push(base);
    const wsRoot = path.join(base, 'workspace'); fs.mkdirSync(path.join(wsRoot, 'src'), { recursive: true }); fs.writeFileSync(path.join(wsRoot, 'src', 'a.ts'), 'export {}');
    const calls: string[] = [];
    const capabilities = createWorkMemoryCapabilities({ workspaceRepo: repo(workspace(wsRoot)), internalRoots: [], fileSystem: createWorkspaceTextFileSystem(), workMemory: makeService(calls) });
    expect(capabilities.map((item) => ({ name: item.name, effect: item.effect }))).toEqual([{ name: 'work.resume', effect: 'read' }, { name: 'work.checkpoint', effect: 'modify' }]);
    expect(await invoke(capabilities, 'work.resume', {})).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    const checkpoint = await invoke(capabilities, 'work.checkpoint', {
      goal: 'Goal', task: { title: 'Task', status: 'in_progress' }, completed: [], decisions: [], blockers: [], nextAction: 'Next', artifacts: ['src/a.ts'], verification: [],
    });
    expect(checkpoint).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'allow' });
    expect(calls).toEqual(['resume', 'checkpoint']);
  });

  it('rejects malformed, oversized, secret-like, cross-Workspace and raw-selector input before persistence', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-work-cap-deny-')); roots.push(base);
    const wsRoot = path.join(base, 'workspace'); fs.mkdirSync(wsRoot, { recursive: true });
    const calls: string[] = [];
    const capabilities = createWorkMemoryCapabilities({ workspaceRepo: repo(workspace(wsRoot)), internalRoots: [], fileSystem: createWorkspaceTextFileSystem(), workMemory: makeService(calls) });
    const valid = { goal: 'Goal', task: { title: 'Task', status: 'in_progress' }, completed: [], decisions: [], blockers: [], nextAction: 'Next', artifacts: [], verification: [] };
    const aggregateTooLarge = { ...valid, completed: Array(20).fill('c'.repeat(500)), decisions: Array(20).fill('d'.repeat(500)), blockers: Array(10).fill('b'.repeat(500)), verification: Array(20).fill('v'.repeat(500)), artifacts: Array.from({ length: 50 }, (_, index) => `${'a'.repeat(1018)}${String(index).padStart(2, '0')}.ts`) };
    for (const input of [
      null,
      { ...valid, task: { title: 'Task' } },
      { ...valid, task: { title: 'Task', status: 'invalid' } },
      { ...valid, task: { title: 'x'.repeat(1_001), status: 'in_progress' } },
      { ...valid, completed: ['x'.repeat(501)] },
      { ...valid, nextAction: 'x'.repeat(1_001) },
      aggregateTooLarge,
      { ...valid, transcript: 'raw chat' },
      { ...valid, key: 'arbitrary', value: 'memory' },
      { ...valid, workspaceId: 'ws-b' },
      { ...valid, workspaceRoot: 'C:\\outside' },
      { ...valid, table: 'work_memory_checkpoints' },
      { ...valid, storagePath: 'C:\\outside\\memory.db' },
      { ...valid, dbPath: 'C:\\outside\\memory.db' },
      { ...valid, database: 'other.db' },
      { ...valid, memoryKey: 'arbitrary' },
      { ...valid, serenaTool: 'write_memory' },
      { ...valid, serenaMemoryTool: 'read_memory' },
      { ...valid, upstreamTool: 'write_memory' },
      { ...valid, toolName: 'write_memory' },
      { ...valid, toolName: 'execute_shell_command' },
      { ...valid, stdout: 'RAW_TOOL_OUTPUT_SENTINEL' },
      { ...valid, stderr: 'RAW_TOOL_ERROR_SENTINEL' },
      { ...valid, verifyOutput: 'RAW_VERIFY_OUTPUT_SENTINEL' },
      { ...valid, serenaOutput: 'RAW_SERENA_OUTPUT_SENTINEL' },
      { ...valid, toolResult: { content: 'RAW_TOOL_RESULT_SENTINEL' } },
      { ...valid, decisions: [`sk-${'A'.repeat(24)}`] },
      { ...valid, goal: 'x'.repeat(2_001) },
      { ...valid, completed: Array.from({ length: 21 }, (_, i) => `done ${i}`) },
      { ...valid, decisions: ['TOKEN=RAW_WORK_MEMORY_SECRET_SENTINEL'] },
      { ...valid, artifacts: ['..\\outside.txt'] },
      { ...valid, artifacts: ['C:\\outside.txt'] },
    ]) {
      const result = await invoke(capabilities, 'work.checkpoint', input);
      expect(result.ok).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('denies InternalRoot artifact paths before checkpoint dispatch', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-work-cap-internal-')); roots.push(base);
    const wsRoot = path.join(base, 'workspace'); const internal = path.join(wsRoot, 'internal'); fs.mkdirSync(internal, { recursive: true }); fs.writeFileSync(path.join(internal, 'state.txt'), 'x');
    const calls: string[] = [];
    const capabilities = createWorkMemoryCapabilities({ workspaceRepo: repo(workspace(wsRoot)), internalRoots: [{ canonicalPath: canonical(internal), label: 'internal' }], fileSystem: createWorkspaceTextFileSystem(), workMemory: makeService(calls) });
    const result = await invoke(capabilities, 'work.checkpoint', { goal: 'Goal', task: { title: 'Task', status: 'in_progress' }, completed: [], decisions: [], blockers: [], nextAction: 'Next', artifacts: ['internal/state.txt'], verification: [] });
    expect(result).toMatchObject({ ok: false, code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_PATH_DENIED' });
    expect(calls).toEqual([]);
  });
});
