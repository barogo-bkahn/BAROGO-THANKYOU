import {clients, SafeError} from './clients.mjs';
import {VALUES,homeView,praiseModal,reviewModal,messageModal} from './blocks.mjs';

const encoder=new TextEncoder();
const bytes=text=>encoder.encode(text);
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(await crypto.subtle.digest('SHA-256',bytes(text)));}
export function safeEqual(a,b){
  const x=bytes(a??''),y=bytes(b??'');let difference=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i++)difference|=(x[i]??0)^(y[i]??0);
  return difference===0;
}
export async function edgeSignature(raw,headers,secret,now=Date.now()){
  const ts=headers.get('x-slack-request-timestamp');
  if(!/^\d+$/.test(ts??'')||Math.abs(now/1000-Number(ts))>300)return false;
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=hex(await crypto.subtle.sign('HMAC',key,bytes(`v0:${ts}:${raw}`)));
  return safeEqual(headers.get('x-slack-signature'),`v0=${signature}`);
}
const encode64=data=>btoa(String.fromCharCode(...data));
const decode64=data=>Uint8Array.from(atob(data),c=>c.charCodeAt(0));
export async function seal(text,key64){
  const key=await crypto.subtle.importKey('raw',decode64(key64),'AES-GCM',false,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes(text)));
  return `${encode64(iv)}.${encode64(encrypted)}`;
}
export async function unseal(text,key64){
  const [iv,encrypted]=text.split('.').map(decode64);
  const key=await crypto.subtle.importKey('raw',decode64(key64),'AES-GCM',false,['decrypt']);
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,encrypted));
}
export function praiseCsv(rows){
  const fields=[['id','접수번호'],['created_at','접수일시(KST)'],['month','귀속월'],['status','접수상태'],['sender_name','작성자'],['sender','작성자 Slack ID'],['sender_team','작성자 조직'],['recipient_name','받은 동료'],['recipient','수신자 Slack ID'],['recipient_team','수신자 조직'],['core_value','핵심가치 코드'],['core_value_label','핵심가치 표시명'],['body','칭찬 내용']];
  const cell=value=>{let s=String(value??'');if(/^[\t\r\n]|^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const kst=value=>value?new Date(value).toLocaleString('sv-SE',{timeZone:'Asia/Seoul'}):'';
  const status={pending:'접수 완료',approved:'접수 완료',rejected:'접수 완료',submitted:'접수 완료'};
  return '\uFEFF'+[fields.map(([,label])=>cell(label)).join(','),...rows.map(row=>fields.map(([key])=>cell(key==='core_value_label'?(VALUES.find(v=>v[0]===row.core_value)?.[1]??row.core_value):key==='status'?status[row[key]]:key==='created_at'||key==='reviewed_at'?kst(row[key]):row[key])).join(','))].join('\r\n');
}
export function edgeHandler(env,waitUntil,api=clients(env),exchange=fetch){
  const base=env.PUBLIC_URL.replace(/\/$/,'');
  const callbackPath=new URL(base).pathname+'/slack/oauth/callback';
  const response=(status,data,headers={})=>new Response(typeof data==='string'?data:JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  const identity=p=>({workspace:p.team?.id,user:p.user?.id});
  async function token(){
    const data=await api.db('token',{workspace:env.SLACK_TEAM_ID});
    if(!data.token_cipher)throw new SafeError('앱 설치가 필요합니다.');
    return unseal(data.token_cipher,env.TOKEN_ENCRYPTION_KEY);
  }
  async function drain(){
    try {
      for(let i=0;i<10;i++){
        const job=await api.db('claim_job',{},5000);if(!job)break;
        try {
          const view=homeView({...await api.db('home',{workspace:job.workspace,user:job.user_id},5000),exchange_url:env.EXCHANGE_PUBLIC_URL,exchange_lan_url:env.EXCHANGE_LAN_URL},{user:job.user_id,testUser:env.EXCHANGE_TEST_USER_ID,testUrl:env.EXCHANGE_TEST_URL});
          await api.slack('views.publish',await token(),{user_id:job.user_id,view},5000);
          await api.db('finish_job',{id:job.id,success:true},5000);
        } catch {await api.db('finish_job',{id:job.id,success:false},5000);console.error('home_publish_failed');}
      }
    } catch {console.error('job_drain_failed');}
  }
  async function interact(p){
    const actor=identity(p);
    if(actor.workspace!==env.SLACK_TEAM_ID||!actor.user)return response(403,{error:'workspace_not_allowed'});
    if(p.type==='view_submission'){
      const values=p.view?.state?.values??{};
      const review=p.view.callback_id==='review_submit';
      if(review)return response(200,{response_action:'update',view:messageModal('승인·반려 절차가 없어졌어요. 접수함에서 전체 내역을 확인해주세요.')});
      try {
        if(review){
          const meta=JSON.parse(p.view.private_metadata);
          await api.db('review',{...actor,id:meta.id,decision:meta.decision,reason:values.reason?.value.value});
        } else if(p.view.callback_id==='praise_submit'){
          await api.db('submit',{...actor,recipient:values.recipient?.value.selected_user,core_value:values.value?.value.selected_option?.value,body:values.body?.value.value,request_id:p.view.id});
        } else return response(400,{error:'unknown_view'});
        return response(200,{response_action:'update',view:messageModal(review?'검토를 저장했습니다. 접수함을 다시 열어주세요.':'고마운 마음, 잘 맡아뒀어요! 📮 바로 접수되었으며, 이번 분기 건수와 점수에 반영돼요. 공개 게시·수신자 알림은 없어요.')});
      } catch(e){return response(200,{response_action:'errors',errors:{[review?'reason':'body']:e instanceof SafeError?e.message:'결과 확인이 지연됩니다. 같은 창에서 다시 제출해주세요.'}});}
    }
    const action=p.actions?.[0];let view;
    if(['export_link','exchange_open'].includes(action?.action_id))return response(200,{});
    // Read installation in parallel to authorization/data to fit Slack trigger_id deadline.
    const botPromise=token();botPromise.catch(()=>{});
    if(action?.action_id==='home_refresh'){
      const view=homeView({...await api.db('home',actor),exchange_url:env.EXCHANGE_PUBLIC_URL,exchange_lan_url:env.EXCHANGE_LAN_URL},{user:actor.user,testUser:env.EXCHANGE_TEST_USER_ID,testUrl:env.EXCHANGE_TEST_URL});
      await api.slack('views.publish',await botPromise,{user_id:actor.user,view});
      return response(200,{});
    }
    if(['praise_open','praise_unavailable'].includes(action?.action_id)){
      const home=await api.db('home',actor);
      view=home.eligible?praiseModal():messageModal('활성 직원 계정 확인 후 참여할 수 있어요. 피플팀에 문의해주세요.');
    }
    else if(['review_open','review_next','review_filter','review_first'].includes(action?.action_id)){
      const options=action.action_id==='review_next'?JSON.parse(action.value):{filter:action.selected_option?.value??(action.action_id==='review_first'?action.value:'all')};
      view=reviewModal(await api.db('review_list',{...actor,...options}));
    } else if(action?.action_id==='export_open'){
      const ticket=hex(crypto.getRandomValues(new Uint8Array(32)));
      await api.db('export_create',{...actor,hash:await digest(ticket),filter:action.value??'all'});
      view=messageModal('전체 접수 내역을 CSV로 내려받을 수 있어요.\n작성자·수신자·조직·핵심가치·칭찬 내용·접수 상태가 포함됩니다.\n링크는 5분 동안 한 번만 사용할 수 있어요. 피플팀 내부에서 보관하고 공유해주세요.');
      view.blocks.push({type:'actions',elements:[{type:'button',action_id:'export_link',text:{type:'plain_text',text:'CSV 다운로드'},url:base+'/exports/download?ticket='+ticket}]});
    }
    else if(['approve_open','reject_open'].includes(action?.action_id)){
      view=messageModal('승인·반려 절차가 없어졌어요. 접수함에서 전체 내역을 확인해주세요.');
    } else if(action?.action_id==='scores_open'){
      const data=await api.db('scores',actor);
      view=messageModal(`${data.quarter_start} 시작 분기 · 전체 접수 기준\n발신 3건 달성 시 분기당 5점`);
      view.blocks.push(...data.rows.slice(0,95).map(r=>({type:'section',text:{type:'plain_text',text:`${r.name}: 수신 ${r.received_points}점 · 발신 ${r.sent_count}건 / ${r.sender_points}점 · 합계 ${r.total_points}점`}})));
      if(data.rows.length>95)view.blocks.push({type:'section',text:{type:'plain_text',text:'전체 결과는 피플팀 운영 담당자가 DB에서 내보낼 수 있습니다.'}});
    } else return response(200,{});
    const bot=await botPromise;
    if(['review_next','review_filter','review_first'].includes(action.action_id))await api.slack('views.update',bot,{view_id:p.view.id,hash:p.view.hash,view});
    else await api.slack(p.view?.type==='modal'?'views.push':'views.open',bot,{trigger_id:p.trigger_id,view});
    return response(200,{});
  }
  return async request=>{
    let timer;
    try {
      const url=new URL(request.url);
      let path=url.pathname;
      // Supabase gateways may forward /thankyou/... or the full /functions/v1/... path.
      for(const prefix of [new URL(base).pathname,'/thankyou'])
        if(path===prefix||path.startsWith(prefix+'/')){path=path.slice(prefix.length);break;}
      if(request.method==='GET'&&path==='/healthz')return response(200,{ok:true});
      if(request.method==='GET'&&path==='/exports/download'){
        const ticket=url.searchParams.get('ticket');
        if(!/^[a-f0-9]{64}$/.test(ticket??''))return response(403,{error:'유효하지 않은 다운로드 링크입니다.'});
        const data=await api.db('export_download',{hash:await digest(ticket)},15000);
        return response(200,praiseCsv(data.rows),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="barogo-thankyou.csv"','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
      }
      if(request.method==='POST'&&path==='/internal/tick'){
        if(!env.WORKER_SECRET||!safeEqual(request.headers.get('authorization'),`Bearer ${env.WORKER_SECRET}`))return response(401,{error:'unauthorized'});
        waitUntil(drain());return response(200,{ok:true});
      }
      if(request.method==='GET'&&path==='/slack/install'){
        if(!env.INSTALL_PASSWORD||!safeEqual(request.headers.get('authorization'),`Basic ${btoa('install:'+env.INSTALL_PASSWORD)}`))return response(401,{error:'설치 담당자 인증 필요'},{'WWW-Authenticate':'Basic realm="Barogo installation"'});
        const state=hex(crypto.getRandomValues(new Uint8Array(32)));
        await api.db('oauth_create',{hash:await digest(state)});
        const target=new URL('https://slack.com/oauth/v2/authorize');
        target.search=new URLSearchParams({client_id:env.SLACK_CLIENT_ID,scope:'users:read',state,team:env.SLACK_TEAM_ID,redirect_uri:base+'/slack/oauth/callback'}).toString();
        return response(302,'',{Location:target.href,'Set-Cookie':`ty_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=${callbackPath}; Max-Age=600`});
      }
      if(request.method==='GET'&&path==='/slack/oauth/callback'){
        const state=url.searchParams.get('state'),cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('ty_state='))?.slice(9);
        if(!state||!safeEqual(state,cookie)||!(await api.db('oauth_consume',{hash:await digest(state)})).valid)return response(403,{error:'invalid_state'});
        if(!url.searchParams.get('code'))return response(400,{error:'installation_cancelled'});
        const exchanged=await exchange('https://slack.com/api/oauth.v2.access',{method:'POST',body:new URLSearchParams({client_id:env.SLACK_CLIENT_ID,client_secret:env.SLACK_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:base+'/slack/oauth/callback'}),signal:AbortSignal.timeout(10000)});
        const data=await exchanged.json();
        if(!exchanged.ok||!data.ok||data.team?.id!==env.SLACK_TEAM_ID||!data.access_token)return response(403,{error:'invalid_installation'});
        await api.db('install',{workspace:data.team.id,user:data.authed_user?.id,token_cipher:await seal(data.access_token,env.TOKEN_ENCRYPTION_KEY)});
        return response(200,{ok:true,message:'설치 완료. Slack에서 앱 홈을 열어주세요.'},{'Set-Cookie':`ty_state=; HttpOnly; Secure; SameSite=Lax; Path=${callbackPath}; Max-Age=0`});
      }
      if(request.method!=='POST'||!['/slack/events','/slack/interactions'].includes(path))return response(404,{error:'not_found'});
      if(Number(request.headers.get('content-length'))>65536)return response(413,{error:'payload_too_large'});
      // Bounded streaming read also protects requests without Content-Length.
      const reader=request.body?.getReader();let raw='',length=0;const decoder=new TextDecoder();
      if(reader)while(true){const item=await reader.read();if(item.done)break;length+=item.value.length;if(length>65536){await reader.cancel();return response(413,{error:'payload_too_large'});}raw+=decoder.decode(item.value,{stream:true});}raw+=decoder.decode();
      if(!env.SLACK_SIGNING_SECRET||!await edgeSignature(raw,request.headers,env.SLACK_SIGNING_SECRET))return response(401,{error:'invalid_signature'});
      const p=path==='/slack/events'?JSON.parse(raw):JSON.parse(new URLSearchParams(raw).get('payload'));
      if(path==='/slack/interactions'){
        const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve(p.type==='view_submission'?response(200,{response_action:'errors',errors:{[p.view?.callback_id==='review_submit'?'reason':'body']:'처리 결과 확인이 지연됩니다. 같은 창에서 다시 제출해주세요.'}}):response(503,{error:'retry_later'})),2400);});
        // Keep the uncertain operation alive; stable view ID makes retries idempotent.
        const work=interact(p);waitUntil(work.then(()=>{},()=>{}));
        return await Promise.race([work,timeout]);
      }
      if(p.type==='url_verification')return response(200,{challenge:p.challenge});
      if(p.team_id!==env.SLACK_TEAM_ID)return response(403,{error:'workspace_not_allowed'});
      if(p.event?.type==='app_uninstalled'||(p.event?.type==='tokens_revoked'&&p.event.tokens?.bot?.length))await api.db('revoke_install',{workspace:p.team_id});
      if(p.event?.type==='app_home_opened'&&p.event.tab==='home'){
        await api.db('enqueue',{workspace:p.team_id,user:p.event.user,id:p.event_id});waitUntil(drain());
      }
      return response(200,{});
    } catch(e){console.error('request_failed');return response(e instanceof SafeError?400:500,{error:e instanceof SafeError?e.message:'요청 처리 중 오류가 발생했습니다.'});}
    finally{clearTimeout(timer);}
  };
}
