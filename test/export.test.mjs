import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {edgeHandler,praiseCsv} from '../src/edge.mjs';
import {homeView,reviewModal} from '../src/blocks.mjs';
test('CSV preserves Korean multiline quotes and neutralizes spreadsheet formulas',()=>{
 const csv=praiseCsv([{sender_name:'=HYPERLINK("x")',body:'고마워요\n"함께"',status:'approved',core_value:'breakthrough'}]);
 assert(csv.startsWith('\uFEFF'));
 assert(csv.includes('"\'=HYPERLINK(""x"")"'));
 assert(csv.includes('"고마워요\n""함께"""'));
 assert(csv.includes('"접수 완료"'));
 assert(!csv.includes('검토 사유'));
 assert(csv.includes('"breakthrough"'));
 assert(csv.includes('"막힘없는 해결사! · 돌파"'));
});
test('home distinguishes total submitted from approved received without revealing praise content',()=>{
 const view=JSON.stringify(homeView({eligible:true,submitted:true,status:'pending',quarter_sent:2,quarter_received:4}));
 assert(view.includes('이번 분기 내가 남긴 칭찬*\\n*2건*'));
 assert(view.includes('이번 분기 내가 받은 칭찬*\\n*4건*'));
 assert(!view.includes('People'));
});
test('review filter and pagination preserve state and avoid false next page',()=>{
 const view=reviewModal({rows:[],filter:'pending',total:120,pending:100,approved:20,next:{id:'x',created_at:'now'}});
 const elements=view.blocks.flatMap(b=>b.elements??[]);
 assert(!elements.some(x=>x.action_id==='review_filter'));
 assert.equal(JSON.parse(elements.find(x=>x.action_id==='review_next').value).filter,'all');
 assert(!reviewModal({rows:[]}).blocks.flatMap(b=>b.elements??[]).some(x=>x.action_id==='review_next'));
});
test('export download requires valid opaque ticket and sends no-store attachment',async()=>{
 let calls=0;
 const env={PUBLIC_URL:'https://example.com/thankyou',SLACK_TEAM_ID:'T159QLK7G',TOKEN_ENCRYPTION_KEY:randomBytes(32).toString('base64')};
 const handler=edgeHandler(env,()=>{},{db:async(op,data)=>{calls++;assert.equal(op,'export_download');assert.equal(data.hash.length,64);return {rows:[{body:'비공개 데이터'}]};}});
 const denied=await handler(new Request(env.PUBLIC_URL+'/exports/download?ticket=guess'));
 assert.equal(denied.status,403);assert.equal(calls,0);
 const result=await handler(new Request(env.PUBLIC_URL+'/exports/download?ticket='+'a'.repeat(64)));
 assert.equal(result.status,200);assert.equal(calls,1);
 assert(result.headers.get('content-type').startsWith('text/csv'));
 assert(result.headers.get('content-disposition').startsWith('attachment'));
 assert.equal(result.headers.get('cache-control'),'no-store');
 assert((await result.text()).includes('비공개 데이터'));
});
