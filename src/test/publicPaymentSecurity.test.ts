import { describe, it, expect } from 'vitest';
import { verifiedPaymentMatches } from '../../supabase/functions/_shared/public-payment-plans';

describe('Purchased keys require verified successful payment', () => {
  const order = { id: 'order-1', track_id: '123', plan_id: 'week', product: 'instagram', duration_days: 7, amount: 5, currency: 'USD' };
  const paid = { order_id: 'order-1', track_id: '123', amount: 5, currency: 'USD', status: 'paid' };
  it('accepts exact paid provider evidence', () => expect(verifiedPaymentMatches(order, paid)).toBe(true));
  it.each(['pending', 'paying', 'failed', 'expired', 'cancelled', 'refunded', ''])('rejects %s payments', status => expect(verifiedPaymentMatches(order, { ...paid, status })).toBe(false));
  it('rejects missing provider order identity', () => expect(verifiedPaymentMatches(order, { ...paid, order_id: undefined })).toBe(false));
  it('rejects another buyer order identity', () => expect(verifiedPaymentMatches(order, { ...paid, order_id: 'order-2' })).toBe(false));
  it('rejects a lifetime upgrade funded with $5', () => expect(verifiedPaymentMatches({ ...order, plan_id: 'lifetime', duration_days: null }, paid)).toBe(false));
  it('rejects duration tampering from 7 to 30 days', () => expect(verifiedPaymentMatches({ ...order, duration_days: 30 }, paid)).toBe(false));
  it('rejects null finite-plan duration', () => expect(verifiedPaymentMatches({ ...order, duration_days: null }, paid)).toBe(false));
  it('rejects unknown plans', () => expect(verifiedPaymentMatches({ ...order, plan_id: 'constructor' }, paid)).toBe(false));
  it('rejects a different invoice', () => expect(verifiedPaymentMatches(order, { ...paid, track_id: '999' })).toBe(false));
  it('rejects an underpaid invoice', () => expect(verifiedPaymentMatches(order, { ...paid, amount: 1 })).toBe(false));
  it('rejects a currency mismatch', () => expect(verifiedPaymentMatches(order, { ...paid, currency: 'EUR' })).toBe(false));
  it('rejects malformed amount coercion', () => expect(verifiedPaymentMatches(order, { ...paid, amount: [5] })).toBe(false));
});