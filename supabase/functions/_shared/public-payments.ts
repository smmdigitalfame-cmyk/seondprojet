import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifiedPaymentMatches } from './public-payment-plans.ts';
import { sendPurchasedApk } from './public-apk-delivery.ts';
import { mintTikTok } from './public-products.ts';
import { reportBotEvent } from './public-bot-notifications.ts';

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error('Payment configuration missing');
  return value;
}
export function paymentDb() { return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY')); }
export async function botCall(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${required('PUBLIC_TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('Telegram delivery failed');
  return result.result;
}
export async function oxaCall(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.oxapay.com/v1/payment${path}`, {
    method: body ? 'POST' : 'GET', headers: { merchant_api_key: required('OXAPAY_MERCHANT_API_KEY'), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || result.status !== 200 || !result.data) throw new Error('Payment provider request failed');
  return result.data;
}
export async function deliverOrder(id: string, resend = false) {
  const db = paymentDb();
  const { data: order, error } = await db.from('oxapay_orders').select('*').eq('id', id).single();
  if (error || !order || order.status !== 'paid' || !order.payment_verified_at) throw new Error('Verified paid order unavailable');
  if (order.delivered_at && !resend) return;
  if (order.product === 'tiktok') {
    // Requery the original remote order on recovery; never renew a revoked/expired key.
    const access = await mintTikTok(order, required('BOT_INTERNAL_SECRET'), fetch, Deno.env.get('TIKTOK_KEY_ENDPOINT') || undefined);
    const { error: saved } = await db.rpc('save_tiktok_order_key', { p_order_id: id, p_key_code: access.key, p_expires_at: access.expires_at });
    if (saved) throw new Error('TikTok key save failed');
    await sendPurchasedApk(botCall, order.telegram_chat_id, access, 'tiktok');
    const { error: delivered } = await db.from('oxapay_orders').update({ delivered_at: new Date().toISOString() }).eq('id', id);
    if (delivered) throw new Error('Delivery status could not be saved');
    return;
  }
  if (!order.access_key_id) throw new Error('Paid access unavailable');
  const { data: access, error: keyError } = await db.from('access_keys').select('key,expires_at').eq('id', order.access_key_id).single();
  if (keyError || !access) throw new Error('Paid access unavailable');
  await sendPurchasedApk(botCall, order.telegram_chat_id, access);
  const { error: saveError } = await db.from('oxapay_orders').update({ delivered_at: new Date().toISOString() }).eq('id', id);
  if (saveError) throw new Error('Delivery status could not be saved');
}
export async function verifyAndFulfill(orderId: string) {
  const db = paymentDb();
  const { data: order, error } = await db.from('oxapay_orders').select('*').eq('id', orderId).single();
  if (error || !order?.track_id) throw new Error('Invoice unavailable');
  if (order.status === 'paid' && order.payment_verified_at) {
    await deliverOrder(order.id);
    await reportBotEvent(db, botCall, Deno.env.get('PUBLIC_BOT_NOTIFICATION_CHAT_ID'), 'sale', order.id);
    return true;
  }
  const payment = await oxaCall(`/${encodeURIComponent(order.track_id)}`);
  if (String(payment.status).toLowerCase() !== 'paid') return false;
  if (!verifiedPaymentMatches(order, payment)) throw new Error('Payment mismatch');
  // Atomic locking in the database makes simultaneous callbacks issue only one key.
  const { error: fulfillError } = await db.rpc('fulfill_verified_oxapay_order', { p_order_id: order.id, p_track_id: order.track_id, p_amount: Number(payment.amount), p_currency: payment.currency, p_provider_order_id: payment.order_id, p_provider_status: payment.status });
  if (fulfillError) throw new Error('Payment fulfillment failed');
  await deliverOrder(order.id);
  await reportBotEvent(db, botCall, Deno.env.get('PUBLIC_BOT_NOTIFICATION_CHAT_ID'), 'sale', order.id);
  return true;
}