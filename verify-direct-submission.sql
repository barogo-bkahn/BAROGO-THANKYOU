begin;
set local role service_role;
do $$
declare w text:='T159QLK7G'; q date:=date_trunc('quarter',now() at time zone 'Asia/Seoul')::date; r jsonb;
begin
 insert into thankyou.employees(workspace,user_id,name,team,part2) select w,'UDIRECT'||n,'자동접수테스트'||n,'팀'||n,'팀'||n from generate_series(1,5)n;
 insert into thankyou.admins(workspace,user_id) values(w,'UDIRECT1');
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,status,request_id)
 select w,'UDIRECT'||n,'UDIRECT2','팀'||n,'팀2',repeat('가',25),'growth',q,case n when 1 then 'pending' when 3 then 'approved' when 4 then 'rejected' else 'submitted' end,'direct-receive-'||n from generate_series(1,5)n where n<>2;
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,request_id)
 values(w,'UDIRECT1','UDIRECT3','팀1','팀3',repeat('가',25),'growth',(q+interval '1 month')::date,'direct-send-2'),
 (w,'UDIRECT1','UDIRECT4','팀1','팀4',repeat('가',25),'growth',(q+interval '2 months')::date,'direct-send-3');
 assert (select status='submitted' from thankyou.praises where workspace=w and request_id='direct-send-2'),'new submission not automatic';
 r:=public.ty_api('home',jsonb_build_object('workspace',w,'user','UDIRECT2'));
 assert (r->>'quarter_received')::int=4,'home excludes old rejected/pending rows';
 r:=public.ty_api('scores',jsonb_build_object('workspace',w,'user','UDIRECT1'));
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UDIRECT2' and (x->>'received_points')::int=20),'received points omit statuses';
 assert exists(select 1 from jsonb_array_elements(r->'rows') x where x->>'user_id'='UDIRECT1' and (x->>'sent_count')::int=3 and (x->>'sender_points')::int=5),'sent bonus excludes submissions';
 r:=public.ty_api('review_list',jsonb_build_object('workspace',w,'user','UDIRECT1','filter','rejected'));
 assert r->>'filter'='all','old filter excludes records';
 assert not exists(select 1 from jsonb_array_elements(r->'rows') x where (x->>'can_review')::boolean),'decision action enabled';
 r:=public.ty_api('review',jsonb_build_object('workspace',w,'user','UDIRECT1','id',(select id from thankyou.praises where request_id='direct-receive-4' and workspace=w),'decision','approved','reason','예전 버튼'));
 assert r ? 'error','stale review action accepted';
 assert (select status='rejected' from thankyou.praises where workspace=w and request_id='direct-receive-4'),'legacy record modified';
 assert not has_function_privilege('anon','public.ty_api(text,jsonb)','execute'),'anonymous API access';
end $$;
rollback;
select 'PASS: automatic submission, every status counted, sender bonus, read-only inbox, stale actions denied, history preserved; fixtures rolled back' as result;
