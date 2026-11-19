import http from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHmac,timingSafeEqual,randomBytes,webcrypto} from 'node:crypto';
import {sqliteStore,supabaseStore,ExchangeError} from './store.mjs';

const root=new URL('./public/',import.meta.url);
const random=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{let aa=Buffer.from(a??''),bb=Buffer.from(b??'');return aa.length===bb.length&&timingSafeEqual(aa,bb);};
export function signer(secret){
 const sign=data=>{let value=Buffer.from(JSON.stringify(data)).toString('base64url');return value+'.'+createHmac('sha256',secret).update(value).digest('base64url');};
 const verify=token=>{try{let [v,s,...extra]=(token??'').split('.');if(extra.length||!v||!s||!equal(s,createHmac('sha256',secret).update(v).digest('base64url')))return null;let d=JSON.parse(Buffer.from(v,'base64url'));return d.exp>Date.now()?d:null;}catch{return null;}};
 return {sign,verify};
}
export async function verifySlackToken(token,{clientId,team,nonce},request=fetch){
 let parts=(token??'').split('.');if(parts.length!==3)throw new ExchangeError('Slack 인증 응답이 올바르지 않아요.',401);
 let header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw new ExchangeError('Slack 인증 서명을 확인하지 못했어요.',401);
 let r=await request('https://slack.com/openid/connect/keys',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw new ExchangeError('Slack 인증 연결이 지연돼요.',503);let keys=await r.json(),key=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');
 if(!key)throw new ExchangeError('Slack 인증 키를 확인하지 못했어요.',401);
 let imported=await webcrypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5',imported,Buffer.from(parts[2],'base64url'),Buffer.from(parts[0]+'.'+parts[1])))throw new ExchangeError('Slack 인증 서명이 일치하지 않아요.',401);
 let now=Date.now()/1000,aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(claims.iss!=='https://slack.com'||!aud.includes(clientId)||!Number.isFinite(claims.exp)||claims.exp<now||!Number.isFinite(claims.iat)||claims.iat>now+30||!equal(claims.nonce,nonce)||claims['https://slack.com/team_id']!==team||!claims['https://slack.com/user_id'])throw new ExchangeError('Slack 로그인 정보가 만료되었거나 워크스페이스가 달라요.',401);
 return {user:claims['https://slack.com/user_id'],workspace:team};
}
export function createHandler({store,env,request=fetch}){
 const demo=env.EXCHANGE_DEMO==='1',base=env.EXCHANGE_PUBLIC_URL??'http://127.0.0.1:5000',origin=new URL(base).origin;
 const signing=signer(env.EXCHANGE_SESSION_SECRET),cookieName=demo?'ty_exchange_demo':'__Host-ty_exchange';
 const cookie=(name,value,maxAge=28800)=>`${name}=${value}; HttpOnly; ${demo?'':'Secure; '}SameSite=Lax; Path=/; Max-Age=${maxAge}`;
 const cookies=req=>Object.fromEntries((req.headers.cookie??'').split(';').map(s=>s.trim().split('=')));
 const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',...headers});res.end(JSON.stringify(data));};
 async function body(req){let chunks=[],length=0;for await(let c of req){length+=c.length;if(length>32768)throw new ExchangeError('요청이 너무 커요.',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new ExchangeError('요청 형식을 확인해주세요.');}}
 return async(req,res)=>{try{
  const url=new URL(req.url,base),path=url.pathname;
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.method==='GET'&&path==='/healthz')return json(res,200,{ok:true,mode:demo?'demo':'production'});
  if(req.method==='GET'&&path==='/preview-mobile'&&demo){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(await readFile(new URL('mobile.html',root)));return;}
  if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path)){
   let file=path==='/'?'index.html':path.slice(1);res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','content-security-policy':`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors ${demo?"'self'":"'none'"}; form-action 'self' https://slack.com`,'x-frame-options':demo?'SAMEORIGIN':'DENY','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(await readFile(new URL(file,root)));return;
  }
  if(req.method==='GET'&&path==='/auth/login'){
   if(demo)return json(res,400,{error:'테스트 계정 버튼을 사용해주세요.'});
   let state=random(),nonce=random(),target=new URL('https://slack.com/openid/connect/authorize');target.search=new URLSearchParams({response_type:'code',scope:'openid',client_id:env.SLACK_CLIENT_ID,redirect_uri:base+'/auth/callback',team:env.SLACK_TEAM_ID,state,nonce}).toString();
   res.writeHead(302,{location:target.href,'cache-control':'no-store','set-cookie':cookie('__Host-ty_exchange_auth',signing.sign({state,nonce,exp:Date.now()+600000}),600)});res.end();return;
  }
  if(req.method==='GET'&&path==='/auth/callback'){
   if(demo)return json(res,404,{error:'not_found'});
   let auth=signing.verify(cookies(req)['__Host-ty_exchange_auth']);if(!auth||!equal(auth.state,url.searchParams.get('state'))||!url.searchParams.get('code'))throw new ExchangeError('로그인을 다시 시작해주세요.',401);
   // Consume the browser-bound state before exchanging the one-use Slack code.
   res.setHeader('set-cookie',cookie('__Host-ty_exchange_auth','',0));
   let response=await request('https://slack.com/api/openid.connect.token',{method:'POST',body:new URLSearchParams({client_id:env.SLACK_CLIENT_ID,client_secret:env.SLACK_CLIENT_SECRET,grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:base+'/auth/callback'}),signal:AbortSignal.timeout(10000)});let data=await response.json();if(!response.ok||!data.ok)throw new ExchangeError('Slack 로그인을 완료하지 못했어요.',401);
   let actor=await verifySlackToken(data.id_token,{clientId:env.SLACK_CLIENT_ID,team:env.SLACK_TEAM_ID,nonce:auth.nonce},request);await store.call('snapshot',actor);
   res.writeHead(303,{location:'/', 'cache-control':'no-store','set-cookie':[cookie('__Host-ty_exchange_auth','',0),cookie(cookieName,signing.sign({...actor,csrf:random(),exp:Date.now()+28800000}))]});res.end();return;
  }
  if(req.method==='POST'&&path==='/api/demo-login'){
   if(!demo)return json(res,404,{error:'not_found'});if(req.headers.origin!==origin)throw new ExchangeError('요청 출처를 확인해주세요.',403);let d=await body(req);if(!['demo-admin','demo-member','demo-jun'].includes(d.user))throw new ExchangeError('테스트 계정을 확인해주세요.');await store.call('snapshot',{user:d.user});let session={user:d.user,csrf:random(),exp:Date.now()+28800000};return json(res,200,{ok:true},{'set-cookie':cookie(cookieName,signing.sign(session))});
  }
  let session=signing.verify(cookies(req)[cookieName]);
  if(req.method==='GET'&&path==='/api/session')return json(res,200,{authenticated:!!session,demo,csrf:session?.csrf??null});
  if(!session)throw new ExchangeError('Slack 계정으로 로그인해주세요.',401);
  if(req.method==='GET'&&path==='/api/data')return json(res,200,await store.call('snapshot',session));
  if(req.method==='GET'&&path==='/api/admin')return json(res,200,await store.call('admin',session));
  if(req.method==='POST'){
   if(req.headers.origin!==origin||!equal(req.headers['x-csrf-token'],session.csrf))throw new ExchangeError('요청 출처를 확인해주세요. 화면을 새로고침해주세요.',403);
   if(path==='/api/logout')return json(res,200,{ok:true},{'set-cookie':cookie(cookieName,'',0)});
   let ops={'/api/approve':'approve','/api/redeem':'redeem','/api/fulfill':'fulfill','/api/cancel':'cancel','/api/product-save':'product_save'},op=ops[path];if(!op)throw new ExchangeError('요청을 찾을 수 없어요.',404);let d=await body(req);
   // Session actor always wins over any submitted identity or role.
   return json(res,200,await store.call(op,{...d,user:session.user,workspace:env.SLACK_TEAM_ID}));
  }
  return json(res,404,{error:'요청을 찾을 수 없어요.'});
 }catch(e){if(!(e instanceof ExchangeError))console.error('exchange_request_failed');json(res,e instanceof ExchangeError?e.status:500,{error:e instanceof ExchangeError?e.message:'일시적인 오류예요. 잠시 후 다시 시도해주세요.'});}};
}
export async function start(env=process.env){
 const demo=env.EXCHANGE_DEMO==='1';
 if(demo&&env.NODE_ENV==='production')throw Error('Demo cannot run in production');
 if(!demo&&(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SLACK_CLIENT_ID||!env.SLACK_CLIENT_SECRET||!env.SLACK_TEAM_ID||!env.EXCHANGE_PUBLIC_URL?.startsWith('https://')||!env.EXCHANGE_SESSION_SECRET||env.EXCHANGE_SESSION_SECRET.length<32))throw Error('Configure production server secrets, Slack OIDC and HTTPS public URL first');
 let store;if(demo&&env.SUPABASE_URL){const ref=env.EXCHANGE_DEV_PROJECT_REF;if(!ref||new URL(env.SUPABASE_URL).hostname!==ref+'.supabase.co'||!env.SUPABASE_SERVICE_ROLE_KEY||!env.SLACK_TEAM_ID)throw Error('Demo login with Supabase is allowed only for the dev project named in EXCHANGE_DEV_PROJECT_REF');store=supabaseStore(env);}else if(demo){await mkdir(new URL('./.data/',import.meta.url),{recursive:true});store=sqliteStore(fileURLToPath(new URL('./.data/demo.sqlite',import.meta.url)),{seed:true,history:true});}else store=supabaseStore(env);
 let config={...env,EXCHANGE_SESSION_SECRET:env.EXCHANGE_SESSION_SECRET??random()},server=http.createServer(createHandler({store,env:config}));server.requestTimeout=20000;server.headersTimeout=10000;
 const port=Number(env.EXCHANGE_PORT??5000);await new Promise(resolve=>server.listen(port,env.EXCHANGE_HOST??(demo?'127.0.0.1':'0.0.0.0'),resolve));console.log(`Exchange ready: ${env.EXCHANGE_PUBLIC_URL??'http://127.0.0.1:'+port} (${demo?'fictional demo':'production'})`);return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await start();
