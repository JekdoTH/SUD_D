import { request } from 'node:https';

import { autoUpdater } from 'electron-updater';

import { normalizeElectronUpdateCheckResult } from './update-provider-result';

export const RELEASE_OWNER = 'JekdoTH';
export const RELEASE_REPO = 'SUD_D-Releases';
export const RELEASE_MANIFEST_URL = 'https://github.com/JekdoTH/SUD_D-Releases/releases/latest/download/sud-d-release.json';

const MAX_MANIFEST_BYTES = 256 * 1024;
const MANIFEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type ProviderUpdateInfo = {
  version: string;
};

export type DownloadedUpdate = {
  filePath: string;
};

export interface UpdateProvider {
  check(): Promise<{ available: false } | { available: true; info: ProviderUpdateInfo }>;
  download(): Promise<DownloadedUpdate>;
  restartAndInstall(): void;
}

function isAllowedReleaseHost(hostname: string): boolean {
  return hostname === 'github.com'
    || hostname.endsWith('.github.com')
    || hostname === 'githubusercontent.com'
    || hostname.endsWith('.githubusercontent.com');
}

function fetchManifest(url: URL, redirectsLeft: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:' || !isAllowedReleaseHost(url.hostname)) {
      reject(new Error('UPDATE_MANIFEST_HOST_REJECTED'));
      return;
    }

    const req = request(url, { method: 'GET' }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirectsLeft <= 0) {
          reject(new Error('UPDATE_MANIFEST_REDIRECT_LIMIT'));
          return;
        }
        let next: URL;
        try {
          next = new URL(response.headers.location, url);
        } catch {
          reject(new Error('UPDATE_MANIFEST_REDIRECT_INVALID'));
          return;
        }
        void fetchManifest(next, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error('UPDATE_MANIFEST_HTTP_FAILED'));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > MAX_MANIFEST_BYTES) {
          req.destroy(new Error('UPDATE_MANIFEST_TOO_LARGE'));
          return;
        }
        chunks.push(bytes);
      });
      response.on('end', () => {
        if (total > MAX_MANIFEST_BYTES) {
          return;
        }
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('UPDATE_MANIFEST_JSON_INVALID'));
        }
      });
      response.on('error', reject);
    });

    req.setTimeout(MANIFEST_TIMEOUT_MS, () => {
      req.destroy(new Error('UPDATE_MANIFEST_TIMEOUT'));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function loadSignedReleaseManifest(): Promise<unknown> {
  return fetchManifest(new URL(RELEASE_MANIFEST_URL), MAX_REDIRECTS);
}

export function createElectronUpdateProvider(): UpdateProvider {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  return {
    async check() {
      try {
        const result = await autoUpdater.checkForUpdates();
        return normalizeElectronUpdateCheckResult(result);
      } catch {
        throw new Error('UPDATE_PROVIDER_CHECK_FAILED');
      }
    },

    async download() {
      try {
        const paths = await autoUpdater.downloadUpdate();
        const filePath = paths.find((value) => value.toLowerCase().endsWith('.exe')) ?? paths[0];
        if (!filePath) {
          throw new Error('UPDATE_PROVIDER_DOWNLOAD_EMPTY');
        }
        return { filePath };
      } catch {
        throw new Error('UPDATE_PROVIDER_DOWNLOAD_FAILED');
      }
    },

    restartAndInstall() {
      autoUpdater.quitAndInstall(false, true);
    },
  };
}
