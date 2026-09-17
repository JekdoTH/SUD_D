import type { DesktopUpdateStatusDto, IpcResult } from '@sud-d/contracts';

import { sha512FileHex, verifyReleaseEnvelope, type VerifiedReleaseManifest } from './update-manifest.js';
import type { UpdateProvider } from './update-provider.js';

export type SignedManifestLoader = () => Promise<unknown>;

export interface DesktopUpdateController {
  getStatus(): DesktopUpdateStatusDto;
  check(): Promise<IpcResult<DesktopUpdateStatusDto>>;
  download(): Promise<IpcResult<DesktopUpdateStatusDto>>;
  restartAndInstall(): Promise<IpcResult<null>>;
  checkOnStartup(): void;
}

type UpdateControllerDeps = {
  currentVersion: string;
  currentRevision: string;
  publicKeyPem: string;
  provider: UpdateProvider;
  loadSignedManifest: SignedManifestLoader;
  orderlyShutdown: () => Promise<void>;
  isPackaged: boolean;
};

const SAFE_MESSAGES = Object.freeze({
  busy: 'An update operation is already running.',
  check: 'Could not check for updates.',
  download: 'Could not download the update.',
  verify: "Update couldn't be verified.",
  install: 'Could not install the update.',
  state: 'The update action is not available right now.',
});

function cloneStatus(status: DesktopUpdateStatusDto): DesktopUpdateStatusDto {
  return {
    ...status,
    releaseNotes: status.releaseNotes
      ? {
          new: [...status.releaseNotes.new],
          improved: [...status.releaseNotes.improved],
          fixed: [...status.releaseNotes.fixed],
        }
      : null,
  };
}

function compareSemVer(left: string, right: string): number | undefined {
  const pattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
  if (!pattern.test(left) || !pattern.test(right)) {
    return undefined;
  }
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] > b[index] ? 1 : -1;
    }
  }
  return 0;
}

function errorResult<T>(code: string, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } };
}

export function createDesktopUpdateController(deps: UpdateControllerDeps): DesktopUpdateController {
  let busy = false;
  let verifiedManifest: VerifiedReleaseManifest | undefined;
  let downloadedPath: string | undefined;
  let status: DesktopUpdateStatusDto = {
    phase: deps.isPackaged ? 'idle' : 'unavailable',
    currentVersion: deps.currentVersion,
    currentRevision: deps.currentRevision,
    targetVersion: null,
    targetRevision: null,
    progressPercent: null,
    releaseNotes: null,
    errorCode: null,
  };

  const setStatus = (next: DesktopUpdateStatusDto) => {
    status = cloneStatus(next);
  };

  const clearTarget = (
    phase: DesktopUpdateStatusDto['phase'],
    errorCode: DesktopUpdateStatusDto['errorCode'],
  ) => {
    verifiedManifest = undefined;
    downloadedPath = undefined;
    setStatus({
      phase,
      currentVersion: deps.currentVersion,
      currentRevision: deps.currentRevision,
      targetVersion: null,
      targetRevision: null,
      progressPercent: null,
      releaseNotes: null,
      errorCode,
    });
  };

  const makeTargetStatus = (
    phase: DesktopUpdateStatusDto['phase'],
    manifest: VerifiedReleaseManifest,
  ): DesktopUpdateStatusDto => ({
    phase,
    currentVersion: deps.currentVersion,
    currentRevision: deps.currentRevision,
    targetVersion: manifest.version,
    targetRevision: manifest.revision,
    progressPercent: null,
    releaseNotes: {
      new: [...manifest.releaseNotes.new],
      improved: [...manifest.releaseNotes.improved],
      fixed: [...manifest.releaseNotes.fixed],
    },
    errorCode: null,
  });

  async function check(): Promise<IpcResult<DesktopUpdateStatusDto>> {
    if (!deps.isPackaged) {
      clearTarget('unavailable', null);
      return { ok: true, value: cloneStatus(status) };
    }
    if (busy) {
      return errorResult('UPDATE_BUSY', SAFE_MESSAGES.busy);
    }

    busy = true;
    clearTarget('checking', null);
    try {
      const providerResult = await deps.provider.check();
      if (!providerResult.available) {
        clearTarget('up_to_date', null);
        return { ok: true, value: cloneStatus(status) };
      }

      const manifestResult = verifyReleaseEnvelope(await deps.loadSignedManifest(), deps.publicKeyPem);
      const comparison = compareSemVer(providerResult.info.version, deps.currentVersion);
      if (
        !manifestResult.ok
        || comparison === undefined
        || comparison <= 0
        || manifestResult.value.version !== providerResult.info.version
      ) {
        clearTarget('error', 'VERIFY_FAILED');
        return errorResult('VERIFY_FAILED', SAFE_MESSAGES.verify);
      }

      verifiedManifest = manifestResult.value;
      downloadedPath = undefined;
      setStatus(makeTargetStatus('available', manifestResult.value));
      return { ok: true, value: cloneStatus(status) };
    } catch {
      clearTarget('error', 'CHECK_FAILED');
      return errorResult('CHECK_FAILED', SAFE_MESSAGES.check);
    } finally {
      busy = false;
    }
  }

  async function download(): Promise<IpcResult<DesktopUpdateStatusDto>> {
    if (busy) {
      return errorResult('UPDATE_BUSY', SAFE_MESSAGES.busy);
    }
    if (!deps.isPackaged || status.phase !== 'available' || !verifiedManifest) {
      return errorResult('UPDATE_NOT_AVAILABLE', SAFE_MESSAGES.state);
    }

    busy = true;
    const manifest = verifiedManifest;
    setStatus(makeTargetStatus('downloading', manifest));

    try {
      const downloaded = await deps.provider.download();
      setStatus(makeTargetStatus('verifying', manifest));
      const actualHash = await sha512FileHex(downloaded.filePath);
      if (actualHash !== manifest.artifactSha512) {
        clearTarget('error', 'VERIFY_FAILED');
        return errorResult('VERIFY_FAILED', SAFE_MESSAGES.verify);
      }

      downloadedPath = downloaded.filePath;
      setStatus(makeTargetStatus('ready', manifest));
      return { ok: true, value: cloneStatus(status) };
    } catch {
      clearTarget('error', 'DOWNLOAD_FAILED');
      return errorResult('DOWNLOAD_FAILED', SAFE_MESSAGES.download);
    } finally {
      busy = false;
    }
  }

  async function restartAndInstall(): Promise<IpcResult<null>> {
    if (busy) {
      return errorResult('UPDATE_BUSY', SAFE_MESSAGES.busy);
    }
    if (!deps.isPackaged || status.phase !== 'ready' || !verifiedManifest || !downloadedPath) {
      return errorResult('UPDATE_NOT_READY', SAFE_MESSAGES.state);
    }

    busy = true;
    try {
      await deps.orderlyShutdown();
      deps.provider.restartAndInstall();
      return { ok: true, value: null };
    } catch {
      clearTarget('error', 'INSTALL_FAILED');
      return errorResult('INSTALL_FAILED', SAFE_MESSAGES.install);
    } finally {
      busy = false;
    }
  }

  return {
    getStatus: () => cloneStatus(status),
    check,
    download,
    restartAndInstall,
    checkOnStartup: () => {
      if (!deps.isPackaged) {
        clearTarget('unavailable', null);
        return;
      }
      void check();
    },
  };
}
