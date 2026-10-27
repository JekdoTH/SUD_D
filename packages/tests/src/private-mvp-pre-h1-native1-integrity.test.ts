import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
const repo=process.cwd();
const root='packages/desktop/.serena/pre-h1-controller-01-20261009-native1';
const sha=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function validate(report:string){
  const manifest=JSON.parse(fs.readFileSync(path.join(repo,report),'utf8')) as {
    root:string;files:Record<string,{bytes:number;sha256:string}>;
  };
  const names=Object.keys(manifest.files);
  for(const [name,rec] of Object.entries(manifest.files)){
    const p=path.join(repo,manifest.root,name);
    expect(fs.statSync(p).size,report+':'+name).toBe(rec.bytes);
    expect(sha(p),report+':'+name).toBe(rec.sha256);
  }
  return names.length;
}
describe('F2 native1 isolated diagnostic and issuance file/loader integrity',()=>{
  it('freezes all 274 Native1 file hashes and all old artifact hashes',()=>{
    expect(validate('.serena/reports/pre-h1-first-native-all-emitted-byte-pins-20261009.json')).toBe(274);
    for(const rc of ['rc3','rc4','rc5'])expect(validate(
      '.serena/reports/pre-h1-'+rc+'-all-emitted-byte-pins-20261009.json'))
      .toBe(rc==='rc5'?256:248);
    for(const f of ['pre-h1-preparation-desktop-all-emitted-byte-pins-20261009.json',
      'pre-h1-preparation-desktop-esmfix-all-emitted-pins-20261009.json'])
      expect(validate('.serena/reports/'+f)).toBe(10);
  });
  it('links emitted ESM Main/activation and issuance without Electron evaluation',()=>{
    const check=spawnSync(process.execPath,['--experimental-vm-modules',
      'packages/desktop/scripts/verify-pre-h1-native1-link.mjs'],
      {cwd:repo,encoding:'utf8',timeout:17000});
    expect(check.status,check.stderr).toBe(0);
    expect(check.stdout).toContain('NATIVE1_ACTUAL_ESM_LINK_PASS infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js');
    expect(check.stdout).toContain('NATIVE1_ACTUAL_ESM_LINK_PASS consent-desktop/dist-electron/main.js');
    expect(check.stdout).toContain('NATIVE1_NATIVE_PROCESS_STARTED=false');
  });
  it('enforces preflight->durable consent consume->win32 bind in actual emitted activation',()=>{
    const activation=fs.readFileSync(path.join(repo,root,
      'infrastructure/dist/private-mvp-pre-h1-diagnostic-activation.js'),'utf8');
    const points=[
      'readApprovedPreH1Diagnostic(db, new Date())',
      'consumePreH1NativeAuthorization(db, new Date())',
      'bindF2H1DesktopRunnerWin32().createFixedDesktopSession',
    ].map(x=>activation.indexOf(x));
    expect(points[0]).toBeGreaterThan(0);
    expect(points[1]).toBeGreaterThan(points[0]!);
    expect(points[2]).toBeGreaterThan(points[1]!);
    const diagnostic=fs.readFileSync(path.join(repo,root,
      'desktop/dist-electron/main.js'),'utf8');
    const issuer=fs.readFileSync(path.join(repo,root,
      'consent-desktop/dist-electron/main.js'),'utf8');
    expect(diagnostic).not.toContain('electron-updater');
    expect(issuer).not.toContain('electron-updater');
    expect(issuer).toContain('pre-h1.native-consent');
    expect(issuer).not.toContain('createPreH1DiagnosticDesktopLifecycle');
    expect(diagnostic).not.toContain('updateController.checkOnStartup()');
    expect(issuer).not.toContain('updateController.checkOnStartup()');
  });
  it('keeps all ordinary Production native gates hard false and no public runner control',()=>{
    for(const [name,gate] of [
      ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
      ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
      ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
      ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
    ]){
      for(const part of ['src','dist']){
        const content=fs.readFileSync(path.join(repo,'packages/infrastructure',part,
          name+(part==='src'?'.ts':'.js')),'utf8');
        expect(content).toMatch(new RegExp(gate+'\\s*=\\s*false'));
      }
    }
    const gateway=fs.readFileSync(path.join(repo,'packages/mcp-gateway/src/server.ts'),'utf8');
    expect(gateway).not.toContain("'pre-h1.native-consent'");
    expect(gateway).not.toContain("'runner.start'");
    expect(gateway).not.toContain("'runner.mission'");
  });
});
