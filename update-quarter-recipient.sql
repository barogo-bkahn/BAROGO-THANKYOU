-- Existing records remain intact. Enforce the rule on new submissions and pair/month edits.
begin;
create or replace function thankyou.enforce_quarter_recipient()
returns trigger language plpgsql security invoker set search_path=pg_catalog,thankyou as $$
declare quarter_start date;
begin
 if TG_OP='UPDATE' and (new.workspace,new.sender,new.recipient,new.month) is not distinct from (old.workspace,old.sender,old.recipient,old.month) then return new; end if;
 quarter_start:=make_date(extract(year from new.month)::int,((extract(month from new.month)::int-1)/3)*3+1,1);
 perform pg_advisory_xact_lock(hashtextextended(new.workspace||':'||new.sender||':'||quarter_start::text,0));
 if exists(select 1 from thankyou.praises p where p.workspace=new.workspace and p.sender=new.sender and p.recipient=new.recipient and p.month>=quarter_start and p.month<quarter_start+interval '3 months' and p.id<>new.id and p.request_id<>new.request_id) then
  raise exception using errcode='23514', message='같은 동료에게는 분기당 한 번만 칭찬할 수 있어요. 이번에는 다른 동료의 좋은 행동을 찾아주세요.';
 end if;
 return new;
end $$;
revoke all on function thankyou.enforce_quarter_recipient() from public,anon,authenticated;
grant execute on function thankyou.enforce_quarter_recipient() to service_role;
drop trigger if exists praises_quarter_recipient on thankyou.praises;
create trigger praises_quarter_recipient before insert or update of workspace,sender,recipient,month on thankyou.praises for each row execute function thankyou.enforce_quarter_recipient();
do $patch$
declare d text; old_rule text:='when check_violation or not_null_violation then'; new_rule text:=$rule$when check_violation then
      if SQLERRM like '같은 동료에게는 분기당%' then return jsonb_build_object('error',SQLERRM); end if;
      return jsonb_build_object('error','입력 내용을 확인해주세요. 본문 20~2,000자, 핵심가치 선택이 필요합니다.');
    when not_null_violation then$rule$;
begin
 select pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure) into d;
 if position(old_rule in d)>0 then execute replace(d,old_rule,new_rule);
 elsif position('SQLERRM like ''같은 동료에게는 분기당%''' in d)=0 then raise exception 'Submission handler not recognized'; end if;
end $patch$;
commit;
select exists(select 1 from pg_trigger where tgname='praises_quarter_recipient' and tgrelid='thankyou.praises'::regclass and not tgisinternal) as quarter_recipient_rule_enabled;
