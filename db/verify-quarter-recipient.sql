-- Tests are rolled back; no real employee/praise changes persist.
begin;
set local role service_role;
do $$
declare w text:='T159QLK7G'; q date:=date_trunc('quarter',now() at time zone 'Asia/Seoul')::date; r jsonb; blocked boolean:=false;
begin
 insert into thankyou.employees(workspace,user_id,name,team,part2) values(w,'UQTESTA','규칙테스트A','QA','QA'),(w,'UQTESTB','규칙테스트B','QB','QB'),(w,'UQTESTC','규칙테스트C','QC','QC');
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,status,request_id)
 values(w,'UQTESTA','UQTESTB','QA','QB',repeat('가',25),'growth',q,'rejected','q-rule-first');
 begin
  insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,quota_waived,request_id)
  values(w,'UQTESTA','UQTESTB','QA','QB',repeat('가',25),'growth',(q+interval '1 month')::date,true,'q-rule-second');
 exception when check_violation then blocked:=SQLERRM like '같은 동료에게는 분기당%'; end;
 assert blocked,'repeat recipient accepted despite rejected original or monthly waiver';
 insert into thankyou.praises(workspace,sender,recipient,sender_team,recipient_team,body,core_value,month,request_id)
 values(w,'UQTESTB','UQTESTA','QB','QA',repeat('가',25),'growth',q,'q-rule-reverse'),
 (w,'UQTESTA','UQTESTC','QA','QC',repeat('가',25),'growth',(q+interval '1 month')::date,'q-rule-other'),
 (w,'UQTESTA','UQTESTB','QA','QB',repeat('가',25),'growth',(q+interval '3 months')::date,'q-rule-next');
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UQTESTA','recipient','UQTESTB','body',repeat('가',25),'core_value','growth','request_id','q-rule-api'));
 assert r->>'error' like '같은 동료에게는 분기당%','specific validation message missing';
 r:=public.ty_api('submit',jsonb_build_object('workspace',w,'user','UQTESTA','recipient','UQTESTB','body',repeat('가',25),'core_value','growth','request_id','q-rule-first'));
 assert r ? 'id','existing submission retry not idempotent';
 update thankyou.praises set status='approved' where workspace=w and request_id='q-rule-first';
 assert not has_function_privilege('anon','thankyou.enforce_quarter_recipient()','execute'),'anonymous trigger execution permitted';
end $$;
rollback;
select 'PASS: repeat blocked, reverse/other/next quarter allowed, rejected and test waiver counted, retry preserved; fixtures rolled back' as result;
