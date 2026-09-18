export type ElectronUpdateCheckResultLike = {
  isUpdateAvailable?: boolean;
  updateInfo?: {
    version?: string;
  };
} | null | undefined;

export type NormalizedUpdateCheck =
  | { available: false }
  | { available: true; info: { version: string } };

export function normalizeElectronUpdateCheckResult(
  result: ElectronUpdateCheckResultLike,
): NormalizedUpdateCheck {
  if (!result?.isUpdateAvailable) {
    return { available: false };
  }

  const version = result.updateInfo?.version;
  return version
    ? { available: true, info: { version } }
    : { available: false };
}
