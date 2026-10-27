import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {builtinModules} from 'node:module';

/** PRE-H1 frozen compiled JS + fixed Windows Koffi loader closure.
 * This lock is the externally-reviewed root, so it MUST itself have an
 * independently recorded SHA-256; self-pinning is not mathematically possible.
 * The fixed Win32 owner is INCLUDED and checked here.
 * Zero native execution occurs during verification.
 */
export const F2H1_CONTROLLER_PINNED_FILES=Object.freeze({
  "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/index.cjs": "a200e15ec168d00cb3155794808a98243051c61dd7f6989c23c57ee220c918b9",
  "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/src/koffi/index.cjs": "1844678dd71b4291829ae5dca42a3a701dbab9601264387af06d539ec1906d5d",
  "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/src/koffi/src/static.cjs": "25dff303c876cfdb531e2d9590ecbbb4928c8e60453c484faad66b2a3abd1556",
  "node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/index.js": "f9991ec70a0f775487ffadc2461d69edd1555e3d9bf80de0bbdd2eec7d245c49",
  "node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node": "939156f310bd7a7d9d1db1b5249a5d135739b049c24c79fd3c201701333ddbf3",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/index.js": "ee946dcf348c72a6e89bd2d98331f3fb02c083ec2bf2c9bc5ec2afb905ea4588",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/max.js": "3a03688b422840096f613283230f68d0d8c541873c70660e5b19f4499e2e9fda",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/md5.js": "3916ab7e907d6233d852fa407c715d381b97592fc5fb5cf76c185e2472ed75f3",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/native.js": "b11019185326511151fb8353acf2897a0a8aa243d8d1e3f545c4316e65b7abfb",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/nil.js": "18713130e9af477ad8b00a0ae6e497237c5a012b5bc263196198bc5164402a57",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/parse.js": "18340ab877fd07202aa85ac6db9a57fca995a225ea72ae6e7b0008cf9c802c8c",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/regex.js": "2b87294e34d9a708c5541a22c8f39dc17043a2405ea96365439f7981692d4c18",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/rng.js": "4312ae39095830a9612e8bbf3f17398b5950712b588bbb8c501f8f48aff9ad60",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/sha1.js": "7fd69157f631ad96e0b11b880f7cf6b9d85ca37775c7bcc365d2b7fe4a1ae0ed",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/stringify.js": "e232ebb6d0304292bfa30053e6df7dea2d1316fcc1586eb8af6465824d7e89d4",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v1.js": "0cdc18dd84c2bf7d279933df305ae6aec6f5863b098a90c4e38a603fab4c8d04",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v1ToV6.js": "616a87520b5758d372721d45fc76f2ac02988e1d8c51b1d5bcab8228b6d4f484",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v35.js": "2df8bbf301ff0e09fcd7b90cd42b34a77ddce6fb8af5e91f2e178447e652fde4",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v3.js": "1503d71c9a62606b6c207af3448b11c1a6118ef8eea756636244874bb2b36611",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v4.js": "43dda584a2f10df62321fec45024373a1db887141c4cd16a47890a31b9171bea",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v5.js": "02c2d3f1fea64680052df77a0deed6657d059f5779673a02acd254cb70653f00",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v6.js": "f61f69c384a287a9702c3a9fb0a0c15e3aecc3d4938dc387ae0f85dbbb759a1b",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v6ToV1.js": "b9b2a0900793d2456abd229990112e0423a53fb2c3cbd1ee4dd39e4ceffb6710",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/v7.js": "5dc52eab9fe47800d9899dfe40cbfd2c9ab5cb9827113623c5f965b2b3490da6",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/validate.js": "9a920509145d8a3e94e88247790e9db516b949cefa3032dc48ee9254ed975e8d",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/dist/version.js": "8aafe5a328e940c625d6355c1fb0184efd64912e2b8ee65c0e25fe1f5c94d730",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/wrapper.mjs": "67165a64fa2939c1edf1b5696487c33c7a47a9a0197cf10729424298150cbb59",
  "packages/domain/dist/approval.js": "60a0b1f379a73eeb62b29d87e7babb645be34b728c6855565abcf0434522dc72",
  "packages/domain/dist/classifier.js": "c08d41ea180dd30f625f5f2d79c905f7f2a7c80568d32f7f9e8c2b3cf621abd0",
  "packages/domain/dist/coding-engine.js": "d4dc7d477037ddb457bb08aeb0afd6d1a5f425edfbf0d4cc58aa729c594d7516",
  "packages/domain/dist/coding-semantic-read.js": "c33287c8b7efb7b42e8980224faae3f0b56bef8e4b34b60346ad89346940f708",
  "packages/domain/dist/coding-semantic-write.js": "4ac6ef69e93090330047ff48e50e2c7fed4f1e8e6c674a9752c8d44987ed2925",
  "packages/domain/dist/connection.js": "760a7b3e917a03fe47a7c0aaf288c1d2e462c248d68926fe98c54d66d192fd84",
  "packages/domain/dist/git.js": "96c944e6b93254e33745a2acce40d8371dfda6be6d920d38d1cc7f2bada302ea",
  "packages/domain/dist/index.js": "d8967298941c131c87aec4ef3c1431c6282f4e7117d2da9eefbf53034a490ab3",
  "packages/domain/dist/policy.js": "f0154a1baf754a5724ae725c6e6ba1beb6a23f7308dee5e1e1b799703b68be3c",
  "packages/domain/dist/project-runner.js": "271c23fb06517430b5f8200e81cc73497f700bce0667a7170c74cfd70a2e0bd0",
  "packages/domain/dist/restricted-verify.js": "0a989230503a9fb7270d4e96aa5b7d6c7c6d06b5ae912a5aecc4f61cfed9d9c8",
  "packages/domain/dist/result.js": "bee96e2c1b6d6a919f752f2fd668b7d770a0981e713b0531eca6f95467ff7538",
  "packages/domain/dist/team.js": "dcdf803ecce2207b8f59d6888b038adccbe1c95eab605c0fffc846cd0be02259",
  "packages/domain/dist/tool-kernel.js": "df66133b3e3f56dfbefa1ab4484d9c42d11390eefb134b6d08ef1015b0a20164",
  "packages/domain/dist/types.js": "685de723a8fc81cd94d5f15860289f3c7e2d58eaa9a24b23954afe2ab52d93c3",
  "packages/domain/dist/work-memory.js": "11336260a0228c50414521fec797f4ca2a300a28fbc786ac2ec0a2cca4f04163",
  "packages/infrastructure/dist/approval-repository.js": "bda3316055c83f2720fceaa0609467892e455a95f9895028099123e60791d52a",
  "packages/infrastructure/dist/audit-repository.js": "e778b0ab68ab38992fec54176835898f8e20446cbfda66324bca5687f419440c",
  "packages/infrastructure/dist/private-mvp-appcontainer-job-runtime.js": "cfc5c70799522ec4185cbc47e635995c9324e4f54038e1a94067f1a9d2d0091a",
  "packages/infrastructure/dist/private-mvp-desktop-guardian-worker.js": "305db804e3fe9687b01ad73d4a964eb298bcc15e13fa27fc9bc74f56cc52fc90",
  "packages/infrastructure/dist/private-mvp-desktop-owned-session.js": "b75f11d197779c64040dee93c17d5976bc9a075093db0f5c102f0c175683d97a",
  "packages/infrastructure/dist/private-mvp-desktop-pipe-io.js": "62ab339acffa82c67870df1b2aa4959c859cc6a04f388bb8a7b9d7e98f597a8d",
  "packages/infrastructure/dist/private-mvp-desktop-pipe-worker.js": "35254f82c53b102690aaea1772b1473f9ca122b3ee316ecac57504f7a9922b53",
  "packages/infrastructure/dist/private-mvp-desktop-runner-owner.js": "b85eb57fd5dca0bfe2af1776016f69e63f36f5d57266ae85ef77892ebaa22dc2",
  "packages/infrastructure/dist/private-mvp-h0-one-shot-gateway.js": "645e4e2e4f9f97dd998732230a8ddb7c1eeb6e5fa652592c2ecff48dc70e41b2",
  "packages/infrastructure/dist/private-mvp-h1-control-protocol.js": "20f0ec99dfb09e12ecfb8deba1d2661daf3978b122afd4ad3c37cee757531614",
  "packages/infrastructure/dist/private-mvp-h1-native-cleanup-proof.js": "dfb1d40779fc6585b7f282c8fd7355f23b134b9f02e19ac6b1f50930b75e5464",
  "packages/infrastructure/dist/private-mvp-handle-isolation.js": "af9d6f7d8a7031525872b79bb37f2cf733e1d2c3bb70f8b3de6ff496de277389",
  "packages/infrastructure/dist/private-mvp-koffi-bridge-preparation.js": "611895f509f22cfa5d6aa606f6c61d8446dc3ee8b0ab0175c207401ee0e38cbc",
  "packages/infrastructure/dist/private-mvp-mission-admission.js": "9649f31d86bb91e66391ac0665b06373d8402c43d82184d0229eb60222eecf4c",
  "packages/infrastructure/dist/private-mvp-runner-control-entry.js": "0a66738fa3fa2790b8e99013f856bcb9f81253dc8a811e491acfd8ea7c107f05",
  "packages/infrastructure/dist/private-mvp-runner-control-watchdog.js": "eff323d0990da81fc8f65985479c5144645fc68a121833f443c81eae094691d4",
  "packages/infrastructure/dist/private-mvp-win32-native-binding.js": "4724d256b294f8dd74bb838d8036055dead50495f11e4d44e71e82c587611097"
} as const);
const ROOTS=[
  "packages/infrastructure/dist/private-mvp-runner-control-entry.js",
  "packages/infrastructure/dist/private-mvp-desktop-runner-owner.js",
  "packages/infrastructure/dist/private-mvp-runner-control-watchdog.js",
  "packages/infrastructure/dist/private-mvp-desktop-pipe-worker.js",
  "packages/infrastructure/dist/private-mvp-desktop-guardian-worker.js",
  "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/index.cjs",
  "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/src/koffi/index.cjs",
  "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/wrapper.mjs",
  "packages/domain/dist/index.js",
  "node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/index.js"
] as const;
const BARE_ROOTS=Object.freeze({
  "koffi": "node_modules/.pnpm/koffi@3.1.6/node_modules/koffi/index.cjs",
  "@sud-d/domain": "packages/domain/dist/index.js",
  "uuid": "node_modules/.pnpm/uuid@10.0.0/node_modules/uuid/wrapper.mjs"
} as const);
const BUILTINS=new Set(builtinModules.map(s=>s.replace(/^node:/,'')));
const EXEMPT_ROOT='packages/infrastructure/dist/private-mvp-h1-compiled-lock.js';
// These literal optional require branches are frozen by the Windows Koffi
// loader bytes; only win32-x64 is enrolled for actual native binding.
const KOFFI_OPTIONAL=/^@koromix\/koffi-(?:linux|freebsd|openbsd|win32|darwin)-[a-z0-9]+$/;
type FrozenPins=Readonly<Record<string,string>>;
function sha(bytes:Buffer):string {
  return createHash('sha256').update(bytes).digest('hex');
}
function importSpecs(source:string):string[] {
  const result:string[]=[];
  const sanitized=source.replace(/\/\*[\s\S]*?\*\//g,'');
  // A multiline named import/export is one statement; static export-from
  // and side-effect import are both included.
  for(const m of sanitized.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\bfrom\s*)?['"]([^'"]+)['"]/g))
    result.push(m[1]);
  for(const m of sanitized.matchAll(/\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g))
    result.push(m[1]);
  for(const m of sanitized.matchAll(/\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]/g))
    result.push(m[1]);
  return result;
}
export function verifyF2H1PinnedControllerClosure(root:string):void {
  const pins:FrozenPins=F2H1_CONTROLLER_PINNED_FILES;
  const seen=new Set<string>();
  const visiting=new Set<string>();
  const fail=(reason:string):never=>{throw Error('F2_H1_CONTROLLER_IMPORT_LOCK_'+reason);};
  const check=(relative:string):void=>{
    if(relative===EXEMPT_ROOT)return; // trusted lock itself, externally hashed
    if(!Object.hasOwn(pins,relative))fail('UNEXPECTED_IMPORT:'+relative);
    if(seen.has(relative))return;
    if(visiting.has(relative))return;
    visiting.add(relative);
    const file=path.resolve(root,...relative.split('/'));
    if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())fail('MISSING:'+relative);
    const bytes=fs.readFileSync(file);
    if(sha(bytes)!==pins[relative])fail('CHANGED:'+relative);
    if(relative.endsWith('.node')){
      visiting.delete(relative);seen.add(relative);return;
    }
    const source=bytes.toString('utf8');
    for(const spec of importSpecs(source)){
      if(spec.startsWith('.')){
        const dep=path.relative(root,path.resolve(path.dirname(file),spec)).replace(/\\/g,'/');
        if(dep.startsWith('..')||path.isAbsolute(dep))fail('OUTSIDE:'+relative);
        check(dep);
      } else if(spec.startsWith('node:')||BUILTINS.has(spec)){
        continue;
      } else if(Object.hasOwn(BARE_ROOTS,spec)){
        check(BARE_ROOTS[spec as keyof typeof BARE_ROOTS]);
      } else if(KOFFI_OPTIONAL.test(spec)&&relative.includes('/koffi/src/koffi/')) {
        // Windows selection is enrolled separately; other optional platform
        // requires are unreachable branches and cannot be searched by PID.
        continue;
      } else {
        fail('BARE_IMPORT:'+spec);
      }
    }
    visiting.delete(relative);seen.add(relative);
  };
  for(const file of ROOTS)check(file);
  // The Windows-native optional loader is an exact fixed dependency even if
  // Koffi chooses it dynamically at runtime.
  check("node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node");
  // Every pinned file must be reachable through an approved fixed root/edge.
  for(const file of Object.keys(pins))
    if(!seen.has(file))fail('UNREACHABLE_PIN:'+file);
}
