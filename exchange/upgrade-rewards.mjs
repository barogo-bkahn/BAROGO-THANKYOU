import {CATALOG,rankAwards} from './rewards.mjs';
export function upgradeRewards(db){
 const columns=table=>db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
 if(!columns('settlements').includes('scheme'))db.exec("ALTER TABLE settlements ADD COLUMN scheme TEXT NOT NULL DEFAULT 'score_v1'");
 if(!columns('awards').includes('rank'))db.exec('ALTER TABLE awards ADD COLUMN rank INTEGER');
 if(!columns('products').includes('icon'))db.exec("ALTER TABLE products ADD COLUMN icon TEXT NOT NULL DEFAULT 'cup'");
 db.exec('CREATE TABLE IF NOT EXISTS demo_versions(id TEXT PRIMARY KEY)');
 if(db.prepare("SELECT id FROM demo_versions WHERE id='rank-rewards-v2'").get())return;
 if(db.prepare("SELECT count(*) n FROM employees WHERE id NOT LIKE 'demo-%'").get().n)throw Error('Reward fixture upgrade is demo-only');
 db.exec('BEGIN IMMEDIATE');try{
  db.exec('UPDATE products SET active=0');
  for(let p of CATALOG)db.prepare('INSERT INTO products(id,name,category,description,price,stock,active,icon) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,active=1,icon=excluded.icon').run(p.id,p.name,p.category,p.description,p.price,p.stock,p.icon);
  let pending=db.prepare("SELECT * FROM settlements WHERE state='pending'").all();
  if(!pending.length){let previous=db.prepare('SELECT * FROM settlements ORDER BY quarter DESC LIMIT 1').get();if(previous){let [year,q]=previous.quarter.split('-Q').map(Number);q++;if(q>4){year++;q=1;}let quarter=year+'-Q'+q,id=quarter+'-rank-v1';db.prepare("INSERT INTO settlements(id,quarter,state,rate,scheme) VALUES(?,?,'pending',1,'rank_v2')").run(id,quarter);db.prepare('INSERT INTO awards(settlement,employee,received,sent,quant,qual,final,points) SELECT ?,employee,received,sent,quant,qual,final,0 FROM awards WHERE settlement=?').run(id,previous.id);pending=[{id}];}}
  for(let s of pending){let rows=db.prepare('SELECT * FROM awards WHERE settlement=?').all(s.id);for(let a of rankAwards(rows))db.prepare('UPDATE awards SET points=?,rank=? WHERE settlement=? AND employee=?').run(a.points,a.rank,s.id,a.employee);db.prepare("UPDATE settlements SET scheme='rank_v2',rate=1,version=version+1 WHERE id=?").run(s.id);}
  db.prepare("INSERT INTO demo_versions(id) VALUES('rank-rewards-v2')").run();db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}

// Re-applies the current demo catalog to an already-upgraded demo DB. Stock of existing products is kept.
export function syncCatalog(db){
 db.exec('BEGIN IMMEDIATE');try{
  for(let p of CATALOG)db.prepare('INSERT INTO products(id,name,category,description,price,stock,active,icon) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,active=1,icon=excluded.icon').run(p.id,p.name,p.category,p.description,p.price,p.stock,p.icon);
  db.prepare('UPDATE products SET active=0 WHERE id NOT IN ('+CATALOG.map(()=>'?').join(',')+')').run(...CATALOG.map(p=>p.id));
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
