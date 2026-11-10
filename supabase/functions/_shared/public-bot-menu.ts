import { PUBLIC_PLANS } from './public-payment-plans.ts';
import { PRODUCTS, type Product } from './public-products.ts';

export const BOT_USERNAME = 'Insightseditorall_bot';
// No ?start payload: reopening an existing chat must not resend /start after payment.
export const BOT_RETURN_URL = `https://t.me/${BOT_USERNAME}`;
// Paid within this window → /start stays silent because the key was already delivered.
export const RECENT_PAID_MS = 90 * 60 * 1000;
export function isRecentPurchase(createdAt: string | null | undefined, now = Date.now()) {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= 0 && now - t < RECENT_PAID_MS;
}
const OWNER_URL = 'https://t.me/TheDanielBrooks';
export const TUTORIAL_URLS: Record<Product, string> = {
  instagram: 'https://youtu.be/6fyQY7e4h9o',
  tiktok: 'https://youtube.com/shorts/KITGjjZQMuQ',
};
const OWNER_HELP = `🆘 <b>Need help or facing an issue?</b>\nContact the owner: <a href="${OWNER_URL}">@TheDanielBrooks</a>`;
export const BOT_HOME = {
  text: '✨ <b>WELCOME TO INSIGHT EDITOR</b>\n\n▶️ <b>See it before you buy</b>\nWatch your app’s YouTube demo to see the interface and how editing works. The same video is your how-to guide after purchase.\n\n1️⃣ Choose Instagram or TikTok\n2️⃣ Choose your access plan\n3️⃣ Pay securely with OxaPay\n\n✅ After payment verification, receive your selected app’s APK + access key automatically, with its how-to video button.\n🔑 Instagram and TikTok have separate keys.\n\n' + OWNER_HELP + '\n\n👇 <b>Watch a demo or choose your app</b>',
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: [
    [{ text: '📸 Instagram Editor', callback_data: 'product:instagram' }, { text: '🎵 TikTok Editor', callback_data: 'product:tiktok' }],
    [{ text: '▶️ YouTube · Instagram demo', url: TUTORIAL_URLS.instagram }],
    [{ text: '▶️ YouTube · TikTok demo', url: TUTORIAL_URLS.tiktok }],
    [{ text: '📦 My APK & keys', callback_data: 'menu:keys' }, { text: '❓ Help', callback_data: 'menu:help' }],
    [{ text: '💬 Contact owner', url: OWNER_URL }],
  ] },
};
export const BOT_PLANS = BOT_HOME;
export const BOT_BOTTOM_MENU = {
  keyboard: [
    [{ text: '🛍 Buy access' }, { text: '▶️ Demo & how to use' }],
    [{ text: '📦 My APK & keys' }, { text: '❓ Help' }],
    [{ text: '🏠 Menu' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: 'Choose an option below',
};
export function botCommand(text: string) {
  const shortcuts: Record<string, string> = {
    '🛍 Buy access': '/buy', '▶️ Demo & how to use': '/demo',
    '📦 My APK & keys': '/mykey', '❓ Help': '/help', '🏠 Menu': '/menu',
  };
  return shortcuts[text.trim()] ?? text.trim().split(/\s/)[0].split('@')[0];
}
export const BOT_DEMO = {
  text: '▶️ <b>YOUTUBE DEMOS & HOW-TO GUIDES</b>\n\n🛍 <b>Before purchase</b>\nSee your app’s interface and how editing works.\n\n📲 <b>After purchase</b>\nUse the same video to learn how to use your editor. Choose the video matching your app below.',
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: [
    [{ text: '▶️ YouTube · Instagram', url: TUTORIAL_URLS.instagram }],
    [{ text: '▶️ YouTube · TikTok', url: TUTORIAL_URLS.tiktok }],
    [{ text: '🛍 Choose app & buy', callback_data: 'menu:home' }],
  ] },
};
export function productPlans(product: Product) {
  return { ...BOT_PLANS, text: `${product === 'instagram' ? '📸' : '🎵'} <b>${PRODUCTS[product].title.toUpperCase()}</b>\n\n▶️ <b>Demo & how to use — on YouTube</b>\nSee this app’s interface and how to edit before buying. You can watch the same guide anytime after purchase.\n\n✅ Selected app: <b>${PRODUCTS[product].title}</b>\n📦 Includes this app’s Android APK + access key.\n\n⏳ <b>Choose your access duration</b>\nMonthly = 30 days · Lifetime = no expiry\n💳 Prices below are in USD.\n\n🔒 Delivery starts after payment verification.`, reply_markup: { inline_keyboard: [
    [{ text: '▶️ YouTube · Demo & how to use', url: TUTORIAL_URLS[product] }],
    ...Object.entries(PUBLIC_PLANS).map(([id, plan]) => [{ text: `${plan.title} — $${plan.amount}`, callback_data: `buy:${product}:${id}` }]),
    [{ text: '⬅️ Change app', callback_data: 'menu:home' }],
  ] } };
}
export const BOT_HELP = {
  text: '❓ <b>HELP & PAYMENT</b>\n\n▶️ <b>Before buying: watch a demo</b>\nChoose your app’s YouTube video below to see its interface and how editing works.\n\n📱 <b>Buying access?</b>\nChoose Instagram or TikTok first, then your plan. Each purchase unlocks only the selected app.\n\n💳 <b>Payment pending?</b>\nWait for crypto confirmation, then tap Check payment. Never pay the same invoice twice.\n\n📦 <b>Already paid?</b>\nMy APK & keys resends your purchased APK and original key. Use Copy access key to copy it.\n\n🔑 <b>After buying: learn how to use it</b>\nInstall your purchased Android APK and enter its matching key. Watch the same YouTube video below for your app’s editing guide, or open it from your APK + key message. Expired or revoked keys cannot unlock the app.\n\n' + OWNER_HELP,
  parse_mode: 'HTML',
  reply_markup: { inline_keyboard: [[{ text: '▶️ YouTube · Instagram guide', url: TUTORIAL_URLS.instagram }], [{ text: '▶️ YouTube · TikTok guide', url: TUTORIAL_URLS.tiktok }], [{ text: '💬 Contact owner', url: OWNER_URL }], [{ text: 'My APK & keys', callback_data: 'menu:keys' }], [{ text: 'Back to menu', callback_data: 'menu:home' }]] },
};
export function accessIsUsable(access: { active: boolean; expires_at: string | null }, now = Date.now()) {
  return access.active && (access.expires_at === null || Date.parse(access.expires_at) > now);
}
export function accessFailureReason(access: { active: boolean; expires_at: string | null }, now = Date.now()) {
  // Expiry cleanup also sets active=false; that does not mean admin revocation.
  if (access.expires_at && Date.parse(access.expires_at) <= now) return 'expired';
  return access.active ? 'unavailable' : 'revoked';
}