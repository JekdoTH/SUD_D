import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {createGitSafetyAdapter} from '../../packages/infrastructure/dist/git-safety-adapter.js';
import {createGitCommandRunner,resolveTrustedGitExecutable} from '../../packages/infrastructure/dist/git-command-runner.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sudd-ci-git-repro-'));
try {
 for(const args of [['init','-q'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid']])execFileSync('git',args,{cwd:root,windowsHide:true});
 fs.writeFileSync(path.join(root,'tracked.txt'),'base\n');
 execFileSync('git',['add','tracked.txt'],{cwd:root,windowsHide:true});
 execFileSync('git',['commit','-q','-m','fixture'],{cwd:root,windowsHide:true});
 fs.writeFileSync(path.join(root,'tracked.txt'),'trailing whitespace   \n');
 const traces=[];
 const commandRunner=createGitCommandRunner({spawnSync:(exe,args,options)=>{
  const result=spawnSync(exe,args,options);
  if(result.error||result.status!==0)traces.push({args:args.slice(-4),status:result.status,error:result.error?.code,stderr:result.stderr?.toString().slice(0,2000)});
  return result;
 }});
 const git=createGitSafetyAdapter({commandRunner});
 const canonical=fs.realpathSync.native(root);
 console.log(JSON.stringify({version:execFileSync('git',['--version'],{encoding:'utf8'}).trim(),trusted:resolveTrustedGitExecutable(),root,canonical,detect:git.detect(canonical),diff:git.diffCheck(canonical),secret:git.secretScan(canonical),traces}));
} finally {
 if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('sudd-ci-git-repro-'))throw new Error('Cleanup containment mismatch');
 fs.rmSync(root,{recursive:true,force:true});
}
