import type {F2H0FixedRequest} from './private-mvp-h0-one-shot-gateway.js';
import type {F2H0RawTransferReceipt} from './private-mvp-h0-win32-gateway-adapter.js';
import {F2H0_FIXED_IDENTITY} from './private-mvp-h0-one-shot-gateway.js';

/** Bit-exact Windows x64 / #pragma pack(1) C++ FixedRequest+TrustedBootstrap.
 * These are INTERNAL private pipe frames, never caller-facing DTOs or proof.
 * H1 tests do not invoke Win32 or a launcher. */
export const F2H1_WIRE_LAYOUT = Object.freeze({
  requestBytes:814, bootstrapBytes:216, receiptBytes:24, magic:0x30483246,version:1,
});
export interface F2H1OwnedBootstrap {
  readonly gatewayProcess:bigint;
  readonly temporaryJob:bigint;
  readonly heldEntry:bigint;
  readonly stageVolume:bigint;
  readonly stageFileId:Uint8Array; // 16 FILE_ID_128 bytes queried by Gateway
}
const valid = (h:unknown): h is bigint =>
  typeof h==='bigint' && h>0n && h!==0xffffffffffffffffn && h<=0xffffffffffffffffn;
const id = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/;
const exactKeys=[
  'attemptId','missionId','ownerEpoch','recipeFingerprint',
  'revision','stageFingerprint','workspaceGeneration','workspaceId',
];
function writeName(frame:Buffer,at:number,name:string):void {
  if (typeof name!=='string' || !id.test(name)) throw Error('F2H1_WIRE_IDENTIFIER');
  frame.write(name,at,128,'utf16le');
}
export function encodeF2H1PrivateFrames(
  request:Readonly<F2H0FixedRequest>,
  bootstrap:Readonly<F2H1OwnedBootstrap>,
  nonce:Uint8Array,
):Buffer {
  if (!request || Object.keys(request).sort().join('|')!==exactKeys.join('|')
     || request.stageFingerprint!==F2H0_FIXED_IDENTITY.stageFingerprint
     || request.recipeFingerprint!==F2H0_FIXED_IDENTITY.recipeFingerprint
     || !Number.isSafeInteger(request.revision) || request.revision<1
     || !bootstrap || !valid(bootstrap.gatewayProcess)
     || !valid(bootstrap.temporaryJob) || !valid(bootstrap.heldEntry)
     || !valid(bootstrap.stageVolume)
     || new Set([bootstrap.gatewayProcess,bootstrap.temporaryJob,bootstrap.heldEntry]).size!==3
     || !bootstrap.stageFileId || bootstrap.stageFileId.length!==16
     || !nonce || nonce.length!==32 || nonce.every(v=>v===0))
    throw Error('F2H1_WIRE_REJECTED');
  const out=Buffer.alloc(F2H1_WIRE_LAYOUT.requestBytes+F2H1_WIRE_LAYOUT.bootstrapBytes);
  out.writeUInt32LE(F2H1_WIRE_LAYOUT.magic,0);out.writeUInt32LE(1,4);
  writeName(out,8,request.missionId);
  out.writeUInt32LE(request.revision,136);
  writeName(out,140,request.attemptId);
  writeName(out,268,request.workspaceId);
  writeName(out,396,request.workspaceGeneration);
  writeName(out,524,request.ownerEpoch);
  out.write(request.stageFingerprint,652,64,'ascii');out.write(request.recipeFingerprint,717,64,'ascii');
  Buffer.from(nonce).copy(out,782);
  const b=F2H1_WIRE_LAYOUT.requestBytes;
  out.writeUInt32LE(F2H1_WIRE_LAYOUT.magic,b);out.writeUInt32LE(1,b+4);
  writeName(out,b+8,request.ownerEpoch);
  Buffer.from(nonce).copy(out,b+136);
  out.writeBigUInt64LE(bootstrap.gatewayProcess,b+168);
  out.writeBigUInt64LE(bootstrap.temporaryJob,b+176);
  out.writeBigUInt64LE(bootstrap.heldEntry,b+184);
  out.writeBigUInt64LE(bootstrap.stageVolume,b+192);
  Buffer.from(bootstrap.stageFileId).copy(out,b+200);
  return out;
}
export function decodeF2H1TransferReceipt(raw:Buffer):F2H0RawTransferReceipt {
  if (!Buffer.isBuffer(raw) || raw.length!==F2H1_WIRE_LAYOUT.receiptBytes
    || raw.readUInt32LE(0)!==F2H1_WIRE_LAYOUT.magic || raw.readUInt32LE(4)!==1)
    throw Error('F2H1_TRANSFER_RECEIPT_INVALID');
  const process=raw.readBigUInt64LE(8),thread=raw.readBigUInt64LE(16);
  if (!valid(process)||!valid(thread)||process===thread) throw Error('F2H1_HANDLE_VALUES_INVALID');
  return Object.freeze({process,thread});
}

/** Topology B H0 private ABI (V2). V1 remains historical and is unusable
 * against the new C++ control owner. Caller cannot choose an executable,
 * handle role, argv, cwd or environment. No native authorization follows.
 */
export const F2H1_RUNNER_WIRE_LAYOUT=Object.freeze({
  requestBytes:814,bootstrapBytes:288,receiptBytes:24,magic:0x30483246,version:2,
});
export interface F2H1RunnerOwnedBootstrap {
  readonly runnerProcess:bigint;
  readonly temporaryWorkerJob:bigint;
  readonly heldEntry:bigint;
  readonly stageVolume:bigint;
  readonly stageFileId:Uint8Array;
  /** Exact OS-returned AppContainer SID bytes, independently sealed by Desktop.
   * The SID is NOT supplied by Mission, Gateway/renderer or worker.
   */
  readonly profileSid:Uint8Array;
}
export function encodeF2H1RunnerPrivateFrames(
  request:Readonly<F2H0FixedRequest>,bootstrap:Readonly<F2H1RunnerOwnedBootstrap>,nonce:Uint8Array,
):Buffer {
  if(!request||Object.keys(request).sort().join('|')!==exactKeys.join('|')
    ||request.stageFingerprint!=='6bea035e9ad7f90b9039d23ef3d6a6665b6c0100647929185443025727b32180'
    ||request.recipeFingerprint!=='e5c41818190a1fad386111d796c4b1a65b36de58ce60de5455094ce41810afd8'
    ||!Number.isSafeInteger(request.revision)||request.revision<1
    ||!bootstrap||!valid(bootstrap.runnerProcess)||!valid(bootstrap.temporaryWorkerJob)
    ||!valid(bootstrap.heldEntry)||!valid(bootstrap.stageVolume)
    ||new Set([bootstrap.runnerProcess,bootstrap.temporaryWorkerJob,bootstrap.heldEntry]).size!==3
    ||!bootstrap.stageFileId||bootstrap.stageFileId.length!==16
    ||!bootstrap.profileSid||bootstrap.profileSid.length<8||bootstrap.profileSid.length>68
    ||!nonce||nonce.length!==32||nonce.every(b=>b===0))
    throw Error('F2_H1_RUNNER_V2_UNTRUSTED_BOOTSTRAP');
  const out=Buffer.alloc(814+288);
  out.writeUInt32LE(F2H1_RUNNER_WIRE_LAYOUT.magic,0);
  out.writeUInt32LE(2,4);
  writeName(out,8,request.missionId);
  out.writeUInt32LE(request.revision,136);
  writeName(out,140,request.attemptId);
  writeName(out,268,request.workspaceId);
  writeName(out,396,request.workspaceGeneration);
  writeName(out,524,request.ownerEpoch);
  out.write(request.stageFingerprint,652,64,'ascii');
  out.write(request.recipeFingerprint,717,64,'ascii');
  Buffer.from(nonce).copy(out,782);
  const b=814;
  out.writeUInt32LE(F2H1_RUNNER_WIRE_LAYOUT.magic,b);
  out.writeUInt32LE(2,b+4);
  writeName(out,b+8,request.ownerEpoch);
  Buffer.from(nonce).copy(out,b+136);
  out.writeBigUInt64LE(bootstrap.runnerProcess,b+168);
  out.writeBigUInt64LE(bootstrap.temporaryWorkerJob,b+176);
  out.writeBigUInt64LE(bootstrap.heldEntry,b+184);
  out.writeBigUInt64LE(bootstrap.stageVolume,b+192);
  Buffer.from(bootstrap.stageFileId).copy(out,b+200);
  out.writeUInt32LE(bootstrap.profileSid.length,b+216);
  Buffer.from(bootstrap.profileSid).copy(out,b+220);
  return out;
}
export function decodeF2H1RunnerTransferReceipt(raw:Buffer):F2H0RawTransferReceipt {
  if(!Buffer.isBuffer(raw)||raw.length!==24||raw.readUInt32LE(0)!==0x30483246
    ||raw.readUInt32LE(4)!==2)throw Error('F2_H1_RUNNER_V2_RECEIPT_UNTRUSTED');
  const process=raw.readBigUInt64LE(8),thread=raw.readBigUInt64LE(16);
  if(!valid(process)||!valid(thread)||process===thread)
    throw Error('F2_H1_RUNNER_V2_RECEIPT_HANDLES_INVALID');
  return Object.freeze({process,thread});
}
