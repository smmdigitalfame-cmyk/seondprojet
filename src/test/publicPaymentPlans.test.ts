import { describe, expect, it } from 'vitest';
import { PUBLIC_PLANS, paymentMatches } from '../../supabase/functions/_shared/public-payment-plans';
describe('Public bot purchased plans', () => {
  it('sells one day for one dollar', () => { expect(PUBLIC_PLANS.day).toMatchObject({ amount: 1, days: 1 }); });
  it('sells seven days for five dollars', () => { expect(PUBLIC_PLANS.week).toMatchObject({ amount: 5, days: 7 }); });
  it('sells monthly for ten dollars with thirty days', () => { expect(PUBLIC_PLANS.month).toMatchObject({ amount: 10, days: 30 }); });
  it('sells lifetime for twenty-five dollars without expiry', () => { expect(PUBLIC_PLANS.lifetime).toMatchObject({ amount: 25, days: null }); });
  const order = { track_id: '123', amount: 5, currency: 'USD' };
  it('accepts only a fully paid matching invoice', () => { expect(paymentMatches(order, { ...order, status: 'paid' })).toBe(true); });
  it('rejects underpayment', () => { expect(paymentMatches(order, { ...order, amount: 1, status: 'paid' })).toBe(false); });
  it('rejects paying before confirmation', () => { expect(paymentMatches(order, { ...order, status: 'paying' })).toBe(false); });
  it('rejects another invoice', () => { expect(paymentMatches(order, { ...order, track_id: '456', status: 'paid' })).toBe(false); });
  it('rejects another currency', () => { expect(paymentMatches(order, { ...order, currency: 'EUR', status: 'paid' })).toBe(false); });
});