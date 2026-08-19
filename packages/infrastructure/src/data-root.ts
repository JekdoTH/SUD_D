import path from 'node:path';
import os from 'node:os';

/**
 * Returns the canonical SUD-D application data root: %LOCALAPPDATA%\SUD-D
 * Falls back to APPDATA then home dir if LOCALAPPDATA is unset.
 */
export function getDataRoot(): string {
  const localAppData =
    process.env['LOCALAPPDATA'] ??
    process.env['APPDATA'] ??
    path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'SUD-D');
}
