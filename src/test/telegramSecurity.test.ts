import { describe, it, expect } from 'vitest';
import { adminWebhookSecret, secureTelegramSecret } from '../../supabase/functions/_shared/telegram-security';
describe('Admin mint webhook authentication', () => {
  it('rejects unsigned forged admin requests', () => expect(secureTelegramSecret(null, 'fixture-secret')).toBe(false));
  it('rejects an admin chat ID as authentication', () => expect(secureTelegramSecret('8766641148', 'fixture-secret')).toBe(false));
  it('rejects a wrong same-length secret', () => expect(secureTelegramSecret('fixture-secrex', 'fixture-secret')).toBe(false));
  it('accepts only matching secret', () => expect(secureTelegramSecret('fixture-secret', 'fixture-secret')).toBe(true));
  it('fails closed without configuration', () => expect(secureTelegramSecret('', '')).toBe(false));
  it('uses configured webhook secret', async () => expect(await adminWebhookSecret('fixture-token', 'configured')).toBe('configured'));
  it('derives stable non-public secret when not configured', async () => {
    const value = await adminWebhookSecret('fixture-token');
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(value).not.toBe(await adminWebhookSecret('different-token'));
  });
});