import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {edgeHandler,edgeSignature,seal,unseal} from '../src/edge.mjs';
const secret='test-secret';
const env={PUBLIC_URL:'https://example.supabase.co/functions/v1/thankyou',SLACK_TEAM_ID:'T159QLK7G',SLACK_SIGNING_SECRET:secret,TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64'),INSTALL_PASSWORD:'a'.repeat(32),WORKER_SECRET:'worker-test'};
function req(path,payload){
 const body=path==='/slack/interactions'?new URLSearchParams({payload:JSON.stringify(payload)}).toString():JSON.stringify(payload);
 const timestamp=String(Math.floor(Date.now()/1000));
 return new Request(env.PUBLIC_URL+path,{method:'POST',body,headers:{'x-slack-request-timestamp':timestamp,'x-slack-signature':`v0=${createHmac('sha256',secret).update(`v0:${timestamp}:${body}`).digest('hex')}`}});
}
test('Edge WebCrypto accepts correct signature and rejects tampering',async()=>{
 const request=req('/slack/events',{type:'url_verification',challenge:'test'}),raw=await request.text();
 assert(await edgeSignature(raw,request.headers,secret));assert(!await edgeSignature(raw+'x',request.headers,secret));
 assert(!await edgeSignature(raw,request.headers,secret,Date.now()+301000));
});
test('Edge token encryption authenticates ciphertext',async()=>{
 const cipher=await seal('xoxb-secret',env.TOKEN_ENCRYPTION_KEY);
 assert.equal(await unseal(cipher,env.TOKEN_ENCRYPTION_KEY),'xoxb-secret');
 await assert.rejects(()=>unseal(cipher,randomBytes(32).toString('base64')));
});
test('Edge health and signed challenge do not require a DB call',async()=>{
 const handler=edgeHandler(env,()=>{}, {db:async()=>{throw Error('unexpected DB access');}});
 assert.equal((await handler(new Request(env.PUBLIC_URL+'/healthz'))).status,200);
 assert.equal((await handler(new Request('http://edge-runtime/thankyou/healthz'))).status,200);
 const result=await handler(req('/slack/events',{type:'url_verification',challenge:'abc'}));
 assert.deepEqual(await result.json(),{challenge:'abc'});
 assert.equal((await handler(new Request(env.PUBLIC_URL+'/slack/events',{method:'POST',body:'{}'}))).status,401);
});
test('Edge submission is private and preserves stable request ID',async()=>{
 let data;const tasks=[];
 const handler=edgeHandler(env,p=>tasks.push(p),{db:async(op,input)=>{assert.equal(op,'submit');data=input;return {id:'saved'};}});
 const result=await handler(req('/slack/interactions',{type:'view_submission',team:{id:env.SLACK_TEAM_ID},user:{id:'UTEST'},view:{id:'VRETRY',callback_id:'praise_submit',state:{values:{}}}}));
 assert.equal((await result.json()).response_action,'update');assert.equal(data.request_id,'VRETRY');assert.equal(data.user,'UTEST');await Promise.all(tasks);
});
test('Edge OAuth requires browser-bound, one-use state',async()=>{
 const handler=edgeHandler(env,()=>{}, {db:async()=>{throw Error('unexpected DB access');}});
 assert.equal((await handler(new Request(env.PUBLIC_URL+'/slack/oauth/callback?state=forged&code=x'))).status,403);
 assert.equal((await handler(new Request(env.PUBLIC_URL+'/slack/install'))).status,401);
});
test('Edge OAuth cookie path matches deployed function prefix',async()=>{
 const handler=edgeHandler(env,()=>{}, {db:async()=>({})});
 const response=await handler(new Request(env.PUBLIC_URL+'/slack/install',{headers:{authorization:`Basic ${btoa('install:'+env.INSTALL_PASSWORD)}`}}));
 assert.equal(response.status,302);assert.match(response.headers.get('set-cookie'),/Path=\/functions\/v1\/thankyou\/slack\/oauth\/callback/);
});
test('worker endpoint requires its own secret',async()=>{
 const handler=edgeHandler(env,()=>{},{});
 assert.equal((await handler(new Request(env.PUBLIC_URL+'/internal/tick',{method:'POST'}))).status,401);
});

test('monthly submission blocks the modal while an unused month remains available',async()=>{
 const cipher=await seal('test-bot',env.TOKEN_ENCRYPTION_KEY);
 for(const submitted of [true,false]){
  let opened;const tasks=[];
  const handler=edgeHandler(env,p=>tasks.push(p),{
   db:async(op)=>op==='token'?{token_cipher:cipher}:{eligible:true,submitted},
   slack:async(method,token,data)=>{opened=data.view;return {};}
  });
  const response=await handler(req('/slack/interactions',{type:'block_actions',team:{id:env.SLACK_TEAM_ID},user:{id:'UTEST'},trigger_id:'trigger',actions:[{action_id:'praise_unavailable'}]}));
  assert.equal(response.status,200);await Promise.all(tasks);
  if(submitted){
   assert.notEqual(opened.callback_id,'praise_submit');
   assert(JSON.stringify(opened).includes('이번 달에는 이미 칭찬'));
  }else assert.equal(opened.callback_id,'praise_submit');
 }
});
