-- Idempotent patch; preserves the currently deployed function and permissions.
begin;
do $patch$
declare definition text; old_rule text := 'case when count(*)>=3 then 1 else 0 end'; new_rule text := 'case when count(*)>=3 then 5 else 0 end';
begin
 select pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure) into definition;
 if position(old_rule in definition)>0 then execute replace(definition,old_rule,new_rule);
 elsif position(new_rule in definition)=0 then raise exception 'Scoring rule not recognized; no changes applied'; end if;
end $patch$;
commit;
select position('case when count(*)>=3 then 5 else 0 end' in pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure))>0 as sender_bonus_is_five;
