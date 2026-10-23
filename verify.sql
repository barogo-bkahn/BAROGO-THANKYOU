-- All fixtures roll back, including audit rows. Run in SQL Editor after schema.sql.
begin;
set local role service_role;
do $$
declare
 w text:='T159QLK7G'; r jsonb; id text;
 q date:=date_trunc('quarter',now() at time zone 'Asia/Seoul')::date;
begin
 insert into thankyou.employees(workspace,user_id,name,team) values
 (w,'UTESTA','테스트A','A'),(w,'UTESTB','테스트B','B'),(w,'UTESTC','테스트C','A'),(w,'UTESTADMIN','테스트관리자','P');
 update thankyou.employees set part2=team where user_id like 'UTEST%';
 insert into thankyou.admins values(w,'UTESTADMIN',true),(w,'UTESTA',true);
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTA','body',repeat('가',25),'core_value','growth','request_id','test-self'));
 assert r ? 'error','self nomination accepted';
 assert thankyou.same_org('X','팀A','Y','팀A') is true,'part1/part2 must not override equal part3';
 assert thankyou.same_org('X','팀A','X','팀B') is false,'different part3 allowed';
 assert thankyou.same_org('X',null,'X','팀B') is true,'sender without part3 must use part2';
 assert thankyou.same_org('X','팀A','X',null) is not true,'reverse direction may differ';
 assert thankyou.same_org('X','-','X','팀B') is true,'dash must mean empty';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTC','body',repeat('가',25),'core_value','growth','request_id','test-same'));
 assert r ? 'error','same team accepted';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UMISSING','body',repeat('가',25),'core_value','growth','request_id','test-missing'));
 assert r ? 'error','missing recipient accepted';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTB','body',repeat('가',25),'core_value','growth','request_id','test-valid'));
 assert r ? 'id','valid nomination rejected'; id:=r->>'id';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTB','body',repeat('가',25),'core_value','growth','request_id','test-valid'));
 assert r->>'id'=id,'retry duplicated';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTB','body',repeat('가',25),'core_value','growth','request_id','test-duplicate'));
 assert r ? 'error','monthly duplicate accepted';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTC','id',id,'decision','approved','reason','테스트'));
 assert r ? 'error','non-admin approved';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTA','id',id,'decision','approved','reason','테스트'));
 assert r ? 'error','sender self reviewed';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTADMIN','id',id,'decision','approved','reason','테스트'));
 assert r ? 'id','admin approval failed';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTADMIN','id',id,'decision','approved','reason','테스트'));
 assert r ? 'id','approval retry not idempotent';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTADMIN','id',id,'decision','rejected','reason','테스트'));
 assert r ? 'error','final decision overwritten';
 -- Exceptions bypass organization restriction, but never self nomination.
 delete from thankyou.praises where workspace=w and sender='UTESTA';
 update thankyou.employees set org_exempt=true,part2=null,part3=null where workspace=w and user_id='UTESTA';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTA','body',repeat('가',25),'core_value','growth','request_id','test-exempt-self'));
 assert r ? 'error','exception allowed self nomination';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTC','body',repeat('가',25),'core_value','growth','request_id','test-exempt-other'));
 assert r ? 'id','exception failed without organization';
 -- Build exactly 3 approved submissions in this quarter, independent of current month.
 delete from thankyou.praises where workspace=w and sender='UTESTA';
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,status,request_id)
 select w,'UTESTA','UTESTB','A','B',repeat('가',25),'growth',(q+n*interval '1 month')::date,'approved','test-quarter-'||n from generate_series(0,2)n;
 r:=public.ty_api('scores',jsonb_build_object('workspace',w,'user','UTESTADMIN'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UTESTA' and (x->>'sent_count')::int=3 and (x->>'sender_points')::int=1),'sender threshold wrong';
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UTESTB' and (x->>'received_points')::int=15),'recipient points wrong';
 update thankyou.admins set active=false where workspace=w and user_id='UTESTADMIN';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN'));
 assert r ? 'error','revoked admin still authorized';
 assert not has_function_privilege('anon','public.ty_api(text,jsonb)','execute'),'anon can execute';
 assert not has_function_privilege('authenticated','public.ty_api(text,jsonb)','execute'),'authenticated can execute';
 assert not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='thankyou' and c.relkind='r' and not c.relrowsecurity),'RLS disabled';
end $$;
rollback;
select 'PASS: DB validation, idempotency, authorization, scores and RLS; fixtures rolled back' as result;
