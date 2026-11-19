export class SafeError extends Error {}
export function clients(env, request = fetch) {
  return {
    async db(op, data = {}, timeout = 1800) {
      const response = await request(`${env.SUPABASE_URL}/rest/v1/rpc/ty_api`, {
        method:'POST', headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type':'application/json'},
        body:JSON.stringify({p_op:op, p_data:data}), signal:AbortSignal.timeout(timeout)
      });
      if (!response.ok) throw new SafeError('DB 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
      const result = await response.json();
      if (result?.error) throw new SafeError(result.error);
      return result;
    },
    async slack(method, token, data, timeout = 1800) {
      // Fixed API destination; never follow user-supplied response_url/webhook URLs.
      const response = await request(`https://slack.com/api/${method}`, {
        method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json; charset=utf-8'},
        body:JSON.stringify(data), signal:AbortSignal.timeout(timeout)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new SafeError('Slack 요청을 완료하지 못했습니다. 앱 홈을 다시 열어주세요.');
      return result;
    }
  };
}
