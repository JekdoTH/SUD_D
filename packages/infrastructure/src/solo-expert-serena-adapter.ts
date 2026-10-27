/**
 * SOLO-EXPERT-B0 private, injected fake transport and STRICT stock Serena shell decoder.
 * This module has no import of the managed runtime, process APIs, filesystem or network.
 * No production registration / no default transport. Cooperative host-user disclosure
 * does NOT certify local Serena logs, network isolation, or descendant cleanup.
 */
import { createHash } from 'node:crypto';

export type B0ProfileId = 'harmless-short-smoke' | 'reviewed-development-script';
export type B0MockStatus = 'simulated-success' | 'command-failed' | 'blocked' | 'unknown';
export interface B0MockResult {
  readonly executionKind: 'mock';
  readonly status: B0MockStatus;
  readonly reason: 'MOCK_OK' | 'COMMAND_EXIT_NONZERO' | 'MCP_ERROR' | 'MALFORMED_RESPONSE'
    | 'OUTPUT_UNEXPECTED' | 'CWD_MISMATCH' | 'TRANSPORT_UNKNOWN' | 'MOCK_TIMEOUT';
  readonly exitCode?: number;
}
export interface B0MockAdapter {
  fingerprint(profileId: B0ProfileId): string | undefined;
  invoke(profileId: B0ProfileId, expectedRoot: string, timeoutMs: number): Promise<B0MockResult>;
}
type FakeCallTool = (request: Readonly<{
  name: 'execute_shell_command';
  arguments: Readonly<{ command: string; capture_stderr: true; max_answer_chars: 256 }>;
}>) => Promise<unknown>;

const RECIPES = Object.freeze({
  'harmless-short-smoke': Object.freeze({ command: 'echo SUD_D_B0_OK', stdout: 'SUD_D_B0_OK\r\n' }),
  'reviewed-development-script': Object.freeze({ command: 'echo SUD_D_B0_DEV_OK', stdout: 'SUD_D_B0_DEV_OK\r\n' }),
});
const MAX_RESPONSE = 2048;
const safe = (status: B0MockStatus, reason: B0MockResult['reason'], exitCode?: number): B0MockResult =>
  Object.freeze({
    executionKind: 'mock', status, reason,
    ...(exitCode === undefined ? {} : { exitCode }),
  });

export function b0RecipeFingerprint(profileId: B0ProfileId): string | undefined {
  if (!Object.hasOwn(RECIPES, profileId)) return undefined;
  const recipe = RECIPES[profileId];
  return createHash('sha256')
    .update(JSON.stringify({
      registry: 'b0-private-registry-v1', profileId, tool: 'execute_shell_command',
      command: recipe.command, expectedStdout: recipe.stdout,
      captureStderr: true, maxAnswerChars: 256, schema: 'serena-1.7.0-stock-shell-b0-v1',
    })).digest('hex');
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const names = Reflect.ownKeys(value);
  return names.length === keys.length && names.every(key => {
    if (typeof key !== 'string' || !keys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor;
  });
}

/** No raw output, cwd or upstream exceptions can appear in the returned DTO. */
function decode(raw: unknown, profileId: B0ProfileId, expectedRoot: string): B0MockResult {
  try {
    if (!exact(raw, ['isError', 'content']) || typeof raw.isError !== 'boolean'
      || !Array.isArray(raw.content) || raw.content.length !== 1) return safe('unknown', 'MALFORMED_RESPONSE');
    const block: unknown = raw.content[0];
    if (!exact(block, ['type', 'text']) || block.type !== 'text' || typeof block.text !== 'string'
      || block.text.length > MAX_RESPONSE) return safe('unknown', 'MALFORMED_RESPONSE');
    // ToolError may contain poison in the text: never parse or surface it.
    if (raw.isError) return safe('blocked', 'MCP_ERROR');
    const parsed: unknown = JSON.parse(block.text);
    if (!exact(parsed, ['return_code', 'stdout', 'stderr', 'cwd'])
      || typeof parsed.return_code !== 'number' || !Number.isInteger(parsed.return_code)
      || parsed.return_code < 0 || parsed.return_code > 255
      || typeof parsed.stdout !== 'string' || typeof parsed.stderr !== 'string'
      || typeof parsed.cwd !== 'string'
      || parsed.stdout.length > 256 || parsed.stderr.length > 256) return safe('unknown', 'MALFORMED_RESPONSE');
    if (parsed.cwd !== expectedRoot) return safe('blocked', 'CWD_MISMATCH');
    if (parsed.return_code !== 0) return safe('command-failed', 'COMMAND_EXIT_NONZERO', parsed.return_code);
    if (parsed.stderr !== '' || parsed.stdout !== RECIPES[profileId].stdout) {
      return safe('blocked', 'OUTPUT_UNEXPECTED');
    }
    return safe('simulated-success', 'MOCK_OK', 0);
  } catch {
    return safe('unknown', 'MALFORMED_RESPONSE');
  }
}

/** Injection-only, intentionally no live factory. Fake callback supplied by a pure test. */
export function createSoloExpertFakeAdapter(callTool: FakeCallTool): B0MockAdapter {
  return Object.freeze({
    fingerprint: b0RecipeFingerprint,
    async invoke(profileId: B0ProfileId, expectedRoot: string, timeoutMs: number): Promise<B0MockResult> {
      if (!Object.hasOwn(RECIPES, profileId) || typeof expectedRoot !== 'string'
        || expectedRoot.length === 0 || expectedRoot.length > 240
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1_000) {
        return safe('blocked', 'MALFORMED_RESPONSE');
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          Promise.resolve().then(() => callTool(Object.freeze({
            name: 'execute_shell_command',
            arguments: Object.freeze({
              command: RECIPES[profileId].command,
              capture_stderr: true,
              max_answer_chars: 256,
            }),
          }))),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('MOCK_TIMEOUT')), timeoutMs);
          }),
        ]);
        return decode(response, profileId, expectedRoot);
      } catch (error) {
        return safe('unknown', error instanceof Error && error.message === 'MOCK_TIMEOUT'
          ? 'MOCK_TIMEOUT' : 'TRANSPORT_UNKNOWN');
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  });
}
