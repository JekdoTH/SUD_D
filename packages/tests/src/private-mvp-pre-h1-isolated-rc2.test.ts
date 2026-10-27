import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';

const repo=process.cwd();
const candidate=path.join(repo,'packages/desktop/.serena/pre-h1-controller-01-20261009-rc2');
const sha=(file:string)=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=(name:string)=>fs.readFileSync(path.join(candidate,name),'utf8');
const frozen=JSON.parse(read('frozen-diagnostic-manifest.json')) as {
  status:string;
  maxNativeStarts?:number;
  inspectedFiles:Record<string,string>;
  compiledPinnedHashes:Record<string,string>;
  compiledPinnedFiles:number;
};
describe('RC2 isolated PRE-H1 code artifact (read-only; never launch Electron)',()=>{
  it('actual compiled Desktop-relative diagnostic import resolves into RC2, not RC1 or production',()=>{
    const entry=path.join(candidate,'desktop/dist-electron/main.js');
    const compiled=fs.readFileSync(entry,'utf8');
    const physical=path.resolve(path.dirname(entry),'../../infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
    expect(fs.existsSync(physical)).toBe(true);
    expect(physical.startsWith(candidate+path.sep)).toBe(true);
    expect(compiled).toContain("../../infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js");
    expect(compiled).not.toContain("new URL('../infrastructure/dist/");
  });
  it('only diagnostic whenReady path enters exact Desktop-owned lifecycle, without renderer/Connect/Update startup',()=>{
    const compiled=read('desktop/dist-electron/main.js');
    const tail=compiled.slice(compiled.lastIndexOf('app.whenReady().then'),compiled.indexOf('var quitCleanupInFlight'));
    expect(tail).toContain('desktopRunnerOwner.startOnce()');
    expect(tail).toContain('orderlyShutdown()');
    expect(tail).toContain('app.quit()');
    expect(tail).not.toContain('registerIpcHandlers()');
    expect(tail).not.toContain('createWindow()');
    expect(tail).not.toContain('checkOnStartup()');
    expect(tail.match(/startOnce\(\)/g)).toHaveLength(1);
  });
  it('production sources and ordinary outputs retain their closed native gates',()=>{
    const names=[
      ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
      ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
      ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
      ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
    ];
    for(const [file,gate] of names){
      expect(fs.readFileSync(path.join(repo,'packages/infrastructure/src',file+'.ts'),'utf8'))
        .toContain('export const '+gate+'=false as const;');
      expect(fs.readFileSync(path.join(repo,'packages/infrastructure/dist',file+'.js'),'utf8'))
        .toContain('export const '+gate+' = false;');
      expect(read('infrastructure/dist/'+file+'.js'))
        .toContain('export const '+gate+' = true;');
    }
    expect(sha(path.join(repo,'packages/desktop/electron/main.ts')))
      .toBe('c16e2d34550f4f263ce31b1b0990b9c4a2fb1f641fb8a67c5e3f351176f60da4');
    expect(sha(path.join(repo,'packages/desktop/dist-electron/main.js')))
      .toBe('ad2bb05216c2f1de2f443936ef7df7f0a4e66e01ac10d42866fedb026b4bea8b');
  });
  it('all final new outputs and 61 exact transitive JS/addon identities match the RC2 manifest',async()=>{
    expect(frozen.status).toBe('CODE-ONLY-UNEXECUTED-PENDING-OWNER-CONSENT');
    expect(frozen.compiledPinnedFiles).toBe(61);
    for(const [relative,hash] of Object.entries(frozen.compiledPinnedHashes)){
      const p=path.join(repo,relative);
      expect(fs.existsSync(p)).toBe(true);
      expect(sha(p)).toBe(hash);
    }
    for(const [file,hash] of Object.entries(frozen.inspectedFiles)){
      const p=file.startsWith('C:/')||file.startsWith('packages/')||file.startsWith('node_modules/')
        ?path.resolve(repo,file)
        :file.startsWith('scripts/')
          ?path.join(repo,'packages/desktop',file)
          :path.join(candidate,file);
      expect(fs.existsSync(p)).toBe(true);
      expect(sha(p)).toBe(hash);
    }
    const closure=await import('../../desktop/.serena/pre-h1-controller-01-20261009-rc2/infrastructure/dist/private-mvp-h1-compiled-lock.js');
    expect(()=>closure.verifyF2H1PinnedControllerClosure(repo)).not.toThrow();
  });
  it('fixed Owner/source path is pinned inside candidate; source contains F2-A claim and no H0 starts',()=>{
    const owner=read('infrastructure/dist/private-mvp-desktop-runner-owner.js');
    const session=read('infrastructure/dist/private-mvp-desktop-owned-session.js');
    const activation=read('infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
    expect(owner).toContain('pre-h1-controller-01-20261009-rc2');
    expect(session).toContain('claimNativePreparation');
    expect(activation).toContain('readApprovedPreH1Diagnostic');
    expect(activation).toContain('PRE_H1_DIAGNOSTIC_ALREADY_ATTEMPTED');
    expect(activation).not.toContain('enrollApproved(');
    expect(activation).not.toContain('reserveAttempt(');
    expect(activation).not.toContain('createProcess(');
  });
});
