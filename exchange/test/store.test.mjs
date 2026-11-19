import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteStore} from '../store.mjs';
import {signer,createHandler} from '../server.mjs';
import http from 'node:http';

const seeded=()=>sqliteStore(':memory:',{seed:true,rewards:false});
test('pending points cannot be spent; approval credits exact 50:50 award only once',()=>{let s=seeded();try{let before=s.call('snapshot',{user:'demo-admin'});assert.equal(before.balance,3500);assert.equal(before.settlements[0].points,6500);assert.throws(()=>s.call('redeem',{user:'demo-admin',product:'movie',request_id:'pending-request-123'}),/부족/);assert.throws(()=>s.call('approve',{user:'demo-member',id:'2026-Q3-v1',version:1}),/관리자/);assert.throws(()=>s.call('approve',{user:'demo-admin',id:'2026-Q3-v1',version:2}),/버전/);s.call('approve',{user:'demo-admin',id:'2026-Q3-v1',version:1});assert.equal(s.call('snapshot',{user:'demo-admin'}).balance,10000);s.call('approve',{user:'demo-admin',id:'2026-Q3-v1',version:1});assert.equal(s.call('snapshot',{user:'demo-admin'}).balance,10000);assert.equal(s.call('snapshot',{user:'demo-yun'}).balance,5000);}finally{s.close();}});
test('redeem replays are idempotent; cancellation refunds exactly once and admin totals reconcile',()=>{let s=seeded();try{let d={user:'demo-member',product:'snack',request_id:'idempotent-request-001'},a=s.call('redeem',d);s.call('redeem',d);assert.equal(s.call('snapshot',{user:d.user}).balance,2500);assert.throws(()=>s.call('redeem',{...d,product:'coffee'}),/이미 사용/);assert.throws(()=>s.call('cancel',{user:d.user,id:a.order.id}),/관리자/);s.call('cancel',{user:'demo-admin',id:a.order.id});assert.equal(s.call('snapshot',{user:d.user}).balance,5000);assert.throws(()=>s.call('cancel',{user:'demo-admin',id:a.order.id}),/이미 처리/);let ad=s.call('admin',{user:'demo-admin'});assert.equal(ad.employees.reduce((n,e)=>n+e.balance,0),ad.ledger.reduce((n,l)=>n+l.amount,0));}finally{s.close();}});
test('multiple requests never overspend, completed orders cannot refund and roles are server enforced',()=>{let s=seeded();try{for(let i=0;i<3;i++)s.call('redeem',{user:'demo-member',product:'coffee',request_id:`concurrent-test-${i}`});assert.throws(()=>s.call('redeem',{user:'demo-member',product:'coffee',request_id:'concurrent-test-last'}),/부족/);assert.equal(s.call('snapshot',{user:'demo-member'}).balance,500);assert.throws(()=>s.call('admin',{user:'demo-member',admin:true}),/관리자/);assert.throws(()=>s.call('snapshot',{user:'unregistered'}),/활성 직원/);let o=s.call('snapshot',{user:'demo-member'}).orders[0];s.call('fulfill',{user:'demo-admin',id:o.id});assert.throws(()=>s.call('cancel',{user:'demo-admin',id:o.id}),/이미 처리/);}finally{s.close();}});
test('sessions reject tampering and expiry',()=>{let s=signer('test-secret');let token=s.sign({user:'u',exp:Date.now()+10000});assert.equal(s.verify(token).user,'u');assert.equal(s.verify(token+'a'),null);assert.equal(s.verify(s.sign({exp:Date.now()-1})),null);});
test('HTTP authentication, CSRF, ID spoofing and non-admin approvals',async()=>{let store=seeded(),env={EXCHANGE_DEMO:'1',EXCHANGE_SESSION_SECRET:'test-secret',EXCHANGE_PUBLIC_URL:'http://127.0.0.1:7341'};let server=http.createServer(createHandler({store,env}));await new Promise(r=>server.listen(0,'127.0.0.1',r));let base=`http://127.0.0.1:${server.address().port}`;try{assert.equal((await fetch(base+'/api/admin')).status,401);let login=await fetch(base+'/api/demo-login',{method:'POST',headers:{origin:env.EXCHANGE_PUBLIC_URL,'content-type':'application/json'},body:JSON.stringify({user:'demo-member'})});assert.equal(login.status,200);let cookie=login.headers.get('set-cookie').split(';')[0],session=await(await fetch(base+'/api/session',{headers:{cookie}})).json();assert.equal((await fetch(base+'/api/admin',{headers:{cookie}})).status,403);assert.equal((await fetch(base+'/api/approve',{method:'POST',headers:{cookie,origin:env.EXCHANGE_PUBLIC_URL,'content-type':'application/json'},body:'{}'})).status,403);let spoof=await fetch(base+'/api/approve',{method:'POST',headers:{cookie,origin:env.EXCHANGE_PUBLIC_URL,'content-type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify({id:'2026-Q3-v1',version:1,user:'demo-admin'})});assert.equal(spoof.status,403);}finally{await new Promise(r=>server.close(r));store.close();}});

test('stock decreases only when People Team pays out; sold-out and cancellation behave',()=>{
 let s=sqliteStore(':memory:',{seed:true});try{
  const stock=id=>s.call('snapshot',{user:'demo-member'}).products.find(p=>p.id===id).stock;
  s.call('approve',{user:'demo-admin',id:'2026-Q3-v1',version:s.call('snapshot',{user:'demo-admin'}).settlements[0].version}); // credit points
  const before=stock('coffee'),a=s.call('redeem',{user:'demo-admin',product:'coffee',request_id:'flow-request-0000001'});
  assert.equal(stock('coffee'),before,'requesting must not change the remaining quantity');
  s.call('cancel',{user:'demo-admin',id:a.order.id});assert.equal(stock('coffee'),before,'cancelling must not change the remaining quantity');
  const b=s.call('redeem',{user:'demo-admin',product:'coffee',request_id:'flow-request-0000002'});s.call('fulfill',{user:'demo-admin',id:b.order.id});
  assert.equal(stock('coffee'),before-1,'paying out decreases the remaining quantity by one');
  assert.throws(()=>s.call('fulfill',{user:'demo-admin',id:b.order.id}),/이미 처리/);
 }finally{s.close();}
});
test('a product with no remaining quantity is sold out and cannot be paid out',async()=>{
 const {DatabaseSync}=await import('node:sqlite'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{rmSync}=await import('node:fs');
 const file=join(tmpdir(),'exchange-soldout-'+Date.now()+'.sqlite');let s=sqliteStore(file,{seed:true});
 try{
  const version=s.call('snapshot',{user:'demo-admin'}).settlements[0].version;s.call('approve',{user:'demo-admin',id:'2026-Q3-v1',version});
  const o1=s.call('redeem',{user:'demo-admin',product:'leave-half',request_id:'flow-request-0000003'}),o2=s.call('redeem',{user:'demo-member',product:'leave-half',request_id:'flow-request-0000004'});
  const raw=new DatabaseSync(file);raw.prepare('UPDATE products SET stock=1 WHERE id=?').run('leave-half');raw.close();
  s.call('fulfill',{user:'demo-admin',id:o1.order.id});
  assert.equal(s.call('snapshot',{user:'demo-member'}).products.find(p=>p.id==='leave-half').stock,0,'last unit paid out -> sold out');
  assert.throws(()=>s.call('fulfill',{user:'demo-admin',id:o2.order.id}),/남은 수량/);
  assert.throws(()=>s.call('redeem',{user:'demo-jun',product:'leave-half',request_id:'flow-request-0000005'}),/소진/);
  s.call('cancel',{user:'demo-admin',id:o2.order.id});
  assert.equal(s.call('snapshot',{user:'demo-member'}).products.find(p=>p.id==='leave-half').stock,0,'cancelling does not restore a unit that was never deducted');
 }finally{s.close();rmSync(file,{force:true});rmSync(file+'-wal',{force:true});rmSync(file+'-shm',{force:true});}
});

test('People Team can register and edit gifts; others cannot; hidden gifts are not shown to employees',()=>{
 let s=sqliteStore(':memory:',{seed:true});try{
  const gift={name:'테스트 선물',category:'기타',price:7000,stock:3,icon:'cup',description:'테스트용',active:true};
  assert.throws(()=>s.call('product_save',{user:'demo-member',...gift}),/관리자/);
  const made=s.call('product_save',{user:'demo-admin',...gift});assert.match(made.id,/^p-/);
  const listed=()=>s.call('snapshot',{user:'demo-member'}).products.find(p=>p.id===made.id);
  assert.equal(listed().stock,3);
  s.call('product_save',{user:'demo-admin',...gift,id:made.id,stock:10,price:8000});
  assert.equal(listed().stock,10);assert.equal(listed().price,8000);
  s.call('product_save',{user:'demo-admin',...gift,id:made.id,active:false});
  assert.equal(listed(),undefined,'hidden gifts are not shown to employees');
  assert.ok(s.call('admin',{user:'demo-admin'}).products.some(p=>p.id===made.id&&p.active===0),'admin still sees hidden gifts');
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,name:' '}),/이름/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,price:0}),/포인트/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,stock:-1}),/수량/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,stock:1.5}),/수량/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,category:'없는분류'}),/카테고리/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,icon:'<script>'}),/이미지/);
  assert.throws(()=>s.call('product_save',{user:'demo-admin',...gift,id:'nope'}),/찾을 수/);
 }finally{s.close();}
});
