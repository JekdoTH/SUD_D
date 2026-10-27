/** Native2 externally reviewed fixed runtime dependency byte identities.
 * Run ONCE before compiling Native2; no installation or native imports. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const requireFor=createRequire(path.join(repo,'packages/desktop/package.json'));
const destination=path.join(repo,'.serena/reports/pre-h1-native2-runtime-byte-pins-20261009.json');
if(fs.existsSync(destination))throw Error('NATIVE2_RUNTIME_PINS_ALREADY_EXISTS');
const candidates={
 electronExe:'packages/desktop/node_modules/electron/dist/electron.exe',
 koffiAddon:'node_modules/.pnpm/@koromix+koffi-win32-x64@3.1.6/node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node',
 sqliteAddon:'node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
 electronResolution:requireFor.resolve('electron'),
 koffiResolution:requireFor.resolve('koffi'),
 sqliteResolution:requireFor.resolve('better-sqlite3'),
};
const pins={};
for(const [name,p] of Object.entries(candidates)){
 const file=path.isAbsolute(p)?p:path.join(repo,p);
 const stat=fs.lstatSync(file);
 if(!stat.isFile()||stat.isSymbolicLink())throw Error('RUNTIME_BINARY_NOT_REGULAR:'+name);
 const physical=fs.realpathSync.native(file);
 pins[name]={relative:path.relative(repo,file).replaceAll('\\','/'),
   realpath:physical,bytes:stat.size,
   sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
}
const payload={version:1,repo,selectedElectronRelative:pins.electronExe.relative,
 binaryNames:['electronExe','koffiAddon','sqliteAddon'],pins};
fs.writeFileSync(destination,JSON.stringify(payload,null,2)+'\n',{flag:'wx'});
console.log('NATIVE2_RUNTIME_PINS_SHA256='+crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex'));
for(const [k,v] of Object.entries(pins))console.log(k+' '+v.relative+' '+v.bytes+' '+v.sha256+' '+v.realpath);
