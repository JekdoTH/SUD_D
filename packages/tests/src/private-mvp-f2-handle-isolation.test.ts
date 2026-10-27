import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  F2_HANDLE_ALLOWLIST_CONTRACT, F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE,
  F2_HANDLE_NATIVE_NEGATIVE_CASES, reviewF2HandleCreationBoundary,
  type F2HandleCreationObservation,
} from '@sud-d/infrastructure';

const valid = (): F2HandleCreationObservation => ({
  creator: 'dedicated-fixed-purpose-creator-v1',
  handles: {
    input: { value: 0x1000n, kind: 'nul-read', inheritable: true },
    output: { value: 0x2000n, kind: 'nul-write', inheritable: true },
    error: { value: 0x2000n, kind: 'nul-write', inheritable: true },
    job: { value: 0x3000n, kind: 'owned-job', inheritable: false },
  },
  attributeHandleList: [0x1000n, 0x2000n],
  attributeKinds: [0x20009, 0x20002],
  startupUsesStdHandles: true,
  inheritHandles: true,
  creationFlags: 0x08080404,
});

describe('F2 fixed-purpose handle isolation — code-only policy, NOT native evidence', () => {
  it('fixes a minimal two-unique-handle stdio allowlist and suspended-only creation options', () => {
    expect(F2_HANDLE_ALLOWLIST_CONTRACT).toMatchObject({
      revision: 'private-mvp-handle-isolation-v1',
      standardRoles: ['stdin', 'stdout', 'stderr'],
      uniqueInheritedHandleCount: 2,
      stdioTarget: 'NUL',
      noInheritedJobControl: true,
      suspendedOnly: true,
    });
    expect(reviewF2HandleCreationBoundary(valid())).toBe(true);
    expect(F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE).toBe(false);
  });

  it('denies leaked handles, reordering, duplicates, missing security attributes and extra creation privileges', () => {
    const x = valid();
    const cases: F2HandleCreationObservation[] = [
      {...x, attributeHandleList: [0x1000n, 0x2000n, 0x3000n]},
      {...x, attributeHandleList: [0x1000n, 0x1000n]},
      {...x, attributeHandleList: [0x2000n, 0x1000n]},
      {...x, attributeKinds: [0x20002]},
      {...x, attributeKinds: [0x20009, 0x20002, 0x20000]},
      {...x, creationFlags: 0x08080000},
      {...x, creationFlags: 0x08080404 | 0x00000001},
      {...x, inheritHandles: false},
      {...x, startupUsesStdHandles: false},
      {...x, creator: 'shared-gateway-process' as 'dedicated-fixed-purpose-creator-v1'},
    ];
    for (const c of cases) expect(reviewF2HandleCreationBoundary(c)).toBe(false);
  });

  it('denies forged or invalid stdio, job inheritance, and all unrecognized handle states', () => {
    const x = valid();
    const cases: F2HandleCreationObservation[] = [
      {...x, handles: {...x.handles, input: {...x.handles.input, inheritable:false}}},
      {...x, handles: {...x.handles, output: {...x.handles.output, kind:'pipe' as 'nul-write'}}},
      {...x, handles: {...x.handles, error: {...x.handles.error, value:0x4000n}}},
      {...x, handles: {...x.handles, job: {...x.handles.job, inheritable:true}}},
      {...x, handles: {...x.handles, job: {...x.handles.job, value:0x1000n}}},
      {...x, handles: {...x.handles, input: {...x.handles.input, value:0n}}},
      {...x, handles: {...x.handles, input: {...x.handles.input, value:0xffffffffffffffffn}}},
      {...x, handles: {...x.handles, input: {...x.handles.input, inheritable:undefined as unknown as true}}},
    ];
    for (const c of cases) expect(reviewF2HandleCreationBoundary(c)).toBe(false);
  });

  it('refuses native profile/Job creation before a dedicated creator has independently passed proof', () => {
    const source = fs.readFileSync(path.join(process.cwd(),
      'packages/infrastructure/src/private-mvp-win32-native-binding.ts'), 'utf8');
    const guard = source.indexOf('if (!F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE) throw new F2B2NativeRejected()');
    const profile = source.indexOf('native.createProfile(F2B2_FIXED_PROOF.profile');
    expect(guard).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(guard);
    expect(source).toContain('reviewF2HandleCreationBoundary({');
    expect(source).toContain('handleIsolation: null');
    expect(F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE).toBe(false);
  });

  it('requires a negative native test matrix; static pass is not a native permit', () => {
    expect(F2_HANDLE_NATIVE_NEGATIVE_CASES).toEqual([
      'unlisted-inheritable-canary',
      'job-control-canary',
      'secret-handle-canary',
      'concurrent-createprocess-true',
      'handle-list-omitted',
      'handle-list-extra',
      'wrong-stdio-alias',
      'creator-crash-before-resume',
    ]);
    expect(F2_HANDLE_NATIVE_CREATOR_PROOF_AVAILABLE).toBe(false);
  });
});
