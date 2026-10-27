import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Run instructions and evidence boundaries are in the fasttrack closeout.
// New synthetic input: no access to the frozen or friend's Workspace.
const captions = '1\n00:00:00,000 --> 00:00:10,000\nฉากหนึ่ง สีแดง\n\n'
  + '2\n00:00:10,000 --> 00:00:20,000\nฉากสอง สีเขียว\n\n'
  + '3\n00:00:20,000 --> 00:00:30,000\nฉากสาม สีน้ำเงิน\n';
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

// Test-only QC oracle; never a product execution receipt.
function checkProbe(probe: unknown): void {
  expect(probe).toMatchObject({
    format: { format_name: expect.stringContaining('mp4') },
    streams: expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', codec_name: 'mpeg4', width: 320, height: 180 }),
      expect.objectContaining({ codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 1 }),
      expect.objectContaining({ codec_type: 'subtitle', codec_name: 'mov_text' }),
    ]),
  });
  const duration = Number((probe as { format: { duration: string } }).format.duration);
  expect(Number.isFinite(duration)).toBe(true);
  expect(Math.abs(duration - 30)).toBeLessThanOrEqual(0.1);
}

function checkScenes(pixels: Buffer): void {
  expect(pixels.length).toBe(9);
  // Independently decoded midpoint colors must be red, green, blue in that order.
  for (let scene = 0; scene < 3; scene += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = pixels[scene * 3 + channel]!;
      if (channel === scene) expect(value).toBeGreaterThan(220);
      else expect(value).toBeLessThan(30);
    }
  }
}

function noLinks(target: string): void {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('MEDIA_PATH_LINK_DENIED');
    if (path.dirname(current) === current) break;
  }
}

function approvedTool(kind: 'FFMPEG' | 'FFPROBE'): { file: string; sha256: string } {
  const file = process.env[`SUD_D_SOLO_${kind}`];
  const sha256 = process.env[`SUD_D_SOLO_${kind}_SHA256`];
  if (!file || !path.isAbsolute(file) || !fs.existsSync(file)) throw new Error('MEDIA_TOOL_UNAVAILABLE');
  if (!sha256 || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('MEDIA_TOOL_HASH_REQUIRED');
  noLinks(file);
  if (!fs.statSync(file).isFile() || hash(fs.readFileSync(file)) !== sha256) throw new Error('MEDIA_TOOL_HASH_MISMATCH');
  return { file, sha256 };
}

const validProbe = {
  format: { duration: '30.000000', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  streams: [
    { codec_type: 'video', codec_name: 'mpeg4', width: 320, height: 180 },
    { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 1 },
    { codec_type: 'subtitle', codec_name: 'mov_text' },
  ],
};

describe('Solo offline media QC oracle (no encoder required)', () => {
  it('rejects missing streams, wrong duration/resolution/codec and nonnumeric duration', () => {
    expect(() => checkProbe(validProbe)).not.toThrow();
    for (const invalid of [
      {},
      { ...validProbe, streams: validProbe.streams.slice(0, 2) },
      ...['0', '29', 'NaN', 'Infinity'].map((duration) => ({ ...validProbe, format: { ...validProbe.format, duration } })),
      { ...validProbe, streams: [{ ...validProbe.streams[0], width: 640 }, ...validProbe.streams.slice(1)] },
      { ...validProbe, streams: [{ ...validProbe.streams[0], codec_name: 'png' }, ...validProbe.streams.slice(1)] },
    ]) expect(() => checkProbe(invalid)).toThrow();
  });
  it('rejects a reversed, missing or black decoded scene', () => {
    expect(() => checkScenes(Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255]))).not.toThrow();
    for (const bytes of [[0, 0, 255, 0, 255, 0, 255, 0, 0], [], Array(9).fill(0)]) {
      expect(() => checkScenes(Buffer.from(bytes))).toThrow();
    }
  });
});

// Explicit developer-only opt-in. Never automatically selected by verify.run,
// never reports an owner approval, never downloads or searches for an executable.
const physical = process.env['SUD_D_SOLO_OFFLINE_MEDIA'] === '1' ? it : it.skip;
physical('offline physical MP4 + independent QC (MEDIA_TOOL_UNAVAILABLE / opt-in required)', () => {
  const ffmpeg = approvedTool('FFMPEG');
  const ffprobe = approvedTool('FFPROBE');
  noLinks(os.tmpdir());
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-solo-offline-media-'));
  console.warn(`Solo developer media artifact directory: ${root}`);
  // Keep files for inspection, including on failure. No recursive cleanup or retry.
  const write = (name: string, content: string): void => fs.writeFileSync(path.join(root, name), content, { flag: 'wx' });
  const environment: NodeJS.ProcessEnv = { TEMP: root, TMP: root, AV_LOG_FORCE_NOCOLOR: '1' };
  if (process.env['SystemRoot']) environment['SystemRoot'] = process.env['SystemRoot'];
  const run = (tool: typeof ffmpeg, args: string[]): Buffer => {
    noLinks(tool.file);
    if (hash(fs.readFileSync(tool.file)) !== tool.sha256) throw new Error('MEDIA_TOOL_HASH_MISMATCH');
    // Fixed tools launch no descendants. Timeout targets only this owned direct
    // child via execFileSync; no numeric PID adoption, taskkill, shell or Job.
    return execFileSync(tool.file, args, {
      cwd: root, env: environment, shell: false, windowsHide: true,
      timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };
  write('source.srt', captions);
  write('attempt.json', JSON.stringify({ schema: 1, kind: 'developer-only', state: 'started', ffmpeg, ffprobe }));
  try {
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
      '-f', 'lavfi', '-i', "color=c=red:s=320x180:r=10:d=30,drawbox=color=lime:t=fill:enable='between(t,10,19.999)',drawbox=color=blue:t=fill:enable='gte(t,20)'",
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
      '-protocol_whitelist', 'file', '-f', 'srt', '-i', 'source.srt',
      '-map', '0:v:0', '-map', '1:a:0', '-map', '2:s:0', '-t', '30',
      '-c:v', 'mpeg4', '-q:v', '4', '-pix_fmt', 'yuv420p', '-threads', '1',
      '-c:a', 'aac', '-b:a', '64k', '-c:s', 'mov_text', '-metadata:s:s:0', 'language=tha',
      '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact', 'candidate.mp4']);
    const probeBytes = run(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file',
      '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height,sample_rate,channels',
      '-of', 'json', 'candidate.mp4']);
    const probe: unknown = JSON.parse(probeBytes.toString('utf8'));
    write('probe.json', probeBytes.toString('utf8'));
    checkProbe(probe);
    const input = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-xerror', '-protocol_whitelist', 'file', '-i', 'candidate.mp4'];
    run(ffmpeg, [...input, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
    checkScenes(run(ffmpeg, [...input, '-map', '0:v:0', '-vf', 'fps=1/10,scale=1:1',
      '-frames:v', '3', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']));
    const extracted = run(ffmpeg, [...input, '-map', '0:s:0', '-f', 'srt', 'pipe:1']).toString('utf8');
    expect(extracted.replace(/\r\n/g, '\n').trim()).toBe(captions.trim());
    const artifact = fs.readFileSync(path.join(root, 'candidate.mp4'));
    expect(artifact.length).toBeGreaterThan(1024);
    const receipt = {
      schema: 1, VERIFY_RUN_ACTUAL: false, MP4_FILE_INDEPENDENTLY_DECODED: true,
      TEN_PHASE_REAL_AUTO_RUN: false, SYNTHETIC_REAL_MP4_PASS: true,
      REAL_THAI_TTS_PASS: false, placeholders: ['solid colors', 'silent audio'],
      artifact: { file: 'candidate.mp4', sha256: hash(artifact), bytes: artifact.length },
      sourceSha256: hash(captions), probeSha256: hash(probeBytes), ffmpeg, ffprobe,
      qc: ['streams/duration/resolution', 'full video/audio decode', 'scene order', 'Thai captions and timing'],
    };
    write('receipt.json', JSON.stringify(receipt, null, 2));
    console.warn(JSON.stringify(receipt));
  } catch {
    write('quarantine.json', JSON.stringify({ state: 'failed', automaticRetry: false, cleanupVerified: false }));
    throw new Error(`MEDIA_ACCEPTANCE_FAILED: inspect quarantined developer artifacts at ${root}; do not retry automatically`);
  }
}, 330_000);
