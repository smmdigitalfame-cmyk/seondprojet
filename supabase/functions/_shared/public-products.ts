import { PUBLIC_PLANS } from './public-payment-plans.ts';
export const PRODUCTS = {
  instagram: { title: 'Instagram Editor', apk: 'BQACAgEAAxkDAAMMau-uysTrJJ-gvyyzv3-j_N4EbBMAAkcKAAItQYFHdZwZX498Yhk9BA' },
  tiktok: { title: 'TikTok Editor', apk: 'BQACAgEAAxkDAAMVau-28Ta0vNxfXqSyxEKheKQc48gAAlIKAAItQYFH-UODyW9h7I89BA' },
} as const;
export type Product = keyof typeof PRODUCTS;
export function parsePurchase(action: string) {
  const parts = action.split(':');
  const product = parts[1];
  const plan = parts[2];
  if (parts[0] !== 'buy' || parts.length !== 3 || !['instagram', 'tiktok'].includes(product) || !Object.prototype.hasOwnProperty.call(PUBLIC_PLANS, plan)) return null;
  return { product: product as Product, plan: plan as keyof typeof PUBLIC_PLANS };
}
export async function mintTikTok(order: { id: string; plan_id: string; telegram_chat_id: string }, secret: string, request = fetch, endpoint = 'https://ttttttttttttttttttttttttttt.lovable.app/api/public/bot/tiktok-key') {
  const target = new URL(endpoint);
  if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Secure TikTok endpoint required');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try { response = await request(target.toString(), {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bot-internal-secret': secret },
    body: JSON.stringify({ product: 'tiktok', order_id: order.id, plan_id: order.plan_id, telegram_chat_id: order.telegram_chat_id }),
    signal: controller.signal,
  }); } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error('TikTok fulfillment pending');
  const data = await response.json();
  if (data.product !== 'tiktok' || typeof data.key_code !== 'string' || !/^TT-[A-F0-9]{20}$/.test(data.key_code) || (order.plan_id === 'lifetime' ? data.expires_at !== null : typeof data.expires_at !== 'string' || !Number.isFinite(Date.parse(data.expires_at)))) throw new Error('Invalid TikTok fulfillment');
  return { key: data.key_code as string, expires_at: data.expires_at as string | null };
}