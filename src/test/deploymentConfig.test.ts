import { describe, expect, it } from 'vitest';
import { paymentCallbackUrl } from '../../supabase/functions/_shared/deployment-config';
describe('Portable secure payment endpoints', () => {
  it('uses the chosen backend instead of the original deployment', () => expect(paymentCallbackUrl('https://new-backend.example/')).toBe('https://new-backend.example/functions/v1/oxapay-callback'));
  it('supports an explicit authoritative callback', () => expect(paymentCallbackUrl('https://preview.example', 'https://payments.example/callback')).toBe('https://payments.example/callback'));
  it('rejects insecure payment callbacks', () => expect(() => paymentCallbackUrl('http://example.com')).toThrow());
  it('rejects credential-bearing callbacks', () => expect(() => paymentCallbackUrl('https://user:password@example.com')).toThrow());
});