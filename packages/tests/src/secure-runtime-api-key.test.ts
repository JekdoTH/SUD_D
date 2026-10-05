import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const PROFILE_ID = '00000000-0000-4000-8000-000000000909';

interface NativeCredentialPortFake {
  hasStoredCredential(targetName: string): boolean;
  promptAndStoreCredential(targetName: string): 'configured' | 'cancelled';
  deleteStoredCredential(targetName: string): void;
  materializeStoredCredential(
    targetName: string,
    environment: NodeJS.ProcessEnv,
    environmentName: string,
  ): boolean;
}

describe('Post-M0.8 โ€” secure Runtime API Key contracts', () => {
  it('defines fixed profileId-only setup/remove inputs and rejects secret/process fields', async () => {
    const contracts = await import('../../contracts/src/index.js') as unknown as {
      IPC_CHANNELS: Record<string, string>;
      DesktopConnectionCredentialSetupInputSchema?: { parse(input: unknown): unknown; safeParse(input: unknown): { success: boolean } };
      DesktopConnectionCredentialRemoveInputSchema?: { parse(input: unknown): unknown; safeParse(input: unknown): { success: boolean } };
    };

    expect(contracts.IPC_CHANNELS.CONNECTION_CREDENTIAL_CLIPBOARD_IMPORT).toBe('connection:credentialClipboardImport');
    expect(contracts.IPC_CHANNELS.CONNECTION_CREDENTIAL_REMOVE).toBe('connection:credentialRemove');
    expect(contracts.DesktopConnectionCredentialSetupInputSchema).toBeDefined();
    expect(contracts.DesktopConnectionCredentialRemoveInputSchema).toBeDefined();

    const setupSchema = contracts.DesktopConnectionCredentialSetupInputSchema!;
    const removeSchema = contracts.DesktopConnectionCredentialRemoveInputSchema!;
    expect(setupSchema.parse({ profileId: PROFILE_ID })).toEqual({ profileId: PROFILE_ID });
    expect(removeSchema.parse({ profileId: PROFILE_ID })).toEqual({ profileId: PROFILE_ID });

    for (const extra of [
      { credential: 'sentinel-secret' },
      { apiKey: 'sentinel-secret' },
      { secret: 'sentinel-secret' },
      { env: { CONTROL_PLANE_API_KEY: 'sentinel-secret' } },
      { command: 'cmd.exe' },
      { executable: 'powershell.exe' },
      { argv: ['--unsafe'] },
      { cwd: 'C:\\' },
    ]) {
      expect(setupSchema.safeParse({ profileId: PROFILE_ID, ...extra }).success).toBe(false);
      expect(removeSchema.safeParse({ profileId: PROFILE_ID, ...extra }).success).toBe(false);
    }
  });
});

describe('Post-M0.8 โ€” secure Runtime API Key store orchestration', () => {
  it('prefers the stored Windows credential over the legacy environment fallback', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js') as unknown as {
      createWindowsCredentialStoreWithDependencies?: (
        environment: NodeJS.ProcessEnv,
        nativePort: NativeCredentialPortFake,
      ) => {
        prepareCredential(profileId: string): boolean;
      };
      credentialEnvVarNameForProfile(profileId: string): string;
    };

    expect(infrastructure.createWindowsCredentialStoreWithDependencies).toBeDefined();
    const environment: NodeJS.ProcessEnv = { CONTROL_PLANE_API_KEY: 'legacy-fallback-sentinel' };
    const materialize = vi.fn((
      _targetName: string,
      targetEnvironment: NodeJS.ProcessEnv,
      environmentName: string,
    ) => {
      targetEnvironment[environmentName] = 'stored-credential-sentinel';
      return true;
    });
    const nativePort: NativeCredentialPortFake = {
      hasStoredCredential: () => true,
      promptAndStoreCredential: () => 'configured',
      deleteStoredCredential: vi.fn(),
      materializeStoredCredential: materialize,
    };
    const store = infrastructure.createWindowsCredentialStoreWithDependencies!(environment, nativePort);

    expect(store.prepareCredential(PROFILE_ID)).toBe(true);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(environment[infrastructure.credentialEnvVarNameForProfile(PROFILE_ID)]).toBe('stored-credential-sentinel');
  });

  it('uses legacy CONTROL_PLANE_API_KEY only as a session fallback and never persists it', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js') as unknown as {
      createWindowsCredentialStoreWithDependencies?: (
        environment: NodeJS.ProcessEnv,
        nativePort: NativeCredentialPortFake,
      ) => {
        hasCredential(profileId: string): boolean;
        prepareCredential(profileId: string): boolean;
      };
      credentialEnvVarNameForProfile(profileId: string): string;
    };

    const environment: NodeJS.ProcessEnv = { CONTROL_PLANE_API_KEY: 'legacy-session-only-sentinel' };
    const prompt = vi.fn(() => 'configured' as const);
    const nativePort: NativeCredentialPortFake = {
      hasStoredCredential: () => false,
      promptAndStoreCredential: prompt,
      deleteStoredCredential: vi.fn(),
      materializeStoredCredential: vi.fn(() => false),
    };
    const store = infrastructure.createWindowsCredentialStoreWithDependencies!(environment, nativePort);

    expect(store.hasCredential(PROFILE_ID)).toBe(true);
    expect(store.prepareCredential(PROFILE_ID)).toBe(true);
    expect(environment[infrastructure.credentialEnvVarNameForProfile(PROFILE_ID)]).toBe('legacy-session-only-sentinel');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('keeps setup cancellation unchanged and removes stored credentials without reading them', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js') as unknown as {
      createWindowsCredentialStoreWithDependencies?: (
        environment: NodeJS.ProcessEnv,
        nativePort: NativeCredentialPortFake,
      ) => {
        setupCredential(profileId: string): 'configured' | 'cancelled';
        deleteCredential(profileId: string): void;
      };
      credentialEnvVarNameForProfile(profileId: string): string;
    };

    const environment: NodeJS.ProcessEnv = {};
    const prompt = vi.fn(() => 'cancelled' as const);
    const remove = vi.fn();
    const materialize = vi.fn(() => false);
    const nativePort: NativeCredentialPortFake = {
      hasStoredCredential: () => false,
      promptAndStoreCredential: prompt,
      deleteStoredCredential: remove,
      materializeStoredCredential: materialize,
    };
    const store = infrastructure.createWindowsCredentialStoreWithDependencies!(environment, nativePort);
    const derivedName = infrastructure.credentialEnvVarNameForProfile(PROFILE_ID);
    environment[derivedName] = 'session-sentinel';

    expect(store.setupCredential(PROFILE_ID)).toBe('cancelled');
    store.deleteCredential(PROFILE_ID);

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(materialize).not.toHaveBeenCalled();
    expect(environment[derivedName]).toBeUndefined();
  });

  it('tracks only non-secret process-local credential revisions for trusted mutations', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const write = vi.fn();
    const remove = vi.fn();
    const materialize = vi.fn(() => true);
    const store = infrastructure.createWindowsCredentialStoreWithDependencies({}, {
      hasStoredCredential: () => true,
      promptAndStoreCredential: () => 'configured',
      storeCredentialBuffer: write,
      deleteStoredCredential: remove,
      materializeStoredCredential: materialize,
    });

    expect(store.getRevision(PROFILE_ID)).toBe(0);
    expect(store.hasCredential(PROFILE_ID)).toBe(true);
    expect(store.prepareCredential(PROFILE_ID)).toBe(true);
    expect(store.getRevision(PROFILE_ID)).toBe(0);

    expect(store.setupCredential(PROFILE_ID)).toBe('configured');
    expect(store.getRevision(PROFILE_ID)).toBe(1);

    const input = Buffer.from('revision-test-only-key', 'utf16le');
    try {
      store.storeCredentialBuffer(PROFILE_ID, input);
      expect(store.getRevision(PROFILE_ID)).toBe(2);
    } finally {
      input.fill(0);
    }

    store.deleteCredential(PROFILE_ID);
    expect(store.getRevision(PROFILE_ID)).toBe(3);
    expect(write).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(materialize).toHaveBeenCalledTimes(1);
  });

  it('stores a trusted native input buffer without a renderer credential payload', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const write = vi.fn();
    const environment: NodeJS.ProcessEnv = {};
    const store = infrastructure.createWindowsCredentialStoreWithDependencies(environment, {
      hasStoredCredential: () => false,
      promptAndStoreCredential: () => 'cancelled',
      storeCredentialBuffer: write,
      deleteStoredCredential: () => undefined,
      materializeStoredCredential: () => false,
    });
    const input = Buffer.from('test-only-key', 'utf16le');
    try {
      store.storeCredentialBuffer(PROFILE_ID, input);
      expect(write).toHaveBeenCalledWith(
        infrastructure.windowsCredentialTargetNameForProfile(PROFILE_ID), input,
      );
      expect(environment).toEqual({});
    } finally {
      input.fill(0);
    }
  });

  it('rejects unusable native input before writing it to Windows credentials', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const write = vi.fn();
    const store = infrastructure.createWindowsCredentialStoreWithDependencies({}, {
      hasStoredCredential: () => false,
      promptAndStoreCredential: () => 'cancelled',
      storeCredentialBuffer: write,
      deleteStoredCredential: () => undefined,
      materializeStoredCredential: () => false,
    });
    for (const value of ['', 'bad\nkey', 'bad\rkey', 'bad\0key']) {
      const input = Buffer.from(value, 'utf16le');
      try {
        expect(() => store.storeCredentialBuffer(PROFILE_ID, input)).toThrow();
      } finally {
        input.fill(0);
      }
    }
    expect(write).not.toHaveBeenCalled();
  });
});

describe('Post-M0.8 โ€” Windows Credential Manager integration', () => {
  it('exposes the production Windows credential-store factory', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js') as unknown as {
      createWindowsCredentialStore?: (environment?: NodeJS.ProcessEnv) => unknown;
    };
    expect(infrastructure.createWindowsCredentialStore).toBeDefined();
  });

  it.runIf(process.platform === 'win32')('writes, materializes, and deletes an isolated test credential with cleanup', async () => {
    const module = await import('../../infrastructure/src/windows-credential-manager.js').catch(() => null) as null | {
      createWin32CredentialVault?: () => {
        writeStoredCredential(targetName: string, credentialUtf16: Buffer): void;
        hasStoredCredential(targetName: string): boolean;
        materializeStoredCredential(
          targetName: string,
          environment: NodeJS.ProcessEnv,
          environmentName: string,
        ): boolean;
        deleteStoredCredential(targetName: string): void;
      };
    };
    expect(module?.createWin32CredentialVault).toBeDefined();

    const vault = module!.createWin32CredentialVault!();
    const targetName = `SUD_D/Test/${randomUUID()}`;
    const environment: NodeJS.ProcessEnv = {};
    const environmentName = 'SUD_D_TEST_RUNTIME_API_KEY';
    const sentinel = 'isolated-wincred-sentinel-never-log';
    const secretBuffer = Buffer.from(sentinel, 'utf16le');

    try {
      vault.writeStoredCredential(targetName, secretBuffer);
      expect(vault.hasStoredCredential(targetName)).toBe(true);
      expect(vault.materializeStoredCredential(targetName, environment, environmentName)).toBe(true);
      expect(environment[environmentName]).toBe(sentinel);
    } finally {
      secretBuffer.fill(0);
      delete environment[environmentName];
      vault.deleteStoredCredential(targetName);
    }

    expect(vault.hasStoredCredential(targetName)).toBe(false);
  });
});

describe('Post-M0.8 — application credential preparation', () => {
  it('materializes a stored credential before the connection runtime starts', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const application = await import('../../application/src/index.js');
    const environment: NodeJS.ProcessEnv = {};
    const materialize = vi.fn((_target: string, targetEnvironment: NodeJS.ProcessEnv, name: string) => {
      targetEnvironment[name] = 'stored-start-sentinel';
      return true;
    });
    const store = infrastructure.createWindowsCredentialStoreWithDependencies(environment, {
      hasStoredCredential: () => true,
      promptAndStoreCredential: () => 'configured',
      deleteStoredCredential: () => undefined,
      materializeStoredCredential: materialize,
    });
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'Secure Runtime API Key Test',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelReference: 'tunnel_test_only',
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    const workspace = {
      id: '00000000-0000-4000-8000-000000000910',
      displayName: 'Workspace',
      canonicalRoot: process.cwd(),
      isActive: true,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    const profileRepo = { findById: () => profile };
    const workspaceRepo = { list: () => [workspace] };
    const auditRepo = { append: vi.fn() };
    const environmentName = infrastructure.credentialEnvVarNameForProfile(profile.profileId);
    const runtime = {
      start: vi.fn(() => {
        expect(environment[environmentName]).toBe('stored-start-sentinel');
        return { tunnelReady: false, clientConnected: false };
      }),
      stop: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const service = application.createConnectionService(
      profileRepo as never,
      workspaceRepo as never,
      store,
      auditRepo as never,
      runtime,
    );

    const result = service.start(profile.profileId);

    expect(result.ok).toBe(true);
    expect(materialize).toHaveBeenCalledTimes(1);
    expect(runtime.start).toHaveBeenCalledTimes(1);
  });
});

describe('Post-M0.8 — Desktop credential actions', () => {
  it('sets and removes credentials only while the connection is stopped', async () => {
    const { createDesktopConnectionController } = await import('../../desktop/electron/connection-controller.js');
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelReference: 'tunnel_test_only',
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
      updatedAt: new Date('2026-08-31T00:00:00.000Z'),
    };
    const credentialStatus: 'configured' | 'missing' = 'missing';
    let runtimeState = 'stopped';
    const setupCredential = vi.fn(() => ({ ok: true as const, value: 'configured' as const }));
    const setupCredentialBuffer = vi.fn(() => ({ ok: true as const, value: undefined }));
    const deleteCredential = vi.fn(() => ({ ok: true as const, value: undefined }));
    const configService = {
      listProfiles: () => ({ ok: true as const, value: [profile] }),
      createProfile: vi.fn(),
      getProfile: vi.fn(),
      updateProfile: vi.fn(),
      getCredentialStatus: () => ({ ok: true as const, value: credentialStatus }),
      setCredential: vi.fn(),
      setupCredential,
      setupCredentialBuffer,
      deleteCredential,
    };
    const connectionService = {
      getStatus: () => ({ state: runtimeState, session: null, error: null }),
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
    };
    const controller = createDesktopConnectionController({
      configService: configService as never,
      connectionService: connectionService as never,
      deviceName: 'Home-PC',
      environment: {},
    }) as unknown as {
      setupCredential(input: { profileId: string }): { ok: boolean; value?: unknown; error?: { message: string } };
      setupCredentialBuffer(input: { profileId: string }, credentialUtf16: Buffer): { ok: boolean; value?: unknown; error?: { message: string } };
      removeCredential(input: { profileId: string }): { ok: boolean; value?: unknown; error?: { message: string } };
    };

    const setup = controller.setupCredential({ profileId: PROFILE_ID });
    expect(setup.ok).toBe(true);
    expect(setupCredential).toHaveBeenCalledTimes(1);

    const credentialBuffer = Buffer.from('test-only-key', 'utf16le');
    try {
      const inlineSetup = controller.setupCredentialBuffer({ profileId: PROFILE_ID }, credentialBuffer);
      expect(inlineSetup.ok).toBe(true);
      expect(setupCredentialBuffer).toHaveBeenCalledWith(PROFILE_ID, credentialBuffer);

      runtimeState = 'waiting_for_client';
      const blockedInlineSetup = controller.setupCredentialBuffer({ profileId: PROFILE_ID }, credentialBuffer);
      expect(blockedInlineSetup).toMatchObject({
        ok: false,
        error: { message: 'Disconnect ChatGPT before changing the Runtime API Key.' },
      });
      expect(setupCredentialBuffer).toHaveBeenCalledTimes(1);
    } finally {
      credentialBuffer.fill(0);
    }

    const blockedRemove = controller.removeCredential({ profileId: PROFILE_ID });
    expect(blockedRemove).toMatchObject({
      ok: false,
      error: { message: 'Disconnect ChatGPT before changing the Runtime API Key.' },
    });
    expect(deleteCredential).not.toHaveBeenCalled();
  });
});

describe('Post-M0.8 — fixed Desktop credential IPC and renderer surface', () => {
  it('imports a copied key through profileId-only IPC and clears the current clipboard after saving', async () => {
    const contracts = await import('../../contracts/src/index.js');
    const { registerDesktopConnectionIpcHandlers } = await import('../../desktop/electron/connection-ipc.js');
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const snapshot = {
      profile: { profileId: PROFILE_ID },
      credentialStatus: 'configured',
      runtime: { state: 'stopped', session: null, error: null, recovery: { phase: 'idle', attempt: 0 } },
    };
    const stored: Buffer[] = [];
    const setupCredentialBuffer = vi.fn((_request: { profileId: string }, buffer: Buffer) => {
      stored.push(buffer);
      expect(buffer.toString('utf16le')).toBe('test-only-key');
      return { ok: true as const, value: snapshot };
    });
    const clipboard = { readText: vi.fn(() => 'test-only-key'), clear: vi.fn() };
    registerDesktopConnectionIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { getSnapshot: () => ({ ok: true, value: snapshot }), setupCredentialBuffer } as never,
      () => true,
      clipboard,
    );
    const sender = { sender: {} };
    const save = handlers.get(contracts.IPC_CHANNELS.CONNECTION_CREDENTIAL_CLIPBOARD_IMPORT)!;
    expect(save(sender, { profileId: PROFILE_ID, apiKey: 'renderer-secret-sentinel' })).toMatchObject({ ok: false });
    expect(setupCredentialBuffer).not.toHaveBeenCalled();
    expect(clipboard.readText).not.toHaveBeenCalled();
    expect(save(sender, { profileId: PROFILE_ID })).toEqual({ ok: true, value: snapshot });
    expect(setupCredentialBuffer).toHaveBeenCalledTimes(1);
    expect(setupCredentialBuffer.mock.calls[0]?.[0]).toEqual({ profileId: PROFILE_ID });
    expect(stored[0]?.every((byte) => byte === 0)).toBe(true);
    expect(clipboard.clear).toHaveBeenCalledTimes(1);
  });

  it('does not read an invalid request and clears copied text before attempting storage', async () => {
    const contracts = await import('../../contracts/src/index.js');
    const { registerDesktopConnectionIpcHandlers } = await import('../../desktop/electron/connection-ipc.js');
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const snapshot = {
      profile: { profileId: PROFILE_ID },
      runtime: { state: 'stopped' },
    };
    const clipboard = { readText: vi.fn(() => 'test-only-key'), clear: vi.fn() };
    const setupCredentialBuffer = vi.fn(() => ({ ok: false as const, error: { code: 'INTERNAL_ERROR', message: 'Could not save credential' } }));
    registerDesktopConnectionIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      { getSnapshot: () => ({ ok: true, value: snapshot }), setupCredentialBuffer } as never,
      (sender) => sender === 'trusted',
      clipboard,
    );
    const save = handlers.get(contracts.IPC_CHANNELS.CONNECTION_CREDENTIAL_CLIPBOARD_IMPORT)!;
    expect(save({ sender: 'untrusted' }, { profileId: PROFILE_ID })).toMatchObject({ ok: false });
    expect(save({ sender: 'trusted' }, { profileId: 'wrong-profile' })).toMatchObject({ ok: false });
    expect(clipboard.readText).not.toHaveBeenCalled();
    expect(save({ sender: 'trusted' }, { profileId: PROFILE_ID })).toMatchObject({ ok: false });
    expect(clipboard.clear).toHaveBeenCalledTimes(1);
    setupCredentialBuffer.mockClear();
    clipboard.clear.mockImplementationOnce(() => { throw new Error('clipboard unavailable'); });
    expect(save({ sender: 'trusted' }, { profileId: PROFILE_ID })).toMatchObject({ ok: false });
    expect(setupCredentialBuffer).not.toHaveBeenCalled();
  });

  it('registers profileId-only remove handler without the old popup setup handler', async () => {
    const contracts = await import('../../contracts/src/index.js');
    const { registerDesktopConnectionIpcHandlers } = await import('../../desktop/electron/connection-ipc.js');
    const handlers = new Map<string, (event: { sender: unknown }, raw?: unknown) => unknown>();
    const snapshot = {
      profile: null,
      credentialStatus: 'missing' as const,
      runtime: { state: 'stopped' as const, session: null, error: null },
    };
    const setupCredential = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const removeCredential = vi.fn(() => ({ ok: true as const, value: snapshot }));
    const controller = {
      getSnapshot: () => ({ ok: true as const, value: snapshot }),
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
      setupCredential,
      removeCredential,
      configureTunnel: vi.fn(),
      updatePreferences: vi.fn(),
    };
    registerDesktopConnectionIpcHandlers(
      { handle: (channel, listener) => handlers.set(channel, listener) },
      controller as never,
      () => true,
    );

    const removeHandler = handlers.get(contracts.IPC_CHANNELS.CONNECTION_CREDENTIAL_REMOVE);
    expect(removeHandler).toBeDefined();
    expect(setupCredential).not.toHaveBeenCalled();

    expect(await removeHandler?.({ sender: {} }, { profileId: PROFILE_ID })).toEqual({ ok: true, value: snapshot });
    expect(removeCredential).toHaveBeenCalledWith({ profileId: PROFILE_ID });
  });

  it('accepts a masked API-key field while keeping the credential out of IPC payloads', () => {
    const preload = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/preload.ts'), 'utf8');
    const page = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ConnectionPage.tsx'), 'utf8');

    expect(preload).toContain('importCredentialFromClipboard');
    expect(preload).not.toContain('setupCredential:');
    expect(preload).toContain('removeCredential');
    expect(preload).not.toMatch(/apiKey\s*:|credentialValue\s*:|CONTROL_PLANE_API_KEY/);
    expect(page).toContain('Set up API Key');
    expect(page).toContain('Change API Key');
    expect(page).toContain('New API Key');
    expect(page).toContain('Save API Key');
    expect(page).toContain('type="password"');
    expect(page).toContain('navigator.clipboard.writeText(key)');
    expect(page).not.toContain('Remove API Key');
    expect(page).not.toContain('native-key-slot');
    expect(page).not.toContain('connection-credential-remove');
    expect(page).not.toMatch(/CONTROL_PLANE_API_KEY|apiKey\s*=/);
  });
});

describe('Post-M0.8 — credential failure and persistence safety', () => {
  it('fails closed with a fixed safe error when stored credential materialization fails', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const application = await import('../../application/src/index.js');
    const store = infrastructure.createWindowsCredentialStoreWithDependencies({}, {
      hasStoredCredential: () => true,
      promptAndStoreCredential: () => 'configured',
      deleteStoredCredential: () => undefined,
      materializeStoredCredential: () => { throw new Error('raw-native-secret-sentinel'); },
    });
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'Failure test',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelReference: 'tunnel_test_only',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const workspace = {
      id: '00000000-0000-4000-8000-000000000911',
      displayName: 'Workspace',
      canonicalRoot: process.cwd(),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const runtime = { start: vi.fn(), stop: vi.fn(), subscribe: vi.fn(() => () => undefined) };
    const service = application.createConnectionService(
      { findById: () => profile } as never,
      { list: () => [workspace] } as never,
      store,
      { append: vi.fn() } as never,
      runtime as never,
    );

    const result = service.start(PROFILE_ID);

    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Runtime API Key is unavailable' } });
    expect(JSON.stringify(result)).not.toContain('raw-native-secret-sentinel');
    expect(runtime.start).not.toHaveBeenCalled();
  });

  it('keeps a cancelled setup missing and allows replacement without exposing credential values', async () => {
    const { createDesktopConnectionController } = await import('../../desktop/electron/connection-controller.js');
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelReference: 'tunnel_test_only',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    let status: 'configured' | 'missing' = 'missing';
    const setupCredential = vi.fn()
      .mockReturnValueOnce({ ok: true as const, value: 'cancelled' as const })
      .mockImplementation(() => {
        status = 'configured';
        return { ok: true as const, value: 'configured' as const };
      });
    const controller = createDesktopConnectionController({
      configService: {
        listProfiles: () => ({ ok: true as const, value: [profile] }),
        createProfile: vi.fn(), getProfile: vi.fn(), updateProfile: vi.fn(),
        getCredentialStatus: () => ({ ok: true as const, value: status }),
        setCredential: vi.fn(), setupCredential, deleteCredential: vi.fn(),
      } as never,
      connectionService: {
        getStatus: () => ({ state: 'stopped', session: null, error: null, recovery: { phase: 'idle', attempt: 0 } }),
        start: vi.fn(), stop: vi.fn(), restart: vi.fn(),
      } as never,
      deviceName: 'Home-PC',
      environment: {},
    }) as unknown as { setupCredential(input: { profileId: string }): { ok: boolean; value?: { credentialStatus: string } } };

    const cancelled = controller.setupCredential({ profileId: PROFILE_ID });
    expect(cancelled).toMatchObject({ ok: true, value: { credentialStatus: 'missing' } });
    const replaced = controller.setupCredential({ profileId: PROFILE_ID });
    expect(replaced).toMatchObject({ ok: true, value: { credentialStatus: 'configured' } });
    expect(JSON.stringify({ cancelled, replaced })).not.toMatch(/sentinel-secret|apiKey|credentialValue/);
  });

  it('keeps renderer status configured after remove when a legacy environment fallback still exists', async () => {
    const { createDesktopConnectionController } = await import('../../desktop/electron/connection-controller.js');
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      tunnelReference: 'tunnel_test_only',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const controller = createDesktopConnectionController({
      configService: {
        listProfiles: () => ({ ok: true as const, value: [profile] }),
        createProfile: vi.fn(), getProfile: vi.fn(), updateProfile: vi.fn(),
        getCredentialStatus: () => ({ ok: true as const, value: 'configured' as const }),
        setCredential: vi.fn(), setupCredential: vi.fn(),
        deleteCredential: () => ({ ok: true as const, value: undefined }),
      } as never,
      connectionService: {
        getStatus: () => ({ state: 'stopped', session: null, error: null, recovery: { phase: 'idle', attempt: 0 } }),
        start: vi.fn(), stop: vi.fn(), restart: vi.fn(),
      } as never,
      deviceName: 'Home-PC',
      environment: { CONTROL_PLANE_API_KEY: 'legacy-fallback-test-only' },
    });
    expect(controller.getSnapshot()).toMatchObject({ ok: true, value: { credentialStatus: 'configured' } });

    const removed = controller.removeCredential({ profileId: PROFILE_ID });

    expect(removed).toMatchObject({ ok: true, value: { credentialStatus: 'configured' } });
  });

  it('does not claim missing status in audit when native setup is cancelled', async () => {
    const application = await import('../../application/src/index.js');
    const infrastructure = await import('../../infrastructure/src/index.js');
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const audit = vi.fn();
    const store = infrastructure.createWindowsCredentialStoreWithDependencies({}, {
      hasStoredCredential: () => false,
      promptAndStoreCredential: () => 'cancelled',
      deleteStoredCredential: () => undefined,
      materializeStoredCredential: () => false,
    });
    const service = application.createConnectionConfigService(
      { findById: () => profile } as never,
      store,
      { append: audit } as never,
    );

    expect(service.setupCredential(PROFILE_ID)).toEqual({ ok: true, value: 'cancelled' });
    const event = audit.mock.calls.at(-1)?.[0] as { resultCode?: string; metadata?: Record<string, unknown> };
    expect(event.resultCode).toBe('CANCELLED');
    expect(event.metadata).not.toHaveProperty('status', 'missing');
  });

  it('does not claim a missing credential in audit when legacy environment fallback remains after remove', async () => {
    const application = await import('../../application/src/index.js');
    const infrastructure = await import('../../infrastructure/src/index.js');
    const profile = {
      profileId: PROFILE_ID,
      displayName: 'OpenAI Secure Tunnel',
      provider: 'openai_secure_mcp_tunnel' as const,
      transport: 'stdio' as const,
      deviceName: 'Home-PC',
      autoStart: false,
      autoRestart: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const audit = vi.fn();
    const store = infrastructure.createWindowsCredentialStoreWithDependencies(
      { CONTROL_PLANE_API_KEY: 'legacy-fallback-test-only' },
      {
        hasStoredCredential: () => false,
        promptAndStoreCredential: () => 'configured',
        deleteStoredCredential: () => undefined,
        materializeStoredCredential: () => false,
      },
    );
    const service = application.createConnectionConfigService(
      { findById: () => profile } as never,
      store,
      { append: audit } as never,
    );

    expect(service.deleteCredential(PROFILE_ID)).toEqual({ ok: true, value: undefined });
    const event = audit.mock.calls.at(-1)?.[0] as { resultCode?: string; metadata?: Record<string, unknown> };
    expect(event.resultCode).toBe('OK');
    expect(event.metadata).not.toHaveProperty('status', 'missing');
  });

  it('detects a stored credential from a new production store instance after restart', async () => {
    const infrastructure = await import('../../infrastructure/src/index.js');
    const module = await import('../../infrastructure/src/windows-credential-manager.js');
    const profileId = randomUUID();
    const targetName = infrastructure.windowsCredentialTargetNameForProfile(profileId);
    const vault = module.createWin32CredentialVault();
    const buffer = Buffer.from('restart-persistence-sentinel', 'utf16le');
    const environment: NodeJS.ProcessEnv = {};
    try {
      vault.writeStoredCredential(targetName, buffer);
      const afterRestart = infrastructure.createWindowsCredentialStore(environment);
      expect(afterRestart.hasCredential(profileId)).toBe(true);
      expect(afterRestart.prepareCredential(profileId)).toBe(true);
      expect(environment[infrastructure.credentialEnvVarNameForProfile(profileId)]).toBe('restart-persistence-sentinel');
    } finally {
      buffer.fill(0);
      delete environment[infrastructure.credentialEnvVarNameForProfile(profileId)];
      vault.deleteStoredCredential(targetName);
    }
  });
});

describe('Post-M0.8 — Electron native dependency packaging', () => {
  it('keeps koffi external so its prebuilt native module resolves at runtime', () => {
    const viteConfig = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/external:\s*\[[^\]]*['"]better-sqlite3['"][^\]]*['"]koffi['"][^\]]*\]/s);
  });

  it('declares koffi as a Desktop runtime dependency so the external import resolves', () => {
    const desktopPackage = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'packages/desktop/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    expect(desktopPackage.dependencies?.koffi).toBe('3.1.6');
  });
});
