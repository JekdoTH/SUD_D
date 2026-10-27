import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  F2B2_FIXED_PROOF, F2B3_INHERITED_HANDLES_OS_PROOF_AVAILABLE,
  PRIVATE_MVP_FIXED_WINDOWS_JOB,
  validateF2B2FixedNativePlan,
  F2B2NativeRejected,
  F2B2NativeCleanupUnconfirmed,
  type PrivateMvpFixedNativePlan,
} from '@sud-d/infrastructure';

const fixed = (): PrivateMvpFixedNativePlan => ({
  executablePath: F2B2_FIXED_PROOF.executablePath,
  executableSha256: F2B2_FIXED_PROOF.executableSha256,
  profileRevision: 'private-mvp-reviewed-v1',
  stageRoot: path.win32.join(F2B2_FIXED_PROOF.root, 'stage'),
  entryPath: path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture.mjs'),
  inputPath: path.win32.join(F2B2_FIXED_PROOF.root,'stage','input.json'),
  scratchRoot: path.win32.join(F2B2_FIXED_PROOF.root, 'scratch'),
  outputRoot: path.win32.join(F2B2_FIXED_PROOF.root, 'output'),
  limits: PRIVATE_MVP_FIXED_WINDOWS_JOB,
});

describe('F2-B2 actual Koffi source contract, static only (NEVER bind or call Win32)', () => {
  it('accepts only the exact frozen offline proof and immutable AppContainer/Job policy', () => {
    expect(validateF2B2FixedNativePlan(fixed())).toBe(true);
    expect(F2B2_FIXED_PROOF.executablePath).toBe('C:\\Program Files\\nodejs\\node.exe');
    expect(F2B2_FIXED_PROOF.executableSha256).toBe('63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088');
    expect(PRIVATE_MVP_FIXED_WINDOWS_JOB).toMatchObject({
      activeProcessLimit:8, jobCommittedMemoryBytes:536870912, jobUserTimeMs:600000,
      appContainer:true, appContainerCapabilities:0, breakawayAllowed:false,
      killOnJobClose:true, suspendedUntilVerified:true, networkProfile:'none', secretProfile:'none',
    });
  });

  it('rejects every caller substitution: executable, digest, stage, entry, input, output, scratch, profile and limits', () => {
    const plan = fixed();
    const candidates: PrivateMvpFixedNativePlan[] = [
      {...plan, executablePath:'C:\\Windows\\System32\\cmd.exe'},
      {...plan, executableSha256:'f'.repeat(64)},
      {...plan, stageRoot:'C:\\different\\stage'},
      {...plan, entryPath:'C:\\different\\fixture.mjs'},
      {...plan, inputPath:'C:\\different\\input.json'},
      {...plan, scratchRoot:'C:\\different\\scratch'},
      {...plan, outputRoot:'C:\\different\\output'},
      {...plan, profileRevision:'p0c-offline-v1' as 'private-mvp-reviewed-v1'},
      {...plan, limits:{...PRIVATE_MVP_FIXED_WINDOWS_JOB, activeProcessLimit:32} as unknown as typeof PRIVATE_MVP_FIXED_WINDOWS_JOB},
      {...plan, limits:{...PRIVATE_MVP_FIXED_WINDOWS_JOB, breakawayAllowed:true} as unknown as typeof PRIVATE_MVP_FIXED_WINDOWS_JOB},
      {...plan, limits:{...PRIVATE_MVP_FIXED_WINDOWS_JOB, appContainerCapabilities:1} as unknown as typeof PRIVATE_MVP_FIXED_WINDOWS_JOB},
      {...plan, limits:{...PRIVATE_MVP_FIXED_WINDOWS_JOB, jobUserTimeMs:1800000}},
    ];
    for (const candidate of candidates) expect(validateF2B2FixedNativePlan(candidate)).toBe(false);
  });

  it('blocks native resume when no independent child handle-table inspection exists', () => {
    // The attribute-list configuration is NOT an OS-owned-child inventory.
    expect(F2B3_INHERITED_HANDLES_OS_PROOF_AVAILABLE).toBe(false);
  });

  it('does not mistake a failed native claim for confirmed cleanup', () => {
    expect(new F2B2NativeRejected().name).toBe('F2B2NativeRejected');
    expect(new F2B2NativeCleanupUnconfirmed().name).toBe('F2B2NativeCleanupUnconfirmed');
  });
});
