import { readFile } from 'node:fs/promises';

import koffi from 'koffi';

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const ICON_RESOURCE_ID = 1;
const GROUP_RESOURCE_ID = 1;
const WINDOWS_EN_US = 0x0409;
const APPROVED_ICON_SIZE = 192;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function assertApprovedPngShape(png) {
  if (png.length < 24 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('SUD-D Windows branding source must be a PNG image.');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width !== APPROVED_ICON_SIZE || height !== APPROVED_ICON_SIZE) {
    throw new Error(`SUD-D Windows branding source must be ${APPROVED_ICON_SIZE}x${APPROVED_ICON_SIZE}.`);
  }
}

function createGroupIconResource(pngLength) {
  const group = Buffer.alloc(20);
  group.writeUInt16LE(0, 0);
  group.writeUInt16LE(1, 2);
  group.writeUInt16LE(1, 4);
  group[6] = APPROVED_ICON_SIZE;
  group[7] = APPROVED_ICON_SIZE;
  group[8] = 0;
  group[9] = 0;
  group.writeUInt16LE(1, 10);
  group.writeUInt16LE(32, 12);
  group.writeUInt32LE(pngLength, 14);
  group.writeUInt16LE(ICON_RESOURCE_ID, 18);
  return group;
}

export function createWindowsIconFile(png) {
  assertApprovedPngShape(png);
  const ico = Buffer.alloc(22 + png.length);
  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico[6] = APPROVED_ICON_SIZE;
  ico[7] = APPROVED_ICON_SIZE;
  ico[8] = 0;
  ico[9] = 0;
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  png.copy(ico, 22);
  return ico;
}

export async function brandWindowsExecutable({ executablePath, iconPngPath }) {
  if (process.platform !== 'win32') throw new Error('Windows executable branding requires Windows.');
  const png = await readFile(iconPngPath);
  assertApprovedPngShape(png);
  const group = createGroupIconResource(png.length);

  const kernel32 = koffi.load('kernel32.dll');
  const beginUpdateResource = kernel32.func('__stdcall', 'BeginUpdateResourceW', 'void *', ['str16', 'bool']);
  const updateResource = kernel32.func('__stdcall', 'UpdateResourceW', 'bool', ['void *', 'uintptr_t', 'uintptr_t', 'uint16', 'void *', 'uint32']);
  const endUpdateResource = kernel32.func('__stdcall', 'EndUpdateResourceW', 'bool', ['void *', 'bool']);
  const getLastError = kernel32.func('__stdcall', 'GetLastError', 'uint32', []);

  const updateHandle = beginUpdateResource(executablePath, false);
  if (!updateHandle) throw new Error(`BeginUpdateResourceW failed (${getLastError()}).`);

  let committed = false;
  try {
    if (!updateResource(updateHandle, RT_ICON, ICON_RESOURCE_ID, WINDOWS_EN_US, png, png.length)) {
      throw new Error(`UpdateResourceW RT_ICON failed (${getLastError()}).`);
    }
    if (!updateResource(updateHandle, RT_GROUP_ICON, GROUP_RESOURCE_ID, WINDOWS_EN_US, group, group.length)) {
      throw new Error(`UpdateResourceW RT_GROUP_ICON failed (${getLastError()}).`);
    }
    if (!endUpdateResource(updateHandle, false)) {
      throw new Error(`EndUpdateResourceW failed (${getLastError()}).`);
    }
    committed = true;
  } finally {
    if (!committed) endUpdateResource(updateHandle, true);
  }
}
