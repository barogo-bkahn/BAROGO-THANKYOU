import test from 'node:test';
import assert from 'node:assert/strict';
import {homeView,praiseModal} from '../src/blocks.mjs';
test('personal points direction and neutral CTAs are grouped in one row',()=>{
 const v=homeView({eligible:true,submitted:true,admin:true},{user:'UTEST',testUser:'UTEST',testUrl:'http://127.0.0.1:7341'}),s=JSON.stringify(v);
 assert(!s.includes('팀의 간식'));assert(!s.includes('한 달에 한 번'));assert(!s.includes('이번 달'));
 assert(s.includes('월별 횟수 제한은 없어요'));assert(s.includes('지급 승인 후'));assert(s.includes('개인'));assert(s.includes('테스트 준비 중'));
 const a=v.blocks.filter(x=>x.type==='actions');assert.equal(a.length,1);
 assert.deepEqual(a[0].elements.map(x=>x.action_id),['praise_open','exchange_open','home_refresh','review_open','scores_open']);
 assert(a[0].elements.every(x=>!x.style));
 assert.equal(praiseModal().blocks.find(x=>x.block_id==='recipient').label.text,'칭찬할 동료');
 assert(v.blocks.every(x=>JSON.stringify(x).length<3000));
});
test('ordinary users cannot see private admin actions or another user test link',()=>{
 const v=homeView({eligible:true,admin:false},{user:'UOTHER',testUser:'UTEST',testUrl:'http://127.0.0.1:7341'}),a=v.blocks.flatMap(b=>b.elements??[]);
 assert(!a.some(x=>['review_open','scores_open','exchange_open'].includes(x.action_id)));
});
