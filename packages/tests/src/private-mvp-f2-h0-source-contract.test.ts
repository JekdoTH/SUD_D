import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { F2H0_FIXED_IDENTITY } from '@sud-d/infrastructure';
const root=process.cwd();
const host=fs.readFileSync(path.join(root,'packages/infrastructure/native/f2-h0/one-shot-launch-host.cpp'),'utf8');
const build=fs.readFileSync(path.join(root,'packages/infrastructure/native/f2-h0/build-source-only.ps1'),'utf8');
const buildCmd=fs.readFileSync(path.join(root,'packages/infrastructure/native/f2-h0/build-fixed-msvc.cmd'),'utf8');
describe('F2-H0 isolated native one-shot host source invariants (STATIC, NEVER EXECUTE)',()=>{
  it('accepts no commandline selectors, authenticates private control capabilities, and gates before native creation',()=>{
    expect(host).toContain('if (argc != 1) return 40;');
    expect(host).toContain('if (!pipe(input) || !pipe(output)');
    expect(host).toContain('std::memcmp(r.ownerEpoch, b.ownerEpoch');
    expect(host).toContain('std::memcmp(r.challenge, b.challenge');
    expect(host).not.toContain('constexpr bool H1_STAGE_LEASE_READY = false');
    expect(host).toContain('if (!trustedHeldStageAndRunnerAuthority(bootstrap, request)) return 44;');
    expect(host.indexOf('if (!trustedHeldStageAndRunnerAuthority(bootstrap, request)) return 44;'))
      .toBeGreaterThan(host.indexOf('if (!readExact(input'));
    expect(host).toContain('CreateProcessW(kRuntime,');
    expect(host).toContain('kRuntimeSha256');
    expect(host).toContain('pinnedRuntimeBytes()');
    expect(host).not.toContain('ShellExecute');
    expect(host).not.toContain('OpenProcess(');
    expect(host).not.toContain('system(');
  });
  it('pins the exact two-entry NUL synthetic handle list and fixed suspended AppContainer process',()=>{
    expect(host).toContain('HANDLE allowlist[2]{owner.in, owner.out}');
    expect(host).toContain('L"NUL"');
    expect(host).toContain('start.StartupInfo.hStdError = owner.out');
    expect(host).toContain('PROC_THREAD_ATTRIBUTE_HANDLE_LIST');
    expect(host).toContain('PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES');
    expect(host).toContain('CREATE_SUSPENDED');
    expect(host).toContain('if (!checkInherit(owner.in, true) || !checkInherit(owner.out, true)');
    expect(host).toContain('!checkInherit(owner.job, false)');
    expect(host).toContain('SetHandleInformation(input, HANDLE_FLAG_INHERIT, 0)');
  });
  it('uses non-inheritable rights-reduced Gateway copies and finishes by closing temporary owner handles',()=>{
    expect(host).toContain('DuplicateHandle(GetCurrentProcess(), owner.proc, owner.runner,');
    expect(host).toContain('DuplicateHandle(GetCurrentProcess(), owner.thread, owner.runner,');
    expect(host).toContain('&transferredProcess, kProcessTransferRights, FALSE, 0');
    expect(host).toContain('&transferredThread, kThreadTransferRights, FALSE, 0');
    expect(host).toContain('if (!CloseHandle(owner.thread)) return false;');
    expect(host).toContain('if (!CloseHandle(owner.proc)) return false;');
    expect(host).toContain('if (!CloseHandle(owner.job)) return false;');
    expect(host).not.toContain('ResumeThread(');
    expect(F2H0_FIXED_IDENTITY.nativeProofAvailable).toBe(false);
  });
  it('prepares no runnable artifact except with preinstalled MSVC in new ignored .serena root',()=>{
    expect(build).toContain('14.44.35207');
    expect(build).toContain('10.0.26100.0');
    expect(buildCmd).toContain('C:\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat');
    expect(buildCmd).toContain('Hostx64\\x64\\cl.exe');
    expect(build).toContain("'.serena\\runner-f2-h0-build'");
    expect(build).toContain("F2_H0_OUTPUT_ROOT_ALREADY_EXISTS_REVIEW_BEFORE_BUILD");
    expect(build).not.toContain('Start-Process');
    expect(build).not.toContain('Invoke-Expression');
  });
});
