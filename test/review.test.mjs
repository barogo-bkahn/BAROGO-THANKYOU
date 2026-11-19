import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewModal} from '../src/blocks.mjs';
test('all historical statuses are read-only submissions with no decisions',()=>{
 const rows=['pending','approved','rejected','submitted'].map((status,i)=>({id:String(i),status,can_review:true,sender_name:'작성자',recipient_name:'수신자',body:'전체 접수 테스트',core_value:'growth'}));
 const view=reviewModal({rows,total:4});
 assert.equal(view.title.text,'비공개 접수함');
 assert.equal(view.blocks.filter(b=>b.text?.text==='접수 완료 · 조회 전용').length,4);
 assert(!view.blocks.flatMap(b=>b.elements??[]).some(e=>['approve_open','reject_open','review_filter'].includes(e.action_id)));
});
