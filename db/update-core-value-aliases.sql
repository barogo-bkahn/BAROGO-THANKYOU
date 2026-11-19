begin;
create table if not exists thankyou.core_values (
 code text primary key, name_en text not null, name_ko text not null,
 nickname text not null, description text not null
);
alter table thankyou.core_values enable row level security;
revoke all on thankyou.core_values from public,anon,authenticated;
grant select on thankyou.core_values to service_role;
insert into thankyou.core_values(code,name_en,name_ko,nickname,description) values
('breakthrough','Breakthrough','돌파','막힘없는 해결사!','새로운 방법으로 막힌 문제를 풀어줬어요'),
('altruism','Altruism','이타심','동료의 든든한 지원군!','다른 팀의 어려움도 자기 일처럼 도와줬어요'),
('right_choice','Right Choice','옳은 선택','원칙 지킴이!','번거롭더라도 사실과 원칙에 따라 판단했어요'),
('optimization','Optimization','최적화','비효율 해결사!','반복되는 불편을 줄이고 일의 흐름을 개선했어요'),
('growth','Growth','성장','프로학습러!','꾸준히 배우고 새로운 방법을 업무에 적용했어요'),
('ownership','Ownership','오너십','책임감 만렙!','맡은 일의 결과를 끝까지 확인하고 책임졌어요')
on conflict(code) do update set name_en=excluded.name_en,name_ko=excluded.name_ko,nickname=excluded.nickname,description=excluded.description;

alter table thankyou.praises add constraint praises_core_value_fkey foreign key(core_value) references thankyou.core_values(code);
commit;
select code,name_en,name_ko,nickname from thankyou.core_values order by code;
