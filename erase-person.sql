-- Parameterized example for psql. Confirm subject, impact and retention/legal hold first.
-- psql --set=subject=U123 --file=db/erase-person.sql
begin;
delete from thankyou.export_tickets where workspace='T159QLK7G' and actor=:'subject';
delete from thankyou.praises where workspace='T159QLK7G' and (sender=:'subject' or recipient=:'subject');
-- Reviewer removal does not discard other employees' valid praise.
update thankyou.praises set reviewer=null,reason=null where workspace='T159QLK7G' and reviewer=:'subject';
delete from thankyou.audit where workspace='T159QLK7G' and actor=:'subject';
delete from thankyou.jobs where workspace='T159QLK7G' and user_id=:'subject';
delete from thankyou.admins where workspace='T159QLK7G' and user_id=:'subject';
delete from thankyou.employees where workspace='T159QLK7G' and user_id=:'subject';
commit;
