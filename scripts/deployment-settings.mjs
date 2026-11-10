export const runtimeFunctions = [
  'check-key-status', 'logout-device', 'upload-media', 'instagram-scraper',
  'tg-get-key', 'claim-key-by-phone', 'register-payment-contact',
  'public-telegram-webhook', 'oxapay-callback', 'telegram-webhook', 'razorpay-webhook',
];
export const runtimeSettings = [
  'PUBLIC_TELEGRAM_BOT_TOKEN', 'PUBLIC_TELEGRAM_WEBHOOK_SECRET', 'OXAPAY_MERCHANT_API_KEY',
  'PUBLIC_BOT_NOTIFICATION_CHAT_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET',
  'TELEGRAM_ADMIN_CHAT_ID_1', 'TELEGRAM_ADMIN_CHAT_ID_2', 'TELEGRAM_ADMIN_CHAT_ID_3',
  'PAYMENT_PAGE_URL', 'OXAPAY_CALLBACK_URL', 'BOT_INTERNAL_SECRET', 'TIKTOK_KEY_ENDPOINT',
  'ZYLALABS_API_KEY', 'RAPIDAPI_LOOTER_KEY', 'RAPIDAPI_LOOTER_HOST', 'RAPIDAPI_KEY', 'RAPIDAPI_HOST',
  'UDC_ZYLALABS_INSTAGRAM_MEDIA_API_KEY', 'LOVABLE_API_KEY', 'RAZORPAY_WEBHOOK_SECRET',
];
export function validateSettings(env) {
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF', 'PUBLIC_TELEGRAM_BOT_TOKEN', 'PUBLIC_TELEGRAM_WEBHOOK_SECRET', 'OXAPAY_MERCHANT_API_KEY']) {
    if (!env[name]) throw new Error(`Missing required setting: ${name}`);
  }
  if (!/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF)) throw new Error('Invalid backend project reference');
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_TOKEN === env.PUBLIC_TELEGRAM_BOT_TOKEN) throw new Error('Admin and public bot must be separate bots');
}