import { randomBytes, randomUUID } from 'node:crypto';

export const APPROVAL_RUNTIME_INSTANCE_ENV = 'SUD_D_APPROVAL_RUNTIME_INSTANCE_ID';
export const APPROVAL_RUNTIME_HMAC_KEY_ENV = 'SUD_D_APPROVAL_RUNTIME_HMAC_KEY';

export interface ApprovalRuntimeIdentity {
  readonly runtimeInstanceId: string;
  readonly hmacKey: Buffer;
}

export function createApprovalRuntimeEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    [APPROVAL_RUNTIME_INSTANCE_ENV]: randomUUID(),
    [APPROVAL_RUNTIME_HMAC_KEY_ENV]: randomBytes(32).toString('base64url'),
  });
}

export function resolveApprovalRuntimeIdentity(
  environment: NodeJS.ProcessEnv = process.env,
): ApprovalRuntimeIdentity {
  const runtimeInstanceId = environment[APPROVAL_RUNTIME_INSTANCE_ENV];
  const encodedKey = environment[APPROVAL_RUNTIME_HMAC_KEY_ENV];

  if (runtimeInstanceId === undefined && encodedKey === undefined) {
    return {
      runtimeInstanceId: randomUUID(),
      hmacKey: randomBytes(32),
    };
  }

  if (
    typeof runtimeInstanceId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runtimeInstanceId)
    || typeof encodedKey !== 'string'
    || !/^[A-Za-z0-9_-]{43}$/.test(encodedKey)
  ) {
    throw new Error('SUD-D approval runtime identity is invalid');
  }

  const hmacKey = Buffer.from(encodedKey, 'base64url');
  if (hmacKey.length !== 32) {
    hmacKey.fill(0);
    throw new Error('SUD-D approval runtime identity is invalid');
  }
  return { runtimeInstanceId, hmacKey };
}
