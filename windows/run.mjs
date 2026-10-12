import {createServer} from 'node:net';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {connect,localSocket,pageTarget} from '../extension/cdp.mjs';
import {buildInjection} from '../extension/payload.mjs';
import {system,discover,verifyListener,startProcess,openVerification} from './platform.mjs';
import {createPreviewServer} from './server.mjs';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const data=resolve(process.env.CODEX_STARTUP_DATA||join(root,'.windows'));
export function parseOptions(args) {
  let mode='integrated';
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--mode'&&args[i+1])mode=args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if(!['auto','splash','integrated','preview','verify','probe'].includes(mode))throw new Error('Unknown launch mode.');
  return {mode};
}
export function chooseMode(mode,running) {return mode==='auto'?(running?'splash':'integrated'):mode;}
async function freePort() {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}
async function pageList(port) {
  const response=await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1500),redirect:'error'});
  if(!response.ok)throw new Error('Debug pages are not ready.');
  const list=await response.json();if(!Array.isArray(list))throw new Error('Invalid debug target list.');return list;
}
async function inject(app) {
  const running=await system('Running',{ExePath:app.exe});
  await system('Validate',{ExePath:app.exe});
  const source=await buildInjection(root);let port;
  if(running.length) {
    const previous=await readFile(join(data,'last-run.json'),'utf8').then(JSON.parse).catch(()=>null);
    if(previous?.mode!=='integrated'||!Number.isInteger(previous.port)||!running.some(p=>p.pid===previous.pid))
      throw new Error('当前 Codex 是从旧入口启动的。请先完全退出 Codex，再双击桌面原来的 ChatGPT 图标，以加载同窗口动画和背景。');
    port=previous.port;
    try {await verifyListener(port,app.exe);}catch{throw new Error('当前 Codex 没有可用的外观接入口。请完全退出后，从桌面图标重新启动。');}
  } else {
    port=await freePort();
    await system('Launch',{ExePath:app.exe,Port:port});
  }
  const deadline=Date.now()+45000;let last='正在等待 Codex 主窗口就绪。';
  while(Date.now()<deadline) {
    let client;
    try {
      const owner=await verifyListener(port,app.exe);
      const target=(await pageList(port)).find(pageTarget);
      if(!target)throw new Error('This Codex version did not expose the supported app:// main window.');
      client=await connect(localSocket(target.webSocketDebuggerUrl,port));
      const usable=await client.call('Runtime.evaluate',{expression:'Boolean(document.body&&document.querySelector("#root")?.childElementCount)',returnByValue:true});
      if(!usable.result?.value)throw new Error('正在等待 Codex 的真实页面加载。');
      await client.call('Page.bringToFront').catch(()=>{});
      const existing=await client.call('Runtime.evaluate',{expression:'Boolean(window.__aemeathExtension)',returnByValue:true});
      if(existing.result?.value)await client.call('Runtime.evaluate',{expression:'window.__aemeathExtension?.replay?.()',returnByValue:true});
      const answer=await client.call('Runtime.evaluate',{expression:source,returnByValue:true,awaitPromise:true});
      if(answer.exceptionDetails||answer.result?.value?.installed!==true)throw new Error('Animation could not be installed.');
      for(let attempt=0;attempt<60;attempt++) {
        const result=await client.call('Runtime.evaluate',{expression:'globalThis.__aemeathExtension?.status()',returnByValue:true});
        const state=result.result?.value;
        if(state?.ready)return {port,pid:owner.pids[0],state};
        if(['failed','timeout'].includes(state?.phase))throw new Error('同窗口动画加载失败：'+(state?.error||state?.phase));
        await delay(100);
      }
      throw new Error('Animation start confirmation timed out.');
    } catch(error){last=error.message;} finally{client?.close();}
    await delay(500);
  }
  throw new Error(last);
}
async function browserAnimation(info,{preview=false,simulation=false}={}) {
  if(!info.browser)throw new Error('Microsoft Edge or Google Chrome was not found. Set CODEX_STARTUP_BROWSER to its executable.');
  const profile=join(data,simulation?'browser-profile-verification':'browser-profile');await mkdir(profile,{recursive:true});
  const host=await createPreviewServer(root,{port:simulation?18764:18763,splash:!preview,simulation});
  const port=await freePort();let client=null,verified=false,launched=false,closed=false;
  const activate=async()=>{
    if(!preview&&!launched){launched=true;await system('Activate',{ExePath:info.app.exe});}
  };
  const closeBrowser=async()=>{
    if(!client||closed)return;closed=true;
    try{await verifyListener(port,info.browser,profile);await client.call('Browser.close',{},3000);}catch{}
  };
  try {
    await startProcess(info.browser,[`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-mode',
      '--remote-debugging-address=127.0.0.1',`--remote-debugging-port=${port}`,'--window-size=1100,760',`--app=${host.url}`]);
    const deadline=Date.now()+20000;let last='Preview window is not ready.';
    while(Date.now()<deadline&&!client) {
      try {
        await verifyListener(port,info.browser,profile);verified=true;
        const target=(await pageList(port)).find(target=>target.type==='page'&&target.url===host.url);
        if(target)client=await connect(localSocket(target.webSocketDebuggerUrl,port));
      }catch(error){last=error.message;}
      if(!client)await delay(300);
    }
    if(!client)throw new Error(last);
    // The preview has its own profile and loopback debugger. Never attach to a user's browser profile.
    let ready=false, first=Date.now(),done=false;
    const lost=()=>{done=true;};
    while(!done) {
      try {
        const expression=simulation
          ? `JSON.stringify({ready:!!window.__aemeathExtension?.status().ready,completed:window.__aemeathExtension?.status().completed,dialog:window.__aemeathExtension?.status().phase==='settings',assetError:['failed','timeout'].includes(window.__aemeathExtension?.status().phase)})`
          : `JSON.stringify({ready:document.querySelector('.window')?.dataset.elapsed!==undefined,completed:document.querySelector('.window')?.dataset.completed,dialog:!!document.querySelector('#settings-dialog')?.open,assetError:document.querySelector('#asset-error')?.hidden===false})`;
        const result=await client.call('Runtime.evaluate',{expression,returnByValue:true},2500);
        const state=JSON.parse(result.result?.value||'{}');
        if(state.dialog)first=Date.now();
        if(state.assetError)throw new Error('Animation assets could not be loaded.');
        if(state.ready&&!ready){
          await client.call('Page.bringToFront');
          if(!preview)await client.call('Runtime.evaluate',{expression:'window.launcherUI.beginLaunch()',returnByValue:true});
          ready=true;console.log(preview?'预览已打开。关闭预览窗口即可退出。':'动画窗口已显示并开始播放，结束后进入 Codex。');
        }
        if(!preview&&state.completed==='true'){await closeBrowser();await activate();console.log('开场播放完成，已打开 Codex。');done=true;}
        if(!ready&&Date.now()-first>20000)throw new Error('Animation assets timed out.');
        if(!preview&&ready&&!state.dialog&&Date.now()-first>60000)throw new Error('Animation timed out.');
      } catch(error) {
        if(/连接已关闭|调试连接|WebSocket|closed|超时/.test(error.message)) {lost();if(!ready&&!preview)await activate();}
        else throw error;
      }
      if(!done)await delay(250);
    }
  } finally {
    if(verified)await closeBrowser();client?.close();await host.close();
    // Even a preview failure must not prevent opening Codex.
    await activate();
  }
}
export async function main(args=process.argv.slice(2)) {
  if(process.platform!=='win32')throw new Error('Use the Windows launcher on Windows. The original macOS launchers remain in tools/.');
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or later is required.');
  const {mode}=parseOptions(args);
  if(mode==='verify'){await openVerification();console.log('验证页已打开。');return;}
  const info=await discover();
  if(mode==='probe') {console.log(JSON.stringify({platform:process.platform,nodeVersion:process.version,...info},null,2));return;}
  if(!['preview','verify'].includes(mode)&&!info.app)throw new Error('Codex desktop was not found. Install Codex or set CODEX_STARTUP_EXE to its signed desktop executable.');
  await mkdir(data,{recursive:true});
  const selected=chooseMode(mode,!!info.running?.length);
  if(selected==='integrated') {
    try {
      const result=await inject(info.app);
      console.log('已在 Codex 窗口开始播放。Ctrl+Alt+B 打开设置。');
      console.log('本次 Codex 调试端口会保持开启；完全退出后从官方入口重开即可关闭。');
      await writeFile(join(data,'last-run.json'),JSON.stringify({mode:'integrated',port:result.port,pid:result.pid,ready:result.state.ready,wallpaper:result.state.wallpaper,time:new Date().toISOString()},null,2));return;
    } catch(error) {
      if(mode==='integrated')throw error;
      console.log('当前版本未能接入同窗口动画，改用独立动画窗口：'+error.message);
    }
  }
  const preview=['preview','verify'].includes(selected);
  try { await browserAnimation(info,{preview,simulation:selected==='verify'}); }
  catch(error) {
    if(!preview)await system('Activate',{ExePath:info.app.exe});
    throw error;
  }
  await writeFile(join(data,'last-run.json'),JSON.stringify({mode:preview?selected:'splash',time:new Date().toISOString()},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
