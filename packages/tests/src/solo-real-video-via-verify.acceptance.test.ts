import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createApprovalCoordinator, createApprovalService } from '@sud-d/application';
import {
  canonicalizePath, createApprovalRepository, createAuditRepository, createGitSafetyAdapter,
  createRestrictedVerifyAdapter, createTeamRepository, createTeamTransitionUnitOfWork,
  createWorkspaceRepository, createWorkspaceGitSettingsRepository, createWorkMemoryRepository,
  createWorkspaceTextFileSystem, openDatabase,
} from '@sud-d/infrastructure';
import { createProductionMcpServer, createStdioGatewayTransport } from '@sud-d/mcp-gateway';

const ROOT = String.raw`C:\1.งานโด้\SUD-D-Solo-Run-Workspace`;
const require = createRequire(import.meta.url);
const runner = () => require(path.join(ROOT, 'solo-render.cjs'));

describe.skipIf(!fs.existsSync(path.join(ROOT, 'solo-render.cjs')))('fixed solo runner in-process guards (no child execution)', () => {
  it('rejects extra arguments and any other working root', () => {
    const r = runner();
    expect(() => r.validateInvocation([], ROOT)).not.toThrow();
    expect(() => r.validateInvocation(['--output', '../escape'], ROOT)).toThrow();
    expect(() => r.validateInvocation([], path.dirname(ROOT))).toThrow();
  });
  it('fails closed on incomplete probe, wrong scenes or changed Thai cues', () => {
    const r = runner();
    expect(() => r.assertProbe({})).toThrow();
    expect(() => r.assertScenes(Buffer.alloc(9))).toThrow();
    expect(() => r.assertScenes(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]))).not.toThrow();
    expect(() => r.assertCaptions('wrong')).toThrow();
  });
  it('rejects wrong duration and missing audio/subtitle even with valid video', () => {
    const r = runner();
    const valid = { format: { duration: '30', format_name: 'mp4' }, streams: [
      { codec_type: 'video', codec_name: 'mpeg4', width: 320, height: 180 },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 1 },
      { codec_type: 'subtitle', codec_name: 'mov_text' },
    ] };
    expect(() => r.assertProbe(valid)).not.toThrow();
    for (const duration of ['0', '29', 'NaN', 'Infinity']) {
      expect(() => r.assertProbe({ ...valid, format: { ...valid.format, duration } })).toThrow();
    }
    expect(() => r.assertProbe({ ...valid, streams: valid.streams.slice(0, 1) })).toThrow();
    expect(() => r.assertScenes(Buffer.from([0, 0, 255, 0, 255, 0, 255, 0, 0]))).toThrow();
  });
});

const physical = process.env['SUD_D_SOLO_REAL_VIA_VERIFY'] === '1' ? it : it.skip;
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
interface Rpc {
  id?: number;
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: unknown;
}

// Exactly one opt-in attempt. No cleanup/retry, no production database, no mock executor.
physical('one physical media build through production MCP / Kernel / Approval / Audit', async () => {
  expect(process.platform).toBe('win32');
  expect(process.versions.modules).toBe('135');
  const r = runner();
  r.validateInvocation([], ROOT);
  const pin = r.preflight(); // Hash and link checks only, no process execution.
  expect(fs.existsSync(pin.RUN)).toBe(false);
  const manifestBytes = fs.readFileSync(path.join(ROOT, 'package.json'));
  const packageHash = hash(manifestBytes);
  expect(JSON.parse(manifestBytes.toString()).scripts).toEqual({ build: 'node solo-render.cjs' });
  const sqlite = openDatabase(':memory:'); sqlite.close(); // ABI guard before durable attempt.
  fs.mkdirSync(pin.RUN); // Exclusive durable attempt marker: fail closed on any future rerun.
  const write = (name: string, data: unknown): void => fs.writeFileSync(
    path.join(pin.RUN, name), JSON.stringify(data, null, 2), { flag: 'wx' },
  );
  write('attempt.json', { state: 'started', automaticRetry: false, codeHash: pin.CODE_HASH, packageHash });
  const db = openDatabase(path.join(pin.RUN, 'isolated-test.sqlite'));
  const workspaceRepo = createWorkspaceRepository(db);
  const canonical = canonicalizePath(ROOT);
  if (!canonical.ok) throw new Error('OWNED_ROOT_UNAVAILABLE');
  const workspace = workspaceRepo.save('Owned Solo Real Verify Acceptance', canonical.value);
  workspaceRepo.setActive(workspace.id);
  expect(workspaceRepo.list()).toHaveLength(1);
  expect(workspaceRepo.list()[0]?.canonicalRoot).toBe(canonical.value);
  const auditRepo = createAuditRepository(db);
  const approvalRepo = createApprovalRepository(db);
  const approval = createApprovalCoordinator({ repository: approvalRepo,
    runtimeInstanceId: 'solo-real-via-verify-20261012', hmacKey: randomBytes(32) });
  const approvalService = createApprovalService(approvalRepo, auditRepo);
  const server = createProductionMcpServer({
    workspaceRepo, auditRepo, approval,
    gitSettingsRepo: createWorkspaceGitSettingsRepository(db), internalRoots: [],
    fileSystem: createWorkspaceTextFileSystem(), gitSafety: createGitSafetyAdapter(),
    teamRepo: createTeamRepository(db), teamTransitionUow: createTeamTransitionUnitOfWork(db),
    workMemoryRepo: createWorkMemoryRepository(db),
    semanticRead: { read: async () => { throw new Error('SEMANTIC_NOT_AUTHORIZED'); } },
    semanticWrite: { write: async () => { throw new Error('SEMANTIC_NOT_AUTHORIZED'); } },
    restrictedVerify: createRestrictedVerifyAdapter({
      nodeExecutable: String.raw`C:\Program Files\nodejs\node.exe`,
      limits: { maxOutputBytes: 8192, timeoutMs: 240000 },
    }),
  });
  const input = new PassThrough(); const output = new PassThrough();
  let buffer = ''; let id = 0;
  const pending = new Map<number, (value: Rpc) => void>();
  output.setEncoding('utf8');
  output.on('data', (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      const value = JSON.parse(line) as Rpc;
      if (typeof value.id === 'number') pending.get(value.id)?.(value);
    }
  });
  const request = (method: string, params: unknown): Promise<Rpc> => new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(new Error('MCP_DEADLINE_STOP_NO_RETRY')); }, 250000);
    pending.set(current, (value) => { clearTimeout(timer); pending.delete(current); resolve(value); });
    input.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n');
  });
  const call = async (name: string, args: Record<string, unknown>): Promise<{
    approvalRequestId: string; value: { output: string };
  }> => {
    const response = await request('tools/call', { name, arguments: args });
    expect(response.error).toBeUndefined();
    const text = response.result?.content?.find(c => c.type === 'text')?.text;
    if (!text) throw new Error('MCP_PAYLOAD_MISSING');
    return JSON.parse(text);
  };
  try {
    await server.connect(createStdioGatewayTransport(input, output));
    await request('initialize', { protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'solo-real-via-verify', version: '1.0.0' } });
    input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
    expect(await call('work.resume', {})).toMatchObject({ ok: true, code: 'EXECUTED' });
    const invalid = await request('tools/call', { name: 'verify.run', arguments: { action: 'build', argv: ['bad'] } });
    expect(invalid.result?.isError).toBe(true);
    const before = await call('verify.run', { action: 'build' });
    expect(before).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED', policyDecision: 'ask' });
    expect(fs.existsSync(pin.MEDIA)).toBe(false);
    expect(typeof before.approvalRequestId).toBe('string');
    expect(approvalService.respond(before.approvalRequestId, 'approve')).toMatchObject({ ok: true, value: { status: 'approved' } });
    write('consent.json', { action: 'build', root: ROOT, codeHash: pin.CODE_HASH, packageHash,
      approved: true, approvalRequestId: before.approvalRequestId, workspaceId: workspace.id,
      scope: 'one synthetic 30s physical build; silent audio and color placeholders; isolated test DB only' });
    expect(hash(fs.readFileSync(path.join(ROOT, 'solo-render.cjs')))).toBe(pin.CODE_HASH);
    expect(hash(fs.readFileSync(path.join(ROOT, 'package.json')))).toBe(packageHash);
    const executed = await call('verify.run', { action: 'build' }); // Sole physical build call.
    write('verify-response.json', executed);
    expect(executed).toMatchObject({ ok: true, code: 'EXECUTED', policyDecision: 'ask',
      approvalDecision: 'approved', approvalRequestId: before.approvalRequestId,
      value: { action: 'build', passed: true, exitCode: 0, truncated: false } });
    expect(executed.value.output).toContain('SOLO_RENDER_PASS');
    expect(Buffer.byteLength(executed.value.output)).toBeLessThan(8192);
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(pin.MEDIA, name), 'utf8'));
    const child = read('attempt.json');
    expect(child.CODE_HASH).toBe(pin.CODE_HASH);
    expect(Number.isSafeInteger(child.pid)).toBe(true);
    expect(child.pid).not.toBe(process.pid);
    let alive = true;
    for (let n = 0; n < 50 && alive; n++) {
      try { process.kill(child.pid, 0); await new Promise(resolve => setTimeout(resolve, 20)); } catch { alive = false; }
    }
    expect(alive).toBe(false);
    for (let phase = 1; phase <= 10; phase++) expect(read(`${String(phase).padStart(2, '0')}-receipt.json`).phase).toBe(phase);
    expect(read('03-receipt.json').status).toBe('placeholder');
    expect(read('04-receipt.json').status).toBe('placeholder');
    const final = read('10-receipt.json');
    const media = path.join(pin.MEDIA, 'final.mp4');
    expect(hash(fs.readFileSync(media))).toBe(final.sha256);
    // Separate verifier invocation, independent of runner's self-reported QC.
    const tools = path.join(ROOT, 'tools', 'ffmpeg-9.0.2-essentials_build', 'bin');
    const verify = (kind: 'ffmpeg' | 'ffprobe', args: string[]) => {
      const file = path.join(tools, `${kind}.exe`);
      expect(hash(fs.readFileSync(file))).toBe(pin.HASHES[kind]);
      return execFileSync(file, args, { cwd: pin.MEDIA, shell: false, windowsHide: true,
        env: { SystemRoot: 'C:\\Windows', TEMP: pin.MEDIA, TMP: pin.MEDIA },
        timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    };
    const probe = JSON.parse(verify('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-show_streams', '-show_format', '-of', 'json', media]).toString());
    expect(Number(probe.format.duration)).toBeCloseTo(30, 1);
    expect(probe.streams).toHaveLength(3);
    expect(probe.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', width: 320, height: 180 }),
      expect.objectContaining({ codec_type: 'audio', codec_name: 'aac' }),
      expect.objectContaining({ codec_type: 'subtitle', codec_name: 'mov_text' }),
    ]));
    verify('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-protocol_whitelist', 'file', '-i', media,
      '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    const audit = auditRepo.list(200);
    expect(audit.filter(e => e.action === 'restricted_verify.run')).toEqual([
      expect.objectContaining({ workspaceId: workspace.id, resultCode: 'VERIFY_PASSED',
        metadata: expect.objectContaining({ action: 'build', passed: true }) }),
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/stdout|stderr|hmacKey/);
    write('audit.json', audit);
    write('acceptance.json', { VERIFY_RUN_ACTUAL: true, MP4_FILE_INDEPENDENTLY_DECODED: true,
      TEN_PHASE_REAL_AUTO_RUN: false, physicalBuildCount: 1, childExited: true,
      finalMp4: media, sha256: final.sha256, codeHash: pin.CODE_HASH, packageHash, tools: pin.HASHES,
      approvalRequestId: before.approvalRequestId, independentProbe: probe,
      limitations: ['host-user execution, no OS sandbox/Job proof', 'silent audio, color placeholders, soft Thai subtitles',
        'production MCP in test process; no live Desktop/tunnel proof'] });
    console.warn(`SOLO_REAL_VIA_VERIFY_PASS ${media}`);
  } catch (error) {
    write('STOP.json', { failed: true, automaticRetry: false, cleanupVerified: false });
    throw error;
  } finally {
    await server.close(); input.destroy(); output.destroy(); db.close();
  }
}, 330000);
