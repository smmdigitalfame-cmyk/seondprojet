import { describe, expect, it } from 'vitest';
import { legacyPlanFromAmount, purchasedExpiry, requestedDeviceLimit } from '../../supabase/functions/_shared/legacy-plan-terms';
describe('generated terms across old and current payment buttons', () => {
  const now=Date.parse('2026-11-23T12:00:00Z');
  it('one day lasts exactly one day',()=>expect(purchasedExpiry(legacyPlanFromAmount(19900)?.days ?? null,now)).toBe('2026-11-24T12:00:00.000Z'));
  it('weekly lasts exactly seven days',()=>expect(purchasedExpiry(legacyPlanFromAmount(99900)?.days ?? null,now)).toBe('2026-11-30T12:00:00.000Z'));
  it('monthly lasts exactly thirty days',()=>expect(purchasedExpiry(legacyPlanFromAmount(299900)?.days ?? null,now)).toBe('2026-12-23T12:00:00.000Z'));
  it('lifetime has no expiry on either existing lifetime price',()=>{expect(legacyPlanFromAmount(349900)?.days).toBeNull();const plan=legacyPlanFromAmount(599900);if(!plan) throw new Error('Lifetime plan missing');expect(purchasedExpiry(plan.days,now)).toBeNull();});
  it('uses exactly the requested two device slots',()=>expect(requestedDeviceLimit('2')).toBe(2));
  it('does not silently replace an invalid device count with another plan',()=>{expect(requestedDeviceLimit('0')).toBeNull();expect(requestedDeviceLimit('-2')).toBeNull();});
});