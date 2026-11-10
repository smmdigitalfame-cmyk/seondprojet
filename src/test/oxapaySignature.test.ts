import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyOxaPaySignature } from '../../supabase/functions/oxapay-callback/verification';

describe('OxaPay callback authentication', () => {
  const fixtureKey = 'public-unit-test-fixture-not-a-credential';
  const body = '{"track_id":123,"status":"Paid"}';
  const signature = createHmac('sha512', fixtureKey).update(body).digest('hex');
  it('verifies the exact raw body', async () => {
    expect(await verifyOxaPaySignature(new TextEncoder().encode(body), signature, fixtureKey)).toBe(true);
  });
  it('rejects a modified payment body', async () => {
    expect(await verifyOxaPaySignature(new TextEncoder().encode(body.replace('123', '456')), signature, fixtureKey)).toBe(false);
  });
  it('rejects an unsigned update', async () => {
    expect(await verifyOxaPaySignature(new TextEncoder().encode(body), null, fixtureKey)).toBe(false);
  });
});