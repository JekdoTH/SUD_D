import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const desktopPackageUrl = new URL('../../desktop/package.json', import.meta.url);
const desktopRequire = createRequire(desktopPackageUrl);
const approvedPngPath = fileURLToPath(new URL('../../desktop/src/assets/sud-d-app-icon.png', import.meta.url));
const brandingModulePath = fileURLToPath(new URL('../../desktop/scripts/windows-branding.mjs', import.meta.url));
const tempRoots: string[] = [];

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readWin32Resource(executablePath: string, resourceType: number, resourceId: number): Buffer {
  const koffi = desktopRequire('koffi') as {
    load(name: string): { func(...args: unknown[]): (...args: unknown[]) => unknown };
    decode(pointer: unknown, type: string, length: number): Uint8Array;
  };
  const kernel32 = koffi.load('kernel32.dll');
  const loadLibraryEx = kernel32.func('__stdcall', 'LoadLibraryExW', 'void *', ['str16', 'void *', 'uint32']);
  const freeLibrary = kernel32.func('__stdcall', 'FreeLibrary', 'bool', ['void *']);
  const findResource = kernel32.func('__stdcall', 'FindResourceW', 'void *', ['void *', 'uintptr_t', 'uintptr_t']);
  const sizeOfResource = kernel32.func('__stdcall', 'SizeofResource', 'uint32', ['void *', 'void *']);
  const loadResource = kernel32.func('__stdcall', 'LoadResource', 'void *', ['void *', 'void *']);
  const lockResource = kernel32.func('__stdcall', 'LockResource', 'void *', ['void *']);

  const module = loadLibraryEx(executablePath, null, 0x00000002);
  if (!module) throw new Error('Failed to load Windows executable resources.');
  try {
    const resource = findResource(module, resourceId, resourceType);
    if (!resource) throw new Error(`Windows resource ${resourceType}/${resourceId} is missing.`);
    const size = Number(sizeOfResource(module, resource));
    const loaded = loadResource(module, resource);
    const pointer = lockResource(loaded);
    if (!pointer || size <= 0) throw new Error(`Windows resource ${resourceType}/${resourceId} is empty.`);
    return Buffer.from(koffi.decode(pointer, 'uint8_t', size));
  } finally {
    freeLibrary(module);
  }
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

describe.runIf(process.platform === 'win32')('Windows installer branding', () => {
  it('brands an executable with the approved SUD-D icon resource', async () => {
    const electronExecutable = desktopRequire('electron') as string;
    const tempRoot = await mkdtemp(join(tmpdir(), 'sud-d-branding-'));
    tempRoots.push(tempRoot);
    const executablePath = join(tempRoot, 'SUD-D.exe');
    await copyFile(electronExecutable, executablePath);

    const approvedPng = await readFile(approvedPngPath);
    const baselineIcon = readWin32Resource(executablePath, 3, 1);
    expect(sha256(baselineIcon)).not.toBe(sha256(approvedPng));

    const branding = await import(pathToFileURL(brandingModulePath).href) as {
      brandWindowsExecutable(options: { executablePath: string; iconPngPath: string }): Promise<void>;
    };
    await branding.brandWindowsExecutable({ executablePath, iconPngPath: approvedPngPath });

    expect(readWin32Resource(executablePath, 3, 1)).toEqual(approvedPng);
    const group = readWin32Resource(executablePath, 14, 1);
    expect(group.readUInt16LE(4)).toBe(1);
    expect(group[6]).toBe(192);
    expect(group[7]).toBe(192);
    expect(group.readUInt16LE(18)).toBe(1);
  });

  it('derives a single-image ICO directly from the approved PNG bytes', async () => {
    const approvedPng = await readFile(approvedPngPath);
    const branding = await import(pathToFileURL(brandingModulePath).href) as {
      createWindowsIconFile(png: Buffer): Buffer;
    };
    const ico = branding.createWindowsIconFile(approvedPng);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico[6]).toBe(192);
    expect(ico[7]).toBe(192);
    expect(ico.readUInt32LE(14)).toBe(approvedPng.length);
    expect(ico.readUInt32LE(18)).toBe(22);
    expect(ico.subarray(22)).toEqual(approvedPng);
  });
});
