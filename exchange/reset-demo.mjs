// Resets only the local fictional fixture. Does not read environment credentials or call any network.
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
const db=new DatabaseSync(fileURLToPath(new URL('./.data/demo.sqlite',import.meta.url)));
if(db.prepare("SELECT count(*) n FROM employees WHERE id NOT LIKE 'demo-%'").get().n)throw Error('Refusing to reset a database containing non-demo employees');
db.exec(`BEGIN IMMEDIATE;
 DELETE FROM ledger WHERE ref NOT LIKE 'opening:%' AND ref NOT LIKE 'hist:%' AND ref NOT LIKE 'order:hist-order-%' AND ref<>'order:demo-order-01';
 DELETE FROM orders WHERE id<>'demo-order-01' AND id NOT LIKE 'hist-order-%';
 UPDATE orders SET balance_after=3500 WHERE id='demo-order-01';
 UPDATE settlements SET state='pending',approved_by=NULL,approved_at=NULL WHERE id NOT LIKE 'hist-%';
 UPDATE products SET stock=CASE id WHEN 'coffee' THEN 80 WHEN 'snack' THEN 50 WHEN 'book' THEN 25 WHEN 'movie' THEN 30 WHEN 'lunch' THEN 30 WHEN 'leave' THEN 20 END;
 DELETE FROM audit;
 COMMIT;`);db.close();console.log('Fictional local demo reset; refresh the page.');
