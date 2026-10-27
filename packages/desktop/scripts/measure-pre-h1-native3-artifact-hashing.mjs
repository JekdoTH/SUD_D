/** CODE-ONLY measurement. No Electron launch/SQLite/OS process creation.
 * Native2 full artifact validation is same 274-file/RC5/23-external closure as
 * Native3, while native3's extra running-process SHA is measured separately.
 * Native3 strict production verifier deliberately rejects this Node process. */
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
const base='../.serena/pre-h1-controller-01-20261009-';
const old=await import(base+'native2/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
const fixed=await import(base+'native3/infrastructure/dist/private-mvp-pre-h1-native-consent-contract.js');
const pins=JSON.parse(fs.readFileSync('.serena/reports/pre-h1-native2-runtime-byte-pins-20261009.json','utf8'));
const samples=[];
for(let i=0;i<4;i++){
 const before=performance.now();
 old.readVerifiedPreH1NativeArtifacts();
 const after=performance.now();
 fixed.verifyNative3ExecutableIdentity(pins.pins.electronExe.realpath,pins.pins.electronExe);
 const final=performance.now();
 samples.push({pass:i+1,legacyFullArtifactHashMs:Math.round(after-before),
   extraActualExeHashMs:Math.round(final-after),
   expectedNative3HashBudgetMs:Math.round(final-before)});
}
console.log(JSON.stringify({
 samples,
 maxBudgetMs:Math.max(...samples.map(x=>x.expectedNative3HashBudgetMs)),
 meanBudgetMs:Math.round(samples.reduce((a,x)=>a+x.expectedNative3HashBudgetMs,0)/samples.length),
 measuredProcess:'Node code-only; no Electron process',
 timingScope:'Installed Electron hash plus RC5 and Native2 full closure. Native3 emitted files same count; not a real Native3 GUI trial'
},null,2));
