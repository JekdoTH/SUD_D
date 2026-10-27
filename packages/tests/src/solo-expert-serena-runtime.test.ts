import { describe, expect, it } from 'vitest';
import { SERENA_ENGINE_MANIFEST } from '../../infrastructure/src/serena-engine-manifest.js';
import { createManagedSerenaRuntime } from '../../infrastructure/src/serena-managed-runtime.js';
import { makeManagedSerenaConfigPlan } from '../../infrastructure/src/serena-managed-config.js';
import { createSoloExpertFixedAdapter } from '../../infrastructure/src/solo-expert-serena-fixed-adapter.js';
import { SOLO_B1_COMMAND } from '../../domain/src/solo-expert-serena.js';

const root = 'C:/b1-fixture';
const sha = (seed: string) => seed.repeat(64);
const identity = () => ({
  workspaceId: 'workspace-b1', canonicalRoot: root, workspaceGeneration: 'gen-1',
  managedEpoch: 'epoch-1', manifestDigest: sha('a'), artifactDigest: sha('b'),
  configDigest: sha('c'), schemaDigest: sha('d'), integrity: 'synthetic-fixture' as const,
});
const review = () => ({
  attemptId: 'b1-fixture-attempt',
  profileId: 'harmless-short-smoke' as const, profileRevision: 'b1-smoke-v1' as const,
  toolName: 'execute_shell_command' as const,
  commandDigest: sha('e'), recipeDigest: sha('f'),
  disclosureVersion: 'b1-cooperative-host-user-stock-logging-v1' as const,
  riskDisclosure: 'stock logging host user', privacy: 'stock-local-logging' as const,
  risk: 'sensitive' as const, effect: 'execute' as const,
  workspaceId: 'workspace-b1', canonicalRoot: root, rootDigest: sha('0'),
  workspaceGeneration: 'gen-1',
  session: { id: 'desktop-1', type: 'desktop' as const },
  gatewayEpoch: 'gw-1', managedEpoch: 'epoch-1',
  deviceLabel: 'device-1', deviceProvenance: 'unverified-observation' as const,
  accountLabel: 'account-1', accountProvenance: 'unverified-observation' as const,
  manifestDigest: sha('a'), artifactDigest: sha('b'), configDigest: sha('c'),
  schemaDigest: sha('d'), issuedAtMs: 10, expiresAtMs: 90010,
  waitMs: 5000 as const, maxAnswerChars: 2048 as const, maxCalls: 1 as const, maxRetries: 0 as const,
});
const good = () => ({ isError: false, content: [{ type: 'text', text: JSON.stringify({
  return_code: 0, stdout: 'SUD_D_B1_OK\r\n', stderr: '', cwd: root,
}) }] });

describe('B1a fixed adapter and runtime ready-only fake', () => {
  it('never starts absent session, and cannot reach lazy start through fixed path', async () => {
    const runtime = createManagedSerenaRuntime({ dataRoot: 'C:/not-used' });
    expect(runtime.inspectSoloExpertReadyOnly()).toBeUndefined();
    expect(await runtime.callSoloExpertReadyOnly(review())).toMatchObject({
      executionKind: 'mock', status: 'not-ready',
    });
  });
  it('requires a separately injected, ready-only synthetic fake session', async () => {
    const calls: unknown[] = [];
    const runtime = createManagedSerenaRuntime({
      dataRoot: 'C:/not-used',
      soloExpertFixture: { receipt: identity(), session: {
        callTool: async request => { calls.push(request); return good(); },
      }, toolSchema: SERENA_ENGINE_MANIFEST.expectedToolInputSchemas.execute_shell_command,
      serverName: 'Serena', handshakeVersion: 'not-the-package-version',
      packageVersion: '1.7.0' },
    });
    expect(runtime.inspectSoloExpertReadyOnly()).toEqual(identity());
    expect(await runtime.callSoloExpertReadyOnly(review())).toMatchObject({
      executionKind: 'mock', status: 'simulated-success', exitCode: 0,
    });
    expect(calls).toEqual([{ name: 'execute_shell_command', arguments: {
      command: SOLO_B1_COMMAND, cwd: root, capture_stderr: true, max_answer_chars: 2048,
    } }]);
  });
  it('denies wrong schema/version/integrity/epoch before calling fake tool', async () => {
    for (const mutation of [
      { toolSchema: {} },
      { packageVersion: '1.8.0' },
      { serverName: 'Unexpected' },
      { receipt: { ...identity(), integrity: 'unverified' as const } },
      { receipt: { ...identity(), managedEpoch: 'different' } },
    ]) {
      let count = 0;
      const runtime = createManagedSerenaRuntime({
        dataRoot: 'C:/not-used',
        soloExpertFixture: { receipt: identity(), session: { callTool: async () => { count++; return good(); } },
          toolSchema: SERENA_ENGINE_MANIFEST.expectedToolInputSchemas.execute_shell_command,
          serverName: 'Serena', handshakeVersion: 'server-0.6', packageVersion: '1.7.0',
          ...mutation },
      });
      const result = await runtime.callSoloExpertReadyOnly(review());
      expect(result).toMatchObject({ status: 'not-ready', executionKind: 'mock' });
      expect(count).toBe(0);
    }
  });
  it.each([
    ['MCP ToolError', { isError: true, content: [{ type: 'text', text: 'POISON_SYNTHETIC' }] }, 'unknown'],
    ['malformed', { isError: false, content: [{ type: 'text', text: '{' }] }, 'unknown'],
    ['wrong cwd', { isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B1_OK\r\n', stderr: '', cwd: 'C:/elsewhere',
    }) }] }, 'unknown'],
    ['wrong stdout', { isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'POISON_SYNTHETIC', stderr: '', cwd: root,
    }) }] }, 'unknown'],
    ['stderr', { isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 0, stdout: 'SUD_D_B1_OK\r\n', stderr: 'POISON_SYNTHETIC', cwd: root,
    }) }] }, 'unknown'],
    ['nonzero', { isError: false, content: [{ type: 'text', text: JSON.stringify({
      return_code: 7, stdout: '', stderr: '', cwd: root,
    }) }] }, 'command-failed'],
    ['excess', { isError: false, content: [{ type: 'text', text: 'X'.repeat(5000) }] }, 'unknown'],
  ] as const)('%s safe, typed, no poison', async (_name, response, status) => {
    const adapter = createSoloExpertFixedAdapter(async () => response);
    const result = await adapter.invoke(review());
    expect(result.status).toBe(status);
    expect(JSON.stringify(result)).not.toContain('POISON_SYNTHETIC');
    expect(result.executionKind).toBe('mock');
  });
  it('does not leak thrown fake transport errors or lost response', async () => {
    const thrown = createSoloExpertFixedAdapter(async () => { throw Error('POISON_SYNTHETIC'); });
    expect(await thrown.invoke(review())).toMatchObject({ status: 'unknown', reason: 'TRANSPORT_UNKNOWN' });
  });
  it('generates an inert config and safe environment without reading real host credentials', () => {
    const plan = makeManagedSerenaConfigPlan('C:/synthetic-serena-dir', {
      PATH: 'C:/synthetic-path', USERNAME: 'fixture',
      API_KEY: 'POISON_SYNTHETIC', OPENAI_API_KEY: 'POISON_SYNTHETIC',
      SERENA_USAGE_REPORTING: 'true',
    });
    expect(plan.environment).toMatchObject({ SERENA_USAGE_REPORTING: 'false', PATH: 'C:/synthetic-path' });
    expect(plan.config).toMatchObject({ token_count_estimator: 'CHAR_COUNT', web_dashboard: false,
      trace_lsp_communication: false, gui_log_window: false });
    expect(JSON.stringify(plan)).not.toContain('POISON_SYNTHETIC');
    expect(JSON.stringify(plan.environment)).not.toContain('USERNAME');
  });

  it('detects epoch drift that occurs during an injected fake session response', async () => {
    const receipt = identity();
    let calls = 0;
    const runtime = createManagedSerenaRuntime({
      dataRoot: 'C:/not-used',
      soloExpertFixture: {
        receipt, toolSchema: SERENA_ENGINE_MANIFEST.expectedToolInputSchemas.execute_shell_command,
        serverName: 'Serena', handshakeVersion: 'mcp-fake-handshake', packageVersion: '1.7.0',
        session: { callTool: async () => { calls++; receipt.managedEpoch = 'epoch-changed'; return good(); } },
      },
    });
    expect(await runtime.callSoloExpertReadyOnly(review())).toMatchObject({
      status: 'unknown', reason: 'IDENTITY_DRIFT', executionKind: 'mock',
    });
    expect(calls).toBe(1);
    expect(await runtime.callSoloExpertReadyOnly(review())).toMatchObject({ status: 'not-ready' });
    expect(calls).toBe(1);
  });
  it('bounds fake response waiting; no process-termination claim is made', async () => {
    const adapter = createSoloExpertFixedAdapter(async () => new Promise<never>(() => {
      // Deliberately never settles; the test does not start any host command.
    }));
    expect(await adapter.invoke(review())).toMatchObject({
      executionKind: 'mock', status: 'unknown', reason: 'TIMEOUT',
    });
  }, 8000);

});
