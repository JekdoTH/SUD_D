import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.cwd();
const source=readFileSync(join(root,'packages/infrastructure/src/private-mvp-h1-win32-host-calls.ts'),'utf8');
describe('H1 fixed Gateway Win32 host source, static nonexecuting',()=>{
  it('implements real Win32 primitive bindings, not a second interface-only port',()=>{
    for (const name of ['CreatePipe','SetHandleInformation','InitializeProcThreadAttributeList',
      'UpdateProcThreadAttribute','CreateProcessW','DuplicateHandle','ReadFile','WriteFile',
      'WaitForSingleObject','GetExitCodeProcess','TerminateJobObject','QueryInformationJobObject',
      'GetFileInformationByHandleEx','GetSecurityInfo']) expect(source).toContain(name);
    expect(source).toContain('createF2H1Win32HostCalls');
  });
  it('does not dispatch a generic spawn nor publish native H1 proof or resume worker',()=>{
    expect(source).not.toContain('child_process');
    expect(source).not.toContain('spawn(');
    expect(source).not.toContain('execFile(');
    expect(source).not.toContain('ShellExecute');
    expect(source).not.toContain('ResumeWorker');
  });
});
