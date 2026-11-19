begin;
alter table thankyou.praises drop constraint if exists praises_status_check;
alter table thankyou.praises add constraint praises_status_check check(status in ('pending','approved','rejected','submitted'));
alter table thankyou.praises alter column status set default 'submitted';
do $patch$
declare d text;
begin
 select pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure) into d;
 d:=replace(d,'recipient=u and status=''approved'' and month>=q','recipient=u and month>=q');
 d:=replace(d,'status=''approved'' and month>=q','month>=q');
 d:=replace(d,'with approved as (','with quarter_praises as (');
 d:=replace(d,'from approved group by','from quarter_praises group by');
 d:=replace(d,'(p.status=''pending'' and p.sender<>u and p.recipient<>u) can_review','false can_review');
 d:=replace(d,'status_filter text := coalesce(p_data->>''filter'',''all'')','status_filter text := ''all''');
 d:=replace(d,'status_filter:=ticket.status_filter','status_filter:=''all''');
 d:=replace(d,'status_filter := coalesce(p_data->>''filter'',''all'')','status_filter := ''all''');
 if position('승인·반려 절차는 사용하지 않습니다.' in d)=0 then d:=replace(d,'elsif p_op=''review'' then','elsif p_op=''review'' then return jsonb_build_object(''error'',''승인·반려 절차는 사용하지 않습니다.'');');end if;
 execute d;
end $patch$;
commit;
select column_default as new_submission_default from information_schema.columns where table_schema='thankyou' and table_name='praises' and column_name='status';
