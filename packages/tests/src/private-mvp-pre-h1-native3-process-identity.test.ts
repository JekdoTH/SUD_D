import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {verifyNative3ExecutableIdentity} from '../../infrastructure/src/private-mvp-pre-h1-native-consent-contract.js';

describe('PRE-H1 actual Electron process identity verification (pure disposable seam)',()=>{
  it('actual compiled Native3 consumer requires Electron executable identity, rejects Node process',async()=>{
    const native3=await import('../../desktop/.serena/pre-h1-controller-01-20261009-native3/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
    expect(typeof process.versions.electron).toBe('undefined');
    expect(()=>native3.readVerifiedPreH1NativeArtifacts()).toThrow(/PRE_H1_NATIVE3_ELECTRON_RUNTIME_REQUIRED/);
  },45000);
  it('compiled issuance and diagnostic apps have the same no-override process identity fence',()=>{
    const root='packages/desktop/.serena/pre-h1-controller-01-20261009-native3/';
    for(const relative of ['desktop/dist-electron/main.js','consent-desktop/dist-electron/main.js',
       'infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js']){
      const source=fs.readFileSync(root+relative,'utf8');
      expect(source).toContain('process.execPath');
      expect(source).toContain('PRE_H1_NATIVE3_ELECTRON_RUNTIME_REQUIRED');
      expect(source).toContain('verifyNative3ExecutableIdentity');
      expect(source).not.toContain('electron-updater');
    }
  });
  it('accepts only the same physical executable and independently pinned exact bytes',()=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sudd-native3-exe-'));
    try{
      const expected=path.join(temp,'electron.exe');
      const substitute=path.join(temp,'electron-substitute.exe');
      const original=Buffer.from('SUD-D-DISPOSABLE-ELECTRON-ID-ONLY');
      fs.writeFileSync(expected,original);
      fs.copyFileSync(expected,substitute);
      const pin={realpath:fs.realpathSync.native(expected),bytes:original.length,
        sha256:requireHash(original)};
      expect(()=>verifyNative3ExecutableIdentity(expected,pin)).not.toThrow();
      expect(()=>verifyNative3ExecutableIdentity(substitute,pin)).toThrow(/PROCESS_EXECUTABLE/);
      const changed=Buffer.from(original);changed[1]^=1;
      fs.writeFileSync(expected,changed);
      expect(()=>verifyNative3ExecutableIdentity(expected,pin)).toThrow(/PROCESS_EXECUTABLE/);
      fs.writeFileSync(expected,original);
      expect(()=>verifyNative3ExecutableIdentity(path.join(temp,'missing.exe'),pin))
        .toThrow(/PROCESS_EXECUTABLE/);
      expect(()=>verifyNative3ExecutableIdentity('electron.exe',pin))
        .toThrow(/PROCESS_EXECUTABLE/);
    }finally{fs.rmSync(temp,{recursive:true,force:true});}
  });
});
function requireHash(b:Buffer){
  return createHash('sha256').update(b).digest('hex');
}
