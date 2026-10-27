/** B1a fixed Serena 1.7.0 tool mapping; fake session only. No real transport constructor. */
// Local structural mirror: workspace package typechecks use prebuilt @sud-d/domain declarations.
// The canonical B1 contract is packages/domain/src/solo-expert-serena.ts; tests check parity.
const SOLO_B1_TOOL = 'execute_shell_command';
const SOLO_B1_COMMAND = 'echo SUD_D_B1_OK';
const SOLO_B1_EXPECTED_STDOUT = 'SUD_D_B1_OK\r\n';
const SOLO_B1_WAIT_MS = 5000;
const SOLO_B1_ANSWER_CHARS = 2048;
export interface B1aFixedReview {
  readonly profileId: string;
  readonly profileRevision: string;
  readonly toolName: string;
  readonly canonicalRoot: string;
  readonly waitMs: number;
  readonly maxAnswerChars: number;
  readonly maxCalls: number;
  readonly maxRetries: number;
}
export type B1aFixedResult = Readonly<{
  executionKind: 'mock';
  status: 'simulated-success' | 'command-failed' | 'unknown' | 'not-ready';
  reason: 'OK' | 'NONZERO_EXIT' | 'NOT_READY' | 'TOOL_ERROR' | 'INVALID_RESPONSE' |
    'CWD_DRIFT' | 'OUTPUT_DRIFT' | 'TIMEOUT' | 'TRANSPORT_UNKNOWN' | 'IDENTITY_DRIFT';
  exitCode?: number;
}>;

type FakeCallTool = (request: Readonly<{
  name: typeof SOLO_B1_TOOL;
  arguments: Readonly<{ command: typeof SOLO_B1_COMMAND; cwd: string; capture_stderr: true; max_answer_chars: typeof SOLO_B1_ANSWER_CHARS }>;
}>) => Promise<unknown>;
type SafeResult = B1aFixedResult;
const safe = (status: SafeResult['status'], reason: SafeResult['reason'], exitCode?: number): SafeResult =>
  Object.freeze({ executionKind: 'mock', status, reason,
    ...(exitCode === undefined ? {} : { exitCode }) });
function exact(data: unknown, keys: readonly string[]): data is Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data) ||
    Object.getPrototypeOf(data) !== Object.prototype) return false;
  const props = Reflect.ownKeys(data);
  return props.length === keys.length && props.every(p => {
    if (typeof p !== 'string' || !keys.includes(p)) return false;
    const d = Object.getOwnPropertyDescriptor(data, p);
    return d !== undefined && 'value' in d;
  });
}
function decode(raw: unknown, expectedRoot: string): SafeResult {
  try {
    if (!exact(raw, ['isError', 'content']) || typeof raw.isError !== 'boolean' ||
      !Array.isArray(raw.content) || raw.content.length !== 1) return safe('unknown', 'INVALID_RESPONSE');
    const item: unknown = raw.content[0];
    if (!exact(item, ['type', 'text']) || item.type !== 'text' ||
      typeof item.text !== 'string' || item.text.length > 4096) return safe('unknown', 'INVALID_RESPONSE');
    if (raw.isError) return safe('unknown', 'TOOL_ERROR');
    const parsed: unknown = JSON.parse(item.text);
    if (!exact(parsed, ['return_code', 'stdout', 'stderr', 'cwd']) ||
      !Number.isInteger(parsed.return_code) || (parsed.return_code as number) < 0 ||
      (parsed.return_code as number) > 255 || typeof parsed.stdout !== 'string' ||
      typeof parsed.stderr !== 'string' || typeof parsed.cwd !== 'string' ||
      parsed.stdout.length > SOLO_B1_ANSWER_CHARS || parsed.stderr.length > SOLO_B1_ANSWER_CHARS) {
      return safe('unknown', 'INVALID_RESPONSE');
    }
    if (parsed.cwd !== expectedRoot) return safe('unknown', 'CWD_DRIFT');
    if (parsed.return_code !== 0) return safe('command-failed', 'NONZERO_EXIT', parsed.return_code as number);
    if (parsed.stdout !== SOLO_B1_EXPECTED_STDOUT || parsed.stderr !== '') return safe('unknown', 'OUTPUT_DRIFT');
    return safe('simulated-success', 'OK', 0);
  } catch {
    return safe('unknown', 'INVALID_RESPONSE');
  }
}
export function createSoloExpertFixedAdapter(fakeCallTool: FakeCallTool) {
  return Object.freeze({
    async invoke(review: B1aFixedReview): Promise<B1aFixedResult> {
      if (review?.profileId !== 'harmless-short-smoke' || review.profileRevision !== 'b1-smoke-v1' ||
        review.toolName !== SOLO_B1_TOOL || review.waitMs !== SOLO_B1_WAIT_MS ||
        review.maxAnswerChars !== SOLO_B1_ANSWER_CHARS || review.maxCalls !== 1 ||
        review.maxRetries !== 0 || typeof review.canonicalRoot !== 'string' ||
        review.canonicalRoot.length < 3 || review.canonicalRoot.length > 240) return safe('not-ready', 'NOT_READY');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const raw = await Promise.race([
          Promise.resolve().then(() => fakeCallTool(Object.freeze({
            name: SOLO_B1_TOOL,
            arguments: Object.freeze({
              command: SOLO_B1_COMMAND, cwd: review.canonicalRoot,
              capture_stderr: true, max_answer_chars: SOLO_B1_ANSWER_CHARS,
            }),
          }))),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('b1-fixture-wait-expired')), SOLO_B1_WAIT_MS);
          }),
        ]);
        return decode(raw, review.canonicalRoot);
      } catch (error) {
        return safe('unknown', error instanceof Error && error.message === 'b1-fixture-wait-expired'
          ? 'TIMEOUT' : 'TRANSPORT_UNKNOWN');
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    },
  });
}
