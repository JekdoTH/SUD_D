import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.cwd();
const cpp=()=>readFileSync(join(root,'packages/infrastructure/native/f2-h0/one-shot-launch-host.cpp'),'utf8');
const cmd=()=>readFileSync(join(root,'packages/infrastructure/native/f2-h0/build-topology-b-candidate.cmd'),'utf8');
describe('H0-to-H1 executable source: native authority and stage gate never become simple config switches',()=>{
 it('removes constexpr unconditionally false dead-code barrier and demands actual runtime kernel stage lease',()=>{
   expect(cpp()).not.toContain('constexpr bool H1_STAGE_LEASE_READY = false');
   expect(cpp()).not.toContain('if (!H1_STAGE_LEASE_READY) return 44;');
   expect(cpp()).toContain('if (!trustedHeldStageAndRunnerAuthority(bootstrap, request)) return 44;');
   expect(cpp()).toContain('FileIdInfo');
   expect(cpp()).toContain('FileStandardInfo');
   expect(cpp()).toContain('OWNER_SECURITY_INFORMATION');
   expect(cpp()).toContain('DACL_SECURITY_INFORMATION');
   expect(cpp()).toContain('GetProcessId(bootstrapRunner');
   expect(cpp()).toContain('CreateProcessW(kRuntime');
 });
 it('new candidate has its own output and self identity, never historical binary overwrites',()=>{
   expect(cpp()).toContain('runner-f2-h1-topology-b-candidate-20261008');
   expect(cmd()).toContain('runner-f2-h1-topology-b-candidate-20261008');
   expect(cmd()).not.toContain('runner-f2-h0-build\\');
   expect(cmd()).toContain('/WX');
 });
});
