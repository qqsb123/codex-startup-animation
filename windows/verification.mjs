import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildInjection} from '../extension/payload.mjs';

// HTTP preview and direct-file preview both use this complete verification page.
export async function verificationAssets(root) {
  const source=await buildInjection(root);
  return new Map([
    ['host.html',await readFile(join(root,'extension/preview.html'),'utf8')],
    ['extension.js',`window.__aemeathPreviewInstall=()=>${source};\nwindow.__aemeathPreviewInstall();\n`],
    ['controls.js',`document.querySelector('#restore').onclick=()=>window.__aemeathExtension?.dispose();
document.querySelector('#settings').onclick=()=>{if(!window.__aemeathExtension){document.querySelector('#verification-hint').textContent='外观已恢复。点击「重播验证」后，可重新打开设置。';return;}window.__aemeathExtension.openSettings();};
document.querySelector('#ready').onclick=e=>e.target.textContent='点击成功';
document.querySelector('#replay-verification').onclick=()=>{window.__aemeathExtension?.dispose();window.__aemeathPreviewInstall();document.querySelector('#verification-hint').textContent='正在验证动画，播放结束后背景会保留。';};\n`]
  ]);
}
