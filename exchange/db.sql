-- Exchange schema, rank_v2 policy (rank by final score: 1st 30,000P / 2-3rd 25,000P / 4-5th 20,000P / 6-10th 10,000P).
-- Contains no records. Catalog and fictional demo rows live in seed-dev.sql and must never be loaded into production.
-- Gate-zero evaluations (score 0) are recorded but excluded from both quantitative counts (sent/received) and the qualitative average.
-- Apply to the DEV project first. Requires the base thankyou schema (employees, admins, praises).
begin;
create table if not exists thankyou.exchange_products (
 id text primary key, name text not null, category text not null, description text not null,
 price integer not null check(price>0), stock integer not null check(stock>=0), active boolean not null default false,
 icon text not null default 'cup'
);
create table if not exists thankyou.exchange_settlements (
 id uuid primary key default gen_random_uuid(),workspace text not null,quarter text not null,
 version integer not null default 1 check(version>0),state text not null default 'pending' check(state in ('pending','paid')),
 rate integer not null default 1 check(rate between 1 and 1000000),scheme text not null default 'rank_v2' check(scheme in ('rank_v2','score_v1')),prompt_version text not null,
 approved_by text,approved_at timestamptz,created_at timestamptz not null default now(),unique(workspace,quarter),
 check(quarter ~ '^20[0-9]{2}-Q[1-4]$')
);
create table if not exists thankyou.exchange_evaluations (
 settlement uuid not null references thankyou.exchange_settlements(id), praise_id uuid not null,
 employee text not null, scores jsonb not null,score integer not null check(score between 0 and 100),
 primary key(settlement,praise_id)
);
-- gate: pass = scored, vague / no_value = recorded only (score 0, excluded from quantitative and qualitative points). note = short reviewer evidence.
alter table thankyou.exchange_evaluations add column if not exists gate text not null default 'pass' check(gate in ('pass','vague','no_value'));
alter table thankyou.exchange_evaluations add column if not exists note text;
create table if not exists thankyou.exchange_awards (
 settlement uuid not null references thankyou.exchange_settlements(id),employee text not null,
 received integer not null check(received>=0),sent integer not null check(sent>=0),
 quant numeric not null check(quant between 0 and 100),qual numeric check(qual between 0 and 100),
 final numeric check(final between 0 and 100),points integer not null check(points>=0),rank integer check(rank>=1),primary key(settlement,employee)
);
create table if not exists thankyou.exchange_ledger (
 id uuid primary key default gen_random_uuid(),workspace text not null,employee text not null,
 amount integer not null,kind text not null check(kind in ('credit','redeem','refund','adjustment')),
 ref text not null,note text not null,created_at timestamptz not null default now(),unique(workspace,ref)
);
create index if not exists exchange_ledger_employee on thankyou.exchange_ledger(workspace,employee,created_at desc);
create table if not exists thankyou.exchange_orders (
 id uuid primary key default gen_random_uuid(),workspace text not null,employee text not null,
 product text not null references thankyou.exchange_products(id),product_name text not null,cost integer not null check(cost>0),
 state text not null default 'requested' check(state in ('requested','fulfilled','cancelled')),
 request_id text not null,balance_after integer not null check(balance_after>=0),created_at timestamptz not null default now(),completed_at timestamptz,unique(workspace,employee,request_id)
);
create index if not exists exchange_orders_employee on thankyou.exchange_orders(workspace,employee,created_at desc);
create table if not exists thankyou.exchange_audit (
 id uuid primary key default gen_random_uuid(),workspace text not null,actor text not null,
 action text not null,target text,created_at timestamptz not null default now()
);
do $$ declare t text;begin
 foreach t in array array['exchange_products','exchange_settlements','exchange_evaluations','exchange_awards','exchange_ledger','exchange_orders','exchange_audit'] loop
 execute format('alter table thankyou.%I enable row level security',t);
 execute format('revoke all on thankyou.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on thankyou.%I to service_role',t);
 end loop;
end $$;

create or replace function public.ty_exchange(p_op text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 w text:=p_data->>'workspace';u text:=p_data->>'user';
 actor_record thankyou.employees%rowtype;s thankyou.exchange_settlements%rowtype;
 p thankyou.exchange_products%rowtype;o thankyou.exchange_orders%rowtype;
 is_admin boolean;result jsonb;rows_json jsonb;item jsonb;sc jsonb;v integer;maxima integer[]:=array[10,20,5,30,15,10,10];i integer;total integer;g text;pid text;pname text;pprice numeric;pstock numeric;
 balance bigint;new_id uuid;requested_quarter text;quarter_start date;quarter_end date;existing_count integer;evaluated_count integer;
begin
 if current_user<>'service_role' then raise exception 'forbidden';end if;
 if w<>'T159QLK7G' then return jsonb_build_object('error','허용되지 않은 워크스페이스입니다.','status',403);end if;
 select * into actor_record from thankyou.employees where workspace=w and user_id=u and active;
 if not found then return jsonb_build_object('error','활성 직원 계정으로 로그인해주세요.','status',401);end if;
 select exists(select 1 from thankyou.admins where workspace=w and user_id=u and active) into is_admin;
 if p_op in ('admin','approve','fulfill','cancel','stage','product_save') and not is_admin then
 return jsonb_build_object('error','피플팀 관리자만 사용할 수 있어요.','status',403);end if;

 if p_op='snapshot' then
  insert into thankyou.exchange_audit(workspace,actor,action) values(w,u,'view');
  return jsonb_build_object(
   'policy','{"id":"rank_v2","title":"분기 순위별 칭찬포인트","tiers":[{"from":1,"to":1,"points":30000},{"from":2,"to":3,"points":25000},{"from":4,"to":5,"points":20000},{"from":6,"to":10,"points":10000}],"outside":0,"dayLeave":60000,"equipment":50000,"notice":"포인트는 분기마다 이월되어 모아 쓸 수 있어요."}'::jsonb,
   'user',jsonb_build_object('id',u,'name',actor_record.name,'team',actor_record.team,'admin',is_admin,'active',true),
   'balance',(select coalesce(sum(amount),0) from thankyou.exchange_ledger where workspace=w and employee=u),
   'products',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from thankyou.exchange_products where active order by price,id)x),
   'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select ord.*,actor_record.name employee_name,actor_record.team from thankyou.exchange_orders ord where ord.workspace=w and ord.employee=u order by ord.created_at desc)x),
   'ledger',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from thankyou.exchange_ledger where workspace=w and employee=u order by created_at desc)x),
   'settlements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select sett.*,a.employee,a.received,a.sent,a.quant,a.qual,a.final,a.points,a.rank from thankyou.exchange_settlements sett join thankyou.exchange_awards a on a.settlement=sett.id where sett.workspace=w and a.employee=u order by sett.quarter desc)x)
  );
 elsif p_op='admin' then
  insert into thankyou.exchange_audit(workspace,actor,action) values(w,u,'admin_view');
  return jsonb_build_object(
   'employees',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select e.user_id id,e.name,e.team,e.active,
    exists(select 1 from thankyou.admins ad where ad.workspace=w and ad.user_id=e.user_id and ad.active) admin,
    coalesce(l.balance,0) balance,coalesce(l.credited,0) credited,coalesce(l.spent,0) spent,coalesce(l.refunded,0) refunded
    from thankyou.employees e left join (select employee,sum(amount) balance,sum(amount) filter(where kind='credit') credited,-sum(amount) filter(where kind='redeem') spent,sum(amount) filter(where kind='refund') refunded from thankyou.exchange_ledger where workspace=w group by employee)l on l.employee=e.user_id where e.workspace=w order by e.name)x),
   'settlements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from thankyou.exchange_settlements where workspace=w order by quarter desc)x),
   'awards',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select a.*,e.name,e.team,sett.state,sett.quarter from thankyou.exchange_awards a join thankyou.exchange_settlements sett on sett.id=a.settlement join thankyou.employees e on e.workspace=w and e.user_id=a.employee where sett.workspace=w order by e.name)x),
   'orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select ord.*,e.name employee_name,e.team from thankyou.exchange_orders ord left join thankyou.employees e on e.workspace=w and e.user_id=ord.employee where ord.workspace=w order by ord.created_at desc)x),
   'products',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from thankyou.exchange_products order by category,price,id)x),
   'evidence',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select ev.settlement,ev.praise_id,pr.sender,se.name sender_name,pr.recipient,re.name recipient_name,pr.core_value,pr.body,ev.scores,ev.score,ev.gate,ev.note from thankyou.exchange_evaluations ev join thankyou.exchange_settlements sett on sett.id=ev.settlement and sett.workspace=w join thankyou.praises pr on pr.id=ev.praise_id left join thankyou.employees se on se.workspace=w and se.user_id=pr.sender left join thankyou.employees re on re.workspace=w and re.user_id=pr.recipient order by pr.created_at)x),
   'ledger',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select l.*,e.name from thankyou.exchange_ledger l left join thankyou.employees e on e.workspace=w and e.user_id=l.employee where l.workspace=w order by l.created_at desc)x)
  );
 elsif p_op='product_save' then
  -- Catalogue management (People Team only). Existing orders keep their own name/price snapshot.
  pname:=btrim(coalesce(p_data->>'name',''));
  if char_length(pname) not between 1 and 40 then return jsonb_build_object('error','선물 이름은 1~40자로 입력해주세요.');end if;
  if coalesce(p_data->>'category','') not in ('휴가·리프레시','업무 장비','커피·간식','성장·학습','기타') then return jsonb_build_object('error','카테고리를 선택해주세요.');end if;
  if coalesce(p_data->>'price','') !~ '^[0-9]{1,7}$' or (p_data->>'price')::numeric not between 1 and 1000000 then return jsonb_build_object('error','교환 포인트는 1~1,000,000 사이의 정수로 입력해주세요.');end if;
  if coalesce(p_data->>'stock','') !~ '^[0-9]{1,4}$' then return jsonb_build_object('error','수량은 0~9,999 사이의 정수로 입력해주세요.');end if;
  if coalesce(p_data->>'icon','') not in ('cup','snack','book','moon','meal','keyboard','monitor','headset','hub','stand','lamp','card-starbucks','card-cvs','card-olive') then return jsonb_build_object('error','이미지를 선택해주세요.');end if;
  if char_length(coalesce(p_data->>'description','')) > 200 then return jsonb_build_object('error','이용 안내는 200자 이하로 입력해주세요.');end if;
  pid:=nullif(p_data->>'id','');
  if pid is null then
   pid:='p-'||substr(replace(gen_random_uuid()::text,'-',''),1,10);
   insert into thankyou.exchange_products(id,name,category,description,price,stock,active,icon) values(pid,pname,p_data->>'category',btrim(coalesce(p_data->>'description','')),(p_data->>'price')::integer,(p_data->>'stock')::integer,coalesce((p_data->>'active')::boolean,true),p_data->>'icon');
  else
   update thankyou.exchange_products set name=pname,category=p_data->>'category',description=btrim(coalesce(p_data->>'description','')),price=(p_data->>'price')::integer,stock=(p_data->>'stock')::integer,active=coalesce((p_data->>'active')::boolean,true),icon=p_data->>'icon' where id=pid;
   if not found then return jsonb_build_object('error','선물을 찾을 수 없어요.','status',404);end if;
  end if;
  insert into thankyou.exchange_audit(workspace,actor,action,target) values(w,u,case when nullif(p_data->>'id','') is null then 'product_create' else 'product_update' end,pid);
  return jsonb_build_object('ok',true,'id',pid);
 elsif p_op='approve' then
  select * into s from thankyou.exchange_settlements where workspace=w and id=(p_data->>'id')::uuid for update;
  if not found then return jsonb_build_object('error','정산을 찾을 수 없어요.','status',404);end if;
  if s.version<>(p_data->>'version')::integer then return jsonb_build_object('error','정산 버전이 바뀌었어요. 새로고침해주세요.','status',409);end if;
  if s.state='paid' then return jsonb_build_object('ok',true,'already',true);end if;
  if not exists(select 1 from thankyou.exchange_awards a join thankyou.employees e on e.workspace=w and e.user_id=a.employee and e.active where a.settlement=s.id and a.qual is not null) then return jsonb_build_object('error','지급 가능한 대상이 없어요.');end if;
  insert into thankyou.exchange_ledger(workspace,employee,amount,kind,ref,note)
   select w,a.employee,a.points,'credit','settlement:'||s.id||':'||a.employee,left(s.quarter,4)||'년 '||right(s.quarter,1)||'분기 칭찬포인트'
   from thankyou.exchange_awards a join thankyou.employees e on e.workspace=w and e.user_id=a.employee and e.active where a.settlement=s.id and a.qual is not null and a.points>0;
  update thankyou.exchange_settlements set state='paid',approved_by=u,approved_at=now() where id=s.id;
  insert into thankyou.exchange_audit(workspace,actor,action,target) values(w,u,'approve',s.id::text);
  return jsonb_build_object('ok',true);
 elsif p_op='redeem' then
  if coalesce(p_data->>'request_id','') !~ '^[a-zA-Z0-9-]{16,100}$' then return jsonb_build_object('error','교환 요청 번호를 확인해주세요.');end if;
  -- The same wallet lock serializes all debits and cancellation refunds for one employee.
  perform pg_advisory_xact_lock(hashtextextended(w||':'||u,0));
  select * into o from thankyou.exchange_orders where workspace=w and employee=u and request_id=p_data->>'request_id';
  if found then
   if o.product<>p_data->>'product' then return jsonb_build_object('error','이미 사용된 교환 요청 번호예요.','status',409);end if;
   return jsonb_build_object('ok',true,'already',true,'order',to_jsonb(o));
  end if;
  select * into p from thankyou.exchange_products where id=p_data->>'product' and active for update;
  if not found then return jsonb_build_object('error','현재 교환할 수 없는 상품이에요.','status',404);end if;
  if p.stock<1 then return jsonb_build_object('error','상품이 품절됐어요.','status',409);end if;
  select coalesce(sum(amount),0) into balance from thankyou.exchange_ledger where workspace=w and employee=u;
  if balance<p.price then return jsonb_build_object('error','포인트가 부족해요.','status',409);end if;
  insert into thankyou.exchange_orders(workspace,employee,product,product_name,cost,request_id,balance_after) values(w,u,p.id,p.name,p.price,p_data->>'request_id',balance-p.price) returning * into o;
  insert into thankyou.exchange_ledger(workspace,employee,amount,kind,ref,note) values(w,u,-p.price,'redeem','order:'||o.id,p.name);
  -- stock is NOT touched at request time; it decreases when the People Team marks the order as paid out.
  insert into thankyou.exchange_audit(workspace,actor,action,target) values(w,u,'redeem',o.id::text);
  return jsonb_build_object('ok',true,'order',to_jsonb(o));
 elsif p_op in ('fulfill','cancel') then
  select * into o from thankyou.exchange_orders where workspace=w and id=(p_data->>'id')::uuid for update;
  if not found then return jsonb_build_object('error','교환 내역이 없어요.','status',404);end if;
  if o.state<>'requested' then return jsonb_build_object('error','이미 처리된 교환이에요.','status',409);end if;
  if p_op='cancel' then
   perform pg_advisory_xact_lock(hashtextextended(w||':'||o.employee,0));
   insert into thankyou.exchange_ledger(workspace,employee,amount,kind,ref,note) values(w,o.employee,o.cost,'refund','refund:'||o.id,o.product_name||' 취소 환불');
  end if;
  if p_op='fulfill' then
   select * into p from thankyou.exchange_products where id=o.product for update;
   if not found or p.stock<1 then return jsonb_build_object('error','남은 수량이 없어 지급 처리할 수 없어요. 취소·환불로 처리해주세요.','status',409);end if;
   update thankyou.exchange_products set stock=stock-1 where id=p.id;
  end if;
  update thankyou.exchange_orders set state=case when p_op='cancel' then 'cancelled' else 'fulfilled' end,completed_at=now() where id=o.id;
  insert into thankyou.exchange_audit(workspace,actor,action,target) values(w,u,p_op,o.id::text);
  return jsonb_build_object('ok',true);
 elsif p_op='stage' then
  -- Called only by an approved server-side evaluator/operator, never by a browser endpoint.
  -- Quantitative counts come from actual praise records, not submitted client counts.
  requested_quarter:=p_data->>'quarter';
  if coalesce(requested_quarter,'') !~ '^20[0-9]{2}-Q[1-4]$' then return jsonb_build_object('error','분기를 확인해주세요.');end if;
  quarter_start:=make_date(left(requested_quarter,4)::integer,(right(requested_quarter,1)::integer-1)*3+1,1);
  quarter_end:=(quarter_start+interval '3 months')::date;
  if quarter_end>(clock_timestamp() at time zone 'Asia/Seoul')::date then return jsonb_build_object('error','종료된 분기만 정산할 수 있어요.');end if;
  if coalesce(p_data->>'prompt_version','')='' or jsonb_typeof(p_data->'evaluations') is distinct from 'array' then return jsonb_build_object('error','프롬프트·평가 결과가 필요해요.');end if;
  perform pg_advisory_xact_lock(hashtextextended(w||':quarter:'||requested_quarter,0));
  if exists(select 1 from thankyou.exchange_settlements where workspace=w and quarter=requested_quarter) then return jsonb_build_object('error','이미 정산된 분기예요. 덮어쓰지 않고 변경 정산으로 처리해야 합니다.','status',409);end if;
  select count(*) into existing_count from thankyou.praises where workspace=w and month>=quarter_start and month<quarter_end;
  if existing_count=0 or jsonb_array_length(p_data->'evaluations')<>existing_count then return jsonb_build_object('error','전체 접수와 평가 건수가 일치해야 해요.');end if;
  insert into thankyou.exchange_settlements(workspace,quarter,rate,scheme,prompt_version) values(w,requested_quarter,1,'rank_v2',p_data->>'prompt_version') returning * into s;
  for item in select value from jsonb_array_elements(p_data->'evaluations') loop
   sc:=item->'scores';if jsonb_typeof(sc) is distinct from 'array' or jsonb_array_length(sc)<>7 then raise exception '7 component scores required';end if;total:=0;
   for i in 0..6 loop
    if coalesce(sc->>i,'') !~ '^[0-9]{1,2}$' then raise exception 'integer score required';end if;
    v:=(sc->>i)::integer;if v<0 or v>maxima[i+1] then raise exception 'component score out of range';end if;total:=total+v;
   end loop;
   g:=coalesce(nullif(item->>'gate',''),case when total>0 then 'pass' else 'vague' end);
   if g not in ('pass','vague','no_value') or ((g='pass')<>(total>0)) then raise exception 'gate and score mismatch';end if;
   insert into thankyou.exchange_evaluations(settlement,praise_id,employee,scores,score,gate,note)
    select s.id,pr.id,pr.recipient,sc,total,g,left(item->>'note',400) from thankyou.praises pr where pr.id=(item->>'praise_id')::uuid and pr.workspace=w and pr.month>=quarter_start and pr.month<quarter_end;
   if not found then raise exception 'praise not in settlement quarter';end if;
  end loop;
  select count(*) into evaluated_count from thankyou.exchange_evaluations where settlement=s.id;
  if evaluated_count<>existing_count then raise exception 'evaluation coverage mismatch';end if;
  insert into thankyou.exchange_awards(settlement,employee,received,sent,quant,qual,final,points,rank)
   select s.id,y.user_id,y.received,y.sent,y.quant,y.qual,y.final,
    case when y.rk is null then 0 when y.rk=1 then 30000 when y.rk<=3 then 25000 when y.rk<=5 then 20000 when y.rk<=10 then 10000 else 0 end,y.rk
   from (select x.*,case when x.final is not null then rank() over(order by x.final desc nulls last)::integer end rk from (
    select e.user_id,coalesce(r.n,0) received,coalesce(t.n,0) sent,
     least(100,coalesce(r.n,0)*5+case when coalesce(t.n,0)>=3 then 5 else 0 end) quant,v.qual,
     case when v.qual is not null then (least(100,coalesce(r.n,0)*5+case when coalesce(t.n,0)>=3 then 5 else 0 end)+v.qual)/2 end final
    from thankyou.employees e
    left join (select employee recipient,count(*) n from thankyou.exchange_evaluations where settlement=s.id and score>0 group by employee)r on r.recipient=e.user_id
    left join (select pr.sender,count(*) n from thankyou.exchange_evaluations ev join thankyou.praises pr on pr.id=ev.praise_id where ev.settlement=s.id and ev.score>0 group by pr.sender)t on t.sender=e.user_id
    left join (select employee,avg(score) qual from thankyou.exchange_evaluations where settlement=s.id and score>0 group by employee)v on v.employee=e.user_id
    where e.workspace=w and e.active)x)y;
  insert into thankyou.exchange_audit(workspace,actor,action,target) values(w,u,'stage',s.id::text);
  return jsonb_build_object('ok',true,'id',s.id,'state','pending');
 end if;
 return jsonb_build_object('error','지원하지 않는 요청이에요.','status',404);
end $$;
revoke all on function public.ty_exchange(text,jsonb) from public,anon,authenticated;
grant execute on function public.ty_exchange(text,jsonb) to service_role;
commit;
