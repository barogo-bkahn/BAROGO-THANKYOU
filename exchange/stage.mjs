// Server-side operator utility: upload a complete, reviewed evaluator result to Supabase.
// No browser path exposes staging, arbitrary scores, conversion rates or role changes.
import {readFile} from 'node:fs/promises';
import {supabaseStore} from './store.mjs';
const [filename,operator]=process.argv.slice(2);
if(!filename||!operator)throw Error('Usage: node --env-file=exchange/.env exchange/stage.mjs <reviewed-result.json> <admin-Slack-ID>');
const result=JSON.parse(await readFile(filename,'utf8'));
if(!/^20\d{2}-Q[1-4]$/.test(result.quarter)||!result.prompt_version||!Array.isArray(result.evaluations))throw Error('quarter, prompt_version and evaluations are required');
for(let e of result.evaluations){if(!e.praise_id||!Array.isArray(e.scores)||e.scores.length!==7||e.scores.some((v,i)=>!Number.isInteger(v)||v<0||v>[10,20,5,30,15,10,10][i]))throw Error('Invalid praise ID or seven component scores');}
const staged=await supabaseStore(process.env).call('stage',{...result,user:operator});
console.log(JSON.stringify({ok:staged.ok,id:staged.id,state:staged.state}));
