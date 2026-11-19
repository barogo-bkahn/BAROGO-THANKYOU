import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {upgradeRewards,syncCatalog} from './upgrade-rewards.mjs';
import {REWARD_POLICY} from './rewards.mjs';
import {seedHistory} from './history-fixture.mjs';

// Product catalogue rules shared by the demo store (the Postgres function in db.sql mirrors them).
export const PRODUCT_CATEGORIES=["휴가·리프레시","업무 장비","커피·간식","성장·학습","기타"];
export const PRODUCT_ICONS=["cup","snack","book","moon","meal","keyboard","monitor","headset","hub","stand","lamp","card-starbucks","card-cvs","card-olive"];
export function validateProduct(d){
 const name=String(d.name??'').trim(),description=String(d.description??'').trim(),price=Number(d.price),stock=Number(d.stock);
 if(name.length<1||name.length>40)throw new ExchangeError('선물 이름은 1~40자로 입력해주세요.');
 if(!PRODUCT_CATEGORIES.includes(d.category))throw new ExchangeError('카테고리를 선택해주세요.');
 if(!Number.isInteger(price)||price<1||price>1000000)throw new ExchangeError('교환 포인트는 1~1,000,000 사이의 정수로 입력해주세요.');
 if(!Number.isInteger(stock)||stock<0||stock>9999)throw new ExchangeError('수량은 0~9,999 사이의 정수로 입력해주세요.');
 if(!PRODUCT_ICONS.includes(d.icon))throw new ExchangeError('이미지를 선택해주세요.');
 if(description.length>200)throw new ExchangeError('이용 안내는 200자 이하로 입력해주세요.');
 return {name,category:d.category,description,price,stock,icon:d.icon,active:d.active===false||d.active===0||d.active==='0'?0:1};
}
export class ExchangeError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(message,status)=>{throw new ExchangeError(message,status);};
export function sqliteStore(filename=':memory:',{seed=false,rewards=true,history=false}={}){
 const db=new DatabaseSync(filename); db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY,name TEXT NOT NULL,team TEXT NOT NULL,admin INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>0),stock INTEGER NOT NULL CHECK(stock>=0),active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS settlements(id TEXT PRIMARY KEY,quarter TEXT NOT NULL UNIQUE,version INTEGER NOT NULL DEFAULT 1,state TEXT NOT NULL CHECK(state IN ('pending','paid')),rate INTEGER NOT NULL CHECK(rate>0),approved_by TEXT,approved_at TEXT);
 CREATE TABLE IF NOT EXISTS awards(settlement TEXT NOT NULL REFERENCES settlements(id),employee TEXT NOT NULL REFERENCES employees(id),received INTEGER NOT NULL,sent INTEGER NOT NULL,quant REAL NOT NULL,qual REAL,final REAL,points INTEGER NOT NULL CHECK(points>=0),PRIMARY KEY(settlement,employee));
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,employee TEXT NOT NULL REFERENCES employees(id),amount INTEGER NOT NULL,kind TEXT NOT NULL,ref TEXT NOT NULL UNIQUE,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,employee TEXT NOT NULL REFERENCES employees(id),product TEXT NOT NULL REFERENCES products(id),product_name TEXT NOT NULL,cost INTEGER NOT NULL CHECK(cost>0),state TEXT NOT NULL CHECK(state IN ('requested','fulfilled','cancelled')),request_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),completed_at TEXT,UNIQUE(employee,request_id));
 CREATE TABLE IF NOT EXISTS praises(id TEXT PRIMARY KEY,sender TEXT NOT NULL REFERENCES employees(id),recipient TEXT NOT NULL REFERENCES employees(id),core_value TEXT NOT NULL,body TEXT NOT NULL,month TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS evaluations(settlement TEXT NOT NULL REFERENCES settlements(id),praise_id TEXT NOT NULL REFERENCES praises(id),scores TEXT NOT NULL,score INTEGER NOT NULL,gate TEXT NOT NULL CHECK(gate IN ('pass','vague','no_value')),note TEXT,PRIMARY KEY(settlement,praise_id));
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
 `);
 if(!db.prepare('PRAGMA table_info(orders)').all().some(c=>c.name==='balance_after'))db.exec('ALTER TABLE orders ADD COLUMN balance_after INTEGER');
 const all=(q,...p)=>db.prepare(q).all(...p),one=(q,...p)=>db.prepare(q).get(...p),run=(q,...p)=>db.prepare(q).run(...p);
 const balance=id=>one('SELECT coalesce(sum(amount),0) balance FROM ledger WHERE employee=?',id).balance;
 const audit=(actor,action,target)=>run('INSERT INTO audit(id,actor,action,target) VALUES(?,?,?,?)',randomUUID(),actor,action,target);
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{let r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
 if(seed&&!one('SELECT id FROM employees LIMIT 1'))transaction(()=>{
  for(const e of [['demo-admin','가상 운영자','피플팀',1],['demo-member','가상 민서','프로덕트팀',0],['demo-jun','가상 준호','운영팀',0],['demo-yun','가상 윤서','개발팀',0]])run('INSERT INTO employees(id,name,team,admin) VALUES(?,?,?,?)',...e);
  for(const p of [['coffee','나를 위한 커피 한 잔','음료','커피·차 중 원하는 음료로 잠깐 쉬어가요. · 가상 쿠폰',1500,80],['snack','출출할 때, 간식 한 입','간식','혼자 맛있게 즐기는 편의점 간식 쿠폰 · 가상 상품',2500,50],['book','다음 페이지의 나','성장','읽고 싶었던 책 한 권을 위한 도서 지원 · 가상 상품',5000,25],['movie','오늘은 영화 보는 날','취향','스크린 앞에서 보내는 나만의 두 시간 · 가상 쿠폰',6000,30],['lunch','든든한 점심 한 끼','식사','나를 챙기는 맛있는 점심 쿠폰 · 가상 상품',7000,30],['leave','한 시간, 나에게','쉼','리프레시 휴가 1시간 · 가상 휴가, 실제 부여 없음',10000,20]])run('INSERT INTO products(id,name,category,description,price,stock) VALUES(?,?,?,?,?,?)',...p);
  run('INSERT INTO settlements(id,quarter,state,rate) VALUES(?,?,?,?)','2026-Q3-v1','2026-Q3','pending',100);
  for(const [id,received,sent,qual] of [['demo-admin',9,3,80],['demo-member',6,4,83],['demo-jun',4,2,74],['demo-yun',0,3,null]]){let quant=Math.min(100,received*5+(sent>=3?5:0)),final=qual===null?null:(quant+qual)/2;run('INSERT INTO awards VALUES(?,?,?,?,?,?,?,?)','2026-Q3-v1',id,received,sent,quant,qual,final,final===null?0:Math.floor(final*100));run('INSERT INTO ledger(id,employee,amount,kind,ref,note) VALUES(?,?,?,?,?,?)',randomUUID(),id,5000,'credit','opening:'+id,'이전 분기 가상 적립');}
  run('INSERT INTO orders(id,employee,product,product_name,cost,state,request_id,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?)','demo-order-01','demo-admin','coffee','나를 위한 커피 한 잔',1500,'fulfilled','seed-order','2026-10-10T02:10:00Z','2026-10-10T03:00:00Z');
  run('INSERT INTO ledger(id,employee,amount,kind,ref,note) VALUES(?,?,?,?,?,?)',randomUUID(),'demo-admin',-1500,'redeem','order:demo-order-01','나를 위한 커피 한 잔');
 });
 if(seed&&rewards){upgradeRewards(db);syncCatalog(db);}
 if(seed&&rewards&&history)seedHistory(db);
 function call(op,d={}){
  const actor=one('SELECT * FROM employees WHERE id=? AND active=1',d.user??'');if(!actor)fail('활성 직원 계정으로 로그인해주세요.',401);
  const requireAdmin=()=>{if(!actor.admin)fail('피플팀 관리자만 사용할 수 있어요.',403);};
  const orders=filter=>all(`SELECT o.*,e.name employee_name,e.team FROM orders o JOIN employees e ON e.id=o.employee ${filter?'WHERE o.employee=?':''} ORDER BY o.created_at DESC`,...(filter?[actor.id]:[]));
  if(op==='snapshot'){
   audit(actor.id,'view','exchange');
   return {policy:rewards?REWARD_POLICY:null,user:actor,balance:balance(actor.id),products:all('SELECT * FROM products WHERE active=1 ORDER BY price'),orders:orders(true),ledger:all('SELECT * FROM ledger WHERE employee=? ORDER BY created_at DESC',actor.id),settlements:all('SELECT s.*,a.* FROM settlements s JOIN awards a ON a.settlement=s.id WHERE a.employee=? ORDER BY s.quarter DESC',actor.id)};
  }
  if(op==='admin'){
   requireAdmin();audit(actor.id,'admin_view','exchange');
   return {employees:all(`SELECT e.*,(SELECT coalesce(sum(amount),0) FROM ledger l WHERE l.employee=e.id) balance,(SELECT coalesce(sum(amount),0) FROM ledger l WHERE l.employee=e.id AND amount>0 AND kind='credit') credited,(SELECT coalesce(-sum(amount),0) FROM ledger l WHERE l.employee=e.id AND kind='redeem') spent,(SELECT coalesce(sum(amount),0) FROM ledger l WHERE l.employee=e.id AND kind='refund') refunded FROM employees e ORDER BY e.name`),settlements:all('SELECT * FROM settlements ORDER BY quarter DESC'),awards:all('SELECT a.*,e.name,e.team,s.state,s.quarter FROM awards a JOIN employees e ON e.id=a.employee JOIN settlements s ON s.id=a.settlement ORDER BY e.name'),orders:orders(false),products:all('SELECT * FROM products ORDER BY category,price,id'),evidence:all('SELECT ev.settlement,ev.praise_id,p.sender,se.name sender_name,p.recipient,re.name recipient_name,p.core_value,p.body,ev.scores,ev.score,ev.gate,ev.note FROM evaluations ev JOIN praises p ON p.id=ev.praise_id JOIN employees se ON se.id=p.sender JOIN employees re ON re.id=p.recipient ORDER BY p.created_at').map(x=>({...x,scores:JSON.parse(x.scores)})),ledger:all('SELECT l.*,e.name FROM ledger l JOIN employees e ON e.id=l.employee ORDER BY l.created_at DESC')};
  }
  if(op==='product_save')return transaction(()=>{
   requireAdmin();const f=validateProduct(d);let id=d.id?String(d.id):null;
   if(id){const r=run('UPDATE products SET name=?,category=?,description=?,price=?,stock=?,active=?,icon=? WHERE id=?',f.name,f.category,f.description,f.price,f.stock,f.active,f.icon,id);if(!r.changes)fail('선물을 찾을 수 없어요.',404);}
   else{id='p-'+randomUUID().replaceAll('-','').slice(0,10);run('INSERT INTO products(id,name,category,description,price,stock,active,icon) VALUES(?,?,?,?,?,?,?,?)',id,f.name,f.category,f.description,f.price,f.stock,f.active,f.icon);}
   audit(actor.id,d.id?'product_update':'product_create',id);return {ok:true,id};
  });
  if(op==='approve')return transaction(()=>{
   requireAdmin();let s=one('SELECT * FROM settlements WHERE id=?',d.id);if(!s)fail('정산을 찾을 수 없어요.',404);if(s.version!==d.version)fail('정산 버전이 바뀌었어요. 새로고침해주세요.',409);if(s.state==='paid')return {ok:true,already:true};
   const awards=all('SELECT a.*,e.active FROM awards a JOIN employees e ON e.id=a.employee WHERE settlement=?',s.id);if(!awards.some(a=>a.qual!==null&&a.active))fail('지급 대상이 없어요.');
   for(let a of awards){if(a.qual===null||!a.active)continue;run('INSERT INTO ledger(id,employee,amount,kind,ref,note) VALUES(?,?,?,?,?,?)',randomUUID(),a.employee,a.points,'credit',`settlement:${s.id}:${a.employee}`,`${s.quarter.replace(/^(\d{4})-Q(\d)$/,'$1년 $2분기')} 칭찬포인트`);}
   run("UPDATE settlements SET state='paid',approved_by=?,approved_at=? WHERE id=?",actor.id,new Date().toISOString(),s.id);audit(actor.id,'approve',s.id);return {ok:true};
  });
  if(op==='redeem')return transaction(()=>{
   if(!/^[a-zA-Z0-9-]{16,100}$/.test(d.request_id??''))fail('교환 요청 번호가 올바르지 않아요.');
   let previous=one('SELECT * FROM orders WHERE employee=? AND request_id=?',actor.id,d.request_id);if(previous){if(previous.product!==d.product)fail('이미 사용된 교환 요청 번호예요.',409);return {ok:true,order:previous,already:true};}
   const p=one('SELECT * FROM products WHERE id=? AND active=1',d.product);if(!p)fail('현재 교환할 수 없는 상품이에요.',404);if(p.stock<1)fail('아쉽지만 준비된 수량이 모두 소진됐어요.',409);if(balance(actor.id)<p.price)fail('포인트가 부족해요.',409);
   let id=randomUUID();run('INSERT INTO orders(id,employee,product,product_name,cost,state,request_id,balance_after) VALUES(?,?,?,?,?,?,?,?)',id,actor.id,p.id,p.name,p.price,'requested',d.request_id,balance(actor.id)-p.price);run('INSERT INTO ledger(id,employee,amount,kind,ref,note) VALUES(?,?,?,?,?,?)',randomUUID(),actor.id,-p.price,'redeem','order:'+id,p.name);audit(actor.id,'redeem',id);return {ok:true,order:one('SELECT * FROM orders WHERE id=?',id)};
  });
  if(op==='fulfill'||op==='cancel')return transaction(()=>{
   requireAdmin();let o=one('SELECT * FROM orders WHERE id=?',d.id);if(!o)fail('교환 내역이 없어요.',404);if(o.state!=='requested')fail('이미 처리된 교환이에요.',409);
   if(op==='fulfill'){const p=one('SELECT * FROM products WHERE id=?',o.product);if(!p||p.stock<1)fail('남은 수량이 없어 지급 처리할 수 없어요. 취소·환불로 처리해주세요.',409);run('UPDATE products SET stock=stock-1 WHERE id=?',o.product);} // stock decreases only when People Team pays out
   if(op==='cancel'){run('INSERT INTO ledger(id,employee,amount,kind,ref,note) VALUES(?,?,?,?,?,?)',randomUUID(),o.employee,o.cost,'refund','refund:'+o.id,o.product_name+' 취소 환불');}
   run('UPDATE orders SET state=?,completed_at=? WHERE id=?',op==='cancel'?'cancelled':'fulfilled',new Date().toISOString(),o.id);audit(actor.id,op,o.id);return {ok:true};
  });
  fail('지원하지 않는 요청이에요.',404);
 }
 return {call,close:()=>db.close()};
}

export function supabaseStore(env,request=fetch){return {async call(op,data){let r=await request(`${env.SUPABASE_URL}/rest/v1/rpc/ty_exchange`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:JSON.stringify({p_op:op,p_data:{...data,workspace:env.SLACK_TEAM_ID}}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new ExchangeError('포인트 서버 연결을 확인해주세요.',503);let value=await r.json();if(value.error)throw new ExchangeError(value.error,value.status??400);return value;}};}
