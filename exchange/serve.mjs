// Local exchange server launcher (127.0.0.1:5000 only).
// node exchange/serve.mjs [start|dev|status|stop]
//  lan: dev backend reachable from the same network at http://<this PC IP>:5000 (needs a Windows firewall rule).
//  start (default): fictional sqlite demo.  dev: same UI backed by the Supabase DEV project (.env.dev).
// Never touches production Supabase.
import {spawn,execSync} from 'node:child_process';
import {openSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';
const root=fileURLToPath(new URL('..',import.meta.url)),data=fileURLToPath(new URL('./.data/',import.meta.url)),url='http://127.0.0.1:5000/';
const healthy=async()=>{try{return (await fetch(url+'healthz',{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}};
const cmd=process.argv[2]??'start';
function stop(){
 const out=execSync('netstat -ano',{encoding:'utf8'}).split('\n').find(l=>/:5000\s/.test(l)&&l.includes('LISTENING'));
 if(!out)return false;const pid=out.trim().split(/\s+/).pop();
 const info=execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`,{encoding:'utf8'});
 if(!/exchange[\/]demo\.mjs/.test(info))throw Error('5000 is used by another program; not stopping it.');
 process.kill(Number(pid));return true;
}
if(cmd==='status'){console.log(await healthy()?'RUNNING '+url:'STOPPED');process.exit(0);}
if(cmd==='stop'){try{stop();console.log('STOPPED');}catch(e){console.error(e.message);process.exit(1);}process.exit(0);}
const lan=cmd==='lan',dev=cmd==='dev'||lan;
const lanIp=()=>Object.values(networkInterfaces()).flat().find(i=>i.family==='IPv4'&&!i.internal&&/^(10.|192.168.|172.(1[6-9]|2d|3[01]).)/.test(i.address))?.address;
const ip=lan?lanIp():null;if(lan&&!ip){console.error('No private network address found.');process.exit(1);}
if(dev&&!existsSync(new URL('./.env.dev',import.meta.url))){console.error('exchange/.env.dev not found');process.exit(1);}
if(await healthy()){
 if(!dev){console.log('ALREADY RUNNING '+url);process.exit(0);}
 try{stop();}catch(e){console.error(e.message);process.exit(1);} // restart on the dev backend
 await new Promise(r=>setTimeout(r,800));
}
mkdirSync(data,{recursive:true});
const args=dev?['--env-file=exchange/.env.dev','exchange/demo.mjs']:['exchange/demo.mjs'];
const env={...process.env,...(dev?{EXCHANGE_PORT:'5000',EXCHANGE_PUBLIC_URL:lan?'http://'+ip+':5000':'http://127.0.0.1:5000',...(lan?{EXCHANGE_HOST:'0.0.0.0'}:{})}:{})};
const child=spawn(process.execPath,args,{cwd:root,env,detached:true,stdio:['ignore',openSync(data+'server.log','a'),openSync(data+'server-error.log','a')],windowsHide:true});child.unref();
for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,500));if(await healthy()){console.log((lan?'STARTED (dev Supabase, LAN) http://'+ip+':5000/  local '+url:(dev?'STARTED (dev Supabase) ':'STARTED ')+url));process.exit(0);}}
console.error('Server did not start. See exchange/.data/server-error.log');process.exit(1);
