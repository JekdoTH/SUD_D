import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  PRIVATE_MVP_RESOURCE_POLICY_IDENTITY, type PrivateMvpMissionScope,
} from './private-mvp-mission-admission.js';
import type { PrivateMvpReviewedStage } from './private-mvp-appcontainer-job-runtime.js';
import { F2B2_FIXED_PROOF } from './private-mvp-win32-native-binding.js';

/** F2-B3 code-only synthetic stage reviewer. Native OS attestation port is
 * TCB-only (never caller IPC). NO concrete Win32 attestor exists yet.
 * This does NOT authorize a launch. Held handles must survive CreateProcessW.
 */
export interface PrivateMvpHeldFileEvidence {
  readonly path: string;
  readonly sha256: string;
  readonly volumeId: string;
  readonly fileId: string;
  readonly hardlinks: number;
  readonly reparse: boolean;
  readonly heldOpen: boolean;
  readonly readOnly: boolean;
  readonly ownerAclExact: boolean;
  readonly noOtherWorkspaceAccess: boolean;
}
export interface PrivateMvpStageNativeEvidence {
  readonly files: readonly PrivateMvpHeldFileEvidence[];
  readonly stageRootSafe: boolean;
  readonly outputScratchOwned: boolean;
  readonly profileAclExact: boolean;
  readonly noReparseAncestors: boolean;
  readonly dependenciesClosed: boolean;
  readonly release: () => Promise<boolean>;
}
export interface PrivateMvpSyntheticStageAttestor {
  attest(): Promise<PrivateMvpStageNativeEvidence>;
}
export class F2B3StageCleanupUnconfirmed extends Error {
  constructor() {
    super('F2-B3 stage handle cleanup unconfirmed');
    this.name = 'F2B3StageCleanupUnconfirmed';
  }
}
const FILES = Object.freeze([
  { path:path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture.mjs'), sha256:F2B2_FIXED_PROOF.entrySha256 },
  { path:path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture-child.mjs'), sha256:'f8d9974970ca9b4f9ff2cebbb5831505e14575634ce84906ce67b1ead79380bc' },
  { path:path.win32.join(F2B2_FIXED_PROOF.root,'stage','fixture-grandchild.mjs'), sha256:'269d70fb7334cbc1c8c75a93d04a0a55c274031a27cd132bdccc4f79209d80b4' },
  { path:path.win32.join(F2B2_FIXED_PROOF.root,'stage','input.json'), sha256:F2B2_FIXED_PROOF.inputSha256 },
]);

/** Bind the exact approved bytes, Workspace generation and finite policy. */
export function privateMvpSyntheticExecutionFingerprint(binding: {
  readonly workspaceId: string;
  readonly workspaceGeneration: string;
  readonly runnerId: string;
  readonly inputDigest: string;
  readonly policyIdentity: string;
}): string {
  return createHash('sha256').update(JSON.stringify({
    revision:'private-mvp-reviewed-v1',
    workspaceId:binding.workspaceId,workspaceGeneration:binding.workspaceGeneration,
    runnerId:binding.runnerId,inputDigest:binding.inputDigest,policyIdentity:binding.policyIdentity,
    binary:F2B2_FIXED_PROOF.executableSha256,profile:F2B2_FIXED_PROOF.profile,
    sources:FILES.map(f=>f.sha256),
  })).digest('hex');
}
export interface PrivateMvpSyntheticReview {
  readonly stage: PrivateMvpReviewedStage & { readonly profileRevision: 'private-mvp-reviewed-v1' };
  readonly launchAuthority: false;
  release(): Promise<boolean>;
}

/** Strictly validates evidence supplied by an independently trusted OS
 * handle attestor. For now the attestor is mocked ONLY: no executable stage
 * enrollment, actual Win32 ACL or file-object hold is registered.
 */
export async function createPrivateMvpReviewedSyntheticStage(input: {
  readonly mission: PrivateMvpMissionScope;
  /** Trusted controller clock, never worker-reported wall time. */
  readonly now: () => Date;
  readonly attemptId: string;
  readonly runtimeSha256: string;
  readonly executionFingerprint: string;
  readonly inputDigest: string;
  readonly policyIdentity: string;
  readonly attestor: PrivateMvpSyntheticStageAttestor;
}): Promise<PrivateMvpSyntheticReview | null> {
  const m = input?.mission;
  let now: Date;
  try { now = input.now(); }
  catch { return null; }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  if (!m || !input.attestor || typeof input.attestor.attest !== 'function'
    || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(input.attemptId)
    || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,127}$/.test(m.missionId)
    || !m.workspaceId || !m.workspaceGeneration || !m.runnerId
    || !Number.isSafeInteger(m.revision) || m.revision < 1
    || !/^[a-f0-9]{64}$/.test(m.goalDigest)
    || !Number.isFinite(Date.parse(m.expiresAt))
    || Date.parse(m.expiresAt) <= now.getTime()
    || Date.parse(m.expiresAt) - now.getTime() > 30 * 60_000
    || input.runtimeSha256 !== F2B2_FIXED_PROOF.executableSha256
    || m.inputDigest !== F2B2_FIXED_PROOF.inputSha256
    || input.inputDigest !== m.inputDigest
    || m.resourcePolicyIdentity !== PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    || input.policyIdentity !== PRIVATE_MVP_RESOURCE_POLICY_IDENTITY
    || input.executionFingerprint !== m.executionFingerprint
    || m.executionFingerprint !== privateMvpSyntheticExecutionFingerprint({
      workspaceId:m.workspaceId,workspaceGeneration:m.workspaceGeneration,runnerId:m.runnerId,
      inputDigest:m.inputDigest,policyIdentity:input.policyIdentity,
    })) return null;

  let evidence: PrivateMvpStageNativeEvidence | undefined;
  try {
    evidence = await input.attestor.attest();
    const list = evidence?.files;
    const exact = evidence.stageRootSafe === true && evidence.outputScratchOwned === true
      && evidence.profileAclExact === true && evidence.noReparseAncestors === true
      && evidence.dependenciesClosed === true
      && Array.isArray(list) && list.length === FILES.length
      && FILES.every((f,i) => {
        const v = list[i];
        return !!v && v.path === f.path
          && v.sha256 === f.sha256 && v.hardlinks === 1 && v.reparse === false
          && v.heldOpen === true && v.readOnly === true && v.ownerAclExact === true
          && v.noOtherWorkspaceAccess === true
          && typeof v.fileId === 'string' && v.fileId.length > 0
          && typeof v.volumeId === 'string' && v.volumeId.length > 0;
      })
      && new Set(list.map(f=>f.volumeId + ':' + f.fileId)).size === list.length
      && new Set(list.map(f=>f.volumeId)).size === 1;
    if (!exact) {
      if (typeof evidence?.release !== 'function' || await evidence.release() !== true)
        throw new F2B3StageCleanupUnconfirmed();
      return null;
    }
    const held = evidence;
    let released = false;
    return Object.freeze<PrivateMvpSyntheticReview>({
      stage:Object.freeze({
        mission:m,attemptId:input.attemptId,
        workspaceId:m.workspaceId,workspaceGeneration:m.workspaceGeneration,runnerId:m.runnerId,
        executionFingerprint:m.executionFingerprint,inputDigest:m.inputDigest,
        policyIdentity:PRIVATE_MVP_RESOURCE_POLICY_IDENTITY,profileRevision:'private-mvp-reviewed-v1',
        runtimePath:F2B2_FIXED_PROOF.executablePath,runtimeSha256:F2B2_FIXED_PROOF.executableSha256,
        stageRoot:path.win32.join(F2B2_FIXED_PROOF.root,'stage'),
        entryPath:FILES[0]!.path,inputPath:FILES[3]!.path,
        scratchRoot:path.win32.join(F2B2_FIXED_PROOF.root,'scratch'),
        outputRoot:path.win32.join(F2B2_FIXED_PROOF.root,'output'),
      }),
      launchAuthority:false,
      async release() {
        if (released) return false;
        if (await held.release() !== true) throw new F2B3StageCleanupUnconfirmed();
        released = true;
        return true;
      },
    });
  } catch (error) {
    if (error instanceof F2B3StageCleanupUnconfirmed) throw error;
    if (evidence && typeof evidence.release === 'function') {
      try { if (await evidence.release() !== true) throw new F2B3StageCleanupUnconfirmed(); }
      catch { throw new F2B3StageCleanupUnconfirmed(); }
    }
    return null;
  }
}
