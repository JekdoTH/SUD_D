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
