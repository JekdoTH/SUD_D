import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  inspectF2B2KoffiX64Layouts,
  verifyF2B2PinnedNodeBytes,
  F2B2_REQUIRED_WIN32_APIS,
} from '@sud-d/infrastructure';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('F2-B2 preparation: static Win32 ABI and read-only exact executable pin (NO DLL calls)', () => {
  it('models the exact Win32 x64 struct sizes used by suspended AppContainer/Job creation', () => {
    expect(inspectF2B2KoffiX64Layouts()).toMatchObject({
      supported: true,
      sizes: {
        securityCapabilities: 24, startupInfoW: 104, startupInfoExW: 112,
        processInformation: 24, basicJobLimits: 64, ioCounters: 48, jobExtendedLimits: 144,
      },
    });
    expect(F2B2_REQUIRED_WIN32_APIS.kernel32).toContain('CreateProcessW');
    expect(F2B2_REQUIRED_WIN32_APIS.advapi32).toContain('GetTokenInformation');
    expect(F2B2_REQUIRED_WIN32_APIS.userenv).toContain('CreateAppContainerProfile');
  });

  it('verifies pinned Node bytes without running them and rejects a changed hash or non-node name', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sud-d-f2b2-static-'));
    roots.push(root);
    const filename = path.join(root, 'node.exe');
    const content = Buffer.from('f2b2 fake node bytes; NEVER an executable\n', 'utf8');
    fs.writeFileSync(filename, content);
    const sha256 = createHash('sha256').update(content).digest('hex');
    expect(await verifyF2B2PinnedNodeBytes({ path: filename, sha256 })).toBe(true);
    expect(await verifyF2B2PinnedNodeBytes({ path: filename, sha256: 'a'.repeat(64) })).toBe(false);
    expect(await verifyF2B2PinnedNodeBytes({ path: filename.replace('node.exe', 'cmd.exe'), sha256 })).toBe(false);
    fs.writeFileSync(filename, Buffer.from('changed'));
    expect(await verifyF2B2PinnedNodeBytes({ path: filename, sha256 })).toBe(false);
  });

  it('freezes each synthetic fixture byte hash without importing or executing fixture source', () => {
    const fixtureRoot = path.join(process.cwd(), 'packages', 'tests', 'fixtures', 'private-mvp-f2b2');
    const hashes = {
      'fixture.mjs': '44683c9eabb0ece9dcc79a97b1790105b84da9f0273d91ffb60972f6597bc9a7',
      'fixture-child.mjs': 'f8d9974970ca9b4f9ff2cebbb5831505e14575634ce84906ce67b1ead79380bc',
      'fixture-grandchild.mjs': '269d70fb7334cbc1c8c75a93d04a0a55c274031a27cd132bdccc4f79209d80b4',
      'input.json': '5e42140d52969389339029523fdc66dc5e44b58c1f616ee2bf0ca69a50a9aeca',
      'expected-output.json': '596d935e981ce39b8e986273599a7f23f503eecdd66779064e7c7a49469a81b3',
      'sentinel.txt': 'b8b8d75b6b66aaac8f20723c27ce2d02d1bd4da3937f86aa0a2d59974fff2a9d',
    };
    expect(fs.readdirSync(fixtureRoot).sort()).toEqual(Object.keys(hashes).sort());
    for (const [name, expectedSha] of Object.entries(hashes)) {
      const source = fs.readFileSync(path.join(fixtureRoot, name));
      expect(createHash('sha256').update(source).digest('hex')).toBe(expectedSha);
    }
    const input = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'input.json'), 'utf8')) as {
      fixtureRevision: string; payload: string;
    };
    const expected = fs.readFileSync(path.join(fixtureRoot, 'expected-output.json'), 'utf8');
    expect(expected).toBe(JSON.stringify({
      status: 'ok', revision: input.fixtureRevision, payload: input.payload,
    }) + '\n');
    // This test performs byte reads/hashes only: no script evaluation, children or Win32 calls.
  });

  it('does not mistake an arbitrary path or malformed digest for a trusted Node binary', async () => {
    expect(await verifyF2B2PinnedNodeBytes({ path: 'node.exe', sha256: '0'.repeat(64) })).toBe(false);
    expect(await verifyF2B2PinnedNodeBytes({ path: 'C:\\Windows\\System32\\cmd.exe', sha256: '0'.repeat(64) })).toBe(false);
    expect(await verifyF2B2PinnedNodeBytes({ path: 'C:\\Program Files\\nodejs\\node.exe', sha256: 'not-sha256' })).toBe(false);
  });
});
