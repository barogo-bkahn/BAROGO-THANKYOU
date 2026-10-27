begin;
alter table thankyou.employees add column if not exists org_exempt boolean not null default false;
alter table thankyou.employees add column if not exists part2 text, add column if not exists part3 text;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='thankyou.praises'::regclass and contype='c' and pg_get_constraintdef(oid) like '%sender_team%recipient_team%' loop
 execute format('alter table thankyou.praises drop constraint %I',c.conname);
 end loop;
end $$;
create or replace function thankyou.same_org(s2 text,s3 text,r2 text,r3 text)
returns boolean language sql immutable security invoker set search_path='' as $$
 select case when nullif(nullif(trim(s3),''),'-') is not null
 then nullif(nullif(trim(s3),''),'-') = nullif(nullif(trim(r3),''),'-')
 when nullif(nullif(trim(s2),''),'-') is not null
 then nullif(nullif(trim(s2),''),'-') = nullif(nullif(trim(r2),''),'-')
 else null end;
$$;
revoke all on function thankyou.same_org(text,text,text,text) from public,anon,authenticated;
grant execute on function thankyou.same_org(text,text,text,text) to service_role;


create table if not exists thankyou.export_tickets (
  hash text primary key, workspace text not null, actor text not null,
  status_filter text not null, expires_at timestamptz not null
);
alter table thankyou.export_tickets enable row level security;
revoke all on thankyou.export_tickets from public,anon,authenticated;
grant select,insert,delete on thankyou.export_tickets to service_role;

create or replace function public.ty_api(p_op text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  w text := p_data->>'workspace'; u text := p_data->>'user';
  r thankyou.praises%rowtype; s thankyou.employees%rowtype; t thankyou.employees%rowtype;
  j thankyou.jobs%rowtype; ticket thankyou.export_tickets%rowtype;
  result jsonb; rows_json jsonb; cursor_id uuid; cursor_at timestamptz;
  status_filter text := coalesce(p_data->>'filter','all'); stats jsonb;
  m date := date_trunc('month', clock_timestamp() at time zone 'Asia/Seoul')::date;
  q date := date_trunc('quarter', clock_timestamp() at time zone 'Asia/Seoul')::date;
  admin_ok boolean;
begin
  if current_user <> 'service_role' then raise exception 'forbidden'; end if;
  if p_op='export_download' then
    delete from thankyou.export_tickets where hash=p_data->>'hash' and expires_at>now() returning * into ticket;
    if not found then return jsonb_build_object('error','다운로드 링크가 만료되었거나 이미 사용되었습니다. 검토함에서 다시 만들어주세요.'); end if;
    w:=ticket.workspace; u:=ticket.actor; status_filter:=ticket.status_filter;
    if w<>'T159QLK7G' or not exists(select 1 from thankyou.admins where workspace=w and user_id=u and active) then
      return jsonb_build_object('error','피플팀 관리자 권한이 없습니다.');
    end if;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rows_json from (
      select p.id,p.created_at,p.month,p.status,p.sender,p.recipient,
        coalesce(es.name,p.sender) sender_name,coalesce(er.name,p.recipient) recipient_name,
        p.sender_team,p.recipient_team,p.core_value,p.body,
        coalesce(ev.name,p.reviewer) reviewer_name,p.reviewed_at,p.reason
      from thankyou.praises p
      left join thankyou.employees es on es.workspace=p.workspace and es.user_id=p.sender
      left join thankyou.employees er on er.workspace=p.workspace and er.user_id=p.recipient
      left join thankyou.employees ev on ev.workspace=p.workspace and ev.user_id=p.reviewer
      where p.workspace=w and (status_filter='all' or p.status=status_filter)
      order by p.created_at desc,p.id desc
    ) x;
    insert into thankyou.audit(workspace,actor,action) values(w,u,'csv_export');
    return jsonb_build_object('rows',rows_json);
  end if;
  if p_op='oauth_create' then
    delete from thankyou.oauth_states where expires_at < now();
    insert into thankyou.oauth_states values(p_data->>'hash',now()+interval '10 minutes');
    return '{}'::jsonb;
  elsif p_op='oauth_consume' then
    delete from thankyou.oauth_states where hash=p_data->>'hash' and expires_at>now();
    return jsonb_build_object('valid',found);
  elsif p_op='install' then
    if w <> 'T159QLK7G' or not exists(select 1 from thankyou.admins where workspace=w and user_id=u and active) then
      return jsonb_build_object('error','설치 권한이 없습니다.');
    end if;
    insert into thankyou.installations values(w,p_data->>'token_cipher',now())
      on conflict(workspace) do update set token_cipher=excluded.token_cipher, updated_at=now();
    return '{}'::jsonb;
  elsif p_op='token' then
    select jsonb_build_object('token_cipher',token_cipher) into result from thankyou.installations where workspace=w;
    return coalesce(result,'{}'::jsonb);
  elsif p_op='revoke_install' then
    delete from thankyou.installations where workspace=w;
    update thankyou.jobs set done=true where workspace=w;
    return '{}'::jsonb;
  elsif p_op='enqueue' then
    insert into thankyou.jobs(id,workspace,user_id) values(p_data->>'id',w,u) on conflict do nothing;
    return '{}'::jsonb;
  elsif p_op='claim_job' then
    delete from thankyou.export_tickets where expires_at<=now();
    select * into j from thankyou.jobs where not done and attempts<5 and available_at<=now()
      and (lease_until is null or lease_until<now()) order by available_at for update skip locked limit 1;
    if not found then return null; end if;
    update thankyou.jobs set attempts=attempts+1,lease_until=now()+interval '30 seconds' where id=j.id;
    return to_jsonb(j);
  elsif p_op='finish_job' then
    update thankyou.jobs set done=(p_data->>'success')::boolean,lease_until=null,
      available_at=now()+interval '30 seconds' where id=p_data->>'id';
    return '{}'::jsonb;
  end if;

  if w is distinct from 'T159QLK7G' then return jsonb_build_object('error','허용되지 않은 워크스페이스입니다.'); end if;
  select exists(select 1 from thankyou.admins where workspace=w and user_id=u and active) into admin_ok;
  select * into s from thankyou.employees where workspace=w and user_id=u and active;

  if p_op='home' then
    select * into r from thankyou.praises where workspace=w and sender=u and month=m;
    return jsonb_build_object('eligible',s.user_id is not null,'submitted',r.id is not null,'status',r.status,'admin',admin_ok,
      'quarter_sent',(select count(*) from thankyou.praises where workspace=w and sender=u and month>=q and month<q+interval '3 months'),
      'quarter_received',(select count(*) from thankyou.praises where workspace=w and recipient=u and status='approved' and month>=q and month<q+interval '3 months'));
  elsif p_op='submit' then
    if s.user_id is null then return jsonb_build_object('error','직원·팀 정보 등록이 필요합니다.'); end if;
    -- Directory rows are share-locked against concurrent roster updates while validating.
    perform 1 from thankyou.employees where workspace=w and user_id in (u,p_data->>'recipient') order by user_id for share;
    select * into s from thankyou.employees where workspace=w and user_id=u and active;
    select * into t from thankyou.employees where workspace=w and user_id=p_data->>'recipient' and active;
    if s.user_id is null or t.user_id is null then return jsonb_build_object('error','재직 중인 직원만 참여할 수 있습니다.'); end if;
    if s.user_id=t.user_id then return jsonb_build_object('error','본인은 추천할 수 없습니다.'); end if;
    if not s.org_exempt and nullif(nullif(trim(s.part3),''),'-') is null and nullif(nullif(trim(s.part2),''),'-') is null then
      return jsonb_build_object('error','내 part2·part3 조직 정보가 없어 추천 기준을 확인할 수 없습니다. 피플팀에 문의해주세요.'); end if;
    if not s.org_exempt and thankyou.same_org(s.part2,s.part3,t.part2,t.part3) is true then
      return jsonb_build_object('error','발신자의 part3가 있으면 같은 part3, 없으면 같은 part2 동료는 추천할 수 없습니다.'); end if;
    select * into r from thankyou.praises where workspace=w and request_id=p_data->>'request_id';
    if found then
      if r.sender<>u then return jsonb_build_object('error','요청 정보가 일치하지 않습니다.'); end if;
      return jsonb_build_object('id',r.id);
    end if;
    begin
      insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,request_id)
      values(w,u,t.user_id,s.team,t.team,trim(p_data->>'body'),p_data->>'core_value',m,p_data->>'request_id') returning * into r;
    exception when unique_violation then
      select * into r from thankyou.praises where workspace=w and request_id=p_data->>'request_id' and sender=u;
      if found then return jsonb_build_object('id',r.id); end if;
      return jsonb_build_object('error','이번 달에는 이미 제출했습니다. 반려되어도 월 한도는 유지됩니다.');
    when check_violation or not_null_violation then
      return jsonb_build_object('error','입력 내용을 확인해주세요. 본문 20~2,000자, 핵심가치 선택이 필요합니다.');
    end;
    insert into thankyou.audit(workspace,actor,action,target) values(w,u,'submit',r.id);
    return jsonb_build_object('id',r.id);
  end if;

  if not admin_ok then return jsonb_build_object('error','피플팀 관리자 권한이 없습니다.'); end if;
  if status_filter not in ('all','pending','approved','rejected') then return jsonb_build_object('error','잘못된 상태 필터입니다.'); end if;
  if p_op='export_create' then
    delete from thankyou.export_tickets where expires_at<=now();
    insert into thankyou.export_tickets values(p_data->>'hash',w,u,status_filter,now()+interval '5 minutes');
    return '{}'::jsonb;
  end if;
  if p_op='review_list' then
    cursor_id := nullif(p_data->'cursor'->>'id','')::uuid;
    cursor_at := nullif(p_data->'cursor'->>'created_at','')::timestamptz;
    select jsonb_build_object('total',count(*),'pending',count(*) filter(where status='pending'),
      'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected')) into stats
      from thankyou.praises where workspace=w;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rows_json from (
      select p.id,p.created_at,p.body,p.month,p.core_value,p.sender_team,p.recipient_team,p.status,
        (p.status='pending' and p.sender<>u and p.recipient<>u) can_review,
        coalesce(es.name,p.sender) sender_name,coalesce(er.name,p.recipient) recipient_name
      from thankyou.praises p
      left join thankyou.employees es on es.workspace=p.workspace and es.user_id=p.sender
      left join thankyou.employees er on er.workspace=p.workspace and er.user_id=p.recipient
      where p.workspace=w and (status_filter='all' or p.status=status_filter)
        and (cursor_id is null or (p.created_at,p.id)<(cursor_at,cursor_id)) order by p.created_at desc,p.id desc limit 6
    ) x;
    insert into thankyou.audit(workspace,actor,action) values(w,u,'review_read');
    return stats||jsonb_build_object('filter',status_filter,'rows',case when jsonb_array_length(rows_json)>5 then rows_json-5 else rows_json end,
      'next',case when jsonb_array_length(rows_json)>5 then jsonb_build_object('id',rows_json->4->>'id','created_at',rows_json->4->>'created_at') else null end);
  elsif p_op='review' then
    select * into r from thankyou.praises where workspace=w and id=(p_data->>'id')::uuid for update;
    if not found then return jsonb_build_object('error','접수 건을 찾을 수 없습니다.'); end if;
    if u in (r.sender,r.recipient) then return jsonb_build_object('error','본인 발신·수신 건은 검토할 수 없습니다.'); end if;
    if r.status<>'pending' then
      if r.status=p_data->>'decision' and r.reviewer=u then return jsonb_build_object('id',r.id); end if;
      return jsonb_build_object('error','이미 처리된 건입니다. 검토함을 다시 열어주세요.');
    end if;
    if p_data->>'decision' not in ('approved','rejected') or length(trim(coalesce(p_data->>'reason',''))) not between 2 and 500 then
      return jsonb_build_object('error','승인·반려와 검토 사유를 확인해주세요.');
    end if;
    update thankyou.praises set status=p_data->>'decision',reviewer=u,reviewed_at=now(),reason=trim(p_data->>'reason') where id=r.id;
    insert into thankyou.audit(workspace,actor,action,target) values(w,u,p_data->>'decision',r.id);
    return jsonb_build_object('id',r.id);
  elsif p_op='scores' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
      with approved as (select * from thankyou.praises where workspace=w and status='approved' and month>=q and month<(q+interval '3 months')::date),
      points as (select recipient user_id,count(*)*5 received,0::bigint sent,0::bigint bonus from approved group by recipient
        union all select sender,0,count(*),case when count(*)>=3 then 5 else 0 end from approved group by sender)
      select e.user_id,e.name,sum(p.received) received_points,sum(p.sent) sent_count,sum(p.bonus) sender_points,
        least(100,sum(p.received+p.bonus)) total_points from points p join thankyou.employees e on e.workspace=w and e.user_id=p.user_id
      group by e.user_id,e.name order by e.user_id
    ) x;
    insert into thankyou.audit(workspace,actor,action) values(w,u,'scores_read');
    return jsonb_build_object('quarter_start',q,'rows',result);
  end if;
  return jsonb_build_object('error','지원하지 않는 작업입니다.');
end $$;
revoke all on function public.ty_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.ty_api(text,jsonb) to service_role;

commit;
