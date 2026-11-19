import {createHmac, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv, createHash} from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function equal(a, b) {
  const x = Buffer.from(a ?? ''), y = Buffer.from(b ?? '');
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifySlack(raw, headers, secret, now = Date.now()) {
  const ts = headers['x-slack-request-timestamp'];
  if (!/^\d+$/.test(ts ?? '') || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  return equal(headers['x-slack-signature'], `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`);
}
export function encrypt(token, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map(x => x.toString('base64url')).join('.');
}
export function decrypt(token, key) {
  const [iv, tag, body] = token.split('.').map(x => Buffer.from(x, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8');
}
export function kstPeriod(date) {
  const local = new Date(date.getTime() + 9 * 3600000);
  return {month: local.toISOString().slice(0, 7), quarter: `${local.getUTCFullYear()}-Q${Math.floor(local.getUTCMonth()/3)+1}`};
}
