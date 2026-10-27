import { describe, expect, it } from 'vitest';
import { createInertConsentBundle, syntacticExampleBundle, type InertBundle } from './trusted-supervisor.owner-consent-model.js';

const accepted=() => {
  const value=createInertConsentBundle(syntacticExampleBundle());
  if (!value.ok) throw Error(value.code);
  return value.model;
};
describe('Option A inert four-packet consent model (NEVER an issuer)',()=>{
  it('freezes four ordered campaigns, 13 roots, 65 planned requests without launch authority',()=>{
    const model=accepted();
    expect(model).toMatchObject({trust:'UNVERIFIED',authority:'MISSING',launchAllowed:false});
    expect(model.campaigns.map(c=>[c.id,c.ordinal,c.budget.total])).toEqual([
      ['P0',0,47],['P1',1,6],['P2',2,6],['P3',3,6]]);
    expect(model.globalBudget).toEqual({
      observer:4,controller:13,supervisor:13,root:13,descendant:22,total:65,retries:0});
    expect(model.zeroCases).toEqual(['Z1','Z2','Z3','Z4']);
    expect(model.campaigns.flatMap(c=>c.caseIds).sort()).toEqual([
      '01','02','03','04','05','06','07','08','09','10','11','12','13']);
    expect(model.campaigns.flatMap(c=>c.slots).filter(s=>s.role==='root')).toHaveLength(13);
    expect(Object.isFrozen(model.campaigns[0]?.slots)).toBe(true);
    expect(Object.isFrozen(model.identity)).toBe(true);
    expect(Object.isFrozen(model.workspace.ancestors)).toBe(true);
    expect('nativeLaunch' in model).toBe(false);
  });

  it('does not retain input-owned nested fields, arrays, or claimant buffers',()=>{
    const original=syntacticExampleBundle();
    const v=createInertConsentBundle(original);
    if(!v.ok)throw Error(v.code);
    original.task.taskId='changed';
    original.campaigns[0]!.slots[0]!.generation=900;
    original.artifacts[0]!.binary.sha256='f'.repeat(64);
    expect(v.model.task.taskId).toBe('fake-task');
    expect(v.model.campaigns[0]?.slots[0]?.generation).toBe(1);
    expect(v.model.artifacts[0]?.binary.sha256).toBe('a'.repeat(64));
  });

  it('rejects unknown, hidden, inherited, symbol, getter and malicious Proxy shapes fail-closed',()=>{
    const draft=syntacticExampleBundle();
    for(const value of [
      {...draft,approved:true}, {...draft,argv:['cmd']},{...draft,env:{}},
      {...draft,receipt:{approved:true}},{...draft,privateKey:'x'},
      Object.defineProperty({...draft},'credential',{value:'x',enumerable:false}),
      Object.assign({...draft},{[Symbol('hidden')]:7}),
      Object.create(draft),
      Object.defineProperty({...draft},'bundleId',{enumerable:true,get(){throw Error('secret getter');}}),
      new Proxy(draft,{ownKeys(){throw Error('hostile trap');}}),
      new Proxy(draft,{getPrototypeOf(){throw Error('trap');}}),
      {...draft,artifacts:[new Proxy(draft.artifacts[0]!,{getOwnPropertyDescriptor(){throw Error('trap');}})]},
      {...draft,zeroCases:Object.assign([...draft.zeroCases],{extra:'x'})},
      {...draft,zeroCases:[...'Z1'].slice(0,1)},
    ]) expect(createInertConsentBundle(value)).toEqual({ok:false,code:'INVALID_CONSENT_MODEL'});
  });

  it('rejects forged auth/scope, modified budget, foreign role/case and duplicate slots',()=>{
    const draft=syntacticExampleBundle();
    const mutate=(change:Record<string,unknown>)=>createInertConsentBundle({...syntacticExampleBundle(),...change});
    for(const change of [
      {version:2}, {bundleId:'z'}, {issuedAtMs:NaN}, {issuedAtMs:Infinity},
      {expiresAtMs:draft.issuedAtMs}, {expiresAtMs:Number.MAX_SAFE_INTEGER+1},
      {globalBudget:{...draft.globalBudget,total:62}}, {zeroCases:['Z1','Z2','Z3','Z3']},
      {campaigns:[...draft.campaigns].reverse()},
      {campaigns:draft.campaigns.map((c,i)=>i===1?{...c,caseIds:['13']}:c)},
      {campaigns:draft.campaigns.map((c,i)=>i===0?{...c,slots:[c.slots[0],c.slots[0],...c.slots.slice(2)]}:c)},
      {campaigns:draft.campaigns.map((c,i)=>i===0?{...c,slots:c.slots.map((s,j)=>j===0?{...s,role:'root'}:s)}:c)},
      {trustBinding:{...draft.trustBinding,issuerKeyId:'./evil'}},
      {identity:{...draft.identity,deviceKeyDigest:'untrusted'}},
      {task:{...draft.task,grantVersion:0}},
      {workspace:{...draft.workspace,root:{...draft.workspace.root,path:'\\\\server\\share'}}},
      {workspace:{...draft.workspace,root:{...draft.workspace.root,path:'C:\\fake\\..\\escape'}}},
      {workspace:{...draft.workspace,root:{...draft.workspace.root,path:'C:\\fake\\CON.txt'}}},
      {artifacts:draft.artifacts.map((a,i)=>i===0?{...a,env:{}}:a)},
    ])expect(mutate(change)).toEqual({ok:false,code:'INVALID_CONSENT_MODEL'});
  });

  it('has no real key, signing, verification, or trusted owner approval method',async()=>{
    const m=await import('./trusted-supervisor.owner-consent-model.js');
    expect(Object.keys(m).some(k=>/issue|sign|authorize|launch|approve|native|redeem/i.test(k))).toBe(false);
    const v=accepted() as InertBundle;
    expect(v.trust).toBe('UNVERIFIED');
    expect(v.authority).toBe('MISSING');
    expect(v.launchAllowed).toBe(false);
  });
});
