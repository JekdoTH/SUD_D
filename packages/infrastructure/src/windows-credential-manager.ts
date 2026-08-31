import koffi from 'koffi';
import type { CredentialSetupOutcome, WindowsCredentialNativePort } from './credential-store.js';

const CRED_TYPE_GENERIC = 1;
const CRED_PERSIST_LOCAL_MACHINE = 2;
const ERROR_NOT_FOUND = 1168;
const ERROR_CANCELLED = 1223;
const CRED_MAX_CREDENTIAL_BLOB_SIZE = 5 * 512;
const MAX_PROMPT_PASSWORD_CHARS = 1281;

const CREDUI_FLAGS_ALWAYS_SHOW_UI = 0x00080;
const CREDUI_FLAGS_DO_NOT_PERSIST = 0x00002;
const CREDUI_FLAGS_PASSWORD_ONLY_OK = 0x00200;
const CREDUI_FLAGS_GENERIC_CREDENTIALS = 0x40000;
const CREDUI_FLAGS =
  CREDUI_FLAGS_ALWAYS_SHOW_UI
  | CREDUI_FLAGS_DO_NOT_PERSIST
  | CREDUI_FLAGS_PASSWORD_ONLY_OK
  | CREDUI_FLAGS_GENERIC_CREDENTIALS;

const FILETIME = koffi.struct('SUD_D_FILETIME', {
  dwLowDateTime: 'uint32',
  dwHighDateTime: 'uint32',
});

const CREDENTIALW = koffi.struct('SUD_D_CREDENTIALW', {
  Flags: 'uint32',
  Type: 'uint32',
  TargetName: 'str16',
  Comment: 'str16',
  LastWritten: FILETIME,
  CredentialBlobSize: 'uint32',
  CredentialBlob: 'void *',
  Persist: 'uint32',
  AttributeCount: 'uint32',
  Attributes: 'void *',
  TargetAlias: 'str16',
  UserName: 'str16',
});

const CREDUI_INFOW = koffi.struct('SUD_D_CREDUI_INFOW', {
  cbSize: 'uint32',
  hwndParent: 'void *',
  pszMessageText: 'str16',
  pszCaptionText: 'str16',
  hbmBanner: 'void *',
});

interface DecodedCredential {
  CredentialBlobSize: number;
  CredentialBlob: unknown;
}

export interface Win32CredentialVault {
  writeStoredCredential(targetName: string, credentialUtf16: Buffer): void;
  hasStoredCredential(targetName: string): boolean;
  materializeStoredCredential(
    targetName: string,
    environment: NodeJS.ProcessEnv,
    environmentName: string,
  ): boolean;
  deleteStoredCredential(targetName: string): void;
}

class WindowsCredentialOperationError extends Error {
  constructor() {
    super('Windows credential operation failed');
    this.name = 'WindowsCredentialOperationError';
  }
}

function requireWindows(): void {
  if (process.platform !== 'win32') throw new WindowsCredentialOperationError();
}

function utf16ContentLength(buffer: Buffer): number {
  for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
    if (buffer[offset] === 0 && buffer[offset + 1] === 0) return offset;
  }
  return buffer.length;
}

function validateCredentialBuffer(buffer: Buffer): void {
  if (
    buffer.length === 0
    || buffer.length > CRED_MAX_CREDENTIAL_BLOB_SIZE
    || buffer.length % 2 !== 0
  ) {
    throw new WindowsCredentialOperationError();
  }
}

export function createWin32CredentialVault(): Win32CredentialVault {
  requireWindows();
  const advapi32 = koffi.load('advapi32.dll');
  const kernel32 = koffi.load('kernel32.dll');

  const credWrite = advapi32.func(
    '__stdcall',
    'CredWriteW',
    'bool',
    [koffi.pointer(CREDENTIALW), 'uint32'],
  );
  const credRead = advapi32.func(
    '__stdcall',
    'CredReadW',
    'bool',
    ['str16', 'uint32', 'uint32', koffi.out(koffi.pointer(CREDENTIALW, 2))],
  );
  const credDelete = advapi32.func(
    '__stdcall',
    'CredDeleteW',
    'bool',
    ['str16', 'uint32', 'uint32'],
  );
  const credFree = advapi32.func('__stdcall', 'CredFree', 'void', ['void *']);
  const getLastError = kernel32.func('__stdcall', 'GetLastError', 'uint32', []);

  const readPointer = (targetName: string): unknown | null => {
    const output: unknown[] = [null];
    if (credRead(targetName, CRED_TYPE_GENERIC, 0, output)) return output[0] ?? null;
    const errorCode = getLastError();
    if (errorCode === ERROR_NOT_FOUND) return null;
    throw new WindowsCredentialOperationError();
  };

  return {
    writeStoredCredential(targetName: string, credentialUtf16: Buffer): void {
      validateCredentialBuffer(credentialUtf16);
      const credential = {
        Flags: 0,
        Type: CRED_TYPE_GENERIC,
        TargetName: targetName,
        Comment: null,
        LastWritten: { dwLowDateTime: 0, dwHighDateTime: 0 },
        CredentialBlobSize: credentialUtf16.length,
        CredentialBlob: credentialUtf16,
        Persist: CRED_PERSIST_LOCAL_MACHINE,
        AttributeCount: 0,
        Attributes: null,
        TargetAlias: null,
        UserName: 'SUD-D Runtime API Key',
      };
      if (!credWrite(credential, 0)) throw new WindowsCredentialOperationError();
    },

    hasStoredCredential(targetName: string): boolean {
      const pointer = readPointer(targetName);
      if (!pointer) return false;
      credFree(pointer);
      return true;
    },

    materializeStoredCredential(
      targetName: string,
      environment: NodeJS.ProcessEnv,
      environmentName: string,
    ): boolean {
      const pointer = readPointer(targetName);
      if (!pointer) return false;
      let credentialBuffer: Buffer | undefined;
      try {
        const credential = koffi.decode(pointer, CREDENTIALW) as DecodedCredential;
        if (
          credential.CredentialBlobSize <= 0
          || credential.CredentialBlobSize > CRED_MAX_CREDENTIAL_BLOB_SIZE
          || credential.CredentialBlobSize % 2 !== 0
        ) {
          throw new WindowsCredentialOperationError();
        }
        credentialBuffer = Buffer.from(koffi.decode(
          credential.CredentialBlob,
          'uint8_t',
          credential.CredentialBlobSize,
        ) as Uint8Array);
        const value = credentialBuffer.toString('utf16le');
        if (value.length === 0 || value.includes('\0') || /[\r\n]/.test(value)) {
          throw new WindowsCredentialOperationError();
        }
        environment[environmentName] = value;
        return true;
      } finally {
        credentialBuffer?.fill(0);
        credFree(pointer);
      }
    },

    deleteStoredCredential(targetName: string): void {
      if (credDelete(targetName, CRED_TYPE_GENERIC, 0)) return;
      const errorCode = getLastError();
      if (errorCode !== ERROR_NOT_FOUND) throw new WindowsCredentialOperationError();
    },
  };
}

export function createWin32CredentialNativePort(): WindowsCredentialNativePort {
  requireWindows();
  const vault = createWin32CredentialVault();
  const credui = koffi.load('credui.dll');
  const promptForCredentials = credui.func(
    '__stdcall',
    'CredUIPromptForCredentialsW',
    'uint32',
    [
      koffi.pointer(CREDUI_INFOW),
      'str16',
      'void *',
      'uint32',
      'void *',
      'uint32',
      'void *',
      'uint32',
      'void *',
      'uint32',
    ],
  );

  return {
    hasStoredCredential(targetName: string): boolean {
      return vault.hasStoredCredential(targetName);
    },

    promptAndStoreCredential(targetName: string): CredentialSetupOutcome {
      const usernameBuffer = Buffer.alloc(2);
      const passwordBuffer = Buffer.alloc(MAX_PROMPT_PASSWORD_CHARS * 2);
      try {
        const uiInfo = {
          cbSize: koffi.sizeof(CREDUI_INFOW),
          hwndParent: null,
          pszMessageText: 'Enter the Runtime API Key for this device. Windows will store it securely for SUD-D.',
          pszCaptionText: 'Set up Runtime API Key',
          hbmBanner: null,
        };
        const result = promptForCredentials(
          uiInfo,
          'SUD_D Runtime API Key Setup',
          null,
          0,
          usernameBuffer,
          1,
          passwordBuffer,
          MAX_PROMPT_PASSWORD_CHARS,
          null,
          CREDUI_FLAGS,
        );
        if (result === ERROR_CANCELLED) return 'cancelled';
        if (result !== 0) throw new WindowsCredentialOperationError();

        const contentLength = utf16ContentLength(passwordBuffer);
        if (contentLength === 0) throw new WindowsCredentialOperationError();
        const credentialView = passwordBuffer.subarray(0, contentLength);
        validateCredentialBuffer(credentialView);
        vault.writeStoredCredential(targetName, credentialView);
        return 'configured';
      } finally {
        usernameBuffer.fill(0);
        passwordBuffer.fill(0);
      }
    },

    deleteStoredCredential(targetName: string): void {
      vault.deleteStoredCredential(targetName);
    },

    materializeStoredCredential(
      targetName: string,
      environment: NodeJS.ProcessEnv,
      environmentName: string,
    ): boolean {
      return vault.materializeStoredCredential(targetName, environment, environmentName);
    },
  };
}
