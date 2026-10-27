'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('../../desktop/scripts/prepare-latest-owner-test-workspace.cjs');
let passed=0;
const good=(name,fn)=>{fn();passed++;console.log('PASS '+name)};
const reject=(name,fn)=>good(name,()=>assert.throws(fn,/OWNER_TEST_(?:BLOCKED|UNSAFE)/));
good('pure helper exports exist',()=>assert.equal(typeof h.safeRelative,'function'));
reject('traversal refused',()=>h.safeRelative('packages/desktop/src/../../../../original/dist'));
reject('absolute refused',()=>h.safeRelative('C:/external/override.js'));
reject('ADS refused',()=>h.safeRelative('packages/desktop/src/main.ts:payload'));
reject('backslash refused',()=>h.safeRelative('packages\\desktop\\src\\main.ts'));
reject('empty segment refused',()=>h.safeRelative('packages/desktop//src'));
reject('case-fold collision refused',()=>{
 const s=new Set();h.safeRelative('packages/desktop/src/Test.ts',s);h.safeRelative('packages/desktop/src/test.ts',s)
});
reject('output outside owned root refused',()=>h.inside('/owner','/owner2/dist/index.js'));
reject('existing foreign destination refused',()=>h.assertAbsent('/already-present',()=>true));
reject('source reparse/symlink refused',()=>h.assertRegular({isSymbolicLink:()=>true,isFile:()=>true},'bad'));
reject('output hardlink refused',()=>h.assertIndependent({dev:'1',ino:'9',nlink:'1'},{dev:'1',ino:'7',nlink:'2'}));
reject('shared file identity refused',()=>h.assertIndependent({dev:'1',ino:'9',nlink:'1'},{dev:'1',ino:'9',nlink:'1'}));
reject('source hash mutation refused',()=>h.assertSourceHash('a','b','path'));
reject('unexpected Vite template refused',()=>h.generateOwnerVite('export default {}','a'.repeat(64)));
reject('shell process invocation template refused',()=>h.generateOwnerVite("execFileSync('git',[])",'b'.repeat(64)));
reject('release-mode request refused',()=>h.rejectReleaseFlags({SUD_D_REQUIRE_BUILD_REVISION:'1'}));
reject('another release gate refused',()=>h.rejectReleaseFlags({SUD_D_REQUIRE_UPDATE_PUBLIC_KEY:'1'}));
reject('clean release flag refused',()=>h.rejectReleaseFlags({SUD_D_REQUIRE_CLEAN_RELEASE:'1'}));
reject('native source executable refused',()=>h.assertAllowedSource('packages/desktop/src/addon.node'));
reject('outside source allowed roots refused',()=>h.assertAllowedSource('packages/desktop/build/main.js'));
good('approved untracked gateway Source allowed',()=>assert.equal(h.assertAllowedSource('packages/mcp-gateway/src/workspace-file-server-core.ts'),true));
good('approved untracked desktop Source allowed',()=>assert.equal(h.assertAllowedSource('packages/desktop/src/ActivityPage.tsx'),true));
good('approved root workspace manifests allowed',()=>assert.equal(h.assertAllowedSource('pnpm-lock.yaml'),true));
good('generated config remains free of actual child process calls',()=>{
 const vite=fs.readFileSync(path.resolve(__dirname,'../../desktop/vite.config.ts'),'utf8');
 const generated=h.generateOwnerVite(vite,'c'.repeat(64));
 assert(!generated.includes('node:child_process'));
 assert(!generated.includes('execFileSync'));
 assert(generated.includes("external: ['better-sqlite3', 'koffi']"));
 assert(generated.includes("'git-worker': path.join(__dirname, 'electron/git-worker.ts')"));
 assert(generated.includes("outDir: path.join(__dirname, 'dist-electron')"));
 assert(generated.includes("outDir: path.join(__dirname, 'dist')"));
 assert(generated.includes("path.join(__dirname, '../contracts/src/index.ts')"));
 assert(generated.includes("SUD_D_REQUIRE_CLEAN_RELEASE"));
 assert(generated.includes("c".repeat(64)));
});
good('recorded FileID identity positive from createOwned record',()=>assert.equal(
 h.assertRecordedCopyIdentity(
  {identity:{dev:'3839167633',ino:'2251799813962763',nlink:'1'}},
  {dev:'3839167633',ino:'2251799813962763',nlink:'1'}),true));
reject('recorded FileID mismatch fails closed',()=>h.assertRecordedCopyIdentity(
 {identity:{dev:'3839167633',ino:'2251799813962763',nlink:'1'}},
 {dev:'3839167633',ino:'2251799813962764',nlink:'1'}));
reject('missing recorded identity fails closed',()=>h.assertRecordedCopyIdentity(
 {path:'packages/desktop/src/index.html'},
 {dev:'3839167633',ino:'2251799813962763',nlink:'1'}));
reject('recorded copied hardlink fails closed',()=>h.assertRecordedCopyIdentity(
 {identity:{dev:'3839167633',ino:'2251799813962763',nlink:'2'}},
 {dev:'3839167633',ino:'2251799813962763',nlink:'2'}));
reject('missing or zero actual FileID fails closed',()=>h.assertRecordedCopyIdentity(
 {identity:{dev:'3839167633',ino:'2251799813962763',nlink:'1'}},
 {dev:'0',ino:'0',nlink:'1'}));
console.log('LATEST_OWNER_TEST_PREP_TEST_PASS '+passed);
