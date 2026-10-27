import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCompatibility, parseNvidiaSmi} from '../src/cuda-core.mjs';
import {initCuda} from '../src/app.js';

const data=JSON.parse(readFileSync(new URL('../src/data.json',import.meta.url),'utf8'));
const dictionary=JSON.parse(readFileSync(new URL('../src/messages.json',import.meta.url),'utf8'));
const languages=['ko','en','es','zh','ja','de'];

test('every profile stays conditional, never full compatibility, on recent drivers',()=>{
  for(const profile of data.profiles) for(const os of ['windows','linux']) {
    const r=evaluateCompatibility({profileId:profile.id,os,driverVersion:'615.88.01',installedToolkit:'10.2'},data);
    assert.equal(r.status,'conditional');
    assert.equal(r.code,'DRIVER_MINIMUM_MET_ONLY');
    assert.equal(r.runtimeVersion,profile.cuda);
    assert.equal(r.installedToolkit,'10.2');
    assert.equal(r.command,null);
    assert.equal(r.autoDetected,false);
    assert.ok(r.unresolved.includes('GPU_ARCHITECTURE_UNVERIFIED'));
    assert.ok(r.unresolved.includes('APPLICATION_FEATURES_UNVERIFIED'));
    if(profile.kind==='pytorch-wheel') assert.ok(r.unresolved.includes('PYTHON_WHEEL_UNVERIFIED'));
  }
});

test('13.0 retains release-baseline classification instead of absolute minimum claim',()=>{
  for(const profile of data.profiles.filter(p=>p.cuda==='13.0')) {
    for(const [os,baseline,below] of [['windows','580.88','580.87'],['linux','580.65.06','580.65.05']]) {
      const at=evaluateCompatibility({profileId:profile.id,os,driverVersion:baseline},data);
      const under=evaluateCompatibility({profileId:profile.id,os,driverVersion:below},data);
      assert.equal(at.minimumKind,'verified-release-baseline');
      assert.equal(at.status,'conditional');
      assert.equal(under.code,'DRIVER_BELOW_MINIMUM');
    }
  }
});

test('all six dictionaries cover result/error/unresolved and limitation labels',()=>{
  const required=['conditional','driver-too-old','unknown','unsupported','baselineNotice','minorNotice',
    'limitedNotice','layersNotice','noCommandNotice','SMI_PARSED','SMI_INVALID_DRIVER',
    'SMI_AMBIGUOUS_DRIVER','GPU_ARCHITECTURE_UNVERIFIED','PYTHON_WHEEL_UNVERIFIED'];
  for(const lang of languages) for(const key of required) assert.ok(dictionary[lang][key]?.trim(),`${lang}:${key}`);
});

test('nvidia-smi label parsing rejects conflicting driver evidence and tool-only numbers',()=>{
  assert.equal(parseNvidiaSmi('| NVIDIA-SMI 580.88 | CUDA Version: 13.0 |').ok,false);
  const bad=parseNvidiaSmi('Driver Version: 580.88\nDriver Version: 551.61\nCUDA Version: 13.0');
  assert.equal(bad.ok,false);
  assert.equal(bad.code,'SMI_AMBIGUOUS_DRIVER');
  assert.equal(bad.driverVersion,null);
});

function element(value='') {
  return {value,textContent:'',dataset:{},handlers:{},children:[],options:[],
    addEventListener(name,fn){this.handlers[name]=fn;},
    append(child){this.children.push(child);},
    replaceChildren(){this.children=[];},
  };
}
function fakeRoot(lang='en') {
  const map=new Map();
  for(const id of ['app-config','status','copy-code','cuda-form','profile','driver-version',
    'driver-max-cuda','cuda-result','parse-smi','smi-output','os','installed-toolkit']) map.set('#'+id,element());
  const ui={unknown:'Unknown',notProvided:'Not provided',driver:'Driver',copied:'Copied',copyFailed:'Copy failed'};
  map.get('#app-config').textContent=JSON.stringify({ui,messages:dictionary[lang],dataURL:'/data.json'});
  map.get('#profile').options=data.profiles.map(p=>({value:p.id}));
  map.get('#profile').value='cuda-13-0';
  map.get('#os').value='windows';
  return {map,querySelector:q=>map.get(q)||null,querySelectorAll:()=>[],createElement:()=>element(),documentElement:{classList:{add(){}}}};
}
async function withUI(fn) {
  const oldFetch=globalThis.fetch,oldLocation=globalThis.location;
  globalThis.fetch=async()=>({ok:true,json:async()=>data});
  globalThis.location=new URL('https://local.test/en/');
  try{const root=fakeRoot();await initCuda(root);await fn(root);}finally{
    globalThis.fetch=oldFetch;
    if(oldLocation===undefined) delete globalThis.location; else globalThis.location=oldLocation;
  }
}

test('UI renders conditional limits and the 13.0 baseline after numeric comparison',async()=>{
  await withUI(async root=>{
    root.map.get('#driver-version').value='580.88';
    root.map.get('#cuda-form').handlers.submit({preventDefault(){}});
    const strings=root.map.get('#cuda-result').children.map(e=>e.textContent);
    assert.ok(strings.includes(dictionary.en.conditional));
    assert.ok(strings.includes(dictionary.en.baselineNotice));
    assert.ok(strings.includes(dictionary.en.limitedNotice));
    assert.ok(strings.includes(dictionary.en.layersNotice));
  });
});

test('failed reparse cannot reuse an earlier successful pasted driver as current evidence',async()=>{
  await withUI(async root=>{
    root.map.get('#smi-output').value='Driver Version: 580.88\nCUDA Version: 13.0';
    root.map.get('#parse-smi').handlers.click();
    assert.equal(root.map.get('#driver-version').value,'580.88');
    root.map.get('#smi-output').value='Driver Version: 580.88\nDriver Version: 551.61\nCUDA Version: 13.0';
    root.map.get('#parse-smi').handlers.click();
    assert.equal(root.map.get('#status').textContent,dictionary.en.SMI_AMBIGUOUS_DRIVER);
    assert.equal(root.map.get('#driver-version').value,'','Failed parsing must invalidate the previous auto-filled driver');
    assert.equal(root.map.get('#driver-max-cuda').textContent,'Unknown');
  });
});

test('failed parsing preserves a separately edited manual version but drops pasted capability',async()=>{
  await withUI(async root=>{
    root.map.get('#smi-output').value='Driver Version: 580.88\nCUDA Version: 13.0';
    root.map.get('#parse-smi').handlers.click();
    root.map.get('#driver-version').value='551.61';
    root.map.get('#driver-version').handlers.input();
    root.map.get('#smi-output').value='NVIDIA-SMI 580.88';
    root.map.get('#parse-smi').handlers.click();
    assert.equal(root.map.get('#driver-version').value,'551.61');
    assert.equal(root.map.get('#driver-max-cuda').textContent,'Unknown');
  });
});
