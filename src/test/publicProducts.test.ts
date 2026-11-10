import { describe, expect, it, vi } from 'vitest';
import { PRODUCTS, parsePurchase, mintTikTok } from '../../supabase/functions/_shared/public-products';
import { sendPurchasedApk } from '../../supabase/functions/_shared/public-apk-delivery';
describe('Separate purchased products', () => {
  it('never silently purchases Instagram from an old generic plan button', () => expect(parsePurchase('buy:month')).toBeNull());
  it('selects Instagram only explicitly', () => expect(parsePurchase('buy:instagram:month')).toEqual({ product: 'instagram', plan: 'month' }));
  it('selects TikTok explicitly', () => expect(parsePurchase('buy:tiktok:week')).toEqual({ product: 'tiktok', plan: 'week' }));
  it('rejects unknown products', () => expect(parsePurchase('buy:other:day')).toBeNull());
  it('sends only TikTok APK for TikTok access', async () => {
    const call = vi.fn().mockResolvedValue({});
    await sendPurchasedApk(call, '123', { key: 'TT-TEST', expires_at: null }, 'tiktok');
    expect(call.mock.calls[0][1].document).toBe(PRODUCTS.tiktok.apk);
    expect(call.mock.calls[0][1].document).not.toBe(PRODUCTS.instagram.apk);
  });
  it('rejects an Instagram key returned by TikTok', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ product:'instagram',key_code:'IG-TEST',expires_at:null })));
    await expect(mintTikTok({ id:'order',plan_id:'lifetime',telegram_chat_id:'123' }, 'fixture', request)).rejects.toThrow('Invalid TikTok fulfillment');
  });
});