import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import {request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createPreviewServer} from '../windows/server.mjs';
import {parseOptions,chooseMode} from '../windows/run.mjs';
import {buildInjection} from '../extension/payload.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
test('Windows modes respect a running Codex session',()=>{
  assert.equal(chooseMode('auto',true),'splash');
  assert.equal(chooseMode('auto',false),'integrated');
  assert.equal(chooseMode('preview',true),'preview');
  assert.deepEqual(parseOptions(['--mode','splash']),{mode:'splash'});
  assert.deepEqual(parseOptions(['--mode','verify']),{mode:'verify'});
  assert.throws(()=>parseOptions(['--mode','other']));
  assert.throws(()=>parseOptions(['--untrusted-option']));
});
test('Direct-file verification ships both required scripts and visible controls',async()=>{
  const html=await readFile(join(root,'extension/preview.html'),'utf8');
  const injection=await readFile(join(root,'extension/extension.js'),'utf8');
  const controls=await readFile(join(root,'extension/controls.js'),'utf8');
  assert.doesNotThrow(()=>new Script(injection));assert.doesNotThrow(()=>new Script(controls));
  for(const id of ['ready','settings','restore','replay-verification','verification-hint'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(injection,/__aemeathPreviewInstall/);assert.match(controls,/__aemeathPreviewInstall/);
});
test('Local server serves assets but refuses arbitrary paths, origins and writes',async()=>{
  const host=await createPreviewServer(root,{port:0,splash:true});
  try {
    const html=await fetch(host.url).then(r=>r.text());
    assert.match(html,/class="native windows-splash"/);
    assert.match(html,/connect-src 'none'/);
    assert.match(html,/src="boot-gate.js"/);
    assert.match(await fetch(new URL('boot-gate.js',host.url)).then(r=>r.text()),/AEMEATH_DEFER_PLAY=true/);
    const image=await fetch(new URL('assets/avatar.jpg',host.url));assert.equal(image.status,200);
    for(const path of ['/index.html','/windows/system.ps1','/../README.md'])assert.equal((await fetch(host.origin+path)).status,404);
    assert.equal((await fetch(new URL('windows/system.ps1',host.url))).status,404);
    assert.equal((await fetch(host.url,{method:'POST'})).status,405);
    const wrongHostStatus=await new Promise((resolve,reject)=>{
      const req=request(host.url,{headers:{host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode);});
      req.on('error',reject);req.end();
    });
    assert.equal(wrongHostStatus,403);
  }finally{await host.close();}
});
test('Injection remains valid JavaScript and mock integration assets are complete',async()=>{
  const source=await buildInjection(root);assert.doesNotThrow(()=>new Script(source));
  const host=await createPreviewServer(root,{port:0,simulation:true});
  try {
    const html=await fetch(host.url).then(r=>r.text());assert.match(html,/不是实际 Codex 界面/);
    const payload=await fetch(new URL('extension.js',host.url));assert.equal(payload.status,200);
    assert.doesNotThrow(()=>new Script(source));
    const controls=await fetch(new URL('controls.js',host.url)).then(r=>r.text());assert.match(controls,/openSettings/);
  }finally{await host.close();}
});
