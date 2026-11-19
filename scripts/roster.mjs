// Convert People-approved CSV into a SQL transaction. Nothing is sent automatically.
import {readFileSync,writeFileSync} from 'node:fs';
const [input,output]=process.argv.slice(2);
if(!input||!output) throw Error('Usage: node scripts/roster.mjs input.csv output.sql');
function csv(text){
 const rows=[];let row=[],value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(value);value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push(row);row=[];value='';}
  else value+=c;
 }
 if(quoted)throw Error('Unclosed CSV quote');
 if(value||row.length){row.push(value);rows.push(row);}return rows;
}
const rows=csv(readFileSync(input,'utf8').replace(/^\uFEFF/,''));
const header=rows.shift();
if(!['slack_user_id','name','part2','part3'].every(key=>header.includes(key)))throw Error('Required columns: slack_user_id,name,part2,part3. part1 is ignored; active is optional.');
const cell=(row,key)=>row[header.indexOf(key)]??'';
const org=value=>{const text=value.trim();return !text||text==='-'?null:text;};
const quote=s=>`'${s.replaceAll("'","''")}'`;
const seen=new Set();
for(const row of rows){
 const id=cell(row,'slack_user_id'),active=cell(row,'active')||'true';
 if(row.length!==header.length||!/^U[A-Z0-9]+$/.test(id)||!cell(row,'name').trim()||!['true','false'].includes(active)||seen.has(id))throw Error('Invalid/duplicate employee row or unresolved Slack ID');
 seen.add(id);
}
if(!rows.length)throw Error('Empty roster');
const values=rows.map(row=>{const p2=org(cell(row,'part2')),p3=org(cell(row,'part3'));return `('T159QLK7G',${quote(cell(row,'slack_user_id'))},${quote(cell(row,'name').trim())},${p2?quote(p2):'null'},${p3?quote(p3):'null'},${quote([p2,p3].filter(Boolean).join(' / ')||'조직 미지정')},${cell(row,'active')||'true'})`;}).join(',\n');
writeFileSync(output,`begin;\ninsert into thankyou.employees(workspace,user_id,name,part2,part3,team,active) values\n${values}\non conflict(workspace,user_id) do update set name=excluded.name,part2=excluded.part2,part3=excluded.part3,team=excluded.team,active=excluded.active,updated_at=now();\ncommit;\n`,{mode:0o600});
console.log(`Validated ${rows.length} employees. Review SQL before importing. Missing rows are NOT deactivated.`);
