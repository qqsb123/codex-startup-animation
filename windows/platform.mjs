import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const execute = promisify(execFile);
const script = join(dirname(fileURLToPath(import.meta.url)), 'system.ps1');
const powershell = join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
export async function system(action, values = {}) {
  const args = ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Action',action];
  for (const [key,value] of Object.entries(values)) if (value !== undefined && value !== null && value !== '') args.push(`-${key}`, String(value));
  const {stdout} = await execute(powershell, args, {windowsHide:true, timeout:20000, maxBuffer:1024*1024, encoding:'utf8'});
  return JSON.parse(stdout.replace(/^\uFEFF/,'').trim());
}
export function startProcess(exe, args) {
  return new Promise((resolve,reject) => {
    const child = spawn(exe,args,{detached:true,stdio:'ignore',windowsHide:false});
    child.once('error',reject);
    child.once('spawn',()=>{child.unref();resolve(child.pid);});
  });
}
export const discover = () => system('Discover');
export const verifyListener = (port, exe, profile) => system('Listener',{Port:port,ExePath:exe,ProfilePath:profile});
export async function openVerification() {
  await execute(powershell,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(dirname(script),'open-verification.ps1')],
    {windowsHide:true,timeout:20000,maxBuffer:1024*1024,encoding:'utf8'});
}
