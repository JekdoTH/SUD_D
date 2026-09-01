import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import {
  createToolCapabilityRegistry,
  createToolKernel,
  defineToolCapability,
} from '@sud-d/application';
import {
  appError,
  classifySensitivity,
  err,
  ok,
  type AppError,
  type AuditEvent,
  type ClientSession,
  type Result,
  type ToolExecutionContext,
} from '@sud-d/domain';
import {
  createInertMcpGateway,
  createStdioGatewayTransport,
} from '@sud-d/mcp-gateway';
import type { ToolKernelAuditPort } from '@sud-d/application';

const SESSION: ClientSession = { id: 'session-m1', type: 'mcp-stdio' };
const SECRET = 'credential_m1_test_secret_value_must_not_leak_0001';

class RecordingAudit implements ToolKernelAuditPort {
  readonly events: Array<Omit<AuditEvent, 'id'>> = [];
  private appendCount = 0;

  constructor(private readonly failOnAppend?: number) {}

  append(event: Omit<AuditEvent, 'id'>): void {
    this.appendCount += 1;
    if (this.appendCount === this.failOnAppend) {
      throw new Error(`audit raw failure ${SECRET}`);
    }
    this.events.push(event);
  }
}

function registryOrThrow(
  definitions: ReadonlyArray<ReturnType<typeof defineToolCapability>>,
) {
  const result = createToolCapabilityRegistry(definitions);
  if (!result.ok) throw new Error(`registry setup failed: ${result.error.code}`);
  return result.value;
}

type TestExecute = (
  input: { path: string; [key: string]: unknown },
  context: ToolExecutionContext,
) => Result<unknown, AppError> | Promise<Result<unknown, AppError>>;

function makeAllowCapability(
  execute: TestExecute = () => ok({ value: 'done' }),
) {
  return defineToolCapability({
    name: 'test.read',
    effect: 'read',
    validate(input: unknown) {
      if (!input || typeof input !== 'object' || !('path' in input)) {
        return err(appError('VALIDATION_FAILED', 'Invalid test input'));
      }
      return ok(input as { path: string; [key: string]: unknown });
    },
    resolveSecurity(input) {
      return ok({
        sensitivity: classifySensitivity(input.path),
        context: 'workspace' as const,
        workspaceId: 'workspace-1',
      });
    },
    execute,
  });
}

function invokeInput(input: unknown, capability = 'test.read') {
  return {
    invocationId: 'invocation-1',
    session: SESSION,
    capability,
    input,
  };
}

function serialized(value: unknown): string {
  return JSON.stringify(value);
}

function createJsonLineReader(stream: NodeJS.ReadableStream) {
  let buffer = '';
  const queue: unknown[] = [];
  const waiters: Array<(message: unknown) => void> = [];
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const newline = buffer.indexOf('\n');
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const parsed = JSON.parse(line) as unknown;
      const waiter = waiters.shift();
      if (waiter) waiter(parsed);
      else queue.push(parsed);
    }
  });
  return {
    next(timeoutMs = 2000): Promise<unknown> {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for MCP response')), timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

describe('M1 — Tool Execution Kernel', () => {
  it('executes a registered ALLOW capability exactly once', async () => {
    const execute = vi.fn(() => ok({ value: 'done' }));
    const audit = new RecordingAudit();
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit });

    const result = await kernel.invoke(invokeInput({ path: 'notes.txt' }));

    expect(result).toMatchObject({ ok: true, outcome: 'executed', code: 'EXECUTED', policyDecision: 'allow' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('DENY never executes', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const capability = defineToolCapability({
      name: 'test.outside',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({ sensitivity: 'normal', context: 'outside_workspace' as const }),
      execute,
    });
    const kernel = createToolKernel({ registry: registryOrThrow([capability]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({}, 'test.outside'));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'POLICY_DENIED', policyDecision: 'deny' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('ASK never executes and returns approval-required', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const capability = defineToolCapability({
      name: 'test.delete',
      effect: 'delete',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({ sensitivity: 'normal', context: 'workspace' as const }),
      execute,
    });
    const kernel = createToolKernel({ registry: registryOrThrow([capability]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({}, 'test.delete'));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('unknown capability fails closed without auditing the raw requested name', async () => {
    const audit = new RecordingAudit();
    const kernel = createToolKernel({ registry: registryOrThrow([]), audit });

    const result = await kernel.invoke(invokeInput({ token: SECRET }, SECRET));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'UNKNOWN_CAPABILITY' });
    expect(serialized(audit.events)).not.toContain(SECRET);
  });

  it('invalid input fails closed', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({ wrong: true }));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'INVALID_INPUT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('untrusted input cannot override trusted effect or security metadata', async () => {
    const execute = vi.fn(() => ok('trusted-handler'));
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({
      path: 'notes.txt',
      effect: 'delete',
      sensitivity: 'credential',
      context: 'network',
      policyDecision: 'allow',
    }));

    expect(result).toMatchObject({ ok: true, outcome: 'executed', code: 'EXECUTED', policyDecision: 'allow' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('untrusted input cannot select executor or handler', async () => {
    const trustedExecute = vi.fn(() => ok('trusted'));
    const untrustedExecute = vi.fn(() => ok('untrusted'));
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(trustedExecute)]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({
      path: 'notes.txt',
      executor: untrustedExecute,
      handler: untrustedExecute,
    }));

    expect(result).toMatchObject({ ok: true, code: 'EXECUTED' });
    expect(trustedExecute).toHaveBeenCalledTimes(1);
    expect(untrustedExecute).not.toHaveBeenCalled();
  });

  it('classification/security resolution failure never executes', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const capability = defineToolCapability({
      name: 'test.resolution-failure',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => err(appError('INTERNAL_ERROR', `resolver leaked ${SECRET}`)),
      execute,
    });
    const kernel = createToolKernel({ registry: registryOrThrow([capability]), audit: new RecordingAudit() });

    const result = await kernel.invoke(invokeInput({}, 'test.resolution-failure'));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'SECURITY_RESOLUTION_FAILED', causeCode: 'INTERNAL_ERROR' });
    expect(serialized(result)).not.toContain(SECRET);
    expect(execute).not.toHaveBeenCalled();
  });

  it('policy exception fails closed without execution or raw leakage', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const audit = new RecordingAudit();
    const capability = defineToolCapability({
      name: 'test.policy-failure',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({
        get sensitivity(): 'normal' {
          throw new Error(`policy raw failure ${SECRET}`);
        },
        context: 'workspace' as const,
      }),
      execute,
    });
    const kernel = createToolKernel({ registry: registryOrThrow([capability]), audit });

    const result = await kernel.invoke(invokeInput({}, 'test.policy-failure'));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'POLICY_EVALUATION_FAILED' });
    expect(serialized(result)).not.toContain(SECRET);
    expect(serialized(audit.events)).not.toContain(SECRET);
    expect(execute).not.toHaveBeenCalled();
  });

  it('executor exception maps to a safe typed failure without raw leakage', async () => {
    const audit = new RecordingAudit();
    const execute = vi.fn(() => {
      throw new Error(`executor raw failure ${SECRET}`);
    });
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit });

    const result = await kernel.invoke(invokeInput({ path: 'notes.txt', secret: SECRET }));

    expect(result).toMatchObject({ ok: false, outcome: 'executed', code: 'EXECUTION_FAILED' });
    expect(serialized(result)).not.toContain(SECRET);
    expect(serialized(audit.events)).not.toContain(SECRET);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('policy outcome is safely audited', async () => {
    const audit = new RecordingAudit();
    const capability = defineToolCapability({
      name: 'test.denied',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({ sensitivity: 'normal', context: 'internal_root' as const }),
      execute: vi.fn(() => ok('should-not-run')),
    });
    const kernel = createToolKernel({ registry: registryOrThrow([capability]), audit });

    await kernel.invoke(invokeInput({ path: SECRET }, 'test.denied'));

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      action: 'tool_kernel.invoke',
      policyDecision: 'deny',
      resultCode: 'POLICY_DENIED',
      metadata: { capability: 'test.denied', outcome: 'blocked' },
    });
  });

  it('blocked invocation is audited without raw input leakage', async () => {
    const audit = new RecordingAudit();
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability()]), audit });

    await kernel.invoke(invokeInput({ secret: SECRET }));

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ resultCode: 'INVALID_INPUT' });
    expect(serialized(audit.events)).not.toContain(SECRET);
  });

  it('successful invocation is audited with safe outcome and session metadata', async () => {
    const audit = new RecordingAudit();
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability()]), audit });

    await kernel.invoke(invokeInput({ path: 'notes.txt', secret: SECRET }));

    expect(audit.events).toHaveLength(2);
    expect(audit.events[0]).toMatchObject({
      sessionId: SESSION.id,
      sessionType: SESSION.type,
      policyDecision: 'allow',
      resultCode: 'EXECUTION_AUTHORIZED',
      workspaceId: 'workspace-1',
      metadata: { capability: 'test.read', phase: 'pre_execution', outcome: 'authorized' },
    });
    expect(audit.events[1]).toMatchObject({
      sessionId: SESSION.id,
      sessionType: SESSION.type,
      policyDecision: 'allow',
      resultCode: 'EXECUTED',
      workspaceId: 'workspace-1',
      metadata: { capability: 'test.read', phase: 'outcome', outcome: 'executed' },
    });
    expect(serialized(audit.events)).not.toContain(SECRET);
  });

  it('pre-execution audit failure prevents execution', async () => {
    const execute = vi.fn(() => ok('should-not-run'));
    const audit = new RecordingAudit(1);
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit });

    const result = await kernel.invoke(invokeInput({ path: 'notes.txt' }));

    expect(result).toMatchObject({ ok: false, outcome: 'blocked', code: 'AUDIT_PRECONDITION_FAILED', policyDecision: 'allow' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('post-execution audit failure does not retry an already executed operation', async () => {
    const execute = vi.fn(() => ok('done'));
    const audit = new RecordingAudit(2);
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit });

    const result = await kernel.invoke(invokeInput({ path: 'notes.txt' }));

    expect(result).toMatchObject({ ok: false, outcome: 'executed', code: 'AUDIT_OUTCOME_FAILED', policyDecision: 'allow' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({ resultCode: 'EXECUTION_AUTHORIZED' });
  });

  it('duplicate and invalid trusted registration fail deterministically', () => {
    const one = makeAllowCapability();
    const duplicate = makeAllowCapability();
    const duplicateResult = createToolCapabilityRegistry([one, duplicate]);
    expect(duplicateResult).toMatchObject({ ok: false, error: { code: 'DUPLICATE_CAPABILITY_REGISTRATION' } });

    const invalid = defineToolCapability({
      name: 'INVALID CAPABILITY NAME',
      effect: 'read',
      validate: (input: unknown) => ok(input),
      resolveSecurity: () => ok({ sensitivity: 'normal', context: 'workspace' as const }),
      execute: () => ok('unused'),
    });
    const invalidResult = createToolCapabilityRegistry([invalid]);
    expect(invalidResult).toMatchObject({ ok: false, error: { code: 'INVALID_CAPABILITY_REGISTRATION' } });
  });

  it('credential-like/raw secret values never appear in audit or safe failures', async () => {
    const audit = new RecordingAudit();
    const execute = vi.fn(() => err(appError('INTERNAL_ERROR', `raw handler ${SECRET}`, { secret: SECRET })));
    const kernel = createToolKernel({ registry: registryOrThrow([makeAllowCapability(execute)]), audit });

    const result = await kernel.invoke(invokeInput({ path: 'notes.txt', credential: SECRET }));

    expect(result).toMatchObject({ ok: false, outcome: 'executed', code: 'EXECUTION_FAILED', causeCode: 'INTERNAL_ERROR' });
    expect(serialized(result)).not.toContain(SECRET);
    expect(serialized(audit.events)).not.toContain(SECRET);
  });

  it('production MCP Gateway remains inert with tools/list = []', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const reader = createJsonLineReader(output);
    const gateway = createInertMcpGateway();
    await gateway.start(createStdioGatewayTransport(input, output));

    input.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'sud-d-m1-test', version: '1.0.0' },
      },
    })}\n`);
    await reader.next();
    input.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);

    await expect(reader.next()).resolves.toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: { tools: [] },
    });
    await gateway.stop();
  });
});
