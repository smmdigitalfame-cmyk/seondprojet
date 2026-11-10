// Telegram stores the supplied APK; this identifier is reusable by this bot only.
import { PRODUCTS, type Product } from './public-products.ts';
import { TUTORIAL_URLS } from './public-bot-menu.ts';
export const PUBLIC_APK_FILE_ID = 'BQACAgEAAxkDAAMMau-uysTrJJ-gvyyzv3-j_N4EbBMAAkcKAAItQYFHdZwZX498Yhk9BA';

type BotCall = (method: string, body: Record<string, unknown>) => Promise<unknown>;
function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export async function sendPurchasedApk(
  call: BotCall,
  chatId: string,
  access: { key: string; expires_at: string | null },
  product: Product = 'instagram',
) {
  // One document message includes the key: neither can be delivered alone.
  await call('sendDocument', {
    chat_id: chatId,
    document: PRODUCTS[product].apk,
    parse_mode: 'HTML',
    caption: `✅ <b>Payment verified!</b>\n${PRODUCTS[product].title}\n\nYour access key:\n<code>${escapeHtml(access.key)}</code>\n\nValid until: ${access.expires_at ? new Date(access.expires_at).toUTCString() : 'Lifetime'}\n\n📲 Install the APK above, copy your key and enter it in this app.\n▶️ Need help editing? Watch your app’s YouTube how-to guide below — the same video shown in the demo.`,
    reply_markup: { inline_keyboard: [[{ text: '📋 Copy access key', copy_text: { text: access.key } }], [{ text: '▶️ YouTube · How to use', url: TUTORIAL_URLS[product] }]] },
  });
}