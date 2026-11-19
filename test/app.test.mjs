import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {verifySlack,encrypt,decrypt,kstPeriod} from '../src/security.mjs';
import {createApp} from '../src/server.mjs';
import {homeView,praiseModal} from '../src/blocks.mjs';
import {Readable} from 'node:stream';
const secret='test-signing-secret', now=Date.now(), ts=String(Math.floor(now/1000));
function signed(body,time=ts){return {'x-slack-request-timestamp':time,'x-slack-signature':`v0=${createHmac('sha256',secret).update(`v0:${time}:${body}`).digest('hex')}`};}
test('raw-body signature rejects tampering and stale requests',()=>{
 const raw='a=%20&b=1'; assert(verifySlack(raw,signed(raw),secret,now));
 assert(!verifySlack(raw+'x',signed(raw),secret,now));
 assert(!verifySlack(raw,signed(raw,String(Number(ts)-301)),secret,now));
 assert(!verifySlack(raw,{'x-slack-request-timestamp':'NaN'},secret,now));
});
test('encrypted token is authenticated and needs correct key',()=>{
 const key=randomBytes(32).toString('base64'), sealed=encrypt('xoxb-private',key);
 assert.equal(decrypt(sealed,key),'xoxb-private');
 assert(!sealed.includes('xoxb'));
 assert.throws(()=>decrypt(sealed,randomBytes(32).toString('base64')));
});
test('KST month and quarter boundary',()=>{
 assert.deepEqual(kstPeriod(new Date('2026-03-31T14:59:59Z')),{month:'2026-03',quarter:'2026-Q1'});
 assert.deepEqual(kstPeriod(new Date('2026-03-31T15:00:00Z')),{month:'2026-04',quarter:'2026-Q2'});
});
test('home exposes no recipient inbox and no admin action for ordinary employee',()=>{
 const view=JSON.stringify(homeView({eligible:true,submitted:false,admin:false}));
 assert(view.includes('praise_open')); assert(!view.includes('review_open')); assert(!view.includes('scores_open'));
 assert.equal(praiseModal().blocks.find(b=>b.block_id==='value').element.options.length,6);
});
async function fixture(t,db){
 const app=createApp({PUBLIC_URL:'https://example.com',SLACK_TEAM_ID:'T159QLK7G',SLACK_SIGNING_SECRET:secret},{db,slack:async()=>{throw Error('Unexpected Slack outbound call');}});
 t.after(()=>app.emit('close'));
 // Exercise the actual HTTP handler in-process; no sockets required.
 return async(path,options={})=>new Promise(resolve=>{
   const req=Readable.from(options.body?[Buffer.from(options.body)]:[]);
   req.method=options.method??'GET';req.url=path;req.headers=options.headers??{};
   const res={writableEnded:false,writeHead(code){this.status=code;},end(body){this.writableEnded=true;resolve({status:this.status,json:async()=>JSON.parse(body)});}};
   app.emit('request',req,res);
 });
}
test('invalid signatures cannot touch DB',async t=>{
 let calls=0;const url=await fixture(t,async()=>{calls++;});
 const response=await url('/slack/events',{method:'POST',body:'{}'});
 assert.equal(response.status,401);assert.equal(calls,0);
});
test('other workspace blocked before database access',async t=>{
 let calls=0;const url=await fixture(t,async()=>{calls++;});
 const body=JSON.stringify({team_id:'TOTHER',event:{type:'app_home_opened'}});
 const response=await url('/slack/events',{method:'POST',body,headers:signed(body)});
 assert.equal(response.status,403);assert.equal(calls,0);
});
test('submission actor comes from signed envelope and stable view id is idempotency key',async t=>{
 let received;const url=await fixture(t,async(op,data)=>{assert.equal(op,'submit');received=data;return {id:'saved'};});
 const payload={type:'view_submission',team:{id:'T159QLK7G'},user:{id:'UGIVER'},view:{id:'VSTABLE',callback_id:'praise_submit',state:{values:{recipient:{value:{selected_user:'URECEIVER'}},value:{value:{selected_option:{value:'growth'}}},body:{value:{value:'a'.repeat(25)}}}}}};
 const body=new URLSearchParams({payload:JSON.stringify(payload)}).toString();
 const response=await url('/slack/interactions',{method:'POST',body,headers:signed(body)});
 assert.equal((await response.json()).response_action,'update');
 assert.equal(received.user,'UGIVER');assert.equal(received.request_id,'VSTABLE');
});
test('DB rejection keeps submission open with private validation error',async t=>{
 const url=await fixture(t,async()=>{const {SafeError}=await import('../src/clients.mjs');throw new SafeError('다른 팀 동료만 추천할 수 있습니다.');});
 const payload={type:'view_submission',team:{id:'T159QLK7G'},user:{id:'U1'},view:{id:'V1',callback_id:'praise_submit',state:{values:{}}}};
 const body=new URLSearchParams({payload:JSON.stringify(payload)}).toString();
 const response=await url('/slack/interactions',{method:'POST',body,headers:signed(body)});
 const result=await response.json();assert.equal(result.response_action,'errors');assert.match(result.errors.body,/다른 팀/);
});
test('OAuth callback cannot proceed without matching state cookie',async t=>{
 let calls=0;const url=await fixture(t,async()=>{calls++;});
 const response=await url('/slack/oauth/callback?state=forged&code=bad');
 assert.equal(response.status,403);assert.equal(calls,0);
});
