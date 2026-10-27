import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
const cwd=process.cwd();
const root=path.join(cwd,'packages/desktop/.serena/pre-h1-preparation-desktop-20261009');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'preparation-only-manifest.json'),'utf8')) as {
  caseId:string;status:string;root:string;
  desktopMain:string;preload:string;renderer:string;gitWorker:string;
  nativeAuthority:boolean;autoPrepare:boolean;automaticProviderCheck:boolean;
  publicMcpRunnerExecution:boolean;sourcePins:Record<string,{bytes:number;sha256:string}>;
  emittedPins:Record<string,{bytes:number;sha256:string}>;
};
const sha=(f:string)=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const main=fs.readFileSync(path.join(root,manifest.desktopMain),'utf8');
const preload=fs.readFileSync(path.join(root,manifest.preload),'utf8');
const html=fs.readFileSync(path.join(root,manifest.renderer),'utf8');
const rendererDir=path.join(root,'dist/assets');
const scripts=fs.readdirSync(rendererDir).filter(n=>n.endsWith('.js'))
  .map(n=>fs.readFileSync(path.join(rendererDir,n),'utf8')).join('\n');

describe('isolated PRE-H1 preparation-only Desktop: real emitted files, no launch',()=>{
  it('pins every source and emitted byte, including the startup entry',()=>{
    expect(manifest).toMatchObject({
      caseId:'PRE-H1-CONTROLLER-01-PREPARATION-ONLY',
      status:'CODE_ONLY_PREPARATION_DESKTOP_NOT_EXECUTED',
      desktopMain:'dist-electron/main.js',preload:'dist-electron/preload.cjs',
      renderer:'dist/index.html',gitWorker:'dist-electron/git-worker.js',
      nativeAuthority:false,autoPrepare:false,automaticProviderCheck:false,
      publicMcpRunnerExecution:false,
    });
    for(const [name,record] of Object.entries(manifest.sourcePins)){
      const f=path.join(cwd,name);
      expect(fs.statSync(f).size,name).toBe(record.bytes);
      expect(sha(f),name).toBe(record.sha256);
    }
    for(const [name,record] of Object.entries(manifest.emittedPins)){
      const f=path.join(root,name);
      expect(fs.statSync(f).size,name).toBe(record.bytes);
      expect(sha(f),name).toBe(record.sha256);
    }
    expect(fs.existsSync(path.join(root,'src/assets/sud-d-app-icon.png'))).toBe(true);
  });
  it('links compatible secure preload, guarded private IPC and rendered Activity scope',()=>{
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('sandbox: true');
    expect(main).toContain('preload.cjs');
    expect(preload).toContain('require("electron")');
    expect(preload).toContain('contextBridge.exposeInMainWorld("sudD"');
    expect(preload).not.toMatch(/(?:from|require\()\s*["'](?:zod|@sud-d\/)/);
    const routes=['pre-h1:prepare:review','pre-h1:prepare:request',
      'pre-h1:prepare:cancel','approval:list','approval:respond'];
    for(const route of routes){
      expect(main,route).toContain(route);
      expect(preload,route).toContain(route);
    }
    for(const marker of ['preH1Review','preH1Request','preH1Cancel',
      'Review fixed Mission','Mission SHA-256 binding','Pending approvals',
      'NO Native execution']){
      expect(scripts,marker).toContain(marker);
    }
    expect(html).toMatch(/assets\/[^"']+\.js/);
    expect(html).toMatch(/assets\/[^"']+\.css/);
    expect(html).not.toMatch(/https?:\/\//);
  });
  it('constructs only inert ordinary owner and never starts, enrolls or approves on startup',()=>{
    expect(main).toContain('createF2H1DesktopRunnerOwner()');
    expect(main).toContain('createPreH1MissionPreparationBridge(');
    expect(main).not.toContain('createPreH1DiagnosticDesktopLifecycle');
    expect(main).not.toContain('PRE_H1_RC5_NATIVE_OWNER_CONSENT_VERIFIED');
    expect(main).not.toContain('desktopRunnerOwner.startOnce()');
    const start=main.lastIndexOf('app.whenReady().then(');
    const end=main.indexOf("app.on('before-quit'",start);
    expect(start).toBeGreaterThan(0);
    const body=main.slice(start,end>=0?end:undefined);
    expect(body).toContain('registerIpcHandlers()');
    expect(body).toContain('createWindow()');
    expect(body).not.toContain('preH1PreparationBridge.request()');
    expect(body).not.toContain('enrollApproved(');
    expect(body).not.toContain('reserveAttempt(');
    expect(body).not.toContain('startOnce(');
    expect(body).not.toContain('checkOnStartup()');
    expect(main).not.toContain('VITE_DEV_SERVER_URL');
    expect(main).toContain('PRE_H1_PREPARATION_TERMINAL');
  });
  it('retains fixed no-argument private capability and manual policy for all modes',()=>{
    const bridge=fs.readFileSync(path.join(cwd,
      'packages/desktop/electron/pre-h1-mission-preparation.ts'),'utf8');
    const coordinator=fs.readFileSync(path.join(cwd,
      'packages/application/src/approval-service.ts'),'utf8');
    const ipc=fs.readFileSync(path.join(cwd,
      'packages/desktop/electron/approval-ipc.ts'),'utf8');
    const activity=fs.readFileSync(path.join(cwd,
      'packages/desktop/src/pages/ActivityPage.tsx'),'utf8');
    expect(bridge).toContain('name:CAPABILITY,effect:\'execute\'');
    expect(bridge).toContain('Object.keys(input).length===0');
    expect(bridge).toContain('pendingRequestId!==context.approvalRequestId');
    expect(coordinator).toContain("request.capability === 'pre-h1.prepare'");
    expect(ipc).toContain('isSenderValid(event.sender)');
    expect(ipc).toContain('bridge.request()');
    expect(activity).toContain('Review fixed Mission');
    expect(activity).toContain('requestFixedPreH1');
    expect(activity).toContain("respond(approval.id, 'approve')");
    expect(activity).not.toContain('useEffect(() => { void requestFixedPreH1()');
    const gateway=fs.readFileSync(path.join(cwd,
      'packages/mcp-gateway/src/workspace-file-server.ts'),'utf8');
    expect(gateway).not.toContain("registerTool('runner.mission'");
    expect(gateway).not.toContain("registerTool('runner.start'");
    expect(gateway).not.toContain("registerTool('pre-h1.prepare'");
  });
  it('keeps all production native gates false and the diagnostic packages immutable',()=>{
    const gates=[
      ['private-mvp-desktop-runner-owner','F2H1_TOPOLOGY_B_NATIVE_CREATION_AUTHORIZED'],
      ['private-mvp-runner-control-entry','F2H1_RUNNER_CONTROL_EXECUTION_AUTHORIZED'],
      ['private-mvp-runner-control-watchdog','F2H1_RUNNER_WATCHDOG_EXECUTION_AUTHORIZED'],
      ['private-mvp-desktop-pipe-worker','F2H1_DESKTOP_PIPE_WORKER_EXECUTION_AUTHORIZED'],
    ];
    for(const [file,flag] of gates){
      const src=fs.readFileSync(path.join(cwd,
        'packages/infrastructure/src',file+'.ts'),'utf8');
      const dist=fs.readFileSync(path.join(cwd,
        'packages/infrastructure/dist',file+'.js'),'utf8');
      expect(src).toContain('export const '+flag+'=false as const;');
      expect(dist).toContain('export const '+flag+' = false;');
    }
    for(const rc of ['rc3','rc4','rc5']){
      const pin=JSON.parse(fs.readFileSync(path.join(cwd,
        '.serena/reports/pre-h1-'+rc+'-all-emitted-byte-pins-20261009.json'),'utf8')) as {
        root:string;files:Record<string,{bytes:number;sha256:string}>;
      };
      for(const [name,record] of Object.entries(pin.files)){
        const f=path.join(cwd,pin.root,name);
        expect(fs.statSync(f).size,rc+':'+name).toBe(record.bytes);
        expect(sha(f),rc+':'+name).toBe(record.sha256);
      }
      expect(Object.keys(pin.files)).toHaveLength(rc==='rc5'?256:248);
    }
  });
});
