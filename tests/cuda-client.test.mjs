import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class Element {
  constructor({value='',dataset={},text=''}={}) { this.value=value; this.dataset=dataset; this.textContent=text; this.hidden=false; this.children=[]; this.handlers={}; this.options=[]; }
  addEventListener(name,callback) { this.handlers[name]=callback; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=[...nodes]; }
  focus() { this.focused=true; }
  fire(name) { return this.handlers[name]?.({preventDefault(){}}); }
}
function fixture(config, selectors={}) {
  const classes=new Set();
  const elements={'#app-config':new Element({text:JSON.stringify(config)}),'#status':new Element(),...selectors};
  for (const [selector,element] of Object.entries(elements)) if (selector.startsWith('#')) element.id=selector.slice(1);
  return {elements,documentElement:{classList:{add(value){classes.add(value);},contains(value){return classes.has(value);}}},
    querySelector(selector){return elements[selector]||null;},querySelectorAll(selector){return selector==='[data-record]'?(elements.cards||[]):selector.endsWith('form button')?(elements.formButtons||[]):[];},
    createElement(tag){const node=new Element(); node.tagName=tag; return node;}};
}
const ui={copied:'Copied',copyFailed:'Copy failed',results:'Results: {n}',unknown:'Unknown',notProvided:'Not provided',loadFailed:'Load failed',loading:'Loading',namespace:'Namespace',vendorId:'Vendor',deviceId:'Device',manufacturer:'Manufacturer',architecture:'Architecture',brand:'Brand',details:'Details',driver:'Driver'};
async function client(name) {
  let source=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
  source=source.replace("'./core.mjs'",JSON.stringify(new URL('../src/core.mjs',import.meta.url).href));
  for(const core of ['device-core.mjs','cuda-core.mjs']) source=source.replace(`'./${core}'`,JSON.stringify(new URL('../src/'+core,import.meta.url).href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
function mockGlobal(name,value) {
  const before=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  return ()=>before?Object.defineProperty(globalThis,name,before):delete globalThis[name];
}
const allText=node=>[node.textContent,...node.children.map(allText)].join(' ');

test('CUDA client shows limited conditions, official links and safe hash selection',async()=>{
  const data=JSON.parse(await readFile(new URL('../src/data.json',import.meta.url),'utf8'));
  const messages=JSON.parse(await readFile(new URL('../src/messages.json',import.meta.url),'utf8')).en;
  const restores=[mockGlobal('location',{href:'https://example.test/en/',origin:'https://example.test',hash:'#cuda-13-0'}),mockGlobal('fetch',async()=>({ok:true,json:async()=>data}))];
  try {
    const {initCuda}=await client('cuda-app.js');
    const profile=new Element({value:'cuda-11-8'}); profile.options=data.profiles.map(({id})=>({value:id}));
    const submit=new Element();submit.disabled=true;
    const root=fixture({ui,messages,dataURL:'../data.json'},{'#cuda-form':new Element(),'#profile':profile,'#os':new Element({value:'windows'}),'#driver-version':new Element({value:'999.99'}),'#installed-toolkit':new Element(),'#cuda-result':new Element(),'#driver-max-cuda':new Element(),'#parse-smi':new Element(),'#smi-output':new Element(),formButtons:[submit]});
    root.elements['#status'].textContent=ui.loading;
    await initCuda(root); assert.equal(profile.value,'cuda-13-0');
    assert.equal(root.elements['#status'].textContent,'');
    assert.equal(submit.disabled,false);
    root.elements['#cuda-form'].fire('submit'); let text=allText(root.elements['#cuda-result']);
    for(const expected of [messages.conditional,messages.baselineNotice,messages.layersNotice,messages.GPU_ARCHITECTURE_UNVERIFIED]) assert(text.includes(expected));
    assert(root.elements['#cuda-result'].children.some(node=>node.href==='https://www.nvidia.com/en-us/drivers/'));
    profile.value='cuda-12-4';root.elements['#cuda-form'].fire('submit'); assert(allText(root.elements['#cuda-result']).includes(messages.minorNotice));
    root.elements['#smi-output'].value='Driver Version: 580.88 CUDA Version: 13.0'; root.elements['#parse-smi'].fire('click');
    assert.equal(root.elements['#driver-version'].value,'580.88');assert.equal(root.elements['#driver-max-cuda'].textContent,'13.0');
    root.elements['#smi-output'].value='Driver Version: invalid CUDA Version: 99.0';root.elements['#parse-smi'].fire('click');
    assert.equal(root.elements['#driver-version'].value,'');assert.equal(root.elements['#driver-max-cuda'].textContent,'Unknown');
    root.elements['#driver-version'].value='580.99';root.elements['#driver-version'].fire('input');root.elements['#parse-smi'].fire('click');
    assert.equal(root.elements['#driver-version'].value,'580.99');
    root.elements['#driver-version'].fire('input');assert.equal(root.elements['#driver-max-cuda'].textContent,'Unknown');
    location.hash='#not-a-profile'; profile.value='cuda-11-8'; await initCuda(root);assert.equal(profile.value,'cuda-11-8');
  } finally {restores.reverse().forEach(restore=>restore());}
});

test('CUDA detail page initializes without controls or data fetch',async()=>{
  const restore=mockGlobal('fetch',()=>{throw Error('Detail page fetched data');});
  try {
    const module=await client('cuda-app.js'),root=fixture({ui,messages:{}});
    await module.initCuda(root);
    assert(root.documentElement.classList.contains('app-ready'));
  } finally {restore();}
});

test('CUDA rejects cross-origin static data before fetching or enabling controls',async()=>{
  let fetchCount=0;
  const restores=[mockGlobal('location',{href:'https://example.test/en/',origin:'https://example.test',hash:''}),mockGlobal('fetch',()=>{fetchCount++;throw Error('Unexpected fetch');})];
  try {
    const module=await client('cuda-app.js'),button=new Element();button.disabled=true;
    const root=fixture({ui,messages:{},dataURL:'https://other.test/data.json'},{'#cuda-form':new Element(),formButtons:[button]});
    await assert.rejects(module.initCuda(root),/DATA_ORIGIN/);
    assert.equal(button.disabled,true);assert(!root.documentElement.classList.contains('app-ready'));
    assert.equal(fetchCount,0);
  } finally {restores.reverse().forEach(restore=>restore());}
});
