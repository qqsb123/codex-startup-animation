import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verificationAssets} from './verification.mjs';

const files = new Map([
  ['index.html','text/html; charset=utf-8'],['style.css','text/css; charset=utf-8'],
  ['animation.js','text/javascript; charset=utf-8'],['image-settings.js','text/javascript; charset=utf-8'],
  ['assets/contours.js','text/javascript; charset=utf-8'],['assets/avatar.jpg','image/jpeg'],['assets/artwork.jpg','image/jpeg']
]);
export async function createPreviewServer(root,{port=18763,splash=false,simulation=false}={}) {
  const token = randomBytes(24).toString('hex');
  const prefix = `/${token}/`;
  let generated = null;
  if (simulation) {
    generated = await verificationAssets(root);
  }
  const server = createServer(async (req,res) => {
    try {
      if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
      // Local pages are served only under an unpredictable path. No arbitrary disk reads.
      if (req.headers.host !== `127.0.0.1:${server.address().port}`) {res.writeHead(403);res.end();return;}
      const url = new URL(req.url,`http://127.0.0.1:${server.address().port}`);
      if (!url.pathname.startsWith(prefix)) {res.writeHead(404);res.end();return;}
      const name = url.pathname.slice(prefix.length);
      let body, type;
      if(name==='boot-gate.js'&&splash){body='window.AEMEATH_DEFER_PLAY=true;';type='text/javascript; charset=utf-8';}
      else if (generated?.has(name)) {body=generated.get(name);type=name.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8';}
      else if (files.has(name)) {body=await readFile(join(root,name));type=files.get(name);}
      else {res.writeHead(404);res.end();return;}
      if (name==='index.html' && splash) body=body.toString().replace('<body>','<body class="native windows-splash">').replace('<script src="assets/contours.js" defer>','<script src="boot-gate.js"></script>\n  <script src="assets/contours.js" defer>');
      res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(req.method==='HEAD'?undefined:body);
    } catch {res.writeHead(500);res.end('Local preview unavailable.');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server, url:`http://127.0.0.1:${server.address().port}${prefix}${simulation?'host.html':'index.html'}`, origin:`http://127.0.0.1:${server.address().port}`,
    close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
