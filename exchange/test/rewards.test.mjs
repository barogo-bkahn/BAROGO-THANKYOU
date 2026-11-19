import test from 'node:test';
import assert from 'node:assert/strict';
import {rankAwards,CATALOG} from '../rewards.mjs';
import {sqliteStore} from '../store.mjs';
test('first place buys a full day; equipment needs 2-3 upper-tier quarters',()=>{
 let rows=rankAwards(Array.from({length:12},(_,i)=>({employee:'u'+i,final:100-i})));
 assert.deepEqual(rows.map(x=>x.points),[30000,25000,25000,20000,20000,10000,10000,10000,10000,10000,0,0]);
 assert.equal(CATALOG.find(x=>x.id==='leave-half').price,rows[0].points);
 for(let id of ['keyboard-mouse','privacy-filter']){let cost=CATALOG.find(x=>x.id===id).price;assert.equal(cost,50000);assert(rows[0].points*2>=cost);assert.equal(rows[1].points*2,cost);assert(rows[3].points*2<cost);assert(rows[3].points*3>=cost);}
});
test('ties receive same competition rank and points; no qualitative evidence is held',()=>{
 let r=rankAwards([{employee:'a',final:80},{employee:'b',final:80},{employee:'c',final:70},{employee:'d',final:null}]);
 assert.deepEqual(r.map(x=>[x.rank,x.points]),[[1,30000],[1,30000],[3,25000],[null,0]]);
});
test('rank-based demo credits only on approval and preserves past orders',()=>{
 let s=sqliteStore(':memory:',{seed:true});try{let before=s.call('snapshot',{user:'demo-admin'}),q=before.settlements[0];assert.equal(q.points,30000);assert.equal(q.rank,1);assert.equal(q.scheme,'rank_v2');assert.equal(before.balance,3500);assert.equal(before.orders[0].cost,1500);assert.equal(before.products.length,CATALOG.length);
 s.call('approve',{user:'demo-admin',id:q.id,version:q.version});assert.equal(s.call('snapshot',{user:'demo-admin'}).balance,33500);s.call('approve',{user:'demo-admin',id:q.id,version:q.version});assert.equal(s.call('snapshot',{user:'demo-admin'}).balance,33500);
 s.call('redeem',{user:'demo-admin',product:'leave-half',request_id:'full-day-reward-test'});assert.equal(s.call('snapshot',{user:'demo-admin'}).balance,3500);
 }finally{s.close();}
});
