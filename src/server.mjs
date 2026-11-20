import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {clients, SafeError} from './clients.mjs';
import {equal, hash, verifySlack, encrypt, decrypt} from './security.mjs';
import {homeView,praiseModal,reviewModal,messageModal} from './blocks.mjs';
import {praiseCsv} from './edge.mjs';

export function config(env) {
  for (const key of ['PUBLIC_URL','SLACK_TEAM_ID','SLACK_CLIENT_ID','SLACK_CLIENT_SECRET','SLACK_SIGNING_SECRET','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TOKEN_ENCRYPTION_KEY','INSTALL_PASSWORD'])
    if (!env[key]) throw new Error(`Missing configuration: ${key}`);
  if (env.SLACK_TEAM_ID!=='T159QLK7G') throw new Error('Unexpected Slack workspace');
  if (new URL(env.PUBLIC_URL).protocol!=='https:' || new URL(env.SUPABASE_URL).protocol!=='https:') throw new Error('HTTPS required');
  if (Buffer.from(env.TOKEN_ENCRYPTION_KEY,'base64').length!==32 || env.INSTALL_PASSWORD.length<24) throw new Error('Invalid encryption key or install password');
  return env;
}
async function rawBody(req) {
  const chunks=[]; let length=0;
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>65536) throw new SafeError('요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function createApp(env, api = clients(env)) {
  const base=env.PUBLIC_URL.replace(/\/$/,'');
  async function token(workspace) {
    const data=await api.db('token',{workspace});
    if (!data.token_cipher) throw new SafeError('앱 설치가 필요합니다.');
    return decrypt(data.token_cipher,env.TOKEN_ENCRYPTION_KEY);
  }
  async function publish(workspace,user) {
    const data=await api.db('home',{workspace,user});
    await api.slack('views.publish',await token(workspace),{user_id:user,view:homeView({...data,exchange_url:env.EXCHANGE_PUBLIC_URL,exchange_lan_url:env.EXCHANGE_LAN_URL},{user,testUser:env.EXCHANGE_TEST_USER_ID,testUrl:env.EXCHANGE_TEST_URL})},5000);
  }
  async function interactive(p) {
    const workspace=p.team?.id, user=p.user?.id;
    if(workspace!==env.SLACK_TEAM_ID || !user) throw new SafeError('허용되지 않은 요청입니다.');
    if(p.type==='view_submission') {
      const values=p.view.state.values;
      if(p.view.callback_id==='praise_submit') {
        try {
          await api.db('submit',{workspace,user,recipient:values.recipient?.value.selected_user,
            core_value:values.value?.value.selected_option?.value,body:values.body?.value.value,request_id:p.view.id});
          return {response_action:'update',view:messageModal('고마운 마음, 잘 맡아뒀어요! 📮 바로 접수되었으며, 이번 분기 건수와 점수에 반영돼요. 공개 게시·수신자 알림은 없어요.')};
        } catch(e) { return {response_action:'errors',errors:{body:e instanceof SafeError ? e.message : '접수 결과를 확인하지 못했습니다. 같은 창에서 다시 제출해주세요.'}}; }
      }
      if(p.view.callback_id==='review_submit') return {response_action:'update',view:messageModal('승인·반려 절차가 없어졌어요. 접수함에서 전체 내역을 확인해주세요.')};
      throw new SafeError('지원하지 않는 양식입니다.');
    }
    if(p.type!=='block_actions') return {};
    const action=p.actions?.[0]; let view;
    if(action?.action_id==='home_refresh'){await publish(workspace,user);return {};}
    if(['export_link','exchange_open'].includes(action?.action_id))return {};
    if(['praise_open','praise_unavailable'].includes(action?.action_id)){
      const home=await api.db('home',{workspace,user});
      if(!home.eligible)view=messageModal('활성 직원 계정 확인 후 참여할 수 있어요. 피플팀에 문의해주세요.');
      else if(home.submitted)view=messageModal('이번 달에는 이미 칭찬을 남겼어요. 다음 달에 다시 참여할 수 있어요.');
      else view=praiseModal();
    }
    else if(['review_open','review_next','review_filter','review_first'].includes(action?.action_id)) {
      const options=action.action_id==='review_next'?JSON.parse(action.value):{filter:action.selected_option?.value??(action.action_id==='review_first'?action.value:'all')};
      view=reviewModal(await api.db('review_list',{workspace,user,...options}));
    } else if(action?.action_id==='export_open'){
      const ticket=randomBytes(32).toString('hex');
      await api.db('export_create',{workspace,user,hash:hash(ticket),filter:action.value??'all'});
      view=messageModal('선택한 상태의 전체 내역을 CSV로 내려받습니다. 링크는 5분 동안 한 번만 사용할 수 있어요. 피플팀 내부에서 보관하고 공유해주세요.');
      view.blocks.push({type:'actions',elements:[{type:'button',action_id:'export_link',text:{type:'plain_text',text:'CSV 다운로드'},url:base+'/exports/download?ticket='+ticket}]});
    }
    else if(['approve_open','reject_open'].includes(action?.action_id)) {
      view=messageModal('승인·반려 절차가 없어졌어요. 접수함에서 전체 내역을 확인해주세요.');
    } else if(action?.action_id==='scores_open') {
      const data=await api.db('scores',{workspace,user});
      const lines=data.rows.map(r=>`${r.name}: 수신 ${r.received_points}점 · 발신 ${r.sent_count}건 / ${r.sender_points}점 · 합계 ${r.total_points}점`);
      // Slack plain-text section limit. Scores are shown in pages using a modal of sections.
      view=messageModal(`${data.quarter_start} 시작 분기 · 전체 접수 기준\n발신 3건 달성 시 분기당 5점`);
      view.blocks.push(...lines.slice(0,95).map(text=>({type:'section',text:{type:'plain_text',text}})));
      if(lines.length>95) view.blocks.push({type:'section',text:{type:'plain_text',text:'전체 집계는 운영 담당자의 DB 내보내기를 이용해주세요.'}});
    } else return {};
    const bot=await token(workspace);
    if(['review_next','review_filter','review_first'].includes(action.action_id)) await api.slack('views.update',bot,{view_id:p.view.id,hash:p.view.hash,view});
    else if(p.view?.type==='modal') await api.slack('views.push',bot,{trigger_id:p.trigger_id,view});
    else await api.slack('views.open',bot,{trigger_id:p.trigger_id,view});
    return {};
  }
  const server=http.createServer(async(req,res)=>{
    let deadline;
    const send=(code,data,headers={})=>{
      if(res.writableEnded) return;
      clearTimeout(deadline);
      res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
      res.end(typeof data==='string'?data:JSON.stringify(data));
    };
    try {
      const url=new URL(req.url,'http://local');
      if(req.method==='GET' && url.pathname==='/healthz') return send(200,{ok:true});
      if(req.method==='GET' && url.pathname==='/exports/download'){
        const ticket=url.searchParams.get('ticket');
        if(!/^[a-f0-9]{64}$/.test(ticket??''))return send(403,{error:'유효하지 않은 다운로드 링크입니다.'});
        const data=await api.db('export_download',{hash:hash(ticket)},15000);
        return send(200,praiseCsv(data.rows),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="barogo-thankyou.csv"','Referrer-Policy':'no-referrer'});
      }
      if(req.method==='GET' && url.pathname==='/slack/install') {
        const basic=`Basic ${Buffer.from(`install:${env.INSTALL_PASSWORD}`).toString('base64')}`;
        if(!equal(req.headers.authorization,basic)) return send(401,{error:'설치 담당자 인증 필요'},{'WWW-Authenticate':'Basic realm="Barogo installation"'});
        const state=randomBytes(32).toString('base64url');
        await api.db('oauth_create',{hash:hash(state)});
        const destination=new URL('https://slack.com/oauth/v2/authorize');
        destination.search=new URLSearchParams({client_id:env.SLACK_CLIENT_ID,scope:'users:read',state,team:env.SLACK_TEAM_ID,redirect_uri:`${base}/slack/oauth/callback`});
        return send(302,'',{Location:destination.href,'Set-Cookie':`ty_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/slack/oauth/callback; Max-Age=600`});
      }
      if(req.method==='GET' && url.pathname==='/slack/oauth/callback') {
        const state=url.searchParams.get('state');
        const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ty_state='))?.slice(9);
        if(!state || !equal(state,cookie) || !(await api.db('oauth_consume',{hash:hash(state)})).valid) return send(403,{error:'설치 요청이 만료되었거나 유효하지 않습니다.'});
        if(!url.searchParams.get('code')) return send(400,{error:'Slack 설치가 취소되었습니다.'});
        const response=await fetch('https://slack.com/api/oauth.v2.access',{method:'POST',body:new URLSearchParams({client_id:env.SLACK_CLIENT_ID,client_secret:env.SLACK_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:`${base}/slack/oauth/callback`}),signal:AbortSignal.timeout(10000)});
        const installation=await response.json();
        if(!response.ok || !installation.ok || installation.team?.id!==env.SLACK_TEAM_ID || !installation.access_token) return send(403,{error:'바로고 워크스페이스 설치를 확인할 수 없습니다.'});
        await api.db('install',{workspace:installation.team.id,user:installation.authed_user?.id,token_cipher:encrypt(installation.access_token,env.TOKEN_ENCRYPTION_KEY)});
        return send(200,{ok:true,message:'설치 완료. Slack에서 앱 홈을 열어주세요.'},{'Set-Cookie':'ty_state=; HttpOnly; Secure; SameSite=Lax; Path=/slack/oauth/callback; Max-Age=0'});
      }
      if(req.method!=='POST' || !['/slack/events','/slack/interactions'].includes(url.pathname)) return send(404,{error:'not_found'});
      const raw=await rawBody(req);
      if(!verifySlack(raw,req.headers,env.SLACK_SIGNING_SECRET)) return send(401,{error:'invalid_signature'});
      const p=url.pathname==='/slack/events' ? JSON.parse(raw) : JSON.parse(new URLSearchParams(raw).get('payload'));
      deadline=setTimeout(()=>{
        if(p?.type==='view_submission') {
          const field=p.view?.callback_id==='review_submit'?'reason':'body';
          send(200,{response_action:'errors',errors:{[field]:'처리 결과 확인이 지연되고 있습니다. 같은 창에서 다시 제출해주세요.'}});
        } else send(503,{error:'retry_later'});
      },2500);
      if(url.pathname==='/slack/interactions') return send(200,await interactive(p));
      if(p.type==='url_verification') return send(200,{challenge:p.challenge});
      if(p.team_id!==env.SLACK_TEAM_ID) return send(403,{error:'workspace_not_allowed'});
      if(p.event?.type==='app_uninstalled') await api.db('revoke_install',{workspace:p.team_id});
      if(p.event?.type==='tokens_revoked' && p.event.tokens?.bot?.length) await api.db('revoke_install',{workspace:p.team_id});
      if(p.event?.type==='app_home_opened' && p.event.tab==='home')
        await api.db('enqueue',{workspace:p.team_id,user:p.event.user,id:p.event_id});
      return send(200,{});
    } catch(e) {
      // Never log payloads, praise bodies, authorization headers, OAuth codes or upstream errors.
      console.error('request_failed');
      return send(e instanceof SafeError?400:500,{error:e instanceof SafeError?e.message:'요청 처리 중 오류가 발생했습니다.'});
    }
  });
  server.requestTimeout=10000; server.headersTimeout=12000;
  let running=false;
  const timer=setInterval(async()=>{
    if(running) return; running=true;
    try {
      const job=await api.db('claim_job');
      if(job) {
        try {await publish(job.workspace,job.user_id); await api.db('finish_job',{id:job.id,success:true});}
        catch {await api.db('finish_job',{id:job.id,success:false}); console.error('home_publish_failed');}
      }
    } catch {console.error('worker_failed');}
    finally {running=false;}
  },1000);
  timer.unref(); server.on('close',()=>clearInterval(timer));
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const env=config(process.env);
  const server=createApp(env);
  server.listen(Number(env.PORT??3000),'0.0.0.0',()=>console.log('thankyou_server_ready'));
  for(const signal of ['SIGTERM','SIGINT']) process.on(signal,()=>server.close(()=>process.exit(0)));
}
