'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..');
const old=fs.readFileSync(path.join(ROOT,'.serena/reports/solo-expert-b1b-g2b-native-free-source-closeout-20261015.md'),'utf8');
const nodeManifest='packages/mcp-gateway/node_modules/@types/node/package.json';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const oldReads=old.split(/\r?\n/).filter(x=>x.startsWith('- ')&&x.includes(' SHA-256 '));
assert(oldReads.every(x=>!x.includes(nodeManifest)),'RED fixture: accepted 786 set newly complete');
assert.equal(hash(fs.readFileSync(path.join(ROOT,nodeManifest))),'a4d29a0f9a3b45be30a130591091ea1f7707d4193489960ef4ee98f35375a4e9');
const planner=require('./b1b-g2b-publication-plan.cjs');
const tests=[];
const test=(label,fn)=>{fn();tests.push(label)};
const rejects=(label,fn,pattern)=>test(label,()=>assert.throws(fn,pattern));
test('require is inert and report absent',()=>{
  assert.equal(fs.existsSync(path.join(ROOT,'.serena/reports/solo-expert-b1b-g2b-publication-plan-closeout-20261015.md')),false);
  assert.equal(typeof planner.plan,'function');
});
test('prior 47 runtime cannot attest declarations',()=>{
  const runtime=new Set(['packages/mcp-gateway/dist/workspace-file-server-core.js']);
  const declarations=new Set(['packages/mcp-gateway/dist/workspace-file-server-core.d.ts',
    'packages/application/dist/index.d.ts']);
  assert.equal(planner.isCompleteClosure(runtime,declarations),false);
});
rejects('missing captured JS rejects physical stale file',()=>{
  planner.resolveInternal('./safety.js','packages/application/dist/index.js','runtime',new Map());
},/uncaptured|missing/i);
rejects('missing emitted declaration refuses physical fallback',()=>{
  planner.resolveInternal('./safety.js','packages/application/dist/index.d.ts','types',new Map());
},/uncaptured|missing/i);
rejects('unknown project subpath rejected',()=>{
  planner.resolveInternal('@sud-d/infrastructure/does-not-exist','packages/mcp-gateway/dist/workspace-file-server-core.js','runtime',new Map());
},/unknown|unsupported/i);
rejects('unsupported CJS package condition rejected',()=>{
  planner.resolveInternal('@sud-d/mcp-gateway/gateway-core','packages/mcp-gateway/dist/workspace-file-server-core.js','require',new Map());
},/condition|unsupported/i);
rejects('unresolved dynamic module execution classified blocked',()=>{
  planner.scanEdges("import('./' + pathPart)",'packages/mcp-gateway/dist/fiction.js','runtime');
},/nonliteral|dynamic/i);
rejects('variable worker module classified blocked',()=>{
  planner.scanEdges('new Worker(new URL(workerFile, import.meta.url))','packages/mcp-gateway/dist/fiction.js','runtime');
},/nonliteral|dynamic/i);
rejects('variable vendor require classified blocked',()=>{
  planner.scanEdges('require(moduleName)','packages/mcp-gateway/dist/fiction.js','runtime');
},/nonliteral|dynamic/i);
rejects('destination symlink injection blocked',()=>{
  planner.safeDestination('packages/mcp-gateway/dist/index.js',new Set(),{exists:()=>true,lstat:()=>({
    isSymbolicLink:()=>true,isFile:()=>true,isDirectory:()=>true,
  })});
},/symlink|reparse/i);
rejects('source symlink injection blocked',()=>{
 planner.safeSource('packages/application/src/gateway-core.ts',{
  exists:()=>true,lstat:()=>({isSymbolicLink:()=>true,isFile:()=>true,isDirectory:()=>true})
 });
},/source symlink|reparse/i);
rejects('case insensitive output collision rejected',()=>{
  const s=new Set();planner.safeDestination('packages/application/dist/GATEWAY-CORE.js',s,{exists:()=>false});
  planner.safeDestination('packages/application/dist/gateway-core.js',s,{exists:()=>false});
},/collision|duplicate/i);
rejects('outside dist path and ADS rejected',()=>{
  planner.safeDestination('packages/application/dist/../escaped.js',new Set(),{exists:()=>false});
},/escape|traversal/i);
rejects('source/config manifests drift fail closed',()=>{
  planner.assertFrozen(new Map([['file','a']]),new Map([['file','b']]));
},/drift|changed/i);
test('ordered exports and type path exact',()=>{
  const seen=new Map([['packages/mcp-gateway/dist/workspace-file-server-core.d.ts',true]]);
  assert.equal(planner.resolveInternal('@sud-d/mcp-gateway/gateway-core',
    'packages/application/dist/gateway-core.d.ts','types',seen),
    'packages/mcp-gateway/dist/workspace-file-server-core.d.ts');
});
test('old report proves only serialized inventory, omitted node manifest recovered',()=>{
  assert(!oldReads.some(x=>x.includes(nodeManifest)));
  assert.equal(hash(fs.readFileSync(path.join(ROOT,nodeManifest))),'a4d29a0f9a3b45be30a130591091ea1f7707d4193489960ef4ee98f35375a4e9');
});
console.log('G2B_PUBLICATION_PLANNER_STATIC_TEST_PASS '+tests.length+' '+tests.join(' | '));
