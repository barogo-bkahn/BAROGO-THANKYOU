begin;

-- Future submissions are limited without changing historical praise records.
create index if not exists praises_month_sender_lookup
  on thankyou.praises(workspace, sender, month);

create or replace function thankyou.enforce_monthly_limit()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, thankyou
as $monthly$
begin
  if TG_OP = 'UPDATE' and
     (new.workspace, new.sender, new.month) is not distinct from
     (old.workspace, old.sender, old.month) then
    return new;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(new.workspace || ':' || new.sender || ':' || new.month::text, 0)
  );
  if exists (
    select 1 from thankyou.praises p
    where p.workspace = new.workspace and p.sender = new.sender
      and p.month = new.month and p.id is distinct from new.id
  ) then
    raise check_violation using message =
      '이번 달에는 이미 칭찬을 남겼어요. 다음 달에 다시 참여할 수 있어요.';
  end if;
  return new;
end
$monthly$;

revoke all on function thankyou.enforce_monthly_limit() from public, anon, authenticated;
grant execute on function thankyou.enforce_monthly_limit() to service_role;
drop trigger if exists praises_monthly_limit on thankyou.praises;
create trigger praises_monthly_limit
  before insert or update of workspace, sender, month on thankyou.praises
  for each row execute function thankyou.enforce_monthly_limit();

do $patch$
declare
  definition text;
  old_home text := $old$'submitted',false,'status',null$old$;
  new_home text := $new$'submitted',exists(select 1 from thankyou.praises where workspace=w and sender=u and month=m),'status',null$new$;
  request_lookup text := $lookup$    select * into r from thankyou.praises where workspace=w and request_id=p_data->>'request_id';$lookup$;
  month_lock text := $lock$    perform pg_advisory_xact_lock(hashtextextended(w||':'||u||':'||m::text,0));$lock$;
  monthly_check text := $check$
    if exists(select 1 from thankyou.praises where workspace=w and sender=u and month=m) then
      return jsonb_build_object('error','이번 달에는 이미 칭찬을 남겼어요. 다음 달에 다시 참여할 수 있어요.');
    end if;
$check$;
begin
  select pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure) into definition;
  if position(old_home in definition) > 0 then
    definition := replace(definition, old_home, new_home);
  elsif position(new_home in definition) = 0 then
    raise exception 'Unrecognized home quota response';
  end if;
  definition := replace(definition, '''participation_rules'',''quarter_recipient_only''',
    '''participation_rules'',''monthly_once_and_quarter_recipient''');
  -- No individual test waiver bypasses the restored operating limit.
  definition := replace(definition, ' and not quota_waived', '');
  definition := replace(definition,
    'Rows flagged quota_waived (individual test exemptions) do not count.',
    'All submissions count toward the monthly participation limit.');
  -- Serialize before replay lookup so concurrent retries return the original ID.
  if position(request_lookup in definition) = 0 then
    raise exception 'Unrecognized submission replay lookup';
  end if;
  definition := replace(definition, month_lock, '');
  definition := replace(definition, request_lookup, month_lock || E'\n' || request_lookup);
  if position('이번 달에는 이미 칭찬을 남겼어요.' in definition) = 0 then
    definition := replace(definition, E'    begin\n      insert into thankyou.praises',
      monthly_check || E'    begin\n      insert into thankyou.praises');
  end if;
  definition := replace(definition,
    $old$if SQLERRM like '같은 동료에게는 분기당%' then$old$,
    $new$if SQLERRM like '같은 동료에게는 분기당%' or SQLERRM like '이번 달에는 이미 칭찬%' then$new$);
  if position(new_home in definition) = 0 or
     position('이번 달에는 이미 칭찬을 남겼어요.' in definition) = 0 then
    raise exception 'Monthly quota patch did not apply';
  end if;
  execute definition;
end
$patch$;

commit;
