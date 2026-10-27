import { describe, expect, it } from 'vitest';
import {
  BRIDGE_ACTION_ID,
  BRIDGE_SCHEMA_VERSION,
  createSerenaPermissionBridge,
} from '../../application/src/serena-permission-bridge.js';

const session = { id: 'desktop-1', type: 'desktop' as const };
const commandFingerprint = /^[0-9a-f]{64}$/;
const input = () => ({
  actionId: BRIDGE_ACTION_ID,
  schemaVersion: BRIDGE_SCHEMA_VERSION,
  params: { detail: 'brief' as const },
});

function harness() {
  const calls: unknown[] = [];
  let clock = 1_800_000_000_000;
  const state = {
    workspaceId: 'ws-1',
    workspaceGeneration: 'generation-1',
    session,
    runtimeEpoch: 'epoch-1',
    resumed: true,
  };
  const contract = {
    serenaVersion: '1.7.0',
    toolName: 'execute_shell_command',
    schemaVersion: BRIDGE_SCHEMA_VERSION,
    risk: 'host-user-process',
  };
  const bridge = createSerenaPermissionBridge({
    trustedState: () => ({ ...state, session: { ...state.session } }),
    toolContract: () => ({ ...contract }),
    now: () => clock,
    approvalRecords: { findById: () => ({ ok: true as const, value: undefined }) },
    coordinatorRuntimeId: 'runtime-1',
    fakeDispatch: async (call) => { calls.push(call); return { stdout: 'POISON_FAKE_OUTPUT' }; },
  });
  return { bridge, state, contract, calls, tick: (ms: number) => { clock += ms; } };
}

describe('Serena C1 private review contract (no subprocess or production registration)', () => {
  it('creates a detached immutable reviewed snapshot for one fixed action and enum parameter', () => {
    const h = harness();
    const request = input();
    const result = h.bridge.review(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      actionId: BRIDGE_ACTION_ID,
      params: { detail: 'brief' },
      workspaceId: 'ws-1',
      workspaceGeneration: 'generation-1',
      session,
      runtimeEpoch: 'epoch-1',
      schemaVersion: BRIDGE_SCHEMA_VERSION,
    });
    expect(result.value.commandFingerprint).toMatch(commandFingerprint);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.params)).toBe(true);
    expect(Object.isFrozen(result.value.session)).toBe(true);
    (request.params as { detail: string }).detail = 'expanded';
    expect(result.value.params.detail).toBe('brief');
    expect(h.bridge.capability.validate(result.value).ok).toBe(true);
    expect(h.calls).toHaveLength(0);
    expect(JSON.stringify(result.value)).not.toContain('echo ');
  });

  it('rejects extras, accessors, symbol keys, prototype attacks, arbitrary commands, and unknown enum', () => {
    const cases: unknown[] = [
      null, [], {}, { ...input(), approved: true }, { ...input(), approvalId: 'fake' },
      { ...input(), command: 'cmd /c anything' }, { ...input(), argv: ['x'] },
      { ...input(), cwd: 'C:\\' }, { ...input(), env: {} },
      { ...input(), params: { detail: 'unknown' } },
      { ...input(), params: { detail: 'brief' }, streaming: true },
      { ...input(), params: { detail: 'brief' }, stop: true },
      { ...input(), params: { detail: 'brief' }, longJob: true },
      { ...input(), params: { detail: 'brief' }, timeoutMs: 999_999 },
      { ...input(), params: { detail: 'brief', more: 'x' } },
      { ...input(), schemaVersion: 'old' },
      Object.assign(Object.create({ inherited: true }), input()),
      Object.assign(Object.create(null), input()),
      Object.defineProperty({ ...input() }, 'approved', { get: () => { throw Error('POISON_GETTER'); }, enumerable: true }),
      Object.defineProperty(input(), 'actionId', { get: () => { throw Error('POISON_GETTER'); } }),
      { ...input(), [Symbol('poison')]: true },
      { ...input(), params: Object.defineProperty({ detail: 'brief' }, 'x', { get: () => 1, enumerable: true }) },
    ];
    const h = harness();
    for (const candidate of cases) {
      const result = h.bridge.review(candidate);
      expect(result.ok, 'should refuse untrusted request').toBe(false);
      expect(JSON.stringify(result)).not.toContain('POISON_');
    }
    expect(h.calls).toHaveLength(0);
  });

  it('rejects manufactured snapshots, runtime schema drift, stale Workspace/session/epoch, no resume, and expiry', () => {
    const h = harness();
    const reviewed = h.bridge.review(input());
    if (!reviewed.ok) throw Error('review');
    expect(h.bridge.capability.validate({ ...reviewed.value }).ok).toBe(false);
    expect(h.bridge.capability.validate(reviewed.value).ok).toBe(true);
    h.state.resumed = false;
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.state.resumed = true;
    h.state.workspaceGeneration = 'generation-2';
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.state.workspaceGeneration = 'generation-1';
    h.state.runtimeEpoch = 'epoch-2';
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.state.runtimeEpoch = 'epoch-1';
    h.state.session = { id: 'other', type: 'desktop' };
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.state.session = session;
    h.contract.schemaVersion = 'unexpected';
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.contract.schemaVersion = BRIDGE_SCHEMA_VERSION;
    h.contract.risk = 'low';
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.contract.risk = 'host-user-process';
    h.contract.toolName = 'process_start';
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    h.contract.toolName = 'execute_shell_command';
    h.tick(121_000);
    expect(h.bridge.capability.resolveSecurity(reviewed.value).ok).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
});
