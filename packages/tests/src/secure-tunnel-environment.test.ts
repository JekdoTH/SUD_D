import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createOpenAiSecureTunnelRuntimeWithDependencies } from '../../infrastructure/src/openai-secure-tunnel-runtime.js';
import { createWindowsTunnelProcessLauncher } from '../../infrastructure/src/secure-tunnel-process.js';
import {
  credentialEnvVarNameForProfile,
  createWindowsCredentialStoreWithDependencies,
} from '../../infrastructure/src/credential-store.js';

const roots: string[] = [];
const profileId = 'environment-regression';
const credentialName = credentialEnvVarNameForProfile(profileId);

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

// Exercise the real runtime/profile/launcher and an actual child process, without
// contacting the control plane or using real credentials. Report safe facts only.
async function runChildProbe(): Promise<Record<string, unknown>> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-tunnel-env-'));
  roots.push(root);
  const tunnelClient = path.join(root, 'tunnel-client.exe');
  const gatewayEntry = path.join(root, 'stdio-entry.js');
  fs.writeFileSync(tunnelClient, 'test fixture');
  fs.writeFileSync(gatewayEntry, '');
  const launcher = createWindowsTunnelProcessLauncher();
  let resolveExit!: (value: Record<string, unknown>) => void;
  let rejectExit!: (error: Error) => void;
  const exited = new Promise<Record<string, unknown>>((resolve, reject) => {
    resolveExit = resolve;
    rejectExit = reject;
  });
  const runtime = createOpenAiSecureTunnelRuntimeWithDependencies({
    dataRoot: root,
    environment: process.env,
    resolveTunnelClient: () => tunnelClient,
    nodeExecutablePath: process.execPath,
    gatewayEntryPath: gatewayEntry,
    healthProbe: { watch: () => ({ stop() {} }) },
    processLauncher: {
      start(plan) {
        const script = `
          const fs = require('node:fs');
          const profile = fs.readFileSync(process.argv[1], 'utf8');
          const result = {
            controlPlaneNames: Object.keys(process.env).filter(name => /^CONTROL_PLANE_/i.test(name)),
            openAiFallbackPresent: process.env.OPENAI_API_KEY !== undefined,
            profileUsesNewTunnel: profile.includes('tunnel_id: "tunnel_new"'),
            profileUsesScopedCredential: profile.includes('env:${credentialName}'),
            scopedCredentialPreserved: process.env.${credentialName} === 'synthetic-profile-credential',
            approvalIdentityPresent: Boolean(process.env.SUD_D_APPROVAL_RUNTIME_INSTANCE_ID && process.env.SUD_D_APPROVAL_RUNTIME_HMAC_KEY),
            runtimePathFirst: (process.env.Path || process.env.PATH).split(require('node:path').delimiter)[0] === require('node:path').dirname(process.execPath)
          };
          process.stderr.write(JSON.stringify(result) + '\\n');
        `;
        const handle = launcher.start({
          ...plan,
          executablePath: process.execPath,
          args: ['-e', script, plan.profilePath],
        });
        handle.onExit(({ exitCode, stderrTail }) => {
          if (exitCode !== 0) return rejectExit(new Error('Child probe failed'));
          try { resolveExit(JSON.parse(stderrTail.join('\n')) as Record<string, unknown>); }
          catch { rejectExit(new Error('Child probe returned invalid safe facts')); }
        });
        return handle;
      },
    },
  });
  runtime.start({
    connectionSessionId: 'test-session', profileId, workspaceId: 'test-workspace',
    workspaceCanonicalRoot: root, startedAt: new Date(),
    provider: 'openai_secure_mcp_tunnel', transport: 'stdio',
    deviceName: 'test-device', tunnelReference: 'tunnel_new',
  });
  return exited;
}

describe('Secure Tunnel child environment', () => {
  it('keeps the generated profile authoritative despite an old host tunnel ID', async () => {
    vi.stubEnv('CONTROL_PLANE_TUNNEL_ID', 'tunnel_old');
    vi.stubEnv('CONTROL_PLANE_API_KEY', 'synthetic-unrelated-credential');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-unrelated-credential');
    vi.stubEnv(credentialName, 'synthetic-profile-credential');
    const facts = await runChildProbe();
    expect(facts.controlPlaneNames).toEqual([]);
    expect(facts.profileUsesNewTunnel).toBe(true);
    expect(facts.profileUsesScopedCredential).toBe(true);
    expect(facts.scopedCredentialPreserved).toBe(true);
    expect(facts.approvalIdentityPresent).toBe(true);
    expect(facts.runtimePathFirst).toBe(true);
    expect(process.env.CONTROL_PLANE_TUNNEL_ID).toBe('tunnel_old');
  });

  it('removes control-plane overrides and fallback credentials after legacy credential preparation', async () => {
    vi.stubEnv('CONTROL_PLANE_API_KEY', 'synthetic-profile-credential');
    vi.stubEnv('OPENAI_API_KEY', 'synthetic-unrelated-credential');
    vi.stubEnv('CONTROL_PLANE_BASE_URL', 'https://example.invalid');
    vi.stubEnv('CONTROL_PLANE_POLL_CHANNELS', 'wrong-channel');
    vi.stubEnv('control_plane_tunnel_id', 'tunnel_old');
    vi.stubEnv('CONTROL_PLANE_EXTRA_HEADERS', 'X-Test: synthetic');
    vi.stubEnv(credentialName, undefined);
    const store = createWindowsCredentialStoreWithDependencies(process.env, {
      hasStoredCredential: () => false,
      promptAndStoreCredential: () => 'cancelled',
      deleteStoredCredential() {},
      materializeStoredCredential: () => false,
    });
    expect(store.prepareCredential(profileId)).toBe(true);
    const facts = await runChildProbe();
    expect(facts.controlPlaneNames).toEqual([]);
    expect(facts.openAiFallbackPresent).toBe(false);
    expect(facts.scopedCredentialPreserved).toBe(true);
    expect(facts.profileUsesNewTunnel).toBe(true);
    expect(process.env.CONTROL_PLANE_BASE_URL).toBe('https://example.invalid');
    expect(process.env.OPENAI_API_KEY === 'synthetic-unrelated-credential').toBe(true);
  });
});
