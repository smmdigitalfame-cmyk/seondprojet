import { describe, it, expect } from 'vitest';
import { accessIsUsable, accessFailureReason, BOT_RETURN_URL, isRecentPurchase } from '../../supabase/functions/_shared/public-bot-menu';
describe('Bot access recovery', () => {
  const now = Date.parse('2026-11-07T23:12:00Z');
  it('rejects an expired paid key', () => expect(accessIsUsable({ active: true, expires_at: '2026-11-07T23:11:59Z' }, now)).toBe(false));
  it('classifies automatic expiry cleanup as expired, not revoked', () => expect(accessFailureReason({ active: false, expires_at: '2026-11-07T23:11:59Z' }, now)).toBe('expired'));
  it('rejects revoked lifetime access', () => expect(accessIsUsable({ active: false, expires_at: null }, now)).toBe(false));
  it('recovers an active lifetime key', () => expect(accessIsUsable({ active: true, expires_at: null }, now)).toBe(true));
  it('recovers a key before its exact expiry', () => expect(accessIsUsable({ active: true, expires_at: '2026-11-07T23:12:01Z' }, now)).toBe(true));
  it('returns paid buyers directly to the existing Telegram bot', () => expect(BOT_RETURN_URL).toBe('https://t.me/Insightseditorall_bot'));
  it('stays silent on /start right after a paid order', () => expect(isRecentPurchase('2026-11-07T22:30:00Z', now)).toBe(true));
  it('shows the menu again on /start long after a purchase', () => expect(isRecentPurchase('2026-11-07T21:00:00Z', now)).toBe(false));
});