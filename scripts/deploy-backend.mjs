import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runtimeFunctions, runtimeSettings, validateSettings } from './deployment-settings.mjs';

const env = process.env;
validateSettings(env);
const base = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`;
async function management(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  // Do not print provider bodies: they may echo credentials or SQL data.
  if (!response.ok) throw new Error(`Backend operation ${path} failed (${response.status}); inspect provider settings privately`);
  return response.json();
}
async function query(sql) { return management('/database/query', { query: sql }); }
const readiness = await query("select to_regclass('public.access_keys') is not null and to_regclass('public.oxapay_orders') is not null and to_regprocedure('public.save_tiktok_order_key(uuid,text,timestamptz)') is not null as ready");
if (!readiness[0]?.ready) throw new Error('Target needs the existing application database restored first; empty databases are not bootstrapped automatically.');

if (env.APPLY_PAYMENT_MIGRATIONS === 'true') {
  // Only additive hardened-payment upgrades supported on an initialized target.
  await query("create table if not exists public.repo_deployment_migrations(name text primary key, sha256 text not null, applied_at timestamptz not null default now()); revoke all on public.repo_deployment_migrations from public,anon,authenticated; grant all on public.repo_deployment_migrations to service_role; alter table public.repo_deployment_migrations enable row level security;");
  const journal = JSON.parse(await readFile('drizzle/migrations/meta/_journal.json', 'utf8'));
  for (const entry of journal.entries.filter(item => item.idx >= 5)) {
    if (!/^\d{4}_[a-z0-9_]+$/.test(entry.tag)) throw new Error('Invalid migration name');
    const sql = await readFile(`drizzle/migrations/${entry.tag}.sql`, 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex');
    const applied = await query(`select sha256 from public.repo_deployment_migrations where name='${entry.tag}'`);
    if (applied.length) {
      if (applied[0].sha256 !== hash) throw new Error('Applied migration changed; refusing deployment');
      continue;
    }
    // Existing targets may already have this upgrade from the managed deployment.
    const already = entry.idx === 5
      ? await query("select to_regprocedure('public.fulfill_verified_oxapay_order(uuid,text,numeric,text,text,text)') is not null as ready")
      : [{ ready: false }];
    const changes = already[0]?.ready ? '' : sql;
    await query(`begin; select pg_advisory_xact_lock(749182); ${changes}\n insert into public.repo_deployment_migrations(name,sha256) values ('${entry.tag}','${hash}'); commit;`);
    console.log(`Payment upgrade checked: ${entry.tag}`);
  }
}
const values = runtimeSettings.filter(name => env[name]).map(name => ({ name, value: env[name] }));
await management('/secrets', values);
const deployed = spawnSync('supabase', ['functions', 'deploy', ...runtimeFunctions, '--project-ref', env.SUPABASE_PROJECT_REF, '--use-api', '--no-verify-jwt'], { env, stdio: 'pipe' });
if (deployed.status !== 0) throw new Error('Function deployment failed; no webhook was changed');
console.log('Runtime functions deployed; diagnostics and one-shot setup excluded.');

async function telegram(token, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed; existing credentials were not printed`);
  return result.result;
}
if (env.REGISTER_TELEGRAM_WEBHOOKS === 'true') {
  const bots = [{ token: env.PUBLIC_TELEGRAM_BOT_TOKEN, secret: env.PUBLIC_TELEGRAM_WEBHOOK_SECRET, fn: 'public-telegram-webhook' }];
  if (env.TELEGRAM_BOT_TOKEN) bots.push({ token: env.TELEGRAM_BOT_TOKEN, secret: env.TELEGRAM_WEBHOOK_SECRET || createHash('sha256').update(`admin-telegram-webhook:${env.TELEGRAM_BOT_TOKEN}`).digest('hex'), fn: 'telegram-webhook' });
  for (const bot of bots) {
    const url = `https://${env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/${bot.fn}`;
    await telegram(bot.token, 'setWebhook', { url, secret_token: bot.secret, allowed_updates: ['message', 'callback_query'] });
    const info = await telegram(bot.token, 'getWebhookInfo', {});
    if (info.url !== url) throw new Error('Telegram webhook readback mismatch');
    console.log(`${bot.fn}: registration verified`);
  }
}
for (const fn of ['oxapay-callback', 'public-telegram-webhook', 'telegram-webhook']) {
  const response = await fetch(`https://${env.SUPABASE_PROJECT_REF}.supabase.co/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000) });
  if (response.status !== 401) throw new Error(`Unsigned ${fn} request was not rejected; review deployment`);
}
console.log('Unsigned payment and Telegram requests rejected. No payment or key was created.');