-- All fixtures roll back, including audit rows. Run in SQL Editor after schema.sql.
begin;
set local role service_role;
do $$
declare
 w text:='T159QLK7G'; r jsonb; id text; first_page jsonb;
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
 -- Release one original test submission without losing its review/audit data.
 update thankyou.praises set quota_waived=true where workspace=w and request_id='test-valid' and sender='UTESTA';
 r:=public.ty_api('home',jsonb_build_object('workspace',w,'user','UTESTA'));
 assert (r->>'submitted')::boolean=false,'released quota still blocked home';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTB','body',repeat('가',25),'core_value','growth','request_id','test-extra'));
 assert r ? 'id','extra test submission rejected';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UTESTA','recipient','UTESTB','body',repeat('가',25),'core_value','growth','request_id','test-extra-blocked'));
 assert r ? 'error','more than one extra test submission allowed';
 delete from thankyou.praises where workspace=w and request_id='test-extra';
 update thankyou.praises set quota_waived=false where workspace=w and sender='UTESTA';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTA'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'id'=id and (x->>'can_review')::boolean=false),'sender admin cannot read own praise safely';
 insert into thankyou.admins values(w,'UTESTB',true);
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTB'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'id'=id and (x->>'can_review')::boolean=false),'recipient admin cannot read own praise safely';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UTESTB','id',id,'decision','approved','reason','테스트'));
 assert r ? 'error','recipient self reviewed';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'id'=id and (x->>'can_review')::boolean=true),'unrelated admin cannot review';
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
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTA'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'id'=id and x->>'status'='approved' and (x->>'can_review')::boolean=false),'completed own praise disappeared';
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
 select w,'UTESTA',case n when 0 then 'UTESTB' when 1 then 'UTESTC' else 'UTESTADMIN' end,'A','B',repeat('가',25),'growth',(q+n*interval '1 month')::date,'approved','test-quarter-'||n from generate_series(0,2)n;
 r:=public.ty_api('scores',jsonb_build_object('workspace',w,'user','UTESTADMIN'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UTESTA' and (x->>'sent_count')::int=3 and (x->>'sender_points')::int=5),'sender threshold wrong';
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UTESTB' and (x->>'received_points')::int=5),'recipient points wrong';
 r:=public.ty_api('home',jsonb_build_object('workspace',w,'user','UTESTA'));
 assert (r->>'quarter_sent')::int=3,'home sent quarter count wrong';
 r:=public.ty_api('home',jsonb_build_object('workspace',w,'user','UTESTB'));
 assert (r->>'quarter_received')::int=1,'home received quarter count wrong';
 -- Seven future-dated fixtures guarantee a deterministic first page without touching real rows.
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,status,request_id,created_at)
 select w,'UTESTPAGE'||n,'UTESTB','A','B',repeat('가',25),'growth',q,'pending','test-page-'||n,now()+n*interval '1 second' from generate_series(1,7)n;
 first_page:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN','filter','pending'));
 assert jsonb_array_length(first_page->'rows')=5 and first_page->'next'<>'null'::jsonb,'pagination first page wrong';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN','filter','pending','cursor',first_page->'next'));
 assert not exists(select 1 from jsonb_array_elements(r->'rows') x join jsonb_array_elements(first_page->'rows') y on x->>'id'=y->>'id'),'pagination duplicated rows';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN','filter','approved'));
 assert not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'status'<>'approved'),'filter leaked other status';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTC'));
 assert r ? 'error','ordinary employee read admin list';
 r:=public.ty_api('export_create',jsonb_build_object('workspace',w,'user','UTESTC','hash','test-not-admin'));
 assert r ? 'error','ordinary employee exported';
 r:=public.ty_api('export_create',jsonb_build_object('workspace',w,'user','UTESTADMIN','hash','test-export','filter','approved'));
 assert not (r ? 'error'),'admin export denied';
 r:=public.ty_api('export_download',jsonb_build_object('hash','test-export'));
 assert jsonb_array_length(r->'rows')>=3 and not exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'status'<>'approved'),'CSV filter wrong';
 r:=public.ty_api('export_download',jsonb_build_object('hash','test-export'));
 assert r ? 'error','download ticket reused';
 r:=public.ty_api('export_create',jsonb_build_object('workspace',w,'user','UTESTADMIN','hash','test-revoked'));
 update thankyou.admins set active=false where workspace=w and user_id='UTESTADMIN';
 r:=public.ty_api('export_download',jsonb_build_object('hash','test-revoked'));
 assert r ? 'error','revoked admin downloaded';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UTESTADMIN'));
 assert r ? 'error','revoked admin still authorized';
 assert not has_function_privilege('anon','public.ty_api(text,jsonb)','execute'),'anon can execute';
 assert not has_function_privilege('authenticated','public.ty_api(text,jsonb)','execute'),'authenticated can execute';
 assert not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='thankyou' and c.relkind='r' and not c.relrowsecurity),'RLS disabled';
end $$;
rollback;
select 'PASS: DB validation, idempotency, authorization, scores and RLS; fixtures rolled back' as result;


