import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { PUBLIC_PLANS } from '../_shared/public-payment-plans.ts';
import { paymentDb, botCall, oxaCall, verifyAndFulfill, deliverOrder } from '../_shared/public-payments.ts';
import { sendPurchasedApk } from '../_shared/public-apk-delivery.ts';
import { BOT_HOME, BOT_PLANS, BOT_HELP, BOT_DEMO, BOT_BOTTOM_MENU, BOT_RETURN_URL, botCommand, accessIsUsable, accessFailureReason, isRecentPurchase, productPlans } from '../_shared/public-bot-menu.ts';
import { PRODUCTS, parsePurchase } from '../_shared/public-products.ts';
import { reportBotEvent } from '../_shared/public-bot-notifications.ts';
import { runBotReporting } from '../_shared/public-bot-background.ts';
import { paymentCallbackUrl } from '../_shared/deployment-config.ts';

async function recoverPurchases(chat: string) {
  const db = paymentDb();
  const { data: orders, error } = await db.from('oxapay_orders').select('id,access_key_id,product').eq('telegram_chat_id', chat).eq('status', 'paid').order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error('Keys unavailable');
  const ids = (orders ?? []).map(order => order.access_key_id).filter(Boolean);
  if (!orders?.length) {
    await botCall('sendMessage', { chat_id: chat, ...BOT_HOME, text: `📦 <b>No paid purchases yet</b>\n\n${BOT_HOME.text}` });
    return;
  }
  const { data: keys, error: keyError } = ids.length ? await db.from('access_keys').select('id,key,active,expires_at').in('id', ids) : { data: [], error: null };
  if (keyError) throw new Error('Keys unavailable');
  const hasActiveInstagram = (keys ?? []).some(key => accessIsUsable(key));
  let inactiveNoticeSent = false;
  for (const order of orders ?? []) {
    if (!await verifyAndFulfill(order.id)) continue;
    if (order.product === 'tiktok') { await deliverOrder(order.id, true); continue; }
    const key = keys?.find(item => item.id === order.access_key_id);
    if (!key) continue;
    if (accessIsUsable(key)) await sendPurchasedApk(botCall, chat, key);
    else if (!hasActiveInstagram && !inactiveNoticeSent) {
      inactiveNoticeSent = true;
      await botCall('sendMessage', { chat_id: chat, text: `Your previous Instagram access ${accessFailureReason(key)}. Choose a new plan to continue.`, reply_markup: BOT_PLANS.reply_markup });
    }
  }
}

function secureEqual(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < b.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('POST required', { status: 405, headers: corsHeaders });
  const expected = Deno.env.get('PUBLIC_TELEGRAM_WEBHOOK_SECRET');
  if (!expected || !secureEqual(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expected)) return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  try {
    const update = await req.json();
    const message = update.message ?? update.callback_query?.message;
    const sender = update.message?.from ?? update.callback_query?.from;
    if (!Number.isSafeInteger(update.update_id) || !message || message.chat?.type !== 'private' || sender?.id !== message.chat.id) return new Response('ok', { headers: corsHeaders });
    const chat = String(message.chat.id);
    const db = paymentDb();
    const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (task: Promise<unknown>) => void } }).EdgeRuntime;
    await runBotReporting(reportBotEvent(db, botCall, Deno.env.get('PUBLIC_BOT_NOTIFICATION_CHAT_ID'), 'user', chat, { name: [sender.first_name, sender.last_name].filter(value => typeof value === 'string').join(' ').slice(0, 256), username: typeof sender.username === 'string' ? sender.username.slice(0, 64) : null }), runtime);
    const callback = update.callback_query;
    if (callback) {
      // Old Telegram buttons can have an expired query id; do not block purchase recovery.
      await botCall('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => undefined);
      const action = String(callback.data ?? '');
      if (action === 'product:instagram' || action === 'product:tiktok') {
        await botCall('sendMessage', { chat_id: chat, ...productPlans(action === 'product:tiktok' ? 'tiktok' : 'instagram') });
      } else if (action.startsWith('menu:')) {
        if (action === 'menu:keys') await recoverPurchases(chat);
        else await botCall('sendMessage', { chat_id: chat, ...(action === 'menu:help' ? BOT_HELP : action === 'menu:demo' ? BOT_DEMO : BOT_HOME) });
      } else if (action.startsWith('check:')) {
        const id = action.slice(6);
        if (!/^[a-f0-9-]{36}$/.test(id)) return new Response('ok', { headers: corsHeaders });
        const { data: order } = await db.from('oxapay_orders').select('id').eq('id', id).eq('telegram_chat_id', chat).maybeSingle();
        if (order) {
          const paid = await verifyAndFulfill(id);
          if (!paid) await botCall('sendMessage', { chat_id: chat, text: 'Payment is not confirmed yet. Please check again after confirmation.' });
          else await botCall('sendMessage', { chat_id: chat, text: 'Payment confirmed. Your purchase is ready.', reply_markup: { inline_keyboard: [[{ text: 'Get my APK & key', callback_data: 'menu:keys' }], [{ text: 'Back to menu', callback_data: 'menu:home' }]] } });
        }
      } else if (action.startsWith('buy:')) {
        const purchase = parsePurchase(action);
        if (!purchase) {
          await botCall('sendMessage', { chat_id: chat, ...BOT_HOME });
          return new Response('ok', { headers: corsHeaders });
        }
        const { product, plan: planId } = purchase;
        const plan = PUBLIC_PLANS[planId];
        const { data: order, error } = await db.from('oxapay_orders').upsert({ product, telegram_chat_id: chat, telegram_update_id: update.update_id, plan_id: planId, amount: plan.amount, currency: 'USD', duration_days: plan.days }, { onConflict: 'telegram_update_id', ignoreDuplicates: true }).select('*').maybeSingle();
        if (error) throw new Error('Order creation failed');
        // On Telegram redelivery use the original order and existing invoice.
        const existing = order ?? (await db.from('oxapay_orders').select('*').eq('telegram_update_id', update.update_id).single()).data;
        if (!existing) throw new Error('Order missing');
        if (existing.product !== product || existing.plan_id !== planId || existing.telegram_chat_id !== chat) throw new Error('Order conflict');
        if (!existing.track_id) {
          const invoice = await oxaCall('/invoice', { amount: plan.amount, currency: 'USD', lifetime: 60, under_paid_coverage: 0, fee_paid_by_payer: 0, mixed_payment: false, order_id: existing.id, callback_url: paymentCallbackUrl(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('OXAPAY_CALLBACK_URL') || (Deno.env.get('SUPABASE_URL')?.includes('ircfmtprrwggcbmrvmnt') ? 'https://xkgjifugwislpbczoduy.supabase.co/functions/v1/oxapay-callback' : undefined)), return_url: BOT_RETURN_URL, description: `${PRODUCTS[product].title} · ${plan.title}`, sandbox: false });
          if (!invoice.track_id || typeof invoice.payment_url !== 'string' || !/^https:\/\/(pay\.)?oxapay\.com\//.test(invoice.payment_url)) throw new Error('Invalid invoice response');
          const { error: saved } = await db.from('oxapay_orders').update({ track_id: String(invoice.track_id), payment_url: invoice.payment_url }).eq('id', existing.id);
          if (saved) throw new Error('Invoice save failed');
          existing.payment_url = invoice.payment_url;
        }
        await botCall('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `<b>YOUR ORDER IS READY</b>\n\n<b>${PRODUCTS[product].title}</b>\n<b>${plan.title} · $${plan.amount} USD</b>\nAndroid APK + access key\n\nSecure checkout with OxaPay. Invoice valid for 60 minutes.\nYour purchase arrives after crypto confirmation.`, reply_markup: { inline_keyboard: [[{ text: `Pay $${plan.amount} securely`, url: existing.payment_url }], [{ text: 'Check payment', callback_data: `check:${existing.id}` }], [{ text: 'My APK & keys', callback_data: 'menu:keys' }, { text: 'Help', callback_data: 'menu:help' }]] } });
      }
    } else if (typeof message.text === 'string') {
      const command = botCommand(message.text);
      if (command === '/start') {
        // Returning from checkout reopens the chat; the key + APK were already sent on payment.
        const { data: recent } = await db.from('oxapay_orders').select('created_at').eq('telegram_chat_id', chat).eq('status', 'paid').order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (isRecentPurchase(recent?.created_at)) return new Response('ok', { headers: corsHeaders });
      }
      if (command === '/mykey' || command === '/key' || (command === '/start' && message.text.trim().split(/\s+/)[1] === 'mykey')) {
        await recoverPurchases(chat);
      } else {
        const menu = command === '/help' ? BOT_HELP : command === '/demo' ? BOT_DEMO : BOT_HOME;
        // Telegram supports only one markup per message: attach the persistent keyboard
        // separately on entry, retaining the product-choice inline buttons above it.
        if (command === '/start' || command === '/menu') {
          await Promise.all([
            botCall('sendMessage', { chat_id: chat, ...menu }),
            botCall('sendMessage', { chat_id: chat, text: '✨ Insight Editor · Quick menu', reply_markup: BOT_BOTTOM_MENU }),
          ]);
        } else await botCall('sendMessage', { chat_id: chat, ...menu });
      }
    }
    return new Response('ok', { headers: corsHeaders });
  } catch {
    // No tokens, keys, payment bodies or Telegram user content in logs.
    return new Response('Unable to process update; please retry', { status: 503, headers: corsHeaders });
  }
});