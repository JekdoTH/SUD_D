import fs from 'node:fs';

export interface DoctorResult {
  dataDirectoryWritable: boolean;
  sqliteHealthy: boolean;
  workspaceChecks: {
    workspaceId: string;
    displayName: string;
    rootExists: boolean;
    rootIsDirectory: boolean;
  }[];
}

export function checkDataDirectory(dataRoot: string): boolean {
  try {
    fs.mkdirSync(dataRoot, { recursive: true });
    const testFile = `${dataRoot}/.write-test-${Date.now()}`;
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

export function checkWorkspaceRoot(root: string): { rootExists: boolean; rootIsDirectory: boolean } {
  try {
    const stat = fs.statSync(root);
    return { rootExists: true, rootIsDirectory: stat.isDirectory() };
  } catch {
    return { rootExists: false, rootIsDirectory: false };
  }
}
