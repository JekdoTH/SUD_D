'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const pkg=p=>JSON.parse(read('packages/'+p+'/package.json'));
const checks=[];
const test=(name,fn)=>{fn();checks.push(name);};
const code=p=>ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const statements=p=>code(p).statements;
const incoming=p=>statements(p).filter(ts.isImportDeclaration).map(n=>({
  spec:n.moduleSpecifier.text,
  typeOnly:!!n.importClause?.isTypeOnly,
  values:!n.importClause?.isTypeOnly&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)?
    n.importClause.namedBindings.elements.filter(e=>!e.isTypeOnly).map(e=>e.name.text):[],
}));
const nativeNames=['koffi','@sud-d/infrastructure','@sud-d/application'];
const infrastructureValues=['canonicalizePath','hasReparsePoint','isUnderInternalRoot','validateWorkspaceRoot',
  'validateRelativePath','WORKSPACE_TEXT_FILE_LIMITS','GIT_SAFETY_LIMITS','createGitSafetyAdapter',
  'validateGitHubNetworkRemote','discoverProjectRunners','isProjectRunnerSnapshotFresh',
  'prepareProjectRunnerSnapshot','verifyProjectRunnerSnapshot'];
const appValues=['createCodingSemanticReadCapabilities','createCodingSemanticWriteCapabilities',
'createAllGitCapabilities','createGitWorkspaceService','createWorkspaceService',
'createRestrictedVerifyCapabilities','createProjectRunnerDiscoveryCapabilities',
'createProjectRunnerDiscoveryService','createWorkMemoryCapabilities','createWorkMemoryService',
'createWorkResumeGuardedToolKernel','createSoloExpertB1aIntegration','soloB1ReviewProjection','requireSoloWorkResume',
'createTeamCapabilities','createTeamLegacyReconciler','createTeamService','createToolCapabilityRegistry',
'createToolKernel','createWorkspaceFileCapabilities'];
const consumers=['coding-semantic-read-capabilities.ts','coding-semantic-write-capabilities.ts',
'workspace-file-capabilities.ts','git-safety-capabilities.ts','git-workspace-service.ts',
'project-runner-service.ts','workspace-service.ts'];
function exportNames(file) {
  const names=[];
  for(const n of statements(file))if(ts.isExportDeclaration(n)&&n.exportClause&&ts.isNamedExports(n.exportClause))
    names.push(...n.exportClause.elements.map(e=>e.name.text));
  return names;
}
test('explicit ordered types/import subpaths, legacy entry unaffected',()=>{
  for(const [p,target] of [['infrastructure','gateway-core'],['application','gateway-core'],
    ['mcp-gateway','workspace-file-server-core']]){
    const before=pkg(p).exports;
    assert.deepEqual(Object.keys(before['./gateway-core']),['types','import']);
    assert.equal(before['./gateway-core'].types,'./dist/'+target+'.d.ts');
    assert.equal(before['./gateway-core'].import,'./dist/'+target+'.js');
    assert.equal(before['.'].import,'./dist/index.js');
    assert.equal(before['.'].types,'./dist/index.d.ts');
  }
});
test('narrow infra and app facades with explicit named exports only',()=>{
  assert.deepEqual(exportNames('packages/infrastructure/src/gateway-core.ts').sort(),[...infrastructureValues].sort());
  assert.deepEqual(exportNames('packages/application/src/gateway-core.ts').sort(),[...appValues].sort());
  for(const p of ['packages/infrastructure/src/gateway-core.ts','packages/application/src/gateway-core.ts']){
    assert.equal(incoming(p).filter(x=>!x.typeOnly).length,0);
    assert(!read(p).includes("from './index.js'"));
  }
});
test('seven application value consumers are narrow, legacy credentials unchanged',()=>{
  for(const filename of consumers){
    const imports=incoming('packages/application/src/'+filename);
    assert(imports.some(i=>i.spec==='@sud-d/infrastructure/gateway-core'&&i.values.length>0),filename);
    assert(!imports.some(i=>i.spec==='@sud-d/infrastructure'&&i.values.length>0),filename);
  }
  assert(read('packages/application/src/connection-service.ts').includes('@sud-d/infrastructure'));
  assert(read('packages/application/src/connection-config-service.ts').includes('@sud-d/infrastructure'));
});
test('new Gateway entrypoint uses narrow facades and excludes default composition',()=>{
  const body=read('packages/mcp-gateway/src/workspace-file-server-core.ts');
  const imports=incoming('packages/mcp-gateway/src/workspace-file-server-core.ts');
  assert(imports.some(i=>i.spec==='@sud-d/infrastructure/gateway-core'));
  assert(imports.some(i=>i.spec==='@sud-d/application/gateway-core'));
  assert(!imports.some(i=>nativeNames.includes(i.spec)&&i.values.length));
  assert(!body.includes('export function createDefaultProductionMcpServer'));
  assert(body.includes('export function createProductionMcpServer'));
  const legacy=read('packages/mcp-gateway/src/workspace-file-server.ts');
  assert(legacy.includes('export function createDefaultProductionMcpServer'));
  assert(legacy.includes('createProductionMcpServer('));
  assert(legacy.includes('export { createProductionMcpServer }'));
});
test('factory / default no accidental weakening of protective seams',()=>{
  const core=read('packages/mcp-gateway/src/workspace-file-server-core.ts');
  for(const signal of ['coordinator !== dependencies.approval','requireSoloWorkResume',
    'verifyConsumedManualSolo','createWorkResumeGuardedToolKernel','solo_expert.smoke',
    'markUnknown','createToolKernel','solo.getReview','registerWorkMemoryTools']){
    assert(core.includes(signal),'lost invariant '+signal);
  }
  assert.equal((core.match(/server\.registerTool\('solo_expert\.smoke'/g)||[]).length,1);
});
test('harness import is inert and new report target only',()=>{
  const oldHash=crypto.createHash('sha256').update(read('.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md')).digest('hex');
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  assert.equal(typeof h.analysis,'function');
  assert.equal(h.REPORT,undefined);
  assert.equal(crypto.createHash('sha256').update(read('.serena/reports/solo-expert-b1b-g2b-evidence-manifest-20261015.md')).digest('hex'),oldHash);
  assert(read('packages/tests/src/b1b-g2b-artifact-evidence.cjs').includes('solo-expert-b1b-g2b-native-free-source-closeout-20261015.md'));
});
test('closed-world project export resolution rejects stale, unknown subpaths, missing declarations',()=>{
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  const k=f=>path.resolve(ROOT,f).toLowerCase();
  const known=new Map([
    [k('packages/infrastructure/dist/gateway-core.js'),true],
    [k('packages/infrastructure/dist/gateway-core.d.ts'),true],
  ]);
  assert.equal(h.resolveProjectExport('@sud-d/infrastructure/gateway-core','runtime',known),
    path.resolve(ROOT,'packages/infrastructure/dist/gateway-core.js'));
  assert.equal(h.resolveProjectExport('@sud-d/infrastructure/gateway-core','types',known),
    path.resolve(ROOT,'packages/infrastructure/dist/gateway-core.d.ts'));
  assert.throws(()=>h.resolveProjectExport('@sud-d/infrastructure/not-real','runtime',known),/unknown package subpath/);
  assert.throws(()=>h.resolveProjectExport('@sud-d/infrastructure/gateway-core','runtime',new Map()),/uncaptured package export/);
  assert.throws(()=>h.resolveProjectExport('@sud-d/infrastructure/gateway-core','types',
    new Map([[k('packages/infrastructure/dist/gateway-core.js'),true]])),/uncaptured package export/);
  assert.throws(()=>h.resolveProjectExport('@sud-d/infrastructure/gateway-core','require',known),/unsupported/);
});
test('compiler virtual host rejects physical stale dist declaration fallback',()=>{
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  const stale=path.join(ROOT,'packages','infrastructure','dist','index.d.ts');
  assert(fs.existsSync(stale),'fixture needs pre-existing stale declaration');
  const host=h.hostFor({target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.Node16,
    moduleResolution:ts.ModuleResolutionKind.Node16},new Map());
  assert.equal(host.fileExists(stale),false);
  assert.equal(host.readFile(stale),undefined);
});
test('virtual declaration overlay resolves workspace package symlink without physical dist',()=>{
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  const target=path.join(ROOT,'packages','infrastructure','dist','gateway-core.d.ts');
  const viaLink=path.join(ROOT,'packages','application','node_modules','@sud-d','infrastructure',
    'dist','gateway-core.d.ts');
  const virtual=new Map([[target.toLowerCase(),Buffer.from('export declare const LIMIT: number;')]]);
  const host=h.hostFor({target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.Node16,
    moduleResolution:ts.ModuleResolutionKind.Node16},virtual);
  assert.equal(host.fileExists(viaLink),true);
  assert.equal(host.readFile(viaLink),'export declare const LIMIT: number;');
  const physical=path.join(ROOT,'packages','application','node_modules','@sud-d','infrastructure','dist','index.d.ts');
  assert.equal(host.fileExists(physical),false);
});
test('source AST erasure independent of emitted JS value edges',()=>{
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  const source=`import type { A } from './types.js';
import { type B } from './types-2.js';
export type { C } from './types-3.js';
export { value } from './value.js';`;
  const es=h.sourceEdges(source,path.join(ROOT,'packages','tests','src','fiction.ts'));
  assert.deepEqual(es.map(x=>x.erased),[true,true,true,false]);
  const emitted=h.jsEdges("export { value } from './value.js';",
    path.join(ROOT,'packages','tests','src','fiction.js'));
  assert.equal(emitted.length,1);
  assert.equal(emitted[0].specifier,'./value.js');
});
test('native project graph forbidden and dynamic worker/resource fail closed',()=>{
  const h=require('./b1b-g2b-artifact-evidence.cjs');
  const domain=path.join(ROOT,'packages','domain','dist','index.js');
  const fakeKey=path.resolve(domain).toLowerCase();
  const nativeMap=new Map([[fakeKey,{path:domain,body:Buffer.from("import 'koffi';")}]]);
  const old=h.traceGraph('@sud-d/domain',nativeMap);
  assert.equal(old.native.length,1);
  const missing=new Map([[fakeKey,{path:domain,body:Buffer.from("import './stale-but-physical.js';")}]]);
  assert.throws(()=>h.traceGraph('@sud-d/domain',missing),/uncaptured internal import/);
  const unknown=new Map([[fakeKey,{path:domain,body:Buffer.from("import('./' + suffix);")}]]);
  assert.throws(()=>h.traceGraph('@sud-d/domain',unknown),/nonliteral runtime/);
  const worker=new Map([[fakeKey,{path:domain,
    body:Buffer.from("new Worker(new URL(workerPath, import.meta.url));")}]]);
  assert.throws(()=>h.traceGraph('@sud-d/domain',worker),/nonliteral runtime/);
});
console.log('G2B_NATIVE_FREE_STATIC_TEST_PASS '+checks.length+' checks '+checks.join('; '));
