begin;
do $patch$
declare d text; old_rule text:='sum(p.received+p.bonus) total_points'; new_rule text:='least(100,sum(p.received+p.bonus)) total_points';
begin
 select pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure) into d;
 if position(new_rule in d)>0 then null;
 elsif position(old_rule in d)>0 then execute replace(d,old_rule,new_rule);
 else raise exception 'Scoring rule not recognized'; end if;
end $patch$;
commit;
select position('least(100,sum(p.received+p.bonus)) total_points' in pg_get_functiondef('public.ty_api(text,jsonb)'::regprocedure))>0 as cap_is_applied,
 least(100,9*5+5)=50 as nine_received_three_sent,
 least(100,20*5+5)=100 as capped_at_one_hundred;
