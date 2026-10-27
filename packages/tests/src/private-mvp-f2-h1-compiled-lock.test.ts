import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {
  F2H1_CONTROLLER_PINNED_FILES,verifyF2H1PinnedControllerClosure,
} from '../../infrastructure/src/private-mvp-h1-compiled-lock.js';

// Code-only, temporary files. This does NOT invoke the Win32 owner or Koffi.
const scratch:string[]=[];
function copiedFixture():string {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sud-h1-pins-'));
  scratch.push(root);
  for(const relative of Object.keys(F2H1_CONTROLLER_PINNED_FILES)){
    const from=path.resolve(process.cwd(),...relative.split('/'));
    const to=path.resolve(root,...relative.split('/'));
    fs.mkdirSync(path.dirname(to),{recursive:true});
    fs.copyFileSync(from,to);
  }
  return root;
}
afterEach(()=>{
  for(const folder of scratch.splice(0))fs.rmSync(folder,{recursive:true,force:true});
});
describe('PRE-H1 pinned compiled import graph (never executes native files)',()=>{
  it('validates all reachable frozen JS imports plus exact Windows Koffi addon',()=>{
    expect(()=>verifyF2H1PinnedControllerClosure(process.cwd())).not.toThrow();
  });
  it('rejects a missing transitive Protocol dependency',()=>{
    const root=copiedFixture();
    fs.unlinkSync(path.join(root,'packages/infrastructure/dist/private-mvp-h1-control-protocol.js'));
    expect(()=>verifyF2H1PinnedControllerClosure(root))
      .toThrow(/IMPORT_LOCK_MISSING/);
  });
  it('rejects a changed Watchdog binary against the frozen hash',()=>{
    const root=copiedFixture();
    fs.appendFileSync(path.join(root,'packages/infrastructure/dist/private-mvp-runner-control-watchdog.js'),'\n// substituted\n');
    expect(()=>verifyF2H1PinnedControllerClosure(root))
      .toThrow(/IMPORT_LOCK_CHANGED/);
  });
  it('rejects any unexpected added compiled import even if its target file exists',()=>{
    const root=copiedFixture();
    const foreign=path.join(root,'packages/infrastructure/dist/foreign-controller.js');
    fs.writeFileSync(foreign,'export {};\n');
    fs.appendFileSync(path.join(root,'packages/infrastructure/dist/private-mvp-desktop-pipe-io.js'),
      "\nimport './foreign-controller.js';\n");
    expect(()=>verifyF2H1PinnedControllerClosure(root))
      .toThrow(/IMPORT_LOCK_CHANGED/);
  });
  it('rejects tampered Koffi native addon without loading it',()=>{
    const root=copiedFixture();
    const binary=path.join(root,
      'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node');
    fs.appendFileSync(binary,Buffer.from([0]));
    expect(()=>verifyF2H1PinnedControllerClosure(root))
      .toThrow(/IMPORT_LOCK_CHANGED/);
  });
});
