-- Proposals only. Obtain People approval on retention before scheduling this.
-- Run daily in trusted SQL/pg_cron context. No public HTTP deletion endpoint.
begin;
-- 365 days is a proposed maximum; deletion also removes associated point history.
delete from thankyou.praises where created_at < now()-interval '365 days';
delete from thankyou.audit where created_at < now()-interval '365 days';
delete from thankyou.jobs where available_at < now()-interval '7 days';
delete from thankyou.oauth_states where expires_at < now();
delete from thankyou.export_tickets where expires_at<now();
commit;
