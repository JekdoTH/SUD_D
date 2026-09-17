import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createDesktopUpdateController } from '../../desktop/electron/update-controller.js';
import type { DownloadedUpdate, ProviderUpdateInfo, UpdateProvider } from '../../desktop/electron/update-provider.js';

const CURRENT_VERSION = '0.1.0';
const CURRENT_REVISION = '1111111111111111111111111111111111111111';
const TARGET_REVISION = '2222222222222222222222222222222222222222';
const TARGET_HASH = 'aa617edf5edc5d86121d280150d98c2895f7c2a5e82cd2b0cba0a9514594cbbb02b9b8a0c85e66275034eb18cd24f8ea0b3a4e7a768e4ba6a7d183dc7295ac48';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString();

function signedManifest(overrides: Record<string, unknown> = {}) {
  const payload = {
    schemaVersion: 1,
    version: '0.2.0',
    revision: TARGET_REVISION,
    releaseDate: '2026-09-17T12:34:56.000Z',
    channel: 'latest',
    artifactFileName: 'SUD-D Setup 0.2.0.exe',
    artifactSha512: TARGET_HASH,
    releaseNotes: { new: ['Installer updates'], improved: [], fixed: [] },
    ...overrides,
  };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    payload: bytes.toString('base64url'),
    signature: sign(null, bytes, privateKey).toString('base64url'),
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeProvider implements UpdateProvider {
  checkCalls = 0;
  downloadCalls = 0;
  installCalls = 0;
  checkImpl: () => Promise<{ available: false } | { available: true; info: ProviderUpdateInfo }> = async () => ({ available: false });
  downloadImpl: () => Promise<DownloadedUpdate> = async () => ({ filePath: 'unused.exe' });
  installImpl: () => void = () => undefined;

  async check() {
    this.checkCalls += 1;
    return this.checkImpl();
  }

  async download() {
    this.downloadCalls += 1;
    return this.downloadImpl();
  }

  restartAndInstall() {
    this.installCalls += 1;
    this.installImpl();
  }
}

function makeController(options: {
  provider?: FakeProvider;
  loadSignedManifest?: () => Promise<unknown>;
  orderlyShutdown?: () => Promise<void>;
  isPackaged?: boolean;
  currentVersion?: string;
  stateFilePath?: string;
} = {}) {
  const provider = options.provider ?? new FakeProvider();
  const calls: string[] = [];
  const controller = createDesktopUpdateController({
    currentVersion: options.currentVersion ?? CURRENT_VERSION,
    currentRevision: CURRENT_REVISION,
    publicKeyPem,
    provider,
    loadSignedManifest: options.loadSignedManifest ?? (async () => signedManifest()),
    orderlyShutdown: options.orderlyShutdown ?? (async () => { calls.push('shutdown'); }),
    isPackaged: options.isPackaged ?? true,
    ...(options.stateFilePath ? { stateFilePath: options.stateFilePath } : {}),
  });
  return { controller, provider, calls };
}

async function createArtifact(content = 'trusted update bytes') {
  const directory = await mkdtemp(join(tmpdir(), 'sud-d-update-controller-'));
  const filePath = join(directory, 'SUD-D Setup 0.2.0.exe');
  await writeFile(filePath, content);
  return filePath;
}
async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('desktop update controller', () => {
  it('startup check enters checking then up_to_date without blocking startup', async () => {
    const pending = deferred<{ available: false }>();
    const provider = new FakeProvider();
    provider.checkImpl = () => pending.promise;
    const { controller } = makeController({ provider });

    controller.checkOnStartup();
    expect(controller.getStatus().phase).toBe('checking');

    pending.resolve({ available: false });
    await flushAsyncWork();
    expect(controller.getStatus()).toMatchObject({ phase: 'up_to_date', currentVersion: CURRENT_VERSION });
  });

  it('startup check failure becomes CHECK_FAILED and never throws into startup', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => { throw new Error('network secret body'); };
    const { controller } = makeController({ provider });

    expect(() => controller.checkOnStartup()).not.toThrow();
    await flushAsyncWork();
    expect(controller.getStatus()).toMatchObject({ phase: 'error', errorCode: 'CHECK_FAILED', targetVersion: null });
  });

  it('accepts only a newer provider version with a matching verified signed manifest', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const { controller } = makeController({ provider });

    const result = await controller.check();

    expect(result).toMatchObject({ ok: true, value: { phase: 'available', targetVersion: '0.2.0', targetRevision: TARGET_REVISION } });
    expect(controller.getStatus().releaseNotes).toEqual({ new: ['Installer updates'], improved: [], fixed: [] });
    expect(provider.downloadCalls).toBe(0);
  });

  it('fails closed when provider version and verified manifest version differ', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const { controller } = makeController({ provider, loadSignedManifest: async () => signedManifest({ version: '0.3.0' }) });

    const result = await controller.check();

    expect(result).toMatchObject({ ok: false, error: { code: 'VERIFY_FAILED' } });
    expect(controller.getStatus()).toMatchObject({ phase: 'error', errorCode: 'VERIFY_FAILED', targetVersion: null, targetRevision: null });
  });

  it('rejects download unless a verified update is available', async () => {
    const { controller, provider } = makeController();

    const result = await controller.download();

    expect(result).toMatchObject({ ok: false });
    expect(provider.downloadCalls).toBe(0);
    expect(controller.getStatus().phase).toBe('idle');
  });

  it('never downloads automatically after a successful check', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const { controller } = makeController({ provider });

    await controller.check();

    expect(provider.downloadCalls).toBe(0);
    expect(controller.getStatus().phase).toBe('available');
  });

  it('moves downloading to verifying to ready only after artifact SHA-512 matches', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const pendingDownload = deferred<DownloadedUpdate>();
    provider.downloadImpl = () => pendingDownload.promise;
    const artifactPath = await createArtifact();
    const { controller } = makeController({ provider });
    await controller.check();

    const downloadResult = controller.download();
    expect(controller.getStatus().phase).toBe('downloading');
    pendingDownload.resolve({ filePath: artifactPath });
    await flushAsyncWork();
    expect(controller.getStatus().phase).toBe('verifying');

    await expect(downloadResult).resolves.toMatchObject({ ok: true, value: { phase: 'ready', targetVersion: '0.2.0' } });
  });

  it('rejects a downloaded artifact hash mismatch and never becomes ready', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const badArtifactPath = await createArtifact('tampered update bytes');
    provider.downloadImpl = async () => ({ filePath: badArtifactPath });
    const { controller } = makeController({ provider });
    await controller.check();

    const result = await controller.download();

    expect(result).toMatchObject({ ok: false, error: { code: 'VERIFY_FAILED' } });
    expect(controller.getStatus()).toMatchObject({ phase: 'error', errorCode: 'VERIFY_FAILED' });
    expect(controller.getStatus().phase).not.toBe('ready');
  });

  it('rejects restartAndInstall until verification reaches ready', async () => {
    const { controller, provider } = makeController();

    const result = await controller.restartAndInstall();

    expect(result).toMatchObject({ ok: false });
    expect(provider.installCalls).toBe(0);
  });

  it('runs orderly shutdown before invoking provider installation', async () => {
    const provider = new FakeProvider();
    const order: string[] = [];
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    const artifactPath = await createArtifact();
    provider.downloadImpl = async () => ({ filePath: artifactPath });
    provider.installImpl = () => { order.push('install'); };
    const { controller } = makeController({
      provider,
      orderlyShutdown: async () => { order.push('shutdown'); },
    });
    await controller.check();
    await controller.download();

    const result = await controller.restartAndInstall();

    expect(result).toEqual({ ok: true, value: null });
    expect(order).toEqual(['shutdown', 'install']);
  });

  it('fails duplicate check and download safely while an operation is already running', async () => {
    const checkPending = deferred<{ available: false }>();
    const provider = new FakeProvider();
    provider.checkImpl = () => checkPending.promise;
    const { controller } = makeController({ provider });

    const firstCheck = controller.check();
    await expect(controller.check()).resolves.toMatchObject({ ok: false, error: { code: 'UPDATE_BUSY' } });
    await expect(controller.download()).resolves.toMatchObject({ ok: false, error: { code: 'UPDATE_BUSY' } });
    checkPending.resolve({ available: false });
    await firstCheck;
  });

  it('keeps failed checks free of false target or update success state', async () => {
    const provider = new FakeProvider();
    provider.checkImpl = async () => { throw new Error('private path C:\\Secret'); };
    const { controller } = makeController({ provider });

    const result = await controller.check();

    expect(result).toEqual({ ok: false, error: { code: 'CHECK_FAILED', message: 'Could not check for updates.' } });
    expect(controller.getStatus()).toMatchObject({
      phase: 'error',
      targetVersion: null,
      targetRevision: null,
      releaseNotes: null,
      errorCode: 'CHECK_FAILED',
    });
    expect(JSON.stringify(result)).not.toContain('Secret');
  });

  it('stays unavailable in non-packaged development without contacting the provider', async () => {
    const { controller, provider } = makeController({ isPackaged: false });

    controller.checkOnStartup();
    await flushAsyncWork();
    expect(controller.getStatus().phase).toBe('unavailable');
    await expect(controller.check()).resolves.toMatchObject({ ok: true, value: { phase: 'unavailable' } });
    expect(provider.checkCalls).toBe(0);
  });

  it('exposes cached release notes once after the installed version increases', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sud-d-update-state-'));
    const stateFilePath = join(directory, 'update-state.json');
    await writeFile(stateFilePath, JSON.stringify({
      lastSeenVersion: '0.1.0',
      pendingSummary: {
        version: '0.2.0',
        releaseNotes: { new: ['Installer updates'], improved: ['Safer restart'], fixed: [] },
      },
    }));

    const first = makeController({ currentVersion: '0.2.0', stateFilePath }).controller;
    expect(first.getStatus()).toMatchObject({
      currentVersion: '0.2.0',
      targetVersion: null,
      releaseNotes: { new: ['Installer updates'], improved: ['Safer restart'], fixed: [] },
    });
    expect(JSON.parse(await readFile(stateFilePath, 'utf8'))).toEqual({
      lastSeenVersion: '0.2.0',
      pendingSummary: null,
    });

    const second = makeController({ currentVersion: '0.2.0', stateFilePath }).controller;
    expect(second.getStatus().releaseNotes).toBeNull();
  });

  it('does not fabricate a post-update summary for a fresh install', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sud-d-update-fresh-'));
    const stateFilePath = join(directory, 'update-state.json');
    const { controller } = makeController({ currentVersion: '0.2.0', stateFilePath });

    expect(controller.getStatus().releaseNotes).toBeNull();
    expect(JSON.parse(await readFile(stateFilePath, 'utf8'))).toEqual({
      lastSeenVersion: '0.2.0',
      pendingSummary: null,
    });
  });

  it('persists only the target version and release notes before restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sud-d-update-pending-'));
    const stateFilePath = join(directory, 'update-state.json');
    const provider = new FakeProvider();
    provider.checkImpl = async () => ({ available: true, info: { version: '0.2.0' } });
    provider.downloadImpl = async () => ({ filePath: await createArtifact() });
    const { controller } = makeController({ provider, stateFilePath });
    await controller.check();
    await controller.download();

    await expect(controller.restartAndInstall()).resolves.toEqual({ ok: true, value: null });
    const persisted = JSON.parse(await readFile(stateFilePath, 'utf8'));
    expect(persisted).toEqual({
      lastSeenVersion: CURRENT_VERSION,
      pendingSummary: {
        version: '0.2.0',
        releaseNotes: { new: ['Installer updates'], improved: [], fixed: [] },
      },
    });
    expect(JSON.stringify(persisted)).not.toContain(publicKeyPem.trim());
    expect(Object.keys(persisted).sort()).toEqual(['lastSeenVersion', 'pendingSummary']);
  });

});
