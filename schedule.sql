-- Run after deployment and after saving WORKER_SECRET in Edge Secrets and Vault.
-- Vault secret name: thankyou_worker_secret. Never hard-code the secret in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('thankyou-home-retry','* * * * *',$cron$
  select net.http_post(
    url:='https://xzyummywoqfvyhdnoyeb.supabase.co/functions/v1/thankyou/internal/tick',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='thankyou_worker_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=5000
  );
$cron$);
-- Approved maximum retention: 365 days. Audit and jobs contain no praise body.
select cron.schedule('thankyou-retention','15 18 * * *',$cron$
  delete from thankyou.praises where created_at<now()-interval '365 days';
  delete from thankyou.audit where created_at<now()-interval '365 days';
  delete from thankyou.jobs where available_at<now()-interval '7 days';
  delete from thankyou.oauth_states where expires_at<now();
$cron$);
