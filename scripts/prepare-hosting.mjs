import { readFile, writeFile } from 'node:fs/promises';
const path = 'vercel.json';
const config = JSON.parse(await readFile(path, 'utf8'));
const backend = process.env.VITE_SUPABASE_URL;
if (!backend || new URL(backend).protocol !== 'https:') throw new Error('Set VITE_SUPABASE_URL to your HTTPS backend');
for (const rule of config.rewrites ?? []) {
  if (rule.source === '/payments/oxapay/callback') rule.destination = `${backend.replace(/\/$/, '')}/functions/v1/oxapay-callback`;
  if (rule.source === '/__l5e/assets-v1/:path*' && process.env.ASSET_PROXY_ORIGIN) {
    const origin = new URL(process.env.ASSET_PROXY_ORIGIN);
    if (origin.protocol !== 'https:') throw new Error('Asset origin must be HTTPS');
    rule.destination = `${origin.origin}/__l5e/assets-v1/:path*`;
  }
}
await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
console.log('Hosting routes configured; no credentials written.');