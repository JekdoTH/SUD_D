import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {readApprovedPreH1Diagnostic} from './private-mvp-pre-h1-diagnostic-preflight.js';
import {privateMvpMissionBindingDigest} from './private-mvp-mission-admission.js';
import type {Db} from './database.js';

/** One fixed, non-network PRE-H1 Native Consent contract; NOT a Runner API. */
export const PRE_H1_NATIVE_CONSENT=Object.freeze({
  missionId:'pre-h1-controller-01',attemptId:'pre-h1-controller-01-attempt-01',
  ownerEpoch:'pre-h1-controller-01-epoch-01',runnerId:'fixed-synthetic',
  stage:'NO-STAGE',capability:'pre-h1.native-consent',effect:'execute',
  sessionId:'pre-h1-native-desktop-owner',maxActiveMs:30_000,maxRetries:0,
  maxH0:0,maxWorkerJobs:0,maxProviderCalls:0,network:false,
  rc5InventorySha:'c2dfe8dfaec5b986cb8a83416eeae1735af9e0ad3f20fef2731247f6ba387d3f',
  rc5ExternalSha:'d7c7ef58b081d748fcd72438d6d46e8c2c4ac72da6583eabffd7a992fcbff7b8',
  native2RuntimePinManifestSha:'e78bc844e86933b6941c21f16a563da3f1ae3bf6399e3ba8a8195ab8f033649d',
  rc5MainSha:'f849f4becd6ac1e6bb60510f85c8514eae243f75ba2bfff3e989da9c77ccdc0e',
  rc5ActivationSha:'8ebff276c9ae4482330b857a2efa1319f8fd95e59af3260561c9be55458a9872',
} as const);
const digest=(data:Buffer|string)=>createHash('sha256').update(data).digest('hex');
const HEX=/^[0-9a-f]{64}$/;
interface Pin {bytes:number;sha256:string}
interface Inventory {root:string;files:Record<string,Pin>}
interface ExternalPins {immutableCandidateRoot:string;additionalExternalBytePins:Record<string,Pin>}
/**
 * Both Owner issuance and diagnostic re-open remeasure frozen candidate,
 * actual dependency byte pins and the *new* diagnostic output. No secret,
 * runtime HMAC key, caller-controlled path, or mutable approval argument.
 * Local F0 trusted-app + trusted-file assumption, not tamper-proof against
 * an attacker who can replace both executable code and manifests.
 */
function repoRoot():string {
  let location=path.dirname(fileURLToPath(import.meta.url));
  for(let depth=0;depth<9;depth++){
    if(fs.existsSync(path.join(location,'packages/desktop/electron/main.ts'))
      && fs.existsSync(path.join(location,'.serena/reports')))return location;
    location=path.dirname(location);
  }
  throw Error('PRE_H1_NATIVE_PROJECT_ROOT_UNVERIFIED');
}
function readVerified(root:string,relative:string,pin:Pin):void {
  if(!relative||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..')
    ||!HEX.test(pin.sha256)||!Number.isSafeInteger(pin.bytes)||pin.bytes<0)
    throw Error('PRE_H1_NATIVE_ARTIFACT_PIN_INVALID');
  const abs=path.join(root,relative);
  const stat=fs.lstatSync(abs);
  if(!stat.isFile()||stat.size!==pin.bytes||digest(fs.readFileSync(abs))!==pin.sha256)
    throw Error('PRE_H1_NATIVE_ARTIFACT_BYTES_CHANGED');
}
function verifiedInventory(root:string,inventory:Inventory):void {
  if(!inventory.root.startsWith('packages/desktop/.serena/pre-h1-controller-01-20261009-')
    ||Object.keys(inventory.files).length<10)
    throw Error('PRE_H1_NATIVE_INVENTORY_UNTRUSTED');
  for(const [name,pin] of Object.entries(inventory.files))
    readVerified(root,path.join(inventory.root,name),pin);
}
interface Native2RuntimePin {relative:string;realpath:string;bytes:number;sha256:string}
/** Pure test seam: enforce running process *physical* executable identity.
 * The production caller supplies process.execPath directly, never a renderer,
 * IPC parameter, environment variable or serialized approval field.
 * The pin is independently SHA-locked before this method is called in runtime.
 */
export function verifyNative3ExecutableIdentity(actualExecutable:string,
  pin:Pick<Native2RuntimePin,'realpath'|'bytes'|'sha256'>):void {
  try{
    if(typeof actualExecutable!=='string'||!path.isAbsolute(actualExecutable)
      ||typeof pin.realpath!=='string'||!path.isAbsolute(pin.realpath)
      ||!Number.isSafeInteger(pin.bytes)||pin.bytes<1||!HEX.test(pin.sha256))
      throw Error('PATH_OR_PIN_INVALID');
    const stat=fs.lstatSync(actualExecutable);
    const physical=fs.realpathSync.native(actualExecutable);
    const canonical=(p:string)=>process.platform==='win32'
      ?path.normalize(p).toLocaleLowerCase('en-US'):path.normalize(p);
    if(!stat.isFile()||stat.isSymbolicLink()
      ||canonical(physical)!==canonical(pin.realpath)
      ||stat.size!==pin.bytes
      ||digest(fs.readFileSync(actualExecutable))!==pin.sha256)
      throw Error('PROCESS_EXECUTABLE_MISMATCH');
  }catch{
    throw Error('PRE_H1_NATIVE3_PROCESS_EXECUTABLE_IDENTITY_INVALID');
  }
}

interface Native2RuntimePinSet {
  version:number;repo:string;selectedElectronRelative:string;
  binaryNames:string[];pins:Record<string,Native2RuntimePin>;
}
/** Independent disposable-copy verification seam; production supplies only a
 * compile-time SHA-pinned manifest, never a caller-provided pin set. */
export function verifyNative2RuntimePinSet(root:string,manifest:Native2RuntimePinSet):void {
  const required=['electronExe','koffiAddon','sqliteAddon',
    'electronResolution','koffiResolution','sqliteResolution'];
  if(manifest.version!==1||path.resolve(manifest.repo)!==path.resolve(root)
    ||manifest.selectedElectronRelative!==manifest.pins.electronExe?.relative
    ||JSON.stringify(Object.keys(manifest.pins).sort())!==JSON.stringify(required.slice().sort())
    ||JSON.stringify(manifest.binaryNames)!==JSON.stringify(required.slice(0,3)))
    throw Error('NATIVE2_RUNTIME_SET_UNTRUSTED');
  for(const name of required){
    const pin=manifest.pins[name]!;
    if(typeof pin.relative!=='string'||!pin.relative||path.isAbsolute(pin.relative)
      ||pin.relative.split(/[\\/]/).includes('..')
      ||!HEX.test(pin.sha256)||!Number.isSafeInteger(pin.bytes)||pin.bytes<1
      ||typeof pin.realpath!=='string'||!path.isAbsolute(pin.realpath))
      throw Error('NATIVE2_RUNTIME_PIN_INVALID:'+name);
    const physical=path.resolve(root,pin.relative);
    if(!physical.startsWith(path.resolve(root)+path.sep))
      throw Error('NATIVE2_RUNTIME_PATH_ESCAPE:'+name);
    const st=fs.lstatSync(physical);
    if(!st.isFile()||st.isSymbolicLink()||st.size!==pin.bytes
      ||path.normalize(fs.realpathSync.native(physical))!==path.normalize(pin.realpath)
      ||digest(fs.readFileSync(physical))!==pin.sha256)
      throw Error('NATIVE2_RUNTIME_BYTES_OR_RESOLUTION_DRIFT:'+name);
  }
}
function verifyInstalledNative2RuntimeBytes(root:string):void {
  const file=path.join(root,'.serena/reports/pre-h1-native2-runtime-byte-pins-20261009.json');
  const data=fs.readFileSync(file);
  if(digest(data)!==PRE_H1_NATIVE_CONSENT.native2RuntimePinManifestSha)
    throw Error('NATIVE2_RUNTIME_PIN_MANIFEST_CHANGED');
  const manifest=JSON.parse(data.toString('utf8')) as Native2RuntimePinSet;
  verifyNative2RuntimePinSet(root,manifest);
  // Running runtime identity is mandatory BOTH at grant issuance and consumption.
  // Never accept a caller-selected executable or an environment override.
  if(typeof process.versions.electron!=='string'||!process.versions.electron)
    throw Error('PRE_H1_NATIVE3_ELECTRON_RUNTIME_REQUIRED');
  verifyNative3ExecutableIdentity(process.execPath,manifest.pins.electronExe!);
  const resolve=createRequire(path.join(root,'packages/desktop/package.json'));
  for(const [module,key] of [['electron','electronResolution'],
    ['koffi','koffiResolution'],['better-sqlite3','sqliteResolution']] as const){
    const actual=fs.realpathSync.native(resolve.resolve(module));
    if(path.normalize(actual)!==path.normalize(manifest.pins[key]!.realpath))
      throw Error('NATIVE2_RUNTIME_MODULE_REDIRECT:'+module);
  }
}

export interface PreH1NativeArtifactIdentity {
  readonly rc5InventorySha:string;
  readonly rc5ExternalSha:string;
  readonly native2RuntimePinManifestSha:string;
  readonly nativeCandidateInventorySha:string;
  readonly nativeMainSha:string;
  readonly rc5MainSha:string;
  readonly rc5ActivationSha:string;
}
export function readVerifiedPreH1NativeArtifacts():PreH1NativeArtifactIdentity {
  const root=repoRoot();
  const rc5File=path.join(root,'.serena/reports/pre-h1-rc5-all-emitted-byte-pins-20261009.json');
  const externalFile=path.join(root,'.serena/reports/pre-h1-rc5-external-import-pins-20261009.json');
  const nativeFile=path.join(root,'.serena/reports/pre-h1-native3-all-emitted-byte-pins-20261009.json');
  verifyInstalledNative2RuntimeBytes(root);
  if(digest(fs.readFileSync(rc5File))!==PRE_H1_NATIVE_CONSENT.rc5InventorySha
    ||digest(fs.readFileSync(externalFile))!==PRE_H1_NATIVE_CONSENT.rc5ExternalSha)
    throw Error('PRE_H1_NATIVE_FROZEN_REFERENCE_CHANGED');
  const rc5=JSON.parse(fs.readFileSync(rc5File,'utf8')) as Inventory;
  const ext=JSON.parse(fs.readFileSync(externalFile,'utf8')) as ExternalPins;
  const candidate=JSON.parse(fs.readFileSync(nativeFile,'utf8')) as Inventory;
  verifiedInventory(root,rc5);
  if(ext.immutableCandidateRoot!==rc5.root
    ||Object.keys(ext.additionalExternalBytePins).length<1)
    throw Error('PRE_H1_NATIVE_EXTERNAL_SET_MISMATCH');
  for(const [name,pin] of Object.entries(ext.additionalExternalBytePins))
    readVerified(root,name,pin);
  const candidateRoot='packages/desktop/.serena/pre-h1-controller-01-20261009-native3';
  if(candidate.root!==candidateRoot)throw Error('PRE_H1_NATIVE_CANDIDATE_ROOT_MISMATCH');
  verifiedInventory(root,candidate);
  const rc5Main=rc5.files['desktop/dist-electron/main.js'];
  const rc5Activation=rc5.files['infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'];
  const nativeMain=candidate.files['desktop/dist-electron/main.js'];
  if(!rc5Main||rc5Main.sha256!==PRE_H1_NATIVE_CONSENT.rc5MainSha
    ||!rc5Activation||rc5Activation.sha256!==PRE_H1_NATIVE_CONSENT.rc5ActivationSha
    ||!nativeMain)throw Error('PRE_H1_NATIVE_MAIN_PIN_MISMATCH');
  return Object.freeze({
    rc5InventorySha:PRE_H1_NATIVE_CONSENT.rc5InventorySha,
    rc5ExternalSha:PRE_H1_NATIVE_CONSENT.rc5ExternalSha,
    native2RuntimePinManifestSha:PRE_H1_NATIVE_CONSENT.native2RuntimePinManifestSha,
    rc5MainSha:PRE_H1_NATIVE_CONSENT.rc5MainSha,
    rc5ActivationSha:PRE_H1_NATIVE_CONSENT.rc5ActivationSha,
    nativeCandidateInventorySha:digest(fs.readFileSync(nativeFile)),
    nativeMainSha:nativeMain.sha256,
  });
}
export function nativeConsentSnapshot(db:Db,now:Date,artifacts:PreH1NativeArtifactIdentity){
  const prepared=readApprovedPreH1Diagnostic(db,now);
  const scope=prepared.scope;
  const original=db.prepare('SELECT approval_id FROM runner_missions WHERE mission_id=?')
    .get(PRE_H1_NATIVE_CONSENT.missionId) as {approval_id:string}|undefined;
  if(!original?.approval_id||scope.runnerId!==PRE_H1_NATIVE_CONSENT.runnerId
    ||prepared.ownerEpoch!==PRE_H1_NATIVE_CONSENT.ownerEpoch)
    throw Error('PRE_H1_NATIVE_FIXED_SCOPE_INVALID');
  return Object.freeze({
    missionId:PRE_H1_NATIVE_CONSENT.missionId,attemptId:PRE_H1_NATIVE_CONSENT.attemptId,
    ownerEpoch:PRE_H1_NATIVE_CONSENT.ownerEpoch,runnerId:PRE_H1_NATIVE_CONSENT.runnerId,
    stage:PRE_H1_NATIVE_CONSENT.stage,workspaceId:scope.workspaceId,
    workspaceGeneration:scope.workspaceGeneration,
    preparationApprovalId:original.approval_id,
    missionBindingDigest:privateMvpMissionBindingDigest(scope),
    missionExpiresAt:scope.expiresAt,artifacts,
    maxActiveMs:30_000,maxRetries:0,maxH0:0,maxWorkerJobs:0,
    maxProviderCalls:0,network:false,
  });
}
export function nativeConsentBindingDigest(value:ReturnType<typeof nativeConsentSnapshot>):string{
  return digest(JSON.stringify(value));
}
