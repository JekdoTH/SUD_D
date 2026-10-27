import {createHash} from 'node:crypto';
import {lstatSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';

const ROOT='C:\\1.งานโด้\\SUD-D-Solo-Test-Workspace';
const SHA:Record<string,string>={
  'README.md':'619c0a5eb4075248cd3064a6742d71b542edaf2871fff7fd2efa4614277faf33',
  'workflow-contract.json':'cc3ea60e1a7d23a9b4d648ddf73acc206f37d0a0b750e89208318e76345bd158',
  'fixtures/goal.json':'16481f4f66223b01711f303ff5058c8ce56d4c530157bfe74b8e760e602d52eb',
  'fixtures/script.json':'c9285d7a573d219da7e3b7f76cef7686f575ac22de434b6e008e5f09eff95f88',
  'fixtures/scene-plan.json':'778b2d7957b3205d79a87399a716df87a2092d43e7738e8ed3bbe3e8b41bd747',
  'fixtures/subtitles.srt':'612d8d2d6138f64f18be152d389f4f29ba01f0d04955aff1179b0f0b800ddbed',
  'expected/acceptance.json':'b1aa74833c33a64aa7d3cbf0a891daf28964d5cc2f5a8db96e4420e18579cd3f',
};
const IDs=['goal','script','qa','tts','images','subtitles','render','technical-qc','semantic-qc','final'];
const DEPS:Record<string,string[]>={
  goal:[],script:['goal'],qa:['script'],tts:['qa'],images:['qa'],
  subtitles:['qa','tts'],render:['tts','images','subtitles'],
  'technical-qc':['render'],'semantic-qc':['render','technical-qc'],
  final:['technical-qc','semantic-qc'],
};
type Dict=Record<string,unknown>;
const isObj=(x:unknown):x is Dict=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function exact(x:unknown,keys:string[]):asserts x is Dict{
  expect(isObj(x)).toBe(true);
  expect(Object.keys(x as Dict).sort()).toEqual([...keys].sort());
}
const pinned=(relative:string)=> {
  expect(Object.hasOwn(SHA,relative)).toBe(true);
  return join(ROOT,...relative.split('/'));
};
function text(relative:string){
  return readFileSync(pinned(relative),'utf8');
}
function json(relative:string):Dict{
  const value:unknown=JSON.parse(text(relative));
  expect(isObj(value)).toBe(true);
  return value as Dict;
}
function validateContract(x:unknown){
  exact(x,['schemaVersion','kind','sourceLabels','workspace','authority',
    'fixtureRefs','phases','expectedArtifactsProduced']);
  expect(x.schemaVersion).toBe('sudd-owned-static-workflow-v1');
  expect(x.kind).toBe('STATIC_DECLARATIVE_NON_EXECUTABLE');
  expect(x.sourceLabels).toEqual({
    sequence:'SOURCE_CONFIRMED',artifactShapes:'SUDD_TEST_HYPOTHESIS',friendDetails:'UNKNOWN',
  });
  expect(x.workspace).toEqual({ownership:'SUDD_TEST_HYPOTHESIS',registered:false,executed:false});
  expect(x.authority).toEqual({runner:false,provider:false,network:'none',spent:0,approvalReceipt:null});
  expect(x.expectedArtifactsProduced).toBe(false);
  expect(Array.isArray(x.fixtureRefs)).toBe(true);
  const refTypes=new Map<string,string>();
  const refs=x.fixtureRefs as unknown[];
  expect(refs.length).toBe(4);
  const fixturePaths=['fixtures/goal.json','fixtures/script.json','fixtures/scene-plan.json','fixtures/subtitles.srt'];
  for(let n=0;n<refs.length;n++){
    const f=refs[n]; exact(f,['ref','path','type']);
    expect(f.path).toBe(fixturePaths[n]);
    expect(typeof f.ref).toBe('string');
    expect((f.ref as string).startsWith('fixture:')).toBe(true);
    expect(f.type).toBe(n===3?'text/srt':'application/json');
    refTypes.set(f.ref as string,f.type as string);
  }
  expect(Array.isArray(x.phases)).toBe(true);
  expect((x.phases as unknown[]).length).toBe(10);
  const producers=new Map<string,string>();
  for(let n=0;n<IDs.length;n++){
    const phase=(x.phases as unknown[])[n];
    exact(phase,['id','dependsOn','inputs','output','actual']);
    const id=IDs[n];
    expect(phase.id).toBe(id);
    expect(phase.dependsOn).toEqual(DEPS[id]);
    expect(phase.actual).toBe('NOT_RUN');
    expect(Array.isArray(phase.inputs)).toBe(true);
    expect((phase.inputs as unknown[]).length).toBeGreaterThan(0);
    for(const input of phase.inputs as unknown[]){
      exact(input,['ref','type']);
      expect(typeof input.ref).toBe('string');
      const ref=input.ref as string;
      expect(refTypes.has(ref)).toBe(true);
      expect(input.type).toBe(refTypes.get(ref));
      if(producers.has(ref)){
        const producer=producers.get(ref)!;
        const ancestors=new Set<string>();
        const visit=(step:string)=>{
          for(const dep of DEPS[step]??[]){
            if(!ancestors.has(dep)){ancestors.add(dep);visit(dep);}
          }
        };
        visit(id);expect(ancestors.has(producer)).toBe(true);
      }
    }
    const output=phase.output;
    exact(output,['ref','type']);
    expect(typeof output.ref).toBe('string');
    expect(typeof output.type).toBe('string');
    expect(refTypes.has(output.ref as string)).toBe(false);
    expect((output.ref as string).startsWith(id+'.')).toBe(true);
    refTypes.set(output.ref as string,output.type as string);
    producers.set(output.ref as string,id);
  }
  expect((x.phases as Dict[]).at(-1)?.id).toBe('final');
}
function validateAcceptance(x:unknown){
  exact(x,['schemaVersion','kind','sourceLabels','actual','approvalReceipt',
    'checkpointReceipt','finalArtifact','futurePreset','futureAssertions','overall']);
  expect(x.schemaVersion).toBe('sudd-static-future-acceptance-v1');
  expect(x.kind).toBe('FUTURE_ACCEPTANCE_CRITERIA_ONLY');
  expect(x.sourceLabels).toEqual({
    scenario:'SOURCE_CONFIRMED',schema:'SUDD_TEST_HYPOTHESIS',friendSpecific:'UNKNOWN',
  });
  expect(x.overall).toBe('NOT_RUN');
  expect(x.approvalReceipt).toBeNull();
  expect(x.checkpointReceipt).toBeNull();
  expect(x.finalArtifact).toBeNull();
  expect(x.futurePreset).toEqual({durationMs:30000,width:1280,height:720,
    fps:30,videoCodec:'h264',audioCodec:'aac'});
  expect(isObj(x.actual)).toBe(true);
  for(const value of Object.values(x.actual as Dict))expect(value).toBe(false);
  expect(Array.isArray(x.futureAssertions)).toBe(true);
  expect((x.futureAssertions as unknown[]).length).toBe(10);
  for(const item of x.futureAssertions as unknown[]){
    exact(item,['id','requirement','status','passed']);
    expect(typeof item.id).toBe('string');
    expect(typeof item.requirement).toBe('string');
    expect(item.status).toBe('NOT_RUN');
    expect(item.passed).toBe(false);
  }
}
describe('SUD-D-owned static Test Workspace — read-only fixture',()=>{
  it('is exactly the seven approved files in non-link folders, with byte hashes',()=>{
    const dirs=[ROOT,join(ROOT,'fixtures'),join(ROOT,'expected')];
    for(const dir of dirs){
      const stat=lstatSync(dir);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
    }
    expect(readdirSync(ROOT).sort()).toEqual(['README.md','expected','fixtures','workflow-contract.json'].sort());
    expect(readdirSync(join(ROOT,'fixtures')).sort()).toEqual(['goal.json','scene-plan.json','script.json','subtitles.srt']);
    expect(readdirSync(join(ROOT,'expected'))).toEqual(['acceptance.json']);
    for(const [relative,sha] of Object.entries(SHA)){
      const path=pinned(relative);
      const stat=lstatSync(path);
      expect(stat.isFile()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(sha);
    }
    expect(Buffer.byteLength(text('README.md'),'utf8')).toBe(2944);
  });
  it('validates fixed non-executable ten-stage graph and typed references',()=>{
    validateContract(json('workflow-contract.json'));
  });
  it('confirms synthetic goal/script/scene time boundaries and text-only SRT',()=>{
    const goal=json('fixtures/goal.json');
    const script=json('fixtures/script.json');
    const scene=json('fixtures/scene-plan.json');
    expect(goal.schemaVersion).toBe('sudd-synthetic-goal-v1');
    expect(goal.synthetic).toBe(true);
    expect(goal.targetDurationMs).toBe(30000);
    expect(goal.actualMediaCreated).toBe(false);
    expect(goal.approvalReceipt).toBeNull();
    expect(script.schemaVersion).toBe('sudd-synthetic-script-v1');
    expect(scene.schemaVersion).toBe('sudd-synthetic-scene-plan-v1');
    expect(script.synthetic).toBe(true);
    expect(scene.synthetic).toBe(true);
    const segments=script.segments as Dict[];
    const scenes=scene.scenes as Dict[];
    expect(segments.length).toBe(3);
    expect(scenes.length).toBe(3);
    for(let n=0;n<3;n++){
      expect(segments[n]).toMatchObject({
        id:'segment-'+(n+1),startMs:n*10000,endMs:(n+1)*10000,
      });
      expect(scenes[n]).toMatchObject({
        segmentId:segments[n].id,startMs:segments[n].startMs,
        endMs:segments[n].endMs,assetStatus:'NOT_PRODUCED',
      });
    }
    const blocks=text('fixtures/subtitles.srt').trimEnd().split('\n\n');
    expect(blocks.length).toBe(3);
    for(let n=0;n<3;n++){
      const [index,times,spoken]=blocks[n].split('\n');
      expect(index).toBe(String(n+1));
      const timestamp=(sec:number)=>'00:00:'+String(sec).padStart(2,'0')+',000';
      expect(times).toBe(timestamp(n*10)+' --> '+timestamp((n+1)*10));
      expect(spoken).toBe(segments[n].textTh);
    }
  });
  it('does not invent Mission approval, physical media, provider or verified MP4',()=>{
    validateAcceptance(json('expected/acceptance.json'));
  });
  it('rejects missing/unknown/reordered phases and missing graph dependencies',()=>{
    const raw=json('workflow-contract.json');
    const clone=():Dict=>structuredClone(raw);
    for(const mutate of [
      (c:Dict)=>{(c.phases as Dict[])[3].id='unknown';},
      (c:Dict)=>{(c.phases as Dict[])[3].dependsOn=[];},
      (c:Dict)=>{(c.phases as Dict[])[2].inputs=[{ref:'unregistered',type:'application/json'}];},
      (c:Dict)=>{(c.phases as Dict[])[1].output={ref:'script.segments',type:'video/mp4'};},
      (c:Dict)=>{(c.phases as Dict[]).pop();},
      (c:Dict)=>{(c.phases as Dict[])[1].id='goal';},
    ]){const candidate=clone();mutate(candidate);expect(()=>validateContract(candidate)).toThrow();}
  });
  it('rejects wrong version, escaping paths and unapproved execution selectors',()=>{
    const raw=json('workflow-contract.json');
    for(const mutate of [
      (c:Dict)=>{c.schemaVersion='unknown-v2';},
      (c:Dict)=>{(c.fixtureRefs as Dict[])[0].path='../friend';},
      (c:Dict)=>{(c.phases as Dict[])[3].argv=['--fake'];},
      (c:Dict)=>{c.providerUrl='https://test.invalid';},
      (c:Dict)=>{(c.phases as Dict[])[3].actual='PASS';},
    ]){const c=structuredClone(raw);mutate(c);expect(()=>validateContract(c)).toThrow();}
    expect(()=>JSON.parse(text('workflow-contract.json')+' trailing')).toThrow();
  });
  it('rejects forged media QC, approval, artifact hash and overall PASS',()=>{
    const raw=json('expected/acceptance.json');
    for(const mutate of [
      (a:Dict)=>{(a.actual as Dict).finalMp4Verified=true;},
      (a:Dict)=>{a.approvalReceipt='fake';},
      (a:Dict)=>{a.finalArtifact={sha256:'f'.repeat(64)};},
      (a:Dict)=>{a.overall='PASS';},
      (a:Dict)=>{(a.futureAssertions as Dict[])[0].passed=true;},
      (a:Dict)=>{a.schemaVersion='v2';},
    ]){const a=structuredClone(raw);mutate(a);expect(()=>validateAcceptance(a)).toThrow();}
  });
});
