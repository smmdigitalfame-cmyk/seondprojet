import { describe, expect, it } from 'vitest';
import { runtimeFunctions, runtimeSettings, validateSettings } from '../../scripts/deployment-settings.mjs';
describe('Deployment credential boundaries', () => {
  const env = { SUPABASE_ACCESS_TOKEN: 'fixture', SUPABASE_PROJECT_REF: 'a'.repeat(20), PUBLIC_TELEGRAM_BOT_TOKEN: 'public-fixture', PUBLIC_TELEGRAM_WEBHOOK_SECRET: 'fixture', OXAPAY_MERCHANT_API_KEY: 'fixture' };
  it('requires merchant verification credentials', () => expect(() => validateSettings({ ...env, OXAPAY_MERCHANT_API_KEY: '' })).toThrow());
  it('never deploys unauthenticated diagnostics', () => expect(runtimeFunctions).not.toContain('setup-webhook-oneshot'));
  it('keeps management credentials out of runtime settings', () => expect(runtimeSettings).not.toContain('SUPABASE_ACCESS_TOKEN'));
  it('rejects using the same bot for both webhook handlers', () => expect(() => validateSettings({ ...env, TELEGRAM_BOT_TOKEN: env.PUBLIC_TELEGRAM_BOT_TOKEN })).toThrow());
  it('accepts complete setup', () => expect(() => validateSettings(env)).not.toThrow());
});