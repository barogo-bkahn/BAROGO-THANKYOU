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
if(rows.shift()?.join(',')!=='slack_user_id,name,team,active')throw Error('Invalid CSV header');
const quote=s=>`'${s.replaceAll("'","''")}'`;
const seen=new Set();
for(const row of rows){
 if(row.length!==4||!/^U[A-Z0-9]+$/.test(row[0])||!row[1].trim()||!row[2].trim()||!['true','false'].includes(row[3])||seen.has(row[0]))throw Error('Invalid or duplicate employee row');
 seen.add(row[0]);
}
if(!rows.length)throw Error('Empty roster');
const values=rows.map(([id,name,team,active])=>`('T159QLK7G',${quote(id)},${quote(name.trim())},${quote(team.trim())},${active})`).join(',\n');
writeFileSync(output,`begin;\ninsert into thankyou.employees(workspace,user_id,name,team,active) values\n${values}\non conflict(workspace,user_id) do update set name=excluded.name,team=excluded.team,active=excluded.active,updated_at=now();\ncommit;\n`,{mode:0o600});
console.log(`Validated ${rows.length} employees. Review SQL before importing. Missing rows are NOT deactivated.`);
